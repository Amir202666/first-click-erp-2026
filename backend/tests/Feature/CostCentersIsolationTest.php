<?php

namespace Tests\Feature;

use App\Models\CostCenter;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\TenantTestHelpers;
use Tests\TestCase;

class CostCentersIsolationTest extends TestCase
{
    use RefreshDatabase;
    use TenantTestHelpers;

    public function test_cost_centers_index_is_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);
        Sanctum::actingAs($userA);

        CostCenter::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'code' => 'CC-A',
            'name' => 'CC A',
            'is_active' => true,
        ]);
        CostCenter::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'code' => 'CC-B',
            'name' => 'CC B',
            'is_active' => true,
        ]);

        $rows = $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/cost-centers')
            ->assertOk()
            ->json();

        $codes = array_values(array_map(fn ($r) => $r['code'] ?? null, $rows));
        $this->assertContains('CC-A', $codes);
        $this->assertNotContains('CC-B', $codes);
    }

    public function test_cost_center_update_delete_are_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);
        Sanctum::actingAs($userA);

        $ccA = CostCenter::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'code' => 'CC-A',
            'name' => 'CC A',
            'is_active' => true,
        ]);
        $ccB = CostCenter::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'code' => 'CC-B',
            'name' => 'CC B',
            'is_active' => true,
        ]);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->putJson('/api/cost-centers/'.$ccB->id, ['name' => 'Hacked'])
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->deleteJson('/api/cost-centers/'.$ccB->id)
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->putJson('/api/cost-centers/'.$ccA->id, ['name' => 'CC A Updated'])
            ->assertOk()
            ->assertJsonPath('name', 'CC A Updated');
    }
}
