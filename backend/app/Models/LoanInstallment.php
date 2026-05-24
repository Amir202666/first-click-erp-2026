<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LoanInstallment extends Model
{
    protected $fillable = [
        'hr_request_id',
        'sequence',
        'due_month',
        'amount',
        'deducted_amount',
        'status',
        'payroll_line_id',
    ];

    protected $casts = [
        'due_month' => 'date',
        'amount' => 'decimal:3',
        'deducted_amount' => 'decimal:3',
    ];

    public function hrRequest(): BelongsTo
    {
        return $this->belongsTo(HrRequest::class);
    }

    public function payrollLine(): BelongsTo
    {
        return $this->belongsTo(PayrollLine::class);
    }
}
