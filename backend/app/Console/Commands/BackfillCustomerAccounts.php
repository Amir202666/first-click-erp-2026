<?php

namespace App\Console\Commands;

use App\Models\Account;
use App\Models\Customer;
use App\Models\TenantAccountDefault;
use App\Services\AccountService;
use App\Services\CustomerWizardImportService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class BackfillCustomerAccounts extends Command
{
    protected $signature = 'customers:backfill-accounts
                            {--tenant= : معرف الشركة}
                            {--parent= : معرف حساب العملاء الأب (اختياري)}';

    protected $description = 'إنشاء حسابات دليل مفقودة للعملاء الذين ليس لديهم account_id';

    public function handle(AccountService $accountService): int
    {
        $tenantId = (int) ($this->option('tenant') ?: DB::table('tenants')->value('id'));
        if ($tenantId < 1) {
            $this->error('لا توجد شركة.');

            return self::FAILURE;
        }

        $parentId = (int) ($this->option('parent') ?: 0);
        if ($parentId < 1) {
            $defaults = TenantAccountDefault::where('tenant_id', $tenantId)->first();
            $parentId = (int) ($defaults?->customers_account_id ?? 0);
        }
        if ($parentId < 1) {
            $parentId = (int) Account::where('tenant_id', $tenantId)
                ->whereIn('code', ['1121', '113'])
                ->orderBy('code')
                ->value('id');
        }

        $parent = Account::where('tenant_id', $tenantId)->find($parentId);
        if (! $parent) {
            $this->error('لم يُعثر على حساب العملاء الأب — استخدم --parent=ID');

            return self::FAILURE;
        }

        $this->info("الشركة: {$tenantId} | الحساب الأب: {$parent->code} — {$parent->name}");

        $customers = Customer::where('tenant_id', $tenantId)->whereNull('account_id')->get();
        if ($customers->isEmpty()) {
            $this->info('✓ كل العملاء لديهم حسابات.');

            return self::SUCCESS;
        }

        $service = app(CustomerWizardImportService::class);
        $created = 0;

        foreach ($customers as $customer) {
            try {
                $account = $service->createAccountForCustomer($tenantId, $parent, $customer->name);
                $customer->update(['account_id' => $account->id]);
                $created++;
                $this->line("  ✓ {$customer->name} → {$account->code}");
            } catch (\Throwable $e) {
                $this->warn("  ✗ {$customer->name}: {$e->getMessage()}");
            }
        }

        $accountService->backfillPaths($tenantId);
        $this->info("✅ تم إنشاء {$created} حساب.");

        return self::SUCCESS;
    }
}
