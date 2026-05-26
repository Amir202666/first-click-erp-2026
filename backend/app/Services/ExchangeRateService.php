<?php

namespace App\Services;

use App\Models\Currency;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * جلب أسعار الصرف — عدة مصادر مجانية + تحويل عبر USD + أسعار احتياطية ثابتة لدول الخليج.
 */
class ExchangeRateService
{
    private const GCC_CODES = ['KWD', 'BHD', 'OMR', 'QAR', 'AED', 'SAR'];

    /** أسعار تقريبية: 1 من العمود = X من الصف (للطوارئ فقط عند انقطاع الإنترنت) */
    private const STATIC_GCC_PER_KWD = [
        'SAR' => 12.13,
        'AED' => 11.88,
        'BHD' => 1.22,
        'OMR' => 1.24,
        'QAR' => 11.78,
        'USD' => 3.24,
    ];

    /**
     * @return array{updated: int, failed: array<string>, message: string}
     */
    public function fetchAndUpdateRates(int $tenantId): array
    {
        $currencies = $this->currencyQuery($tenantId)->where('is_active', true)->get();

        if ($currencies->isEmpty()) {
            return ['updated' => 0, 'failed' => [], 'message' => 'لا توجد عملات نشطة للتحديث.'];
        }

        $base = $currencies->firstWhere('is_default', true) ?? $currencies->first();
        if (! $base) {
            return ['updated' => 0, 'failed' => [], 'message' => 'لم تُعثر على عملة أساسية.'];
        }

        $baseCode = $this->normalizeCode($base->code);
        if ($baseCode === '') {
            return [
                'updated' => 0,
                'failed' => [],
                'message' => 'رمز العملة الأساسية غير صالح ('.$base->code.'). عدّله إلى KWD أو SAR (3 حروف).',
            ];
        }

        $others = $currencies
            ->filter(fn ($c) => $c->id !== $base->id)
            ->map(fn ($c) => $this->normalizeCode($c->code))
            ->filter()
            ->unique()
            ->values()
            ->all();

        $updated = 0;
        $failed = [];

        $base->update([
            'exchange_rate' => 1,
            'rate_date' => now()->toDateString(),
        ]);
        $updated++;

        if ($others === []) {
            return ['updated' => $updated, 'failed' => [], 'message' => 'تم تحديث العملة الأساسية فقط.'];
        }

        $fetch = $this->fetchRatesForBase($baseCode, $others);
        $rates = $fetch['data'] ?? null;

        if ($rates === null) {
            return [
                'updated' => $updated,
                'failed' => $others,
                'message' => 'فشل جلب الأسعار من الإنترنت. تحقق من اتصال السيرفر أو حدّث الأسعار يدوياً من الجدول.',
            ];
        }

        $date = $rates['date'];

        foreach ($currencies as $currency) {
            if ($currency->id === $base->id) {
                continue;
            }
            $code = $this->normalizeCode($currency->code);
            if ($code === '' || ! isset($rates['values'][$code])) {
                $failed[] = $currency->code;

                continue;
            }
            $rateFromApi = (float) $rates['values'][$code];
            if ($rateFromApi <= 0) {
                $failed[] = $currency->code;

                continue;
            }
            $currency->update([
                'exchange_rate' => 1 / $rateFromApi,
                'rate_date' => $date,
            ]);
            $updated++;
        }

        return [
            'updated' => $updated,
            'failed' => $failed,
            'message' => 'تم تحديث '.$updated.' عملة (المصدر: '.($rates['provider'] ?? 'خارجي').').'
                .(count($failed) > 0 ? ' فشل: '.implode(', ', $failed) : ''),
        ];
    }

    private function currencyQuery(int $tenantId)
    {
        return Currency::withoutGlobalScope('tenant')->where('tenant_id', $tenantId);
    }

    private function normalizeCode(?string $code): string
    {
        $code = strtoupper(trim((string) $code));
        $code = str_replace(['.', ' ', '-'], '', $code);

        return match ($code) {
            'KD', 'KWDINAR', 'DINAR' => 'KWD',
            'SR', 'RIYAL', 'SARSAUDI' => 'SAR',
            'KD3', 'K3D' => 'KWD',
            default => strlen($code) === 3 ? $code : '',
        };
    }

