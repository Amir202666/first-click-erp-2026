<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BillOfMaterial;
use App\Models\BillOfMaterialLine;
use App\Models\Item;
use App\Models\ProductionOrder;
use App\Services\ManufacturingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ProductionOrderController extends Controller
{
    public function __construct(private ManufacturingService $manufacturingService) {}

    /**
     * @param  array<int, array<string, mixed>>|null  $rows
     */
    private function assertLineOverridesForBom(int $bomId, ?array $rows): void
    {
        if ($rows === null || $rows === []) {
            return;
        }

        $allowed = BillOfMaterialLine::query()
            ->where('bill_of_material_id', $bomId)
            ->pluck('id')
            ->map(fn ($v) => (int) $v)
            ->all();
        $allowedSet = array_flip($allowed);

        foreach ($rows as $r) {
            $lid = (int) ($r['bom_line_id'] ?? 0);
            if (! isset($allowedSet[$lid])) {
                abort(422, 'بند قائمة مواد غير تابع للباقة المختارة.');
            }
            $q = (float) ($r['qty_display'] ?? 0);
            if ($q <= 0) {
                abort(422, 'يجب أن تكون كميات المكونات أكبر من صفر.');
            }
        }
    }

    public function index(Request $request): JsonResponse
    {
        $query = ProductionOrder::where('tenant_id', $request->tenant_id)
            ->with('finishedItem', 'billOfMaterial', 'rawWarehouse', 'finishedWarehouse', 'branch')
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('from_date'), fn ($q) => $q->whereDate('order_date', '>=', $request->string('from_date')))
            ->when($request->filled('to_date'), fn ($q) => $q->whereDate('order_date', '<=', $request->string('to_date')))
            ->when($request->filled('branch_id'), fn ($q) => $q->where('branch_id', (int) $request->branch_id))
            ->when($request->filled('cost_center_id'), fn ($q) => $q->where('cost_center_id', (int) $request->cost_center_id))
            ->when($request->filled('created_by'), fn ($q) => $q->where('created_by', (int) $request->created_by))
            ->orderByDesc('order_date')
            ->orderByDesc('id');

        $list = $query->paginate($request->per_page ?? 20);

        return response()->json($list);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'order_date' => 'required|date',
            'finished_item_id' => 'required|exists:items,id',
            'quantity' => 'required|numeric|min:0.0001',
            'bill_of_material_id' => 'required|exists:bill_of_materials,id',
            'raw_warehouse_id' => 'nullable|exists:warehouses,id',
            'finished_warehouse_id' => 'nullable|exists:warehouses,id',
            'branch_id' => 'nullable|exists:branches,id',
            'cost_center_id' => 'nullable|exists:cost_centers,id',
            'expenses' => 'nullable|array',
            'expenses.*.expense_account_id' => 'nullable|integer|exists:accounts,id',
            'expenses.*.description' => 'nullable|string|max:500',
            'expenses.*.amount' => 'nullable|numeric|min:0',
            'line_overrides' => 'nullable|array',
            'line_overrides.*.bom_line_id' => 'required|integer',
            'line_overrides.*.qty_display' => 'required|numeric|min:0.0000001',
            'notes' => 'nullable|string',
        ]);

        $tenantId = (int) $request->tenant_id;
        Item::where('tenant_id', $tenantId)->findOrFail($validated['finished_item_id']);
        $bom = BillOfMaterial::where('tenant_id', $tenantId)->findOrFail($validated['bill_of_material_id']);
        if ((int) $bom->finished_item_id !== (int) $validated['finished_item_id']) {
            return response()->json(['message' => 'قائمة المواد (BOM) لا تطابق المنتج النهائي.'], 422);
        }

        $this->assertLineOverridesForBom((int) $validated['bill_of_material_id'], $validated['line_overrides'] ?? null);

        $number = $this->manufacturingService->nextProductionOrderNumber($tenantId);

        $order = DB::transaction(function () use ($request, $tenantId, $validated, $number) {
            $order = ProductionOrder::create([
                'tenant_id' => $tenantId,
                'number' => $number,
                'order_date' => $validated['order_date'],
                'finished_item_id' => $validated['finished_item_id'],
                'quantity' => $validated['quantity'],
                'bill_of_material_id' => $validated['bill_of_material_id'],
                'status' => ProductionOrder::STATUS_DRAFT,
                'raw_warehouse_id' => $validated['raw_warehouse_id'] ?? null,
                'finished_warehouse_id' => $validated['finished_warehouse_id'] ?? null,
                'branch_id' => $validated['branch_id'] ?? null,
                'cost_center_id' => $validated['cost_center_id'] ?? null,
                'created_by' => $request->user()?->id,
                'overhead_cost' => 0,
                'line_overrides' => array_key_exists('line_overrides', $validated) ? $validated['line_overrides'] : null,
                'notes' => $validated['notes'] ?? null,
            ]);
            $this->manufacturingService->syncProductionOrderExpenses($order, $request->input('expenses', []), $tenantId);

            return $order->fresh(['finishedItem', 'billOfMaterial.lines.componentItem', 'rawWarehouse', 'finishedWarehouse', 'expenses.expenseAccount']);
        });

        return response()->json($order, 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $order = ProductionOrder::where('tenant_id', $request->tenant_id)
            ->with('finishedItem', 'billOfMaterial.lines.componentItem', 'materials.item', 'rawWarehouse', 'finishedWarehouse', 'branch', 'approvedByUser', 'expenses.expenseAccount', 'expenses.journalEntry')
            ->findOrFail($id);

        return response()->json($order);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $order = ProductionOrder::where('tenant_id', $request->tenant_id)->findOrFail($id);
        if ($order->status !== ProductionOrder::STATUS_DRAFT) {
            return response()->json(['message' => 'لا يمكن تعديل أمر إنتاج معتمد.'], 422);
        }

        $validated = $request->validate([
            'order_date' => 'sometimes|date',
            'finished_item_id' => 'sometimes|exists:items,id',
            'quantity' => 'sometimes|numeric|min:0.0001',
            'bill_of_material_id' => 'sometimes|exists:bill_of_materials,id',
            'raw_warehouse_id' => 'nullable|exists:warehouses,id',
            'finished_warehouse_id' => 'nullable|exists:warehouses,id',
            'branch_id' => 'nullable|exists:branches,id',
            'cost_center_id' => 'nullable|exists:cost_centers,id',
            'expenses' => 'nullable|array',
            'expenses.*.expense_account_id' => 'nullable|integer|exists:accounts,id',
            'expenses.*.description' => 'nullable|string|max:500',
            'expenses.*.amount' => 'nullable|numeric|min:0',
            'line_overrides' => 'nullable|array',
            'line_overrides.*.bom_line_id' => 'required|integer',
            'line_overrides.*.qty_display' => 'required|numeric|min:0.0000001',
            'notes' => 'nullable|string',
        ]);

        $bomIdForLines = (int) ($validated['bill_of_material_id'] ?? $order->bill_of_material_id);
        if (array_key_exists('line_overrides', $validated)) {
            $this->assertLineOverridesForBom($bomIdForLines, $validated['line_overrides']);
        }

        if (isset($validated['finished_item_id'], $validated['bill_of_material_id'])) {
            $bom = BillOfMaterial::where('tenant_id', $request->tenant_id)->findOrFail($validated['bill_of_material_id']);
            if ((int) $bom->finished_item_id !== (int) $validated['finished_item_id']) {
                return response()->json(['message' => 'قائمة المواد (BOM) لا تطابق المنتج النهائي.'], 422);
            }
        } elseif (isset($validated['bill_of_material_id'])) {
            $bom = BillOfMaterial::where('tenant_id', $request->tenant_id)->findOrFail($validated['bill_of_material_id']);
            if ((int) $bom->finished_item_id !== (int) $order->finished_item_id) {
                return response()->json(['message' => 'قائمة المواد (BOM) لا تطابق المنتج النهائي.'], 422);
            }
        } elseif (isset($validated['finished_item_id'])) {
            $bom = BillOfMaterial::where('tenant_id', $request->tenant_id)->findOrFail($order->bill_of_material_id);
            if ((int) $bom->finished_item_id !== (int) $validated['finished_item_id']) {
                return response()->json(['message' => 'قائمة المواد (BOM) لا تطابق المنتج النهائي.'], 422);
            }
        }

        $tenantId = (int) $request->tenant_id;
        $expensesPayload = $request->has('expenses') ? $request->input('expenses', []) : null;
        unset($validated['expenses']);

        $order = DB::transaction(function () use ($order, $validated, $expensesPayload, $tenantId) {
            if ($validated !== []) {
                $order->update($validated);
            }
            if ($expensesPayload !== null) {
                $this->manufacturingService->syncProductionOrderExpenses($order->fresh(), $expensesPayload, $tenantId);
            }

            return $order->fresh(['finishedItem', 'billOfMaterial.lines.componentItem', 'rawWarehouse', 'finishedWarehouse', 'expenses.expenseAccount']);
        });

        return response()->json($order);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $order = ProductionOrder::where('tenant_id', $request->tenant_id)->findOrFail($id);

        DB::transaction(function () use ($order) {
            $this->manufacturingService->deleteExpenseJournalEntriesForOrder($order);
            $this->manufacturingService->deleteInventoryMovementsForOrder($order);
            $order->delete();
        });

        return response()->json(null, 204);
    }

    public function approve(Request $request, int $id): JsonResponse
    {
        $order = ProductionOrder::where('tenant_id', $request->tenant_id)->findOrFail($id);
        try {
            $order = $this->manufacturingService->approve($order);
        } catch (\InvalidArgumentException|\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json($order);
    }

    public function nextNumber(Request $request): JsonResponse
    {
        $number = $this->manufacturingService->nextProductionOrderNumber((int) $request->tenant_id);

        return response()->json(['number' => $number]);
    }
}
