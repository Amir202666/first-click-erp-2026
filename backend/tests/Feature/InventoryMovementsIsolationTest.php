<?php

namespace Tests\Feature;

use App\Models\InventoryMovement;
use App\Models\Item;
use App\Models\Tenant;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\TenantTestHelpers;
use Tests\TestCase;

class InventoryMovementsIsolationTest extends TestCase
{
    use RefreshDatabase;
    use TenantTestHelpers;

    public function test_inventory_movements_index_is_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);
        Sanctum::actingAs($userA);

        $itemA = Item::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'code' => 'ITM-A',
            'name' => 'Item A',
            'unit' => 'pcs',
            'type' => 'inventory',
            'cost_price' => 0,
            'selling_price' => 0,
            'min_quantity' => 0,
            'is_active' => true,
            'track_quantity' => true,
        ]);
        $whA = Warehouse::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'name' => 'WH A',
            'code' => 'A',
            'is_active' => true,
        ]);

        $itemB = Item::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'code' => 'ITM-B',
            'name' => 'Item B',
            'unit' => 'pcs',
            'type' => 'inventory',
            'cost_price' => 0,
            'selling_price' => 0,
            'min_quantity' => 0,
            'is_active' => true,
            'track_quantity' => true,
        ]);
        $whB = Warehouse::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'name' => 'WH B',
            'code' => 'B',
            'is_active' => true,
        ]);

        InventoryMovement::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'item_id' => $itemA->id,
            'warehouse_id' => $whA->id,
            'type' => 'adjustment',
            'quantity' => 1,
            'unit_cost' => 0,
            'total_cost' => 0,
            'date' => now()->toDateString(),
            'created_by' => $userA->id,
        ]);
        InventoryMovement::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'item_id' => $itemB->id,
            'warehouse_id' => $whB->id,
            'type' => 'adjustment',
            'quantity' => 1,
            'unit_cost' => 0,
            'total_cost' => 0,
            'date' => now()->toDateString(),
            'created_by' => $userA->id,
        ]);

        $json = $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/inventory/movements')
            ->assertOk()
            ->json();

        $rows = $json['data'] ?? [];
        $tenantIds = array_values(array_unique(array_map(fn ($r) => $r['tenant_id'] ?? null, $rows)));

        $this->assertContains($tenantA->id, $tenantIds);
        $this->assertNotContains($tenantB->id, $tenantIds);
    }
}
