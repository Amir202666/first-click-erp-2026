<?php

namespace App\Services;

use App\Models\Installment;
use App\Models\InventoryMovement;
use App\Models\Invoice;
use App\Models\InvoiceLine;
use App\Models\InvoiceManufacturingFrozenBatch;
use App\Models\Item;
use App\Models\JournalEntry;
use App\Models\JournalEntryLine;
use App\Models\Payment;
use Illuminate\Support\Facades\DB;

class InvoiceService
{
    public function __construct(
        private AccountingService $accountingService,
        private AccountResolutionService $accountResolutionService,
        private InvoicePostingService $invoicePostingService,
        private PaymentService $paymentService,
        private SerialNumbersService $serialNumbersService,
        private PurchaseAdditionalExpenseService $purchaseAdditionalExpenseService,
        private InventoryService $inventoryService,
    ) {}

    /**
     * @param  array<string, mixed>  $data
     * @param  array<int, array<string, mixed>>  $lines
     * @param  bool  $postImmediately  إذا false تُترك الفاتورة كمسودة (مثلاً طلبات المطعم حتى التحصيل)
     */
    public function createInvoice(array $data, array $lines, bool $postImmediately = true): Invoice
    {
        return DB::transaction(function () use ($data, $lines, $postImmediately) {
            $additionalExpenses = $data['additional_expenses'] ?? [];
            unset($data['additional_expenses']);
            if (! empty($data['is_return'])) {
                $data['number'] = $this->generateNextReturnNumber((int) $data['tenant_id'], $data['type']);
            } else {
                unset($data['number']);
            }
            unset($data['sales_payment_tab']);
            $invoice = Invoice::create($data);
            $this->saveLines($invoice, $lines);
            if ($invoice->type === 'purchase' && ! $invoice->is_return) {
                $this->purchaseAdditionalExpenseService->sync($invoice->fresh(['lines.item']), is_array($additionalExpenses) ? $additionalExpenses : []);
            }
            $this->recalculateInvoice($invoice->fresh(['lines']), (float) ($data['discount_amount'] ?? 0), (float) ($data['amount_paid'] ?? 0));

            if ($postImmediately) {
                // الترحيل التلقائي المباشر: توليد قيد محاسبي فوراً دون خطوة ترحيل يدوي منفصلة
                $invoice = $this->postInvoice($invoice->fresh(['lines.item', 'lines.item.category', 'customer', 'vendor', 'additionalExpenses']));

                return $invoice->fresh([
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
            }

            return $invoice->fresh([
                'lines.item',
                'customer',
                'vendor',
                'additionalExpenses.expenseAccount',
                'additionalExpenses.creditorAccount',
            ]);
        });
    }

    private function generateNextReturnNumber(int $tenantId, string $type): string
    {
        $prefix = $type === 'sales' ? 'SR' : 'PR';
        $numbers = Invoice::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->where('is_return', true)
            ->where('type', $type)
            ->where('number', 'like', $prefix.'-%')
            ->pluck('number');

        $max = 0;
        foreach ($numbers as $numStr) {
            $n = (int) substr($numStr, 4);
            if ($n > $max) {
                $max = $n;
            }
        }

        return $prefix.'-'.str_pad((string) ($max + 1), 6, '0', STR_PAD_LEFT);
    }

    public function updateInvoice(Invoice $invoice, array $data, array $lines, bool $adminOnly = false): Invoice
    {
        return DB::transaction(function () use ($invoice, $data, $lines, $adminOnly) {
            if ($adminOnly) {
                $allowed = ['customer_id', 'vendor_id', 'branch_id', 'warehouse_id', 'cost_center_id', 'reference_number', 'notes', 'date', 'due_date'];
                $invoiceData = array_intersect_key($data, array_flip($allowed));
                $invoice->update($invoiceData);

                return $invoice->fresh(['lines.item', 'customer', 'vendor', 'journalEntry.lines.account', 'manufacturingJournalEntry.lines.account']);
            }

            $wasPosted = (bool) $invoice->journal_entry_id;

            $hasLinkedPayments = $invoice->payments()->exists();
            $additionalExpenses = $data['additional_expenses'] ?? null;
            $invoiceData = array_diff_key($data, array_flip(['lines', 'number', 'additional_expenses']));
            unset($invoiceData['number']);
            if ($hasLinkedPayments) {
                unset($invoiceData['amount_paid']);
            }
            $invoice->update($invoiceData);
            $invoice->lines()->delete();
            $this->saveLines($invoice, $lines);
            if ($invoice->type === 'purchase' && ! $invoice->is_return && array_key_exists('additional_expenses', $data)) {
                $payload = is_array($additionalExpenses) ? $additionalExpenses : [];
                $this->purchaseAdditionalExpenseService->sync($invoice->fresh(['lines.item']), $payload);
            }
            $amountPaid = $hasLinkedPayments
                ? (float) $invoice->amount_paid
                : (float) ($data['amount_paid'] ?? $invoice->amount_paid);
            $this->recalculateInvoice($invoice->fresh(['lines']), (float) ($data['discount_amount'] ?? $invoice->discount_amount), $amountPaid);

            if ($wasPosted) {
                $this->reversePostedInvoiceImpactAndRepost($invoice->fresh(['lines.item', 'lines.item.category', 'customer', 'vendor']));
            }

            return $invoice->fresh([
                'lines.item',
                'customer',
                'vendor',
                'journalEntry.lines.account',
                'manufacturingJournalEntry.lines.account',
                'additionalExpenses.expenseAccount',
                'additionalExpenses.creditorAccount',
            ]);
        });
    }

    /**
     * إعادة بناء القيد المحاسبي والحركات المخزنية لفاتورة مبيعات مرحّلة (نفس أثر «حفظ» بعد تعديل الإعدادات أو المنطق).
     * لا يغيّر رقم الفاتورة؛ يحذف القيد السابق ويُنشئ قيداً جديداً.
     */
    public function rebuildPostedSalesInvoiceJournal(Invoice $invoice): Invoice
    {
        return DB::transaction(function () use ($invoice) {
            $invoice = $invoice->fresh(['lines.item', 'lines.item.category', 'customer', 'vendor']);
            if ($invoice->type !== 'sales') {
                throw new \RuntimeException('يُقتصر إعادة بناء القيد على فواتير المبيعات.');
            }
            if ($invoice->status === 'cancelled') {
                throw new \RuntimeException('لا يمكن إعادة بناء قيد لفاتورة ملغاة.');
            }
            if (! $invoice->journal_entry_id) {
                throw new \RuntimeException('الفاتورة ليست مرحّلة أو لا يوجد قيد مرتبط.');
            }

            $this->reversePostedInvoiceImpactAndRepost($invoice);

            return $invoice->fresh([
                'lines.item', 'customer', 'vendor', 'journalEntry.lines.account', 'manufacturingJournalEntry.lines.account', 'payments',
            ]);
        });
    }

    public function postInvoice(Invoice $invoice): Invoice
    {
        return DB::transaction(function () use ($invoice) {
            $invoice = $invoice->load(['lines.item.category', 'customer', 'vendor', 'additionalExpenses']);
            $this->accountResolutionService->validateInvoiceForPosting($invoice);

            $tenantId = $invoice->tenant_id;
            $journalLines = [];
            $desc = $invoice->is_return ? "مرتجع #{$invoice->number}" : "قيد فاتورة #{$invoice->number}";

            if ($invoice->is_return) {
                if ($invoice->type === 'sales') {
                    $journalLines = $this->buildSalesReturnJournalLines($invoice, $tenantId);
                    $this->createSalesReturnInventoryMovements($invoice, $tenantId);
                } else {
                    $journalLines = $this->buildPurchaseReturnJournalLines($invoice, $tenantId);
                    $this->createPurchaseReturnInventoryMovements($invoice, $tenantId);
                }
            } elseif ($invoice->type === 'sales') {
                return $this->invoicePostingService->postSalesInvoice($invoice->fresh(['lines.item', 'customer']));
            } else {
                $journalLines = $this->buildPurchaseJournalLines($invoice, $tenantId);
                $this->createPurchaseInventoryMovements($invoice, $tenantId);
            }

            if (! empty($journalLines)) {
                $entry = $this->accountingService->createJournalEntry([
                    'tenant_id' => $tenantId,
                    'date' => $invoice->date,
                    'type' => $invoice->type === 'sales' ? 'sales' : 'purchase',
                    'description' => $desc,
                    'customer_id' => $invoice->customer_id,
                    'vendor_id' => $invoice->vendor_id,
                    'branch_id' => $invoice->branch_id,
                    'reference_type' => Invoice::class,
                    'reference_id' => $invoice->id,
                    'status' => 'posted',
                    'created_by' => auth()->id(),
                    'posted_at' => now(),
                ], $journalLines);

                $invoice->update([
                    'journal_entry_id' => $entry->id,
                ]);
                InvoiceStatusResolver::applyToModel($invoice->fresh());
            }

            // لا يُنشأ سند قبض/صرف تلقائياً من الفاتورة — السند هو المصدر الوحيد لحركة النقدية؛ يُضاف من نافذة سند القبض/الصرف مع ربط المرجع بالفاتورة.
            return $invoice->fresh([
                'lines.item',
                'customer',
                'vendor',
                'journalEntry.lines.account',
                'payments',
                'additionalExpenses.expenseAccount',
                'additionalExpenses.creditorAccount',
            ]);
        });
    }

    public function cancelInvoice(Invoice $invoice): Invoice
    {
        return DB::transaction(function () use ($invoice) {
            // إلغاء سندات القبض/الصرف المرتبطة بالفاتورة (عكس قيودها وتحديث رصيد الفاتورة)
            foreach ($invoice->payments()->get() as $payment) {
                $this->paymentService->cancelPayment($payment);
            }

            if ($invoice->journal_entry_id || $invoice->manufacturing_journal_entry_id) {
                $this->reverseJournalEntry($invoice);
            }
            $this->reverseInventoryMovements($invoice);
            InvoiceManufacturingFrozenBatch::where('invoice_id', $invoice->id)->delete();

            $invoice->update([
                'status' => 'cancelled',
                'document_status' => 'cancelled',
                'payment_status' => 'na',
                'journal_entry_id' => null,
                'manufacturing_journal_entry_id' => null,
                'amount_paid' => 0,
                'balance' => $invoice->total,
            ]);

            return $invoice->fresh();
        });
    }

    /**
     * إلغاء الترحيل: حذف فعلي (Hard Delete) للقيد المحاسبي وقيود السندات التابعة، عكس الحركات المخزنية، وإعادة الفاتورة لمسودة.
     * - حذف القيد المرتبط بالفاتورة (بمعرف القيد أو برقم المرجع reference_type/reference_id).
     * - حذف أي قيود ناتجة عن سندات قبض/صرف مولدة للفاتورة.
     * - إعادة الصنف للمخزن (عكس حركات المخزون) وإعادة رصيد العميل/المورد تلقائياً بحذف القيود.
     */
    public function unpostInvoice(Invoice $invoice): Invoice
    {
        return DB::transaction(function () use ($invoice) {
            $this->deleteJournalEntryAndRelatedVouchersForInvoice($invoice);
            $this->reverseInventoryMovements($invoice);
            InvoiceManufacturingFrozenBatch::where('invoice_id', $invoice->id)->delete();

            $total = (float) ($invoice->total ?? 0);
            $invoice->update([
                'status' => 'draft',
                'document_status' => 'draft',
                'payment_status' => 'na',
                'journal_entry_id' => null,
                'manufacturing_journal_entry_id' => null,
                'amount_paid' => 0,
                'balance' => $total,
                'cost_amount' => null,
                'auto_manufacturing_applied' => false,
            ]);

            return $invoice->fresh();
        });
    }

    /** حذف الفاتورة مع حذف القيد المحاسبي والحركات المخزنية المولّدة منها */
    public function forceDeleteInvoice(Invoice $invoice): void
    {
        DB::transaction(function () use ($invoice) {
            $this->removeLinkedInstallmentSchedulesForInvoice($invoice);

            if ($invoice->journal_entry_id || $invoice->manufacturing_journal_entry_id) {
                $this->deleteJournalEntryForInvoice($invoice);
            }
            $this->reverseInventoryMovements($invoice);
            $invoice->lines()->delete();
            $invoice->delete();
        });
    }

    /**
     * قبل حذف الفاتورة: رفض الحذف إن وُجدت أقساط محصّلة على الجدول المرتبط؛
     * وإلا حذف جدول الأقساط وقيد اعتماده (إن وُجد) حتى لا يبقى قيد «إعادة التصنيف» يفسد أرصدة العميل.
     */
    private function removeLinkedInstallmentSchedulesForInvoice(Invoice $invoice): void
    {
        $tenantId = (int) $invoice->tenant_id;
        $installments = Installment::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->where('invoice_id', $invoice->id)
            ->with('lines')
            ->get();

        foreach ($installments as $installment) {
            foreach ($installment->lines as $line) {
                $paid = (float) ($line->paid_amount ?? 0);
                if ($paid > 0.0005) {
                    throw new \InvalidArgumentException(
                        'لا يمكن حذف الفاتورة لوجود أقساط محصلة مرتبطة بها. يرجى إلغاء أو عكس تحصيلات الأقساط أولاً.'
                    );
                }
                if ($line->payment_id) {
                    throw new \InvalidArgumentException(
                        'لا يمكن حذف الفاتورة لوجود أقساط محصلة مرتبطة بها. يرجى إلغاء أو عكس تحصيلات الأقساط أولاً.'
                    );
                }
            }

            $jeId = (int) ($installment->journal_entry_id ?? 0);
            if ($jeId > 0) {
                $entry = JournalEntry::withoutGlobalScopes()->where('tenant_id', $tenantId)->find($jeId);
                if ($entry) {
                    $entry->lines()->delete();
                    $entry->delete();
                }
            }

            $installment->delete();
        }
    }

    private function saveLines(Invoice $invoice, array $lines): void
    {
        $decimals = $invoice->getCurrencyDecimalPlaces();
        $allowed = array_flip((new InvoiceLine)->getFillable());
        foreach ($lines as $i => $lineData) {
            $serialNumbers = $lineData['serial_numbers'] ?? null;
            if ($serialNumbers !== null && ! is_array($serialNumbers)) {
                $serialNumbers = null;
            }
            unset($lineData['landed_cost_allocated']);
            $attrs = array_intersect_key($lineData, $allowed);
            $attrs['serial_numbers'] = $serialNumbers;
            $line = new InvoiceLine($attrs);
            $line->invoice_id = $invoice->id;
            $line->sort_order = $i;
            $line->calculateTotals();
            $line->amount = round((float) $line->amount, $decimals);
            $line->tax_amount = round((float) $line->tax_amount, $decimals);
            $line->total = round((float) $line->total, $decimals);
            $line->save();
        }
    }

    /**
     * التسلسل المحاسبي: المجموع الفرعي → الخصم → الوعاء الضريبي → الضريبة (نسبة المستأجر) → الصافي.
     * للفواتير المرتجعة: الضريبة المستردة تُحسب آلياً على الكمية المرتجعة فقط (البنود المعاد إدخالها).
     */
    private function recalculateInvoice(Invoice $invoice, float $headerDiscount, float $amountPaid): void
    {
        $decimals = $invoice->getCurrencyDecimalPlaces();
        $lines = $invoice->lines()->get();

        // 1) المجموع الفرعي (قبل أي خصم أو ضريبة)
        $rawSubtotal = $lines->sum(fn ($l) => (float) $l->quantity * (float) $l->unit_price);
        $rawSubtotal = round($rawSubtotal, $decimals);

        // 2) الخصم: خصم البنود + خصم الرأس
        $amountAfterLineDiscount = round((float) $invoice->lines()->sum('amount'), $decimals);
        $lineDiscountTotal = round($rawSubtotal - $amountAfterLineDiscount, $decimals);
        $totalDiscount = round($lineDiscountTotal + $headerDiscount, $decimals);

        // 3) الوعاء الضريبي = المجموع الفرعي - الخصم + الإضافات (رسوم توصيل/نقل وغيرها)
        $taxableBeforeDelivery = round(max(0, $rawSubtotal - $totalDiscount), $decimals);
        $deliveryExtra = round((float) ($invoice->delivery_fees_total ?? 0), $decimals);
        $taxableAmount = round($taxableBeforeDelivery + $deliveryExtra, $decimals);

        // 4) الضريبة: مجموع ضريبة البنود، مُقيّسة تناسبياً عند دمج الإضافات في الوعاء الضريبي
        $taxSumLines = (float) $lines->sum('tax_amount');
        if ($taxableBeforeDelivery > 0.0000001) {
            $taxAmount = round($taxSumLines * ($taxableAmount / $taxableBeforeDelivery), $decimals);
        } else {
            $taxAmount = round($taxSumLines, $decimals);
        }

        // 5) الصافي النهائي = الوعاء الضريبي (يشمل الإضافات) + الضريبة
        $total = round($taxableAmount + $taxAmount, $decimals);

        if ($amountPaid > 0 && $amountPaid > $total) {
            throw new \InvalidArgumentException('المبلغ المدفوع لا يمكن أن يكون أكبر من إجمالي الفاتورة.');
        }
        $balance = round($total - $amountPaid, $decimals);

        $invoice->update([
            'subtotal' => $rawSubtotal,
            'tax_amount' => $taxAmount,
            'discount_amount' => round($headerDiscount, $decimals),
            'total' => $total,
            'amount_paid' => round($amountPaid, $decimals),
            'balance' => $balance,
        ]);
        $invoice->refresh();
        InvoiceStatusResolver::applyToModel($invoice);
    }

    private function reverseJournalEntry(Invoice $invoice): void
    {
        foreach (array_filter([
            $invoice->journal_entry_id ? (int) $invoice->journal_entry_id : null,
            $invoice->manufacturing_journal_entry_id ? (int) $invoice->manufacturing_journal_entry_id : null,
        ]) as $jid) {
            JournalEntry::where('id', $jid)->update(['status' => 'void']);
        }
        $invoice->update([
            'journal_entry_id' => null,
            'manufacturing_journal_entry_id' => null,
        ]);
    }

    /**
     * معرفات القيد/القيود المحاسبية للفاتورة فقط (مرجع Invoice)، دون سندات القبض/الصرف.
     *
     * @return array<int, int>
     */
    private function collectInvoiceMainJournalEntryIds(Invoice $invoice): array
    {
        $tenantId = $invoice->tenant_id;
        $invoiceId = $invoice->id;
        $ids = [];
        if ($invoice->journal_entry_id) {
            $ids[] = (int) $invoice->journal_entry_id;
        }
        if ($invoice->manufacturing_journal_entry_id) {
            $ids[] = (int) $invoice->manufacturing_journal_entry_id;
        }
        $byRef = JournalEntry::where('tenant_id', $tenantId)
            ->where('reference_type', Invoice::class)
            ->where('reference_id', $invoiceId)
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();

        return array_values(array_unique(array_merge($ids, $byRef)));
    }

    /**
     * @param  array<int, int>  $entryIds
     */
    private function hardDeleteJournalEntriesByIds(array $entryIds, int $tenantId): void
    {
        foreach ($entryIds as $eid) {
            $eid = (int) $eid;
            if ($eid <= 0) {
                continue;
            }
            JournalEntryLine::where('journal_entry_id', $eid)->delete();
            JournalEntry::where('id', $eid)->where('tenant_id', $tenantId)->delete();
        }
    }

    /**
     * حذف القيد الرئيسي للفاتورة فقط (Hard Delete) مع الإبقاء على سندات القبض/الصرف وقيودها.
     */
    private function deleteInvoiceMainJournalEntryOnly(Invoice $invoice): void
    {
        $tenantId = $invoice->tenant_id;
        $ids = $this->collectInvoiceMainJournalEntryIds($invoice);
        $this->hardDeleteJournalEntriesByIds($ids, $tenantId);
        $invoice->update([
            'journal_entry_id' => null,
            'manufacturing_journal_entry_id' => null,
        ]);
    }

    /**
     * تعديل بأثر كامل: عكس الحركات المخزنية، إلغاء القيد القديم، ثم ترحيل من جديد (قيد جديد + حركات جديدة) مع نفس رقم الفاتورة والمعرّف.
     */
    private function reversePostedInvoiceImpactAndRepost(Invoice $invoice): void
    {
        $invoice = $invoice->load(['lines.item', 'lines.item.category', 'customer', 'vendor', 'additionalExpenses']);
        $this->reverseInventoryMovements($invoice);
        $this->deleteInvoiceMainJournalEntryOnly($invoice);

        $fresh = $invoice->fresh(['lines.item', 'lines.item.category', 'customer', 'vendor', 'additionalExpenses']);
        if (! $fresh) {
            return;
        }

        $this->postInvoice($fresh);
    }

    /**
     * حذف فعلي للقيد المحاسبي المرتبط بالفاتورة (بمعرف القيد أو برقم المرجع).
     * يُستدعى عند حذف الفاتورة.
     */
    private function deleteJournalEntryForInvoice(Invoice $invoice): void
    {
        $this->deleteJournalEntryAndRelatedVouchersForInvoice($invoice);
    }

    /**
     * حذف فعلي (Hard Delete) لجميع القيود المرتبطة بالفاتورة:
     * 1) القيد الرئيسي للفاتورة (بـ journal_entry_id أو reference_type/reference_id).
     * 2) سندات القبض/الصرف التابعة (حذف السند يحذف قيده تلقائياً ويُحدّث الفاتورة).
     */
    private function deleteJournalEntryAndRelatedVouchersForInvoice(Invoice $invoice): void
    {
        $tenantId = $invoice->tenant_id;
        $invoiceId = $invoice->id;

        $payments = Payment::where('tenant_id', $tenantId)->where('invoice_id', $invoiceId)->get();
        foreach ($payments as $payment) {
            $payment->delete();
        }

        $entryIdsToDelete = $this->collectInvoiceMainJournalEntryIds($invoice);
        $this->hardDeleteJournalEntriesByIds($entryIdsToDelete, $tenantId);

        $invoice->update([
            'journal_entry_id' => null,
            'manufacturing_journal_entry_id' => null,
        ]);
    }

    private function reverseInventoryMovements(Invoice $invoice): void
    {
        InventoryMovement::where('tenant_id', $invoice->tenant_id)
            ->where('reference_type', Invoice::class)
            ->where('reference_id', $invoice->id)
            ->delete();
    }

    private function buildSalesJournalLines(Invoice $invoice, int $tenantId): array
    {
        $defaults = $this->accountResolutionService->getDefaults($tenantId);
        $lines = [];

        $receivableAccountId = null;
        if ($invoice->payment_timing === 'paid') {
            $receivableAccountId = $defaults->cash_account_id ?? $defaults->bank_account_id;
        } else {
            if ($invoice->customer_id && $invoice->customer) {
                $receivableAccountId = $invoice->customer->account_id ? (int) $invoice->customer->account_id : null;
                if (! $receivableAccountId) {
                    throw new \RuntimeException(
                        'العميل المختار غير مرتبط بحساب في دليل الحسابات. يرجى ربط العميل بحساب فرعي (من بيانات العميل).'
                    );
                }
            } else {
                $receivableAccountId = $defaults->customers_account_id;
            }
        }
        if ($receivableAccountId) {
            $lines[] = [
                'account_id' => $receivableAccountId,
                'debit' => (float) $invoice->total,
                'credit' => 0,
                'description' => "فاتورة مبيعات #{$invoice->number}",
            ];
        }

        if ($defaults->sales_account_id) {
            $lines[] = [
                'account_id' => $defaults->sales_account_id,
                'debit' => 0,
                'credit' => (float) $invoice->subtotal,
                'description' => "إيراد مبيعات #{$invoice->number}",
            ];
        }
        if ($defaults->tax_payable_account_id && (float) $invoice->tax_amount > 0) {
            $lines[] = [
                'account_id' => $defaults->tax_payable_account_id,
                'debit' => 0,
                'credit' => (float) $invoice->tax_amount,
                'description' => "ضريبة مبيعات #{$invoice->number}",
            ];
        }

        // إجمالي الخصم = المجموع الفرعي − الوعاء الضريبي (للقيد المحاسبي)
        $totalDiscount = (float) $invoice->subtotal - ((float) $invoice->total - (float) $invoice->tax_amount);
        if ($defaults->discounts_account_id && $totalDiscount > 0) {
            $decimals = $invoice->getCurrencyDecimalPlaces();
            $lines[] = [
                'account_id' => $defaults->discounts_account_id,
                'debit' => round($totalDiscount, $decimals),
                'credit' => 0,
                'description' => "خصم مبيعات #{$invoice->number}",
            ];
        }

        foreach ($invoice->lines as $line) {
            if (! $line->item_id || ! $line->item) {
                continue;
            }
            $item = $line->item;
            $cost = (float) $line->quantity * (float) $item->cost_price;
            if ($cost <= 0) {
                continue;
            }
            $cogsAccountId = $this->accountResolutionService->resolveCogsAccount($item, $defaults);
            $inventoryAccountId = $this->accountResolutionService->resolveInventoryAccount($item, $defaults);
            if ($cogsAccountId) {
                $lines[] = [
                    'account_id' => $cogsAccountId,
                    'debit' => round($cost, 4),
                    'credit' => 0,
                    'description' => "تكلفة مبيعات #{$invoice->number} - {$item->name}",
                ];
            }
            if ($inventoryAccountId) {
                $lines[] = [
                    'account_id' => $inventoryAccountId,
                    'debit' => 0,
                    'credit' => round($cost, 4),
                    'description' => "خروج مخزون #{$invoice->number} - {$item->name}",
                ];
            }
        }

        return $lines;
    }

    private function buildPurchaseJournalLines(Invoice $invoice, int $tenantId): array
    {
        $defaults = $this->accountResolutionService->getDefaults($tenantId);
        $lines = [];
        $invoice->loadMissing('additionalExpenses');
        $jeDec = \App\Services\AccountingService::JOURNAL_AMOUNT_DECIMALS;

        // تجميع مشتريات الفاتورة في بنود مجمّعة حسب حساب المخزون/المشتريات (قيمة البضاعة + المصاريف الموزّعة على الأصناف)
        $byAccount = [];
        foreach ($invoice->lines as $line) {
            $invAccountId = null;
            $amount = (float) $line->amount;
            $landed = round((float) ($line->landed_cost_allocated ?? 0), $jeDec);
            $inventoryDebit = round($amount + $landed, $jeDec);
            if ($inventoryDebit <= 0) {
                continue;
            }
            if ($line->item_id && $line->item) {
                $invAccountId = $this->accountResolutionService->resolveInventoryAccount($line->item, $defaults);
            }
            if (! $invAccountId) {
                $invAccountId = $defaults->inventory_account_id;
            }
            if (! $invAccountId) {
                continue;
            }
            $byAccount[$invAccountId] = ($byAccount[$invAccountId] ?? 0) + $inventoryDebit;
        }

        $extraPurchaseTax = 0.0;
        $defaultInvId = (int) ($defaults->inventory_account_id ?? 0);
        $additionalExpenseCreditorLines = [];
        foreach ($invoice->additionalExpenses as $exp) {
            $net = round((float) $exp->amount_net, $jeDec);
            $tax = round((float) $exp->tax_amount, $jeDec);
            $total = round((float) $exp->total_amount, $jeDec);
            if ($total <= 0 && $net <= 0 && $tax <= 0) {
                continue;
            }
            $snapshot = $exp->distribution_snapshot;
            $allocatedToInventory = is_array($snapshot)
                && array_sum(array_map('floatval', $snapshot)) > 0.0000001;
            // في الجرد المستمر: صافي المصروف الإضافي يُدمَج دائماً في تكلفة المخزون.
            // إذا لم يمكن توزيعه على الأصناف (snapshot فارغ) يُضاف لنفس تجميعة مدين المخزون الافتراضي (لا سطر مصروف منفصل).
            if ($net > 0 && ! $allocatedToInventory && $defaultInvId > 0) {
                $byAccount[$defaultInvId] = ($byAccount[$defaultInvId] ?? 0) + $net;
            }
            if ($tax > 0) {
                $extraPurchaseTax += $tax;
            }
            if ($exp->creditor_account_id && $total > 0) {
                $additionalExpenseCreditorLines[] = [
                    'account_id' => (int) $exp->creditor_account_id,
                    'debit' => 0,
                    'credit' => $total,
                    'description' => ($exp->description ?: 'مصاريف شراء')." — فاتورة مشتريات {$invoice->number}",
                ];
            }
        }

        foreach ($byAccount as $accountId => $amount) {
            $lines[] = [
                'account_id' => $accountId,
                'debit' => round($amount, $jeDec),
                'credit' => 0,
                'description' => "فاتورة مشتريات رقم: {$invoice->number}",
            ];
        }
        foreach ($additionalExpenseCreditorLines as $cl) {
            $lines[] = $cl;
        }

        $lineTaxDebit = (float) $invoice->tax_amount + $extraPurchaseTax;
        if ($defaults->tax_payable_account_id && $lineTaxDebit > 0) {
            $lines[] = [
                'account_id' => $defaults->tax_payable_account_id,
                'debit' => round($lineTaxDebit, $jeDec),
                'credit' => 0,
                'description' => "ضريبة فاتورة مشتريات رقم: {$invoice->number}",
            ];
        }

        // إجمالي الخصم = المجموع الفرعي − الوعاء الضريبي (للقيد المحاسبي)
        $totalDiscountPurchase = (float) $invoice->subtotal - ((float) $invoice->total - (float) $invoice->tax_amount);
        if ($defaults->purchase_discounts_account_id && $totalDiscountPurchase > 0) {
            $lines[] = [
                'account_id' => $defaults->purchase_discounts_account_id,
                'debit' => 0,
                'credit' => round($totalDiscountPurchase, $jeDec),
                'description' => "خصم فاتورة مشتريات رقم: {$invoice->number}",
            ];
        }

        // الطرف الدائن: دائماً حساب المورد (وسيط). النقدية تخرج لاحقاً عبر سند الصرف فقط — لا قيد للفاتورة على الصندوق.
        $payableAccountId = ($invoice->vendor && $invoice->vendor->account_id)
            ? (int) $invoice->vendor->account_id
            : ($defaults->vendors_account_id ? (int) $defaults->vendors_account_id : null);
        if ($payableAccountId) {
            $lines[] = [
                'account_id' => $payableAccountId,
                'debit' => 0,
                'credit' => round((float) $invoice->total, $jeDec),
                'description' => "فاتورة مشتريات رقم: {$invoice->number}",
            ];
        }

        return $lines;
    }

    private function createSalesInventoryMovements(Invoice $invoice, int $tenantId): void
    {
        foreach ($invoice->lines as $line) {
            if ($line->item && $line->item->track_quantity) {
                InventoryMovement::create(array_merge([
                    'tenant_id' => $tenantId,
                    'item_id' => $line->item_id,
                    'item_variant_id' => $line->item_variant_id ? (int) $line->item_variant_id : null,
                    'warehouse_id' => $invoice->warehouse_id,
                    'type' => 'out',
                    'quantity' => -$line->quantity,
                    'unit_cost' => $line->item->cost_price,
                    'total_cost' => $line->quantity * $line->item->cost_price,
                    'reference_type' => Invoice::class,
                    'reference_id' => $invoice->id,
                    'date' => $invoice->date,
                    'created_by' => auth()->id(),
                ], $line->movementExpiryPayload()));
            }
        }
    }

    private function createPurchaseInventoryMovements(Invoice $invoice, int $tenantId): void
    {
        $warehouseId = (int) $invoice->warehouse_id;
        foreach ($invoice->lines as $line) {
            if ($line->item && $line->item->track_quantity) {
                $item = $line->item;
                $qty = (float) $line->quantity;
                $factor = $item->getConversionFactorToBase($line->unit_id);
                $qtyBase = $item->quantityToBase($qty, $line->unit_id);
                $unitPrice = (float) $line->unit_price;
                $unitCostBase = $factor > 0 ? $unitPrice / $factor : $unitPrice;
                $baseLineCost = round((float) $qtyBase * (float) $unitCostBase, 4);
                $landed = round((float) ($line->landed_cost_allocated ?? 0), 4);
                $totalCost = round($baseLineCost + $landed, 4);
                $unitCost = (float) $qtyBase > 0 ? round($totalCost / (float) $qtyBase, 4) : round((float) $unitCostBase, 4);
                $movement = InventoryMovement::create(array_merge([
                    'tenant_id' => $tenantId,
                    'item_id' => $line->item_id,
                    'item_variant_id' => $line->item_variant_id ? (int) $line->item_variant_id : null,
                    'warehouse_id' => $warehouseId,
                    'type' => 'in',
                    'quantity' => $qtyBase,
                    'unit_cost' => $unitCost,
                    'total_cost' => $totalCost,
                    'reference_type' => Invoice::class,
                    'reference_id' => $invoice->id,
                    'date' => $invoice->date,
                    'created_by' => auth()->id(),
                ], $line->movementExpiryPayload()));
                if ($item->use_serial_number && $warehouseId > 0) {
                    $serials = $line->serial_numbers ?? [];
                    if (is_array($serials) && ! empty($serials)) {
                        $this->serialNumbersService->createSerialsForInbound(
                            $tenantId,
                            (int) $line->item_id,
                            $warehouseId,
                            array_map('trim', $serials),
                            InventoryMovement::class,
                            $movement->id
                        );
                    }
                }
            }
        }

        $touchedItemIds = [];
        foreach ($invoice->lines as $line) {
            if ($line->item_id && $line->item && $line->item->track_quantity) {
                $touchedItemIds[(int) $line->item_id] = true;
            }
        }
        $whForAvg = $warehouseId > 0 ? $warehouseId : null;
        foreach (array_keys($touchedItemIds) as $itemId) {
            $itemId = (int) $itemId;
            if ($itemId <= 0) {
                continue;
            }
            $avg = $this->inventoryService->getItemAverageCost($itemId, $whForAvg);
            Item::where('id', $itemId)->where('tenant_id', $tenantId)->update([
                'cost_price' => round(max(0, $avg), 4),
            ]);
        }
    }

    /**
     * مرتجع مبيعات: عكس القيد (دائن مدينون، مدين إيرادات)، وإعادة للمخزون (دخول).
     * قيمة القيد في حساب العميل (دائن) = إجمالي المرتجع = سعر بيع الكمية المرتجعة + الضريبة المستردة،
     * لضمان دقة كشف حساب العميل والإقرارات الضريبية.
     */
    private function buildSalesReturnJournalLines(Invoice $invoice, int $tenantId): array
    {
        $defaults = $this->accountResolutionService->getDefaults($tenantId);
        $lines = [];

        $receivableAccountId = app(DeliveryService::class)->resolveCreditAccountForSalesReturnInvoice(
            $invoice->loadMissing('customer'),
            $defaults
        );
        // دائن حساب العميل = إجمالي المرتجع (المجموع الفرعي للكمية المرتجعة + الضريبة المستردة)
        $returnTotal = (float) $invoice->total;
        if ($receivableAccountId && $returnTotal > 0) {
            $lines[] = [
                'account_id' => $receivableAccountId,
                'debit' => 0,
                'credit' => round($returnTotal, $invoice->getCurrencyDecimalPlaces()),
                'description' => "مرتجع مبيعات #{$invoice->number}",
            ];
        }
        $salesReturnsAccountId = $defaults->sales_returns_account_id ?? $defaults->sales_account_id;
        if ($salesReturnsAccountId) {
            $lines[] = [
                'account_id' => $salesReturnsAccountId,
                'debit' => (float) $invoice->subtotal,
                'credit' => 0,
                'description' => "مرتجع مبيعات #{$invoice->number}",
            ];
        }
        if ($defaults->tax_payable_account_id && (float) $invoice->tax_amount > 0) {
            $lines[] = [
                'account_id' => $defaults->tax_payable_account_id,
                'debit' => (float) $invoice->tax_amount,
                'credit' => 0,
                'description' => "ضريبة مرتجع #{$invoice->number}",
            ];
        }

        foreach ($invoice->lines as $line) {
            if (! $line->item_id || ! $line->item) {
                continue;
            }
            $item = $line->item;
            $cost = (float) $line->quantity * (float) $item->cost_price;
            if ($cost <= 0) {
                continue;
            }
            $inventoryAccountId = $this->accountResolutionService->resolveInventoryAccount($item, $defaults);
            $cogsAccountId = $this->accountResolutionService->resolveCogsAccount($item, $defaults);
            if ($inventoryAccountId) {
                $lines[] = [
                    'account_id' => $inventoryAccountId,
                    'debit' => round($cost, 4),
                    'credit' => 0,
                    'description' => "إعادة مخزون مرتجع #{$invoice->number} - {$item->name}",
                ];
            }
            if ($cogsAccountId) {
                $lines[] = [
                    'account_id' => $cogsAccountId,
                    'debit' => 0,
                    'credit' => round($cost, 4),
                    'description' => "عكس تكلفة مرتجع #{$invoice->number} - {$item->name}",
                ];
            }
        }

        return $lines;
    }

    /** مرتجع مشتريات: عكس القيد (مدين موردون، دائن مخزون)، وخروج من المخزون */
    private function buildPurchaseReturnJournalLines(Invoice $invoice, int $tenantId): array
    {
        $defaults = $this->accountResolutionService->getDefaults($tenantId);
        $lines = [];

        // مدين: حساب المورد الفرعي المحدد في الفاتورة
        if ($invoice->payment_timing === 'paid') {
            $payableAccountId = $defaults->cash_account_id ?? $defaults->bank_account_id;
        } else {
            $payableAccountId = ($invoice->vendor && $invoice->vendor->account_id)
                ? (int) $invoice->vendor->account_id
                : $defaults->vendors_account_id;
        }
        if ($payableAccountId) {
            $lines[] = [
                'account_id' => $payableAccountId,
                'debit' => (float) $invoice->total,
                'credit' => 0,
                'description' => "مرتجع مشتريات #{$invoice->number}",
            ];
        }

        foreach ($invoice->lines as $line) {
            $invAccountId = null;
            $amount = (float) $line->amount;
            if ($line->item_id && $line->item) {
                $invAccountId = $this->accountResolutionService->resolveInventoryAccount($line->item, $defaults);
            }
            if (! $invAccountId) {
                $invAccountId = $defaults->inventory_account_id;
            }
            if ($invAccountId && $amount > 0) {
                $lines[] = [
                    'account_id' => $invAccountId,
                    'debit' => 0,
                    'credit' => round($amount, 4),
                    'description' => "مرتجع مشتريات #{$invoice->number}".($line->item ? " - {$line->item->name}" : ''),
                ];
            }
        }

        if ($defaults->tax_payable_account_id && (float) $invoice->tax_amount > 0) {
            $lines[] = [
                'account_id' => $defaults->tax_payable_account_id,
                'debit' => 0,
                'credit' => (float) $invoice->tax_amount,
                'description' => "ضريبة مرتجع #{$invoice->number}",
            ];
        }

        return $lines;
    }

    /** مرتجع مبيعات: إعادة للمخزون (دخول) — الكمية بالوحدة الصغرى */
    private function createSalesReturnInventoryMovements(Invoice $invoice, int $tenantId): void
    {
        foreach ($invoice->lines as $line) {
            if ($line->item && $line->item->track_quantity) {
                $item = $line->item;
                $qtyBase = $item->quantityToBase((float) $line->quantity, $line->unit_id);
                $unitCost = (float) $item->cost_price;
                InventoryMovement::create(array_merge([
                    'tenant_id' => $tenantId,
                    'item_id' => $line->item_id,
                    'item_variant_id' => $line->item_variant_id ? (int) $line->item_variant_id : null,
                    'warehouse_id' => $invoice->warehouse_id,
                    'type' => 'in',
                    'quantity' => $qtyBase,
                    'unit_cost' => $unitCost,
                    'total_cost' => $qtyBase * $unitCost,
                    'reference_type' => Invoice::class,
                    'reference_id' => $invoice->id,
                    'date' => $invoice->date,
                    'created_by' => auth()->id(),
                ], $line->movementExpiryPayload()));
            }
        }
    }

    /** مرتجع مشتريات: خروج من المخزون — الكمية بالوحدة الصغرى */
    private function createPurchaseReturnInventoryMovements(Invoice $invoice, int $tenantId): void
    {
        foreach ($invoice->lines as $line) {
            if ($line->item && $line->item->track_quantity) {
                $item = $line->item;
                $qty = (float) $line->quantity;
                $factor = $item->getConversionFactorToBase($line->unit_id);
                $qtyBase = $item->quantityToBase($qty, $line->unit_id);
                $unitPrice = (float) $line->unit_price;
                $unitCostBase = $factor > 0 ? $unitPrice / $factor : $unitPrice;
                InventoryMovement::create(array_merge([
                    'tenant_id' => $tenantId,
                    'item_id' => $line->item_id,
                    'item_variant_id' => $line->item_variant_id ? (int) $line->item_variant_id : null,
                    'warehouse_id' => $invoice->warehouse_id,
                    'type' => 'out',
                    'quantity' => -$qtyBase,
                    'unit_cost' => $unitCostBase,
                    'total_cost' => $qtyBase * $unitCostBase,
                    'reference_type' => Invoice::class,
                    'reference_id' => $invoice->id,
                    'date' => $invoice->date,
                    'created_by' => auth()->id(),
                ], $line->movementExpiryPayload()));
            }
        }
    }
}
