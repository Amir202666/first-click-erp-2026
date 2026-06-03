<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Process;

/**
 * تصدير بيانات MySQL (شركة واحدة أو كامل القاعدة).
 * للنقل الكامل للسيرفر يُفضّل: scripts/export-local-db.bat (mysqldump).
 */
class ExportTenantData extends Command
{
    protected $signature = 'tenant:export
                            {--tenant= : معرف الشركة (tenant_id) — اختياري}
                            {--output= : مسار ملف SQL}
                            {--full : تصدير كامل القاعدة عبر mysqldump}';

    protected $description = 'تصدير بيانات ERP إلى ملف SQL (MySQL)';

    /** جداول التطبيق (بدون migrations/cache) */
    private const EXPORT_TABLES = [
        'subscription_plans',
        'tenants',
        'users',
        'tenant_users',
        'subscriptions',
        'permissions',
        'roles',
        'role_permissions',
        'currencies',
        'branches',
        'cost_centers',
        'payment_methods',
        'accounts',
        'tenant_account_defaults',
        'customer_groups',
        'customers',
        'vendor_groups',
        'vendors',
        'item_categories',
        'item_units',
        'item_brands',
        'items',
        'warehouses',
        'invoices',
        'invoice_lines',
        'journal_entries',
        'journal_entry_lines',
        'payments',
        'inventory_movements',
        'tenant_settings',
        'document_templates',
        'print_templates',
        'fiscal_years',
        'quotations',
        'quotation_lines',
        'purchase_requests',
        'purchase_request_lines',
        'pos_shifts',
        'pos_sessions',
        'invoice_payments',
        'personal_access_tokens',
    ];

    public function handle(): int
    {
        $driver = DB::connection()->getDriverName();
        $output = $this->option('output')
            ?? storage_path('app/exports/export_'.now()->format('Ymd_His').'.sql');

        if ($driver === 'sqlite' && ($this->option('full') || ! $this->option('tenant'))) {
            return $this->exportSqliteFull($output);
        }

        if ($driver !== 'mysql') {
            $this->error('الاتصال الحالي ليس MySQL. للتصدير من SQLite: php artisan tenant:export --full');

            return self::FAILURE;
        }

        $tenantId = $this->option('tenant') ? (int) $this->option('tenant') : null;

        if ($this->option('full') || $tenantId === null) {
            return $this->exportViaMysqldump($output);
        }

        return $this->exportViaPhp($output, $tenantId);
    }

    /** تصدير كامل من SQLite المحلي إلى SQL متوافق مع MySQL (للرفع للسيرفر) */
    private function exportSqliteFull(string $output): int
    {
        $this->info('جاري تصدير SQLite كاملاً إلى SQL (MySQL)...');

        $tables = collect(DB::select(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        ))->pluck('name')->all();

        $sql = "-- First Click ERP — SQLite full export for MySQL import\n";
        $sql .= '-- التاريخ: '.now()->toDateTimeString()."\n\n";
        $sql .= "SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\n\n";

        $bar = $this->output->createProgressBar(count($tables));
        $bar->start();

        foreach ($tables as $table) {
            $rows = DB::table($table)->orderByRaw('1')->get();
            $sql .= "-- {$table}\n";
            $sql .= "DELETE FROM `{$table}`;\n";
            foreach ($rows as $row) {
                $sql .= $this->insertStatement($table, (array) $row);
            }
            $sql .= "\n";
            $bar->advance();
        }

        $sql .= "SET FOREIGN_KEY_CHECKS=1;\n";

        $dir = dirname($output);
        if (! is_dir($dir)) {
            File::makeDirectory($dir, 0755, true);
        }
        file_put_contents($output, $sql);
        $bar->finish();
        $this->newLine(2);
        $this->info("تم التصدير: {$output}");
        $this->info('الحجم: '.round(filesize($output) / 1024, 2).' KB');
        $this->line('ارفع الملف إلى السيرفر كـ db_backup.sql ثم: bash /var/www/erp/deploy/publish-all-online.sh');

        return self::SUCCESS;
    }

