<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Item;
use App\Models\OpeningStockHeader;
use App\Models\Tenant;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\TenantTestHelpers;
use Tests\TestCase;

class OpeningStockIsolationTest extends TestCase
{
    use RefreshDatabase;
    use TenantTestHelpers;

    public function test_opening_stock_index_is_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);
        Sanctum::actingAs($userA);

        $branchA = Branch::withoutGlobalScopes()->create(['tenant_id' => $tenantA->id, 'name' => 'BA', 'code' => 'BA', 'is_active' => true]);
        $whA = Warehouse::withoutGlobalScopes()->create(['tenant_id' => $tenantA->id, 'name' => 'WHA', 'code' => 'WHA', 'is_active' => true]);
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

        $branchB = Branch::withoutGlobalScopes()->create(['tenant_id' => $tenantB->id, 'name' => 'BB', 'code' => 'BB', 'is_active' => true]);
        $whB = Warehouse::withoutGlobalScopes()->create(['tenant_id' => $tenantB->id, 'name' => 'WHB', 'code' => 'WHB', 'is_active' => true]);
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

        OpeningStockHeader::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'branch_id' => $branchA->id,
            'warehouse_id' => $whA->id,
            'date' => now()->toDateString(),
            'status' => 'draft',
            'created_by' => $userA->id,
        ])->items()->create([
            'item_id' => $itemA->id,
            'quantity' => 1,
            'unit_cost' => 10,
            'total_cost' => 10,
        ]);

        OpeningStockHeader::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'branch_id' => $branchB->id,
            'warehouse_id' => $whB->id,
            'date' => now()->toDateString(),
            'status' => 'draft',
            'created_by' => $userA->id,
        ])->items()->create([
            'item_id' => $itemB->id,
            'quantity' => 1,
            'unit_cost' => 10,
            'total_cost' => 10,
        ]);

        $json = $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/opening-stock')
            ->assertOk()
            ->json();

        $rows = $json['data'] ?? [];
        $tenantIds = array_values(array_unique(array_map(fn ($r) => $r['tenant_id'] ?? null, $rows)));
        $this->assertContains($tenantA->id, $tenantIds);
        $this->assertNotContains($tenantB->id, $tenantIds);
    }

    public function test_opening_stock_show_update_delete_are_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);
        Sanctum::actingAs($userA);

        $branchA = Branch::withoutGlobalScopes()->create(['tenant_id' => $tenantA->id, 'name' => 'BA', 'code' => 'BA', 'is_active' => true]);
        $whA = Warehouse::withoutGlobalScopes()->create(['tenant_id' => $tenantA->id, 'name' => 'WHA', 'code' => 'WHA', 'is_active' => true]);
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

        $branchB = Branch::withoutGlobalScopes()->create(['tenant_id' => $tenantB->id, 'name' => 'BB', 'code' => 'BB', 'is_active' => true]);
        $whB = Warehouse::withoutGlobalScopes()->create(['tenant_id' => $tenantB->id, 'name' => 'WHB', 'code' => 'WHB', 'is_active' => true]);
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

        $osA = OpeningStockHeader::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'branch_id' => $branchA->id,
            'warehouse_id' => $whA->id,
            'date' => now()->toDateString(),
            'status' => 'draft',
            'created_by' => $userA->id,
        ]);
        $osA->items()->create(['item_id' => $itemA->id, 'quantity' => 1, 'unit_cost' => 10, 'total_cost' => 10]);

        $osB = OpeningStockHeader::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'branch_id' => $branchB->id,
            'warehouse_id' => $whB->id,
            'date' => now()->toDateString(),
            'status' => 'draft',
            'created_by' => $userA->id,
        ]);
        $osB->items()->create(['item_id' => $itemB->id, 'quantity' => 1, 'unit_cost' => 10, 'total_cost' => 10]);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/opening-stock/'.$osB->id)
            ->assertStatus(404);

        // update route exists as PUT and POST; use PUT and minimal valid payload for own record, but assert 404 for other tenant first.
        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->putJson('/api/opening-stock/'.$osB->id, ['warehouse_id' => $whA->id, 'date' => now()->toDateString(), 'items' => []])
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->deleteJson('/api/opening-stock/'.$osB->id)
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/opening-stock/'.$osA->id)
            ->assertOk()
            ->assertJsonPath('id', $osA->id);
    }
}
