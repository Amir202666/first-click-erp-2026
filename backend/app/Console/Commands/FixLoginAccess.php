<?php

namespace App\Console\Commands;

use Database\Seeders\OwnerSeeder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

class FixLoginAccess extends Command
{
    protected $signature = 'admin:fix-login
                            {--slug=first-company : معرف الشركة للدخول}';

    protected $description = 'إصلاح الدخول: مسح cache، إعادة حساب firstclick-erp، حذف المستخدمين الآخرين';

    public function handle(): int
    {
        $slug = trim((string) $this->option('slug'));

        $this->info('1/3 مسح الكاش...');
        try {
            Artisan::call('cache:clear');
            Artisan::call('config:clear');
            $this->line('   ✓ cache + config cleared');
        } catch (\Throwable $e) {
            $this->warn('   ⚠ '.$e->getMessage());
        }

        $this->info('2/3 إعادة حساب الدخول الوحيد...');
        (new OwnerSeeder)->setCommand($this)->run();

        $tenant = DB::table('tenants')->where('slug', $slug)->first();
        if ($tenant) {
            $this->line("   ✓ الشركة: {$tenant->name} ({$slug})");
        }

        $this->info('3/3 فحص الدخول...');
        $this->call('admin:diagnose-login', [
            'company' => $slug,
            'username' => OwnerSeeder::OWNER_USERNAME,
        ]);

        $this->newLine();
        $this->info('بيانات الدخول:');
        $this->table(
            ['الحقل', 'القيمة'],
            [
                ['معرف الشركة', OwnerSeeder::OWNER_SLUG],
                ['اسم المستخدم', OwnerSeeder::OWNER_USERNAME],
                ['كلمة المرور', OwnerSeeder::OWNER_PASSWORD],
            ]
        );

        return self::SUCCESS;
    }
}
