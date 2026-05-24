<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\LoyaltyPoint;
use App\Models\LoyaltyProgram;
use App\Models\LoyaltyTier;
use App\Services\LoyaltyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class LoyaltyController extends Controller
{
    public function __construct(private LoyaltyService $loyalty) {}

    public function listPrograms(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;

        $programs = LoyaltyProgram::where('tenant_id', $tenantId)
            ->with(['tiers' => fn ($q) => $q->orderBy('min_points')])
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        return response()->json(['data' => $programs]);
    }

    public function createProgram(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;

        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'code' => 'required|string|max:30|alpha_dash',
            'description' => 'nullable|string|max:500',
            'color' => 'nullable|string|max:20',
            'icon' => 'nullable|string|max:10',
            'is_active' => 'boolean',
            'points_per_currency' => 'required|numeric|min:0.001',
            'point_value' => 'required|numeric|min:0.001',
            'min_redeem_points' => 'required|integer|min:1',
            'max_redeem_percent' => 'required|integer|min:1|max:100',
            'points_expiry_days' => 'required|integer|min:0',
            'apply_on_invoices' => 'boolean',
            'apply_on_pos' => 'boolean',
            'apply_on_delivery' => 'boolean',
            'apply_on_restaurant' => 'boolean',
            'applicable_customer_ids' => 'nullable|array',
            'sort_order' => 'nullable|integer|min:0',
        ]);

        $code = strtoupper((string) $validated['code']);
        $exists = LoyaltyProgram::where('tenant_id', $tenantId)->where('code', $code)->exists();
        if ($exists) {
            return response()->json(['message' => 'كود البرنامج مستخدم بالفعل'], 422);
        }

        $program = LoyaltyProgram::create(array_merge($validated, [
            'tenant_id' => $tenantId,
            'code' => $code,
        ]));

        return response()->json(['data' => $program->fresh(['tiers']), 'message' => 'تم إنشاء البرنامج'], 201);
    }

    public function updateProgram(Request $request, int $id): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $program = LoyaltyProgram::where('tenant_id', $tenantId)->findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:100',
            'code' => 'sometimes|required|string|max:30|alpha_dash',
            'description' => 'nullable|string|max:500',
            'color' => 'nullable|string|max:20',
            'icon' => 'nullable|string|max:10',
            'is_active' => 'boolean',
            'points_per_currency' => 'sometimes|required|numeric|min:0.001',
            'point_value' => 'sometimes|required|numeric|min:0.001',
            'min_redeem_points' => 'sometimes|required|integer|min:1',
            'max_redeem_percent' => 'sometimes|required|integer|min:1|max:100',
            'points_expiry_days' => 'sometimes|required|integer|min:0',
            'apply_on_invoices' => 'boolean',
            'apply_on_pos' => 'boolean',
            'apply_on_delivery' => 'boolean',
            'apply_on_restaurant' => 'boolean',
            'applicable_customer_ids' => 'nullable|array',
            'sort_order' => 'nullable|integer|min:0',
        ]);

        if (isset($validated['code'])) {
            $code = strtoupper((string) $validated['code']);
            $exists = LoyaltyProgram::where('tenant_id', $tenantId)
                ->where('code', $code)
                ->where('id', '!=', (int) $program->id)
                ->exists();
            if ($exists) {
                return response()->json(['message' => 'كود البرنامج مستخدم بالفعل'], 422);
            }
            $validated['code'] = $code;
        }

        $program->update($validated);

        return response()->json(['data' => $program->fresh(['tiers' => fn ($q) => $q->orderBy('min_points')]), 'message' => 'تم تحديث البرنامج']);
    }

    public function deleteProgram(Request $request, int $id): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $program = LoyaltyProgram::where('tenant_id', $tenantId)->findOrFail($id);

        if ($program->points()->exists()) {
            return response()->json(['message' => 'لا يمكن حذف برنامج له نقاط مسجلة. قم بتعطيله بدلاً من الحذف.'], 422);
        }

        $program->delete();

        return response()->json(['message' => 'تم حذف البرنامج']);
    }

    public function getProgram(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;

        // Backward-compat: return first program ordered by sort_order/id
        $program = $this->loyalty->getProgram($tenantId);

        return response()->json(['data' => $program]);
    }

    public function saveProgram(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $programId = $request->filled('id') ? (int) $request->input('id') : null;

        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'code' => 'sometimes|nullable|string|max:30|alpha_dash',
            'description' => 'nullable|string|max:500',
            'color' => 'nullable|string|max:20',
            'icon' => 'nullable|string|max:10',
            'is_active' => 'required|boolean',
            'points_per_currency' => 'required|numeric|min:0.001',
            'point_value' => 'required|numeric|min:0.001',
            'min_redeem_points' => 'required|integer|min:1',
            'max_redeem_percent' => 'required|integer|min:1|max:100',
            'points_expiry_days' => 'required|integer|min:0',
            'apply_on_invoices' => 'boolean',
            'apply_on_pos' => 'boolean',
            'apply_on_delivery' => 'boolean',
            'apply_on_restaurant' => 'boolean',
        ]);

        $where = ['tenant_id' => $tenantId];
        if ($programId) {
            $where['id'] = $programId;
        } else {
            // legacy behaviour: update the first program
            $first = LoyaltyProgram::where('tenant_id', $tenantId)->orderBy('sort_order')->orderBy('id')->first();
            if ($first) {
                $where['id'] = (int) $first->id;
            }
        }

        if (isset($validated['code']) && $validated['code'] !== null) {
            $validated['code'] = strtoupper((string) $validated['code']);
        }

        $program = LoyaltyProgram::updateOrCreate($where, array_merge($validated, ['tenant_id' => $tenantId]));

        return response()->json(['data' => $program, 'message' => 'تم حفظ إعدادات الولاء']);
    }

    public function getTiers(Request $request, ?int $programId = null): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;

        $tiersQ = LoyaltyTier::where('tenant_id', $tenantId);
        if ($programId) {
            $tiersQ->where('loyalty_program_id', $programId);
        }
        $tiers = $tiersQ->orderBy('min_points')->get();

        return response()->json(['data' => $tiers]);
    }

    public function saveTier(Request $request, ?int $programId = null): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;

        $validated = $request->validate([
            'id' => 'nullable|integer',
            'name' => 'required|string|max:50',
            'icon' => 'nullable|string|max:20',
            'color' => 'nullable|string|max:20',
            'min_points' => 'required|integer|min:0',
            'max_points' => 'nullable|integer',
            'points_multiplier' => 'required|numeric|min:1',
            'extra_discount_percent' => 'required|numeric|min:0|max:100',
            'sort_order' => 'nullable|integer|min:0',
        ]);

        if ($programId) {
            $validated['loyalty_program_id'] = $programId;
        }

        $tier = LoyaltyTier::updateOrCreate(
            ['id' => $validated['id'] ?? null, 'tenant_id' => $tenantId],
            array_merge($validated, ['tenant_id' => $tenantId])
        );

        return response()->json(['data' => $tier, 'message' => 'تم حفظ المستوى']);
    }

    public function deleteTier(Request $request, int $id): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;

        LoyaltyTier::where('tenant_id', $tenantId)->findOrFail($id)->delete();

        return response()->json(['message' => 'تم حذف المستوى']);
    }

    public function getCustomers(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $perPage = min(500, max(1, (int) $request->query('per_page', 200)));

        $customers = Customer::query()
            ->where('tenant_id', $tenantId)
            ->where(function ($q) {
                $q->where('loyalty_points_balance', '>', 0)
                    ->orWhere('loyalty_points_total_earned', '>', 0)
                    ->orWhere('loyalty_points_total_redeemed', '>', 0)
                    ->orWhereNotNull('loyalty_tier_id');
            })
            ->with('loyaltyTier')
            ->withMax('loyaltyPoints', 'processed_at')
            ->orderByDesc('loyalty_points_balance')
            ->paginate($perPage);

        $customers->through(function (Customer $customer) {
            $raw = $customer->loyalty_points_max_processed_at;
            $customer->setAttribute(
                'last_activity',
                $raw ? Carbon::parse($raw)->toIso8601String() : null
            );
            $customer->offsetUnset('loyalty_points_max_processed_at');

            return $customer;
        });

        return response()->json($customers);
    }

    public function getCustomerPoints(Request $request, int $id): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;

        $customer = Customer::where('tenant_id', $tenantId)
            ->with('loyaltyTier')
            ->findOrFail($id);

        $history = LoyaltyPoint::where('tenant_id', $tenantId)
            ->where('customer_id', (int) $customer->id)
            ->latest()
            ->take(20)
            ->get();

        $program = $this->loyalty->getProgram($tenantId);
        $pointValue = (float) ($program?->point_value ?? 0);
        $balancePts = (float) ($customer->loyalty_points_balance ?? 0);

        return response()->json([
            'data' => [
                'customer' => $customer,
                'points_balance' => $balancePts,
                'total_earned' => (float) ($customer->loyalty_points_total_earned ?? 0),
                'total_redeemed' => (float) ($customer->loyalty_points_total_redeemed ?? 0),
                'tier' => $customer->loyaltyTier,
                'history' => $history,
                'point_value' => $pointValue,
                'balance_in_kwd' => round($balancePts * $pointValue, 3),
            ],
        ]);
    }

    public function calculate(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;

        $validated = $request->validate([
            'customer_id' => 'required|integer',
            'amount' => 'required|numeric|min:0',
            'redeem_points' => 'nullable|numeric|min:0',
            'program_id' => 'nullable|integer',
        ]);

        $customerId = (int) $validated['customer_id'];
        $amount = (float) $validated['amount'];
        $programId = isset($validated['program_id']) ? (int) $validated['program_id'] : null;

        $toEarn = $this->loyalty->calculatePointsToEarn($tenantId, $customerId, $amount, $programId);
        $maxRedeem = $this->loyalty->calculateMaxRedeem($tenantId, $customerId, $amount, $programId);

        $redeemDiscount = 0.0;
        $redeemPoints = isset($validated['redeem_points']) ? (float) $validated['redeem_points'] : 0.0;
        if ($redeemPoints > 0) {
            $program = $this->loyalty->getProgram($tenantId, $programId);
            $redeemDiscount = round($redeemPoints * (float) ($program?->point_value ?? 0), 3);
        }

        $currentBalance = null;
        $tier = null;
        if ($programId) {
            $currentBalance = $this->loyalty->getCustomerBalance($tenantId, $customerId, $programId);
            $tier = $this->loyalty->getCustomerTier($tenantId, $customerId, $programId);
        }

        return response()->json([
            'data' => [
                'points_to_earn' => $toEarn,
                'max_redeem' => $maxRedeem,
                'redeem_discount' => $redeemDiscount,
                'net_amount' => round($amount - $redeemDiscount, 3),
                'current_balance' => $currentBalance,
                'tier' => $tier,
            ],
        ]);
    }

    public function calculateForProgram(Request $request, int $id): JsonResponse
    {
        $request->merge(['program_id' => $id]);

        return $this->calculate($request);
    }

    public function manualAdjust(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;

        $validated = $request->validate([
            'customer_id' => 'required|integer|exists:customers,id',
            'points' => 'required|numeric',
            'notes' => 'required|string|max:255',
            'program_id' => 'nullable|integer',
        ]);

        $points = round((float) $validated['points'], 3);
        $programId = isset($validated['program_id']) ? (int) $validated['program_id'] : null;

        LoyaltyPoint::create([
            'tenant_id' => $tenantId,
            'loyalty_program_id' => $programId,
            'customer_id' => (int) $validated['customer_id'],
            'type' => 'manual',
            'points' => $points,
            'notes' => $validated['notes'],
            'created_by' => (int) $request->user()->id,
            'processed_at' => now(),
        ]);

        if ($programId) {
            $this->loyalty->updateCustomerBalance($tenantId, (int) $validated['customer_id'], $programId, $points, 0);
            $this->loyalty->updateCustomerTier($tenantId, (int) $validated['customer_id'], $programId);
        } else {
            Customer::where('tenant_id', $tenantId)->where('id', (int) $validated['customer_id'])->update([
                'loyalty_points_balance' => DB::raw('loyalty_points_balance + '.$points),
            ]);
            $this->loyalty->updateCustomerTier($tenantId, (int) $validated['customer_id']);
        }

        return response()->json(['message' => 'تم تعديل النقاط بنجاح']);
    }
}
