<?php

namespace App\Support;

use App\Models\Currency;
use App\Models\Tenant;
use App\Services\TenantSettingsService;

class TenantDefaultCurrency
{
    /**
     * @return array{code: string, symbol: string, decimal_places: int}
     */
    public static function resolve(Tenant $tenant): array
    {
        $currency = Currency::where('tenant_id', $tenant->id)
            ->where('is_active', true)
            ->where('is_default', true)
            ->first();

        if (! $currency) {
            $defaultId = app(TenantSettingsService::class)->get($tenant->id, 'default_currency_id');
            if ($defaultId) {
                $currency = Currency::where('tenant_id', $tenant->id)
                    ->where('is_active', true)
                    ->find($defaultId);
            }
        }

        if (! $currency && $tenant->default_currency) {
            $currency = Currency::where('tenant_id', $tenant->id)
                ->where('is_active', true)
                ->where('code', $tenant->default_currency)
                ->first();
        }

        if ($currency) {
            return [
                'code' => $currency->code,
                'symbol' => self::normalizeSymbol($currency->symbol, $currency->code),
                'decimal_places' => (int) ($currency->decimal_places ?? 2),
            ];
        }

        $code = $tenant->default_currency ?? 'SAR';

        return [
            'code' => $code,
            'symbol' => self::defaultSymbolForCode($code),
            'decimal_places' => 2,
        ];
    }

    /**
     * @return array{currency: string, currency_symbol: string, currency_decimal_places: int}
     */
    public static function forApi(Tenant $tenant): array
    {
        $resolved = self::resolve($tenant);

        return [
            'currency' => $resolved['code'],
            'currency_symbol' => $resolved['symbol'],
            'currency_decimal_places' => $resolved['decimal_places'],
        ];
    }

    private static function normalizeSymbol(?string $symbol, string $code): string
    {
        if (is_string($symbol) && trim($symbol) !== '' && ! preg_match('/^\d+$/', $symbol)) {
            return trim($symbol);
        }

        return self::defaultSymbolForCode($code);
    }

    private static function defaultSymbolForCode(string $code): string
    {
        return match (strtoupper($code)) {
            'KWD' => 'د.ك',
            'SAR' => 'ر.س',
            'AED' => 'د.إ',
            'BHD' => 'د.ب',
            'OMR' => 'ر.ع.',
            'QAR' => 'ر.ق',
            'USD' => '$',
            'EUR' => '€',
            'EGP' => 'ج.م',
            default => strtoupper($code),
        };
    }
}
