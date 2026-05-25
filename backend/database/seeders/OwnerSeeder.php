<?php

namespace Database\Seeders;

use App\Models\Account;
use App\Models\Role;
use App\Models\Subscription;
use App\Models\SubscriptionPlan;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

/**
 * حساب مالك النظام — Super Admin + شركة رئيسية + اشتراك دائم.
 */
class OwnerSeeder extends Seeder
{
    public const OWNER_SLUG = 'firstclick-erp';

    public const OWNER_USERNAME = 'firstclick-erp';

    public const OWNER_PASSWORD = 'FirstClickERP';

    public function run(): void
    {
        (new SubscriptionPlanSeeder)->run();
        (new RolesSeeder)->run();

        $user = User::updateOrCreate(
            ['email' => 'owner@firstclick-erp.com'],
            [
                'name' => 'مالك النظام',
                'username' => self::OWNER_USERNAME,
                'password' => Hash::make(self::OWNER_PASSWORD),
                'is_super_admin' => true,
            ]
        );

        $user->forceFill(['is_super_admin' => true])->save();

        $tenant = Tenant::updateOrCreate(
            ['slug' => self::OWNER_SLUG],
            [
                'name' => 'FIRST CLICK ERP',
                'email' => 'owner@firstclick-erp.com',
                'activity' => 'commercial',
                'is_active' => true,
                'default_currency' => 'SAR',
                'vat_enabled' => true,
                'vat_rate' => 15.00,
            ]
        );

        $adminRole = Role::where('tenant_id', $tenant->id)->where('slug', 'admin')->first();

        $tenant->users()->syncWithoutDetaching([
            $user->id => [
                'role' => 'admin',
                'role_id' => $adminRole?->id,
                'is_active' => true,
            ],
        ]);

        if (! Account::where('tenant_id', $tenant->id)->exists()) {
            (new ChartOfAccountsSeeder)->run($tenant->id);
        }

        $plan = SubscriptionPlan::where('slug', 'advanced')->first()
            ?? SubscriptionPlan::query()->orderByDesc('sort_order')->first();

        if ($plan) {
            Subscription::updateOrCreate(
                ['tenant_id' => $tenant->id, 'status' => 'active'],
                [
                    'subscription_plan_id' => $plan->id,
                    'starts_at' => now(),
                    'ends_at' => now()->create(2099, 12, 31, 23, 59, 59),
                    'auto_renew' => true,
                    'amount_paid' => 0,
                    'currency' => 'SAR',
                ]
            );
        }

        $this->command->info('=== حساب مالك النظام (Super Admin) ===');
        $this->command->info('  معرف الشركة: '.self::OWNER_SLUG);
        $this->command->info('  اسم الشركة: FIRST CLICK ERP');
        $this->command->info('  اسم المستخدم: '.self::OWNER_USERNAME);
        $this->command->info('  كلمة المرور: '.self::OWNER_PASSWORD);
        $this->command->info('  صلاحيات: Super Admin + إدارة البرنامج + اشتراك حتى 2099');
    }
}
