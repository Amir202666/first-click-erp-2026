<?php

namespace App\Console\Commands;

use App\Services\ExchangeRateService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;

class TestExchangeRates extends Command
{
    protected $signature = 'exchange:test {base=KWD} {--targets=SAR}';

    protected $description = 'اختبار اتصال السيرفر بمصادر أسعار الصرف';

    public function handle(ExchangeRateService $service): int
    {
        $base = strtoupper($this->argument('base'));
        $targets = array_map('strtoupper', explode(',', $this->option('targets')));

        $this->info("اختبار المصادر: base={$base}, targets=".implode(',', $targets));
        $this->newLine();

        $urls = [
            'Frankfurter' => 'https://api.frankfurter.app/latest?from='.$base.'&to='.implode(',', $targets),
            'open.er-api' => 'https://open.er-api.com/v6/latest/'.$base,
            'ER-API v4' => 'https://api.exchangerate-api.com/v4/latest/'.$base,
            'USD pivot' => 'https://open.er-api.com/v6/latest/USD',
        ];

        foreach ($urls as $name => $url) {
            try {
                $r = Http::timeout(15)->withoutVerifying()->get($url);
                $ok = $r->successful() ? '✓' : '✗ '.$r->status();
                $this->line("  {$ok} {$name}");
            } catch (\Throwable $e) {
                $this->line("  ✗ {$name}: ".$e->getMessage());
            }
        }

        $this->newLine();
        $this->info('تشغيل الخدمة الكاملة (tenant_id=1)...');
        $result = $service->fetchAndUpdateRates(1);
        $this->line($result['message']);
        if (! empty($result['debug'])) {
            $this->warn('Debug: '.$result['debug']);
        }

        return ($result['updated'] ?? 0) > 1 ? self::SUCCESS : self::FAILURE;
    }
}
