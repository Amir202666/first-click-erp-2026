<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Artisan;

class LocalSetup extends Command
{
    protected $signature = 'local:setup {--fresh : migrate:fresh (يمسح البيانات)}';

    protected $description = 'إعداد كامل للسيرفر المحلي — migrate + seed + Super Admin';

    public function handle(): int
    {
        $this->info('═══ إعداد First Click ERP — محلي ═══');

        try {
            Artisan::call('config:clear');
            $this->line('  ✓ config:clear');
        } catch (\Throwable $e) {
            $this->warn('  ⚠ config:clear: '.$e->getMessage());
        }

        if ($this->option('fresh')) {
            $this->warn('migrate:fresh — سيتم مسح كل البيانات المحلية!');
            Artisan::call('migrate:fresh', ['--force' => true]);
        } else {
            Artisan::call('migrate', ['--force' => true]);
        }
        $this->line('  ✓ migrations');

        Artisan::call('db:seed', ['--class' => 'OwnerSeeder', '--force' => true]);
        Artisan::call('tenants:seed-defaults');
        $this->line('  ✓ حساب واحد + بيانات افتراضية');

        $this->newLine();
        $this->info('═══ بيانات الدخول (محلي = إنتاج) ═══');
        $this->table(
            ['الحقل', 'القيمة'],
            [
                ['معرف الشركة', 'first-company'],
                ['اسم المستخدم', 'firstclick-erp'],
                ['كلمة المرور', 'FirstClickERP'],
            ]
        );
        $this->comment('شغّل: scripts\\local-dev.cmd ثم افتح http://localhost:5173');

        return self::SUCCESS;
    }
}
