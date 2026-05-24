<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Middleware\CheckPermission;
use App\Models\Invoice;
use App\Models\PosSession;
use App\Models\PosShift;
use App\Models\User;
use App\Services\PosShiftReportService;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Throwable;

class CashierDailyReportController extends Controller
{
    public function __construct(
        private PosShiftReportService $shiftReportService,
    ) {}

    /**
     * GET /pos/shifts/{shiftId}/daily-report
     * يومية صندوق الكاشير لوردية محددة (نفس منطق تقرير الورديات / Z).
     */
    public function show(Request $request, int $shiftId): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        if ($tenantId < 1) {
            return response()->json(['message' => 'يرجى تحديد المستأجر'], 422);
        }

        try {
            $shift = PosShift::withoutGlobalScope('tenant')
                ->where('tenant_id', $tenantId)
                ->with(['user:id,name', 'branch:id,name,code'])
                ->findOrFail($shiftId);
        } catch (ModelNotFoundException) {
            return response()->json(['message' => 'الوردية غير موجودة'], 404);
        }

        if (
            ! CheckPermission::userHasPermission($request, 'invoices.view')
            && CheckPermission::userHasPermission($request, 'pos.view_reports')
            && (int) $shift->user_id !== (int) $request->user()->id
        ) {
            return response()->json(['message' => 'لا يمكن عرض يومية وردية مستخدم آخر'], 403);
        }

