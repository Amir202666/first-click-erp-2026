<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\RestaurantSection;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\TenantTestHelpers;
use Tests\TestCase;

class RestaurantSectionsIsolationTest extends TestCase
{
    use RefreshDatabase;
    use TenantTestHelpers;

    public function test_restaurant_sections_index_is_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);
        Sanctum::actingAs($userA);

        $branchA = Branch::withoutGlobalScopes()->create(['tenant_id' => $tenantA->id, 'name' => 'BA', 'code' => 'BA', 'is_active' => true]);
        $branchB = Branch::withoutGlobalScopes()->create(['tenant_id' => $tenantB->id, 'name' => 'BB', 'code' => 'BB', 'is_active' => true]);

        RestaurantSection::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'branch_id' => $branchA->id,
            'name' => 'SA',
            'sort_order' => 0,
        ]);
        RestaurantSection::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'branch_id' => $branchB->id,
            'name' => 'SB',
            'sort_order' => 0,
        ]);

        $rows = $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/restaurant/sections')
            ->assertOk()
            ->json();

        $names = array_values(array_map(fn ($r) => $r['name'] ?? null, $rows));
        $this->assertContains('SA', $names);
        $this->assertNotContains('SB', $names);
    }

    public function test_restaurant_section_update_delete_are_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);
        Sanctum::actingAs($userA);

        $branchA = Branch::withoutGlobalScopes()->create(['tenant_id' => $tenantA->id, 'name' => 'BA', 'code' => 'BA', 'is_active' => true]);
        $branchB = Branch::withoutGlobalScopes()->create(['tenant_id' => $tenantB->id, 'name' => 'BB', 'code' => 'BB', 'is_active' => true]);

        $sA = RestaurantSection::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'branch_id' => $branchA->id,
            'name' => 'SA',
            'sort_order' => 0,
        ]);
        $sB = RestaurantSection::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'branch_id' => $branchB->id,
            'name' => 'SB',
            'sort_order' => 0,
        ]);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->putJson('/api/restaurant/sections/'.$sB->id, ['name' => 'Hacked'])
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->deleteJson('/api/restaurant/sections/'.$sB->id)
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->putJson('/api/restaurant/sections/'.$sA->id, [
                'branch_id' => $branchA->id,
                'name' => 'SA Updated',
            ])
            ->assertOk()
            ->assertJsonPath('name', 'SA Updated');
    }
}
