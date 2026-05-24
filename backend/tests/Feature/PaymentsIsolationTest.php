<?php

namespace Tests\Feature;

use App\Models\Payment;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\TenantTestHelpers;
use Tests\TestCase;

class PaymentsIsolationTest extends TestCase
{
    use RefreshDatabase;
    use TenantTestHelpers;

    public function test_payments_index_is_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);
        Sanctum::actingAs($userA);

        Payment::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'number' => 'PAY-000001',
            'type' => 'receipt',
            'date' => now()->toDateString(),
            'amount' => 10,
            'status' => 'draft',
        ]);
        Payment::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'number' => 'PAY-000002',
            'type' => 'receipt',
            'date' => now()->toDateString(),
            'amount' => 10,
            'status' => 'draft',
        ]);

        $json = $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/payments')
            ->assertOk()
            ->json();

        $rows = $json['data'] ?? [];
        $numbers = array_values(array_map(fn ($r) => $r['number'] ?? null, $rows));

        $this->assertContains('PAY-000001', $numbers);
        $this->assertNotContains('PAY-000002', $numbers);
    }

    public function test_payment_show_update_delete_are_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);
        Sanctum::actingAs($userA);

        $payA = Payment::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'number' => 'PAY-000010',
            'type' => 'receipt',
            'date' => now()->toDateString(),
            'amount' => 10,
            'status' => 'draft',
        ]);
        $payB = Payment::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'number' => 'PAY-000011',
            'type' => 'receipt',
            'date' => now()->toDateString(),
            'amount' => 10,
            'status' => 'draft',
        ]);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/payments/'.$payB->id)
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->putJson('/api/payments/'.$payB->id, ['notes' => 'x'])
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->deleteJson('/api/payments/'.$payB->id)
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/payments/'.$payA->id)
            ->assertOk()
            ->assertJsonPath('number', 'PAY-000010');
    }
}
