<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InvoiceManufacturingFrozenComponent extends Model
{
    protected $fillable = [
        'batch_id', 'component_item_id', 'component_name', 'component_unit_id',
        'qty_in_component_unit', 'qty_base', 'unit_cost', 'total_cost', 'sort_order',
        'inventory_movement_out_id',
    ];

    protected $casts = [
        'qty_in_component_unit' => 'decimal:6',
        'qty_base' => 'decimal:6',
        'unit_cost' => 'decimal:4',
        'total_cost' => 'decimal:3',
    ];

    public function batch(): BelongsTo
    {
        return $this->belongsTo(InvoiceManufacturingFrozenBatch::class, 'batch_id');
    }

    public function componentItem(): BelongsTo
    {
        return $this->belongsTo(Item::class, 'component_item_id');
    }
}
