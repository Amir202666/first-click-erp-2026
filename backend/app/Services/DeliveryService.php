<?php

namespace App\Services;

use App\Models\DeliveryAssignment;
use App\Models\DeliveryDriver;
use App\Models\Invoice;
use App\Models\JournalEntry;
use App\Models\ShippingOrder;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use RuntimeException;

class DeliveryService
{
    private const DECIMALS = 3;

    public function __construct(
        private AccountingService $accountingService,
        private AccountResolutionService $accountResolutionService,
        private PaymentService $paymentService,
    ) {}

    /**
     * حساب دائن مرتجع المبيعات: عهدة السائق إن كانت الفاتورة الأصل مسندَة للتوصيل، وإلا ذمم العميل.
     */
    public function resolveCreditAccountForSalesReturnInvoice(Invoice $invoice, $defaults): ?int
    {
        $tenantId = (int) $invoice->tenant_id;
        if ($invoice->payment_timing === 'paid') {
            $cashOrBank = $defaults->cash_account_id ?? $defaults->bank_account_id;

            return $this->accountResolutionService->resolveStoredDefaultAccountId(
                $tenantId,
                $cashOrBank ? (int) $cashOrBank : null
            );
        }
        $parentId = $invoice->parent_invoice_id;
        if ($parentId) {
            $assignment = DeliveryAssignment::where('tenant_id', $invoice->tenant_id)
                ->where('invoice_id', $parentId)
                ->where('status', 'assigned')
                ->with('driver')
                ->first();
            if ($assignment && $assignment->driver && $assignment->driver->custody_account_id) {
                return (int) $assignment->driver->custody_account_id;
            }
        }
        if ($invoice->customer_id && $invoice->customer && $invoice->customer->account_id) {
            return (int) $invoice->customer->account_id;
        }

        return $this->accountResolutionService->resolveStoredDefaultAccountId(
            $tenantId,
            $defaults->customers_account_id ? (int) $defaults->customers_account_id : null
        );
    }

    public function markInvoiceReady(Invoice $invoice): void
    {
        $this->assertSalesInvoiceForDelivery($invoice);
        if (! $invoice->journal_entry_id) {
            throw new InvalidArgumentException('يجب ترحيل الفاتورة قبل تعيينها كجاهزة للتوصيل.');
        }
        $invoice->update(['delivery_ready_at' => now()]);
    }

    public function unmarkInvoiceReady(Invoice $invoice): void
    {
        $this->assertSalesInvoiceForDelivery($invoice);
        if ($invoice->activeDeliveryAssignment) {
            throw new InvalidArgumentException('لا يمكن إلغاء الجاهزية طالما الفاتورة مسندة لسائق. ألغِ الإسناد أولاً.');
        }
        $invoice->update(['delivery_ready_at' => null]);
    }

    /**
     * بعد ترحيل فاتورة مبيعات بنوع طلب «توصيل»: تجهيز لوحة الشحن أو الإسناد الفوري للسائق.
     * يُشترط رصيد ذمم > 0 (فاتورة آجلة/جزئية) لأن نقل العهدة يعتمد على balance.
     */
    public function applyDispatchAfterPostedSalesInvoice(Invoice $invoice, ?int $driverId, ?int $userId): void
    {
        if ($invoice->type !== 'sales' || $invoice->is_return) {
            return;
        }
        if ($invoice->order_type !== 'delivery') {
            return;
        }
        $invoice = $invoice->fresh(['customer']);
        if (! $invoice || ! $invoice->journal_entry_id) {
            return;
        }
        if ($invoice->activeDeliveryAssignment) {
            return;
        }
        if ((float) $invoice->balance <= 0.0005) {
            return;
        }

        $this->markInvoiceReady($invoice);
        $invoice = $invoice->fresh(['customer']);

        $effectiveDriverId = $driverId ?? ($invoice->delivery_driver_id ? (int) $invoice->delivery_driver_id : null);
        if ($effectiveDriverId) {
            $driver = DeliveryDriver::where('tenant_id', $invoice->tenant_id)->findOrFail($effectiveDriverId);
            $this->assignInvoiceToDriver($invoice, $driver, $userId);
        }
    }

