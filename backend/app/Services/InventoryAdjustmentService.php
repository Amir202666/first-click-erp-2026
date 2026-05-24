<?php

namespace App\Services;

use App\Models\InventoryAdjustment;
use App\Models\InventoryAdjustmentLine;
use App\Models\InventoryMovement;
use App\Models\Item;
use App\Models\JournalEntry;
use App\Models\TenantAccountDefault;
use Illuminate\Support\Facades\DB;

class InventoryAdjustmentService
{
    public function __construct(
        private InventoryService $inventoryService,
        private AccountingService $accountingService,
        private AccountResolutionService $accountResolutionService,
        private TenantSettingsService $tenantSettings,
    ) {}

    public function create(array $headerData, array $lines): InventoryAdjustment
    {
        return DB::transaction(function () use ($headerData, $lines) {
            /** @var InventoryAdjustment $adj */
            $adj = InventoryAdjustment::create($headerData);
            $this->assignDocumentNumberIfMissing($adj);
            $adj->refresh();

            return $this->applyImpact($adj, $lines);
        });
    }

    /**
     * رقم مرجعي للتتبع في القيود والتقارير (لا يُعاد توليده إن وُجد).
     */
    private function assignDocumentNumberIfMissing(InventoryAdjustment $adj): void
    {
        if ($adj->number !== null && trim((string) $adj->number) !== '') {
            return;
        }
        $tenantId = (int) $adj->tenant_id;
        $d = $adj->date;
        $year = $d instanceof \Carbon\CarbonInterface ? $d->format('Y') : substr((string) $d, 0, 4);
        if (strlen($year) < 4) {
            $year = date('Y');
        }
        $prefix = 'IA-'.$year.'-';
        $last = InventoryAdjustment::query()
            ->where('tenant_id', $tenantId)
            ->where('number', 'like', $prefix.'%')
            ->orderByDesc('id')
            ->value('number');
        $next = 1;
        if ($last && preg_match('/'.preg_quote($prefix, '/').'(\d+)$/', (string) $last, $m)) {
            $next = (int) $m[1] + 1;
        }
        $adj->number = $prefix.str_pad((string) $next, 6, '0', STR_PAD_LEFT);
        $adj->save();
    }

    /** مرجع التسوية للقيود (رقم المستند أو المعرف). */
    private function adjustmentDocumentRef(InventoryAdjustment $adj): string
    {
        return ($adj->number !== null && trim((string) $adj->number) !== '')
            ? trim((string) $adj->number)
            : ('#'.$adj->id);
    }

    /** وصف رأس القيد: موجز وموحّد مع أسلوب ERP. */
    private function buildJournalHeaderDescription(InventoryAdjustment $adj): string
    {
        return 'تسوية مخزون · '.$this->adjustmentDocumentRef($adj);
    }

