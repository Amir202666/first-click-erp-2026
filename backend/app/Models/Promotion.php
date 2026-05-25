<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Promotion extends Model
{
    use BelongsToTenant, SoftDeletes;

    protected $fillable = [
        'tenant_id',
        'name',
        'code',
        'description',
        'type',
        'value',
        'min_purchase_amount',
        'max_discount_amount',
        'buy_quantity',
        'get_quantity',
        'get_discount_percent',
        'channels',
        'customer_tiers',
        'customer_ids',
        'item_ids',
        'category_ids',
        'max_uses',
        'max_uses_per_day',
        'max_uses_per_customer',
        'current_uses',
        'start_date',
        'end_date',
        'active_days',
        'active_from',
        'active_to',
        'status',
        'is_combinable',
        'priority',
        'created_by',
    ];

    protected $casts = [
        'value' => 'decimal:3',
        'min_purchase_amount' => 'decimal:3',
        'max_discount_amount' => 'decimal:3',
        'get_discount_percent' => 'decimal:2',
        'channels' => 'array',
        'customer_tiers' => 'array',
        'customer_ids' => 'array',
        'item_ids' => 'array',
        'category_ids' => 'array',
        'active_days' => 'array',
        'is_combinable' => 'boolean',
        'start_date' => 'date',
        'end_date' => 'date',
    ];

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function usages(): HasMany
    {
        return $this->hasMany(PromotionUsage::class);
    }
}
