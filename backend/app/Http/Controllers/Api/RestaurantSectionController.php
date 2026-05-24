<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\RestaurantSection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RestaurantSectionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $tenantId = $request->attributes->get('tenant_id');

        $sections = RestaurantSection::query()
            ->where('tenant_id', $tenantId)
            ->with('branch:id,name')
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        return response()->json($sections);
    }

    public function store(Request $request): JsonResponse
    {
        $tenantId = $request->attributes->get('tenant_id');

        $data = $request->validate([
            'branch_id' => ['nullable', 'exists:branches,id'],
            'name' => ['required', 'string', 'max:255'],
            'name_en' => ['nullable', 'string', 'max:255'],
            'code' => ['nullable', 'string', 'max:50'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
        ]);

        $data['tenant_id'] = $tenantId;

        $section = RestaurantSection::create($data);

        return response()->json($section, 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $tenantId = $request->attributes->get('tenant_id');
        $section = RestaurantSection::where('tenant_id', $tenantId)->findOrFail($id);

        $data = $request->validate([
            'branch_id' => ['nullable', 'exists:branches,id'],
            'name' => ['required', 'string', 'max:255'],
            'name_en' => ['nullable', 'string', 'max:255'],
            'code' => ['nullable', 'string', 'max:50'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
        ]);

        $section->update($data);

        return response()->json($section);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $tenantId = $request->attributes->get('tenant_id');
        $section = RestaurantSection::where('tenant_id', $tenantId)->findOrFail($id);
        $section->delete();

        return response()->json(['success' => true]);
    }
}
