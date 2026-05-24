<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DeliveryAssignment extends Model
{
    use BelongsToTenant;

    protected $fillable = [
        'tenant_id', 'invoice_id', 'driver_id', 'status', 'custody_amount',
        'custody_transfer_journal_entry_id', 'assigned_at', 'delivered_at', 'settled_at', 'assigned_by',
    ];

    protected $casts = [
        'custody_amount' => 'decimal:3',
        'assigned_at' => 'datetime',
        'delivered_at' => 'datetime',
        'settled_at' => 'datetime',
    ];

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }

    public function driver(): BelongsTo
    {
        return $this->belongsTo(DeliveryDriver::class, 'driver_id');
    }

    public function custodyTransferJournalEntry(): BelongsTo
    {
        return $this->belongsTo(JournalEntry::class, 'custody_transfer_journal_entry_id');
    }

    public function assignedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_by');
    }
}
