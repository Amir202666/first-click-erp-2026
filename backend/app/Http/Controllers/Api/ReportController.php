<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Middleware\CheckPermission;
use App\Models\Account;
use App\Models\Branch;
use App\Models\CostCenter;
use App\Models\Customer;
use App\Models\InventoryMovement;
use App\Models\Invoice;
use App\Models\InvoiceLine;
use App\Models\InvoiceLineSerial;
use App\Models\Item;
use App\Models\ItemSerial;
use App\Models\JournalEntry;
use App\Models\JournalEntryLine;
use App\Models\Payment;
use App\Models\SalesRep;
use App\Models\Tenant;
use App\Models\Vendor;
use App\Models\Warehouse;
use App\Services\AccountingService;
use App\Services\InventoryService;
use App\Services\TenantSettingsService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;

class ReportController extends Controller
{
    public function __construct(
        private AccountingService $accountingService,
        private TenantSettingsService $tenantSettings,
        private InventoryService $inventoryService,
    ) {}

    /**
     * بيانات الشركة للتقارير والطباعة: من الإعدادات العامة أولاً ثم من Tenant.
     */
    private function companyForReport(?Tenant $tenant): ?array
    {
        if (! $tenant) {
            return null;
        }
        $tenantId = $tenant->id;
        $settings = $this->tenantSettings->getAll($tenantId);

        return [
            'name' => $settings['company_name'] ?? $tenant->name,
            'logo' => $settings['company_logo'] ?? $tenant->logo,
            'address' => $settings['company_address'] ?? $tenant->address,
            'phone' => $settings['company_phone'] ?? $tenant->phone,
            'email' => $settings['company_email'] ?? $tenant->email,
            'tax_registration_number' => $tenant->tax_registration_number,
        ];
    }

    /**
     * استخراج التاريخ فقط بصيغة Y-m-d من الطلب لتجنب تحويل التوقيت (حتى لا يحتاج المستخدم لزيادة يوم في الفلتر).
     */
    private function parseReportDateOnly(mixed $value): string
    {
        $str = (string) $value;
        if (preg_match('/^(\d{4}-\d{2}-\d{2})/', trim($str), $m)) {
            return $m[1];
        }

        return \Carbon\Carbon::parse($value)->format('Y-m-d');
    }

    /**
     * بيان موجّز لعمود «البيان» في تقرير المصروفات: الأوصاف المدمجة الطويلة (مثل تسويات الجرد)
     * تُختصر إلى المرجع الأول قبل الفاصل — لتفادي إسهاب الجدول.
     */
    private function formatExpenseReportDescription(?string $description): ?string
    {
        if ($description === null || trim($description) === '') {
            return null;
        }
        $s = trim($description);
        $emDashParts = substr_count($s, ' — ');
        // أوصاف مدمجة بعدة فقرات، أو نص طويل جداً: نعرض المرجع الأول فقط (مثل رقم تسوية الجرد)
        $useFirstSegment = $emDashParts >= 2 || mb_strlen($s) > 120;
        if ($useFirstSegment && str_contains($s, ' — ')) {
            $head = trim(explode(' — ', $s, 2)[0]);

            return $head !== '' ? $head : $s;
        }
        if (mb_strlen($s) > 180) {
            return mb_substr($s, 0, 177).'…';
        }

        return $s;
    }

    /**
     * @param  array<int, float|int|string>  $twelve  12 قيم شهرية بالترتيب المالي
     * @return list<float>
     */
    private function foldTwelveMonths(array $twelve, string $breakdown): array
    {
        $vals = array_values($twelve);
        for ($i = 0; $i < 12; $i++) {
            $vals[$i] = isset($vals[$i]) ? (float) $vals[$i] : 0.0;
        }
        $twelve = $vals;
        if ($breakdown === 'quarterly') {
            $out = [];
            for ($q = 0; $q < 4; $q++) {
                $s = 0.0;
                for ($k = 0; $k < 3; $k++) {
                    $s += $twelve[$q * 3 + $k];
                }
                $out[] = round($s, 4);
            }

            return $out;
        }
        if ($breakdown === 'semiannual') {
            $h1 = 0.0;
            $h2 = 0.0;
            for ($i = 0; $i < 6; $i++) {
                $h1 += $twelve[$i];
            }
            for ($i = 6; $i < 12; $i++) {
                $h2 += $twelve[$i];
            }

            return [round($h1, 4), round($h2, 4)];
        }

        return array_map(fn ($x) => round((float) $x, 4), $twelve);
    }

    /**
     * وصف الأعمدة بعد طي الأشهر (شهري / ربع سنوي / نصف سنوي).
     *
     * @return list<array{month_index: int, year: int, month: int, key: string, quarter?: int, half?: int}>
     */
    private function buildAnnualSalesPeriodMeta(Carbon $periodStart, string $breakdown): array
    {
        if ($breakdown === 'quarterly') {
            $meta = [];
            for ($q = 0; $q < 4; $q++) {
                $d = $periodStart->copy()->addMonths($q * 3);
                $meta[] = [
                    'month_index' => $q * 3 + 1,
                    'year' => $d->year,
                    'month' => $d->month,
                    'quarter' => $q + 1,
                    'key' => 'q'.($q + 1).'-'.$d->format('Y-m'),
                ];
            }

            return $meta;
        }
        if ($breakdown === 'semiannual') {
            $meta = [];
            for ($h = 0; $h < 2; $h++) {
                $d = $periodStart->copy()->addMonths($h * 6);
                $meta[] = [
                    'month_index' => $h * 6 + 1,
                    'year' => $d->year,
                    'month' => $d->month,
                    'half' => $h + 1,
                    'key' => 'h'.($h + 1).'-'.$d->format('Y-m'),
                ];
            }

            return $meta;
        }
        $meta = [];
        for ($i = 0; $i < 12; $i++) {
            $d = $periodStart->copy()->addMonths($i);
            $meta[] = [
                'month_index' => $i + 1,
                'year' => $d->year,
                'month' => $d->month,
                'key' => $d->format('Y-m'),
            ];
        }

        return $meta;
    }

    public function trialBalance(Request $request): JsonResponse
    {
        $request->validate([
            'from_date' => 'nullable|date',
            'to_date' => 'nullable|date',
            'branch_id' => 'nullable|integer|exists:branches,id',
            'cost_center_id' => 'nullable|integer|exists:cost_centers,id',
            'include_zero_balance' => 'nullable|boolean',
            'display_level' => 'nullable|integer|min:1|max:5',
            'main_accounts_only' => 'nullable|boolean',
        ]);

        $fromDate = $request->from_date;
        $toDate = $request->to_date;
        if (! $fromDate || ! $toDate) {
            $fromDate = now()->startOfYear()->format('Y-m-d');
            $toDate = now()->format('Y-m-d');
        } else {
            $fromDate = \Carbon\Carbon::parse($fromDate)->format('Y-m-d');
            $toDate = \Carbon\Carbon::parse($toDate)->format('Y-m-d');
        }
        $includeZeroBalance = filter_var($request->input('include_zero_balance'), FILTER_VALIDATE_BOOLEAN);
        $displayLevel = (int) ($request->input('display_level') ?: 5);
        $displayLevel = max(1, min(5, $displayLevel));
        $mainAccountsOnly = filter_var($request->input('main_accounts_only'), FILTER_VALIDATE_BOOLEAN);

        $data = $this->accountingService->getTrialBalanceMultiLevel(
            $request->tenant_id,
            $fromDate,
            $toDate,
            $request->filled('branch_id') ? (int) $request->branch_id : null,
            $request->filled('cost_center_id') ? (int) $request->cost_center_id : null,
            $displayLevel,
            $includeZeroBalance,
            $mainAccountsOnly,
        );

        $tenant = Tenant::find($request->tenant_id);
        $company = $this->companyForReport($tenant);

        $draftEntriesCount = JournalEntry::where('tenant_id', $request->tenant_id)
            ->where('status', 'draft')
            ->where('date', '<=', $toDate)
            ->count();

        return response()->json([
            'company' => $company,
            'issue_date' => now()->format('Y-m-d'),
            'from_date' => $fromDate,
            'to_date' => $toDate,
            'display_level' => $displayLevel,
            'accounts' => $data['accounts'],
            'totals' => $data['totals'],
            'is_balanced_opening' => $data['is_balanced_opening'],
            'is_balanced_period' => $data['is_balanced_period'],
            'is_balanced_closing' => $data['is_balanced_closing'],
            'draft_entries_count' => $draftEntriesCount,
        ]);
    }

    public function incomeStatement(Request $request): JsonResponse
    {
        $request->validate([
            'from_date' => 'required|date',
            'to_date' => 'required|date',
        ]);

        $fromDate = \Carbon\Carbon::parse($request->from_date)->format('Y-m-d');
        $toDate = \Carbon\Carbon::parse($request->to_date)->format('Y-m-d');
        $branchId = $request->filled('branch_id') ? (int) $request->branch_id : null;
        $costCenterId = $request->filled('cost_center_id') ? (int) $request->cost_center_id : null;

        $data = $this->accountingService->getIncomeStatement(
            $request->tenant_id,
            $fromDate,
            $toDate,
            $branchId,
            $costCenterId,
        );

        $monthlyBreakdown = $this->accountingService->getIncomeStatementMonthlyBreakdown(
            $request->tenant_id,
            $fromDate,
            $toDate,
            $branchId,
            $costCenterId,
        );

        $tenant = Tenant::find($request->tenant_id);
        $company = $this->companyForReport($tenant);

        return response()->json([
            'company' => $company,
            'issue_date' => now()->format('Y-m-d'),
            'from_date' => $fromDate,
            'to_date' => $toDate,
            'period' => $data['period'],
            'gross_sales' => $data['gross_sales'],
            'sales_returns' => $data['sales_returns'],
            'sales_discount' => $data['sales_discount'],
            'net_sales' => $data['net_sales'],
            'revenues' => $data['revenues'],
            'total_revenue' => $data['total_revenue'],
            'cogs' => $data['cogs'],
            'total_cogs' => $data['total_cogs'],
            'gross_profit' => $data['gross_profit'],
            'administrative_expenses' => $data['administrative_expenses'],
            'total_administrative_expenses' => $data['total_administrative_expenses'],
            'selling_marketing_expenses' => $data['selling_marketing_expenses'],
            'total_selling_marketing_expenses' => $data['total_selling_marketing_expenses'],
            'other_expenses' => $data['other_expenses'],
            'total_other_expenses' => $data['total_other_expenses'],
            'total_expenses' => $data['total_expenses'],
            'net_income' => $data['net_income'],
            'monthly_breakdown' => $monthlyBreakdown,
        ]);
    }

    public function balanceSheet(Request $request): JsonResponse
    {
        $request->validate([
            'as_of_date' => 'required|date',
            'branch_id' => 'nullable|integer|exists:branches,id',
            'compare_to_date' => 'nullable|date',
        ]);

        $branchId = $request->filled('branch_id') ? (int) $request->branch_id : null;
        $data = $this->accountingService->getBalanceSheet(
            $request->tenant_id,
            $request->as_of_date,
            $branchId,
        );

        if ($request->filled('compare_to_date')) {
            $data['comparative'] = $this->accountingService->getBalanceSheet(
                $request->tenant_id,
                $request->compare_to_date,
                $branchId,
            );
        }

        return response()->json($data);
    }

    public function salesSummary(Request $request): JsonResponse
    {
        $request->validate([
            'from_date' => 'required|date',
            'to_date' => 'required|date|after_or_equal:from_date',
        ]);

        $fromDate = $this->parseReportDateOnly($request->from_date);
        $toDate = $this->parseReportDateOnly($request->to_date);

        $invoices = Invoice::where('tenant_id', $request->tenant_id)
            ->where('type', 'sales')
            ->whereNotIn('status', ['cancelled', 'draft'])
            ->whereDate('date', '>=', $fromDate)
            ->whereDate('date', '<=', $toDate);

        return response()->json([
            'total_sales' => $invoices->sum('total'),
            'total_tax' => $invoices->sum('tax_amount'),
            'total_paid' => $invoices->sum('amount_paid'),
            'total_outstanding' => $invoices->sum('balance'),
            'invoice_count' => $invoices->count(),
        ]);
    }

    public function purchaseSummary(Request $request): JsonResponse
    {
        $request->validate([
            'from_date' => 'required|date',
            'to_date' => 'required|date|after_or_equal:from_date',
        ]);

        $fromDate = $this->parseReportDateOnly($request->from_date);
        $toDate = $this->parseReportDateOnly($request->to_date);

        $invoices = Invoice::where('tenant_id', $request->tenant_id)
            ->where('type', 'purchase')
            ->whereNotIn('status', ['cancelled', 'draft'])
            ->whereDate('date', '>=', $fromDate)
            ->whereDate('date', '<=', $toDate);

        return response()->json([
            'total_purchases' => $invoices->sum('total'),
            'total_tax' => $invoices->sum('tax_amount'),
            'total_paid' => $invoices->sum('amount_paid'),
            'total_outstanding' => $invoices->sum('balance'),
            'invoice_count' => $invoices->count(),
        ]);
    }

