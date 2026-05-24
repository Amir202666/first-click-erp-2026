<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use App\Traits\HasAutoNumber;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Quotation extends Model
{
    use BelongsToTenant, HasAutoNumber;

    protected string $numberPrefix = 'QT';

    protected $fillable = [
        'tenant_id', 'number', 'reference_number', 'type', 'status',
        'customer_id', 'vendor_id', 'branch_id', 'cost_center_id',
        'date', 'valid_until',
        'subtotal', 'tax_amount', 'discount_amount', 'total',
        'currency', 'exchange_rate', 'notes', 'created_by',
    ];

    protected $casts = [
        'date' => 'date',
        'valid_until' => 'date',
        'subtotal' => 'decimal:3',
        'tax_amount' => 'decimal:3',
        'discount_amount' => 'decimal:3',
        'total' => 'decimal:3',
        'exchange_rate' => 'decimal:8',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function vendor(): BelongsTo
    {
        return $this->belongsTo(Vendor::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function costCenter(): BelongsTo
    {
        return $this->belongsTo(CostCenter::class);
    }

    public function lines(): HasMany
    {
        return $this->hasMany(QuotationLine::class)->orderBy('sort_order');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** الفاتورة المُنشأة من هذا العرض (إن وُجدت) */
    public function convertedInvoice(): HasOne
    {
        return $this->hasOne(Invoice::class, 'quotation_id');
    }

    public function recalculate(): void
    {
        $this->subtotal = round((float) $this->lines()->sum('amount'), 2);
        $this->tax_amount = round((float) $this->lines()->sum('tax_amount'), 2);
        $this->total = round($this->subtotal + $this->tax_amount - (float) $this->discount_amount, 2);
        $this->saveQuietly();
    }

    public function isConverted(): bool
    {
        return $this->status === 'converted';
    }
}
