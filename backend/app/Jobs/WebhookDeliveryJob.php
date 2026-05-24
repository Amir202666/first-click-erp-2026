<?php

namespace App\Jobs;

use App\Models\Webhook;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Http;

class WebhookDeliveryJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /**
     * @param  array<string, mixed>  $payload
     */
    public function __construct(
        public Webhook $webhook,
        public string $event,
        public array $payload,
    ) {}

    public function handle(): void
    {
        $webhook = $this->webhook->fresh();
        if (! $webhook || ! $webhook->is_active) {
            return;
        }

        $body = [
            'event' => $this->event,
            'timestamp' => now()->toIso8601String(),
            'data' => $this->payload,
        ];

        $json = json_encode($body, JSON_UNESCAPED_UNICODE);
        $signature = hash_hmac('sha256', (string) $json, $webhook->secret);

        Http::withHeaders([
            'Content-Type' => 'application/json',
            'X-ERP-Signature' => $signature,
            'X-ERP-Event' => $this->event,
        ])->timeout(15)->post($webhook->url, $body);

        $webhook->forceFill(['last_triggered_at' => now()])->saveQuietly();
    }
}
