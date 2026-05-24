<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InvoiceLineSerial extends Model
{
    protected $fillable = ['invoice_line_id', 'item_serial_id'];

    public function invoiceLine(): BelongsTo
    {
        return $this->belongsTo(InvoiceLine::class);
    }

    public function itemSerial(): BelongsTo
    {
        return $this->belongsTo(ItemSerial::class);
    }
}
