<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class LoyaltyPoint extends Model
{
    protected $fillable = [
        'tenant_id',
        'loyalty_program_id',
        'customer_id',
        'type',
        'points',
        'amount',
        'redeem_value',
        'source_type',
        'source_id',
        'reference',
        'notes',
        'expires_at',
        'processed_at',
        'created_by',
    ];

    protected $casts = [
        'expires_at' => 'date',
        'processed_at' => 'datetime',
        'loyalty_program_id' => 'integer',
        'points' => 'float',
        'amount' => 'float',
        'redeem_value' => 'float',
    ];

    public function program(): BelongsTo
    {
        return $this->belongsTo(LoyaltyProgram::class, 'loyalty_program_id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function source(): MorphTo
    {
        return $this->morphTo();
    }
}
