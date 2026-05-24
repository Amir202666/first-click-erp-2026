<?php

namespace App\Services;

use App\Models\InstallmentLine;
use App\Models\Notification;
use App\Models\Quotation;
use App\Models\Subscription;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class NotificationService
{
    public function __construct(
        private InventoryService $inventoryService
    ) {}

    /**
     * تنبيه المخزون: إنشاء أو تحديث إشعار واحد ملخص عند وجود أصناف تحت حد الطلب.
     */
    public function syncLowStockNotifications(int $tenantId): void
    {
        $alerts = $this->inventoryService->getLowStockAlerts($tenantId, null, null, null, null);
        $count = count($alerts);

        $existing = Notification::forTenant($tenantId)
            ->ofType(Notification::TYPE_STOCK_LOW)
            ->whereNull('user_id')
            ->first();

        if ($count === 0) {
            if ($existing) {
                $existing->delete();
            }

            return;
        }

        $zeroCount = collect($alerts)->filter(fn ($a) => ((float) ($a['current_stock'] ?? 0)) <= 0)->count();
        $severity = $zeroCount > 0 ? Notification::SEVERITY_DANGER : Notification::SEVERITY_WARNING;
        $titleAr = $count === 1
            ? 'صنف واحد وصل لحد الطلب'
            : "{$count} أصناف وصلت لحد الطلب";
        $titleEn = $count === 1 ? '1 item at reorder level' : "{$count} items at reorder level";

        $payload = [
            'tenant_id' => $tenantId,
            'user_id' => null,
            'type' => Notification::TYPE_STOCK_LOW,
            'title_ar' => $titleAr,
            'title_en' => $titleEn,
            'body_ar' => $zeroCount > 0 ? 'يوجد أصناف برصيد صفر أو تحت حد الطلب.' : null,
            'body_en' => $zeroCount > 0 ? 'Some items have zero or below reorder level.' : null,
            'link_path' => '/inventory/low-stock',
            'link_params' => null,
            'severity' => $severity,
            'related_entity_type' => null,
            'related_entity_id' => null,
        ];

        if ($existing) {
            $existing->update(array_merge($payload, ['read_at' => null]));
        } else {
            Notification::create($payload);
        }
    }

    /**
     * أقساط مستحقة اليوم: إشعار عند بداية يوم العمل.
     */
    public function syncInstallmentsDueToday(int $tenantId): void
    {
        $today = Carbon::today()->toDateString();
        $count = InstallmentLine::query()
            ->whereHas('installment', fn ($q) => $q->where('tenant_id', $tenantId)->where('status', 'approved'))
            ->where('due_date', $today)
            ->whereColumn('paid_amount', '<', 'amount')
            ->count();

        $this->upsertSummaryNotification(
            $tenantId,
            Notification::TYPE_INSTALLMENT_DUE_TODAY,
            $count,
            'أقساط مستحقة اليوم',
            'Installments due today',
            '/installments/reports/follow-up',
            Notification::SEVERITY_WARNING,
            ['from_date' => $today, 'to_date' => $today]
        );
    }

    /**
     * أقساط متأخرة: لم تُسدد وتجاوزت تاريخ الاستحقاق.
     */
    public function syncInstallmentsOverdue(int $tenantId): void
    {
        $tz = config('app.timezone');
        $today = Carbon::now($tz)->toDateString();
        $count = InstallmentLine::query()
            ->whereHas('installment', function ($q) use ($tenantId) {
                $q->withoutGlobalScopes()
                    ->where('tenant_id', $tenantId)
                    ->where('status', 'approved');
            })
            ->whereDate('due_date', '<', $today)
            ->whereColumn('paid_amount', '<', 'amount')
            ->count();

        $this->upsertSummaryNotification(
            $tenantId,
            Notification::TYPE_INSTALLMENT_OVERDUE,
            $count,
            'أقساط متأخرة',
            'Overdue installments',
            '/installments/reports/overdue',
            Notification::SEVERITY_DANGER,
            null
        );
    }

    /**
     * صلاحيات تنتهي خلال 30 يوماً: عروض أسعار (valid_until) واشتراكات (للشركة الحالية).
     */
    public function syncExpirySoonNotifications(int $tenantId): void
    {
        $fromDate = Carbon::today();
        $toDate = Carbon::today()->addDays(30);

        // عروض أسعار تنتهي خلال 30 يوم
        $quotationsCount = Quotation::where('tenant_id', $tenantId)
            ->whereNotNull('valid_until')
            ->whereBetween('valid_until', [$fromDate, $toDate])
            ->count();

        $subCount = Subscription::where('tenant_id', $tenantId)
            ->where('status', 'active')
            ->whereNotNull('ends_at')
            ->where('ends_at', '>=', now())
            ->where('ends_at', '<=', now()->addDays(30))
            ->count();

        $total = $quotationsCount + $subCount;
        if ($total === 0) {
            Notification::forTenant($tenantId)
                ->ofType(Notification::TYPE_EXPIRY_SOON)
                ->whereNull('user_id')
                ->delete();

            return;
        }

        $parts = [];
        if ($quotationsCount > 0) {
            $parts[] = $quotationsCount.' عرض أسعار';
        }
        if ($subCount > 0) {
            $parts[] = 'اشتراك الشركة';
        }
        $titleAr = 'انتهاء صلاحية خلال 30 يوماً: '.implode('، ', $parts);
        $titleEn = 'Expiring within 30 days: '.implode(', ', $parts);

        $this->upsertSingleSummary(
            $tenantId,
            Notification::TYPE_EXPIRY_SOON,
            $titleAr,
            $titleEn,
            '/invoices/quotations',
            Notification::SEVERITY_WARNING
        );
    }

    /**
     * إشعار فوري: طلب المطبخ جاهز → يظهر في نقطة البيع.
     */
    public function createKitchenReadyNotification(int $tenantId, int $ticketId, ?int $branchId, string $tableName): Notification
    {
        return Notification::create([
            'tenant_id' => $tenantId,
            'user_id' => null,
            'type' => Notification::TYPE_KITCHEN_READY,
            'title_ar' => "طلب جاهز — الطاولة {$tableName}",
            'title_en' => "Order ready — Table {$tableName}",
            'body_ar' => null,
            'body_en' => null,
            'link_path' => '/restaurant/pos',
            'link_params' => ['ticket_id' => $ticketId],
            'severity' => Notification::SEVERITY_SUCCESS,
            'related_entity_type' => 'kitchen_ticket',
            'related_entity_id' => $ticketId,
            'branch_id' => $branchId,
        ]);
    }

    /**
     * تشغيل محرك الإشعارات لشركة واحدة (مخزون، أقساط، صلاحيات).
     */
    public function runEngineForTenant(int $tenantId): void
    {
        $this->syncLowStockNotifications($tenantId);
        $this->syncInstallmentsDueToday($tenantId);
        $this->syncInstallmentsOverdue($tenantId);
        $this->syncExpirySoonNotifications($tenantId);
    }

    /**
     * تشغيل المحرك لجميع الشركات (للمهمة المجدولة).
     */
    public function runEngineForAllTenants(): void
    {
        $tenantIds = DB::table('tenants')->pluck('id');
        foreach ($tenantIds as $id) {
            try {
                $this->runEngineForTenant((int) $id);
            } catch (\Throwable $e) {
                report($e);
            }
        }
    }

    private function upsertSummaryNotification(
        int $tenantId,
        string $type,
        int $count,
        string $titleAr,
        string $titleEn,
        string $linkPath,
        string $severity,
        ?array $linkParams
    ): void {
        if ($count === 0) {
            Notification::forTenant($tenantId)->ofType($type)->whereNull('user_id')->delete();

            return;
        }

        $titleAr = $count.' '.$titleAr;
        $titleEn = $count.' '.$titleEn;

        $existing = Notification::forTenant($tenantId)->ofType($type)->whereNull('user_id')->first();
        $payload = [
            'tenant_id' => $tenantId,
            'user_id' => null,
            'type' => $type,
            'title_ar' => $titleAr,
            'title_en' => $titleEn,
            'link_path' => $linkPath,
            'link_params' => $linkParams,
            'severity' => $severity,
        ];

        if ($existing) {
            $existing->update(array_merge($payload, ['read_at' => null]));
        } else {
            Notification::create($payload);
        }
    }

    private function upsertSingleSummary(
        int $tenantId,
        string $type,
        string $titleAr,
        string $titleEn,
        string $linkPath,
        string $severity
    ): void {
        $existing = Notification::forTenant($tenantId)->ofType($type)->whereNull('user_id')->first();
        $payload = [
            'tenant_id' => $tenantId,
            'user_id' => null,
            'type' => $type,
            'title_ar' => $titleAr,
            'title_en' => $titleEn,
            'link_path' => $linkPath,
            'link_params' => null,
            'severity' => $severity,
        ];

        if ($existing) {
            $existing->update(array_merge($payload, ['read_at' => null]));
        } else {
            Notification::create($payload);
        }
    }
}
