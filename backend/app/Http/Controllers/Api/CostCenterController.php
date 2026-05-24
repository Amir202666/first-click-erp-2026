<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CostCenter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CostCenterController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = CostCenter::where('tenant_id', $request->tenant_id)
            ->when($request->boolean('active_only'), fn ($q) => $q->where('is_active', true));

        if ($request->filled('account_id')) {
            $accountId = (int) $request->account_id;
            $linkedIds = \Illuminate\Support\Facades\DB::table('account_cost_center')->where('account_id', $accountId)->pluck('cost_center_id');
            if ($linkedIds->isNotEmpty()) {
                $query->whereIn('id', $linkedIds);
            }
        }

        $centers = $query->with('parent')->orderBy('code')->get();

        return response()->json($centers);
    }

    public function tree(Request $request): JsonResponse
    {
        $centers = CostCenter::where('tenant_id', $request->tenant_id)
            ->orderBy('code')
            ->get();

        $tree = $this->buildTree($centers);

        return response()->json($tree);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'code' => 'required|string|max:20',
            'name' => 'required|string|max:255',
            'name_en' => 'nullable|string|max:255',
            'parent_id' => 'nullable|exists:cost_centers,id',
            'description' => 'nullable|string',
            'is_active' => 'sometimes|boolean',
        ]);

        $validated['tenant_id'] = $request->tenant_id;
        $center = CostCenter::create($validated);

        return response()->json($center->load('parent'), 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $center = CostCenter::where('tenant_id', $request->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'code' => 'sometimes|string|max:20',
            'name' => 'sometimes|string|max:255',
            'name_en' => 'nullable|string|max:255',
            'parent_id' => 'nullable|exists:cost_centers,id',
            'description' => 'nullable|string',
            'is_active' => 'sometimes|boolean',
        ]);

        if (isset($validated['parent_id']) && $validated['parent_id'] == $id) {
            return response()->json(['message' => 'A cost center cannot be its own parent'], 422);
        }

        $center->update($validated);

        return response()->json($center->load('parent'));
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $center = CostCenter::where('tenant_id', $request->tenant_id)->findOrFail($id);

        if ($center->children()->exists()) {
            return response()->json(['message' => 'Cannot delete a cost center with sub-centers'], 422);
        }

        $usedInJournalLines = \App\Models\JournalEntryLine::where('cost_center_id', $center->id)->exists();
        if ($usedInJournalLines) {
            return response()->json(['message' => 'Cannot delete a cost center linked to journal entries'], 422);
        }

        $center->delete();

        return response()->json(['message' => 'Deleted successfully']);
    }

    private function buildTree($centers, $parentId = null): array
    {
        $tree = [];
        foreach ($centers as $center) {
            if ($center->parent_id == $parentId) {
                $node = $center->toArray();
                $node['children'] = $this->buildTree($centers, $center->id);
                $tree[] = $node;
            }
        }

        return $tree;
    }
}
