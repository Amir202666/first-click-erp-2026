<?php

namespace App\Support;

use App\Models\Tenant;
use App\Services\TenantSettingsService;

/**
 * هوية الشركة من الإعدادات العامة (company_name، company_logo، …) مع fallback لسجل Tenant.
 */
class TenantBranding
{
    public static function generalSettings(int $tenantId): array
    {
        return app(TenantSettingsService::class)->getAll($tenantId);
    }

    public static function companyName(Tenant $tenant): string
    {
        $settings = self::generalSettings($tenant->id);
        $name = $settings['company_name'] ?? null;
        if (is_string($name) && trim($name) !== '') {
            return trim($name);
        }

        return $tenant->name;
    }

    /** اسم إنجليزي اختياري — نفس الاسم من الإعدادات إن لم يُعرَّف غيره */
    public static function companyNameEn(Tenant $tenant): ?string
    {
        $settings = self::generalSettings($tenant->id);
        $en = $settings['company_name_en'] ?? null;
        if (is_string($en) && trim($en) !== '') {
            return trim($en);
        }

        return null;
    }

    public static function companyLogoUrl(Tenant $tenant): ?string
    {
        $settings = self::generalSettings($tenant->id);
        $logo = $settings['company_logo'] ?? null;
        if (is_string($logo) && trim($logo) !== '') {
            return trim($logo);
        }

        if ($tenant->logo) {
            return asset('storage/'.$tenant->logo);
        }

        return null;
    }
}
