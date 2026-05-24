<?php

namespace App\Services;

use App\Models\Account;
use App\Models\Installment;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\PaymentMethod;
use Illuminate\Support\Facades\DB;

class PaymentService
{
    public function __construct(
        private AccountingService $accountingService,
    ) {}

    /** ربط حساب الصندوق/البنك من طريقة الدفع إن لم يُحدد يدوياً */
    private function resolveCashBankAccount(Payment $payment): void
    {
        if ($payment->cash_bank_account_id || ! $payment->payment_method_id) {
            return;
        }
        $method = PaymentMethod::where('tenant_id', $payment->tenant_id)->find($payment->payment_method_id);
        if ($method?->linked_account_id) {
            $payment->update(['cash_bank_account_id' => $method->linked_account_id]);
            $payment->refresh();
        }
    }

    /** إنشاء قيد محاسبي للسند (يُستدعى عند الاعتماد فقط) */
    private function postPaymentJournal(Payment $payment): void
    {
        $this->resolveCashBankAccount($payment);
        $tenantId = $payment->tenant_id;
        $journalLines = [];
        $costCenterId = $payment->cost_center_id;

        $addLine = function (int $accountId, float $debit, float $credit, string $description) use ($costCenterId, &$journalLines) {
            $journalLines[] = [
                'account_id' => $accountId,
                'debit' => $debit,
                'credit' => $credit,
                'description' => $description,
                'cost_center_id' => $costCenterId,
            ];
        };

        if ($payment->cash_bank_account_id && $payment->counterpart_account_id) {
            if ($payment->type === 'receipt') {
                $addLine($payment->cash_bank_account_id, (float) $payment->amount, 0, "تحصيل #{$payment->number}");
                $addLine($payment->counterpart_account_id, 0, (float) $payment->amount, "تحصيل #{$payment->number}");
            } elseif ($payment->type === 'payment') {
                $addLine($payment->counterpart_account_id, (float) $payment->amount, 0, "سداد #{$payment->number}");
                $addLine($payment->cash_bank_account_id, 0, (float) $payment->amount, "سداد #{$payment->number}");
            } elseif ($payment->type === 'transfer') {
                // الحساب المحوّل منه (صندوق/بنك): دائن | الحساب المقابل في الأسطر: مدين
                $addLine($payment->counterpart_account_id, (float) $payment->amount, 0, "تحويل مالي #{$payment->number}");
                $addLine($payment->cash_bank_account_id, 0, (float) $payment->amount, "تحويل مالي #{$payment->number}");
            }
        } else {
            $cashAccount = Account::where('tenant_id', $tenantId)->where('code', '111')->first();
            if ($payment->type === 'receipt' && $payment->customer_id) {
                $receivableAccount = Account::where('tenant_id', $tenantId)->where('code', '113')->first();
                if ($cashAccount) {
                    $addLine($cashAccount->id, (float) $payment->amount, 0, "تحصيل #{$payment->number}");
                }
                if ($receivableAccount) {
                    $addLine($receivableAccount->id, 0, (float) $payment->amount, "تحصيل من عميل #{$payment->number}");
                }
            } elseif ($payment->type === 'payment' && $payment->vendor_id) {
                $payableAccount = Account::where('tenant_id', $tenantId)->where('code', '221')->first();
                if ($payableAccount) {
                    $addLine($payableAccount->id, (float) $payment->amount, 0, "سداد لمورد #{$payment->number}");
                }
                if ($cashAccount) {
                    $addLine($cashAccount->id, 0, (float) $payment->amount, "سداد #{$payment->number}");
                }
            }
        }

        if (empty($journalLines)) {
            return;
        }

        $entryDescription = match ($payment->type) {
            'receipt' => "قيد سند قبض #{$payment->number}",
            'payment' => "قيد سند صرف #{$payment->number}",
            'transfer' => "قيد تحويل مالي #{$payment->number}",
            default => "قيد دفعة #{$payment->number}",
        };
        $entryType = $payment->type === 'transfer' ? 'transfer' : 'payment';

        $entryData = [
            'tenant_id' => $tenantId,
            'date' => $payment->date,
            'type' => $entryType,
            'description' => $entryDescription,
            'reference_type' => Payment::class,
            'reference_id' => $payment->id,
            'status' => 'posted',
            'created_by' => auth()->id(),
            'posted_at' => now(),
            'branch_id' => $payment->branch_id,
            'customer_id' => $payment->customer_id,
            'vendor_id' => $payment->vendor_id,
        ];
        $entry = $this->accountingService->createJournalEntry($entryData, $journalLines);
        $payment->update(['journal_entry_id' => $entry->id]);
    }

