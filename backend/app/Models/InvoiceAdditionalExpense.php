<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InvoiceAdditionalExpense extends Model
{
    protected $fillable = [
        'invoice_id',
        'sort_order',
        'description',
        'expense_account_id',
        'creditor_account_id',
        'amount_net',
        'tax_amount',
        'total_amount',
        'allocation_method',
        'distribution_snapshot',
    ];

    protected $casts = [
        'amount_net' => 'decimal:3',
        'tax_amount' => 'decimal:3',
        'total_amount' => 'decimal:3',
        'distribution_snapshot' => 'array',
    ];

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }

    public function expenseAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'expense_account_id');
    }

    public function creditorAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'creditor_account_id');
    }
}
