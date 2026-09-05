<?php

namespace App\Console\Commands;

use App\Models\Tenant;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Schema;

/**
 * تصدير/استيراد إعدادات الشركة وقوالب الطباعة/المستندات بين المحلي والسيرفر.
 *
 * لا يشمل الفواتير أو العمليات — إعدادات وتنسيقات فقط:
 *   - tenant_settings      (إعدادات النظام/الشركة key/value)
 *   - document_templates   (قوالب المستندات: HTML + meta)
 *   - print_templates      (قوالب/تنسيقات الطباعة)
 */
class SyncTenantSettings extends Command
{
    protected $signature = 'tenant:sync-settings
                            {action : export أو import}
                            {--slug=first-company : معرف الشركة}
                            {--file= : مسار ملف JSON}
                            {--prune : احذف السجلات المحلية غير الموجودة في ملف الاستيراد (افتراضياً: لا)}';

    protected $description = 'مزامنة إعدادات الشركة وقوالب الطباعة/المستندات (بدون فواتير/عمليات)';

    /** الجداول المشمولة ومفاتيحها الطبيعية (لغير tenant_id/id/timestamps). */
    private const TABLES = [
        'tenant_settings' => ['key'],
        'document_templates' => ['doc_type', 'name'],
        'print_templates' => ['document_type', 'name'],
    ];

    /** أعمدة تُستبعد دائماً من التصدير/الاستيراد. */
    private const SKIP_COLUMNS = ['id', 'tenant_id', 'created_at', 'updated_at', 'deleted_at'];

    public function handle(): int
    {
        $action = strtolower((string) $this->argument('action'));

        return match ($action) {
            'export' => $this->doExport(),
            'import' => $this->doImport(),
            default => $this->failWith("إجراء غير معروف: {$action}. استخدم export أو import."),
        };
    }

    private function failWith(string $message): int
    {
        $this->error($message);

        return self::FAILURE;
    }

    private function resolveTenant(): ?Tenant
    {
        $slug = (string) $this->option('slug');
        $tenant = Tenant::where('slug', $slug)->first();
        if (! $tenant) {
            $this->error("الشركة غير موجودة: slug={$slug}");
        }

        return $tenant;
    }

    /** الأعمدة القابلة للنقل لجدول معيّن (الموجودة فعلاً في المخطط). */
    private function portableColumns(string $table): array
    {
        return array_values(array_filter(
            Schema::getColumnListing($table),
            fn ($col) => ! in_array($col, self::SKIP_COLUMNS, true)
        ));
    }

    private function doExport(): int
    {
        $tenant = $this->resolveTenant();
        if (! $tenant) {
            return self::FAILURE;
        }

        $payload = [
            'version' => 1,
            'tenant_slug' => $tenant->slug,
            'exported_at' => now()->toIso8601String(),
            'counts' => [],
        ];
        $summary = [];

        foreach (self::TABLES as $table => $keys) {
            if (! Schema::hasTable($table)) {
                $payload[$table] = [];
                $payload['counts'][$table] = 0;
                $summary[] = [$table, 'غير موجود'];

                continue;
            }

            $columns = $this->portableColumns($table);

            $rows = DB::table($table)
                ->where('tenant_id', $tenant->id)
                ->orderBy('id')
                ->get()
                ->map(function ($row) use ($columns) {
                    $arr = (array) $row;

                    return array_intersect_key($arr, array_flip($columns));
                })
                ->values()
                ->all();

            $payload[$table] = $rows;
            $payload['counts'][$table] = count($rows);
            $summary[] = [$table, (string) count($rows)];
        }

        $file = $this->option('file')
            ?? storage_path('app/exports/settings_'.$tenant->slug.'_'.now()->format('Ymd_His').'.json');

        $dir = dirname($file);
        if (! is_dir($dir)) {
            File::makeDirectory($dir, 0755, true);
        }

        file_put_contents($file, json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));

        $this->info("تم التصدير: {$file}");
        $this->table(['الجدول', 'العدد'], $summary);

        return self::SUCCESS;
    }

    private function doImport(): int
    {
        $file = $this->option('file');
        if (! $file || ! is_file($file)) {
            return $this->failWith('حدّد --file=مسار ملف JSON المُصدَّر');
        }

        $payload = json_decode((string) file_get_contents($file), true);
        if (! is_array($payload)) {
            return $this->failWith('ملف JSON غير صالح');
        }

        $slug = (string) ($this->option('slug') ?: ($payload['tenant_slug'] ?? 'first-company'));
        $tenant = Tenant::where('slug', $slug)->first();
        if (! $tenant) {
            return $this->failWith("الشركة غير موجودة على هذا السيرفر: {$slug}");
        }

        $tid = $tenant->id;
        $prune = (bool) $this->option('prune');
        $summary = [];

        DB::transaction(function () use ($payload, $tid, $prune, &$summary) {
            foreach (self::TABLES as $table => $keys) {
                if (! Schema::hasTable($table)) {
                    $summary[] = [$table, 'تخطّي (غير موجود)'];

                    continue;
                }

                $columns = $this->portableColumns($table);
                $rows = is_array($payload[$table] ?? null) ? $payload[$table] : [];
                $seenKeys = [];
                $count = 0;

                foreach ($rows as $row) {
                    if (! is_array($row)) {
                        continue;
                    }

                    // القيم القابلة للكتابة = تقاطع أعمدة الملف مع أعمدة الوجهة.
                    $values = array_intersect_key($row, array_flip($columns));

                    // مفتاح المطابقة الطبيعي.
                    $match = ['tenant_id' => $tid];
                    $validKey = true;
                    foreach ($keys as $k) {
                        if (! array_key_exists($k, $values) || $values[$k] === null || $values[$k] === '') {
                            $validKey = false;
                            break;
                        }
                        $match[$k] = $values[$k];
                    }
                    if (! $validKey) {
                        continue;
                    }

                    $now = now();
                    $update = array_merge($values, [
                        'tenant_id' => $tid,
                        'updated_at' => $now,
                    ]);

                    $existingId = DB::table($table)->where($match)->value('id');
                    if ($existingId) {
                        DB::table($table)->where('id', $existingId)->update($update);
                    } else {
                        DB::table($table)->insert(array_merge($update, ['created_at' => $now]));
                    }

                    $seenKeys[] = $this->keyString($keys, $values);
                    $count++;
                }

                if ($prune && $seenKeys !== []) {
                    $deleted = $this->pruneTable($table, $keys, $tid, $seenKeys);
                    $summary[] = [$table, "مستورد: {$count} — محذوف: {$deleted}"];
                } else {
                    $summary[] = [$table, "مستورد: {$count}"];
                }
            }
        });

        $this->info("تم الاستيراد للشركة: {$slug}");
        $this->table(['الجدول', 'النتيجة'], $summary);

        return self::SUCCESS;
    }

    private function keyString(array $keys, array $values): string
    {
        return implode('|', array_map(fn ($k) => (string) ($values[$k] ?? ''), $keys));
    }

    /** حذف السجلات المحلية غير الموجودة في ملف الاستيراد. */
    private function pruneTable(string $table, array $keys, int $tid, array $seenKeys): int
    {
        $toDelete = DB::table($table)
            ->where('tenant_id', $tid)
            ->get()
            ->filter(function ($row) use ($keys, $seenKeys) {
                $arr = (array) $row;

                return ! in_array($this->keyString($keys, $arr), $seenKeys, true);
            })
            ->pluck('id')
            ->all();

        if ($toDelete === []) {
            return 0;
        }

        return DB::table($table)->whereIn('id', $toDelete)->delete();
    }
}
