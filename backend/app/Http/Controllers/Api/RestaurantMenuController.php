<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\RestaurantMenuCategory;
use App\Models\RestaurantMenuItem;
use App\Models\RestaurantMenuSetting;
use App\Models\Tenant;
use App\Support\TenantBranding;
use App\Support\TenantDefaultCurrency;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class RestaurantMenuController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $tenantId = $request->attributes->get('tenant_id');
        $tenant = Tenant::findOrFail($tenantId);

        $settings = RestaurantMenuSetting::firstOrCreate(
            ['tenant_id' => $tenantId],
            ['primary_color' => '#10b981', 'service_charge_percent' => 10, 'is_published' => true],
        );

        $categories = RestaurantMenuCategory::where('tenant_id', $tenantId)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        $items = RestaurantMenuItem::where('tenant_id', $tenantId)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        return response()->json([
            'restaurant' => [
                'name' => TenantBranding::companyName($tenant),
                'name_en' => TenantBranding::companyNameEn($tenant),
                'slug' => $tenant->slug,
                'logo_url' => TenantBranding::companyLogoUrl($tenant),
                ...TenantDefaultCurrency::forApi($tenant),
            ],
            'settings' => [
                'primary_color' => $settings->primary_color,
                'service_charge_percent' => $settings->service_charge_percent,
                'cover_url' => $settings->cover_image ? asset('storage/'.$settings->cover_image) : null,
                'is_published' => $settings->is_published,
            ],
            'categories' => $categories->map(fn (RestaurantMenuCategory $c) => $this->formatCategory($c))->values(),
            'items' => $items->map(fn (RestaurantMenuItem $i) => $this->formatMenuItem($i))->values(),
        ]);
    }

    public function updateSettings(Request $request): JsonResponse
    {
        $tenantId = $request->attributes->get('tenant_id');

        $data = $request->validate([
            'primary_color' => ['nullable', 'string', 'max:20'],
            'service_charge_percent' => ['nullable', 'integer', 'min:0', 'max:100'],
            'is_published' => ['nullable', 'boolean'],
        ]);

        $settings = RestaurantMenuSetting::firstOrCreate(
            ['tenant_id' => $tenantId],
            ['primary_color' => '#10b981', 'service_charge_percent' => 10, 'is_published' => true],
        );

        $settings->update(array_filter($data, fn ($v) => $v !== null));

        return response()->json(['settings' => $settings->fresh()]);
    }

    public function uploadCover(Request $request): JsonResponse
    {
        $tenantId = $request->attributes->get('tenant_id');

        $request->validate([
            'cover' => ['required', 'image', 'mimes:jpeg,png,jpg,gif,webp', 'max:4096'],
        ]);

        $settings = RestaurantMenuSetting::firstOrCreate(
            ['tenant_id' => $tenantId],
            ['primary_color' => '#10b981', 'service_charge_percent' => 10, 'is_published' => true],
        );

        if ($settings->cover_image) {
            Storage::disk('public')->delete($settings->cover_image);
        }

        $path = $request->file('cover')->store('restaurant-menu/'.$tenantId, 'public');
        $settings->update(['cover_image' => $path]);

        return response()->json([
            'cover_url' => asset('storage/'.$path),
        ]);
    }

    public function storeCategory(Request $request): JsonResponse
    {
        $tenantId = $request->attributes->get('tenant_id');

        $data = $this->validateCategory($request);

        $category = RestaurantMenuCategory::create([
            ...$data,
            'tenant_id' => $tenantId,
            'sort_order' => $data['sort_order'] ?? 0,
        ]);

        if ($request->hasFile('image')) {
            $path = $request->file('image')->store('restaurant-menu/'.$tenantId.'/categories', 'public');
            $category->update(['image' => $path]);
        }

        return response()->json($this->formatCategory($category->fresh()), 201);
    }

    public function updateCategory(Request $request, int $id): JsonResponse
    {
        $tenantId = $request->attributes->get('tenant_id');
        $category = RestaurantMenuCategory::where('tenant_id', $tenantId)->findOrFail($id);

        $data = $this->validateCategory($request, true);

        $category->update($data);

        if ($request->hasFile('image')) {
            if ($category->image) {
                Storage::disk('public')->delete($category->image);
            }
            $path = $request->file('image')->store('restaurant-menu/'.$tenantId.'/categories', 'public');
            $category->update(['image' => $path]);
        }

        return response()->json($this->formatCategory($category->fresh()));
    }

    public function destroyCategory(Request $request, int $id): JsonResponse
    {
        $tenantId = $request->attributes->get('tenant_id');
        $category = RestaurantMenuCategory::where('tenant_id', $tenantId)->findOrFail($id);

        if (RestaurantMenuItem::where('tenant_id', $tenantId)->where('category_id', $id)->exists()) {
            return response()->json(['message' => 'Cannot delete category with menu items'], 422);
        }

        if ($category->image) {
            Storage::disk('public')->delete($category->image);
        }

        $category->delete();

        return response()->json(['success' => true]);
    }

    public function storeItem(Request $request): JsonResponse
    {
        $tenantId = $request->attributes->get('tenant_id');

        $data = $this->validateMenuItem($request);
        $data['tenant_id'] = $tenantId;

        RestaurantMenuCategory::where('tenant_id', $tenantId)->findOrFail($data['category_id']);

        $item = RestaurantMenuItem::create($data);

        if ($request->hasFile('image')) {
            $path = $request->file('image')->store('restaurant-menu/'.$tenantId.'/items', 'public');
            $item->update(['image' => $path]);
        }

        return response()->json($this->formatMenuItem($item->fresh()), 201);
    }

    public function updateItem(Request $request, int $id): JsonResponse
    {
        $tenantId = $request->attributes->get('tenant_id');
        $item = RestaurantMenuItem::where('tenant_id', $tenantId)->findOrFail($id);

        $data = $this->validateMenuItem($request, true);

        if (isset($data['category_id'])) {
            RestaurantMenuCategory::where('tenant_id', $tenantId)->findOrFail($data['category_id']);
        }

        $item->update($data);

        if ($request->hasFile('image')) {
            if ($item->image) {
                Storage::disk('public')->delete($item->image);
            }
            $path = $request->file('image')->store('restaurant-menu/'.$tenantId.'/items', 'public');
            $item->update(['image' => $path]);
        }

        return response()->json($this->formatMenuItem($item->fresh()));
    }

    public function destroyItem(Request $request, int $id): JsonResponse
    {
        $tenantId = $request->attributes->get('tenant_id');
        $item = RestaurantMenuItem::where('tenant_id', $tenantId)->findOrFail($id);

        if ($item->image) {
            Storage::disk('public')->delete($item->image);
        }

        $item->delete();

        return response()->json(['success' => true]);
    }

    /** @return array<string, mixed> */
    private function formatCategory(RestaurantMenuCategory $category): array
    {
        return [
            'id' => $category->id,
            'name' => $category->name,
            'name_en' => $category->name_en,
            'icon' => $category->icon,
            'image_url' => $category->image_url,
            'sort_order' => $category->sort_order,
        ];
    }

    /** @return array<string, mixed> */
    private function validateCategory(Request $request, bool $partial = false): array
    {
        $data = $request->validate([
            'name' => [$partial ? 'sometimes' : 'required', 'string', 'max:255'],
            'name_en' => ['nullable', 'string', 'max:255'],
            'icon' => ['nullable', 'string', 'max:50'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
            'image' => ['nullable', 'image', 'mimes:jpeg,png,jpg,gif,webp', 'max:4096'],
        ]);

        unset($data['image']);

        return $data;
    }

    /** @return array<string, mixed> */
    private function formatMenuItem(RestaurantMenuItem $item): array
    {
        return [
            'id' => $item->id,
            'category_id' => $item->category_id,
            'item_id' => $item->item_id,
            'name' => $item->name,
            'name_en' => $item->name_en,
            'description' => $item->description,
            'description_en' => $item->description_en,
            'price' => (float) $item->price,
            'original_price' => $item->original_price !== null ? (float) $item->original_price : null,
            'image_url' => $item->image_url,
            'emoji' => $item->emoji,
            'is_available' => $item->is_available,
            'allergens' => $item->allergens ?? [],
            'calories' => $item->calories,
            'sort_order' => $item->sort_order,
        ];
    }

    /** @return array<string, mixed> */
    private function validateMenuItem(Request $request, bool $partial = false): array
    {
        $rules = [
            'category_id' => [$partial ? 'sometimes' : 'required', 'integer', 'exists:restaurant_menu_categories,id'],
            'item_id' => ['nullable', 'integer', 'exists:items,id'],
            'name' => [$partial ? 'sometimes' : 'required', 'string', 'max:255'],
            'name_en' => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'description_en' => ['nullable', 'string'],
            'price' => [$partial ? 'sometimes' : 'required', 'numeric', 'min:0'],
            'original_price' => ['nullable', 'numeric', 'min:0'],
            'emoji' => ['nullable', 'string', 'max:16'],
            'is_available' => ['nullable', 'boolean'],
            'allergens' => ['nullable', 'array'],
            'calories' => ['nullable', 'integer', 'min:0'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
            'image' => ['nullable', 'image', 'mimes:jpeg,png,jpg,gif,webp', 'max:4096'],
        ];

        return $request->validate($rules);
    }
}
