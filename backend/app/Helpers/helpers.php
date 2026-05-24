<?php

use App\Models\Currency;

if (! function_exists('get_currency_decimal_places')) {
    /**
     * إرجاع عدد الكسور العشرية للعملة.
     *
     * @param  \App\Models\Currency|object{decimal_places?: int}|string|null  $currency  نموذج العملة أو كود العملة أو كائن يحتوي decimal_places
     * @param  int|null  $tenantId  معرف المستأجر (مطلوب إذا كان $currency كود عملة)
     */
    function get_currency_decimal_places($currency = null, ?int $tenantId = null): int
    {
        if ($currency instanceof Currency) {
            return (int) $currency->decimal_places ?: 2;
        }
        if (is_object($currency) && isset($currency->decimal_places)) {
            return (int) $currency->decimal_places ?: 2;
        }
        if (is_string($currency) && $tenantId) {
            $model = Currency::where('tenant_id', $tenantId)->where('code', $currency)->first();

            return $model ? ((int) $model->decimal_places ?: 2) : 2;
        }

        return 2;
    }
}

if (! function_exists('format_accounting_number')) {
    /**
     * تنسيق رقم محاسبي حسب عدد كسور العملة (للعرض في الفواتير والتقارير).
     *
     * @param  float|string  $amount  المبلغ
     * @param  \App\Models\Currency|object{decimal_places?: int, symbol?: string}|string|null  $currency  العملة (نموذج أو كائن أو كود)
     * @param  int|null  $tenantId  معرف المستأجر (مطلوب إذا كان $currency كود عملة)
     * @param  string  $locale  locale للتنسيق (مثلاً ar-SA)
     */
    function format_accounting_number($amount, $currency = null, ?int $tenantId = null, string $locale = 'ar-SA'): string
    {
        $decimals = get_currency_decimal_places($currency, $tenantId);
        $amount = (float) $amount;

        return number_format($amount, $decimals, '.', ',');
    }
}
