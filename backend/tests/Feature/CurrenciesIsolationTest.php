<?php

namespace Tests\Feature;

use App\Models\Currency;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\TenantTestHelpers;
use Tests\TestCase;

class CurrenciesIsolationTest extends TestCase
{
    use RefreshDatabase;
    use TenantTestHelpers;

    public function test_currencies_index_is_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);
        Sanctum::actingAs($userA);

        Currency::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'code' => 'AAA',
            'name' => 'Curr A',
            'exchange_rate' => 1,
            'decimal_places' => 2,
            'is_active' => true,
            'is_default' => false,
        ]);
        Currency::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'code' => 'BBB',
            'name' => 'Curr B',
            'exchange_rate' => 1,
            'decimal_places' => 2,
            'is_active' => true,
            'is_default' => false,
        ]);

        $rows = $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/currencies')
            ->assertOk()
            ->json();

        $codes = array_values(array_map(fn ($r) => $r['code'] ?? null, $rows));
        $this->assertContains('AAA', $codes);
        $this->assertNotContains('BBB', $codes);
    }

    public function test_currency_update_delete_are_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);
        Sanctum::actingAs($userA);

        $curA = Currency::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'code' => 'AAC',
            'name' => 'Curr A',
            'exchange_rate' => 1,
            'decimal_places' => 2,
            'is_active' => true,
            'is_default' => false,
        ]);
        $curB = Currency::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'code' => 'BBC',
            'name' => 'Curr B',
            'exchange_rate' => 1,
            'decimal_places' => 2,
            'is_active' => true,
            'is_default' => false,
        ]);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->putJson('/api/currencies/'.$curB->id, ['name' => 'Hacked'])
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->deleteJson('/api/currencies/'.$curB->id)
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->putJson('/api/currencies/'.$curA->id, ['name' => 'Curr A Updated'])
            ->assertOk()
            ->assertJsonPath('name', 'Curr A Updated');
    }
}
