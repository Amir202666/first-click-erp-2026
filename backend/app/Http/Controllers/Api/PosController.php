<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Middleware\CheckPermission;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Item;
use App\Models\Payment;
use App\Models\PaymentMethod;
use App\Models\PosExpenseCategory;
use App\Models\PosExpenseItem;
use App\Models\PosHeldCart;
use App\Models\PosSession;
use App\Models\PosShift;
use App\Models\Tenant;
use App\Services\DeliveryService;
use App\Services\InventoryService;
use App\Services\InvoiceService;
use App\Services\LoyaltyService;
use App\Services\PaymentService;
use App\Services\TenantSettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class PosController extends Controller
{
    public function __construct(
        private InvoiceService $invoiceService,
        private InventoryService $inventoryService,
        private PaymentService $paymentService,
        private TenantSettingsService $tenantSettings,
    ) {}

    /** بحث أصناف للـ POS: بالاسم، الكود، الباركود، أو الفئة */
    public function items(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $search = trim((string) $request->q);
        $categoryId = $request->has('category_id') ? (int) $request->category_id : null;
        $posKind = strtolower(trim((string) ($request->pos_kind ?? 'pos'))); // pos | restaurant
        $limit = min((int) ($request->per_page ?? 50), 100);

        $query = Item::where('tenant_id', $tenantId)->where('is_active', true);

        // تصفية الظهور حسب إعداد الفئة (يؤثر على كل الأصناف التابعة)
        $flagCol = $posKind === 'restaurant' ? 'show_in_restaurant_pos' : 'show_in_pos';
        $query->where(function ($q) use ($flagCol) {
            $q->whereNull('category_id')
                ->orWhereHas('category', fn ($qc) => $qc->where($flagCol, true));
        });

        if ($categoryId > 0) {
            $query->where('category_id', $categoryId);
        }

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', '%'.$search.'%')
                    ->orWhere('code', 'like', '%'.$search.'%')
                    ->orWhere('barcode', $search)
                    ->orWhere('sku', 'like', '%'.$search.'%')
                    ->orWhereHas('unitOptions', fn ($q2) => $q2->where('barcode', $search));
            });
        }

        $items = $query->with('itemUnit', 'unitOptions.unit', 'category:id,name,name_en')
            ->orderBy('name')
            ->limit($limit)
            ->get(['id', 'tenant_id', 'category_id', 'code', 'name', 'name_en', 'barcode', 'sku', 'unit', 'unit_id', 'selling_price', 'type', 'track_quantity', 'min_quantity', 'image']);

        $itemIds = $items->pluck('id')->map(fn ($id) => (int) $id)->all();
        $salesByItem = [];
        $promoSet = [];
        if ($itemIds !== []) {
            $salesStats = DB::table('invoice_lines')
                ->join('invoices', 'invoice_lines.invoice_id', '=', 'invoices.id')
                ->where('invoices.tenant_id', $tenantId)
                ->where('invoices.type', 'sales')
                ->where('invoices.is_return', false)
                ->where('invoices.document_status', 'posted')
                ->whereIn('invoice_lines.item_id', $itemIds)
                ->groupBy('invoice_lines.item_id')
                ->selectRaw('invoice_lines.item_id as item_id, SUM(invoice_lines.quantity) as sales_count')
                ->get();
            foreach ($salesStats as $row) {
                $salesByItem[(int) $row->item_id] = (float) $row->sales_count;
            }

            $promoIds = DB::table('invoice_lines')
                ->join('invoices', 'invoice_lines.invoice_id', '=', 'invoices.id')
                ->where('invoices.tenant_id', $tenantId)
                ->where('invoices.type', 'sales')
                ->where('invoices.is_return', false)
                ->where('invoices.document_status', 'posted')
                ->whereIn('invoice_lines.item_id', $itemIds)
                ->where('invoice_lines.discount_percent', '>', 0)
                ->distinct()
                ->pluck('invoice_lines.item_id')
                ->map(fn ($id) => (int) $id)
                ->all();
            $promoSet = array_fill_keys($promoIds, true);
        }

        $items->each(function ($item) use ($salesByItem, $promoSet) {
            $item->setAttribute('current_stock', $this->inventoryService->getItemStock($item->id));
            $item->setAttribute('sales_count', (float) ($salesByItem[(int) $item->id] ?? 0));
            $item->setAttribute('is_promo', isset($promoSet[(int) $item->id]));
            $cat = $item->category;
            if ($cat) {
                $item->setAttribute('category_name', $cat->name);
            }
        });

        return response()->json(['data' => $items]);
    }

    /** الوردية المفتوحة الحالية للفرع */
    public function shift(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $branchId = $this->resolveBranchForUser($request, $tenantId, (int) $request->branch_id);
        $request->merge(['branch_id' => $branchId]);
        if (! $branchId) {
            return response()->json(['message' => 'يجب تحديد الفرع'], 422);
        }

        $shift = PosShift::where('tenant_id', $tenantId)
            ->where('branch_id', $branchId)
            ->where('status', 'open')
            ->with('user:id,name', 'branch:id,name,code')
            ->first();

        $suggestedOpeningCash = null;
        if (! $shift) {
            $lastClosed = PosShift::where('tenant_id', $tenantId)
                ->where('branch_id', $branchId)
                ->where('status', 'closed')
                ->orderByDesc('closed_at')
                ->first();
            if ($lastClosed) {
                $suggestedOpeningCash = (float) $lastClosed->closing_cash;
            }
        }

        return response()->json([
            'shift' => $shift,
            'suggested_opening_cash' => $suggestedOpeningCash,
        ]);
    }

    /** فتح وردية جديدة: اقتراح الرصيد الافتتاحي من آخر وردية مغلقة، وقيد عهد نقدية عند وجود رصيد */
    public function openShift(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $branchId = $this->resolveBranchForUser($request, $tenantId, (int) $request->branch_id);
        $request->merge(['branch_id' => $branchId]);
        $userId = $request->user()->id;

        $request->validate([
            'branch_id' => 'required|exists:branches,id',
            'opening_cash' => 'nullable|numeric|min:0',
        ]);

        $exists = PosShift::where('tenant_id', $tenantId)
            ->where('branch_id', $branchId)
            ->where('status', 'open')
            ->exists();
        if ($exists) {
            return response()->json(['message' => 'يوجد وردية مفتوحة بالفعل لهذا الفرع'], 422);
        }

        $openingCash = $request->has('opening_cash') ? (float) $request->opening_cash : null;
        if ($openingCash === null) {
            $lastClosed = PosShift::where('tenant_id', $tenantId)
                ->where('branch_id', $branchId)
                ->where('status', 'closed')
                ->orderByDesc('closed_at')
                ->first();
            $openingCash = $lastClosed ? (float) $lastClosed->closing_cash : 0;
        }

        $shift = null;
        try {
            $shift = DB::transaction(function () use ($tenantId, $branchId, $userId, $openingCash) {
                $shift = PosShift::create([
                    'tenant_id' => $tenantId,
                    'branch_id' => $branchId,
                    'user_id' => $userId,
                    'opened_at' => now(),
                    'opening_cash' => $openingCash,
                    'status' => 'open',
                ]);
                PosSession::create([
                    'tenant_id' => $tenantId,
                    'branch_id' => $branchId,
                    'shift_id' => $shift->id,
                    'user_id' => $userId,
                    'started_at' => now(),
                ]);

                if ($openingCash >= 0.01) {
                    $this->postShiftOpeningCustodyJournal($tenantId, $branchId, $shift->id, $openingCash);
                }

                return $shift->load('user:id,name', 'branch:id,name,code');
            });
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'message' => 'فشل فتح الوردية: '.($e->getMessage() ?: 'خطأ غير معروف'),
            ], 500);
        }

        return response()->json(['message' => 'تم فتح الوردية', 'shift' => $shift], 201);
    }

    /** قيد عهد نقدية عند فتح الوردية (نظام العهدة المستديمة): من حـ/ الصندوق الرئيسي ← إلى حـ/ عهدة الكاشير */
    private function postShiftOpeningCustodyJournal(int $tenantId, int $branchId, int $shiftId, float $openingCash): void
    {
        $defaults = \App\Models\TenantAccountDefault::where('tenant_id', $tenantId)->first();
        $cashAccountId = $defaults?->cash_account_id ?? \App\Models\Account::where('tenant_id', $tenantId)->where('type', 'asset')->where('code', '111')->value('id');
        $custodyAccountId = $defaults?->pos_cash_custody_account_id ?? null;
        if (! $cashAccountId || ! $custodyAccountId || $openingCash < 0.01) {
            return;
        }

        $desc = 'فتح وردية #'.$shiftId.' - عهد نقدية';
        $lines = [
            ['account_id' => $custodyAccountId, 'debit' => $openingCash, 'credit' => 0, 'description' => $desc, 'cost_center_id' => null],
            ['account_id' => $cashAccountId, 'debit' => 0, 'credit' => $openingCash, 'description' => $desc, 'cost_center_id' => null],
        ];

        $entryData = [
            'tenant_id' => $tenantId,
            'date' => now()->toDateString(),
            'type' => 'adjustment',
            'description' => 'قيد فتح وردية نقطة بيع #'.$shiftId.' - عهد نقدية',
            'reference_type' => PosShift::class,
            'reference_id' => $shiftId,
            'status' => 'posted',
            'created_by' => auth()->id(),
            'posted_at' => now(),
            'branch_id' => $branchId,
        ];
        app(\App\Services\AccountingService::class)->createJournalEntry($entryData, $lines);
    }

    /** إتمام بيع من نقطة البيع: إنشاء فاتورة مبيعات وترحيلها */
    public function sale(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $userId = $request->user()->id;

        $validated = $request->validate([
            'branch_id' => 'required|exists:branches,id',
            'warehouse_id' => 'nullable|exists:warehouses,id',
            'shift_id' => 'nullable|exists:pos_shifts,id',
            'customer_id' => 'nullable|exists:customers,id',
            'discount_amount' => 'nullable|numeric|min:0',
            'redeem_points' => 'nullable|numeric|min:0',
            'loyalty_discount' => 'nullable|numeric|min:0',
            'loyalty_program_id' => 'nullable|integer|min:1',
            'payment_method_id' => 'nullable|exists:payment_methods,id',
            'payment_amount' => 'nullable|numeric|min:0',
            'payment_lines' => ['sometimes', 'array', 'min:1'],
            'payment_lines.*.payment_method_id' => [
                'required',
                'integer',
                Rule::exists('payment_methods', 'id')->where(fn ($q) => $q->where('tenant_id', $tenantId)),
            ],
            'payment_lines.*.amount' => ['required', 'numeric', 'min:0.001'],
            'order_type' => ['nullable', 'in:takeaway,delivery'],
            'delivery_driver_id' => [
                'nullable',
                'integer',
                Rule::exists('delivery_drivers', 'id')->where(fn ($q) => $q->where('tenant_id', $tenantId)),
            ],
            'lines' => 'required|array|min:1',
            'lines.*.item_id' => 'required|exists:items,id',
            'lines.*.quantity' => 'required|numeric|min:0.0001',
            'lines.*.unit_price' => 'required|numeric|min:0',
            'lines.*.discount_percent' => 'nullable|numeric|min:0|max:100',
            'lines.*.tax_percent' => 'nullable|numeric|min:0|max:100',
            'lines.*.description' => 'nullable|string|max:500',
            'promotion_id' => 'nullable|integer|exists:promotions,id',
        ]);

        $tenant = Tenant::findOrFail($tenantId);
        $defaultVat = $this->tenantSettings->get($tenantId, 'default_vat_rate');
        $vatRate = $defaultVat !== null && $defaultVat !== '' ? (float) $defaultVat : (float) ($tenant->vat_rate ?? 15);

        $lines = [];
        $canEditPrice = CheckPermission::userHasPermission($request, 'pos.edit_price');
        foreach ($validated['lines'] as $i => $row) {
            $item = Item::where('tenant_id', $tenantId)->findOrFail($row['item_id']);
            $defaultPrice = (float) ($item->selling_price ?? 0);
            $requestedPrice = (float) $row['unit_price'];
            if (! $canEditPrice && bccomp((string) $requestedPrice, (string) $defaultPrice, 4) !== 0) {
                return response()->json([
                    'message' => 'ليس لديك صلاحية لتعديل سعر الصنف. استخدم السعر الافتراضي أو اتصل بالمدير.',
                ], 403);
            }
            $lineDesc = isset($row['description']) ? trim((string) $row['description']) : '';
            $desc = $lineDesc !== '' ? $lineDesc : (string) ($item->name ?? '');
            $lines[] = [
                'item_id' => $item->id,
                'unit_id' => $item->unit_id,
                'quantity' => $row['quantity'],
                'unit_price' => $row['unit_price'],
                'discount_percent' => $row['discount_percent'] ?? 0,
                'tax_percent' => $row['tax_percent'] ?? $vatRate,
                'description' => $desc,
            ];
        }

        $normalizedPaymentLines = null;
        if (! empty($validated['payment_lines']) && is_array($validated['payment_lines'])) {
            $normalizedPaymentLines = [];
            foreach ($validated['payment_lines'] as $pl) {
                $normalizedPaymentLines[] = [
                    'payment_method_id' => (int) $pl['payment_method_id'],
                    'amount' => round((float) $pl['amount'], 3),
                ];
            }
            $paymentAmount = round(array_sum(array_column($normalizedPaymentLines, 'amount')), 3);
            $validated['payment_method_id'] = $normalizedPaymentLines[0]['payment_method_id'];
            $validated['payment_amount'] = $paymentAmount;
        } else {
            $paymentAmount = (float) ($validated['payment_amount'] ?? 0);
        }

        $posDeliveryDriverId = $request->filled('delivery_driver_id') ? (int) $validated['delivery_driver_id'] : null;
        $deferToDriverCustody = ($validated['order_type'] ?? null) === 'delivery' && $posDeliveryDriverId > 0;
        $isCredit = $paymentAmount <= 0 || $deferToDriverCustody;

        if ($isCredit && ! $deferToDriverCustody) {
            if (empty($validated['customer_id'])) {
                return response()->json(['message' => 'يرجى اختيار عميل أولاً عند البيع الآجل.'], 422);
            }
        }

        $customerId = $validated['customer_id'] ?? null;
        if (empty($customerId)) {
            $useDefault = $this->tenantSettings->get($tenantId, 'pos_use_default_customer');
            $defaultId = $this->tenantSettings->get($tenantId, 'pos_default_customer_id');
            if ($useDefault && $defaultId !== null && $defaultId !== '') {
                $defaultCustomer = Customer::where('tenant_id', $tenantId)->find((int) $defaultId);
                if ($defaultCustomer) {
                    $customerId = $defaultCustomer->id;
                }
            }
        }

        if ($deferToDriverCustody && empty($customerId)) {
            return response()->json([
                'message' => 'يجب اختيار عميل عند التوصيل مع تعيين سائق؛ المبلغ يُحصَّل عبر السائق ولا يُسجَّل في صندوق الوردية.',
            ], 422);
        }

        $redeemPts = (float) ($validated['redeem_points'] ?? 0);
        if ($redeemPts > 0.0005) {
            $loyProgId = isset($validated['loyalty_program_id']) ? (int) $validated['loyalty_program_id'] : null;
            if (! $loyProgId || empty($customerId)) {
                return response()->json(['message' => 'استرداد النقاط يتطلب عميلاً وبرنامج ولاء.'], 422);
            }
            $lpRow = \App\Models\LoyaltyProgram::where('tenant_id', $tenantId)->where('id', $loyProgId)->first();
            if (! $lpRow || ! $lpRow->is_active || ! $lpRow->apply_on_pos) {
                return response()->json(['message' => 'برنامج الولاء غير صالح لنقطة البيع.'], 422);
            }
            $expectedLoyaltyDiscount = round($redeemPts * (float) $lpRow->point_value, 3);
            $sentLoyaltyDiscount = isset($validated['loyalty_discount']) ? round((float) $validated['loyalty_discount'], 3) : null;
            if ($sentLoyaltyDiscount === null || abs($sentLoyaltyDiscount - $expectedLoyaltyDiscount) > 0.021) {
                return response()->json(['message' => 'قيمة خصم الولاء لا تطابق النقاط المستردة.'], 422);
            }
        }

        $subtotal = \App\Services\PromotionService::rawSubtotalFromLines($lines);
        $appliedPromo = null;
        $promoDiscount = 0.0;
        try {
            $posChannel = ($validated['order_type'] ?? null) === 'delivery' ? 'delivery' : 'pos';
            $resolved = app(\App\Services\PromotionService::class)->resolvePromotion(
                $tenantId,
                $posChannel,
                $subtotal,
                $request->filled('promotion_id') ? (int) $validated['promotion_id'] : null,
                $customerId ? (int) $customerId : null,
                $lines,
            );
            $appliedPromo = $resolved['promotion'];
            $promoDiscount = $resolved['promotion_discount'];
        } catch (\Throwable $e) {
            \Log::warning('POS promo error: '.$e->getMessage());
        }

        $headerDiscount = round((float) ($validated['discount_amount'] ?? 0) + $promoDiscount, 3);

        $invoiceData = [
            'tenant_id' => $tenantId,
            'type' => 'sales',
            'is_return' => false,
            'date' => now()->format('Y-m-d'),
            'customer_id' => $customerId,
            'branch_id' => $validated['branch_id'],
            'warehouse_id' => $validated['warehouse_id'] ?? null,
            'pos_shift_id' => $validated['shift_id'] ?? null,
            'pos_session_id' => null,
            'promotion_id' => $appliedPromo?->id,
            'promotion_discount' => $promoDiscount,
            'discount_amount' => $headerDiscount,
            'payment_timing' => $isCredit ? 'deferred' : 'paid',
            'amount_paid' => $isCredit ? 0 : $paymentAmount,
            'created_by' => $userId,
            'order_type' => $validated['order_type'] ?? null,
            'delivery_driver_id' => $posDeliveryDriverId > 0 ? $posDeliveryDriverId : null,
        ];

        if (! empty($validated['shift_id'])) {
            $session = PosSession::where('tenant_id', $tenantId)
                ->where('shift_id', $validated['shift_id'])
                ->whereNull('ended_at')
                ->first();
            if ($session) {
                $invoiceData['pos_session_id'] = $session->id;
            }
        }

        if ($deferToDriverCustody) {
            $invoiceData['payment_method_id'] = null;
        } elseif (! $isCredit && $paymentAmount > 0 && ! empty($validated['payment_method_id'])) {
            $invoiceData['payment_method_id'] = $validated['payment_method_id'];
        }

        try {
            $invoice = DB::transaction(function () use (
                $invoiceData,
                $lines,
                $deferToDriverCustody,
                $isCredit,
                $paymentAmount,
                $validated,
                $tenantId,
                $posDeliveryDriverId,
                $userId,
                $normalizedPaymentLines,
                $appliedPromo,
                $promoDiscount,
                $subtotal
            ) {
                $invoice = $this->invoiceService->createInvoice($invoiceData, $lines);

                if ($appliedPromo && $promoDiscount > 0) {
                    $posChannel = ($validated['order_type'] ?? null) === 'delivery' ? 'delivery' : 'pos';
                    app(\App\Services\PromotionService::class)->applyPromotion(
                        $appliedPromo,
                        $posChannel,
                        \App\Models\Invoice::class,
                        (int) $invoice->id,
                        $subtotal,
                        $promoDiscount,
                        $invoice->customer_id ? (int) $invoice->customer_id : null,
                        $userId,
                    );
                }

                if (! $deferToDriverCustody && ! $isCredit && $paymentAmount > 0) {
                    $invoice->update([
                        'amount_paid' => $paymentAmount,
                        'balance' => $invoice->total - $paymentAmount,
                        'payment_method_id' => ! empty($validated['payment_method_id']) ? $validated['payment_method_id'] : $invoice->payment_method_id,
                    ]);
                    if ($normalizedPaymentLines !== null && $normalizedPaymentLines !== []) {
                        foreach ($normalizedPaymentLines as $line) {
                            \App\Models\InvoicePayment::create([
                                'tenant_id' => $tenantId,
                                'invoice_id' => $invoice->id,
                                'payment_method_id' => $line['payment_method_id'],
                                'amount' => $line['amount'],
                            ]);
                        }
                    } elseif (! empty($validated['payment_method_id'])) {
                        \App\Models\InvoicePayment::create([
                            'tenant_id' => $tenantId,
                            'invoice_id' => $invoice->id,
                            'payment_method_id' => $validated['payment_method_id'],
                            'amount' => $paymentAmount,
                        ]);
                    }
                }

                $invoice = $this->invoiceService->postInvoice($invoice->fresh(['lines.item', 'customer', 'branch']));
                \App\Services\InvoiceStatusResolver::applyToModel($invoice->fresh());
                $invoice->update(['printed_at' => now()]);
                app(DeliveryService::class)->applyDispatchAfterPostedSalesInvoice(
                    $invoice->fresh(['customer']),
                    $posDeliveryDriverId,
                    $userId
                );

                // Loyalty: redeem then award (optional, silently skip if inactive)
                try {
                    $selectedProgramId = isset($validated['loyalty_program_id']) ? (int) $validated['loyalty_program_id'] : null;
                    $program = app(LoyaltyService::class)->getProgram($tenantId, $selectedProgramId);
                    if ($program?->is_active && $program->apply_on_pos && $invoice->customer_id) {
                        $redeemPoints = (float) ($validated['redeem_points'] ?? 0);
                        if ($redeemPoints > 0.0005) {
                            app(LoyaltyService::class)->redeemPoints(
                                tenantId: $tenantId,
                                customerId: (int) $invoice->customer_id,
                                pointsToRedeem: $redeemPoints,
                                sourceType: \App\Models\Invoice::class,
                                sourceId: (int) $invoice->id,
                                reference: (string) ($invoice->number ?? $invoice->id),
                                createdBy: $userId,
                                programId: (int) $program->id
                            );
                        }
                    }

                    if ($invoice->customer_id) {
                        $programs = app(LoyaltyService::class)->getEligiblePrograms($tenantId, (int) $invoice->customer_id, 'pos');
                        foreach ($programs as $p) {
                            app(LoyaltyService::class)->awardPoints(
                                tenantId: $tenantId,
                                customerId: (int) $invoice->customer_id,
                                amount: (float) ($invoice->total ?? 0),
                                sourceType: \App\Models\Invoice::class,
                                sourceId: (int) $invoice->id,
                                reference: (string) ($invoice->number ?? $invoice->id),
                                createdBy: $userId,
                                programId: (int) $p->id
                            );
                        }
                    }
                } catch (\Throwable $e) {
                    report($e);
                }

                return $invoice;
            });
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'message' => $e->getMessage() ?: 'فشل إتمام البيع؛ لم تُحفظ الفاتورة ولم يُخصم المخزون.',
            ], 422);
        }

        return response()->json([
            'message' => 'تم إتمام البيع',
            'invoice' => $invoice->fresh(['lines.item', 'customer', 'branch', 'journalEntry']),
        ], 201);
    }

    /**
     * مرتجع من نقطة البيع: إنشاء فاتورة مرتجع مبيعات مرتبطة بفاتورة أصلية.
     * الوضع الحالي يدعم المرتجع برقم الفاتورة (by_invoice). يمكن توسيعه لاحقاً للمرتجع الحر.
     */
    public function return(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $userId = $request->user()->id;

        $validated = $request->validate([
            'mode' => ['required', Rule::in(['by_invoice'])],
            'invoice_id' => 'required|integer|exists:invoices,id',
            'branch_id' => 'required|exists:branches,id',
            'warehouse_id' => 'nullable|exists:warehouses,id',
            'shift_id' => 'nullable|exists:pos_shifts,id',
            'lines' => 'required|array|min:1',
            'lines.*.invoice_line_id' => 'required|integer',
            'lines.*.quantity' => 'required|numeric|min:0.0001',
        ]);

        /** @var \App\Models\Invoice $invoice */
        $invoice = Invoice::where('tenant_id', $tenantId)
            ->with('lines')
            ->findOrFail($validated['invoice_id']);

        if ($invoice->type !== 'sales' || $invoice->status === 'draft' || $invoice->status === 'cancelled' || $invoice->is_return) {
            return response()->json(['message' => 'لا يمكن إنشاء مرتجع من هذه الفاتورة.'], 422);
        }

        $originalLines = $invoice->lines;
        $returnLines = [];

        foreach ($validated['lines'] as $row) {
            $orig = $originalLines->firstWhere('id', $row['invoice_line_id']);
            if (! $orig) {
                return response()->json(['message' => 'سطر فاتورة غير صالح للمرتجع.'], 422);
            }
            $qty = (float) $row['quantity'];
            if ($qty <= 0 || $qty > (float) $orig->quantity) {
                return response()->json(['message' => 'كمية المرتجع غير صحيحة لأحد الأصناف.'], 422);
            }

            $returnLines[] = [
                'item_id' => $orig->item_id,
                'unit_id' => $orig->unit_id,
                'account_id' => $orig->account_id,
                'description' => $orig->description ?? $orig->item->name ?? '',
                'quantity' => $qty,
                'unit_price' => (float) $orig->unit_price,
                'discount_percent' => (float) ($orig->discount_percent ?? 0),
                'tax_percent' => (float) ($orig->tax_percent ?? 0),
            ];
        }

        if (empty($returnLines)) {
            return response()->json(['message' => 'لم يتم تحديد أي كميات مرتجعة.'], 422);
        }

        $invoiceData = [
            'tenant_id' => $tenantId,
            'type' => 'sales',
            'is_return' => true,
            'parent_invoice_id' => $invoice->id,
            'date' => now()->format('Y-m-d'),
            'customer_id' => $invoice->customer_id,
            'branch_id' => $validated['branch_id'],
            'warehouse_id' => $validated['warehouse_id'] ?? $invoice->warehouse_id,
            'pos_shift_id' => $validated['shift_id'] ?? null,
            'pos_session_id' => null,
            'discount_amount' => 0,
            'payment_timing' => 'paid',
            'amount_paid' => 0,
            'created_by' => $userId,
        ];

        if (! empty($validated['shift_id'])) {
            $session = PosSession::where('tenant_id', $tenantId)
                ->where('shift_id', $validated['shift_id'])
                ->whereNull('ended_at')
                ->first();
            if ($session) {
                $invoiceData['pos_session_id'] = $session->id;
            }
        }

        try {
            $returnInvoice = DB::transaction(function () use ($invoiceData, $returnLines) {
                $inv = $this->invoiceService->createInvoice($invoiceData, $returnLines);

                return $this->invoiceService->postInvoice($inv->fresh(['lines.item', 'customer', 'branch']));
            });
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'message' => $e->getMessage() ?: 'فشل إنشاء فاتورة المرتجع؛ لم تُحفظ الفاتورة ولم يُحدَّث المخزون.',
            ], 422);
        }

        return response()->json([
            'message' => 'تم إنشاء فاتورة مرتجع من نقطة البيع',
            'invoice' => $returnInvoice->fresh(['lines.item', 'customer', 'branch', 'journalEntry']),
        ], 201);
    }

    /** تعليق السلة (Hold) */
    public function hold(Request $request): JsonResponse
    {
        $request->validate([
            'branch_id' => 'required|exists:branches,id',
            'payload' => 'required|array',
        ]);

        $cart = PosHeldCart::create([
            'tenant_id' => $request->tenant_id,
            'branch_id' => $request->branch_id,
            'user_id' => $request->user()->id,
            'payload' => $request->payload,
        ]);

        return response()->json(['message' => 'تم تعليق السلة', 'id' => $cart->id], 201);
    }

    /** قائمة السلات المعلقة */
    public function heldList(Request $request): JsonResponse
    {
        $list = PosHeldCart::where('tenant_id', $request->tenant_id)
            ->where('branch_id', $request->branch_id)
            ->whereNull('resumed_at')
            ->with('user:id,name')
            ->orderByDesc('created_at')
            ->limit(50)
            ->get(['id', 'user_id', 'payload', 'created_at']);

        return response()->json(['data' => $list]);
    }

    /** استئناف سلة معلقة */
    public function resumeHeld(Request $request, int $id): JsonResponse
    {
        $cart = PosHeldCart::where('tenant_id', $request->tenant_id)
            ->where('branch_id', $request->branch_id)
            ->whereNull('resumed_at')
            ->findOrFail($id);

        $cart->update(['resumed_at' => now()]);

        return response()->json(['message' => 'تم استئناف السلة', 'payload' => $cart->payload]);
    }

    /** تقرير X (لحظة الحالية للوردية المفتوحة) */
    public function xReport(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $branchId = (int) $request->branch_id;
        if (! $branchId) {
            return response()->json(['message' => 'يجب تحديد الفرع'], 422);
        }

        $shift = PosShift::where('tenant_id', $tenantId)
            ->where('branch_id', $branchId)
            ->where('status', 'open')
            ->with('branch:id,name,code')
            ->first();

        if (! $shift) {
            return response()->json(['message' => 'لا توجد وردية مفتوحة', 'report' => null], 200);
        }

        $invoices = Invoice::where('tenant_id', $tenantId)
            ->where('pos_shift_id', $shift->id)
            ->where('type', 'sales')
            ->where(function ($q) {
                $q->whereNull('is_return')->orWhere('is_return', false);
            })
            ->get(['id', 'number', 'total', 'amount_paid', 'tax_amount']);

        $invoicesCount = $invoices->count();
        $totalSales = (float) $invoices->sum('total');
        $totalTax = (float) $invoices->sum('tax_amount');
        $invoiceIds = $invoices->pluck('id');
        $itemsSoldCount = (int) \App\Models\InvoiceLine::whereIn('invoice_id', $invoiceIds)->sum('quantity');
        $returnsInShift = Invoice::where('tenant_id', $tenantId)->where('is_return', true)->whereIn('parent_invoice_id', $invoiceIds)->get(['id', 'total']);
        $totalReturns = (float) $returnsInShift->sum('total');
        $returnsCount = $returnsInShift->count();

        $paymentSummary = \App\Models\InvoicePayment::whereIn('invoice_id', $invoices->pluck('id'))
            ->with('paymentMethod:id,name,name_en,type')
            ->get()
            ->groupBy('payment_method_id')
            ->map(function ($rows, $methodId) {
                $first = $rows->first();
                $method = $first?->paymentMethod;

                return [
                    'payment_method_id' => (int) $methodId,
                    'name' => $method?->name ?? '',
                    'type' => $method?->type ?? 'other',
                    'amount' => (float) $rows->sum('amount'),
                    'count' => $rows->count(),
                ];
            })
            ->values()
            ->toArray();

        $cashReceived = collect($paymentSummary)->where('type', 'cash')->sum('amount');
        $totalExpenses = (float) Payment::where('tenant_id', $tenantId)
            ->where('pos_shift_id', $shift->id)
            ->where('type', 'payment')
            ->sum('amount');
        $expectedCash = (float) $shift->opening_cash + $cashReceived - $totalReturns - $totalExpenses;

        $snapshot = [
            'generated_at' => now()->toIso8601String(),
            'shift_id' => $shift->id,
            'opened_at' => $shift->opened_at->toIso8601String(),
            'invoices_count' => $invoicesCount,
            'total_sales' => $totalSales,
            'total_returns' => $totalReturns,
            'returns_count' => $returnsCount,
            'items_sold_count' => $itemsSoldCount,
            'total_tax' => $totalTax,
            'opening_cash' => (float) $shift->opening_cash,
            'cash_received' => $cashReceived,
            'total_expenses' => $totalExpenses,
            'expected_cash' => $expectedCash,
            'by_payment_method' => $paymentSummary,
        ];

        PosShift::where('id', $shift->id)->update(['x_report_snapshot' => $snapshot]);

        return response()->json([
            'report' => $snapshot,
            'shift' => $shift->fresh(),
        ]);
    }

    /** إغلاق الوردية وتقرير Z */
    public function closeShift(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $branchId = $this->resolveBranchForUser($request, $tenantId, (int) $request->branch_id);
        $request->merge(['branch_id' => $branchId]);
        if (! $branchId) {
            return response()->json(['message' => 'يجب تحديد الفرع'], 422);
        }

        $request->validate([
            'branch_id' => 'required|exists:branches,id',
            'closing_cash' => 'required|numeric|min:0',
            'cash_denominations' => 'nullable|array',
            'cash_denominations.*.value' => 'required|numeric|min:0',
            'cash_denominations.*.count' => 'required|integer|min:0',
        ]);

        $shift = PosShift::where('tenant_id', $tenantId)
            ->where('branch_id', $branchId)
            ->where('status', 'open')
            ->first();

        if (! $shift) {
            return response()->json(['message' => 'لا توجد وردية مفتوحة لهذا الفرع'], 422);
        }

        $invoices = Invoice::where('tenant_id', $tenantId)
            ->where('pos_shift_id', $shift->id)
            ->where('type', 'sales')
            ->where(function ($q) {
                $q->whereNull('is_return')->orWhere('is_return', false);
            })
            ->get(['id', 'total', 'tax_amount']);

        $totalSales = (float) $invoices->sum('total');
        $totalTax = (float) $invoices->sum('tax_amount');
        $invoiceIds = $invoices->pluck('id');
        $itemsSoldCount = (int) \App\Models\InvoiceLine::whereIn('invoice_id', $invoiceIds)->sum('quantity');
        $returnsInShift = Invoice::where('tenant_id', $tenantId)->where('is_return', true)->whereIn('parent_invoice_id', $invoiceIds)->get(['id', 'total']);
        $totalReturns = (float) $returnsInShift->sum('total');
        $returnsCount = $returnsInShift->count();

        $paymentSummary = \App\Models\InvoicePayment::whereIn('invoice_id', $invoiceIds)
            ->with('paymentMethod:id,type')
            ->get()
            ->groupBy('payment_method_id')
            ->map(function ($rows, $methodId) {
                $first = $rows->first();
                $method = $first?->paymentMethod;

                return [
                    'payment_method_id' => (int) $methodId,
                    'type' => $method->type ?? 'other',
                    'amount' => (float) $rows->sum('amount'),
                ];
            })
            ->values()
            ->toArray();

        $cashReceived = collect($paymentSummary)->where('type', 'cash')->sum('amount');
        $totalExpenses = (float) Payment::where('tenant_id', $tenantId)
            ->where('pos_shift_id', $shift->id)
            ->where('type', 'payment')
            ->sum('amount');
        $expectedCash = (float) $shift->opening_cash + $cashReceived - $totalReturns - $totalExpenses;
        $totalReceived = (float) collect($paymentSummary)->sum('amount');
        if ($totalSales < 0.001 && ($invoices->count() > 0 || $totalReceived >= 0.001)) {
            return response()->json([
                'message' => 'لا يمكن إغلاق الوردية: إجمالي المبيعات يظهر صفراً مع وجود حركات بيع. يرجى مراجعة الفواتير والمرتجعات.',
            ], 422);
        }
        $closingCash = (float) $request->closing_cash;
        $difference = $closingCash - $expectedCash;

        $cashDenominations = $request->input('cash_denominations');
        if (is_array($cashDenominations)) {
            $cashDenominations = array_values(array_map(function ($d) {
                return ['value' => (float) ($d['value'] ?? 0), 'count' => (int) ($d['count'] ?? 0)];
            }, $cashDenominations));
        } else {
            $cashDenominations = null;
        }

        $netSales = $totalSales - $totalReturns;
        $otherReceived = $totalReceived - $cashReceived;

        $zSnapshot = [
            'generated_at' => now()->toIso8601String(),
            'shift_id' => $shift->id,
            'opened_at' => $shift->opened_at->toIso8601String(),
            'closed_at' => now()->toIso8601String(),
            'invoices_count' => $invoices->count(),
            'total_sales' => $totalSales,
            'total_returns' => $totalReturns,
            'returns_count' => $returnsCount,
            'items_sold_count' => $itemsSoldCount,
            'total_tax' => $totalTax,
            'opening_cash' => (float) $shift->opening_cash,
            'closing_cash' => $closingCash,
            'total_expenses' => $totalExpenses,
            'expected_cash' => $expectedCash,
            'difference' => $difference,
            'by_payment_method' => $paymentSummary,
            'cash_denominations' => $cashDenominations,
        ];

        try {
            DB::transaction(function () use ($shift, $zSnapshot, $closingCash, $expectedCash, $difference) {
                $shift->update([
                    'closed_at' => now(),
                    'closing_cash' => $closingCash,
                    'expected_cash' => $expectedCash,
                    'difference' => $difference,
                    'status' => 'closed',
                    'z_report_snapshot' => $zSnapshot,
                ]);

                PosSession::where('shift_id', $shift->id)->whereNull('ended_at')->update(['ended_at' => now()]);
            });
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'message' => 'فشل إغلاق الوردية: '.($e->getMessage() ?: 'خطأ غير معروف'),
            ], 500);
        }

        $shift = $shift->fresh(['branch:id,name,code', 'user:id,name']);

        return response()->json([
            'message' => 'تم إغلاق الوردية',
            'shift' => $shift,
            'z_report' => $zSnapshot,
        ], 200);
    }

    /** يفرض فرع المستخدم الافتراضي عند تفعيل تقييد الفرع/المخزن من صلاحياته على المستأجر. */
    private function resolveBranchForUser(Request $request, int $tenantId, int $requestedBranchId): int
    {
        $user = $request->user();
        if (! $user) {
            return $requestedBranchId;
        }

        $pivot = $user->tenants()->where('tenants.id', $tenantId)->first()?->pivot;
        $restrict = $pivot && ($pivot->restrict_to_branch_warehouse ?? false) && ! empty($pivot->default_branch_id);
        if ($restrict) {
            return (int) $pivot->default_branch_id;
        }

        return $requestedBranchId;
    }

    /** تعديل وردية مفتوحة (الرصيد الافتتاحي فقط) */
    public function updateShift(Request $request, int $id): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $shift = PosShift::where('tenant_id', $tenantId)->findOrFail($id);

        if ($shift->status !== 'open') {
            return response()->json(['message' => 'يمكن تعديل الوردية وهي مفتوحة فقط.'], 422);
        }

        $data = $request->validate([
            'opening_cash' => 'required|numeric|min:0',
        ]);

        $shift->update(['opening_cash' => (float) $data['opening_cash']]);

        return response()->json([
            'message' => 'تم تحديث الوردية',
            'shift' => $shift->fresh(['user:id,name', 'branch:id,name,code']),
        ]);
    }

    /** إعادة فتح وردية مغلقة (إلغاء الإغلاق) — لا يُسمح إن وُجد قيد يومية على الوردية */
    public function reopenShift(Request $request, int $id): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $shift = PosShift::where('tenant_id', $tenantId)->findOrFail($id);

        if ($shift->status !== 'closed') {
            return response()->json(['message' => 'الوردية ليست مغلقة.'], 422);
        }

        if ($shift->journal_entry_id) {
            return response()->json(['message' => 'لا يمكن إعادة فتح وردية مرتبطة بقيد يومية.'], 422);
        }

        $openExists = PosShift::where('tenant_id', $tenantId)
            ->where('branch_id', $shift->branch_id)
            ->where('status', 'open')
            ->exists();

        if ($openExists) {
            return response()->json(['message' => 'يوجد وردية مفتوحة بالفعل لهذا الفرع.'], 422);
        }

        try {
            DB::transaction(function () use ($shift, $request) {
                $shift->update([
                    'status' => 'open',
                    'closed_at' => null,
                    'closing_cash' => null,
                    'expected_cash' => null,
                    'difference' => null,
                    'z_report_snapshot' => null,
                ]);

                PosSession::create([
                    'tenant_id' => $shift->tenant_id,
                    'branch_id' => $shift->branch_id,
                    'shift_id' => $shift->id,
                    'user_id' => $request->user()->id,
                    'started_at' => now(),
                    'ended_at' => null,
                ]);
            });
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'message' => 'فشل إعادة فتح الوردية: '.($e->getMessage() ?: 'خطأ غير معروف'),
            ], 500);
        }

        return response()->json([
            'message' => 'تم إعادة فتح الوردية',
            'shift' => $shift->fresh(['user:id,name', 'branch:id,name,code']),
        ]);
    }

    /**
     * قيد إغلاق الوردية (نظام العهدة المستديمة):
     * 1) مناقلة: من حـ/ الصندوق الرئيسي ← إلى حـ/ عهدة الكاشير بالمبلغ الفعلي في الصندوق (تصفير عهدة الكاشير).
     * 2) أي فرق (عجز/زيادة) → حـ/ عجز وزيادة الصناديق.
     */
    private function postShiftClosingJournal(int $tenantId, int $branchId, int $shiftId, array $data): ?int
    {
        $defaults = \App\Models\TenantAccountDefault::where('tenant_id', $tenantId)->first();
        $cashAccountId = $defaults?->cash_account_id ?? \App\Models\Account::where('tenant_id', $tenantId)->where('type', 'asset')->where('code', '111')->value('id');
        $varianceAccountId = $defaults?->cash_variance_account_id ?? \App\Models\Account::where('tenant_id', $tenantId)->where('type', 'expense')->orderBy('id')->value('id');
        $custodyAccountId = $defaults?->pos_cash_custody_account_id ?? null;

        if (! $cashAccountId || ! $custodyAccountId) {
            return null;
        }

        $difference = (float) ($data['difference'] ?? 0);
        $closingCash = (float) ($data['closing_cash'] ?? 0);

        $desc = 'إغلاق وردية #'.$shiftId;
        $lines = [];

        // 1) مناقلة المبلغ الفعلي من عهدة الكاشير إلى الصندوق الرئيسي (تصفير عهدة الكاشير)
        if ($closingCash >= 0.001) {
            $lines[] = ['account_id' => $cashAccountId, 'debit' => $closingCash, 'credit' => 0, 'description' => 'إغلاق وردية - استلام من عهدة كاشير - '.$desc, 'cost_center_id' => null];
            $lines[] = ['account_id' => $custodyAccountId, 'debit' => 0, 'credit' => $closingCash, 'description' => 'إغلاق وردية - استلام من عهدة كاشير - '.$desc, 'cost_center_id' => null];
        }

        // 2) فرق العجز/الزيادة → حـ/ عجز وزيادة الصناديق (تصفية تلقائية لأي رصيد متبقي)
        if (abs($difference) >= 0.01 && $varianceAccountId) {
            $amount = abs($difference);
            if ($difference > 0) {
                $lines[] = ['account_id' => $cashAccountId, 'debit' => $amount, 'credit' => 0, 'description' => 'زيادة صندوق - '.$desc, 'cost_center_id' => null];
                $lines[] = ['account_id' => $varianceAccountId, 'debit' => 0, 'credit' => $amount, 'description' => 'زيادة صندوق - '.$desc, 'cost_center_id' => null];
            } else {
                $lines[] = ['account_id' => $varianceAccountId, 'debit' => $amount, 'credit' => 0, 'description' => 'عجز صندوق - '.$desc, 'cost_center_id' => null];
                $lines[] = ['account_id' => $cashAccountId, 'debit' => 0, 'credit' => $amount, 'description' => 'عجز صندوق - '.$desc, 'cost_center_id' => null];
            }
        }

        if (empty($lines)) {
            return null;
        }

        $entryData = [
            'tenant_id' => $tenantId,
            'date' => now()->toDateString(),
            'type' => 'adjustment',
            'description' => 'قيد إغلاق وردية نقطة بيع #'.$shiftId,
            'reference_type' => PosShift::class,
            'reference_id' => $shiftId,
            'status' => 'posted',
            'created_by' => auth()->id(),
            'posted_at' => now(),
            'branch_id' => $branchId,
        ];
        $entry = app(\App\Services\AccountingService::class)->createJournalEntry($entryData, $lines);

        return $entry->id;
    }

    /** تسجيل مصروف من نقطة البيع: إنشاء سند صرف وربطه بحساب الصندوق وحساب المصروف (فئة البند) */
    public function recordExpense(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;

        $validated = $request->validate([
            'branch_id' => 'required|exists:branches,id',
            'shift_id' => 'nullable|exists:pos_shifts,id',
            'expense_item_id' => [
                'required',
                Rule::exists('pos_expense_items', 'id')->where(fn ($q) => $q->where('tenant_id', $tenantId)),
            ],
            'payment_method_id' => [
                'required',
                Rule::exists('payment_methods', 'id')->where(fn ($q) => $q->where('tenant_id', $tenantId)),
            ],
            'amount' => 'required|numeric|min:0.001',
            'notes' => 'nullable|string|max:1000',
        ]);

        $expenseItem = PosExpenseItem::where('tenant_id', $tenantId)
            ->with('category.account')
            ->findOrFail((int) $validated['expense_item_id']);

        $category = $expenseItem->category;
        if (! $category || ! $category->account_id) {
            return response()->json(['message' => 'فئة بند المصروف غير مرتبطة بحساب في دليل الحسابات'], 422);
        }

        $paymentMethod = PaymentMethod::where('tenant_id', $tenantId)->find((int) $validated['payment_method_id']);
        if (! $paymentMethod || ! $paymentMethod->linked_account_id) {
            return response()->json(['message' => 'طريقة الدفع غير مرتبطة بحساب صندوق/بنك'], 422);
        }

        $defaults = \App\Models\TenantAccountDefault::where('tenant_id', $tenantId)->first();
        $cashBankAccountId = $paymentMethod->linked_account_id;
        if (! empty($validated['shift_id']) && $defaults?->pos_cash_custody_account_id) {
            $cashBankAccountId = (int) $defaults->pos_cash_custody_account_id;
        }

        $paymentData = [
            'tenant_id' => $tenantId,
            'type' => 'payment',
            'date' => now()->toDateString(),
            'amount' => (float) $validated['amount'],
            'payment_method_id' => (int) $validated['payment_method_id'],
            'cash_bank_account_id' => $cashBankAccountId,
            'counterpart_account_id' => $category->account_id,
            'branch_id' => (int) $validated['branch_id'],
            'notes' => isset($validated['notes']) ? trim((string) $validated['notes']) : null,
            'status' => 'posted',
            'created_by' => $request->user()->id,
            'reference' => 'مصروف POS - '.$expenseItem->name,
        ];

        if (! empty($validated['shift_id'])) {
            $paymentData['pos_shift_id'] = (int) $validated['shift_id'];
        }

        $payment = $this->paymentService->createPayment($paymentData);

        return response()->json([
            'message' => 'تم تسجيل المصروف وإنشاء سند الصرف',
            'payment_id' => $payment->id,
        ], 201);
    }

    /** فئات مصروفات POS */
    public function expenseCategories(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;

        $categories = PosExpenseCategory::query()
            ->where('tenant_id', $tenantId)
            ->with('account:id,code,name')
            ->orderBy('name')
            ->get(['id', 'tenant_id', 'name', 'name_en', 'account_id', 'is_active']);

        return response()->json(['data' => $categories]);
    }

    public function storeExpenseCategory(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;

        $validated = $request->validate([
            'name' => [
                'required',
                'string',
                'max:255',
                Rule::unique('pos_expense_categories', 'name')->where(fn ($q) => $q->where('tenant_id', $tenantId)),
            ],
            'name_en' => 'nullable|string|max:255',
            'account_id' => [
                'required',
                Rule::exists('accounts', 'id')->where(fn ($q) => $q->where('tenant_id', $tenantId)),
            ],
            'is_active' => 'nullable|boolean',
        ]);

        $category = PosExpenseCategory::create([
            'tenant_id' => $tenantId,
            'name' => trim((string) $validated['name']),
            'name_en' => isset($validated['name_en']) ? trim((string) $validated['name_en']) : null,
            'account_id' => (int) $validated['account_id'],
            'is_active' => array_key_exists('is_active', $validated) ? (bool) $validated['is_active'] : true,
        ])->load('account:id,code,name');

        return response()->json(['message' => 'تمت إضافة فئة المصروف', 'category' => $category], 201);
    }

    public function updateExpenseCategory(Request $request, int $id): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;

        $category = PosExpenseCategory::query()
            ->where('tenant_id', $tenantId)
            ->findOrFail($id);

        $validated = $request->validate([
            'name' => [
                'required',
                'string',
                'max:255',
                Rule::unique('pos_expense_categories', 'name')
                    ->where(fn ($q) => $q->where('tenant_id', $tenantId))
                    ->ignore($category->id),
            ],
            'name_en' => 'nullable|string|max:255',
            'account_id' => [
                'required',
                Rule::exists('accounts', 'id')->where(fn ($q) => $q->where('tenant_id', $tenantId)),
            ],
            'is_active' => 'nullable|boolean',
        ]);

        $category->update([
            'name' => trim((string) $validated['name']),
            'name_en' => isset($validated['name_en']) ? trim((string) $validated['name_en']) : null,
            'account_id' => (int) $validated['account_id'],
            'is_active' => array_key_exists('is_active', $validated) ? (bool) $validated['is_active'] : $category->is_active,
        ]);

        return response()->json([
            'message' => 'تم تحديث فئة المصروف',
            'category' => $category->fresh()->load('account:id,code,name'),
        ]);
    }

    public function destroyExpenseCategory(Request $request, int $id): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;

        $category = PosExpenseCategory::query()
            ->where('tenant_id', $tenantId)
            ->findOrFail($id);

        $category->delete();

        return response()->json(['message' => 'تم حذف فئة المصروف']);
    }

    /** بنود مصروفات POS */
    public function expenseItems(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;

        $items = PosExpenseItem::query()
            ->where('tenant_id', $tenantId)
            ->with('category:id,name,name_en,account_id,is_active')
            ->orderBy('name')
            ->get(['id', 'tenant_id', 'category_id', 'name', 'name_en', 'is_active']);

        return response()->json(['data' => $items]);
    }

    public function storeExpenseItem(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;

        $validated = $request->validate([
            'name' => [
                'required',
                'string',
                'max:255',
                Rule::unique('pos_expense_items', 'name')->where(fn ($q) => $q->where('tenant_id', $tenantId)),
            ],
            'name_en' => 'nullable|string|max:255',
            'category_id' => [
                'required',
                Rule::exists('pos_expense_categories', 'id')->where(fn ($q) => $q->where('tenant_id', $tenantId)),
            ],
            'is_active' => 'nullable|boolean',
        ]);

        $item = PosExpenseItem::create([
            'tenant_id' => $tenantId,
            'name' => trim((string) $validated['name']),
            'name_en' => isset($validated['name_en']) ? trim((string) $validated['name_en']) : null,
            'category_id' => (int) $validated['category_id'],
            'is_active' => array_key_exists('is_active', $validated) ? (bool) $validated['is_active'] : true,
        ])->load('category:id,name,name_en,account_id,is_active');

        return response()->json(['message' => 'تمت إضافة بند المصروف', 'item' => $item], 201);
    }

    public function updateExpenseItem(Request $request, int $id): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;

        $item = PosExpenseItem::query()
            ->where('tenant_id', $tenantId)
            ->findOrFail($id);

        $validated = $request->validate([
            'name' => [
                'required',
                'string',
                'max:255',
                Rule::unique('pos_expense_items', 'name')
                    ->where(fn ($q) => $q->where('tenant_id', $tenantId))
                    ->ignore($item->id),
            ],
            'name_en' => 'nullable|string|max:255',
            'category_id' => [
                'required',
                Rule::exists('pos_expense_categories', 'id')->where(fn ($q) => $q->where('tenant_id', $tenantId)),
            ],
            'is_active' => 'nullable|boolean',
        ]);

        $item->update([
            'name' => trim((string) $validated['name']),
            'name_en' => isset($validated['name_en']) ? trim((string) $validated['name_en']) : null,
            'category_id' => (int) $validated['category_id'],
            'is_active' => array_key_exists('is_active', $validated) ? (bool) $validated['is_active'] : $item->is_active,
        ]);

        return response()->json([
            'message' => 'تم تحديث بند المصروف',
            'item' => $item->fresh()->load('category:id,name,name_en,account_id,is_active'),
        ]);
    }

    public function destroyExpenseItem(Request $request, int $id): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;

        $item = PosExpenseItem::query()
            ->where('tenant_id', $tenantId)
            ->findOrFail($id);

        $item->delete();

        return response()->json(['message' => 'تم حذف بند المصروف']);
    }
}
