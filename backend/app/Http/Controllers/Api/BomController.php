<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BillOfMaterial;
use App\Models\BillOfMaterialLine;
use App\Models\Item;
use App\Services\InventoryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BomController extends Controller
{
    public function __construct(private InventoryService $inventoryService) {}

    /** تعبئة تكلفة الوحدة لكل سطر من متوسط التكلفة المخزني (average_cost) — لا يُخزّن في BOM. */
    private function hydrateLinesWithAverageCost(BillOfMaterial $bom, ?int $warehouseId = null): void
    {
        $bom->load('lines.componentItem.category', 'lines.componentItem.itemUnit', 'lines.unit');
        foreach ($bom->lines as $line) {
            $avg = $this->inventoryService->getItemAverageCost($line->component_item_id, $warehouseId);
            $line->setAttribute('unit_cost', round($avg, 4));
            if ($warehouseId !== null && $warehouseId > 0) {
                $stock = $this->inventoryService->getItemStock((int) $line->component_item_id, $warehouseId);
                $line->setAttribute('current_stock', round($stock, 4));
            } else {
                $line->setAttribute('current_stock', null);
            }
        }
    }

    public function index(Request $request): JsonResponse
    {
        $query = BillOfMaterial::where('tenant_id', $request->tenant_id)
            ->with('finishedItem')
            ->when($request->filled('finished_item_id'), fn ($q, $v) => $q->where('finished_item_id', $v))
            ->when($request->filled('is_active'), fn ($q, $v) => $q->where('is_active', $v))
            ->orderByDesc('id');

        $list = $query->paginate($request->per_page ?? 20);
        $warehouseId = $request->filled('warehouse_id') ? (int) $request->warehouse_id : null;
        foreach ($list as $bom) {
            $this->hydrateLinesWithAverageCost($bom, $warehouseId);
            $bom->total_cost = $bom->getTotalCostAttribute();
        }

        return response()->json($list);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'finished_item_id' => 'required|exists:items,id',
            'name' => 'nullable|string|max:255',
            'is_active' => 'boolean',
            'lines' => 'required|array|min:1',
            'lines.*.component_item_id' => 'required|exists:items,id',
            'lines.*.quantity' => 'required|numeric|min:0.0001',
            'lines.*.unit_id' => 'nullable|exists:item_units,id',
            'lines.*.sort_order' => 'nullable|integer',
        ]);

        $tenantId = (int) $request->tenant_id;
        Item::where('tenant_id', $tenantId)->findOrFail($validated['finished_item_id']);

        $bom = BillOfMaterial::create([
            'tenant_id' => $tenantId,
            'finished_item_id' => $validated['finished_item_id'],
            'name' => $validated['name'] ?? null,
            'is_active' => $validated['is_active'] ?? true,
        ]);

        foreach ($validated['lines'] as $idx => $row) {
            BillOfMaterialLine::create([
                'bill_of_material_id' => $bom->id,
                'component_item_id' => $row['component_item_id'],
                'quantity' => $row['quantity'],
                'unit_id' => $row['unit_id'] ?? null,
                'unit_cost' => null,
                'sort_order' => $row['sort_order'] ?? $idx,
            ]);
        }

        $this->hydrateLinesWithAverageCost($bom);
        $bom->total_cost = $bom->getTotalCostAttribute();

        return response()->json($bom, 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $bom = BillOfMaterial::where('tenant_id', $request->tenant_id)
            ->with(['finishedItem.category', 'lines.componentItem.category', 'lines.componentItem.itemUnit', 'lines.unit'])
            ->findOrFail($id);
        $warehouseId = $request->filled('warehouse_id') ? (int) $request->warehouse_id : null;
        $this->hydrateLinesWithAverageCost($bom, $warehouseId);
        $bom->total_cost = $bom->getTotalCostAttribute();

        return response()->json($bom);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $bom = BillOfMaterial::where('tenant_id', $request->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'finished_item_id' => 'sometimes|exists:items,id',
            'name' => 'nullable|string|max:255',
            'is_active' => 'boolean',
            'lines' => 'sometimes|array|min:1',
            'lines.*.component_item_id' => 'required|exists:items,id',
            'lines.*.quantity' => 'required|numeric|min:0.0001',
            'lines.*.unit_id' => 'nullable|exists:item_units,id',
            'lines.*.sort_order' => 'nullable|integer',
        ]);

        $bom->update([
            'finished_item_id' => $validated['finished_item_id'] ?? $bom->finished_item_id,
            'name' => $validated['name'] ?? $bom->name,
            'is_active' => $validated['is_active'] ?? $bom->is_active,
        ]);

        if (isset($validated['lines'])) {
            $bom->lines()->delete();
            foreach ($validated['lines'] as $idx => $row) {
                BillOfMaterialLine::create([
                    'bill_of_material_id' => $bom->id,
                    'component_item_id' => $row['component_item_id'],
                    'quantity' => $row['quantity'],
                    'unit_id' => $row['unit_id'] ?? null,
                    'unit_cost' => null,
                    'sort_order' => $row['sort_order'] ?? $idx,
                ]);
            }
        }

        $this->hydrateLinesWithAverageCost($bom);
        $bom->total_cost = $bom->getTotalCostAttribute();

        return response()->json($bom);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $bom = BillOfMaterial::where('tenant_id', $request->tenant_id)->findOrFail($id);
        $bom->delete();

        return response()->json(null, 204);
    }

    public function estimatedCost(Request $request, int $id): JsonResponse
    {
        $bom = BillOfMaterial::where('tenant_id', $request->tenant_id)->findOrFail($id);
        $warehouseId = $request->filled('warehouse_id') ? (int) $request->warehouse_id : null;
        $this->hydrateLinesWithAverageCost($bom, $warehouseId);
        $total = $bom->getTotalCostAttribute();

        return response()->json(['total_cost' => $total, 'bom' => $bom]);
    }
}
