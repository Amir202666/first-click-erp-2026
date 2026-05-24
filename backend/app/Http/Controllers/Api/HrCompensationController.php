<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\HrAdministration;
use App\Models\HrAllowance;
use App\Models\HrDeduction;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class HrCompensationController extends Controller
{
    // ─── Allowances ───────────────────────────────────────────────────────────

    public function allowances(Request $request): JsonResponse
    {
        $q = HrAllowance::query()
            ->where('tenant_id', $request->tenant_id)
            ->with(['administration', 'employee', 'currency'])
            ->when($request->filled('status'), fn ($x) => $x->where('status', $request->status))
            ->when($request->filled('apply_to'), fn ($x) => $x->where('apply_to', $request->apply_to))
            ->when($request->filled('administration_id'), fn ($x) => $x->where('administration_id', $request->administration_id))
            ->when($request->filled('employee_id'), fn ($x) => $x->where('employee_id', $request->employee_id))
            ->when($request->filled('q'), function ($x) use ($request) {
                $s = trim((string) $request->q);
                $x->where(fn ($w) => $w->where('name', 'like', "%$s%")->orWhere('code', 'like', "%$s%"));
            })
            ->orderByDesc('id');

        $perPage = (int) ($request->per_page ?? 50);

        return response()->json($request->boolean('paginate', true) ? $q->paginate($perPage) : $q->get());
    }

    public function storeAllowance(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:190',
            'value_type' => 'required|in:fixed,percent_basic',
            'value' => 'required|numeric|min:0',
            'currency_id' => 'nullable|integer|exists:currencies,id',
            'apply_to' => 'required|in:all,administration,employee',
            'administration_id' => 'nullable|integer|exists:hr_administrations,id',
            'employee_id' => 'nullable|integer|exists:employees,id',
            'status' => 'nullable|in:active,inactive',
            'notes' => 'nullable|string',
        ]);

        if ($validated['apply_to'] === 'administration' && ! empty($validated['administration_id'])) {
            HrAdministration::query()->where('tenant_id', $request->tenant_id)->findOrFail((int) $validated['administration_id']);
        }
        if ($validated['apply_to'] === 'employee' && ! empty($validated['employee_id'])) {
            Employee::query()->where('tenant_id', $request->tenant_id)->findOrFail((int) $validated['employee_id']);
        }

        $row = HrAllowance::create([
            'tenant_id' => (int) $request->tenant_id,
            'name' => $validated['name'],
            'value_type' => $validated['value_type'],
            'value' => round((float) $validated['value'], 3),
            'currency_id' => $validated['currency_id'] ?? null,
            'apply_to' => $validated['apply_to'],
            'administration_id' => $validated['apply_to'] === 'administration' ? ($validated['administration_id'] ?? null) : null,
            'employee_id' => $validated['apply_to'] === 'employee' ? ($validated['employee_id'] ?? null) : null,
            'status' => $validated['status'] ?? 'active',
            'notes' => $validated['notes'] ?? null,
            'created_by' => auth()->id(),
        ]);

        return response()->json($row->load(['administration', 'employee', 'currency']), 201);
    }

    public function updateAllowance(Request $request, int $id): JsonResponse
    {
        $row = HrAllowance::query()->where('tenant_id', $request->tenant_id)->findOrFail($id);
        $validated = $request->validate([
            'name' => 'sometimes|string|max:190',
            'value_type' => 'nullable|in:fixed,percent_basic',
            'value' => 'nullable|numeric|min:0',
            'currency_id' => 'nullable|integer|exists:currencies,id',
            'apply_to' => 'nullable|in:all,administration,employee',
            'administration_id' => 'nullable|integer|exists:hr_administrations,id',
            'employee_id' => 'nullable|integer|exists:employees,id',
            'status' => 'nullable|in:active,inactive',
            'notes' => 'nullable|string',
        ]);

        $applyTo = array_key_exists('apply_to', $validated) ? $validated['apply_to'] : $row->apply_to;
        $adminId = array_key_exists('administration_id', $validated) ? $validated['administration_id'] : $row->administration_id;
        $empId = array_key_exists('employee_id', $validated) ? $validated['employee_id'] : $row->employee_id;

        if ($applyTo === 'administration' && ! empty($adminId)) {
            HrAdministration::query()->where('tenant_id', $request->tenant_id)->findOrFail((int) $adminId);
        }
        if ($applyTo === 'employee' && ! empty($empId)) {
            Employee::query()->where('tenant_id', $request->tenant_id)->findOrFail((int) $empId);
        }

        foreach (['name', 'value_type', 'currency_id', 'apply_to', 'status', 'notes'] as $k) {
            if (array_key_exists($k, $validated)) {
                $row->{$k} = $validated[$k];
            }
        }
        if (array_key_exists('value', $validated)) {
            $row->value = round((float) ($validated['value'] ?? 0), 3);
        }
        if (array_key_exists('apply_to', $validated) || array_key_exists('administration_id', $validated) || array_key_exists('employee_id', $validated)) {
            $row->administration_id = $applyTo === 'administration' ? ($adminId ?: null) : null;
            $row->employee_id = $applyTo === 'employee' ? ($empId ?: null) : null;
        }

        $row->save();

        return response()->json($row->fresh(['administration', 'employee', 'currency']));
    }

    public function destroyAllowance(Request $request, int $id): JsonResponse
    {
        $row = HrAllowance::query()->where('tenant_id', $request->tenant_id)->findOrFail($id);
        $row->delete();

        return response()->json(null, 204);
    }

    // ─── Deductions ────────────────────────────────────────────────────────────

    public function deductions(Request $request): JsonResponse
    {
        $q = HrDeduction::query()
            ->where('tenant_id', $request->tenant_id)
            ->with(['administration', 'employee'])
            ->when($request->filled('status'), fn ($x) => $x->where('status', $request->status))
            ->when($request->filled('reason'), fn ($x) => $x->where('reason', $request->reason))
            ->when($request->filled('q'), function ($x) use ($request) {
                $s = trim((string) $request->q);
                $x->where(fn ($w) => $w->where('name', 'like', "%$s%")->orWhere('code', 'like', "%$s%"));
            })
            ->orderByDesc('id');

        $perPage = (int) ($request->per_page ?? 50);

        return response()->json($request->boolean('paginate', true) ? $q->paginate($perPage) : $q->get());
    }

    public function storeDeduction(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:190',
            'reason' => 'required|in:absence,late,loan,advance,other',
            'value_type' => 'required|in:fixed,percent_basic',
            'value' => 'required|numeric|min:0',
            'apply_to' => 'required|in:all,administration,employee',
            'administration_id' => 'nullable|integer|exists:hr_administrations,id',
            'employee_id' => 'nullable|integer|exists:employees,id',
            'status' => 'nullable|in:active,inactive',
            'notes' => 'nullable|string',
        ]);

        if ($validated['apply_to'] === 'administration' && ! empty($validated['administration_id'])) {
            HrAdministration::query()->where('tenant_id', $request->tenant_id)->findOrFail((int) $validated['administration_id']);
        }
        if ($validated['apply_to'] === 'employee' && ! empty($validated['employee_id'])) {
            Employee::query()->where('tenant_id', $request->tenant_id)->findOrFail((int) $validated['employee_id']);
        }

        $row = HrDeduction::create([
            'tenant_id' => (int) $request->tenant_id,
            'name' => $validated['name'],
            'reason' => $validated['reason'],
            'value_type' => $validated['value_type'],
            'value' => round((float) $validated['value'], 3),
            'apply_to' => $validated['apply_to'],
            'administration_id' => $validated['apply_to'] === 'administration' ? ($validated['administration_id'] ?? null) : null,
            'employee_id' => $validated['apply_to'] === 'employee' ? ($validated['employee_id'] ?? null) : null,
            'status' => $validated['status'] ?? 'active',
            'notes' => $validated['notes'] ?? null,
            'created_by' => auth()->id(),
        ]);

        return response()->json($row->load(['administration', 'employee']), 201);
    }

    public function updateDeduction(Request $request, int $id): JsonResponse
    {
        $row = HrDeduction::query()->where('tenant_id', $request->tenant_id)->findOrFail($id);
        $validated = $request->validate([
            'name' => 'sometimes|string|max:190',
            'reason' => 'nullable|in:absence,late,loan,advance,other',
            'value_type' => 'nullable|in:fixed,percent_basic',
            'value' => 'nullable|numeric|min:0',
            'apply_to' => 'nullable|in:all,administration,employee',
            'administration_id' => 'nullable|integer|exists:hr_administrations,id',
            'employee_id' => 'nullable|integer|exists:employees,id',
            'status' => 'nullable|in:active,inactive',
            'notes' => 'nullable|string',
        ]);

        $applyTo = array_key_exists('apply_to', $validated) ? $validated['apply_to'] : $row->apply_to;
        $adminId = array_key_exists('administration_id', $validated) ? $validated['administration_id'] : $row->administration_id;
        $empId = array_key_exists('employee_id', $validated) ? $validated['employee_id'] : $row->employee_id;

        if ($applyTo === 'administration' && ! empty($adminId)) {
            HrAdministration::query()->where('tenant_id', $request->tenant_id)->findOrFail((int) $adminId);
        }
        if ($applyTo === 'employee' && ! empty($empId)) {
            Employee::query()->where('tenant_id', $request->tenant_id)->findOrFail((int) $empId);
        }

        foreach (['name', 'reason', 'value_type', 'apply_to', 'status', 'notes'] as $k) {
            if (array_key_exists($k, $validated)) {
                $row->{$k} = $validated[$k];
            }
        }
        if (array_key_exists('value', $validated)) {
            $row->value = round((float) ($validated['value'] ?? 0), 3);
        }
        if (array_key_exists('apply_to', $validated) || array_key_exists('administration_id', $validated) || array_key_exists('employee_id', $validated)) {
            $row->administration_id = $applyTo === 'administration' ? ($adminId ?: null) : null;
            $row->employee_id = $applyTo === 'employee' ? ($empId ?: null) : null;
        }

        $row->save();

        return response()->json($row->fresh(['administration', 'employee']));
    }

    public function destroyDeduction(Request $request, int $id): JsonResponse
    {
        $row = HrDeduction::query()->where('tenant_id', $request->tenant_id)->findOrFail($id);
        $row->delete();

        return response()->json(null, 204);
    }

    // ─── Employee view: applied allowances & deductions ────────────────────────

    public function employeeCompensation(Request $request, int $employeeId): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $emp = Employee::query()->where('tenant_id', $tenantId)->findOrFail($employeeId);
        $basic = round((float) $emp->basic_salary, 3);

        $allowances = HrAllowance::query()
            ->where('tenant_id', $tenantId)
            ->where('status', 'active')
            ->where(function ($q) use ($emp) {
                $q->where('apply_to', 'all')
                    ->orWhere(function ($x) use ($emp) {
                        $x->where('apply_to', 'administration')->where('administration_id', $emp->administration_id);
                    })
                    ->orWhere(function ($x) use ($emp) {
                        $x->where('apply_to', 'employee')->where('employee_id', $emp->id);
                    });
            })
            ->with(['administration', 'employee', 'currency'])
            ->orderBy('id')
            ->get();

        $deductions = HrDeduction::query()
            ->where('tenant_id', $tenantId)
            ->where('status', 'active')
            ->where(function ($q) use ($emp) {
                $q->where('apply_to', 'all')
                    ->orWhere(function ($x) use ($emp) {
                        $x->where('apply_to', 'administration')->where('administration_id', $emp->administration_id);
                    })
                    ->orWhere(function ($x) use ($emp) {
                        $x->where('apply_to', 'employee')->where('employee_id', $emp->id);
                    });
            })
            ->with(['administration', 'employee'])
            ->orderBy('id')
            ->get();

        $allowanceTotal = 0.0;
        $allowanceItems = $allowances->map(function (HrAllowance $a) use ($basic, &$allowanceTotal) {
            $amount = $a->value_type === 'percent_basic'
                ? round($basic * ((float) $a->value) / 100.0, 3)
                : round((float) $a->value, 3);
            $allowanceTotal += $amount;

            return [
                'id' => $a->id,
                'code' => $a->code,
                'name' => $a->name,
                'value_type' => $a->value_type,
                'value' => (string) $a->value,
                'currency_id' => $a->currency_id,
                'currency' => $a->currency,
                'apply_to' => $a->apply_to,
                'administration' => $a->administration,
                'employee' => $a->employee,
                'status' => $a->status,
                'amount' => $amount,
            ];
        })->values();

        $deductionTotal = 0.0;
        $deductionItems = $deductions->map(function (HrDeduction $d) use ($basic, &$deductionTotal) {
            $amount = $d->value_type === 'percent_basic'
                ? round($basic * ((float) $d->value) / 100.0, 3)
                : round((float) $d->value, 3);
            $deductionTotal += $amount;

            return [
                'id' => $d->id,
                'code' => $d->code,
                'name' => $d->name,
                'reason' => $d->reason,
                'value_type' => $d->value_type,
                'value' => (string) $d->value,
                'apply_to' => $d->apply_to,
                'administration' => $d->administration,
                'employee' => $d->employee,
                'status' => $d->status,
                'amount' => $amount,
            ];
        })->values();

        $baseGross = round($basic + (float) $emp->housing_allowance + (float) $emp->transport_allowance, 3);
        $net = round($baseGross + $allowanceTotal - $deductionTotal, 3);

        return response()->json([
            'employee_id' => $emp->id,
            'basic_salary' => $basic,
            'housing_allowance' => round((float) $emp->housing_allowance, 3),
            'transport_allowance' => round((float) $emp->transport_allowance, 3),
            'base_gross' => $baseGross,
            'allowances_total' => round($allowanceTotal, 3),
            'deductions_total' => round($deductionTotal, 3),
            'net_compensation' => $net,
            'allowances' => $allowanceItems,
            'deductions' => $deductionItems,
        ]);
    }
}
