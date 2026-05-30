<?php

namespace App\Console\Commands;

use Database\Seeders\OwnerSeeder;
use Database\Seeders\SuperAdminSeeder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

class FixLoginAccess extends Command
{
    protected $signature = 'admin:fix-login
                            {--slug=first-company : معرف الشركة للدخول}';

    protected $description = 'إصلاح فشل تسجيل الدخول: مسح cache، إعادة Super Admin، فحص الربط';

    public function handle(): int
    {
        $slug = trim((string) $this->option('slug'));

        $this->info('1/4 مسح الكاش...');
        try {
            Artisan::call('cache:clear');
            Artisan::call('config:clear');
            $this->line('   ✓ cache + config cleared');
        } catch (\Throwable $e) {
            $this->warn('   ⚠ '.$e->getMessage());
        }

        $this->info('2/4 إنشاء/تحديث Super Admin...');
        (new SuperAdminSeeder)->setCommand($this)->run();

        $tenant = DB::table('tenants')->where('slug', $slug)->first();
        if (! $tenant) {
            $this->warn("   الشركة «{$slug}» غير موجودة — تشغيل OwnerSeeder...");
            (new OwnerSeeder)->setCommand($this)->run();
            $tenant = DB::table('tenants')->where('slug', $slug)->first();
        }

        if ($tenant) {
            $this->line("   ✓ الشركة: {$tenant->name} ({$slug})");
        }

        $this->info('3/4 فحص المستخدمين...');
        $this->call('admin:diagnose-login', [
            'company' => $slug,
            'username' => 'admin@firstclickerp.com',
        ]);

        $this->newLine();
        $this->info('4/4 بيانات الدخول:');
        $this->table(
            ['الحقل', 'القيمة'],
            [
                ['معرف الشركة', $slug],
                ['Super Admin — بريد', 'admin@firstclickerp.com'],
                ['Super Admin — مستخدم', 'firstclick-admin'],
                ['Super Admin — كلمة المرور', 'FirstClick@2026'],
                ['مالك الشركة — مستخدم', 'firstclick-erp'],
                ['مالك الشركة — كلمة المرور', 'FirstClickERP'],
            ]
        );

        $this->newLine();
        $this->comment('إن استمر الفشل: تحقق من Redis في .env أو عطّل REDIS_PASSWORD مؤقتاً');
        $this->comment('nginx rate limit: راجع /var/log/nginx/firstclick-error.log');

        return self::SUCCESS;
    }
}
