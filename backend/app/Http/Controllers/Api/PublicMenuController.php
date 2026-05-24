<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\KitchenTicket;
use App\Models\KitchenTicketLine;
use App\Models\RestaurantMenuItem;
use App\Models\RestaurantMenuSetting;
use App\Models\RestaurantOrder;
use App\Models\RestaurantOrderLine;
use App\Models\RestaurantTable;
use App\Models\Tenant;
use App\Models\Warehouse;
use App\Support\TenantBranding;
use App\Support\TenantDefaultCurrency;
use App\Services\TenantSettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PublicMenuController extends Controller
{
    public function show(string $slug): JsonResponse
    {
        $tenant = Tenant::where('slug', $slug)->where('is_active', true)->firstOrFail();

        $settings = RestaurantMenuSetting::where('tenant_id', $tenant->id)->first();
        if ($settings && ! $settings->is_published) {
            return response()->json(['message' => 'Menu is not available'], 404);
        }

        $primaryColor = $settings->primary_color ?? '#10b981';
        $serviceCharge = $settings->service_charge_percent ?? 10;

        $categories = \App\Models\RestaurantMenuCategory::where('tenant_id', $tenant->id)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        $items = RestaurantMenuItem::where('tenant_id', $tenant->id)
            ->where('is_available', true)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        return response()->json([
            'restaurant' => [
                'name' => TenantBranding::companyName($tenant),
                'name_en' => TenantBranding::companyNameEn($tenant),
                'logo_url' => TenantBranding::companyLogoUrl($tenant),
                'cover_url' => $settings?->cover_image ? asset('storage/'.$settings->cover_image) : null,
                ...TenantDefaultCurrency::forApi($tenant),
                'service_charge_percent' => $serviceCharge,
                'primary_color' => $primaryColor,
                'slug' => $tenant->slug,
            ],
            'categories' => $categories->map(fn ($c) => [
                'id' => $c->id,
                'name' => $c->name,
                'name_en' => $c->name_en,
                'icon' => $c->icon,
                'image_url' => $c->image_url,
                'sort_order' => $c->sort_order,
            ])->values(),
            'items' => $items->map(fn (RestaurantMenuItem $i) => [
                'id' => $i->id,
                'category_id' => $i->category_id,
                'name' => $i->name,
                'name_en' => $i->name_en,
                'description' => $i->description,
                'description_en' => $i->description_en,
                'price' => (float) $i->price,
                'original_price' => $i->original_price !== null ? (float) $i->original_price : null,
                'image_url' => $i->image_url,
                'emoji' => $i->emoji,
                'is_available' => $i->is_available,
                'allergens' => $i->allergens ?? [],
                'calories' => $i->calories,
            ])->values(),
        ]);
    }

    public function placeOrder(Request $request, string $slug): JsonResponse
    {
        $tenant = Tenant::where('slug', $slug)->where('is_active', true)->firstOrFail();
        $tenantId = $tenant->id;

        $data = $request->validate([
            'tenant_slug' => ['required', 'string'],
            'table_number' => ['required', 'integer', 'min:1'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.item_id' => ['required', 'integer'],
            'items.*.quantity' => ['required', 'integer', 'min:1'],
            'items.*.notes' => ['nullable', 'string', 'max:500'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'lang' => ['nullable', 'in:ar,en'],
        ]);

        if ($data['tenant_slug'] !== $slug) {
            return response()->json(['message' => 'Invalid tenant slug'], 422);
        }

        $settings = RestaurantMenuSetting::where('tenant_id', $tenantId)->first();
        if ($settings && ! $settings->is_published) {
            return response()->json(['message' => 'Menu is not available'], 404);
        }

        [$branchId, $warehouseId] = $this->resolveBranchAndWarehouse($tenantId);

        if (! $branchId || ! $warehouseId) {
            return response()->json(['message' => 'Restaurant branch/warehouse not configured'], 422);
        }

        $table = RestaurantTable::where('tenant_id', $tenantId)
            ->where(function ($q) use ($data) {
                $n = (string) $data['table_number'];
                $q->where('id', $data['table_number'])
                    ->orWhere('code', $n)
                    ->orWhere('name', $n);
            })
            ->first();

        $menuItemIds = collect($data['items'])->pluck('item_id')->unique()->all();
        $menuItems = RestaurantMenuItem::where('tenant_id', $tenantId)
            ->whereIn('id', $menuItemIds)
            ->where('is_available', true)
            ->get()
            ->keyBy('id');

        if ($menuItems->count() !== count($menuItemIds)) {
            return response()->json(['message' => 'Some menu items are unavailable'], 422);
        }

        $isAr = ($data['lang'] ?? 'ar') === 'ar';

        return DB::transaction(function () use ($data, $tenantId, $branchId, $warehouseId, $table, $menuItems, $isAr) {
            $order = RestaurantOrder::create([
                'tenant_id' => $tenantId,
                'branch_id' => $branchId,
                'warehouse_id' => $warehouseId,
                'table_id' => $table?->id,
                'order_type' => 'dine_in',
                'status' => 'sent',
                'date' => now()->toDateString(),
            ]);

            $sortOrder = 0;
            foreach ($data['items'] as $lineInput) {
                /** @var RestaurantMenuItem $menuItem */
                $menuItem = $menuItems->get($lineInput['item_id']);
                $name = $isAr ? $menuItem->name : ($menuItem->name_en ?: $menuItem->name);

                $line = new RestaurantOrderLine([
                    'restaurant_order_id' => $order->id,
                    'item_id' => $menuItem->item_id,
                    'description' => $name,
                    'quantity' => $lineInput['quantity'],
                    'unit_price' => $menuItem->price,
                    'discount_percent' => 0,
                    'tax_percent' => 0,
                    'sort_order' => $sortOrder++,
                ]);
                $line->calculateTotals();
                $line->save();
            }

            $order->load('lines');
            $order->recalculate();

            $ticket = KitchenTicket::create([
                'tenant_id' => $tenantId,
                'branch_id' => $branchId,
                'table_id' => $table?->id,
                'invoice_id' => null,
                'restaurant_order_id' => $order->id,
                'status' => 'pending',
            ]);

            foreach ($data['items'] as $idx => $lineInput) {
                $menuItem = $menuItems->get($lineInput['item_id']);
                $name = $isAr ? $menuItem->name : ($menuItem->name_en ?: $menuItem->name);

                KitchenTicketLine::create([
                    'ticket_id' => $ticket->id,
                    'invoice_line_id' => null,
                    'item_name' => $name,
                    'quantity' => $lineInput['quantity'],
                    'modifiers_text' => null,
                    'kitchen_note' => $lineInput['notes'] ?? ($idx === 0 ? ($data['notes'] ?? null) : null),
                    'is_completed' => false,
                ]);
            }

            if ($table) {
                $table->update(['status' => 'occupied']);
            }

            $estimated = max(10, min(45, $menuItems->count() * 5));

            return response()->json([
                'order_number' => (string) $ticket->id,
                'estimated_minutes' => $estimated,
                'message' => $isAr ? 'تم إرسال طلبك للمطبخ' : 'Your order was sent to the kitchen',
            ], 201);
        });
    }

    public function trackOrder(string $slug, string $orderNumber): JsonResponse
    {
        $tenant = Tenant::where('slug', $slug)->where('is_active', true)->firstOrFail();

        $ticket = KitchenTicket::where('tenant_id', $tenant->id)
            ->where('id', $orderNumber)
            ->with('lines')
            ->firstOrFail();

        $statusMap = [
            'pending' => 'new',
            'in_progress' => 'cooking',
            'ready' => 'ready',
            'done' => 'delivered',
        ];

        return response()->json([
            'order_number' => (string) $ticket->id,
            'status' => $statusMap[$ticket->status] ?? $ticket->status,
            'items' => $ticket->lines->map(fn ($l) => [
                'name' => $l->item_name,
                'quantity' => (float) $l->quantity,
            ])->values(),
        ]);
    }

    /** @return array{0: ?int, 1: ?int} */
    private function resolveBranchAndWarehouse(int $tenantId): array
    {
        $settings = app(TenantSettingsService::class);
        $branchId = $settings->get($tenantId, 'pos_default_branch_id');
        $warehouseId = $settings->get($tenantId, 'pos_default_warehouse_id');

        if (! $branchId) {
            $branchId = Branch::where('tenant_id', $tenantId)->value('id');
        }
        if (! $warehouseId) {
            $warehouseId = Warehouse::where('tenant_id', $tenantId)->value('id');
        }

        return [(int) $branchId ?: null, (int) $warehouseId ?: null];
    }
}
