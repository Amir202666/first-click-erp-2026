<?php

namespace App\Services;

use App\Models\InventoryMovement;
use App\Models\Invoice;
use App\Models\Item;
use App\Models\ItemAttributeTemplate;
use App\Models\ItemUnit;
use App\Models\ItemVariant;
use App\Models\OpeningStockHeader;
use App\Models\ProductionOrder;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class InventoryService
{
    public function addMovement(array $data): InventoryMovement
    {
        return DB::transaction(function () use ($data) {
            $movement = InventoryMovement::create($data);
            $this->updateItemStock($data['item_id']);

            return $movement->load('item', 'createdBy');
        });
    }

    public function adjustStock(int $itemId, float $newQuantity, int $tenantId, ?string $notes = null): InventoryMovement
    {
        return DB::transaction(function () use ($itemId, $newQuantity, $tenantId, $notes) {
            $item = Item::where('tenant_id', $tenantId)->findOrFail($itemId);
            $currentStock = $this->getItemStock($itemId);
            $difference = $newQuantity - $currentStock;

            if ($difference == 0) {
                throw new \InvalidArgumentException('الرصيد الجديد مطابق للرصيد الحالي');
            }

            $movement = InventoryMovement::create([
                'tenant_id' => $tenantId,
                'item_id' => $itemId,
                'type' => 'adjustment',
                'quantity' => $difference,
                'unit_cost' => $item->cost_price,
                'total_cost' => abs($difference) * $item->cost_price,
                'date' => now()->toDateString(),
                'notes' => $notes ?? 'تعديل جرد',
                'created_by' => auth()->id(),
            ]);

            $this->updateItemStock($itemId);

            return $movement->load('item', 'createdBy');
        });
    }

    /**
     * رصيد الصنف الحالي من الحركات الفعلية (اختياري: حسب مخزن معين أو إجمالي كل المخازن).
     */
    public function getItemStock(int $itemId, ?int $warehouseId = null): float
    {
        $q = InventoryMovement::where('item_id', $itemId);
        if ($warehouseId !== null) {
            $q->where('warehouse_id', $warehouseId);
        }

        return (float) $q->sum('quantity');
    }

    /**
     * رصيد متغير محدد (مجموع الحركات حيث item_variant_id = المعرف).
     */
    public function getVariantStock(int $itemVariantId, ?int $warehouseId = null): float
    {
        $q = InventoryMovement::where('item_variant_id', $itemVariantId);
        if ($warehouseId !== null) {
            $q->where('warehouse_id', $warehouseId);
        }

        return (float) $q->sum('quantity');
    }

    public function getItemStockValue(int $itemId): float
    {
        $item = Item::find($itemId);
        if (! $item) {
            return 0;
        }

        return $this->getItemStock($itemId) * (float) $item->cost_price;
    }

    /**
     * متوسط تكلفة الصنف (اختياري: حسب مخزن معين؛ إن لم يُحدد يُحسب من كل الحركات الموجبة).
     */
    public function getItemAverageCost(int $itemId, ?int $warehouseId = null): float
    {
        $q = InventoryMovement::where('item_id', $itemId)->where('quantity', '>', 0);
        if ($warehouseId !== null) {
            $q->where('warehouse_id', $warehouseId);
        }
        $inMovements = $q->selectRaw('SUM(quantity) as total_qty, SUM(total_cost) as total_cost')->first();

        if (! $inMovements || $inMovements->total_qty == 0) {
            $item = Item::find($itemId);

            return $item ? (float) $item->cost_price : 0;
        }

        return (float) $inMovements->total_cost / (float) $inMovements->total_qty;
    }

    /**
     * تنبيهات النواقص لشركة معينة: أصناف وصلت لحد الطلب (min_quantity).
     * يُستخدم من واجهة API ومن أمر الخلفية inventory:low-stock-alerts.
     *
     * @return list<array{item_id: int, item_code: string, item_name: string, unit: string, current_stock: float, min_quantity: float, shortage: float}>
     */
    public function getLowStockAlerts(
        int $tenantId,
        ?int $warehouseId = null,
        ?int $itemId = null,
        ?int $categoryId = null,
        ?int $brandId = null
    ): array {
        $query = Item::where('tenant_id', $tenantId)
            ->where('track_quantity', true)
            ->where('is_active', true)
            ->whereNotNull('min_quantity')
            ->where('min_quantity', '>', 0)
            ->with('category')
            ->orderBy('name');

        if ($itemId !== null) {
            $query->where('id', $itemId);
        }
        if ($categoryId !== null) {
            $query->where('category_id', $categoryId);
        }
        if ($brandId !== null) {
            $query->where('brand_id', $brandId);
        }

        $items = $query->get();
        $alerts = [];
        foreach ($items as $item) {
            $stock = $this->getItemStock($item->id, $warehouseId);
            $minQty = (float) $item->min_quantity;
            if ($stock <= $minQty) {
                $alerts[] = [
                    'item_id' => $item->id,
                    'item_code' => $item->code,
                    'item_name' => $item->name,
                    'unit' => $item->unit ?? '',
                    'current_stock' => $stock,
                    'min_quantity' => $minQty,
                    'shortage' => max(0.0, $minQty - $stock),
                ];
            }
        }

        return $alerts;
    }

    /**
     * تكلفة سحب كمية للبيع حسب سياسة التقييم (المتوسط المرجح أو FIFO).
     * تُستخدم عند ترحيل فاتورة المبيعات لسحب التكلفة من رصيد أول المدة/المشتريات.
     *
     * @return array{unit_cost: float, total_cost: float}
     */
    public function getItemCostForSale(int $itemId, float $quantity, ?int $warehouseId, string $method = 'average'): array
    {
        $quantity = (float) $quantity;
        if ($quantity <= 0) {
            return ['unit_cost' => 0.0, 'total_cost' => 0.0];
        }

        $method = strtolower($method);
        if ($method === 'fifo') {
            return $this->getFifoCostForQuantity($itemId, $quantity, $warehouseId);
        }

        // weighted average (average / weighted_average)
        $avgCost = $this->getItemAverageCost($itemId, $warehouseId);
        $totalCost = round($avgCost * $quantity, 4);

        return [
            'unit_cost' => round($avgCost, 4),
            'total_cost' => $totalCost,
        ];
    }

    /**
     * تكلفة كمية معينة وفق FIFO (أول وارد أول صادر) من حركات المخزون الموجبة حسب التاريخ.
     *
     * @return array{unit_cost: float, total_cost: float}
     */
    private function getFifoCostForQuantity(int $itemId, float $quantity, ?int $warehouseId): array
    {
        $layers = $this->getFifoLayers($itemId, $warehouseId);
        $remaining = $quantity;
        $totalCost = 0.0;

        foreach ($layers as $layer) {
            if ($remaining <= 0) {
                break;
            }
            $take = min($remaining, (float) $layer['quantity']);
            $totalCost += $take * (float) $layer['unit_cost'];
            $remaining -= $take;
        }

        if ($remaining > 0) {
            $fallbackUnit = $this->getItemAverageCost($itemId, $warehouseId);
            $totalCost += $remaining * $fallbackUnit;
        }

        $totalCost = round($totalCost, 4);
        $unitCost = $quantity > 0 ? round($totalCost / $quantity, 4) : 0.0;

        return ['unit_cost' => $unitCost, 'total_cost' => $totalCost];
    }

    /**
     * طبقات المخزون الحالية حسب FIFO: تطبيق كل الحركات (داخل/خارج) بالترتيب.
     *
     * @return list<array{quantity: float, unit_cost: float}>
     */
    private function getFifoLayers(int $itemId, ?int $warehouseId): array
    {
        $q = InventoryMovement::where('item_id', $itemId)->orderBy('date')->orderBy('id');
        if ($warehouseId !== null) {
            $q->where('warehouse_id', $warehouseId);
        }
        $rows = $q->get(['quantity', 'unit_cost']);

        $layers = [];
        foreach ($rows as $r) {
            $qty = (float) $r->quantity;
            $uc = (float) $r->unit_cost;
            if ($qty > 0) {
                $layers[] = ['quantity' => $qty, 'unit_cost' => $uc];
            } else {
                $need = -$qty;
                while ($need > 0 && ! empty($layers)) {
                    $take = min($need, $layers[0]['quantity']);
                    $need -= $take;
                    $layers[0]['quantity'] -= $take;
                    if ($layers[0]['quantity'] <= 0) {
                        array_shift($layers);
                    }
                }
            }
        }

        return array_values(array_filter($layers, fn ($l) => $l['quantity'] > 0));
    }

    public function getItemAverageSellingPrice(int $itemId): float
    {
        $salesLines = DB::table('invoice_lines')
            ->join('invoices', 'invoices.id', '=', 'invoice_lines.invoice_id')
            ->where('invoices.type', 'sales')
            ->whereNotIn('invoices.status', ['draft', 'cancelled'])
            ->where('invoice_lines.item_id', $itemId)
            ->selectRaw('SUM(invoice_lines.quantity) as total_qty, SUM(invoice_lines.amount) as total_amount')
            ->first();

        if (! $salesLines || $salesLines->total_qty == 0) {
            return 0;
        }

        return (float) $salesLines->total_amount / (float) $salesLines->total_qty;
    }

    /**
     * رصيد أول المدة + الوارد + الصادر للصنف في نطاق تاريخ (اختياري: حسب مخزن).
     * الوارد = حركات موجبة (مشتريات، مرتجعات بيع، تحويل وارد، إلخ).
     * الصادر = حركات سالبة (مبيعات، مرتجعات شراء، توالف، هدايا، إلخ).
     */
    private function getItemOpeningInOut(int $itemId, string $fromDate, string $toDate, ?int $warehouseId = null): array
    {
        $q = InventoryMovement::where('item_id', $itemId);
        if ($warehouseId !== null) {
            $q->where('warehouse_id', $warehouseId);
        }

        $opening = (float) (clone $q)->whereDate('date', '<', $fromDate)->sum('quantity');

        $inPeriod = clone $q;
        $inPeriod->whereDate('date', '>=', $fromDate)->whereDate('date', '<=', $toDate);
        $incoming = (float) $inPeriod->where('quantity', '>', 0)->sum('quantity');
        $outgoing = (float) (clone $q)->whereDate('date', '>=', $fromDate)->whereDate('date', '<=', $toDate)->where('quantity', '<', 0)->sum(DB::raw('ABS(quantity)'));

        return [
            'opening_balance' => round($opening, 4),
            'incoming' => round($incoming, 4),
            'outgoing' => round($outgoing, 4),
        ];
    }

    public function getInventoryReport(int $tenantId, ?int $warehouseId = null, ?int $itemId = null, ?int $categoryId = null, ?int $brandId = null, ?string $fromDate = null, ?string $toDate = null, ?int $displayUnitId = null, string $unitNoMatch = 'hide'): array
    {
        $itemsQuery = Item::where('tenant_id', $tenantId)
            ->where('track_quantity', true)
            ->where('is_active', true)
            ->with('category', 'brand', 'unitOptions.unit')
            ->orderBy('name');

        if ($itemId !== null) {
            $itemsQuery->where('id', $itemId);
        }
        if ($categoryId !== null) {
            $itemsQuery->where('category_id', $categoryId);
        }
        if ($brandId !== null) {
            $itemsQuery->where('brand_id', $brandId);
        }

        $items = $itemsQuery->get();
        $usePeriod = $fromDate && $toDate;

        $displayUnitLabel = '';
        if ($displayUnitId !== null) {
            $displayUnitLabel = (string) (ItemUnit::where('tenant_id', $tenantId)->where('id', $displayUnitId)->value('name') ?? '');
        }

        $dec = $displayUnitId !== null ? 3 : 4;

        $financialTotal = 0.0;
        $report = [];
        $skippedWithoutUnit = 0;

        foreach ($items as $item) {
            $stock = $this->getItemStock($item->id, $warehouseId);
            $avgCost = $this->getItemAverageCost($item->id, $warehouseId);
            $avgSelling = $this->getItemAverageSellingPrice($item->id);
            $stockValue = $stock * $avgCost;
            $financialTotal += $stockValue;

            $row = [
                'id' => $item->id,
                'code' => $item->code,
                'name' => $item->name,
                'unit' => $item->unit,
                'category' => $item->category?->name,
                'category_id' => $item->category_id,
                'brand_id' => $item->brand_id,
                'current_stock' => round($stock, $dec),
                'stock_breakdown' => $item->getStockBreakdownByUnits($warehouseId),
                'cost_price' => round((float) $item->cost_price, $dec),
                'selling_price' => round((float) $item->selling_price, $dec),
                'average_cost' => round($avgCost, $dec),
                'average_selling' => round($avgSelling, $dec),
                'stock_value' => round($stockValue, $dec),
                'min_quantity' => round((float) $item->min_quantity, $dec),
                'is_low_stock' => $stock <= (float) $item->min_quantity,
            ];

            if ($usePeriod) {
                $openInOut = $this->getItemOpeningInOut($item->id, $fromDate, $toDate, $warehouseId);
                $row['opening_balance'] = round($openInOut['opening_balance'], $dec);
                $row['incoming'] = round($openInOut['incoming'], $dec);
                $row['outgoing'] = round($openInOut['outgoing'], $dec);
            } else {
                $row['opening_balance'] = null;
                $row['incoming'] = null;
                $row['outgoing'] = null;
            }

            if ($displayUnitId !== null) {
                $fDisp = $item->conversionFactorBasePerOneUnit($displayUnitId);
                if ($fDisp === null) {
                    if ($unitNoMatch === 'hide') {
                        $skippedWithoutUnit++;

                        continue;
                    }
                    $row['unit'] = $displayUnitLabel !== '' ? $displayUnitLabel : ($item->unit ?? '—');
                    $row['current_stock'] = 0.0;
                    $row['stock_breakdown'] = [
                        ['unit_id' => $displayUnitId, 'unit_name' => $row['unit'], 'quantity' => 0.0],
                    ];
                    if ($usePeriod) {
                        $row['opening_balance'] = 0.0;
                        $row['incoming'] = 0.0;
                        $row['outgoing'] = 0.0;
                    }
                    $row['cost_price'] = 0.0;
                    $row['selling_price'] = 0.0;
                    $row['average_cost'] = 0.0;
                    $row['average_selling'] = 0.0;
                    $row['min_quantity'] = 0.0;
                    $row['is_low_stock'] = false;
                    $row['stock_value'] = round($stockValue, $dec);
                } else {
                    $fDef = $item->conversionFactorBasePerOneUnit((int) $item->unit_id) ?? 1.0;
                    $ratio = $fDisp / max(1e-12, $fDef);
                    $row['unit'] = $displayUnitLabel !== '' ? $displayUnitLabel : ($item->unit ?? '—');
                    $row['current_stock'] = round($stock / $fDisp, $dec);
                    if ($usePeriod && $row['opening_balance'] !== null) {
                        $row['opening_balance'] = round((float) $row['opening_balance'] / $fDisp, $dec);
                        $row['incoming'] = round((float) $row['incoming'] / $fDisp, $dec);
                        $row['outgoing'] = round((float) $row['outgoing'] / $fDisp, $dec);
                    }
                    $row['cost_price'] = round((float) $item->cost_price * $ratio, $dec);
                    $row['selling_price'] = round((float) $item->selling_price * $ratio, $dec);
                    $row['average_cost'] = round($avgCost * $fDisp, $dec);
                    $row['average_selling'] = round($avgSelling * $fDisp, $dec);
                    $row['stock_value'] = round($stockValue, $dec);
                    $row['min_quantity'] = round((float) $item->min_quantity / $fDisp, $dec);
                    $row['is_low_stock'] = $row['current_stock'] <= $row['min_quantity'];
                    $row['stock_breakdown'] = [
                        [
                            'unit_id' => $displayUnitId,
                            'unit_name' => $row['unit'],
                            'quantity' => $row['current_stock'],
                        ],
                    ];
                }
            }

            $report[] = $row;
        }

        return [
            'items' => $report,
            'summary' => [
                'total_items' => count($report),
                'total_stock_value' => round($financialTotal, $dec),
                'low_stock_count' => collect($report)->where('is_low_stock', true)->count(),
                'items_omitted_without_unit' => $skippedWithoutUnit,
                'display_unit_id' => $displayUnitId,
                'display_unit_label' => $displayUnitLabel !== '' ? $displayUnitLabel : null,
                'unit_no_match_mode' => $displayUnitId !== null ? $unitNoMatch : null,
            ],
        ];
    }

    public function getItemMovements(int $itemId, int $tenantId, ?string $fromDate = null, ?string $toDate = null, ?int $warehouseId = null, ?int $branchId = null, ?int $costCenterId = null, ?int $createdById = null, ?string $voucherKind = null): array
    {
        $query = InventoryMovement::where('item_id', $itemId)
            ->where('tenant_id', $tenantId)
            ->with(['createdBy', 'reference', 'warehouse'])
            ->orderBy('date')
            ->orderBy('id');

        if ($fromDate) {
            // نستخدم whereDate لضمان شمول كامل اليوم بدون التأثر بحقل الوقت
            $query->whereDate('date', '>=', $fromDate);
        }
        if ($toDate) {
            $query->whereDate('date', '<=', $toDate);
        }
        if ($warehouseId !== null) {
            $query->where('warehouse_id', $warehouseId);
        }
        if ($branchId !== null) {
            $query->where(function ($q) use ($branchId) {
                $q->whereHasMorph('reference', [\App\Models\Invoice::class, \App\Models\OpeningStockHeader::class], fn ($q2) => $q2->where('branch_id', $branchId));
            });
        }
        if ($createdById !== null) {
            $query->where('created_by', $createdById);
        }
        if ($costCenterId !== null) {
            $query->where(function ($q) use ($costCenterId, $itemId) {
                $q->whereHasMorph('reference', [Invoice::class], function ($iq) use ($costCenterId) {
                    $iq->where('cost_center_id', $costCenterId);
                })
                    ->orWhereHasMorph('reference', [ProductionOrder::class], function ($pq) use ($costCenterId) {
                        $pq->where('cost_center_id', $costCenterId);
                    })
                    ->orWhereHasMorph('reference', [OpeningStockHeader::class], function ($osq) use ($costCenterId, $itemId) {
                        $osq->whereHas('items', function ($itq) use ($costCenterId, $itemId) {
                            $itq->where('item_id', $itemId)->where('cost_center_id', $costCenterId);
                        });
                    });
            });
        }

        $movements = $query->get();

        $voucherKind = $voucherKind !== null ? trim($voucherKind) : '';
        if ($voucherKind !== '') {
            $allowedKinds = [
                'purchase_invoice', 'sales_invoice', 'purchase_return', 'sales_return',
                'opening_stock', 'stock_transfer', 'production_order', 'inventory_adjustment',
                'manual_adjustment', 'invoice', 'other',
            ];
            if (in_array($voucherKind, $allowedKinds, true)) {
                $movements = $movements
                    ->filter(function (InventoryMovement $m) use ($voucherKind) {
                        $k = $m->source_details['voucher_kind'] ?? 'other';

                        return $k === $voucherKind;
                    })
                    ->values();
            }
        }

        $runningBalance = 0.0;
        $movementsWithBalance = [];

        foreach ($movements as $m) {
            $qty = (float) $m->quantity;
            $balanceBefore = $runningBalance;
            $runningBalance += $qty;
            $balanceAfter = $runningBalance;

            $qtyIn = $qty > 0 ? $qty : 0.0;
            $qtyOut = $qty < 0 ? abs($qty) : 0.0;

            $movementsWithBalance[] = [
                'id' => $m->id,
                'date' => $m->date->format('Y-m-d'),
                'type' => $m->type,
                'warehouse_id' => $m->warehouse_id,
                'warehouse_name' => $m->warehouse?->name,
                'quantity' => $qty,
                'quantity_in' => $qtyIn,
                'quantity_out' => $qtyOut,
                'unit_cost' => (float) $m->unit_cost,
                'total_cost' => (float) $m->total_cost,
                'balance_before' => $balanceBefore,
                'balance_after' => $balanceAfter,
                'notes' => $m->notes,
                'reference_type' => $m->reference_type,
                'reference_id' => $m->reference_id,
                'source' => $m->source_details,
                'created_by_id' => $m->created_by,
                'created_by_name' => $m->createdBy?->name,
                'created_at' => $m->created_at->format('Y-m-d H:i'),
            ];
        }

        return $movementsWithBalance;
    }

    /**
     * تقرير جرد المتغيرات: رصيد لكل (صنف + متغير).
     * يُحسب رصيد المتغير من مجموع الحركات المرتبطة بـ item_variant_id، ثم يُضاف نصيب متساوٍ
     * من حركات الصنف غير المخصصة لمتغير (item_variant_id = null) حتى يبقى مجموع صفوف المتغيرات
     * مساوياً لرصيد الصنف في تقرير الجرد عند نفس فلاتر المخزن/الفرع.
     * القيم المالية تستخدم نفس متوسط تكلفة الصنف من getItemAverageCost (3 خانات عشرية).
     *
     * @return array{rows: \Illuminate\Support\Collection, total: int, summary: array{total_stock_value: float, total_quantity: float}}
     */
    public function getVariantInventoryReport(
        int $tenantId,
        ?int $warehouseId = null,
        ?int $branchId = null,
        ?int $itemId = null,
        ?int $categoryId = null,
        ?int $brandId = null,
        ?int $attributeTemplateId = null,
        ?string $attributeValue = null,
        int $perPage = 50,
        int $page = 1,
    ): array {
        $movementAgg = DB::table('inventory_movements')
            ->selectRaw('item_variant_id, COALESCE(SUM(quantity), 0) as current_stock')
            ->where('tenant_id', $tenantId)
            ->whereNotNull('item_variant_id')
            ->when($warehouseId, fn ($q) => $q->where('warehouse_id', $warehouseId))
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->groupBy('item_variant_id');

        $orphanAgg = DB::table('inventory_movements')
            ->selectRaw('item_id, COALESCE(SUM(quantity), 0) as orphan_stock')
            ->where('tenant_id', $tenantId)
            ->whereNull('item_variant_id')
            ->when($warehouseId, fn ($q) => $q->where('warehouse_id', $warehouseId))
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->groupBy('item_id');

        $variantCountSub = DB::table('item_variants')
            ->selectRaw('item_id, COUNT(*) as variant_count')
            ->where('tenant_id', $tenantId)
            ->groupBy('item_id');

        $query = ItemVariant::query()
            ->join('items', 'items.id', '=', 'item_variants.item_id')
            ->leftJoinSub($movementAgg, 'agg', 'agg.item_variant_id', '=', 'item_variants.id')
            ->leftJoinSub($orphanAgg, 'orphan', 'orphan.item_id', '=', 'items.id')
            ->leftJoinSub($variantCountSub, 'vcnt', 'vcnt.item_id', '=', 'items.id')
            ->where('item_variants.tenant_id', $tenantId)
            ->where('items.tenant_id', $tenantId)
            ->where('items.track_quantity', true)
            ->where('items.is_active', true)
            ->when($itemId, fn ($q) => $q->where('items.id', $itemId))
            ->when($categoryId, fn ($q) => $q->where('items.category_id', $categoryId))
            ->when($brandId, fn ($q) => $q->where('items.brand_id', $brandId))
            ->select([
                'item_variants.id',
                'item_variants.item_id',
                'item_variants.name',
                'item_variants.options',
                'item_variants.barcode',
                'item_variants.sku',
                'item_variants.sort_order',
                'items.code as item_code',
                'items.name as item_name',
                'items.unit as item_unit',
                DB::raw('COALESCE(agg.current_stock, 0) + (COALESCE(orphan.orphan_stock, 0) / NULLIF(COALESCE(vcnt.variant_count, 1), 0)) as current_stock'),
            ]);

        $templateName = null;
        if ($attributeTemplateId) {
            $templateName = ItemAttributeTemplate::where('tenant_id', $tenantId)
                ->where('id', $attributeTemplateId)
                ->value('name');
            if ($templateName) {
                $path = '$."'.str_replace(['\\', '"'], ['\\\\', '\\"'], (string) $templateName).'"';
                $query->whereRaw('JSON_EXTRACT(item_variants.options, ?) IS NOT NULL', [$path]);
            }
        }

        $valueTrimmed = $attributeValue !== null ? trim((string) $attributeValue) : '';
        if ($valueTrimmed !== '') {
            $like = '%'.addcslashes($valueTrimmed, '%_\\').'%';
            if ($templateName) {
                $path = '$."'.str_replace(['\\', '"'], ['\\\\', '\\"'], (string) $templateName).'"';
                $query->whereRaw('JSON_UNQUOTE(JSON_EXTRACT(item_variants.options, ?)) like ?', [$path, $like]);
            } else {
                $query->where(function ($q) use ($like) {
                    $q->where('item_variants.name', 'like', $like)
                        ->orWhereRaw('CAST(item_variants.options AS CHAR) like ?', [$like]);
                });
            }
        }

        $query->orderBy('items.code')
            ->orderBy('item_variants.sort_order')
            ->orderBy('item_variants.id');

        $summaryQuery = clone $query;
        $summaryRows = $summaryQuery->get();
        $avgCache = [];
        $totalStockValue = 0.0;
        $totalQuantity = 0.0;
        foreach ($summaryRows as $row) {
            $iid = (int) $row->item_id;
            if (! isset($avgCache[$iid])) {
                $avgCache[$iid] = $this->getItemAverageCost($iid, $warehouseId);
            }
            $qty = round((float) $row->current_stock, 3);
            $totalQuantity += $qty;
            $totalStockValue += round($qty * $avgCache[$iid], 3);
        }

        $paginator = $query->paginate($perPage, ['*'], 'page', max(1, $page));

        $rows = $paginator->getCollection()->map(function ($row) use ($warehouseId, $avgCache) {
            $iid = (int) $row->item_id;
            if (! isset($avgCache[$iid])) {
                $avgCache[$iid] = $this->getItemAverageCost($iid, $warehouseId);
            }
            $qty = round((float) $row->current_stock, 3);
            $avg = round((float) $avgCache[$iid], 3);
            $opts = $row->options;
            $optionsDisplay = '';
            if (is_array($opts) && $opts !== []) {
                $parts = [];
                foreach ($opts as $k => $v) {
                    $parts[] = $k.': '.$v;
                }
                $optionsDisplay = implode(' | ', $parts);
            }

            return [
                'id' => (int) $row->id,
                'item_id' => $iid,
                'item_code' => (string) $row->item_code,
                'item_name' => (string) $row->item_name,
                'item_unit' => (string) ($row->item_unit ?? ''),
                'variant_name' => (string) $row->name,
                'options' => is_array($opts) ? $opts : [],
                'options_display' => $optionsDisplay,
                'barcode' => $row->barcode,
                'sku' => $row->sku,
                'current_stock' => $qty,
                'average_cost' => $avg,
                'stock_value' => round($qty * $avg, 3),
            ];
        });

        $paginator->setCollection($rows);

        return [
            'paginator' => $paginator,
            'summary' => [
                'total_stock_value' => round($totalStockValue, 3),
                'total_quantity' => round($totalQuantity, 3),
            ],
        ];
    }

    /**
     * تجميعات مخزون بكمية موجبة وتاريخ صلاحية (ورقم باتش اختياري)، للتنبيهات (اقتراب الانتهاء).
     *
     * @return list<array<string, mixed>>
     */
    public function getExpiringStockAlerts(int $tenantId, int $withinDays = 30, ?int $warehouseId = null, int $limit = 30): array
    {
        $withinDays = max(1, min(365, $withinDays));
        $today = Carbon::today()->toDateString();
        $until = Carbon::today()->addDays($withinDays)->toDateString();

        $sub = DB::table('inventory_movements')
            ->selectRaw('item_id, item_variant_id, warehouse_id, batch_number, expiry_date, SUM(quantity) as qty')
            ->where('tenant_id', $tenantId)
            ->whereNotNull('expiry_date')
            ->when($warehouseId, fn ($q) => $q->where('warehouse_id', $warehouseId))
            ->groupBy('item_id', 'item_variant_id', 'warehouse_id', 'batch_number', 'expiry_date')
            ->havingRaw('SUM(quantity) > 0.0001');

        $rows = DB::query()
            ->fromSub($sub, 'lots')
            ->where('lots.qty', '>', 0.0001)
            ->whereDate('lots.expiry_date', '>=', $today)
            ->whereDate('lots.expiry_date', '<=', $until)
            ->join('items', 'items.id', '=', 'lots.item_id')
            ->where('items.tenant_id', $tenantId)
            ->leftJoin('item_variants', 'item_variants.id', '=', 'lots.item_variant_id')
            ->leftJoin('warehouses', 'warehouses.id', '=', 'lots.warehouse_id')
            ->orderBy('lots.expiry_date')
            ->orderBy('items.code')
            ->limit($limit)
            ->get([
                'lots.expiry_date',
                'lots.qty',
                'lots.batch_number',
                'items.code as item_code',
                'items.name as item_name',
                'item_variants.name as variant_name',
                'warehouses.name as warehouse_name',
            ]);

        return $rows->map(function ($r) {
            return [
                'expiry_date' => $r->expiry_date ? Carbon::parse($r->expiry_date)->toDateString() : null,
                'qty' => round((float) $r->qty, 4),
                'batch_number' => $r->batch_number !== null && $r->batch_number !== '' ? (string) $r->batch_number : null,
                'item_code' => (string) $r->item_code,
                'item_name' => (string) $r->item_name,
                'variant_name' => $r->variant_name ? (string) $r->variant_name : null,
                'warehouse_name' => $r->warehouse_name ? (string) $r->warehouse_name : null,
            ];
        })->all();
    }

    /**
     * تقرير مخزون حسب تاريخ الصلاحية ورقم الباتش (من حركات المخزون).
     *
     * @param  array{warehouse_id?: int|null, branch_id?: int|null, filter?: string, within_days?: int, per_page?: int, page?: int}  $options
     * @return array{paginator: \Illuminate\Contracts\Pagination\LengthAwarePaginator}
     */
    public function getExpiryStockReport(int $tenantId, array $options = []): array
    {
        $warehouseId = isset($options['warehouse_id']) ? (int) $options['warehouse_id'] : null;
        $branchId = isset($options['branch_id']) ? (int) $options['branch_id'] : null;
        $filter = $options['filter'] ?? 'expiring';
        if (! in_array($filter, ['expiring', 'expired', 'all'], true)) {
            $filter = 'expiring';
        }
        $withinDays = max(1, min(730, (int) ($options['within_days'] ?? 90)));
        $perPage = min(200, max(5, (int) ($options['per_page'] ?? 50)));
        $page = max(1, (int) ($options['page'] ?? 1));
        $today = Carbon::today()->toDateString();
        $until = Carbon::today()->addDays($withinDays)->toDateString();

        $sub = DB::table('inventory_movements')
            ->selectRaw('item_id, item_variant_id, warehouse_id, branch_id, batch_number, expiry_date, SUM(quantity) as qty')
            ->where('tenant_id', $tenantId)
            ->whereNotNull('expiry_date')
            ->when($warehouseId, fn ($q) => $q->where('warehouse_id', $warehouseId))
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->groupBy('item_id', 'item_variant_id', 'warehouse_id', 'branch_id', 'batch_number', 'expiry_date')
            ->havingRaw('SUM(quantity) > 0.0001');

        $q = DB::query()
            ->fromSub($sub, 'lots')
            ->where('lots.qty', '>', 0.0001)
            ->join('items', 'items.id', '=', 'lots.item_id')
            ->where('items.tenant_id', $tenantId)
            ->leftJoin('item_variants', 'item_variants.id', '=', 'lots.item_variant_id')
            ->leftJoin('warehouses', 'warehouses.id', '=', 'lots.warehouse_id')
            ->leftJoin('branches', 'branches.id', '=', 'lots.branch_id')
            ->when($filter === 'expired', fn ($qq) => $qq->whereDate('lots.expiry_date', '<', $today))
            ->when($filter === 'expiring', fn ($qq) => $qq->whereDate('lots.expiry_date', '>=', $today)->whereDate('lots.expiry_date', '<=', $until))
            ->orderBy('lots.expiry_date')
            ->orderBy('items.code')
            ->select([
                'lots.item_id',
                'lots.item_variant_id',
                'lots.warehouse_id',
                'lots.branch_id',
                'lots.batch_number',
                'lots.expiry_date',
                'lots.qty',
                'items.code as item_code',
                'items.name as item_name',
                'item_variants.name as variant_name',
                'warehouses.name as warehouse_name',
                'branches.name as branch_name',
            ]);

        $paginator = $q->paginate($perPage, ['*'], 'page', $page);

        $mapped = $paginator->getCollection()->map(function ($r) {
            return [
                'item_id' => (int) $r->item_id,
                'item_variant_id' => $r->item_variant_id ? (int) $r->item_variant_id : null,
                'warehouse_id' => $r->warehouse_id ? (int) $r->warehouse_id : null,
                'branch_id' => $r->branch_id ? (int) $r->branch_id : null,
                'batch_number' => $r->batch_number !== null && $r->batch_number !== '' ? (string) $r->batch_number : null,
                'expiry_date' => $r->expiry_date ? Carbon::parse($r->expiry_date)->toDateString() : null,
                'qty' => round((float) $r->qty, 4),
                'item_code' => (string) $r->item_code,
                'item_name' => (string) $r->item_name,
                'variant_name' => $r->variant_name ? (string) $r->variant_name : null,
                'warehouse_name' => $r->warehouse_name ? (string) $r->warehouse_name : null,
                'branch_name' => $r->branch_name ? (string) $r->branch_name : null,
            ];
        });
        $paginator->setCollection($mapped);

        return ['paginator' => $paginator];
    }

    public function updateItemStock(int $itemId): void
    {
        // Kept as a hook for future caching/denormalization
    }

    /** رصيد مكوّن من حركات حتى تاريخ معيّن (شامل). */
    public function getItemStockAsOf(int $itemId, string $asOfDate, ?int $warehouseId = null): float
    {
        $q = InventoryMovement::where('item_id', $itemId)->whereDate('date', '<=', $asOfDate);
        if ($warehouseId !== null) {
            $q->where('warehouse_id', $warehouseId);
        }

        return (float) $q->sum('quantity');
    }

    /** تقدير تكلفة الوحدة من آخر حركة واردة حتى التاريخ، أو تكلفة الصنف الافتراضية. */
    public function resolveUnitCostAsOf(int $itemId, string $asOfDate, ?int $warehouseId = null): float
    {
        $q = InventoryMovement::where('item_id', $itemId)
            ->whereDate('date', '<=', $asOfDate)
            ->orderByDesc('date')
            ->orderByDesc('id');
        if ($warehouseId !== null) {
            $q->where('warehouse_id', $warehouseId);
        }
        $movements = $q->get();
        foreach ($movements as $m) {
            if ((float) $m->quantity > 0 && (float) $m->unit_cost > 0) {
                return (float) $m->unit_cost;
            }
        }
        $item = Item::find($itemId);

        return $item ? (float) $item->cost_price : 0.0;
    }
}
