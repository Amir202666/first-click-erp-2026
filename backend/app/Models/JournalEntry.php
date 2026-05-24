<?php

namespace App\Models;

use App\Services\FiscalYearLockService;
use App\Traits\Auditable;
use App\Traits\BelongsToTenant;
use App\Traits\HasAutoNumber;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class JournalEntry extends Model
{
    use Auditable, BelongsToTenant, HasAutoNumber;

    protected static function booted(): void
    {
        static::creating(function (JournalEntry $je) {
            FiscalYearLockService::assertDateWritable((int) $je->tenant_id, $je->date);
        });
        static::updating(function (JournalEntry $je) {
            if ($je->isDirty('date')) {
                FiscalYearLockService::assertDateWritable((int) $je->tenant_id, $je->date);
            }
            $dirty = $je->getDirty();
            unset($dirty['updated_at'], $dirty['date']);
            if ($dirty !== []) {
                $orig = $je->getOriginal('date');
                FiscalYearLockService::assertDateWritable((int) $je->tenant_id, $orig);
            }
        });
        static::deleting(function (JournalEntry $je) {
            FiscalYearLockService::assertDateWritable((int) $je->tenant_id, $je->date);
        });
    }

    protected string $numberPrefix = 'JE';

    protected $fillable = [
        'tenant_id', 'number', 'date', 'type', 'description',
        'customer_id', 'vendor_id', 'branch_id',
        'reference_type', 'reference_id', 'currency',
        'total_debit', 'total_credit', 'status', 'created_by', 'posted_at',
    ];

    protected $casts = [
        'date' => 'date',
        'posted_at' => 'datetime',
        'total_debit' => 'decimal:4',
        'total_credit' => 'decimal:4',
    ];

    public function lines(): HasMany
    {
        return $this->hasMany(JournalEntryLine::class)->orderBy('id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function vendor(): BelongsTo
    {
        return $this->belongsTo(Vendor::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function isBalanced(): bool
    {
        return bccomp((string) $this->total_debit, (string) $this->total_credit, 4) === 0;
    }

    public function recalculateTotals(): void
    {
        $this->total_debit = $this->lines()->sum('debit');
        $this->total_credit = $this->lines()->sum('credit');
        $this->saveQuietly();
    }

    /**
     * توليد رقم قيد فريد ببادئة مختلفة عن JE (مثل MFG لسند التصنيع).
     */
    public static function nextNumberForTenantPrefix(int $tenantId, string $prefix): string
    {
        $year = date('Y');
        $fullPrefix = $prefix.$year.'-';

        $last = static::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->where('number', 'like', $fullPrefix.'%')
            ->orderByRaw("CAST(REPLACE(number, '{$fullPrefix}', '') AS INTEGER) DESC")
            ->value('number');

        if ($last) {
            $lastNum = (int) str_replace($fullPrefix, '', $last);

            return $fullPrefix.str_pad((string) ($lastNum + 1), 6, '0', STR_PAD_LEFT);
        }

        return $fullPrefix.'000001';
    }
}
