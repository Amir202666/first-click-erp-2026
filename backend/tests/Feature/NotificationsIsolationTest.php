<?php

namespace Tests\Feature;

use App\Models\Notification;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\TenantTestHelpers;
use Tests\TestCase;

class NotificationsIsolationTest extends TestCase
{
    use RefreshDatabase;
    use TenantTestHelpers;

    public function test_notifications_index_is_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create(['is_super_admin' => true]);
        $this->attachUserToTenant($userA, $tenantA);
        Sanctum::actingAs($userA);

        Notification::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'type' => Notification::TYPE_STOCK_LOW,
            'title_ar' => 'A',
            'severity' => Notification::SEVERITY_INFO,
        ]);
        Notification::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'type' => Notification::TYPE_STOCK_LOW,
            'title_ar' => 'B',
            'severity' => Notification::SEVERITY_INFO,
        ]);

        $json = $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/notifications')
            ->assertOk()
            ->json();

        $rows = $json['data'] ?? [];
        $titles = array_values(array_map(fn ($r) => $r['title'] ?? null, $rows));
        $this->assertContains('A', $titles);
        $this->assertNotContains('B', $titles);
    }

    public function test_notifications_mark_as_read_is_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create(['is_super_admin' => true]);
        $this->attachUserToTenant($userA, $tenantA);
        Sanctum::actingAs($userA);

        $nA = Notification::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'type' => Notification::TYPE_STOCK_LOW,
            'title_ar' => 'A',
            'severity' => Notification::SEVERITY_INFO,
        ]);
        $nB = Notification::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'type' => Notification::TYPE_STOCK_LOW,
            'title_ar' => 'B',
            'severity' => Notification::SEVERITY_INFO,
        ]);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->postJson('/api/notifications/'.$nB->id.'/read')
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->postJson('/api/notifications/'.$nA->id.'/read')
            ->assertOk()
            ->assertJsonPath('id', $nA->id);
    }
}
