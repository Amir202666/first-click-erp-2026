<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class KitchenTicketLine extends Model
{
    protected $fillable = [
        'ticket_id',
        'invoice_line_id',
        'item_name',
        'quantity',
        'modifiers_text',
        'kitchen_note',
        'is_completed',
    ];

    protected $casts = [
        'is_completed' => 'boolean',
    ];

    public function ticket(): BelongsTo
    {
        return $this->belongsTo(KitchenTicket::class, 'ticket_id');
    }

    public function invoiceLine(): BelongsTo
    {
        return $this->belongsTo(InvoiceLine::class, 'invoice_line_id');
    }
}
