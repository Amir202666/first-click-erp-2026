<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductionOrderMaterial extends Model
{
    protected $table = 'production_order_materials';

    protected $fillable = [
        'production_order_id',
        'item_id',
        'quantity_required',
        'quantity_consumed',
        'unit_cost',
        'total_cost',
    ];

    protected $casts = [
        'quantity_required' => 'decimal:4',
        'quantity_consumed' => 'decimal:4',
        'unit_cost' => 'decimal:4',
        'total_cost' => 'decimal:4',
    ];

    public function productionOrder(): BelongsTo
    {
        return $this->belongsTo(ProductionOrder::class);
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }
}