    public function invoiceProfits(Request $request): JsonResponse
    {
        try {
            if (! CheckPermission::userHasPermission($request, 'invoices.view_profit')) {
                return response()->json(['message' => 'ليس لديك صلاحية لعرض أرباح الفواتير'], 403);
            }

            $tenantId = (int) $request->tenant_id;
            if ($tenantId < 1) {
                return response()->json(['message' => 'يرجى تحديد المستأجر (X-Tenant-ID).'], 422);
            }

            $request->merge([
                'branch_id' => $request->filled('branch_id') && $request->branch_id !== '' ? $request->branch_id : null,
                'customer_id' => $request->filled('customer_id') && $request->customer_id !== '' ? $request->customer_id : null,
                'created_by' => $request->filled('created_by') && $request->created_by !== '' ? $request->created_by : null,
                'cost_center_id' => $request->filled('cost_center_id') && $request->cost_center_id !== '' ? $request->cost_center_id : null,
                'sales_source' => $request->filled('sales_source') && $request->sales_source !== '' ? $request->sales_source : null,
                'number' => $request->filled('number') && trim((string) $request->number) !== '' ? trim((string) $request->number) : null,
            ]);

            $validated = $request->validate([
                'from_date' => 'required|date',
                'to_date' => 'required|date|after_or_equal:from_date',
                'branch_id' => 'nullable|integer|exists:branches,id',
                'customer_id' => 'nullable|integer|exists:customers,id',
                'created_by' => 'nullable|integer|exists:users,id',
                'cost_center_id' => [
                    'nullable',
                    'integer',
                    Rule::exists('cost_centers', 'id')->where(fn ($q) => $q->where('tenant_id', $tenantId)),
                ],
                'sales_source' => 'nullable|in:regular,pos,restaurant',
                'number' => 'nullable|string|max:100',
                /** أقصى عدد صفوف يُعاد في الجدول؛ الإجماليات تُحسب لكل الفواتير المطابقة للفلتر */
                'limit' => 'nullable|integer|min:1|max:500',
            ]);

            $fromDate = $this->parseReportDateOnly($validated['from_date']);
            $toDate = $this->parseReportDateOnly($validated['to_date']);

            // أرباح الفواتير: فواتير مبيعات مرحّلة فقط (قيد محاسبي)؛ whereDate يضمن شمول اليوم كاملاً على كل محركات DB.
            $q = Invoice::where('tenant_id', $tenantId)
                ->where('type', 'sales')
                ->where('is_return', false)
                ->whereNotNull('journal_entry_id')
                ->whereDate('date', '>=', $fromDate)
                ->whereDate('date', '<=', $toDate)
                ->where(function ($w) {
                    if (Schema::hasColumn('invoices', 'document_status')) {
                        $w->whereNull('document_status')
                            ->orWhere('document_status', '!=', 'cancelled');
                    } else {
                        $w->whereNotIn('status', ['cancelled', 'draft']);
                    }
                })
                ->with(['customer', 'branch']);

            if (! empty($validated['branch_id'])) {
                $q->where('branch_id', $validated['branch_id']);
            }
            if (! empty($validated['customer_id'])) {
                $q->where('customer_id', $validated['customer_id']);
            }
            if (! empty($validated['created_by'])) {
                $q->where('created_by', $validated['created_by']);
            }
            if (! empty($validated['cost_center_id'])) {
                $q->where('cost_center_id', $validated['cost_center_id']);
            }
            if (! empty($validated['number'])) {
                $q->where('number', 'like', '%'.$validated['number'].'%');
            }
            if (! empty($validated['sales_source'])) {
                match ($validated['sales_source']) {
                    'pos' => $q->posSalesOnly(),
                    'restaurant' => $q->restaurantSalesOnly(),
                    'regular' => $q->whereNull('pos_shift_id')
                        ->whereNull('order_type')
                        ->whereNull('table_id'),
                    default => null,
                };
            }

            $columns = ['id', 'number', 'date', 'branch_id', 'customer_id', 'total'];
            if (Schema::hasColumn('invoices', 'cost_amount')) {
                $columns[] = 'cost_amount';
            }

            $limit = isset($validated['limit']) ? min(500, max(1, (int) $validated['limit'])) : null;

            $allIds = (clone $q)->pluck('id');
            $totalMatching = $allIds->count();

            if ($totalMatching === 0) {
                return response()->json([
                    'rows' => [],
                    'totals' => [
                        'sales_net' => 0.0,
                        'cost' => 0.0,
                        'profit' => 0.0,
                        'margin' => 0.0,
                    ],
                    'total_matching' => 0,
                    'limit' => $limit,
                ]);
            }

            $invoiceIds = $allIds->all();
            $costFromMovements = [];
            $costs = InventoryMovement::query()
                ->where('tenant_id', $tenantId)
                ->where('reference_type', Invoice::class)
                ->whereIn('reference_id', $invoiceIds)
                ->selectRaw('reference_id as invoice_id, SUM(ABS(total_cost)) as cost')
                ->groupBy('reference_id')
                ->get()
                ->keyBy('invoice_id');
            foreach ($costs as $invoiceId => $row) {
                $costFromMovements[(int) $invoiceId] = (float) $row->cost;
            }

            $allInvoices = Invoice::whereIn('id', $invoiceIds)->get($columns);
            $totalsSales = 0.0;
            $totalsCost = 0.0;
            foreach ($allInvoices as $inv) {
                $sales = (float) $inv->total;
                $storedCost = isset($inv->cost_amount) ? (float) $inv->cost_amount : 0;
                $cost = array_key_exists($inv->id, $costFromMovements)
                    ? $costFromMovements[$inv->id]
                    : $storedCost;
                $totalsSales += $sales;
                $totalsCost += $cost;
            }
            $totalsProfit = $totalsSales - $totalsCost;

            $displayQuery = (clone $q)
                ->orderBy('date', 'desc')
                ->orderBy('id', 'desc');
            if ($limit !== null) {
                $displayQuery->limit($limit);
            }
            $rows = $displayQuery->get($columns);

            $data = $rows->map(function (Invoice $inv) use ($costFromMovements) {
                $sales = (float) $inv->total;
                $storedCost = isset($inv->cost_amount) ? (float) $inv->cost_amount : 0;
                // تكلفة المبيعات من حركات المخزون (متوسط/طبقات) تتضمن تكلفة مشتريات محمّلة بمصاريف إضافية؛ تُفضَّل على cost_amount المخزّن.
                $cost = array_key_exists($inv->id, $costFromMovements)
                    ? $costFromMovements[$inv->id]
                    : $storedCost;
                $profit = $sales - $cost;
                $margin = $sales > 0 ? ($profit / $sales) * 100 : 0;

                return [
                    'id' => $inv->id,
                    'number' => $inv->number,
                    'date' => $inv->date instanceof \DateTimeInterface ? $inv->date->format('Y-m-d') : (string) $inv->date,
                    'branch_name' => $inv->branch?->name,
                    'customer' => $inv->customer?->name,
                    'sales_net' => $sales,
                    'cost' => round($cost, 4),
                    'profit' => round($profit, 4),
                    'margin' => round($margin, 2),
                ];
            });

            return response()->json([
                'rows' => $data->values()->all(),
                'totals' => [
                    'sales_net' => $totalsSales,
                    'cost' => $totalsCost,
                    'profit' => $totalsProfit,
                    'margin' => $totalsSales > 0 ? ($totalsProfit / $totalsSales) * 100 : 0,
                ],
                'total_matching' => $totalMatching,
                'limit' => $limit,
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            throw $e;
        } catch (\Throwable $e) {
            \Log::error('invoiceProfits report error: '.$e->getMessage(), ['trace' => $e->getTraceAsString()]);

            return response()->json([
                'message' => 'حدث خطأ في توليد التقرير.',
                'error' => config('app.debug') ? $e->getMessage() : null,
            ], 500);
        }
    }

    /**
     * تقرير المبيعات السنوي للفروع: صفوف = فروع، أعمدة = 12 شهراً مالياً.
     * يشمل فواتير المبيعات المرحّلة (journal_entry_id) من كل القنوات ما لم يُقيّد sales_channel.
     */
    public function branchSalesAnnual(Request $request): JsonResponse
    {
        try {
            $tenantId = (int) $request->tenant_id;
            if ($tenantId < 1) {
                return response()->json(['message' => 'يرجى تحديد المستأجر (X-Tenant-ID).'], 422);
            }

            $request->merge([
                'cost_center_id' => $request->filled('cost_center_id') && $request->cost_center_id !== '' ? $request->cost_center_id : null,
                'sales_channel' => $request->filled('sales_channel') && $request->sales_channel !== '' ? $request->sales_channel : 'all',
                'breakdown' => $request->filled('breakdown') && $request->breakdown !== '' ? $request->breakdown : 'monthly',
            ]);

            $validated = $request->validate([
                'fiscal_year' => 'required|integer|min:2000|max:2100',
                'amount_basis' => 'required|in:net_before_tax,inclusive',
                'sales_channel' => 'nullable|in:all,restaurant,pos,regular',
                'breakdown' => 'nullable|in:monthly,quarterly,semiannual',
                'cost_center_id' => [
                    'nullable',
                    'integer',
                    Rule::exists('cost_centers', 'id')->where(fn ($q) => $q->where('tenant_id', $tenantId)),
                ],
            ]);

            $fyStartMonth = (int) $this->tenantSettings->get($tenantId, 'fiscal_year_start_month', 1);
            if ($fyStartMonth < 1 || $fyStartMonth > 12) {
                $fyStartMonth = 1;
            }

            $startYear = (int) $validated['fiscal_year'];
            $periodStart = Carbon::create($startYear, $fyStartMonth, 1)->startOfDay();
            $periodEnd = $periodStart->copy()->addYear()->subDay();
            $fromStr = $periodStart->toDateString();
            $toStr = $periodEnd->toDateString();

            $startYm = $periodStart->year * 12 + $periodStart->month;

            $amountSql = $validated['amount_basis'] === 'net_before_tax'
                ? '(CASE WHEN invoices.is_return = 1 THEN -1 ELSE 1 END) * (COALESCE(invoices.subtotal, 0) - COALESCE(invoices.discount_amount, 0))'
                : '(CASE WHEN invoices.is_return = 1 THEN -1 ELSE 1 END) * COALESCE(invoices.total, 0)';

            // توافق SQLite: YEAR()/MONTH() غير مدعومة.
            $driver = DB::getDriverName();
            $yExpr = $driver === 'sqlite' ? "CAST(strftime('%Y', invoices.date) AS INTEGER)" : 'YEAR(invoices.date)';
            $mExpr = $driver === 'sqlite' ? "CAST(strftime('%m', invoices.date) AS INTEGER)" : 'MONTH(invoices.date)';

            $query = DB::table('invoices')
                ->where('invoices.tenant_id', $tenantId)
                ->where('invoices.type', 'sales')
                ->whereNotNull('invoices.journal_entry_id')
                ->whereNotNull('invoices.branch_id')
                ->whereBetween('invoices.date', [$fromStr, $toStr]);

            if (! empty($validated['cost_center_id'])) {
                $query->where('invoices.cost_center_id', $validated['cost_center_id']);
            }

            $channel = $validated['sales_channel'] ?? 'all';
            if ($channel === 'pos') {
                $query->whereNotNull('invoices.pos_shift_id');
            } elseif ($channel === 'restaurant') {
                $query->where(function ($q) {
                    $q->whereNotNull('invoices.order_type')->orWhereNotNull('invoices.table_id');
                });
            } elseif ($channel === 'regular') {
                $query->whereNull('invoices.pos_shift_id')
                    ->whereNull('invoices.order_type')
                    ->whereNull('invoices.table_id');
            }

            $aggregates = $query
                ->selectRaw("invoices.branch_id, {$yExpr} as y, {$mExpr} as m, SUM({$amountSql}) as amount")
                ->groupBy('invoices.branch_id', DB::raw($yExpr), DB::raw($mExpr))
                ->get();

            $branches = Branch::query()
                ->where('tenant_id', $tenantId)
                ->orderBy('name')
                ->get(['id', 'name']);

            $branchRows = [];
            foreach ($branches as $b) {
                $branchRows[$b->id] = [
                    'branch_id' => $b->id,
                    'branch_name' => $b->name,
                    'months' => array_fill(0, 12, 0.0),
                ];
            }

            foreach ($aggregates as $row) {
                $bid = (int) $row->branch_id;
                if (! isset($branchRows[$bid])) {
                    continue;
                }
                $rowYm = (int) $row->y * 12 + (int) $row->m;
                $idx = $rowYm - $startYm;
                if ($idx >= 0 && $idx < 12) {
                    $branchRows[$bid]['months'][$idx] = round((float) $row->amount, 4);
                }
            }

            $breakdown = $validated['breakdown'] ?? 'monthly';
            $monthMeta = $this->buildAnnualSalesPeriodMeta($periodStart, $breakdown);

            $rowsOut = [];
            $columnTotals = array_fill(0, count($monthMeta), 0.0);
            foreach ($branchRows as $bid => $r) {
                $folded = $this->foldTwelveMonths($r['months'], $breakdown);
                $rowTotal = array_sum($folded);
                foreach ($folded as $i => $v) {
                    $columnTotals[$i] += $v;
                }
                $rowsOut[] = [
                    'branch_id' => $r['branch_id'],
                    'branch_name' => $r['branch_name'],
                    'months' => $folded,
                    'year_total' => round($rowTotal, 4),
                ];
            }

            $grandTotal = round(array_sum($columnTotals), 4);
            $columnTotals = array_map(fn ($x) => round((float) $x, 4), $columnTotals);

            return response()->json([
                'fiscal_year' => $startYear,
                'fiscal_year_start_month' => $fyStartMonth,
                'period_from' => $fromStr,
                'period_to' => $toStr,
                'amount_basis' => $validated['amount_basis'],
                'sales_channel' => $channel,
                'breakdown' => $breakdown,
                'month_keys' => array_column($monthMeta, 'key'),
                'months' => $monthMeta,
                'branches' => $rowsOut,
                'column_totals' => $columnTotals,
                'grand_total' => $grandTotal,
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            throw $e;
        } catch (\Throwable $e) {
            \Log::error('branchSalesAnnual report error: '.$e->getMessage(), ['trace' => $e->getTraceAsString()]);

            return response()->json([
                'message' => 'حدث خطأ في توليد التقرير.',
                'error' => config('app.debug') ? $e->getMessage() : null,
            ], 500);
        }
    }

    /**
     * تقرير المبيعات السنوي لمراكز التكلفة: صفوف = مراكز، أعمدة = 12 شهراً مالياً.
     * فواتير بدون مركز تُجمّع في صف «بدون مركز».
     */
    public function costCenterSalesAnnual(Request $request): JsonResponse
    {
        try {
            $tenantId = (int) $request->tenant_id;
            if ($tenantId < 1) {
                return response()->json(['message' => 'يرجى تحديد المستأجر (X-Tenant-ID).'], 422);
            }

            $request->merge([
                'branch_id' => $request->filled('branch_id') && $request->branch_id !== '' ? $request->branch_id : null,
                'sales_channel' => $request->filled('sales_channel') && $request->sales_channel !== '' ? $request->sales_channel : 'all',
                'breakdown' => $request->filled('breakdown') && $request->breakdown !== '' ? $request->breakdown : 'monthly',
            ]);

            $validated = $request->validate([
                'fiscal_year' => 'required|integer|min:2000|max:2100',
                'amount_basis' => 'required|in:net_before_tax,inclusive',
                'sales_channel' => 'nullable|in:all,restaurant,pos,regular',
                'breakdown' => 'nullable|in:monthly,quarterly,semiannual',
                'branch_id' => [
                    'nullable',
                    'integer',
                    Rule::exists('branches', 'id')->where(fn ($q) => $q->where('tenant_id', $tenantId)),
                ],
            ]);

            $fyStartMonth = (int) $this->tenantSettings->get($tenantId, 'fiscal_year_start_month', 1);
            if ($fyStartMonth < 1 || $fyStartMonth > 12) {
                $fyStartMonth = 1;
            }

            $startYear = (int) $validated['fiscal_year'];
            $periodStart = Carbon::create($startYear, $fyStartMonth, 1)->startOfDay();
            $periodEnd = $periodStart->copy()->addYear()->subDay();
            $fromStr = $periodStart->toDateString();
            $toStr = $periodEnd->toDateString();

            $startYm = $periodStart->year * 12 + $periodStart->month;

            $amountSql = $validated['amount_basis'] === 'net_before_tax'
                ? '(CASE WHEN invoices.is_return = 1 THEN -1 ELSE 1 END) * (COALESCE(invoices.subtotal, 0) - COALESCE(invoices.discount_amount, 0))'
                : '(CASE WHEN invoices.is_return = 1 THEN -1 ELSE 1 END) * COALESCE(invoices.total, 0)';

            // توافق SQLite: YEAR()/MONTH() غير مدعومة.
            $driver = DB::getDriverName();
            $yExpr = $driver === 'sqlite' ? "CAST(strftime('%Y', invoices.date) AS INTEGER)" : 'YEAR(invoices.date)';
            $mExpr = $driver === 'sqlite' ? "CAST(strftime('%m', invoices.date) AS INTEGER)" : 'MONTH(invoices.date)';

            $query = DB::table('invoices')
                ->where('invoices.tenant_id', $tenantId)
                ->where('invoices.type', 'sales')
                ->whereNotNull('invoices.journal_entry_id')
                ->whereBetween('invoices.date', [$fromStr, $toStr]);

            if (! empty($validated['branch_id'])) {
                $query->where('invoices.branch_id', $validated['branch_id']);
            }

            $channel = $validated['sales_channel'] ?? 'all';
            if ($channel === 'pos') {
                $query->whereNotNull('invoices.pos_shift_id');
            } elseif ($channel === 'restaurant') {
                $query->where(function ($q) {
                    $q->whereNotNull('invoices.order_type')->orWhereNotNull('invoices.table_id');
                });
            } elseif ($channel === 'regular') {
                $query->whereNull('invoices.pos_shift_id')
                    ->whereNull('invoices.order_type')
                    ->whereNull('invoices.table_id');
            }

            $aggregates = $query
                ->selectRaw("invoices.cost_center_id, {$yExpr} as y, {$mExpr} as m, SUM({$amountSql}) as amount")
                ->groupBy('invoices.cost_center_id', DB::raw($yExpr), DB::raw($mExpr))
                ->get();

            $centers = CostCenter::query()
                ->where('tenant_id', $tenantId)
                ->orderBy('name')
                ->get(['id', 'name']);

            $centerRows = [];
            foreach ($centers as $c) {
                $centerRows[$c->id] = [
                    'cost_center_id' => $c->id,
                    'cost_center_name' => $c->name,
                    'months' => array_fill(0, 12, 0.0),
                ];
            }

            $noneKey = 0;
            $centerRows[$noneKey] = [
                'cost_center_id' => null,
                'cost_center_name' => null,
                'months' => array_fill(0, 12, 0.0),
            ];

            foreach ($aggregates as $row) {
                $cid = $row->cost_center_id !== null ? (int) $row->cost_center_id : $noneKey;
                if (! isset($centerRows[$cid])) {
                    $centerRows[$cid] = [
                        'cost_center_id' => $cid === $noneKey ? null : $cid,
                        'cost_center_name' => $cid === $noneKey ? null : ('#'.$cid),
                        'months' => array_fill(0, 12, 0.0),
                    ];
                }
                $rowYm = (int) $row->y * 12 + (int) $row->m;
                $idx = $rowYm - $startYm;
                if ($idx >= 0 && $idx < 12) {
                    $centerRows[$cid]['months'][$idx] = round((float) $row->amount, 4);
                }
            }

            $baseIds = $centers->pluck('id')->all();
            $known = array_flip(array_merge($baseIds, [$noneKey]));
            $extraIds = [];
            foreach (array_keys($centerRows) as $k) {
                if (! isset($known[$k])) {
                    $extraIds[] = $k;
                }
            }
            sort($extraIds);
            $orderedIds = array_merge($baseIds, $extraIds, [$noneKey]);

            $breakdown = $validated['breakdown'] ?? 'monthly';
            $monthMeta = $this->buildAnnualSalesPeriodMeta($periodStart, $breakdown);

            $rowsOut = [];
            $columnTotals = array_fill(0, count($monthMeta), 0.0);
            foreach ($orderedIds as $cid) {
                if (! isset($centerRows[$cid])) {
                    continue;
                }
                $r = $centerRows[$cid];
                $folded = $this->foldTwelveMonths($r['months'], $breakdown);
                $rowTotal = array_sum($folded);
                foreach ($folded as $i => $v) {
                    $columnTotals[$i] += $v;
                }
                $rowsOut[] = [
                    'cost_center_id' => $r['cost_center_id'],
                    'cost_center_name' => $r['cost_center_name'],
                    'months' => $folded,
                    'year_total' => round($rowTotal, 4),
                ];
            }

            $grandTotal = round(array_sum($columnTotals), 4);
            $columnTotals = array_map(fn ($x) => round((float) $x, 4), $columnTotals);

            return response()->json([
                'fiscal_year' => $startYear,
                'fiscal_year_start_month' => $fyStartMonth,
                'period_from' => $fromStr,
                'period_to' => $toStr,
                'amount_basis' => $validated['amount_basis'],
                'sales_channel' => $channel,
                'branch_id' => $validated['branch_id'] ?? null,
                'breakdown' => $breakdown,
                'month_keys' => array_column($monthMeta, 'key'),
                'months' => $monthMeta,
                'cost_centers' => $rowsOut,
                'column_totals' => $columnTotals,
                'grand_total' => $grandTotal,
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            throw $e;
        } catch (\Throwable $e) {
            \Log::error('costCenterSalesAnnual report error: '.$e->getMessage(), ['trace' => $e->getTraceAsString()]);

            return response()->json([
                'message' => 'حدث خطأ في توليد التقرير.',
                'error' => config('app.debug') ? $e->getMessage() : null,
            ], 500);
        }
    }

    /**
     * تقرير مبيعات الأصناف: مجمع من بنود الفواتير المرحلة فقط.
     * - مرتجع المبيعات يُخصم من الإجمالي.
     * - الكميات تُحوّل للوحدة الأساسية (معامل التحويل من item_unit_options).
     * - Pagination من الخادم لآلاف الحركات.
     */
    public function itemSalesReport(Request $request): JsonResponse
    {
        $request->validate([
            'from_date' => 'required|date',
            'to_date' => 'required|date|after_or_equal:from_date',
            'item_id' => 'nullable|integer|exists:items,id',
            'category_id' => 'nullable|integer|exists:item_categories,id',
            'branch_id' => 'nullable|integer|exists:branches,id',
            'customer_id' => 'nullable|integer|exists:customers,id',
            'per_page' => 'nullable|integer|min:5|max:100',
            'page' => 'nullable|integer|min:1',
        ]);

        $tenantId = (int) $request->tenant_id;
        $fromDate = \Carbon\Carbon::parse($request->from_date)->format('Y-m-d');
        $toDate = \Carbon\Carbon::parse($request->to_date)->format('Y-m-d');
        $branchId = $request->filled('branch_id') ? (int) $request->branch_id : null;
        $pivot = $request->user()?->tenants()->where('tenants.id', $tenantId)->first()?->pivot;
        if ($pivot && $pivot->restrict_to_branch_warehouse && $pivot->default_branch_id) {
            $branchId = (int) $pivot->default_branch_id;
        }
        $categoryId = $request->filled('category_id') ? (int) $request->category_id : null;
        $itemId = $request->filled('item_id') ? (int) $request->item_id : null;
        $customerId = $request->filled('customer_id') ? (int) $request->customer_id : null;
        $perPage = min(100, max(5, (int) ($request->per_page ?? 25)));
        $page = max(1, (int) ($request->page ?? 1));

        // لا نربط جداول الأرقام التسلسلية (item_serials / invoice_line_serials) لتفادي تعارض الأعمدة
        // وضمان ظهور كل أسطر الفواتير (قديمة بدون سيريال أو جديدة بها). العزل: invoices.tenant_id و items.tenant_id.
        $baseQuery = DB::table('invoice_lines')
            ->join('invoices', function ($j) use ($tenantId, $fromDate, $toDate, $branchId, $customerId) {
                $j->on('invoices.id', '=', 'invoice_lines.invoice_id')
                    ->where('invoices.tenant_id', $tenantId)
                    ->where('invoices.type', 'sales')
                    ->whereNotNull('invoices.journal_entry_id')
                    ->whereBetween('invoices.date', [$fromDate, $toDate]);
                if ($branchId !== null) {
                    $j->where('invoices.branch_id', $branchId);
                }
                if ($customerId !== null) {
                    $j->where('invoices.customer_id', $customerId);
                }
            })
            ->leftJoin('item_unit_options', function ($j) {
                $j->on('item_unit_options.item_id', '=', 'invoice_lines.item_id')
                    ->on('item_unit_options.unit_id', '=', 'invoice_lines.unit_id');
            })
            ->join('items', function ($j) use ($tenantId) {
                $j->on('items.id', '=', 'invoice_lines.item_id')->where('items.tenant_id', $tenantId);
            })
            ->leftJoin('item_categories', 'item_categories.id', '=', 'items.category_id')
            ->leftJoin('item_units', 'item_units.id', '=', 'items.unit_id')
            ->whereNotNull('invoice_lines.item_id');

        if ($categoryId !== null) {
            $baseQuery->where('items.category_id', $categoryId);
        }
        if ($itemId !== null) {
            $baseQuery->where('invoice_lines.item_id', $itemId);
        }

        $factorVal = 'COALESCE(item_unit_options.conversion_factor, 1)';
        $signVal = 'IF(invoices.is_return, -1, 1)';

        $dataQuery = (clone $baseQuery)->select([
            'invoice_lines.item_id',
            'items.code as item_code',
            'items.name as item_name',
            'items.category_id',
            'item_categories.name as category_name',
            'item_units.name as base_unit_name',
            DB::raw("SUM(IF(invoices.is_return = 0, invoice_lines.quantity * {$factorVal}, 0)) AS quantity_sold_base"),
            DB::raw("SUM(IF(invoices.is_return = 1, invoice_lines.quantity * {$factorVal}, 0)) AS quantity_returned_base"),
            DB::raw("SUM(invoice_lines.quantity * {$signVal} * {$factorVal}) AS quantity_net_base"),
            DB::raw('SUM(IF(invoices.is_return = 0, invoice_lines.total, 0)) AS amount_sold'),
            DB::raw('SUM(IF(invoices.is_return = 1, invoice_lines.total, 0)) AS amount_returned'),
            DB::raw('SUM(IF(invoices.is_return = 0, invoice_lines.quantity * invoice_lines.unit_price * COALESCE(invoice_lines.discount_percent, 0) / 100, 0)) + SUM(IF(invoices.is_return = 0, COALESCE(invoices.discount_amount, 0) * (invoice_lines.total / NULLIF(invoices.subtotal, 0)), 0)) AS discount_sold'),
            DB::raw('SUM(IF(invoices.is_return = 1, invoice_lines.quantity * invoice_lines.unit_price * COALESCE(invoice_lines.discount_percent, 0) / 100, 0)) + SUM(IF(invoices.is_return = 1, COALESCE(invoices.discount_amount, 0) * (invoice_lines.total / NULLIF(invoices.subtotal, 0)), 0)) AS discount_returned'),
            DB::raw("SUM(invoice_lines.total * {$signVal}) AS amount_net"),
            DB::raw('COUNT(DISTINCT invoices.id) AS invoice_count'),
        ])->groupBy('invoice_lines.item_id', 'items.code', 'items.name', 'items.category_id', 'item_categories.name', 'item_units.name')
            ->orderByDesc('amount_net')
            ->offset(($page - 1) * $perPage)
            ->limit($perPage);

        $rows = $dataQuery->get();

        // تصحيح الصافي: صافي المبلغ = مبلغ المبيعات - مبلغ المرتجع - الخصم
        $rows = $rows->map(function ($row) {
            $sold = (float) ($row->amount_sold ?? 0);
            $returned = (float) ($row->amount_returned ?? 0);
            $discountSold = (float) ($row->discount_sold ?? 0);
            $discountReturned = (float) ($row->discount_returned ?? 0);
            $row->amount_net = round($sold - $returned - ($discountSold - $discountReturned), 3);

            return $row;
        });

        $totalQuery = DB::table('invoice_lines')
            ->join('invoices', function ($j) use ($tenantId, $fromDate, $toDate, $branchId, $customerId) {
                $j->on('invoices.id', '=', 'invoice_lines.invoice_id')
                    ->where('invoices.tenant_id', $tenantId)
                    ->where('invoices.type', 'sales')
                    ->whereNotNull('invoices.journal_entry_id')
                    ->whereBetween('invoices.date', [$fromDate, $toDate]);
                if ($branchId !== null) {
                    $j->where('invoices.branch_id', $branchId);
                }
                if ($customerId !== null) {
                    $j->where('invoices.customer_id', $customerId);
                }
            })
            ->join('items', function ($j) use ($tenantId) {
                $j->on('items.id', '=', 'invoice_lines.item_id')->where('items.tenant_id', $tenantId);
            })
            ->whereNotNull('invoice_lines.item_id');
        if ($categoryId !== null) {
            $totalQuery->where('items.category_id', $categoryId);
        }
        if ($itemId !== null) {
            $totalQuery->where('invoice_lines.item_id', $itemId);
        }
        $totalItems = $totalQuery->distinct('invoice_lines.item_id')->count('invoice_lines.item_id');

        $tenant = Tenant::find($tenantId);
        $company = $this->companyForReport($tenant);

        return response()->json([
            'company' => $company,
            'from_date' => $fromDate,
            'to_date' => $toDate,
            'data' => $rows,
            'total' => $totalItems,
            'per_page' => $perPage,
            'current_page' => $page,
            'last_page' => (int) ceil($totalItems / $perPage),
        ]);
    }

    /**
     * فواتير مبيعات تحتوي على صنف معين ضمن فترة (لـ drill-down من تقرير مبيعات الأصناف).
     */
    public function itemSalesReportInvoices(Request $request): JsonResponse
    {
        $request->validate([
            'item_id' => 'required|integer|exists:items,id',
            'from_date' => 'required|date',
            'to_date' => 'required|date|after_or_equal:from_date',
        ]);

        $tenantId = (int) $request->tenant_id;
        $itemId = (int) $request->item_id;
        $fromDate = \Carbon\Carbon::parse($request->from_date)->format('Y-m-d');
        $toDate = \Carbon\Carbon::parse($request->to_date)->format('Y-m-d');

        $invoiceIds = \App\Models\InvoiceLine::query()
            ->join('invoices', 'invoices.id', '=', 'invoice_lines.invoice_id')
            ->where('invoices.tenant_id', $tenantId)
            ->where('invoices.type', 'sales')
            ->whereNotNull('invoices.journal_entry_id')
            ->whereBetween('invoices.date', [$fromDate, $toDate])
            ->where('invoice_lines.item_id', $itemId)
            ->distinct()
            ->pluck('invoices.id');

        if ($invoiceIds->isEmpty()) {
            return response()->json(['data' => []]);
        }

        $invoices = Invoice::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->whereIn('id', $invoiceIds)
            ->orderByDesc('date')
            ->orderByDesc('id')
            ->get(['id', 'number', 'date', 'total', 'customer_id'])
            ->load('customer:id,name');

        return response()->json(['data' => $invoices]);
    }

    /**
     * تقرير مشتريات الأصناف: يعتمد على "حالة اعتماد الفاتورة" (غير مسودة وغير ملغاة).
     * يُظهر جميع المشتريات المعتمدة (مرحّلة/مرسلة/مدفوعة/جزئية) سواء نقداً أو آجلاً.
     * لا يشترط وجود قيد محاسبي حتى تظهر الفاتورة المرحّلة في الواجهة في التقرير.
     * فلتر نوع الدفع: الكل | كاش (مسددة) | آجل (لها رصيد).
     */
    public function itemPurchasesReport(Request $request): JsonResponse
    {
        $request->validate([
            'from_date' => 'required|date',
            'to_date' => 'required|date|after_or_equal:from_date',
            'item_id' => 'nullable|integer|exists:items,id',
            'category_id' => 'nullable|integer|exists:item_categories,id',
            'branch_id' => 'nullable|integer|exists:branches,id',
            'vendor_id' => 'nullable|integer|exists:vendors,id',
            'payment_type' => 'nullable|string|in:all,cash,credit',
            'per_page' => 'nullable|integer|min:5|max:100',
            'page' => 'nullable|integer|min:1',
        ]);

        $tenantId = (int) $request->tenant_id;
        $fromDate = \Carbon\Carbon::parse($request->from_date)->format('Y-m-d');
        $toDate = \Carbon\Carbon::parse($request->to_date)->format('Y-m-d');
        $branchId = $request->filled('branch_id') ? (int) $request->branch_id : null;
        $categoryId = $request->filled('category_id') ? (int) $request->category_id : null;
        $itemId = $request->filled('item_id') ? (int) $request->item_id : null;
        $vendorId = $request->filled('vendor_id') ? (int) $request->vendor_id : null;
        $paymentType = $request->input('payment_type', 'all');
        $perPage = min(100, max(5, (int) ($request->per_page ?? 25)));
        $page = max(1, (int) ($request->page ?? 1));

        $invoiceJoin = function ($j) use ($tenantId, $fromDate, $toDate, $branchId, $vendorId, $paymentType) {
            $j->on('invoices.id', '=', 'invoice_lines.invoice_id')
                ->where('invoices.tenant_id', $tenantId)
                ->where('invoices.type', 'purchase')
                ->whereNotIn('invoices.status', ['cancelled', 'draft'])
                ->whereBetween('invoices.date', [$fromDate, $toDate]);
            if ($branchId !== null) {
                $j->where('invoices.branch_id', $branchId);
            }
            if ($vendorId !== null) {
                $j->where('invoices.vendor_id', $vendorId);
            }
            if ($paymentType === 'cash') {
                $j->whereRaw('COALESCE(invoices.balance, 0) <= 0');
            }
            if ($paymentType === 'credit') {
                $j->whereRaw('COALESCE(invoices.balance, 0) > 0');
            }
        };

        $baseQuery = DB::table('invoice_lines')
            ->join('invoices', $invoiceJoin)
            ->leftJoin('item_unit_options', function ($j) {
                $j->on('item_unit_options.item_id', '=', 'invoice_lines.item_id')
                    ->on('item_unit_options.unit_id', '=', 'invoice_lines.unit_id');
            })
            ->join('items', function ($j) use ($tenantId) {
                $j->on('items.id', '=', 'invoice_lines.item_id')->where('items.tenant_id', $tenantId);
            })
            ->leftJoin('item_categories', 'item_categories.id', '=', 'items.category_id')
            ->leftJoin('item_units', 'item_units.id', '=', 'items.unit_id')
            ->whereNotNull('invoice_lines.item_id');

        if ($categoryId !== null) {
            $baseQuery->where('items.category_id', $categoryId);
        }
        if ($itemId !== null) {
            $baseQuery->where('invoice_lines.item_id', $itemId);
        }

        $factorVal = 'COALESCE(item_unit_options.conversion_factor, 1)';
        $signVal = 'IF(invoices.is_return, -1, 1)';

        $dataQuery = (clone $baseQuery)->select([
            'invoice_lines.item_id',
            'items.code as item_code',
            'items.name as item_name',
            'items.category_id',
            'item_categories.name as category_name',
            'item_units.name as base_unit_name',
            DB::raw("SUM(IF(invoices.is_return = 0, invoice_lines.quantity * {$factorVal}, 0)) AS quantity_sold_base"),
            DB::raw("SUM(IF(invoices.is_return = 1, invoice_lines.quantity * {$factorVal}, 0)) AS quantity_returned_base"),
            DB::raw("SUM(invoice_lines.quantity * {$signVal} * {$factorVal}) AS quantity_net_base"),
            DB::raw('SUM(IF(invoices.is_return = 0, invoice_lines.total, 0)) AS amount_sold'),
            DB::raw('SUM(IF(invoices.is_return = 1, invoice_lines.total, 0)) AS amount_returned'),
            DB::raw('SUM(IF(invoices.is_return = 0, invoice_lines.quantity * invoice_lines.unit_price * COALESCE(invoice_lines.discount_percent, 0) / 100, 0)) + SUM(IF(invoices.is_return = 0, COALESCE(invoices.discount_amount, 0) * (invoice_lines.total / NULLIF(invoices.subtotal, 0)), 0)) AS discount_sold'),
            DB::raw('SUM(IF(invoices.is_return = 1, invoice_lines.quantity * invoice_lines.unit_price * COALESCE(invoice_lines.discount_percent, 0) / 100, 0)) + SUM(IF(invoices.is_return = 1, COALESCE(invoices.discount_amount, 0) * (invoice_lines.total / NULLIF(invoices.subtotal, 0)), 0)) AS discount_returned'),
            DB::raw("SUM(invoice_lines.total * {$signVal}) AS amount_net"),
            DB::raw('COUNT(DISTINCT invoices.id) AS invoice_count'),
        ])->groupBy('invoice_lines.item_id', 'items.code', 'items.name', 'items.category_id', 'item_categories.name', 'item_units.name')
            ->orderByDesc('amount_net')
            ->offset(($page - 1) * $perPage)
            ->limit($perPage);

        $rows = $dataQuery->get();

        // تصحيح الصافي: صافي المبلغ = مبلغ المشتريات - مبلغ المرتجع - الخصم
        $rows = $rows->map(function ($row) {
            $sold = (float) ($row->amount_sold ?? 0);
            $returned = (float) ($row->amount_returned ?? 0);
            $discountSold = (float) ($row->discount_sold ?? 0);
            $discountReturned = (float) ($row->discount_returned ?? 0);
            $row->amount_net = round($sold - $returned - ($discountSold - $discountReturned), 3);

            return $row;
        });

        $totalQuery = DB::table('invoice_lines')
            ->join('invoices', $invoiceJoin)
            ->join('items', function ($j) use ($tenantId) {
                $j->on('items.id', '=', 'invoice_lines.item_id')->where('items.tenant_id', $tenantId);
            })
            ->whereNotNull('invoice_lines.item_id');
        if ($categoryId !== null) {
            $totalQuery->where('items.category_id', $categoryId);
        }
        if ($itemId !== null) {
            $totalQuery->where('invoice_lines.item_id', $itemId);
        }
        $totalItems = $totalQuery->distinct('invoice_lines.item_id')->count('invoice_lines.item_id');

        // مجموع إجماليات الفواتير (مطابق لصفحة فواتير المشتريات): نفس الفلاتر + نوع الدفع
        $invoicesSumQuery = Invoice::where('tenant_id', $tenantId)
            ->where('type', 'purchase')
            ->whereNotIn('status', ['cancelled', 'draft'])
            ->whereDate('date', '>=', $fromDate)
            ->whereDate('date', '<=', $toDate);
        if ($branchId !== null) {
            $invoicesSumQuery->where('branch_id', $branchId);
        }
        if ($vendorId !== null) {
            $invoicesSumQuery->where('vendor_id', $vendorId);
        }
        if ($paymentType === 'cash') {
            $invoicesSumQuery->whereRaw('COALESCE(balance, 0) <= 0');
        }
        if ($paymentType === 'credit') {
            $invoicesSumQuery->whereRaw('COALESCE(balance, 0) > 0');
        }
        $sums = $invoicesSumQuery->selectRaw('COALESCE(SUM(total), 0) as sum_totals, COALESCE(SUM(balance), 0) as sum_balance')->first();
        $sum_invoice_totals = (float) ($sums->sum_totals ?? 0);
        $sum_invoice_balance = (float) ($sums->sum_balance ?? 0);

        $tenant = Tenant::find($tenantId);
        $company = $this->companyForReport($tenant);

        return response()->json([
            'company' => $company,
            'from_date' => $fromDate,
            'to_date' => $toDate,
            'data' => $rows,
            'total' => $totalItems,
            'per_page' => $perPage,
            'current_page' => $page,
            'last_page' => (int) ceil($totalItems / $perPage),
            'sum_invoice_totals' => round($sum_invoice_totals, 3),
            'sum_invoice_balance' => round($sum_invoice_balance, 3),
        ]);
    }

    /**
     * فواتير مشتريات تحتوي على صنف معين ضمن فترة (لـ drill-down من تقرير مشتريات الأصناف).
     * نفس معيار الحالة (غير مسودة/ملغاة) وفلتر نوع الدفع.
     */
    public function itemPurchasesReportInvoices(Request $request): JsonResponse
    {
        $request->validate([
            'item_id' => 'required|integer|exists:items,id',
            'from_date' => 'required|date',
            'to_date' => 'required|date|after_or_equal:from_date',
            'payment_type' => 'nullable|string|in:all,cash,credit',
        ]);

        $tenantId = (int) $request->tenant_id;
        $itemId = (int) $request->item_id;
        $fromDate = \Carbon\Carbon::parse($request->from_date)->format('Y-m-d');
        $toDate = \Carbon\Carbon::parse($request->to_date)->format('Y-m-d');
        $paymentType = $request->input('payment_type', 'all');

        $q = \App\Models\InvoiceLine::query()
            ->join('invoices', 'invoices.id', '=', 'invoice_lines.invoice_id')
            ->where('invoices.tenant_id', $tenantId)
            ->where('invoices.type', 'purchase')
            ->whereNotIn('invoices.status', ['cancelled', 'draft'])
            ->whereBetween('invoices.date', [$fromDate, $toDate])
            ->where('invoice_lines.item_id', $itemId);
        if ($paymentType === 'cash') {
            $q->whereRaw('COALESCE(invoices.balance, 0) <= 0');
        }
        if ($paymentType === 'credit') {
            $q->whereRaw('COALESCE(invoices.balance, 0) > 0');
        }
        $invoiceIds = $q->distinct()->pluck('invoices.id');

        if ($invoiceIds->isEmpty()) {
            return response()->json(['data' => []]);
        }

        $invoices = Invoice::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->whereIn('id', $invoiceIds)
            ->orderByDesc('date')
            ->orderByDesc('id')
            ->get(['id', 'number', 'date', 'total', 'vendor_id'])
            ->load('vendor:id,name');

        return response()->json(['data' => $invoices]);
    }

    /**
     * تحليل المشتريات الشهرية ضمن سنة مالية (12 شهراً مالياً).
     * يشمل فواتير المشتريات ومردودات المشتريات المرحّلة فقط (journal_entry_id).
     */
    public function monthlyPurchasesAnalysis(Request $request): JsonResponse
    {
        try {
            $tenantId = (int) $request->tenant_id;
            if ($tenantId < 1) {
                return response()->json(['message' => 'يرجى تحديد المستأجر (X-Tenant-ID).'], 422);
            }

            $request->merge([
                'branch_id' => $request->filled('branch_id') && $request->branch_id !== '' ? $request->branch_id : null,
                'amount_basis' => $request->filled('amount_basis') && $request->amount_basis !== '' ? $request->amount_basis : 'net_before_tax',
            ]);

            $validated = $request->validate([
                'fiscal_year' => 'required|integer|min:2000|max:2100',
                'amount_basis' => 'nullable|in:net_before_tax,inclusive',
                'branch_id' => [
                    'nullable',
                    'integer',
                    Rule::exists('branches', 'id')->where(fn ($q) => $q->where('tenant_id', $tenantId)),
                ],
            ]);

            $fyStartMonth = (int) $this->tenantSettings->get($tenantId, 'fiscal_year_start_month', 1);
            if ($fyStartMonth < 1 || $fyStartMonth > 12) {
                $fyStartMonth = 1;
            }

            $startYear = (int) $validated['fiscal_year'];
            $periodStart = Carbon::create($startYear, $fyStartMonth, 1)->startOfDay();
            $periodEnd = $periodStart->copy()->addYear()->subDay();
            $fromStr = $periodStart->toDateString();
            $toStr = $periodEnd->toDateString();
            $startYm = $periodStart->year * 12 + $periodStart->month;

            $amountBasis = $validated['amount_basis'] ?? 'net_before_tax';
            $sgn = '(CASE WHEN invoices.is_return = 1 THEN -1 ELSE 1 END)';
            // خصم البنود + خصم الرأس: الفرق بين المجموع الفرعي الخام والوعاء الضريبي (total - tax).
            $discountExpr = '(CASE WHEN COALESCE(invoices.subtotal, 0) - (COALESCE(invoices.total, 0) - COALESCE(invoices.tax_amount, 0)) > 0 '
                .'THEN COALESCE(invoices.subtotal, 0) - (COALESCE(invoices.total, 0) - COALESCE(invoices.tax_amount, 0)) ELSE 0 END)';

            $driver = DB::getDriverName();
            $yExpr = $driver === 'sqlite' ? "CAST(strftime('%Y', invoices.date) AS INTEGER)" : 'YEAR(invoices.date)';
            $mExpr = $driver === 'sqlite' ? "CAST(strftime('%m', invoices.date) AS INTEGER)" : 'MONTH(invoices.date)';

            $branchId = ! empty($validated['branch_id']) ? (int) $validated['branch_id'] : null;

            $baseQuery = DB::table('invoices')
                ->where('invoices.tenant_id', $tenantId)
                ->where('invoices.type', 'purchase')
                ->whereNotIn('invoices.status', ['cancelled', 'draft'])
                ->whereNotNull('invoices.journal_entry_id')
                ->whereBetween('invoices.date', [$fromStr, $toStr]);

            if ($branchId !== null) {
                $baseQuery->where('invoices.branch_id', $branchId);
            }

            $expenseBase = DB::table('invoice_additional_expenses')
                ->join('invoices', 'invoices.id', '=', 'invoice_additional_expenses.invoice_id')
                ->where('invoices.tenant_id', $tenantId)
                ->where('invoices.type', 'purchase')
                ->whereNotIn('invoices.status', ['cancelled', 'draft'])
                ->whereNotNull('invoices.journal_entry_id')
                ->whereBetween('invoices.date', [$fromStr, $toStr]);
            if ($branchId !== null) {
                $expenseBase->where('invoices.branch_id', $branchId);
            }

            $expenseAggregates = (clone $expenseBase)
                ->selectRaw("{$yExpr} as y, {$mExpr} as m, "
                    ."SUM({$sgn} * COALESCE(invoice_additional_expenses.total_amount, 0)) as extra_sum")
                ->groupBy(DB::raw($yExpr), DB::raw($mExpr))
                ->get();

            $ship = array_fill(0, 12, 0.0);
            foreach ($expenseAggregates as $row) {
                $rowYm = (int) $row->y * 12 + (int) $row->m;
                $idx = $rowYm - $startYm;
                if ($idx >= 0 && $idx < 12) {
                    $ship[$idx] = round((float) $row->extra_sum, 4);
                }
            }

            $yearExpenseRow = (clone $expenseBase)
                ->selectRaw("SUM({$sgn} * COALESCE(invoice_additional_expenses.total_amount, 0)) as extra_sum")
                ->first();
            $yearExtraSum = round((float) (($yearExpenseRow->extra_sum ?? null) ?: 0), 4);

            $aggregates = (clone $baseQuery)
                ->selectRaw("{$yExpr} as y, {$mExpr} as m, "
                    ."SUM({$sgn} * COALESCE(invoices.subtotal, 0)) as subtotal_sum, "
                    ."SUM({$sgn} * {$discountExpr}) as discount_sum, "
                    ."SUM({$sgn} * (COALESCE(invoices.total, 0) - COALESCE(invoices.tax_amount, 0))) as net_before_tax_sum, "
                    ."SUM({$sgn} * COALESCE(invoices.tax_amount, 0)) as tax_sum, "
                    ."SUM({$sgn} * COALESCE(invoices.total, 0)) as total_sum")
                ->groupBy(DB::raw($yExpr), DB::raw($mExpr))
                ->get();

            $sub = array_fill(0, 12, 0.0);
            $disc = array_fill(0, 12, 0.0);
            $net = array_fill(0, 12, 0.0);
            $tax = array_fill(0, 12, 0.0);
            $tot = array_fill(0, 12, 0.0);

            foreach ($aggregates as $row) {
                $rowYm = (int) $row->y * 12 + (int) $row->m;
                $idx = $rowYm - $startYm;
                if ($idx >= 0 && $idx < 12) {
                    $sub[$idx] = round((float) $row->subtotal_sum, 4);
                    $disc[$idx] = round((float) $row->discount_sum, 4);
                    $net[$idx] = round((float) $row->net_before_tax_sum, 4);
                    $tax[$idx] = round((float) $row->tax_sum, 4);
                    $tot[$idx] = round((float) $row->total_sum, 4);
                }
            }

            $yearTotalsRow = (clone $baseQuery)
                ->selectRaw(
                    "SUM({$sgn} * COALESCE(invoices.subtotal, 0)) as subtotal_sum, "
                    ."SUM({$sgn} * {$discountExpr}) as discount_sum, "
                    ."SUM({$sgn} * (COALESCE(invoices.total, 0) - COALESCE(invoices.tax_amount, 0))) as net_before_tax_sum, "
                    ."SUM({$sgn} * COALESCE(invoices.tax_amount, 0)) as tax_sum, "
                    ."SUM({$sgn} * COALESCE(invoices.total, 0)) as total_sum"
                )
                ->first();

            $totals = [
                'subtotal' => round((float) ($yearTotalsRow->subtotal_sum ?? 0), 4),
                'discount' => round((float) ($yearTotalsRow->discount_sum ?? 0), 4),
                'shipping' => $yearExtraSum,
                'net_before_tax' => round((float) ($yearTotalsRow->net_before_tax_sum ?? 0), 4),
                'tax_amount' => round((float) ($yearTotalsRow->tax_sum ?? 0), 4),
                'total' => round((float) ($yearTotalsRow->total_sum ?? 0), 4),
            ];

            $monthMeta = $this->buildAnnualSalesPeriodMeta($periodStart, 'monthly');
            $data = [];
            $twelve = array_fill(0, 12, 0.0);
            foreach ($monthMeta as $i => $meta) {
                $basisAmount = $amountBasis === 'net_before_tax'
                    ? ($net[$i] ?? 0.0)
                    : ($tot[$i] ?? 0.0);
                $twelve[$i] = $basisAmount;
                $data[] = [
                    'month_index' => $meta['month_index'],
                    'year' => $meta['year'],
                    'month' => $meta['month'],
                    'key' => $meta['key'],
                    'subtotal' => $sub[$i] ?? 0.0,
                    'discount' => $disc[$i] ?? 0.0,
                    'shipping' => $ship[$i] ?? 0.0,
                    'net_before_tax' => $net[$i] ?? 0.0,
                    'tax_amount' => $tax[$i] ?? 0.0,
                    'total' => $tot[$i] ?? 0.0,
                    'amount' => $basisAmount,
                ];
            }

            $totalYear = $amountBasis === 'net_before_tax'
                ? $totals['net_before_tax']
                : $totals['total'];
            $tenant = Tenant::find($tenantId);

            return response()->json([
                'company' => $this->companyForReport($tenant),
                'fiscal_year' => $startYear,
                'fiscal_year_start_month' => $fyStartMonth,
                'period_from' => $fromStr,
                'period_to' => $toStr,
                'branch_id' => $branchId,
                'amount_basis' => $amountBasis,
                'months' => $monthMeta,
                'amounts' => $twelve,
                'data' => $data,
                'totals' => $totals,
                'total_year' => $totalYear,
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            throw $e;
        } catch (\Throwable $e) {
            \Log::error('monthlyPurchasesAnalysis report error: '.$e->getMessage(), ['trace' => $e->getTraceAsString()]);

            return response()->json([
                'message' => 'حدث خطأ في توليد التقرير.',
                'error' => config('app.debug') ? $e->getMessage() : null,
            ], 500);
        }
    }

    public function inventoryReport(Request $request): JsonResponse
    {
        $warehouseId = $request->has('warehouse_id') ? (int) $request->warehouse_id : null;
        $canViewCost = CheckPermission::userHasPermission($request, 'items.view_cost');
        $items = Item::where('tenant_id', $request->tenant_id)
            ->where('track_quantity', true)
            ->with('category', 'unitOptions.unit')
            ->get()
            ->map(function ($item) use ($warehouseId, $canViewCost) {
                $stock = $item->currentStock($warehouseId);
                $row = [
                    'id' => $item->id,
                    'code' => $item->code,
                    'name' => $item->name,
                    'category' => $item->category?->name,
                    'unit' => $item->unit,
                    'current_stock' => $stock,
                    'stock_breakdown' => $item->getStockBreakdownByUnits($warehouseId),
                    'min_quantity' => $item->min_quantity,
                    'is_below_min' => $stock < (float) $item->min_quantity,
                ];
                if ($canViewCost) {
                    // متوسط التكلفة المرجّح من حركات الإدخال (يشمل التكلفة الموزّعة landed من مصاريف الشراء).
                    $avgDistributed = $this->inventoryService->getItemAverageCost((int) $item->id, $warehouseId);
                    $row['average_unit_cost'] = round($avgDistributed, 4);
                    $row['cost_price'] = $item->cost_price;
                    $row['stock_value'] = round($stock * $avgDistributed, AccountingService::JOURNAL_AMOUNT_DECIMALS);
                }

                return $row;
            });

        return response()->json([
            'items' => $items,
            'total_value' => $canViewCost ? $items->sum('stock_value') : null,
            'below_minimum_count' => $items->where('is_below_min', true)->count(),
        ]);
    }

    /**
     * تقرير الإقرار الضريبي: إجمالي المبيعات الخاضعة، المشتريات الخاضعة، وصافي الضريبة المستحقة.
     */
    public function taxDeclaration(Request $request): JsonResponse
    {
        $request->validate([
            'from_date' => 'required|date',
            'to_date' => 'required|date|after_or_equal:from_date',
            'branch_id' => 'nullable|integer|exists:branches,id',
            'cost_center_id' => [
                'nullable',
                'integer',
                Rule::exists('cost_centers', 'id')->where('tenant_id', (int) $request->tenant_id),
            ],
        ]);

        $fromDate = \Carbon\Carbon::parse($request->from_date)->format('Y-m-d');
        $toDate = \Carbon\Carbon::parse($request->to_date)->format('Y-m-d');
        $tenantId = (int) $request->tenant_id;
        $branchId = $request->filled('branch_id') ? (int) $request->branch_id : null;
        $costCenterId = $request->filled('cost_center_id') ? (int) $request->cost_center_id : null;

        $q = Invoice::where('tenant_id', $tenantId)
            ->whereNotNull('journal_entry_id')
            ->whereDate('date', '>=', $fromDate)
            ->whereDate('date', '<=', $toDate);

        if ($branchId) {
            $q->where('branch_id', $branchId);
        }

        if ($costCenterId) {
            $q->where('cost_center_id', $costCenterId);
        }

        $sales = (clone $q)->where('type', 'sales')->where('is_return', false)
            ->selectRaw('COALESCE(SUM(subtotal), 0) as subtotal, COALESCE(SUM(tax_amount), 0) as tax_amount')->first();
        $salesReturns = (clone $q)->where('type', 'sales')->where('is_return', true)
            ->selectRaw('COALESCE(SUM(subtotal), 0) as subtotal, COALESCE(SUM(tax_amount), 0) as tax_amount')->first();
        $purchases = (clone $q)->where('type', 'purchase')->where('is_return', false)
            ->selectRaw('COALESCE(SUM(subtotal), 0) as subtotal, COALESCE(SUM(tax_amount), 0) as tax_amount')->first();
        $purchaseReturns = (clone $q)->where('type', 'purchase')->where('is_return', true)
            ->selectRaw('COALESCE(SUM(subtotal), 0) as subtotal, COALESCE(SUM(tax_amount), 0) as tax_amount')->first();

        $taxableSales = (float) $sales->subtotal - (float) $salesReturns->subtotal;
        $salesTax = (float) $sales->tax_amount - (float) $salesReturns->tax_amount;
        $taxablePurchases = (float) $purchases->subtotal - (float) $purchaseReturns->subtotal;
        $purchaseTax = (float) $purchases->tax_amount - (float) $purchaseReturns->tax_amount;
        $netTaxDue = round($salesTax - $purchaseTax, 4);

        $tenant = Tenant::find($tenantId);
        $company = $this->companyForReport($tenant);

        return response()->json([
            'company' => $company,
            'from_date' => $fromDate,
            'to_date' => $toDate,
            'taxable_sales' => round($taxableSales, 4),
            'taxable_purchases' => round($taxablePurchases, 4),
            'sales_tax' => round($salesTax, 4),
            'purchase_tax' => round($purchaseTax, 4),
            'net_tax_due' => $netTaxDue,
        ]);
    }

    /**
     * كشف حساب: شركة + حساب + فترة + رصيد افتتاحي + حركات + ملخص
     */
    public function accountStatement(Request $request): JsonResponse
    {
        $request->validate([
            'account_id' => [
                'required',
                'integer',
                Rule::exists('accounts', 'id')->where('tenant_id', (int) $request->tenant_id),
            ],
            'from_date' => 'required|date',
            'to_date' => 'required|date|after_or_equal:from_date',
            'journal_customer_id' => [
                'nullable',
                'integer',
                Rule::exists('customers', 'id')->where('tenant_id', (int) $request->tenant_id),
            ],
            'include_installments' => 'nullable|boolean',
        ]);

        $tenantId = $request->tenant_id;
        $tenant = Tenant::find($tenantId);
        $company = $this->companyForReport($tenant);

        $journalCustomerId = $request->filled('journal_customer_id') ? (int) $request->journal_customer_id : null;
        $includeInstallments = $request->boolean('include_installments', true);

        $data = $this->accountingService->getAccountStatement(
            $tenantId,
            (int) $request->account_id,
            $request->from_date,
            $request->to_date,
            $journalCustomerId,
            $includeInstallments,
        );

        $statementNumber = 'ST-'.now()->format('Ymd').'-'.str_pad((string) $request->account_id, 4, '0', STR_PAD_LEFT);
        $issueDate = now()->format('Y-m-d');

        return response()->json([
            'company' => $company,
            'statement_number' => $statementNumber,
            'issue_date' => $issueDate,
            'account' => $data['account'],
            'period' => $data['period'],
            'opening_balance' => $data['opening_balance'],
            'opening_balance_as_of' => $data['opening_balance_as_of'] ?? null,
            'show_previous_balance' => $data['show_previous_balance'] ?? true,
            'lines' => $data['lines'],
            'total_debit' => $data['total_debit'],
            'total_credit' => $data['total_credit'],
            'closing_balance' => $data['closing_balance'],
            'balance_type' => $data['balance_type'],
        ]);
    }

    /**
     * تقرير أرصدة العملاء: رقم الحساب، اسم العميل، إجمالي المدين، إجمالي المدفوع، الرصيد المتبقي.
     * متعدد الشركات (tenant). فلترة اختيارية: فرع، تاريخ آخر عملية، إظهار الحسابات ذات الرصيد فقط.
     */
    public function customerBalances(Request $request): JsonResponse
    {
        $request->validate([
            'branch_id' => 'nullable|integer|exists:branches,id',
            'cost_center_id' => 'nullable|integer|exists:cost_centers,id',
            'as_of_date' => 'nullable|date',
            'last_transaction_from' => 'nullable|date',
            'last_transaction_to' => 'nullable|date',
            'only_with_balance' => 'nullable|boolean',
        ]);

        $tenantId = (int) $request->tenant_id;
        $branchId = $request->filled('branch_id') ? (int) $request->branch_id : null;
        $costCenterId = $request->filled('cost_center_id') ? (int) $request->cost_center_id : null;
        $asOfDate = $request->as_of_date ? \Carbon\Carbon::parse($request->as_of_date)->format('Y-m-d') : now()->format('Y-m-d');
        $onlyWithBalance = filter_var($request->input('only_with_balance'), FILTER_VALIDATE_BOOLEAN);

        $customers = Customer::where('tenant_id', $tenantId)
            ->whereNotNull('account_id')
            ->where('is_active', true)
            ->with('account')
            ->orderBy('code')
            ->get();

        $lastDates = [];
        if ($customers->isNotEmpty()) {
            $accountIds = $customers->pluck('account_id')->unique()->filter()->values()->all();
            $q = JournalEntryLine::whereIn('account_id', $accountIds)
                ->join('journal_entries', 'journal_entries.id', '=', 'journal_entry_lines.journal_entry_id')
                ->where('journal_entries.tenant_id', $tenantId)
                ->where('journal_entries.status', 'posted');
            if ($branchId !== null) {
                $q->where('journal_entries.branch_id', $branchId);
            }
            if ($costCenterId !== null) {
                $q->where('journal_entry_lines.cost_center_id', $costCenterId);
            }
            $maxDates = $q->groupBy('journal_entry_lines.account_id')
                ->selectRaw('journal_entry_lines.account_id as account_id, MAX(journal_entries.date) as last_date')
                ->get();
            $lastDates = $maxDates->keyBy('account_id')->map(fn ($r) => $r->last_date)->toArray();
        }

        $rows = [];
        foreach ($customers as $c) {
            $accountId = $c->account_id;
            if (! $accountId || ! $c->account) {
                continue;
            }
            $balanceData = $this->accountingService->getAccountBalanceToDate($accountId, $asOfDate, $branchId, $costCenterId, $tenantId);
            $totalDebit = (float) $balanceData['debit'];
            $totalCredit = (float) $balanceData['credit'];
            $balance = $totalDebit - $totalCredit;

            if ($onlyWithBalance && abs($balance) < 0.0001) {
                continue;
            }

            $lastDate = $lastDates[$accountId] ?? null;
            if ($lastDate instanceof \Carbon\Carbon) {
                $lastDate = $lastDate->format('Y-m-d');
            }
            if ($request->filled('last_transaction_from') && $lastDate && $lastDate < $request->last_transaction_from) {
                continue;
            }
            if ($request->filled('last_transaction_to') && $lastDate && $lastDate > $request->last_transaction_to) {
                continue;
            }

            $rows[] = [
                'customer_id' => $c->id,
                'account_id' => $accountId,
                'account_code' => $c->account->code,
                'customer_name' => $c->name,
                'customer_name_en' => $c->name_en,
                'total_debit' => round($totalDebit, 4),
                'total_credit' => round($totalCredit, 4),
                'balance' => round($balance, 4),
                'last_transaction_date' => $lastDate,
                'credit_limit' => $c->credit_limit ? (float) $c->credit_limit : null,
            ];
        }

        $tenant = Tenant::find($tenantId);
        $company = $this->companyForReport($tenant);

        return response()->json([
            'company' => $company,
            'as_of_date' => $asOfDate,
            'data' => $rows,
        ]);
    }

    /**
     * تقرير أرصدة الموردين: رقم الحساب، اسم المورد، إجمالي المدين، إجمالي المدفوع، الرصيد المتبقي.
     */
    public function vendorBalances(Request $request): JsonResponse
    {
        $request->validate([
            'branch_id' => 'nullable|integer|exists:branches,id',
            'cost_center_id' => 'nullable|integer|exists:cost_centers,id',
            'as_of_date' => 'nullable|date',
            'last_transaction_from' => 'nullable|date',
            'last_transaction_to' => 'nullable|date',
            'only_with_balance' => 'nullable|boolean',
        ]);

        $tenantId = (int) $request->tenant_id;
        $branchId = $request->filled('branch_id') ? (int) $request->branch_id : null;
        $costCenterId = $request->filled('cost_center_id') ? (int) $request->cost_center_id : null;
        $asOfDate = $request->as_of_date ? \Carbon\Carbon::parse($request->as_of_date)->format('Y-m-d') : now()->format('Y-m-d');
        $onlyWithBalance = filter_var($request->input('only_with_balance'), FILTER_VALIDATE_BOOLEAN);

        $vendors = Vendor::where('tenant_id', $tenantId)
            ->whereNotNull('account_id')
            ->where('is_active', true)
            ->with('account')
            ->orderBy('code')
            ->get();

        $lastDates = [];
        if ($vendors->isNotEmpty()) {
            $accountIds = $vendors->pluck('account_id')->unique()->filter()->values()->all();
            $q = JournalEntryLine::whereIn('account_id', $accountIds)
                ->join('journal_entries', 'journal_entries.id', '=', 'journal_entry_lines.journal_entry_id')
                ->where('journal_entries.tenant_id', $tenantId)
                ->where('journal_entries.status', 'posted');
            if ($branchId !== null) {
                $q->where('journal_entries.branch_id', $branchId);
            }
            if ($costCenterId !== null) {
                $q->where('journal_entry_lines.cost_center_id', $costCenterId);
            }
            $maxDates = $q->groupBy('journal_entry_lines.account_id')
                ->selectRaw('journal_entry_lines.account_id as account_id, MAX(journal_entries.date) as last_date')
                ->get();
            $lastDates = $maxDates->keyBy('account_id')->map(fn ($r) => $r->last_date)->toArray();
        }

        $rows = [];
        foreach ($vendors as $v) {
            $accountId = $v->account_id;
            if (! $accountId || ! $v->account) {
                continue;
            }
            $balanceData = $this->accountingService->getAccountBalanceToDate($accountId, $asOfDate, $branchId, $costCenterId, $tenantId);
            $totalDebit = (float) $balanceData['debit'];
            $totalCredit = (float) $balanceData['credit'];
            $balance = $totalDebit - $totalCredit;

            if ($onlyWithBalance && abs($balance) < 0.0001) {
                continue;
            }

            $lastDate = $lastDates[$accountId] ?? null;
            if ($lastDate instanceof \Carbon\Carbon) {
                $lastDate = $lastDate->format('Y-m-d');
            }
            if ($request->filled('last_transaction_from') && $lastDate && $lastDate < $request->last_transaction_from) {
                continue;
            }
            if ($request->filled('last_transaction_to') && $lastDate && $lastDate > $request->last_transaction_to) {
                continue;
            }

            $rows[] = [
                'vendor_id' => $v->id,
                'account_id' => $accountId,
                'account_code' => $v->account->code,
                'vendor_name' => $v->name,
                'vendor_name_en' => $v->name_en,
                'total_debit' => round($totalDebit, 4),
                'total_credit' => round($totalCredit, 4),
                'balance' => round($balance, 4),
                'last_transaction_date' => $lastDate,
            ];
        }

        $tenant = Tenant::find($tenantId);
        $company = $this->companyForReport($tenant);

        return response()->json([
            'company' => $company,
            'as_of_date' => $asOfDate,
            'data' => $rows,
        ]);
    }

    /**
     * تحليل مشتريات الموردين (Vendor Purchase Analysis):
     * - Donut: توزيع إجمالي المشتريات حسب المورد
     * - جدول: اسم المورد، عدد الفواتير، إجمالي قيمة المشتريات، نسبة الخصم (discount_amount / subtotal)
     *
     * فلاتر: from_date, to_date, vendor_group_id, currency, cost_center_id, branch_id
     */
    public function vendorPurchaseAnalysis(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $request->validate([
            'from_date' => 'required|date',
            'to_date' => 'required|date|after_or_equal:from_date',
            'branch_id' => 'nullable|integer|exists:branches,id',
            'cost_center_id' => 'nullable|integer|exists:cost_centers,id',
            'currency' => 'nullable|string|max:3',
            'vendor_group_id' => 'nullable|integer',
        ]);

        $fromDate = $this->parseReportDateOnly($request->from_date);
        $toDate = $this->parseReportDateOnly($request->to_date);
        $branchId = $request->filled('branch_id') ? (int) $request->branch_id : null;
        $costCenterId = $request->filled('cost_center_id') ? (int) $request->cost_center_id : null;
        $currency = $request->filled('currency') ? strtoupper(trim((string) $request->currency)) : null;
        $vendorGroupId = $request->filled('vendor_group_id') ? (int) $request->vendor_group_id : null;

        $baseInvoiceQuery = DB::table('invoices as i')
            ->join('vendors as v', 'v.id', '=', 'i.vendor_id')
            ->where('i.tenant_id', $tenantId)
            ->where('i.type', 'purchase')
            ->where('i.is_return', false)
            ->whereNotIn('i.status', ['cancelled', 'draft'])
            ->whereNotNull('i.journal_entry_id')
            ->whereNotNull('i.vendor_id')
            ->whereDate('i.date', '>=', $fromDate)
            ->whereDate('i.date', '<=', $toDate)
            ->when($branchId !== null, fn ($q) => $q->where('i.branch_id', $branchId))
            ->when($costCenterId !== null, fn ($q) => $q->where('i.cost_center_id', $costCenterId))
            ->when($currency !== null, fn ($q) => $q->where('i.currency', $currency))
            ->when($vendorGroupId !== null, fn ($q) => $q->where('v.vendor_group_id', $vendorGroupId));

        $agg = (clone $baseInvoiceQuery)
            ->groupBy('i.vendor_id', 'v.name', 'v.name_en')
            ->selectRaw('i.vendor_id, v.name as vendor_name, v.name_en as vendor_name_en, COUNT(*) as invoice_count, COALESCE(SUM(i.total), 0) as total_purchases, COALESCE(SUM(i.subtotal), 0) as subtotal_sum, COALESCE(SUM(i.discount_amount), 0) as discount_sum')
            ->get();

        $qtyByVendor = DB::table('invoice_lines as il')
            ->join('invoices as i', 'i.id', '=', 'il.invoice_id')
            ->join('vendors as v', 'v.id', '=', 'i.vendor_id')
            ->where('i.tenant_id', $tenantId)
            ->where('i.type', 'purchase')
            ->where('i.is_return', false)
            ->whereNotIn('i.status', ['cancelled', 'draft'])
            ->whereNotNull('i.journal_entry_id')
            ->whereNotNull('i.vendor_id')
            ->whereDate('i.date', '>=', $fromDate)
            ->whereDate('i.date', '<=', $toDate)
            ->when($branchId !== null, fn ($q) => $q->where('i.branch_id', $branchId))
            ->when($costCenterId !== null, fn ($q) => $q->where('i.cost_center_id', $costCenterId))
            ->when($currency !== null, fn ($q) => $q->where('i.currency', $currency))
            ->when($vendorGroupId !== null, fn ($q) => $q->where('v.vendor_group_id', $vendorGroupId))
            ->groupBy('i.vendor_id')
            ->selectRaw('i.vendor_id, COALESCE(SUM(il.quantity), 0) as total_qty')
            ->get()
            ->keyBy(fn ($r) => (int) $r->vendor_id);

        $rows0 = $agg->map(function ($r) use ($qtyByVendor) {
            $subtotal = (float) ($r->subtotal_sum ?? 0);
            $discount = (float) ($r->discount_sum ?? 0);
            $pct = $subtotal > 0.0000001 ? round(($discount / $subtotal) * 100, 2) : 0.0;
            $vid = (int) $r->vendor_id;
            $qtyRow = $qtyByVendor->get($vid);
            $qty = $qtyRow !== null ? (float) ($qtyRow->total_qty ?? 0) : 0.0;

            return [
                'vendor_id' => $vid,
                'vendor_name' => (string) ($r->vendor_name ?? ''),
                'vendor_name_en' => $r->vendor_name_en,
                'invoice_count' => (int) $r->invoice_count,
                'total_purchases' => round((float) ($r->total_purchases ?? 0), 4),
                'total_qty' => round($qty, 4),
                'discount_percent' => $pct,
            ];
        })->sortByDesc('total_purchases')->values();

        $total = (float) $rows0->sum('total_purchases');
        $rows = $rows0->map(function ($r) use ($total) {
            $p = (float) ($r['total_purchases'] ?? 0);
            $pct = $total > 0.0000001 ? round(($p / $total) * 100, 2) : 0.0;
            $r['pct_of_total'] = $pct;

            return $r;
        })->values()->all();

        // Donut: top 9 + "Others"
        $donut = [];
        $others = 0.0;
        foreach ($rows as $i => $r) {
            if ($i < 9) {
                $donut[] = [
                    'vendor_id' => $r['vendor_id'],
                    'vendor_name' => $r['vendor_name'],
                    'vendor_name_en' => $r['vendor_name_en'],
                    'value' => (float) $r['total_purchases'],
                ];
            } else {
                $others += (float) $r['total_purchases'];
            }
        }
        if ($others > 0.0000001) {
            $donut[] = [
                'vendor_id' => null,
                'vendor_name' => 'أخرى',
                'vendor_name_en' => 'Others',
                'value' => round($others, 4),
            ];
        }

        $tenant = Tenant::find($tenantId);
        $company = $this->companyForReport($tenant);

        return response()->json([
            'company' => $company,
            'from_date' => $fromDate,
            'to_date' => $toDate,
            'currency' => $currency,
            'total_purchases' => round($total, 4),
            'donut' => $donut,
            'data' => $rows,
        ]);
    }

    /**
     * أعمار ديون الموردين (Accounts Payable Aging): مثل أعمار ديون العملاء لكن لفواتير المشتريات.
     * فلاتر: as_of_date, invoice_date_from/to, vendor_id, vendor_group_id, branch_id, cost_center_id, currency
     */
    public function vendorAging(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $request->validate([
            'as_of_date' => 'nullable|date',
            'invoice_date_from' => 'nullable|date',
            'invoice_date_to' => 'nullable|date',
            'vendor_id' => 'nullable|integer|exists:vendors,id',
            'vendor_group_id' => 'nullable|integer',
            'branch_id' => 'nullable|integer|exists:branches,id',
            'cost_center_id' => 'nullable|integer|exists:cost_centers,id',
            'currency' => 'nullable|string|max:3',
            'include_zero_balance' => 'nullable|boolean',
        ]);

        $asOfDate = $request->as_of_date ? \Carbon\Carbon::parse($request->as_of_date)->format('Y-m-d') : now()->format('Y-m-d');
        $invoiceDateFrom = $request->filled('invoice_date_from') ? \Carbon\Carbon::parse($request->invoice_date_from)->format('Y-m-d') : null;
        $invoiceDateTo = $request->filled('invoice_date_to') ? \Carbon\Carbon::parse($request->invoice_date_to)->format('Y-m-d') : null;
        if ($invoiceDateFrom && $invoiceDateTo && $invoiceDateFrom > $invoiceDateTo) {
            [$invoiceDateFrom, $invoiceDateTo] = [$invoiceDateTo, $invoiceDateFrom];
        }
        $vendorId = $request->filled('vendor_id') ? (int) $request->vendor_id : null;
        $vendorGroupId = $request->filled('vendor_group_id') ? (int) $request->vendor_group_id : null;
        $branchId = $request->filled('branch_id') ? (int) $request->branch_id : null;
        $costCenterId = $request->filled('cost_center_id') ? (int) $request->cost_center_id : null;
        $currency = $request->filled('currency') ? strtoupper(trim((string) $request->currency)) : null;
        $includeZeroBalance = filter_var($request->input('include_zero_balance'), FILTER_VALIDATE_BOOLEAN);

        $reportDay = \Carbon\Carbon::parse($asOfDate)->startOfDay();

        $invoices = Invoice::query()
            ->where('tenant_id', $tenantId)
            ->where('type', 'purchase')
            ->where('is_return', false)
            ->whereNotIn('status', ['cancelled', 'draft'])
            ->whereNotNull('journal_entry_id')
            ->whereNotNull('vendor_id')
            ->when($invoiceDateFrom !== null, fn ($q) => $q->whereDate('date', '>=', $invoiceDateFrom))
            ->when($invoiceDateTo !== null, fn ($q) => $q->whereDate('date', '<=', $invoiceDateTo))
            ->when($vendorId !== null, fn ($q) => $q->where('vendor_id', $vendorId))
            ->when($branchId !== null, fn ($q) => $q->where('branch_id', $branchId))
            ->when($costCenterId !== null, fn ($q) => $q->where('cost_center_id', $costCenterId))
            ->when($currency !== null, fn ($q) => $q->where('currency', $currency))
            ->with(['vendor.account', 'branch'])
            ->orderBy('vendor_id')
            ->orderBy('due_date')
            ->get();

        if ($vendorGroupId !== null) {
            $allowedVendorIds = Vendor::where('tenant_id', $tenantId)
                ->where('vendor_group_id', $vendorGroupId)
                ->pluck('id')
                ->map(fn ($id) => (int) $id)
                ->all();
            $allowedSet = array_flip($allowedVendorIds);
            $invoices = $invoices->filter(fn ($inv) => isset($allowedSet[(int) $inv->vendor_id]))->values();
        }

        $buckets = [];
        $dueThisWeekTotal = 0.0;
        $weekEnd = $reportDay->copy()->addDays(7)->endOfDay();

        foreach ($invoices as $inv) {
            $balance = (float) ($inv->balance ?? 0);
            if (! $includeZeroBalance && abs($balance) < 0.0001) {
                continue;
            }

            $dueDay = $inv->due_date
                ? \Carbon\Carbon::parse($inv->due_date)->startOfDay()
                : \Carbon\Carbon::parse($inv->date)->startOfDay();

            if ($dueDay->gte($reportDay) && $dueDay->lte($weekEnd)) {
                $dueThisWeekTotal += $balance;
            }

            $key = (int) $inv->vendor_id;
            if (! isset($buckets[$key])) {
                $v = $inv->vendor;
                $buckets[$key] = [
                    'vendor_id' => $key,
                    'account_code' => $v && $v->account ? $v->account->code : '',
                    'vendor_name' => $v ? $v->name : '',
                    'vendor_name_en' => $v ? $v->name_en : null,
                    'branch_name' => $inv->branch ? $inv->branch->name : null,
                    'branch_name_en' => $inv->branch && $inv->branch->name_en ? $inv->branch->name_en : null,
                    'not_yet_due' => 0,
                    'days_1_30' => 0,
                    'days_31_60' => 0,
                    'days_61_90' => 0,
                    'over_90' => 0,
                    'total' => 0,
                    'details' => [
                        'not_yet_due' => [],
                        'days_1_30' => [],
                        'days_31_60' => [],
                        'days_61_90' => [],
                        'over_90' => [],
                    ],
                ];
            }

            $line = [
                'invoice_id' => (int) $inv->id,
                'number' => (string) ($inv->number ?? ''),
                'due_date' => $dueDay->toDateString(),
                'balance' => round($balance, 4),
            ];

            if ($dueDay->gt($reportDay)) {
                $bucket = 'not_yet_due';
                $buckets[$key]['not_yet_due'] += $balance;
            } else {
                $daysLate = (int) $dueDay->diffInDays($reportDay, false);
                if ($daysLate < 0) {
                    $daysLate = 0;
                }
                if ($daysLate <= 30) {
                    $bucket = 'days_1_30';
                    $buckets[$key]['days_1_30'] += $balance;
                } elseif ($daysLate <= 60) {
                    $bucket = 'days_31_60';
                    $buckets[$key]['days_31_60'] += $balance;
                } elseif ($daysLate <= 90) {
                    $bucket = 'days_61_90';
                    $buckets[$key]['days_61_90'] += $balance;
                } else {
                    $bucket = 'over_90';
                    $buckets[$key]['over_90'] += $balance;
                }
            }

            $buckets[$key]['details'][$bucket][] = $line;
            $buckets[$key]['total'] += $balance;
        }

        $rows = array_values(array_map(function ($r) {
            $r['not_yet_due'] = round($r['not_yet_due'], 4);
            $r['days_1_30'] = round($r['days_1_30'], 4);
            $r['days_31_60'] = round($r['days_31_60'], 4);
            $r['days_61_90'] = round($r['days_61_90'], 4);
            $r['over_90'] = round($r['over_90'], 4);
            $r['total'] = round($r['total'], 4);

            return $r;
        }, $buckets));

        usort($rows, fn ($a, $b) => strcmp($a['vendor_name'] ?? '', $b['vendor_name'] ?? ''));

        $tenant = Tenant::find($tenantId);
        $company = $this->companyForReport($tenant);

        return response()->json([
            'company' => $company,
            'as_of_date' => $asOfDate,
            'due_within_7_days_total' => round($dueThisWeekTotal, 4),
            'data' => $rows,
        ]);
    }

    /**
     * تقييم أداء الموردين (Vendor Performance Rating).
     * مقاييس عملية متاحة من البيانات الحالية:
     * - نسبة المرتجعات: إجمالي مرتجعات المشتريات / إجمالي المشتريات
     * - استقرار الأسعار: عدد تغيّرات أسعار الوحدة عبر الأصناف خلال الفترة (تقريباً)
     *
     * فلاتر: from_date, to_date, vendor_id, vendor_group_id, currency, cost_center_id, branch_id
     */
    public function vendorPerformance(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $request->validate([
            'from_date' => 'required|date',
            'to_date' => 'required|date|after_or_equal:from_date',
            'vendor_id' => 'nullable|integer|exists:vendors,id',
            'vendor_group_id' => 'nullable|integer',
            'branch_id' => 'nullable|integer|exists:branches,id',
            'cost_center_id' => 'nullable|integer|exists:cost_centers,id',
            'currency' => 'nullable|string|max:3',
        ]);

        $fromDate = $this->parseReportDateOnly($request->from_date);
        $toDate = $this->parseReportDateOnly($request->to_date);
        $vendorId = $request->filled('vendor_id') ? (int) $request->vendor_id : null;
        $vendorGroupId = $request->filled('vendor_group_id') ? (int) $request->vendor_group_id : null;
        $branchId = $request->filled('branch_id') ? (int) $request->branch_id : null;
        $costCenterId = $request->filled('cost_center_id') ? (int) $request->cost_center_id : null;
        $currency = $request->filled('currency') ? strtoupper(trim((string) $request->currency)) : null;

        $purchases = DB::table('invoices as i')
            ->join('vendors as v', 'v.id', '=', 'i.vendor_id')
            ->where('i.tenant_id', $tenantId)
            ->where('i.type', 'purchase')
            ->where('i.is_return', false)
            ->whereNotIn('i.status', ['cancelled', 'draft'])
            ->whereNotNull('i.journal_entry_id')
            ->whereNotNull('i.vendor_id')
            ->whereDate('i.date', '>=', $fromDate)
            ->whereDate('i.date', '<=', $toDate)
            ->when($vendorId !== null, fn ($q) => $q->where('i.vendor_id', $vendorId))
            ->when($branchId !== null, fn ($q) => $q->where('i.branch_id', $branchId))
            ->when($costCenterId !== null, fn ($q) => $q->where('i.cost_center_id', $costCenterId))
            ->when($currency !== null, fn ($q) => $q->where('i.currency', $currency))
            ->when($vendorGroupId !== null, fn ($q) => $q->where('v.vendor_group_id', $vendorGroupId))
            ->groupBy('i.vendor_id', 'v.name', 'v.name_en')
            ->selectRaw('i.vendor_id, v.name as vendor_name, v.name_en as vendor_name_en, COALESCE(SUM(i.total), 0) as total_purchases')
            ->get()
            ->keyBy(fn ($r) => (int) $r->vendor_id);

        $returns = DB::table('invoices as i')
            ->where('i.tenant_id', $tenantId)
            ->where('i.type', 'purchase')
            ->where('i.is_return', true)
            ->whereNotIn('i.status', ['cancelled', 'draft'])
            ->whereNotNull('i.journal_entry_id')
            ->whereNotNull('i.vendor_id')
            ->whereDate('i.date', '>=', $fromDate)
            ->whereDate('i.date', '<=', $toDate)
            ->when($vendorId !== null, fn ($q) => $q->where('i.vendor_id', $vendorId))
            ->when($branchId !== null, fn ($q) => $q->where('i.branch_id', $branchId))
            ->when($costCenterId !== null, fn ($q) => $q->where('i.cost_center_id', $costCenterId))
            ->when($currency !== null, fn ($q) => $q->where('i.currency', $currency))
            ->groupBy('i.vendor_id')
            ->selectRaw('i.vendor_id, COALESCE(SUM(i.total), 0) as total_returns')
            ->get()
            ->keyBy(fn ($r) => (int) $r->vendor_id);

        // Price stability proxy: per vendor, count distinct unit_price per item across invoice_lines (purchases only)
        $priceAgg = DB::table('invoice_lines as il')
            ->join('invoices as i', 'i.id', '=', 'il.invoice_id')
            ->join('vendors as v', 'v.id', '=', 'i.vendor_id')
            ->where('i.tenant_id', $tenantId)
            ->where('i.type', 'purchase')
            ->where('i.is_return', false)
            ->whereNotIn('i.status', ['cancelled', 'draft'])
            ->whereNotNull('i.journal_entry_id')
            ->whereNotNull('i.vendor_id')
            ->whereDate('i.date', '>=', $fromDate)
            ->whereDate('i.date', '<=', $toDate)
            ->when($vendorId !== null, fn ($q) => $q->where('i.vendor_id', $vendorId))
            ->when($branchId !== null, fn ($q) => $q->where('i.branch_id', $branchId))
            ->when($costCenterId !== null, fn ($q) => $q->where('i.cost_center_id', $costCenterId))
            ->when($currency !== null, fn ($q) => $q->where('i.currency', $currency))
            ->when($vendorGroupId !== null, fn ($q) => $q->where('v.vendor_group_id', $vendorGroupId))
            ->groupBy('i.vendor_id', 'il.item_id')
            ->selectRaw('i.vendor_id, il.item_id, COUNT(DISTINCT il.unit_price) as distinct_prices')
            ->get();

        $priceChangeScore = [];
        foreach ($priceAgg as $r) {
            $vid = (int) $r->vendor_id;
            $distinct = (int) $r->distinct_prices;
            $changes = max(0, $distinct - 1);
            $priceChangeScore[$vid] = ($priceChangeScore[$vid] ?? 0) + $changes;
        }

        $vendorIds = collect($purchases->keys())->merge(collect($returns->keys()))->unique()->values()->all();
        $vendors = Vendor::query()
            ->where('tenant_id', $tenantId)
            ->whereIn('id', $vendorIds)
            ->get()
            ->keyBy('id');

        $rows = [];
        foreach ($vendorIds as $vid) {
            $p = $purchases->get($vid);
            $v = $vendors->get($vid);
            $purchTotal = (float) ($p->total_purchases ?? 0);
            $retTotal = (float) (($returns->get($vid)->total_returns ?? 0) ?: 0);
            $returnRate = $purchTotal > 0.0000001 ? round(($retTotal / $purchTotal) * 100, 2) : 0.0;

            $priceChanges = (int) ($priceChangeScore[$vid] ?? 0);
            $priceStabilityScore = max(0, 100 - min(100, $priceChanges * 12));

            $returnScore = max(0, 100 - min(100, $returnRate * 2));
            $overall = round(($returnScore * 0.6) + ($priceStabilityScore * 0.4), 1);

            $rows[] = [
                'vendor_id' => (int) $vid,
                'vendor_name' => $v ? $v->name : ($p->vendor_name ?? ''),
                'vendor_name_en' => $v ? $v->name_en : ($p->vendor_name_en ?? null),
                'total_purchases' => round($purchTotal, 4),
                'total_returns' => round($retTotal, 4),
                'return_rate_percent' => $returnRate,
                'price_changes_count' => $priceChanges,
                'score' => $overall,
                'stars' => (int) max(1, min(5, round($overall / 20))),
            ];
        }

        usort($rows, fn ($a, $b) => ($b['score'] <=> $a['score']) ?: strcmp($a['vendor_name'] ?? '', $b['vendor_name'] ?? ''));

        $tenant = Tenant::find($tenantId);
        $company = $this->companyForReport($tenant);

        return response()->json([
            'company' => $company,
            'from_date' => $fromDate,
            'to_date' => $toDate,
            'data' => $rows,
        ]);
    }

    /**
     * آخر N حركة لحساب (لنافذة كشف حساب سريع).
     */
    public function accountLastMovements(Request $request): JsonResponse
    {
        $request->validate([
            'account_id' => 'required|integer|exists:accounts,id',
            'limit' => 'nullable|integer|min:1|max:50',
        ]);

        $tenantId = (int) $request->tenant_id;
        $accountId = (int) $request->account_id;
        $limit = (int) ($request->input('limit') ?: 10);

        $lines = JournalEntryLine::where('journal_entry_lines.account_id', $accountId)
            ->join('journal_entries', 'journal_entries.id', '=', 'journal_entry_lines.journal_entry_id')
            ->where('journal_entries.tenant_id', $tenantId)
            ->where('journal_entries.status', 'posted')
            ->select('journal_entry_lines.*')
            ->orderBy('journal_entries.date', 'desc')
            ->orderBy('journal_entry_lines.id', 'desc')
            ->limit($limit)
            ->get();

        $jeIds = $lines->pluck('journal_entry_id')->unique()->values()->all();
        $journalEntries = $jeIds ? JournalEntry::whereIn('id', $jeIds)->get()->keyBy('id') : collect();
        foreach ($lines as $line) {
            $line->setRelation('journalEntry', $journalEntries->get($line->journal_entry_id));
        }
        $lines = $lines->sortBy(function ($line) {
            $je = $line->journalEntry;
            $d = $je && $je->date ? $je->date->format('Y-m-d') : '';

            return $d.'-'.str_pad((string) $line->id, 8, '0', STR_PAD_LEFT);
        })->values();

        $mapType = function ($je) {
            if ($je->reference_type && str_ends_with($je->reference_type ?? '', 'Invoice')) {
                return 'فاتورة';
            }
            if ($je->reference_type && str_ends_with($je->reference_type ?? '', 'Payment')) {
                return 'دفعة';
            }
            $m = ['manual' => 'قيد يدوي', 'sales' => 'مبيعات', 'purchase' => 'مشتريات', 'payment' => 'سند', 'adjustment' => 'تسوية'];

            return $m[$je->type ?? ''] ?? ($je->type ?? '—');
        };

        $result = [];
        foreach ($lines as $line) {
            $je = $line->journalEntry;
            $refNumber = $je ? ($je->number ?? '') : '';
            if ($je && $je->reference_type && str_ends_with($je->reference_type, 'Invoice')) {
                $inv = Invoice::where('id', $je->reference_id)->first();
                $refNumber = $inv ? $inv->number : $refNumber;
            }
            $result[] = [
                'date' => $je?->date?->format('Y-m-d'),
                'reference_number' => $refNumber,
                'operation_type' => $je ? $mapType($je) : '—',
                'description' => $line->description ?: ($je->description ?? ''),
                'debit' => (float) $line->debit,
                'credit' => (float) $line->credit,
            ];
        }

        return response()->json(['lines' => $result]);
    }

    /**
     * تقرير المصروفات: فلاتر (تاريخ، فرع، مركز تكلفة، بند مصروف، طريقة دفع)، ملخص إجماليات، جدول تفصيلي، رسم دائري، مقارنة شهرية.
     */
    public function expensesReport(Request $request): JsonResponse
    {
        $request->validate([
            'from_date' => 'required|date',
            'to_date' => 'required|date|after_or_equal:from_date',
            'branch_id' => 'nullable|integer|exists:branches,id',
            'cost_center_id' => 'nullable|integer|exists:cost_centers,id',
            'account_id' => 'nullable|integer|exists:accounts,id',
            'payment_method_id' => 'nullable|integer|exists:payment_methods,id',
        ]);

        $tenantId = (int) $request->tenant_id;
        $fromDate = $this->parseReportDateOnly($request->from_date);
        $toDate = $this->parseReportDateOnly($request->to_date);
        $branchId = $request->filled('branch_id') ? (int) $request->branch_id : null;
        $costCenterId = $request->filled('cost_center_id') ? (int) $request->cost_center_id : null;
        $accountId = $request->filled('account_id') ? (int) $request->account_id : null;
        $paymentMethodId = $request->filled('payment_method_id') ? (int) $request->payment_method_id : null;

        $expenseAccountIds = Account::where('tenant_id', $tenantId)
            ->where('type', 'expense')
            ->when($accountId, fn ($q) => $q->where('id', $accountId))
            ->pluck('id')
            ->all();
        if (empty($expenseAccountIds)) {
            $tenant = Tenant::find($tenantId);

            return response()->json([
                'company' => $this->companyForReport($tenant),
                'from_date' => $fromDate,
                'to_date' => $toDate,
                'summary' => ['total_without_vat' => 0, 'total_vat' => 0, 'net_total' => 0],
                'rows' => [],
                'pie_data' => [],
                'bar_data' => ['current_period' => 0, 'previous_period' => 0],
            ]);
        }

        $baseQuery = DB::table('journal_entry_lines')
            ->join('journal_entries', 'journal_entries.id', '=', 'journal_entry_lines.journal_entry_id')
            ->join('accounts', 'accounts.id', '=', 'journal_entry_lines.account_id')
            ->leftJoin('cost_centers', 'cost_centers.id', '=', 'journal_entry_lines.cost_center_id')
            ->where('journal_entries.tenant_id', $tenantId)
            ->where('journal_entries.status', 'posted')
            ->whereIn('journal_entry_lines.account_id', $expenseAccountIds)
            ->whereDate('journal_entries.date', '>=', $fromDate)
            ->whereDate('journal_entries.date', '<=', $toDate)
            ->when($branchId, fn ($q) => $q->where('journal_entries.branch_id', $branchId))
            ->when($costCenterId, fn ($q) => $q->where('journal_entry_lines.cost_center_id', $costCenterId));

        if ($paymentMethodId !== null) {
            $baseQuery->leftJoin('payments', function ($j) {
                $j->on('payments.id', '=', 'journal_entries.reference_id')
                    ->where('journal_entries.reference_type', '=', Payment::class);
            })->where(function ($q) use ($paymentMethodId) {
                $q->whereNull('journal_entries.reference_type')
                    ->orWhere('journal_entries.reference_type', '!=', Payment::class)
                    ->orWhere('payments.payment_method_id', '=', $paymentMethodId);
            });
        }

        $rowsQuery = (clone $baseQuery)->select([
            'journal_entries.date',
            'journal_entries.number as voucher_number',
            'accounts.name as expense_item_name',
            'accounts.id as account_id',
            'cost_centers.name as cost_center_name',
            'journal_entry_lines.description',
            DB::raw('(journal_entry_lines.debit - journal_entry_lines.credit) as amount'),
        ])->orderBy('journal_entries.date')->orderBy('journal_entries.id')->orderBy('journal_entry_lines.id');

        $rowsRaw = $rowsQuery->get();
        $rows = [];
        $totalWithoutVat = 0;
        foreach ($rowsRaw as $r) {
            $amount = (float) $r->amount;
            if ($amount <= 0) {
                continue;
            }
            $vat = 0;
            $total = $amount + $vat;
            $totalWithoutVat += $amount;
            $rawDesc = $r->description !== null && trim((string) $r->description) !== '' ? trim((string) $r->description) : null;
            $shortDesc = $this->formatExpenseReportDescription($rawDesc);
            $row = [
                'date' => $r->date,
                'voucher_number' => $r->voucher_number,
                'expense_item_name' => $r->expense_item_name,
                'account_id' => (int) $r->account_id,
                'cost_center_name' => $r->cost_center_name ?? null,
                'description' => $shortDesc,
                'amount' => round($amount, 4),
                'vat' => round($vat, 4),
                'total' => round($total, 4),
            ];
            if ($rawDesc !== null && $shortDesc !== $rawDesc) {
                $row['description_full'] = $rawDesc;
            }
            $rows[] = $row;
        }

        $pieRaw = (clone $baseQuery)
            ->select('journal_entry_lines.account_id', 'accounts.name as account_name', DB::raw('SUM(journal_entry_lines.debit - journal_entry_lines.credit) as total_amount'))
            ->groupBy('journal_entry_lines.account_id', 'accounts.name')
            ->havingRaw('SUM(journal_entry_lines.debit - journal_entry_lines.credit) > 0')
            ->get();
        $pie_data = $pieRaw->map(fn ($p) => [
            'account_id' => (int) $p->account_id,
            'account_name' => $p->account_name,
            'amount' => round((float) $p->total_amount, 4),
        ])->values()->all();

        $currentPeriodTotal = $totalWithoutVat;
        $fromCarbon = \Carbon\Carbon::parse($fromDate);
        $toCarbon = \Carbon\Carbon::parse($toDate);
        $days = $fromCarbon->diffInDays($toCarbon) + 1;
        $prevFrom = $fromCarbon->copy()->subDays($days)->format('Y-m-d');
        $prevTo = $fromCarbon->copy()->subDay()->format('Y-m-d');
        $prevQuery = DB::table('journal_entry_lines')
            ->join('journal_entries', 'journal_entries.id', '=', 'journal_entry_lines.journal_entry_id')
            ->where('journal_entries.tenant_id', $tenantId)
            ->where('journal_entries.status', 'posted')
            ->whereIn('journal_entry_lines.account_id', $expenseAccountIds)
            ->whereDate('journal_entries.date', '>=', $prevFrom)
            ->whereDate('journal_entries.date', '<=', $prevTo)
            ->when($branchId, fn ($q) => $q->where('journal_entries.branch_id', $branchId))
            ->when($costCenterId, fn ($q) => $q->where('journal_entry_lines.cost_center_id', $costCenterId));
        if ($paymentMethodId !== null) {
            $prevQuery->leftJoin('payments', function ($j) {
                $j->on('payments.id', '=', 'journal_entries.reference_id')
                    ->where('journal_entries.reference_type', '=', Payment::class);
            })->where(function ($q) use ($paymentMethodId) {
                $q->whereNull('journal_entries.reference_type')
                    ->orWhere('journal_entries.reference_type', '!=', Payment::class)
                    ->orWhere('payments.payment_method_id', '=', $paymentMethodId);
            });
        }
        $previousPeriodTotal = (float) $prevQuery->selectRaw('SUM(journal_entry_lines.debit - journal_entry_lines.credit) as s')->value('s');

        $tenant = Tenant::find($tenantId);

        return response()->json([
            'company' => $this->companyForReport($tenant),
            'from_date' => $fromDate,
            'to_date' => $toDate,
            'summary' => [
                'total_without_vat' => round($totalWithoutVat, 4),
                'total_vat' => 0,
                'net_total' => round($totalWithoutVat, 4),
            ],
            'rows' => $rows,
            'pie_data' => $pie_data,
            'bar_data' => [
                'current_period' => round($currentPeriodTotal, 4),
                'previous_period' => round($previousPeriodTotal, 4),
            ],
        ]);
    }

    /**
     * تقرير أعمار ديون العملاء (Customer Aging): تقسيم رصيد كل فاتورة مبيعات غير مسددة حسب تاريخ الاستحقاق مقابل as_of_date.
     * غير مستحق: due_date > يوم التقرير. متأخر: due_date <= يوم التقرير مع عدد الأيام (0–30، 31–60، 61–90، >90).
     * إن لم يُسجّل due_date يُعتمد تاريخ الفاتورة. كل صف عميل يتضمن details لفواتير كل خانة (invoice_id, number, due_date, balance).
     * فلاتر: as_of_date (يوم احتساب التأخير)، invoice_date_from / invoice_date_to (اختياري — تاريخ فاتورة المبيعات ضمن النطاق، مثل قائمة الفواتير)، عميل، فرع، مركز تكلفة، مندوب مبيعات (created_by)، include_zero_balance (API).
     */
    public function customerAging(Request $request): JsonResponse
    {
        $request->validate([
            'as_of_date' => 'nullable|date',
            'invoice_date_from' => 'nullable|date',
            'invoice_date_to' => 'nullable|date',
            'customer_id' => 'nullable|integer|exists:customers,id',
            'branch_id' => 'nullable|integer|exists:branches,id',
            'cost_center_id' => 'nullable|integer|exists:cost_centers,id',
            'created_by' => 'nullable|integer|exists:users,id',
            'include_zero_balance' => 'nullable|boolean',
        ]);

        $tenantId = (int) $request->tenant_id;
        $asOfDate = $request->as_of_date ? \Carbon\Carbon::parse($request->as_of_date)->format('Y-m-d') : now()->format('Y-m-d');
        $invoiceDateFrom = $request->filled('invoice_date_from')
            ? \Carbon\Carbon::parse($request->invoice_date_from)->format('Y-m-d')
            : null;
        $invoiceDateTo = $request->filled('invoice_date_to')
            ? \Carbon\Carbon::parse($request->invoice_date_to)->format('Y-m-d')
            : null;
        if ($invoiceDateFrom && $invoiceDateTo && $invoiceDateFrom > $invoiceDateTo) {
            [$invoiceDateFrom, $invoiceDateTo] = [$invoiceDateTo, $invoiceDateFrom];
        }
        $customerId = $request->filled('customer_id') ? (int) $request->customer_id : null;
        $branchId = $request->filled('branch_id') ? (int) $request->branch_id : null;
        $costCenterId = $request->filled('cost_center_id') ? (int) $request->cost_center_id : null;
        $createdBy = $request->filled('created_by') ? (int) $request->created_by : null;
        $includeZeroBalance = filter_var($request->input('include_zero_balance'), FILTER_VALIDATE_BOOLEAN);

        $reportDay = \Carbon\Carbon::parse($asOfDate)->startOfDay();

        $invoices = Invoice::where('tenant_id', $tenantId)
            ->where('type', 'sales')
            ->where('is_return', false)
            ->whereNotIn('status', ['cancelled', 'draft'])
            ->whereNotNull('journal_entry_id')
            ->whereNotNull('customer_id')
            ->when($invoiceDateFrom !== null, fn ($q) => $q->whereDate('date', '>=', $invoiceDateFrom))
            ->when($invoiceDateTo !== null, fn ($q) => $q->whereDate('date', '<=', $invoiceDateTo))
            ->when($customerId !== null, fn ($q) => $q->where('customer_id', $customerId))
            ->when($branchId !== null, fn ($q) => $q->where('branch_id', $branchId))
            ->when($costCenterId !== null, fn ($q) => $q->where('cost_center_id', $costCenterId))
            ->when($createdBy !== null, fn ($q) => $q->where('created_by', $createdBy))
            ->with(['customer.account', 'branch', 'createdBy:id,name'])
            ->orderBy('customer_id')
            ->orderBy('due_date')
            ->get();

        $buckets = [];
        foreach ($invoices as $inv) {
            $balance = (float) ($inv->balance ?? 0);
            if (! $includeZeroBalance && abs($balance) < 0.0001) {
                continue;
            }
            // تاريخ الاستحقاق الفعلي: due_date وإلا تاريخ الفاتورة (ممارسة شائعة لأرصدة العملاء)
            $dueDay = $inv->due_date
                ? \Carbon\Carbon::parse($inv->due_date)->startOfDay()
                : \Carbon\Carbon::parse($inv->date)->startOfDay();

            $key = $inv->customer_id;
            if (! isset($buckets[$key])) {
                $c = $inv->customer;
                $buckets[$key] = [
                    'customer_id' => $inv->customer_id,
                    'account_code' => $c && $c->account ? $c->account->code : '',
                    'customer_name' => $c ? $c->name : '',
                    'customer_name_en' => $c ? $c->name_en : null,
                    'branch_name' => $inv->branch ? $inv->branch->name : null,
                    'branch_name_en' => $inv->branch && $inv->branch->name_en ? $inv->branch->name_en : null,
                    'sales_rep_name' => $inv->createdBy ? $inv->createdBy->name : null,
                    'not_yet_due' => 0,
                    'days_1_30' => 0,
                    'days_31_60' => 0,
                    'days_61_90' => 0,
                    'over_90' => 0,
                    'total' => 0,
                    'details' => [
                        'not_yet_due' => [],
                        'days_1_30' => [],
                        'days_31_60' => [],
                        'days_61_90' => [],
                        'over_90' => [],
                    ],
                ];
            }

            $line = [
                'invoice_id' => (int) $inv->id,
                'number' => (string) ($inv->number ?? ''),
                'due_date' => $dueDay->toDateString(),
                'balance' => round($balance, 4),
            ];

            // غير مستحق: تاريخ الاستحقاق بعد يوم التقرير فقط (Due > Report)
            if ($dueDay->gt($reportDay)) {
                $bucket = 'not_yet_due';
                $buckets[$key]['not_yet_due'] += $balance;
            } else {
                // متأخر: عدد الأيام من تاريخ الاستحقاق حتى يوم التقرير (شامل)
                $daysLate = (int) $dueDay->diffInDays($reportDay, false);
                if ($daysLate < 0) {
                    $daysLate = 0;
                }
                if ($daysLate <= 30) {
                    $bucket = 'days_1_30';
                    $buckets[$key]['days_1_30'] += $balance;
                } elseif ($daysLate <= 60) {
                    $bucket = 'days_31_60';
                    $buckets[$key]['days_31_60'] += $balance;
                } elseif ($daysLate <= 90) {
                    $bucket = 'days_61_90';
                    $buckets[$key]['days_61_90'] += $balance;
                } else {
                    $bucket = 'over_90';
                    $buckets[$key]['over_90'] += $balance;
                }
            }

            $buckets[$key]['details'][$bucket][] = $line;
            $buckets[$key]['total'] += $balance;
        }

        $rows = array_values(array_map(function ($r) {
            $r['not_yet_due'] = round($r['not_yet_due'], 4);
            $r['days_1_30'] = round($r['days_1_30'], 4);
            $r['days_31_60'] = round($r['days_31_60'], 4);
            $r['days_61_90'] = round($r['days_61_90'], 4);
            $r['over_90'] = round($r['over_90'], 4);
            $r['total'] = round($r['total'], 4);

            return $r;
        }, $buckets));

        usort($rows, fn ($a, $b) => strcmp($a['customer_name'] ?? '', $b['customer_name'] ?? ''));

        $tenant = Tenant::find($tenantId);
        $company = $this->companyForReport($tenant);

        return response()->json([
            'company' => $company,
            'as_of_date' => $asOfDate,
            'data' => $rows,
        ]);
    }

    /**
     * تصنيف عميل حسب نسبة مبيعاته من إجمالي الشركة في الفترة (بعد التقريب لرقمين عشريين).
     * >80% مميز، 30–80% جيد جداً، >15% و<30% جيد، 1–15% مقبول، وإلا بدون تصنيف.
     */
    private function customerSalesShareTier(float $pct): string
    {
        if ($pct > 80.0) {
            return 'premium';
        }
        if ($pct >= 30.0 && $pct <= 80.0) {
            return 'very_good';
        }
        if ($pct > 15.0 && $pct < 30.0) {
            return 'good';
        }
        if ($pct >= 1.0 && $pct <= 15.0) {
            return 'acceptable';
        }

        return 'none';
    }

    /**
     * تقييم وتحليل العملاء: إجمالي مبيعات وعدد فواتير المبيعات المرحّلة لكل عميل في الفترة،
     * مع نسبة من إجمالي الشركة وتصنيف حسب شريحة النسبة (مميز، جيد جداً، جيد، مقبول).
     * يُرجع أيضاً total_qty (مجموع كميات الأسطر) و total_profit (المبيعات − مجموع cost_amount على الفاتورة إن وُجد).
     * sort_basis: total_sales | invoice_count | total_qty | total_profit
     */
    public function customerEvaluationAnalysis(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $request->validate([
            'from_date' => 'required|date',
            'to_date' => 'required|date|after_or_equal:from_date',
            'branch_id' => 'nullable|integer|exists:branches,id',
            'cost_center_id' => [
                'nullable',
                'integer',
                Rule::exists('cost_centers', 'id')->where('tenant_id', $tenantId),
            ],
            'sort_basis' => 'nullable|in:total_sales,invoice_count,total_qty,total_profit',
        ]);

        $fromDate = $this->parseReportDateOnly($request->from_date);
        $toDate = $this->parseReportDateOnly($request->to_date);
        $branchId = $request->filled('branch_id') ? (int) $request->branch_id : null;
        $costCenterId = $request->filled('cost_center_id') ? (int) $request->cost_center_id : null;
        $sortBasisIn = $request->input('sort_basis');
        $sortBasis = match ($sortBasisIn) {
            'invoice_count' => 'invoice_count',
            'total_qty' => 'total_qty',
            'total_profit' => 'total_profit',
            default => 'total_sales',
        };

        $hasInvoiceCost = Schema::hasColumn('invoices', 'cost_amount');
        $costSelect = $hasInvoiceCost
            ? 'COALESCE(SUM(COALESCE(cost_amount, 0)), 0) as total_cost'
            : '0 as total_cost';

        $aggQuery = DB::table('invoices')
            ->where('tenant_id', $tenantId)
            ->where('type', 'sales')
            ->where('is_return', false)
            ->whereNotIn('status', ['cancelled', 'draft'])
            ->whereNotNull('journal_entry_id')
            ->whereNotNull('customer_id')
            ->whereDate('date', '>=', $fromDate)
            ->whereDate('date', '<=', $toDate)
            ->when($branchId !== null, fn ($q) => $q->where('branch_id', $branchId))
            ->when($costCenterId !== null, fn ($q) => $q->where('cost_center_id', $costCenterId))
            ->selectRaw('customer_id, COUNT(*) as invoice_count, COALESCE(SUM(total), 0) as total_sales, '.$costSelect)
            ->groupBy('customer_id');

        $aggregates = $aggQuery->get();

        $qtyByCustomer = DB::table('invoice_lines as il')
            ->join('invoices as i', 'i.id', '=', 'il.invoice_id')
            ->where('i.tenant_id', $tenantId)
            ->where('i.type', 'sales')
            ->where('i.is_return', false)
            ->whereNotIn('i.status', ['cancelled', 'draft'])
            ->whereNotNull('i.journal_entry_id')
            ->whereNotNull('i.customer_id')
            ->whereDate('i.date', '>=', $fromDate)
            ->whereDate('i.date', '<=', $toDate)
            ->when($branchId !== null, fn ($q) => $q->where('i.branch_id', $branchId))
            ->when($costCenterId !== null, fn ($q) => $q->where('i.cost_center_id', $costCenterId))
            ->groupBy('i.customer_id')
            ->selectRaw('i.customer_id, COALESCE(SUM(il.quantity), 0) as total_qty')
            ->get()
            ->keyBy(fn ($r) => (int) $r->customer_id);

        $movementCostByCustomer = DB::table('inventory_movements as im')
            ->join('invoices as i', function ($join) {
                $join->on('i.id', '=', 'im.reference_id')
                    ->where('im.reference_type', '=', Invoice::class);
            })
            ->where('i.tenant_id', $tenantId)
            ->where('i.type', 'sales')
            ->where('i.is_return', false)
            ->whereNotIn('i.status', ['cancelled', 'draft'])
            ->whereNotNull('i.journal_entry_id')
            ->whereNotNull('i.customer_id')
            ->whereDate('i.date', '>=', $fromDate)
            ->whereDate('i.date', '<=', $toDate)
            ->when($branchId !== null, fn ($q) => $q->where('i.branch_id', $branchId))
            ->when($costCenterId !== null, fn ($q) => $q->where('i.cost_center_id', $costCenterId))
            ->groupBy('i.customer_id')
            ->selectRaw('i.customer_id, COALESCE(SUM(ABS(im.total_cost)), 0) as movement_cost')
            ->get()
            ->keyBy(fn ($r) => (int) $r->customer_id);

        $companyTotal = (float) $aggregates->sum('total_sales');

        $customerIds = $aggregates->pluck('customer_id')->map(fn ($id) => (int) $id)->unique()->values()->all();
        $customers = Customer::query()
            ->where('tenant_id', $tenantId)
            ->whereIn('id', $customerIds)
            ->with(['account:id,code'])
            ->get()
            ->keyBy('id');

        $rows = [];
        foreach ($aggregates as $row) {
            $cid = (int) $row->customer_id;
            $c = $customers->get($cid);
            $sales = (float) $row->total_sales;
            $invCount = (int) $row->invoice_count;
            $costRow = $movementCostByCustomer->get($cid);
            $costSum = $costRow !== null
                ? (float) $costRow->movement_cost
                : (float) ($row->total_cost ?? 0);
            $qtyRow = $qtyByCustomer->get($cid);
            $totalQty = $qtyRow !== null ? (float) ($qtyRow->total_qty ?? 0) : 0.0;
            $totalProfit = round($sales - $costSum, 4);
            $pct = $companyTotal > 0.0000001 ? round(($sales / $companyTotal) * 100, 2) : 0.0;
            $rows[] = [
                'customer_id' => $cid,
                'account_code' => $c && $c->account ? (string) $c->account->code : '',
                'customer_name' => $c ? (string) $c->name : '',
                'customer_name_en' => $c ? $c->name_en : null,
                'invoice_count' => $invCount,
                'total_sales' => round($sales, 4),
                'total_qty' => round($totalQty, 4),
                'total_profit' => $totalProfit,
                'pct_of_company' => $pct,
                'sales_tier' => $this->customerSalesShareTier($pct),
            ];
        }

        usort($rows, function ($a, $b) use ($sortBasis) {
            if ($sortBasis === 'invoice_count') {
                return ($b['invoice_count'] <=> $a['invoice_count'])
                    ?: ($b['total_sales'] <=> $a['total_sales']);
            }
            if ($sortBasis === 'total_qty') {
                return ($b['total_qty'] <=> $a['total_qty'])
                    ?: ($b['total_sales'] <=> $a['total_sales']);
            }
            if ($sortBasis === 'total_profit') {
                return ($b['total_profit'] <=> $a['total_profit'])
                    ?: ($b['total_sales'] <=> $a['total_sales']);
            }

            return ($b['total_sales'] <=> $a['total_sales'])
                ?: ($b['invoice_count'] <=> $a['invoice_count']);
        });

        $tenant = Tenant::find($tenantId);
        $company = $this->companyForReport($tenant);

        return response()->json([
            'company' => $company,
            'from_date' => $fromDate,
            'to_date' => $toDate,
            'company_total_sales' => round($companyTotal, 4),
            'sort_basis' => $sortBasis,
            'data' => array_values($rows),
        ]);
    }

    /**
     * تقرير إجمالي مبيعات وعمولات المناديب: مجمع من فواتير المبيعات المرحلة حسب sales_rep_id.
     */
    public function salesRepSalesReport(Request $request): JsonResponse
    {
        $request->validate([
            'from_date' => 'required|date',
            'to_date' => 'required|date|after_or_equal:from_date',
            'per_page' => 'nullable|integer|min:10|max:500',
            'page' => 'nullable|integer|min:1',
            'sales_rep_id' => 'nullable|integer',
        ]);

        $tenantId = (int) $request->tenant_id;
        $fromDate = $this->parseReportDateOnly($request->from_date);
        $toDate = $this->parseReportDateOnly($request->to_date);
        $perPage = min(500, max(10, (int) ($request->per_page ?? 50)));
        $page = max(1, (int) ($request->page ?? 1));

        $filterRepId = $request->filled('sales_rep_id') ? (int) $request->sales_rep_id : null;
        if ($filterRepId !== null && $filterRepId > 0) {
            if (! SalesRep::where('tenant_id', $tenantId)->where('id', $filterRepId)->exists()) {
                $filterRepId = null;
            }
        } else {
            $filterRepId = null;
        }

        $agg = DB::table('invoices')
            ->where('tenant_id', $tenantId)
            ->where('type', 'sales')
            ->whereNotNull('journal_entry_id')
            ->whereDate('date', '>=', $fromDate)
            ->whereDate('date', '<=', $toDate)
            ->whereNotNull('sales_rep_id')
            ->when($filterRepId !== null, fn ($q) => $q->where('sales_rep_id', $filterRepId))
            ->selectRaw('sales_rep_id, COUNT(*) as invoice_count, COALESCE(SUM(total), 0) as total_sales')
            ->groupBy('sales_rep_id');

        $repIds = (clone $agg)->pluck('sales_rep_id')->unique()->filter()->values()->all();
        if (empty($repIds)) {
            return response()->json([
                'data' => [],
                'from_date' => $fromDate,
                'to_date' => $toDate,
                'total_sales' => 0,
                'total_commission' => 0,
                'total_count' => 0,
                'per_page' => $perPage,
                'page' => $page,
            ]);
        }

        $reps = SalesRep::where('tenant_id', $tenantId)->whereIn('id', $repIds)->get()->keyBy('id');
        $totals = (clone $agg)->get()->keyBy('sales_rep_id');

        $rows = [];
        foreach ($totals as $repId => $row) {
            $rep = $reps->get($repId);
            if (! $rep) {
                continue;
            }
            $totalSales = (float) $row->total_sales;
            $commissionPct = (float) $rep->commission_percent;
            $commission = round($totalSales * $commissionPct / 100, 2);
            $rows[] = [
                'sales_rep_id' => (int) $repId,
                'name' => $rep->name,
                'region' => $rep->region,
                'commission_percent' => $commissionPct,
                'invoice_count' => (int) $row->invoice_count,
                'total_sales' => $totalSales,
                'commission' => $commission,
            ];
        }

        usort($rows, fn ($a, $b) => ($b['total_sales'] ?? 0) <=> ($a['total_sales'] ?? 0));
        $totalSalesSum = array_sum(array_column($rows, 'total_sales'));
        $totalCommissionSum = array_sum(array_column($rows, 'commission'));
        $offset = ($page - 1) * $perPage;
        $paged = array_slice($rows, $offset, $perPage);

        return response()->json([
            'data' => $paged,
            'from_date' => $fromDate,
            'to_date' => $toDate,
            'total_sales' => $totalSalesSum,
            'total_commission' => $totalCommissionSum,
            'total_count' => count($rows),
            'per_page' => $perPage,
            'page' => $page,
        ]);
    }

    /**
     * تقرير إنتاجية المناديب الشهري: صفوف = مناديب، أعمدة = 12 شهراً مالياً.
     * صافي المبيعات بعد المرتجعات (نفس منطق تقرير مبيعات الفروع السنوي).
     */
    public function salesRepsMonthlyProductivity(Request $request): JsonResponse
    {
        try {
            $tenantId = (int) $request->tenant_id;
            if ($tenantId < 1) {
                return response()->json(['message' => 'يرجى تحديد المستأجر (X-Tenant-ID).'], 422);
            }

            $request->merge([
                'sales_source' => $request->filled('sales_source') && $request->sales_source !== '' ? $request->sales_source : 'all',
                'amount_basis' => $request->filled('amount_basis') && $request->amount_basis !== '' ? $request->amount_basis : 'net_before_tax',
            ]);

            $validated = $request->validate([
                'fiscal_year' => 'required|integer|min:2000|max:2100',
                'amount_basis' => 'required|in:net_before_tax,inclusive',
                'sales_source' => 'nullable|in:all,regular,pos,restaurant',
            ]);

            $fyStartMonth = (int) $this->tenantSettings->get($tenantId, 'fiscal_year_start_month', 1);
            if ($fyStartMonth < 1 || $fyStartMonth > 12) {
                $fyStartMonth = 1;
            }

            $startYear = (int) $validated['fiscal_year'];
            $periodStart = Carbon::create($startYear, $fyStartMonth, 1)->startOfDay();
            $periodEnd = $periodStart->copy()->addYear()->subDay();
            $fromStr = $periodStart->toDateString();
            $toStr = $periodEnd->toDateString();

            $startYm = $periodStart->year * 12 + $periodStart->month;

            $amountSql = $validated['amount_basis'] === 'net_before_tax'
                ? '(CASE WHEN invoices.is_return = 1 THEN -1 ELSE 1 END) * (COALESCE(invoices.subtotal, 0) - COALESCE(invoices.discount_amount, 0))'
                : '(CASE WHEN invoices.is_return = 1 THEN -1 ELSE 1 END) * COALESCE(invoices.total, 0)';

            $driver = DB::getDriverName();
            $yExpr = $driver === 'sqlite' ? "CAST(strftime('%Y', invoices.date) AS INTEGER)" : 'YEAR(invoices.date)';
            $mExpr = $driver === 'sqlite' ? "CAST(strftime('%m', invoices.date) AS INTEGER)" : 'MONTH(invoices.date)';

            $query = DB::table('invoices')
                ->where('invoices.tenant_id', $tenantId)
                ->where('invoices.type', 'sales')
                ->whereNotNull('invoices.journal_entry_id')
                ->whereNotNull('invoices.sales_rep_id')
                ->whereBetween('invoices.date', [$fromStr, $toStr]);

            $source = $validated['sales_source'] ?? 'all';
            if ($source === 'pos') {
                $query->whereNotNull('invoices.pos_shift_id');
            } elseif ($source === 'restaurant') {
                $query->where(function ($q) {
                    $q->whereNotNull('invoices.order_type')->orWhereNotNull('invoices.table_id');
                });
            } elseif ($source === 'regular') {
                $query->whereNull('invoices.pos_shift_id')
                    ->whereNull('invoices.order_type')
                    ->whereNull('invoices.table_id');
            }

            $aggregates = $query
                ->selectRaw("invoices.sales_rep_id, {$yExpr} as y, {$mExpr} as m, SUM({$amountSql}) as amount")
                ->groupBy('invoices.sales_rep_id', DB::raw($yExpr), DB::raw($mExpr))
                ->get();

            $salesReps = SalesRep::query()
                ->where('tenant_id', $tenantId)
                ->orderBy('name')
                ->get(['id', 'name']);

            $repRows = [];
            foreach ($salesReps as $sr) {
                $repRows[$sr->id] = [
                    'sales_rep_id' => (int) $sr->id,
                    'name' => $sr->name,
                    'months' => array_fill(0, 12, 0.0),
                    'year_total' => 0.0,
                    'performance_tier' => 'none',
                ];
            }

            foreach ($aggregates as $row) {
                $rid = (int) $row->sales_rep_id;
                if (! isset($repRows[$rid])) {
                    continue;
                }
                $rowYm = (int) $row->y * 12 + (int) $row->m;
                $idx = $rowYm - $startYm;
                if ($idx >= 0 && $idx < 12) {
                    $repRows[$rid]['months'][$idx] = round((float) $row->amount, 4);
                }
            }

            $columnTotals = array_fill(0, 12, 0.0);
            $rowsOut = [];
            foreach ($repRows as $r) {
                $r['year_total'] = round(array_sum($r['months']), 4);
                foreach ($r['months'] as $i => $v) {
                    $columnTotals[$i] += $v;
                }
                $rowsOut[] = $r;
            }

            $columnTotals = array_map(fn ($x) => round((float) $x, 4), $columnTotals);
            $grandTotal = round(array_sum($columnTotals), 4);

            $maxYear = 0.0;
            foreach ($rowsOut as $r) {
                if ($r['year_total'] > $maxYear) {
                    $maxYear = $r['year_total'];
                }
            }

            foreach ($rowsOut as $k => $r) {
                $t = $r['year_total'];
                if ($t <= 0 || $maxYear <= 0) {
                    $rowsOut[$k]['performance_tier'] = 'none';
                } elseif ($t >= $maxYear * 0.67) {
                    $rowsOut[$k]['performance_tier'] = 'high';
                } elseif ($t >= $maxYear * 0.34) {
                    $rowsOut[$k]['performance_tier'] = 'medium';
                } else {
                    $rowsOut[$k]['performance_tier'] = 'low';
                }
            }

            $monthMeta = $this->buildAnnualSalesPeriodMeta($periodStart, 'monthly');

            return response()->json([
                'fiscal_year' => $startYear,
                'fiscal_year_start_month' => $fyStartMonth,
                'period_from' => $fromStr,
                'period_to' => $toStr,
                'amount_basis' => $validated['amount_basis'],
                'sales_source' => $source,
                'month_keys' => array_column($monthMeta, 'key'),
                'months' => $monthMeta,
                'reps' => array_values($rowsOut),
                'column_totals' => $columnTotals,
                'grand_total' => $grandTotal,
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            throw $e;
        } catch (\Throwable $e) {
            \Log::error('salesRepsMonthlyProductivity report error: '.$e->getMessage(), ['trace' => $e->getTraceAsString()]);

            return response()->json([
                'message' => 'حدث خطأ في توليد التقرير.',
                'error' => config('app.debug') ? $e->getMessage() : null,
            ], 500);
        }
    }

    /**
     * جرد الأرقام التسلسلية من جدول item_serials (يُحدَّث عند مشتريات/مبيعات الأصناف التسلسلية).
     */
    public function serialNumbersInventory(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;

        $request->validate([
            'warehouse_id' => [
                'nullable',
                'integer',
                Rule::exists('warehouses', 'id')->where('tenant_id', $tenantId),
            ],
            'item_id' => ['nullable', 'integer', Rule::exists('items', 'id')->where('tenant_id', $tenantId)],
            'status' => 'nullable|string|in:available,sold,reserved,returned,damaged',
            'search' => 'nullable|string|max:120',
            'sort_by' => 'nullable|string|in:serial_number,status,item_code,item_name,warehouse_name,created_at,updated_at',
            'sort_dir' => 'nullable|string|in:asc,desc',
            'per_page' => 'nullable|integer|min:10|max:200',
            'page' => 'nullable|integer|min:1',
        ]);

        $perPage = min(200, max(10, (int) ($request->per_page ?? 50)));
        $page = max(1, (int) ($request->page ?? 1));
        $sortBy = (string) ($request->input('sort_by') ?: 'serial_number');
        $sortDir = strtolower((string) $request->input('sort_dir', 'asc')) === 'desc' ? 'desc' : 'asc';

        $sortColumnMap = [
            'serial_number' => 'item_serials.serial_number',
            'status' => 'item_serials.status',
            'item_code' => 'items.code',
            'item_name' => 'items.name',
            'warehouse_name' => 'warehouses.name',
            'created_at' => 'item_serials.created_at',
            'updated_at' => 'item_serials.updated_at',
        ];
        $orderCol = $sortColumnMap[$sortBy] ?? 'item_serials.serial_number';

        $base = DB::table('item_serials')
            ->join('items', function ($j) use ($tenantId) {
                $j->on('items.id', '=', 'item_serials.item_id')
                    ->where('items.tenant_id', '=', $tenantId);
            })
            ->leftJoin('warehouses', function ($j) use ($tenantId) {
                $j->on('warehouses.id', '=', 'item_serials.warehouse_id')
                    ->where('warehouses.tenant_id', '=', $tenantId)
                    ->whereNull('warehouses.deleted_at');
            })
            ->where('item_serials.tenant_id', $tenantId);

        $this->applySerialInventoryWarehouseScope($request, $base, $tenantId);

        $pivot = $request->user()?->tenants()->where('tenants.id', $tenantId)->first()?->pivot;
        if (! ($pivot && $pivot->restrict_to_branch_warehouse && $pivot->default_warehouse_id) && $request->filled('warehouse_id')) {
            $base->where('item_serials.warehouse_id', (int) $request->warehouse_id);
        }

        if ($request->filled('item_id')) {
            $base->where('item_serials.item_id', (int) $request->item_id);
        }
        if ($request->filled('status')) {
            $base->where('item_serials.status', (string) $request->status);
        }
        if ($request->filled('search')) {
            $s = trim((string) $request->search);
            if ($s !== '') {
                $like = '%'.addcslashes($s, '%_\\').'%';
                $base->where('item_serials.serial_number', 'like', $like);
            }
        }

        $total = (clone $base)->count();

        $rows = (clone $base)
            ->orderBy($orderCol, $sortDir)
            ->orderBy('item_serials.id', 'asc')
            ->offset(($page - 1) * $perPage)
            ->limit($perPage)
            ->select([
                'item_serials.id',
                'item_serials.serial_number',
                'item_serials.status',
                'item_serials.item_id',
                'item_serials.warehouse_id',
                'item_serials.created_at',
                'item_serials.updated_at',
                'items.code as item_code',
                'items.name as item_name',
                'warehouses.name as warehouse_name',
            ])
            ->get()
            ->map(function ($row) {
                return [
                    'id' => (int) $row->id,
                    'serial_number' => (string) $row->serial_number,
                    'status' => (string) $row->status,
                    'item_id' => (int) $row->item_id,
                    'warehouse_id' => $row->warehouse_id !== null ? (int) $row->warehouse_id : null,
                    'item_code' => $row->item_code !== null ? (string) $row->item_code : null,
                    'item_name' => $row->item_name !== null ? (string) $row->item_name : null,
                    'warehouse_name' => $row->warehouse_name !== null ? (string) $row->warehouse_name : null,
                    'created_at' => $row->created_at,
                    'updated_at' => $row->updated_at,
                ];
            });

        $lastPage = $total > 0 ? (int) ceil($total / $perPage) : 1;

        return response()->json([
            'data' => $rows,
            'total' => $total,
            'per_page' => $perPage,
            'current_page' => $page,
            'last_page' => $lastPage,
        ]);
    }

    /**
     * سجل حركة رقم تسلسلي: دخول (مورد/فاتورة مشتريات) وخروج (عميل/فاتورة مبيعات) إن وُجد.
     */
    public function serialNumberHistory(Request $request, int $id): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;

        $serial = ItemSerial::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->with(['item:id,code,name', 'warehouse:id,name,code'])
            ->findOrFail($id);

        if (! $this->userMayViewSerial($request, $serial, $tenantId)) {
            return response()->json(['message' => 'غير مصرح بعرض هذا السجل.'], 403);
        }

        $events = [];

        $fromMovement = $this->resolveSerialInboundFromMovement($serial, $tenantId);
        if ($fromMovement !== null) {
            $events[] = $fromMovement;
        } else {
            $purchaseLine = $this->findPurchaseInvoiceLineForSerial($tenantId, (int) $serial->item_id, $serial->serial_number);
            if ($purchaseLine !== null) {
                $inv = Invoice::withoutGlobalScopes()
                    ->where('tenant_id', $tenantId)
                    ->with('vendor')
                    ->find($purchaseLine->invoice_id);
                if ($inv && $inv->type === 'purchase' && ! ($inv->is_return ?? false)) {
                    $events[] = [
                        'kind' => 'in',
                        'date' => $inv->date?->format('Y-m-d'),
                        'document_type' => 'purchase_invoice',
                        'document_id' => (int) $inv->id,
                        'document_number' => $inv->number,
                        'counterparty_role' => 'vendor',
                        'counterparty_name' => $inv->vendor?->name,
                    ];
                }
            }
        }

        $link = InvoiceLineSerial::query()
            ->join('invoice_lines', 'invoice_lines.id', '=', 'invoice_line_serials.invoice_line_id')
            ->join('invoices', 'invoices.id', '=', 'invoice_lines.invoice_id')
            ->where('invoices.tenant_id', $tenantId)
            ->where('invoice_line_serials.item_serial_id', $serial->id)
            ->select('invoice_line_serials.*')
            ->first();
        if ($link !== null) {
            $salesLine = InvoiceLine::withoutGlobalScopes()
                ->where('id', $link->invoice_line_id)
                ->first();
            if ($salesLine !== null) {
                $inv = Invoice::withoutGlobalScopes()
                    ->where('tenant_id', $tenantId)
                    ->with('customer')
                    ->find($salesLine->invoice_id);
                if ($inv && $inv->type === 'sales' && ! ($inv->is_return ?? false)) {
                    $events[] = [
                        'kind' => 'out',
                        'date' => $inv->date?->format('Y-m-d'),
                        'document_type' => 'sales_invoice',
                        'document_id' => (int) $inv->id,
                        'document_number' => $inv->number,
                        'counterparty_role' => 'customer',
                        'counterparty_name' => $inv->customer?->name,
                    ];
                }
            }
        }

        usort($events, function (array $a, array $b) {
            $da = $a['date'] ?? '';
            $db = $b['date'] ?? '';
            $cmp = strcmp((string) $da, (string) $db);
            if ($cmp !== 0) {
                return $cmp;
            }
            $order = ['in' => 0, 'out' => 1];

            return ($order[$a['kind'] ?? ''] ?? 2) <=> ($order[$b['kind'] ?? ''] ?? 2);
        });

        return response()->json([
            'serial' => [
                'id' => (int) $serial->id,
                'serial_number' => $serial->serial_number,
                'status' => $serial->status,
                'item' => $serial->item,
                'warehouse' => $serial->warehouse,
            ],
            'events' => array_values($events),
        ]);
    }

    /**
     * @param  \Illuminate\Database\Query\Builder  $base
     */
    private function applySerialInventoryWarehouseScope(Request $request, $base, int $tenantId): void
    {
        $pivot = $request->user()?->tenants()->where('tenants.id', $tenantId)->first()?->pivot;
        if ($pivot && $pivot->restrict_to_branch_warehouse && $pivot->default_warehouse_id) {
            $base->where('item_serials.warehouse_id', (int) $pivot->default_warehouse_id);

            return;
        }
        if ($pivot && $pivot->restrict_to_branch_warehouse && $pivot->default_branch_id) {
            $ids = Warehouse::where('tenant_id', $tenantId)
                ->where('branch_id', (int) $pivot->default_branch_id)
                ->pluck('id');
            if ($ids->isEmpty()) {
                $base->whereRaw('1 = 0');
            } else {
                $base->whereIn('item_serials.warehouse_id', $ids->all());
            }
        }
    }

    private function userMayViewSerial(Request $request, ItemSerial $serial, int $tenantId): bool
    {
        $pivot = $request->user()?->tenants()->where('tenants.id', $tenantId)->first()?->pivot;
        if (! $pivot || ! $pivot->restrict_to_branch_warehouse) {
            return true;
        }
        $wid = $serial->warehouse_id;
        if ($pivot->default_warehouse_id) {
            return (int) $wid === (int) $pivot->default_warehouse_id;
        }
        if ($pivot->default_branch_id) {
            return Warehouse::where('tenant_id', $tenantId)
                ->where('id', $wid)
                ->where('branch_id', (int) $pivot->default_branch_id)
                ->exists();
        }

        return true;
    }

    private function findPurchaseInvoiceLineForSerial(int $tenantId, int $itemId, string $serialNumber): ?InvoiceLine
    {
        $serialNumber = trim($serialNumber);
        if ($serialNumber === '') {
            return null;
        }

        return InvoiceLine::query()
            ->join('invoices', 'invoices.id', '=', 'invoice_lines.invoice_id')
            ->where('invoice_lines.item_id', $itemId)
            ->where('invoices.tenant_id', $tenantId)
            ->where('invoices.type', 'purchase')
            ->where('invoices.is_return', false)
            ->whereNotNull('invoices.journal_entry_id')
            ->whereJsonContains('invoice_lines.serial_numbers', $serialNumber)
            ->orderByDesc('invoices.date')
            ->orderByDesc('invoices.id')
            ->select('invoice_lines.*')
            ->first();
    }

    private function resolveSerialInboundFromMovement(ItemSerial $serial, int $tenantId): ?array
    {
        if ($serial->reference_type !== InventoryMovement::class || ! $serial->reference_id) {
            return null;
        }

        $mov = InventoryMovement::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->find($serial->reference_id);
        if ($mov === null || $mov->reference_type !== Invoice::class || ! $mov->reference_id) {
            return null;
        }

        $invoice = Invoice::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->with('vendor')
            ->find($mov->reference_id);
        if ($invoice === null || $invoice->type !== 'purchase' || ($invoice->is_return ?? false)) {
            return null;
        }

        return [
            'kind' => 'in',
            'date' => $invoice->date?->format('Y-m-d'),
            'document_type' => 'purchase_invoice',
            'document_id' => (int) $invoice->id,
            'document_number' => $invoice->number,
            'counterparty_role' => 'vendor',
            'counterparty_name' => $invoice->vendor?->name,
        ];
    }
}
