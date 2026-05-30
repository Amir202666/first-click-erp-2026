<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Artisan;

class ErpFactoryReset extends Command
{
    protected $signature = 'erp:factory-reset
                            {--force : بدون تأكيد (للسكريبتات)}';

    protected $description = 'تصفير كامل — مسح كل البيانات وإعادة الإعداد الافتراضي (محلي أو إنتاج)';

    public function handle(): int
    {
        $this->warn('⚠  سيتم مسح كل بيانات ERP (عملاء، فواتير، حسابات، …) وإعادة الإعداد من الصفر.');
        $this->line('   يُعاد حساب الدخول الوحيد: first-company / firstclick-erp');
        $this->newLine();

        if (! $this->option('force') && ! $this->confirm('هل أنت متأكد؟', false)) {
            $this->info('تم الإلغاء.');

            return self::SUCCESS;
        }

        $this->info('═══ تصفير First Click ERP ═══');

        try {
            Artisan::call('config:clear');
            $this->line('  ✓ config:clear');
        } catch (\Throwable $e) {
            $this->warn('  ⚠ config:clear: '.$e->getMessage());
        }

        $this->warn('  … migrate:fresh');
        Artisan::call('migrate:fresh', ['--force' => true]);
        $this->line('  ✓ migrate:fresh');

        Artisan::call('db:seed', ['--class' => 'OwnerSeeder', '--force' => true]);
        Artisan::call('tenants:seed-defaults');
        $this->line('  ✓ حساب واحد + دليل حسابات + بيانات افتراضية');

        $this->newLine();
        $this->info('═══ بيانات الدخول ═══');
        $this->table(
            ['الحقل', 'القيمة'],
            [
                ['معرف الشركة', 'first-company'],
                ['اسم المستخدم', 'firstclick-erp'],
                ['كلمة المرور', 'FirstClickERP'],
            ]
        );

        $this->newLine();
        $this->info('✅ تم التصفير — ابدأ الإضافة من الأوفلاين ثم ارفع للأونلاين.');

        return self::SUCCESS;
    }
}
