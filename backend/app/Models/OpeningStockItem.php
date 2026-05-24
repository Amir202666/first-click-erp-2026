<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OpeningStockItem extends Model
{
    protected $table = 'opening_stock_items';

    protected $fillable = [
        'opening_stock_header_id', 'item_id', 'quantity', 'unit_cost', 'total_cost', 'cost_center_id',
    ];

    protected $casts = [
        'quantity' => 'decimal:4',
        'unit_cost' => 'decimal:4',
        'total_cost' => 'decimal:4',
    ];

    public function openingStockHeader(): BelongsTo
    {
        return $this->belongsTo(OpeningStockHeader::class);
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function costCenter(): BelongsTo
    {
        return $this->belongsTo(CostCenter::class);
    }

    public function recalculateTotal(): void
    {
        $this->total_cost = (float) $this->quantity * (float) $this->unit_cost;
        $this->saveQuietly();
    }
}
