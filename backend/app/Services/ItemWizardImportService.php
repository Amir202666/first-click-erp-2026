<?php

namespace App\Services;

use App\Models\Item;
use App\Models\ItemBrand;
use App\Models\ItemCategory;
use App\Models\ItemUnit;
use App\Models\ItemUnitOption;

class ItemWizardImportService
{
    public function __construct(
        private InventoryService $inventoryService,
    ) {}

    /**
     * @param  array<int, array<string, mixed>>  $items
     * @return array{
     *   imported: int,
     *   updated: int,
     *   skipped: int,
     *   categories_created: int,
     *   units_created: int,
     *   errors: array<int, array{row: int, name: string, reason: string}>
     * }
     */
    public function import(
        int $tenantId,
        array $items,
        bool $skipDuplicates,
        bool $updateExisting,
        bool $createCategories,
        bool $createUnits,
        ?int $createdBy = null,
    ): array {
        $imported = 0;
        $updated = 0;
        $skipped = 0;
        $categoriesCreated = 0;
        $unitsCreated = 0;
        $errors = [];

        foreach ($items as $index => $row) {
            $line = $index + 2;
            $name = trim((string) ($row['name'] ?? ''));

            try {
                if ($name === '') {
                    throw new \InvalidArgumentException('اسم الصنف مطلوب');
                }

                $code = isset($row['code']) ? trim((string) $row['code']) : '';
                $existing = null;
                if ($code !== '') {
                    $existing = Item::where('tenant_id', $tenantId)
                        ->where('code', $code)
                        ->first();
                }

                if ($existing && $skipDuplicates && ! $updateExisting) {
                    $skipped++;

                    continue;
                }

                $payload = $this->mapRowToItemPayload($tenantId, $row, $createCategories, $createUnits, $categoriesCreated, $unitsCreated);

                $openingStock = isset($row['opening_stock']) ? (float) $row['opening_stock'] : 0.0;

                if ($existing && $updateExisting) {
                    $item = $existing;
                    unset($payload['code']);
                    $item->fill($payload);
                    $item->save();
                    if (! empty($payload['unit_id'])) {
                        $this->ensureBaseUnitOption(
                            $item,
                            (int) $payload['unit_id'],
                            (float) ($payload['selling_price'] ?? 0),
                            isset($payload['cost_price']) ? (float) $payload['cost_price'] : null,
                            $payload['barcode'] ?? null,
                        );
                    }
                    $updated++;
                } else {
                    if (empty($payload['code'])) {
                        $payload['code'] = $this->nextItemCode($tenantId, $payload['category_id'] ?? null);
                    }

                    $payload['tenant_id'] = $tenantId;
                    $item = Item::create($payload);

                    if (! empty($payload['unit_id'])) {
                        $this->ensureBaseUnitOption(
                            $item,
                            (int) $payload['unit_id'],
                            (float) ($payload['selling_price'] ?? 0),
                            isset($payload['cost_price']) ? (float) $payload['cost_price'] : null,
                            $payload['barcode'] ?? null,
                        );
                    }

                    if (
                        $openingStock > 0
                        && ($item->track_quantity ?? true)
                        && ($item->type ?? 'inventory') !== 'service'
                    ) {
                        $this->inventoryService->addMovement([
                            'tenant_id' => $tenantId,
                            'item_id' => $item->id,
                            'type' => 'in',
                            'quantity' => $openingStock,
                            'unit_cost' => $item->cost_price,
                            'total_cost' => round($openingStock * (float) $item->cost_price, 3),
                            'date' => now()->toDateString(),
                            'notes' => 'رصيد افتتاحي — استيراد',
                            'created_by' => $createdBy,
                        ]);
                    }

                    $imported++;
                }
            } catch (\Throwable $e) {
                $errors[] = [
                    'row' => $line,
                    'name' => $name,
                    'reason' => $e->getMessage(),
                ];
            }
        }

        return compact('imported', 'updated', 'skipped', 'categoriesCreated', 'unitsCreated', 'errors');
    }

