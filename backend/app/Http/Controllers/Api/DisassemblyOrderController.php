<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DisassemblyOrder;
use App\Models\Item;
use App\Models\Warehouse;
use App\Services\DisassemblyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DisassemblyOrderController extends Controller
{
    public function __construct(private DisassemblyService $disassemblyService) {}

    public function index(Request $request): JsonResponse
    {
        $baseQuery = DisassemblyOrder::where('tenant_id', $request->tenant_id)
            ->when($request->filled('from_date'), fn ($q) => $q->whereDate('date', '>=', $request->string('from_date')))
            ->when($request->filled('to_date'), fn ($q) => $q->whereDate('date', '<=', $request->string('to_date')))
            ->when($request->filled('search'), fn ($q) => $q->where('number', 'like', '%'.$request->string('search').'%'))
            ->when($request->filled('warehouse_id'), fn ($q) => $q->where('warehouse_id', (int) $request->warehouse_id))
            ->when($request->filled('item_id'), fn ($q) => $q->where('item_id', (int) $request->item_id));

        $statsQuery = clone $baseQuery;
        $stats = [
            'total' => (clone $statsQuery)->count(),
            'draft' => (clone $statsQuery)->where('status', DisassemblyOrder::STATUS_DRAFT)->count(),
            'completed' => (clone $statsQuery)->where('status', DisassemblyOrder::STATUS_COMPLETED)->count(),
            'cancelled' => (clone $statsQuery)->where('status', DisassemblyOrder::STATUS_CANCELLED)->count(),
        ];

        $query = (clone $baseQuery)
            ->with(['item', 'warehouse', 'createdByUser', 'lines'])
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->orderByDesc('date')
            ->orderByDesc('id');

        $list = $query->paginate($request->per_page ?? 20);

        return response()->json(array_merge($list->toArray(), ['stats' => $stats]));
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'item_id' => 'required|exists:items,id',
            'warehouse_id' => 'required|exists:warehouses,id',
            'quantity' => 'required|numeric|min:0.0001',
            'date' => 'required|date',
            'notes' => 'nullable|string',
            'lines' => 'required|array|min:1',
            'lines.*.item_id' => 'required|exists:items,id',
            'lines.*.warehouse_id' => 'required|exists:warehouses,id',
            'lines.*.quantity' => 'required|numeric|min:0.0001',
            'lines.*.unit_id' => 'nullable|exists:item_units,id',
            'lines.*.notes' => 'nullable|string',
        ]);

        $tenantId = (int) $request->tenant_id;
        Item::where('tenant_id', $tenantId)->findOrFail($validated['item_id']);
        Warehouse::where('tenant_id', $tenantId)->findOrFail($validated['warehouse_id']);

        foreach ($validated['lines'] as $line) {
            Item::where('tenant_id', $tenantId)->findOrFail($line['item_id']);
            Warehouse::where('tenant_id', $tenantId)->findOrFail($line['warehouse_id']);
        }

        $number = $this->disassemblyService->nextDisassemblyOrderNumber($tenantId);

        $order = DB::transaction(function () use ($request, $tenantId, $validated, $number) {
            $order = DisassemblyOrder::create([
                'tenant_id' => $tenantId,
                'number' => $number,
                'item_id' => $validated['item_id'],
                'warehouse_id' => $validated['warehouse_id'],
                'quantity' => $validated['quantity'],
                'date' => $validated['date'],
                'status' => DisassemblyOrder::STATUS_DRAFT,
                'notes' => $validated['notes'] ?? null,
                'created_by' => $request->user()?->id,
            ]);
            $this->disassemblyService->syncLines($order, $validated['lines']);

            return $order->fresh(['item', 'warehouse', 'lines.item', 'lines.warehouse', 'lines.unit', 'createdByUser']);
        });

        return response()->json($order, 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $order = DisassemblyOrder::where('tenant_id', $request->tenant_id)
            ->with(['item', 'warehouse', 'lines.item', 'lines.warehouse', 'lines.unit', 'createdByUser', 'confirmedByUser'])
            ->findOrFail($id);

        return response()->json($order);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $order = DisassemblyOrder::where('tenant_id', $request->tenant_id)->findOrFail($id);
        if ($order->status !== DisassemblyOrder::STATUS_DRAFT) {
            return response()->json(['message' => 'لا يمكن تعديل أمر تفكيك مكتمل أو ملغى.'], 422);
        }

        $validated = $request->validate([
            'item_id' => 'sometimes|exists:items,id',
            'warehouse_id' => 'sometimes|exists:warehouses,id',
            'quantity' => 'sometimes|numeric|min:0.0001',
            'date' => 'sometimes|date',
            'notes' => 'nullable|string',
            'lines' => 'sometimes|array|min:1',
            'lines.*.item_id' => 'required_with:lines|exists:items,id',
            'lines.*.warehouse_id' => 'required_with:lines|exists:warehouses,id',
            'lines.*.quantity' => 'required_with:lines|numeric|min:0.0001',
            'lines.*.unit_id' => 'nullable|exists:item_units,id',
            'lines.*.notes' => 'nullable|string',
        ]);

        $tenantId = (int) $request->tenant_id;
        $linesPayload = $validated['lines'] ?? null;
        unset($validated['lines']);

        if (isset($validated['item_id'])) {
            Item::where('tenant_id', $tenantId)->findOrFail($validated['item_id']);
        }
        if (isset($validated['warehouse_id'])) {
            Warehouse::where('tenant_id', $tenantId)->findOrFail($validated['warehouse_id']);
        }
        if (is_array($linesPayload)) {
            foreach ($linesPayload as $line) {
                Item::where('tenant_id', $tenantId)->findOrFail($line['item_id']);
                Warehouse::where('tenant_id', $tenantId)->findOrFail($line['warehouse_id']);
            }
        }

        $order = DB::transaction(function () use ($order, $validated, $linesPayload) {
            if ($validated !== []) {
                $order->update($validated);
            }
            if (is_array($linesPayload)) {
                $this->disassemblyService->syncLines($order->fresh(), $linesPayload);
            }

            return $order->fresh(['item', 'warehouse', 'lines.item', 'lines.warehouse', 'lines.unit', 'createdByUser']);
        });

        return response()->json($order);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $order = DisassemblyOrder::where('tenant_id', $request->tenant_id)->findOrFail($id);
        if ($order->status !== DisassemblyOrder::STATUS_DRAFT) {
            return response()->json(['message' => 'لا يمكن حذف أمر تفكيك مكتمل أو ملغى.'], 422);
        }

        $order->delete();

        return response()->json(null, 204);
    }

    public function confirm(Request $request, int $id): JsonResponse
    {
        $order = DisassemblyOrder::where('tenant_id', $request->tenant_id)->findOrFail($id);
        try {
            $order = $this->disassemblyService->confirm($order);
        } catch (\InvalidArgumentException|\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json($order);
    }

    public function cancel(Request $request, int $id): JsonResponse
    {
        $order = DisassemblyOrder::where('tenant_id', $request->tenant_id)->findOrFail($id);
        try {
            $order = $this->disassemblyService->cancel($order);
        } catch (\InvalidArgumentException|\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json($order);
    }

    public function nextNumber(Request $request): JsonResponse
    {
        $number = $this->disassemblyService->nextDisassemblyOrderNumber((int) $request->tenant_id);

        return response()->json(['number' => $number]);
    }
}
