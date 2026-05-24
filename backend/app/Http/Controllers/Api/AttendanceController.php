<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\Employee;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AttendanceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'from' => 'nullable|date',
            'to' => 'nullable|date',
            'employee_id' => 'nullable|exists:employees,id',
            'source' => 'nullable|in:device,manual',
        ]);

        $q = Attendance::query()
            ->where('tenant_id', $request->tenant_id)
            ->with('employee')
            ->when($request->filled('employee_id'), fn ($x) => $x->where('employee_id', $request->employee_id))
            ->when($request->filled('source'), fn ($x) => $x->where('source', $request->source))
            ->when($request->filled('from'), fn ($x) => $x->where('work_date', '>=', $request->from))
            ->when($request->filled('to'), fn ($x) => $x->where('work_date', '<=', $request->to))
            ->orderByDesc('work_date')
            ->orderByDesc('id');

        $perPage = (int) ($request->per_page ?? 30);
        $data = $request->boolean('paginate', true) ? $q->paginate($perPage) : $q->get();

        return response()->json($data);
    }

    /**
     * تسجيل حضور يدوي (للإدارة).
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'employee_id' => 'required|exists:employees,id',
            'work_date' => 'required|date',
            'check_in' => 'nullable|date',
            'check_out' => 'nullable|date',
            'source' => 'nullable|in:device,manual',
            'notes' => 'nullable|string',
        ]);

        $tenantId = (int) $request->tenant_id;
        Employee::query()->where('tenant_id', $tenantId)->findOrFail((int) $validated['employee_id']);

        $att = Attendance::query()->updateOrCreate(
            [
                'tenant_id' => $tenantId,
                'employee_id' => (int) $validated['employee_id'],
                'work_date' => $validated['work_date'],
            ],
            [
                'check_in' => $validated['check_in'] ?? null,
                'check_out' => $validated['check_out'] ?? null,
                'source' => $validated['source'] ?? 'manual',
                'notes' => $validated['notes'] ?? null,
                'created_by' => auth()->id(),
            ]
        );

        return response()->json($att->load('employee'), 201);
    }
}
