<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ProductionOrder extends Model
{
    use BelongsToTenant;

    public const STATUS_DRAFT = 'draft';

    public const STATUS_APPROVED = 'approved';

    public const STATUS_COMPLETED = 'completed';

    protected $fillable = [
        'tenant_id',
        'number',
        'order_date',
        'finished_item_id',
        'quantity',
        'bill_of_material_id',
        'status',
        'raw_warehouse_id',
        'finished_warehouse_id',
        'branch_id',
        'cost_center_id',
        'created_by',
        'total_cost',
        'overhead_cost',
        'line_overrides',
        'approved_at',
        'approved_by',
        'journal_entry_id',
        'notes',
    ];

    protected $casts = [
        'order_date' => 'date',
        'quantity' => 'decimal:4',
        'total_cost' => 'decimal:4',
        'overhead_cost' => 'decimal:4',
        'line_overrides' => 'array',
        'approved_at' => 'datetime',
    ];

    public function finishedItem(): BelongsTo
    {
        return $this->belongsTo(Item::class, 'finished_item_id');
    }

    public function billOfMaterial(): BelongsTo
    {
        return $this->belongsTo(BillOfMaterial::class);
    }

    public function rawWarehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class, 'raw_warehouse_id');
    }

    public function finishedWarehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class, 'finished_warehouse_id');
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function costCenter(): BelongsTo
    {
        return $this->belongsTo(CostCenter::class);
    }

    public function createdByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function approvedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function materials(): HasMany
    {
        return $this->hasMany(ProductionOrderMaterial::class);
    }

    public function expenses(): HasMany
    {
        return $this->hasMany(ProductionOrderExpense::class)->orderBy('sort_order')->orderBy('id');
    }
}
