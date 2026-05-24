<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use App\Traits\HasAutoNumber;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PurchaseRequest extends Model
{
    use BelongsToTenant, HasAutoNumber;

    protected string $numberPrefix = 'PR';

    protected $fillable = [
        'tenant_id', 'number', 'date', 'vendor_id', 'branch_id', 'warehouse_id',
        'reference_number', 'subtotal', 'tax_amount', 'discount_amount', 'total',
        'notes', 'created_by',
    ];

    protected $casts = [
        'date' => 'date',
        'subtotal' => 'decimal:3',
        'tax_amount' => 'decimal:3',
        'discount_amount' => 'decimal:3',
        'total' => 'decimal:3',
    ];

    public function vendor(): BelongsTo
    {
        return $this->belongsTo(Vendor::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function lines(): HasMany
    {
        return $this->hasMany(PurchaseRequestLine::class)->orderBy('sort_order');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** إعادة حساب المجموع والضريبة والخصم والصافي (الصافي = المجموع - الخصم) */
    public function recalculate(): void
    {
        $subtotal = 0;
        $taxTotal = 0;
        foreach ($this->lines as $line) {
            $line->calculateTotals();
            $line->saveQuietly();
            $subtotal += (float) $line->amount;
            $taxTotal += (float) $line->tax_amount;
        }
        $this->subtotal = round($subtotal, 3);
        $this->tax_amount = round($taxTotal, 3);
        $this->total = round($this->subtotal + $this->tax_amount - (float) $this->discount_amount, 3);
        $this->saveQuietly();
    }
}
