<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RestaurantOrderLine extends Model
{
    protected $fillable = [
        'restaurant_order_id',
        'item_id',
        'description',
        'quantity',
        'unit_price',
        'discount_percent',
        'tax_percent',
        'amount',
        'tax_amount',
        'total',
        'sort_order',
    ];

    protected $casts = [
        'quantity' => 'decimal:3',
        'unit_price' => 'decimal:3',
        'discount_percent' => 'decimal:3',
        'tax_percent' => 'decimal:3',
        'amount' => 'decimal:3',
        'tax_amount' => 'decimal:3',
        'total' => 'decimal:3',
    ];

    public function restaurantOrder(): BelongsTo
    {
        return $this->belongsTo(RestaurantOrder::class);
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function calculateTotals(): void
    {
        $amount = (float) $this->quantity * (float) $this->unit_price * (1 - (float) ($this->discount_percent ?? 0) / 100);
        $taxPct = (float) ($this->tax_percent ?? 0);
        $this->amount = round($amount, 3);
        $this->tax_amount = round($amount * ($taxPct / 100), 3);
        $this->total = round($this->amount + $this->tax_amount, 3);
    }
}
