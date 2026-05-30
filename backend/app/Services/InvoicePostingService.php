<?php

namespace App\Services;

use App\Models\BillOfMaterial;
use App\Models\Branch;
use App\Models\CostCenter;
use App\Models\InventoryMovement;
use App\Models\Invoice;
use App\Models\InvoiceManufacturingFrozenBatch;
use App\Models\InvoiceManufacturingFrozenComponent;
use App\Models\Item;
use App\Models\JournalEntry;
use App\Models\Tenant;
use Illuminate\Support\Facades\DB;

/**
 * خدمة ترحيل الفواتير (تأثير محاسبي ومخزني كامل):
 * - قيد مركب: من حـ/ الصندوق أو البنك (حسب طريقة الدفع)، إلى حـ/ المبيعات، إلى حـ/ ضريبة القيمة المضافة.
 * - قيد التكلفة: مدين تكلفة البضاعة المباعة، دائن المخزون (بمتوسط التكلفة أو FIFO).
 * - خصم المخزون: BOM مع «تصنيع آلي عند البيع» يستخدم مخزن الخام ومخزن المنتج النهائي من إعدادات التصنيع؛
 *   يُنشأ قيد تصنيع مستقل (رقم MFG…) لمرحلتي صرف الخام→WIP واستلام التام من WIP؛ وقيد مبيعات منفصل للإيراد/العميل ولتكلفة المبيعات من مخزون التام.
 *   مع «يدوي»: صرف المنتج النهائي من المخزون فقط.
 * - ربط مراكز التكلفة لجميع بنود القيد. الكسور العشرية: 3 خانات.
 */
class InvoicePostingService
{
    private const DECIMALS = 3;

    public function __construct(
        private AccountResolutionService $accountResolutionService,
        private AccountingService $accountingService,
        private PaymentService $paymentService,
        private InventoryService $inventoryService,
        private TenantSettingsService $tenantSettings
    ) {}

    /**
     * إرجاع بنود القيد المحاسبي لفاتورة مبيعات (للاستخدام في التحديث في المكان).
     */
    public function buildJournalLinesForSalesInvoice(Invoice $invoice): array
    {
        $invoice = $invoice->load(['lines.item.category', 'customer']);
        $this->accountResolutionService->validateInvoiceForPosting($invoice);
        $tenantId = $invoice->tenant_id;
        $defaults = $this->accountResolutionService->getDefaults($tenantId);
        $valuationMethod = $this->getValuationMethod($tenantId);
        $journalLines = $this->buildSalesJournalLines($invoice, $defaults);
        $split = $this->buildSplitCogsJournalLines($invoice, $defaults, $valuationMethod);
        foreach ($split['sales_cogs_lines'] as $line) {
            $journalLines[] = $line;
        }

        return $journalLines;
    }

    /**
     * ترحيل فاتورة مبيعات: قيد محاسبي + حركات مخزنية.
     */
    public function postSalesInvoice(Invoice $invoice): Invoice
    {
        return DB::transaction(function () use ($invoice) {
            $invoice = $invoice->load(['lines.item.category', 'customer']);
            if ($invoice->journal_entry_id) {
                return $invoice->fresh([
                    'lines.item', 'customer', 'journalEntry.lines.account', 'manufacturingJournalEntry.lines.account', 'payments',
                ]);
            }
            $this->accountResolutionService->validateInvoiceForPosting($invoice);

            $tenantId = $invoice->tenant_id;
            $this->assertAutoManufacturingRawStockSufficientOrThrow($invoice, $tenantId);

            $defaults = $this->accountResolutionService->getDefaults($tenantId);
            $valuationMethod = $this->getValuationMethod($tenantId);
            $invNo = $invoice->number ?? (string) $invoice->id;

            $this->persistManufacturingFrozenSnapshotsIfMissing($invoice, $valuationMethod);
            $invoice->loadMissing(['lines.item.category', 'lines.item']);

            $split = $this->buildSplitCogsJournalLines($invoice, $defaults, $valuationMethod);
            $salesJournalLines = $this->buildSalesJournalLines($invoice, $defaults);
            foreach ($split['sales_cogs_lines'] as $line) {
                $salesJournalLines[] = $line;
            }

            if (empty($salesJournalLines)) {
                throw new \RuntimeException('لم يتم بناء أي بنود قيد. تأكد من ربط العميل بحساب وحساب المبيعات في الإعدادات.');
            }

            // Snapshot ثابت لبيانات «أمر التصنيع الآلي» من الفاتورة (للرقابة التاريخية)
            // يُخزن داخل metadata للفاتورة حتى لا يتأثر بتغييرات لاحقة على الفرع/مركز التكلفة.
            $autoMfgSnapshot = null;
            if (! empty($split['manufacturing_lines']) && $this->manufacturingAutoOnSale($tenantId)) {
                $firstManufacturedLine = null;
                foreach ($invoice->lines as $line) {
                    if (! $line->item_id || ! $line->item) {
                        continue;
                    }
                    if ((float) $line->quantity <= 0) {
                        continue;
                    }
                    $bom = $this->getActiveBomForItem((int) $line->item_id, $tenantId);
                    if ($bom && $bom->lines->isNotEmpty()) {
                        $firstManufacturedLine = $line;
                        break;
                    }
                }

                if ($firstManufacturedLine) {
                    $finishedItemId = (int) $firstManufacturedLine->item_id;
                    $finishedItemName = (string) ($firstManufacturedLine->item?->name ?? ('#'.$finishedItemId));
                    $soldQty = (float) $invoice->lines
                        ->filter(fn ($l) => (int) ($l->item_id ?? 0) === $finishedItemId)
                        ->sum(fn ($l) => (float) ($l->quantity ?? 0));

                    $branchName = null;
                    if ($invoice->branch_id) {
                        $branchName = Branch::withoutGlobalScopes()
                            ->where('tenant_id', $tenantId)
                            ->where('id', (int) $invoice->branch_id)
                            ->value('name');
                    }

                    $costCenterName = null;
                    if ($invoice->cost_center_id) {
                        $costCenterName = CostCenter::withoutGlobalScopes()
                            ->where('tenant_id', $tenantId)
                            ->where('id', (int) $invoice->cost_center_id)
                            ->value('name');
                    }

                    $autoMfgSnapshot = [
                        'invoice_id' => (int) $invoice->id,
                        'invoice_number' => (string) $invNo,
                        'branch_id' => $invoice->branch_id ? (int) $invoice->branch_id : null,
                        'branch_name' => $branchName,
                        'cost_center_id' => $invoice->cost_center_id ? (int) $invoice->cost_center_id : null,
                        'cost_center_name' => $costCenterName,
                        'finished_item_id' => $finishedItemId,
                        'finished_item_name' => $finishedItemName,
                        'sold_quantity' => $soldQty,
                        'snapshot_at' => now()->toDateTimeString(),
                    ];
                }
            }

            $mfgEntryId = null;
            if (! empty($split['manufacturing_lines'])) {
                $mfgEntry = $this->accountingService->createJournalEntry([
                    'tenant_id' => $tenantId,
                    'number' => JournalEntry::nextNumberForTenantPrefix($tenantId, 'MFG'),
                    'date' => $invoice->date,
                    'type' => 'manufacturing',
                    'description' => 'سند تصنيع آلي — مرتبط بفاتورة مبيعات رقم '.$invNo,
                    'customer_id' => null,
                    'vendor_id' => null,
                    'branch_id' => $invoice->branch_id,
                    'reference_type' => Invoice::class,
                    'reference_id' => $invoice->id,
                    'currency' => null,
                    'status' => 'posted',
                    'created_by' => auth()->id(),
                    'posted_at' => now(),
                ], $split['manufacturing_lines']);
                $mfgEntryId = $mfgEntry->id;
            }

            $salesEntry = $this->accountingService->createJournalEntry([
                'tenant_id' => $tenantId,
                'date' => $invoice->date,
                'type' => 'sales',
                'description' => 'فاتورة مبيعات رقم: '.$invNo,
                'customer_id' => $invoice->customer_id,
                'vendor_id' => null,
                'branch_id' => $invoice->branch_id,
                'reference_type' => Invoice::class,
                'reference_id' => $invoice->id,
                'status' => 'posted',
                'created_by' => auth()->id(),
                'posted_at' => now(),
            ], $salesJournalLines);

            $meta = (array) ($invoice->metadata ?? []);
            if ($autoMfgSnapshot) {
                $meta['auto_manufacturing_order_snapshot'] = $autoMfgSnapshot;
            }

            $invoice->update([
                'manufacturing_journal_entry_id' => $mfgEntryId,
                'journal_entry_id' => $salesEntry->id,
                'metadata' => $meta,
                // يظهر في استجابة API مباشرة بعد الإنشاء/الترحيل (قبل انتهاء حركات المخزون)
                'auto_manufacturing_applied' => $mfgEntryId !== null,
            ]);
            InvoiceStatusResolver::applyToModel($invoice->fresh());

            $this->createSalesInventoryMovements($invoice->fresh(), $tenantId, $valuationMethod);

            // لا يُنشأ سند قبض تلقائياً من الفاتورة — السند هو المصدر الوحيد لحركة النقدية؛ يُضاف من نافذة سند القبض مع ربط المرجع بالفاتورة.
            return $invoice->fresh([
                'lines.item', 'customer', 'journalEntry.lines.account', 'manufacturingJournalEntry.lines.account', 'payments',
            ]);
        });
    }

