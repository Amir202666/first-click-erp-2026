<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class RestaurantOrder extends Model
{
    use BelongsToTenant;

    protected $fillable = [
        'tenant_id',
        'branch_id',
        'warehouse_id',
        'table_id',
        'customer_id',
        'order_type',
        'status',
        'invoice_id',
        'date',
        'subtotal',
        'tax_amount',
        'total',
    ];

    protected $casts = [
        'date' => 'date',
        'subtotal' => 'decimal:3',
        'tax_amount' => 'decimal:3',
        'total' => 'decimal:3',
    ];

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function table(): BelongsTo
    {
        return $this->belongsTo(RestaurantTable::class, 'table_id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }

    public function lines(): HasMany
    {
        return $this->hasMany(RestaurantOrderLine::class, 'restaurant_order_id')->orderBy('sort_order');
    }

    public function kitchenTicket(): \Illuminate\Database\Eloquent\Relations\HasOne
    {
        return $this->hasOne(KitchenTicket::class, 'restaurant_order_id');
    }

    public function recalculate(): void
    {
        $subtotal = 0;
        $taxAmount = 0;
        foreach ($this->lines as $line) {
            $line->calculateTotals();
            $line->saveQuietly();
            $subtotal += (float) $line->amount;
            $taxAmount += (float) $line->tax_amount;
        }
        $this->subtotal = round($subtotal, 3);
        $this->tax_amount = round($taxAmount, 3);
        $this->total = round($subtotal + $taxAmount, 3);
        $this->saveQuietly();
    }
}
