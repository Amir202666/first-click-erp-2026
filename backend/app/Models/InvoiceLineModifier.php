<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InvoiceLineModifier extends Model
{
    protected $fillable = [
        'invoice_line_id',
        'modifier_option_id',
        'name_snapshot',
        'price_delta',
        'kitchen_note',
    ];

    public function invoiceLine(): BelongsTo
    {
        return $this->belongsTo(InvoiceLine::class, 'invoice_line_id');
    }

    public function modifierOption(): BelongsTo
    {
        return $this->belongsTo(ProductModifierOption::class, 'modifier_option_id');
    }
}
