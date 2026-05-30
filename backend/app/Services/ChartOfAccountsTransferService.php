<?php

namespace App\Services;

use App\Models\Account;
use App\Models\Tenant;
use App\Models\TenantAccountDefault;
use Database\Seeders\TenantAccountDefaultsSeeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ChartOfAccountsTransferService
{
    /** أعمدة tenant_account_defaults التي تشير إلى accounts */
    private const DEFAULT_ACCOUNT_COLUMNS = [
        'cash_account_id',
        'bank_account_id',
        'customers_account_id',
        'vendors_account_id',
        'inventory_account_id',
        'sales_account_id',
        'sales_returns_account_id',
        'cogs_account_id',
        'purchases_account_id',
        'discounts_account_id',
        'purchase_discounts_account_id',
        'tax_payable_account_id',
        'capital_account_id',
        'pos_cash_custody_account_id',
        'cash_variance_account_id',
        'installments_receivable_account_id',
        'installments_payable_account_id',
        'inventory_adjustment_gain_account_id',
        'inventory_adjustment_loss_account_id',
    ];

    /**
     * @return array{version: int, exported_at: string, tenant_id: int, tenant_slug: string, accounts: array<int, array<string, mixed>>, account_defaults_by_code: array<string, string|null>}
     */
    public function export(int $tenantId): array
    {
        $tenant = Tenant::findOrFail($tenantId);
        $accounts = Account::where('tenant_id', $tenantId)->orderBy('code')->get();
        $byId = $accounts->keyBy('id');

        $rows = [];
        foreach ($accounts as $account) {
            $parentCode = null;
            if ($account->parent_id) {
                $parentCode = $byId->get($account->parent_id)?->code;
            }

            $rows[] = [
                'code' => $account->code,
                'name' => $account->name,
                'name_en' => $account->name_en,
                'type' => $account->type,
                'parent_code' => $parentCode,
                'level' => $account->level,
                'path' => $account->path,
                'normal_balance' => $account->normal_balance,
                'description' => $account->description,
                'is_system' => (bool) $account->is_system,
                'is_active' => (bool) $account->is_active,
                'is_postable' => (bool) $account->is_postable,
                'is_group' => (bool) $account->is_group,
                'opening_balance' => (string) $account->opening_balance,
                'sort_order' => (int) $account->sort_order,
                'allow_manual_entry' => (bool) $account->allow_manual_entry,
                'currency' => $account->currency,
            ];
        }

        return [
            'version' => 1,
            'exported_at' => now()->toIso8601String(),
            'tenant_id' => $tenantId,
            'tenant_slug' => $tenant->slug,
            'accounts' => $rows,
            'account_defaults_by_code' => $this->exportDefaultsByCode($tenantId, $accounts->pluck('code', 'id')),
        ];
    }

    public function exportToFile(int $tenantId, string $path): int
    {
        $payload = $this->export($tenantId);
        $dir = dirname($path);
        if (! is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        file_put_contents($path, json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));

        return count($payload['accounts']);
    }

    /**
     * @return array{removed: int, inserted: int, backup: string, warnings: array<int, string>}
     */
    public function replaceFromFile(int $tenantId, string $filePath, bool $force = false): array
    {
        if (! is_file($filePath)) {
            throw new \InvalidArgumentException("الملف غير موجود: {$filePath}");
        }

        $payload = json_decode((string) file_get_contents($filePath), true);
        if (! is_array($payload) || empty($payload['accounts']) || ! is_array($payload['accounts'])) {
            throw new \InvalidArgumentException('ملف دليل الحسابات غير صالح.');
        }

        Tenant::findOrFail($tenantId);

        $warnings = [];
        $accountIds = Account::where('tenant_id', $tenantId)->pluck('id');
        $existingCount = $accountIds->count();

        if ($existingCount > 0) {
            $journalLines = 0;
            if (Schema::hasTable('journal_entry_lines')) {
                $journalLines = (int) DB::table('journal_entry_lines')
                    ->whereIn('account_id', $accountIds)
                    ->count();
            }

            if ($journalLines > 0 && ! $force) {
                throw new \RuntimeException(
                    "يوجد {$journalLines} سطر قيد محاسبي مرتبط بالحسابات الحالية. "
                    .'استخدم --force فقط إذا قبلت إعادة ضبط هذه الروابط.'
                );
            }

            if ($journalLines > 0) {
                $warnings[] = "تم فك {$journalLines} سطر قيد من الحسابات القديمة قبل الاستبدال.";
            }
        }

        $backupPath = storage_path('app/exports/chart_backup_t'.$tenantId.'_'.now()->format('Ymd_His').'.json');
        if ($existingCount > 0) {
            $this->exportToFile($tenantId, $backupPath);
        }

        $inserted = 0;

        DB::transaction(function () use ($tenantId, $payload, $accountIds, &$inserted) {
            DB::statement('SET FOREIGN_KEY_CHECKS=0');

            $this->clearAccountReferences($tenantId, $accountIds->all());

            Account::where('tenant_id', $tenantId)->forceDelete();

            $inserted = $this->importAccounts($tenantId, $payload['accounts']);

            app(AccountService::class)->backfillPaths($tenantId);

            $this->restoreDefaultsByCode($tenantId, $payload['account_defaults_by_code'] ?? []);

            DB::statement('SET FOREIGN_KEY_CHECKS=1');
        });

        return [
            'removed' => $existingCount,
            'inserted' => $inserted,
            'backup' => $existingCount > 0 ? $backupPath : '',
            'warnings' => $warnings,
        ];
    }

    /**
     * حذف الدليل الحالي وزرع الدليل الاحترافي (103 حساب) — نفس المحلي بدون رفع ملف.
     *
     * @return array{removed: int, inserted: int, backup: string, warnings: array<int, string>}
     */
    public function resetToProfessionalChart(int $tenantId, bool $force = false): array
    {
        Tenant::findOrFail($tenantId);

        $accountIds = Account::where('tenant_id', $tenantId)->pluck('id');
        $existingCount = $accountIds->count();

        $warnings = [];
        if ($existingCount > 0) {
            $journalLines = 0;
            if (Schema::hasTable('journal_entry_lines')) {
                $journalLines = (int) DB::table('journal_entry_lines')
                    ->whereIn('account_id', $accountIds)
                    ->count();
            }
            if ($journalLines > 0 && ! $force) {
                throw new \RuntimeException(
                    "يوجد {$journalLines} سطر قيد محاسبي. استخدم --force إذا قبلت إعادة الضبط."
                );
            }
            if ($journalLines > 0) {
                $warnings[] = "تم فك {$journalLines} سطر قيد من الحسابات القديمة.";
            }
        }

        $backupPath = '';
        if ($existingCount > 0) {
            $backupPath = storage_path('app/exports/chart_backup_t'.$tenantId.'_'.now()->format('Ymd_His').'.json');
            $this->exportToFile($tenantId, $backupPath);
        }

        $inserted = 0;

        DB::transaction(function () use ($tenantId, $accountIds, &$inserted) {
            DB::statement('SET FOREIGN_KEY_CHECKS=0');

            $this->clearAccountReferences($tenantId, $accountIds->all());
            Account::where('tenant_id', $tenantId)->forceDelete();

            (new \Database\Seeders\DefaultChartOfAccountsSeeder)->run($tenantId);
            $inserted = Account::where('tenant_id', $tenantId)->count();

            app(AccountService::class)->backfillPaths($tenantId);
            (new TenantAccountDefaultsSeeder)->run($tenantId);

            DB::statement('SET FOREIGN_KEY_CHECKS=1');
        });

        return [
            'removed' => $existingCount,
            'inserted' => $inserted,
            'backup' => $backupPath,
            'warnings' => $warnings,
        ];
    }

    /**
     * @param  array<int>  $accountIds
     */
    private function clearAccountReferences(int $tenantId, array $accountIds): void
    {
        if ($accountIds === []) {
            return;
        }

        if (Schema::hasTable('journal_entry_lines')) {
            DB::table('journal_entry_lines')->whereIn('account_id', $accountIds)->delete();
        }

        if (Schema::hasTable('tenant_account_defaults')) {
            $defaults = TenantAccountDefault::where('tenant_id', $tenantId)->first();
            if ($defaults) {
                foreach (self::DEFAULT_ACCOUNT_COLUMNS as $column) {
                    if (Schema::hasColumn('tenant_account_defaults', $column)) {
                        $defaults->{$column} = null;
                    }
                }
                $defaults->save();
            }
        }

        $nullableAccountColumns = [
            ['customers', 'account_id'],
            ['vendors', 'account_id'],
            ['payment_methods', 'linked_account_id'],
            ['invoice_lines', 'account_id'],
            ['payments', 'cash_bank_account_id'],
            ['payments', 'counterpart_account_id'],
            ['fiscal_years', 'retained_earnings_account_id'],
            ['inventory_adjustments', 'target_account_id'],
            ['item_categories', 'sales_account_id'],
            ['item_categories', 'cogs_account_id'],
            ['item_categories', 'inventory_account_id'],
            ['delivery_drivers', 'custody_account_id'],
            ['employees', 'salary_expense_account_id'],
            ['employees', 'salary_payable_account_id'],
            ['employees', 'bank_account_id'],
            ['installments', 'account_id'],
        ];

        foreach ($nullableAccountColumns as [$table, $column]) {
            if (! Schema::hasTable($table) || ! Schema::hasColumn($table, $column)) {
                continue;
            }
            $query = DB::table($table)->whereIn($column, $accountIds);
            if (Schema::hasColumn($table, 'tenant_id')) {
                $query->where('tenant_id', $tenantId);
            }
            $query->update([$column => null]);
        }

        foreach (['account_branch', 'account_cost_center', 'account_user'] as $pivot) {
            if (Schema::hasTable($pivot)) {
                DB::table($pivot)->whereIn('account_id', $accountIds)->delete();
            }
        }
    }

    /**
     * @param  array<int, array<string, mixed>>  $rows
     */
    private function importAccounts(int $tenantId, array $rows): int
    {
        $normalized = [];
        foreach ($rows as $row) {
            $code = trim((string) ($row['code'] ?? ''));
            $name = trim((string) ($row['name'] ?? ''));
            if ($code === '' || $name === '') {
                continue;
            }
            $normalized[] = $row;
        }

        if ($normalized === []) {
            throw new \RuntimeException('لا توجد حسابات صالحة في الملف.');
        }

        $codeSet = [];
        foreach ($normalized as $row) {
            $codeSet[trim((string) $row['code'])] = true;
        }

        $inDegree = [];
        $children = [];
        foreach ($normalized as $row) {
            $code = trim((string) $row['code']);
            $parentCode = trim((string) ($row['parent_code'] ?? ''));
            $inDegree[$code] = $inDegree[$code] ?? 0;
            if ($parentCode !== '' && isset($codeSet[$parentCode])) {
                $inDegree[$code]++;
                $children[$parentCode][] = $code;
            }
        }

        $queue = [];
        foreach ($normalized as $row) {
            $code = trim((string) $row['code']);
            if (($inDegree[$code] ?? 0) === 0) {
                $queue[] = $code;
            }
        }

        $sortedCodes = [];
        while ($queue !== []) {
            $u = array_shift($queue);
            $sortedCodes[] = $u;
            foreach ($children[$u] ?? [] as $v) {
                $inDegree[$v]--;
                if ($inDegree[$v] === 0) {
                    $queue[] = $v;
                }
            }
        }

        if (count($sortedCodes) !== count($normalized)) {
            throw new \RuntimeException('تعذر ترتيب الحسابات — تحقق من parent_code.');
        }

        $byCode = [];
        foreach ($normalized as $row) {
            $byCode[trim((string) $row['code'])] = $row;
        }

        $idByCode = [];
        $now = now();
        $inserted = 0;

        foreach ($sortedCodes as $code) {
            $row = $byCode[$code];
            $parentCode = trim((string) ($row['parent_code'] ?? ''));
            $parentId = ($parentCode !== '' && isset($idByCode[$parentCode])) ? $idByCode[$parentCode] : null;

            $account = Account::create([
                'tenant_id' => $tenantId,
                'parent_id' => $parentId,
                'code' => $code,
                'name' => trim((string) $row['name']),
                'name_en' => ($row['name_en'] ?? null) ?: null,
                'type' => trim((string) ($row['type'] ?? 'asset')),
                'normal_balance' => ($row['normal_balance'] ?? null) ?: null,
                'description' => ($row['description'] ?? null) ?: null,
                'is_system' => (bool) ($row['is_system'] ?? false),
                'is_active' => (bool) ($row['is_active'] ?? true),
                'is_postable' => (bool) ($row['is_postable'] ?? true),
                'is_group' => (bool) ($row['is_group'] ?? false),
                'level' => max(1, (int) ($row['level'] ?? 1)),
                'path' => ($row['path'] ?? null) ?: $code,
                'currency' => ($row['currency'] ?? null) ?: 'SAR',
                'opening_balance' => $row['opening_balance'] ?? 0,
                'sort_order' => (int) ($row['sort_order'] ?? 0),
                'allow_manual_entry' => (bool) ($row['allow_manual_entry'] ?? true),
            ]);

            $idByCode[$code] = $account->id;
            $inserted++;
        }

        return $inserted;
    }

    /**
     * @param  \Illuminate\Support\Collection<int, string>  $codeById
     * @return array<string, string|null>
     */
    private function exportDefaultsByCode(int $tenantId, $codeById): array
    {
        $defaults = TenantAccountDefault::where('tenant_id', $tenantId)->first();
        if (! $defaults) {
            return [];
        }

        $mapped = [];
        foreach (self::DEFAULT_ACCOUNT_COLUMNS as $column) {
            if (! Schema::hasColumn('tenant_account_defaults', $column)) {
                continue;
            }
            $accountId = $defaults->{$column};
            $mapped[$column] = $accountId ? ($codeById->get($accountId) ?? null) : null;
        }

        return $mapped;
    }

    /**
     * @param  array<string, string|null>  $defaultsByCode
     */
    private function restoreDefaultsByCode(int $tenantId, array $defaultsByCode): void
    {
        if ($defaultsByCode === []) {
            (new TenantAccountDefaultsSeeder)->run($tenantId);

            return;
        }

        $byCode = Account::where('tenant_id', $tenantId)->pluck('id', 'code');
        $defaults = TenantAccountDefault::firstOrNew(['tenant_id' => $tenantId]);

        foreach (self::DEFAULT_ACCOUNT_COLUMNS as $column) {
            if (! Schema::hasColumn('tenant_account_defaults', $column)) {
                continue;
            }
            $code = $defaultsByCode[$column] ?? null;
            $defaults->{$column} = ($code && isset($byCode[$code])) ? $byCode[$code] : null;
        }

        $defaults->save();

        // إكمال أي حسابات تشغيلية ناقصة من الرموز الافتراضية
        (new TenantAccountDefaultsSeeder)->run($tenantId);
    }
}
