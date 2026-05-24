<?php

use App\Models\Tenant;
use App\Services\InventoryService;
use App\Services\LoyaltyService;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

/**
 * مهمة خلفية: تحديث تنبيهات النواقص لكل شركة بناءً على حد الطلب (min_quantity) لكل صنف.
 * يُنصح بجدولتها (مثلاً كل 15 دقيقة) عبر: php artisan schedule:work أو cron.
 */
Artisan::command('inventory:low-stock-alerts', function () {
    $service = app(InventoryService::class);
    $tenants = Tenant::all();
    $ttlMinutes = (int) (config('inventory.low_stock_cache_ttl', 15));
    $updated = 0;
    foreach ($tenants as $tenant) {
        $alerts = $service->getLowStockAlerts((int) $tenant->id, null, null, null, null);
        Cache::put("low_stock_tenant_{$tenant->id}", $alerts, now()->addMinutes($ttlMinutes));
        $updated++;
    }
    $this->info("تم تحديث تنبيهات النواقص لـ {$updated} شركة.");
})->purpose('تحديث تنبيهات النواقص لكل الشركات (خلفية)');

Artisan::command('inventory:clear-movements', function () {
    $count = DB::table('inventory_movements')->count();
    if ($count === 0) {
        $this->info('لا توجد حركات مخزنية في النظام.');

        return;
    }
    if (! $this->confirm("سيتم حذف جميع الحركات المخزنية ({$count} سجل). هل أنت متأكد؟", false)) {
        $this->warn('تم الإلغاء.');

        return;
    }
    $deleted = DB::table('inventory_movements')->delete();
    $this->info("تم حذف {$deleted} حركة مخزنية.");
})->purpose('حذف جميع الحركات المخزنية من الجدول');

/**
 * إعادة حساب أرصدة الولاء للعملاء من جدول loyalty_points (loyalty_balances + الأعمدة المجمّعة).
 * مثال: php artisan loyalty:recalculate --tenant=1
 */
Artisan::command('loyalty:recalculate {--tenant= : معرّف الشركة (اختياري — كل الشركات إن لم يُحدَّد)}', function () {
    $tenantOpt = $this->option('tenant');
    $service = app(LoyaltyService::class);
    if ($tenantOpt !== null && $tenantOpt !== '') {
        $tenantId = (int) $tenantOpt;
        $n = $service->recalculateCustomerAggregatesFromPoints($tenantId, null);
        $this->info("تمت معالجة {$n} عميلاً للشركة {$tenantId}.");

        return;
    }
    $tenants = Tenant::query()->orderBy('id')->pluck('id');
    $total = 0;
    foreach ($tenants as $tid) {
        $n = $service->recalculateCustomerAggregatesFromPoints((int) $tid, null);
        $total += $n;
        $this->line("Tenant {$tid}: {$n} عميل");
    }
    $this->info("تمت معالجة {$total} سجل عميل إجمالاً.");
})->purpose('إعادة حساب أرصدة الولاء من حركات النقاط');
