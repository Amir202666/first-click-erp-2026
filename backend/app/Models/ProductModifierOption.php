<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductModifierOption extends Model
{
    protected $fillable = [
        'group_id',
        'name',
        'price_delta',
        'sort_order',
    ];

    protected $casts = [
        'price_delta' => 'decimal:3',
    ];

    public function group(): BelongsTo
    {
        return $this->belongsTo(ProductModifierGroup::class, 'group_id');
    }
}
