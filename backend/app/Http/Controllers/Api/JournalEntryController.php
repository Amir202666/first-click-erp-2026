<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\InventoryAdjustment;
use App\Models\Invoice;
use App\Models\JournalEntry;
use App\Models\Payment;
use App\Services\AccountingService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class JournalEntryController extends Controller
{
    public function __construct(
        private AccountingService $accountingService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $fromDate = null;
        $toDate = null;
        if (! empty($request->from_date)) {
            try {
                $fromDate = Carbon::parse($request->from_date)->format('Y-m-d');
            } catch (\Throwable) {
                $fromDate = null;
            }
        }
        if (! empty($request->to_date)) {
            try {
                $toDate = Carbon::parse($request->to_date)->format('Y-m-d');
            } catch (\Throwable) {
                $toDate = null;
            }
        }

        $query = JournalEntry::where('tenant_id', $request->tenant_id)
            ->when(! empty($request->type), fn ($q) => $q->where('type', $request->type))
            ->when(! empty($request->status), fn ($q) => $q->where('status', $request->status))
            ->when($fromDate, fn ($q) => $q->whereDate('date', '>=', $fromDate))
            ->when($toDate, fn ($q) => $q->whereDate('date', '<=', $toDate))
            ->when(! empty($request->customer_id), fn ($q) => $q->where('customer_id', $request->customer_id))
            ->when(! empty($request->vendor_id), fn ($q) => $q->where('vendor_id', $request->vendor_id))
            ->when(! empty($request->branch_id), fn ($q) => $q->where('branch_id', $request->branch_id))
            ->when(! empty($request->cost_center_id), fn ($q) => $q->whereHas('lines', fn ($lq) => $lq->where('cost_center_id', $request->cost_center_id)))
            ->when(! empty($request->account_id), fn ($q) => $q->whereHas('lines', fn ($lq) => $lq->where('account_id', $request->account_id)))
            ->when(! empty($request->description), fn ($q) => $q->where('description', 'like', '%'.$request->description.'%'))
            ->with(['lines.account', 'lines.costCenter', 'createdBy', 'customer', 'vendor', 'branch'])
            ->orderByDesc('date')
            ->orderByDesc('id');

        $entries = $query->paginate($request->per_page ?? 20);

        $this->attachSourceToEntries($request->tenant_id, $entries->getCollection());

        return response()->json($entries);
    }

    private function attachSourceToEntries($tenantId, $collection): void
    {
        $invoiceNumbers = $collection->filter(fn ($e) => $e->reference_type && str_ends_with($e->reference_type, 'Invoice') && empty($e->reference_id))
            ->pluck('number')->filter()->unique()->values()->all();
        $paymentNumbers = $collection->filter(fn ($e) => $e->reference_type && str_ends_with($e->reference_type, 'Payment') && empty($e->reference_id))
            ->pluck('number')->filter()->unique()->values()->all();

        $invoiceIds = $collection->filter(fn ($e) => $e->reference_type && str_ends_with($e->reference_type, 'Invoice'))
            ->pluck('reference_id')->unique()->values()->all();
        $paymentIds = $collection->filter(fn ($e) => $e->reference_type && str_ends_with($e->reference_type, 'Payment'))
            ->pluck('reference_id')->unique()->values()->all();

        $invoices = $invoiceIds
            ? Invoice::where('tenant_id', $tenantId)->whereIn('id', $invoiceIds)->get()->keyBy('id')
            : collect();
        $payments = $paymentIds
            ? Payment::where('tenant_id', $tenantId)->whereIn('id', $paymentIds)->get()->keyBy('id')
            : collect();
        $invoicesByNumber = $invoiceNumbers
            ? Invoice::where('tenant_id', $tenantId)->whereIn('number', $invoiceNumbers)->get()->keyBy('number')
            : collect();
        $paymentsByNumber = $paymentNumbers
            ? Payment::where('tenant_id', $tenantId)->whereIn('number', $paymentNumbers)->get()->keyBy('number')
            : collect();

        $adjustmentIds = $collection
            ->filter(fn ($e) => $e->reference_type && str_ends_with($e->reference_type, 'InventoryAdjustment') && $e->reference_id)
            ->pluck('reference_id')
            ->unique()
            ->values()
            ->all();
        $adjustments = $adjustmentIds !== []
            ? InventoryAdjustment::where('tenant_id', $tenantId)->whereIn('id', $adjustmentIds)->get()->keyBy('id')
            : collect();

        foreach ($collection as $entry) {
            $entry->setAttribute('source', null);
            $sourceNotes = null;

            if ($entry->reference_type && $entry->reference_id) {
                if (str_ends_with($entry->reference_type, 'Invoice') && isset($invoices[$entry->reference_id])) {
                    $inv = $invoices[$entry->reference_id];
                    $entry->setAttribute('source', ['type' => 'invoice', 'id' => $inv->id, 'number' => $inv->number]);
                    $sourceNotes = is_string($inv->notes) ? trim($inv->notes) : null;
                }
                if (str_ends_with($entry->reference_type, 'Payment') && isset($payments[$entry->reference_id])) {
                    $pay = $payments[$entry->reference_id];
                    $entry->setAttribute('source', ['type' => 'payment', 'id' => $pay->id, 'number' => $pay->number, 'payment_type' => $pay->type]);
                    $sourceNotes = is_string($pay->notes) ? trim($pay->notes) : null;
                }
            } elseif ($entry->reference_type && $entry->number) {
                if (str_ends_with($entry->reference_type, 'Invoice') && isset($invoicesByNumber[$entry->number])) {
                    $inv = $invoicesByNumber[$entry->number];
                    $entry->setAttribute('source', ['type' => 'invoice', 'id' => $inv->id, 'number' => $inv->number]);
                    $sourceNotes = is_string($inv->notes) ? trim($inv->notes) : null;
                }
                if (str_ends_with($entry->reference_type, 'Payment') && isset($paymentsByNumber[$entry->number])) {
                    $pay = $paymentsByNumber[$entry->number];
                    $entry->setAttribute('source', ['type' => 'payment', 'id' => $pay->id, 'number' => $pay->number, 'payment_type' => $pay->type]);
                    $sourceNotes = is_string($pay->notes) ? trim($pay->notes) : null;
                }
            }

            if ($entry->reference_type && $entry->reference_id && str_ends_with($entry->reference_type, 'InventoryAdjustment')) {
                $adj = $adjustments[$entry->reference_id] ?? null;
                if ($adj) {
                    $entry->setAttribute('source', [
                        'type' => 'inventory_adjustment',
                        'id' => $adj->id,
                        'number' => $adj->number,
                    ]);
                    $this->normalizeInventoryAdjustmentJournalDescriptions($entry, $adj);
                }
            }

            // عرض وصف المصدر في تفاصيل القيد (بدون تعديل البيانات المحفوظة في قاعدة البيانات)
            if ($sourceNotes && $entry->relationLoaded('lines') && $entry->lines) {
                foreach ($entry->lines as $line) {
                    $line->setAttribute('description', $sourceNotes);
                }
            }
        }
    }

    /**
     * استبدال أوصاف قيود التسوية الجردية القديمة الطويلة بصياغة موجزة عند العرض فقط.
     */
    private function normalizeInventoryAdjustmentJournalDescriptions(JournalEntry $entry, InventoryAdjustment $adj): void
    {
        if (! $entry->relationLoaded('lines') || ! $entry->lines || $entry->lines->isEmpty()) {
            return;
        }

        $ref = trim((string) $adj->number) !== '' ? trim((string) $adj->number) : '#'.$adj->id;
        $header = 'تسوية مخزون · '.$ref;

        $isLegacyVerbose = function (string $d): bool {
            if ($d !== '' && str_starts_with($d, 'تسوية جردية رقم')) {
                return true;
            }
            if (strlen($d) > 100) {
                return true;
            }
            if (str_contains($d, ' — ')) {
                return true;
            }
            if (str_contains($d, 'إجمالي زيادة') || str_contains($d, 'إجمالي نقص')) {
                return true;
            }
            if (str_contains($d, 'تاريخ') && str_contains($d, 'تسوية')) {
                return true;
            }
            if (str_contains($d, 'مخزن') && str_contains($d, 'تسوية')) {
                return true;
            }
            if (str_contains($d, 'إضافة/خصم')) {
                return true;
            }

            return false;
        };

        $entryDesc = trim((string) ($entry->getAttributes()['description'] ?? ''));
        if ($isLegacyVerbose($entryDesc)) {
            $entry->setAttribute('description', $header);
        }

        foreach ($entry->lines as $line) {
            $raw = trim((string) (($line->getAttributes()['description'] ?? '')));
            if ($isLegacyVerbose($raw)) {
                $line->setAttribute('description', $header);
            }
        }
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'date' => 'required|date',
            'type' => 'required|in:manual,sales,purchase,expense,payment,adjustment,opening,closing',
            'description' => 'nullable|string',
            'customer_id' => 'nullable|exists:customers,id',
            'vendor_id' => 'nullable|exists:vendors,id',
            'branch_id' => 'nullable|exists:branches,id',
            'currency' => 'nullable|string|max:3',
            'lines' => 'required|array|min:2',
            'lines.*.account_id' => 'required|exists:accounts,id',
            'lines.*.debit' => 'required|numeric|min:0',
            'lines.*.credit' => 'required|numeric|min:0',
            'lines.*.description' => 'nullable|string',
            'lines.*.cost_center_id' => 'nullable|exists:cost_centers,id',
        ]);

        $accountIds = array_unique(array_filter(array_column($validated['lines'], 'account_id')));
        if (! empty($accountIds)) {
            $inactive = Account::where('tenant_id', $request->tenant_id)->whereIn('id', $accountIds)->where('is_active', false)->exists();
            if ($inactive) {
                return response()->json(['message' => __('لا يمكن استخدام حساب غير نشط في القيد.')], 422);
            }
        }

        $entry = $this->accountingService->createJournalEntry([
            'tenant_id' => $request->tenant_id,
            'date' => $validated['date'],
            'type' => $validated['type'],
            'description' => $validated['description'] ?? null,
            'customer_id' => $validated['customer_id'] ?? null,
            'vendor_id' => $validated['vendor_id'] ?? null,
            'branch_id' => $validated['branch_id'] ?? null,
            'currency' => $validated['currency'] ?? null,
            'status' => 'posted',
            'created_by' => $request->user()->id,
            'posted_at' => now(),
        ], $validated['lines']);

        return response()->json($entry->load('customer', 'vendor'), 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $entry = JournalEntry::where('tenant_id', $request->tenant_id)
            ->with(['lines.account', 'lines.costCenter', 'createdBy', 'customer', 'vendor', 'branch'])
            ->findOrFail($id);

        $source = null;
        $sourceNotes = null;
        if ($entry->reference_type && $entry->reference_id) {
            if (str_ends_with($entry->reference_type, 'Invoice')) {
                $inv = Invoice::where('tenant_id', $request->tenant_id)->find($entry->reference_id);
                if ($inv) {
                    $source = ['type' => 'invoice', 'id' => $inv->id, 'number' => $inv->number];
                    $sourceNotes = is_string($inv->notes) ? trim($inv->notes) : null;
                }
            }
            if (str_ends_with($entry->reference_type, 'Payment')) {
                $pay = Payment::where('tenant_id', $request->tenant_id)->find($entry->reference_id);
                if ($pay) {
                    $source = ['type' => 'payment', 'id' => $pay->id, 'number' => $pay->number, 'payment_type' => $pay->type];
                    $sourceNotes = is_string($pay->notes) ? trim($pay->notes) : null;
                }
            }
        } elseif ($entry->reference_type && $entry->number) {
            if (str_ends_with($entry->reference_type, 'Invoice')) {
                $inv = Invoice::where('tenant_id', $request->tenant_id)->where('number', $entry->number)->first();
                if ($inv) {
                    $source = ['type' => 'invoice', 'id' => $inv->id, 'number' => $inv->number];
                    $sourceNotes = is_string($inv->notes) ? trim($inv->notes) : null;
                }
            }
            if (str_ends_with($entry->reference_type, 'Payment')) {
                $pay = Payment::where('tenant_id', $request->tenant_id)->where('number', $entry->number)->first();
                if ($pay) {
                    $source = ['type' => 'payment', 'id' => $pay->id, 'number' => $pay->number, 'payment_type' => $pay->type];
                    $sourceNotes = is_string($pay->notes) ? trim($pay->notes) : null;
                }
            }
        }

        if ($source === null && $entry->reference_type && $entry->reference_id && str_ends_with($entry->reference_type, 'InventoryAdjustment')) {
            $adj = InventoryAdjustment::where('tenant_id', $request->tenant_id)->find($entry->reference_id);
            if ($adj) {
                $source = ['type' => 'inventory_adjustment', 'id' => $adj->id, 'number' => $adj->number];
                $this->normalizeInventoryAdjustmentJournalDescriptions($entry, $adj);
            }
        }

        $entry->setAttribute('source', $source);
        if ($sourceNotes && $entry->lines) {
            foreach ($entry->lines as $line) {
                $line->setAttribute('description', $sourceNotes);
            }
        }

        return response()->json($entry);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $entry = JournalEntry::where('tenant_id', $request->tenant_id)->findOrFail($id);

        if ($entry->status !== 'draft') {
            return response()->json(['message' => 'لا يمكن تعديل قيد مرحّل أو ملغى / Only draft entries can be edited'], 422);
        }

        if ($entry->reference_type) {
            return response()->json(['message' => 'لا يمكن تعديل قيد مرتبط بفاتورة أو سند / Linked entries cannot be edited'], 422);
        }

        $validated = $request->validate([
            'date' => 'required|date',
            'type' => 'required|in:manual,sales,purchase,expense,payment,adjustment,opening,closing',
            'description' => 'nullable|string',
            'customer_id' => 'nullable|exists:customers,id',
            'vendor_id' => 'nullable|exists:vendors,id',
            'branch_id' => 'nullable|exists:branches,id',
            'lines' => 'required|array|min:2',
            'lines.*.id' => 'nullable|exists:journal_entry_lines,id',
            'lines.*.account_id' => 'required|exists:accounts,id',
            'lines.*.debit' => 'required|numeric|min:0',
            'lines.*.credit' => 'required|numeric|min:0',
            'lines.*.description' => 'nullable|string',
            'lines.*.cost_center_id' => 'nullable|exists:cost_centers,id',
        ]);

        $accountIds = array_unique(array_filter(array_column($validated['lines'], 'account_id')));
        if (! empty($accountIds)) {
            $inactive = Account::where('tenant_id', $request->tenant_id)->whereIn('id', $accountIds)->where('is_active', false)->exists();
            if ($inactive) {
                return response()->json(['message' => __('لا يمكن استخدام حساب غير نشط في القيد.')], 422);
            }
        }

        $entry = $this->accountingService->updateJournalEntry($entry, $validated);

        return response()->json($entry->load('lines.account', 'customer', 'vendor'));
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $entry = JournalEntry::where('tenant_id', $request->tenant_id)->findOrFail($id);

        if ($entry->reference_type && str_ends_with((string) $entry->reference_type, 'Payment')) {
            return response()->json([
                'message' => 'لا يمكن حذف قيد سند قبض أو صرف من شاشة القيود. احذف أو ألغِ السند من صفحة سندات القبض/الصرف لضمان تحديث جدول الأقساط والفاتورة.',
            ], 422);
        }

        if ($entry->status === 'posted') {
            return response()->json(['message' => 'لا يمكن حذف قيد مرحّل - يمكنك إلغاء الترحيل أو إلغاء القيد أولاً'], 422);
        }

        if ($entry->status === 'draft' && $entry->reference_type) {
            return response()->json(['message' => 'لا يمكن حذف قيد مسودة مرتبط بفاتورة أو سند'], 422);
        }

        $entry->lines()->delete();
        $entry->delete();

        return response()->json(['message' => 'تم الحذف بنجاح']);
    }

    public function void(Request $request, int $id): JsonResponse
    {
        $entry = JournalEntry::where('tenant_id', $request->tenant_id)->findOrFail($id);

        if ($entry->status === 'void') {
            return response()->json(['message' => 'القيد ملغي بالفعل'], 422);
        }

        $entry->update(['status' => 'void']);

        if ($entry->reference_type && str_ends_with($entry->reference_type, 'Invoice') && $entry->reference_id) {
            $invoice = Invoice::where('tenant_id', $request->tenant_id)->where('id', $entry->reference_id)->first();
            if ($invoice) {
                $invoice->update(['journal_entry_id' => null]);
                \App\Services\InvoiceStatusResolver::applyToModel($invoice->fresh());
            }
        }

        return response()->json(['message' => 'تم إلغاء القيد. يمكنك الآن الدخول إلى الفاتورة وتعديلها من صفحة الفواتير.', 'entry' => $entry->fresh()]);
    }

    /**
     * إلغاء الترحيل: للقيود اليدوية والافتتاحية فقط، وتحويل الحالة إلى مسودة.
     */
    public function unpost(Request $request, int $id): JsonResponse
    {
        $entry = JournalEntry::where('tenant_id', $request->tenant_id)->findOrFail($id);

        if ($entry->status !== 'posted') {
            return response()->json(['message' => 'لا يمكن إلغاء الترحيل إلا للقيود المرحّلة'], 422);
        }

        if (! in_array($entry->type, ['manual', 'opening'], true)) {
            return response()->json(['message' => 'إلغاء الترحيل مسموح فقط للقيود اليدوية والافتتاحية'], 422);
        }

        if ($entry->reference_type) {
            return response()->json(['message' => 'لا يمكن إلغاء ترحيل قيد مُولَّد من فاتورة أو سند'], 422);
        }

        $entry->update(['status' => 'draft', 'posted_at' => null]);

        return response()->json(['message' => 'تم إلغاء الترحيل', 'entry' => $entry->fresh(['lines.account', 'customer', 'vendor'])]);
    }

    /**
     * ترحيل القيد: تحويل المسودة إلى مرحّل.
     */
    public function post(Request $request, int $id): JsonResponse
    {
        $entry = JournalEntry::where('tenant_id', $request->tenant_id)->findOrFail($id);

        if ($entry->status !== 'draft') {
            return response()->json(['message' => 'لا يمكن ترحيل قيد غير مسودة'], 422);
        }

        if (! $entry->isBalanced()) {
            return response()->json(['message' => 'القيد غير متوازن، لا يمكن الترحيل'], 422);
        }

        $entry->update(['status' => 'posted', 'posted_at' => now()]);

        return response()->json(['message' => 'تم ترحيل القيد', 'entry' => $entry->fresh(['lines.account', 'customer', 'vendor'])]);
    }
}