    /** حركات مخزنية لفاتورة مبيعات (للاستخدام عند التحديث في المكان). */
    public function createSalesInventoryMovementsPublic(Invoice $invoice): void
    {
        $this->createSalesInventoryMovements($invoice, $invoice->tenant_id, $this->getValuationMethod($invoice->tenant_id));
    }

    /** تحويل مبلغ إلى العملة المحلية (الأساسية) للقيد؛ القيم في الدفاتر تُسجّل بالعملة الأساسية (3 خانات عشرية). */
    private function toBaseAmount(float $amount, Invoice $invoice): float
    {
        $rate = (float) ($invoice->exchange_rate ?? 1);

        return round($amount * $rate, self::DECIMALS);
    }

    /** مركز التكلفة من الفاتورة لربط بنود القيد. */
    private function costCenterId(Invoice $invoice): ?int
    {
        $id = $invoice->cost_center_id ?? null;

        return $id ? (int) $id : null;
    }

    /**
     * بناء بنود القيد لفاتورة مبيعات.
     * - فواتير POS: مدين عهدة الكاشير (نقداً) + مدين عملاء (آجل)، دائن المبيعات والضريبة.
     * - فواتير عادية مدفوعة (نقداً/كي نت/أي طريقة دفع): مدين الحساب المرتبط بطريقة الدفع، دائن المبيعات والضريبة.
     * - فواتير آجلة: مدين حساب العميل، دائن المبيعات والضريبة.
     */
    private function buildSalesJournalLines(Invoice $invoice, $defaults): array
    {
        $lines = [];
        $desc = 'فاتورة مبيعات رقم: '.($invoice->number ?? $invoice->id);

        $totalBase = $this->toBaseAmount((float) $invoice->total, $invoice);
        $costCenterId = $this->costCenterId($invoice);
        $isPos = ! empty($invoice->pos_shift_id);
        $custodyAccountId = $defaults->pos_cash_custody_account_id ? (int) $defaults->pos_cash_custody_account_id : null;

        if ($isPos && $custodyAccountId) {
            $paidBase = $this->toBaseAmount((float) $invoice->amount_paid, $invoice);
            $receivableBase = round($totalBase - $paidBase, self::DECIMALS);
            if ($paidBase >= 0.001) {
                $lines[] = [
                    'account_id' => $custodyAccountId,
                    'cost_center_id' => $costCenterId,
                    'debit' => round($paidBase, self::DECIMALS),
                    'credit' => 0,
                    'description' => $desc.' (نقداً - عهدة كاشير)',
                ];
            }
            if ($receivableBase >= 0.001) {
                $receivableAccountId = $this->getReceivableAccountId($invoice, $defaults);
                if ($receivableAccountId) {
                    $lines[] = [
                        'account_id' => $receivableAccountId,
                        'cost_center_id' => $costCenterId,
                        'debit' => round($receivableBase, self::DECIMALS),
                        'credit' => 0,
                        'description' => $desc.' (آجل)',
                    ];
                } else {
                    $lines[] = [
                        'account_id' => $custodyAccountId,
                        'cost_center_id' => $costCenterId,
                        'debit' => round($receivableBase, self::DECIMALS),
                        'credit' => 0,
                        'description' => $desc.' (آجل - مؤقت)',
                    ];
                }
            }
        } else {
            $paidBase = $this->toBaseAmount((float) $invoice->amount_paid, $invoice);
            $receivableBase = round($totalBase - $paidBase, self::DECIMALS);
            $receivableAccountId = $this->getReceivableAccountId($invoice, $defaults);

            // المبلغ المدفوع: إما من سندات القبض (payments) أو من رأس الفاتورة (payment_method_id + amount_paid)
            if ($paidBase >= 0.001) {
                $invoice->loadMissing(['paymentMethod', 'payments.paymentMethod']);
                $payments = $invoice->payments;
                $paymentsSum = $payments->sum(fn ($p) => (float) $p->amount);
                $invoicePaid = (float) $invoice->amount_paid;
                $usePayments = $payments->isNotEmpty() && abs($paymentsSum - $invoicePaid) < 0.01;

                if ($usePayments) {
                    $byMethod = $payments->groupBy('payment_method_id');
                    foreach ($byMethod as $methodId => $methodPayments) {
                        $sumInBase = 0;
                        foreach ($methodPayments as $p) {
                            $sumInBase += $this->toBaseAmount((float) $p->amount, $invoice);
                        }
                        $sumInBase = round($sumInBase, self::DECIMALS);
                        if ($sumInBase < 0.001) {
                            continue;
                        }
                        $method = $methodPayments->first()->paymentMethod;
                        $linkedId = $method?->linked_account_id ? (int) $method->linked_account_id : null;
                        if ($linkedId) {
                            $lines[] = [
                                'account_id' => $linkedId,
                                'cost_center_id' => $costCenterId,
                                'debit' => $sumInBase,
                                'credit' => 0,
                                'description' => $desc.' (طريقة الدفع)',
                            ];
                        } else {
                            throw new \RuntimeException(
                                'طريقة الدفع «'.($method?->name ?? $method?->name_en ?? (string) $methodId).'» غير مرتبطة بحساب في دليل الحسابات. يرجى ربطها من إعدادات طرق الدفع.'
                            );
                        }
                    }
                } else {
                    // الاعتماد على رأس الفاتورة: payment_method_id و amount_paid (فاتورة جديدة مرحّلة دون سندات قبض بعد)
                    if (! $invoice->payment_method_id) {
                        throw new \RuntimeException(
                            'يوجد مبلغ مدفوع على الفاتورة ولم يتم تحديد طريقة الدفع. يرجى تحديد طريقة الدفع المرتبطة بحساب البنك/الصندوق عند إنشاء الفاتورة أو إضافة الدفعة.'
                        );
                    }
                    $paymentAccountId = $invoice->paymentMethod?->linked_account_id ? (int) $invoice->paymentMethod->linked_account_id : null;
                    if (! $paymentAccountId) {
                        throw new \RuntimeException(
                            'طريقة الدفع «'.($invoice->paymentMethod->name ?? $invoice->paymentMethod->name_en ?? '').'» غير مرتبطة بحساب في دليل الحسابات. يرجى ربطها بحساب البنك من إعدادات طرق الدفع.'
                        );
                    }
                    $lines[] = [
                        'account_id' => $paymentAccountId,
                        'cost_center_id' => $costCenterId,
                        'debit' => round($paidBase, self::DECIMALS),
                        'credit' => 0,
                        'description' => $desc.' (طريقة الدفع)',
                    ];
                }
            }

            if ($receivableBase >= 0.001) {
                if (! $receivableAccountId) {
                    throw new \RuntimeException('العميل غير مرتبط بحساب في دليل الحسابات، أو لم يتم تحديد حساب العملاء في الإعدادات.');
                }
                $lines[] = [
                    'account_id' => $receivableAccountId,
                    'cost_center_id' => $costCenterId,
                    'debit' => round($receivableBase, self::DECIMALS),
                    'credit' => 0,
                    'description' => $desc.($paidBase >= 0.001 ? ' (آجل)' : ''),
                ];
            }

            if (empty($lines)) {
                if (! $receivableAccountId) {
                    throw new \RuntimeException('العميل غير مرتبط بحساب في دليل الحسابات، أو لم يتم تحديد حساب العملاء في الإعدادات.');
                }
                $lines[] = [
                    'account_id' => $receivableAccountId,
                    'cost_center_id' => $costCenterId,
                    'debit' => round($totalBase, self::DECIMALS),
                    'credit' => 0,
                    'description' => $desc,
                ];
            }
        }

        $totalDiscount = (float) $invoice->subtotal - ((float) $invoice->total - (float) $invoice->tax_amount);
        $tenantId = (int) $invoice->tenant_id;
        $discountsId = $this->accountResolutionService->resolveStoredDefaultAccountId($tenantId, $defaults->discounts_account_id ? (int) $defaults->discounts_account_id : null);
        if ($discountsId && $totalDiscount > 0) {
            $lines[] = [
                'account_id' => $discountsId,
                'cost_center_id' => $costCenterId,
                'debit' => round($this->toBaseAmount($totalDiscount, $invoice), self::DECIMALS),
                'credit' => 0,
                'description' => 'خصم مبيعات - '.$desc,
            ];
        }

        $salesId = $this->accountResolutionService->resolveStoredDefaultAccountId($tenantId, $defaults->sales_account_id ? (int) $defaults->sales_account_id : null);
        if ($salesId) {
            $lines[] = [
                'account_id' => $salesId,
                'cost_center_id' => $costCenterId,
                'debit' => 0,
                'credit' => round($this->toBaseAmount((float) $invoice->subtotal, $invoice), self::DECIMALS),
                'description' => 'إيراد مبيعات - '.$desc,
            ];
        }

        $taxId = $this->accountResolutionService->resolveStoredDefaultAccountId($tenantId, $defaults->tax_payable_account_id ? (int) $defaults->tax_payable_account_id : null);
        if ($taxId && (float) $invoice->tax_amount > 0) {
            $lines[] = [
                'account_id' => $taxId,
                'cost_center_id' => $costCenterId,
                'debit' => 0,
                'credit' => round($this->toBaseAmount((float) $invoice->tax_amount, $invoice), self::DECIMALS),
                'description' => 'ضريبة مبيعات - '.$desc,
            ];
        }

        if ($invoice->type === 'sales' && ! $invoice->is_return) {
            $deliveryFees = is_array($invoice->delivery_fees) ? $invoice->delivery_fees : [];
            $tenantId = (int) $invoice->tenant_id;
            foreach ($deliveryFees as $fee) {
                $amt = (float) ($fee['amount'] ?? 0);
                if ($amt <= 0.0005) {
                    continue;
                }
                $pref = ! empty($fee['account_id']) ? (int) $fee['account_id'] : null;
                $accId = $this->accountResolutionService->resolveDeliveryRevenueAccountId($tenantId, $pref);
                $feeLabel = trim((string) ($fee['label'] ?? ''));
                $lines[] = [
                    'account_id' => $accId,
                    'cost_center_id' => $costCenterId,
                    'debit' => 0,
                    'credit' => round($this->toBaseAmount($amt, $invoice), self::DECIMALS),
                    'description' => ($feeLabel !== '' ? $feeLabel : 'رسوم توصيل').' - '.$desc,
                ];
            }
        }

        return $lines;
    }

