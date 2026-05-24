<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use App\Traits\HasAutoNumber;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PayrollRun extends Model
{
    use BelongsToTenant, HasAutoNumber;

    protected $numberPrefix = 'PAY';

    protected $fillable = [
        'tenant_id',
        'number',
        'year',
        'month',
        'status',
        'generated_at',
        'approved_at',
        'journal_entry_id',
        'salary_expense_account_id',
        'salary_payable_account_id',
        'bank_account_id',
        'total_gross',
        'total_deductions',
        'total_net',
        'branch_id',
        'created_by',
    ];

    protected $casts = [
        'generated_at' => 'datetime',
        'approved_at' => 'datetime',
        'total_gross' => 'decimal:3',
        'total_deductions' => 'decimal:3',
        'total_net' => 'decimal:3',
    ];

    public function lines(): HasMany
    {
        return $this->hasMany(PayrollLine::class)->orderBy('id');
    }

    public function journalEntry(): BelongsTo
    {
        return $this->belongsTo(JournalEntry::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }
}