    public function assignInvoiceToDriver(Invoice $invoice, DeliveryDriver $driver, ?int $userId): DeliveryAssignment
    {
        return DB::transaction(function () use ($invoice, $driver, $userId) {
            $this->assertSalesInvoiceForDelivery($invoice);
            if ((int) $invoice->tenant_id !== (int) $driver->tenant_id) {
                throw new InvalidArgumentException('السائق لا يتبع نفس الشركة.');
            }
            if (! $driver->is_active) {
                throw new InvalidArgumentException('السائق غير نشط.');
            }
            if (! $driver->custody_account_id) {
                throw new InvalidArgumentException('يجب ربط السائق بحساب عهدة مالي.');
            }
            if (! $invoice->journal_entry_id) {
                throw new InvalidArgumentException('الفاتورة غير مرحّلة.');
            }
            if (! $invoice->delivery_ready_at) {
                throw new InvalidArgumentException('عيّن الفاتورة كجاهزة للتوصيل أولاً.');
            }
            if ($invoice->activeDeliveryAssignment) {
                throw new InvalidArgumentException('الفاتورة مسندة بالفعل لسائق.');
            }
            $balance = round((float) $invoice->balance, self::DECIMALS);
            if ($balance < 0.0005) {
                throw new InvalidArgumentException('لا يوجد رصيد للتحصيل على الفاتورة.');
            }

            $receivableId = $this->accountResolutionService->resolveSalesReceivableAccountId(
                $invoice->loadMissing('customer')
            );
            if (! $receivableId) {
                throw new RuntimeException('تعذر تحديد حساب ذمم العميل لنقل العهدة.');
            }

            $assignment = DeliveryAssignment::create([
                'tenant_id' => $invoice->tenant_id,
                'invoice_id' => $invoice->id,
                'driver_id' => $driver->id,
                'status' => 'assigned',
                'custody_amount' => $balance,
                'assigned_at' => now(),
                'assigned_by' => $userId,
            ]);

            $desc = 'نقل عهدة توصيل — فاتورة '.($invoice->number ?? $invoice->id).' — سائق: '.$driver->name;
            $costCenterId = $invoice->cost_center_id ? (int) $invoice->cost_center_id : null;
            $lines = [
                [
                    'account_id' => (int) $driver->custody_account_id,
                    'cost_center_id' => $costCenterId,
                    'debit' => $balance,
                    'credit' => 0,
                    'description' => $desc,
                ],
                [
                    'account_id' => $receivableId,
                    'cost_center_id' => $costCenterId,
                    'debit' => 0,
                    'credit' => $balance,
                    'description' => $desc,
                ],
            ];

            $entry = $this->accountingService->createJournalEntry([
                'tenant_id' => (int) $invoice->tenant_id,
                'date' => $invoice->date,
                'type' => 'adjustment',
                'description' => $desc,
                'customer_id' => $invoice->customer_id,
                'branch_id' => $invoice->branch_id,
                'reference_type' => DeliveryAssignment::class,
                'reference_id' => $assignment->id,
                'status' => 'posted',
                'created_by' => $userId ?? auth()->id(),
                'posted_at' => now(),
            ], $lines);

            $assignment->update(['custody_transfer_journal_entry_id' => $entry->id]);

            ShippingOrder::updateOrCreate(
                ['invoice_id' => $invoice->id],
                [
                    'tenant_id' => (int) $invoice->tenant_id,
                    'driver_id' => $driver->id,
                    'status' => ShippingOrder::STATUS_OUT_FOR_DELIVERY,
                    'delivery_assignment_id' => $assignment->id,
                ]
            );

            return $assignment->fresh(['driver.custodyAccount', 'invoice']);
        });
    }

    public function cancelAssignment(DeliveryAssignment $assignment, ?int $userId): void
    {
        DB::transaction(function () use ($assignment) {
            if ($assignment->status !== 'assigned') {
                throw new InvalidArgumentException('يمكن إلغاء الإسناد النشط فقط.');
            }
            $invoice = $assignment->invoice;
            if ($invoice && (float) $invoice->amount_paid > 0.0005) {
                throw new InvalidArgumentException('لا يمكن إلغاء الإسناد بعد تسجيل تحصيل على الفاتورة.');
            }
            if ($assignment->custody_transfer_journal_entry_id) {
                JournalEntry::where('id', $assignment->custody_transfer_journal_entry_id)
                    ->update(['status' => 'void']);
            }
            $assignment->update(['status' => 'cancelled']);

            ShippingOrder::where('tenant_id', $assignment->tenant_id)
                ->where('invoice_id', $assignment->invoice_id)
                ->update(['status' => ShippingOrder::STATUS_CANCELLED]);
        });
    }

