<?php

namespace Tests\Support;

use App\Models\Subscription;
use App\Models\SubscriptionPlan;
use App\Models\Tenant;
use App\Models\User;

trait TenantTestHelpers
{
    protected function attachUserToTenant(User $user, Tenant $tenant, string $role = 'admin'): void
    {
        $user->tenants()->attach($tenant->id, [
            'role' => $role,
            'is_active' => true,
        ]);
    }

    protected function seedActiveSubscriptionForTenant(Tenant $tenant): void
    {
        $plan = SubscriptionPlan::create([
            'name' => 'Test Plan',
            'slug' => 'test-plan-'.uniqid(),
            'price' => 0,
            'currency' => 'SAR',
            'billing_cycle_months' => 12,
            'features' => null, // empty features => allow all routes
            'is_active' => true,
            'sort_order' => 0,
        ]);

        Subscription::create([
            'tenant_id' => $tenant->id,
            'subscription_plan_id' => $plan->id,
            'starts_at' => now()->subDay(),
            'ends_at' => now()->addDays(30),
            'status' => 'active',
            'auto_renew' => true,
            'amount_paid' => 0,
            'currency' => 'SAR',
        ]);
    }
}
