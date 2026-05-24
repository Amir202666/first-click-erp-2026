<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use App\Traits\HasAutoNumber;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class HrRequest extends Model
{
    use BelongsToTenant, HasAutoNumber;

    protected $numberPrefix = 'REQ';

    protected $fillable = [
        'tenant_id',
        'number',
        'employee_id',
        'type',
        'status',
        'requested_at',
        'from_date',
        'to_date',
        'amount',
        'installments_count',
        'reason',
        'approved_by',
        'approved_at',
        'rejected_by',
        'rejected_at',
        'rejection_reason',
    ];

    protected $casts = [
        'requested_at' => 'date',
        'from_date' => 'date',
        'to_date' => 'date',
        'approved_at' => 'datetime',
        'rejected_at' => 'datetime',
        'amount' => 'decimal:3',
    ];

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function loanInstallments(): HasMany
    {
        return $this->hasMany(LoanInstallment::class)->orderBy('sequence');
    }
}
