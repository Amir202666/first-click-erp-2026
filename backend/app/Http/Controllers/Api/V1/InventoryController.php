<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Item;
use App\Services\InventoryService;
use App\Services\WebhookService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class InventoryController extends Controller
{
    public function __construct(
        private InventoryService $inventoryService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $items = Item::query()
            ->where('tenant_id', $tenantId)
            ->where('track_quantity', true)
            ->when($request->search, function ($q, $s) {
                $q->where(function ($q2) use ($s) {
                    $q2->where('name', 'like', "%{$s}%")
                        ->orWhere('code', 'like', "%{$s}%");
                });
            })
            ->orderBy('name')
            ->paginate(min((int) $request->get('per_page', 30), 100));

        $items->getCollection()->transform(function (Item $item) {
            return [
                'id' => $item->id,
                'code' => $item->code,
                'name' => $item->name,
                'current_stock' => $this->inventoryService->getItemStock($item->id),
            ];
        });

        return response()->json($items);
    }

    public function adjust(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'item_id' => [
                'required',
                'integer',
                Rule::exists('items', 'id')->where(fn ($q) => $q->where('tenant_id', $request->tenant_id)),
            ],
            'new_quantity' => 'required|numeric|min:0',
            'notes' => 'nullable|string|max:500',
        ]);

        try {
            $movement = $this->inventoryService->adjustStock(
                (int) $validated['item_id'],
                (float) $validated['new_quantity'],
                (int) $request->tenant_id,
                $validated['notes'] ?? 'تعديل عبر API',
            );
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        app(WebhookService::class)->dispatch('inventory.adjusted', [
            'item_id' => (int) $validated['item_id'],
            'movement_id' => $movement->id,
        ], (int) $request->tenant_id);

        return response()->json([
            'message' => 'تم تعديل المخزون',
            'movement' => $movement,
        ], 201);
    }
}
