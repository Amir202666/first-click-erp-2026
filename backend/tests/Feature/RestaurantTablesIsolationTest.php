<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\RestaurantTable;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\TenantTestHelpers;
use Tests\TestCase;

class RestaurantTablesIsolationTest extends TestCase
{
    use RefreshDatabase;
    use TenantTestHelpers;

    public function test_restaurant_tables_index_is_tenant_isolated(): void
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

        RestaurantTable::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'branch_id' => $branchA->id,
            'name' => 'TA',
            'status' => 'available',
            'sort_order' => 0,
        ]);
        RestaurantTable::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'branch_id' => $branchB->id,
            'name' => 'TB',
            'status' => 'available',
            'sort_order' => 0,
        ]);

        $rows = $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/restaurant/tables?branch_id='.$branchA->id)
            ->assertOk()
            ->json();

        $names = array_values(array_map(fn ($r) => $r['name'] ?? null, $rows));
        $this->assertContains('TA', $names);
        $this->assertNotContains('TB', $names);
    }

    public function test_restaurant_table_update_delete_are_tenant_isolated(): void
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

        $tA = RestaurantTable::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'branch_id' => $branchA->id,
            'name' => 'TA',
            'status' => 'available',
            'sort_order' => 0,
        ]);
        $tB = RestaurantTable::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'branch_id' => $branchB->id,
            'name' => 'TB',
            'status' => 'available',
            'sort_order' => 0,
        ]);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->putJson('/api/restaurant/tables/'.$tB->id, ['name' => 'Hacked'])
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->deleteJson('/api/restaurant/tables/'.$tB->id)
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->putJson('/api/restaurant/tables/'.$tA->id, [
                'branch_id' => $branchA->id,
                'name' => 'TA Updated',
                'status' => 'available',
            ])
            ->assertOk()
            ->assertJsonPath('name', 'TA Updated');
    }
}
