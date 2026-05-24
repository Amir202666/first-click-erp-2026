<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\TenantTestHelpers;
use Tests\TestCase;

class WarehousesIsolationTest extends TestCase
{
    use RefreshDatabase;
    use TenantTestHelpers;

    public function test_warehouses_index_is_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);
        Sanctum::actingAs($userA);

        Warehouse::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'name' => 'WH A',
            'code' => 'A',
            'is_active' => true,
        ]);
        Warehouse::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'name' => 'WH B',
            'code' => 'B',
            'is_active' => true,
        ]);

        $json = $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/warehouses')
            ->assertOk()
            ->json();

        $rows = $json['data'] ?? [];
        $names = array_values(array_map(fn ($r) => $r['name'] ?? null, $rows));

        $this->assertContains('WH A', $names);
        $this->assertNotContains('WH B', $names);
    }

    public function test_warehouse_show_update_delete_are_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);
        Sanctum::actingAs($userA);

        $whA = Warehouse::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'name' => 'WH A',
            'code' => 'A',
            'is_active' => true,
        ]);
        $whB = Warehouse::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'name' => 'WH B',
            'code' => 'B',
            'is_active' => true,
        ]);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/warehouses/'.$whB->id)
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->putJson('/api/warehouses/'.$whB->id, ['name' => 'Hacked'])
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->deleteJson('/api/warehouses/'.$whB->id)
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/warehouses/'.$whA->id)
            ->assertOk()
            ->assertJsonPath('name', 'WH A');
    }
}
