<?php

namespace Tests\Feature;

use App\Models\ItemBrand;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\TenantTestHelpers;
use Tests\TestCase;

class ItemBrandsIsolationTest extends TestCase
{
    use RefreshDatabase;
    use TenantTestHelpers;

    public function test_item_brands_index_is_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);
        Sanctum::actingAs($userA);

        ItemBrand::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'name' => 'Brand A',
            'is_active' => true,
        ]);
        ItemBrand::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'name' => 'Brand B',
            'is_active' => true,
        ]);

        $rows = $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/item-brands')
            ->assertOk()
            ->json();

        $names = array_values(array_map(fn ($r) => $r['name'] ?? null, $rows));
        $this->assertContains('Brand A', $names);
        $this->assertNotContains('Brand B', $names);
    }

    public function test_item_brand_update_delete_are_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);
        Sanctum::actingAs($userA);

        $bA = ItemBrand::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'name' => 'Brand A',
            'is_active' => true,
        ]);
        $bB = ItemBrand::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'name' => 'Brand B',
            'is_active' => true,
        ]);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->putJson('/api/item-brands/'.$bB->id, ['name' => 'Hacked'])
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->deleteJson('/api/item-brands/'.$bB->id)
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->putJson('/api/item-brands/'.$bA->id, ['name' => 'Brand A Updated'])
            ->assertOk()
            ->assertJsonPath('name', 'Brand A Updated');
    }
}
