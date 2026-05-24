<?php

namespace App\Services;

use App\Models\Invoice;
use App\Models\InvoiceLine;
use App\Models\InvoicePayment;
use App\Models\Payment;
use App\Models\PosSession;
use App\Models\PosShift;
use Carbon\Carbon;
use Illuminate\Support\Collection;

class PosShiftReportService
{
    /**
     * حساب إجماليات الوردية من الفواتير والمدفوعات (نفس منطق تقرير Z / X).
     *
     * @return array{
     *   invoices_count:int,total_sales:float,total_returns:float,returns_count:int,total_tax:float,
     *   items_sold_count:int,opening_cash:float,cash_received:float,total_expenses:float,expected_cash:float,
     *   total_received:float,by_payment_method:array<int,array<string,mixed>>,sales_by_payment_type:array<string,float>
     * }
     */
    public function computeShiftTotals(int $tenantId, PosShift $shift): array
    {
        $openingCash = (float) $shift->opening_cash;

        $sessionIds = PosSession::query()
            ->where('tenant_id', $tenantId)
            ->where('shift_id', $shift->id)
            ->pluck('id');

        $invoices = Invoice::where('tenant_id', $tenantId)
            ->where('type', 'sales')
            ->where(function ($q) use ($shift, $sessionIds) {
                $q->where('pos_shift_id', $shift->id);
                if ($sessionIds->isNotEmpty()) {
                    $q->orWhereIn('pos_session_id', $sessionIds);
                }
            })
            ->where(function ($q) {
                $q->whereNull('is_return')->orWhere('is_return', false);
            })
            ->get(['id', 'total', 'tax_amount']);

        // Fallback: بعض الفواتير القديمة/المهاجرة قد لا تحمل pos_shift_id أو pos_session_id.
        // نعتمد على (الفرع + الكاشير + فترة الوردية) لضمان ظهور الفواتير في التقارير.
        if ($invoices->isEmpty() && $shift->opened_at) {
            $openedAt = Carbon::parse($shift->opened_at);
            $closedAt = $shift->closed_at ? Carbon::parse($shift->closed_at) : now();
            $invoices = Invoice::where('tenant_id', $tenantId)
                ->where('type', 'sales')
                ->where('branch_id', (int) $shift->branch_id)
                ->where('created_by', (int) $shift->user_id)
                ->whereBetween('created_at', [$openedAt, $closedAt])
                ->where(function ($q) {
                    $q->whereNull('is_return')->orWhere('is_return', false);
                })
                ->get(['id', 'total', 'tax_amount']);
        }

        $totalSales = (float) $invoices->sum('total');
        $totalTax = (float) $invoices->sum('tax_amount');
        $invoiceIds = $invoices->pluck('id');
        $itemsSoldCount = (int) InvoiceLine::whereIn('invoice_id', $invoiceIds)->sum('quantity');

        $returnsInShift = Invoice::where('tenant_id', $tenantId)
            ->where('is_return', true)
            ->whereIn('parent_invoice_id', $invoiceIds)
            ->get(['id', 'total']);
        $totalReturns = (float) $returnsInShift->sum('total');
        $returnsCount = $returnsInShift->count();

        $paymentSummary = InvoicePayment::whereIn('invoice_id', $invoiceIds)
            ->with('paymentMethod:id,name,name_en,type')
            ->get()
            ->groupBy('payment_method_id')
            ->map(function ($rows, $methodId) {
                $first = $rows->first();
                $method = $first?->paymentMethod;

                return [
                    'payment_method_id' => (int) $methodId,
                    'name' => $method?->name ?? '',
                    'name_en' => $method?->name_en ?? '',
                    'type' => $method?->type ?? 'other',
                    'amount' => (float) $rows->sum('amount'),
                    'count' => $rows->count(),
                ];
            })
            ->values()
            ->all();

        $cashReceived = collect($paymentSummary)->where('type', 'cash')->sum('amount');
        $totalExpenses = (float) Payment::where('tenant_id', $tenantId)
            ->where('pos_shift_id', $shift->id)
            ->where('type', 'payment')
            ->sum('amount');
        $expectedCash = $openingCash + $cashReceived - $totalReturns - $totalExpenses;
        $totalReceived = (float) collect($paymentSummary)->sum('amount');

        $salesByType = [];
        foreach ($paymentSummary as $row) {
            $type = (string) ($row['type'] ?? 'other');
            $salesByType[$type] = ($salesByType[$type] ?? 0) + (float) ($row['amount'] ?? 0);
        }

        return [
            'invoices_count' => $invoices->count(),
            'total_sales' => round($totalSales, 3),
            'total_returns' => round($totalReturns, 3),
            'returns_count' => $returnsCount,
            'total_tax' => round($totalTax, 3),
            'items_sold_count' => $itemsSoldCount,
            'opening_cash' => round($openingCash, 3),
            'cash_received' => round((float) $cashReceived, 3),
            'total_expenses' => round($totalExpenses, 3),
            'expected_cash' => round($expectedCash, 3),
            'total_received' => round($totalReceived, 3),
            'by_payment_method' => $paymentSummary,
            'sales_by_payment_type' => array_map(fn ($v) => round((float) $v, 3), $salesByType),
        ];
    }

