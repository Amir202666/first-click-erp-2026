<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\TenantTestHelpers;
use Tests\TestCase;

class BranchesIsolationTest extends TestCase
{
    use RefreshDatabase;
    use TenantTestHelpers;

    public function test_branches_index_is_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);
        Sanctum::actingAs($userA);

        Branch::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'name' => 'Branch A',
            'code' => 'A',
            'is_active' => true,
        ]);
        Branch::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'name' => 'Branch B',
            'code' => 'B',
            'is_active' => true,
        ]);

        $rows = $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/branches')
            ->assertOk()
            ->json();

        $names = array_values(array_map(fn ($r) => $r['name'] ?? null, $rows));

        $this->assertContains('Branch A', $names);
        $this->assertNotContains('Branch B', $names);
    }

    public function test_branch_update_delete_are_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);
        Sanctum::actingAs($userA);

        $branchA = Branch::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'name' => 'Branch A',
            'code' => 'A',
            'is_active' => true,
        ]);
        $branchB = Branch::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'name' => 'Branch B',
            'code' => 'B',
            'is_active' => true,
        ]);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->putJson('/api/branches/'.$branchB->id, ['name' => 'Hacked'])
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->deleteJson('/api/branches/'.$branchB->id)
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->putJson('/api/branches/'.$branchA->id, ['name' => 'Branch A Updated'])
            ->assertOk()
            ->assertJsonPath('name', 'Branch A Updated');
    }
}