    /**
     * @param  list<string>  $targetCodes
     * @return array{data: ?array, errors: string}
     */
    private function fetchRatesForBase(string $baseCode, array $targetCodes): array
    {
        $errors = [];
        $tryGccFirst = in_array($baseCode, self::GCC_CODES, true);

        $attempts = $tryGccFirst
            ? ['open_er', 'er_api_v4', 'usd_pivot', 'static_gcc', 'frankfurter']
            : ['frankfurter', 'open_er', 'er_api_v4', 'usd_pivot', 'static_gcc'];

        foreach ($attempts as $method) {
            $result = match ($method) {
                'open_er' => $this->fetchFromOpenErApi($baseCode, $targetCodes),
                'er_api_v4' => $this->fetchFromExchangeRateApiV4($baseCode, $targetCodes),
                'usd_pivot' => $this->fetchFromUsdPivot($targetCodes, $baseCode),
                'static_gcc' => $this->fetchFromStaticGcc($baseCode, $targetCodes),
                'frankfurter' => $this->fetchFromFrankfurter($baseCode, $targetCodes),
                default => null,
            };

            if ($result === null) {
                $errors[] = $method.': no data';

                continue;
            }

            if ($this->coversTargets($result['values'], $targetCodes)) {
                return ['data' => $result, 'errors' => implode('; ', $errors)];
            }

            $errors[] = $method.': partial';
        }

        return ['data' => null, 'errors' => implode('; ', $errors)];
    }

    /**
     * @param  list<string>  $targetCodes
     * @return array{values: array<string, float>, date: string, provider: string}|null
     */
    private function fetchFromStaticGcc(string $baseCode, array $targetCodes): ?array
    {
        $values = [];

        if ($baseCode === 'KWD') {
            foreach ($targetCodes as $code) {
                if (isset(self::STATIC_GCC_PER_KWD[$code])) {
                    $values[$code] = self::STATIC_GCC_PER_KWD[$code];
                }
            }
        } elseif (isset(self::STATIC_GCC_PER_KWD[$baseCode])) {
            $basePerKwd = self::STATIC_GCC_PER_KWD[$baseCode];
            foreach ($targetCodes as $code) {
                if ($code === 'KWD') {
                    $values[$code] = 1 / $basePerKwd;

                    continue;
                }
                if (isset(self::STATIC_GCC_PER_KWD[$code])) {
                    $values[$code] = self::STATIC_GCC_PER_KWD[$code] / $basePerKwd;
                }
            }
        }

        if ($values === []) {
            return null;
        }

        return [
            'values' => $values,
            'date' => now()->toDateString(),
            'provider' => 'أسعار تقريبية (بدون إنترنت)',
        ];
    }

    /**
     * @param  list<string>  $targetCodes
     * @return array{values: array<string, float>, date: string, provider: string}|null
     */
    private function fetchFromFrankfurter(string $baseCode, array $targetCodes): ?array
    {
        $baseUrl = config('exchange.providers.frankfurter', 'https://api.frankfurter.app/latest');
        $url = $baseUrl.'?from='.$baseCode.'&to='.implode(',', $targetCodes);

        $data = $this->fetchJson($url);
        if ($data === null) {
            return null;
        }

        $rates = $data['rates'] ?? [];
        if ($rates === []) {
            return null;
        }

        $values = [];
        foreach ($rates as $code => $rate) {
            $values[strtoupper((string) $code)] = (float) $rate;
        }

        return [
            'values' => $values,
            'date' => $data['date'] ?? now()->toDateString(),
            'provider' => 'Frankfurter',
        ];
    }

    /**
     * @param  list<string>  $targetCodes
     * @return array{values: array<string, float>, date: string, provider: string}|null
     */
    private function fetchFromOpenErApi(string $baseCode, array $targetCodes): ?array
    {
        $baseUrl = rtrim(config('exchange.providers.open_er_api', 'https://open.er-api.com/v6/latest'), '/');
        $data = $this->fetchJson($baseUrl.'/'.$baseCode);
        if ($data === null || ($data['result'] ?? '') !== 'success') {
            return null;
        }

        return $this->extractTargetRates(
            $data['rates'] ?? [],
            $targetCodes,
            $data['time_last_update_utc'] ?? null,
            'open.er-api'
        );
    }

    /**
     * @param  list<string>  $targetCodes
     * @return array{values: array<string, float>, date: string, provider: string}|null
     */
    private function fetchFromExchangeRateApiV4(string $baseCode, array $targetCodes): ?array
    {
        $baseUrl = rtrim(config('exchange.providers.er_api_v4', 'https://api.exchangerate-api.com/v4/latest'), '/');
        $data = $this->fetchJson($baseUrl.'/'.$baseCode);
        if ($data === null || ! isset($data['rates'])) {
            return null;
        }

        return $this->extractTargetRates(
            $data['rates'],
            $targetCodes,
            $data['date'] ?? null,
            'ExchangeRate-API v4'
        );
    }