    private function applyImpact(InventoryAdjustment $adj, array $lines): InventoryAdjustment
    {
        $tenantId = (int) $adj->tenant_id;
        $warehouseId = $adj->warehouse_id ? (int) $adj->warehouse_id : null;

        $addTotalValue = 0.0;
        $subtractTotalValue = 0.0;
        foreach ($lines as $l) {
            $itemId = (int) $l['item_id'];
            $displayQty = isset($l['quantity']) ? (float) $l['quantity'] : 0.0;
            if ($displayQty <= 0) {
                throw new \InvalidArgumentException('الكمية يجب أن تكون أكبر من صفر');
            }

            $unitId = array_key_exists('unit_id', $l) && $l['unit_id'] !== null ? (int) $l['unit_id'] : null;
            $conv = array_key_exists('conversion_factor', $l) && $l['conversion_factor'] !== null ? (float) $l['conversion_factor'] : null;

            $action = $l['action'] ?? null;
            if (! $action) {
                // توافق مع التسويات القديمة (قبل إضافة action لكل سطر)
                $action = $adj->adjustment_type === 'in' ? 'add' : 'subtract';
            }
            if (! in_array($action, ['add', 'subtract'], true)) {
                throw new \InvalidArgumentException('نوع الحركة غير صالح. يجب أن يكون add أو subtract');
            }
            $isAdd = $action === 'add';

            $item = Item::where('tenant_id', $tenantId)->findOrFail($itemId);
            $baseAvgCost = (float) $this->inventoryService->getItemAverageCost($itemId, $warehouseId);

            // تحديد وحدة الأساس ومعامل التحويل
            $options = $item->unit_options ?? $item->unitOptions ?? null;
            $baseOpt = is_array($options)
                ? collect($options)->firstWhere('is_base', true)
                : null;
            $baseUnitId = $item->unit_id ?? ($baseOpt['unit_id'] ?? null);
            $baseConv = 1.0;
            if ($unitId !== null && is_array($options)) {
                $selected = collect($options)->firstWhere('unit_id', $unitId);
                if ($selected && isset($selected['conversion_factor']) && (float) $selected['conversion_factor'] > 0) {
                    $baseConv = (float) $selected['conversion_factor'];
                }
            } elseif ($conv !== null && $conv > 0) {
                $baseConv = $conv;
            }
            if ($unitId === null) {
                $unitId = $baseUnitId ? (int) $baseUnitId : null;
            }

            $baseQty = $displayQty * $baseConv;

            // تكلفة الوحدة المختارة: إن وُجدت cost_price للوحدة نستخدمها، وإلا نعتمد متوسط التكلفة × معامل التحويل
            $displayUnitCost = $baseAvgCost * $baseConv;
            if ($unitId !== null && is_array($options)) {
                $selected = collect($options)->firstWhere('unit_id', $unitId);
                if ($selected && array_key_exists('cost_price', $selected) && $selected['cost_price'] !== null) {
                    $displayUnitCost = (float) $selected['cost_price'];
                }
            }
            $unitCostBase = $baseConv > 0 ? ($displayUnitCost / $baseConv) : $baseAvgCost;

            $lineTotal = $baseQty * $unitCostBase;
            $signedLineTotal = $isAdd ? $lineTotal : -$lineTotal;

            InventoryAdjustmentLine::create([
                'tenant_id' => $tenantId,
                'inventory_adjustment_id' => $adj->id,
                'item_id' => $itemId,
                'quantity' => $baseQty,
                'display_quantity' => $displayQty,
                'unit_id' => $unitId,
                'conversion_factor' => $baseConv,
                'unit_cost' => $unitCostBase,
                'total_cost' => $signedLineTotal,
                'action' => $action,
            ]);

            // منع الرصيد السالب عند الخصم
            if (! $isAdd) {
                $allowNegative = (bool) $this->tenantSettings->get($tenantId, 'allow_negative_sale', true);
                if (! $allowNegative) {
                    $available = $this->inventoryService->getItemStock($itemId, $warehouseId);
                    if ($available < $baseQty) {
                        throw new \InvalidArgumentException('الرصيد غير كافٍ للصنف: '.($item->name ?? ("#{$itemId}")).' (المتاح: '.$available.')');
                    }
                }
            }

            // حركة مخزون
            $movementQty = $isAdd ? $baseQty : -$baseQty;
            InventoryMovement::create([
                'tenant_id' => $tenantId,
                'item_id' => $itemId,
                'warehouse_id' => $warehouseId,
                'type' => 'adjustment',
                'quantity' => $movementQty,
                'unit_cost' => $unitCostBase,
                'total_cost' => abs($movementQty) * $unitCostBase,
                'reference_type' => InventoryAdjustment::class,
                'reference_id' => $adj->id,
                'date' => $adj->date,
                'notes' => $adj->notes,
                'created_by' => $adj->created_by,
            ]);

            $this->inventoryService->updateItemStock($itemId);
            if ($isAdd) {
                $addTotalValue += $lineTotal;
            } else {
                $subtractTotalValue += $lineTotal;
            }
        }

        // قيد محاسبي آلي: المخزون ↔ الحساب المختار يدوياً (target_account_id)
        $defaults = TenantAccountDefault::firstOrCreate(
            ['tenant_id' => $tenantId],
            array_fill_keys(TenantAccountDefault::requiredKeysForOperations(), null)
        );
        $invAccountId = $this->accountResolutionService->resolveInventoryAccount(null, $defaults);
        if (! $invAccountId) {
            throw new \RuntimeException('يجب تحديد حساب المخزون في الإعدادات الافتراضية أولاً.');
        }

        $targetAccountId = $adj->target_account_id ? (int) $adj->target_account_id : null;
        if (! $targetAccountId || $targetAccountId <= 0) {
            throw new \RuntimeException('يجب اختيار الحساب (المقابل للمخزون) للتسوية.');
        }
        if ($targetAccountId === (int) $invAccountId) {
            throw new \RuntimeException('لا يمكن أن يكون الحساب المختار نفس حساب المخزون.');
        }

        $ref = $this->adjustmentDocumentRef($adj);
        $headerDesc = $this->buildJournalHeaderDescription($adj);

        $amountDecimals = (int) $this->tenantSettings->get($tenantId, 'doc_amount_decimals', 2);
        $amountDecimals = max(0, min(6, $amountDecimals));

        // قيد مجمّع: إجمالي قيم الإضافات في بندي مدين/دائن واحد، وإجمالي الخصومات في بندين منفصلين
        // (سطر مدين واحد لحساب المخزون لكل إضافات، وسطر دائن واحد لحساب المخزون لكل خصومات — لا تكرار لكل صنف).
        $journalLines = [];
        if ($addTotalValue > 0) {
            $amount = round($addTotalValue, $amountDecimals);
            // إضافة: من ح/ المخزون إلى ح/ الحساب المختار
            $journalLines[] = ['account_id' => $invAccountId, 'debit' => $amount, 'credit' => 0, 'description' => 'زيادة مخزون · '.$ref];
            $journalLines[] = ['account_id' => $targetAccountId, 'debit' => 0, 'credit' => $amount, 'description' => 'مقابل · '.$ref];
        }
        if ($subtractTotalValue > 0) {
            $amount = round($subtractTotalValue, $amountDecimals);
            // خصم: من ح/ الحساب المختار إلى ح/ المخزون
            $journalLines[] = ['account_id' => $targetAccountId, 'debit' => $amount, 'credit' => 0, 'description' => 'نقص مخزون · '.$ref];
            $journalLines[] = ['account_id' => $invAccountId, 'debit' => 0, 'credit' => $amount, 'description' => 'مقابل · '.$ref];
        }
        if (count($journalLines) === 0) {
            throw new \RuntimeException('لا يمكن إنشاء قيد: قيمة التسوية تساوي صفر.');
        }

        /** @var JournalEntry $entry */
        $entry = $this->accountingService->createJournalEntry([
            'tenant_id' => $tenantId,
            'date' => $adj->date,
            'type' => 'adjustment',
            'description' => $headerDesc,
            'branch_id' => $adj->branch_id,
            'reference_type' => InventoryAdjustment::class,
            'reference_id' => $adj->id,
            'status' => 'posted',
            'created_by' => $adj->created_by,
            'posted_at' => now(),
        ], $journalLines);

        $adj->update(['journal_entry_id' => $entry->id]);

        return $adj->fresh(['lines.item', 'warehouse', 'branch', 'costCenter', 'createdBy', 'targetAccount', 'journalEntry.lines.account']);
    }