    public function createPayment(array $data): Payment
    {
        return DB::transaction(function () use ($data) {
            $skipInstallmentReconcile = ! empty($data['_skip_installment_reconcile']);
            unset($data['_skip_installment_reconcile']);

            if (! empty($data['invoice_id']) && ! empty($data['tenant_id'])) {
                $invoice = Invoice::where('tenant_id', (int) $data['tenant_id'])->with('customer', 'vendor')->find($data['invoice_id']);
                if ($invoice) {
                    if (empty($data['reference'])) {
                        $data['reference'] = $invoice->number ?? (string) $invoice->id;
                    }
                    if (empty($data['customer_id']) && $invoice->customer_id) {
                        $data['customer_id'] = $invoice->customer_id;
                    }
                    if (empty($data['vendor_id']) && $invoice->vendor_id) {
                        $data['vendor_id'] = $invoice->vendor_id;
                    }
                    if (empty($data['counterpart_account_id'])) {
                        if ($invoice->type === 'sales' && $invoice->customer?->account_id) {
                            $data['counterpart_account_id'] = (int) $invoice->customer->account_id;
                        } elseif ($invoice->type === 'purchase' && $invoice->vendor?->account_id) {
                            $data['counterpart_account_id'] = (int) $invoice->vendor->account_id;
                        }
                    }
                    if (empty($data['branch_id']) && $invoice->branch_id) {
                        $data['branch_id'] = $invoice->branch_id;
                    }
                }
            }

            $payment = Payment::create($data);
            $this->resolveCashBankAccount($payment);

            $status = $data['status'] ?? 'posted';
            $shouldPost = in_array($status, ['approved', 'posted'], true);
            if ($shouldPost) {
                $payment->update(['status' => 'approved']);
                $this->postPaymentJournal($payment);
                $payment->refresh();
            }

            if ($payment->invoice_id) {
                $tid = (int) $payment->tenant_id;
                $this->syncInvoicePaymentTotals($payment->invoice_id, $tid);
                if (! $skipInstallmentReconcile) {
                    $this->reconcileInstallmentLinesWithInvoicePayments($payment->invoice_id, $tid);
                }
            }

            return $payment->load('customer', 'vendor', 'branch', 'costCenter', 'cashBankAccount', 'counterpartAccount', 'paymentMethodRelation.linkedAccount', 'journalEntry', 'invoice');
        });
    }

    /**
     * مطابقة بنود جدول الأقساط المعتمد مع إجمالي سندات الفاتورة.
     * سند القبض/الصرف العادي (بدون payInstallmentLine) يحدّث الفاتورة فقط؛ هذه الدالة توزّع الفرق على الأقساط بالتسلسل.
     * يُستثنى مسار payInstallmentLine عبر createPayment(..., _skip_installment_reconcile) لتجنب الازدواجية.
     */
    private function reconcileInstallmentLinesWithInvoicePayments(int $invoiceId, int $tenantId): void
    {
        $installment = Installment::where('tenant_id', $tenantId)
            ->where('invoice_id', $invoiceId)
            ->where('status', 'approved')
            ->with(['lines' => fn ($q) => $q->orderBy('sequence')])
            ->first();

        if (! $installment || $installment->lines->isEmpty()) {
            return;
        }

        $decimals = (int) (config('app.amount_decimals', 3));
        $totalPaid = round((float) Payment::where('tenant_id', $tenantId)
            ->where('invoice_id', $invoiceId)
            ->whereIn('status', ['approved', 'posted'])
            ->sum('amount'), $decimals);

        $lines = $installment->lines;
        $sumAllocated = round((float) $lines->sum(fn ($l) => (float) $l->paid_amount), $decimals);
        $diff = round($totalPaid - $sumAllocated, $decimals);

        if (abs($diff) <= 0.0005) {
            foreach ($lines as $line) {
                $line->updateStatus();
            }

            return;
        }

        if ($diff < -0.0005) {
            $this->rebuildInstallmentLinesFromInvoicePayments($invoiceId, $tenantId);

            return;
        }

        $toAdd = $diff;
        foreach ($lines->sortBy('sequence') as $line) {
            if ($toAdd <= 0.0005) {
                break;
            }
            $remainingOnLine = round((float) $line->amount - (float) $line->paid_amount, $decimals);
            if ($remainingOnLine <= 0.0005) {
                continue;
            }
            $add = round(min($toAdd, $remainingOnLine), $decimals);
            $cap = (float) $line->amount;
            $newPaid = round(min($cap, (float) $line->paid_amount + $add), $decimals);
            $line->update(['paid_amount' => $newPaid]);
            $line->updateStatus();
            $toAdd = round($toAdd - $add, $decimals);
        }
    }