    /**
     * حساب المدين في قيد الفاتورة: دائماً حساب العميل (وسيط)، وليس الصندوق.
     * دخول النقدية إلى الصندوق يكون فقط عبر سند القبض المولد عند وجود مبلغ مدفوع.
     */
    private function getReceivableAccountId(Invoice $invoice, $defaults): ?int
    {
        if ($invoice->customer_id && $invoice->customer && ! empty($invoice->customer->account_id)) {
            return (int) $invoice->customer->account_id;
        }

        return $this->accountResolutionService->resolveStoredDefaultAccountId(
            (int) $invoice->tenant_id,
            $defaults->customers_account_id ? (int) $defaults->customers_account_id : null
        );
    }

    /**
     * سياسة تقييم المخزون للمستأجر: average (متوسط مرجح) أو fifo.
     */
    private function getValuationMethod(int $tenantId): string
    {
        $tenant = Tenant::find($tenantId);
        $method = $tenant?->inventory_method ?? 'average';

        return in_array(strtolower($method), ['fifo', 'average'], true) ? strtolower($method) : 'average';
    }

    /** آلي عند البيع (افتراضي) مقابل يدوي عبر أوامر التصنيع (بيع المنتج النهائي من المخزون). */
    private function manufacturingAutoOnSale(int $tenantId): bool
    {
        $m = $this->tenantSettings->get($tenantId, 'manufacturing_method', 'auto_on_sale');

        return $m !== 'manual_orders';
    }

    private function allowManufacturingWithRawShortage(int $tenantId): bool
    {
        return (bool) $this->tenantSettings->get($tenantId, 'allow_manufacturing_with_raw_shortage', false);
    }

    /** مخازن التصنيع الآلي من الإعدادات (مطلوبة عند تفعيل «آلي عند البيع»). */
    private function requireAutoManufacturingWarehouseIds(int $tenantId): array
    {
        $raw = (int) $this->tenantSettings->get($tenantId, 'manufacturing_default_raw_warehouse_id', 0);
        $finished = (int) $this->tenantSettings->get($tenantId, 'manufacturing_default_finished_warehouse_id', 0);
        if ($raw < 1 || $finished < 1) {
            throw new \RuntimeException('يرجى إكمال إعدادات الربط المخزني في إعدادات التصنيع قبل ترحيل فاتورة بأصناف تصنيعية.');
        }

        return ['raw' => $raw, 'finished' => $finished];
    }

    private function requireManufacturingWipAccountId(int $tenantId): int
    {
        $id = (int) $this->tenantSettings->get($tenantId, 'manufacturing_wip_account_id', 0);
        if ($id < 1) {
            throw new \RuntimeException('يرجى تحديد حساب التصنيع الوسيط (WIP) في إعدادات التصنيع قبل ترحيل فاتورة بأصناف تصنيعية.');
        }

        return $id;
    }