    private function exportViaMysqldump(string $output): int
    {
        $cfg = config('database.connections.mysql');
        $dir = dirname($output);
        if (! is_dir($dir)) {
            File::makeDirectory($dir, 0755, true);
        }

        $args = [
            self::resolveMysqldumpBinary(),
            '-h', $cfg['host'] ?? '127.0.0.1',
            '-P', (string) ($cfg['port'] ?? 3306),
            '-u', $cfg['username'] ?? 'root',
            '--single-transaction',
            '--routines',
            '--triggers',
            '--set-charset',
            '--default-character-set=utf8mb4',
            $cfg['database'],
        ];

        $env = [];
        $password = $cfg['password'] ?? '';
        if ($password !== null && $password !== '') {
            $env['MYSQL_PWD'] = $password;
        }

        $this->info('جاري التصدير الكامل عبر mysqldump...');

        $result = Process::timeout(600)->env($env)->run($args);

        if (! $result->successful()) {
            $this->error($result->errorOutput());

            return self::FAILURE;
        }

        file_put_contents($output, $result->output());

        $this->info("تم التصدير: {$output}");
        $this->info('الحجم: '.round(filesize($output) / 1024, 2).' KB');

        return self::SUCCESS;
    }

    private function exportViaPhp(string $output, int $tenantId): int
    {
        $this->info("جاري تصدير بيانات الشركة #{$tenantId}...");

        $sql = "-- First Click ERP export\n";
        $sql .= '-- التاريخ: '.now()->toDateTimeString()."\n";
        $sql .= "-- tenant_id: {$tenantId}\n\n";
        $sql .= "SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\n\n";

        $tables = array_filter(self::EXPORT_TABLES, fn ($t) => Schema::hasTable($t));
        $bar = $this->output->createProgressBar(count($tables));
        $bar->start();

        foreach ($tables as $table) {
            $query = DB::table($table);
            if (Schema::hasColumn($table, 'tenant_id')) {
                $query->where('tenant_id', $tenantId);
            } elseif ($table === 'tenants') {
                $query->where('id', $tenantId);
            } elseif ($table === 'users') {
                $userIds = DB::table('tenant_users')->where('tenant_id', $tenantId)->pluck('user_id');
                $query->whereIn('id', $userIds);
            } elseif ($table === 'tenant_users') {
                $query->where('tenant_id', $tenantId);
            } elseif (in_array($table, ['subscription_plans', 'permissions'], true)) {
                // جداول عامة — تُصدَّر كاملة
            } else {
                $bar->advance();

                continue;
            }

            $rows = $query->get();
            if ($rows->isEmpty()) {
                $bar->advance();

                continue;
            }

            $sql .= "-- {$table}\n";
            foreach ($rows as $row) {
                $sql .= $this->insertStatement($table, (array) $row);
            }
            $sql .= "\n";
            $bar->advance();
        }

        $sql .= "SET FOREIGN_KEY_CHECKS=1;\n";

        $dir = dirname($output);
        if (! is_dir($dir)) {
            File::makeDirectory($dir, 0755, true);
        }
        file_put_contents($output, $sql);
        $bar->finish();
        $this->newLine(2);
        $this->info("تم التصدير: {$output}");
        $this->info('الحجم: '.round(filesize($output) / 1024, 2).' KB');
        $this->warn('للنقل الكامل للسيرفر استخدم mysqldump: scripts/export-local-db.bat');

        return self::SUCCESS;
    }

    private function insertStatement(string $table, array $row): string
    {
        $pdo = DB::connection()->getPdo();
        $cols = array_keys($row);
        $quotedCols = '`'.implode('`, `', $cols).'`';
        $values = [];
        foreach ($row as $value) {
            if ($value === null) {
                $values[] = 'NULL';
            } elseif (is_bool($value)) {
                $values[] = $value ? '1' : '0';
            } elseif (is_int($value) || is_float($value)) {
                $values[] = (string) $value;
            } else {
                $values[] = $pdo->quote((string) $value);
            }
        }

        return 'INSERT INTO `'.$table.'` ('.$quotedCols.') VALUES ('.implode(', ', $values).');'."\n";
    }

    private static function resolveMysqldumpBinary(): string
    {
        $candidates = [
            'C:\\xampp\\mysql\\bin\\mysqldump.exe',
            'C:\\laragon\\bin\\mysql\\mysql-8.4.3-winx64\\bin\\mysqldump.exe',
            'C:\\laragon\\bin\\mysql\\mysql-8.2.0-winx64\\bin\\mysqldump.exe',
        ];

        foreach ($candidates as $path) {
            if (is_file($path)) {
                return $path;
            }
        }

        return 'mysqldump';
    }
}
