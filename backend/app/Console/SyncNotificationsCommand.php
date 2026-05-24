<?php

namespace App\Console;

use App\Services\NotificationService;
use Illuminate\Console\Command;

class SyncNotificationsCommand extends Command
{
    protected $signature = 'notifications:sync {--tenant= : Tenant ID (optional, default: all)}';

    protected $description = 'محرك الإشعارات: تنبيه مخزون، أقساط مستحقة/متأخرة، صلاحيات قريبة من الانتهاء';

    public function handle(NotificationService $service): int
    {
        $tenantId = $this->option('tenant');

        if ($tenantId) {
            $service->runEngineForTenant((int) $tenantId);
            $this->info("تم مزامنة الإشعارات للشركة {$tenantId}.");
        } else {
            $service->runEngineForAllTenants();
            $this->info('تم مزامنة الإشعارات لجميع الشركات.');
        }

        return self::SUCCESS;
    }
}