        try {
            $this->assertShiftBranchAllowed($request, $tenantId, $shift);

            $payload = $this->shiftReportService->getShiftReportPayload($shift);

            return response()->json([
                'data' => $this->buildReportBody($shift, $payload, $tenantId),
            ]);
        } catch (HttpExceptionInterface $e) {
            return response()->json([
                'message' => $e->getMessage() ?: 'غير مصرح',
            ], $e->getStatusCode());
        } catch (Throwable $e) {
            report($e);

            return response()->json([
                'message' => app()->environment('production') ? 'تعذر تحميل التقرير' : $e->getMessage(),
            ], 500);
        }
    }

    /**
     * GET /pos/cashier/today-report
     * تقرير اليوم للمستخدم الحالي (آخر وردية مفتوحة أو مفتوحة اليوم بتوقيت الكويت).
     */
    public function todayReport(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        if ($tenantId < 1) {
            return response()->json(['message' => 'يرجى تحديد المستأجر'], 422);
        }

        $userId = (int) $request->user()->id;
        $kuwaitTz = 'Asia/Kuwait';

        try {
            $todayStart = Carbon::now($kuwaitTz)->startOfDay()->utc();
            $todayEnd = Carbon::now($kuwaitTz)->endOfDay()->utc();

            $base = PosShift::withoutGlobalScope('tenant')
                ->where('tenant_id', $tenantId)
                ->where('user_id', $userId);

            $shift = (clone $base)
                ->where('status', 'open')
                ->orderByDesc('opened_at')
                ->with(['user:id,name', 'branch:id,name,code'])
                ->first();

            if (! $shift) {
                $shift = (clone $base)
                    ->where('opened_at', '>=', $todayStart)
                    ->where('opened_at', '<=', $todayEnd)
                    ->orderByDesc('opened_at')
                    ->with(['user:id,name', 'branch:id,name,code'])
                    ->first();
            }

            if (! $shift) {
                return response()->json([
                    'data' => null,
                    'message' => 'لا توجد وردية اليوم',
                ], 404);
            }

            $this->assertShiftBranchAllowed($request, $tenantId, $shift);

            $payload = $this->shiftReportService->getShiftReportPayload($shift);

            return response()->json([
                'data' => $this->buildReportBody($shift, $payload, $tenantId),
            ]);
        } catch (HttpExceptionInterface $e) {
            return response()->json([
                'message' => $e->getMessage() ?: 'غير مصرح',
            ], $e->getStatusCode());
        } catch (Throwable $e) {
            report($e);

            return response()->json([
                'message' => app()->environment('production') ? 'تعذر تحميل التقرير' : $e->getMessage(),
            ], 500);
        }
    }

    /**
     * @param  array<string,mixed>  $payload
     * @return array<string,mixed>
     */
    private function buildReportBody(PosShift $shift, array $payload, int $tenantId): array
    {
        $kuwaitTz = 'Asia/Kuwait';

        $openedAt = $shift->opened_at
            ? Carbon::parse($shift->opened_at)->timezone($kuwaitTz)
            : Carbon::now($kuwaitTz);
        $closedAt = $shift->closed_at
            ? Carbon::parse($shift->closed_at)->timezone($kuwaitTz)
            : null;
        $closedEnd = $closedAt ?? Carbon::now($kuwaitTz);
        $durationMinutes = (int) $openedAt->diffInMinutes($closedEnd);
        $duration = intdiv($durationMinutes, 60).'س '.($durationMinutes % 60).'د';

        $byMethod = is_array($payload['by_payment_method'] ?? null) ? $payload['by_payment_method'] : [];
        $paymentBreakdown = [];
        foreach ($byMethod as $row) {
            if (! is_array($row)) {
                continue;
            }
            $type = strtolower((string) ($row['type'] ?? 'other'));
            if (! isset($paymentBreakdown[$type])) {
                $paymentBreakdown[$type] = [
                    'amount' => 0.0,
                    'count' => 0,
                    'label' => (string) ($row['name'] ?? $type),
                ];
            }
            $paymentBreakdown[$type]['amount'] = round($paymentBreakdown[$type]['amount'] + (float) ($row['amount'] ?? 0), 3);
            $paymentBreakdown[$type]['count'] += (int) ($row['count'] ?? 0);
        }

        $cashSales = (float) ($payload['cash_received'] ?? 0);
        $cashReturns = (float) ($payload['total_returns'] ?? 0);
        $cashDiscounts = 0.0;
        $opening = round((float) $shift->opening_cash, 3);
        $expectedInDrawer = round((float) ($payload['expected_cash'] ?? 0), 3);
        $actualInDrawer = $shift->closing_cash !== null ? round((float) $shift->closing_cash, 3) : null;
        $difference = $shift->difference !== null ? round((float) $shift->difference, 3) : null;

        $sessionIds = PosSession::query()
            ->where('tenant_id', $tenantId)
            ->where('shift_id', $shift->id)
            ->pluck('id');

        $invoices = Invoice::query()
            ->where('tenant_id', $tenantId)
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
            ->with([
                'customer:id,name',
                'paymentMethod:id,name,name_en,type',
                'invoicePayments.paymentMethod:id,name,name_en,type',
                'lines' => fn ($q) => $q->orderBy('sort_order')->orderBy('id')->with('item:id,name'),
            ])
            ->orderBy('created_at')
            ->get();

        // Fallback: إذا لم تُربط الفواتير بالوردية (pos_shift_id / pos_session_id) نبحث عبر (الفرع + الكاشير + فترة الوردية).
        if ($invoices->isEmpty() && $shift->opened_at) {
            $openedAtUtc = Carbon::parse($shift->opened_at);
            $closedAtUtc = $shift->closed_at ? Carbon::parse($shift->closed_at) : now();

            $invoices = Invoice::query()
                ->where('tenant_id', $tenantId)
                ->where('type', 'sales')
                ->where('branch_id', (int) $shift->branch_id)
                ->where('created_by', (int) $shift->user_id)
                ->whereBetween('created_at', [$openedAtUtc, $closedAtUtc])
                ->where(function ($q) {
                    $q->whereNull('is_return')->orWhere('is_return', false);
                })
                ->with([
                    'customer:id,name',
                    'paymentMethod:id,name,name_en,type',
                    'invoicePayments.paymentMethod:id,name,name_en,type',
                    'lines' => fn ($q) => $q->orderBy('sort_order')->orderBy('id')->with('item:id,name'),
                ])
                ->orderBy('created_at')
                ->get();
        }

        $invoiceList = $invoices->map(function (Invoice $inv) use ($kuwaitTz) {
            $created = $inv->created_at
                ? Carbon::parse($inv->created_at)->timezone($kuwaitTz)
                : Carbon::now($kuwaitTz);

            $payments = $inv->invoicePayments;
            $methodLabel = '—';
            $methodKey = 'other';
            if ($payments->isNotEmpty()) {
                $methods = $payments->map(fn ($p) => $p->paymentMethod)->filter();
                if ($methods->count() > 1) {
                    $methodLabel = 'مختلط';
                    $methodKey = 'mixed';
                } else {
                    $pm = $methods->first() ?? $inv->paymentMethod;
                    $methodLabel = $pm?->name ?? $pm?->name_en ?? '—';
                    $methodKey = strtolower((string) ($pm?->type ?? 'other'));
                }
            } elseif ($inv->paymentMethod) {
                $methodLabel = $inv->paymentMethod->name ?? $inv->paymentMethod->name_en ?? '—';
                $methodKey = strtolower((string) ($inv->paymentMethod->type ?? 'other'));
            }

            $lineBits = $inv->lines->take(4)->map(function ($line) {
                $name = $line->item?->name ?? $line->description ?? '';

                return trim((string) $name) !== '' ? trim((string) $name) : null;
            })->filter()->values();
            $itemsSummary = $lineBits->isEmpty() ? '—' : $lineBits->implode('، ');
            if ($inv->lines->count() > 4) {
                $itemsSummary .= ' …';
            }

            return [
                'id' => $inv->id,
                'number' => (string) ($inv->number ?? 'INV-'.$inv->id),
                'time' => $created->format('H:i'),
                'date' => $created->format('d/m/Y'),
                'customer_name' => $inv->customer?->name ?? 'عميل نقدي',
                'items_summary' => $itemsSummary,
                'total' => round((float) $inv->total, 3),
                'payment_method' => $methodKey,
                'payment_method_label' => $methodLabel,
                'balance' => round((float) $inv->balance, 3),
                'status' => (string) ($inv->payment_status ?? 'na'),
            ];
        })->values()->all();

        $invoiceCount = $invoices->count();
        $invoiceSalesSum = round((float) $invoices->sum('total'), 3);
        $payloadSales = round((float) ($payload['total_sales'] ?? 0), 3);
        $payloadInvoiceCount = (int) ($payload['total_invoices'] ?? $payload['invoices_count'] ?? 0);

        if ($invoiceCount > 0) {
            $totalSales = $invoiceSalesSum;
            $totalInvoices = $invoiceCount;
            $avgInvoice = round($totalSales / $totalInvoices, 3);
        } else {
            $totalSales = $payloadSales;
            $totalInvoices = $payloadInvoiceCount;
            $avgInvoice = $totalInvoices > 0 ? round($totalSales / $totalInvoices, 3) : 0.0;
        }

        return [
            'shift' => [
                'id' => $shift->id,
                'user_id' => (int) ($shift->user_id ?? 0),
                'branch_id' => (int) ($shift->branch_id ?? 0),
                'number' => (string) ($payload['shift_number'] ?? ''),
                'status' => $shift->status === 'open' ? 'open' : 'closed',
                'cashier' => $shift->user?->name ?? '—',
                'branch' => $shift->branch?->name ?? '—',
                'opened_at' => $openedAt->format('d/m/Y H:i'),
                'opened_date' => $openedAt->format('Y-m-d'),
                'closed_at' => $closedAt?->format('d/m/Y H:i'),
                'duration' => $duration,
                'opening_balance' => $opening,
            ],
            'kpis' => [
                'total_sales' => $totalSales,
                'total_invoices' => $totalInvoices,
                'avg_invoice' => $avgInvoice,
                'opening_balance' => $opening,
            ],
            'payment_breakdown' => $paymentBreakdown,
            'reconciliation' => [
                'opening_balance' => $opening,
                'cash_sales' => round($cashSales, 3),
                'cash_returns' => round($cashReturns, 3),
                'cash_discounts' => round($cashDiscounts, 3),
                'total_expenses' => round((float) ($payload['total_expenses'] ?? 0), 3),
                'expected_in_drawer' => $expectedInDrawer,
                'actual_in_drawer' => $actualInDrawer,
                'difference' => $difference,
            ],
            'invoices' => $invoiceList,
        ];
    }

    /**
     * GET /pos/cashier-daily-report/cashiers
     * مستخدمون لهم ورديات في الشركة (للفلتر).
     */
    public function cashiersForDailyReport(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        if ($tenantId < 1) {
            return response()->json(['message' => 'يرجى تحديد المستأجر'], 422);
        }

        if (! CheckPermission::userHasPermission($request, 'invoices.view')) {
            $u = $request->user();

            return response()->json(['data' => [['id' => (int) $u->id, 'name' => (string) $u->name]]]);
        }

        $pivot = $request->user()?->tenants()->where('tenants.id', $tenantId)->first()?->pivot;
        $restrictBranch = $pivot && ($pivot->restrict_to_branch_warehouse ?? false) && ! empty($pivot->default_branch_id);
        $branchId = $restrictBranch ? (int) $pivot->default_branch_id : null;

        $q = PosShift::withoutGlobalScope('tenant')
            ->where('tenant_id', $tenantId)
            ->whereNotNull('user_id');
        if ($branchId) {
            $q->where('branch_id', $branchId);
        }

        $userIds = (clone $q)->distinct()->pluck('user_id')->filter()->unique()->values();

        $users = User::query()
            ->whereIn('id', $userIds)
            ->orderBy('name')
            ->get(['id', 'name']);

        return response()->json(['data' => $users]);
    }

    /**
     * GET /pos/cashier-daily-report/shifts
     * ورديات تتقاطع مع التاريخ (أو الفترة) في تقويم المستخدم، مع فلتر كاشير اختياري.
     */
    public function shiftsForDailyReport(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        if ($tenantId < 1) {
            return response()->json(['message' => 'يرجى تحديد المستأجر'], 422);
        }

        $request->validate([
            'date' => 'nullable|date_format:Y-m-d',
            'date_to' => 'nullable|date_format:Y-m-d',
            'user_id' => 'nullable|integer|exists:users,id',
            'branch_id' => 'nullable|integer|min:1',
            'report_tz' => 'nullable|string|max:64',
        ]);

        $calendarTz = $this->resolveReportCalendarTimezone($request->query('report_tz'));
        $date = $request->input('date');
        if ($date === null || $date === '' || ! is_string($date) || ! preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            $date = Carbon::now($calendarTz)->toDateString();
        }
        $dateTo = $request->input('date_to');
        if ($dateTo === null || $dateTo === '' || ! is_string($dateTo) || ! preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateTo)) {
            $dateTo = $date;
        }
        [$dateFrom, $dateToNorm] = $this->normalizeReportDatePair($date, $dateTo);

        $viewAll = CheckPermission::userHasPermission($request, 'invoices.view');
        $filterUserId = $request->filled('user_id') ? (int) $request->user_id : null;
        if (! $viewAll) {
            $filterUserId = (int) $request->user()->id;
        }

        $pivot = $request->user()?->tenants()->where('tenants.id', $tenantId)->first()?->pivot;
        $restrictBranch = $pivot && ($pivot->restrict_to_branch_warehouse ?? false) && ! empty($pivot->default_branch_id);
        $resolvedBranchId = null;
        if ($restrictBranch) {
            $resolvedBranchId = (int) $pivot->default_branch_id;
        } elseif ($request->filled('branch_id') && (int) $request->branch_id > 0) {
            $resolvedBranchId = (int) $request->branch_id;
        }

        $query = PosShift::withoutGlobalScope('tenant')
            ->where('tenant_id', $tenantId)
            ->with(['user:id,name', 'branch:id,name,code'])
            ->orderByDesc('opened_at');

        if ($resolvedBranchId) {
            $query->where('branch_id', $resolvedBranchId);
        }
        if ($filterUserId) {
            $query->where('user_id', $filterUserId);
        }

        $this->applyShiftOverlapsCalendarRange($query, $dateFrom, $dateToNorm, $calendarTz);

        $shifts = $query->limit(120)->get();
        $kuwaitTz = 'Asia/Kuwait';

        $rows = $shifts->map(function (PosShift $shift) use ($tenantId, $kuwaitTz) {
            $payload = $this->shiftReportService->getShiftReportPayload($shift);
            $opened = $shift->opened_at ? Carbon::parse($shift->opened_at)->timezone($kuwaitTz) : null;
            $closed = $shift->closed_at ? Carbon::parse($shift->closed_at)->timezone($kuwaitTz) : null;

            return [
                'id' => $shift->id,
                'number' => (string) ($payload['shift_number'] ?? ''),
                'status' => $shift->status,
                'user_id' => (int) ($shift->user_id ?? 0),
                'branch_id' => (int) ($shift->branch_id ?? 0),
                'cashier_name' => $shift->user?->name ?? '—',
                'branch' => $shift->branch?->name ?? '—',
                'opened_time' => $opened?->format('H:i') ?? '',
                'closed_time' => $closed?->format('H:i'),
                'opened_date' => $opened?->format('Y-m-d') ?? '',
                'total_sales' => round((float) ($payload['total_sales'] ?? 0), 3),
            ];
        })->values()->all();

        return response()->json(['data' => $rows]);
    }

    private function assertShiftBranchAllowed(Request $request, int $tenantId, PosShift $shift): void
    {
        // الكاشير يجب أن يرى ورديته الحالية حتى لو كان تقييد الفرع في الملف الشخصي لا يطابق branch الوردية (مثلاً بعد نقل فرع افتراضي).
        if ((int) $shift->user_id === (int) $request->user()->id) {
            return;
        }

        $pivot = $request->user()?->tenants()->where('tenants.id', $tenantId)->first()?->pivot;
        $restrict = $pivot && ($pivot->restrict_to_branch_warehouse ?? false) && ! empty($pivot->default_branch_id);
        if ($restrict && (int) $shift->branch_id !== (int) $pivot->default_branch_id) {
            abort(403, 'غير مصرح بعرض هذه الوردية');
        }
    }

    private function resolveReportCalendarTimezone(?string $fromRequest): string
    {
        if ($fromRequest !== null && $fromRequest !== '' && in_array($fromRequest, timezone_identifiers_list(), true)) {
            return $fromRequest;
        }

        return (string) config('app.report_date_timezone', 'Asia/Kuwait');
    }

    /**
     * @return array{0: mixed, 1: mixed}
     */
    private function normalizeReportDatePair(mixed $dateFrom, mixed $dateTo): array
    {
        $from = $dateFrom;
        $to = $dateTo;
        if (is_string($from) && is_string($to)
            && preg_match('/^\d{4}-\d{2}-\d{2}$/', $from)
            && preg_match('/^\d{4}-\d{2}-\d{2}$/', $to)
            && strcmp($from, $to) > 0) {
            return [$to, $from];
        }

        return [$from, $to];
    }

    private function applyShiftOverlapsCalendarRange(Builder $query, mixed $dateFrom, mixed $dateTo, string $calendarTz): void
    {
        $table = $query->getModel()->getTable();
        $opened = $table.'.opened_at';
        $closed = $table.'.closed_at';

        $fromOk = $dateFrom !== null && $dateFrom !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $dateFrom);
        $toOk = $dateTo !== null && $dateTo !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $dateTo);

        if ($fromOk && $toOk) {
            $start = Carbon::createFromFormat('Y-m-d', (string) $dateFrom, $calendarTz)->startOfDay()->utc();
            $end = Carbon::createFromFormat('Y-m-d', (string) $dateTo, $calendarTz)->endOfDay()->utc();
            $query->where(function (Builder $inner) use ($opened, $closed, $start, $end) {
                $inner->where($opened, '<=', $end)
                    ->where(function (Builder $inner2) use ($closed, $start) {
                        $inner2->whereNull($closed)->orWhere($closed, '>=', $start);
                    });
            });

            return;
        }

        $this->applyOpenedAtCalendarRange($query, $dateFrom, $dateTo, $calendarTz);
    }

    private function applyOpenedAtCalendarRange(Builder $query, mixed $dateFrom, mixed $dateTo, string $calendarTz): void
    {
        $table = $query->getModel()->getTable();
        $col = $table.'.opened_at';
        if ($dateFrom !== null && $dateFrom !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $dateFrom)) {
            $start = Carbon::createFromFormat('Y-m-d', (string) $dateFrom, $calendarTz)->startOfDay()->utc();
            $query->where($col, '>=', $start);
        }
        if ($dateTo !== null && $dateTo !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $dateTo)) {
            $end = Carbon::createFromFormat('Y-m-d', (string) $dateTo, $calendarTz)->endOfDay()->utc();
            $query->where($col, '<=', $end);
        }
    }
}
