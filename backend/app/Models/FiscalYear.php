<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class FiscalYear extends Model
{
    use BelongsToTenant;

    protected $fillable = [
        'tenant_id',
        'year',
        'start_date',
        'end_date',
        'is_closed',
        'closed_at',
        'is_locked',
        'locked_at',
        'closing_journal_entry_id',
        'retained_earnings_account_id',
        'opening_journal_entry_id',
        'opening_balances_snapshot',
        'inventory_snapshot',
        'inventory_carried_forward',
        'notes',
        'closed_by',
        'closing_summary',
    ];

    protected $casts = [
        'start_date' => 'date',
        'end_date' => 'date',
        'is_closed' => 'boolean',
        'closed_at' => 'datetime',
        'is_locked' => 'boolean',
        'locked_at' => 'datetime',
        'opening_balances_snapshot' => 'array',
        'inventory_snapshot' => 'array',
        'inventory_carried_forward' => 'boolean',
        'closing_summary' => 'array',
    ];

    public function isClosed(): bool
    {
        return (bool) $this->is_closed;
    }

    public function closingJournalEntry(): BelongsTo
    {
        return $this->belongsTo(JournalEntry::class, 'closing_journal_entry_id');
    }

    public function retainedEarningsAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'retained_earnings_account_id');
    }

    public function openingJournalEntry(): BelongsTo
    {
        return $this->belongsTo(JournalEntry::class, 'opening_journal_entry_id');
    }

    public function closedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'closed_by');
    }

    public function openingStockHeaders(): HasMany
    {
        return $this->hasMany(OpeningStockHeader::class, 'fiscal_year_id');
    }

    public function containsDate(\Carbon\CarbonInterface|string $date): bool
    {
        $d = \Carbon\Carbon::parse($date)->format('Y-m-d');

        return $d >= $this->start_date->format('Y-m-d')
            && $d <= $this->end_date->format('Y-m-d');
    }
}
