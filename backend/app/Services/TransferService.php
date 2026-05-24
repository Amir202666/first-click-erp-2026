<?php

namespace App\Services;

use App\Models\InventoryMovement;
use App\Models\Item;
use App\Models\TransferHeader;
use App\Models\TransferLine;
use Illuminate\Support\Facades\DB;

class TransferService
{
    public function __construct(
        private InventoryService $inventoryService,
    ) {}

    public function nextNumber(int $tenantId): string
    {
        $year = now()->format('Y');
        $last = TransferHeader::where('tenant_id', $tenantId)
            ->where('number', 'like', "TR-{$year}-%")
            ->orderByDesc('id')
            ->first();
        $seq = $last ? (int) substr($last->number, -5) + 1 : 1;

        return 'TR-'.$year.'-'.str_pad((string) $seq, 5, '0', STR_PAD_LEFT);
    }

    /**
     * إنشاء تحويل جديد (مسودة).
     */
    public function create(int $tenantId, array $data, int $createdBy): TransferHeader
    {
        return DB::transaction(function () use ($tenantId, $data, $createdBy) {
            $header = TransferHeader::create([
                'tenant_id' => $tenantId,
                'number' => $data['number'] ?? $this->nextNumber($tenantId),
                'from_warehouse_id' => $data['from_warehouse_id'],
                'to_warehouse_id' => $data['to_warehouse_id'],
                'branch_id' => $data['branch_id'] ?? null,
                'cost_center_id' => $data['cost_center_id'] ?? null,
                'status' => TransferHeader::STATUS_DRAFT,
                'date' => $data['date'] ?? now()->toDateString(),
                'notes' => $data['notes'] ?? null,
                'created_by' => $createdBy,
            ]);

            foreach ($data['lines'] ?? [] as $line) {
                $this->addLine($header, $line, (int) $data['from_warehouse_id']);
            }

            return $header->load(['fromWarehouse', 'toWarehouse', 'lines.item']);
        });
    }

    private function addLine(TransferHeader $header, array $line, int $fromWarehouseId): TransferLine
    {
        $item = Item::where('tenant_id', $header->tenant_id)->findOrFail($line['item_id']);
        $qty = (float) ($line['quantity'] ?? 0);
        if ($qty <= 0) {
            throw new \InvalidArgumentException('الكمية يجب أن تكون أكبر من صفر.');
        }

        // عند الإنشاء/التعديل على مسودة: منع إنشاء تحويل برصيد غير كافٍ
        $available = $this->inventoryService->getItemStock($item->id, $fromWarehouseId);
        if ($available < $qty) {
            throw new \InvalidArgumentException(
                'الكمية غير متوفرة للصنف '.($item->name ?? ('#'.$item->id)).'. المتاح '.$available
            );
        }

        $unitCost = (float) ($line['unit_cost'] ?? 0);
        $totalCost = $qty * $unitCost;

        return TransferLine::create([
            'transfer_header_id' => $header->id,
            'item_id' => $item->id,
            'quantity' => $qty,
            'unit_cost' => $unitCost,
            'total_cost' => $totalCost,
        ]);
    }

    /**
     * تحديث التحويل. إذا لم يكن مسودة يتم عكس حركاته أولاً ثم إرجاعه لمسودة.
     */
    public function update(TransferHeader $header, array $data): TransferHeader
    {
        return DB::transaction(function () use ($header, $data) {
            if ($header->status !== TransferHeader::STATUS_DRAFT) {
                $this->reverseTransferMovements($header);
                $header->update(['status' => TransferHeader::STATUS_DRAFT]);
            }

            $header->update([
                'from_warehouse_id' => $data['from_warehouse_id'] ?? $header->from_warehouse_id,
                'to_warehouse_id' => $data['to_warehouse_id'] ?? $header->to_warehouse_id,
                'branch_id' => array_key_exists('branch_id', $data) ? $data['branch_id'] : $header->branch_id,
                'cost_center_id' => array_key_exists('cost_center_id', $data) ? $data['cost_center_id'] : $header->cost_center_id,
                'date' => $data['date'] ?? $header->date,
                'notes' => $data['notes'] ?? $header->notes,
            ]);

            if (isset($data['lines'])) {
                $header->lines()->delete();
                foreach ($data['lines'] as $line) {
                    $this->addLine($header, $line, (int) ($data['from_warehouse_id'] ?? $header->from_warehouse_id));
                }
            }

            return $header->load(['fromWarehouse', 'toWarehouse', 'lines.item']);
        });
    }

