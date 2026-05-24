<?php

namespace App\Services;

use App\Models\TenantSetting;
use Illuminate\Support\Facades\Cache;

/**
 * إعدادات الشريك (Key-Value) مع كاش لتقليل الضغط على قاعدة البيانات.
 */
class TenantSettingsService
{
    private const CACHE_KEY_PREFIX = 'tenant_settings:';

    private const CACHE_TTL_SECONDS = 600;

    public function get(int $tenantId, string $key, mixed $default = null): mixed
    {
        $all = $this->getAll($tenantId);
        $value = $all[$key] ?? $default;

        return $this->castValue($key, $value);
    }

    public function getAll(int $tenantId): array
    {
        $cacheKey = self::CACHE_KEY_PREFIX.$tenantId;

        return Cache::remember($cacheKey, self::CACHE_TTL_SECONDS, function () use ($tenantId) {
            return TenantSetting::query()
                ->where('tenant_id', $tenantId)
                ->pluck('value', 'key')
                ->all();
        });
    }

    public function set(int $tenantId, string $key, mixed $value): void
    {
        $this->setMany($tenantId, [$key => $value]);
    }

    public function setMany(int $tenantId, array $settings): void
    {
        foreach ($settings as $key => $value) {
            $serialized = $this->serializeValue($value);
            TenantSetting::query()->updateOrInsert(
                ['tenant_id' => $tenantId, 'key' => $key],
                ['value' => $serialized, 'updated_at' => now()]
            );
        }
        $this->forgetCache($tenantId);
    }

    public function forgetCache(int $tenantId): void
    {
        Cache::forget(self::CACHE_KEY_PREFIX.$tenantId);
    }

    private function serializeValue(mixed $value): string
    {
        if (is_bool($value)) {
            return $value ? '1' : '0';
        }
        if (is_array($value) || is_object($value)) {
            return json_encode($value);
        }

        return (string) $value;
    }

    private function castValue(string $key, mixed $raw): mixed
    {
        if ($key === 'installment_enabled_period_months') {
            if ($raw === null || $raw === '') {
                return [];
            }

            return $this->castInstallmentEnabledPeriodMonths($raw);
        }
        if ($raw === null || $raw === '') {
            return null;
        }
        $boolKeys = [
            'auto_journal_entries_enabled',
            'post_immediately',
            'pos_default_printer_enabled',
            'pos_tax_inclusive',
            'allow_negative_sale',
            'invoice_variants_sales_enabled',
            'invoice_variants_purchases_enabled',
            /** تاريخ الصلاحية ورقم الباتش في أسطر فواتير المبيعات/المشتريات */
            'invoice_expiry_dates_enabled',
            'notification_email_enabled',
            'notification_sms_enabled',
            'pos_use_default_customer',
            'pos_use_default_cashier',
            'pos_use_default_category',
            'pos_use_default_branch',
            'pos_use_default_warehouse',
            'pos_show_sales_operation_type',
            'pos_allow_credit_sales',
            'pos_allow_select_sales_rep',
            'pos_allow_select_invoice_status',
            'sales_rep_enabled',
            'sales_rep_required',
            'allow_manufacturing_with_raw_shortage',
        ];
        if (in_array($key, $boolKeys, true)) {
            return in_array((string) $raw, ['1', 'true', 'yes'], true);
        }
        $intKeys = [
            'fiscal_year_start_month',
            'default_currency_id',
            'retained_earnings_account_id',
            'currency_diff_account_id',
            'tax_account_id',
            'backup_retention_days',
            /** مقياس خط الواجهة بالنسبة المئوية (مثلاً 100 = الافتراضي) */
            'ui_font_scale_percent',
            'pos_default_customer_id',
            'pos_default_cashier_id',
            'pos_default_category_id',
            'pos_default_branch_id',
            'pos_default_warehouse_id',
            'doc_amount_decimals',
            'doc_quantity_decimals',
            'manufacturing_default_raw_warehouse_id',
            'manufacturing_default_finished_warehouse_id',
            'manufacturing_wip_account_id',
            /** أقصى عدد أقساط مسموح في نافذة تقسيط الفاتورة */
            'max_installments_count',
        ];
        if (in_array($key, $intKeys, true)) {
            return (int) $raw;
        }
        $floatKeys = [
            'default_vat_rate',
            /** الحد الأدنى لمبلغ المتبقي ليُسمح بفتح التقسيط */
            'min_installment_amount',
        ];
        if (in_array($key, $floatKeys, true)) {
            return (float) $raw;
        }
        if (is_string($raw) && (str_starts_with($raw, '{') || str_starts_with($raw, '['))) {
            $decoded = json_decode($raw, true);

            return $decoded !== null ? $decoded : $raw;
        }

        return $raw;
    }

    /**
     * @return list<int>
     */
    private function castInstallmentEnabledPeriodMonths(mixed $raw): array
    {
        if ($raw === null || $raw === '' || $raw === []) {
            return [];
        }
        if (is_array($raw)) {
            return $this->flattenPositiveInts($raw);
        }
        if (is_string($raw)) {
            $t = trim($raw);
            if ($t === '' || $t === '[]') {
                return [];
            }
            if (preg_match('/^\d+(?:\s*,\s*\d+)*$/', $t)) {
                $parts = array_map('intval', array_map('trim', explode(',', $t)));

                return array_values(array_unique(array_filter($parts, fn (int $n) => $n > 0 && $n <= 120)));
            }
            if (str_starts_with($t, '[') || str_starts_with($t, '{')) {
                $decoded = json_decode($t, true);
                if (is_array($decoded)) {
                    return $this->flattenPositiveInts($decoded);
                }
            }
            if (is_numeric($t)) {
                $n = (int) $t;

                return ($n > 0 && $n <= 120) ? [$n] : [];
            }
        }

        return [];
    }

    /**
     * @param  array<mixed>  $arr
     * @return list<int>
     */
    private function flattenPositiveInts(array $arr): array
    {
        $out = [];
        $stack = [$arr];
        while ($stack !== []) {
            $cur = array_pop($stack);
            foreach ($cur as $v) {
                if (is_array($v)) {
                    $stack[] = $v;
                } elseif (is_int($v) || is_float($v)) {
                    $n = (int) $v;
                    if ($n > 0 && $n <= 120) {
                        $out[] = $n;
                    }
                } elseif (is_string($v) && is_numeric(trim($v))) {
                    $n = (int) trim($v);
                    if ($n > 0 && $n <= 120) {
                        $out[] = $n;
                    }
                }
            }
        }

        return array_values(array_unique($out));
    }
}
