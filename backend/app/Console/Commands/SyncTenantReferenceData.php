<?php

namespace App\Console\Commands;

use App\Models\Branch;
use App\Models\CostCenter;
use App\Models\Currency;
use App\Models\Tenant;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;

/**
 * تصدير/استيراد بيانات مرجعية (عملات، فروع، مراكز تكلفة) بين المحلي والسيرفر.
 */
class SyncTenantReferenceData extends Command
{
    protected $signature = 'tenant:sync-reference
                            {action : export أو import}
                            {--slug=first-company : معرف الشركة}
                            {--file= : مسار ملف JSON}
                            {--prune : عند الاستيراد — حذف السجلات غير الموجودة في الملف (بحذر)}';

    protected $description = 'مزامنة العملات والفروع ومراكز التكلفة بين المحلي والإنتاج';

    public function handle(): int
    {
        $action = strtolower((string) $this->argument('action'));

        return match ($action) {
            'export' => $this->doExport(),
            'import' => $this->doImport(),
            default => $this->invalidAction($action),
        };
    }

    private function invalidAction(string $action): int
    {
        $this->error("إجراء غير معروف: {$action}. استخدم export أو import.");

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

    private function doExport(): int
    {
        $tenant = $this->resolveTenant();
        if (! $tenant) {
            return self::FAILURE;
        }

        $currencies = Currency::where('tenant_id', $tenant->id)->orderBy('code')->get()->map(fn ($c) => $c->only([
            'code', 'name', 'name_en', 'symbol', 'decimal_places', 'exchange_rate', 'base_currency',
            'rate_date', 'is_active', 'is_default',
        ]))->values()->all();

        $branches = Branch::where('tenant_id', $tenant->id)->orderBy('code')->get()->map(fn ($b) => $b->only([
            'code', 'name', 'name_en', 'address', 'phone', 'manager_name', 'is_active',
        ]))->values()->all();

        $costCenters = CostCenter::where('tenant_id', $tenant->id)->orderBy('code')->get()->map(function ($cc) {
            $parentCode = null;
            if ($cc->parent_id) {
                $parentCode = CostCenter::where('id', $cc->parent_id)->value('code');
            }

            return array_merge($cc->only([
                'code', 'name', 'name_en', 'description', 'is_active',
            ]), ['parent_code' => $parentCode]);
        })->values()->all();

        $payload = [
            'version' => 1,
            'tenant_slug' => $tenant->slug,
            'exported_at' => now()->toIso8601String(),
            'counts' => [
                'currencies' => count($currencies),
                'branches' => count($branches),
                'cost_centers' => count($costCenters),
            ],
            'currencies' => $currencies,
            'branches' => $branches,
            'cost_centers' => $costCenters,
        ];

        $file = $this->option('file')
            ?? storage_path('app/exports/reference_'.$tenant->slug.'_'.now()->format('Ymd_His').'.json');

        $dir = dirname($file);
        if (! is_dir($dir)) {
            File::makeDirectory($dir, 0755, true);
        }

        file_put_contents($file, json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));

        $this->info("تم التصدير: {$file}");
        $this->table(['النوع', 'العدد'], [
            ['عملات', count($currencies)],
            ['فروع', count($branches)],
            ['مراكز تكلفة', count($costCenters)],
        ]);

        return self::SUCCESS;
    }

