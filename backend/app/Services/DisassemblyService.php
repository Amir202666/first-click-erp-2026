<?php

namespace App\Services;

use App\Models\DisassemblyOrder;
use App\Models\DisassemblyOrderLine;
use App\Models\InventoryMovement;
use App\Models\Item;
use Illuminate\Support\Facades\DB;

class DisassemblyService
{
    public function __construct(
        private InventoryService $inventoryService,
        private TenantSettingsService $tenantSettings,
    ) {}

    public function nextDisassemblyOrderNumber(int $tenantId): string
    {
        $ym = date('Ym');
        $last = DisassemblyOrder::withTrashed()
            ->where('tenant_id', $tenantId)
            ->where('number', 'like', "DIS-{$ym}-%")
            ->orderByDesc('number')
            ->value('number');
        $seq = 1;
        if ($last && preg_match('/DIS-\d{6}-(\d+)$/', $last, $m)) {
            $seq = (int) $m[1] + 1;
        }

        return sprintf('DIS-%s-%04d', $ym, $seq);
    }

    /**
     * @param  array<int, array<string, mixed>>  $rows
     */
    public function syncLines(DisassemblyOrder $order, array $rows): void
    {
        $order->lines()->delete();

        $sort = 0;
        foreach ($rows as $row) {
            $qty = (float) ($row['quantity'] ?? 0);
            if ($qty <= 0.0000001) {
                throw new \InvalidArgumentException('يجب أن تكون كمية كل صنف ناتج أكبر من صفر.');
            }

            DisassemblyOrderLine::create([
                'disassembly_order_id' => $order->id,
                'item_id' => (int) $row['item_id'],
                'warehouse_id' => (int) $row['warehouse_id'],
                'quantity' => $qty,
                'unit_id' => isset($row['unit_id']) && $row['unit_id'] !== '' ? (int) $row['unit_id'] : null,
                'notes' => isset($row['notes']) ? trim((string) $row['notes']) : null,
                'sort_order' => $sort++,
                'unit_cost' => 0,
                'total_cost' => 0,
            ]);
        }
    }

