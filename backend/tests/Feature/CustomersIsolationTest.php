<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\TenantTestHelpers;
use Tests\TestCase;

class CustomersIsolationTest extends TestCase
{
    use RefreshDatabase;
    use TenantTestHelpers;

    public function test_customers_index_is_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);

        Customer::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'code' => '1',
            'name' => 'Customer A',
            'is_active' => true,
        ]);
        Customer::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'code' => '1',
            'name' => 'Customer B',
            'is_active' => true,
        ]);

        Sanctum::actingAs($userA);

        $json = $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/customers')
            ->assertOk()
            ->json();

        $rows = $json['data'] ?? [];
        $names = array_values(array_map(fn ($r) => $r['name'] ?? null, $rows));

        $this->assertContains('Customer A', $names);
        $this->assertNotContains('Customer B', $names);
    }

    public function test_customer_show_update_delete_are_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);

        $custA = Customer::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'code' => '10',
            'name' => 'Cust A',
            'is_active' => true,
        ]);
        $custB = Customer::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'code' => '11',
            'name' => 'Cust B',
            'is_active' => true,
        ]);

        Sanctum::actingAs($userA);

        // show other tenant => 404
        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/customers/'.$custB->id)
            ->assertStatus(404);

        // update other tenant => 404
        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->putJson('/api/customers/'.$custB->id, ['name' => 'Hacked'])
            ->assertStatus(404);

        // delete other tenant => 404
        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->deleteJson('/api/customers/'.$custB->id)
            ->assertStatus(404);

        // update own tenant => ok
        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->putJson('/api/customers/'.$custA->id, ['name' => 'Cust A Updated'])
            ->assertOk()
            ->assertJsonPath('name', 'Cust A Updated');
    }
}