    /**
     * إعادة توزيع مدفوعات الفاتورة على بنود جدول الأقساط من الصفر (FIFO).
     * يُستخدم بعد حذف/إلغاء سند لضمان عدم بقاء أقساط «محصّلة» دون سند فعّال، ومعالجة السندات غير المربوطة بـ payment_id.
     */
    private function rebuildInstallmentLinesFromInvoicePayments(int $invoiceId, int $tenantId): void
    {
        $installment = Installment::where('tenant_id', $tenantId)
            ->where('invoice_id', $invoiceId)
            ->where('status', 'approved')
            ->with(['lines' => fn ($q) => $q->orderBy('sequence')])
            ->first();

        if (! $installment || $installment->lines->isEmpty()) {
            return;
        }

        $decimals = (int) (config('app.amount_decimals', 3));
        $totalPaid = round((float) Payment::where('tenant_id', $tenantId)
            ->where('invoice_id', $invoiceId)
            ->whereIn('status', ['approved', 'posted'])
            ->sum('amount'), $decimals);

        foreach ($installment->lines as $line) {
            $line->update([
                'paid_amount' => 0,
                'payment_id' => null,
                'paid_at' => null,
            ]);
        }

        $installment->load(['lines' => fn ($q) => $q->orderBy('sequence')]);
        $toAdd = $totalPaid;
        foreach ($installment->lines->sortBy('sequence') as $line) {
            if ($toAdd <= 0.0005) {
                break;
            }
            $remainingOnLine = round((float) $line->amount - (float) $line->paid_amount, $decimals);
            if ($remainingOnLine <= 0.0005) {
                continue;
            }
            $add = round(min($toAdd, $remainingOnLine), $decimals);
            $cap = (float) $line->amount;
            $newPaid = round(min($cap, (float) $line->paid_amount + $add), $decimals);
            $line->update(['paid_amount' => $newPaid]);
            $toAdd = round($toAdd - $add, $decimals);
        }

        foreach ($installment->lines as $line) {
            $line->updateStatus();
        }
    }

    /**
     * بعد إزالة سند من قاعدة البيانات أو إلغائه: مزامنة الفاتورة وإعادة بناء الأقساط.
     */
    public function syncInvoiceAndRebuildInstallmentLines(?int $invoiceId, int $tenantId): void
    {
        if (! $invoiceId) {
            return;
        }
        $this->syncInvoicePaymentTotals($invoiceId, $tenantId);
        $this->rebuildInstallmentLinesFromInvoicePayments($invoiceId, $tenantId);
    }