    private function doImport(): int
    {
        $file = $this->option('file');
        if (! $file || ! is_file($file)) {
            $this->error('حدّد --file=مسار ملف JSON المُصدَّر');

            return self::FAILURE;
        }

        $payload = json_decode(file_get_contents($file), true);
        if (! is_array($payload)) {
            $this->error('ملف JSON غير صالح');

            return self::FAILURE;
        }

        $slug = (string) ($this->option('slug') ?: ($payload['tenant_slug'] ?? 'first-company'));
        $tenant = Tenant::where('slug', $slug)->first();
        if (! $tenant) {
            $this->error("الشركة غير موجودة على هذا السيرفر: {$slug}");

            return self::FAILURE;
        }

        $tid = $tenant->id;
        $prune = (bool) $this->option('prune');

        DB::transaction(function () use ($payload, $tid, $prune) {
            $currencyCodes = [];
            foreach ($payload['currencies'] ?? [] as $row) {
                $code = strtoupper((string) ($row['code'] ?? ''));
                if ($code === '') {
                    continue;
                }
                $currencyCodes[] = $code;
                Currency::updateOrCreate(
                    ['tenant_id' => $tid, 'code' => $code],
                    [
                        'name' => $row['name'] ?? $code,
                        'name_en' => $row['name_en'] ?? null,
                        'symbol' => $row['symbol'] ?? $code,
                        'decimal_places' => (int) ($row['decimal_places'] ?? 2),
                        'exchange_rate' => $row['exchange_rate'] ?? 1,
                        'base_currency' => $row['base_currency'] ?? 'SAR',
                        'rate_date' => $row['rate_date'] ?? null,
                        'is_active' => (bool) ($row['is_active'] ?? true),
                        'is_default' => (bool) ($row['is_default'] ?? false),
                    ]
                );
            }
            if ($prune && $currencyCodes !== []) {
                Currency::where('tenant_id', $tid)->whereNotIn('code', $currencyCodes)->delete();
            }

            $branchCodes = [];
            foreach ($payload['branches'] ?? [] as $row) {
                $code = (string) ($row['code'] ?? '');
                if ($code === '') {
                    continue;
                }
                $branchCodes[] = $code;
                Branch::updateOrCreate(
                    ['tenant_id' => $tid, 'code' => $code],
                    [
                        'name' => $row['name'] ?? $code,
                        'name_en' => $row['name_en'] ?? null,
                        'address' => $row['address'] ?? null,
                        'phone' => $row['phone'] ?? null,
                        'manager_name' => $row['manager_name'] ?? null,
                        'is_active' => (bool) ($row['is_active'] ?? true),
                    ]
                );
            }
            if ($prune && $branchCodes !== []) {
                Branch::where('tenant_id', $tid)->whereNotIn('code', $branchCodes)->delete();
            }

            $ccCodes = [];
            $rowsByCode = [];
            foreach ($payload['cost_centers'] ?? [] as $row) {
                $code = (string) ($row['code'] ?? '');
                if ($code === '') {
                    continue;
                }
                $ccCodes[] = $code;
                $rowsByCode[$code] = $row;
            }

            // مراكز بدون أب أولاً
            usort($ccCodes, function ($a, $b) use ($rowsByCode) {
                $pa = $rowsByCode[$a]['parent_code'] ?? null;
                $pb = $rowsByCode[$b]['parent_code'] ?? null;
                if ($pa === $pb) {
                    return strcmp($a, $b);
                }
                if ($pa === null || $pa === '') {
                    return -1;
                }
                if ($pb === null || $pb === '') {
                    return 1;
                }

                return strcmp($a, $b);
            });

            foreach ($ccCodes as $code) {
                $row = $rowsByCode[$code];
                $parentId = null;
                $parentCode = $row['parent_code'] ?? null;
                if ($parentCode) {
                    $parentId = CostCenter::where('tenant_id', $tid)->where('code', $parentCode)->value('id');
                }
                CostCenter::updateOrCreate(
                    ['tenant_id' => $tid, 'code' => $code],
                    [
                        'parent_id' => $parentId,
                        'name' => $row['name'] ?? $code,
                        'name_en' => $row['name_en'] ?? null,
                        'description' => $row['description'] ?? null,
                        'is_active' => (bool) ($row['is_active'] ?? true),
                    ]
                );
            }
            if ($prune && $ccCodes !== []) {
                CostCenter::where('tenant_id', $tid)->whereNotIn('code', $ccCodes)->delete();
            }
        });

        $this->info("تم الاستيراد للشركة: {$slug}");
        $this->table(['النوع', 'المستورد'], [
            ['عملات', count($payload['currencies'] ?? [])],
            ['فروع', count($payload['branches'] ?? [])],
            ['مراكز تكلفة', count($payload['cost_centers'] ?? [])],
        ]);

        return self::SUCCESS;
    }
}
