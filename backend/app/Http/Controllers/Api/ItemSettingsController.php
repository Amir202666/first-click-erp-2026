<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ItemAttributeTemplate;
use App\Models\ItemBrand;
use App\Models\ItemCategory;
use App\Models\ItemUnit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class ItemSettingsController extends Controller
{
    /** توليد كود فئة فريد داخل الشركة؛ الفروع تستخدم بادئة كود الفئة الأب إن وُجدت. */
    private function generateUniqueItemCategoryCode(int $tenantId, ?int $parentId): string
    {
        $prefix = 'CAT';
        if ($parentId) {
            $parent = ItemCategory::where('tenant_id', $tenantId)->find($parentId);
            if ($parent && is_string($parent->code) && $parent->code !== '') {
                $raw = preg_replace('/[^A-Za-z0-9]/', '', $parent->code);
                if ($raw !== '') {
                    $prefix = strtoupper(substr($raw, 0, 16));
                }
            }
        }

        for ($n = 1; $n < 10_000; $n++) {
            $suffix = sprintf('-%03d', $n);
            $maxPrefix = 20 - strlen($suffix);
            if ($maxPrefix < 1) {
                break;
            }
            $p = strtoupper(substr($prefix, 0, $maxPrefix));
            $candidate = $p.$suffix;
            if (strlen($candidate) > 20) {
                $candidate = substr($candidate, 0, 20);
            }
            if (! ItemCategory::where('tenant_id', $tenantId)->where('code', $candidate)->exists()) {
                return $candidate;
            }
        }

        for ($k = 0; $k < 32; $k++) {
            $fallback = 'C'.strtoupper(substr(bin2hex(random_bytes(5)), 0, 8));
            if (strlen($fallback) <= 20 && ! ItemCategory::where('tenant_id', $tenantId)->where('code', $fallback)->exists()) {
                return $fallback;
            }
        }

        return 'C'.substr((string) time(), -8);
    }

    /**
     * @param  array<int, mixed>  $branchIds
     */
    private function syncCategoryBranches(ItemCategory $category, bool $appliesToAllBranches, array $branchIds): void
    {
        if ($appliesToAllBranches) {
            $category->branches()->detach();

            return;
        }

        $ids = array_values(array_unique(array_filter(array_map('intval', $branchIds))));
        $validIds = Branch::query()
            ->where('tenant_id', $category->tenant_id)
            ->whereIn('id', $ids)
            ->pluck('id')
            ->all();

        if ($validIds === []) {
            throw ValidationException::withMessages([
                'branch_ids' => ['يرجى اختيار فرع واحد على الأقل عند تقييد الفئة بفروع محددة.'],
            ]);
        }

        $category->branches()->sync($validIds);
    }

    // ──── Units ────

    public function units(Request $request): JsonResponse
    {
        $units = ItemUnit::where('tenant_id', $request->tenant_id)
            ->withCount('items')
            ->orderBy('name')
            ->get();

        return response()->json($units);
    }

    public function storeUnit(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:50',
            'name_en' => 'nullable|string|max:255',
            'symbol' => 'nullable|string|max:10',
        ]);

        $validated['tenant_id'] = $request->tenant_id;
        $unit = ItemUnit::create($validated);

        return response()->json($unit, 201);
    }

    public function updateUnit(Request $request, int $id): JsonResponse
    {
        $unit = ItemUnit::where('tenant_id', $request->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:50',
            'name_en' => 'nullable|string|max:255',
            'symbol' => 'nullable|string|max:10',
            'is_active' => 'sometimes|boolean',
        ]);

        $unit->update($validated);

        return response()->json($unit);
    }

    public function destroyUnit(Request $request, int $id): JsonResponse
    {
        $unit = ItemUnit::where('tenant_id', $request->tenant_id)->withCount('items')->findOrFail($id);

        if ($unit->items_count > 0) {
            return response()->json([
                'message' => "لا يمكن حذف هذه الوحدة لأنها مرتبطة بـ {$unit->items_count} صنف",
            ], 422);
        }

        $unit->delete();

        return response()->json(['message' => 'تم الحذف بنجاح']);
    }

    // ──── Brands ────

    public function brands(Request $request): JsonResponse
    {
        $tenantId = (int) ($request->tenant_id ?? $request->input('tenant_id'));
        if ($tenantId < 1) {
            return response()->json(['message' => 'يرجى تحديد المستأجر (tenant_id)'], 422);
        }
        $brands = ItemBrand::where('tenant_id', $tenantId)
            ->withCount('items')
            ->orderBy('name')
            ->get();

        return response()->json($brands);
    }

    public function storeBrand(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'name_en' => 'nullable|string|max:255',
            'description' => 'nullable|string',
        ]);

        $validated['tenant_id'] = $request->tenant_id;
        $brand = ItemBrand::create($validated);

        return response()->json($brand, 201);
    }

    public function updateBrand(Request $request, int $id): JsonResponse
    {
        $brand = ItemBrand::where('tenant_id', $request->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'name_en' => 'nullable|string|max:255',
            'description' => 'nullable|string',
            'is_active' => 'sometimes|boolean',
        ]);

        $brand->update($validated);

        return response()->json($brand);
    }

    public function destroyBrand(Request $request, int $id): JsonResponse
    {
        $brand = ItemBrand::where('tenant_id', $request->tenant_id)->withCount('items')->findOrFail($id);

        if ($brand->items_count > 0) {
            return response()->json([
                'message' => "لا يمكن حذف هذه العلامة التجارية لأنها مرتبطة بـ {$brand->items_count} صنف",
            ], 422);
        }

        $brand->delete();

        return response()->json(['message' => 'تم الحذف بنجاح']);
    }

    // ──── Categories (enhanced) ────

    public function categories(Request $request): JsonResponse
    {
        $tenantId = (int) ($request->tenant_id ?? $request->input('tenant_id'));
        if ($tenantId < 1) {
            return response()->json(['message' => 'يرجى تحديد المستأجر (tenant_id)'], 422);
        }
        $categories = ItemCategory::where('tenant_id', $tenantId)
            ->withCount('items')
            ->with(['parent', 'branches'])
            ->orderBy('code')
            ->get();

        return response()->json($categories);
    }

    public function storeCategory(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'code' => 'nullable|string|max:20',
            'name' => 'required|string|max:255',
            'name_en' => 'nullable|string|max:255',
            'parent_id' => 'nullable|exists:item_categories,id',
            'description' => 'nullable|string',
            'image' => 'nullable|image|mimes:jpeg,png,jpg,gif,webp|max:2048',
            'inventory_account_id' => 'nullable|exists:accounts,id',
            'cost_of_sales_account_id' => 'nullable|exists:accounts,id',
            'sales_account_id' => 'nullable|exists:accounts,id',
            'applies_to_all_branches' => 'nullable|boolean',
            'show_in_pos' => 'nullable|boolean',
            'show_in_restaurant_pos' => 'nullable|boolean',
            'branch_ids' => 'nullable|array',
            'branch_ids.*' => 'integer|exists:branches,id',
        ]);

        $branchIds = $validated['branch_ids'] ?? [];
        unset($validated['branch_ids']);
        $appliesToAllBranches = (bool) ($validated['applies_to_all_branches'] ?? true);
        $validated['applies_to_all_branches'] = $appliesToAllBranches;

        $incomingCode = isset($validated['code']) ? trim((string) $validated['code']) : '';
        if ($incomingCode === '') {
            $validated['code'] = $this->generateUniqueItemCategoryCode((int) $request->tenant_id, isset($validated['parent_id']) ? (int) $validated['parent_id'] : null);
        } else {
            $validated['code'] = $incomingCode;
        }

        $validated['tenant_id'] = $request->tenant_id;
        unset($validated['image']);
        if (! array_key_exists('show_in_pos', $validated)) {
            $validated['show_in_pos'] = true;
        }
        if (! array_key_exists('show_in_restaurant_pos', $validated)) {
            $validated['show_in_restaurant_pos'] = true;
        }
        $category = ItemCategory::create($validated);

        if ($request->hasFile('image')) {
            $path = $request->file('image')->store('item-categories/'.$request->tenant_id, 'public');
            $category->update(['image' => $path]);
        }

        $this->syncCategoryBranches($category->fresh(), $appliesToAllBranches, is_array($branchIds) ? $branchIds : []);

        return response()->json($category->load(['parent', 'branches']), 201);
    }

    public function updateCategory(Request $request, int $id): JsonResponse
    {
        $category = ItemCategory::where('tenant_id', $request->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'code' => 'sometimes|string|max:20',
            'name' => 'sometimes|string|max:255',
            'name_en' => 'nullable|string|max:255',
            'parent_id' => 'nullable|exists:item_categories,id',
            'description' => 'nullable|string',
            'image' => 'nullable|image|mimes:jpeg,png,jpg,gif,webp|max:2048',
            'is_active' => 'sometimes|boolean',
            'inventory_account_id' => 'nullable|exists:accounts,id',
            'cost_of_sales_account_id' => 'nullable|exists:accounts,id',
            'sales_account_id' => 'nullable|exists:accounts,id',
            'applies_to_all_branches' => 'nullable|boolean',
            'show_in_pos' => 'nullable|boolean',
            'show_in_restaurant_pos' => 'nullable|boolean',
            'branch_ids' => 'nullable|array',
            'branch_ids.*' => 'integer|exists:branches,id',
        ]);

        $branchIdsInput = $validated['branch_ids'] ?? null;
        unset($validated['branch_ids']);

        if (isset($validated['parent_id']) && $validated['parent_id'] == $id) {
            return response()->json(['message' => 'لا يمكن أن تكون الفئة أباً لنفسها'], 422);
        }

        unset($validated['image']);
        $category->update($validated);

        if ($request->hasFile('image')) {
            if ($category->image) {
                Storage::disk('public')->delete($category->image);
            }
            $path = $request->file('image')->store('item-categories/'.$request->tenant_id, 'public');
            $category->update(['image' => $path]);
        }

        if ($request->has('applies_to_all_branches') || $request->has('branch_ids')) {
            $appliesToAll = $request->has('applies_to_all_branches')
                ? $request->boolean('applies_to_all_branches')
                : (bool) $category->applies_to_all_branches;
            $category->applies_to_all_branches = $appliesToAll;
            $category->save();
            $ids = is_array($branchIdsInput) ? $branchIdsInput : [];
            $this->syncCategoryBranches($category->fresh(), $appliesToAll, $ids);
        }

        return response()->json($category->fresh()->load(['parent', 'branches']));
    }

    public function destroyCategory(Request $request, int $id): JsonResponse
    {
        $category = ItemCategory::where('tenant_id', $request->tenant_id)
            ->withCount(['items', 'children'])
            ->findOrFail($id);

        if ($category->items_count > 0) {
            return response()->json([
                'message' => "لا يمكن حذف هذه الفئة لأنها مرتبطة بـ {$category->items_count} صنف",
            ], 422);
        }

        if ($category->children_count > 0) {
            return response()->json([
                'message' => "لا يمكن حذف هذه الفئة لأنها تحتوي على {$category->children_count} فئة فرعية",
            ], 422);
        }

        $category->delete();

        return response()->json(['message' => 'تم الحذف بنجاح']);
    }

    // ──── Item Attribute Templates (قوالب خصائص المتغيرات) ────

    public function attributeTemplates(Request $request): JsonResponse
    {
        $templates = ItemAttributeTemplate::where('tenant_id', $request->tenant_id)
            ->with('values')
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $templates]);
    }

    public function storeAttributeTemplate(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'values' => 'required|array|min:1',
            'values.*' => 'required|string|max:255',
        ]);

        // Upsert by (tenant_id, name) to avoid UNIQUE constraint violations when resubmitting.
        $template = ItemAttributeTemplate::firstOrCreate([
            'tenant_id' => $request->tenant_id,
            'name' => $validated['name'],
        ]);

        // Replace values with the submitted list (idempotent).
        $template->values()->delete();
        foreach ($validated['values'] as $value) {
            $template->values()->create(['value' => $value]);
        }

        $payload = $template->load('values');

        return response()->json([
            'created' => $template->wasRecentlyCreated,
            'template' => $payload,
        ], $template->wasRecentlyCreated ? 201 : 200);
    }
}