    public function markDelivered(DeliveryAssignment $assignment): void
    {
        if ($assignment->status !== 'assigned') {
            throw new InvalidArgumentException('الإسناد ليس قيد التوصيل.');
        }
        $assignment->update(['delivered_at' => $assignment->delivered_at ?? now()]);

        ShippingOrder::where('tenant_id', $assignment->tenant_id)
            ->where('invoice_id', $assignment->invoice_id)
            ->where('status', ShippingOrder::STATUS_OUT_FOR_DELIVERY)
            ->update(['status' => ShippingOrder::STATUS_DELIVERED]);
    }

    /**
     * تحصيل فواتير مسندة: سند قبض لكل فاتورة بحساب مقابل = عهدة السائق.
     *
     * @param  array<int, array{invoice_id: int, amount?: float}>  $items
     */
    public function settleInvoices(int $tenantId, int $driverId, array $items, int $paymentMethodId, string $date, ?int $userId): array
    {
        return DB::transaction(function () use ($tenantId, $driverId, $items, $paymentMethodId, $date, $userId) {
            $driver = DeliveryDriver::where('tenant_id', $tenantId)->findOrFail($driverId);
            if (! $driver->custody_account_id) {
                throw new InvalidArgumentException('السائق بلا حساب عهدة.');
            }
            $method = \App\Models\PaymentMethod::where('tenant_id', $tenantId)->findOrFail($paymentMethodId);
            $cashBankId = $method->linked_account_id ? (int) $method->linked_account_id : null;
            if (! $cashBankId) {
                throw new InvalidArgumentException('طريقة الدفع غير مرتبطة بحساب صندوق/بنك.');
            }

            $payments = [];
            foreach ($items as $row) {
                $invoiceId = (int) ($row['invoice_id'] ?? 0);
                $invoice = Invoice::where('tenant_id', $tenantId)
                    ->where('type', 'sales')
                    ->where('is_return', false)
                    ->findOrFail($invoiceId);
                $assignment = DeliveryAssignment::where('tenant_id', $tenantId)
                    ->where('invoice_id', $invoiceId)
                    ->where('driver_id', $driverId)
                    ->where('status', 'assigned')
                    ->first();
                if (! $assignment) {
                    throw new InvalidArgumentException('الفاتورة غير مسندة لهذا السائق أو ليست قيد التحصيل.');
                }
                $amount = isset($row['amount']) ? round((float) $row['amount'], self::DECIMALS) : round((float) $invoice->balance, self::DECIMALS);
                if ($amount < 0.0005) {
                    continue;
                }
                if ($amount - (float) $invoice->balance > 0.01) {
                    throw new InvalidArgumentException('مبلغ التحصيل يتجاوز رصيد الفاتورة #'.($invoice->number ?? $invoice->id));
                }

                $payment = $this->paymentService->createPayment([
                    'tenant_id' => $tenantId,
                    'type' => 'receipt',
                    'date' => $date,
                    'amount' => $amount,
                    'payment_method_id' => $paymentMethodId,
                    'customer_id' => $invoice->customer_id,
                    'invoice_id' => $invoice->id,
                    'branch_id' => $invoice->branch_id,
                    'cost_center_id' => $invoice->cost_center_id,
                    'cash_bank_account_id' => $cashBankId,
                    'counterpart_account_id' => (int) $driver->custody_account_id,
                    'reference' => $invoice->number ?? (string) $invoice->id,
                    'status' => 'posted',
                    'created_by' => $userId ?? auth()->id(),
                ]);
                $payments[] = $payment;

                $invoice->refresh();
                if ((float) $invoice->balance < 0.0005) {
                    $assignment->update([
                        'status' => 'settled',
                        'settled_at' => now(),
                    ]);
                }
            }

            return $payments;
        });
    }

    public function refreshAssignmentIfSettled(Invoice $invoice): void
    {
        $assignment = DeliveryAssignment::where('tenant_id', $invoice->tenant_id)
            ->where('invoice_id', $invoice->id)
            ->where('status', 'assigned')
            ->first();
        if (! $assignment) {
            return;
        }
        $invoice->refresh();
        if ((float) $invoice->balance < 0.0005) {
            $assignment->update([
                'status' => 'settled',
                'settled_at' => now(),
            ]);
        }
    }

    private function assertSalesInvoiceForDelivery(Invoice $invoice): void
    {
        if ($invoice->type !== 'sales' || $invoice->is_return) {
            throw new InvalidArgumentException('التصدير للتوصيل متاح لفواتير المبيعات فقط.');
        }
    }
}
