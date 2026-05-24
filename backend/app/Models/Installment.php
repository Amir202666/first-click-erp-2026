<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use App\Traits\HasAutoNumber;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Installment extends Model
{
    use BelongsToTenant, HasAutoNumber;

    protected $numberPrefix = 'INST';

    protected $fillable = [
        'tenant_id',
        'invoice_id',
        'number',
        'customer_id',
        'vendor_id',
        'account_id',
        'total_amount',
        'currency',
        'start_date',
        'frequency_months',
        'status',
        'journal_entry_id',
        'approved_at',
        'branch_id',
        'cost_center_id',
        'created_by',
        'notes',
    ];

    protected $casts = [
        'start_date' => 'date',
        'approved_at' => 'datetime',
        'total_amount' => 'decimal:3',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function vendor(): BelongsTo
    {
        return $this->belongsTo(Vendor::class);
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'account_id');
    }

    public function lines(): HasMany
    {
        return $this->hasMany(InstallmentLine::class)->orderBy('sequence');
    }

    public function journalEntry(): BelongsTo
    {
        return $this->belongsTo(JournalEntry::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function costCenter(): BelongsTo
    {
        return $this->belongsTo(CostCenter::class);
    }

    public function createdByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function getTotalPaidAttribute(): float
    {
        return (float) $this->lines->sum('paid_amount');
    }

    public function getTotalRemainingAttribute(): float
    {
        return (float) $this->total_amount - $this->total_paid;
    }
}
