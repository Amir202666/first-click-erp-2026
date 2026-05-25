<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;

class SuperAdminBackupService
{
    private string $backupDir;

    public function __construct()
    {
        $this->backupDir = storage_path('app/backups');
        if (! is_dir($this->backupDir)) {
            File::makeDirectory($this->backupDir, 0755, true);
        }
    }

    public function startFullBackup(): array
    {
        $jobId = 'backup_full_'.now()->format('Ymd_His').'_'.Str::random(6);
        $fileName = "{$jobId}.sql.gz";
        $path = $this->backupDir.DIRECTORY_SEPARATOR.$fileName;

        $this->putJob($jobId, [
            'id' => $jobId,
            'scope' => 'full',
            'status' => 'pending',
            'file_name' => $fileName,
            'started_at' => now()->toIso8601String(),
        ]);

        dispatch(function () use ($jobId, $path, $fileName) {
            $this->runFullBackup($jobId, $path, $fileName);
        })->afterResponse();

        return $this->getJob($jobId) ?? ['id' => $jobId, 'status' => 'pending'];
    }

    public function startTenantBackup(int $tenantId, string $tenantName): array
    {
        $jobId = "backup_tenant_{$tenantId}_".now()->format('Ymd_His');
        $fileName = "{$jobId}.sql.gz";
        $path = $this->backupDir.DIRECTORY_SEPARATOR.$fileName;

        $this->putJob($jobId, [
            'id' => $jobId,
            'scope' => 'tenant',
            'tenant_id' => $tenantId,
            'tenant_name' => $tenantName,
            'status' => 'pending',
            'file_name' => $fileName,
            'started_at' => now()->toIso8601String(),
        ]);

        dispatch(function () use ($jobId, $path, $fileName, $tenantId, $tenantName) {
            $this->runTenantBackup($jobId, $path, $fileName, $tenantId, $tenantName);
        })->afterResponse();

        return $this->getJob($jobId) ?? ['id' => $jobId, 'status' => 'pending'];
    }

    public function getJob(string $jobId): ?array
    {
        return Cache::get("backup_job_{$jobId}");
    }

    /** @return array<int, array<string, mixed>> */
    public function listJobs(): array
    {
        $jobs = [];
        foreach (Cache::get('backup_job_index', []) as $jobId) {
            $job = $this->getJob($jobId);
            if ($job && ($job['status'] ?? '') === 'completed') {
                $jobs[] = $job;
            }
        }

        usort($jobs, fn ($a, $b) => strcmp($b['completed_at'] ?? '', $a['completed_at'] ?? ''));

        return $jobs;
    }

    public function deleteJob(string $jobId): void
    {
        $job = $this->getJob($jobId);
        if ($job && ! empty($job['file_name'])) {
            $path = $this->backupDir.DIRECTORY_SEPARATOR.$job['file_name'];
            if (is_file($path)) {
                @unlink($path);
            }
        }
        Cache::forget("backup_job_{$jobId}");
        $index = Cache::get('backup_job_index', []);
        Cache::put('backup_job_index', array_values(array_filter($index, fn ($id) => $id !== $jobId)), 86400 * 30);
    }

    public function resolveDownloadPath(string $jobId): ?string
    {
        $job = $this->getJob($jobId);
        if (! $job || ($job['status'] ?? '') !== 'completed' || empty($job['file_name'])) {
            return null;
        }
        $path = $this->backupDir.DIRECTORY_SEPARATOR.$job['file_name'];

        return is_file($path) ? $path : null;
    }

    private function runFullBackup(string $jobId, string $path, string $fileName): void
    {
        $this->putJob($jobId, array_merge($this->getJob($jobId) ?? [], [
            'status' => 'running',
        ]));

        try {
            if ($this->tryMysqldump($path)) {
                $this->completeJob($jobId, $fileName, 'full');
                return;
            }

            $this->exportDatabaseToGzip($path);
            $this->completeJob($jobId, $fileName, 'full');
        } catch (\Throwable $e) {
            $this->failJob($jobId, $e->getMessage());
        }
    }

    private function runTenantBackup(string $jobId, string $path, string $fileName, int $tenantId, string $tenantName): void
    {
        $this->putJob($jobId, array_merge($this->getJob($jobId) ?? [], [
            'status' => 'running',
            'tenant_id' => $tenantId,
            'tenant_name' => $tenantName,
        ]));

        try {
            $tables = [
                'accounts', 'customers', 'vendors', 'items', 'invoices', 'invoice_lines',
                'journal_entries', 'journal_entry_lines', 'payments', 'inventory_movements',
            ];

            $sql = "-- Tenant backup: {$tenantName} (ID {$tenantId})\n";
            $sql .= 'SET FOREIGN_KEY_CHECKS=0;'."\n\n";

            foreach ($tables as $table) {
                if (! $this->tableHasTenantId($table)) {
                    continue;
                }
                $rows = DB::table($table)->where('tenant_id', $tenantId)->get();
                if ($rows->isEmpty()) {
                    continue;
                }
                $sql .= "\n-- Table: {$table}\n";
                foreach ($rows as $row) {
                    $sql .= $this->rowToInsert($table, (array) $row)."\n";
                }
            }

            $sql .= "\nSET FOREIGN_KEY_CHECKS=1;\n";
            $this->writeGzip($path, $sql);
            $this->completeJob($jobId, $fileName, 'tenant', $tenantId, $tenantName);
        } catch (\Throwable $e) {
            $this->failJob($jobId, $e->getMessage());
        }
    }

