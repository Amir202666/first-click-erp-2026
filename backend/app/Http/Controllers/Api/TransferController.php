<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\TransferHeader;
use App\Services\TransferService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TransferController extends Controller
{
    public function __construct(
        private TransferService $transferService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $query = TransferHeader::where('tenant_id', $request->tenant_id)
            ->with(['fromWarehouse', 'toWarehouse', 'branch', 'costCenter', 'lines.item'])
            ->orderByDesc('date')
            ->orderByDesc('id');

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        if ($request->filled('from_warehouse_id')) {
            $query->where('from_warehouse_id', $request->from_warehouse_id);
        }
        if ($request->filled('to_warehouse_id')) {
            $query->where('to_warehouse_id', $request->to_warehouse_id);
        }
        if ($request->filled('branch_id')) {
            $query->where('branch_id', $request->branch_id);
        }
        if ($request->filled('cost_center_id')) {
            $query->where('cost_center_id', $request->cost_center_id);
        }
        if ($request->filled('created_by')) {
            $query->where('created_by', $request->created_by);
        }
        if ($request->filled('from_date')) {
            $query->whereDate('date', '>=', $request->from_date);
        }
        if ($request->filled('to_date')) {
            $query->whereDate('date', '<=', $request->to_date);
        }

        $perPage = $request->input('per_page', 15);
        $data = $query->paginate((int) $perPage);

        return response()->json($data);
    }

    public function nextNumber(Request $request): JsonResponse
    {
        $number = $this->transferService->nextNumber($request->tenant_id);

        return response()->json(['number' => $number]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'number' => 'nullable|string|max:50',
            'from_warehouse_id' => 'required|exists:warehouses,id',
            'to_warehouse_id' => 'required|exists:warehouses,id',
            'branch_id' => 'nullable|exists:branches,id',
            'cost_center_id' => 'nullable|exists:cost_centers,id',
            'date' => 'required|date',
            'notes' => 'nullable|string',
            'lines' => 'required|array|min:1',
            'lines.*.item_id' => 'required|exists:items,id',
            'lines.*.quantity' => 'required|numeric|min:0.0001',
            'lines.*.unit_cost' => 'nullable|numeric|min:0',
        ]);

        if ($validated['from_warehouse_id'] == $validated['to_warehouse_id']) {
            return response()->json(['message' => 'المخزن المحول منه والمحول إليه يجب أن يكونا مختلفين.'], 422);
        }

        try {
            $header = $this->transferService->create(
                $request->tenant_id,
                $validated,
                $request->user()->id
            );
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json($header, 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $header = TransferHeader::where('tenant_id', $request->tenant_id)
            ->with(['fromWarehouse', 'toWarehouse', 'branch', 'costCenter', 'lines.item', 'createdByUser'])
            ->findOrFail($id);

        return response()->json($header);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $header = TransferHeader::where('tenant_id', $request->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'from_warehouse_id' => 'sometimes|exists:warehouses,id',
            'to_warehouse_id' => 'sometimes|exists:warehouses,id',
            'branch_id' => 'nullable|exists:branches,id',
            'cost_center_id' => 'nullable|exists:cost_centers,id',
            'date' => 'sometimes|date',
            'notes' => 'nullable|string',
            'lines' => 'sometimes|array|min:1',
            'lines.*.item_id' => 'required_with:lines|exists:items,id',
            'lines.*.quantity' => 'required_with:lines|numeric|min:0.0001',
            'lines.*.unit_cost' => 'nullable|numeric|min:0',
        ]);

        if (isset($validated['from_warehouse_id'], $validated['to_warehouse_id'])
            && $validated['from_warehouse_id'] == $validated['to_warehouse_id']) {
            return response()->json(['message' => 'المخزن المحول منه والمحول إليه يجب أن يكونا مختلفين.'], 422);
        }

        try {
            $header = $this->transferService->update($header, $validated);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json($header);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $header = TransferHeader::where('tenant_id', $request->tenant_id)->findOrFail($id);
        $this->transferService->delete($header);

        return response()->json(['message' => 'تم الحذف']);
    }

    public function setInTransit(Request $request, int $id): JsonResponse
    {
        $header = TransferHeader::where('tenant_id', $request->tenant_id)->findOrFail($id);
        $header = $this->transferService->setInTransit($header, $request->tenant_id);

        return response()->json($header);
    }

    public function setReceived(Request $request, int $id): JsonResponse
    {
        $header = TransferHeader::where('tenant_id', $request->tenant_id)->findOrFail($id);
        $header = $this->transferService->setReceived($header, $request->tenant_id);

        return response()->json($header);
    }
}
