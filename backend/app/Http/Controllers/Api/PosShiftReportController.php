<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PosShift;
use App\Models\User;
use App\Services\PosShiftReportService;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PosShiftReportController extends Controller
{
    public function __construct(
        private PosShiftReportService $shiftReportService,
    ) {}

    /** GET /pos/shifts-report — قائمة الورديات مع فلاتر وإحصائيات */
    public function index(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        if ($tenantId < 1) {
            return response()->json(['message' => 'يرجى تحديد المستأجر'], 422);
        }

        $request->validate([
            'branch_id' => 'nullable|integer|exists:branches,id',
            'user_id' => 'nullable|integer|exists:users,id',
            'cashier_id' => 'nullable|integer|exists:users,id',
            'status' => 'nullable|in:open,closed',
            'date_from' => 'nullable|date',
            'date_to' => 'nullable|date',
            /** منطقة IANA من المتصفح (مثل Asia/Kuwait) لتطابق «اليوم» مع تقويم المستخدم */
            'report_tz' => 'nullable|string|max:64',
            'search' => 'nullable|string|max:120',
            'per_page' => 'nullable|integer|min:5|max:100',
            'page' => 'nullable|integer|min:1',
        ]);

        $pivot = $request->user()?->tenants()->where('tenants.id', $tenantId)->first()?->pivot;
        $restrictBranch = $pivot && ($pivot->restrict_to_branch_warehouse ?? false) && $pivot->default_branch_id;

        $branchId = $request->filled('branch_id') ? (int) $request->branch_id : null;
        if ($restrictBranch) {
            $branchId = (int) $pivot->default_branch_id;
        }

        $userId = $request->filled('user_id')
            ? (int) $request->user_id
            : ($request->filled('cashier_id') ? (int) $request->cashier_id : null);

        // withoutGlobalScope: نعتمد فقط على tenant_id من الطلب بعد SetTenantContext (يتفادى أي ازدواجية/اختلاف مع النطاق العام)
        $query = PosShift::withoutGlobalScope('tenant')
            ->where('tenant_id', $tenantId)
            ->with(['user:id,name', 'branch:id,name,code'])
            ->orderByDesc('opened_at');

        if ($branchId) {
            $query->where('branch_id', $branchId);
        }
        if ($userId) {
            $query->where('user_id', $userId);
        }

        $calendarTz = $this->resolveReportCalendarTimezone($request->query('report_tz'));
        [$dateFrom, $dateTo] = $this->normalizeReportDatePair($request->input('date_from'), $request->input('date_to'));
        $hasDateFilter = ($dateFrom !== null && $dateFrom !== '') || ($dateTo !== null && $dateTo !== '');
        $closedOnly = $request->filled('status') && $request->status === 'closed';
        $openOnly = $request->filled('status') && $request->status === 'open';
        $hasSearch = $request->filled('search');

        if ($closedOnly) {
            $query->where('status', 'closed');
            if ($hasDateFilter) {
                // «ورديات مغلقة ضمن الفترة» = تاريخ الإغلاق في التقويم وليس فقط تاريخ الفتح
                $this->applyClosedAtCalendarRange($query, $dateFrom, $dateTo, $calendarTz);
            }
        } elseif ($hasSearch) {
            if ($openOnly) {
                $query->where('status', 'open');
            }
            if ($hasDateFilter) {
                $this->applyShiftOverlapsCalendarRange($query, $dateFrom, $dateTo, $calendarTz);
            }
        } elseif (! $hasDateFilter) {
            if ($openOnly) {
                $query->where('status', 'open');
            }
        } else {
            $table = (new PosShift)->getTable();
            $query->where(function (Builder $w) use ($dateFrom, $dateTo, $calendarTz, $openOnly, $table) {
                $w->where(function (Builder $q) use ($dateFrom, $dateTo, $calendarTz, $openOnly, $table) {
                    $this->applyShiftOverlapsCalendarRange($q, $dateFrom, $dateTo, $calendarTz);
                    if ($openOnly) {
                        $q->where($table.'.status', 'open');
                    }
                });
                // أي وردية ما زالت مفتوحة تظهر مع فلتر التاريخ حتى لو حدّث منطق التقاطع أو الحدود الزمنية
                if (! $openOnly) {
                    $w->orWhere($table.'.status', 'open');
                }
            });
        }

        if ($hasSearch) {
            $term = '%'.str_replace(['%', '_'], ['\\%', '\\_'], trim((string) $request->search)).'%';
            $query->whereHas('user', fn ($q) => $q->where('name', 'like', $term));
        }

        $perPage = min(100, max(5, (int) ($request->per_page ?? 25)));

        $allForStats = (clone $query)->get();
        $stats = $this->shiftReportService->aggregateStats($allForStats);

        $paginator = (clone $query)->paginate($perPage);

        $rows = $paginator->getCollection()->map(function (PosShift $shift) {
            $payload = $this->shiftReportService->getShiftReportPayload($shift);

            return [
                'id' => $shift->id,
                'shift_number' => $payload['shift_number'],
                'tenant_id' => $shift->tenant_id,
                'branch_id' => $shift->branch_id,
                'user_id' => $shift->user_id,
                'status' => $shift->status,
                'opened_at' => $shift->opened_at?->toIso8601String(),
                'closed_at' => $shift->closed_at?->toIso8601String(),
                'opening_balance' => round((float) $shift->opening_cash, 3),
                'closing_balance_system' => $payload['closing_balance_system'],
                'closing_balance_actual' => $payload['closing_balance_actual'],
                'total_sales' => $payload['total_sales'],
                'total_invoices' => $payload['total_invoices'],
                'total_returns' => $payload['total_returns'],
                'sales_by_payment' => $payload['sales_by_payment'],
                'by_payment_method' => $payload['by_payment_method'],
                'difference' => $payload['difference'],
                'journal_entry_id' => $shift->journal_entry_id,
                'cashier' => $shift->user ? ['id' => $shift->user->id, 'name' => $shift->user->name] : null,
                'branch' => $shift->branch ? ['id' => $shift->branch->id, 'name' => $shift->branch->name, 'code' => $shift->branch->code] : null,
                'totals_source' => $payload['totals_source'],
            ];
        });

        $paginator->setCollection($rows);

        return response()->json([
            'data' => $paginator,
            'stats' => $stats,
        ]);
    }

    /** GET /pos/shifts-report/cashiers — مستخدمو لهم ورديات (للفلتر) */
    public function cashiers(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        if ($tenantId < 1) {
            return response()->json(['message' => 'يرجى تحديد المستأجر'], 422);
        }

        $request->validate([
            'branch_id' => 'nullable|integer|exists:branches,id',
            'date_from' => 'nullable|date',
            'date_to' => 'nullable|date',
            'report_tz' => 'nullable|string|max:64',
        ]);

        $pivot = $request->user()?->tenants()->where('tenants.id', $tenantId)->first()?->pivot;
        $restrictBranch = $pivot && ($pivot->restrict_to_branch_warehouse ?? false) && $pivot->default_branch_id;

        $branchId = $request->filled('branch_id') ? (int) $request->branch_id : null;
        if ($restrictBranch) {
            $branchId = (int) $pivot->default_branch_id;
        }

        $query = PosShift::withoutGlobalScope('tenant')
            ->where('tenant_id', $tenantId)
            ->whereNotNull('user_id');

        if ($branchId) {
            $query->where('branch_id', $branchId);
        }

        $calendarTz = $this->resolveReportCalendarTimezone($request->query('report_tz'));
        [$dateFrom, $dateTo] = $this->normalizeReportDatePair($request->input('date_from'), $request->input('date_to'));
        $hasDateFilter = ($dateFrom !== null && $dateFrom !== '') || ($dateTo !== null && $dateTo !== '');

        if ($hasDateFilter) {
            $table = (new PosShift)->getTable();
            $query->where(function (Builder $w) use ($dateFrom, $dateTo, $calendarTz, $table) {
                $w->where(function (Builder $q) use ($dateFrom, $dateTo, $calendarTz) {
                    $this->applyShiftOverlapsCalendarRange($q, $dateFrom, $dateTo, $calendarTz);
                })->orWhere($table.'.status', 'open');
            });
        }

        $userIds = $query->distinct()->pluck('user_id')->filter()->unique()->values();

        $users = User::query()
            ->whereIn('id', $userIds)
            ->orderBy('name')
            ->get(['id', 'name']);

        return response()->json(['data' => $users]);
    }

    /** GET /pos/shifts-report/{id} — تفاصيل وردية */
    public function show(Request $request, int $id): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $shift = PosShift::withoutGlobalScope('tenant')
            ->where('tenant_id', $tenantId)
            ->with(['user:id,name', 'branch:id,name,code'])
            ->findOrFail($id);

        $payload = $this->shiftReportService->getShiftReportPayload($shift);
        $force = $request->boolean('recompute');
        if ($force) {
            $payload = $this->shiftReportService->getShiftReportPayload($shift, true);
        }

        $row = [
            'id' => $shift->id,
            'shift_number' => $payload['shift_number'],
            'tenant_id' => $shift->tenant_id,
            'branch_id' => $shift->branch_id,
            'user_id' => $shift->user_id,
            'status' => $shift->status,
            'opened_at' => $shift->opened_at?->toIso8601String(),
            'closed_at' => $shift->closed_at?->toIso8601String(),
            'opening_balance' => round((float) $shift->opening_cash, 3),
            'closing_balance_system' => $payload['closing_balance_system'],
            'closing_balance_actual' => $payload['closing_balance_actual'],
            'total_sales' => $payload['total_sales'],
            'total_invoices' => $payload['total_invoices'],
            'total_returns' => $payload['total_returns'],
            'returns_count' => $payload['returns_count'],
            'total_tax' => $payload['total_tax'],
            'items_sold_count' => $payload['items_sold_count'],
            'cash_received' => $payload['cash_received'],
            'total_expenses' => $payload['total_expenses'],
            'expected_cash' => $payload['expected_cash'],
            'sales_by_payment' => $payload['sales_by_payment'],
            'by_payment_method' => $payload['by_payment_method'],
            'difference' => $payload['difference'],
            'z_report_snapshot' => $shift->z_report_snapshot,
            'x_report_snapshot' => $shift->x_report_snapshot,
            'cashier' => $shift->user ? ['id' => $shift->user->id, 'name' => $shift->user->name] : null,
            'branch' => $shift->branch ? ['id' => $shift->branch->id, 'name' => $shift->branch->name, 'code' => $shift->branch->code] : null,
            'totals_source' => $payload['totals_source'],
        ];

        return response()->json([
            'data' => $row,
            'totals' => $payload,
        ]);
    }

    /**
     * الوردية تتقاطع مع فترة التقرير إذا لم تكن قد انتهت قبل بداية اليوم الأول
     * ولم تبدأ بعد نهاية اليوم الأخير — يغطي: فتح أمس وإغلاق اليوم، وردية مفتوحة من قبل، إلخ.
     * يشترط تمرير date_from و date_to بصيغة Y-m-d؛ وإلا يُرجَع للفلترة على opened_at فقط.
     */
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

    /**
     * تقويم من/إلى كما يراه المستخدم (محلي) مقابل opened_at المخزّن بتوقيت UTC.
     */
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

    /** فلترة ورديات مغلقة حسب تاريخ الإغلاق في تقويم المستخدم. */
    private function applyClosedAtCalendarRange(Builder $query, mixed $dateFrom, mixed $dateTo, string $calendarTz): void
    {
        $table = $query->getModel()->getTable();
        $col = $table.'.closed_at';
        if ($dateFrom !== null && $dateFrom !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $dateFrom)) {
            $start = Carbon::createFromFormat('Y-m-d', (string) $dateFrom, $calendarTz)->startOfDay()->utc();
            $query->where($col, '>=', $start);
        }
        if ($dateTo !== null && $dateTo !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $dateTo)) {
            $end = Carbon::createFromFormat('Y-m-d', (string) $dateTo, $calendarTz)->endOfDay()->utc();
            $query->where($col, '<=', $end);
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
}
