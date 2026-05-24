<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\Installment;
use App\Models\Invoice;
use App\Models\InvoicePayment;
use App\Models\Item;
use App\Models\ItemVariant;
use App\Models\LoyaltyPoint;
use App\Models\PosShift;
use App\Models\Quotation;
use App\Services\AuditLogService;
use App\Services\DeliveryService;
use App\Services\InvoiceService;
use App\Services\LoyaltyService;
use App\Services\PaymentService;
use App\Services\SerialNumbersService;
use App\Services\TenantSettingsService;
use App\Support\PartySearchTerms;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class InvoiceController extends Controller
{
    public function __construct(
        private InvoiceService $invoiceService,
        private PaymentService $paymentService,
        private TenantSettingsService $tenantSettings,
        private SerialNumbersService $serialNumbersService,
        private AuditLogService $auditLogService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $tenantId = (int) ($request->tenant_id ?? $request->header('X-Tenant-ID') ?? 0);
        if ($tenantId < 1) {
            return response()->json(['message' => 'يرجى تحديد المستأجر (Tenant)'], 422);
        }

        $fromDate = $request->from_date ?? $request->date_from;
        $toDate = $request->to_date ?? $request->date_to;
        if ($fromDate) {
            try {
                $fromDate = \Carbon\Carbon::parse($fromDate)->format('Y-m-d');
            } catch (\Throwable) {
                $fromDate = null;
            }
        }
        if ($toDate) {
            try {
                $toDate = \Carbon\Carbon::parse($toDate)->format('Y-m-d');
            } catch (\Throwable) {
                $toDate = null;
            }
        }

        // استعلام الفواتير من جدول invoices فقط (بدون JOIN مع جداول السيريال) لضمان ظهور كل الفواتير.
        $query = Invoice::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->when($request->has('is_return'), fn ($q) => $q->where('is_return', (bool) $request->is_return))
            ->when($request->filled('is_pos') && ($request->is_pos === '1' || $request->is_pos === true), fn ($q) => $q->posSalesOnly())
            ->when($request->filled('is_restaurant') && ($request->is_restaurant === '1' || $request->is_restaurant === true), fn ($q) => $q->where('type', 'sales')->restaurantSalesOnly())
            ->when($request->filled('sales_source'), function ($q) use ($request) {
                $src = (string) $request->sales_source;
                if ($src === 'pos') {
                    $q->posSalesOnly();
                } elseif ($src === 'restaurant') {
                    $q->where('type', 'sales')->restaurantSalesOnly();
                } elseif ($src === 'regular') {
                    $q->whereNull('pos_shift_id')->whereNull('order_type')->whereNull('table_id');
                }
            })
            ->when($request->type && ! $request->filled('is_restaurant'), fn ($q) => $q->where('type', $request->type))
            ->when($request->filled('document_status'), fn ($q) => $q->where('document_status', $request->document_status))
            ->when($request->filled('payment_status'), fn ($q) => $q->where('payment_status', $request->payment_status))
            ->when($request->filled('status') && ! $request->filled('document_status') && ! $request->filled('payment_status'), fn ($q) => $q->where('status', $request->status))
            ->when($request->filled('branch_id'), fn ($q) => $q->where('branch_id', $request->branch_id))
            ->when($request->filled('warehouse_id'), fn ($q) => $q->where('warehouse_id', $request->warehouse_id))
            ->when($request->filled('created_by'), fn ($q) => $q->where('created_by', $request->created_by))
            ->when($request->filled('payment_method_id'), fn ($q) => $q->where('payment_method_id', $request->payment_method_id))
            ->when($request->filled('cost_center_id'), fn ($q) => $q->where('cost_center_id', $request->cost_center_id))
            ->when(
                $request->filled('order_type') && in_array($request->order_type, ['dine_in', 'takeaway', 'delivery'], true),
                fn ($q) => $q->where('order_type', $request->order_type)
            )
            ->when($request->customer_id, fn ($q, $c) => $q->where('customer_id', $c))
            ->when($request->vendor_id, fn ($q, $v) => $q->where('vendor_id', $v))
            ->when($fromDate, fn ($q) => $q->whereDate('date', '>=', $fromDate))
            ->when($toDate, fn ($q) => $q->whereDate('date', '<=', $toDate))
            ->when($request->number, fn ($q, $n) => $q->where('number', 'like', '%'.$n.'%'))
            ->when($request->filled('customer_name'), function ($q) use ($request) {
                $raw = trim((string) $request->customer_name);
                if ($raw === '') {
                    return;
                }
                $q->whereHas('customer', function ($cq) use ($raw) {
                    PartySearchTerms::applyCustomerColumns($cq, $raw);
                });
            })
            ->when($request->filled('vendor_name'), function ($q) use ($request) {
                $raw = trim((string) $request->vendor_name);
                if ($raw === '') {
                    return;
                }
                $q->whereHas('vendor', function ($vq) use ($raw) {
                    PartySearchTerms::applyVendorColumns($vq, $raw);
                });
            })
            ->when(
                $request->filled('party_search')
                    && ! $request->filled('customer_name')
                    && ! $request->filled('vendor_name'),
                function ($q) use ($request) {
                    $raw = trim((string) $request->party_search);
                    if ($raw === '') {
                        return;
                    }
                    $q->where(function ($outer) use ($raw) {
                        $outer->where(function ($w) use ($raw) {
                            $w->where('type', 'sales')
                                ->whereHas('customer', function ($cq) use ($raw) {
                                    PartySearchTerms::applyCustomerColumns($cq, $raw);
                                });
                        })->orWhere(function ($w) use ($raw) {
                            $w->where('type', 'purchase')
                                ->whereHas('vendor', function ($vq) use ($raw) {
                                    PartySearchTerms::applyVendorColumns($vq, $raw);
                                });
                        });
                    });
                }
            );

        try {
            $perPage = (int) ($request->per_page ?? 20);
            $perPage = $perPage < 1 ? 20 : min($perPage, 100);
            $invoices = $query
                ->with(['customer', 'vendor', 'branch', 'warehouse', 'paymentMethod', 'costCenter', 'parentInvoice', 'createdBy', 'table:id,name'])
                ->orderByDesc('date')
                ->orderByDesc('id')
                ->paginate($perPage, ['*'], 'page', (int) ($request->page ?? 1));

            $filterPos = ($request->filled('is_pos') && ($request->is_pos === '1' || $request->is_pos === true))
                || $request->sales_source === 'pos';
            if ($filterPos) {
                $postedShiftIds = PosShift::where('tenant_id', $tenantId)
                    ->where('status', 'closed')
                    ->whereNotNull('journal_entry_id')
                    ->pluck('id')
                    ->flip();
                $invoices->getCollection()->transform(function ($inv) use ($postedShiftIds) {
                    $inv->in_posted_shift = $inv->pos_shift_id && $postedShiftIds->has($inv->pos_shift_id);

                    return $inv;
                });
            }

            return response()->json($invoices);
        } catch (\Throwable $e) {
            report($e);
            $message = config('app.debug') ? $e->getMessage() : 'حدث خطأ أثناء جلب الفواتير.';

            return response()->json(['message' => $message], 500);
        }
    }

    public function store(Request $request): JsonResponse
    {
        $this->normalizeOptionalIds($request);
        $validated = $this->validateInvoice($request);

        $validated['tenant_id'] = $request->tenant_id;
        $validated['status'] = 'draft';
        $validated['created_by'] = $request->user()->id;
        $validated['is_return'] = ! empty($validated['is_return']);
        $validated['parent_invoice_id'] = $validated['parent_invoice_id'] ?? null;
        $validated['quotation_id'] = $validated['quotation_id'] ?? null;

        $deliveryFeesNormalized = [];
        if (($validated['type'] ?? '') === 'sales' && empty($validated['is_return'])) {
            $rawFees = $request->input('delivery_fees', []);
            if (is_array($rawFees)) {
                foreach ($rawFees as $fee) {
                    if (! is_array($fee)) {
                        continue;
                    }
                    $amt = round((float) ($fee['amount'] ?? 0), 3);
                    if ($amt <= 0) {
                        continue;
                    }
                    $label = trim((string) ($fee['label'] ?? ''));
                    if ($label === '') {
                        $label = 'رسوم توصيل';
                    }
                    $deliveryFeesNormalized[] = [
                        'type' => mb_substr((string) ($fee['type'] ?? 'delivery'), 0, 64),
                        'label' => mb_substr($label, 0, 255),
                        'amount' => $amt,
                        'account_id' => ! empty($fee['account_id']) ? (int) $fee['account_id'] : null,
                    ];
                }
            }
        }
        $validated['delivery_fees'] = $deliveryFeesNormalized;
        $validated['delivery_fees_total'] = round(collect($deliveryFeesNormalized)->sum('amount'), 3);

        $salesPaymentTab = (string) $request->input('sales_payment_tab', '');
        $partialRaw = $request->input('partial_payment');
        $paymentLinesRaw = $request->input('payment_lines');
        /** @var array<int, array{amount: float, method_id: int, date: string, notes: string}> $receiptSpecs */
        $receiptSpecs = [];

        if (($validated['type'] ?? '') === 'sales' && empty($validated['is_return'])) {
            $isInstallmentFlow = $salesPaymentTab === 'installment';
            $hasPartial = is_array($partialRaw)
                && (float) ($partialRaw['amount'] ?? 0) > 0.0005
                && ! empty($partialRaw['method_id']);
            if ($hasPartial && $isInstallmentFlow) {
                return response()->json([
                    'message' => 'لا يمكن الجمع بين الدفع الجزئي (سند قبض تلقائي) وتبويب التقسيط في نفس الفاتورة.',
                ], 422);
            }
            if ($hasPartial) {
                $receiptSpecs[] = [
                    'amount' => round((float) $partialRaw['amount'], 3),
                    'method_id' => (int) $partialRaw['method_id'],
                    'date' => (string) ($partialRaw['date'] ?? $validated['date']),
                    'notes' => 'دفعة جزئية على فاتورة عند الإنشاء',
                ];
                $validated['amount_paid'] = 0;
                $validated['payment_method_id'] = null;
            } elseif (! $isInstallmentFlow && is_array($paymentLinesRaw) && $paymentLinesRaw !== []) {
                foreach ($paymentLinesRaw as $row) {
                    if (! is_array($row)) {
                        continue;
                    }
                    $a = round((float) ($row['amount'] ?? 0), 3);
                    $mid = (int) ($row['method_id'] ?? 0);
                    if ($a <= 0.0005 || $mid < 1) {
                        continue;
                    }
                    $receiptSpecs[] = [
                        'amount' => $a,
                        'method_id' => $mid,
                        'date' => (string) ($row['date'] ?? $validated['date']),
                        'notes' => 'سداد على فاتورة — دفع مختلط',
                    ];
                }
                if ($receiptSpecs !== []) {
                    $validated['amount_paid'] = 0;
                    $validated['payment_method_id'] = null;
                }
            }
        }

        if (isset($validated['delivery_driver_id']) && (int) $validated['delivery_driver_id'] === 0) {
            $validated['delivery_driver_id'] = null;
        }
        /** توصيل مع سائق: المبلغ لا يُسجَّل كتحصيل على الوردية؛ يبقى ذمة ثم يُنقل لعهدة السائق */
        if (
            ($validated['type'] ?? '') === 'sales'
            && empty($validated['is_return'])
            && ($validated['order_type'] ?? null) === 'delivery'
            && ! empty($validated['delivery_driver_id'])
        ) {
            $validated['amount_paid'] = 0;
            $validated['payment_timing'] = 'deferred';
            $validated['payment_method_id'] = null;
            $receiptSpecs = [];
        }

        if ($receiptSpecs !== [] && (($validated['type'] ?? '') !== 'sales' || empty($validated['customer_id']))) {
            return response()->json([
                'message' => 'يجب اختيار العميل قبل تسجيل سند قبض على الفاتورة.',
            ], 422);
        }

        try {
            [$invoice, $receiptPayload] = DB::transaction(function () use ($request, $validated, $receiptSpecs) {
                $invoice = $this->invoiceService->createInvoice($validated, $validated['lines']);

                app(DeliveryService::class)->applyDispatchAfterPostedSalesInvoice(
                    $invoice->fresh(['customer']),
                    isset($validated['delivery_driver_id']) ? (int) $validated['delivery_driver_id'] : null,
                    $request->user()->id
                );

                if (! empty($validated['quotation_id'])) {
                    Quotation::where('id', $validated['quotation_id'])
                        ->where('tenant_id', $request->tenant_id)
                        ->update(['status' => 'converted']);
                }

                $receiptOut = null;
                if (
                    $receiptSpecs !== []
                    && $invoice->type === 'sales'
                    && ! $invoice->is_return
                ) {
                    $sumReceipts = round(collect($receiptSpecs)->sum('amount'), 3);
                    if ($sumReceipts - (float) $invoice->total > 0.01) {
                        throw new \InvalidArgumentException('مجموع مبالغ سندات القبض أكبر من إجمالي الفاتورة.');
                    }
                    $createdPayments = [];
                    foreach ($receiptSpecs as $spec) {
                        $createdPayments[] = $this->paymentService->createPayment([
                            'tenant_id' => (int) $request->tenant_id,
                            'type' => 'receipt',
                            'date' => $spec['date'],
                            'amount' => $spec['amount'],
                            'payment_method_id' => $spec['method_id'],
                            'invoice_id' => $invoice->id,
                            'customer_id' => $invoice->customer_id,
                            'reference' => $invoice->number ?? (string) $invoice->id,
                            'notes' => $spec['notes'],
                            'branch_id' => $invoice->branch_id,
                            'status' => 'approved',
                            'created_by' => $request->user()->id,
                        ]);
                    }
                    $invoice->refresh();
                    $refs = array_map(fn ($p) => (string) $p->number, $createdPayments);
                    $receiptOut = [
                        'receipt_ids' => array_map(fn ($p) => (int) $p->id, $createdPayments),
                        'references' => $refs,
                        'reference' => implode('، ', $refs),
                        'amount' => $sumReceipts,
                        'remaining' => round((float) $invoice->total - (float) $invoice->amount_paid, 3),
                        'date' => (string) $validated['date'],
                    ];
                }

                return [$invoice, $receiptOut];
            });
        } catch (\Throwable $e) {
            report($e);
            $message = $e->getMessage() ?: 'An error occurred while saving the invoice.';

            return response()->json(['message' => $message], 422);
        }

        try {
            $this->processSalesInvoiceLoyalty($request, $invoice);
        } catch (\Throwable $e) {
            // Loyalty is optional; do not break invoice save.
            report($e);
        }

        $invoice = $invoice->fresh([
            'lines.item',
            'customer',
            'vendor',
            'parentInvoice',
            'journalEntry.lines.account',
            'manufacturingJournalEntry.lines.account',
            'createdBy',
            'payments',
            'additionalExpenses.expenseAccount',
            'additionalExpenses.creditorAccount',
        ]);

        return response()->json([
            'message' => 'تم إنشاء الفاتورة بنجاح.',
            'invoice' => $invoice,
            'receipt' => $receiptPayload,
            'has_receipt' => $receiptPayload !== null,
        ], 201);
    }

    /**
     * أنواع رسوم التوصيل/النقل للواجهة (مرجعية؛ الحساب الفعلي يُحل عند الترحيل).
     */
    public function deliveryFeeTypes(Request $request): JsonResponse
    {
        $tenantId = (int) ($request->tenant_id ?? $request->header('X-Tenant-ID') ?? 0);
        if ($tenantId < 1) {
            return response()->json(['message' => 'يرجى تحديد المستأجر (Tenant)'], 422);
        }

        return response()->json([
            'data' => [
                ['value' => 'delivery', 'label' => 'رسوم توصيل', 'account_code' => '4200'],
                ['value' => 'shipping', 'label' => 'رسوم شحن', 'account_code' => '4201'],
                ['value' => 'transport', 'label' => 'رسوم نقل', 'account_code' => '4202'],
                ['value' => 'handling', 'label' => 'رسوم مناولة', 'account_code' => '4203'],
                ['value' => 'custom', 'label' => 'أخرى', 'account_code' => '4204'],
            ],
        ]);
    }

    /**
     * رابط مشاركة الفاتورة (معاينة و/أو PDF عند توفره لاحقاً).
     * للاستخدام مع إرسال الواتساب — الرابط يُوضَع في نص الرسالة لتحميل الملف.
     */
    public function shareUrl(Request $request, int $id): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        Invoice::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->findOrFail($id);

        $frontendUrl = rtrim(config('app.frontend_url', ''), '/');
        if ($frontendUrl === '') {
            $frontendUrl = $request->getSchemeAndHttpHost();
        }
        $viewUrl = $frontendUrl.'/invoices/view/'.$id;
        $pdfUrl = null; // عند تفعيل تصدير PDF من السيرفر يمكن إرجاع رابط الملف هنا

        return response()->json([
            'view_url' => $viewUrl,
            'pdf_url' => $pdfUrl,
        ]);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        // استعلام الفاتورة دون ربط بجداول السيريال لضمان ظهور الفواتير القديمة أو بدون أرقام تسلسلية.
        $invoice = Invoice::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->with('lines.item.itemUnit', 'lines.itemVariant', 'lines.unit', 'lines.account', 'customer', 'vendor', 'branch', 'warehouse', 'paymentMethod', 'costCenter', 'journalEntry.lines.account', 'manufacturingJournalEntry.lines.account', 'createdBy', 'parentInvoice', 'quotation', 'payments', 'additionalExpenses.expenseAccount', 'additionalExpenses.creditorAccount', 'installment.lines')
            ->findOrFail($id);

        $lines = $invoice->relationLoaded('lines') ? $invoice->lines : [];
        // منطق الإظهار: جلب الأرقام التسلسلية فقط عند تفعيل إعداد "إظهار السيريال"، مع عدم تأثر الفاتورة عند التعطيل.
        $showSerialsInReports = (bool) $this->tenantSettings->get($tenantId, 'invoice_show_serial_in_reports', $this->tenantSettings->get($tenantId, 'invoice_use_serial_numbers'));

        if ($showSerialsInReports && $lines !== []) {
            $lineIds = collect($lines)->pluck('id')->filter()->values()->all();
            if ($lineIds !== []) {
                // LEFT JOIN مع جداول الأرقام التسلسلية + GROUP_CONCAT (عزل tenant_id).
                $serialsByLine = DB::table('invoice_line_serials')
                    ->leftJoin('item_serials', function ($j) use ($tenantId) {
                        $j->on('item_serials.id', '=', 'invoice_line_serials.item_serial_id')
                            ->where('item_serials.tenant_id', '=', $tenantId);
                    })
                    ->whereIn('invoice_line_serials.invoice_line_id', $lineIds)
                    ->groupBy('invoice_line_serials.invoice_line_id')
                    ->selectRaw('invoice_line_serials.invoice_line_id, GROUP_CONCAT(item_serials.serial_number ORDER BY invoice_line_serials.id) AS serials_concatenated')
                    ->pluck('serials_concatenated', 'invoice_line_id');
            } else {
                $serialsByLine = collect();
            }
        } else {
            $serialsByLine = collect();
        }

        foreach ($lines as $line) {
            try {
                $display = '';
                if ($showSerialsInReports) {
                    $fromDb = $serialsByLine->get($line->id);
                    if ($fromDb !== null && $fromDb !== '') {
                        $display = $fromDb;
                    } else {
                        $raw = $line->getAttribute('serial_numbers');
                        $serials = is_array($raw) ? $raw : (is_string($raw) ? (json_decode($raw, true) ?: []) : []);
                        $display = ! empty($serials) ? implode(', ', array_map('trim', $serials)) : '';
                    }
                }
                $line->setAttribute('serials_display', $display);
            } catch (\Throwable) {
                $line->setAttribute('serials_display', '');
            }
        }

        // حقول مسطّحة من رأس الفاتورة (فرع/مركز تكلفة المختاران على الفاتورة) لتفادي اختلاف مفاتيح JSON في الواجهة
        $invoice->setAttribute('branch_name', $invoice->branch?->name);
        $invoice->setAttribute('cost_center_name', $invoice->costCenter?->name);

        if ($invoice->type === 'sales' && ! $invoice->is_return) {
            $this->attachInvoiceLoyaltyRedemptionSnapshot($invoice);
        }

        return response()->json($invoice);
    }

    /**
     * تحديث حالة الاستلام فقط (لفواتير المشتريات من القائمة).
     */
    public function updateReceiptStatus(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'receipt_status' => 'nullable|in:received,pending,partial',
        ]);

        $invoice = Invoice::withoutGlobalScopes()->where('tenant_id', $request->tenant_id)->findOrFail($id);
        if ($invoice->status === 'cancelled') {
            return response()->json(['message' => 'لا يمكن تعديل فاتورة ملغاة'], 422);
        }
        if (($err = $this->rejectIfInvoiceInPostedShift($invoice)) !== null) {
            return $err;
        }

        $invoice->update(['receipt_status' => $request->input('receipt_status')]);

        return response()->json($invoice->fresh());
    }

    public function update(Request $request, int $id): JsonResponse
    {
        // استقرار الخادم: مهلة وذاكرة كافية لطلبات الحفظ الثقيلة (إلغاء قيد + إنشاء قيد جديد)
        set_time_limit(90);
        @ini_set('memory_limit', '256M');

        $invoice = Invoice::withoutGlobalScopes()->where('tenant_id', $request->tenant_id)->findOrFail($id);

        if ($invoice->status === 'cancelled') {
            return response()->json(['message' => 'لا يمكن تعديل فاتورة ملغاة'], 422);
        }
        if (($err = $this->rejectIfInvoiceInPostedShift($invoice)) !== null) {
            return $err;
        }

        $this->normalizeOptionalIds($request);

        try {
            $validated = $this->validateInvoice($request);
        } catch (\Illuminate\Validation\ValidationException $e) {
            $msg = $e->validator->errors()->first();

            return response()->json(['message' => $msg ?: 'حدث خطأ أثناء التعديل', 'errors' => $e->errors()], 422);
        }

        if (isset($validated['delivery_driver_id']) && (int) $validated['delivery_driver_id'] === 0) {
            $validated['delivery_driver_id'] = null;
        }
        if (
            ($validated['type'] ?? '') === 'sales'
            && empty($validated['is_return'])
            && ($validated['order_type'] ?? null) === 'delivery'
            && ! empty($validated['delivery_driver_id'])
        ) {
            $validated['amount_paid'] = 0;
            $validated['payment_timing'] = 'deferred';
            $validated['payment_method_id'] = null;
        }

        if (($validated['type'] ?? '') === 'sales' && empty($validated['is_return']) && $request->has('delivery_fees')) {
            $deliveryFeesNormalized = [];
            $rawFees = $request->input('delivery_fees', []);
            if (is_array($rawFees)) {
                foreach ($rawFees as $fee) {
                    if (! is_array($fee)) {
                        continue;
                    }
                    $amt = round((float) ($fee['amount'] ?? 0), 3);
                    if ($amt <= 0) {
                        continue;
                    }
                    $label = trim((string) ($fee['label'] ?? ''));
                    if ($label === '') {
                        $label = 'رسوم توصيل';
                    }
                    $deliveryFeesNormalized[] = [
                        'type' => mb_substr((string) ($fee['type'] ?? 'delivery'), 0, 64),
                        'label' => mb_substr($label, 0, 255),
                        'amount' => $amt,
                        'account_id' => ! empty($fee['account_id']) ? (int) $fee['account_id'] : null,
                    ];
                }
            }
            $validated['delivery_fees'] = $deliveryFeesNormalized;
            $validated['delivery_fees_total'] = round(collect($deliveryFeesNormalized)->sum('amount'), 3);
        }

        try {
            $tenantId = (int) $request->tenant_id;
            // مع وجود سندات مرتبطة: ما زال التعديل الكامل مسموحاً (إعادة ترحيل القيد/المخزن في الخدمة)،
            // مع الإبقاء على المبلغ المدفوع المسجّل كما هو من السندات داخل InvoiceService.
            $invoice = DB::transaction(function () use ($request, $invoice, $validated, $tenantId) {
                if (
                    $invoice->type === 'sales'
                    && ! $invoice->is_return
                    && $invoice->status === 'posted'
                ) {
                    try {
                        app(LoyaltyService::class)->reverseInvoiceLoyaltyActivity(
                            $tenantId,
                            (int) $invoice->id,
                            (int) $request->user()->id
                        );
                    } catch (\Throwable $e) {
                        report($e);
                    }
                }

                $updated = $this->invoiceService->updateInvoice($invoice, $validated, $validated['lines'], false);

                if (
                    $updated->type === 'sales'
                    && ! $updated->is_return
                    && $updated->customer_id
                    && $updated->status === 'posted'
                ) {
                    try {
                        $this->processSalesInvoiceLoyalty($request, $updated->fresh());
                    } catch (\Throwable $e) {
                        report($e);
                    }
                }

                return $updated;
            });

            return response()->json($invoice);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'message' => $e->getMessage() ?: 'حدث خطأ أثناء التعديل',
            ], 500);
        }
    }

    /** تحويل القيم الفارغة أو 0 للحقول الاختيارية إلى null لتجنب فشل التحقق */
    private function normalizeOptionalIds(Request $request): void
    {
        $optionalIds = [
            'customer_id', 'vendor_id', 'branch_id', 'warehouse_id', 'cost_center_id', 'payment_method_id',
            'parent_invoice_id', 'table_id', 'delivery_driver_id',
        ];
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
                if (isset($line['account_id']) && ($line['account_id'] === '' || $line['account_id'] === 0)) {
                    $request->lines[$i]['account_id'] = null;
                }
            }
        }
    }

    /**
     * ترحيل الفاتورة: قيد محاسبي + حركات مخزنية + سند قبض/صرف (إن وُجد مبلغ مدفوع) في معاملة واحدة.
     */
    public function post(Request $request, int $id): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $request->validate([
            'delivery_driver_id' => [
                'nullable',
                'integer',
                Rule::exists('delivery_drivers', 'id')->where(fn ($q) => $q->where('tenant_id', $tenantId)),
            ],
        ]);

        $invoice = Invoice::withoutGlobalScopes()->where('tenant_id', $request->tenant_id)
            ->with('lines.item')
            ->findOrFail($id);

        if ($invoice->status !== 'draft') {
            return response()->json(['message' => 'لا يمكن ترحيل فاتورة غير مسودة'], 422);
        }

        try {
            $invoice = DB::transaction(function () use ($request, $invoice) {
                if ($request->filled('delivery_driver_id')) {
                    $invoice->delivery_driver_id = (int) $request->input('delivery_driver_id');
                    $invoice->save();
                }

                if (
                    $invoice->type === 'sales'
                    && ! $invoice->is_return
                    && $invoice->order_type === 'delivery'
                    && $invoice->delivery_driver_id
                    && (float) ($invoice->amount_paid ?? 0) > 0.0005
                ) {
                    InvoicePayment::where('invoice_id', $invoice->id)->delete();
                    $invoice->update([
                        'amount_paid' => 0,
                        'balance' => $invoice->total,
                        'payment_timing' => 'deferred',
                        'payment_method_id' => null,
                    ]);
                    $invoice = $invoice->fresh(['lines.item']);
                }

                $invoice = $this->invoiceService->postInvoice($invoice);

                app(DeliveryService::class)->applyDispatchAfterPostedSalesInvoice(
                    $invoice->fresh(['customer']),
                    $request->filled('delivery_driver_id') ? (int) $request->input('delivery_driver_id') : null,
                    auth()->id()
                );

                return $invoice;
            });
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'message' => $e->getMessage() ?: 'فشل ترحيل الفاتورة؛ لم يُحدَّث المخزون ولم يُعتمد القيد.',
            ], 422);
        }

        try {
            $this->processSalesInvoiceLoyalty($request, $invoice->fresh());
        } catch (\Throwable $e) {
            report($e);
        }

        $invoice = $invoice->fresh(['payments', 'customer', 'vendor', 'journalEntry.lines.account', 'manufacturingJournalEntry.lines.account']);

        return response()->json(['message' => 'تم ترحيل الفاتورة', 'invoice' => $invoice]);
    }

    /**
     * حذف الفاتورة حذفاً نهائياً. لا يُسمح بالحذف إذا وُجدت سندات قبض/صرف مرتبطة بالفاتورة؛
     * يجب حذف السندات أولاً. إن لم توجد سندات، يُحذف قيد اليومية والفاتورة.
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $invoice = Invoice::withoutGlobalScopes()->where('tenant_id', $request->tenant_id)->findOrFail($id);
        if (($err = $this->rejectIfInvoiceInPostedShift($invoice, true)) !== null) {
            return $err;
        }

        $linkedPayments = $invoice->payments()->get(['id', 'number']);
        if ($linkedPayments->isNotEmpty()) {
            $numbers = $linkedPayments->pluck('number')->implode('، ');
            $message = __('لا يمكن حذف الفاتورة لوجود سند(ات) قبض/صرف مرتبط(ة) بها. أرقام السندات: :numbers. يرجى حذف السندات أولاً.', ['numbers' => $numbers]);

            return response()->json(['message' => $message], 422);
        }

        $tenantId = (int) $invoice->tenant_id;
        $invoiceNumber = (string) $invoice->number;
        $invoiceId = (int) $invoice->id;
        $linkedInstallmentNumbers = Installment::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->where('invoice_id', $invoiceId)
            ->pluck('number')
            ->values()
            ->all();

        try {
            \Illuminate\Support\Facades\DB::transaction(function () use ($invoice) {
                $this->invoiceService->forceDeleteInvoice($invoice);
            });
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage() ?: 'فشل حذف الفاتورة'], 422);
        }

        $uid = auth()->id();
        $this->auditLogService->log(
            'invoice_deleted_with_related',
            'invoices',
            null,
            [
                'message' => 'قام المستخدم '.($uid ? '#'.$uid : '(غير معروف)').' بحذف الفاتورة رقم '.$invoiceNumber.' والجداول المرتبطة بها',
                'invoice_id' => $invoiceId,
                'invoice_number' => $invoiceNumber,
                'installment_schedule_numbers' => $linkedInstallmentNumbers,
            ],
            null,
            $tenantId,
            $uid ? (int) $uid : null,
        );

        return response()->json(['message' => __('تم حذف الفاتورة وقيد اليومية المرتبط بها نهائياً.')]);
    }

    public function cancel(Request $request, int $id): JsonResponse
    {
        $invoice = Invoice::withoutGlobalScopes()->where('tenant_id', $request->tenant_id)->findOrFail($id);

        if ($invoice->status === 'cancelled') {
            return response()->json(['message' => 'الفاتورة ملغاة بالفعل'], 422);
        }
        if (($err = $this->rejectIfInvoiceInPostedShift($invoice)) !== null) {
            return $err;
        }

        if ($invoice->amount_paid > 0) {
            return response()->json(['message' => 'لا يمكن إلغاء فاتورة بها مدفوعات'], 422);
        }

        $invoice = $this->invoiceService->cancelInvoice($invoice);

        return response()->json(['message' => 'تم إلغاء الفاتورة', 'invoice' => $invoice]);
    }

    /** إلغاء الترحيل: حذف القيد والحركات، إعادة الفاتورة لمسودة (قابلة للتعديل والترحيل مجدداً). */
    public function unpost(Request $request, int $id): JsonResponse
    {
        $invoice = Invoice::withoutGlobalScopes()->where('tenant_id', $request->tenant_id)->findOrFail($id);

        if ($invoice->status === 'draft') {
            return response()->json(['message' => 'الفاتورة مسودة وليست مرحّلة'], 422);
        }
        if ($invoice->status === 'cancelled') {
            return response()->json(['message' => 'الفاتورة ملغاة'], 422);
        }
        if ((float) ($invoice->amount_paid ?? 0) > 0) {
            return response()->json(['message' => 'لا يمكن إلغاء ترحيل فاتورة بها مدفوعات'], 422);
        }
        if (($err = $this->rejectIfInvoiceInPostedShift($invoice)) !== null) {
            return $err;
        }

        $invoice = $this->invoiceService->unpostInvoice($invoice);

        return response()->json(['message' => 'تم إلغاء الترحيل وحذف القيد. الفاتورة أصبحت مسودة ويمكنك تعديلها وترحيلها مجدداً.', 'invoice' => $invoice]);
    }

    /**
     * إعادة بناء القيد المحاسبي والمخزني لفاتورة مبيعات مرحّلة دون تغيير بيانات الفاتورة.
     * مفيد بعد تحديث إعدادات التصنيع أو منطق الترحيل لرؤية القيد الجديد دون الاعتماد على «حفظ» يدوي.
     */
    public function rebuildJournal(Request $request, int $id): JsonResponse
    {
        set_time_limit(90);
        @ini_set('memory_limit', '256M');

        $invoice = Invoice::withoutGlobalScopes()->where('tenant_id', $request->tenant_id)->findOrFail($id);

        if ($invoice->type !== 'sales') {
            return response()->json(['message' => 'إعادة بناء القيد متاحة لفواتير المبيعات فقط.'], 422);
        }
        if ($invoice->status === 'cancelled') {
            return response()->json(['message' => 'لا يمكن إعادة بناء قيد لفاتورة ملغاة.'], 422);
        }
        if (! $invoice->journal_entry_id) {
            return response()->json(['message' => 'الفاتورة ليست مرحّلة أو لا يوجد قيد مرتبط.'], 422);
        }
        if (($err = $this->rejectIfInvoiceInPostedShift($invoice)) !== null) {
            return $err;
        }

        try {
            $invoice = $this->invoiceService->rebuildPostedSalesInvoiceJournal($invoice);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'message' => $e->getMessage() ?: 'فشل إعادة بناء القيد.',
            ], 422);
        }

        return response()->json([
            'message' => 'تم إعادة بناء القيد المحاسبي والحركات المخزنية المرتبطة بالفاتورة.',
            'invoice' => $invoice,
        ]);
    }

    /** إضافة دفعة على فاتورة → سند قبض (مبيعات) أو سند صرف (مشتريات) */
    public function addPayment(Request $request, int $id): JsonResponse
    {
        $invoice = Invoice::withoutGlobalScopes()->where('tenant_id', $request->tenant_id)->findOrFail($id);

        if ($invoice->status === 'cancelled') {
            return response()->json(['message' => 'لا يمكن إضافة دفعة على فاتورة ملغاة'], 422);
        }
        if ($invoice->status === 'draft' && $invoice->type !== 'sales') {
            return response()->json(['message' => 'لا يمكن إضافة دفعة على فاتورة مسودة (مشتريات). قم بترحيل الفاتورة أولاً.'], 422);
        }
        if (($err = $this->rejectIfInvoiceInPostedShift($invoice)) !== null) {
            return $err;
        }

        $maxAmount = (float) $invoice->balance;
        if ($maxAmount <= 0 && $invoice->status === 'draft' && $invoice->type === 'sales') {
            $maxAmount = (float) $invoice->total - (float) ($invoice->amount_paid ?? 0);
        }
        if ($maxAmount <= 0) {
            return response()->json(['message' => 'الفاتورة مسددة بالكامل'], 422);
        }

        $validated = $request->validate([
            'amount' => 'required|numeric|min:0.01',
            'date' => 'required|date',
            'payment_method_id' => 'nullable|exists:payment_methods,id',
            'notes' => 'nullable|string',
        ]);

        if ((float) $validated['amount'] > $maxAmount) {
            return response()->json(['message' => 'المبلغ أكبر من الرصيد المتبقي'], 422);
        }

        $paymentType = $invoice->type === 'sales' ? 'receipt' : 'payment';
        $paymentData = [
            'tenant_id' => $request->tenant_id,
            'type' => $paymentType,
            'date' => $validated['date'],
            'amount' => $validated['amount'],
            'payment_method_id' => $validated['payment_method_id'] ?? null,
            'notes' => $validated['notes'] ?? null,
            'invoice_id' => $invoice->id,
            'reference' => $invoice->number ?? (string) $invoice->id,
            'customer_id' => $invoice->type === 'sales' ? $invoice->customer_id : null,
            'vendor_id' => $invoice->type === 'purchase' ? $invoice->vendor_id : null,
            'branch_id' => $invoice->branch_id,
        ];

        $payment = $this->paymentService->createPayment($paymentData);

        $newAmountPaid = (float) $invoice->amount_paid + (float) $validated['amount'];
        $newBalance = (float) $invoice->total - $newAmountPaid;
        $invoice->update([
            'amount_paid' => $newAmountPaid,
            'balance' => $newBalance,
        ]);
        \App\Services\InvoiceStatusResolver::applyToModel($invoice->fresh());

        return response()->json([
            'message' => $paymentType === 'receipt' ? 'تم إنشاء سند قبض' : 'تم إنشاء سند صرف',
            'payment' => $payment,
            'invoice' => $invoice->fresh(),
        ], 201);
    }

    /** منع التعديل/الإلغاء/الحذف للفواتير التابعة لوردية مغلقة ومرحّلة محاسبياً */
    private function rejectIfInvoiceInPostedShift(Invoice $invoice, bool $isDelete = false): ?JsonResponse
    {
        if (! $invoice->pos_shift_id) {
            return null;
        }
        $shift = PosShift::withoutGlobalScopes()->find($invoice->pos_shift_id);
        if (! $shift || ! $shift->isPosted()) {
            return null;
        }
        $message = $isDelete
            ? 'لا يمكن حذف الفاتورة لأنها دخلت ضمن وردية مغلقة ومرحّلة محاسبياً. لضمان سلامة الحسابات يُمنع حذف أو تعديل فواتير الورديات المغلقة.'
            : 'لا يمكن تعديل أو إلغاء فاتورة دخلت ضمن وردية مغلقة ومرحّلة محاسبياً لضمان سلامة الحسابات.';

        return response()->json(['message' => $message], 403);
    }

    private function validateInvoice(Request $request): array
    {
        $validated = $request->validate([
            'type' => 'required|in:sales,purchase',
            'is_return' => 'nullable|boolean',
            'parent_invoice_id' => 'nullable|exists:invoices,id',
            'quotation_id' => 'nullable|exists:quotations,id',
            'date' => 'required|date',
            'due_date' => 'nullable|date|after_or_equal:date',
            'customer_id' => 'nullable|exists:customers,id',
            'vendor_id' => 'nullable|exists:vendors,id',
            'branch_id' => 'nullable|exists:branches,id',
            'warehouse_id' => 'nullable|exists:warehouses,id',
            'cost_center_id' => 'nullable|exists:cost_centers,id',
            'payment_method_id' => 'nullable|exists:payment_methods,id',
            'pricing_group_id' => 'nullable|exists:pricing_groups,id',
            'receipt_status' => 'nullable|in:received,pending,partial',
            'payment_timing' => 'nullable|in:paid,deferred',
            'reference_number' => 'nullable|string|max:100',
            'payment_terms' => 'nullable|string',
            'discount_amount' => 'nullable|numeric|min:0',
            'amount_paid' => 'nullable|numeric|min:0',
            'currency' => 'nullable|string|max:3',
            'exchange_rate' => 'nullable|numeric|min:0.00000001',
            'notes' => 'nullable|string',
            'sales_rep_id' => 'nullable|exists:sales_reps,id',
            'lines' => 'required|array|min:1',
            'lines.*.item_id' => 'nullable|exists:items,id',
            'lines.*.unit_id' => 'nullable|exists:item_units,id',
            'lines.*.account_id' => 'nullable|exists:accounts,id',
            'lines.*.description' => 'nullable|string',
            'lines.*.quantity' => 'required|numeric|min:0.0001',
            'lines.*.unit_price' => 'required|numeric|min:0',
            'lines.*.discount_percent' => 'nullable|numeric|min:0|max:100',
            'lines.*.discount_amount' => 'nullable|numeric|min:0',
            'lines.*.tax_percent' => 'nullable|numeric|min:0|max:100',
            'lines.*.serial_numbers' => 'nullable|array',
            'lines.*.serial_numbers.*' => 'string|max:120',
            'lines.*.item_variant_id' => 'nullable|integer|exists:item_variants,id',
            'lines.*.expiry_date' => 'nullable|date',
            'lines.*.batch_number' => 'nullable|string|max:120',
            'order_type' => ['nullable', 'in:dine_in,takeaway,delivery'],
            'table_id' => [
                'nullable',
                'integer',
                Rule::exists('restaurant_tables', 'id')->where(fn ($q) => $q->where('tenant_id', (int) $request->tenant_id)),
            ],
            'delivery_driver_id' => [
                'nullable',
                'integer',
                Rule::exists('delivery_drivers', 'id')->where(fn ($q) => $q->where('tenant_id', (int) $request->tenant_id)),
            ],
            'additional_expenses' => 'nullable|array',
            'additional_expenses.*.description' => 'nullable|string|max:255',
            'additional_expenses.*.expense_account_id' => 'nullable|exists:accounts,id',
            'additional_expenses.*.creditor_account_id' => 'nullable|exists:accounts,id',
            'additional_expenses.*.amount_net' => 'nullable|numeric|min:0',
            'additional_expenses.*.tax_amount' => 'nullable|numeric|min:0',
            'additional_expenses.*.total_amount' => 'nullable|numeric|min:0',
            'delivery_fees' => 'nullable|array',
            'delivery_fees.*.type' => 'nullable|string|max:64',
            'delivery_fees.*.label' => 'nullable|string|max:255',
            'delivery_fees.*.amount' => 'nullable|numeric|min:0',
            'delivery_fees.*.account_id' => 'nullable|exists:accounts,id',
            'partial_payment' => 'nullable|array',
            'partial_payment.amount' => 'nullable|numeric|min:0.001',
            'partial_payment.method_id' => [
                'nullable',
                'integer',
                Rule::exists('payment_methods', 'id')->where(fn ($q) => $q->where('tenant_id', (int) $request->tenant_id)),
            ],
            'partial_payment.date' => 'nullable|date',
            'payment_lines' => 'nullable|array',
            'payment_lines.*.method_id' => [
                'nullable',
                'integer',
                Rule::exists('payment_methods', 'id')->where(fn ($q) => $q->where('tenant_id', (int) $request->tenant_id)),
            ],
            'payment_lines.*.amount' => 'nullable|numeric|min:0.001',
            'payment_lines.*.date' => 'nullable|date',
            'sales_payment_tab' => 'nullable|string|in:cash,bank,deferred,installment,mixed',
            'redeem_points' => 'nullable|numeric|min:0',
            'loyalty_program_id' => 'nullable|integer|min:1',
        ]);

        // Sanitization: منع إدخال أكواد ضارة في الحقول النصية (يُتوقع نص بسيط).
        $validated['reference_number'] = $this->sanitizePlainText($validated['reference_number'] ?? null);
        $validated['payment_terms'] = $this->sanitizePlainText($validated['payment_terms'] ?? null);
        $validated['notes'] = $this->sanitizePlainText($validated['notes'] ?? null, 5000);
        foreach ($validated['lines'] as $i => $line) {
            if (array_key_exists('description', $line)) {
                $validated['lines'][$i]['description'] = $this->sanitizePlainText($line['description'], 2000);
            }
            if (isset($line['batch_number'])) {
                $validated['lines'][$i]['batch_number'] = $this->sanitizePlainText($line['batch_number'], 120);
            }
        }
        if (isset($validated['additional_expenses']) && is_array($validated['additional_expenses'])) {
            foreach ($validated['additional_expenses'] as $i => $row) {
                if (array_key_exists('description', $row)) {
                    $validated['additional_expenses'][$i]['description'] = $this->sanitizePlainText($row['description'], 255);
                }
            }
        }

        $tenantId = (int) $request->tenant_id;

        if (($validated['type'] ?? '') === 'sales' && empty($validated['is_return'])
            && ($validated['order_type'] ?? null) === 'delivery'
            && ! empty($validated['delivery_driver_id'])
            && empty($validated['customer_id'])) {
            throw ValidationException::withMessages([
                'customer_id' => [__('يجب اختيار عميل عند التوصيل مع تعيين سائق؛ المبلغ يُحصَّل عبر السائق ولا يُسجَّل في صندوق الوردية.')],
            ]);
        }

        $expiryDatesEnabled = (bool) $this->tenantSettings->get($tenantId, 'invoice_expiry_dates_enabled', true);
        if (! $expiryDatesEnabled) {
            foreach ($validated['lines'] as $i => $line) {
                $validated['lines'][$i]['expiry_date'] = null;
                $validated['lines'][$i]['batch_number'] = null;
            }
        }

        $useSerialInInvoices = (bool) $this->tenantSettings->get($tenantId, 'invoice_use_serial_numbers');

        if ($useSerialInInvoices) {
            foreach ($validated['lines'] as $idx => $line) {
                $itemId = (int) ($line['item_id'] ?? 0);
                if ($itemId <= 0) {
                    continue;
                }
                $item = Item::withoutGlobalScopes()->where('tenant_id', $tenantId)->find($itemId);
                if (! $item || ! $item->use_serial_number) {
                    continue;
                }
                $qty = (float) ($line['quantity'] ?? 0);
                $required = (int) round($qty);
                $serials = $line['serial_numbers'] ?? [];
                $serials = is_array($serials) ? array_values(array_filter(array_map('trim', $serials))) : [];
                if (count($serials) !== $required) {
                    throw ValidationException::withMessages([
                        "lines.{$idx}.serial_numbers" => [
                            "صنف «{$item->name}» يستخدم الرقم التسلسلي. يلزم إدخال {$required} رقم تسلسلي.",
                        ],
                    ]);
                }
                $duplicates = array_diff_assoc($serials, array_unique($serials));
                if (! empty($duplicates)) {
                    throw ValidationException::withMessages([
                        "lines.{$idx}.serial_numbers" => ['لا يمكن تكرار الرقم التسلسلي في نفس السطر.'],
                    ]);
                }
                $errors = $this->serialNumbersService->validateSerialsForInbound(
                    $tenantId,
                    [$line],
                    [$itemId => array_map(fn ($s) => ['serial_number' => $s], $serials)],
                    (int) ($request->warehouse_id ?? 0)
                );
                if (! empty($errors)) {
                    throw ValidationException::withMessages([
                        "lines.{$idx}.serial_numbers" => $errors,
                    ]);
                }
            }
        }

        $accountIds = array_unique(array_filter(array_map(function ($l) {
            $id = $l['account_id'] ?? null;

            return $id ? (int) $id : null;
        }, $validated['lines'])));
        if (! empty($accountIds)) {
            $inactive = Account::where('tenant_id', $request->tenant_id)->whereIn('id', $accountIds)->where('is_active', false)->exists();
            if ($inactive) {
                throw ValidationException::withMessages(['lines' => [__('لا يمكن استخدام حساب غير نشط في الفاتورة.')]]);
            }
        }

        $this->assertInvoiceLinesItemVariants((int) $tenantId, (string) $validated['type'], $validated['lines']);

        if (($validated['type'] ?? '') === 'sales' && empty($validated['is_return'])) {
            $this->assertSalesInvoiceLinesNotExpiredForInvoiceDate((string) $validated['date'], $validated['lines']);
        }

        return $validated;
    }

    private function sanitizePlainText(mixed $value, int $maxLen = 255): ?string
    {
        if ($value === null) {
            return null;
        }
        $s = trim((string) $value);
        if ($s === '') {
            return null;
        }
        $s = str_replace("\0", '', $s);
        $s = strip_tags($s);
        if ($maxLen > 0) {
            $s = mb_substr($s, 0, $maxLen);
        }

        return $s;
    }

    /**
     * @param  array<int, array<string, mixed>>  $lines
     */
    private function assertSalesInvoiceLinesNotExpiredForInvoiceDate(string $invoiceDate, array $lines): void
    {
        $ref = Carbon::parse($invoiceDate)->startOfDay();
        foreach ($lines as $idx => $line) {
            $raw = $line['expiry_date'] ?? null;
            if ($raw === null || $raw === '') {
                continue;
            }
            try {
                $exp = Carbon::parse((string) $raw)->startOfDay();
            } catch (\Throwable) {
                continue;
            }
            if ($exp->lt($ref)) {
                throw ValidationException::withMessages([
                    "lines.{$idx}.expiry_date" => ['لا يمكن بيع صنف بتاريخ صلاحية منتهٍ بالنسبة لتاريخ الفاتورة.'],
                ]);
            }
        }
    }

    /**
     * عند تفعيل المتغيرات في الإعدادات: إلزام اختيار متغير لكل صنف له متغيرات في سجل item_variants.
     *
     * @param  array<int, array<string, mixed>>  $lines
     */
    private function assertInvoiceLinesItemVariants(int $tenantId, string $type, array $lines): void
    {
        $salesEnabled = (bool) $this->tenantSettings->get($tenantId, 'invoice_variants_sales_enabled', true);
        $purchaseEnabled = (bool) $this->tenantSettings->get($tenantId, 'invoice_variants_purchases_enabled', true);
        $isPurchase = $type === 'purchase';

        foreach ($lines as $idx => $line) {
            $vid = isset($line['item_variant_id']) && $line['item_variant_id'] !== '' && $line['item_variant_id'] !== null
                ? (int) $line['item_variant_id']
                : 0;
            if ($vid <= 0) {
                continue;
            }
            if ($isPurchase && ! $purchaseEnabled) {
                throw ValidationException::withMessages([
                    "lines.{$idx}.item_variant_id" => ['المتغيرات معطّلة في إعدادات فواتير الشراء. عطّل الحقل أو فعّل الخيار من إعدادات المحاسبة → خيارات الأصناف.'],
                ]);
            }
            if (! $isPurchase && ! $salesEnabled) {
                throw ValidationException::withMessages([
                    "lines.{$idx}.item_variant_id" => ['المتغيرات معطّلة في إعدادات فواتير المبيعات. عطّل الحقل أو فعّل الخيار من إعدادات المحاسبة → خيارات الأصناف.'],
                ]);
            }
        }

        $requireVariant = ($isPurchase && $purchaseEnabled) || (! $isPurchase && $salesEnabled);
        if (! $requireVariant) {
            return;
        }

        foreach ($lines as $idx => $line) {
            $itemId = isset($line['item_id']) ? (int) $line['item_id'] : 0;
            if ($itemId <= 0) {
                continue;
            }
            $hasVariants = ItemVariant::where('tenant_id', $tenantId)->where('item_id', $itemId)->exists();
            if (! $hasVariants) {
                continue;
            }
            $vid = isset($line['item_variant_id']) && $line['item_variant_id'] !== '' && $line['item_variant_id'] !== null
                ? (int) $line['item_variant_id']
                : 0;
            if ($vid <= 0) {
                throw ValidationException::withMessages([
                    "lines.{$idx}.item_variant_id" => ['يجب اختيار المتغير لهذا الصنف.'],
                ]);
            }
            $ok = ItemVariant::where('tenant_id', $tenantId)->where('id', $vid)->where('item_id', $itemId)->exists();
            if (! $ok) {
                throw ValidationException::withMessages([
                    "lines.{$idx}.item_variant_id" => ['المتغير لا يتبع هذا الصنف.'],
                ]);
            }
        }
    }

    // ──── Invoice Attachments ────
    public function uploadAttachment(Request $request, int $id): JsonResponse
    {
        $invoice = Invoice::where('tenant_id', $request->tenant_id)->findOrFail($id);

        $request->validate([
            'attachment' => 'required|file|mimes:jpeg,png,gif,webp,pdf|max:5120',
        ]);

        if ($invoice->attachment) {
            Storage::disk('public')->delete($invoice->attachment);
        }

        $path = $request->file('attachment')->store('invoice-attachments/'.$request->tenant_id, 'public');
        $invoice->update(['attachment' => $path]);

        return response()->json($invoice->fresh());
    }

    /**
     * منع تكرار كسب/استرداد النقاط لنفس الفاتورة ونفس البرنامج (مثلاً عند إعادة الحفظ أو الترحيل).
     */
    private function loyaltyEarnAlreadyRecorded(int $tenantId, int $invoiceId, int $programId): bool
    {
        $net = (float) LoyaltyPoint::query()
            ->where('tenant_id', $tenantId)
            ->where('loyalty_program_id', $programId)
            ->where('source_type', Invoice::class)
            ->where('source_id', $invoiceId)
            ->where(function ($q) {
                $q->where('type', 'earned')
                    ->orWhere(function ($q2) {
                        $q2->where('type', 'reversed')->where('points', '<', 0);
                    });
            })
            ->sum('points');

        return $net > 0.0005;
    }

    private function loyaltyRedeemAlreadyRecorded(int $tenantId, int $invoiceId, int $programId): bool
    {
        $net = (float) LoyaltyPoint::query()
            ->where('tenant_id', $tenantId)
            ->where('loyalty_program_id', $programId)
            ->where('source_type', Invoice::class)
            ->where('source_id', $invoiceId)
            ->where(function ($q) {
                $q->where('type', 'redeemed')
                    ->orWhere(function ($q2) {
                        $q2->where('type', 'reversed')->where('points', '>', 0);
                    });
            })
            ->sum('points');

        return $net < -0.0005;
    }

    /**
     * لتمثيل استرداد النقاط الحالي في نموذج التعديل (مجموع مسترد + معكوس).
     */
    private function attachInvoiceLoyaltyRedemptionSnapshot(Invoice $invoice): void
    {
        $tenantId = (int) $invoice->tenant_id;
        $invoiceId = (int) $invoice->id;

        $netRedeem = (float) LoyaltyPoint::query()
            ->where('tenant_id', $tenantId)
            ->where('source_type', Invoice::class)
            ->where('source_id', $invoiceId)
            ->whereIn('type', ['redeemed', 'reversed'])
            ->sum('points');

        if ($netRedeem >= -0.0005) {
            $invoice->setAttribute('loyalty_redeem_points', 0.0);
            $invoice->setAttribute('loyalty_redeem_value', 0.0);
            $invoice->setAttribute('loyalty_program_id', null);

            return;
        }

        $redeemPts = round(abs($netRedeem), 3);
        $lastRedeem = LoyaltyPoint::query()
            ->where('tenant_id', $tenantId)
            ->where('source_type', Invoice::class)
            ->where('source_id', $invoiceId)
            ->where('type', 'redeemed')
            ->orderByDesc('id')
            ->first();

        $invoice->setAttribute('loyalty_redeem_points', $redeemPts);
        $invoice->setAttribute('loyalty_redeem_value', $lastRedeem ? (float) $lastRedeem->redeem_value : 0.0);
        $invoice->setAttribute('loyalty_program_id', $lastRedeem ? (int) $lastRedeem->loyalty_program_id : null);
    }

    /**
     * استرداد النقاط (إن وُجدت في الطلب) ثم منح النقاط لكل برنامج ولاء مؤهل على فواتير المبيعات.
     */
    private function processSalesInvoiceLoyalty(Request $request, Invoice $invoice): void
    {
        if ($invoice->type !== 'sales' || $invoice->is_return || ! $invoice->customer_id) {
            return;
        }

        $tenantId = (int) $request->tenant_id;
        $loyalty = app(LoyaltyService::class);

        $selectedProgramId = $request->filled('loyalty_program_id') ? (int) $request->input('loyalty_program_id') : null;
        $program = $loyalty->getProgram($tenantId, $selectedProgramId);
        if ($program?->is_active && $program->apply_on_invoices) {
            $redeemPoints = (float) ($request->input('redeem_points') ?? 0);
            if ($redeemPoints > 0.0005 && ! $this->loyaltyRedeemAlreadyRecorded($tenantId, (int) $invoice->id, (int) $program->id)) {
                try {
                    $loyalty->redeemPoints(
                        tenantId: $tenantId,
                        customerId: (int) $invoice->customer_id,
                        pointsToRedeem: $redeemPoints,
                        sourceType: Invoice::class,
                        sourceId: (int) $invoice->id,
                        reference: (string) ($invoice->number ?? $invoice->id),
                        createdBy: (int) $request->user()->id,
                        programId: (int) $program->id,
                    );
                } catch (\Throwable $e) {
                    report($e);
                }
            }
        }

        $programs = $loyalty->getEligiblePrograms($tenantId, (int) $invoice->customer_id, 'invoices');
        foreach ($programs as $p) {
            if ($this->loyaltyEarnAlreadyRecorded($tenantId, (int) $invoice->id, (int) $p->id)) {
                continue;
            }
            $loyalty->awardPoints(
                tenantId: $tenantId,
                customerId: (int) $invoice->customer_id,
                amount: (float) ($invoice->total ?? 0),
                sourceType: Invoice::class,
                sourceId: (int) $invoice->id,
                reference: (string) ($invoice->number ?? $invoice->id),
                createdBy: (int) $request->user()->id,
                programId: (int) $p->id,
            );
        }
    }
}