    public function confirm(DisassemblyOrder $order): DisassemblyOrder
    {
        if ($order->status !== DisassemblyOrder::STATUS_DRAFT) {
            throw new \InvalidArgumentException('لا يمكن تأكيد أمر تفكيك غير مسودة.');
        }

        $order->load(['lines.item', 'lines.unit', 'item', 'warehouse']);
        if ($order->lines->isEmpty()) {
            throw new \InvalidArgumentException('يجب إضافة صنف ناتج واحد على الأقل.');
        }

        $tenantId = (int) $order->tenant_id;
        $sourceItem = $order->item;
        if (! $sourceItem) {
            throw new \InvalidArgumentException('تعذر تحميل الصنف المراد تفكيكه.');
        }

        $amountDecimals = (int) $this->tenantSettings->get($tenantId, 'doc_amount_decimals', 2);
        $amountDecimals = max(0, min(6, $amountDecimals));

        $sourceQtyBase = round((float) $order->quantity, 6);
        $stockBase = (float) $this->inventoryService->getItemStock((int) $order->item_id, (int) $order->warehouse_id);
        if ($stockBase < $sourceQtyBase) {
            $itemName = $sourceItem->name ?? $sourceItem->id;
            throw new \InvalidArgumentException("رصيد الصنف ({$itemName}) غير كافٍ. المطلوب: {$sourceQtyBase}، المتوفر: {$stockBase}");
        }

        $unitCostSource = round(
            (float) $this->inventoryService->getItemAverageCost((int) $order->item_id, (int) $order->warehouse_id),
            $amountDecimals
        );
        $totalCost = round($sourceQtyBase * $unitCostSource, $amountDecimals);

        $outputWeights = [];
        foreach ($order->lines as $line) {
            $lineItem = $line->item;
            if (! $lineItem) {
                throw new \InvalidArgumentException('تعذر تحميل أحد الأصناف الناتجة.');
            }
            $qtyBase = round((float) $lineItem->quantityToBase((float) $line->quantity, $line->unit_id), 6);
            if ($qtyBase <= 0.0000001) {
                throw new \InvalidArgumentException('كمية صنف ناتج غير صالحة.');
            }
            $outputWeights[(int) $line->id] = $qtyBase;
        }

        $allocated = $this->allocateByWeights($totalCost, $outputWeights, $amountDecimals);

        return DB::transaction(function () use ($order, $tenantId, $sourceQtyBase, $unitCostSource, $totalCost, $outputWeights, $allocated, $amountDecimals) {
            $date = $order->date->format('Y-m-d');
            $notes = 'أمر تفكيك رقم: '.$order->number;
            $userId = auth()->id();

            InventoryMovement::create([
                'tenant_id' => $tenantId,
                'item_id' => $order->item_id,
                'warehouse_id' => $order->warehouse_id,
                'type' => 'out',
                'quantity' => -round($sourceQtyBase, 6),
                'unit_cost' => $unitCostSource,
                'total_cost' => round($totalCost, $amountDecimals),
                'reference_type' => DisassemblyOrder::class,
                'reference_id' => $order->id,
                'date' => $date,
                'notes' => $notes,
                'created_by' => $userId,
            ]);

            foreach ($order->lines as $line) {
                $lineItem = $line->item;
                $qtyBase = $outputWeights[(int) $line->id];
                $lineTotal = $allocated[(int) $line->id] ?? 0;
                $lineUnitCost = $qtyBase > 0 ? round($lineTotal / $qtyBase, $amountDecimals) : 0;

                InventoryMovement::create([
                    'tenant_id' => $tenantId,
                    'item_id' => $line->item_id,
                    'warehouse_id' => $line->warehouse_id,
                    'type' => 'in',
                    'quantity' => round($qtyBase, 6),
                    'unit_cost' => $lineUnitCost,
                    'total_cost' => round($lineTotal, $amountDecimals),
                    'reference_type' => DisassemblyOrder::class,
                    'reference_id' => $order->id,
                    'date' => $date,
                    'notes' => $notes.' — '.($lineItem->name ?? $line->item_id),
                    'created_by' => $userId,
                ]);

                $line->update([
                    'unit_cost' => $lineUnitCost,
                    'total_cost' => round($lineTotal, $amountDecimals),
                ]);
            }

            $order->update([
                'status' => DisassemblyOrder::STATUS_COMPLETED,
                'unit_cost' => $unitCostSource,
                'total_cost' => $totalCost,
                'confirmed_by' => $userId,
                'confirmed_at' => now(),
            ]);

            return $order->fresh([
                'item',
                'warehouse',
                'lines.item',
                'lines.warehouse',
                'lines.unit',
                'createdByUser',
                'confirmedByUser',
            ]);
        });
    }

    public function cancel(DisassemblyOrder $order): DisassemblyOrder
    {
        if ($order->status === DisassemblyOrder::STATUS_COMPLETED) {
            throw new \InvalidArgumentException('لا يمكن إلغاء أمر تفكيك مكتمل.');
        }
        if ($order->status === DisassemblyOrder::STATUS_CANCELLED) {
            throw new \InvalidArgumentException('أمر التفكيك ملغى مسبقاً.');
        }

        $order->update(['status' => DisassemblyOrder::STATUS_CANCELLED]);

        return $order->fresh(['item', 'warehouse', 'lines.item', 'lines.warehouse']);
    }

    public function deleteInventoryMovementsForOrder(DisassemblyOrder $order): int
    {
        return InventoryMovement::where('reference_type', DisassemblyOrder::class)
            ->where('reference_id', $order->id)
            ->delete();
    }

    /**
     * @param  array<int, float>  $weightsByKey
     * @return array<int, float>
     */
    private function allocateByWeights(float $total, array $weightsByKey, int $decimals): array
    {
        $keys = array_keys($weightsByKey);
        $out = array_fill_keys($keys, 0.0);
        $t = round(max(0, $total), $decimals);
        if ($t <= 0 || $keys === []) {
            return $out;
        }

        $sumW = array_sum($weightsByKey);
        if ($sumW <= 0) {
            return $out;
        }

        $lastKey = $keys[count($keys) - 1];
        $acc = 0.0;
        foreach ($keys as $k) {
            if ($k === $lastKey) {
                break;
            }
            $v = round($t * ($weightsByKey[$k] / $sumW), $decimals);
            $out[$k] = $v;
            $acc = round($acc + $v, $decimals);
        }
        $out[$lastKey] = round($t - $acc, $decimals);

        return $out;
    }
}
