<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\SalesRep;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SalesRepController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $query = SalesRep::where('tenant_id', $tenantId)->with('branches:id,name,name_en')->orderBy('name');

        if ($request->filled('is_active')) {
            $query->where('is_active', (bool) $request->is_active);
        }

        $perPage = min(500, max(10, (int) ($request->per_page ?? 50)));
        $data = $query->paginate($perPage);

        return response()->json($data);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'region' => 'nullable|string|max:255',
            'address' => 'nullable|string|max:500',
            'phone' => 'nullable|string|max:50',
            'commission_percent' => 'nullable|numeric|min:0|max:100',
            'is_active' => 'nullable|boolean',
            'branch_ids' => 'nullable|array',
            'branch_ids.*' => 'integer|exists:branches,id',
        ]);

        $validated['tenant_id'] = (int) $request->tenant_id;
        $validated['commission_percent'] = $validated['commission_percent'] ?? 0;
        $validated['is_active'] = $validated['is_active'] ?? true;
        $branchIds = $this->validBranchIdsForTenant((int) $request->tenant_id, $validated['branch_ids'] ?? []);
        unset($validated['branch_ids']);

        $rep = SalesRep::create($validated);
        $rep->branches()->sync($branchIds);

        return response()->json($rep->load('branches:id,name,name_en'), 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $rep = SalesRep::where('tenant_id', $request->tenant_id)->with('branches:id,name,name_en')->findOrFail($id);

        return response()->json($rep);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $rep = SalesRep::where('tenant_id', $request->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'region' => 'nullable|string|max:255',
            'address' => 'nullable|string|max:500',
            'phone' => 'nullable|string|max:50',
            'commission_percent' => 'nullable|numeric|min:0|max:100',
            'is_active' => 'nullable|boolean',
            'branch_ids' => 'nullable|array',
            'branch_ids.*' => 'integer|exists:branches,id',
        ]);

        $branchIds = isset($validated['branch_ids']) ? $this->validBranchIdsForTenant((int) $request->tenant_id, $validated['branch_ids']) : null;
        unset($validated['branch_ids']);
        $rep->update($validated);
        if ($branchIds !== null) {
            $rep->branches()->sync($branchIds);
        }

        return response()->json($rep->load('branches:id,name,name_en'));
    }

    /** @return array<int> */
    private function validBranchIdsForTenant(int $tenantId, array $branchIds): array
    {
        if (empty($branchIds)) {
            return [];
        }
        $allowed = Branch::where('tenant_id', $tenantId)->pluck('id')->all();

        return array_values(array_intersect($branchIds, $allowed));
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $rep = SalesRep::where('tenant_id', $request->tenant_id)->findOrFail($id);
        \App\Models\Invoice::where('tenant_id', $request->tenant_id)->where('sales_rep_id', $id)->update(['sales_rep_id' => null]);
        \App\Models\Payment::where('tenant_id', $request->tenant_id)->where('sales_rep_id', $id)->update(['sales_rep_id' => null]);
        $rep->delete();

        return response()->json(['message' => 'تم الحذف']);
    }
}
