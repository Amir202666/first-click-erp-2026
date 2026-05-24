<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\InventoryMovement;
use App\Models\Item;
use App\Services\InventoryService;
use App\Services\ManufacturingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class InventoryController extends Controller
{
    public function __construct(
        private InventoryService $inventoryService,
        private ManufacturingService $manufacturingService,
    ) {}

    public function movements(Request $request): JsonResponse
    {
        $query = InventoryMovement::where('tenant_id', $request->tenant_id)
            ->when($request->item_id, fn ($q, $id) => $q->where('item_id', $id))
            ->when($request->type, fn ($q, $t) => $q->where('type', $t))
            ->when($request->warehouse_id, fn ($q, $id) => $q->where('warehouse_id', $id))
            // نستخدم whereDate لضمان شمول كامل اليوم بدون تأثير حقل الوقت
            ->when($request->from_date, fn ($q, $d) => $q->whereDate('date', '>=', $d))
            ->when($request->to_date, fn ($q, $d) => $q->whereDate('date', '<=', $d))
            ->with('item', 'createdBy', 'warehouse')
            ->orderBy('date')
            ->orderBy('id');

        $movements = $query->paginate($request->per_page ?? 30);

        return response()->json($movements);
    }

    public function itemMovements(Request $request, int $itemId): JsonResponse
    {
        $item = Item::where('tenant_id', $request->tenant_id)->findOrFail($itemId);

        $movements = $this->inventoryService->getItemMovements(
            $itemId,
            $request->tenant_id,
            $request->from_date,
            $request->to_date,
            $request->warehouse_id ? (int) $request->warehouse_id : null,
            $request->branch_id ? (int) $request->branch_id : null,
            $request->cost_center_id ? (int) $request->cost_center_id : null,
            $request->created_by ? (int) $request->created_by : null,
            $request->filled('voucher_kind') ? (string) $request->input('voucher_kind') : null,
        );

        return response()->json([
            'item' => [
                'id' => $item->id,
                'code' => $item->code,
                'name' => $item->name,
                'unit' => $item->unit,
                'current_stock' => $this->inventoryService->getItemStock($item->id),
                'average_cost' => $this->inventoryService->getItemAverageCost($item->id),
                'average_selling' => $this->inventoryService->getItemAverageSellingPrice($item->id),
            ],
            'movements' => $movements,
        ]);
    }

    public function addMovement(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'item_id' => 'required|exists:items,id',
            'item_variant_id' => 'nullable|integer|exists:item_variants,id',
            'type' => 'required|in:in,out,adjustment,transfer',
            'quantity' => 'required|numeric',
            'unit_cost' => 'nullable|numeric|min:0',
            'date' => 'required|date',
            'notes' => 'nullable|string',
        ]);

        $item = Item::where('tenant_id', $request->tenant_id)->findOrFail($validated['item_id']);
        if (! empty($validated['item_variant_id'])) {
            $variant = \App\Models\ItemVariant::where('tenant_id', $request->tenant_id)
                ->where('item_id', $item->id)
                ->where('id', (int) $validated['item_variant_id'])
                ->first();
            if (! $variant) {
                return response()->json(['message' => 'المتغير لا يتبع هذا الصنف'], 422);
            }
        }

        $qty = (float) $validated['quantity'];
        if ($validated['type'] === 'out' && $qty > 0) {
            $qty = -$qty;
        }

        $unitCost = (float) ($validated['unit_cost'] ?? $item->cost_price);

        $movement = $this->inventoryService->addMovement([
            'tenant_id' => $request->tenant_id,
            'item_id' => $validated['item_id'],
            'item_variant_id' => $validated['item_variant_id'] ?? null,
            'type' => $validated['type'],
            'quantity' => $qty,
            'unit_cost' => $unitCost,
            'total_cost' => round(abs($qty) * $unitCost, 3),
            'date' => $validated['date'],
            'notes' => $validated['notes'] ?? null,
            'created_by' => $request->user()->id,
        ]);

        return response()->json($movement, 201);
    }

    public function adjustStock(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'item_id' => 'required|exists:items,id',
            'new_quantity' => 'required|numeric|min:0',
            'notes' => 'nullable|string',
        ]);

        Item::where('tenant_id', $request->tenant_id)->findOrFail($validated['item_id']);

        $movement = $this->inventoryService->adjustStock(
            $validated['item_id'],
            (float) $validated['new_quantity'],
            $request->tenant_id,
            $validated['notes'] ?? null,
        );

        return response()->json([
            'message' => 'تم تعديل الجرد بنجاح',
            'movement' => $movement,
        ]);
    }

    public function report(Request $request): JsonResponse
    {
        $warehouseId = $request->filled('warehouse_id') ? (int) $request->warehouse_id : null;
        $itemId = $request->filled('item_id') ? (int) $request->item_id : null;
        $categoryId = $request->filled('category_id') ? (int) $request->category_id : null;
        $brandId = $request->filled('brand_id') ? (int) $request->brand_id : null;
        $displayUnitId = $request->filled('unit_id') ? (int) $request->unit_id : null;
        $unitMatch = $request->get('unit_match', 'hide');
        if (! in_array($unitMatch, ['hide', 'show_zero'], true)) {
            $unitMatch = 'hide';
        }
        $fromDate = $request->filled('from_date') ? $request->from_date : null;
        $toDate = $request->filled('to_date') ? $request->to_date : null;
        $report = $this->inventoryService->getInventoryReport($request->tenant_id, $warehouseId, $itemId, $categoryId, $brandId, $fromDate, $toDate, $displayUnitId, $unitMatch);

        return response()->json($report);
    }

    /**
     * جرد المتغيرات: رصيد لكل متغير (مقاس/لون…) من حركات المخزون المرتبطة بـ item_variant_id.
     */
    public function variantReport(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $perPage = min(200, max(5, (int) $request->get('per_page', 50)));
        $page = max(1, (int) $request->get('page', 1));
        $warehouseId = $request->filled('warehouse_id') ? (int) $request->warehouse_id : null;
        $branchId = $request->filled('branch_id') ? (int) $request->branch_id : null;
        $itemId = $request->filled('item_id') ? (int) $request->item_id : null;
        $categoryId = $request->filled('category_id') ? (int) $request->category_id : null;
        $brandId = $request->filled('brand_id') ? (int) $request->brand_id : null;
        $attributeTemplateId = $request->filled('attribute_template_id') ? (int) $request->attribute_template_id : null;
        $attributeValue = $request->filled('attribute_value') ? (string) $request->attribute_value : null;

        $result = $this->inventoryService->getVariantInventoryReport(
            $tenantId,
            $warehouseId,
            $branchId,
            $itemId,
            $categoryId,
            $brandId,
            $attributeTemplateId,
            $attributeValue,
            $perPage,
            $page,
        );

        $p = $result['paginator'];

        return response()->json([
            'data' => $p->items(),
            'meta' => [
                'current_page' => $p->currentPage(),
                'last_page' => $p->lastPage(),
                'per_page' => $p->perPage(),
                'total' => $p->total(),
            ],
            'summary' => $result['summary'],
        ]);
    }

    /**
     * تنبيهات النواقص: أصناف وصلت لحد الطلب (min_quantity) في مخزن معين أو كل المخازن.
     * يدعم الفلترة: warehouse_id, item_id, category_id, brand_id.
     * عند عدم وجود فلاتر يُستخدم الكاش المُحدَّث من المهمة الخلفية إن وُجد.
     */
    public function lowStockAlerts(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $warehouseId = $request->filled('warehouse_id') ? (int) $request->warehouse_id : null;
        $pivot = $request->user()?->tenants()->where('tenants.id', $tenantId)->first()?->pivot;
        if ($pivot && $pivot->restrict_to_branch_warehouse && $pivot->default_warehouse_id) {
            $warehouseId = (int) $pivot->default_warehouse_id;
        }
        $itemId = $request->filled('item_id') ? (int) $request->item_id : null;
        $categoryId = $request->filled('category_id') ? (int) $request->category_id : null;
        $brandId = $request->filled('brand_id') ? (int) $request->brand_id : null;

        $useCache = $warehouseId === null && $itemId === null && $categoryId === null && $brandId === null;
        $cacheKey = "low_stock_tenant_{$tenantId}";
        if ($useCache && cache()->has($cacheKey)) {
            return response()->json(['data' => cache()->get($cacheKey)]);
        }

        $alerts = $this->inventoryService->getLowStockAlerts($tenantId, $warehouseId, $itemId, $categoryId, $brandId);

        return response()->json(['data' => $alerts]);
    }

    /**
     * تنبيهات اقتراب انتهاء الصلاحية (للداشبورد): أرصدة موجبة (حسب تاريخ صلاحية ورقم باتش) تنتهي خلال N يوماً.
     */
    public function expiryAlerts(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $withinDays = min(365, max(1, (int) $request->get('within_days', 30)));
        $warehouseId = $request->filled('warehouse_id') ? (int) $request->warehouse_id : null;
        $data = $this->inventoryService->getExpiringStockAlerts($tenantId, $withinDays, $warehouseId);

        return response()->json([
            'data' => $data,
            'within_days' => $withinDays,
        ]);
    }

    /**
     * تقرير مخزون حسب تاريخ الصلاحية (منتهية / قاربة / الكل مع صلاحية).
     */
    public function expiryStockReport(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $perPage = min(200, max(5, (int) $request->get('per_page', 50)));
        $page = max(1, (int) $request->get('page', 1));
        $warehouseId = $request->filled('warehouse_id') ? (int) $request->warehouse_id : null;
        $branchId = $request->filled('branch_id') ? (int) $request->branch_id : null;
        $filter = $request->get('filter', 'expiring');
        if (! in_array($filter, ['expiring', 'expired', 'all'], true)) {
            $filter = 'expiring';
        }
        $withinDays = min(730, max(1, (int) $request->get('within_days', 90)));

        $result = $this->inventoryService->getExpiryStockReport($tenantId, [
            'warehouse_id' => $warehouseId,
            'branch_id' => $branchId,
            'filter' => $filter,
            'within_days' => $withinDays,
            'per_page' => $perPage,
            'page' => $page,
        ]);
        $p = $result['paginator'];

        return response()->json([
            'data' => $p->items(),
            'meta' => [
                'current_page' => $p->currentPage(),
                'last_page' => $p->lastPage(),
                'per_page' => $p->perPage(),
                'total' => $p->total(),
            ],
            'filter' => $filter,
            'within_days' => $withinDays,
        ]);
    }

    /**
     * حذف حركات المخزون اليتيمة (المرتبطة بأوامر إنتاج محذوفة).
     * لتنظيف الحركات الحالية بعد حذف أوامر إنتاج دون حذف حركاتها سابقاً.
     */
    public function cleanOrphanedProductionOrderMovements(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $deleted = $this->manufacturingService->deleteOrphanedProductionOrderMovements($tenantId);

        return response()->json([
            'message' => $deleted > 0
                ? "تم حذف {$deleted} حركة مخزون مرتبطة بأوامر إنتاج محذوفة."
                : 'لا توجد حركات يتيمة لحذفها.',
            'deleted_count' => $deleted,
        ]);
    }
}