    /**
     * تجميع بنود القيد المتشابهة لتقليل عدد الأسطر الظاهرة.
     * التجميع يكون حسب: الحساب + مركز التكلفة + (مدين/دائن).
     *
     * @param  array<int, array<string, mixed>>  $rows
     * @return array<int, array<string, mixed>>
     */
    private function aggregateJournalLines(array $rows, string $description): array
    {
        $map = [];
        foreach ($rows as $row) {
            $accountId = (int) ($row['account_id'] ?? 0);
            if ($accountId < 1) {
                continue;
            }
            $costCenterId = isset($row['cost_center_id']) && $row['cost_center_id'] !== null ? (int) $row['cost_center_id'] : null;
            $stage = isset($row['_stage']) ? (string) $row['_stage'] : 'general';
            $debit = (float) ($row['debit'] ?? 0);
            $credit = (float) ($row['credit'] ?? 0);

            if ($debit > 0.0005 && $credit > 0.0005) {
                // حالة نادرة: لا ندمج صافي/مقاصة داخل نفس السطر كي لا نخفي المعنى.
                $rowsKey = $stage.'|'.$accountId.'|'.($costCenterId ?? 'null').'|D';
                $map[$rowsKey] = $map[$rowsKey] ?? ['account_id' => $accountId, 'cost_center_id' => $costCenterId, 'debit' => 0.0, 'credit' => 0.0, 'description' => $description];
                $map[$rowsKey]['debit'] = round(((float) $map[$rowsKey]['debit']) + $debit, self::DECIMALS);

                $rowsKey = $stage.'|'.$accountId.'|'.($costCenterId ?? 'null').'|C';
                $map[$rowsKey] = $map[$rowsKey] ?? ['account_id' => $accountId, 'cost_center_id' => $costCenterId, 'debit' => 0.0, 'credit' => 0.0, 'description' => $description];
                $map[$rowsKey]['credit'] = round(((float) $map[$rowsKey]['credit']) + $credit, self::DECIMALS);

                continue;
            }

            $dir = $debit > 0.0005 ? 'D' : 'C';
            $amt = $debit > 0.0005 ? $debit : $credit;
            if ($amt <= 0.0005) {
                continue;
            }

            $key = $stage.'|'.$accountId.'|'.($costCenterId ?? 'null').'|'.$dir;
            if (! isset($map[$key])) {
                $map[$key] = [
                    'account_id' => $accountId,
                    'cost_center_id' => $costCenterId,
                    'debit' => 0.0,
                    'credit' => 0.0,
                    'description' => $description,
                ];
            }
            if ($dir === 'D') {
                $map[$key]['debit'] = round(((float) $map[$key]['debit']) + $amt, self::DECIMALS);
            } else {
                $map[$key]['credit'] = round(((float) $map[$key]['credit']) + $amt, self::DECIMALS);
            }
        }

        $out = [];
        foreach ($map as $row) {
            $out[] = [
                'account_id' => (int) $row['account_id'],
                'cost_center_id' => $row['cost_center_id'],
                'debit' => round((float) $row['debit'], self::DECIMALS),
                'credit' => round((float) $row['credit'], self::DECIMALS),
                'description' => (string) ($row['description'] ?? $description),
            ];
        }

        return $out;
    }

    /**
     * تجميد تكوين BOM لحظة ترحيل البيع؛ إعادة الترحيل تستخدم اللقطة دون قراءة BOM الحالي.
     */
    private function persistManufacturingFrozenSnapshotsIfMissing(Invoice $invoice, string $valuationMethod): void
    {
        $tenantId = $invoice->tenant_id;
        if (! $this->manufacturingAutoOnSale($tenantId)) {
            return;
        }
        if (InvoiceManufacturingFrozenBatch::where('invoice_id', $invoice->id)->exists()) {
            return;
        }
        if (! $this->invoiceHasLiveAutoManufacturingBom($invoice, $tenantId)) {
            return;
        }
        $mfgWarehouses = $this->requireAutoManufacturingWarehouseIds($tenantId);
        $rawWhId = (int) $mfgWarehouses['raw'];
        $finishedWhId = (int) $mfgWarehouses['finished'];

        $invoice->loadMissing('lines.item');
        foreach ($invoice->lines as $line) {
            if (! $line->item_id || ! $line->item) {
                continue;
            }
            if ((float) $line->quantity <= 0) {
                continue;
            }
            $bom = $this->getActiveBomForItem((int) $line->item_id, $tenantId);
            if (! $bom || $bom->lines->isEmpty()) {
                continue;
            }

            $item = $line->item;
            $qty = (float) $line->quantity;
            $qtyBaseFinished = (float) $item->quantityToBase($qty, $line->unit_id);

            $batch = InvoiceManufacturingFrozenBatch::create([
                'tenant_id' => $tenantId,
                'invoice_id' => $invoice->id,
                'invoice_line_id' => $line->id,
                'bill_of_material_id' => $bom->id,
                'branch_id' => $invoice->branch_id,
                'raw_warehouse_id' => $rawWhId,
                'finished_warehouse_id' => $finishedWhId,
                'finished_item_id' => $item->id,
                'finished_quantity' => $qty,
                'finished_unit_id' => $line->unit_id,
                'finished_qty_base' => $qtyBaseFinished,
                'wip_total_cost_invoice' => 0,
                'wip_total_cost_base' => 0,
            ]);

            $wipInvSum = 0.0;
            $wipBaseSum = 0.0;
            $sort = 0;
            foreach ($bom->lines as $bomLine) {
                $componentItem = $bomLine->componentItem;
                if (! $componentItem || ! $componentItem->track_quantity) {
                    continue;
                }
                $componentQty = (float) $bomLine->quantity * $qty;
                $qtyBase = (float) $componentItem->quantityToBase($componentQty, $bomLine->unit_id);
                if ($qtyBase <= 0) {
                    continue;
                }
                $unitCost = $bomLine->unit_cost !== null ? (float) $bomLine->unit_cost : (float) ($componentItem->cost_price ?? 0);
                $totalCost = round($componentQty * $unitCost, self::DECIMALS);
                if ($totalCost <= 0) {
                    $costData = $this->inventoryService->getItemCostForSale((int) $componentItem->id, $qtyBase, $rawWhId, $valuationMethod);
                    $totalCost = round((float) $costData['total_cost'], self::DECIMALS);
                }
                if ($totalCost <= 0) {
                    continue;
                }
                $totalBase = round($this->toBaseAmount($totalCost, $invoice), self::DECIMALS);
                $unitCostRounded = $qtyBase > 0 ? round($totalCost / $qtyBase, self::DECIMALS) : 0;

                InvoiceManufacturingFrozenComponent::create([
                    'batch_id' => $batch->id,
                    'component_item_id' => $componentItem->id,
                    'component_name' => (string) ($componentItem->name ?? ('#'.$componentItem->id)),
                    'component_unit_id' => $bomLine->unit_id,
                    'qty_in_component_unit' => $componentQty,
                    'qty_base' => $qtyBase,
                    'unit_cost' => $unitCostRounded,
                    'total_cost' => $totalCost,
                    'sort_order' => $sort++,
                ]);
                $wipInvSum += $totalCost;
                $wipBaseSum += $totalBase;
            }

            $batch->refresh('components');
            if ($batch->components->isEmpty()) {
                $batch->delete();
            } else {
                $batch->update([
                    'wip_total_cost_invoice' => round($wipInvSum, self::DECIMALS),
                    'wip_total_cost_base' => round($wipBaseSum, self::DECIMALS),
                ]);
            }
        }
    }

