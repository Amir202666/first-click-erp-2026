<?php

namespace App\Support;

/**
 * توحيد رموز العملات والبيانات المرجعية لتفادي التكرار عند المزامنة.
 */
final class ReferenceDataNormalizer
{
    /** @var array<string, string> */
    private const CURRENCY_ALIASES = [
        'ر.س' => 'SAR',
        'ر.س.' => 'SAR',
        'ريال' => 'SAR',
        'SR' => 'SAR',
        'SAR' => 'SAR',
        'د.ك' => 'KD',
        'د.ك.' => 'KD',
        'KWD' => 'KD',
        'KD' => 'KD',
        'دينار' => 'KD',
        'د.إ' => 'AED',
        'AED' => 'AED',
        'USD' => 'USD',
        '$' => 'USD',
        'EUR' => 'EUR',
        'EGP' => 'EGP',
        'ج.م' => 'EGP',
    ];

    public static function normalizeCurrencyCode(string $code): string
    {
        $trimmed = trim($code);
        if ($trimmed === '') {
            return '';
        }

        if (isset(self::CURRENCY_ALIASES[$trimmed])) {
            return self::CURRENCY_ALIASES[$trimmed];
        }

        $upper = strtoupper($trimmed);
        if (isset(self::CURRENCY_ALIASES[$upper])) {
            return self::CURRENCY_ALIASES[$upper];
        }

        if (preg_match('/^[A-Z]{2,3}$/', $upper)) {
            return $upper;
        }

        return $upper;
    }

    /**
     * @return list<string>
     */
    public static function currencyCodeVariants(string $canonical): array
    {
        $canonical = self::normalizeCurrencyCode($canonical);
        $variants = [$canonical];
        foreach (self::CURRENCY_ALIASES as $alias => $target) {
            if ($target === $canonical) {
                $variants[] = $alias;
                $variants[] = strtoupper($alias);
            }
        }

        return array_values(array_unique($variants));
    }

    /**
     * دمج صفوف عملات مكررة (نفس الرمز الموحّد) — يفضّل الافتراضية ثم أحدث سعر.
     *
     * @param  list<array<string, mixed>>  $rows
     * @return list<array<string, mixed>>
     */
    public static function dedupeCurrencyRows(array $rows): array
    {
        $byCode = [];
        foreach ($rows as $row) {
            $code = self::normalizeCurrencyCode((string) ($row['code'] ?? ''));
            if ($code === '') {
                continue;
            }
            $row['code'] = $code;
            if (! isset($byCode[$code])) {
                $byCode[$code] = $row;

                continue;
            }
            $existing = $byCode[$code];
            $preferNew = (bool) ($row['is_default'] ?? false) && ! (bool) ($existing['is_default'] ?? false);
            if ($preferNew) {
                $byCode[$code] = array_merge($existing, $row);
            } else {
                $byCode[$code] = array_merge($row, $existing);
            }
        }

        return array_values($byCode);
    }

    public static function normalizeBranchCode(string $code): string
    {
        return trim($code);
    }
}
