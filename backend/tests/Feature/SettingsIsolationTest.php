<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\TenantSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\TenantTestHelpers;
use Tests\TestCase;

class SettingsIsolationTest extends TestCase
{
    use RefreshDatabase;
    use TenantTestHelpers;

    public function test_settings_index_is_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);
        Sanctum::actingAs($userA);

        TenantSetting::withoutGlobalScopes()->updateOrInsert(
            ['tenant_id' => $tenantA->id, 'key' => 'pos_tax_inclusive'],
            ['value' => '1']
        );
        TenantSetting::withoutGlobalScopes()->updateOrInsert(
            ['tenant_id' => $tenantB->id, 'key' => 'pos_tax_inclusive'],
            ['value' => '0']
        );

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/settings')
            ->assertOk()
            ->assertJsonPath('pos_tax_inclusive', true);
    }

    public function test_settings_update_cannot_override_tenant_from_body(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);
        Sanctum::actingAs($userA);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->putJson('/api/settings', [
                'tenant_id' => $tenantB->id,
                'pos_allow_credit_sales' => true,
            ])
            ->assertStatus(403);
    }
}
