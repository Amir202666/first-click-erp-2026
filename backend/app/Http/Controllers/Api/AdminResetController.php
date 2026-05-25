<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ResetLog;
use App\Models\Tenant;
use App\Services\SuperAdminResetService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class AdminResetController extends Controller
{
    public function __construct(
        private SuperAdminResetService $resetService,
    ) {}

    public function preview(Request $request): JsonResponse
    {
        $request->validate([
            'tenant_id' => 'required|integer|exists:tenants,id',
            'modules' => 'required|array|min:1',
            'modules.*' => 'string|in:invoices,journals,payments,inventory,customers,items,accounts,all',
        ]);

        $counts = $this->resetService->preview(
            (int) $request->tenant_id,
            $request->modules,
        );

        return response()->json($counts);
    }

    public function execute(Request $request): JsonResponse
    {
        $request->validate([
            'tenant_id' => 'required|integer|exists:tenants,id',
            'modules' => 'required|array|min:1',
            'modules.*' => 'string|in:invoices,journals,payments,inventory,customers,items,accounts,all',
            'confirmation_token' => 'required|string',
        ]);

        $tenantId = (int) $request->tenant_id;
        if ($request->confirmation_token !== SuperAdminResetService::expectedConfirmationToken($tenantId)) {
            return response()->json(['message' => 'رمز التأكيد غير صحيح.'], 422);
        }

        $tenant = Tenant::findOrFail($tenantId);
        $modules = $request->modules;
        if (in_array('all', $modules, true)) {
            $modules = ['all'];
        }

        $deletedCounts = $this->resetService->execute($tenantId, $modules);
        $total = array_sum($deletedCounts);

        ResetLog::create([
            'tenant_id' => $tenantId,
            'tenant_name' => $tenant->name,
            'modules' => $modules,
            'deleted_counts' => $deletedCounts,
            'confirmed_by' => $request->user()?->name ?? 'super_admin',
            'executed_at' => now(),
        ]);

        $jobId = 'reset_'.Str::uuid();

        return response()->json([
            'id' => $jobId,
            'tenant_id' => $tenantId,
            'tenant_name' => $tenant->name,
            'modules' => $modules,
            'status' => 'completed',
            'deleted_counts' => $deletedCounts,
            'started_at' => now()->toIso8601String(),
            'completed_at' => now()->toIso8601String(),
            'confirmed_by' => $request->user()?->name ?? 'super_admin',
            'total_deleted' => $total,
        ]);
    }

    public function log(): JsonResponse
    {
        $logs = ResetLog::query()
            ->orderByDesc('executed_at')
            ->limit(100)
            ->get()
            ->map(fn (ResetLog $log) => [
                'id' => (string) $log->id,
                'tenant_id' => $log->tenant_id,
                'tenant_name' => $log->tenant_name,
                'modules' => $log->modules ?? [],
                'status' => 'completed',
                'deleted_counts' => $log->deleted_counts ?? [],
                'started_at' => $log->executed_at?->toIso8601String() ?? '',
                'completed_at' => $log->executed_at?->toIso8601String() ?? '',
                'confirmed_by' => $log->confirmed_by,
            ]);

        return response()->json($logs);
    }
}