    /**
     * قيود تكلفة من لقطة BOM المجمّدة.
     *
     * @return array<int, array<string, mixed>>
     */
    private function buildManufacturingBomCogsLinesFromFrozenBatch(
        Invoice $invoice,
        $line,
        InvoiceManufacturingFrozenBatch $frozen,
        $defaults,
        int $tenantId,
        string $invNo,
        ?int $costCenterId
    ): array {
        $out = [];
        $item = $line->item;
        if (! $item) {
            return $out;
        }
        $wipAccountId = $this->requireManufacturingWipAccountId($tenantId);
        $finishedName = $item->name ?? ('#'.$item->id);
        $wipBatchTotal = 0.0;

        foreach ($frozen->components as $fc) {
            $componentItem = Item::withoutGlobalScopes()
                ->where('tenant_id', $tenantId)
                ->find($fc->component_item_id);
            if (! $componentItem) {
                $componentItem = Item::withoutGlobalScopes()->find($fc->component_item_id);
            }
            if (! $componentItem) {
                continue;
            }
            $totalCostBase = round($this->toBaseAmount((float) $fc->total_cost, $invoice), self::DECIMALS);
            if ($totalCostBase <= 0.0005) {
                continue;
            }
            $inventoryAccountId = $this->accountResolutionService->resolveInventoryAccount($componentItem, $defaults);
            if (! $inventoryAccountId) {
                continue;
            }
            $compName = $fc->component_name !== '' ? $fc->component_name : (string) ($componentItem->name ?? ('#'.$componentItem->id));

            $out[] = [
                '_stage' => 'mfg_raw_to_wip',
                'account_id' => $wipAccountId,
                'cost_center_id' => $costCenterId,
                'debit' => $totalCostBase,
                'credit' => 0,
                'description' => 'تكلفة «'.$compName.'» لتصنيع «'.$finishedName.'» — فاتورة رقم '.$invNo.' — ترحيل إلى وسيط التصنيع (WIP)',
            ];
            $out[] = [
                '_stage' => 'mfg_raw_to_wip',
                'account_id' => $inventoryAccountId,
                'cost_center_id' => $costCenterId,
                'debit' => 0,
                'credit' => $totalCostBase,
                'description' => 'صرف مخزون خام «'.$compName.'» لتصنيع «'.$finishedName.'» — فاتورة رقم '.$invNo,
            ];
            $wipBatchTotal += $totalCostBase;
        }

        $wipBatchTotal = round($wipBatchTotal, self::DECIMALS);
        if ($wipBatchTotal <= 0.0005) {
            return [];
        }

        $finishedInvId = $this->accountResolutionService->resolveInventoryAccount($item, $defaults);
        if (! $finishedInvId) {
            throw new \RuntimeException('تعذر تحديد حساب مخزون المنتج التام للصنف «'.($item->name ?? $item->id).'». يرجى ربط الصنف أو الإعدادات الافتراضية.');
        }
        $finishedCogsId = $this->accountResolutionService->resolveCogsAccount($item, $defaults);
        if (! $finishedCogsId) {
            throw new \RuntimeException('تعذر تحديد حساب تكلفة المبيعات للصنف «'.($item->name ?? $item->id).'». يرجى ربط الصنف أو الإعدادات الافتراضية.');
        }

        $out[] = [
            '_stage' => 'mfg_wip_to_finished',
            'account_id' => $finishedInvId,
            'cost_center_id' => $costCenterId,
            'debit' => $wipBatchTotal,
            'credit' => 0,
            'description' => 'استلام مخزون منتج تام «'.$finishedName.'» (تجميع تكلفة المكوّنات) — فاتورة رقم '.$invNo,
        ];
        $out[] = [
            '_stage' => 'mfg_wip_to_finished',
            'account_id' => $wipAccountId,
            'cost_center_id' => $costCenterId,
            'debit' => 0,
            'credit' => $wipBatchTotal,
            'description' => 'إخراج من وسيط التصنيع (WIP) لصالح استلام «'.$finishedName.'» — فاتورة رقم '.$invNo,
        ];

        $out[] = [
            '_stage' => 'mfg_cogs_from_finished',
            'account_id' => $finishedCogsId,
            'cost_center_id' => $costCenterId,
            'debit' => $wipBatchTotal,
            'credit' => 0,
            'description' => 'تكلفة مبيعات «'.$finishedName.'» (حسب مكوّناته) — فاتورة رقم '.$invNo,
        ];
        $out[] = [
            '_stage' => 'mfg_cogs_from_finished',
            'account_id' => $finishedInvId,
            'cost_center_id' => $costCenterId,
            'debit' => 0,
            'credit' => $wipBatchTotal,
            'description' => 'صرف من مخزون منتج تام «'.$finishedName.'» — فاتورة رقم '.$invNo,
        ];

        return $out;
    }

    /**
     * تقسيم قيود التكلفة بين قيد تصنيع منفصل وقيد مبيعات.
     *
     * @return array{manufacturing_lines: array<int, array<string, mixed>>, sales_cogs_lines: array<int, array<string, mixed>>}
     */
    private function buildSplitCogsJournalLines(Invoice $invoice, $defaults, string $valuationMethod): array
    {
        $salesCogsLines = [];
        $desc = 'تكلفة مبيعات - فاتورة رقم: '.($invoice->number ?? $invoice->id);
        $invNo = $invoice->number ?? (string) $invoice->id;
        $warehouseId = $invoice->warehouse_id;
        $costCenterId = $this->costCenterId($invoice);
        $tenantId = $invoice->tenant_id;

        $frozenByLineId = InvoiceManufacturingFrozenBatch::where('invoice_id', $invoice->id)
            ->with('components')
            ->get()
            ->keyBy('invoice_line_id');

        $sortedLines = $invoice->lines->sortBy(fn ($l) => $l->id ?? 0)->values();
        $manufacturingLines = [];
        $otherLines = [];
        foreach ($sortedLines as $line) {
            if (! $line->item_id || ! $line->item) {
                continue;
            }
            if ((float) $line->quantity <= 0) {
                continue;
            }
            $frozen = $frozenByLineId->get($line->id);
            if ($frozen && $frozen->components->isNotEmpty() && $this->manufacturingAutoOnSale($tenantId)) {
                $manufacturingLines[] = $line;
            } else {
                $bom = $this->getActiveBomForItem((int) $line->item_id, $tenantId);
                if ($bom && $bom->lines->isNotEmpty() && $this->manufacturingAutoOnSale($tenantId)) {
                    $manufacturingLines[] = $line;
                } else {
                    $otherLines[] = $line;
                }
            }
        }

        $rowsForManufacturingEntry = [];
        $rowsForSalesCogsFromBom = [];
        foreach ($manufacturingLines as $line) {
            $frozen = $frozenByLineId->get($line->id);
            $rows = ($frozen && $frozen->components->isNotEmpty())
                ? $this->buildManufacturingBomCogsLinesFromFrozenBatch($invoice, $line, $frozen, $defaults, $tenantId, $invNo, $costCenterId)
                : $this->buildManufacturingBomCogsLinesForInvoiceLine($invoice, $line, $defaults, $tenantId, $invNo, $costCenterId, $valuationMethod);
            foreach ($rows as $row) {
                $stage = $row['_stage'] ?? '';
                if (in_array($stage, ['mfg_raw_to_wip', 'mfg_wip_to_finished'], true)) {
                    $rowsForManufacturingEntry[] = $row;
                } elseif ($stage === 'mfg_cogs_from_finished') {
                    $rowsForSalesCogsFromBom[] = $row;
                }
            }
        }

        $manufacturing_lines = [];
        if (! empty($rowsForManufacturingEntry)) {
            $manufacturing_lines = $this->aggregateJournalLines(
                $rowsForManufacturingEntry,
                'سند تصنيع (BOM آلي) — مرتبط بفاتورة مبيعات رقم '.$invNo
            );
        }

        if (! empty($rowsForSalesCogsFromBom)) {
            $salesCogsLines = array_merge(
                $salesCogsLines,
                $this->aggregateJournalLines($rowsForSalesCogsFromBom, $desc)
            );
        }

        foreach ($otherLines as $line) {
            $item = $line->item;
            if (! $item || ! $item->track_quantity) {
                continue;
            }
            $qty = (float) $line->quantity;
            $qtyBase = $item->quantityToBase($qty, $line->unit_id);
            $costData = $this->inventoryService->getItemCostForSale($line->item_id, $qtyBase, $warehouseId, $valuationMethod);
            $totalCost = (float) $costData['total_cost'];
            if ($totalCost <= 0) {
                continue;
            }
            $cogsAccountId = $this->accountResolutionService->resolveCogsAccount($item, $defaults);
            $inventoryAccountId = $this->accountResolutionService->resolveInventoryAccount($item, $defaults);
            if (! $cogsAccountId || ! $inventoryAccountId) {
                continue;
            }
            $totalCostBase = round($this->toBaseAmount($totalCost, $invoice), self::DECIMALS);
            $salesCogsLines[] = [
                'account_id' => $cogsAccountId,
                'cost_center_id' => $costCenterId,
                'debit' => $totalCostBase,
                'credit' => 0,
                'description' => $desc.' - '.($item->name ?? ''),
            ];
            $salesCogsLines[] = [
                'account_id' => $inventoryAccountId,
                'cost_center_id' => $costCenterId,
                'debit' => 0,
                'credit' => $totalCostBase,
                'description' => $desc.' - '.($item->name ?? ''),
            ];
        }

        return [
            'manufacturing_lines' => $manufacturing_lines,
            'sales_cogs_lines' => $salesCogsLines,
        ];
    }

