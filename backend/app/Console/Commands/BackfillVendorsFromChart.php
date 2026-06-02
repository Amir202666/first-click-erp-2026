<?php

namespace App\Console\Commands;

use App\Services\VendorChartSyncService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class BackfillVendorsFromChart extends Command
{
    protected $signature = 'vendors:backfill-from-chart {--tenant= : معرف الشركة}';

    protected $description = 'إنشاء سجلات موردين من حسابات دليل الحسابات تحت حساب الموردين';

    public function handle(VendorChartSyncService $sync): int
    {
        $tenantId = (int) ($this->option('tenant') ?: DB::table('tenants')->value('id'));
        if ($tenantId < 1) {
            $this->error('لا توجد شركة.');

            return self::FAILURE;
        }

        $root = $sync->resolveVendorsRootAccount($tenantId);
        if (! $root) {
            $this->error('لم يُعثر على حساب الموردين الأب (إعدادات الحسابات الأساسية أو 2111).');

            return self::FAILURE;
        }

        $this->info("الشركة: {$tenantId} | حساب الموردين: {$root->code} — {$root->name}");

        $count = $sync->syncMissingVendorsFromChart($tenantId);
        $this->info("✅ تم ربط/إنشاء {$count} مورداً من الدليل.");

        return self::SUCCESS;
    }
}
