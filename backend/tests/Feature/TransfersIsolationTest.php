<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\TransferHeader;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\TenantTestHelpers;
use Tests\TestCase;

class TransfersIsolationTest extends TestCase
{
    use RefreshDatabase;
    use TenantTestHelpers;

    public function test_transfers_index_is_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);
        Sanctum::actingAs($userA);

        $whA1 = Warehouse::withoutGlobalScopes()->create(['tenant_id' => $tenantA->id, 'name' => 'A1', 'code' => 'A1', 'is_active' => true]);
        $whA2 = Warehouse::withoutGlobalScopes()->create(['tenant_id' => $tenantA->id, 'name' => 'A2', 'code' => 'A2', 'is_active' => true]);
        $whB1 = Warehouse::withoutGlobalScopes()->create(['tenant_id' => $tenantB->id, 'name' => 'B1', 'code' => 'B1', 'is_active' => true]);
        $whB2 = Warehouse::withoutGlobalScopes()->create(['tenant_id' => $tenantB->id, 'name' => 'B2', 'code' => 'B2', 'is_active' => true]);

        TransferHeader::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'number' => 'TR-000001',
            'from_warehouse_id' => $whA1->id,
            'to_warehouse_id' => $whA2->id,
            'status' => 'draft',
            'date' => now()->toDateString(),
        ]);
        TransferHeader::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'number' => 'TR-000002',
            'from_warehouse_id' => $whB1->id,
            'to_warehouse_id' => $whB2->id,
            'status' => 'draft',
            'date' => now()->toDateString(),
        ]);

        $json = $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/transfers')
            ->assertOk()
            ->json();

        $rows = $json['data'] ?? [];
        $numbers = array_values(array_map(fn ($r) => $r['number'] ?? null, $rows));
        $this->assertContains('TR-000001', $numbers);
        $this->assertNotContains('TR-000002', $numbers);
    }

    public function test_transfer_show_update_delete_are_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);
        Sanctum::actingAs($userA);

        $whA1 = Warehouse::withoutGlobalScopes()->create(['tenant_id' => $tenantA->id, 'name' => 'A1', 'code' => 'A1', 'is_active' => true]);
        $whA2 = Warehouse::withoutGlobalScopes()->create(['tenant_id' => $tenantA->id, 'name' => 'A2', 'code' => 'A2', 'is_active' => true]);
        $whB1 = Warehouse::withoutGlobalScopes()->create(['tenant_id' => $tenantB->id, 'name' => 'B1', 'code' => 'B1', 'is_active' => true]);
        $whB2 = Warehouse::withoutGlobalScopes()->create(['tenant_id' => $tenantB->id, 'name' => 'B2', 'code' => 'B2', 'is_active' => true]);

        $trA = TransferHeader::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'number' => 'TR-000010',
            'from_warehouse_id' => $whA1->id,
            'to_warehouse_id' => $whA2->id,
            'status' => 'draft',
            'date' => now()->toDateString(),
        ]);
        $trB = TransferHeader::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'number' => 'TR-000011',
            'from_warehouse_id' => $whB1->id,
            'to_warehouse_id' => $whB2->id,
            'status' => 'draft',
            'date' => now()->toDateString(),
        ]);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/transfers/'.$trB->id)
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->putJson('/api/transfers/'.$trB->id, ['notes' => 'x'])
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->deleteJson('/api/transfers/'.$trB->id)
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/transfers/'.$trA->id)
            ->assertOk()
            ->assertJsonPath('number', 'TR-000010');
    }
}
