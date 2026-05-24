<?php

namespace App\Services;

use App\Models\InventoryMovement;
use App\Models\Item;

class InventoryStockWebhookNotifier
{
    public function __construct(private WebhookService $webhooks) {}

    public function handleMovementSaved(InventoryMovement $movement): void
    {
        $tenantId = (int) $movement->tenant_id;
        $itemId = (int) $movement->item_id;
        if ($tenantId < 1 || $itemId < 1) {
            return;
        }

        $item = Item::query()->where('tenant_id', $tenantId)->find($itemId);
        if (! $item || ! $item->track_quantity || ! $item->is_active) {
            return;
        }

        $warehouseId = $movement->warehouse_id !== null ? (int) $movement->warehouse_id : null;
        $variantId = $movement->item_variant_id !== null ? (int) $movement->item_variant_id : null;

        $qtyDelta = (float) $movement->quantity;

        // نفس منطق تنبيهات النواقص: الرصيد = مجموع كل حركات الصنف (كل المتغيرات) مع اختيار المخزن فقط.
        $prev = $this->previousTotalStockForItemWarehouse($itemId, $warehouseId, $qtyDelta);
        $next = $prev + $qtyDelta;

        $this->maybeDispatch($tenantId, $item, $warehouseId, $variantId, $prev, $next);
    }

    public function handleMovementDeleted(InventoryMovement $movement): void
    {
        // Recompute by applying inverse delta (movement removed).
        $inverse = clone $movement;
        $inverse->quantity = (string) ((float) $movement->quantity * -1.0);
        $this->handleMovementSaved($inverse);
    }

    private function previousTotalStockForItemWarehouse(int $itemId, ?int $warehouseId, float $qtyDelta): float
    {
        $q = InventoryMovement::query()->where('item_id', $itemId);
        if ($warehouseId !== null) {
            $q->where('warehouse_id', $warehouseId);
        }

        $sum = (float) $q->sum('quantity');

        return $sum - $qtyDelta;
    }

    private function maybeDispatch(
        int $tenantId,
        Item $item,
        ?int $warehouseId,
        ?int $variantId,
        float $prev,
        float $next,
    ): void {
        $min = $item->min_quantity;
        if ($min === null) {
            return;
        }
        $minQty = (float) $min;
        if ($minQty <= 0) {
            return;
        }

        $payloadBase = [
            'item_id' => $item->id,
            'item_code' => (string) ($item->code ?? ''),
            'item_name' => (string) ($item->name ?? ''),
            'warehouse_id' => $warehouseId,
            'item_variant_id' => $variantId,
            'min_quantity' => $minQty,
            'previous_stock' => round($prev, 4),
            'current_stock' => round($next, 4),
        ];

        $wasLow = $prev <= $minQty;
        $isLow = $next <= $minQty;
        if (! $wasLow && $isLow) {
            $this->webhooks->dispatch('inventory.low', $payloadBase + [
                'shortage' => round(max(0.0, $minQty - $next), 4),
            ], $tenantId);
        }

        $wasOut = $prev <= 0.0000001;
        $isOut = $next <= 0.0000001;
        if (! $wasOut && $isOut) {
            $this->webhooks->dispatch('inventory.out_of_stock', $payloadBase, $tenantId);
        }
    }
}
