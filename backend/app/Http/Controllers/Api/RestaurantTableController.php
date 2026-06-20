<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\RestaurantTable;
use App\Services\RestaurantBranchScope;
use App\Services\RestaurantFloorMapService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RestaurantTableController extends Controller
{
    public function __construct(private RestaurantFloorMapService $floorMapService) {}

    public function index(Request $request): JsonResponse
    {
        $tenantId = (int) $request->attributes->get('tenant_id');
        $branchId = $request->query('branch_id');
        $section = $request->query('section');

        $query = RestaurantTable::query()
            ->where('tenant_id', $tenantId)
            ->orderBy('sort_order')
            ->orderBy('id');

        if ($branchId !== null && $branchId !== '') {
            RestaurantBranchScope::applyTableBranchFilter($query, $tenantId, (int) $branchId);
        }
        if ($section) {
            $query->where('section', $section);
        }

        $tables = $query->get();

        if ($request->boolean('floor_map')) {
            $date = $request->query('date', now()->toDateString());

            return response()->json($this->floorMapService->enrichTables($tables, $tenantId, $date));
        }

        return response()->json($tables);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $tenantId = (int) $request->attributes->get('tenant_id');
        $date = $request->query('date', now()->toDateString());
        $table = RestaurantTable::where('tenant_id', $tenantId)->findOrFail($id);
        $enriched = $this->floorMapService->enrichTables(collect([$table]), $tenantId, $date);

        return response()->json($enriched[0] ?? $table);
    }

    public function updateStatus(Request $request, int $id): JsonResponse
    {
        $tenantId = (int) $request->attributes->get('tenant_id');
        $table = RestaurantTable::where('tenant_id', $tenantId)->findOrFail($id);

        $data = $request->validate([
            'status' => ['required', 'in:available,occupied,cleaning,reserved,preparing,closed'],
        ]);

        $updates = ['status' => $data['status']];

        if ($data['status'] === 'occupied') {
            $updates['occupied_at'] = now();
            $updates['closed_at'] = null;
        } elseif ($data['status'] === 'closed') {
            $updates['closed_at'] = now();
        } elseif ($data['status'] === 'available') {
            $updates['occupied_at'] = null;
            $updates['closed_at'] = null;
        } elseif ($data['status'] === 'preparing') {
            $updates['status'] = 'cleaning';
        }

        $table->update($updates);

        $date = $request->query('date', now()->toDateString());
        $enriched = $this->floorMapService->enrichTables(collect([$table->fresh()]), $tenantId, $date);

        return response()->json($enriched[0] ?? $table->fresh());
    }

    public function store(Request $request): JsonResponse
    {
        $tenantId = $request->attributes->get('tenant_id');

        $data = $request->validate([
            'branch_id' => ['nullable', 'exists:branches,id'],
            'name' => ['required', 'string', 'max:255'],
            'code' => ['nullable', 'string', 'max:50'],
            'section' => ['nullable', 'string', 'max:255'],
            'capacity' => ['nullable', 'integer', 'min:1'],
            'status' => ['nullable', 'in:available,occupied,cleaning,closed'],
            'shape' => ['nullable', 'in:square,round'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
        ]);

        $data['tenant_id'] = $tenantId;

        if (empty($data['branch_id']) && ! empty($data['section'])) {
            $resolved = RestaurantBranchScope::resolveBranchIdFromSectionName($tenantId, (string) $data['section']);
            if ($resolved) {
                $data['branch_id'] = $resolved;
            }
        }

        $table = RestaurantTable::create($data);

        return response()->json($table, 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $tenantId = $request->attributes->get('tenant_id');
        $table = RestaurantTable::where('tenant_id', $tenantId)->findOrFail($id);

        $data = $request->validate([
            'branch_id' => ['nullable', 'exists:branches,id'],
            'name' => ['required', 'string', 'max:255'],
            'code' => ['nullable', 'string', 'max:50'],
            'section' => ['nullable', 'string', 'max:255'],
            'capacity' => ['nullable', 'integer', 'min:1'],
            'status' => ['nullable', 'in:available,occupied,cleaning,closed'],
            'shape' => ['nullable', 'in:square,round'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
        ]);

        if (empty($data['branch_id']) && ! empty($data['section'])) {
            $resolved = RestaurantBranchScope::resolveBranchIdFromSectionName($tenantId, (string) $data['section']);
            if ($resolved) {
                $data['branch_id'] = $resolved;
            }
        }

        $table->update($data);

        return response()->json($table);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $tenantId = $request->attributes->get('tenant_id');
        $table = RestaurantTable::where('tenant_id', $tenantId)->findOrFail($id);
        $table->delete();

        return response()->json(['success' => true]);
    }
}
