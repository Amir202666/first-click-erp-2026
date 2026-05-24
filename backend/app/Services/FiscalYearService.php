<?php

namespace App\Services;

use App\Models\FiscalYear;
use App\Models\Invoice;
use App\Models\JournalEntry;
use App\Models\JournalEntryLine;
use Illuminate\Support\Facades\DB;

/**
 * فحوصات ما قبل إقفال السنة المالية (قيود، ميزان مراجعة، فواتير، أقساط).
 */
class FiscalYearService
{
    public function runPreCloseChecks(int $tenantId, FiscalYear $fy): array
    {
        $from = $fy->start_date->toDateString();
        $to = $fy->end_date->toDateString();

        $draftEntries = JournalEntry::where('tenant_id', $tenantId)
            ->where('status', 'draft')
            ->whereBetween('date', [$from, $to])
            ->count();

        $totalDebits = (float) JournalEntryLine::query()
            ->join('journal_entries', 'journal_entries.id', '=', 'journal_entry_lines.journal_entry_id')
            ->where('journal_entries.tenant_id', $tenantId)
            ->where('journal_entries.status', 'posted')
            ->whereBetween('journal_entries.date', [$from, $to])
            ->sum('journal_entry_lines.debit');

        $totalCredits = (float) JournalEntryLine::query()
            ->join('journal_entries', 'journal_entries.id', '=', 'journal_entry_lines.journal_entry_id')
            ->where('journal_entries.tenant_id', $tenantId)
            ->where('journal_entries.status', 'posted')
            ->whereBetween('journal_entries.date', [$from, $to])
            ->sum('journal_entry_lines.credit');

        $isBalanced = abs($totalDebits - $totalCredits) < 0.01;

        $pendingInvoices = Invoice::where('tenant_id', $tenantId)
            ->whereBetween('date', [$from, $to])
            ->whereRaw("COALESCE(document_status, 'draft') NOT IN ('posted', 'cancelled')")
            ->where(function ($q) {
                $q->whereNull('status')->orWhere('status', '!=', 'cancelled');
            })
            ->count();

        $overdueInstallments = (int) DB::table('installment_lines')
            ->join('installments', 'installments.id', '=', 'installment_lines.installment_id')
            ->where('installments.tenant_id', $tenantId)
            ->whereDate('installment_lines.due_date', '<', now()->toDateString())
            ->whereColumn('installment_lines.paid_amount', '<', 'installment_lines.amount')
            ->whereIn('installment_lines.status', ['pending', 'partial', 'overdue'])
            ->count();

        return [
            'journal_entries' => [
                'total_posted' => JournalEntry::where('tenant_id', $tenantId)
                    ->where('status', 'posted')
                    ->whereBetween('date', [$from, $to])
                    ->count(),
                'draft_count' => $draftEntries,
                'is_ok' => $draftEntries === 0,
            ],
            'trial_balance' => [
                'total_debits' => round($totalDebits, 3),
                'total_credits' => round($totalCredits, 3),
                'is_balanced' => $isBalanced,
                'difference' => round(abs($totalDebits - $totalCredits), 3),
            ],
            'invoices' => [
                'pending_count' => $pendingInvoices,
                'is_ok' => $pendingInvoices === 0,
            ],
            'installments' => [
                'overdue_count' => $overdueInstallments,
                'is_ok' => $overdueInstallments === 0,
            ],
            'can_close' => $isBalanced && $draftEntries === 0,
        ];
    }
}
