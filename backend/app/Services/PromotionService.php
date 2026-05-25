<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Item;
use App\Models\Promotion;
use App\Models\PromotionUsage;
use Carbon\Carbon;
use Illuminate\Support\Collection;

class PromotionService
{
    private const TZ = 'Asia/Kuwait';

    /**
     * @param  array<int>  $itemIds
     */
    public function getEligiblePromotions(
        int $tenantId,
        string $channel,
        float $orderTotal,
        ?int $customerId = null,
        array $itemIds = []
    ): Collection {
        $now = Carbon::now(self::TZ);
        $today = $now->toDateString();
        $time = $now->format('H:i:s');
        $dow = (string) $now->dayOfWeek;

        $promos = Promotion::where('tenant_id', $tenantId)
            ->where('status', 'active')
            ->where(fn ($q) => $q->whereNull('start_date')->orWhere('start_date', '<=', $today))
            ->where(fn ($q) => $q->whereNull('end_date')->orWhere('end_date', '>=', $today))
            ->where(fn ($q) => $q->whereNull('max_uses')->orWhereColumn('current_uses', '<', 'max_uses'))
            ->where('min_purchase_amount', '<=', $orderTotal)
            ->orderByDesc('priority')
            ->get();

        $itemCategoryMap = $this->itemCategoryMap($tenantId, $itemIds);

        return $promos->filter(function (Promotion $p) use ($channel, $customerId, $itemIds, $dow, $time, $itemCategoryMap) {
            $channels = $p->channels ?? ['invoice', 'pos'];
            if (! in_array($channel, $channels, true)) {
                return false;
            }

            if ($p->active_from && $p->active_to) {
                $from = strlen((string) $p->active_from) > 8 ? substr((string) $p->active_from, -8) : (string) $p->active_from;
                $to = strlen((string) $p->active_to) > 8 ? substr((string) $p->active_to, -8) : (string) $p->active_to;
                if ($time < $from || $time > $to) {
                    return false;
                }
            }

            $activeDays = $p->active_days;
            if (is_array($activeDays) && $activeDays !== [] && ! in_array($dow, array_map('strval', $activeDays), true)) {
                return false;
            }

            if ($p->max_uses_per_day) {
                $todayCount = PromotionUsage::where('promotion_id', $p->id)
                    ->whereDate('used_at', $now->toDateString())
                    ->count();
                if ($todayCount >= $p->max_uses_per_day) {
                    return false;
                }
            }

            if ($customerId) {
                $customerIds = $p->customer_ids;
                if (is_array($customerIds) && $customerIds !== [] && ! in_array($customerId, array_map('intval', $customerIds), true)) {
                    return false;
                }
                $tiers = $p->customer_tiers;
                if (is_array($tiers) && $tiers !== []) {
                    $tierName = Customer::find($customerId)?->loyaltyTier?->name;
                    if (! $tierName || ! in_array($tierName, $tiers, true)) {
                        return false;
                    }
                }
                if ($p->max_uses_per_customer) {
                    $custCount = PromotionUsage::where('promotion_id', $p->id)
                        ->where('customer_id', $customerId)
                        ->count();
                    if ($custCount >= $p->max_uses_per_customer) {
                        return false;
                    }
                }
            } else {
                if (($p->customer_ids && $p->customer_ids !== []) || ($p->customer_tiers && $p->customer_tiers !== [])) {
                    return false;
                }
            }

            $promoItemIds = $p->item_ids;
            if (is_array($promoItemIds) && $promoItemIds !== []) {
                if ($itemIds === [] || ! array_intersect($itemIds, array_map('intval', $promoItemIds))) {
                    return false;
                }
            }

            $promoCategoryIds = $p->category_ids;
            if (is_array($promoCategoryIds) && $promoCategoryIds !== []) {
                $catIds = array_map('intval', $promoCategoryIds);
                $orderCats = array_values(array_filter(array_map(
                    fn ($id) => $itemCategoryMap[$id] ?? null,
                    $itemIds
                )));
                if ($orderCats === [] || ! array_intersect($catIds, $orderCats)) {
                    return false;
                }
            }

            return true;
        })->values();
    }

