<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\InventoryAdjustment;
use App\Services\InventoryAdjustmentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class InventoryAdjustmentController extends Controller
{
    public function __construct(
        private InventoryAdjustmentService $service,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $q = InventoryAdjustment::where('tenant_id', $request->tenant_id)
            ->when($request->warehouse_id, fn ($qq, $id) => $qq->where('warehouse_id', (int) $id))
            ->when($request->branch_id, fn ($qq, $id) => $qq->where('branch_id', (int) $id))
            ->when($request->cost_center_id, fn ($qq, $id) => $qq->where('cost_center_id', (int) $id))
            ->when($request->created_by, fn ($qq, $id) => $qq->where('created_by', (int) $id))
            ->when($request->adjustment_type, fn ($qq, $t) => $qq->where('adjustment_type', $t))
            ->when($request->from_date, fn ($qq, $d) => $qq->whereDate('date', '>=', $d))
            ->when($request->to_date, fn ($qq, $d) => $qq->whereDate('date', '<=', $d))
            ->with(['warehouse', 'branch', 'costCenter', 'createdBy', 'targetAccount'])
            ->orderByDesc('date')
            ->orderByDesc('id');

        return response()->json($q->paginate($request->per_page ?? 30));
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $adj = InventoryAdjustment::where('tenant_id', $request->tenant_id)
            ->with(['lines.item', 'warehouse', 'branch', 'costCenter', 'createdBy', 'targetAccount', 'journalEntry.lines.account'])
            ->findOrFail($id);

        return response()->json($adj);
    }

    public function store(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $validated = $request->validate([
            'warehouse_id' => 'required|exists:warehouses,id',
            'target_account_id' => [
                'required',
                'integer',
                Rule::exists('accounts', 'id')->where(fn ($q) => $q->where('tenant_id', $tenantId)->where('is_postable', true)->where('is_active', true)),
            ],
            'adjustment_type' => 'required|in:in,out',
            'date' => 'required|date',
            'cost_center_id' => 'nullable|exists:cost_centers,id',
            'branch_id' => 'nullable|exists:branches,id',
            'notes' => 'nullable|string',
            'lines' => 'required|array|min:1',
            'lines.*.item_id' => 'required|exists:items,id',
            'lines.*.quantity' => 'required|numeric|gt:0',
            'lines.*.unit_id' => 'nullable|exists:item_units,id',
            'lines.*.conversion_factor' => 'nullable|numeric|gt:0',
            'lines.*.action' => 'nullable|in:add,subtract',
        ]);

        $headerData = [
            'tenant_id' => $tenantId,
            'number' => null,
            'adjustment_type' => $validated['adjustment_type'],
            'warehouse_id' => (int) $validated['warehouse_id'],
            'target_account_id' => (int) $validated['target_account_id'],
            'branch_id' => $validated['branch_id'] ? (int) $validated['branch_id'] : null,
            'cost_center_id' => $validated['cost_center_id'] ? (int) $validated['cost_center_id'] : null,
            'date' => $validated['date'],
            'notes' => $validated['notes'] ?? null,
            'status' => 'posted',
            'created_by' => $request->user()->id,
        ];

        try {
            $adj = $this->service->create($headerData, $validated['lines']);
        } catch (\Throwable $e) {
            report($e);
            $msg = $e->getMessage() ?: 'فشل حفظ تسوية الجرد';

            return response()->json(['message' => $msg], 422);
        }

        return response()->json($adj, 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $adj = InventoryAdjustment::where('tenant_id', $request->tenant_id)->findOrFail($id);
        $tenantId = (int) $request->tenant_id;
        $validated = $request->validate([
            'warehouse_id' => 'required|exists:warehouses,id',
            'target_account_id' => [
                'required',
                'integer',
                Rule::exists('accounts', 'id')->where(fn ($q) => $q->where('tenant_id', $tenantId)->where('is_postable', true)->where('is_active', true)),
            ],
            'adjustment_type' => 'required|in:in,out',
            'date' => 'required|date',
            'cost_center_id' => 'nullable|exists:cost_centers,id',
            'branch_id' => 'nullable|exists:branches,id',
            'notes' => 'nullable|string',
            'lines' => 'required|array|min:1',
            'lines.*.item_id' => 'required|exists:items,id',
            'lines.*.quantity' => 'required|numeric|gt:0',
            'lines.*.unit_id' => 'nullable|exists:item_units,id',
            'lines.*.conversion_factor' => 'nullable|numeric|gt:0',
            'lines.*.action' => 'nullable|in:add,subtract',
        ]);

        $headerData = [
            'adjustment_type' => $validated['adjustment_type'],
            'warehouse_id' => (int) $validated['warehouse_id'],
            'target_account_id' => (int) $validated['target_account_id'],
            'branch_id' => $validated['branch_id'] ? (int) $validated['branch_id'] : null,
            'cost_center_id' => $validated['cost_center_id'] ? (int) $validated['cost_center_id'] : null,
            'date' => $validated['date'],
            'notes' => $validated['notes'] ?? null,
        ];

        try {
            $fresh = $this->service->updateWithImpact($adj, $headerData, $validated['lines']);
        } catch (\Throwable $e) {
            report($e);
            $msg = $e->getMessage() ?: 'فشل تحديث تسوية الجرد';

            return response()->json(['message' => $msg], 422);
        }

        return response()->json($fresh);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $adj = InventoryAdjustment::where('tenant_id', $request->tenant_id)->findOrFail($id);
        $this->service->delete($adj);

        return response()->json(['message' => 'تم حذف تسوية الجرد']);
    }

    public function uploadAttachment(Request $request, int $id): JsonResponse
    {
        $adj = InventoryAdjustment::where('tenant_id', $request->tenant_id)->findOrFail($id);
        $request->validate([
            'attachment' => 'required|file|mimes:jpeg,png,gif,webp,pdf|max:5120',
        ]);
        if ($adj->attachment) {
            Storage::disk('public')->delete($adj->attachment);
        }
        $path = $request->file('attachment')->store('inventory-adjustment-attachments/'.$request->tenant_id, 'public');
        $adj->update(['attachment' => $path]);

        return response()->json($adj->fresh(['lines.item', 'warehouse', 'targetAccount', 'createdBy']));
    }
}
