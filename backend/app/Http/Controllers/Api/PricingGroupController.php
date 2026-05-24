<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PricingGroup;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PricingGroupController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $list = PricingGroup::where('tenant_id', $request->tenant_id)
            ->with(['branches:id,name,name_en', 'tenantUsers.user:id,name,email'])
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $list]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => [
                'required',
                'string',
                'max:255',
                Rule::unique('pricing_groups', 'name')->where(fn ($q) => $q->where('tenant_id', (int) $request->tenant_id)),
            ],
            'operation_type' => 'required|in:discount_percent,increase_percent,fixed_price',
            'pricing_type' => 'nullable|in:fixed,percent',
            'value' => 'required|numeric',
            'is_active' => 'nullable|boolean',
            'branch_ids' => 'nullable|array',
            'branch_ids.*' => ['integer', Rule::exists('branches', 'id')->where('tenant_id', (int) $request->tenant_id)],
            'tenant_user_ids' => 'nullable|array',
            'tenant_user_ids.*' => ['integer', Rule::exists('tenant_users', 'id')->where('tenant_id', (int) $request->tenant_id)],
        ], [
            'name.unique' => 'اسم مجموعة التسعير مستخدم مسبقاً داخل هذه الشركة.',
        ]);

        $validated['tenant_id'] = $request->tenant_id;
        $validated['is_active'] = $validated['is_active'] ?? true;
        // توافق خلفي: اترك pricing_type موجوداً لكن لا نعتمد عليه
        $validated['pricing_type'] = $validated['pricing_type'] ?? ($validated['operation_type'] === 'fixed_price' ? 'fixed' : 'percent');

        $group = PricingGroup::create($validated);

        $branchIds = $request->input('branch_ids', []);
        $tenantUserIds = $request->input('tenant_user_ids', []);
        if (is_array($branchIds)) {
            $group->branches()->sync(array_values(array_unique(array_map('intval', $branchIds))));
        }
        if (is_array($tenantUserIds)) {
            $group->tenantUsers()->sync(array_values(array_unique(array_map('intval', $tenantUserIds))));
        }

        return response()->json($group, 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $group = PricingGroup::where('tenant_id', $request->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'name' => [
                'sometimes',
                'string',
                'max:255',
                Rule::unique('pricing_groups', 'name')
                    ->where(fn ($q) => $q->where('tenant_id', (int) $request->tenant_id))
                    ->ignore($group->id),
            ],
            'operation_type' => 'sometimes|in:discount_percent,increase_percent,fixed_price',
            'pricing_type' => 'sometimes|in:fixed,percent',
            'value' => 'sometimes|numeric',
            'is_active' => 'sometimes|boolean',
            'branch_ids' => 'nullable|array',
            'branch_ids.*' => ['integer', Rule::exists('branches', 'id')->where('tenant_id', (int) $request->tenant_id)],
            'tenant_user_ids' => 'nullable|array',
            'tenant_user_ids.*' => ['integer', Rule::exists('tenant_users', 'id')->where('tenant_id', (int) $request->tenant_id)],
        ], [
            'name.unique' => 'اسم مجموعة التسعير مستخدم مسبقاً داخل هذه الشركة.',
        ]);

        if (array_key_exists('operation_type', $validated) && ! array_key_exists('pricing_type', $validated)) {
            $validated['pricing_type'] = $validated['operation_type'] === 'fixed_price' ? 'fixed' : 'percent';
        }

        $group->update($validated);

        if ($request->has('branch_ids')) {
            $ids = $request->input('branch_ids', []);
            $group->branches()->sync(is_array($ids) ? array_values(array_unique(array_map('intval', $ids))) : []);
        }
        if ($request->has('tenant_user_ids')) {
            $ids = $request->input('tenant_user_ids', []);
            $group->tenantUsers()->sync(is_array($ids) ? array_values(array_unique(array_map('intval', $ids))) : []);
        }

        return response()->json($group->load(['branches:id,name,name_en', 'tenantUsers.user:id,name,email']));
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $group = PricingGroup::where('tenant_id', $request->tenant_id)->findOrFail($id);

        if ($group->customers()->exists()) {
            return response()->json(['message' => 'لا يمكن حذف مجموعة مرتبطة بعملاء. أزل ربط العملاء أولاً.'], 422);
        }

        $group->delete();

        return response()->json(['message' => 'تم الحذف بنجاح']);
    }
}
