<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class LoyaltyTier extends Model
{
    protected $fillable = [
        'tenant_id',
        'loyalty_program_id',
        'name',
        'icon',
        'color',
        'min_points',
        'max_points',
        'points_multiplier',
        'extra_discount_percent',
        'sort_order',
    ];

    protected $casts = [
        'loyalty_program_id' => 'integer',
        'min_points' => 'integer',
        'max_points' => 'integer',
        'points_multiplier' => 'float',
        'extra_discount_percent' => 'float',
        'sort_order' => 'integer',
    ];

    public function program(): BelongsTo
    {
        return $this->belongsTo(LoyaltyProgram::class, 'loyalty_program_id');
    }

    public function customers(): HasMany
    {
        return $this->hasMany(Customer::class, 'loyalty_tier_id');
    }
}
