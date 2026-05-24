<?php

namespace App\Services;

use App\Models\Account;
use App\Models\InventoryMovement;
use App\Models\JournalEntry;
use App\Models\JournalEntryLine;
use App\Models\ProductionOrder;
use App\Models\ProductionOrderExpense;
use App\Models\ProductionOrderMaterial;
use Illuminate\Support\Facades\DB;

class ManufacturingService
{
    public function __construct(
        private InventoryService $inventoryService,
        private TenantSettingsService $tenantSettings,
        private AccountingService $accountingService,
        private AccountResolutionService $accountResolutionService,
    ) {}

    public function nextProductionOrderNumber(int $tenantId): string
    {
        $year = date('Y');
        $last = ProductionOrder::where('tenant_id', $tenantId)
            ->where('number', 'like', "MO-{$year}-%")
            ->orderByDesc('number')
            ->value('number');
        $seq = 1;
        if ($last && preg_match('/MO-\d{4}-(\d+)$/', $last, $m)) {
            $seq = (int) $m[1] + 1;
        }

        return sprintf('MO-%s-%06d', $year, $seq);
    }

    /**
     * استبدال بنود مصاريف التصنيع على أمر الإنتاج (مسودة) وتحديث حقل overhead_cost = مجموع المبالغ.
     *
     * @param  array<int, array<string, mixed>>  $rows
     */
    public function syncProductionOrderExpenses(ProductionOrder $order, array $rows, int $tenantId): void
    {
        $order->expenses()->delete();

        $sum = 0.0;
        $sort = 0;
        foreach ($rows as $row) {
            $amt = round((float) ($row['amount'] ?? 0), 4);
            if ($amt <= 0.0000001) {
                continue;
            }
            $accId = (int) ($row['expense_account_id'] ?? 0);
            if ($accId <= 0) {
                throw new \InvalidArgumentException('اختر حساب المصروف لكل سطر مبلغه أكبر من صفر.');
            }
            $account = Account::where('tenant_id', $tenantId)->where('id', $accId)->where('is_postable', true)->first();
            if (! $account) {
                throw new \InvalidArgumentException('حساب المصروف غير صالح أو غير قابل للترحيل.');
            }
            $desc = isset($row['description']) ? mb_substr(trim((string) $row['description']), 0, 500) : null;
            if ($desc === '') {
                $desc = null;
            }

            ProductionOrderExpense::create([
                'production_order_id' => $order->id,
                'expense_account_id' => $accId,
                'description' => $desc,
                'amount' => $amt,
                'sort_order' => $sort++,
            ]);
            $sum += $amt;
        }

        $order->update(['overhead_cost' => round($sum, 4)]);
    }

    /**
     * حذف قيود مصاريف أمر الإنتاج (قبل حذف الأمر أو عكس الاعتماد إن وُجد لاحقاً).
     */
    public function deleteExpenseJournalEntriesForOrder(ProductionOrder $order): void
    {
        $ids = $order->expenses()
            ->whereNotNull('journal_entry_id')
            ->pluck('journal_entry_id')
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values()
            ->all();
        if ($ids === []) {
            return;
        }
        JournalEntryLine::whereIn('journal_entry_id', $ids)->delete();
        JournalEntry::whereIn('id', $ids)->delete();
        ProductionOrderExpense::where('production_order_id', $order->id)->update(['journal_entry_id' => null]);
    }

