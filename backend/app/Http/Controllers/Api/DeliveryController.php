<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DeliveryAssignment;
use App\Models\DeliveryDriver;
use App\Models\Invoice;
use App\Models\Payment;
use App\Services\DeliveryService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DeliveryController extends Controller
{
    public function __construct(
        private DeliveryService $deliveryService,
    ) {}

    /** فواتير جاهزة للشحن (لم تُسند بعد) */
    public function readyInvoices(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $q = Invoice::where('tenant_id', $tenantId)
            ->where('type', 'sales')
            ->where('is_return', false)
            ->whereNotNull('delivery_ready_at')
            ->whereNotNull('journal_entry_id')
            ->where('balance', '>', 0.0005)
            ->whereDoesntHave('deliveryAssignments', fn ($qq) => $qq->where('status', 'assigned'))
            ->with(['customer:id,name,phone', 'branch:id,name,name_en'])
            ->orderByDesc('delivery_ready_at');

        if ($request->filled('branch_id')) {
            $q->where('branch_id', (int) $request->branch_id);
        }

        $perPage = min(200, max(10, (int) ($request->per_page ?? 50)));

        return response()->json($q->paginate($perPage));
    }

    public function markInvoiceReady(Request $request, int $invoiceId): JsonResponse
    {
        $invoice = Invoice::where('tenant_id', $request->tenant_id)->findOrFail($invoiceId);
        $this->deliveryService->markInvoiceReady($invoice);

        return response()->json($invoice->fresh(['customer:id,name', 'branch:id,name']));
    }

    public function unmarkInvoiceReady(Request $request, int $invoiceId): JsonResponse
    {
        $invoice = Invoice::where('tenant_id', $request->tenant_id)->findOrFail($invoiceId);
        $this->deliveryService->unmarkInvoiceReady($invoice);

        return response()->json($invoice->fresh());
    }

    public function assign(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'invoice_id' => 'required|integer|exists:invoices,id',
            'driver_id' => 'required|integer|exists:delivery_drivers,id',
        ]);
        $tenantId = (int) $request->tenant_id;
        $invoice = Invoice::where('tenant_id', $tenantId)->findOrFail($validated['invoice_id']);
        $driver = DeliveryDriver::where('tenant_id', $tenantId)->findOrFail($validated['driver_id']);

        $assignment = $this->deliveryService->assignInvoiceToDriver($invoice, $driver, auth()->id());

        return response()->json($assignment, 201);
    }

    public function cancelAssignment(Request $request, int $assignmentId): JsonResponse
    {
        $assignment = DeliveryAssignment::where('tenant_id', $request->tenant_id)->findOrFail($assignmentId);
        $this->deliveryService->cancelAssignment($assignment, auth()->id());

        return response()->json(['ok' => true]);
    }

    public function markDelivered(Request $request, int $assignmentId): JsonResponse
    {
        $assignment = DeliveryAssignment::where('tenant_id', $request->tenant_id)->findOrFail($assignmentId);
        $this->deliveryService->markDelivered($assignment);

        return response()->json($assignment->fresh());
    }

    /** فواتير معلّقة بعهدة السائقين (لشاشة التسوية) */
    public function pendingSettlements(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $q = DeliveryAssignment::where('tenant_id', $tenantId)
            ->where('status', 'assigned')
            ->with([
                'driver:id,name,phone,custody_account_id',
                'driver.custodyAccount:id,code,name',
                'invoice' => fn ($iq) => $iq->with(['customer:id,name,phone', 'branch:id,name']),
            ])
            ->orderBy('assigned_at');

        if ($request->filled('driver_id')) {
            $q->where('driver_id', (int) $request->driver_id);
        }

        $rows = $q->get();

        $byDriver = $rows->groupBy('driver_id')->map(function ($group) {
            $driver = $group->first()->driver;

            return [
                'driver' => $driver ? [
                    'id' => $driver->id,
                    'name' => $driver->name,
                    'phone' => $driver->phone,
                    'custody_account_id' => $driver->custody_account_id,
                ] : null,
                'assignments' => $group->map(fn (DeliveryAssignment $a) => [
                    'id' => $a->id,
                    'invoice_id' => $a->invoice_id,
                    'custody_amount' => (float) $a->custody_amount,
                    'assigned_at' => $a->assigned_at?->toIso8601String(),
                    'delivered_at' => $a->delivered_at?->toIso8601String(),
                    'invoice' => [
                        'id' => $a->invoice->id,
                        'number' => $a->invoice->number,
                        'date' => $a->invoice->date?->format('Y-m-d'),
                        'total' => (float) $a->invoice->total,
                        'balance' => (float) $a->invoice->balance,
                        'customer' => $a->invoice->customer,
                        'branch' => $a->invoice->branch,
                    ],
                ])->values(),
            ];
        })->values();

        return response()->json(['data' => $byDriver]);
    }

    public function settle(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'driver_id' => 'required|integer|exists:delivery_drivers,id',
            'payment_method_id' => 'required|integer|exists:payment_methods,id',
            'date' => 'required|date',
            'invoices' => 'required|array|min:1',
            'invoices.*.invoice_id' => 'required|integer|exists:invoices,id',
            'invoices.*.amount' => 'nullable|numeric|min:0.0001',
        ]);

        $tenantId = (int) $request->tenant_id;
        $payments = $this->deliveryService->settleInvoices(
            $tenantId,
            (int) $validated['driver_id'],
            $validated['invoices'],
            (int) $validated['payment_method_id'],
            $validated['date'],
            auth()->id()
        );

        return response()->json([
            'payments' => collect($payments)->map(fn ($p) => [
                'id' => $p->id,
                'number' => $p->number,
                'amount' => (float) $p->amount,
                'invoice_id' => $p->invoice_id,
            ]),
        ]);
    }

    /** تقرير أداء السائقين */
    public function performanceReport(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $request->validate([
            'from_date' => 'nullable|date',
            'to_date' => 'nullable|date',
            'driver_id' => 'nullable|integer',
            'branch_id' => 'nullable|integer',
        ]);

        $from = $request->filled('from_date')
            ? Carbon::parse($request->from_date)->startOfDay()
            : now()->subMonths(3)->startOfDay();
        $to = $request->filled('to_date')
            ? Carbon::parse($request->to_date)->endOfDay()
            : now()->endOfDay();

        $assignmentsQuery = DeliveryAssignment::where('tenant_id', $tenantId)
            ->where('status', 'settled')
            ->whereBetween('assigned_at', [$from, $to]);

        if ($request->filled('driver_id')) {
            $assignmentsQuery->where('driver_id', (int) $request->driver_id);
        }

        if ($request->filled('branch_id')) {
            $branchId = (int) $request->branch_id;
            $assignmentsQuery->whereHas('invoice', fn ($q) => $q->where('branch_id', $branchId));
        }

        $assignments = $assignmentsQuery->with('driver:id,name,custody_account_id')->get();

        $grouped = $assignments->groupBy('driver_id');
        $rows = [];
        foreach ($grouped as $driverId => $group) {
            $driver = $group->first()->driver;
            $tripCount = $group->count();
            $durationSamples = [];
            foreach ($group as $a) {
                if ($a->delivered_at && $a->assigned_at) {
                    $durationSamples[] = $a->assigned_at->diffInMinutes($a->delivered_at);
                }
            }
            $invoiceIdsForDriver = $group->pluck('invoice_id')->unique()->all();
            $custodyId = $driver?->custody_account_id;
            $collected = $custodyId
                ? (float) Payment::where('tenant_id', $tenantId)
                    ->whereIn('invoice_id', $invoiceIdsForDriver)
                    ->where('counterpart_account_id', (int) $custodyId)
                    ->whereIn('status', ['approved', 'posted'])
                    ->whereBetween('date', [$from->toDateString(), $to->toDateString()])
                    ->sum('amount')
                : 0.0;
            $avgMinutes = count($durationSamples) > 0
                ? round(array_sum($durationSamples) / count($durationSamples), 1)
                : null;

            $rows[] = [
                'driver_id' => (int) $driverId,
                'driver_name' => $driver?->name,
                'trip_count' => $tripCount,
                'avg_delivery_minutes' => $avgMinutes,
                'total_collected' => round($collected, 3),
            ];
        }

        usort($rows, fn ($a, $b) => ($b['trip_count'] <=> $a['trip_count']) ?: strcmp($a['driver_name'] ?? '', $b['driver_name'] ?? ''));

        return response()->json([
            'from_date' => $from->toDateString(),
            'to_date' => $to->toDateString(),
            'rows' => $rows,
        ]);
    }
}