    public function updateWithImpact(InventoryAdjustment $adj, array $headerData, array $lines): InventoryAdjustment
    {
        return DB::transaction(function () use ($adj, $headerData, $lines) {
            $tenantId = (int) $adj->tenant_id;

            $oldLineItemIds = InventoryAdjustmentLine::where('tenant_id', $tenantId)
                ->where('inventory_adjustment_id', $adj->id)
                ->pluck('item_id')
                ->map(fn ($x) => (int) $x)
                ->values()
                ->all();

            // عكس الأثر: حذف الحركات + القيد + الأسطر
            InventoryMovement::where('tenant_id', $tenantId)
                ->where('reference_type', InventoryAdjustment::class)
                ->where('reference_id', $adj->id)
                ->delete();

            if ($adj->journal_entry_id) {
                $entryId = (int) $adj->journal_entry_id;
                \App\Models\JournalEntryLine::where('journal_entry_id', $entryId)->delete();
                JournalEntry::where('tenant_id', $tenantId)->where('id', $entryId)->delete();
            }

            InventoryAdjustmentLine::where('tenant_id', $tenantId)->where('inventory_adjustment_id', $adj->id)->delete();

            // إعادة حساب الأرصدة بعد حذف الحركات القديمة
            foreach (array_unique($oldLineItemIds) as $iid) {
                if ($iid > 0) {
                    $this->inventoryService->updateItemStock($iid);
                }
            }

            $adj->update([
                'adjustment_type' => $headerData['adjustment_type'] ?? $adj->adjustment_type,
                'warehouse_id' => $headerData['warehouse_id'] ?? $adj->warehouse_id,
                'target_account_id' => array_key_exists('target_account_id', $headerData) ? $headerData['target_account_id'] : $adj->target_account_id,
                'branch_id' => array_key_exists('branch_id', $headerData) ? $headerData['branch_id'] : $adj->branch_id,
                'cost_center_id' => array_key_exists('cost_center_id', $headerData) ? $headerData['cost_center_id'] : $adj->cost_center_id,
                'date' => $headerData['date'] ?? $adj->date,
                'notes' => array_key_exists('notes', $headerData) ? ($headerData['notes'] ?? null) : $adj->notes,
                'journal_entry_id' => null,
            ]);
            $fresh = $adj->fresh();
            if (! $fresh) {
                throw new \RuntimeException('تعذر تحديث التسوية');
            }
            $this->assignDocumentNumberIfMissing($fresh);
            $fresh->refresh();

            return $this->applyImpact($fresh, $lines);
        });
    }

    public function delete(InventoryAdjustment $adj): void
    {
        DB::transaction(function () use ($adj) {
            $tenantId = (int) $adj->tenant_id;
            $itemIds = InventoryAdjustmentLine::where('tenant_id', $tenantId)
                ->where('inventory_adjustment_id', $adj->id)
                ->pluck('item_id')
                ->map(fn ($x) => (int) $x)
                ->unique()
                ->values()
                ->all();
            // حذف الحركات المرتبطة
            InventoryMovement::where('tenant_id', $tenantId)
                ->where('reference_type', InventoryAdjustment::class)
                ->where('reference_id', $adj->id)
                ->delete();

            // حذف القيد (Hard delete مثل بعض العمليات)
            if ($adj->journal_entry_id) {
                $entryId = (int) $adj->journal_entry_id;
                \App\Models\JournalEntryLine::where('journal_entry_id', $entryId)->delete();
                JournalEntry::where('tenant_id', $tenantId)->where('id', $entryId)->delete();
            }

            InventoryAdjustmentLine::where('tenant_id', $tenantId)->where('inventory_adjustment_id', $adj->id)->delete();
            $adj->delete();
            foreach ($itemIds as $iid) {
                if ($iid > 0) {
                    $this->inventoryService->updateItemStock($iid);
                }
            }
        });
    }
}
