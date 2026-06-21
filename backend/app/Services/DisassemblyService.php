<?php

namespace App\Services;

use App\Models\DisassemblyOrder;
use App\Models\DisassemblyOrderLine;
use App\Models\DisassemblyOrderSourceLine;
use App\Models\InventoryMovement;
use App\Models\Item;
use App\Models\JournalEntry;
use App\Models\JournalEntryLine;
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
    public function syncSourceLines(DisassemblyOrder $order, array $rows): void
    {
        $order->sourceLines()->delete();

        $amountDecimals = $this->amountDecimals((int) $order->tenant_id);
        $sort = 0;
        foreach ($rows as $row) {
            $qty = (float) ($row['quantity'] ?? 0);
            if ($qty <= 0.0000001) {
                throw new \InvalidArgumentException('يجب أن تكون كمية كل صنف مفكك أكبر من صفر.');
            }

            $unitCost = round((float) ($row['unit_cost'] ?? 0), $amountDecimals);
            $totalCost = isset($row['total_cost'])
                ? round((float) $row['total_cost'], $amountDecimals)
                : round($qty * $unitCost, $amountDecimals);

            DisassemblyOrderSourceLine::create([
                'disassembly_order_id' => $order->id,
                'item_id' => (int) $row['item_id'],
                'quantity' => $qty,
                'unit_id' => isset($row['unit_id']) && $row['unit_id'] !== '' ? (int) $row['unit_id'] : null,
                'notes' => isset($row['notes']) ? trim((string) $row['notes']) : null,
                'sort_order' => $sort++,
                'unit_cost' => $unitCost,
                'total_cost' => $totalCost,
            ]);
        }

        $this->syncHeaderFromSourceLines($order->fresh(['sourceLines']));
    }

    /**
     * @param  array<int, array<string, mixed>>  $rows
     */
    public function syncLines(DisassemblyOrder $order, array $rows): void
    {
        $order->lines()->delete();

        $amountDecimals = $this->amountDecimals((int) $order->tenant_id);
        $sort = 0;
        foreach ($rows as $row) {
            $qty = (float) ($row['quantity'] ?? 0);
            if ($qty <= 0.0000001) {
                throw new \InvalidArgumentException('يجب أن تكون كمية كل صنف ناتج أكبر من صفر.');
            }

            if (empty($row['warehouse_id'])) {
                throw new \InvalidArgumentException('يجب اختيار مستودع لكل صنف ناتج.');
            }

            $unitCost = round((float) ($row['unit_cost'] ?? 0), $amountDecimals);
            $totalCost = isset($row['total_cost'])
                ? round((float) $row['total_cost'], $amountDecimals)
                : round($qty * $unitCost, $amountDecimals);

            DisassemblyOrderLine::create([
                'disassembly_order_id' => $order->id,
                'item_id' => (int) $row['item_id'],
                'warehouse_id' => (int) $row['warehouse_id'],
                'quantity' => $qty,
                'unit_id' => isset($row['unit_id']) && $row['unit_id'] !== '' ? (int) $row['unit_id'] : null,
                'notes' => isset($row['notes']) ? trim((string) $row['notes']) : null,
                'sort_order' => $sort++,
                'unit_cost' => $unitCost,
                'total_cost' => $totalCost,
            ]);
        }
    }

    /**
     * @param  array<int, array<string, mixed>>  $sourceRows
     * @param  array<int, array<string, mixed>>  $outputRows
     */
    public function assertPayloadTotalsBalanced(array $sourceRows, array $outputRows, int $tenantId): void
    {
        $amountDecimals = $this->amountDecimals($tenantId);
        $epsilon = 10 ** (-$amountDecimals);

        $totalSourceCost = 0.0;
        foreach ($sourceRows as $row) {
            $totalSourceCost = round($totalSourceCost + $this->payloadLineTotal($row, $amountDecimals), $amountDecimals);
        }

        $totalOutputCost = 0.0;
        foreach ($outputRows as $row) {
            $totalOutputCost = round($totalOutputCost + $this->payloadLineTotal($row, $amountDecimals), $amountDecimals);
        }

        if (abs($totalSourceCost - $totalOutputCost) > $epsilon) {
            throw new \InvalidArgumentException(
                "مجموع تكلفة الأصناف الناتجة ({$totalOutputCost}) يجب أن يساوي مجموع تكلفة الأصناف المفككة ({$totalSourceCost})."
            );
        }
    }

    /**
     * @param  array<string, mixed>  $row
     */
    private function payloadLineTotal(array $row, int $amountDecimals): float
    {
        $totalCost = round((float) ($row['total_cost'] ?? 0), $amountDecimals);
        if ($totalCost > 0) {
            return $totalCost;
        }

        $qty = (float) ($row['quantity'] ?? 0);
        $unitCost = round((float) ($row['unit_cost'] ?? 0), $amountDecimals);

        return round($qty * $unitCost, $amountDecimals);
    }

    public function confirm(DisassemblyOrder $order): DisassemblyOrder
    {
        if ($order->status !== DisassemblyOrder::STATUS_DRAFT) {
            throw new \InvalidArgumentException('لا يمكن تأكيد أمر تفكيك غير مسودة.');
        }

        $order->load(['sourceLines.item', 'sourceLines.unit', 'lines.item', 'lines.unit', 'lines.warehouse', 'item', 'warehouse']);
        if ($order->lines->isEmpty()) {
            throw new \InvalidArgumentException('يجب إضافة صنف ناتج واحد على الأقل.');
        }

        $tenantId = (int) $order->tenant_id;
        $warehouseId = (int) $order->warehouse_id;
        $amountDecimals = $this->amountDecimals($tenantId);
        $epsilon = 10 ** (-$amountDecimals);

        $sourceLines = $order->sourceLines;
        if ($sourceLines->isEmpty()) {
            if (! $order->item_id) {
                throw new \InvalidArgumentException('يجب إضافة صنفاً واحداً على الأقل للتفكيك.');
            }
            $sourceLines = collect([(object) [
                'id' => 0,
                'item_id' => $order->item_id,
                'item' => $order->item,
                'quantity' => $order->quantity,
                'unit_id' => null,
                'unit_cost' => $order->unit_cost,
                'total_cost' => $order->total_cost,
            ]]);
        }

        $totalSourceCost = 0.0;
        $sourceMovements = [];
        foreach ($sourceLines as $line) {
            $sourceItem = $line->item ?? Item::find($line->item_id);
            if (! $sourceItem) {
                throw new \InvalidArgumentException('تعذر تحميل أحد الأصناف المراد تفكيكها.');
            }

            $sourceQtyBase = round((float) $sourceItem->quantityToBase((float) $line->quantity, $line->unit_id ?? null), 6);
            if ($sourceQtyBase <= 0.0000001) {
                throw new \InvalidArgumentException('كمية صنف مفكك غير صالحة.');
            }

            $stockBase = (float) $this->inventoryService->getItemStock((int) $line->item_id, $warehouseId);
            if ($stockBase < $sourceQtyBase) {
                $itemName = $sourceItem->name ?? $line->item_id;
                throw new \InvalidArgumentException("رصيد الصنف ({$itemName}) غير كافٍ. المطلوب: {$sourceQtyBase}، المتوفر: {$stockBase}");
            }

            $lineTotal = round((float) ($line->total_cost ?? 0), $amountDecimals);
            if ($lineTotal <= 0) {
                $unitCost = round((float) ($line->unit_cost ?? 0), $amountDecimals);
                $lineTotal = round($sourceQtyBase * $unitCost, $amountDecimals);
            }
            $lineUnitCost = $sourceQtyBase > 0 ? round($lineTotal / $sourceQtyBase, $amountDecimals) : 0;

            $totalSourceCost = round($totalSourceCost + $lineTotal, $amountDecimals);
            $sourceMovements[] = [
                'line' => $line,
                'sourceItem' => $sourceItem,
                'qtyBase' => $sourceQtyBase,
                'unitCost' => $lineUnitCost,
                'totalCost' => $lineTotal,
            ];
        }

        $totalOutputCost = 0.0;
        $outputMovements = [];
        foreach ($order->lines as $line) {
            $lineItem = $line->item;
            if (! $lineItem) {
                throw new \InvalidArgumentException('تعذر تحميل أحد الأصناف الناتجة.');
            }

            $qtyBase = round((float) $lineItem->quantityToBase((float) $line->quantity, $line->unit_id), 6);
            if ($qtyBase <= 0.0000001) {
                throw new \InvalidArgumentException('كمية صنف ناتج غير صالحة.');
            }

            $lineTotal = round((float) ($line->total_cost ?? 0), $amountDecimals);
            if ($lineTotal <= 0) {
                $unitCost = round((float) ($line->unit_cost ?? 0), $amountDecimals);
                $lineTotal = round($qtyBase * $unitCost, $amountDecimals);
            }
            $lineUnitCost = $qtyBase > 0 ? round($lineTotal / $qtyBase, $amountDecimals) : 0;

            $totalOutputCost = round($totalOutputCost + $lineTotal, $amountDecimals);
            $outputMovements[] = [
                'line' => $line,
                'lineItem' => $lineItem,
                'qtyBase' => $qtyBase,
                'unitCost' => $lineUnitCost,
                'totalCost' => $lineTotal,
            ];
        }

        if (abs($totalSourceCost - $totalOutputCost) > $epsilon) {
            throw new \InvalidArgumentException(
                "مجموع تكلفة الأصناف الناتجة ({$totalOutputCost}) يجب أن يساوي مجموع تكلفة الأصناف المفككة ({$totalSourceCost})."
            );
        }

        $affectsAverageCost = $this->disassemblyAffectsAverageCost($tenantId);

        return DB::transaction(function () use ($order, $tenantId, $warehouseId, $sourceMovements, $outputMovements, $totalSourceCost, $amountDecimals, $affectsAverageCost) {
            $date = $order->date->format('Y-m-d');
            $notes = 'أمر تفكيك رقم: '.$order->number;
            $userId = auth()->id();

            foreach ($sourceMovements as $mv) {
                InventoryMovement::create([
                    'tenant_id' => $tenantId,
                    'item_id' => $mv['line']->item_id,
                    'warehouse_id' => $warehouseId,
                    'type' => 'out',
                    'quantity' => -round($mv['qtyBase'], 6),
                    'unit_cost' => $mv['unitCost'],
                    'total_cost' => round($mv['totalCost'], $amountDecimals),
                    'reference_type' => DisassemblyOrder::class,
                    'reference_id' => $order->id,
                    'date' => $date,
                    'notes' => $notes.' — '.($mv['sourceItem']->name ?? $mv['line']->item_id),
                    'created_by' => $userId,
                ]);

                if ($mv['line'] instanceof DisassemblyOrderSourceLine) {
                    $mv['line']->update([
                        'unit_cost' => $mv['unitCost'],
                        'total_cost' => round($mv['totalCost'], $amountDecimals),
                    ]);
                }
            }

            foreach ($outputMovements as $mv) {
                $lineUnitCost = $mv['unitCost'];
                $lineTotalCost = round($mv['totalCost'], $amountDecimals);

                if (! $affectsAverageCost) {
                    $lineUnitCost = round(
                        (float) $this->inventoryService->getItemAverageCost(
                            (int) $mv['line']->item_id,
                            (int) $mv['line']->warehouse_id,
                        ),
                        $amountDecimals,
                    );
                    $lineTotalCost = round($mv['qtyBase'] * $lineUnitCost, $amountDecimals);
                }

                InventoryMovement::create([
                    'tenant_id' => $tenantId,
                    'item_id' => $mv['line']->item_id,
                    'warehouse_id' => $mv['line']->warehouse_id,
                    'type' => 'in',
                    'quantity' => round($mv['qtyBase'], 6),
                    'unit_cost' => $lineUnitCost,
                    'total_cost' => $lineTotalCost,
                    'reference_type' => DisassemblyOrder::class,
                    'reference_id' => $order->id,
                    'date' => $date,
                    'notes' => $notes.' — '.($mv['lineItem']->name ?? $mv['line']->item_id),
                    'created_by' => $userId,
                ]);

                $mv['line']->update([
                    'unit_cost' => $lineUnitCost,
                    'total_cost' => $lineTotalCost,
                ]);
            }

            if ($affectsAverageCost) {
                $this->syncOutputItemsCostPrice($tenantId, $outputMovements);
            }

            $firstSource = $sourceMovements[0] ?? null;
            $order->update([
                'status' => DisassemblyOrder::STATUS_COMPLETED,
                'item_id' => $firstSource ? $firstSource['line']->item_id : $order->item_id,
                'quantity' => $order->sourceLines->sum(fn ($l) => (float) $l->quantity) ?: $order->quantity,
                'unit_cost' => $firstSource ? $firstSource['unitCost'] : 0,
                'total_cost' => round($totalSourceCost, $amountDecimals),
                'confirmed_by' => $userId,
                'confirmed_at' => now(),
            ]);

            return $order->fresh([
                'item',
                'warehouse',
                'branch',
                'costCenter',
                'sourceLines.item',
                'sourceLines.unit',
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

        return $order->fresh(['item', 'warehouse', 'sourceLines.item', 'lines.item', 'lines.warehouse']);
    }

    public function deleteInventoryMovementsForOrder(DisassemblyOrder $order): int
    {
        return InventoryMovement::where('reference_type', DisassemblyOrder::class)
            ->where('reference_id', $order->id)
            ->delete();
    }

    public function deleteJournalEntriesForOrder(DisassemblyOrder $order): void
    {
        $tenantId = (int) $order->tenant_id;
        $entryIds = JournalEntry::where('tenant_id', $tenantId)
            ->where('reference_type', DisassemblyOrder::class)
            ->where('reference_id', $order->id)
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values()
            ->all();

        if ($entryIds === []) {
            return;
        }

        JournalEntryLine::whereIn('journal_entry_id', $entryIds)->delete();
        JournalEntry::where('tenant_id', $tenantId)->whereIn('id', $entryIds)->delete();
    }

    /**
     * حذف أمر التفكيك مع عكس حركات المخزون وأي قيود محاسبية مرتبطة.
     */
    public function forceDelete(DisassemblyOrder $order): void
    {
        DB::transaction(function () use ($order) {
            $order->load(['sourceLines.item', 'lines.item', 'lines.warehouse']);

            if ($order->status === DisassemblyOrder::STATUS_COMPLETED) {
                $this->assertCanReverseCompletedOrder($order);
            }

            $this->deleteJournalEntriesForOrder($order);
            $this->deleteInventoryMovementsForOrder($order);
            $order->sourceLines()->delete();
            $order->lines()->delete();
            $order->forceDelete();
        });
    }

    private function assertCanReverseCompletedOrder(DisassemblyOrder $order): void
    {
        $movements = InventoryMovement::where('tenant_id', $order->tenant_id)
            ->where('reference_type', DisassemblyOrder::class)
            ->where('reference_id', $order->id)
            ->get();

        foreach ($movements as $movement) {
            $qty = (float) $movement->quantity;
            if ($qty <= 0.0000001) {
                continue;
            }

            $stock = (float) $this->inventoryService->getItemStock((int) $movement->item_id, (int) $movement->warehouse_id);
            if ($stock + 0.000001 < $qty) {
                $item = Item::find($movement->item_id);
                $name = $item->name ?? $movement->item_id;
                throw new \InvalidArgumentException(
                    "لا يمكن حذف الأمر: رصيد الصنف ({$name}) غير كافٍ لعكس حركة الإدخال الناتجة عن التفكيك."
                );
            }
        }
    }

    public function syncHeaderFromSourceLines(DisassemblyOrder $order): void
    {
        $order->loadMissing('sourceLines');
        $first = $order->sourceLines->first();
        if (! $first) {
            return;
        }

        $totalQty = round($order->sourceLines->sum(fn ($l) => (float) $l->quantity), 4);
        $totalCost = round($order->sourceLines->sum(fn ($l) => (float) $l->total_cost), 4);

        $order->update([
            'item_id' => $first->item_id,
            'quantity' => $totalQty,
            'unit_cost' => $first->unit_cost,
            'total_cost' => $totalCost,
        ]);
    }

    private function amountDecimals(int $tenantId): int
    {
        $amountDecimals = (int) $this->tenantSettings->get($tenantId, 'doc_amount_decimals', 2);

        return max(0, min(6, $amountDecimals));
    }

    private function disassemblyAffectsAverageCost(int $tenantId): bool
    {
        return (bool) $this->tenantSettings->get($tenantId, 'disassembly_affects_average_cost', true);
    }

    /**
     * @param  array<int, array{line: DisassemblyOrderLine, lineItem: Item, qtyBase: float, unitCost: float, totalCost: float}>  $outputMovements
     */
    private function syncOutputItemsCostPrice(int $tenantId, array $outputMovements): void
    {
        $touchedItemIds = [];
        foreach ($outputMovements as $mv) {
            $lineItem = $mv['lineItem'] ?? null;
            if (! $lineItem || ! $lineItem->track_quantity) {
                continue;
            }
            $itemId = (int) $mv['line']->item_id;
            $warehouseId = (int) $mv['line']->warehouse_id;
            $touchedItemIds[$itemId] = $warehouseId;
        }

        foreach ($touchedItemIds as $itemId => $warehouseId) {
            $avg = (float) $this->inventoryService->getItemAverageCost($itemId, $warehouseId);
            Item::where('id', $itemId)->where('tenant_id', $tenantId)->update([
                'cost_price' => round(max(0, $avg), 4),
            ]);
        }
    }
}
