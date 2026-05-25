<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Subscription;
use App\Models\Tenant;
use App\Services\SuperAdminBackupService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class AdminBackupController extends Controller
{
    public function __construct(
        private SuperAdminBackupService $backupService,
    ) {}

    public function tenants(): JsonResponse
    {
        $tenants = Tenant::query()->orderBy('name')->get();

        $items = $tenants->map(function (Tenant $tenant) {
            $sub = Subscription::query()
                ->where('tenant_id', $tenant->id)
                ->orderByDesc('ends_at')
                ->with('plan')
                ->first();

            return [
                'id' => $tenant->id,
                'name' => $tenant->name,
                'slug' => $tenant->slug,
                'email' => $tenant->email ?? '',
                'plan' => $sub?->plan?->name ?? '—',
                'is_active' => (bool) $tenant->is_active,
                'created_at' => $tenant->created_at?->toIso8601String() ?? '',
                'stats' => $this->tenantStats($tenant->id),
            ];
        });

        return response()->json($items);
    }

    public function backupFull(): JsonResponse
    {
        $job = $this->backupService->startFullBackup();

        return response()->json($job);
    }

    public function backupTenant(int $tenantId): JsonResponse
    {
        $tenant = Tenant::findOrFail($tenantId);
        $job = $this->backupService->startTenantBackup($tenant->id, $tenant->name);

        return response()->json($job);
    }

    public function status(string $jobId): JsonResponse
    {
        $job = $this->backupService->getJob($jobId);
        if (! $job) {
            return response()->json(['message' => 'عملية النسخ غير موجودة.'], 404);
        }

        return response()->json($job);
    }

    public function list(): JsonResponse
    {
        return response()->json($this->backupService->listJobs());
    }

    public function download(string $jobId): BinaryFileResponse|JsonResponse
    {
        $path = $this->backupService->resolveDownloadPath($jobId);
        if (! $path) {
            return response()->json(['message' => 'الملف غير متوفر.'], 404);
        }

        $job = $this->backupService->getJob($jobId);

        return response()->download($path, $job['file_name'] ?? basename($path), [
            'Content-Type' => 'application/gzip',
        ]);
    }

    public function delete(string $jobId): JsonResponse
    {
        $this->backupService->deleteJob($jobId);

        return response()->json(['message' => 'تم حذف النسخة.']);
    }

    private function tenantStats(int $tenantId): array
    {
        $count = fn (string $table) => Schema::hasTable($table) && Schema::hasColumn($table, 'tenant_id')
            ? (int) DB::table($table)->where('tenant_id', $tenantId)->count()
            : 0;

        $invoices = $count('invoices');
        $customers = $count('customers') + $count('vendors');
        $items = $count('items');
        $journals = $count('journal_entries');

        return [
            'invoices_count' => $invoices,
            'customers_count' => $customers,
            'items_count' => $items,
            'journals_count' => $journals,
            'db_size_mb' => round(($invoices + $customers + $items + $journals) * 0.01, 2),
        ];
    }
}
