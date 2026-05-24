<?php

namespace Database\Seeders;

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

        $this->command->info('بيانات الدخول للمستخدم التجريبي:');
        $this->command->info('  اسم الشركة: الشركة التجريبية (أو first-company)');
        $this->command->info('  اسم المستخدم: admin@firstclick.com');
        $this->command->info('  كلمة المرور: password123');
    }
}