    /**
     * @param  array<string, mixed>  $row
     * @return array<string, mixed>
     */
    private function mapRowToItemPayload(
        int $tenantId,
        array $row,
        bool $createCategories,
        bool $createUnits,
        int &$categoriesCreated,
        int &$unitsCreated,
    ): array {
        $isService = $this->parseBoolean($row['is_service'] ?? null, false);
        $trackInventory = $this->parseBoolean($row['track_inventory'] ?? null, ! $isService);

        $payload = [
            'name' => trim((string) ($row['name'] ?? '')),
            'name_en' => $this->nullableString($row['name_en'] ?? null),
            'code' => $this->nullableString($row['code'] ?? null),
            'barcode' => $this->nullableString($row['barcode'] ?? null),
            'description' => $this->nullableString($row['description'] ?? null),
            'type' => $isService ? 'service' : 'inventory',
            'cost_price' => isset($row['cost_price']) ? (float) $row['cost_price'] : 0,
            'selling_price' => (float) ($row['sale_price'] ?? 0),
            'default_tax_percent' => isset($row['tax_percent']) ? (float) $row['tax_percent'] : 0,
            'is_active' => $this->parseBoolean($row['is_active'] ?? null, true),
            'track_quantity' => $isService ? false : $trackInventory,
        ];

        if (isset($row['min_sale_price']) && $row['min_sale_price'] !== '') {
            $payload['min_selling_price'] = (float) $row['min_sale_price'];
        }
        if (isset($row['wholesale_price']) && $row['wholesale_price'] !== '') {
            $payload['max_selling_price'] = (float) $row['wholesale_price'];
        }
        if (isset($row['min_stock']) && $row['min_stock'] !== '') {
            $payload['min_quantity'] = (float) $row['min_stock'];
        }
        if (isset($row['max_stock']) && $row['max_stock'] !== '') {
            $payload['max_quantity'] = (float) $row['max_stock'];
        }

        $categoryCode = $this->nullableString($row['category_code'] ?? null);
        $categoryName = $this->nullableString($row['category_name'] ?? null);
        if ($categoryCode || $categoryName) {
            $categoryId = $this->resolveCategoryId($tenantId, $categoryCode, $categoryName, $createCategories, $categoriesCreated);
            $payload['category_id'] = $categoryId;
            $cat = ItemCategory::find($categoryId);
            if ($cat) {
                $payload['inventory_account_id'] = $cat->inventory_account_id;
                $payload['cost_of_sales_account_id'] = $cat->cost_of_sales_account_id;
                $payload['sales_account_id'] = $cat->sales_account_id;
            }
        }

        $unitSymbol = $this->nullableString($row['base_unit_symbol'] ?? null);
        $unitName = $this->nullableString($row['base_unit_name'] ?? ($row['unit_name'] ?? null));
        $resolvedUnit = null;
        if ($unitSymbol || $unitName) {
            $resolvedUnit = $this->resolveUnit($tenantId, $unitSymbol, $unitName, $createUnits, $unitsCreated);
            $payload['unit_id'] = $resolvedUnit->id;
            $payload['unit'] = $resolvedUnit->name;
        }

        $brandName = $this->nullableString($row['brand'] ?? null);
        if ($brandName) {
            $brand = ItemBrand::firstOrCreate(
                ['tenant_id' => $tenantId, 'name' => $brandName],
                ['is_active' => true],
            );
            $payload['brand_id'] = $brand->id;
        }

        return array_filter(
            $payload,
            fn ($v) => $v !== null && $v !== '',
        );
    }

    private function resolveCategoryId(
        int $tenantId,
        ?string $code,
        ?string $name,
        bool $allowCreate,
        int &$created,
    ): int {
        $codeTrim = $code ? trim($code) : null;
        $nameTrim = $name ? trim($name) : null;

        if ($codeTrim) {
            $byCode = ItemCategory::where('tenant_id', $tenantId)
                ->whereRaw('LOWER(TRIM(code)) = ?', [mb_strtolower($codeTrim)])
                ->first();

            if ($byCode) {
                return $byCode->id;
            }

            if (! $allowCreate) {
                throw new \InvalidArgumentException("فئة بالكود «{$codeTrim}» غير موجودة — فعّل إنشاء الفئات تلقائياً");
            }

            $displayName = $nameTrim ?: $codeTrim;
            $category = ItemCategory::create([
                'tenant_id' => $tenantId,
                'code' => $codeTrim,
                'name' => $displayName,
                'is_active' => true,
                'show_in_pos' => true,
                'show_in_restaurant_pos' => true,
                'applies_to_all_branches' => true,
            ]);
            $created++;

            return $category->id;
        }

        if (! $nameTrim) {
            throw new \InvalidArgumentException('كود الفئة أو اسم الفئة مطلوب');
        }

        $existing = ItemCategory::where('tenant_id', $tenantId)
            ->whereRaw('LOWER(TRIM(name)) = ?', [mb_strtolower($nameTrim)])
            ->first();

        if ($existing) {
            return $existing->id;
        }

        if (! $allowCreate) {
            throw new \InvalidArgumentException("الفئة «{$nameTrim}» غير موجودة — فعّل إنشاء الفئات تلقائياً");
        }

        $generatedCode = $this->uniqueCategoryCode($tenantId, $nameTrim);
        $category = ItemCategory::create([
            'tenant_id' => $tenantId,
            'name' => $nameTrim,
            'code' => $generatedCode,
            'is_active' => true,
            'show_in_pos' => true,
            'show_in_restaurant_pos' => true,
            'applies_to_all_branches' => true,
        ]);
        $created++;

        return $category->id;
    }

