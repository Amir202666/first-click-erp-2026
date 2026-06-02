<?php

namespace App\Services;

use App\Models\Account;
use App\Models\TenantAccountDefault;
use App\Models\Vendor;
use Illuminate\Support\Facades\DB;

/**
 * يربط حسابات دليل الحسابات تحت «الموردين» بسجلات جدول vendors
 * حتى تظهر في فواتير المشتريات وقوائم الموردين.
 */
class VendorChartSyncService
{
    public function resolveVendorsRootAccount(int $tenantId): ?Account
    {
        $defaults = TenantAccountDefault::where('tenant_id', $tenantId)->first();
        if ($defaults?->vendors_account_id) {
            $account = Account::where('tenant_id', $tenantId)->find($defaults->vendors_account_id);
            if ($account) {
                return $account;
            }
        }

        foreach (['2111', '211'] as $code) {
            $account = Account::where('tenant_id', $tenantId)->where('code', $code)->first();
            if ($account) {
                return $account;
            }
        }

        return null;
    }

    public function isVendorLedgerAccount(Account $account, ?Account $root = null): bool
    {
        if ($account->is_group || ! $account->is_postable || ! $account->is_active) {
            return false;
        }

        $root ??= $this->resolveVendorsRootAccount((int) $account->tenant_id);
        if (! $root || $account->id === $root->id) {
            return false;
        }

        return $this->isDescendantOfRoot($account, $root);
    }

    /**
     * إنشاء سجل مورد مرتبط بالحساب إن لم يوجد.
     */
    public function ensureVendorForAccount(Account $account, ?int $tenantId = null): ?Vendor
    {
        $tenantId ??= (int) $account->tenant_id;
        if (! $this->isVendorLedgerAccount($account)) {
            return null;
        }

        $existing = Vendor::where('tenant_id', $tenantId)
            ->where('account_id', $account->id)
            ->first();
        if ($existing) {
            return $existing;
        }

        $byName = Vendor::where('tenant_id', $tenantId)
            ->whereNull('account_id')
            ->where('name', $account->name)
            ->first();
        if ($byName) {
            $byName->update(['account_id' => $account->id]);

            return $byName->fresh();
        }

        return Vendor::create([
            'tenant_id' => $tenantId,
            'account_id' => $account->id,
            'name' => $account->name,
            'name_en' => $account->name_en,
            'is_active' => true,
        ]);
    }

    /**
     * مزامنة كل حسابات الموردين في الدليل التي لا تملك سجل vendors.
     *
     * @return int عدد السجلات التي أُنشئت أو رُبطت
     */
    public function syncMissingVendorsFromChart(int $tenantId): int
    {
        $root = $this->resolveVendorsRootAccount($tenantId);
        if (! $root) {
            return 0;
        }

        $linkedAccountIds = Vendor::where('tenant_id', $tenantId)
            ->whereNotNull('account_id')
            ->pluck('account_id')
            ->all();

        $accounts = Account::where('tenant_id', $tenantId)
            ->where('is_group', false)
            ->where('is_postable', true)
            ->where('is_active', true)
            ->get()
            ->filter(fn (Account $a) => $this->isDescendantOfRoot($a, $root));

        $synced = 0;
        foreach ($accounts as $account) {
            if (in_array($account->id, $linkedAccountIds, true)) {
                continue;
            }
            DB::transaction(function () use ($account, &$synced) {
                if ($this->ensureVendorForAccount($account)) {
                    $synced++;
                }
            });
        }

        return $synced;
    }

    private function isDescendantOfRoot(Account $account, Account $root): bool
    {
        if ($account->id === $root->id) {
            return false;
        }

        $rootPath = trim((string) ($root->path ?? $root->code), '/');
        $accountPath = trim((string) ($account->path ?? ''), '/');

        if ($rootPath !== '' && $accountPath !== '') {
            return str_starts_with($accountPath, $rootPath.'/');
        }

        $currentId = $account->parent_id;
        while ($currentId) {
            if ((int) $currentId === (int) $root->id) {
                return true;
            }
            $parent = Account::where('tenant_id', $account->tenant_id)->find($currentId);
            if (! $parent) {
                break;
            }
            $currentId = $parent->parent_id;
        }

        return false;
    }
}
