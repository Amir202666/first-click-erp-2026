<?php

namespace App\Models;

use App\Services\FiscalYearLockService;
use App\Traits\Auditable;
use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class OpeningStockHeader extends Model
{
    use Auditable, BelongsToTenant;

    protected $table = 'opening_stock_headers';

    protected static function booted(): void
    {
        static::creating(function (OpeningStockHeader $model) {
            FiscalYearLockService::assertDateWritable((int) $model->tenant_id, $model->date);
        });
        static::updating(function (OpeningStockHeader $model) {
            if ($model->isDirty('date')) {
                FiscalYearLockService::assertDateWritable((int) $model->tenant_id, $model->date);
            }
            $dirty = $model->getDirty();
            unset($dirty['updated_at'], $dirty['date']);
            if ($dirty !== []) {
                FiscalYearLockService::assertDateWritable((int) $model->tenant_id, $model->getOriginal('date'));
            }
        });
        static::deleting(function (OpeningStockHeader $model) {
            FiscalYearLockService::assertDateWritable((int) $model->tenant_id, $model->date);
            if ($model->journal_entry_id) {
                $entry = \App\Models\JournalEntry::withoutGlobalScopes()->find($model->journal_entry_id);
                if ($entry) {
                    $entry->lines()->delete();
                    $entry->delete();
                }
            }
            \App\Models\InventoryMovement::withoutGlobalScopes()
                ->where('reference_type', self::class)
                ->where('reference_id', $model->id)
                ->delete();
        });
    }

    protected $fillable = [
        'tenant_id', 'branch_id', 'warehouse_id', 'date', 'reference_number', 'notes',
        'status', 'source', 'fiscal_year_id',
        'journal_entry_id', 'created_by', 'approved_by', 'approved_at',
    ];

    protected $casts = [
        'date' => 'date',
        'approved_at' => 'datetime',
    ];

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function journalEntry(): BelongsTo
    {
        return $this->belongsTo(JournalEntry::class);
    }

    public function fiscalYear(): BelongsTo
    {
        return $this->belongsTo(FiscalYear::class, 'fiscal_year_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function items(): HasMany
    {
        return $this->hasMany(OpeningStockItem::class, 'opening_stock_header_id');
    }

    public function isDraft(): bool
    {
        return $this->status === 'draft';
    }

    public function isApproved(): bool
    {
        return $this->status === 'approved';
    }

    public function totalAmount(): float
    {
        return (float) $this->items()->sum('total_cost');
    }
}
