<?php

namespace App\Console\Commands;

use App\Models\Account;
use App\Models\Tenant;
use App\Services\ChartOfAccountsTransferService;
use Illuminate\Console\Command;

class ExportChartOfAccounts extends Command
{
    protected $signature = 'accounts:export-chart
                            {--tenant= : معرف الشركة}
                            {--slug= : معرف الشركة المختصر}
                            {--output= : مسار ملف JSON}';

    protected $description = 'تصدير دليل الحسابات (JSON) للنقل من محلي إلى سيرفر';

    public function handle(ChartOfAccountsTransferService $service): int
    {
        $tenant = $this->resolveTenant();
        if (! $tenant) {
            $this->error('حدّد الشركة: --tenant=2 أو --slug=first-company');

            return self::FAILURE;
        }

        $count = Account::where('tenant_id', $tenant->id)->count();
        $output = $this->option('output')
            ?? storage_path('app/exports/chart_'.$tenant->slug.'_'.now()->format('Ymd_His').'.json');

        $this->info("الشركة: {$tenant->name} (id: {$tenant->id}, slug: {$tenant->slug})");
        $this->info("حسابات حالية: {$count}");

        $exported = $service->exportToFile((int) $tenant->id, $output);

        $this->newLine();
        $this->info("✅ تم تصدير {$exported} حساباً");
        $this->line("الملف: {$output}");

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
