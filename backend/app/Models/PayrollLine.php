<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PayrollLine extends Model
{
    protected $fillable = [
        'payroll_run_id',
        'employee_id',
        'basic_salary',
        'housing_allowance',
        'transport_allowance',
        'other_allowances',
        'overtime_hours',
        'late_minutes',
        'absence_days',
        'overtime_amount',
        'late_deduction',
        'absence_deduction',
        'loan_deduction',
        'other_deductions',
        'net_pay',
    ];

    protected $casts = [
        'basic_salary' => 'decimal:3',
        'housing_allowance' => 'decimal:3',
        'transport_allowance' => 'decimal:3',
        'other_allowances' => 'decimal:3',
        'overtime_hours' => 'decimal:2',
        'absence_days' => 'decimal:2',
        'overtime_amount' => 'decimal:3',
        'late_deduction' => 'decimal:3',
        'absence_deduction' => 'decimal:3',
        'loan_deduction' => 'decimal:3',
        'other_deductions' => 'decimal:3',
        'net_pay' => 'decimal:3',
    ];

    public function payrollRun(): BelongsTo
    {
        return $this->belongsTo(PayrollRun::class);
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}