    /** تحديث إجمالي المدفوع والرصيد وحالة الفاتورة من مجموع سنداتها. */
    private function syncInvoicePaymentTotals(int $invoiceId, ?int $tenantId = null): void
    {
        $invoice = $tenantId
            ? Invoice::where('tenant_id', $tenantId)->find($invoiceId)
            : Invoice::withoutGlobalScopes()->find($invoiceId);
        if (! $invoice) {
            return;
        }
        $tid = $tenantId ?? $invoice->tenant_id;
        $totalPaid = (float) Payment::where('tenant_id', $tid)
            ->where('invoice_id', $invoiceId)
            ->whereIn('status', ['approved', 'posted'])
            ->sum('amount');
        $total = (float) $invoice->total;
        $balance = round($total - $totalPaid, (int) (config('app.amount_decimals', 3)));
        $invoice->update([
            'amount_paid' => round($totalPaid, (int) (config('app.amount_decimals', 3))),
            'balance' => $balance,
        ]);
        InvoiceStatusResolver::applyToModel($invoice->fresh());
        if ($invoice->type === 'sales' && ! $invoice->is_return) {
            app(DeliveryService::class)->refreshAssignmentIfSettled($invoice->fresh());
        }
    }

    /** اعتماد السند: ترحيل القيد المحاسبي (للسندات المسودة فقط) */
    public function approvePayment(Payment $payment): Payment
    {
        if (in_array($payment->status, ['approved', 'posted'], true)) {
            return $payment;
        }
        if ($payment->status === 'cancelled') {
            throw new \InvalidArgumentException('لا يمكن اعتماد سند ملغى.');
        }

        return DB::transaction(function () use ($payment) {
            $payment->update(['status' => 'approved']);
            $this->postPaymentJournal($payment);
            $payment->refresh();
            if ($payment->invoice_id) {
                $tid = (int) $payment->tenant_id;
                $this->syncInvoicePaymentTotals($payment->invoice_id, $tid);
                $this->reconcileInstallmentLinesWithInvoicePayments($payment->invoice_id, $tid);
            }

            return $payment->load('customer', 'vendor', 'branch', 'costCenter', 'cashBankAccount', 'counterpartAccount', 'paymentMethodRelation.linkedAccount', 'journalEntry');
        });
    }

    /** إلغاء السند: عكس القيد وتحديث حالة الفاتورة إن وُجدت */
    public function cancelPayment(Payment $payment): Payment
    {
        if ($payment->status === 'cancelled') {
            return $payment;
        }

        return DB::transaction(function () use ($payment) {
            if ($payment->journal_entry_id) {
                $entry = \App\Models\JournalEntry::withoutGlobalScopes()->find($payment->journal_entry_id);
                if ($entry) {
                    $entry->lines()->delete();
                    $entry->delete();
                }
            }
            $payment->update(['status' => 'cancelled', 'journal_entry_id' => null]);

            if ($payment->invoice_id) {
                $tid = (int) $payment->tenant_id;
                $this->syncInvoiceAndRebuildInstallmentLines($payment->invoice_id, $tid);
            }

            return $payment->load('customer', 'vendor', 'invoice', 'journalEntry');
        });
    }

    /**
     * تعديل السند (مسودة أو معتمد). إن كان معتمداً يُحدَّث القيد المحاسبي تلقائياً ليعكس التعديلات.
     */
    public function updatePayment(Payment $payment, array $data): Payment
    {
        if ($payment->status === 'cancelled') {
            throw new \InvalidArgumentException('لا يمكن تعديل سند ملغى.');
        }

        return DB::transaction(function () use ($payment, $data) {
            $hadJournal = (int) $payment->journal_entry_id > 0;

            if ($hadJournal) {
                $entry = \App\Models\JournalEntry::withoutGlobalScopes()->find($payment->journal_entry_id);
                if ($entry) {
                    $entry->lines()->delete();
                    $entry->delete();
                }
                $payment->update(['journal_entry_id' => null]);
            }

            $payment->update($data);
            $payment->refresh();
            $this->resolveCashBankAccount($payment);

            if (in_array($payment->status, ['approved', 'posted'], true)) {
                $this->postPaymentJournal($payment);
                $payment->refresh();
            }

            if ($payment->invoice_id) {
                $tid = (int) $payment->tenant_id;
                $this->syncInvoicePaymentTotals($payment->invoice_id, $tid);
                $this->reconcileInstallmentLinesWithInvoicePayments($payment->invoice_id, $tid);
            }

            return $payment->load('customer', 'vendor', 'branch', 'costCenter', 'cashBankAccount', 'counterpartAccount', 'paymentMethodRelation.linkedAccount', 'journalEntry');
        });
    }
}
