<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PurchaseRequestLine extends Model
{
    protected $fillable = [
        'purchase_request_id', 'item_id', 'unit_id', 'description',
        'quantity', 'unit_price', 'discount_percent', 'tax_percent',
        'amount', 'tax_amount', 'total', 'sort_order',
    ];

    protected $casts = [
        'quantity' => 'decimal:4',
        'unit_price' => 'decimal:3',
        'discount_percent' => 'decimal:2',
        'tax_percent' => 'decimal:2',
        'amount' => 'decimal:3',
        'tax_amount' => 'decimal:3',
        'total' => 'decimal:3',
    ];

    public function purchaseRequest(): BelongsTo
    {
        return $this->belongsTo(PurchaseRequest::class);
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(ItemUnit::class, 'unit_id');
    }

    public function calculateTotals(): void
    {
        $this->amount = round($this->quantity * $this->unit_price * (1 - (float) $this->discount_percent / 100), 4);
        $this->tax_amount = round($this->amount * ((float) $this->tax_percent / 100), 4);
        $this->total = round($this->amount + $this->tax_amount, 4);
    }
}
