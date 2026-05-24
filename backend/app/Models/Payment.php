<?php

namespace App\Models;

use App\Services\FiscalYearLockService;
use App\Traits\Auditable;
use App\Traits\BelongsToTenant;
use App\Traits\HasAutoNumber;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Payment extends Model
{
    use Auditable, BelongsToTenant, HasAutoNumber;

    protected static function booted(): void
    {
        static::creating(function (Payment $model) {
            FiscalYearLockService::assertDateWritable((int) $model->tenant_id, $model->date);
        });
        static::updating(function (Payment $model) {
            if ($model->isDirty('date')) {
                FiscalYearLockService::assertDateWritable((int) $model->tenant_id, $model->date);
            }
            $dirty = $model->getDirty();
            unset($dirty['updated_at'], $dirty['date']);
            if ($dirty !== []) {
                FiscalYearLockService::assertDateWritable((int) $model->tenant_id, $model->getOriginal('date'));
            }
        });
        static::deleting(function (Payment $model) {
            FiscalYearLockService::assertDateWritable((int) $model->tenant_id, $model->date);
            if ($model->journal_entry_id) {
                $entry = \App\Models\JournalEntry::withoutGlobalScopes()->find($model->journal_entry_id);
                if ($entry) {
                    $entry->lines()->delete();
                    $entry->delete();
                }
            }
        });

        static::deleted(function (Payment $model) {
            if ($model->invoice_id) {
                app(\App\Services\PaymentService::class)->syncInvoiceAndRebuildInstallmentLines(
                    (int) $model->invoice_id,
                    (int) $model->tenant_id
                );
            }
        });
    }

    protected string $numberPrefix = 'PAY';

    protected $appends = ['attachment_url'];

    protected $fillable = [
        'tenant_id', 'number', 'type', 'date', 'amount',
        'currency', 'payment_method', 'payment_method_id', 'reference',
        'customer_id', 'vendor_id', 'invoice_id', 'branch_id', 'cost_center_id',
        'cash_bank_account_id', 'counterpart_account_id', 'journal_entry_id',
        'notes', 'attachment', 'status', 'created_by', 'sales_rep_id', 'pos_shift_id',
    ];

    protected $casts = [
        'date' => 'date',
        'amount' => 'decimal:3',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function vendor(): BelongsTo
    {
        return $this->belongsTo(Vendor::class);
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function costCenter(): BelongsTo
    {
        return $this->belongsTo(CostCenter::class);
    }

    public function cashBankAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'cash_bank_account_id');
    }

    public function counterpartAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'counterpart_account_id');
    }

    public function paymentMethodRelation(): BelongsTo
    {
        return $this->belongsTo(PaymentMethod::class, 'payment_method_id');
    }

    public function paymentMethod(): BelongsTo
    {
        return $this->belongsTo(PaymentMethod::class, 'payment_method_id');
    }

    public function journalEntry(): BelongsTo
    {
        return $this->belongsTo(JournalEntry::class);
    }

    public function salesRep(): BelongsTo
    {
        return $this->belongsTo(SalesRep::class, 'sales_rep_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function getAttachmentUrlAttribute(): ?string
    {
        if (! $this->attachment) {
            return null;
        }

        return \Illuminate\Support\Facades\Storage::disk('public')->exists($this->attachment)
            ? asset('storage/'.$this->attachment)
            : null;
    }
}
