<?php

namespace Tests\Feature;

use App\Models\Item;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\TenantTestHelpers;
use Tests\TestCase;

class ItemsIsolationTest extends TestCase
{
    use RefreshDatabase;
    use TenantTestHelpers;

    public function test_items_index_is_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);
        Sanctum::actingAs($userA);

        Item::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'code' => 'ITM-A',
            'name' => 'Item A',
            'unit' => 'pcs',
            'type' => 'inventory',
            'cost_price' => 0,
            'selling_price' => 0,
            'min_quantity' => 0,
            'is_active' => true,
            'track_quantity' => true,
        ]);
        Item::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'code' => 'ITM-B',
            'name' => 'Item B',
            'unit' => 'pcs',
            'type' => 'inventory',
            'cost_price' => 0,
            'selling_price' => 0,
            'min_quantity' => 0,
            'is_active' => true,
            'track_quantity' => true,
        ]);

        $json = $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/items')
            ->assertOk()
            ->json();

        $rows = $json['data'] ?? [];
        $codes = array_values(array_map(fn ($r) => $r['code'] ?? null, $rows));

        $this->assertContains('ITM-A', $codes);
        $this->assertNotContains('ITM-B', $codes);
    }
}
