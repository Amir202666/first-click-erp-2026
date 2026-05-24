<?php

namespace App\Services;

use App\Models\Currency;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * جلب أسعار الصرف من مصدر خارجي (Frankfurter API - مجاني بدون مفتاح).
 * قاعدة الترحيل: القيم في الدفاتر بالعملة المحلية (الأساسية)، مع الاحتفاظ بقيمة العملة الأجنبية عند الحاجة.
 */
class ExchangeRateService
{
    /** عنوان API (Frankfurter - بيانات البنك المركزي الأوروبي، محدثة يومياً). */
    private const API_URL = 'https://api.frankfurter.app/latest';

    /**
     * جلب أسعار الصرف الحالية وتحديث عملات الشريك.
     * العملة الافتراضية (base) تُعتبر 1، والعملات الأخرى تُحدَّث حسب المصدر.
     *
     * @return array{updated: int, failed: array<string>, message: string}
     */
    public function fetchAndUpdateRates(int $tenantId): array
    {
        $currencies = Currency::where('tenant_id', $tenantId)->where('is_active', true)->get();
        if ($currencies->isEmpty()) {
            return ['updated' => 0, 'failed' => [], 'message' => 'لا توجد عملات نشطة للتحديث.'];
        }

        $base = $currencies->firstWhere('is_default', true) ?? $currencies->first();
        $baseCode = strtoupper($base->code);
        $others = $currencies->filter(fn ($c) => $c->id !== $base->id)->pluck('code')->map(fn ($c) => strtoupper($c))->unique()->values()->all();

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

        $to = implode(',', $others);
        $url = self::API_URL.'?from='.$baseCode.'&to='.$to;

        try {
            // المحاولة الأولى: اتصال عادي (SSL طبيعي)
            try {
                $response = Http::timeout(10)->get($url);
            } catch (\Throwable $e) {
                // في بعض بيئات ويندوز / XAMPP يظهر خطأ شهادة SSL (cURL error 60)
                // لذلك نحاول مرة أخرى بدون التحقق من الشهادة حتى لا يتوقف النظام.
                Log::warning('Exchange rate HTTPS failed, retrying without SSL verification', [
                    'url' => $url,
                    'error' => $e->getMessage(),
                ]);
                $response = Http::timeout(10)->withoutVerifying()->get($url);
            }

            if (! $response->successful()) {
                Log::warning('Exchange rate API failed', ['url' => $url, 'status' => $response->status()]);

                return ['updated' => $updated, 'failed' => $others, 'message' => 'فشل جلب الأسعار من المصدر الخارجي.'];
            }

            $data = $response->json();
            $rates = $data['rates'] ?? [];
            $date = $data['date'] ?? now()->toDateString();

            foreach ($currencies as $currency) {
                if ($currency->id === $base->id) {
                    continue;
                }
                $code = strtoupper($currency->code);
                if (! isset($rates[$code])) {
                    $failed[] = $code;

                    continue;
                }
                $rateFromApi = (float) $rates[$code];
                if ($rateFromApi <= 0) {
                    $failed[] = $code;

                    continue;
                }
                $currency->update([
                    'exchange_rate' => 1 / $rateFromApi,
                    'rate_date' => $date,
                ]);
                $updated++;
            }
        } catch (\Throwable $e) {
            Log::error('Exchange rate fetch error', ['message' => $e->getMessage(), 'url' => $url]);

            return ['updated' => $updated, 'failed' => $others, 'message' => 'خطأ في الاتصال بمصدر الأسعار: '.$e->getMessage()];
        }

        return [
            'updated' => $updated,
            'failed' => $failed,
            'message' => 'تم تحديث '.$updated.' عملة بنجاح.'.(count($failed) > 0 ? ' فشل: '.implode(', ', $failed) : ''),
        ];
    }
}
