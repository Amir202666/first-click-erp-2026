<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DisassemblyOrderLine extends Model
{
    protected $fillable = [
        'disassembly_order_id',
        'item_id',
        'warehouse_id',
        'quantity',
        'unit_cost',
        'total_cost',
        'unit_id',
        'notes',
        'sort_order',
    ];

    protected $casts = [
        'quantity' => 'decimal:4',
        'unit_cost' => 'decimal:4',
        'total_cost' => 'decimal:4',
    ];

    public function disassemblyOrder(): BelongsTo
    {
        return $this->belongsTo(DisassemblyOrder::class);
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(ItemUnit::class, 'unit_id');
    }
}