    /**
     * قيد النقل: خصم من المخزن المصدر بمتوسط التكلفة وحفظ التكلفة في السطر.
     */
    public function setInTransit(TransferHeader $header, int $tenantId): TransferHeader
    {
        if ($header->status !== TransferHeader::STATUS_DRAFT) {
            throw new \InvalidArgumentException('الحالة الحالية لا تسمح بقيد النقل.');
        }

        return DB::transaction(function () use ($header, $tenantId) {
            $fromWarehouseId = $header->from_warehouse_id;
            $userId = auth()->id();

            foreach ($header->lines as $line) {
                $available = $this->inventoryService->getItemStock($line->item_id, $fromWarehouseId);
                if ($available < (float) $line->quantity) {
                    throw new \InvalidArgumentException(
                        'الكمية غير متوفرة للصنف '.$line->item->name.'. المتاح '.$available
                    );
                }
                $avgCost = $this->inventoryService->getItemAverageCost($line->item_id, $fromWarehouseId);
                $qty = (float) $line->quantity;
                $totalCost = $qty * $avgCost;

                $line->update(['unit_cost' => $avgCost, 'total_cost' => $totalCost]);

                InventoryMovement::create([
                    'tenant_id' => $tenantId,
                    'item_id' => $line->item_id,
                    'warehouse_id' => $fromWarehouseId,
                    'type' => 'transfer',
                    'quantity' => -$qty,
                    'unit_cost' => $avgCost,
                    'total_cost' => -$totalCost,
                    'reference_type' => TransferHeader::class,
                    'reference_id' => $header->id,
                    'date' => $header->date,
                    'notes' => 'تحويل خارج إلى مخزن آخر - '.$header->number,
                    'created_by' => $userId,
                ]);
            }

            $header->update(['status' => TransferHeader::STATUS_IN_TRANSIT]);

            return $header->load(['fromWarehouse', 'toWarehouse', 'lines.item']);
        });
    }

    /**
     * مستلم: إضافة للمخزن المستلم بنفس تكلفة السطر (متوسط التكلفة وقت النقل).
     */
    public function setReceived(TransferHeader $header, int $tenantId): TransferHeader
    {
        if ($header->status !== TransferHeader::STATUS_IN_TRANSIT) {
            throw new \InvalidArgumentException('الحالة الحالية لا تسمح بالاستلام.');
        }

        return DB::transaction(function () use ($header, $tenantId) {
            $toWarehouseId = $header->to_warehouse_id;
            $userId = auth()->id();

            foreach ($header->lines as $line) {
                $qty = (float) $line->quantity;
                $unitCost = (float) $line->unit_cost;
                $totalCost = $qty * $unitCost;

                InventoryMovement::create([
                    'tenant_id' => $tenantId,
                    'item_id' => $line->item_id,
                    'warehouse_id' => $toWarehouseId,
                    'type' => 'transfer',
                    'quantity' => $qty,
                    'unit_cost' => $unitCost,
                    'total_cost' => $totalCost,
                    'reference_type' => TransferHeader::class,
                    'reference_id' => $header->id,
                    'date' => $header->date,
                    'notes' => 'تحويل وارد من مخزن آخر - '.$header->number,
                    'created_by' => $userId,
                ]);
            }

            $header->update(['status' => TransferHeader::STATUS_RECEIVED]);

            return $header->load(['fromWarehouse', 'toWarehouse', 'lines.item']);
        });
    }

    public function delete(TransferHeader $header): void
    {
        DB::transaction(function () use ($header) {
            if ($header->status !== TransferHeader::STATUS_DRAFT) {
                $this->reverseTransferMovements($header);
            }

            $header->lines()->delete();
            $header->delete();
        });
    }

    /**
     * عكس جميع حركات المخزون الناتجة عن التحويل (قيد النقل + الاستلام).
     */
    private function reverseTransferMovements(TransferHeader $header): void
    {
        InventoryMovement::where('reference_type', TransferHeader::class)
            ->where('reference_id', $header->id)
            ->delete();

        if ($header->status !== TransferHeader::STATUS_DRAFT) {
            $header->update(['status' => TransferHeader::STATUS_DRAFT]);
        }
    }
}
