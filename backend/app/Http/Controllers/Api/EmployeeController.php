<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\EmployeeDocument;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class EmployeeController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $q = Employee::query()
            ->where('tenant_id', $request->tenant_id)
            ->with(['branch', 'administration', 'departmentRef'])
            ->when($request->filled('status'), fn ($x) => $x->where('status', $request->status))
            ->when($request->filled('branch_id'), fn ($x) => $x->where('branch_id', $request->branch_id))
            ->when($request->filled('administration_id'), fn ($x) => $x->where('administration_id', $request->administration_id))
            ->when($request->filled('department_id'), fn ($x) => $x->where('department_id', $request->department_id))
            ->when($request->filled('department'), fn ($x) => $x->where('department', $request->department))
            ->when($request->filled('q'), function ($x) use ($request) {
                $s = trim((string) $request->q);
                $x->where(function ($w) use ($s) {
                    $w->where('name', 'like', '%'.$s.'%')
                        ->orWhere('code', 'like', '%'.$s.'%')
                        ->orWhere('national_id', 'like', '%'.$s.'%');
                });
            })
            ->orderByDesc('id');

        $perPage = (int) ($request->per_page ?? 20);
        $data = $request->boolean('paginate', true) ? $q->paginate($perPage) : $q->get();

        return response()->json($data);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:190',
            'national_id' => 'nullable|string|max:64',
            'birth_date' => 'nullable|date',
            'phone' => 'nullable|string|max:64',
            'email' => 'nullable|email|max:190',
            'address' => 'nullable|string|max:255',
            'branch_id' => 'nullable|exists:branches,id',
            'administration_id' => 'nullable|integer|exists:hr_administrations,id',
            'department_id' => 'nullable|integer|exists:hr_departments,id',
            'department' => 'nullable|string|max:190',
            'job_title' => 'nullable|string|max:190',
            'hire_date' => 'nullable|date',
            'status' => 'nullable|in:active,on_leave,resigned',
            'basic_salary' => 'nullable|numeric|min:0',
            'housing_allowance' => 'nullable|numeric|min:0',
            'transport_allowance' => 'nullable|numeric|min:0',
            'notes' => 'nullable|string',
        ]);

        $emp = Employee::create([
            'tenant_id' => (int) $request->tenant_id,
            'name' => $validated['name'],
            'national_id' => $validated['national_id'] ?? null,
            'birth_date' => $validated['birth_date'] ?? null,
            'phone' => $validated['phone'] ?? null,
            'email' => $validated['email'] ?? null,
            'address' => $validated['address'] ?? null,
            'branch_id' => $validated['branch_id'] ?? null,
            'administration_id' => $validated['administration_id'] ?? null,
            'department_id' => $validated['department_id'] ?? null,
            'department' => $validated['department'] ?? null,
            'job_title' => $validated['job_title'] ?? null,
            'hire_date' => $validated['hire_date'] ?? null,
            'status' => $validated['status'] ?? 'active',
            'basic_salary' => round((float) ($validated['basic_salary'] ?? 0), 3),
            'housing_allowance' => round((float) ($validated['housing_allowance'] ?? 0), 3),
            'transport_allowance' => round((float) ($validated['transport_allowance'] ?? 0), 3),
            'notes' => $validated['notes'] ?? null,
            'created_by' => auth()->id(),
        ]);

        return response()->json($emp->load(['branch', 'administration', 'departmentRef']), 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $emp = Employee::query()
            ->where('tenant_id', $request->tenant_id)
            ->with(['branch', 'documents', 'administration', 'departmentRef'])
            ->findOrFail($id);

        $docs = $emp->documents->map(function (EmployeeDocument $d) {
            $expiresAt = $d->expires_at ? Carbon::parse($d->expires_at) : null;
            $daysLeft = $expiresAt ? now()->startOfDay()->diffInDays($expiresAt->startOfDay(), false) : null;

            return [
                'id' => $d->id,
                'type' => $d->type,
                'file_url' => $d->file_url,
                'issued_at' => $d->issued_at?->format('Y-m-d'),
                'expires_at' => $d->expires_at?->format('Y-m-d'),
                'days_left' => $daysLeft,
                'status' => $daysLeft === null ? 'none' : ($daysLeft < 0 ? 'expired' : ($daysLeft <= 30 ? 'expiring' : 'valid')),
                'notes' => $d->notes,
                'created_at' => $d->created_at?->toISOString(),
            ];
        });

        $payload = $emp->toArray();
        $payload['documents'] = $docs;

        return response()->json($payload);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $emp = Employee::query()->where('tenant_id', $request->tenant_id)->findOrFail($id);
        $validated = $request->validate([
            'name' => 'sometimes|string|max:190',
            'national_id' => 'nullable|string|max:64',
            'birth_date' => 'nullable|date',
            'phone' => 'nullable|string|max:64',
            'email' => 'nullable|email|max:190',
            'address' => 'nullable|string|max:255',
            'branch_id' => 'nullable|exists:branches,id',
            'administration_id' => 'nullable|integer|exists:hr_administrations,id',
            'department_id' => 'nullable|integer|exists:hr_departments,id',
            'department' => 'nullable|string|max:190',
            'job_title' => 'nullable|string|max:190',
            'hire_date' => 'nullable|date',
            'status' => 'nullable|in:active,on_leave,resigned',
            'basic_salary' => 'nullable|numeric|min:0',
            'housing_allowance' => 'nullable|numeric|min:0',
            'transport_allowance' => 'nullable|numeric|min:0',
            'notes' => 'nullable|string',
        ]);

        foreach (['name', 'national_id', 'birth_date', 'phone', 'email', 'address', 'branch_id', 'administration_id', 'department_id', 'department', 'job_title', 'hire_date', 'status', 'notes'] as $k) {
            if (array_key_exists($k, $validated)) {
                $emp->{$k} = $validated[$k];
            }
        }
        foreach (['basic_salary', 'housing_allowance', 'transport_allowance'] as $k) {
            if (array_key_exists($k, $validated)) {
                $emp->{$k} = round((float) ($validated[$k] ?? 0), 3);
            }
        }
        $emp->save();

        return response()->json($emp->fresh(['branch', 'documents', 'administration', 'departmentRef']));
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $emp = Employee::query()->where('tenant_id', $request->tenant_id)->findOrFail($id);
        $emp->documents()->delete();
        $emp->attendances()->delete();
        $emp->delete();

        return response()->json(null, 204);
    }

    public function uploadDocument(Request $request, int $employeeId): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $emp = Employee::query()->where('tenant_id', $tenantId)->findOrFail($employeeId);

        $request->validate([
            'type' => 'required|in:passport,contract,residency,other',
            'file' => 'required|file|mimes:jpeg,png,gif,webp,pdf|max:4096',
            'issued_at' => 'nullable|date',
            'expires_at' => 'nullable|date',
            'notes' => 'nullable|string',
        ]);

        $file = $request->file('file');
        $dir = 'employee-docs/'.$tenantId.'/'.$emp->id;
        $path = $file->store($dir, 'public');
        $url = Storage::disk('public')->url($path);
        if (! str_starts_with($url, 'http')) {
            $url = rtrim(config('app.url', ''), '/').'/'.ltrim($url, '/');
        }

        $doc = EmployeeDocument::create([
            'tenant_id' => $tenantId,
            'employee_id' => $emp->id,
            'type' => $request->type,
            'file_url' => $url,
            'file_path' => $path,
            'issued_at' => $request->issued_at,
            'expires_at' => $request->expires_at,
            'notes' => $request->notes,
            'created_by' => auth()->id(),
        ]);

        return response()->json($doc, 201);
    }

    public function deleteDocument(Request $request, int $employeeId, int $docId): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        Employee::query()->where('tenant_id', $tenantId)->findOrFail($employeeId);
        $doc = EmployeeDocument::query()
            ->where('tenant_id', $tenantId)
            ->where('employee_id', $employeeId)
            ->findOrFail($docId);

        if ($doc->file_path) {
            try {
                Storage::disk('public')->delete($doc->file_path);
            } catch (\Throwable) {
                // ignore
            }
        }
        $doc->delete();

        return response()->json(null, 204);
    }
}
