<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InventoryAdjustmentLine extends Model
{
    use BelongsToTenant;

    protected $fillable = [
        'tenant_id',
        'inventory_adjustment_id',
        'item_id',
        'quantity',
        'display_quantity',
        'unit_id',
        'conversion_factor',
        'unit_cost',
        'total_cost',
        'action',
    ];

    protected $casts = [
        'quantity' => 'decimal:6',
        'display_quantity' => 'decimal:6',
        'conversion_factor' => 'decimal:6',
        'unit_cost' => 'decimal:6',
        'total_cost' => 'decimal:6',
    ];

    public function header(): BelongsTo
    {
        return $this->belongsTo(InventoryAdjustment::class, 'inventory_adjustment_id');
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }
}
