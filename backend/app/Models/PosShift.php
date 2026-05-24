<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PosShift extends Model
{
    use BelongsToTenant;

    protected static function booted(): void
    {
        static::deleting(function (PosShift $model) {
            if ($model->journal_entry_id) {
                $entry = \App\Models\JournalEntry::withoutGlobalScopes()->find($model->journal_entry_id);
                if ($entry) {
                    $entry->lines()->delete();
                    $entry->delete();
                }
            }
        });
    }

    protected $fillable = [
        'tenant_id', 'branch_id', 'user_id',
        'opened_at', 'closed_at', 'opening_cash', 'closing_cash', 'expected_cash', 'difference',
        'status', 'journal_entry_id', 'x_report_snapshot', 'z_report_snapshot',
    ];

    protected $casts = [
        'opened_at' => 'datetime',
        'closed_at' => 'datetime',
        'opening_cash' => 'decimal:4',
        'closing_cash' => 'decimal:4',
        'expected_cash' => 'decimal:4',
        'difference' => 'decimal:4',
        'x_report_snapshot' => 'array',
        'z_report_snapshot' => 'array',
    ];

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function sessions(): HasMany
    {
        return $this->hasMany(PosSession::class, 'shift_id');
    }

    public function journalEntry(): BelongsTo
    {
        return $this->belongsTo(JournalEntry::class, 'journal_entry_id');
    }

    public function isOpen(): bool
    {
        return $this->status === 'open';
    }

    /** الوردية مغلقة ومرحّلة محاسبياً (يوجد قيد يومية إغلاق) */
    public function isPosted(): bool
    {
        return $this->status === 'closed' && $this->journal_entry_id !== null;
    }
}
