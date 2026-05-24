<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\PosHeldCart;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\TenantTestHelpers;
use Tests\TestCase;

class PosHeldCartsIsolationTest extends TestCase
{
    use RefreshDatabase;
    use TenantTestHelpers;

    public function test_pos_held_list_is_tenant_isolated(): void
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

        PosHeldCart::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'branch_id' => $branchA->id,
            'user_id' => $userA->id,
            'payload' => ['items' => [['id' => 1]]],
        ]);
        $cartB = PosHeldCart::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'branch_id' => $branchB->id,
            'user_id' => $userA->id,
            'payload' => ['items' => [['id' => 2]]],
        ]);

        $json = $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/pos/hold?branch_id='.$branchA->id)
            ->assertOk()
            ->json();

        $rows = $json['data'] ?? [];
        $ids = array_values(array_map(fn ($r) => $r['id'] ?? null, $rows));
        $this->assertNotContains($cartB->id, $ids);
    }

    public function test_pos_resume_is_tenant_isolated(): void
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

        $cartA = PosHeldCart::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'branch_id' => $branchA->id,
            'user_id' => $userA->id,
            'payload' => ['items' => [['id' => 1]]],
        ]);
        $cartB = PosHeldCart::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'branch_id' => $branchB->id,
            'user_id' => $userA->id,
            'payload' => ['items' => [['id' => 2]]],
        ]);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->postJson('/api/pos/hold/'.$cartB->id.'/resume', ['branch_id' => $branchA->id])
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->postJson('/api/pos/hold/'.$cartA->id.'/resume', ['branch_id' => $branchA->id])
            ->assertOk()
            ->assertJsonPath('payload.items.0.id', 1);
    }
}
