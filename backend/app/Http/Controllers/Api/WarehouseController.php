<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\Employee;
use App\Models\Warehouse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class WarehouseController extends Controller
{
    /**
     * @param  array<int, mixed>  $branchIds
     */
    private function syncWarehouseBranches(Warehouse $warehouse, bool $appliesToAllBranches, array $branchIds): void
    {
        if ($appliesToAllBranches) {
            $warehouse->branches()->detach();
            $warehouse->branch_id = null;
            $warehouse->applies_to_all_branches = true;
            $warehouse->save();

            return;
        }

        $ids = array_values(array_unique(array_filter(array_map('intval', $branchIds))));
        $validIds = Branch::query()
            ->where('tenant_id', $warehouse->tenant_id)
            ->whereIn('id', $ids)
            ->pluck('id')
            ->all();

        if ($validIds === []) {
            throw ValidationException::withMessages([
                'branch_ids' => ['يرجى اختيار فرع واحد على الأقل عند تقييد المخزن بفروع محددة.'],
            ]);
        }

        sort($validIds);
        $warehouse->branches()->sync($validIds);
        $warehouse->branch_id = $validIds[0];
        $warehouse->applies_to_all_branches = false;
        $warehouse->save();
    }

    private function generateUniqueWarehouseCode(int $tenantId): string
    {
        $prefix = 'WH';
        for ($n = 1; $n < 10_000; $n++) {
            $candidate = sprintf('%s-%03d', $prefix, $n);
            if (! Warehouse::withTrashed()->where('tenant_id', $tenantId)->where('code', $candidate)->exists()) {
                return $candidate;
            }
        }

        return $prefix.'-'.substr((string) time(), -6);
    }

    public function index(Request $request): JsonResponse
    {
        $tenantId = (int) ($request->tenant_id ?? $request->input('tenant_id'));
        if ($tenantId < 1) {
            return response()->json(['message' => 'يرجى تحديد المستأجر (tenant_id)'], 422);
        }
        $query = Warehouse::where('tenant_id', $tenantId)
            ->where('is_active', true)
            ->with(['branch:id,name,code', 'branches:id,name,code', 'responsibleEmployee:id,code,name'])
            ->orderBy('code');

        $perPage = $request->input('per_page');
        if ($perPage && is_numeric($perPage)) {
            $data = $query->paginate((int) $perPage);

            return response()->json($data);
        }

        $list = $query->get();

        return response()->json(['data' => $list]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'name_en' => 'nullable|string|max:255',
            'code' => 'nullable|string|max:20',
            'address' => 'nullable|string',
            'applies_to_all_branches' => 'nullable|boolean',
            'branch_ids' => 'nullable|array',
            'branch_ids.*' => 'integer|exists:branches,id',
            'responsible_employee_id' => 'nullable|exists:employees,id',
        ]);

        $branchIds = $validated['branch_ids'] ?? [];
        unset($validated['branch_ids']);

        $incomingCode = isset($validated['code']) ? trim((string) $validated['code']) : '';
        $validated['code'] = $incomingCode !== ''
            ? $incomingCode
            : $this->generateUniqueWarehouseCode((int) $request->tenant_id);

        $tenantId = (int) $request->tenant_id;
        if (! empty($validated['responsible_employee_id'])) {
            Employee::query()->where('tenant_id', $tenantId)->findOrFail((int) $validated['responsible_employee_id']);
        }

        $appliesToAll = $request->boolean('applies_to_all_branches', true);
        $validated['applies_to_all_branches'] = $appliesToAll;
        $validated['branch_id'] = null;
        $validated['tenant_id'] = $tenantId;
        $validated['is_active'] = true;

        $warehouse = Warehouse::create($validated);
        $this->syncWarehouseBranches($warehouse->fresh(), $appliesToAll, is_array($branchIds) ? $branchIds : []);

        return response()->json(
            $warehouse->fresh()->load(['branch:id,name,code', 'branches:id,name,code', 'responsibleEmployee:id,code,name']),
            201
        );
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $warehouse = Warehouse::where('tenant_id', $request->tenant_id)
            ->with(['branch:id,name,code', 'branches:id,name,code', 'responsibleEmployee:id,code,name'])
            ->findOrFail($id);

        return response()->json($warehouse);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $warehouse = Warehouse::where('tenant_id', $request->tenant_id)->findOrFail($id);
        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'name_en' => 'nullable|string|max:255',
            'code' => 'sometimes|string|max:20',
            'address' => 'nullable|string',
            'is_active' => 'sometimes|boolean',
            'applies_to_all_branches' => 'nullable|boolean',
            'branch_ids' => 'nullable|array',
            'branch_ids.*' => 'integer|exists:branches,id',
            'responsible_employee_id' => 'nullable|exists:employees,id',
        ]);

        $branchIdsInput = $validated['branch_ids'] ?? null;
        unset($validated['branch_ids']);

        if (array_key_exists('responsible_employee_id', $validated) && $validated['responsible_employee_id'] !== null) {
            Employee::query()->where('tenant_id', (int) $request->tenant_id)->findOrFail((int) $validated['responsible_employee_id']);
        }

        $warehouse->update($validated);

        if ($request->has('applies_to_all_branches') || $request->has('branch_ids')) {
            $appliesToAll = $request->has('applies_to_all_branches')
                ? $request->boolean('applies_to_all_branches')
                : (bool) $warehouse->applies_to_all_branches;
            $warehouse->applies_to_all_branches = $appliesToAll;
            $warehouse->save();
            $ids = is_array($branchIdsInput) ? $branchIdsInput : [];
            $this->syncWarehouseBranches($warehouse->fresh(), $appliesToAll, $ids);
        }

        return response()->json(
            $warehouse->fresh()->load(['branch:id,name,code', 'branches:id,name,code', 'responsibleEmployee:id,code,name'])
        );
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $warehouse = Warehouse::where('tenant_id', $request->tenant_id)->findOrFail($id);
        $warehouse->delete();

        return response()->json(['message' => 'تم الحذف']);
    }
}