    private function resolveUnit(
        int $tenantId,
        ?string $symbol,
        ?string $name,
        bool $allowCreate,
        int &$created,
    ): ItemUnit {
        $symbolTrim = $symbol ? trim($symbol) : null;
        $nameTrim = $name ? trim($name) : null;

        if ($symbolTrim) {
            $bySymbol = ItemUnit::where('tenant_id', $tenantId)
                ->where(function ($q) use ($symbolTrim) {
                    $q->whereRaw('LOWER(TRIM(symbol)) = ?', [mb_strtolower($symbolTrim)])
                        ->orWhereRaw('LOWER(TRIM(name)) = ?', [mb_strtolower($symbolTrim)]);
                })
                ->first();

            if ($bySymbol) {
                return $bySymbol;
            }

            if (! $allowCreate) {
                throw new \InvalidArgumentException("وحدة بالرمز «{$symbolTrim}» غير موجودة — فعّل إنشاء الوحدات تلقائياً");
            }

            $displayName = $nameTrim ?: $symbolTrim;
            $unit = ItemUnit::create([
                'tenant_id' => $tenantId,
                'name' => $displayName,
                'symbol' => $symbolTrim,
            ]);
            $created++;

            return $unit;
        }

        if (! $nameTrim) {
            throw new \InvalidArgumentException('رمز الوحدة أو اسم الوحدة الأساسية مطلوب');
        }

        $existing = ItemUnit::where('tenant_id', $tenantId)
            ->whereRaw('LOWER(TRIM(name)) = ?', [mb_strtolower($nameTrim)])
            ->first();

        if ($existing) {
            return $existing;
        }

        if (! $allowCreate) {
            throw new \InvalidArgumentException("الوحدة الأساسية «{$nameTrim}» غير موجودة — فعّل إنشاء الوحدات تلقائياً");
        }

        $unit = ItemUnit::create([
            'tenant_id' => $tenantId,
            'name' => $nameTrim,
        ]);
        $created++;

        return $unit;
    }

    private function ensureBaseUnitOption(
        Item $item,
        int $unitId,
        float $sellingPrice,
        ?float $costPrice,
        ?string $barcode,
    ): void {
        $base = $item->unitOptions()->where('is_base', true)->first();

        if ($base) {
            $base->update([
                'unit_id' => $unitId,
                'conversion_factor' => 1,
                'selling_price' => $sellingPrice,
                'cost_price' => $costPrice,
                'barcode' => $barcode,
            ]);

            return;
        }

        if ($item->unitOptions()->exists()) {
            return;
        }

        ItemUnitOption::create([
            'item_id' => $item->id,
            'unit_id' => $unitId,
            'conversion_factor' => 1,
            'is_base' => true,
            'sort_order' => 0,
            'selling_price' => $sellingPrice,
            'cost_price' => $costPrice,
            'barcode' => $barcode,
        ]);
    }

    private function uniqueCategoryCode(int $tenantId, string $name): string
    {
        $base = mb_substr(preg_replace('/[^A-Za-z0-9\x{0600}-\x{06FF}]/u', '', $name) ?: 'CAT', 0, 8);
        $base = strtoupper($base ?: 'CAT');
        $code = $base;
        $n = 1;
        while (ItemCategory::where('tenant_id', $tenantId)->where('code', $code)->exists()) {
            $code = $base.'-'.$n;
            $n++;
        }

        return $code;
    }

    private function nextItemCode(int $tenantId, ?int $categoryId): string
    {
        if ($categoryId) {
            $prefix = ItemCategory::where('tenant_id', $tenantId)->where('id', $categoryId)->value('code') ?? 'CAT';
            $lastCode = Item::where('tenant_id', $tenantId)
                ->where('category_id', $categoryId)
                ->where('code', 'like', $prefix.'-%')
                ->orderByDesc('code')
                ->value('code');
            $nextNumber = 1;
            if ($lastCode && preg_match('/-(\d+)$/', $lastCode, $m)) {
                $nextNumber = ((int) $m[1]) + 1;
            }

            return sprintf('%s-%03d', $prefix, $nextNumber);
        }

        $maxCode = Item::where('tenant_id', $tenantId)
            ->where('code', 'like', 'ITM-%')
            ->selectRaw("MAX(CAST(SUBSTRING(code, 5) AS UNSIGNED)) as m")
            ->value('m');

        return 'ITM-'.str_pad((string) (($maxCode ?? 0) + 1), 4, '0', STR_PAD_LEFT);
    }

    private function nullableString(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }
        $s = trim((string) $value);

        return $s === '' ? null : $s;
    }

    private function parseBoolean(mixed $value, bool $default): bool
    {
        if ($value === null || $value === '') {
            return $default;
        }
        if (is_bool($value)) {
            return $value;
        }
        $v = strtolower(trim((string) $value));
        if (in_array($v, ['نعم', 'yes', '1', 'true', 'y', 'صح'], true)) {
            return true;
        }
        if (in_array($v, ['لا', 'no', '0', 'false', 'n', 'خطأ'], true)) {
            return false;
        }

        return $default;
    }
}
