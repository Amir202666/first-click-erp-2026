<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\VendorGroup;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class VendorGroupController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $groups = VendorGroup::where('tenant_id', (int) $request->tenant_id)
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $groups]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'name_en' => 'nullable|string|max:255',
            'is_active' => 'nullable|boolean',
        ]);

        $validated['tenant_id'] = (int) $request->tenant_id;
        $validated['is_active'] = array_key_exists('is_active', $validated) ? (bool) $validated['is_active'] : true;

        $group = VendorGroup::create($validated);

        return response()->json($group, 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $group = VendorGroup::where('tenant_id', (int) $request->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'name_en' => 'nullable|string|max:255',
            'is_active' => 'nullable|boolean',
        ]);

        $group->update($validated);

        return response()->json($group);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $group = VendorGroup::where('tenant_id', (int) $request->tenant_id)->findOrFail($id);

        if ($group->vendors()->exists()) {
            return response()->json(['message' => 'لا يمكن حذف فئة بها موردون.'], 422);
        }

        $group->delete();

        return response()->json(['message' => 'تم الحذف بنجاح']);
    }
}
