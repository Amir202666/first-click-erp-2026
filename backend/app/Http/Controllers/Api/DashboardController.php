<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\Currency;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\InvoiceLine;
use App\Models\InvoicePayment;
use App\Models\Item;
use App\Models\Payment;
use App\Models\PaymentMethod;
use App\Models\Tenant;
use App\Models\Vendor;
use App\Services\AccountingService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function __construct(
        private AccountingService $accountingService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'period' => 'nullable|in:day,week,month,year,custom',
            'from_date' => 'nullable|date',
            'to_date' => 'nullable|date|after_or_equal:from_date',
            'branch_id' => 'nullable|exists:branches,id',
        ]);

        $tenantId = $request->tenant_id;
        $branchId = $request->filled('branch_id') ? (int) $request->branch_id : null;
        $tenant = Tenant::find($tenantId);
        // Use the system default currency (is_default = true) for this tenant first
        $currency = Currency::where('tenant_id', $tenantId)
            ->where('is_active', true)
            ->where('is_default', true)
            ->first();
        if (! $currency && $tenant?->default_currency) {
            $currency = Currency::where('tenant_id', $tenantId)
                ->where('is_active', true)
                ->where('code', $tenant->default_currency)
                ->first();
        }
        if ($currency) {
            $currencyCode = $currency->code;
            $symbol = $currency->symbol;
            // لو رمز العملة في قاعدة البيانات رقمياً (مثلاً 1 أو 0) نعتبره غير صالح ونرجع للرمز الافتراضي
            if (! is_string($symbol) || preg_match('/^\d+$/', $symbol)) {
                $currencySymbol = $this->defaultSymbolForCode($currency->code);
            } else {
                $currencySymbol = $symbol;
            }
        } else {
            $currencyCode = $tenant?->default_currency ?? 'SAR';
            $currencySymbol = $this->defaultSymbolForCode($currencyCode);
        }

        $period = (string) ($request->input('period') ?? 'month');
        $fromParam = $request->input('from_date');
        $toParam = $request->input('to_date');
        if (is_string($fromParam)) {
            $fromParam = trim($fromParam) ?: null;
        }
        if (is_string($toParam)) {
            $toParam = trim($toParam) ?: null;
        }
        // استخدام from_date و to_date من الطلب إن وُجدا (تاريخ متصفح المستخدم)
        [$fromDate, $toDate] = $this->resolveDateRange($period, $fromParam, $toParam);

        // استبعاد الفواتير الملغاة والمسودة من أرقام الداشبورد
        $invoiceQuery = fn () => Invoice::where('tenant_id', $tenantId)
            ->whereNotIn('status', ['cancelled'])
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->when($fromDate, fn ($q) => $q->whereDate('date', '>=', $fromDate))
            ->when($toDate, fn ($q) => $q->whereDate('date', '<=', $toDate));

        // إجمالي المبيعات (فواتير مبيعات غير مرتجع، باستثناء الملغاة والمسودة)
        $totalSales = (float) (clone $invoiceQuery())
            ->where('type', 'sales')
            ->where('is_return', false)
            ->whereNotIn('status', ['draft'])
            ->sum('total');

        // إجمالي مرتجعات المبيعات
        $totalSalesReturns = (float) (clone $invoiceQuery())
            ->where('type', 'sales')
            ->where('is_return', true)
            ->sum('total');

        // إجمالي المشتريات (باستثناء الملغاة والمسودة)
        $totalPurchases = (float) (clone $invoiceQuery())
            ->where('type', 'purchase')
            ->whereNotIn('status', ['draft'])
            ->sum('total');

        // عدد فواتير المبيعات / المشتريات داخل نفس الفترة (بدون الملغاة والمسودة)
        $salesCount = (clone $invoiceQuery())
            ->where('type', 'sales')
            ->whereNotIn('status', ['draft'])
            ->count();

        $purchasesCount = (clone $invoiceQuery())
            ->where('type', 'purchase')
            ->whereNotIn('status', ['draft'])
            ->count();

        $incomeStatement = $this->accountingService->getIncomeStatement($tenantId, $fromDate, $toDate, $branchId);
        $totalExpenses = (float) ($incomeStatement['total_expenses'] ?? 0);

        $chartData = $this->buildChartData($tenantId, $fromDate, $toDate, $branchId);

        $today = now()->toDateString();
        $baseInvoice = fn () => Invoice::where('tenant_id', $tenantId)->when($branchId, fn ($q) => $q->where('branch_id', $branchId));

        $totalReceivable = (float) (clone $baseInvoice())
            ->where('type', 'sales')
            ->whereNotIn('status', ['cancelled', 'draft', 'paid'])
            ->sum('balance');

        $totalPayable = (float) (clone $baseInvoice())
            ->where('type', 'purchase')
            ->whereNotIn('status', ['cancelled', 'draft', 'paid'])
            ->sum('balance');

        $recentSales = (clone $baseInvoice())
            ->where('type', 'sales')
            ->whereNotIn('status', ['cancelled', 'draft'])
            ->whereBetween('date', [$fromDate, $toDate])
            ->with('customer')
            ->orderByDesc('date')
            ->limit(5)
            ->get(['id', 'number', 'date', 'customer_id', 'total', 'status']);

        $recentPayments = Payment::where('tenant_id', $tenantId)
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->with('customer', 'vendor')
            ->orderByDesc('date')
            ->limit(5)
            ->get(['id', 'number', 'date', 'type', 'amount', 'customer_id', 'vendor_id']);

        $lowStockItems = Item::where('tenant_id', $tenantId)
            ->where('track_quantity', true)
            ->get()
            ->filter(fn ($item) => $item->currentStock() < (float) $item->min_quantity)
            ->take(5)
            ->map(fn ($item) => [
                'id' => $item->id,
                'name' => $item->name,
                'code' => $item->code,
                'current_stock' => $item->currentStock(),
                'min_quantity' => $item->min_quantity,
            ])
            ->values();

        $netProfit = $totalSales - $totalPurchases - $totalExpenses;
        $pulse = [
            'net_profit' => round($netProfit, 2),
            'cash_flow_sparkline' => $this->buildCashFlowSparkline($tenantId, $fromDate, $toDate, $branchId),
        ];

        $duePurchaseInvoices = (clone $baseInvoice())
            ->where('type', 'purchase')
            ->whereNotIn('status', ['cancelled', 'paid'])
            ->where('due_date', '<=', $today)
            ->where('balance', '>', 0)
            ->orderBy('due_date')
            ->limit(10)
            ->get(['id', 'number', 'due_date', 'balance', 'vendor_id'])
            ->map(fn ($inv) => [
                'id' => $inv->id,
                'number' => $inv->number,
                'due_date' => $inv->due_date?->format('Y-m-d'),
                'balance' => (float) $inv->balance,
            ])
            ->values()
            ->all();

        $notifications = [
            'due_purchase_invoices' => $duePurchaseInvoices,
            'due_purchase_count' => (clone $baseInvoice())
                ->where('type', 'purchase')
                ->whereNotIn('status', ['cancelled', 'paid'])
                ->where('due_date', '<=', $today)
                ->where('balance', '>', 0)
                ->count(),
            'low_stock_count' => $lowStockItems->count(),
        ];

        $posPeakHours = $this->buildPosPeakHours($tenantId, $fromDate, $toDate, $branchId);
        $expenseBreakdown = $this->buildExpenseBreakdown($tenantId, $fromDate, $toDate, $branchId);
        $gapAnalysis = $this->buildGapAnalysis($tenantId, $fromDate, $toDate, $branchId);
        $predictive = $this->buildPredictive($tenantId, $branchId);

        // إجمالي تكلفة الرواتب للفترة (من مسيرات الرواتب المعتمدة)
        $fromYm = (int) Carbon::parse($fromDate)->format('Ym');
        $toYm = (int) Carbon::parse($toDate)->format('Ym');
        $payrollQuery = \App\Models\PayrollRun::query()
            ->where('tenant_id', $tenantId)
            ->where('status', 'approved')
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->whereRaw('(year * 100 + month) >= ? and (year * 100 + month) <= ?', [$fromYm, $toYm]);
        $payrollTotalGross = (float) $payrollQuery->sum('total_gross');
        $daysInRange = Carbon::parse($fromDate)->diffInDays(Carbon::parse($toDate)) + 1;
        $payrollDailyCost = $daysInRange > 0 ? $payrollTotalGross / $daysInRange : 0.0;

        $bankBalance = 0.0;
        $bankAccountId = PaymentMethod::where('tenant_id', $tenantId)->where('type', 'bank')->where('is_active', true)->value('linked_account_id');
        if ($bankAccountId) {
            $bal = $this->accountingService->getAccountBalanceToDate((int) $bankAccountId, $toDate, $branchId, null, $tenantId);
            $bankBalance = (float) ($bal['debit'] ?? 0) - (float) ($bal['credit'] ?? 0);
        }

        // أعلى 5 أصناف مبيعاً حسب الإيراد خلال نفس الفترة
        $topSellingItems = InvoiceLine::query()
            ->join('invoices', 'invoices.id', '=', 'invoice_lines.invoice_id')
            ->leftJoin('items', 'items.id', '=', 'invoice_lines.item_id')
            ->where('invoices.tenant_id', $tenantId)
            ->where('invoices.type', 'sales')
            ->where('invoices.is_return', false)
            ->whereNotIn('invoices.status', ['cancelled', 'draft'])
            ->whereBetween('invoices.date', [$fromDate, $toDate])
            ->when($branchId, fn ($q) => $q->where('invoices.branch_id', $branchId))
            ->whereNotNull('invoice_lines.item_id')
            ->selectRaw('invoice_lines.item_id as item_id, COALESCE(items.name, invoice_lines.description) as name, SUM(invoice_lines.quantity) as quantity_sold, SUM(invoice_lines.total) as revenue')
            ->groupBy('invoice_lines.item_id', 'name')
            ->orderByDesc('revenue')
            ->limit(5)
            ->get()
            ->map(fn ($r) => [
                'item_id' => (int) $r->item_id,
                'name' => (string) $r->name,
                'quantity_sold' => (float) $r->quantity_sold,
                'revenue' => (float) $r->revenue,
            ])
            ->values()
            ->all();

        return response()->json([
            'currency' => [
                'code' => $currencyCode,
                'symbol' => $currencySymbol,
                'decimal_places' => $currency ? (int) $currency->decimal_places : 2,
            ],
            'filter' => [
                'period' => $period,
                'from_date' => $fromDate,
                'to_date' => $toDate,
            ],
            'summary' => [
                'total_sales' => $totalSales,
                'total_purchases' => $totalPurchases,
                'total_expenses' => $totalExpenses,
                'total_sales_returns' => $totalSalesReturns,
                'sales_count' => $salesCount,
                'purchases_count' => $purchasesCount,
                'total_receivable' => $totalReceivable,
                'total_payable' => $totalPayable,
                'overdue_invoices' => (clone $baseInvoice())
                    ->whereNotIn('status', ['cancelled', 'paid'])
                    ->where('due_date', '<', $today)
                    ->where('balance', '>', 0)
                    ->count(),
                'customers_count' => Customer::where('tenant_id', $tenantId)->count(),
                'vendors_count' => Vendor::where('tenant_id', $tenantId)->count(),
                'items_count' => Item::where('tenant_id', $tenantId)->count(),
                'net_profit' => round($netProfit, 2),
                'bank_balance' => round($bankBalance, 2),
                'payroll_total_gross' => round($payrollTotalGross, 2),
                'payroll_daily_cost' => round($payrollDailyCost, 2),
            ],
            'chart_data' => $chartData,
            'top_selling_items' => $topSellingItems,
            'recent_sales' => $recentSales,
            'recent_payments' => $recentPayments,
            'low_stock_items' => $lowStockItems,
            'pulse' => $pulse,
            'notifications' => $notifications,
            'pos_peak_hours' => $posPeakHours,
            'expense_breakdown' => $expenseBreakdown,
            'gap_analysis' => $gapAnalysis,
            'predictive' => $predictive,
        ]);
    }

    private function buildCashFlowSparkline(int $tenantId, string $fromDate, string $toDate, ?int $branchId): array
    {
        $from = Carbon::parse($fromDate);
        $to = Carbon::parse($toDate);
        $days = min($from->diffInDays($to) + 1, 31);
        $salesByDate = Invoice::where('tenant_id', $tenantId)
            ->where('type', 'sales')
            ->whereNotIn('status', ['cancelled', 'draft'])
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->whereBetween('date', [$fromDate, $toDate])
            ->select(DB::raw('date as d'), DB::raw('SUM(total) as total'))
            ->groupBy('date')
            ->orderBy('d')
            ->pluck('total', 'd')
            ->all();
        $result = [];
        $current = $from->copy();
        while ($current->lte($to) && count($result) < 31) {
            $d = $current->toDateString();
            $result[] = ['date' => $d, 'value' => (float) ($salesByDate[$d] ?? 0)];
            $current->addDay();
        }

        return $result;
    }

    private function buildPosPeakHours(int $tenantId, string $fromDate, string $toDate, ?int $branchId): array
    {
        $rows = Invoice::where('tenant_id', $tenantId)
            ->where('type', 'sales')
            ->whereNotIn('status', ['cancelled', 'draft'])
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->whereBetween('date', [$fromDate, $toDate])
            ->select(DB::raw('CAST(strftime("%H", created_at) AS INTEGER) as hour'), DB::raw('COUNT(*) as count'), DB::raw('SUM(total) as total'))
            ->groupBy(DB::raw('strftime("%H", created_at)'))
            ->orderBy('hour')
            ->get();
        $byHour = [];
        for ($h = 0; $h < 24; $h++) {
            $byHour[] = ['hour' => $h, 'count' => 0, 'total' => 0.0];
        }
        foreach ($rows as $r) {
            $h = (int) $r->hour;
            if ($h >= 0 && $h < 24) {
                $byHour[$h] = ['hour' => $h, 'count' => (int) $r->count, 'total' => (float) $r->total];
            }
        }

        return $byHour;
    }

    private function buildExpenseBreakdown(int $tenantId, string $fromDate, string $toDate, ?int $branchId): array
    {
        $expenseAccountIds = Account::where('tenant_id', $tenantId)
            ->where('type', 'expense')
            ->pluck('id', 'name')
            ->all();
        if (empty($expenseAccountIds)) {
            return [];
        }
        $accountNames = Account::where('tenant_id', $tenantId)
            ->whereIn('id', array_values($expenseAccountIds))
            ->pluck('name', 'id')
            ->all();
        $lines = DB::table('journal_entry_lines')
            ->join('journal_entries', 'journal_entries.id', '=', 'journal_entry_lines.journal_entry_id')
            ->where('journal_entries.tenant_id', $tenantId)
            ->where('journal_entries.status', 'posted')
            ->when($branchId, fn ($q) => $q->where('journal_entries.branch_id', $branchId))
            ->whereIn('journal_entry_lines.account_id', array_values($expenseAccountIds))
            ->whereBetween('journal_entries.date', [$fromDate, $toDate])
            ->select(
                'journal_entry_lines.account_id',
                DB::raw('SUM(journal_entry_lines.debit - journal_entry_lines.credit) as amount'),
                DB::raw('GROUP_CONCAT(DISTINCT journal_entries.id) as journal_entry_ids')
            )
            ->groupBy('journal_entry_lines.account_id')
            ->get();
        $result = [];
        foreach ($lines as $row) {
            $amount = (float) $row->amount;
            if ($amount <= 0) {
                continue;
            }
            $result[] = [
                'account_id' => (int) $row->account_id,
                'account_name' => $accountNames[(int) $row->account_id] ?? '',
                'amount' => round($amount, 2),
                'journal_entry_ids' => $row->journal_entry_ids ? array_map('intval', explode(',', $row->journal_entry_ids)) : [],
            ];
        }

        return $result;
    }

    private function buildGapAnalysis(int $tenantId, string $fromDate, string $toDate, ?int $branchId): array
    {
        $expectedSales = (float) Invoice::where('tenant_id', $tenantId)
            ->where('type', 'sales')
            ->whereNotIn('status', ['cancelled', 'draft'])
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->whereBetween('date', [$fromDate, $toDate])
            ->sum('total');
        $bankMethodIds = PaymentMethod::where('tenant_id', $tenantId)
            ->where('type', 'bank')
            ->where('is_active', true)
            ->pluck('id')
            ->all();
        $bankDeposits = 0.0;
        if (! empty($bankMethodIds)) {
            $invoiceIds = Invoice::where('tenant_id', $tenantId)
                ->where('type', 'sales')
                ->whereNotIn('status', ['cancelled', 'draft'])
                ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
                ->whereBetween('date', [$fromDate, $toDate])
                ->pluck('id');
            $bankDeposits = (float) InvoicePayment::whereIn('invoice_id', $invoiceIds)
                ->whereIn('payment_method_id', $bankMethodIds)
                ->sum('amount');
        }

        return [
            'expected_sales' => round($expectedSales, 2),
            'bank_deposits' => round($bankDeposits, 2),
            'gap' => round($expectedSales - $bankDeposits, 2),
        ];
    }

    private function buildPredictive(int $tenantId, ?int $branchId): array
    {
        $lastMonths = Carbon::now()->subMonths(4)->startOfMonth();
        $salesByMonth = Invoice::where('tenant_id', $tenantId)
            ->where('type', 'sales')
            ->whereNotIn('status', ['cancelled', 'draft'])
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->where('date', '>=', $lastMonths->toDateString())
            ->select(DB::raw('strftime("%Y-%m", date) as ym'), DB::raw('SUM(total) as total'))
            ->groupBy('ym')
            ->orderBy('ym')
            ->pluck('total', 'ym')
            ->all();
        $values = array_values(array_map(fn ($v) => (float) $v, $salesByMonth));
        $avg = count($values) > 0 ? array_sum($values) / count($values) : 0;
        $expenseLastMonth = $this->accountingService->getIncomeStatement(
            $tenantId,
            Carbon::now()->subMonth()->startOfMonth()->toDateString(),
            Carbon::now()->subMonth()->endOfMonth()->toDateString(),
            $branchId
        );
        $totalExpense = (float) ($expenseLastMonth['total_expenses'] ?? 0);
        $daysInMonth = (int) Carbon::now()->subMonth()->endOfMonth()->format('d');
        $cashBurnPerDay = $daysInMonth > 0 ? $totalExpense / $daysInMonth : 0;

        return [
            'next_month_sales_forecast' => round($avg, 2),
            'cash_burn_rate_per_day' => round($cashBurnPerDay, 2),
        ];
    }

    private function resolveDateRange(?string $period, ?string $from, ?string $to): array
    {
        // إن أرسل الواجهة from_date و to_date (من تاريخ المتصفح) نستخدمهما لأي فترة
        if ($from && $to) {
            return [$from, $to];
        }

        $now = Carbon::now();
        switch ($period) {
            case 'day':
                return [$now->toDateString(), $now->toDateString()];
            case 'week':
                return [$now->copy()->startOfWeek()->toDateString(), $now->toDateString()];
            case 'year':
                return [$now->copy()->startOfYear()->toDateString(), $now->toDateString()];
            case 'month':
            default:
                return [$now->copy()->startOfMonth()->toDateString(), $now->toDateString()];
        }
    }

    private function buildChartData(int $tenantId, string $fromDate, string $toDate, ?int $branchId = null): array
    {
        $from = Carbon::parse($fromDate);
        $to = Carbon::parse($toDate);
        $daysDiff = $from->diffInDays($to) + 1;
        $inv = fn () => Invoice::where('tenant_id', $tenantId)->when($branchId, fn ($q) => $q->where('branch_id', $branchId));

        if ($daysDiff <= 1) {
            $sales = (float) (clone $inv())
                ->where('type', 'sales')
                ->whereNotIn('status', ['cancelled', 'draft'])
                ->whereBetween('date', [$fromDate, $toDate])
                ->sum('total');
            $purchases = (float) (clone $inv())
                ->where('type', 'purchase')
                ->whereNotIn('status', ['cancelled', 'draft'])
                ->whereBetween('date', [$fromDate, $toDate])
                ->sum('total');
            $incomeStatement = $this->accountingService->getIncomeStatement($tenantId, $fromDate, $toDate, $branchId);
            $expenses = (float) ($incomeStatement['total_expenses'] ?? 0);

            return [[
                'period_label' => $from->format('Y-m-d'),
                'sales' => $sales,
                'purchases' => $purchases,
                'expenses' => $expenses,
            ]];
        }

        if ($daysDiff <= 31) {
            $salesByDate = (clone $inv())
                ->where('type', 'sales')
                ->whereNotIn('status', ['cancelled', 'draft'])
                ->whereBetween('date', [$fromDate, $toDate])
                ->select(DB::raw('date as d'), DB::raw('SUM(total) as total'))
                ->groupBy('date')
                ->orderBy('d')
                ->pluck('total', 'd')
                ->all();

            $purchasesByDate = (clone $inv())
                ->where('type', 'purchase')
                ->whereNotIn('status', ['cancelled', 'draft'])
                ->whereBetween('date', [$fromDate, $toDate])
                ->select(DB::raw('date as d'), DB::raw('SUM(total) as total'))
                ->groupBy('date')
                ->orderBy('d')
                ->pluck('total', 'd')
                ->all();

            $expenseByDate = $this->getExpensesByDate($tenantId, $fromDate, $toDate, $branchId);

            $result = [];
            $current = $from->copy();
            while ($current->lte($to)) {
                $d = $current->toDateString();
                $result[] = [
                    'period_label' => $d,
                    'sales' => (float) ($salesByDate[$d] ?? 0),
                    'purchases' => (float) ($purchasesByDate[$d] ?? 0),
                    'expenses' => (float) ($expenseByDate[$d] ?? 0),
                ];
                $current->addDay();
            }

            return $result;
        }

        $result = [];
        $current = $from->copy()->startOfMonth();
        while ($current->lte($to)) {
            $monthStart = $current->copy()->startOfMonth()->toDateString();
            $monthEnd = $current->copy()->endOfMonth()->toDateString();
            if (Carbon::parse($monthEnd)->gt($to)) {
                $monthEnd = $to->toDateString();
            }
            if (Carbon::parse($monthStart)->lt($from)) {
                $monthStart = $from->toDateString();
            }

            $sales = (float) (clone $inv())
                ->where('type', 'sales')
                ->whereNotIn('status', ['cancelled', 'draft'])
                ->whereBetween('date', [$monthStart, $monthEnd])
                ->sum('total');
            $purchases = (float) (clone $inv())
                ->where('type', 'purchase')
                ->whereNotIn('status', ['cancelled', 'draft'])
                ->whereBetween('date', [$monthStart, $monthEnd])
                ->sum('total');
            $incomeStatement = $this->accountingService->getIncomeStatement($tenantId, $monthStart, $monthEnd, $branchId);
            $expenses = (float) ($incomeStatement['total_expenses'] ?? 0);

            $result[] = [
                'period_label' => $current->format('Y-m'),
                'sales' => $sales,
                'purchases' => $purchases,
                'expenses' => $expenses,
            ];
            $current->addMonth();
        }

        return $result;
    }

    private function getExpensesByDate(int $tenantId, string $fromDate, string $toDate, ?int $branchId = null): array
    {
        $expenseAccountIds = Account::where('tenant_id', $tenantId)
            ->where('type', 'expense')
            ->pluck('id')
            ->all();

        if (empty($expenseAccountIds)) {
            return [];
        }

        $q = DB::table('journal_entry_lines')
            ->join('journal_entries', 'journal_entries.id', '=', 'journal_entry_lines.journal_entry_id')
            ->where('journal_entries.tenant_id', $tenantId)
            ->where('journal_entries.status', 'posted')
            ->whereIn('journal_entry_lines.account_id', $expenseAccountIds)
            ->whereBetween('journal_entries.date', [$fromDate, $toDate]);
        if ($branchId !== null) {
            $q->where('journal_entries.branch_id', $branchId);
        }
        $lines = $q->select(DB::raw('journal_entries.date as d'), DB::raw('SUM(journal_entry_lines.debit - journal_entry_lines.credit) as total'))
            ->groupBy('journal_entries.date')
            ->pluck('total', 'd')
            ->all();

        return array_map(fn ($v) => (float) $v, $lines);
    }

    /**
     * Fallback symbol when Currency record has no symbol (e.g. KWD = د.ك, SAR = ر.س).
     */
    private function defaultSymbolForCode(string $code): string
    {
        return match (strtoupper($code)) {
            'KWD' => 'د.ك',
            'SAR' => 'ر.س',
            'AED' => 'د.إ',
            'BHD' => 'د.ب',
            'OMR' => 'ر.ع.',
            'QAR' => 'ر.ق',
            'USD' => '$',
            'EUR' => '€',
            'EGP' => 'ج.م',
            default => $code,
        };
    }
}
