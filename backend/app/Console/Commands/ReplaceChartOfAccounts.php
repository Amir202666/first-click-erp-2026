<?php

namespace App\Console\Commands;

use App\Models\Account;
use App\Models\Tenant;
use App\Services\ChartOfAccountsTransferService;
use Illuminate\Console\Command;

class ReplaceChartOfAccounts extends Command
{
    protected $signature = 'accounts:replace-chart
                            {--tenant= : معرف الشركة}
                            {--slug= : معرف الشركة المختصر}
                            {--file= : مسار ملف JSON المُصدَّر من المحلي}
                            {--force : استبدال حتى مع وجود قيود محاسبية}';

    protected $description = 'استبدال دليل الحسابات بالكامل من ملف JSON (يحذف الدليل الحالي)';

    public function handle(ChartOfAccountsTransferService $service): int
    {
        $tenant = $this->resolveTenant();
        if (! $tenant) {
            $this->error('حدّد الشركة: --tenant=2 أو --slug=first-company');

            return self::FAILURE;
        }

        $file = $this->option('file');
        if (! $file) {
            $this->error('حدّد ملف التصدير: --file=storage/app/imports/chart.json');

            return self::FAILURE;
        }

        if (! str_starts_with($file, '/') && ! preg_match('/^[A-Za-z]:\\\\/', $file)) {
            $file = base_path($file);
        }

        $before = Account::where('tenant_id', $tenant->id)->count();
        $this->warn("⚠ سيتم حذف {$before} حساباً حالياً واستبدالها بالملف:");
        $this->line("  {$file}");

        if (! $this->option('force') && ! $this->confirm('هل تريد المتابعة؟', false)) {
            $this->info('تم الإلغاء.');

            return self::SUCCESS;
        }

        try {
            $result = $service->replaceFromFile((int) $tenant->id, $file, (bool) $this->option('force'));
        } catch (\Throwable $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        foreach ($result['warnings'] as $warning) {
            $this->warn($warning);
        }

        if ($result['backup'] !== '') {
            $this->line('نسخة احتياطية للدليل القديم: '.$result['backup']);
        }

        $after = Account::where('tenant_id', $tenant->id)->count();
        $this->newLine();
        $this->info("✅ تم الاستبدال — حُذف {$result['removed']} حساباً، أُدخل {$result['inserted']} حساباً، الإجمالي الآن: {$after}");

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
