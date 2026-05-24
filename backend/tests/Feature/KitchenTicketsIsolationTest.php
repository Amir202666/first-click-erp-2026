<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\KitchenTicket;
use App\Models\KitchenTicketLine;
use App\Models\RestaurantTable;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\TenantTestHelpers;
use Tests\TestCase;

class KitchenTicketsIsolationTest extends TestCase
{
    use RefreshDatabase;
    use TenantTestHelpers;

    public function test_kitchen_tickets_index_is_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);
        Sanctum::actingAs($userA);

        $branchA = Branch::withoutGlobalScopes()->create(['tenant_id' => $tenantA->id, 'name' => 'BA', 'code' => 'BA', 'is_active' => true]);
        $branchB = Branch::withoutGlobalScopes()->create(['tenant_id' => $tenantB->id, 'name' => 'BB', 'code' => 'BB', 'is_active' => true]);

        $tableA = RestaurantTable::withoutGlobalScopes()->create(['tenant_id' => $tenantA->id, 'branch_id' => $branchA->id, 'name' => 'TA', 'status' => 'available', 'sort_order' => 0]);
        $tableB = RestaurantTable::withoutGlobalScopes()->create(['tenant_id' => $tenantB->id, 'branch_id' => $branchB->id, 'name' => 'TB', 'status' => 'available', 'sort_order' => 0]);

        KitchenTicket::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'branch_id' => $branchA->id,
            'table_id' => $tableA->id,
            'status' => 'pending',
        ])->lines()->create([
            'item_name' => 'A',
            'quantity' => 1,
        ]);

        KitchenTicket::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'branch_id' => $branchB->id,
            'table_id' => $tableB->id,
            'status' => 'pending',
        ])->lines()->create([
            'item_name' => 'B',
            'quantity' => 1,
        ]);

        $rows = $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/restaurant/kitchen-tickets?branch_id='.$branchA->id)
            ->assertOk()
            ->json();

        $tenantIds = array_values(array_unique(array_map(fn ($r) => $r['tenant_id'] ?? null, $rows)));
        $this->assertContains($tenantA->id, $tenantIds);
        $this->assertNotContains($tenantB->id, $tenantIds);
    }

    public function test_kitchen_ticket_update_status_is_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);
        Sanctum::actingAs($userA);

        $branchA = Branch::withoutGlobalScopes()->create(['tenant_id' => $tenantA->id, 'name' => 'BA', 'code' => 'BA', 'is_active' => true]);
        $branchB = Branch::withoutGlobalScopes()->create(['tenant_id' => $tenantB->id, 'name' => 'BB', 'code' => 'BB', 'is_active' => true]);

        $tableA = RestaurantTable::withoutGlobalScopes()->create(['tenant_id' => $tenantA->id, 'branch_id' => $branchA->id, 'name' => 'TA', 'status' => 'available', 'sort_order' => 0]);
        $tableB = RestaurantTable::withoutGlobalScopes()->create(['tenant_id' => $tenantB->id, 'branch_id' => $branchB->id, 'name' => 'TB', 'status' => 'available', 'sort_order' => 0]);

        $tA = KitchenTicket::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'branch_id' => $branchA->id,
            'table_id' => $tableA->id,
            'status' => 'pending',
        ]);
        $tB = KitchenTicket::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'branch_id' => $branchB->id,
            'table_id' => $tableB->id,
            'status' => 'pending',
        ]);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->patchJson('/api/restaurant/kitchen-tickets/'.$tB->id, ['status' => 'done'])
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->patchJson('/api/restaurant/kitchen-tickets/'.$tA->id, ['status' => 'done'])
            ->assertOk()
            ->assertJsonPath('status', 'done');
    }

    public function test_kitchen_ticket_line_update_is_tenant_isolated(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->seedActiveSubscriptionForTenant($tenantA);
        $this->seedActiveSubscriptionForTenant($tenantB);

        $userA = User::factory()->create();
        $this->attachUserToTenant($userA, $tenantA);
        Sanctum::actingAs($userA);

        $branchA = Branch::withoutGlobalScopes()->create(['tenant_id' => $tenantA->id, 'name' => 'BA', 'code' => 'BA', 'is_active' => true]);
        $branchB = Branch::withoutGlobalScopes()->create(['tenant_id' => $tenantB->id, 'name' => 'BB', 'code' => 'BB', 'is_active' => true]);

        $tableA = RestaurantTable::withoutGlobalScopes()->create(['tenant_id' => $tenantA->id, 'branch_id' => $branchA->id, 'name' => 'TA', 'status' => 'available', 'sort_order' => 0]);
        $tableB = RestaurantTable::withoutGlobalScopes()->create(['tenant_id' => $tenantB->id, 'branch_id' => $branchB->id, 'name' => 'TB', 'status' => 'available', 'sort_order' => 0]);

        $ticketA = KitchenTicket::withoutGlobalScopes()->create([
            'tenant_id' => $tenantA->id,
            'branch_id' => $branchA->id,
            'table_id' => $tableA->id,
            'status' => 'pending',
        ]);
        $lineA = KitchenTicketLine::withoutGlobalScopes()->create([
            'ticket_id' => $ticketA->id,
            'item_name' => 'A',
            'quantity' => 1,
            'is_completed' => false,
        ]);

        $ticketB = KitchenTicket::withoutGlobalScopes()->create([
            'tenant_id' => $tenantB->id,
            'branch_id' => $branchB->id,
            'table_id' => $tableB->id,
            'status' => 'pending',
        ]);
        $lineB = KitchenTicketLine::withoutGlobalScopes()->create([
            'ticket_id' => $ticketB->id,
            'item_name' => 'B',
            'quantity' => 1,
            'is_completed' => false,
        ]);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->patchJson('/api/restaurant/kitchen-tickets/'.$ticketB->id.'/lines/'.$lineB->id, ['is_completed' => true])
            ->assertStatus(404);

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->patchJson('/api/restaurant/kitchen-tickets/'.$ticketA->id.'/lines/'.$lineA->id, ['is_completed' => true])
            ->assertOk()
            ->assertJsonPath('id', $lineA->id);
    }
}