    /**
     * قيود تكلفة BOM آلي لسطر فاتورة واحد (صنف مصنع واحد): صرف خام→WIP، استلام تام، تكلفة مبيعات←مخزون تام.
     *
     * @return array<int, array<string, mixed>>
     */
    private function buildManufacturingBomCogsLinesForInvoiceLine(
        Invoice $invoice,
        $line,
        $defaults,
        int $tenantId,
        string $invNo,
        ?int $costCenterId,
        string $valuationMethod
    ): array {
        $out = [];
        $item = $line->item;
        if (! $item) {
            return $out;
        }
        $qty = (float) $line->quantity;
        if ($qty <= 0) {
            return $out;
        }
        $bom = $this->getActiveBomForItem((int) $line->item_id, $tenantId);
        if (! $bom || $bom->lines->isEmpty()) {
            return $out;
        }

        $wipAccountId = $this->requireManufacturingWipAccountId($tenantId);
        $rawWhId = (int) $this->requireAutoManufacturingWarehouseIds($tenantId)['raw'];
        $finishedName = $item->name ?? ('#'.$item->id);
        $wipBatchTotal = 0.0;

        foreach ($bom->lines as $bomLine) {
            $componentItem = $bomLine->componentItem;
            if (! $componentItem || ! $componentItem->track_quantity) {
                continue;
            }
            $componentQty = (float) $bomLine->quantity * $qty;
            $qtyBase = $componentItem->quantityToBase($componentQty, $bomLine->unit_id);
            if ($qtyBase <= 0) {
                continue;
            }
            $unitCost = $bomLine->unit_cost !== null ? (float) $bomLine->unit_cost : (float) ($componentItem->cost_price ?? 0);
            $totalCost = round($componentQty * $unitCost, self::DECIMALS);
            if ($totalCost <= 0) {
                $costData = $this->inventoryService->getItemCostForSale((int) $componentItem->id, $qtyBase, $rawWhId, $valuationMethod);
                $totalCost = round((float) $costData['total_cost'], self::DECIMALS);
            }
            if ($totalCost <= 0) {
                continue;
            }
            $inventoryAccountId = $this->accountResolutionService->resolveInventoryAccount($componentItem, $defaults);
            if (! $inventoryAccountId) {
                continue;
            }
            $totalCostBase = round($this->toBaseAmount($totalCost, $invoice), self::DECIMALS);
            $compName = $componentItem->name ?? ('#'.$componentItem->id);

            $out[] = [
                '_stage' => 'mfg_raw_to_wip',
                'account_id' => $wipAccountId,
                'cost_center_id' => $costCenterId,
                'debit' => $totalCostBase,
                'credit' => 0,
                'description' => 'تكلفة «'.$compName.'» لتصنيع «'.$finishedName.'» — فاتورة رقم '.$invNo.' — ترحيل إلى وسيط التصنيع (WIP)',
            ];
            $out[] = [
                '_stage' => 'mfg_raw_to_wip',
                'account_id' => $inventoryAccountId,
                'cost_center_id' => $costCenterId,
                'debit' => 0,
                'credit' => $totalCostBase,
                'description' => 'صرف مخزون خام «'.$compName.'» لتصنيع «'.$finishedName.'» — فاتورة رقم '.$invNo,
            ];
            $wipBatchTotal += $totalCostBase;
        }

        if ($wipBatchTotal <= 0.0005) {
            return $out;
        }

        $finishedInvId = $this->accountResolutionService->resolveInventoryAccount($item, $defaults);
        if (! $finishedInvId) {
            throw new \RuntimeException('تعذر تحديد حساب مخزون المنتج التام للصنف «'.($item->name ?? $item->id).'». يرجى ربط الصنف أو الإعدادات الافتراضية.');
        }
        $finishedCogsId = $this->accountResolutionService->resolveCogsAccount($item, $defaults);
        if (! $finishedCogsId) {
            throw new \RuntimeException('تعذر تحديد حساب تكلفة المبيعات للصنف «'.($item->name ?? $item->id).'». يرجى ربط الصنف أو الإعدادات الافتراضية.');
        }
        $wipBatchTotal = round($wipBatchTotal, self::DECIMALS);

        $out[] = [
            '_stage' => 'mfg_wip_to_finished',
            'account_id' => $finishedInvId,
            'cost_center_id' => $costCenterId,
            'debit' => $wipBatchTotal,
            'credit' => 0,
            'description' => 'استلام مخزون منتج تام «'.$finishedName.'» (تجميع تكلفة المكوّنات) — فاتورة رقم '.$invNo,
        ];
        $out[] = [
            '_stage' => 'mfg_wip_to_finished',
            'account_id' => $wipAccountId,
            'cost_center_id' => $costCenterId,
            'debit' => 0,
            'credit' => $wipBatchTotal,
            'description' => 'إخراج من وسيط التصنيع (WIP) لصالح استلام «'.$finishedName.'» — فاتورة رقم '.$invNo,
        ];

        $out[] = [
            '_stage' => 'mfg_cogs_from_finished',
            'account_id' => $finishedCogsId,
            'cost_center_id' => $costCenterId,
            'debit' => $wipBatchTotal,
            'credit' => 0,
            'description' => 'تكلفة مبيعات «'.$finishedName.'» (حسب مكوّناته) — فاتورة رقم '.$invNo,
        ];
        $out[] = [
            '_stage' => 'mfg_cogs_from_finished',
            'account_id' => $finishedInvId,
            'cost_center_id' => $costCenterId,
            'debit' => 0,
            'credit' => $wipBatchTotal,
            'description' => 'صرف من مخزون منتج تام «'.$finishedName.'» — فاتورة رقم '.$invNo,
        ];

        return $out;
    }

    /** قائمة مكونات (BOM) نشطة للصنف النهائي إن وُجدت. */
    private function getActiveBomForItem(int $finishedItemId, int $tenantId): ?BillOfMaterial
    {
        return BillOfMaterial::where('tenant_id', $tenantId)
            ->where('finished_item_id', $finishedItemId)
            ->where('is_active', true)
            ->with('lines.componentItem')
            ->first();
    }

    /**
     * منع ترحيل فاتورة المبيعات عند التصنيع الآلي ونقص الخام، إذا كان خيار «السماح بالتصنيع في حال نقص الخام» معطلاً.
     * يُستدعى قبل إنشاء أي قيد محاسبي.
     */
    private function assertAutoManufacturingRawStockSufficientOrThrow(Invoice $invoice, int $tenantId): void
    {
        if (! $this->manufacturingAutoOnSale($tenantId) || $this->allowManufacturingWithRawShortage($tenantId)) {
            return;
        }
        if (InvoiceManufacturingFrozenBatch::where('invoice_id', $invoice->id)->exists()) {
            return;
        }
        if (! $this->invoiceHasAutoManufacturingBom($invoice, $tenantId)) {
            return;
        }
        $mfgWarehouses = $this->requireAutoManufacturingWarehouseIds($tenantId);
        $rawWhId = (int) $mfgWarehouses['raw'];
        $shortLabels = [];

        foreach ($invoice->lines as $line) {
            if (! $line->item_id || ! $line->item) {
                continue;
            }
            $qty = (float) $line->quantity;
            if ($qty <= 0) {
                continue;
            }
            $bom = $this->getActiveBomForItem((int) $line->item_id, $tenantId);
            if (! $bom || $bom->lines->isEmpty()) {
                continue;
            }
            foreach ($bom->lines as $bomLine) {
                $componentItem = $bomLine->componentItem;
                if (! $componentItem || ! $componentItem->track_quantity) {
                    continue;
                }
                $componentQty = (float) $bomLine->quantity * $qty;
                $qtyBase = (float) $componentItem->quantityToBase($componentQty, $bomLine->unit_id);
                if ($qtyBase <= 0) {
                    continue;
                }
                $available = (float) $this->inventoryService->getItemStock((int) $componentItem->id, $rawWhId);
                if ($available + 1e-9 < $qtyBase) {
                    $shortLabels[] = (string) ($componentItem->name ?? '#'.$componentItem->id);
                }
            }
        }

        if ($shortLabels === []) {
            return;
        }

        $unique = array_values(array_unique($shortLabels));
        $list = implode('، ', $unique);

        throw new \RuntimeException(
            'لا يمكن إتمام التصنيع لنقص المواد الخام التالية: '.$list.'. يمكنك تفعيل «السماح بالتصنيع في حال نقص الخام» من إعدادات التصنيع أو تعديل الكميات أو تعبئة المخزون.'
        );
    }

