<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\DeliveryDriver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;

class DeliveryDriverController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $q = DeliveryDriver::where('tenant_id', $tenantId)
            ->with('custodyAccount:id,code,name,name_en')
            ->with('branches:id,code,name,name_en')
            ->orderBy('name');

        if ($request->filled('is_active')) {
            $q->where('is_active', filter_var($request->is_active, FILTER_VALIDATE_BOOLEAN));
        }

        $perPage = min(500, max(10, (int) ($request->per_page ?? 100)));

        return response()->json($q->paginate($perPage));
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'code' => 'nullable|string|max:30',
            'name' => 'required|string|max:255',
            'phone' => 'nullable|string|max:50',
            'national_id' => 'nullable|string|max:50',
            'vehicle_type' => 'nullable|string|max:100',
            'custody_account_id' => 'required|integer|exists:accounts,id',
            'is_active' => 'nullable|boolean',
            'notes' => 'nullable|string|max:2000',
            'branch_ids' => 'nullable|array',
            'branch_ids.*' => ['integer', Rule::exists('branches', 'id')->where('tenant_id', $request->tenant_id)],
        ]);

        $tenantId = (int) $request->tenant_id;
        $this->assertPostableAccountForTenant($tenantId, (int) $validated['custody_account_id']);

        $validated['tenant_id'] = $tenantId;
        $validated['is_active'] = $validated['is_active'] ?? true;

        if (! isset($validated['code']) || $validated['code'] === null || trim((string) $validated['code']) === '') {
            $validated['code'] = $this->nextDriverCode($tenantId);
        } else {
            $validated['code'] = trim((string) $validated['code']);
        }

        $driver = DeliveryDriver::create($validated);
        if (isset($validated['branch_ids'])) {
            $driver->branches()->sync($validated['branch_ids'] ?? []);
        }

        return response()->json($driver->load('custodyAccount:id,code,name,name_en', 'branches:id,code,name,name_en'), 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $driver = DeliveryDriver::where('tenant_id', $request->tenant_id)
            ->with('custodyAccount:id,code,name,name_en')
            ->with('branches:id,code,name,name_en')
            ->findOrFail($id);

        return response()->json($driver);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $driver = DeliveryDriver::where('tenant_id', $request->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'code' => 'nullable|string|max:30',
            'name' => 'sometimes|string|max:255',
            'phone' => 'nullable|string|max:50',
            'national_id' => 'nullable|string|max:50',
            'vehicle_type' => 'nullable|string|max:100',
            'custody_account_id' => 'sometimes|integer|exists:accounts,id',
            'is_active' => 'nullable|boolean',
            'notes' => 'nullable|string|max:2000',
            'branch_ids' => 'nullable|array',
            'branch_ids.*' => ['integer', Rule::exists('branches', 'id')->where('tenant_id', $request->tenant_id)],
        ]);

        if (array_key_exists('code', $validated)) {
            // Keep existing code by default; regenerate only if explicitly cleared.
            $code = $validated['code'];
            if ($code === null || trim((string) $code) === '') {
                unset($validated['code']);
            } else {
                $validated['code'] = trim((string) $code);
            }
        }

        if (isset($validated['custody_account_id'])) {
            $this->assertPostableAccountForTenant((int) $request->tenant_id, (int) $validated['custody_account_id']);
        }

        $driver->update($validated);
        if (array_key_exists('branch_ids', $validated)) {
            $driver->branches()->sync($validated['branch_ids'] ?? []);
        }

        return response()->json($driver->fresh()->load('custodyAccount:id,code,name,name_en', 'branches:id,code,name,name_en'));
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $driver = DeliveryDriver::where('tenant_id', $request->tenant_id)->findOrFail($id);
        if ($driver->assignments()->exists()) {
            return response()->json([
                'message' => 'لا يمكن حذف سائق مرتبط بإسناد توصيل. عطّله بدلاً من ذلك.',
            ], 422);
        }
        $driver->delete();

        return response()->json(['ok' => true]);
    }

    private function assertPostableAccountForTenant(int $tenantId, int $accountId): void
    {
        $acc = Account::where('tenant_id', $tenantId)->where('id', $accountId)->first();
        if (! $acc || ! $acc->is_postable) {
            abort(422, 'حساب العهدة غير صالح أو غير قابل للترحيل لهذه الشركة.');
        }
    }

    private function nextDriverCode(int $tenantId): string
    {
        // If migration not applied yet (SQLite / fresh DB), avoid querying a missing column.
        if (! Schema::hasColumn('delivery_drivers', 'code')) {
            $maxId = (int) (DeliveryDriver::where('tenant_id', $tenantId)->max('id') ?? 0);

            return (string) ($maxId + 1);
        }

        // Numeric-ish sequential code per tenant (stored as string)
        $last = DeliveryDriver::where('tenant_id', $tenantId)
            ->orderByRaw('CAST(code AS INTEGER) DESC')
            ->select('code')
            ->first();

        $next = $last?->code ? ((int) $last->code + 1) : 1;

        // Ensure uniqueness in case of non-numeric codes
        while (DeliveryDriver::where('tenant_id', $tenantId)->where('code', (string) $next)->exists()) {
            $next++;
        }

        return (string) $next;
    }
}
