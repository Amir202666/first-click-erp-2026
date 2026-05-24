<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

/**
 * جدولة مزامنة التكاملات الخارجية (Salla، Zid، إلخ.) — هيكل جاهز للتوسعة.
 */
class SyncIntegrationsCommand extends Command
{
    protected $signature = 'integrations:sync {--tenant=}';

    protected $description = 'Sync orders and inventory with connected integrations (placeholder)';

    public function handle(): int
    {
        $this->info('integrations:sync — no connectors registered yet.');

        return self::SUCCESS;
    }
}
