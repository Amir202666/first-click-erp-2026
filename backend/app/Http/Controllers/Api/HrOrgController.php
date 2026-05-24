<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\HrAdministration;
use App\Models\HrDepartment;
use App\Models\HrJobTitle;
use App\Models\HrLeaveType;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class HrOrgController extends Controller
{
    public function administrations(Request $request): JsonResponse
    {
        $q = HrAdministration::query()
            ->where('tenant_id', $request->tenant_id)
            ->with('manager')
            ->when($request->filled('status'), fn ($x) => $x->where('status', $request->status))
            ->when($request->filled('q'), function ($x) use ($request) {
                $s = trim((string) $request->q);
                $x->where(fn ($w) => $w->where('name', 'like', "%$s%")->orWhere('code', 'like', "%$s%"));
            })
            ->orderByDesc('id');

        $perPage = (int) ($request->per_page ?? 50);

        return response()->json($request->boolean('paginate', true) ? $q->paginate($perPage) : $q->get());
    }

    public function storeAdministration(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:190',
            'name_en' => 'nullable|string|max:190',
            'manager_employee_id' => 'nullable|integer|exists:employees,id',
            'status' => 'nullable|in:active,inactive',
            'notes' => 'nullable|string',
            'description_ar' => 'nullable|string',
            'description_en' => 'nullable|string',
        ]);
        if (! empty($validated['manager_employee_id'])) {
            Employee::query()->where('tenant_id', $request->tenant_id)->findOrFail((int) $validated['manager_employee_id']);
        }
        $row = HrAdministration::create([
            'tenant_id' => (int) $request->tenant_id,
            'name' => $validated['name'],
            'name_en' => $validated['name_en'] ?? null,
            'manager_employee_id' => $validated['manager_employee_id'] ?? null,
            'status' => $validated['status'] ?? 'active',
            'notes' => $validated['notes'] ?? null,
            'description_ar' => $validated['description_ar'] ?? null,
            'description_en' => $validated['description_en'] ?? null,
            'created_by' => auth()->id(),
        ]);

        return response()->json($row->load('manager'), 201);
    }

    public function updateAdministration(Request $request, int $id): JsonResponse
    {
        $row = HrAdministration::query()->where('tenant_id', $request->tenant_id)->findOrFail($id);
        $validated = $request->validate([
            'name' => 'sometimes|string|max:190',
            'name_en' => 'nullable|string|max:190',
            'manager_employee_id' => 'nullable|integer|exists:employees,id',
            'status' => 'nullable|in:active,inactive',
            'notes' => 'nullable|string',
            'description_ar' => 'nullable|string',
            'description_en' => 'nullable|string',
        ]);
        if (array_key_exists('manager_employee_id', $validated) && ! empty($validated['manager_employee_id'])) {
            Employee::query()->where('tenant_id', $request->tenant_id)->findOrFail((int) $validated['manager_employee_id']);
        }
        foreach (['name', 'name_en', 'manager_employee_id', 'status', 'notes', 'description_ar', 'description_en'] as $k) {
            if (array_key_exists($k, $validated)) {
                $row->{$k} = $validated[$k];
            }
        }
        $row->save();

        return response()->json($row->fresh(['manager']));
    }

    public function destroyAdministration(Request $request, int $id): JsonResponse
    {
        $row = HrAdministration::query()->where('tenant_id', $request->tenant_id)->findOrFail($id);
        $row->delete();

        return response()->json(null, 204);
    }

    public function departments(Request $request): JsonResponse
    {
        $q = HrDepartment::query()
            ->where('tenant_id', $request->tenant_id)
            ->with(['administration', 'manager'])
            ->when($request->filled('status'), fn ($x) => $x->where('status', $request->status))
            ->when($request->filled('administration_id'), fn ($x) => $x->where('administration_id', $request->administration_id))
            ->when($request->filled('q'), function ($x) use ($request) {
                $s = trim((string) $request->q);
                $x->where(fn ($w) => $w->where('name', 'like', "%$s%")->orWhere('code', 'like', "%$s%"));
            })
            ->orderByDesc('id');

        $perPage = (int) ($request->per_page ?? 50);

        return response()->json($request->boolean('paginate', true) ? $q->paginate($perPage) : $q->get());
    }

    public function storeDepartment(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:190',
            'name_en' => 'nullable|string|max:190',
            'administration_id' => 'required|integer|exists:hr_administrations,id',
            'manager_employee_id' => 'nullable|integer|exists:employees,id',
            'status' => 'nullable|in:active,inactive',
            'notes' => 'nullable|string',
            'description_ar' => 'nullable|string',
            'description_en' => 'nullable|string',
        ]);
        HrAdministration::query()->where('tenant_id', $request->tenant_id)->findOrFail((int) $validated['administration_id']);
        if (! empty($validated['manager_employee_id'])) {
            Employee::query()->where('tenant_id', $request->tenant_id)->findOrFail((int) $validated['manager_employee_id']);
        }
        $row = HrDepartment::create([
            'tenant_id' => (int) $request->tenant_id,
            'name' => $validated['name'],
            'name_en' => $validated['name_en'] ?? null,
            'administration_id' => $validated['administration_id'] ?? null,
            'manager_employee_id' => $validated['manager_employee_id'] ?? null,
            'status' => $validated['status'] ?? 'active',
            'notes' => $validated['notes'] ?? null,
            'description_ar' => $validated['description_ar'] ?? null,
            'description_en' => $validated['description_en'] ?? null,
            'created_by' => auth()->id(),
        ]);

        return response()->json($row->load(['administration', 'manager']), 201);
    }

    public function updateDepartment(Request $request, int $id): JsonResponse
    {
        $row = HrDepartment::query()->where('tenant_id', $request->tenant_id)->findOrFail($id);
        $validated = $request->validate([
            'name' => 'sometimes|string|max:190',
            'name_en' => 'nullable|string|max:190',
            'administration_id' => 'nullable|integer|exists:hr_administrations,id',
            'manager_employee_id' => 'nullable|integer|exists:employees,id',
            'status' => 'nullable|in:active,inactive',
            'notes' => 'nullable|string',
            'description_ar' => 'nullable|string',
            'description_en' => 'nullable|string',
        ]);
        if (array_key_exists('administration_id', $validated) && ! empty($validated['administration_id'])) {
            HrAdministration::query()->where('tenant_id', $request->tenant_id)->findOrFail((int) $validated['administration_id']);
        }
        if (array_key_exists('manager_employee_id', $validated) && ! empty($validated['manager_employee_id'])) {
            Employee::query()->where('tenant_id', $request->tenant_id)->findOrFail((int) $validated['manager_employee_id']);
        }
        foreach (['name', 'name_en', 'administration_id', 'manager_employee_id', 'status', 'notes', 'description_ar', 'description_en'] as $k) {
            if (array_key_exists($k, $validated)) {
                $row->{$k} = $validated[$k];
            }
        }
        $row->save();

        return response()->json($row->fresh(['administration', 'manager']));
    }

    public function destroyDepartment(Request $request, int $id): JsonResponse
    {
        $row = HrDepartment::query()->where('tenant_id', $request->tenant_id)->findOrFail($id);
        $row->delete();

        return response()->json(null, 204);
    }

    // ─── HR Job Titles ──────────────────────────────────────────────────────────

    public function jobTitles(Request $request): JsonResponse
    {
        $q = HrJobTitle::query()
            ->where('tenant_id', $request->tenant_id)
            ->when($request->filled('status'), fn ($x) => $x->where('status', $request->status))
            ->when($request->filled('q'), function ($x) use ($request) {
                $s = trim((string) $request->q);
                $x->where(fn ($w) => $w->where('name', 'like', "%$s%")->orWhere('code', 'like', "%$s%"));
            })
            ->orderByDesc('id');

        $perPage = (int) ($request->per_page ?? 50);

        return response()->json($request->boolean('paginate', true) ? $q->paginate($perPage) : $q->get());
    }

    public function storeJobTitle(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:190',
            'name_en' => 'nullable|string|max:190',
            'status' => 'nullable|in:active,inactive',
            'notes' => 'nullable|string',
            'description_ar' => 'nullable|string',
            'description_en' => 'nullable|string',
        ]);

        $row = HrJobTitle::create([
            'tenant_id' => (int) $request->tenant_id,
            'name' => $validated['name'],
            'name_en' => $validated['name_en'] ?? null,
            'status' => $validated['status'] ?? 'active',
            'notes' => $validated['notes'] ?? null,
            'description_ar' => $validated['description_ar'] ?? null,
            'description_en' => $validated['description_en'] ?? null,
            'created_by' => auth()->id(),
        ]);

        return response()->json($row, 201);
    }

    public function updateJobTitle(Request $request, int $id): JsonResponse
    {
        $row = HrJobTitle::query()->where('tenant_id', $request->tenant_id)->findOrFail($id);
        $validated = $request->validate([
            'name' => 'sometimes|string|max:190',
            'name_en' => 'nullable|string|max:190',
            'status' => 'nullable|in:active,inactive',
            'notes' => 'nullable|string',
            'description_ar' => 'nullable|string',
            'description_en' => 'nullable|string',
        ]);

        foreach (['name', 'name_en', 'status', 'notes', 'description_ar', 'description_en'] as $k) {
            if (array_key_exists($k, $validated)) {
                $row->{$k} = $validated[$k];
            }
        }
        $row->save();

        return response()->json($row);
    }

    public function destroyJobTitle(Request $request, int $id): JsonResponse
    {
        $row = HrJobTitle::query()->where('tenant_id', $request->tenant_id)->findOrFail($id);
        $row->delete();

        return response()->json(null, 204);
    }

    // ─── HR Leave Types ─────────────────────────────────────────────────────────

    public function leaveTypes(Request $request): JsonResponse
    {
        $q = HrLeaveType::query()
            ->where('tenant_id', $request->tenant_id)
            ->when($request->filled('status'), fn ($x) => $x->where('status', $request->status))
            ->when($request->filled('q'), function ($x) use ($request) {
                $s = trim((string) $request->q);
                $x->where(fn ($w) => $w->where('name', 'like', "%$s%")->orWhere('code', 'like', "%$s%"));
            })
            ->orderByDesc('id');

        $perPage = (int) ($request->per_page ?? 50);

        return response()->json($request->boolean('paginate', true) ? $q->paginate($perPage) : $q->get());
    }

    public function storeLeaveType(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:190',
            'name_en' => 'nullable|string|max:190',
            'status' => 'nullable|in:active,inactive',
            'notes' => 'nullable|string',
            'description_ar' => 'nullable|string',
            'description_en' => 'nullable|string',
        ]);

        $row = HrLeaveType::create([
            'tenant_id' => (int) $request->tenant_id,
            'name' => $validated['name'],
            'name_en' => $validated['name_en'] ?? null,
            'status' => $validated['status'] ?? 'active',
            'notes' => $validated['notes'] ?? null,
            'description_ar' => $validated['description_ar'] ?? null,
            'description_en' => $validated['description_en'] ?? null,
            'created_by' => auth()->id(),
        ]);

        return response()->json($row, 201);
    }

    public function updateLeaveType(Request $request, int $id): JsonResponse
    {
        $row = HrLeaveType::query()->where('tenant_id', $request->tenant_id)->findOrFail($id);
        $validated = $request->validate([
            'name' => 'sometimes|string|max:190',
            'name_en' => 'nullable|string|max:190',
            'status' => 'nullable|in:active,inactive',
            'notes' => 'nullable|string',
            'description_ar' => 'nullable|string',
            'description_en' => 'nullable|string',
        ]);

        foreach (['name', 'name_en', 'status', 'notes', 'description_ar', 'description_en'] as $k) {
            if (array_key_exists($k, $validated)) {
                $row->{$k} = $validated[$k];
            }
        }
        $row->save();

        return response()->json($row);
    }

    public function destroyLeaveType(Request $request, int $id): JsonResponse
    {
        $row = HrLeaveType::query()->where('tenant_id', $request->tenant_id)->findOrFail($id);
        $row->delete();

        return response()->json(null, 204);
    }
}
