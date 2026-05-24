<?php

namespace App\Services;

use App\Jobs\WebhookDeliveryJob;
use App\Models\Webhook;

class WebhookService
{
    /**
     * @param  array<string, mixed>  $payload
     */
    public function dispatch(string $event, array $payload, int $tenantId): void
    {
        $webhooks = Webhook::query()
            ->where('tenant_id', $tenantId)
            ->where('is_active', true)
            ->get();

        foreach ($webhooks as $webhook) {
            $events = $webhook->events ?? [];
            if ($events !== [] && ! in_array($event, $events, true) && ! in_array('*', $events, true)) {
                continue;
            }
            WebhookDeliveryJob::dispatch($webhook, $event, $payload);
        }
    }
}
