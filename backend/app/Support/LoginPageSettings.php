<?php

namespace App\Support;

use App\Models\PlatformLoginPageSetting;

/**
 * إعدادات صفحة تسجيل الدخول (صف واحد — id=1).
 */
class LoginPageSettings
{
    public static function defaults(): array
    {
        return [
            'headline_ar' => 'نظام المحاسبة المتكامل',
            'headline_en' => 'Integrated Accounting System',
            'tagline_ar' => 'برنامج محاسبي | ذكاء محلي | انتشار عالمي',
            'tagline_en' => 'ACCOUNTING SOFTWARE | LOCAL INTELLIGENCE | GLOBAL REACH',
            'subtitle_ar' => 'أدخل بيانات حسابك للمتابعة',
            'subtitle_en' => 'Enter your account details to continue',
            'features_ar' => [
                'إدارة مالية متكاملة',
                'نقاط بيع متعددة',
                'تقارير ذكية فورية',
            ],
            'features_en' => [
                'Integrated financial management',
                'Multi POS',
                'Instant smart reports',
            ],
            'contact_title_ar' => 'تواصل معنا',
            'contact_title_en' => 'Contact us',
            'phone' => '+966500000000',
            'phone_display' => '+966 50 000 0000',
            'whatsapp' => '+966500000000',
            'email' => 'support@firstclickerp.top',
            'website' => 'firstclickerp.top',
            'show_brand_panel' => true,
            'show_contact_section' => true,
            'show_demo_hint' => true,
            'show_forgot_password_link' => true,
            'copyright_ar' => 'First Click ERP',
            'copyright_en' => 'First Click ERP',
            'app_version' => '1.0.0',
        ];
    }

    public static function get(): array
    {
        $row = PlatformLoginPageSetting::query()->first();
        if (! $row || ! is_array($row->content)) {
            return self::defaults();
        }

        return array_replace_recursive(self::defaults(), $row->content);
    }

    public static function save(array $payload): array
    {
        $merged = array_replace_recursive(self::defaults(), $payload);
        $merged['features_ar'] = array_values(array_filter(
            array_map('strval', $merged['features_ar'] ?? []),
            fn ($v) => trim($v) !== ''
        ));
        $merged['features_en'] = array_values(array_filter(
            array_map('strval', $merged['features_en'] ?? []),
            fn ($v) => trim($v) !== ''
        ));
        if (count($merged['features_ar']) < 1) {
            $merged['features_ar'] = self::defaults()['features_ar'];
        }
        if (count($merged['features_en']) < 1) {
            $merged['features_en'] = self::defaults()['features_en'];
        }

        $row = PlatformLoginPageSetting::query()->first();
        if ($row) {
            $row->update(['content' => $merged]);
        } else {
            PlatformLoginPageSetting::query()->create(['content' => $merged]);
        }

        return $merged;
    }

    /** للاستجابة العامة (صفحة الدخول) */
    public static function forPublic(?string $lang = 'ar'): array
    {
        $all = self::get();
        $isAr = $lang === 'ar';

        return [
            'headline' => $isAr ? $all['headline_ar'] : $all['headline_en'],
            'tagline' => $isAr ? $all['tagline_ar'] : $all['tagline_en'],
            'subtitle' => $isAr ? $all['subtitle_ar'] : $all['subtitle_en'],
            'features' => $isAr ? $all['features_ar'] : $all['features_en'],
            'contact_title' => $isAr ? $all['contact_title_ar'] : $all['contact_title_en'],
            'phone' => $all['phone'],
            'phone_display' => $all['phone_display'],
            'whatsapp' => $all['whatsapp'],
            'email' => $all['email'],
            'website' => $all['website'],
            'show_brand_panel' => (bool) $all['show_brand_panel'],
            'show_contact_section' => (bool) $all['show_contact_section'],
            'show_demo_hint' => (bool) $all['show_demo_hint'],
            'show_forgot_password_link' => (bool) $all['show_forgot_password_link'],
            'copyright' => $isAr ? $all['copyright_ar'] : $all['copyright_en'],
            'app_version' => $all['app_version'],
        ];
    }

    public static function validateUpdateRules(): array
    {
        return [
            'headline_ar' => 'nullable|string|max:255',
            'headline_en' => 'nullable|string|max:255',
            'tagline_ar' => 'nullable|string|max:500',
            'tagline_en' => 'nullable|string|max:500',
            'subtitle_ar' => 'nullable|string|max:255',
            'subtitle_en' => 'nullable|string|max:255',
            'features_ar' => 'nullable|array|max:8',
            'features_ar.*' => 'nullable|string|max:200',
            'features_en' => 'nullable|array|max:8',
            'features_en.*' => 'nullable|string|max:200',
            'contact_title_ar' => 'nullable|string|max:100',
            'contact_title_en' => 'nullable|string|max:100',
            'phone' => 'nullable|string|max:50',
            'phone_display' => 'nullable|string|max:50',
            'whatsapp' => 'nullable|string|max:50',
            'email' => 'nullable|string|max:255',
            'website' => 'nullable|string|max:255',
            'show_brand_panel' => 'sometimes|boolean',
            'show_contact_section' => 'sometimes|boolean',
            'show_demo_hint' => 'sometimes|boolean',
            'show_forgot_password_link' => 'sometimes|boolean',
            'copyright_ar' => 'nullable|string|max:255',
            'copyright_en' => 'nullable|string|max:255',
            'app_version' => 'nullable|string|max:20',
        ];
    }
}
