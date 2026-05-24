<?php

namespace Tests\Feature;

use App\Models\HrAdministration;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\TenantTestHelpers;
use Tests\TestCase;

class TenantIsolationTest extends TestCase
{
    use RefreshDatabase;
    use TenantTestHelpers;

    public function test_missing_tenant_header_is_rejected(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->getJson('/api/hr/administrations')
            ->assertStatus(422);
    }

    public function test_user_cannot_access_other_tenant(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $user = User::factory()->create();
        $this->attachUserToTenant($user, $tenantA);

        Sanctum::actingAs($user);

        $this->withHeader('X-Tenant-ID', (string) $tenantB->id)
            ->getJson('/api/hr/administrations')
            ->assertStatus(403);
    }

    public function test_list_endpoints_do_not_leak_records_across_tenants(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);

        HrAdministration::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'name' => 'Admin A',
            'status' => 'active',
        ]);
        HrAdministration::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'name' => 'Admin B',
            'status' => 'active',
        ]);

        Sanctum::actingAs($userA);

        $res = $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/hr/administrations')
            ->assertOk()
            ->json();

        // supports either [{...}] or {data:[...]} shapes.
        $rows = is_array($res) && array_key_exists('data', $res) ? $res['data'] : $res;
        $names = array_values(array_map(fn ($r) => $r['name'] ?? null, $rows));

        $this->assertContains('Admin A', $names);
        $this->assertNotContains('Admin B', $names);
    }

    public function test_tenant_id_in_query_or_body_cannot_override_header(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $user = User::factory()->create();
        $this->attachUserToTenant($user, $tenantA);

        Sanctum::actingAs($user);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/hr/administrations?tenant_id='.$tenantB->id)
            ->assertStatus(403);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->postJson('/api/hr/administrations', [
                'tenant_id' => $tenantB->id,
                'name' => 'Should not pass',
                'status' => 'active',
            ])
            ->assertStatus(403);
    }
}
