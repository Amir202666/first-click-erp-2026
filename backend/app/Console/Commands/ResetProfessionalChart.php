<?php

namespace App\Console\Commands;

use App\Models\Account;
use App\Models\Tenant;
use App\Services\ChartOfAccountsTransferService;
use Illuminate\Console\Command;

class ResetProfessionalChart extends Command
{
    protected $signature = 'accounts:reset-professional
                            {--tenant= : معرف الشركة}
                            {--slug= : معرف الشركة المختصر}
                            {--force : استبدال حتى مع وجود قيود محاسبية}';

    protected $description = 'حذف دليل الحسابات الحالي وزرع الدليل الاحترافي (103 حساب) — بدون رفع ملف';

    public function handle(ChartOfAccountsTransferService $service): int
    {
        $tenant = $this->resolveTenant();
        if (! $tenant) {
            $this->error('حدّد الشركة: --tenant=2 أو --slug=first-company');

            return self::FAILURE;
        }

        $before = Account::where('tenant_id', $tenant->id)->count();
        $this->warn("⚠ سيتم حذف {$before} حساباً واستبدالها بالدليل الاحترافي (103 حساب).");

        if (! $this->option('force') && ! $this->confirm('هل تريد المتابعة؟', false)) {
            $this->info('تم الإلغاء.');

            return self::SUCCESS;
        }

        try {
            $result = $service->resetToProfessionalChart((int) $tenant->id, (bool) $this->option('force'));
        } catch (\Throwable $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        foreach ($result['warnings'] as $warning) {
            $this->warn($warning);
        }

        if ($result['backup'] !== '') {
            $this->line('نسخة احتياطية: '.$result['backup']);
        }

        $after = Account::where('tenant_id', $tenant->id)->count();
        $this->newLine();
        $this->info("✅ تم — حُذف {$result['removed']}، أُدخل {$result['inserted']}، الإجمالي: {$after}");

        return self::SUCCESS;
    }

    private function resolveTenant(): ?Tenant
    {
        if ($this->option('tenant')) {
            return Tenant::find((int) $this->option('tenant'));
        }
        if ($this->option('slug')) {
            return Tenant::where('slug', $this->option('slug'))->first();
        }

        return Tenant::where('slug', 'first-company')->first();
    }
}
