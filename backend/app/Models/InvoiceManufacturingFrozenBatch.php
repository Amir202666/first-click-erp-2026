<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class InvoiceManufacturingFrozenBatch extends Model
{
    use BelongsToTenant;

    protected $fillable = [
        'tenant_id', 'invoice_id', 'invoice_line_id', 'bill_of_material_id',
        'branch_id', 'raw_warehouse_id', 'finished_warehouse_id',
        'finished_item_id', 'finished_quantity', 'finished_unit_id', 'finished_qty_base',
        'wip_total_cost_invoice', 'wip_total_cost_base',
    ];

    protected $casts = [
        'finished_quantity' => 'decimal:4',
        'finished_qty_base' => 'decimal:6',
        'wip_total_cost_invoice' => 'decimal:3',
        'wip_total_cost_base' => 'decimal:3',
    ];

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }

    public function invoiceLine(): BelongsTo
    {
        return $this->belongsTo(InvoiceLine::class);
    }

    public function billOfMaterial(): BelongsTo
    {
        return $this->belongsTo(BillOfMaterial::class, 'bill_of_material_id');
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function components(): HasMany
    {
        return $this->hasMany(InvoiceManufacturingFrozenComponent::class, 'batch_id')->orderBy('sort_order');
    }
}
