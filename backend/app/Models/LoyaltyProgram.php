<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class LoyaltyProgram extends Model
{
    protected $fillable = [
        'tenant_id',
        'name',
        'code',
        'description',
        'color',
        'icon',
        'is_active',
        'points_per_currency',
        'point_value',
        'min_redeem_points',
        'max_redeem_percent',
        'points_expiry_days',
        'apply_on_invoices',
        'apply_on_pos',
        'apply_on_delivery',
        'apply_on_restaurant',
        'applicable_customer_ids',
        'sort_order',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'apply_on_invoices' => 'boolean',
        'apply_on_pos' => 'boolean',
        'apply_on_delivery' => 'boolean',
        'apply_on_restaurant' => 'boolean',
        'points_per_currency' => 'float',
        'point_value' => 'float',
        'min_redeem_points' => 'integer',
        'max_redeem_percent' => 'integer',
        'points_expiry_days' => 'integer',
        'applicable_customer_ids' => 'array',
        'sort_order' => 'integer',
    ];

    public function tiers(): HasMany
    {
        return $this
            ->hasMany(LoyaltyTier::class)
            ->orderBy('min_points');
    }

    public function points(): HasMany
    {
        return $this->hasMany(LoyaltyPoint::class);
    }

    public function appliesTo(string $module): bool
    {
        return match ($module) {
            'invoices' => (bool) $this->apply_on_invoices,
            'pos' => (bool) $this->apply_on_pos,
            'delivery' => (bool) $this->apply_on_delivery,
            'restaurant' => (bool) $this->apply_on_restaurant,
            default => false,
        };
    }

    public function isEligibleFor(int $customerId): bool
    {
        $list = $this->applicable_customer_ids;
        if (! is_array($list) || count($list) === 0) {
            return true;
        }

        return in_array($customerId, array_map('intval', $list), true);
    }
}
