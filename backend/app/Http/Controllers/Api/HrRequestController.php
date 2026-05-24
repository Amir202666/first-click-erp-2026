<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\HrRequest;
use App\Services\HrRequestService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class HrRequestController extends Controller
{
    public function __construct(
        private HrRequestService $service
    ) {}

    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'type' => 'nullable|in:leave,loan,advance,custody',
            'status' => 'nullable|in:pending,approved,rejected',
            'employee_id' => 'nullable|exists:employees,id',
        ]);

        $q = HrRequest::query()
            ->where('tenant_id', $request->tenant_id)
            ->with(['employee', 'loanInstallments'])
            ->when($request->filled('type'), fn ($x) => $x->where('type', $request->type))
            ->when($request->filled('status'), fn ($x) => $x->where('status', $request->status))
            ->when($request->filled('employee_id'), fn ($x) => $x->where('employee_id', $request->employee_id))
            ->orderByDesc('id');

        $perPage = (int) ($request->per_page ?? 20);

        return response()->json($request->boolean('paginate', true) ? $q->paginate($perPage) : $q->get());
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'employee_id' => 'required|exists:employees,id',
            'type' => 'required|in:leave,loan,advance,custody',
            'requested_at' => 'nullable|date',
            'from_date' => 'nullable|date',
            'to_date' => 'nullable|date',
            'amount' => 'nullable|numeric|min:0.01',
            'installments_count' => 'nullable|integer|min:1|max:120',
            'reason' => 'nullable|string',
        ]);

        $tenantId = (int) $request->tenant_id;
        Employee::query()->where('tenant_id', $tenantId)->findOrFail((int) $validated['employee_id']);

        $req = HrRequest::create([
            'tenant_id' => $tenantId,
            'employee_id' => (int) $validated['employee_id'],
            'type' => $validated['type'],
            'status' => 'pending',
            'requested_at' => $validated['requested_at'] ?? now()->format('Y-m-d'),
            'from_date' => $validated['from_date'] ?? null,
            'to_date' => $validated['to_date'] ?? null,
            'amount' => isset($validated['amount']) ? round((float) $validated['amount'], 3) : null,
            'installments_count' => $validated['installments_count'] ?? null,
            'reason' => $validated['reason'] ?? null,
        ]);

        return response()->json($req->fresh(['employee', 'loanInstallments']), 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $req = HrRequest::query()
            ->where('tenant_id', $request->tenant_id)
            ->with(['employee', 'loanInstallments'])
            ->findOrFail($id);

        return response()->json($req);
    }

    public function approve(Request $request, int $id): JsonResponse
    {
        $req = HrRequest::query()->where('tenant_id', $request->tenant_id)->with('loanInstallments', 'employee')->findOrFail($id);
        $approved = $this->service->approve($req);

        return response()->json($approved);
    }

    public function reject(Request $request, int $id): JsonResponse
    {
        $req = HrRequest::query()->where('tenant_id', $request->tenant_id)->with('loanInstallments', 'employee')->findOrFail($id);
        $validated = $request->validate(['reason' => 'nullable|string']);
        $rejected = $this->service->reject($req, $validated['reason'] ?? null);

        return response()->json($rejected);
    }
}