    /**
     * بيانات العرض للوردية: يفضّل لقطة Z للمغلقة، وإلا حساب مباشر.
     *
     * @return array<string,mixed>
     */
    public function getShiftReportPayload(PosShift $shift, bool $forceRecompute = false): array
    {
        $tenantId = (int) $shift->tenant_id;

        if (! $forceRecompute && $shift->status === 'closed' && is_array($shift->z_report_snapshot) && $shift->z_report_snapshot !== []) {
            $snap = $shift->z_report_snapshot;
            $by = $snap['by_payment_method'] ?? [];
            $by = is_array($by) ? $by : [];
            $salesByType = [];
            $cashReceivedSnap = 0.0;
            foreach ($by as $row) {
                if (! is_array($row)) {
                    continue;
                }
                $type = (string) ($row['type'] ?? 'other');
                $amt = (float) ($row['amount'] ?? 0);
                $salesByType[$type] = ($salesByType[$type] ?? 0) + $amt;
                if ($type === 'cash') {
                    $cashReceivedSnap += $amt;
                }
            }

            $totals = [
                'invoices_count' => (int) ($snap['invoices_count'] ?? 0),
                'total_sales' => round((float) ($snap['total_sales'] ?? 0), 3),
                'total_returns' => round((float) ($snap['total_returns'] ?? 0), 3),
                'returns_count' => (int) ($snap['returns_count'] ?? 0),
                'total_tax' => round((float) ($snap['total_tax'] ?? 0), 3),
                'items_sold_count' => (int) ($snap['items_sold_count'] ?? 0),
                'opening_cash' => round((float) ($snap['opening_cash'] ?? 0), 3),
                'cash_received' => round($cashReceivedSnap, 3),
                'total_expenses' => round((float) ($snap['total_expenses'] ?? 0), 3),
                'expected_cash' => round((float) ($snap['expected_cash'] ?? 0), 3),
                'total_received' => round((float) collect($by)->sum(fn ($r) => is_array($r) ? (float) ($r['amount'] ?? 0) : 0), 3),
                'by_payment_method' => $by,
                'sales_by_payment_type' => array_map(fn ($v) => round((float) $v, 3), $salesByType),
            ];
        } else {
            $totals = $this->computeShiftTotals($tenantId, $shift);
        }

        $opened = $shift->opened_at;
        $shiftNumber = $opened
            ? 'SH-'.$opened->format('Y').'-'.str_pad((string) $shift->id, 5, '0', STR_PAD_LEFT)
            : 'SH-'.str_pad((string) $shift->id, 5, '0', STR_PAD_LEFT);

        return [
            'shift_number' => $shiftNumber,
            'total_invoices' => $totals['invoices_count'],
            'total_sales' => $totals['total_sales'],
            'total_returns' => $totals['total_returns'],
            'returns_count' => $totals['returns_count'],
            'total_tax' => $totals['total_tax'],
            'items_sold_count' => $totals['items_sold_count'],
            'opening_balance' => $totals['opening_cash'],
            'closing_balance_system' => $shift->status === 'closed'
                ? round((float) ($shift->expected_cash ?? $totals['expected_cash']), 3)
                : round($totals['expected_cash'], 3),
            'closing_balance_actual' => $shift->closing_cash !== null ? round((float) $shift->closing_cash, 3) : null,
            'cash_received' => $totals['cash_received'],
            'total_received' => $totals['total_received'],
            'total_expenses' => $totals['total_expenses'],
            'expected_cash' => $totals['expected_cash'],
            'sales_by_payment' => $totals['sales_by_payment_type'],
            'by_payment_method' => $totals['by_payment_method'],
            'difference' => $shift->difference !== null ? round((float) $shift->difference, 3) : null,
            'totals_source' => $shift->status === 'closed' && is_array($shift->z_report_snapshot) && ! $forceRecompute ? 'z_snapshot' : 'computed',
        ];
    }

    /**
     * إحصائيات مجمّعة لمجموعة ورديات (بعد تطبيق نفس فلاتر القائمة).
     *
     * @param  Collection<int,PosShift>  $shifts
     * @return array<string,int|float>
     */
    public function aggregateStats(Collection $shifts): array
    {
        $totalShifts = $shifts->count();
        $openShifts = $shifts->where('status', 'open')->count();
        $sumSales = 0.0;
        $sumInvoices = 0;
        $diffCount = 0;

        foreach ($shifts as $shift) {
            $payload = $this->getShiftReportPayload($shift);
            $sumSales += (float) ($payload['total_sales'] ?? 0);
            $sumInvoices += (int) ($payload['total_invoices'] ?? 0);
            if ($shift->status === 'closed' && $shift->difference !== null && abs((float) $shift->difference) > 0.001) {
                $diffCount++;
            }
        }

        return [
            'total_shifts' => $totalShifts,
            'total_sales' => round($sumSales, 3),
            'total_invoices' => $sumInvoices,
            'avg_per_shift' => $totalShifts > 0 ? round($sumSales / $totalShifts, 3) : 0.0,
            'open_shifts' => $openShifts,
            'shifts_with_diff' => $diffCount,
        ];
    }
}
