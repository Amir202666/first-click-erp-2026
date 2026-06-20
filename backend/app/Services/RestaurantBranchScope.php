<?php

namespace App\Services;

use App\Models\RestaurantSection;
use Illuminate\Database\Eloquent\Builder;

class RestaurantBranchScope
{
    /**
     * أسماء/أكواد الأقسام التابعة للفرع (أو العامة بدون فرع).
     *
     * @return array<int, string>
     */
    public static function sectionKeysForBranch(int $tenantId, int $branchId): array
    {
        return RestaurantSection::query()
            ->where('tenant_id', $tenantId)
            ->where(function (Builder $q) use ($branchId) {
                $q->where('branch_id', $branchId)->orWhereNull('branch_id');
            })
            ->get()
            ->flatMap(function (RestaurantSection $section) {
                return array_values(array_filter([
                    trim((string) ($section->name ?? '')),
                    trim((string) ($section->name_en ?? '')),
                    trim((string) ($section->code ?? '')),
                ], fn ($v) => $v !== ''));
            })
            ->unique()
            ->values()
            ->all();
    }

    /** أقسام ظاهرة لفرع معيّن في POS (فرع محدد + أقسام عامة). */
    public static function applySectionBranchFilter(Builder $query, int $tenantId, int $branchId): Builder
    {
        return $query->where(function (Builder $q) use ($branchId) {
            $q->where('branch_id', $branchId)->orWhereNull('branch_id');
        });
    }

    /**
     * طاولات ظاهرة لفرع معيّن:
     * - branch_id = الفرع
     * - أو branch_id فارغ ومرتبطة بقسم تابع للفرع (أو قسم عام)
     * - أو branch_id فارغ بدون قسم (طاولات عامة)
     */
    public static function applyTableBranchFilter(Builder $query, int $tenantId, int $branchId): Builder
    {
        $sectionKeys = self::sectionKeysForBranch($tenantId, $branchId);

        return $query->where(function (Builder $q) use ($branchId, $sectionKeys) {
            $q->where('branch_id', $branchId);

            $q->orWhere(function (Builder $q2) use ($sectionKeys) {
                $q2->whereNull('branch_id');
                if ($sectionKeys !== []) {
                    $q2->where(function (Builder $q3) use ($sectionKeys) {
                        $q3->whereNull('section')
                            ->orWhere('section', '')
                            ->orWhereIn('section', $sectionKeys);
                    });
                }
            });
        });
    }

    /** استنتاج branch_id من اسم/كود القسم. */
    public static function resolveBranchIdFromSectionName(int $tenantId, string $sectionName): ?int
    {
        $key = trim($sectionName);
        if ($key === '') {
            return null;
        }

        $section = RestaurantSection::query()
            ->where('tenant_id', $tenantId)
            ->where(function (Builder $q) use ($key) {
                $q->where('name', $key)
                    ->orWhere('name_en', $key)
                    ->orWhere('code', $key);
            })
            ->first();

        return $section?->branch_id ? (int) $section->branch_id : null;
    }

    /** مزامنة branch_id للطاولات المرتبطة بقسم بعد تعديل القسم. */
    public static function syncTablesBranchFromSection(RestaurantSection $section): void
    {
        $names = array_values(array_filter([
            trim((string) ($section->name ?? '')),
            trim((string) ($section->name_en ?? '')),
            trim((string) ($section->code ?? '')),
        ], fn ($v) => $v !== ''));

        if ($names === []) {
            return;
        }

        \App\Models\RestaurantTable::query()
            ->where('tenant_id', $section->tenant_id)
            ->whereIn('section', $names)
            ->update(['branch_id' => $section->branch_id]);
    }
}
