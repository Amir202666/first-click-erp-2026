<?php

namespace Database\Seeders;

use App\Models\Account;
use App\Models\Tenant;
use App\Models\TenantAccountDefault;
use Illuminate\Database\Seeder;

/**
 * يملأ إعدادات الحسابات الافتراضية للشريك من دليل الحسابات (حسب الرمز).
 * التشغيل: php artisan db:seed --class=TenantAccountDefaultsSeeder
 */
class TenantAccountDefaultsSeeder extends Seeder
{
    public function run(): void
    {
        $tenantId = 1;
        if (! Tenant::find($tenantId)) {
            $this->command?->warn("Tenant {$tenantId} not found. Skipping.");

            return;
        }

        $byCode = Account::where('tenant_id', $tenantId)->get()->keyBy('code');

        $defaults = TenantAccountDefault::firstOrNew(['tenant_id' => $tenantId]);
        $defaults->cash_account_id = $byCode->get('1111')?->id;
        $defaults->bank_account_id = $byCode->get('1112')?->id;
        $defaults->customers_account_id = $byCode->get('112')?->id;
        $defaults->vendors_account_id = $byCode->get('211')?->id;
        $defaults->inventory_account_id = $byCode->get('113')?->id;
        $defaults->sales_account_id = $byCode->get('41')?->id;
        $defaults->sales_returns_account_id = $byCode->get('41')?->id;
        $defaults->cogs_account_id = $byCode->get('61')?->id;
        $defaults->purchases_account_id = $byCode->get('62')?->id;
        $defaults->discounts_account_id = $byCode->get('64')?->id;
        $defaults->tax_payable_account_id = $byCode->get('213')?->id;
        $defaults->capital_account_id = $byCode->get('31')?->id;
        $defaults->save();

        $this->command?->info('Tenant account defaults set for tenant '.$tenantId);
    }
}
