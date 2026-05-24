<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SubscriptionPlan extends Model
{
    protected $fillable = [
        'name',
        'slug',
        'description',
        'price',
        'currency',
        'billing_cycle_months',
        'duration_days',
        'max_users',
        'features',
        'is_active',
        'sort_order',
    ];

    /** عدد أيام الباقة (إن وُجد duration_days وإلا من الأشهر) */
    public function getDurationDaysAttribute(): int
    {
        $days = $this->attributes['duration_days'] ?? null;
        if ($days !== null && $days > 0) {
            return (int) $days;
        }
        $months = (int) ($this->attributes['billing_cycle_months'] ?? 12);

        return $months * 30;
    }

    protected $casts = [
        'price' => 'decimal:2',
        'features' => 'array',
        'is_active' => 'boolean',
    ];

    public function subscriptions(): HasMany
    {
        return $this->hasMany(Subscription::class);
    }
}
