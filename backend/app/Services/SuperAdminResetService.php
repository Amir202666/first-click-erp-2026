<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class SuperAdminResetService
{
    /** @var array<string, list<string>> */
    private array $moduleMap = [
        'invoices' => ['invoice_lines', 'invoices'],
        'journals' => ['journal_entry_lines', 'journal_entries'],
        'payments' => ['payments'],
        'inventory' => ['inventory_movements'],
        'customers' => ['customers', 'vendors'],
        'items' => ['items'],
        'accounts' => ['accounts'],
    ];

    /** @param list<string> $modules */
    public function preview(int $tenantId, array $modules): array
    {
        $modules = $this->normalizeModules($modules);
        $counts = [];
        foreach ($modules as $module) {
            $counts[$module] = $this->countModule($tenantId, $module);
        }

        return $counts;
    }

    /** @param list<string> $modules */
    public function execute(int $tenantId, array $modules): array
    {
        $modules = $this->normalizeModules($modules);
        $deletedCounts = [];

        DB::transaction(function () use ($tenantId, $modules, &$deletedCounts) {
            $order = ['payments', 'invoices', 'journals', 'inventory', 'customers', 'items', 'accounts'];
            foreach ($order as $module) {
                if (! in_array($module, $modules, true)) {
                    continue;
                }
                $deletedCounts[$module] = $this->deleteModule($tenantId, $module);
            }
        });

        return $deletedCounts;
    }

    public static function expectedConfirmationToken(int $tenantId): string
    {
        return base64_encode($tenantId.'_reset');
    }

    /** @param list<string> $modules */
    private function normalizeModules(array $modules): array
    {
        if (in_array('all', $modules, true)) {
            return array_keys($this->moduleMap);
        }

        return array_values(array_unique(array_filter($modules, fn ($m) => isset($this->moduleMap[$m]))));
    }

    private function countModule(int $tenantId, string $module): int
    {
        $count = 0;
        foreach ($this->moduleMap[$module] as $table) {
            if (! Schema::hasTable($table) || ! Schema::hasColumn($table, 'tenant_id')) {
                continue;
            }
            $count += (int) DB::table($table)->where('tenant_id', $tenantId)->count();
        }

        return $count;
    }

    private function deleteModule(int $tenantId, string $module): int
    {
        $count = 0;
        $tables = $this->moduleMap[$module];
        foreach (array_reverse($tables) as $table) {
            if (! Schema::hasTable($table) || ! Schema::hasColumn($table, 'tenant_id')) {
                continue;
            }
            $count += DB::table($table)->where('tenant_id', $tenantId)->delete();
        }

        return $count;
    }
}
