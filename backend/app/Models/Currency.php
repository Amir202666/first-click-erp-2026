<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class Currency extends Model
{
    use BelongsToTenant;

    protected $fillable = [
        'tenant_id', 'code', 'name', 'name_en', 'symbol', 'decimal_places',
        'exchange_rate', 'base_currency', 'rate_date', 'is_active', 'is_default',
    ];

    protected $casts = [
        'exchange_rate' => 'decimal:8',
        'is_active' => 'boolean',
        'is_default' => 'boolean',
        'rate_date' => 'date',
    ];
}
