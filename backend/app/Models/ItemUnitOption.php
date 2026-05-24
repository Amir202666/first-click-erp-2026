<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ItemUnitOption extends Model
{
    protected $fillable = [
        'item_id', 'unit_id', 'conversion_factor', 'is_base', 'sort_order',
        'selling_price', 'cost_price', 'barcode',
    ];

    protected $casts = [
        'conversion_factor' => 'decimal:6',
        'is_base' => 'boolean',
        'selling_price' => 'decimal:4',
        'cost_price' => 'decimal:4',
    ];

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(ItemUnit::class, 'unit_id');
    }
}
