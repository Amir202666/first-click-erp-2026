<?php

namespace Tests\Feature;

use App\Models\Invoice;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\TenantTestHelpers;
use Tests\TestCase;

class InvoicesIsolationTest extends TestCase
{
    use RefreshDatabase;
    use TenantTestHelpers;

    public function test_invoices_index_is_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);
        Sanctum::actingAs($userA);

        Invoice::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'number' => 'INV-000001',
            'type' => 'sales',
            'status' => 'draft',
            'date' => now()->toDateString(),
            'subtotal' => 0,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 0,
            'amount_paid' => 0,
            'balance' => 0,
            'exchange_rate' => 1,
        ]);
        Invoice::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'number' => 'INV-000002',
            'type' => 'sales',
            'status' => 'draft',
            'date' => now()->toDateString(),
            'subtotal' => 0,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 0,
            'amount_paid' => 0,
            'balance' => 0,
            'exchange_rate' => 1,
        ]);

        $json = $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/invoices')
            ->assertOk()
            ->json();

        $rows = $json['data'] ?? [];
        $numbers = array_values(array_map(fn ($r) => $r['number'] ?? null, $rows));

        $this->assertContains('INV-000001', $numbers);
        $this->assertNotContains('INV-000002', $numbers);
    }

    public function test_invoice_show_update_delete_are_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);
        Sanctum::actingAs($userA);

        $invA = Invoice::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'number' => 'INV-000010',
            'type' => 'sales',
            'status' => 'draft',
            'date' => now()->toDateString(),
            'subtotal' => 0,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 0,
            'amount_paid' => 0,
            'balance' => 0,
            'exchange_rate' => 1,
        ]);
        $invB = Invoice::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'number' => 'INV-000011',
            'type' => 'sales',
            'status' => 'draft',
            'date' => now()->toDateString(),
            'subtotal' => 0,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 0,
            'amount_paid' => 0,
            'balance' => 0,
            'exchange_rate' => 1,
        ]);

        // show other tenant => 404
        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/invoices/'.$invB->id)
            ->assertStatus(404);

        // update other tenant => 404
        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->putJson('/api/invoices/'.$invB->id, [
                'type' => 'sales',
                'date' => now()->toDateString(),
                'lines' => [],
            ])
            ->assertStatus(404);

        // delete other tenant => 404
        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->deleteJson('/api/invoices/'.$invB->id)
            ->assertStatus(404);

        // show own tenant => ok
        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/invoices/'.$invA->id)
            ->assertOk()
            ->assertJsonPath('number', 'INV-000010');
    }
}
