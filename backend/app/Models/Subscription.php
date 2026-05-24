<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Subscription extends Model
{
    use BelongsToTenant;

    protected $fillable = [
        'tenant_id',
        'subscription_plan_id',
        'starts_at',
        'ends_at',
        'cancelled_at',
        'auto_renew',
        'status',
        'amount_paid',
        'currency',
    ];

    protected $casts = [
        'starts_at' => 'datetime',
        'ends_at' => 'datetime',
        'cancelled_at' => 'datetime',
        'auto_renew' => 'boolean',
        'amount_paid' => 'decimal:2',
    ];

    public function plan(): BelongsTo
    {
        return $this->belongsTo(SubscriptionPlan::class, 'subscription_plan_id');
    }

    public function isExpiringSoon(int $days = 30): bool
    {
        return $this->ends_at->diffInDays(now(), false) <= $days;
    }
}
