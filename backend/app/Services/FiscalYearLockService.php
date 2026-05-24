<?php

namespace App\Services;

use App\Models\FiscalYear;

/**
 * منع أي تعديل على بيانات تقع ضمن سنة مالية مؤمنة (is_locked)، لجميع المستخدمين.
 */
class FiscalYearLockService
{
    /** @var bool تجاوز الفحص لعمليات النظام (إقفال سنة، أرشفة مخزون) */
    public static bool $bypass = false;

    public static function assertDateWritable(int $tenantId, \Carbon\CarbonInterface|string $date): void
    {
        if (self::$bypass) {
            return;
        }

        $d = \Carbon\Carbon::parse($date)->format('Y-m-d');

        $locked = FiscalYear::query()
            ->where('tenant_id', $tenantId)
            ->where('is_locked', true)
            ->whereDate('start_date', '<=', $d)
            ->whereDate('end_date', '>=', $d)
            ->exists();

        if ($locked) {
            throw new \RuntimeException(
                'السنة المالية لهذا التاريخ مؤمنة. لا يُسمح بإضافة أو تعديل أو حذف السجلات ضمن هذه الفترة.'
            );
        }
    }

    public static function isDateLocked(int $tenantId, \Carbon\CarbonInterface|string $date): bool
    {
        $d = \Carbon\Carbon::parse($date)->format('Y-m-d');

        return FiscalYear::query()
            ->where('tenant_id', $tenantId)
            ->where('is_locked', true)
            ->whereDate('start_date', '<=', $d)
            ->whereDate('end_date', '>=', $d)
            ->exists();
    }
}
