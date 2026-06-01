<?php

namespace App\Support;

/**
 * يوحّد ميزات الباقة المخزّنة في قاعدة البيانات مع المفاتيح التي تستخدمها الواجهة ووسيط plan_features.
 */
class PlanFeatureResolver
{
    public const ALL_FEATURES = 'all_features';

    /** المفاتيح المعتمدة في config/plan_features.php والواجهة */
    public const CANONICAL = [
        'accounting',
        'sales',
        'purchases',
        'inventory',
        'pos',
        'manufacturing',
        'sales_reps',
        'hr',
    ];

    /** مفاتيح قديمة في خطط الاشتراك → مفاتيح حالية */
    private const LEGACY_MAP = [
        'chart_of_accounts' => ['accounting'],
        'basic_reports' => ['accounting'],
        'reports' => ['accounting'],
        'custom_reports' => ['accounting'],
        'multi_currency' => ['accounting'],
        'invoices' => ['sales', 'purchases'],
        'pos_integration' => ['pos'],
        'payroll' => ['hr'],
    ];

    /**
     * @param  list<string>|null  $raw
     * @return list<string>
     */
    public static function expand(?array $raw): array
    {
        if ($raw === null || $raw === []) {
            return [];
        }

        if (in_array(self::ALL_FEATURES, $raw, true)) {
            return self::CANONICAL;
        }

        $out = [];
        foreach ($raw as $feature) {
            if (in_array($feature, self::CANONICAL, true)) {
                $out[] = $feature;
                continue;
            }
            if (isset(self::LEGACY_MAP[$feature])) {
                foreach (self::LEGACY_MAP[$feature] as $mapped) {
                    $out[] = $mapped;
                }
            }
        }

        return array_values(array_unique($out));
    }

    /**
     * @param  list<string>  $expanded
     * @param  list<string>  $required  أي ميزة منها تكفي
     */
    public static function allows(array $expanded, array $required): bool
    {
        if ($expanded === []) {
            return true;
        }

        return (bool) array_intersect($expanded, $required);
    }

    /** مدير الشركة أو صلاحيات كاملة — لا تُقيَّد بواجهة الباقة */
    public static function userBypassesPlanFeatures(\App\Models\User $user, ?int $tenantId): bool
    {
        if ($user->isSuperAdmin()) {
            return true;
        }
        if (! $tenantId) {
            return false;
        }

        $tenantUser = $user->tenants()->where('tenants.id', $tenantId)->first();
        if (! $tenantUser) {
            return false;
        }

        $pivot = $tenantUser->pivot;
        if (($pivot->role ?? '') === 'admin') {
            return true;
        }

        $custom = is_array($pivot->permissions ?? null) ? $pivot->permissions : [];
        if (in_array('*', $custom, true)) {
            return true;
        }

        $roleId = $pivot->role_id ?? null;
        if ($roleId) {
            $role = \App\Models\Role::query()
                ->where('id', $roleId)
                ->where(function ($q) use ($tenantId) {
                    $q->where('tenant_id', $tenantId)->orWhereNull('tenant_id');
                })
                ->with('permissions')
                ->first();
            if ($role) {
                $keys = $role->permissions->pluck('key')->all();
                if (in_array('*', $keys, true)) {
                    return true;
                }
            }
        }

        return false;
    }
}
