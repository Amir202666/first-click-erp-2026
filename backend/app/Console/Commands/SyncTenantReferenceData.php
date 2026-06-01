<?php

namespace App\Console\Commands;

use App\Models\Account;
use App\Models\Branch;
use App\Models\CostCenter;
use App\Models\Currency;
use App\Models\PaymentMethod;
use App\Models\Tenant;
use App\Support\ReferenceDataNormalizer;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Schema;

/**
 * تصدير/استيراد بيانات مرجعية (عملات، فروع، مراكز تكلفة، طرق دفع) بين المحلي والسيرفر.
 */
class SyncTenantReferenceData extends Command
{
    protected $signature = 'tenant:sync-reference
                            {action : export أو import}
                            {--slug=first-company : معرف الشركة}
                            {--file= : مسار ملف JSON}
                            {--no-prune : لا تحذف السجلات القديمة غير الموجودة في ملف التصدير}';

    protected $description = 'مزامنة العملات والفروع ومراكز التكلفة وطرق الدفع بين المحلي والإنتاج';

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

        $currencies = ReferenceDataNormalizer::dedupeCurrencyRows(
            Currency::where('tenant_id', $tenant->id)->orderBy('code')->get()->map(fn ($c) => array_merge($c->only([
                'code', 'name', 'name_en', 'symbol', 'decimal_places', 'exchange_rate', 'base_currency',
                'rate_date', 'is_active', 'is_default',
            ]), [
                'code' => ReferenceDataNormalizer::normalizeCurrencyCode($c->code),
            ]))->values()->all()
        );

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

        $paymentMethods = PaymentMethod::where('tenant_id', $tenant->id)->orderBy('name')->get()->map(function ($pm) {
            $linkedAccountCode = null;
            if ($pm->linked_account_id) {
                $linkedAccountCode = Account::where('id', $pm->linked_account_id)->value('code');
            }

            return [
                'name' => $pm->name,
                'name_en' => $pm->name_en,
                'type' => $pm->type,
                'linked_account_code' => $linkedAccountCode,
                'is_active' => $pm->is_active,
            ];
        })->values()->all();

