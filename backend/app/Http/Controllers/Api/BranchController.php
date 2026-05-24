<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BranchController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Branch::where('tenant_id', $request->tenant_id)
            ->when($request->status === 'active', fn ($q) => $q->where('is_active', true))
            ->when($request->status === 'inactive', fn ($q) => $q->where('is_active', false));

        if ($request->filled('account_id')) {
            $accountId = (int) $request->account_id;
            $linkedIds = \Illuminate\Support\Facades\DB::table('account_branch')->where('account_id', $accountId)->pluck('branch_id');
            if ($linkedIds->isNotEmpty()) {
                $query->whereIn('id', $linkedIds);
            }
        }

        $branches = $query->orderBy('code')->get();

        return response()->json($branches);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'name_en' => 'nullable|string|max:255',
            'code' => 'required|string|max:20',
            'address' => 'nullable|string',
            'phone' => 'nullable|string|max:50',
            'manager_name' => 'nullable|string|max:255',
            'is_active' => 'sometimes|boolean',
        ]);

        $validated['tenant_id'] = $request->tenant_id;
        $branch = Branch::create($validated);

        return response()->json($branch, 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $branch = Branch::where('tenant_id', $request->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'name_en' => 'nullable|string|max:255',
            'code' => 'sometimes|string|max:20',
            'address' => 'nullable|string',
            'phone' => 'nullable|string|max:50',
            'manager_name' => 'nullable|string|max:255',
            'is_active' => 'sometimes|boolean',
        ]);

        $branch->update($validated);

        return response()->json($branch);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $branch = Branch::where('tenant_id', $request->tenant_id)->findOrFail($id);

        $usedInJournals = \App\Models\JournalEntry::where('branch_id', $branch->id)->exists();
        if ($usedInJournals) {
            return response()->json(['message' => 'Cannot delete a branch linked to journal entries'], 422);
        }

        $usedInInvoices = \App\Models\Invoice::where('branch_id', $branch->id)->exists();
        if ($usedInInvoices) {
            return response()->json(['message' => 'Cannot delete a branch linked to invoices'], 422);
        }

        $branch->delete();

        return response()->json(['message' => 'Deleted successfully']);
    }
}
