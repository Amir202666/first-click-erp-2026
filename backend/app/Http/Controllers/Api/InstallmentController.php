<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Installment;
use App\Models\InstallmentLine;
use App\Models\InstallmentPeriod;
use App\Models\Invoice;
use App\Services\InstallmentService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class InstallmentController extends Controller
{
    public function __construct(
        private InstallmentService $installmentService
    ) {}

    public function index(Request $request): JsonResponse
    {
        $query = Installment::where('tenant_id', $request->tenant_id)
            ->with(['customer', 'vendor', 'invoice', 'account', 'lines.payment', 'branch', 'costCenter'])
            ->when($request->filled('customer_id'), fn ($q) => $q->where('customer_id', $request->customer_id))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->status))
            ->when($request->filled('number'), fn ($q) => $q->where('number', 'like', '%'.$request->number.'%'))
            ->when($request->filled('branch_id'), fn ($q) => $q->where('branch_id', $request->branch_id))
            ->when($request->filled('cost_center_id'), function ($q) use ($request) {
                $cc = (int) $request->cost_center_id;
                $q->where(function ($qq) use ($cc) {
                    $qq->where('cost_center_id', $cc)
                        ->orWhereHas('invoice', fn ($iq) => $iq->where('cost_center_id', $cc));
                });
            })
            ->when($request->filled('frequency_months'), fn ($q) => $q->where('frequency_months', (int) $request->frequency_months))
            ->orderByDesc('created_at');

        $perPage = (int) ($request->per_page ?? 20);
        $data = $request->boolean('paginate', true) ? $query->paginate($perPage) : $query->get();

        return response()->json($data);
    }

    /**
     * قائمة دوريات الأقساط المتاحة.
     * - تُقرأ من جدول installment_periods (عامة tenant_id = null + الخاصة بالشركة).
     * - يمكن تقييد المتاح في الفواتير عبر إعداد settings: installment_enabled_period_months (array of ints).
     */
    public function periods(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $enabled = app(\App\Services\TenantSettingsService::class)->get($tenantId, 'installment_enabled_period_months', []);
        $enabledMonths = is_array($enabled)
            ? array_values(array_unique(array_filter(array_map('intval', $enabled), fn (int $n) => $n > 0)))
            : [];

        $rows = $this->buildInstallmentPeriodRows($tenantId, $enabledMonths);

        return response()->json(['data' => $rows]);
    }

    /**
     * يدمج صفوف الجدول مع كتالوج افتراضي 1/3/6/12 حتى لا تختفي الدوريات إذا كان الجدول ناقصاً أو الإعداد مُخزَّن بشكل غير متوقع.
     *
     * @param  list<int>  $enabledMonths  فارغ = بدون تقييد (كل الدوريات مفعّلة)
     * @return list<array{id:int,code:string,months:int,name:string,name_en:?string,enabled:bool}>
     */
    private function buildInstallmentPeriodRows(int $tenantId, array $enabledMonths): array
    {
        $catalog = [
            1 => ['code' => 'monthly', 'name' => 'شهري', 'name_en' => 'Monthly'],
            3 => ['code' => 'quarterly', 'name' => 'ربع سنوي', 'name_en' => 'Quarterly'],
            6 => ['code' => 'semi_annually', 'name' => 'نصف سنوي', 'name_en' => 'Semi-Annually'],
            12 => ['code' => 'annually', 'name' => 'سنوي', 'name_en' => 'Annually'],
        ];

        $fromDb = InstallmentPeriod::query()
            ->where(function ($q) use ($tenantId) {
                $q->whereNull('tenant_id')->orWhere('tenant_id', $tenantId);
            })
            ->where('is_active', true)
            ->orderBy('months')
            ->get()
            ->sortByDesc(fn (InstallmentPeriod $p) => $p->tenant_id ? 1 : 0)
            ->unique(fn (InstallmentPeriod $p) => (int) $p->months);

        $byMonth = [];
        foreach ($fromDb as $p) {
            $m = (int) $p->months;
            $byMonth[$m] = [
                'id' => (int) $p->id,
                'code' => (string) $p->code,
                'months' => $m,
                'name' => (string) $p->name,
                'name_en' => $p->name_en !== null ? (string) $p->name_en : null,
            ];
        }

        foreach ($catalog as $m => $meta) {
            if (! isset($byMonth[$m])) {
                $byMonth[$m] = [
                    'id' => -100 - $m,
                    'code' => $meta['code'],
                    'months' => $m,
                    'name' => $meta['name'],
                    'name_en' => $meta['name_en'],
                ];
            }
        }

        ksort($byMonth);

        $unrestricted = $enabledMonths === [];

        $out = [];
        foreach ($byMonth as $row) {
            $m = (int) $row['months'];
            $row['enabled'] = $unrestricted || in_array($m, $enabledMonths, true);
            $out[] = $row;
        }

        return $out;
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'customer_id' => 'required_without:vendor_id|nullable|exists:customers,id',
            'vendor_id' => 'required_without:customer_id|nullable|exists:vendors,id',
            'invoice_id' => 'nullable|exists:invoices,id',
            'account_id' => 'nullable|exists:accounts,id',
            'total_amount' => 'required|numeric|min:0.01',
            'currency' => 'nullable|string|max:3',
            'start_date' => 'required|date',
            'frequency_months' => 'nullable|integer|min:1|max:12',
            'branch_id' => 'nullable|exists:branches,id',
            'cost_center_id' => 'nullable|exists:cost_centers,id',
            'notes' => 'nullable|string',
            'lines' => 'required|array',
            'lines.*.sequence' => 'required|integer|min:1',
            'lines.*.due_date' => 'required|date',
            'lines.*.amount' => 'required|numeric|min:0',
        ]);

        $validated['notes'] = $this->sanitizePlainText($validated['notes'] ?? null, 5000);

        if (! empty($validated['vendor_id']) && empty($validated['account_id'])) {
            return response()->json(['message' => 'لجدول أقساط المورد يجب تحديد account_id (حساب التزام الأقساط).'], 422);
        }

        $tenantId = (int) $request->tenant_id;
        $installment = new Installment([
            'tenant_id' => $tenantId,
            'invoice_id' => $validated['invoice_id'] ?? null,
            'customer_id' => $validated['customer_id'] ?? null,
            'vendor_id' => $validated['vendor_id'] ?? null,
            'account_id' => $validated['account_id'] ?? null,
            'total_amount' => round((float) $validated['total_amount'], 3),
            'currency' => $validated['currency'] ?? null,
            'start_date' => $validated['start_date'],
            'frequency_months' => $validated['frequency_months'] ?? 1,
            'branch_id' => $validated['branch_id'] ?? null,
            'cost_center_id' => $validated['cost_center_id'] ?? null,
            'notes' => $validated['notes'] ?? null,
            'status' => 'draft',
            'created_by' => auth()->id(),
        ]);
        $installment->save();

        foreach ($validated['lines'] as $line) {
            InstallmentLine::create([
                'installment_id' => $installment->id,
                'sequence' => $line['sequence'],
                'due_date' => $line['due_date'],
                'amount' => round((float) $line['amount'], 3),
                'paid_amount' => 0,
                'status' => 'pending',
            ]);
        }

        $installment->load('customer', 'vendor', 'invoice', 'account', 'lines', 'branch', 'costCenter');

        return response()->json($installment, 201);
    }

    /** إنشاء جدول أقساط من رصيد فاتورة (مسودة — يُعتمد لاحقاً) */
    public function createFromInvoice(Request $request, int $invoice): JsonResponse
    {
        $invoiceModel = Invoice::where('tenant_id', $request->tenant_id)->findOrFail($invoice);
        $validated = $request->validate([
            'start_date' => 'required|date',
            'num_installments' => 'required|integer|min:1|max:120',
            'frequency_months' => 'nullable|integer|min:1|max:12',
            'period_months' => 'nullable|integer|min:1|max:12',
            'branch_id' => 'nullable|exists:branches,id',
            'account_id' => 'nullable|exists:accounts,id',
        ]);
        try {
            $installment = $this->installmentService->createScheduleFromInvoice(
                $invoiceModel,
                (int) $request->tenant_id,
                $validated['start_date'],
                (int) $validated['num_installments'],
                (int) ($validated['period_months'] ?? $validated['frequency_months'] ?? 1),
                isset($validated['branch_id']) ? (int) $validated['branch_id'] : null,
                isset($validated['account_id']) ? (int) $validated['account_id'] : null,
            );
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json($installment, 201);
    }

    /** سداد قسط مع توليد سند قبض/صرف */
    public function payLine(Request $request, int $line): JsonResponse
    {
        $lineModel = InstallmentLine::query()
            ->whereHas('installment', fn ($q) => $q->where('tenant_id', $request->tenant_id))
            ->findOrFail($line);

        $validated = $request->validate([
            'amount' => 'nullable|numeric|min:0.01',
            'date' => 'nullable|date',
            'payment_method_id' => 'nullable|exists:payment_methods,id',
            'cash_bank_account_id' => 'nullable|exists:accounts,id',
            'notes' => 'nullable|string|max:2000',
        ]);

        $validated['notes'] = $this->sanitizePlainText($validated['notes'] ?? null, 2000);

        try {
            $payment = $this->installmentService->payInstallmentLine($lineModel, $validated);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json([
            'payment' => $payment,
            'line' => $lineModel->fresh(['payment']),
        ]);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $installment = Installment::where('tenant_id', $request->tenant_id)
            ->with(['customer', 'vendor', 'invoice', 'account', 'lines.payment.journalEntry', 'branch', 'costCenter', 'journalEntry'])
            ->findOrFail($id);

        return response()->json($installment);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $installment = Installment::where('tenant_id', $request->tenant_id)->findOrFail($id);
        if ($installment->status === 'approved') {
            return response()->json(['message' => 'لا يمكن تعديل جدول معتمد'], 422);
        }

        $validated = $request->validate([
            'total_amount' => 'sometimes|numeric|min:0.01',
            'start_date' => 'sometimes|date',
            'branch_id' => 'nullable|exists:branches,id',
            'cost_center_id' => 'nullable|exists:cost_centers,id',
            'notes' => 'nullable|string',
            'lines' => 'sometimes|array',
            'lines.*.id' => 'nullable|integer|exists:installment_lines,id',
            'lines.*.sequence' => 'required_with:lines|integer|min:1',
            'lines.*.due_date' => 'required_with:lines|date',
            'lines.*.amount' => 'required_with:lines|numeric|min:0',
        ]);

        if (array_key_exists('notes', $validated)) {
            $validated['notes'] = $this->sanitizePlainText($validated['notes'], 5000);
        }

        if (isset($validated['total_amount'])) {
            $installment->total_amount = round((float) $validated['total_amount'], 3);
        }
        if (isset($validated['start_date'])) {
            $installment->start_date = $validated['start_date'];
        }
        if (array_key_exists('branch_id', $validated)) {
            $installment->branch_id = $validated['branch_id'];
        }
        if (array_key_exists('cost_center_id', $validated)) {
            $installment->cost_center_id = $validated['cost_center_id'];
        }
        if (array_key_exists('notes', $validated)) {
            $installment->notes = $validated['notes'];
        }
        $installment->save();

        if (isset($validated['lines'])) {
            $installment->lines()->delete();
            foreach ($validated['lines'] as $line) {
                InstallmentLine::create([
                    'installment_id' => $installment->id,
                    'sequence' => $line['sequence'],
                    'due_date' => $line['due_date'],
                    'amount' => round((float) $line['amount'], 3),
                    'paid_amount' => 0,
                    'status' => 'pending',
                ]);
            }
        }

        $installment->load('customer', 'vendor', 'invoice', 'account', 'lines', 'branch', 'costCenter');

        return response()->json($installment);
    }

    private function sanitizePlainText(mixed $value, int $maxLen = 255): ?string
    {
        if ($value === null) {
            return null;
        }
        $s = trim((string) $value);
        if ($s === '') {
            return null;
        }
        $s = str_replace("\0", '', $s);
        $s = strip_tags($s);
        if ($maxLen > 0) {
            $s = mb_substr($s, 0, $maxLen);
        }

        return $s;
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $installment = Installment::where('tenant_id', $request->tenant_id)->findOrFail($id);
        try {
            $this->installmentService->deleteSchedule($installment);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(null, 204);
    }

    public function approve(Request $request, int $id): JsonResponse
    {
        $installment = Installment::where('tenant_id', $request->tenant_id)->with(['customer', 'vendor', 'lines'])->findOrFail($id);
        try {
            $this->installmentService->approve($installment);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
        $installment->load(['customer', 'vendor', 'lines', 'journalEntry']);

        return response()->json($installment);
    }

    /**
     * لوحة إحصائيات الأقساط (جدول معتمد فقط): توزيع البنود، مبالغ، وأعلى العملاء سداداً/تعثراً.
     * المتأخر: تاريخ الاستحقاق قبل اليوم ولم يُسدَّد القسط بالكامل (يشمل الجزئي المتأخر).
     */
    public function statistics(Request $request): JsonResponse
    {
        $request->validate([
            'customer_id' => 'nullable|exists:customers,id',
            'branch_id' => 'nullable|exists:branches,id',
            'cost_center_id' => 'nullable|exists:cost_centers,id',
            'from_date' => 'nullable|date',
            'to_date' => 'nullable|date',
        ]);

        $tenantId = (int) $request->tenant_id;
        $today = Carbon::today()->toDateString();

        $base = InstallmentLine::query()
            ->join('installments', 'installments.id', '=', 'installment_lines.installment_id')
            ->where('installments.tenant_id', $tenantId)
            ->where('installments.status', 'approved');

        if ($request->filled('customer_id')) {
            $base->where('installments.customer_id', (int) $request->customer_id);
        }
        if ($request->filled('branch_id')) {
            $base->where('installments.branch_id', (int) $request->branch_id);
        }
        if ($request->filled('cost_center_id')) {
            $base->where('installments.cost_center_id', (int) $request->cost_center_id);
        }
        if ($request->filled('from_date')) {
            $base->whereDate('installment_lines.due_date', '>=', $request->from_date);
        }
        if ($request->filled('to_date')) {
            $base->whereDate('installment_lines.due_date', '<=', $request->to_date);
        }

        $agg = (clone $base)->selectRaw(
            'COUNT(*) as total_lines,'.
            'SUM(CASE WHEN installment_lines.paid_amount >= installment_lines.amount THEN 1 ELSE 0 END) as cnt_paid,'.
            'SUM(CASE WHEN installment_lines.paid_amount < installment_lines.amount AND DATE(installment_lines.due_date) < ? THEN 1 ELSE 0 END) as cnt_overdue,'.
            'SUM(CASE WHEN installment_lines.paid_amount < installment_lines.amount AND DATE(installment_lines.due_date) >= ? AND installment_lines.paid_amount > 0 THEN 1 ELSE 0 END) as cnt_partial,'.
            'SUM(CASE WHEN installment_lines.paid_amount < installment_lines.amount AND DATE(installment_lines.due_date) >= ? AND installment_lines.paid_amount <= 0 THEN 1 ELSE 0 END) as cnt_pending,'.
            'SUM(CASE WHEN installment_lines.paid_amount < installment_lines.amount AND DATE(installment_lines.due_date) < ? THEN (installment_lines.amount - installment_lines.paid_amount) ELSE 0 END) as overdue_remaining,'.
            'SUM(installment_lines.paid_amount) as sum_paid,'.
            'SUM(installment_lines.amount) as sum_amount',
            [$today, $today, $today, $today]
        )->first();

        $topPayers = (clone $base)
            ->whereNotNull('installments.customer_id')
            ->join('customers', 'customers.id', '=', 'installments.customer_id')
            ->where('customers.tenant_id', $tenantId)
            ->selectRaw('customers.id as customer_id, customers.name as customer_name, SUM(installment_lines.paid_amount) as total_paid')
            ->groupBy('customers.id', 'customers.name')
            ->orderByDesc('total_paid')
            ->limit(5)
            ->get()
            ->map(fn ($r) => [
                'customer_id' => (int) $r->customer_id,
                'customer_name' => (string) $r->customer_name,
                'total_paid' => round((float) $r->total_paid, 3),
            ])
            ->values()
            ->all();

        $topDelinquent = (clone $base)
            ->whereNotNull('installments.customer_id')
            ->whereColumn('installment_lines.paid_amount', '<', 'installment_lines.amount')
            ->whereDate('installment_lines.due_date', '<', $today)
            ->join('customers', 'customers.id', '=', 'installments.customer_id')
            ->where('customers.tenant_id', $tenantId)
            ->selectRaw('customers.id as customer_id, customers.name as customer_name, SUM(installment_lines.amount - installment_lines.paid_amount) as overdue_remaining, COUNT(*) as overdue_lines')
            ->groupBy('customers.id', 'customers.name')
            ->orderByDesc('overdue_remaining')
            ->limit(5)
            ->get()
            ->map(fn ($r) => [
                'customer_id' => (int) $r->customer_id,
                'customer_name' => (string) $r->customer_name,
                'overdue_remaining' => round((float) $r->overdue_remaining, 3),
                'overdue_lines' => (int) $r->overdue_lines,
            ])
            ->values()
            ->all();

        return response()->json([
            'as_of' => $today,
            'lines' => [
                'total' => (int) ($agg->total_lines ?? 0),
                'paid' => (int) ($agg->cnt_paid ?? 0),
                'overdue' => (int) ($agg->cnt_overdue ?? 0),
                'partial' => (int) ($agg->cnt_partial ?? 0),
                'pending' => (int) ($agg->cnt_pending ?? 0),
            ],
            'amounts' => [
                'total_scheduled' => round((float) ($agg->sum_amount ?? 0), 3),
                'total_collected' => round((float) ($agg->sum_paid ?? 0), 3),
                'overdue_remaining' => round((float) ($agg->overdue_remaining ?? 0), 3),
            ],
            'top_payers' => $topPayers,
            'top_delinquent' => $topDelinquent,
        ]);
    }

    /** تقرير متابعة الأقساط (جدول مع أعمدة قابلة للإخفاء) */
    public function followUp(Request $request): JsonResponse
    {
        $request->validate([
            'customer_id' => 'nullable|exists:customers,id',
            'status' => 'nullable|in:draft,approved',
            'line_status' => 'nullable|in:pending,paid,partial,overdue',
            'from_date' => 'nullable|date',
            'to_date' => 'nullable|date',
            'branch_id' => 'nullable|exists:branches,id',
            'cost_center_id' => 'nullable|exists:cost_centers,id',
            'per_page' => 'nullable|integer|in:10,25,50,100',
            'page' => 'nullable|integer|min:1',
        ]);

        $tenantId = (int) $request->tenant_id;
        $perPage = (int) $request->input('per_page', 25);
        if (! in_array($perPage, [10, 25, 50, 100], true)) {
            $perPage = 25;
        }
        $page = max(1, (int) $request->input('page', 1));

        $query = InstallmentLine::query()
            ->whereHas('installment', function ($q) use ($tenantId, $request) {
                $q->where('tenant_id', $tenantId);
                if ($request->filled('customer_id')) {
                    $q->where('customer_id', (int) $request->customer_id);
                }
                if ($request->filled('status')) {
                    $q->where('status', $request->status);
                }
                if ($request->filled('branch_id')) {
                    $q->where('branch_id', (int) $request->branch_id);
                }
                if ($request->filled('cost_center_id')) {
                    $q->where('cost_center_id', (int) $request->cost_center_id);
                }
            })
            ->when($request->filled('line_status'), function ($q) use ($request) {
                $ls = (string) $request->input('line_status');
                $today = Carbon::now()->toDateString();
                // نفس منطق InstallmentLine::updateStatus() (المبلغ + التاريخ) — لا نعتمد على عمود status لو كان قديماً غير محدّث
                match ($ls) {
                    'paid' => $q->whereColumn('paid_amount', '>=', 'amount'),
                    'partial' => $q->where('paid_amount', '>', 0)->whereColumn('paid_amount', '<', 'amount')
                        ->whereDate('due_date', '>=', $today),
                    'pending' => $q->where('paid_amount', '<=', 0)
                        ->whereDate('due_date', '>=', $today),
                    // مستحق وغير مسدد بالكامل وتاريخ الاستحقاق قبل اليوم (يشمل الجزئي المتأخر)
                    'overdue' => $q->whereColumn('paid_amount', '<', 'amount')
                        ->whereDate('due_date', '<', $today),
                    default => null,
                };
            })
            ->when($request->from_date, fn ($q) => $q->where('due_date', '>=', $request->from_date))
            ->when($request->to_date, fn ($q) => $q->where('due_date', '<=', $request->to_date));

        $sums = (clone $query)->selectRaw(
            'COALESCE(SUM(amount), 0) as sum_amount, COALESCE(SUM(paid_amount), 0) as sum_paid, COALESCE(SUM(amount - paid_amount), 0) as sum_remaining'
        )->first();

        $paginator = (clone $query)
            ->with(['installment.customer', 'installment.vendor', 'payment'])
            ->orderBy('due_date')
            ->paginate($perPage, ['*'], 'page', $page);

        $mapped = $paginator->getCollection()->map(function (InstallmentLine $line) {
            $inst = $line->installment;

            return [
                'id' => $line->id,
                'installment_id' => $inst->id,
                'number' => $inst->number,
                'customer_id' => $inst->customer_id,
                'customer_name' => $inst->customer?->name,
                'vendor_name' => $inst->vendor?->name,
                'sequence' => $line->sequence,
                'due_date' => $line->due_date->format('Y-m-d'),
                'amount' => (float) $line->amount,
                'paid_amount' => (float) $line->paid_amount,
                'remaining' => (float) $line->amount - (float) $line->paid_amount,
                'status' => self::installmentLineFollowUpStatus($line),
                'paid_at' => $line->paid_at?->format('Y-m-d H:i:s'),
                'payment_number' => $line->payment?->number,
            ];
        });
        $paginator->setCollection($mapped);

        return response()->json([
            'data' => $paginator->items(),
            'total' => $paginator->total(),
            'current_page' => $paginator->currentPage(),
            'last_page' => $paginator->lastPage(),
            'per_page' => $paginator->perPage(),
            'totals' => [
                'amount' => (float) ($sums->sum_amount ?? 0),
                'paid_amount' => (float) ($sums->sum_paid ?? 0),
                'remaining' => (float) ($sums->sum_remaining ?? 0),
            ],
        ]);
    }

    /**
     * حالة بند القسط لعرض التقرير والفلترة — مطابقة منطق InstallmentLine::updateStatus() مع مقارنة التاريخ كـ Y-m-d.
     */
    private static function installmentLineFollowUpStatus(InstallmentLine $line): string
    {
        $paid = (float) $line->paid_amount;
        $amount = (float) $line->amount;
        if ($paid >= $amount) {
            return 'paid';
        }
        $due = $line->due_date->toDateString();
        $today = Carbon::today()->toDateString();
        if ($due < $today) {
            return 'overdue';
        }
        if ($paid > 0) {
            return 'partial';
        }

        return 'pending';
    }

    /** تقرير الأقساط المتأخرة */
    public function overdue(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $tz = config('app.timezone');
        $asOfDay = $request->filled('as_of')
            ? Carbon::parse($request->string('as_of'), $tz)->startOfDay()
            : Carbon::now($tz)->startOfDay();
        $asOfDate = $asOfDay->toDateString();

        $request->validate([
            'customer_id' => 'sometimes|nullable|integer',
            'branch_id' => 'sometimes|nullable|integer',
            'cost_center_id' => 'sometimes|nullable|integer',
            'per_page' => 'sometimes|nullable|integer|min:1|max:500',
            'page' => 'sometimes|nullable|integer|min:1',
        ]);

        $perPage = (int) $request->input('per_page', 50);
        $perPage = min(max($perPage, 1), 500);
        $page = max((int) $request->input('page', 1), 1);

        $customerId = $request->filled('customer_id') ? (int) $request->input('customer_id') : null;
        $branchId = $request->filled('branch_id') ? (int) $request->input('branch_id') : null;
        $costCenterId = $request->filled('cost_center_id') ? (int) $request->input('cost_center_id') : null;

        $query = InstallmentLine::query()
            ->whereHas('installment', function ($q) use ($tenantId, $customerId, $branchId, $costCenterId) {
                $q->withoutGlobalScopes()
                    ->where('tenant_id', $tenantId)
                    ->where('status', 'approved');
                if ($customerId !== null) {
                    $q->where('customer_id', $customerId);
                }
                if ($branchId !== null) {
                    $q->where('branch_id', $branchId);
                }
                if ($costCenterId !== null) {
                    $q->where('cost_center_id', $costCenterId);
                }
            })
            // استحقاق في أو قبل «حتى تاريخ» (شامل)، وليس «قبله فقط» — وإلا يُستثنى القسط المستحق في نفس يوم as_of
            ->whereDate('due_date', '<=', $asOfDate)
            ->whereColumn('paid_amount', '<', 'amount')
            ->with('installment.customer')
            ->orderBy('due_date');

        $paginator = $query->paginate($perPage, ['*'], 'page', $page);

        $mapped = $paginator->getCollection()->map(function (InstallmentLine $line) use ($asOfDay) {
            $dueStart = $line->due_date->copy()->timezone($asOfDay->getTimezone())->startOfDay();

            return [
                'id' => $line->id,
                'installment_id' => $line->installment_id,
                'number' => $line->installment?->number,
                'customer_name' => $line->installment?->customer?->name,
                'due_date' => $line->due_date->format('Y-m-d'),
                'amount' => (float) $line->amount,
                'paid_amount' => (float) $line->paid_amount,
                'remaining' => (float) $line->amount - (float) $line->paid_amount,
                'days_overdue' => max(0, (int) $dueStart->diffInDays($asOfDay->copy()->startOfDay())),
            ];
        });
        $paginator->setCollection($mapped);

        return response()->json([
            'data' => $paginator->items(),
            'total' => $paginator->total(),
            'current_page' => $paginator->currentPage(),
            'last_page' => $paginator->lastPage(),
            'per_page' => $paginator->perPage(),
        ]);
    }

    /** تقرير التحصيل المتوقع (الشهر القادم) */
    public function expectedCollection(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $month = $request->filled('month') ? Carbon::parse($request->month) : now()->addMonth();
        $start = $month->copy()->startOfMonth()->format('Y-m-d');
        $end = $month->copy()->endOfMonth()->format('Y-m-d');

        $lines = InstallmentLine::query()
            ->whereHas('installment', fn ($q) => $q->where('tenant_id', $tenantId)->where('status', 'approved'))
            ->whereBetween('due_date', [$start, $end])
            ->whereRaw('paid_amount < amount')
            ->with('installment.customer')
            ->orderBy('due_date')
            ->get();

        $rows = $lines->map(fn (InstallmentLine $line) => [
            'id' => $line->id,
            'installment_id' => $line->installment_id,
            'number' => $line->installment?->number,
            'customer_name' => $line->installment?->customer?->name,
            'due_date' => $line->due_date->format('Y-m-d'),
            'amount' => (float) $line->amount,
            'paid_amount' => (float) $line->paid_amount,
            'remaining' => (float) $line->amount - (float) $line->paid_amount,
        ]);

        $totalExpected = $rows->sum('remaining');

        return response()->json([
            'month' => $month->format('Y-m'),
            'data' => $rows,
            'total_expected' => round($totalExpected, 3),
        ]);
    }

    /** توليد جدول أقساط (بدون حفظ) للعرض والتعديل في الواجهة */
    public function generate(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'total_amount' => 'required|numeric|min:0.01',
            'start_date' => 'required|date',
            'num_installments' => 'required|integer|min:1|max:120',
            'frequency_months' => 'nullable|integer|min:1|max:12',
            'period_months' => 'nullable|integer|min:1|max:12',
        ]);
        $lines = $this->installmentService->generateSchedule(
            (int) $request->tenant_id,
            (float) $validated['total_amount'],
            $validated['start_date'],
            (int) $validated['num_installments'],
            (int) ($validated['period_months'] ?? $validated['frequency_months'] ?? 1)
        );

        return response()->json(['lines' => $lines]);
    }
}
