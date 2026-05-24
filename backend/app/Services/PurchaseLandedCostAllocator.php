<?php

namespace App\Services;

/**
 * توزيع مصاريف الشراء الإضافية على بنود الفاتورة بدقة 3 خانات عشرية مع جبر الفرق في آخر بند.
 */
final class PurchaseLandedCostAllocator
{
    /**
     * @param  array<int, float>  $basesByLineId  معرف السطر => أساس التوزيع (كمية بسيطة أو وزن)
     * @return array<int, float> معرف السطر => مبلغ مخصص (صافي)
     */
    public static function allocate(float $amountNet, array $basesByLineId, int $precision = 3): array
    {
        $amountNet = round($amountNet, $precision);
        if ($amountNet <= 0 || $basesByLineId === []) {
            return [];
        }
        $sumBase = array_sum($basesByLineId);
        if ($sumBase <= 0) {
            return [];
        }
        $ids = array_keys($basesByLineId);
        $lastId = $ids[array_key_last($ids)];
        $out = [];
        $acc = 0.0;
        foreach ($basesByLineId as $lineId => $base) {
            if ($lineId === $lastId) {
                break;
            }
            $raw = $amountNet * ((float) $base / $sumBase);
            $v = round($raw, $precision);
            $out[$lineId] = $v;
            $acc = round($acc + $v, $precision);
        }
        $out[$lastId] = round($amountNet - $acc, $precision);

        return $out;
    }
}