    public function approve(ProductionOrder $order): ProductionOrder
    {
        if ($order->status !== ProductionOrder::STATUS_DRAFT) {
            throw new \InvalidArgumentException('لا يمكن اعتماد أمر إنتاج معتمد مسبقاً.');
        }

        $tenantId = $order->tenant_id;
        $rawWarehouseId = $order->raw_warehouse_id;
        $finishedWarehouseId = $order->finished_warehouse_id ?? $rawWarehouseId;
        $bom = $order->billOfMaterial()->with('lines.componentItem')->firstOrFail();
        $orderQty = (float) $order->quantity;

        if ($rawWarehouseId === null) {
            throw new \InvalidArgumentException('يجب تحديد مخزن المواد الخام.');
        }

        $amountDecimals = (int) $this->tenantSettings->get((int) $tenantId, 'doc_amount_decimals', 2);
        $amountDecimals = max(0, min(6, $amountDecimals));

        $overridesByLineId = [];
        if (is_array($order->line_overrides)) {
            foreach ($order->line_overrides as $row) {
                if (isset($row['bom_line_id'], $row['qty_display'])) {
                    $overridesByLineId[(int) $row['bom_line_id']] = (float) $row['qty_display'];
                }
            }
        }

        $materials = [];
        foreach ($bom->lines as $line) {
            $componentItem = $line->componentItem;
            if (! $componentItem) {
                throw new \InvalidArgumentException('تعذر قراءة صنف من قائمة المواد.');
            }
            $requiredDisplay = array_key_exists((int) $line->id, $overridesByLineId)
                ? (float) $overridesByLineId[(int) $line->id]
                : (float) $line->quantity * $orderQty;
            $requiredBase = (float) $componentItem->quantityToBase($requiredDisplay, $line->unit_id);

            $unitCostBase = (float) $this->inventoryService->getItemAverageCost((int) $componentItem->id, $rawWarehouseId);
            $stockBase = (float) $this->inventoryService->getItemStock((int) $componentItem->id, $rawWarehouseId);
            if ($stockBase < $requiredBase) {
                $itemName = $componentItem->name ?? $componentItem->id;
                throw new \InvalidArgumentException("رصيد الصنف ({$itemName}) غير كافٍ. المطلوب: {$requiredBase}، المتوفر: {$stockBase}");
            }
            $materials[] = [
                'item_id' => (int) $componentItem->id,
                'quantity_required_base' => $requiredBase,
                'unit_cost_base' => $unitCostBase,
                'total_cost' => round($requiredBase * $unitCostBase, $amountDecimals),
            ];
        }

        return DB::transaction(function () use ($order, $tenantId, $rawWarehouseId, $finishedWarehouseId, $orderQty, $materials, $amountDecimals) {
            $date = $order->order_date->format('Y-m-d');
            $notes = 'أمر إنتاج رقم: '.$order->number;
            $userId = auth()->id();

            foreach ($materials as $m) {
                InventoryMovement::create([
                    'tenant_id' => $tenantId,
                    'item_id' => $m['item_id'],
                    'warehouse_id' => $rawWarehouseId,
                    'type' => 'out',
                    'quantity' => -round((float) $m['quantity_required_base'], 6),
                    'unit_cost' => round((float) $m['unit_cost_base'], $amountDecimals),
                    'total_cost' => round((float) $m['total_cost'], $amountDecimals),
                    'reference_type' => ProductionOrder::class,
                    'reference_id' => $order->id,
                    'date' => $date,
                    'notes' => $notes,
                    'created_by' => $userId,
                ]);

                ProductionOrderMaterial::create([
                    'production_order_id' => $order->id,
                    'item_id' => $m['item_id'],
                    'quantity_required' => $m['quantity_required_base'],
                    'quantity_consumed' => $m['quantity_required_base'],
                    'unit_cost' => $m['unit_cost_base'],
                    'total_cost' => $m['total_cost'],
                ]);
            }

            $order->refresh();
            $order->load(['expenses', 'finishedItem']);
            $materialsCost = (float) array_sum(array_column($materials, 'total_cost'));
            $materialsCost = round($materialsCost, $amountDecimals);
            $overheadCost = round((float) $order->expenses->sum('amount'), $amountDecimals);
            $order->update(['overhead_cost' => $overheadCost]);

            $totalCost = round($materialsCost + $overheadCost, $amountDecimals);
            $finishedQtyBase = (float) $orderQty;
            $unitCostFinished = $finishedQtyBase > 0 ? round($totalCost / $finishedQtyBase, $amountDecimals) : 0;

            InventoryMovement::create([
                'tenant_id' => $tenantId,
                'item_id' => $order->finished_item_id,
                'warehouse_id' => $finishedWarehouseId,
                'type' => 'in',
                'quantity' => round($finishedQtyBase, 6),
                'unit_cost' => $unitCostFinished,
                'total_cost' => $totalCost,
                'reference_type' => ProductionOrder::class,
                'reference_id' => $order->id,
                'date' => $date,
                'notes' => $notes,
                'created_by' => $userId,
            ]);

            $defaults = $this->accountResolutionService->getDefaults($tenantId);
            $finishedItem = $order->finishedItem;
            if (! $finishedItem) {
                throw new \InvalidArgumentException('تعذر تحميل المنتج النهائي.');
            }
            $invAccountId = $this->accountResolutionService->resolveInventoryAccount($finishedItem, $defaults)
                ?? ($defaults->inventory_account_id ? (int) $defaults->inventory_account_id : null);
            if (! $invAccountId) {
                throw new \InvalidArgumentException('لم يتم تحديد حساب مخزون المنتج التام (من الصنف أو الإعدادات).');
            }

            $jeDec = AccountingService::JOURNAL_AMOUNT_DECIMALS;
            $costCenterId = $order->cost_center_id ? (int) $order->cost_center_id : null;
            $branchId = $order->branch_id ? (int) $order->branch_id : null;

            foreach ($order->expenses as $exp) {
                $amt = round((float) $exp->amount, $jeDec);
                if ($amt <= 0.0000001) {
                    continue;
                }
                $expAcc = (int) $exp->expense_account_id;
                $lineDesc = trim((string) ($exp->description ?? ''));
                if ($lineDesc === '') {
                    $lineDesc = 'مصاريف تصنيع';
                }
                $headerDesc = $lineDesc.' — أمر إنتاج '.$order->number;

                $entry = $this->accountingService->createJournalEntry([
                    'tenant_id' => $tenantId,
                    'number' => JournalEntry::nextNumberForTenantPrefix($tenantId, 'MOE'),
                    'date' => $order->order_date,
                    'type' => 'manufacturing',
                    'description' => $headerDesc,
                    'branch_id' => $branchId,
                    'reference_type' => ProductionOrderExpense::class,
                    'reference_id' => $exp->id,
                    'status' => 'posted',
                    'created_by' => $userId,
                    'posted_at' => now(),
                ], [
                    [
                        'account_id' => $invAccountId,
                        'cost_center_id' => $costCenterId,
                        'debit' => $amt,
                        'credit' => 0,
                        'description' => 'تكلفة منتج تام — '.$order->number,
                    ],
                    [
                        'account_id' => $expAcc,
                        'cost_center_id' => $costCenterId,
                        'debit' => 0,
                        'credit' => $amt,
                        'description' => $lineDesc,
                    ],
                ]);

                $exp->update(['journal_entry_id' => $entry->id]);
            }

            $order->update([
                'status' => ProductionOrder::STATUS_APPROVED,
                'approved_at' => now(),
                'approved_by' => $userId,
                'total_cost' => $totalCost,
            ]);

            return $order->fresh([
                'finishedItem',
                'billOfMaterial',
                'materials.item',
                'rawWarehouse',
                'finishedWarehouse',
                'expenses.expenseAccount',
                'expenses.journalEntry',
            ]);
        });
    }

    public function deleteInventoryMovementsForOrder(ProductionOrder $order): int
    {
        return InventoryMovement::where('reference_type', ProductionOrder::class)
            ->where('reference_id', $order->id)
            ->delete();
    }

    public function deleteOrphanedProductionOrderMovements(int $tenantId): int
    {
        $referenceIds = InventoryMovement::where('tenant_id', $tenantId)
            ->where('reference_type', ProductionOrder::class)
            ->distinct()
            ->pluck('reference_id');

        $deleted = 0;
        foreach ($referenceIds as $refId) {
            if (! ProductionOrder::where('tenant_id', $tenantId)->where('id', $refId)->exists()) {
                $deleted += InventoryMovement::where('tenant_id', $tenantId)
                    ->where('reference_type', ProductionOrder::class)
                    ->where('reference_id', $refId)
                    ->delete();
            }
        }

        return $deleted;
    }
}
