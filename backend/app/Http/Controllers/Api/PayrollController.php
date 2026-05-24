<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PayrollRun;
use App\Services\PayrollService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PayrollController extends Controller
{
    public function __construct(
        private PayrollService $payrollService
    ) {}

    public function index(Request $request): JsonResponse
    {
        $q = PayrollRun::query()
            ->where('tenant_id', $request->tenant_id)
            ->with('branch')
            ->orderByDesc('year')
            ->orderByDesc('month')
            ->orderByDesc('id');

        $perPage = (int) ($request->per_page ?? 12);

        return response()->json($request->boolean('paginate', true) ? $q->paginate($perPage) : $q->get());
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $run = PayrollRun::query()
            ->where('tenant_id', $request->tenant_id)
            ->with(['lines.employee', 'branch', 'journalEntry.lines.account'])
            ->findOrFail($id);

        return response()->json($run);
    }

    /**
     * توليد مسير (أو إعادة توليد إذا كان Draft).
     */
    public function generate(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'year' => 'required|integer|min:2000|max:2100',
            'month' => 'required|integer|min:1|max:12',
            'branch_id' => 'nullable|exists:branches,id',
        ]);

        $run = $this->payrollService->generate(
            (int) $request->tenant_id,
            (int) $validated['year'],
            (int) $validated['month'],
            $validated['branch_id'] ?? null
        );

        return response()->json($run);
    }

    /**
     * اعتماد المسير + إنشاء القيد المحاسبي.
     */
    public function approve(Request $request, int $id): JsonResponse
    {
        $run = PayrollRun::query()->where('tenant_id', $request->tenant_id)->findOrFail($id);
        $validated = $request->validate([
            'salary_expense_account_id' => 'required|integer|min:1|exists:accounts,id',
            'salary_payable_account_id' => 'required|integer|min:1|exists:accounts,id',
            'bank_account_id' => 'nullable|integer|exists:accounts,id',
        ]);

        $approved = $this->payrollService->approve($run, $validated);

        return response()->json($approved);
    }
}
