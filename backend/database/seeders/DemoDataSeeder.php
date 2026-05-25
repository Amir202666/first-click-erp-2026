<?php

namespace Database\Seeders;

use App\Models\Subscription;
use App\Models\SubscriptionPlan;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DemoDataSeeder extends Seeder
{
    public function run(): void
    {
        $user = User::firstOrCreate(
            ['email' => 'admin@firstclick.com'],
            [
                'name' => 'مدير النظام',
                'password' => Hash::make('password123'),
            ]
        );

        $tenant = Tenant::updateOrCreate(
            ['slug' => 'first-company'],
            [
                'name' => 'الشركة التجريبية',
                'email' => 'admin@firstclick.com',
                'activity' => 'commercial',
                'is_active' => true,
                'default_currency' => 'SAR',
                'vat_enabled' => true,
                'vat_rate' => 15.00,
            ]
        );

        if (! $tenant->users()->where('user_id', $user->id)->exists()) {
            $tenant->users()->attach($user->id, [
                'role' => 'admin',
                'is_active' => true,
            ]);
        }

        (new ChartOfAccountsSeeder)->run($tenant->id);

        (new SubscriptionPlanSeeder)->run();

        $plan = SubscriptionPlan::where('slug', 'advanced')->first()
            ?? SubscriptionPlan::query()->first();

        if ($plan) {
            Subscription::updateOrCreate(
                [
                    'tenant_id' => $tenant->id,
                    'status' => 'active',
                ],
                [
                    'subscription_plan_id' => $plan->id,
                    'starts_at' => now(),
                    // MySQL TIMESTAMP max ≈ 2038-01-19
                    'ends_at' => now()->create(2038, 1, 1, 0, 0, 0),
                    'auto_renew' => true,
                    'amount_paid' => 0,
                    'currency' => 'SAR',
                ]
            );
        }

        $this->command->info('بيانات الدخول للمستخدم التجريبي:');
        $this->command->info('  اسم الشركة: الشركة التجريبية (أو first-company)');
        $this->command->info('  اسم المستخدم: admin@firstclick.com');
        $this->command->info('  كلمة المرور: password123');
    }
}