    /**
     * @param  list<string>  $targetCodes
     * @return array{values: array<string, float>, date: string, provider: string}|null
     */
    private function fetchFromUsdPivot(array $targetCodes, string $baseCode): ?array
    {
        $baseUrl = rtrim(config('exchange.providers.open_er_api', 'https://open.er-api.com/v6/latest'), '/');
        $data = $this->fetchJson($baseUrl.'/USD');

        if ($data === null || ($data['result'] ?? '') !== 'success') {
            $v4 = $this->fetchJson(
                rtrim(config('exchange.providers.er_api_v4', 'https://api.exchangerate-api.com/v4/latest'), '/').'/USD'
            );
            if ($v4 === null || ! isset($v4['rates'])) {
                return null;
            }
            $allRates = $v4['rates'];
            $date = $v4['date'] ?? now()->toDateString();
            $provider = 'USD pivot (v4)';
        } else {
            $allRates = $data['rates'] ?? [];
            $date = isset($data['time_last_update_utc'])
                ? date('Y-m-d', strtotime($data['time_last_update_utc']))
                : now()->toDateString();
            $provider = 'USD pivot';
        }

        if (! isset($allRates[$baseCode])) {
            return null;
        }

        $basePerUsd = (float) $allRates[$baseCode];
        if ($basePerUsd <= 0) {
            return null;
        }

        $values = [];
        foreach ($targetCodes as $code) {
            if (! isset($allRates[$code])) {
                continue;
            }
            $targetPerUsd = (float) $allRates[$code];
            if ($targetPerUsd <= 0) {
                continue;
            }
            $values[$code] = $targetPerUsd / $basePerUsd;
        }

        if ($values === []) {
            return null;
        }

        return [
            'values' => $values,
            'date' => $date,
            'provider' => $provider,
        ];
    }

    /**
     * @param  array<string, mixed>  $allRates
     * @param  list<string>  $targetCodes
     * @return array{values: array<string, float>, date: string, provider: string}|null
     */
    private function extractTargetRates(array $allRates, array $targetCodes, mixed $dateRaw, string $provider): ?array
    {
        $values = [];
        foreach ($targetCodes as $code) {
            if (isset($allRates[$code])) {
                $values[$code] = (float) $allRates[$code];
            }
        }

        if ($values === []) {
            return null;
        }

        $date = now()->toDateString();
        if (is_string($dateRaw) && $dateRaw !== '') {
            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateRaw)) {
                $date = $dateRaw;
            } else {
                $parsed = strtotime($dateRaw);
                if ($parsed !== false) {
                    $date = date('Y-m-d', $parsed);
                }
            }
        }

        return [
            'values' => $values,
            'date' => $date,
            'provider' => $provider,
        ];
    }

    /**
     * @param  array<string, float>  $values
     * @param  list<string>  $targetCodes
     */
    private function coversTargets(array $values, array $targetCodes): bool
    {
        foreach ($targetCodes as $code) {
            if (! isset($values[strtoupper($code)])) {
                return false;
            }
        }

        return true;
    }

    /**
     * @return array<string, mixed>|null
     */
    private function fetchJson(string $url): ?array
    {
        $body = $this->httpGetBody($url);
        if ($body === null || $body === '') {
            return null;
        }

        $decoded = json_decode($body, true);

        return is_array($decoded) ? $decoded : null;
    }

    private function httpGetBody(string $url): ?string
    {
        $timeout = (int) config('exchange.timeout_seconds', 20);
        $headers = ['User-Agent' => 'FirstClickERP/1.0'];

        foreach ([true, false] as $verifySsl) {
            try {
                $request = Http::timeout($timeout)->withHeaders($headers);
                if (! $verifySsl) {
                    $request = $request->withoutVerifying();
                }
                $response = $request->get($url);
                if ($response->successful()) {
                    return $response->body();
                }
            } catch (\Throwable $e) {
                Log::warning('Exchange HTTP error', ['url' => $url, 'ssl' => $verifySsl, 'error' => $e->getMessage()]);
            }
        }

        return $this->httpGetBodyStream($url);
    }

    private function httpGetBodyStream(string $url): ?string
    {
        $timeout = (int) config('exchange.timeout_seconds', 20);
        $context = stream_context_create([
            'http' => [
                'timeout' => $timeout,
                'header' => "User-Agent: FirstClickERP/1.0\r\nAccept: application/json\r\n",
            ],
            'ssl' => [
                'verify_peer' => false,
                'verify_peer_name' => false,
            ],
        ]);

        $body = @file_get_contents($url, false, $context);

        return $body === false ? null : $body;
    }
}