    /** هل تحتوي الفاتورة على سطر BOM مع وضع التصنيع الآلي عند البيع؟ */
    private function invoiceHasLiveAutoManufacturingBom(Invoice $invoice, int $tenantId): bool
    {
        if (! $this->manufacturingAutoOnSale($tenantId)) {
            return false;
        }
        foreach ($invoice->lines as $line) {
            if (! $line->item_id) {
                continue;
            }
            $bom = $this->getActiveBomForItem((int) $line->item_id, $tenantId);
            if ($bom && $bom->lines->isNotEmpty()) {
                return true;
            }
        }

        return false;
    }

    private function invoiceHasAutoManufacturingBom(Invoice $invoice, int $tenantId): bool
    {
        if (InvoiceManufacturingFrozenBatch::where('invoice_id', $invoice->id)->exists()) {
            return true;
        }

        return $this->invoiceHasLiveAutoManufacturingBom($invoice, $tenantId);
    }

    /**
     * حركات مخزنية لفاتورة مبيعات: خصم من المخزن المختار.
     * - تصنيع آلي عند البيع (BOM): إدخال المنتج النهائي ثم صرفه + صرف المكونات (نفس مرجع الفاتورة).
     * - تصنيع يدوي (أوامر إنتاج): صرف المنتج النهائي من المخزون كأي صنف عادي.
     */
    private function createSalesInventoryMovements(Invoice $invoice, int $tenantId, string $valuationMethod = 'average'): void
    {
        $warehouseId = $invoice->warehouse_id;
        $allowNegativeSale = (bool) $this->tenantSettings->get($tenantId, 'allow_negative_sale', true);
        $autoMfgOnSale = $this->manufacturingAutoOnSale($tenantId);
        $mfgWarehouses = $this->invoiceHasAutoManufacturingBom($invoice, $tenantId)
            ? $this->requireAutoManufacturingWarehouseIds($tenantId)
            : null;

        $frozenByLineId = InvoiceManufacturingFrozenBatch::where('invoice_id', $invoice->id)
            ->with(['components.componentItem'])
            ->get()
            ->keyBy('invoice_line_id');

        $invoiceBranchId = $invoice->branch_id ? (int) $invoice->branch_id : null;

        if ($warehouseId || $mfgWarehouses) {
            // منع البيع بالسالب للصنف المباع (منتج نهائي أو صنف عادي) — لا يشمل خط BOM الآلي (يُجمَّع عند البيع)
            if (! $allowNegativeSale && $warehouseId) {
                $requiredByKey = [];
                foreach ($invoice->lines as $line) {
                    if (! $line->item_id || ! $line->item) {
                        continue;
                    }
                    $item = $line->item;
                    $qty = (float) $line->quantity;
                    if ($qty <= 0) {
                        continue;
                    }

                    $frozen = $frozenByLineId->get($line->id);
                    if ($frozen && $frozen->components->isNotEmpty() && $autoMfgOnSale) {
                        continue;
                    }

                    $bom = $this->getActiveBomForItem($line->item_id, $tenantId);
                    if ($bom && $bom->lines->isNotEmpty() && $autoMfgOnSale) {
                        continue;
                    }
                    if (! $item->track_quantity) {
                        continue;
                    }
                    $qtyBase = (float) $item->quantityToBase($qty, $line->unit_id);
                    if ($qtyBase <= 0) {
                        continue;
                    }
                    $id = (int) $line->item_id;
                    $vid = $line->item_variant_id ? (int) $line->item_variant_id : 0;
                    $key = $vid > 0 ? 'v:'.$vid : 'i:'.$id;
                    $requiredByKey[$key] = ($requiredByKey[$key] ?? 0.0) + $qtyBase;
                }

                foreach ($requiredByKey as $key => $requiredQtyBase) {
                    if (str_starts_with((string) $key, 'v:')) {
                        $variantId = (int) substr((string) $key, 2);
                        $available = (float) $this->inventoryService->getVariantStock($variantId, (int) $warehouseId);
                        $v = \App\Models\ItemVariant::find($variantId);
                        $label = $v ? $v->name : ('#'.$variantId);
                        if ($available + 1e-9 < (float) $requiredQtyBase) {
                            throw new \RuntimeException("لا يمكن إتمام البيع: الكمية غير متوفرة للمتغير ({$label}) في المخزن المحدد. المطلوب: {$requiredQtyBase}، المتوفر: {$available}");
                        }
                    } else {
                        $itemId = (int) substr((string) $key, 2);
                        $available = (float) $this->inventoryService->getItemStock($itemId, (int) $warehouseId);
                        if ($available + 1e-9 < (float) $requiredQtyBase) {
                            $name = \App\Models\Item::withoutGlobalScopes()->find($itemId)?->name ?? ('#'.$itemId);
                            throw new \RuntimeException("لا يمكن إتمام البيع: الكمية غير متوفرة للصنف ({$name}) في المخزن المحدد. المطلوب: {$requiredQtyBase}، المتوفر: {$available}");
                        }
                    }
                }
            }
        }

        $invoiceCostTotal = 0.0;
        $hadAutoManufacturing = false;
        $mfgRefNote = 'تصنيع آلي — مرتبط بفاتورة المبيعات';

        foreach ($invoice->lines as $line) {
            if (! $line->item_id || ! $line->item) {
                continue;
            }
            $item = $line->item;
            $qty = (float) $line->quantity;
            if ($qty <= 0) {
                continue;
            }

            $lineVariantId = $line->item_variant_id ? (int) $line->item_variant_id : null;

            $frozen = $frozenByLineId->get($line->id);
            $bom = $this->getActiveBomForItem($line->item_id, $tenantId);
            if ($frozen && $frozen->components->isNotEmpty() && $autoMfgOnSale) {
                $hadAutoManufacturing = true;
                $lineBomCost = 0.0;
                $rawWhId = (int) $frozen->raw_warehouse_id;
                $finishedWhId = (int) $frozen->finished_warehouse_id;
                $branchId = $frozen->branch_id ? (int) $frozen->branch_id : $invoiceBranchId;

                foreach ($frozen->components as $frozenComp) {
                    $componentItem = $frozenComp->componentItem;
                    if (! $componentItem || ! $componentItem->track_quantity) {
                        continue;
                    }
                    $qtyBase = (float) $frozenComp->qty_base;
                    if ($qtyBase <= 0) {
                        continue;
                    }
                    $totalCost = round((float) $frozenComp->total_cost, self::DECIMALS);
                    $unitCostRounded = round((float) $frozenComp->unit_cost, self::DECIMALS);

                    $movement = InventoryMovement::create([
                        'tenant_id' => $tenantId,
                        'item_id' => $componentItem->id,
                        'warehouse_id' => $rawWhId,
                        'branch_id' => $branchId,
                        'type' => 'out',
                        'quantity' => -round($qtyBase, 6),
                        'unit_cost' => $unitCostRounded,
                        'total_cost' => $totalCost,
                        'reference_type' => Invoice::class,
                        'reference_id' => $invoice->id,
                        'date' => $invoice->date,
                        'notes' => $mfgRefNote.' — صرف خام (لقطة BOM)',
                        'created_by' => auth()->id(),
                    ]);
                    $frozenComp->update(['inventory_movement_out_id' => $movement->id]);
                    $lineBomCost += $totalCost;
                    $invoiceCostTotal += $totalCost;
                }

                $qtyBaseFinished = (float) $frozen->finished_qty_base;
                if ($item->track_quantity && ! $item->use_serial_number && $qtyBaseFinished > 0) {
                    $rolledUnit = $qtyBaseFinished > 0 ? round($lineBomCost / $qtyBaseFinished, self::DECIMALS) : 0;
                    InventoryMovement::create(array_merge([
                        'tenant_id' => $tenantId,
                        'item_id' => $item->id,
                        'item_variant_id' => $lineVariantId,
                        'warehouse_id' => $finishedWhId,
                        'branch_id' => $branchId,
                        'type' => 'in',
                        'quantity' => round($qtyBaseFinished, 6),
                        'unit_cost' => $rolledUnit,
                        'total_cost' => round($lineBomCost, self::DECIMALS),
                        'reference_type' => Invoice::class,
                        'reference_id' => $invoice->id,
                        'date' => $invoice->date,
                        'notes' => $mfgRefNote.' — إنتاج (لقطة BOM)',
                        'created_by' => auth()->id(),
                    ], $line->movementExpiryPayload()));
                    InventoryMovement::create(array_merge([
                        'tenant_id' => $tenantId,
                        'item_id' => $item->id,
                        'item_variant_id' => $lineVariantId,
                        'warehouse_id' => $finishedWhId,
                        'branch_id' => $branchId,
                        'type' => 'out',
                        'quantity' => -round($qtyBaseFinished, 6),
                        'unit_cost' => $rolledUnit,
                        'total_cost' => round($lineBomCost, self::DECIMALS),
                        'reference_type' => Invoice::class,
                        'reference_id' => $invoice->id,
                        'date' => $invoice->date,
                        'notes' => $mfgRefNote.' — صرف تسليم (لقطة BOM)',
                        'created_by' => auth()->id(),
                    ], $line->movementExpiryPayload()));
                }
            } elseif ($bom && $bom->lines->isNotEmpty() && $autoMfgOnSale) {
                if (! $mfgWarehouses) {
                    throw new \RuntimeException('يرجى إكمال إعدادات الربط المخزني في إعدادات التصنيع.');
                }
                $hadAutoManufacturing = true;
                $lineBomCost = 0.0;
                $rawWhId = (int) $mfgWarehouses['raw'];
                $finishedWhId = (int) $mfgWarehouses['finished'];

                foreach ($bom->lines as $bomLine) {
                    $componentItem = $bomLine->componentItem;
                    if (! $componentItem || ! $componentItem->track_quantity) {
                        continue;
                    }
                    $componentQty = (float) $bomLine->quantity * $qty;
                    $qtyBase = $componentItem->quantityToBase($componentQty, $bomLine->unit_id);
                    if ($qtyBase <= 0) {
                        continue;
                    }
                    $unitCost = $bomLine->unit_cost !== null ? (float) $bomLine->unit_cost : (float) ($componentItem->cost_price ?? 0);
                    $totalCost = round($componentQty * $unitCost, self::DECIMALS);
                    $unitCostRounded = $qtyBase > 0 ? round($totalCost / $qtyBase, self::DECIMALS) : 0;
                    InventoryMovement::create([
                        'tenant_id' => $tenantId,
                        'item_id' => $componentItem->id,
                        'warehouse_id' => $rawWhId,
                        'branch_id' => $invoiceBranchId,
                        'type' => 'out',
                        'quantity' => -round($qtyBase, 6),
                        'unit_cost' => round($unitCostRounded, self::DECIMALS),
                        'total_cost' => $totalCost,
                        'reference_type' => Invoice::class,
                        'reference_id' => $invoice->id,
                        'date' => $invoice->date,
                        'notes' => $mfgRefNote.' — صرف خام',
                        'created_by' => auth()->id(),
                    ]);
                    $lineBomCost += $totalCost;
                    $invoiceCostTotal += $totalCost;
                }

                $qtyBaseFinished = $item->quantityToBase($qty, $line->unit_id);
                if ($item->track_quantity && ! $item->use_serial_number && $qtyBaseFinished > 0) {
                    $rolledUnit = $qtyBaseFinished > 0 ? round($lineBomCost / $qtyBaseFinished, self::DECIMALS) : 0;
                    InventoryMovement::create(array_merge([
                        'tenant_id' => $tenantId,
                        'item_id' => $item->id,
                        'item_variant_id' => $lineVariantId,
                        'warehouse_id' => $finishedWhId,
                        'branch_id' => $invoiceBranchId,
                        'type' => 'in',
                        'quantity' => round($qtyBaseFinished, 6),
                        'unit_cost' => $rolledUnit,
                        'total_cost' => round($lineBomCost, self::DECIMALS),
                        'reference_type' => Invoice::class,
                        'reference_id' => $invoice->id,
                        'date' => $invoice->date,
                        'notes' => $mfgRefNote.' — إنتاج',
                        'created_by' => auth()->id(),
                    ], $line->movementExpiryPayload()));
                    InventoryMovement::create(array_merge([
                        'tenant_id' => $tenantId,
                        'item_id' => $item->id,
                        'item_variant_id' => $lineVariantId,
                        'warehouse_id' => $finishedWhId,
                        'branch_id' => $invoiceBranchId,
                        'type' => 'out',
                        'quantity' => -round($qtyBaseFinished, 6),
                        'unit_cost' => $rolledUnit,
                        'total_cost' => round($lineBomCost, self::DECIMALS),
                        'reference_type' => Invoice::class,
                        'reference_id' => $invoice->id,
                        'date' => $invoice->date,
                        'notes' => $mfgRefNote.' — صرف تسليم',
                        'created_by' => auth()->id(),
                    ], $line->movementExpiryPayload()));
                }
            } elseif ($bom && $bom->lines->isNotEmpty() && ! $autoMfgOnSale) {
                if (! $item->track_quantity) {
                    continue;
                }
                $qtyBase = $item->quantityToBase($qty, $line->unit_id);
                $costData = $this->inventoryService->getItemCostForSale($line->item_id, $qtyBase, $warehouseId, $valuationMethod);
                $unitCost = (float) $costData['unit_cost'];
                $totalCost = (float) $costData['total_cost'];
                InventoryMovement::create(array_merge([
                    'tenant_id' => $tenantId,
                    'item_id' => $line->item_id,
                    'item_variant_id' => $lineVariantId,
                    'warehouse_id' => $warehouseId,
                    'branch_id' => $invoiceBranchId,
                    'type' => 'out',
                    'quantity' => -round($qtyBase, 6),
                    'unit_cost' => round($unitCost, self::DECIMALS),
                    'total_cost' => round($totalCost, self::DECIMALS),
                    'reference_type' => Invoice::class,
                    'reference_id' => $invoice->id,
                    'date' => $invoice->date,
                    'created_by' => auth()->id(),
                ], $line->movementExpiryPayload()));
                $invoiceCostTotal += $totalCost;
            } else {
                if (! $item->track_quantity) {
                    continue;
                }
                $qtyBase = $item->quantityToBase($qty, $line->unit_id);
                $costData = $this->inventoryService->getItemCostForSale($line->item_id, $qtyBase, $warehouseId, $valuationMethod);
                $unitCost = (float) $costData['unit_cost'];
                $totalCost = (float) $costData['total_cost'];
                InventoryMovement::create(array_merge([
                    'tenant_id' => $tenantId,
                    'item_id' => $line->item_id,
                    'item_variant_id' => $lineVariantId,
                    'warehouse_id' => $warehouseId,
                    'branch_id' => $invoiceBranchId,
                    'type' => 'out',
                    'quantity' => -round($qtyBase, 6),
                    'unit_cost' => round($unitCost, self::DECIMALS),
                    'total_cost' => round($totalCost, self::DECIMALS),
                    'reference_type' => Invoice::class,
                    'reference_id' => $invoice->id,
                    'date' => $invoice->date,
                    'created_by' => auth()->id(),
                ], $line->movementExpiryPayload()));
                $invoiceCostTotal += $totalCost;
            }
        }

        if ($hadAutoManufacturing) {
            $invoice->auto_manufacturing_applied = true;
        }
        if ($invoiceCostTotal > 0) {
            $invoice->cost_amount = round($invoiceCostTotal, self::DECIMALS);
        }
        if ($hadAutoManufacturing || $invoiceCostTotal > 0) {
            $invoice->save();
        }
    }
}