        $payload = [
            'version' => 3,
            'tenant_slug' => $tenant->slug,
            'exported_at' => now()->toIso8601String(),
            'counts' => [
                'currencies' => count($currencies),
                'branches' => count($branches),
                'cost_centers' => count($costCenters),
                'payment_methods' => count($paymentMethods),
            ],
            'currencies' => $currencies,
            'branches' => $branches,
            'cost_centers' => $costCenters,
            'payment_methods' => $paymentMethods,
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
            ['طرق دفع', count($paymentMethods)],
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
        // استيراد مرجعي = تحديث فقط: احذف ما ليس في الملف (يمكن تعطيله بـ --no-prune)
        $prune = ! $this->option('no-prune');

        $currencyRows = ReferenceDataNormalizer::dedupeCurrencyRows($payload['currencies'] ?? []);

        DB::transaction(function () use ($payload, $tid, $prune, $currencyRows) {
            $this->mergeDuplicateCurrencies($tid);

            $currencyCodes = [];
            foreach ($currencyRows as $row) {
                $code = ReferenceDataNormalizer::normalizeCurrencyCode((string) ($row['code'] ?? ''));
                if ($code === '') {
                    continue;
                }
                $currencyCodes[] = $code;

                $existing = Currency::where('tenant_id', $tid)
                    ->whereIn('code', ReferenceDataNormalizer::currencyCodeVariants($code))
                    ->orderByDesc('is_default')
                    ->orderBy('id')
                    ->first();

                $attributes = [
                    'code' => $code,
                    'name' => $row['name'] ?? $code,
                    'name_en' => $row['name_en'] ?? null,
                    'symbol' => $row['symbol'] ?? $code,
                    'decimal_places' => (int) ($row['decimal_places'] ?? 2),
                    'exchange_rate' => $row['exchange_rate'] ?? 1,
                    'base_currency' => ReferenceDataNormalizer::normalizeCurrencyCode((string) ($row['base_currency'] ?? 'SAR')),
                    'rate_date' => $row['rate_date'] ?? null,
                    'is_active' => (bool) ($row['is_active'] ?? true),
                    'is_default' => (bool) ($row['is_default'] ?? false),
                ];

                if ($existing) {
                    $existing->update($attributes);
                } else {
                    Currency::create(array_merge($attributes, ['tenant_id' => $tid]));
                }
            }

            $this->mergeDuplicateCurrencies($tid);
            $this->ensureSingleDefaultCurrency($tid);

            if ($prune && $currencyCodes !== []) {
                $keepIds = Currency::where('tenant_id', $tid)
                    ->get()
                    ->filter(fn ($c) => in_array(
                        ReferenceDataNormalizer::normalizeCurrencyCode($c->code),
                        $currencyCodes,
                        true
                    ))
                    ->pluck('id')
                    ->all();
                if ($keepIds !== []) {
                    Currency::where('tenant_id', $tid)->whereNotIn('id', $keepIds)->delete();
                }
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

            $paymentNames = [];
            foreach ($payload['payment_methods'] ?? [] as $row) {
                $name = trim((string) ($row['name'] ?? ''));
                if ($name === '') {
                    continue;
                }
                $paymentNames[] = $name;
                $linkedAccountId = null;
                $accountCode = $row['linked_account_code'] ?? null;
                if ($accountCode) {
                    $linkedAccountId = Account::where('tenant_id', $tid)->where('code', (string) $accountCode)->value('id');
                }
                PaymentMethod::withTrashed()->updateOrCreate(
                    ['tenant_id' => $tid, 'name' => $name],
                    [
                        'name_en' => $row['name_en'] ?? null,
                        'type' => (string) ($row['type'] ?? 'other'),
                        'linked_account_id' => $linkedAccountId,
                        'is_active' => (bool) ($row['is_active'] ?? true),
                        'deleted_at' => null,
                    ]
                );
            }
            if ($prune && $paymentNames !== []) {
                PaymentMethod::where('tenant_id', $tid)->whereNotIn('name', $paymentNames)->delete();
            }
        });

        $this->info("تم الاستيراد للشركة: {$slug}");
        $this->table(['النوع', 'المستورد'], [
            ['عملات', count($currencyRows)],
            ['فروع', count($payload['branches'] ?? [])],
            ['مراكز تكلفة', count($payload['cost_centers'] ?? [])],
            ['طرق دفع', count($payload['payment_methods'] ?? [])],
        ]);

        return self::SUCCESS;
    }

    /** دمج عملات مكررة (KD + د.ك + KWD …) قبل/بعد الاستيراد. */
    private function mergeDuplicateCurrencies(int $tenantId): void
    {
        $groups = [];
        foreach (Currency::where('tenant_id', $tenantId)->orderBy('id')->get() as $currency) {
            $canonical = ReferenceDataNormalizer::normalizeCurrencyCode($currency->code);
            $groups[$canonical][] = $currency;
        }

        foreach ($groups as $canonical => $items) {
            if (count($items) <= 1) {
                $only = $items[0];
                if ($only->code !== $canonical) {
                    $only->update(['code' => $canonical]);
                }

                continue;
            }

            usort($items, function (Currency $a, Currency $b) use ($canonical) {
                $score = fn (Currency $c) => ($c->is_default ? 100 : 0)
                    + ($c->code === $canonical ? 10 : 0)
                    - (int) $c->id;
                return $score($b) <=> $score($a);
            });

            $keeper = $items[0];
            if ($keeper->code !== $canonical) {
                $keeper->update(['code' => $canonical]);
            }

            foreach (array_slice($items, 1) as $duplicate) {
                $this->reassignCurrencyForeignKeys($duplicate->id, $keeper->id);
                $duplicate->delete();
            }
        }
    }

    /** إعادة ربط العملة فقط في الجداول التي تحتوي العمود فعلياً. */
    private function reassignCurrencyForeignKeys(int $fromCurrencyId, int $toCurrencyId): void
    {
        if (Schema::hasTable('hr_allowances') && Schema::hasColumn('hr_allowances', 'currency_id')) {
            DB::table('hr_allowances')
                ->where('currency_id', $fromCurrencyId)
                ->update(['currency_id' => $toCurrencyId]);
        }
    }

    private function ensureSingleDefaultCurrency(int $tenantId): void
    {
        $defaults = Currency::where('tenant_id', $tenantId)->where('is_default', true)->orderBy('id')->get();
        if ($defaults->count() <= 1) {
            return;
        }

        $keeper = $defaults->first();
        Currency::where('tenant_id', $tenantId)
            ->where('id', '!=', $keeper->id)
            ->update(['is_default' => false]);
    }
}
