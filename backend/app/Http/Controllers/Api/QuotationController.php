<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Quotation;
use App\Services\InvoiceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class QuotationController extends Controller
{
    public function __construct(
        private InvoiceService $invoiceService
    ) {}

    public function index(Request $request): JsonResponse
    {
        $fromDate = $request->from_date ?? $request->date_from;
        $toDate = $request->to_date ?? $request->date_to;
        if ($fromDate) {
            $fromDate = \Carbon\Carbon::parse($fromDate)->format('Y-m-d');
        }
        if ($toDate) {
            $toDate = \Carbon\Carbon::parse($toDate)->format('Y-m-d');
        }

        $query = Quotation::where('tenant_id', $request->tenant_id)
            ->when($request->type, fn ($q) => $q->where('type', $request->type))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->status))
            ->when($request->customer_id, fn ($q) => $q->where('customer_id', $request->customer_id))
            ->when($request->vendor_id, fn ($q) => $q->where('vendor_id', $request->vendor_id))
            ->when($request->branch_id, fn ($q) => $q->where('branch_id', $request->branch_id))
            ->when($request->cost_center_id, fn ($q) => $q->where('cost_center_id', $request->cost_center_id))
            ->when($request->created_by, fn ($q) => $q->where('created_by', $request->created_by))
            ->when($fromDate, fn ($q) => $q->whereDate('date', '>=', $fromDate))
            ->when($toDate, fn ($q) => $q->whereDate('date', '<=', $toDate))
            ->when($request->number, fn ($q) => $q->where('number', 'like', '%'.$request->number.'%'));

        $quotations = $query
            ->with('customer', 'vendor', 'branch', 'costCenter', 'createdBy')
            ->orderByDesc('date')
            ->orderByDesc('id')
            ->paginate($request->per_page ?? 20);

        return response()->json($quotations);
    }

    public function store(Request $request): JsonResponse
    {
        $this->normalizeOptionalIds($request);
        $validated = $this->validateQuotation($request);

        $validated['tenant_id'] = $request->tenant_id;
        $validated['status'] = $validated['status'] ?? 'draft';
        $validated['created_by'] = $request->user()->id;
        if (empty($validated['type'])) {
            $validated['type'] = ! empty($validated['customer_id']) ? 'sales' : (! empty($validated['vendor_id']) ? 'purchase' : 'sales');
        }

        $quotation = $this->createOrUpdateQuotation(new Quotation, $validated);

        return response()->json($quotation->load('lines.item', 'lines.unit', 'customer', 'vendor', 'branch', 'costCenter'), 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $quotation = Quotation::where('tenant_id', $request->tenant_id)
            ->with('lines.item.itemUnit', 'lines.unit', 'customer', 'vendor', 'branch', 'costCenter', 'createdBy', 'convertedInvoice')
            ->findOrFail($id);

        return response()->json($quotation);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $quotation = Quotation::where('tenant_id', $request->tenant_id)->findOrFail($id);

        if ($quotation->status === 'converted') {
            return response()->json(['message' => 'لا يمكن تعديل عرض سعر تم تحويله إلى فاتورة'], 422);
        }

        $this->normalizeOptionalIds($request);
        $validated = $this->validateQuotation($request);

        $quotation = $this->createOrUpdateQuotation($quotation, $validated);

        return response()->json($quotation->load('lines.item', 'lines.unit', 'customer', 'vendor', 'branch', 'costCenter'));
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $quotation = Quotation::where('tenant_id', $request->tenant_id)->findOrFail($id);

        if ($quotation->status === 'converted') {
            return response()->json(['message' => 'لا يمكن حذف عرض سعر تم تحويله إلى فاتورة'], 422);
        }

        $quotation->lines()->delete();
        $quotation->delete();

        return response()->json(['message' => 'تم الحذف']);
    }

    /**
     * تحويل عرض السعر إلى فاتورة: تغيير الحالة إلى "تم التحويل" وإرجاع بيانات الفاتورة للملء في واجهة إنشاء الفاتورة.
     * target: sales => فاتورة مبيعات (يُستخدم customer_id)، purchase => فاتورة مشتريات (يُستخدم vendor_id).
     */
    public function convertToInvoice(Request $request, int $id): JsonResponse
    {
        $target = $request->input('target', $request->query('target'));
        if (! in_array($target, ['sales', 'purchase'], true)) {
            return response()->json(['message' => 'يجب تحديد نوع التحويل: sales أو purchase'], 422);
        }

        $quotation = Quotation::where('tenant_id', $request->tenant_id)
            ->with('lines.item', 'lines.unit', 'customer', 'vendor', 'branch', 'costCenter')
            ->findOrFail($id);

        if ($quotation->status === 'converted') {
            return response()->json(['message' => 'تم تحويل هذا العرض مسبقاً إلى فاتورة'], 422);
        }

        if ($target === 'sales' && ! $quotation->customer_id) {
            return response()->json(['message' => 'تحويل المبيعات يتطلب اختيار عميل في عرض السعر'], 422);
        }
        if ($target === 'purchase' && ! $quotation->vendor_id) {
            return response()->json(['message' => 'تحويل المشتريات يتطلب اختيار مورد في عرض السعر'], 422);
        }

        // لا يتم تغيير حالة العرض إلى "تم التحويل" إلا بعد حفظ الفاتورة فعلياً (في InvoiceController::store)

        $payload = [
            'quotation_id' => $quotation->id,
            'quotation_number' => $quotation->number,
            'type' => $target,
            'customer_id' => $target === 'sales' ? $quotation->customer_id : null,
            'vendor_id' => $target === 'purchase' ? $quotation->vendor_id : null,
            'branch_id' => $quotation->branch_id,
            'cost_center_id' => $quotation->cost_center_id,
            'date' => $quotation->date->format('Y-m-d'),
            'due_date' => $quotation->valid_until?->format('Y-m-d'),
            'reference_number' => $quotation->number,
            'notes' => $quotation->notes,
            'currency' => $quotation->currency,
            'exchange_rate' => (float) $quotation->exchange_rate,
            'discount_amount' => (float) $quotation->discount_amount,
            'lines' => $quotation->lines->map(function ($line) {
                return [
                    'item_id' => $line->item_id,
                    'unit_id' => $line->unit_id,
                    'description' => $line->description ?: ($line->item?->name ?? ''),
                    'quantity' => (float) $line->quantity,
                    'unit_price' => (float) $line->unit_price,
                    'discount_percent' => (float) $line->discount_percent,
                    'tax_percent' => (float) $line->tax_percent,
                ];
            })->toArray(),
        ];

        return response()->json([
            'message' => 'تم تغيير حالة العرض إلى "تم التحويل". استخدم البيانات أدناه لإنشاء الفاتورة (يمكنك تعديل الكميات للتحويل الجزئي).',
            'invoice_payload' => $payload,
        ]);
    }

    private function createOrUpdateQuotation(Quotation $quotation, array $data): Quotation
    {
        $linesData = $data['lines'] ?? [];
        unset($data['lines']);

        $quotation->fill($data);
        $quotation->save();

        $quotation->lines()->delete();
        foreach ($linesData as $i => $row) {
            $line = $quotation->lines()->make([
                'item_id' => $row['item_id'] ?? null,
                'unit_id' => $row['unit_id'] ?? null,
                'description' => $row['description'] ?? '',
                'quantity' => $row['quantity'] ?? 1,
                'unit_price' => $row['unit_price'] ?? 0,
                'discount_percent' => $row['discount_percent'] ?? 0,
                'tax_percent' => $row['tax_percent'] ?? 0,
                'sort_order' => $i,
            ]);
            $line->calculateTotals();
            $line->save();
        }

        $quotation->recalculate();

        return $quotation;
    }

    private function normalizeOptionalIds(Request $request): void
    {
        $optionalIds = ['customer_id', 'vendor_id', 'branch_id', 'cost_center_id'];
        foreach ($optionalIds as $key) {
            if ($request->has($key)) {
                $v = $request->input($key);
                if ($v === '' || $v === 0 || $v === '0') {
                    $request->merge([$key => null]);
                }
            }
        }
        if ($request->has('lines') && is_array($request->lines)) {
            foreach ($request->lines as $i => $line) {
                if (isset($line['item_id']) && ($line['item_id'] === '' || $line['item_id'] === 0)) {
                    $request->lines[$i]['item_id'] = null;
                }
                if (isset($line['unit_id']) && ($line['unit_id'] === '' || $line['unit_id'] === 0)) {
                    $request->lines[$i]['unit_id'] = null;
                }
            }
        }
    }

    private function validateQuotation(Request $request): array
    {
        return $request->validate([
            'type' => 'nullable|in:sales,purchase',
            'status' => 'nullable|in:draft,approved',
            'date' => 'required|date',
            'valid_until' => 'nullable|date|after_or_equal:date',
            'customer_id' => 'nullable|exists:customers,id',
            'vendor_id' => 'nullable|exists:vendors,id',
            'branch_id' => 'nullable|exists:branches,id',
            'cost_center_id' => 'nullable|exists:cost_centers,id',
            'reference_number' => 'nullable|string|max:100',
            'discount_amount' => 'nullable|numeric|min:0',
            'currency' => 'nullable|string|max:3',
            'exchange_rate' => 'nullable|numeric|min:0.00000001',
            'notes' => 'nullable|string',
            'lines' => 'required|array|min:1',
            'lines.*.item_id' => 'nullable|exists:items,id',
            'lines.*.unit_id' => 'nullable|exists:item_units,id',
            'lines.*.description' => 'nullable|string',
            'lines.*.quantity' => 'required|numeric|min:0.0001',
            'lines.*.unit_price' => 'required|numeric|min:0',
            'lines.*.discount_percent' => 'nullable|numeric|min:0|max:100',
            'lines.*.tax_percent' => 'nullable|numeric|min:0|max:100',
        ]);
    }
}
