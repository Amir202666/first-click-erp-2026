<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PromotionUsage extends Model
{
    use BelongsToTenant;

    protected $fillable = [
        'tenant_id',
        'promotion_id',
        'source_type',
        'source_id',
        'customer_id',
        'channel',
        'original_amount',
        'discount_amount',
        'final_amount',
        'applied_items',
        'used_at',
        'used_by',
    ];

    protected $casts = [
        'original_amount' => 'decimal:3',
        'discount_amount' => 'decimal:3',
        'final_amount' => 'decimal:3',
        'applied_items' => 'array',
        'used_at' => 'datetime',
    ];

    public function promotion(): BelongsTo
    {
        return $this->belongsTo(Promotion::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function usedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'used_by');
    }
}
