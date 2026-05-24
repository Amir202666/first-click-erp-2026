<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\TenantTestHelpers;
use Tests\TestCase;

class AccountsIsolationTest extends TestCase
{
    use RefreshDatabase;
    use TenantTestHelpers;

    public function test_accounts_index_is_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);
        Sanctum::actingAs($userA);

        Account::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'code' => '111',
            'name' => 'Cash A',
            'type' => 'asset',
            'level' => 1,
            'is_active' => true,
            'is_postable' => true,
        ]);
        Account::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'code' => '111',
            'name' => 'Cash B',
            'type' => 'asset',
            'level' => 1,
            'is_active' => true,
            'is_postable' => true,
        ]);

        $rows = $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/accounts')
            ->assertOk()
            ->json();

        $names = array_values(array_map(fn ($r) => $r['name'] ?? null, $rows));

        $this->assertContains('Cash A', $names);
        $this->assertNotContains('Cash B', $names);
    }

    public function test_account_show_update_delete_are_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);
        Sanctum::actingAs($userA);

        $accA = Account::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'code' => '200',
            'name' => 'Account A',
            'type' => 'asset',
            'level' => 1,
            'is_active' => true,
            'is_postable' => true,
        ]);
        $accB = Account::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'code' => '201',
            'name' => 'Account B',
            'type' => 'asset',
            'level' => 1,
            'is_active' => true,
            'is_postable' => true,
        ]);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/accounts/'.$accB->id)
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->putJson('/api/accounts/'.$accB->id, ['name' => 'Hacked'])
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->deleteJson('/api/accounts/'.$accB->id)
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->putJson('/api/accounts/'.$accA->id, ['name' => 'Account A Updated'])
            ->assertOk()
            ->assertJsonPath('name', 'Account A Updated');
    }
}