    /**
     * @param  array<int, array<string, mixed>>  $items
     * @return array{promotion_id: int, promotion_name: string, type: string, discount_amount: float, final_amount: float}
     */
    public function calculateDiscount(Promotion $promo, float $orderTotal, array $items = []): array
    {
        $discount = match ($promo->type) {
            'percentage' => round($orderTotal * ((float) $promo->value / 100), 3),
            'fixed' => min((float) $promo->value, $orderTotal),
            'min_purchase' => $orderTotal >= (float) $promo->min_purchase_amount
                ? round($orderTotal * ((float) $promo->value / 100), 3)
                : 0,
            'bogo' => $this->calculateBOGO($promo, $items),
            default => 0,
        };

        if ($promo->max_discount_amount) {
            $discount = min($discount, (float) $promo->max_discount_amount);
        }

        $discount = round(max(0, $discount), 3);

        return [
            'promotion_id' => $promo->id,
            'promotion_name' => $promo->name,
            'type' => $promo->type,
            'discount_amount' => $discount,
            'final_amount' => round(max(0, $orderTotal - $discount), 3),
        ];
    }

    /**
     * @param  array<int, array<string, mixed>>  $lines
     * @return array{promotion: ?Promotion, promotion_discount: float}
     */
    public function resolvePromotion(
        int $tenantId,
        string $channel,
        float $orderTotal,
        ?int $requestedPromotionId,
        ?int $customerId,
        array $lines
    ): array {
        $itemIds = collect($lines)->pluck('item_id')->filter()->map(fn ($id) => (int) $id)->values()->all();
        $items = collect($lines)->map(fn ($l) => [
            'item_id' => (int) ($l['item_id'] ?? 0),
            'quantity' => (float) ($l['quantity'] ?? 0),
            'unit_price' => (float) ($l['unit_price'] ?? 0),
        ])->all();

        $eligible = $this->getEligiblePromotions($tenantId, $channel, $orderTotal, $customerId, $itemIds);

        $applied = null;
        if ($requestedPromotionId) {
            $applied = $eligible->firstWhere('id', $requestedPromotionId)
                ?? Promotion::where('tenant_id', $tenantId)->where('id', $requestedPromotionId)->where('status', 'active')->first();
        } elseif ($eligible->isNotEmpty()) {
            $applied = $eligible->first();
        }

        if (! $applied) {
            return ['promotion' => null, 'promotion_discount' => 0];
        }

        $calc = $this->calculateDiscount($applied, $orderTotal, $items);

        return [
            'promotion' => $applied,
            'promotion_discount' => (float) $calc['discount_amount'],
        ];
    }

    public function applyPromotion(
        Promotion $promo,
        string $channel,
        string $sourceType,
        int $sourceId,
        float $originalAmount,
        float $discountAmount,
        ?int $customerId,
        int $usedBy,
        ?array $appliedItems = null
    ): PromotionUsage {
        $usage = PromotionUsage::create([
            'tenant_id' => $promo->tenant_id,
            'promotion_id' => $promo->id,
            'source_type' => $sourceType,
            'source_id' => $sourceId,
            'customer_id' => $customerId,
            'channel' => $channel,
            'original_amount' => $originalAmount,
            'discount_amount' => $discountAmount,
            'final_amount' => round(max(0, $originalAmount - $discountAmount), 3),
            'applied_items' => $appliedItems,
            'used_at' => now(),
            'used_by' => $usedBy,
        ]);
        $promo->increment('current_uses');

        return $usage;
    }

    /**
     * @param  array<int, array<string, mixed>>  $items
     */
    private function calculateBOGO(Promotion $promo, array $items): float
    {
        $discount = 0.0;
        $buyQty = max(1, (int) ($promo->buy_quantity ?? 1));
        $getQty = max(1, (int) ($promo->get_quantity ?? 1));
        $getDisc = ((float) ($promo->get_discount_percent ?? 100)) / 100;
        $groupSize = $buyQty + $getQty;
        $idx = 0;

        foreach (collect($items)->sortByDesc('unit_price') as $item) {
            $posInGroup = $idx % $groupSize;
            if ($posInGroup >= $buyQty) {
                $qty = min((float) ($item['quantity'] ?? 1), 1);
                $discount += round((float) ($item['unit_price'] ?? 0) * $qty * $getDisc, 3);
            }
            $idx++;
        }

        return round($discount, 3);
    }

    /**
     * @param  array<int>  $itemIds
     * @return array<int, int|null>
     */
    private function itemCategoryMap(int $tenantId, array $itemIds): array
    {
        if ($itemIds === []) {
            return [];
        }

        return Item::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->whereIn('id', $itemIds)
            ->pluck('category_id', 'id')
            ->map(fn ($c) => $c ? (int) $c : null)
            ->all();
    }

    public static function rawSubtotalFromLines(array $lines): float
    {
        $sum = 0.0;
        foreach ($lines as $line) {
            $sum += (float) ($line['quantity'] ?? 0) * (float) ($line['unit_price'] ?? 0);
        }

        return round($sum, 3);
    }
}
