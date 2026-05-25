<?php

namespace Database\Seeders;

use App\Models\Role;
use App\Models\Subscription;
use App\Models\SubscriptionPlan;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * مالك النظام — مستخدم واحد بصلاحية Super Admin مربوط بكل الشركات النشطة.
 */
class SuperAdminSeeder extends Seeder
{
    public const EMAIL = 'admin@firstclickerp.com';

    public const USERNAME = 'firstclick-admin';

    public const PASSWORD = 'FirstClick@2026';

    /**
     * @param  list<int>|null  $tenantIds
     * @param  array{name?: string, email?: string, username?: string, password?: string}|null  $credentials
     */
    public function run(?array $tenantIds = null, ?array $credentials = null): void
    {
        (new SubscriptionPlanSeeder)->run();
        (new RolesSeeder)->run();

        $name = $credentials['name'] ?? 'مالك النظام';
        $email = $credentials['email'] ?? self::EMAIL;
        $username = $credentials['username'] ?? self::USERNAME;
        $password = $credentials['password'] ?? self::PASSWORD;

        // password ضمن نفس عملية الإنشاء — MySQL يرفض INSERT بدون password
        $user = User::updateOrCreate(
            ['email' => $email],
            [
                'name' => $name,
                'username' => $username,
                'password' => $password,
                'is_super_admin' => true,
            ]
        );

        $tenants = $tenantIds
            ? Tenant::whereIn('id', $tenantIds)->get()
            : Tenant::all();

        $plan = SubscriptionPlan::where('slug', 'advanced')->first()
            ?? SubscriptionPlan::query()->orderByDesc('sort_order')->first();

        foreach ($tenants as $tenant) {
            $adminRole = Role::where('tenant_id', $tenant->id)->where('slug', 'admin')->first();

            $tenant->users()->syncWithoutDetaching([
                $user->id => [
                    'role' => 'admin',
                    'role_id' => $adminRole?->id,
                    'is_active' => true,
                ],
            ]);

            if ($plan) {
                Subscription::updateOrCreate(
                    ['tenant_id' => $tenant->id, 'status' => 'active'],
                    [
                        'subscription_plan_id' => $plan->id,
                        'starts_at' => now(),
                        'ends_at' => now()->create(2038, 1, 1, 0, 0, 0),
                        'auto_renew' => true,
                        'amount_paid' => 0,
                        'currency' => $tenant->default_currency ?? 'SAR',
                    ]
                );
            }

            $this->command?->info("  ✓ {$tenant->name} ({$tenant->slug})");
        }

        $this->seedDemoUsers($tenants);

        $this->command?->info('=== Super Admin ===');
        $this->command?->info('  Email: '.$email);
        $this->command?->info('  Username: '.$username);
        $this->command?->info('  Password: '.$password);
        $this->command?->info('  Companies linked: '.$tenants->count());
    }

    private function seedDemoUsers($tenants): void
    {
        User::updateOrCreate(
            ['email' => 'demo@firstclickerp.com'],
            [
                'name' => 'مدير النظام',
                'username' => 'demo-admin',
                'password' => 'Demo@123456',
                'is_super_admin' => false,
            ]
        );

        foreach ($tenants as $tenant) {
            $adminRole = Role::where('tenant_id', $tenant->id)->where('slug', 'admin')->first();
            $tenant->users()->syncWithoutDetaching([
                $demo->id => [
                    'role' => 'admin',
                    'role_id' => $adminRole?->id,
                    'is_active' => true,
                ],
            ]);
        }
    }
}