    private function tryMysqldump(string $path): bool
    {
        $db = config('database.connections.'.config('database.default'));
        if (($db['driver'] ?? '') !== 'mysql') {
            return false;
        }

        $host = $db['host'] ?? '127.0.0.1';
        $port = $db['port'] ?? '3306';
        $database = $db['database'] ?? '';
        $username = $db['username'] ?? '';
        $password = $db['password'] ?? '';

        $tmpSql = $path.'.tmp.sql';
        $command = sprintf(
            'mysqldump --host=%s --port=%s --user=%s --password=%s --single-transaction %s > %s 2>&1',
            escapeshellarg($host),
            escapeshellarg((string) $port),
            escapeshellarg($username),
            escapeshellarg($password),
            escapeshellarg($database),
            escapeshellarg($tmpSql),
        );

        exec($command, $output, $code);
        if ($code !== 0 || ! is_file($tmpSql)) {
            @unlink($tmpSql);
            return false;
        }

        if (function_exists('gzopen')) {
            $fpIn = fopen($tmpSql, 'rb');
            $fpOut = gzopen($path, 'wb9');
            if ($fpIn && $fpOut) {
                while (! feof($fpIn)) {
                    gzwrite($fpOut, fread($fpIn, 1024 * 512));
                }
                fclose($fpIn);
                gzclose($fpOut);
            }
            @unlink($tmpSql);
            return is_file($path);
        }

        rename($tmpSql, $path);

        return is_file($path);
    }

    private function exportDatabaseToGzip(string $path): void
    {
        $tables = DB::select('SHOW TABLES');
        $dbName = config('database.connections.'.config('database.default').'.database');
        $key = 'Tables_in_'.$dbName;

        $sql = "-- Full database backup\nSET FOREIGN_KEY_CHECKS=0;\n\n";
        foreach ($tables as $row) {
            $table = $row->{$key} ?? null;
            if (! $table) {
                continue;
            }
            $sql .= "\n-- Table: {$table}\n";
            $chunks = DB::table($table)->orderBy(DB::raw('1'))->lazy(500);
            foreach ($chunks as $record) {
                $sql .= $this->rowToInsert($table, (array) $record)."\n";
            }
        }
        $sql .= "\nSET FOREIGN_KEY_CHECKS=1;\n";
        $this->writeGzip($path, $sql);
    }

    private function rowToInsert(string $table, array $row): string
    {
        $columns = array_keys($row);
        $values = array_map(function ($v) {
            if ($v === null) {
                return 'NULL';
            }
            if (is_bool($v)) {
                return $v ? '1' : '0';
            }
            if (is_int($v) || is_float($v)) {
                return (string) $v;
            }

            return "'".str_replace(["\\", "'"], ["\\\\", "\\'"], (string) $v)."'";
        }, array_values($row));

        $cols = implode('`, `', $columns);

        return 'INSERT INTO `'.$table.'` (`'.$cols.'`) VALUES ('.implode(', ', $values).');';
    }

    private function writeGzip(string $path, string $sql): void
    {
        $gz = gzopen($path, 'wb9');
        if (! $gz) {
            throw new \RuntimeException('تعذّر إنشاء ملف النسخة المضغوطة');
        }
        gzwrite($gz, $sql);
        gzclose($gz);
    }

    private function tableHasTenantId(string $table): bool
    {
        return DB::getSchemaBuilder()->hasColumn($table, 'tenant_id');
    }

    private function completeJob(
        string $jobId,
        string $fileName,
        string $scope,
        ?int $tenantId = null,
        ?string $tenantName = null,
    ): void {
        $path = $this->backupDir.DIRECTORY_SEPARATOR.$fileName;
        $sizeMb = is_file($path) ? round(filesize($path) / 1024 / 1024, 2) : 0;

        $payload = array_merge($this->getJob($jobId) ?? [], [
            'id' => $jobId,
            'scope' => $scope,
            'status' => 'completed',
            'file_name' => $fileName,
            'file_size_mb' => $sizeMb,
            'completed_at' => now()->toIso8601String(),
        ]);

        if ($tenantId) {
            $payload['tenant_id'] = $tenantId;
            $payload['tenant_name'] = $tenantName;
        }

        $this->putJob($jobId, $payload);
    }

    private function failJob(string $jobId, string $message): void
    {
        $this->putJob($jobId, array_merge($this->getJob($jobId) ?? [], [
            'status' => 'failed',
            'error' => $message,
            'completed_at' => now()->toIso8601String(),
        ]));
    }

    private function putJob(string $jobId, array $data): void
    {
        Cache::put("backup_job_{$jobId}", $data, 86400 * 30);
        $index = Cache::get('backup_job_index', []);
        if (! in_array($jobId, $index, true)) {
            $index[] = $jobId;
            Cache::put('backup_job_index', $index, 86400 * 30);
        }
    }
}
