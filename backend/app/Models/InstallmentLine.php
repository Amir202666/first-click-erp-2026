<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InstallmentLine extends Model
{
    protected $table = 'installment_lines';

    protected $fillable = [
        'installment_id',
        'sequence',
        'due_date',
        'amount',
        'paid_amount',
        'status',
        'paid_at',
        'payment_id',
    ];

    protected $casts = [
        'due_date' => 'date',
        'amount' => 'decimal:3',
        'paid_amount' => 'decimal:3',
        'paid_at' => 'datetime',
    ];

    public function installment(): BelongsTo
    {
        return $this->belongsTo(Installment::class);
    }

    public function payment(): BelongsTo
    {
        return $this->belongsTo(Payment::class);
    }

    public function getRemainingAttribute(): float
    {
        return (float) $this->amount - (float) $this->paid_amount;
    }

    public function updateStatus(): void
    {
        $paid = (float) $this->paid_amount;
        $amount = (float) $this->amount;
        $status = 'pending';
        if ($paid >= $amount) {
            $status = 'paid';
        } elseif ($paid > 0) {
            $status = 'partial';
        } elseif ($this->due_date->isPast()) {
            $status = 'overdue';
        }
        $this->update(['status' => $status]);
    }
}
