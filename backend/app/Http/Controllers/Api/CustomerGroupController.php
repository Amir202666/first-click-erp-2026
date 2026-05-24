<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CustomerGroup;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CustomerGroupController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $groups = CustomerGroup::where('tenant_id', $request->tenant_id)
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $groups]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'discount_type' => 'required|in:percent,fixed',
            'discount_value' => 'required|numeric|min:0',
            'is_active' => 'nullable|boolean',
        ]);

        $validated['tenant_id'] = $request->tenant_id;
        $validated['is_active'] = $validated['is_active'] ?? true;

        $group = CustomerGroup::create($validated);

        return response()->json($group, 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $group = CustomerGroup::where('tenant_id', $request->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'discount_type' => 'sometimes|in:percent,fixed',
            'discount_value' => 'sometimes|numeric|min:0',
            'is_active' => 'sometimes|boolean',
        ]);

        $group->update($validated);

        return response()->json($group);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $group = CustomerGroup::where('tenant_id', $request->tenant_id)->findOrFail($id);

        if ($group->customers()->exists()) {
            return response()->json(['message' => 'لا يمكن حذف مجموعة مرتبطة بعملاء. أزل ربط العملاء أولاً.'], 422);
        }

        $group->delete();

        return response()->json(['message' => 'تم الحذف بنجاح']);
    }
}
