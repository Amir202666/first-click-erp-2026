<?php

namespace App\Services;

use App\Models\InventoryMovement;
use App\Models\Invoice;
use App\Models\Item;
use App\Models\JournalEntry;
use App\Models\OpeningStockHeader;
use Illuminate\Support\Facades\DB;

class OpeningStockService
{
    public function __construct(
        private InventoryService $inventoryService,
    ) {}

    public function approve(OpeningStockHeader $header): OpeningStockHeader
    {
        if (! $header->isDraft()) {
            throw new \InvalidArgumentException('لا يمكن اعتماد عملية معتمدة مسبقاً.');
        }

        $tenantId = $header->tenant_id;

        // ترحيل المخزون من إقفال سنة مالية يُسمح به حتى مع وجود فواتير لاحقة
        if ($header->source !== 'fiscal_year_close') {
            $hasInvoices = Invoice::where('tenant_id', $tenantId)
                ->where('status', 'sent')
                ->whereIn('type', ['sales', 'purchase'])
                ->exists();

            if ($hasInvoices) {
                throw new \InvalidArgumentException('لا يمكن اعتماد رصيد أول المدة بعد وجود فواتير مبيعات أو مشتريات مرحّلة.');
            }
        }

        return DB::transaction(function () use ($header, $tenantId) {
            $items = $header->items()->with('item')->get();
            if ($items->isEmpty()) {
                throw new \InvalidArgumentException('يجب إضافة أصناف قبل الاعتماد.');
            }

            // لا يمكن إدخال رصيد أول مدة لنفس الصنف مرتين لنفس الفرع
            $itemIds = $items->pluck('item_id')->unique();
            $branchId = $header->branch_id;
            $existing = OpeningStockHeader::where('tenant_id', $tenantId)
                ->where('branch_id', $branchId)
                ->where('status', 'approved')
                ->where('id', '!=', $header->id)
                ->whereHas('items', fn ($q) => $q->whereIn('item_id', $itemIds))
                ->exists();
            if ($existing) {
                throw new \InvalidArgumentException('لا يمكن إدخال رصيد أول مدة لنفس الصنف مرتين لنفس الفرع.');
            }

            foreach ($items as $line) {
                if ((float) $line->quantity <= 0 || (float) $line->unit_cost < 0) {
                    throw new \InvalidArgumentException("الكمية والتكلفة يجب أن تكونا أكبر من صفر للصنف: {$line->item->name}");
                }

                $totalCost = (float) $line->quantity * (float) $line->unit_cost;

                $stockBefore = $header->warehouse_id
                    ? $this->inventoryService->getItemStock($line->item_id, $header->warehouse_id)
                    : $this->inventoryService->getItemStock($line->item_id);

                // حركة مخزون: type = opening_balance, quantity موجب (داخل)
                InventoryMovement::create([
                    'tenant_id' => $tenantId,
                    'item_id' => $line->item_id,
                    'warehouse_id' => $header->warehouse_id,
                    'type' => 'opening_balance',
                    'quantity' => (float) $line->quantity,
                    'unit_cost' => (float) $line->unit_cost,
                    'total_cost' => $totalCost,
                    'reference_type' => OpeningStockHeader::class,
                    'reference_id' => $header->id,
                    'date' => $header->date,
                    'notes' => 'رصيد أول المدة - '.($header->reference_number ?? ''),
                    'created_by' => auth()->id(),
                ]);

                if ($stockBefore == 0) {
                    Item::where('id', $line->item_id)->update(['cost_price' => $line->unit_cost]);
                }
            }

            $header->update([
                'status' => 'approved',
                'approved_by' => auth()->id(),
                'approved_at' => now(),
            ]);

            return $header->fresh(['items.item', 'branch', 'warehouse']);
        });
    }

    /**
     * إلغاء ترحيل رصيد أول المدة: إبطال القيد، حذف حركات المخزون، وإعادة الحالة لمسودة.
     */
    public function unpost(OpeningStockHeader $header): OpeningStockHeader
    {
        if ($header->isDraft()) {
            throw new \InvalidArgumentException('العملية مسودة وليست معتمدة.');
        }

        return DB::transaction(function () use ($header) {
            if ($header->journal_entry_id) {
                JournalEntry::where('id', $header->journal_entry_id)->update(['status' => 'void']);
                $header->update(['journal_entry_id' => null]);
            }

            InventoryMovement::where('reference_type', OpeningStockHeader::class)
                ->where('reference_id', $header->id)
                ->delete();

            $header->update([
                'status' => 'draft',
                'approved_by' => null,
                'approved_at' => null,
            ]);

            return $header->fresh(['items.item', 'branch', 'warehouse']);
        });
    }
}
