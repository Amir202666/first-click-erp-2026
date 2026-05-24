<?php

namespace Tests\Feature;

use App\Models\PurchaseRequest;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\TenantTestHelpers;
use Tests\TestCase;

class PurchaseRequestsIsolationTest extends TestCase
{
    use RefreshDatabase;
    use TenantTestHelpers;

    public function test_purchase_requests_index_is_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);
        Sanctum::actingAs($userA);

        PurchaseRequest::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'number' => 'PR-000001',
            'date' => now()->toDateString(),
        ]);
        PurchaseRequest::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'number' => 'PR-000002',
            'date' => now()->toDateString(),
        ]);

        $json = $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/purchase-requests')
            ->assertOk()
            ->json();

        $rows = $json['data'] ?? [];
        $numbers = array_values(array_map(fn ($r) => $r['number'] ?? null, $rows));
        $this->assertContains('PR-000001', $numbers);
        $this->assertNotContains('PR-000002', $numbers);
    }

    public function test_purchase_request_show_update_delete_are_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);
        Sanctum::actingAs($userA);

        $prA = PurchaseRequest::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'number' => 'PR-000010',
            'date' => now()->toDateString(),
        ]);
        $prB = PurchaseRequest::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'number' => 'PR-000011',
            'date' => now()->toDateString(),
        ]);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/purchase-requests/'.$prB->id)
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->putJson('/api/purchase-requests/'.$prB->id, [])
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->deleteJson('/api/purchase-requests/'.$prB->id)
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/purchase-requests/'.$prA->id)
            ->assertOk()
            ->assertJsonPath('number', 'PR-000010');
    }
}
