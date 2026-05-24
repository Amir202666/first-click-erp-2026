<?php

namespace Tests\Feature;

use App\Models\ItemCategory;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\TenantTestHelpers;
use Tests\TestCase;

class ItemCategoriesIsolationTest extends TestCase
{
    use RefreshDatabase;
    use TenantTestHelpers;

    public function test_item_categories_index_is_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);
        Sanctum::actingAs($userA);

        ItemCategory::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'code' => 'CAT-A',
            'name' => 'Cat A',
            'is_active' => true,
        ]);
        ItemCategory::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'code' => 'CAT-B',
            'name' => 'Cat B',
            'is_active' => true,
        ]);

        $rows = $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/item-categories')
            ->assertOk()
            ->json();

        $codes = array_values(array_map(fn ($r) => $r['code'] ?? null, $rows));
        $this->assertContains('CAT-A', $codes);
        $this->assertNotContains('CAT-B', $codes);
    }

    public function test_item_category_update_delete_are_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);
        Sanctum::actingAs($userA);

        $cA = ItemCategory::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'code' => 'CAT-A',
            'name' => 'Cat A',
            'is_active' => true,
        ]);
        $cB = ItemCategory::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'code' => 'CAT-B',
            'name' => 'Cat B',
            'is_active' => true,
        ]);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->putJson('/api/item-categories/'.$cB->id, ['name' => 'Hacked'])
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->deleteJson('/api/item-categories/'.$cB->id)
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->putJson('/api/item-categories/'.$cA->id, ['name' => 'Cat A Updated'])
            ->assertOk()
            ->assertJsonPath('name', 'Cat A Updated');
    }
}
