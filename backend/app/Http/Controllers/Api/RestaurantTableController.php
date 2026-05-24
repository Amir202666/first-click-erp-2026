<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\RestaurantTable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RestaurantTableController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $tenantId = $request->attributes->get('tenant_id');
        $branchId = $request->query('branch_id');

        $query = RestaurantTable::query()
            ->where('tenant_id', $tenantId)
            ->orderBy('sort_order')
            ->orderBy('id');

        if ($branchId) {
            $query->where('branch_id', $branchId);
        }

        return response()->json($query->get());
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
            'status' => ['nullable', 'in:available,occupied,cleaning'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
        ]);

        $data['tenant_id'] = $tenantId;

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
            'status' => ['nullable', 'in:available,occupied,cleaning'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
        ]);

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
