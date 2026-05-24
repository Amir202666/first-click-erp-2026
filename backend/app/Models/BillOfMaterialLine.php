<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BillOfMaterialLine extends Model
{
    protected $table = 'bill_of_material_lines';

    protected $appends = ['line_total'];

    protected $fillable = [
        'bill_of_material_id',
        'component_item_id',
        'quantity',
        'unit_id',
        'unit_cost',
        'sort_order',
    ];

    protected $casts = [
        'quantity' => 'decimal:4',
        'unit_cost' => 'decimal:4',
    ];

    public function billOfMaterial(): BelongsTo
    {
        return $this->belongsTo(BillOfMaterial::class);
    }

    public function componentItem(): BelongsTo
    {
        return $this->belongsTo(Item::class, 'component_item_id');
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(ItemUnit::class, 'unit_id');
    }

    public function getLineTotalAttribute(): float
    {
        $cost = $this->unit_cost !== null
            ? (float) $this->unit_cost
            : (float) ($this->componentItem->cost_price ?? 0);

        return round((float) $this->quantity * $cost, 4);
    }
}
