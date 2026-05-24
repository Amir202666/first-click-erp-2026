<?php

namespace Tests\Feature;

use App\Models\ItemUnit;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\TenantTestHelpers;
use Tests\TestCase;

class ItemUnitsIsolationTest extends TestCase
{
    use RefreshDatabase;
    use TenantTestHelpers;

    public function test_item_units_index_is_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);
        Sanctum::actingAs($userA);

        ItemUnit::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'name' => 'Unit A',
            'symbol' => 'a',
            'is_active' => true,
        ]);
        ItemUnit::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'name' => 'Unit B',
            'symbol' => 'b',
            'is_active' => true,
        ]);

        $rows = $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/item-units')
            ->assertOk()
            ->json();

        $names = array_values(array_map(fn ($r) => $r['name'] ?? null, $rows));
        $this->assertContains('Unit A', $names);
        $this->assertNotContains('Unit B', $names);
    }

    public function test_item_unit_update_delete_are_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);
        Sanctum::actingAs($userA);

        $uA = ItemUnit::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'name' => 'Unit A',
            'symbol' => 'a',
            'is_active' => true,
        ]);
        $uB = ItemUnit::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'name' => 'Unit B',
            'symbol' => 'b',
            'is_active' => true,
        ]);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->putJson('/api/item-units/'.$uB->id, ['name' => 'Hacked'])
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->deleteJson('/api/item-units/'.$uB->id)
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->putJson('/api/item-units/'.$uA->id, ['name' => 'Unit A Updated'])
            ->assertOk()
            ->assertJsonPath('name', 'Unit A Updated');
    }
}
