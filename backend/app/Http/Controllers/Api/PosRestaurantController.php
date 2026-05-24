<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Invoice;
use App\Models\InvoiceLine;
use App\Models\InvoicePayment;
use App\Models\Item;
use App\Models\KitchenTicket;
use App\Models\KitchenTicketLine;
use App\Models\PosSession;
use App\Models\PosShift;
use App\Models\RestaurantOrder;
use App\Models\RestaurantOrderLine;
use App\Models\RestaurantTable;
use App\Services\DeliveryService;
use App\Services\InvoiceService;
use App\Services\LoyaltyService;
use App\Services\PaymentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class PosRestaurantController extends Controller
{
    /**
     * إرسال طلب للمطبخ دون إنشاء فاتورة — يُنشأ طلب مطعم + تذكرة مطبخ فقط.
     * الفاتورة تُنشأ عند الدفع (checkout).
     */
    public function sendOrder(Request $request): JsonResponse
    {
        $tenantId = $request->attributes->get('tenant_id');

        $data = $request->validate([
            'branch_id' => ['required', 'integer', 'exists:branches,id'],
            'warehouse_id' => ['required', 'integer', 'exists:warehouses,id'],
            'table_id' => ['nullable', 'integer', 'exists:restaurant_tables,id'],
            'order_type' => ['required', 'in:dine_in,takeaway,delivery'],
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],
            'date' => ['required', 'date'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.item_id' => ['required', 'integer', 'exists:items,id'],
            'lines.*.quantity' => ['required', 'numeric', 'min:0.001'],
            'lines.*.unit_price' => ['required', 'numeric', 'min:0'],
            'lines.*.discount_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'lines.*.tax_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'lines.*.description' => ['nullable', 'string', 'max:500'],
        ]);

        return DB::transaction(function () use ($data, $tenantId) {
            $order = RestaurantOrder::create([
                'tenant_id' => $tenantId,
                'branch_id' => $data['branch_id'],
                'warehouse_id' => $data['warehouse_id'],
                'table_id' => $data['table_id'] ?? null,
                'customer_id' => $data['customer_id'] ?? null,
                'order_type' => $data['order_type'],
                'status' => 'sent',
                'date' => $data['date'],
            ]);

            $sortOrder = 0;
            foreach ($data['lines'] as $lineInput) {
                $item = Item::where('tenant_id', $tenantId)->findOrFail($lineInput['item_id']);
                $line = new RestaurantOrderLine([
                    'restaurant_order_id' => $order->id,
                    'item_id' => $item->id,
                    'description' => $lineInput['description'] ?? $item->name,
                    'quantity' => $lineInput['quantity'],
                    'unit_price' => $lineInput['unit_price'],
                    'discount_percent' => $lineInput['discount_percent'] ?? 0,
                    'tax_percent' => $lineInput['tax_percent'] ?? 0,
                    'sort_order' => $sortOrder++,
                ]);
                $line->calculateTotals();
                $line->save();
            }
            $order->load('lines');
            $order->recalculate();

            $ticket = KitchenTicket::create([
                'tenant_id' => $tenantId,
                'branch_id' => $order->branch_id,
                'table_id' => $order->table_id,
                'invoice_id' => null,
                'restaurant_order_id' => $order->id,
                'status' => 'pending',
            ]);

            foreach ($order->lines as $line) {
                KitchenTicketLine::create([
                    'ticket_id' => $ticket->id,
                    'invoice_line_id' => null,
                    'item_name' => $line->description ?? optional($line->item)->name ?? '',
                    'quantity' => $line->quantity,
                    'modifiers_text' => null,
                    'kitchen_note' => null,
                ]);
            }

            if (! empty($data['table_id'])) {
                RestaurantTable::where('tenant_id', $tenantId)->where('id', $data['table_id'])->update(['status' => 'occupied']);
            }

            return response()->json([
                'order' => $order->fresh(['lines.item', 'table:id,name']),
                'ticket' => $ticket->load('lines'),
            ], 201);
        });
    }

    public function store(Request $request, InvoiceService $invoiceService): JsonResponse
    {
        $tenantId = $request->attributes->get('tenant_id');

        $data = $request->validate([
            'invoice_id' => ['nullable', 'integer', 'exists:invoices,id'],
            'branch_id' => ['required', 'integer', 'exists:branches,id'],
            'warehouse_id' => ['required', 'integer', 'exists:warehouses,id'],
            'table_id' => ['nullable', 'integer', 'exists:restaurant_tables,id'],
            'order_type' => ['required', 'in:dine_in,takeaway,delivery'],
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],
            'date' => ['required', 'date'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.item_id' => ['required', 'integer', 'exists:items,id'],
            'lines.*.quantity' => ['required', 'numeric', 'min:0.001'],
            'lines.*.unit_price' => ['required', 'numeric', 'min:0'],
            'lines.*.discount_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'lines.*.tax_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'lines.*.description' => ['nullable', 'string', 'max:500'],
            'lines.*.modifiers' => ['nullable', 'array'],
            'lines.*.modifiers.*.name' => ['required_with:lines.*.modifiers', 'string', 'max:255'],
            'lines.*.modifiers.*.price_delta' => ['nullable', 'numeric'],
            'lines.*.kitchen_note' => ['nullable', 'string', 'max:500'],
        ]);

        return DB::transaction(function () use ($data, $tenantId, $invoiceService) {
            $isNew = empty($data['invoice_id']);

            if ($isNew) {
                $invoiceData = [
                    'tenant_id' => $tenantId,
                    'type' => 'sales',
                    'customer_id' => $data['customer_id'] ?? null,
                    'branch_id' => $data['branch_id'],
                    'warehouse_id' => $data['warehouse_id'],
                    'date' => $data['date'],
                    'status' => 'draft',
                    'order_type' => $data['order_type'],
                    'table_id' => $data['table_id'] ?? null,
                ];

                $lines = [];
                foreach ($data['lines'] as $lineInput) {
                    /** @var Item $item */
                    $item = Item::where('tenant_id', $tenantId)->findOrFail($lineInput['item_id']);

                    $lines[] = [
                        'item_id' => $item->id,
                        'description' => $lineInput['description'] ?? $item->name,
                        'quantity' => $lineInput['quantity'],
                        'unit_price' => $lineInput['unit_price'],
                        'discount_percent' => $lineInput['discount_percent'] ?? 0,
                        'tax_percent' => $lineInput['tax_percent'] ?? 0,
                    ];
                }

                /** @var Invoice $invoice */
                $invoice = $invoiceService->createInvoice($invoiceData, $lines, false);

                if (! empty($data['table_id'])) {
                    RestaurantTable::where('tenant_id', $tenantId)->where('id', $data['table_id'])->update(['status' => 'occupied']);
                }
            } else {
                /** @var Invoice $invoice */
                $invoice = Invoice::where('tenant_id', $tenantId)->findOrFail($data['invoice_id']);
                $oldTableId = $invoice->table_id;
                $newTableId = $data['table_id'] ?? null;

                $invoice->order_type = $data['order_type'];
                $invoice->table_id = $newTableId;
                $invoice->branch_id = $data['branch_id'];
                $invoice->warehouse_id = $data['warehouse_id'];
                $invoice->date = $data['date'];
                $invoice->save();

                if ($oldTableId && $oldTableId !== $newTableId) {
                    RestaurantTable::where('tenant_id', $tenantId)->where('id', $oldTableId)->update(['status' => 'available']);
                }
                if ($newTableId) {
                    RestaurantTable::where('tenant_id', $tenantId)->where('id', $newTableId)->update(['status' => 'occupied']);
                }

                // Replace lines
                $invoice->lines()->delete();

                foreach ($data['lines'] as $lineInput) {
                    /** @var Item $item */
                    $item = Item::where('tenant_id', $tenantId)->findOrFail($lineInput['item_id']);

                    $line = new InvoiceLine;
                    $line->invoice_id = $invoice->id;
                    $line->item_id = $item->id;
                    $line->description = $lineInput['description'] ?? $item->name;
                    $line->quantity = $lineInput['quantity'];
                    $line->unit_price = $lineInput['unit_price'];
                    $line->discount_percent = $lineInput['discount_percent'] ?? 0;
                    $line->tax_percent = $lineInput['tax_percent'] ?? 0;
                    $line->sort_order = 0;
                    $line->calculateTotals();
                    $line->save();
                }

                $invoice->recalculate();
            }

            return response()->json($invoice->fresh('lines'), $isNew ? 201 : 200);
        });
    }

    public function sendToKitchen(Request $request, int $invoiceId): JsonResponse
    {
        $tenantId = $request->attributes->get('tenant_id');

        /** @var Invoice $invoice */
        $invoice = Invoice::where('tenant_id', $tenantId)
            ->with('lines.item')
            ->findOrFail($invoiceId);

        return DB::transaction(function () use ($invoice, $tenantId) {
            $ticket = KitchenTicket::create([
                'tenant_id' => $tenantId,
                'branch_id' => $invoice->branch_id,
                'table_id' => $invoice->table_id,
                'invoice_id' => $invoice->id,
                'status' => 'pending',
            ]);

            foreach ($invoice->lines as $line) {
                KitchenTicketLine::create([
                    'ticket_id' => $ticket->id,
                    'invoice_line_id' => $line->id,
                    'item_name' => $line->description ?? optional($line->item)->name ?? '',
                    'quantity' => $line->quantity,
                    'modifiers_text' => null,
                    'kitchen_note' => null,
                ]);
            }

            return response()->json($ticket->load('lines'), 201);
        });
    }

    /** قائمة الطلبات الجاهزة للتحصيل (ظهرت بعد «تم التجهيز» من المطبخ) — لا فاتورة حتى الدفع */
    public function openOrders(Request $request): JsonResponse
    {
        $tenantId = $request->attributes->get('tenant_id');
        $branchId = $request->query('branch_id');

        $query = RestaurantOrder::where('tenant_id', $tenantId)
            ->where('status', 'ready')
            ->with(['table:id,name', 'lines.item']);

        if ($branchId) {
            $query->where('branch_id', $branchId);
        }

        $orders = $query->orderBy('date')->orderBy('id')->get();

        return response()->json($orders);
    }

    /** طلب جاهز لطاولة معينة (لتحصيله) */
    public function openOrderByTable(Request $request, int $tableId): JsonResponse
    {
        $tenantId = $request->attributes->get('tenant_id');
        $branchId = $request->query('branch_id');

        $query = RestaurantOrder::where('tenant_id', $tenantId)
            ->where('status', 'ready')
            ->where('table_id', $tableId)
            ->with(['lines.item', 'table:id,name']);

        if ($branchId) {
            $query->where('branch_id', $branchId);
        }

        $order = $query->first();

        if (! $order) {
            return response()->json(['message' => 'لا يوجد طلب جاهز لهذه الطاولة'], 404);
        }

        return response()->json($order);
    }

    /** جلب طلب واحد (للتحصيل) */
    public function getOrder(Request $request, int $orderId): JsonResponse
    {
        $tenantId = $request->attributes->get('tenant_id');

        $order = RestaurantOrder::where('tenant_id', $tenantId)
            ->where('status', 'ready')
            ->with(['lines.item', 'table:id,name', 'customer'])
            ->findOrFail($orderId);

        return response()->json($order);
    }

    /**
     * تحصيل الطلب: إنشاء فاتورة من الطلب، إضافة الدفعة، ترحيل الفاتورة (قيد محاسبي + مخزني + تكلفة)،
     * تحرير الطاولة، ربط الطلب بالفاتورة.
     */
    public function checkout(Request $request, int $orderId, InvoiceService $invoiceService, PaymentService $paymentService): JsonResponse
    {
        $tenantId = $request->attributes->get('tenant_id');

        $order = RestaurantOrder::where('tenant_id', $tenantId)
            ->where('status', 'ready')
            ->with(['lines.item', 'table', 'customer'])
            ->findOrFail($orderId);

        $paymentsInput = $request->input('payments');
        $useSplit = is_array($paymentsInput) && count($paymentsInput) > 0;

        if ($useSplit) {
            $validated = $request->validate([
                'payments' => ['required', 'array', 'min:1'],
                'payments.*.payment_method_id' => [
                    'required',
                    'integer',
                    Rule::exists('payment_methods', 'id')->where(fn ($q) => $q->where('tenant_id', $tenantId)),
                ],
                'payments.*.amount' => ['required', 'numeric', 'min:0.001'],
                'date' => ['required', 'date'],
                'notes' => ['nullable', 'string', 'max:500'],
                'shift_id' => ['nullable', 'integer', 'exists:pos_shifts,id'],
                'delivery_driver_id' => [
                    'nullable',
                    'integer',
                    Rule::exists('delivery_drivers', 'id')->where(fn ($q) => $q->where('tenant_id', $tenantId)),
                ],
                'redeem_points' => ['nullable', 'numeric', 'min:0'],
                'loyalty_program_id' => ['nullable', 'integer', 'min:1'],
            ]);
            $amount = round(collect($validated['payments'])->sum(fn ($p) => (float) $p['amount']), 3);
        } else {
            $validated = $request->validate([
                'amount' => ['required', 'numeric', 'min:0.01'],
                'date' => ['required', 'date'],
                'payment_method_id' => ['nullable', 'integer', 'exists:payment_methods,id'],
                'notes' => ['nullable', 'string', 'max:500'],
                'shift_id' => ['nullable', 'integer', 'exists:pos_shifts,id'],
                'delivery_driver_id' => [
                    'nullable',
                    'integer',
                    Rule::exists('delivery_drivers', 'id')->where(fn ($q) => $q->where('tenant_id', $tenantId)),
                ],
                'redeem_points' => ['nullable', 'numeric', 'min:0'],
                'loyalty_program_id' => ['nullable', 'integer', 'min:1'],
            ]);
            $amount = round((float) $validated['amount'], 3);
        }

        // Loyalty: allow redeeming points as invoice discount (optional)
        $redeemPoints = (float) ($validated['redeem_points'] ?? 0);
        $redeemDiscount = 0.0;
        try {
            if ($redeemPoints > 0.0005 && ! empty($order->customer_id)) {
                $selectedProgramId = isset($validated['loyalty_program_id']) ? (int) $validated['loyalty_program_id'] : null;
                $program = app(LoyaltyService::class)->getProgram((int) $tenantId, $selectedProgramId);
                $apply = $program?->is_active && (
                    ($program->apply_on_restaurant ?? false)
                    || ($program->apply_on_pos ?? false)
                    || ($order->order_type === 'delivery' && ($program->apply_on_delivery ?? false))
                );
                if ($apply) {
                    $redeemDiscount = round($redeemPoints * (float) ($program->point_value ?? 0), 3);
                }
            }
        } catch (\Throwable $e) {
            report($e);
            $redeemDiscount = 0.0;
        }

        $orderTotal = round((float) $order->total, 3);
        $netTotal = round(max(0, $orderTotal - $redeemDiscount), 3);
        if ($amount + 0.0005 < $netTotal) {
            return response()->json(['message' => 'المبلغ المدفوع أقل من إجمالي الطلب'], 422);
        }

        $shift = PosShift::where('tenant_id', $tenantId)
            ->where('branch_id', $order->branch_id)
            ->where('status', 'open')
            ->when(! empty($validated['shift_id']), fn ($q) => $q->where('id', (int) $validated['shift_id']))
            ->first();

        if (! $shift) {
            return response()->json(['message' => 'لا توجد وردية مفتوحة لهذا الفرع. يرجى فتح وردية قبل التحصيل.'], 422);
        }

        $session = PosSession::where('tenant_id', $tenantId)->where('shift_id', $shift->id)->whereNull('ended_at')->first();

        $checkoutDriverId = $request->filled('delivery_driver_id') ? (int) $validated['delivery_driver_id'] : null;
        $skipCashierForDriver = $order->order_type === 'delivery' && $checkoutDriverId > 0;
        if ($skipCashierForDriver && empty($order->customer_id)) {
            return response()->json([
                'message' => 'يجب ربط طلب التوصيل بعميل عند تعيين سائق؛ المبلغ لا يُسجَّل في صندوق الوردية ويُحصَّل عبر السائق.',
            ], 422);
        }

        if ($skipCashierForDriver && $useSplit) {
            return response()->json(['message' => 'لا يمكن تسجيل دفعات متعددة في الصندوق عند تعيين سائق للتحصيل لاحقاً.'], 422);
        }

        $primaryPaymentMethodId = $skipCashierForDriver
            ? null
            : ($useSplit
                ? (int) $validated['payments'][0]['payment_method_id']
                : ($validated['payment_method_id'] ?? null));

        return DB::transaction(function () use ($order, $tenantId, $validated, $amount, $invoiceService, $paymentService, $shift, $session, $skipCashierForDriver, $checkoutDriverId, $useSplit, $primaryPaymentMethodId, $redeemDiscount, $redeemPoints) {
            $invoiceData = [
                'tenant_id' => $tenantId,
                'type' => 'sales',
                'customer_id' => $order->customer_id,
                'branch_id' => $order->branch_id,
                'warehouse_id' => $order->warehouse_id,
                'date' => $order->date->format('Y-m-d'),
                'status' => 'draft',
                'order_type' => $order->order_type,
                'table_id' => $order->table_id,
                'discount_amount' => $redeemDiscount > 0.0005 ? $redeemDiscount : 0,
                'amount_paid' => $skipCashierForDriver ? 0 : $amount,
                'payment_timing' => $skipCashierForDriver ? 'deferred' : 'paid',
                'payment_method_id' => $primaryPaymentMethodId,
                'delivery_driver_id' => $checkoutDriverId > 0 ? $checkoutDriverId : null,
                'pos_shift_id' => $shift->id,
                'pos_session_id' => $session?->id,
            ];

            $lines = [];
            foreach ($order->lines as $line) {
                $lines[] = [
                    'item_id' => $line->item_id,
                    'description' => $line->description ?? optional($line->item)->name,
                    'quantity' => $line->quantity,
                    'unit_price' => $line->unit_price,
                    'discount_percent' => $line->discount_percent ?? 0,
                    'tax_percent' => $line->tax_percent ?? 0,
                ];
            }

            $invoice = $invoiceService->createInvoice($invoiceData, $lines, false);

            if (! $skipCashierForDriver) {
                $baseNotes = $validated['notes'] ?? null;
                if ($useSplit) {
                    foreach ($validated['payments'] as $idx => $p) {
                        $lineAmount = round((float) $p['amount'], 3);
                        $methodId = (int) $p['payment_method_id'];
                        $suffix = ' — '.($idx + 1);
                        $lineNotes = $baseNotes ? ($baseNotes.$suffix) : ('دفع من نقطة بيع المطعم'.$suffix);
                        $paymentService->createPayment([
                            'tenant_id' => $tenantId,
                            'type' => 'receipt',
                            'date' => $validated['date'],
                            'amount' => $lineAmount,
                            'payment_method_id' => $methodId,
                            'notes' => $lineNotes,
                            'invoice_id' => $invoice->id,
                            'reference' => $invoice->number ?? (string) $invoice->id,
                            'customer_id' => $invoice->customer_id,
                            'vendor_id' => null,
                            'branch_id' => $invoice->branch_id,
                            'pos_shift_id' => $shift->id,
                        ]);
                        InvoicePayment::create([
                            'tenant_id' => $tenantId,
                            'invoice_id' => $invoice->id,
                            'payment_method_id' => $methodId,
                            'amount' => $lineAmount,
                        ]);
                    }
                } else {
                    $paymentService->createPayment([
                        'tenant_id' => $tenantId,
                        'type' => 'receipt',
                        'date' => $validated['date'],
                        'amount' => $amount,
                        'payment_method_id' => $validated['payment_method_id'] ?? null,
                        'notes' => $baseNotes,
                        'invoice_id' => $invoice->id,
                        'reference' => $invoice->number ?? (string) $invoice->id,
                        'customer_id' => $invoice->customer_id,
                        'vendor_id' => null,
                        'branch_id' => $invoice->branch_id,
                        'pos_shift_id' => $shift->id,
                    ]);

                    if (! empty($validated['payment_method_id'])) {
                        InvoicePayment::create([
                            'tenant_id' => $tenantId,
                            'invoice_id' => $invoice->id,
                            'payment_method_id' => (int) $validated['payment_method_id'],
                            'amount' => $amount,
                        ]);
                    }
                }
            }

            $invoice = $invoiceService->postInvoice($invoice->fresh(['lines.item', 'lines.item.category', 'customer', 'vendor']));

            // Loyalty: redeem (optional) then award (optional). Do not break checkout.
            try {
                $selectedProgramId = isset($validated['loyalty_program_id']) ? (int) $validated['loyalty_program_id'] : null;
                $program = app(LoyaltyService::class)->getProgram((int) $tenantId, $selectedProgramId);
                $apply = $program?->is_active && (
                    ($program->apply_on_restaurant ?? false)
                    || ($program->apply_on_pos ?? false)
                    || ($order->order_type === 'delivery' && ($program->apply_on_delivery ?? false))
                );

                if ($apply && $invoice->customer_id) {
                    if ($redeemPoints > 0.0005 && $redeemDiscount > 0.0005) {
                        app(LoyaltyService::class)->redeemPoints(
                            tenantId: (int) $tenantId,
                            customerId: (int) $invoice->customer_id,
                            pointsToRedeem: (float) $redeemPoints,
                            sourceType: \App\Models\Invoice::class,
                            sourceId: (int) $invoice->id,
                            reference: (string) ($invoice->number ?? $invoice->id),
                            createdBy: (int) (auth()->id() ?? 0),
                            programId: (int) $program->id
                        );
                    }
                }

                // Award for all eligible programs that apply to restaurant module
                if ($invoice->customer_id) {
                    $programs = app(LoyaltyService::class)->getEligiblePrograms((int) $tenantId, (int) $invoice->customer_id, 'restaurant');
                    foreach ($programs as $p) {
                        app(LoyaltyService::class)->awardPoints(
                            tenantId: (int) $tenantId,
                            customerId: (int) $invoice->customer_id,
                            amount: (float) ($invoice->total ?? 0),
                            sourceType: \App\Models\Invoice::class,
                            sourceId: (int) $invoice->id,
                            reference: (string) ($invoice->number ?? $invoice->id),
                            createdBy: (int) (auth()->id() ?? 0),
                            programId: (int) $p->id
                        );
                    }
                }
            } catch (\Throwable $e) {
                report($e);
            }

            app(DeliveryService::class)->applyDispatchAfterPostedSalesInvoice(
                $invoice->fresh(['customer']),
                $checkoutDriverId,
                auth()->id()
            );

            if ($order->table_id) {
                RestaurantTable::where('tenant_id', $tenantId)->where('id', $order->table_id)->update(['status' => 'available']);
            }

            $order->update(['status' => 'paid', 'invoice_id' => $invoice->id]);

            KitchenTicket::where('tenant_id', $tenantId)
                ->where('restaurant_order_id', $order->id)
                ->whereNotIn('status', ['done', 'cancelled'])
                ->update(['status' => 'done']);

            return response()->json([
                'message' => 'تم التحصيل وترحيل الفاتورة',
                'invoice' => $invoice->fresh(['lines.item', 'customer', 'journalEntry.lines.account']),
            ], 201);
        });
    }

    /** إلغاء طلب مطعم (قبل الفاتورة): إلغاء تذكرة المطبخ، تحرير الطاولة، إلغاء الطلب */
    public function cancelRestaurantOrder(Request $request, int $orderId): JsonResponse
    {
        $tenantId = $request->attributes->get('tenant_id');

        $order = RestaurantOrder::where('tenant_id', $tenantId)
            ->whereIn('status', ['sent', 'ready'])
            ->findOrFail($orderId);

        return DB::transaction(function () use ($order, $tenantId) {
            KitchenTicket::where('tenant_id', $tenantId)
                ->where('restaurant_order_id', $order->id)
                ->update(['status' => 'cancelled']);

            if ($order->table_id) {
                RestaurantTable::where('tenant_id', $tenantId)
                    ->where('id', $order->table_id)
                    ->update(['status' => 'available']);
            }

            $order->update(['status' => 'cancelled']);

            return response()->json(['message' => 'تم إلغاء الطلب'], 200);
        });
    }

    /** إلغاء طلب مطعم (مسودة فاتورة — للتوافق مع الدورة القديمة) */
    public function cancelOrder(Request $request, int $invoiceId, InvoiceService $invoiceService): JsonResponse
    {
        $tenantId = $request->attributes->get('tenant_id');

        $invoice = Invoice::where('tenant_id', $tenantId)
            ->where('type', 'sales')
            ->where('status', 'draft')
            ->findOrFail($invoiceId);

        return DB::transaction(function () use ($invoice, $tenantId, $invoiceService) {
            KitchenTicket::where('tenant_id', $tenantId)
                ->where('invoice_id', $invoice->id)
                ->update(['status' => 'cancelled']);

            if ($invoice->table_id) {
                RestaurantTable::where('tenant_id', $tenantId)
                    ->where('id', $invoice->table_id)
                    ->update(['status' => 'available']);
            }

            $invoiceService->cancelInvoice($invoice);

            return response()->json(['message' => 'تم إلغاء الطلب'], 200);
        });
    }
}
