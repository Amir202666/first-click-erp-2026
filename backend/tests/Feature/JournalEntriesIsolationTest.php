<?php

namespace Tests\Feature;

use App\Models\JournalEntry;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\TenantTestHelpers;
use Tests\TestCase;

class JournalEntriesIsolationTest extends TestCase
{
    use RefreshDatabase;
    use TenantTestHelpers;

    public function test_journal_entries_index_is_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);
        Sanctum::actingAs($userA);

        JournalEntry::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'number' => 'JE-000001',
            'date' => now()->toDateString(),
            'type' => 'manual',
            'status' => 'draft',
            'total_debit' => 0,
            'total_credit' => 0,
        ]);
        JournalEntry::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'number' => 'JE-000002',
            'date' => now()->toDateString(),
            'type' => 'manual',
            'status' => 'draft',
            'total_debit' => 0,
            'total_credit' => 0,
        ]);

        $json = $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/journal-entries')
            ->assertOk()
            ->json();

        $rows = $json['data'] ?? [];
        $numbers = array_values(array_map(fn ($r) => $r['number'] ?? null, $rows));

        $this->assertContains('JE-000001', $numbers);
        $this->assertNotContains('JE-000002', $numbers);
    }

    public function test_journal_entry_show_update_delete_are_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);
        Sanctum::actingAs($userA);

        $jeA = JournalEntry::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'number' => 'JE-000010',
            'date' => now()->toDateString(),
            'type' => 'manual',
            'status' => 'draft',
            'total_debit' => 0,
            'total_credit' => 0,
        ]);
        $jeB = JournalEntry::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'number' => 'JE-000011',
            'date' => now()->toDateString(),
            'type' => 'manual',
            'status' => 'draft',
            'total_debit' => 0,
            'total_credit' => 0,
        ]);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/journal-entries/'.$jeB->id)
            ->assertStatus(404);

        // update requires lines; we only assert that other-tenant returns 404 before validation matters.
        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->putJson('/api/journal-entries/'.$jeB->id, [])
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->deleteJson('/api/journal-entries/'.$jeB->id)
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/journal-entries/'.$jeA->id)
            ->assertOk()
            ->assertJsonPath('number', 'JE-000010');
    }
}
