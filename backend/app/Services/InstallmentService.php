<?php

namespace App\Services;

use App\Models\Account;
use App\Models\Installment;
use App\Models\InstallmentLine;
use App\Models\Invoice;
use App\Models\JournalEntry;
use App\Models\TenantAccountDefault;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class InstallmentService
{
    public function __construct(
        private PaymentService $paymentService,
        private AccountResolutionService $accountResolutionService,
    ) {}

    /**
     * توليد جدول أقساط (بدون حفظ).
     *
     * معادلة التوليد:
     * Due_Date = Start_Date + (Installment_Number * Period_Value)
     *
     * دقة التواريخ:
     * استخدام addMonthsNoOverflow لضمان ثبات "يوم الاستحقاق" قدر الإمكان
     * عند اختلاف عدد أيام الشهور (مثال: فبراير).
     */
    /**
     * حذف جدول أقساط (مسودة أو معتمد) بعد التحقق من عدم وجود تحصيلات،
     * وحذف قيد الاعتماد إن وُجد حتى لا تبقى حركة «إعادة التصنيف» في دفتر العميل.
     */
    public function deleteSchedule(Installment $installment): void
    {
        $installment->load('lines');
        foreach ($installment->lines as $line) {
            $paid = (float) ($line->paid_amount ?? 0);
            if ($paid > 0.0005) {
                throw new \InvalidArgumentException(
                    'لا يمكن حذف الجدول لوجود أقساط محصلة مرتبطة به. يرجى إلغاء أو عكس التحصيلات أولاً.'
                );
            }
            if ($line->payment_id) {
                throw new \InvalidArgumentException(
                    'لا يمكن حذف الجدول لوجود أقساط محصلة مرتبطة به. يرجى إلغاء أو عكس التحصيلات أولاً.'
                );
            }
        }

        $tenantId = (int) $installment->tenant_id;

        DB::transaction(function () use ($installment, $tenantId) {
            $jeId = (int) ($installment->journal_entry_id ?? 0);
            if ($jeId > 0) {
                $entry = JournalEntry::withoutGlobalScopes()->where('tenant_id', $tenantId)->find($jeId);
                if ($entry) {
                    $entry->lines()->delete();
                    $entry->delete();
                }
            }
            $installment->delete();
        });
    }

    public function generateSchedule(int $tenantId, float $totalAmount, string $startDate, int $numInstallments, int $frequencyMonths = 1): array
    {
        $lines = [];
        $remaining = round($totalAmount, 3);
        $start = Carbon::parse($startDate);
        $perInstallment = $numInstallments > 0 ? round($totalAmount / $numInstallments, 3) : 0;

        for ($seq = 1; $seq <= $numInstallments; $seq++) {
            $amount = $seq === $numInstallments
                ? round($remaining, 3)
                : $perInstallment;
            $remaining -= $amount;

            $due = $start->copy()->addMonthsNoOverflow($frequencyMonths * $seq);
            $lines[] = [
                'sequence' => $seq,
                'due_date' => $due->format('Y-m-d'),
                'amount' => round($amount, 3),
                'paid_amount' => 0,
                'status' => 'pending',
            ];
        }

        return $lines;
    }

    /**
     * اعتماد جدول الأقساط إدارياً فقط: لا يُنشأ أي قيد محاسبي.
     * أثر حساب العميل/المورد يبقى من فاتورة المبيعات/المشتريات؛ التحصيل يتم عبر سند القبض/الصرف عند سداد كل قسط.
     */
    public function approve(Installment $installment): Installment
    {
        if ($installment->status === 'approved') {
            return $installment;
        }

        return DB::transaction(function () use ($installment) {
            $installment->update([
                'status' => 'approved',
                'approved_at' => now(),
            ]);

            return $installment->fresh(['lines', 'journalEntry']);
        });
    }

    /** تسجيل سداد جزئي أو كامل بدون سند (استدعاءات داخلية قديمة) */
    public function recordPayment(InstallmentLine $line, float $amount): void
    {
        $newPaid = round((float) $line->paid_amount + $amount, 3);
        $line->update(['paid_amount' => min($newPaid, (float) $line->amount)]);
        $line->updateStatus();
    }

    /**
     * سداد قسط مع توليد سند قبض (عميل) أو سند صرف (مورد) وربطه بالسطر.
     * عند وجود فاتورة مرتبطة بالجدول يُمرَّر invoice_id لتحديث المدفوع/الرصيد على الفاتورة (دون قيد اعتماد جدول منفصل).
     */
    public function payInstallmentLine(InstallmentLine $line, array $input): \App\Models\Payment
    {
        return DB::transaction(function () use ($line, $input) {
            $line->load('installment');
            $installment = $line->installment;
            if ($installment->status !== 'approved') {
                throw new \InvalidArgumentException('يجب اعتماد جدول الأقساط قبل السداد.');
            }
            $remaining = round((float) $line->amount - (float) $line->paid_amount, 3);
            if ($remaining <= 0) {
                throw new \InvalidArgumentException('لا يوجد رصيد متبقي لهذا القسط.');
            }
            $payAmount = round(min((float) ($input['amount'] ?? $remaining), $remaining), 3);
            if ($payAmount <= 0) {
                throw new \InvalidArgumentException('المبلغ غير صالح.');
            }

            $installment->load(['customer', 'vendor']);
            $defaults = TenantAccountDefault::where('tenant_id', $installment->tenant_id)->first();
            $isVendor = (bool) $installment->vendor_id && ! $installment->customer_id;

            if ($isVendor) {
                $counterpartAccountId = (int) ($installment->account_id ?? 0);
                if (! $counterpartAccountId) {
                    throw new \InvalidArgumentException('حدد حساب التزام الأقساط (account_id) على الجدول.');
                }
            } else {
                $customer = $installment->customer;
                $counterpartAccountId = (int) ($customer?->account_id ?? 0);
                if (! $counterpartAccountId) {
                    $counterpartAccountId = (int) ($this->accountResolutionService->resolveStoredDefaultAccountId(
                        (int) $installment->tenant_id,
                        $defaults?->customers_account_id ? (int) $defaults->customers_account_id : null
                    ) ?? 0);
                }
                if (! $counterpartAccountId) {
                    throw new \InvalidArgumentException('ربط العميل بحساب دفتر أستاذ أو تهيئة حساب العملاء الافتراضي مطلوب لتسجيل التحصيل على ذممه.');
                }
            }

            $type = $isVendor ? 'payment' : 'receipt';

            $paymentPayload = [
                'tenant_id' => $installment->tenant_id,
                'type' => $type,
                'date' => $input['date'] ?? now()->format('Y-m-d'),
                'amount' => $payAmount,
                'currency' => $installment->currency,
                'payment_method_id' => $input['payment_method_id'] ?? null,
                'cash_bank_account_id' => $input['cash_bank_account_id'] ?? null,
                'counterpart_account_id' => $counterpartAccountId,
                'customer_id' => $installment->customer_id,
                'vendor_id' => $installment->vendor_id,
                'invoice_id' => $installment->invoice_id,
                'branch_id' => $installment->branch_id ?? ($input['branch_id'] ?? null),
                'notes' => $input['notes'] ?? "سداد قسط رقم {$line->sequence} — جدول {$installment->number}",
                'status' => 'approved',
                'created_by' => auth()->id(),
                /** يمنع توزيعاً تلقائياً على الأقساط داخل createPayment قبل تحديث السطر يدوياً (يُزال قبل الحفظ) */
                '_skip_installment_reconcile' => true,
            ];

            $payment = $this->paymentService->createPayment($paymentPayload);

            $newPaid = round((float) $line->paid_amount + $payAmount, 3);
            $line->update([
                'paid_amount' => min($newPaid, (float) $line->amount),
                'payment_id' => $payment->id,
                'paid_at' => now(),
            ]);
            $line->updateStatus();

            return $payment->fresh(['journalEntry']);
        });
    }

    /** إنشاء جدول أقساط من رصيد فاتورة (مبيعات أو مشتريات) */
    public function createScheduleFromInvoice(
        Invoice $invoice,
        int $tenantId,
        string $startDate,
        int $numInstallments,
        int $frequencyMonths,
        ?int $branchId,
        ?int $overrideAccountId,
    ): Installment {
        $invoice->load(['customer', 'vendor']);
        $balance = round((float) $invoice->balance, 3);
        if ($balance <= 0) {
            throw new \InvalidArgumentException('لا يوجد رصيد متبقي للتقسيط.');
        }

        $defaults = TenantAccountDefault::where('tenant_id', $tenantId)->first();

        if ($invoice->type === 'purchase') {
            if (! $invoice->vendor_id) {
                throw new \InvalidArgumentException('الفاتورة لا تحتوي مورداً.');
            }
            $accountId = $overrideAccountId
                ?? ($defaults?->installments_payable_account_id ? (int) $defaults->installments_payable_account_id : null);
            if (! $accountId) {
                throw new \InvalidArgumentException('حدد حساب أقساط دائنة في إعدادات الأقساط أو اختر حساب التزام في نافذة التقسيط.');
            }
        } else {
            $accountId = $overrideAccountId
                ?? $defaults?->installments_receivable_account_id;
            if (! $accountId) {
                $fallback = Account::where('tenant_id', $tenantId)->where('code', '114')->first();
                $accountId = $fallback?->id;
            }
        }
        if (! $accountId) {
            throw new \InvalidArgumentException('حدد حساب الأقساط في الإعدادات أو مرّر account_id.');
        }

        $lines = $this->generateSchedule($tenantId, $balance, $startDate, $numInstallments, $frequencyMonths);

        $installment = new Installment([
            'tenant_id' => $tenantId,
            'invoice_id' => $invoice->id,
            'customer_id' => $invoice->type === 'sales' ? $invoice->customer_id : null,
            'vendor_id' => $invoice->type === 'purchase' ? $invoice->vendor_id : null,
            'account_id' => $accountId,
            'total_amount' => $balance,
            'currency' => $invoice->currency,
            'start_date' => $startDate,
            'frequency_months' => $frequencyMonths,
            'branch_id' => $branchId ?? $invoice->branch_id,
            'cost_center_id' => $invoice->cost_center_id,
            'notes' => "من فاتورة {$invoice->number}",
            'status' => 'draft',
            'created_by' => auth()->id(),
        ]);
        $installment->save();

        foreach ($lines as $row) {
            InstallmentLine::create([
                'installment_id' => $installment->id,
                'sequence' => $row['sequence'],
                'due_date' => $row['due_date'],
                'amount' => $row['amount'],
                'paid_amount' => 0,
                'status' => 'pending',
            ]);
        }

        return $installment->load('customer', 'vendor', 'invoice', 'lines', 'branch', 'costCenter');
    }
}
