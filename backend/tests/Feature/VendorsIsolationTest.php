<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Models\Vendor;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\TenantTestHelpers;
use Tests\TestCase;

class VendorsIsolationTest extends TestCase
{
    use RefreshDatabase;
    use TenantTestHelpers;

    public function test_vendors_index_is_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);

        Vendor::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'code' => '1',
            'name' => 'Vendor A',
            'is_active' => true,
        ]);
        Vendor::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'code' => '1',
            'name' => 'Vendor B',
            'is_active' => true,
        ]);

        Sanctum::actingAs($userA);

        $json = $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/vendors')
            ->assertOk()
            ->json();

        $rows = $json['data'] ?? [];
        $names = array_values(array_map(fn ($r) => $r['name'] ?? null, $rows));

        $this->assertContains('Vendor A', $names);
        $this->assertNotContains('Vendor B', $names);
    }

    public function test_vendor_show_update_delete_are_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);

        $vendorA = Vendor::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'code' => '10',
            'name' => 'Vend A',
            'is_active' => true,
        ]);
        $vendorB = Vendor::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'code' => '11',
            'name' => 'Vend B',
            'is_active' => true,
        ]);

        Sanctum::actingAs($userA);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/vendors/'.$vendorB->id)
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->putJson('/api/vendors/'.$vendorB->id, ['name' => 'Hacked'])
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->deleteJson('/api/vendors/'.$vendorB->id)
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->putJson('/api/vendors/'.$vendorA->id, ['name' => 'Vend A Updated'])
            ->assertOk()
            ->assertJsonPath('name', 'Vend A Updated');
    }
}
