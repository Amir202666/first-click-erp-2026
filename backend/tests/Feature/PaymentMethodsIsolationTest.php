<?php

namespace Tests\Feature;

use App\Models\PaymentMethod;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\TenantTestHelpers;
use Tests\TestCase;

class PaymentMethodsIsolationTest extends TestCase
{
    use RefreshDatabase;
    use TenantTestHelpers;

    public function test_payment_methods_index_is_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);
        Sanctum::actingAs($userA);

        PaymentMethod::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'name' => 'PM A',
            'type' => 'cash',
            'is_active' => true,
        ]);
        PaymentMethod::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'name' => 'PM B',
            'type' => 'cash',
            'is_active' => true,
        ]);

        $rows = $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/payment-methods')
            ->assertOk()
            ->json();

        $names = array_values(array_map(fn ($r) => $r['name'] ?? null, $rows));
        $this->assertContains('PM A', $names);
        $this->assertNotContains('PM B', $names);
    }

    public function test_payment_method_show_update_delete_are_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);
        Sanctum::actingAs($userA);

        $pmA = PaymentMethod::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'name' => 'PM A',
            'type' => 'cash',
            'is_active' => true,
        ]);
        $pmB = PaymentMethod::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'name' => 'PM B',
            'type' => 'cash',
            'is_active' => true,
        ]);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/payment-methods/'.$pmB->id)
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->putJson('/api/payment-methods/'.$pmB->id, ['name' => 'Hacked'])
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->deleteJson('/api/payment-methods/'.$pmB->id)
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->putJson('/api/payment-methods/'.$pmA->id, ['name' => 'PM A Updated'])
            ->assertOk()
            ->assertJsonPath('name', 'PM A Updated');
    }
}
