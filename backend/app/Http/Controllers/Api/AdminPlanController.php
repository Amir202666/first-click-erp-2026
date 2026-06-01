<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SubscriptionPlan;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * إدارة باقات النظام (للمشرف العام فقط).
 */
class AdminPlanController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $plans = SubscriptionPlan::orderBy('sort_order')->orderBy('name')->get();
        $data = $plans->map(fn ($p) => [
            'id' => $p->id,
            'name' => $p->name,
            'slug' => $p->slug,
            'description' => $p->description,
            'price' => (float) $p->price,
            'currency' => $p->currency ?? 'SAR',
            'max_users' => $p->max_users,
            'duration_days' => $p->duration_days,
            'billing_cycle_months' => (int) ($p->billing_cycle_months ?? 1),
            'features' => $p->features ?? [],
            'is_active' => (bool) $p->is_active,
            'sort_order' => (int) $p->sort_order,
        ]);

        return response()->json(['data' => $data]);
    }

    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'price' => 'nullable|numeric|min:0',
            'currency' => 'nullable|string|size:3',
            'max_users' => 'nullable|integer|min:1',
            'duration_days' => 'nullable|integer|min:1',
            'billing_cycle_months' => 'nullable|integer|min:1|max:120',
            'features' => 'nullable|array',
            'features.*' => 'string|max:100',
            'description' => 'nullable|string|max:500',
            'sort_order' => 'nullable|integer|min:0',
        ]);

        $name = $request->name;
        $slug = Str::slug($name);
        if (SubscriptionPlan::where('slug', $slug)->exists()) {
            return response()->json(['message' => 'باقة بنفس الاسم موجودة.'], 422);
        }

        $plan = SubscriptionPlan::create([
            'name' => $name,
            'slug' => $slug,
            'description' => $request->description,
            'price' => $request->input('price', 0),
            'currency' => strtoupper($request->input('currency', 'SAR')),
            'max_users' => $request->max_users,
            'billing_cycle_months' => $request->billing_cycle_months ?? 1,
            'duration_days' => $request->duration_days,
            'features' => $request->features ?? [],
            'is_active' => true,
            'sort_order' => $request->sort_order ?? (int) (SubscriptionPlan::max('sort_order') ?? 0) + 1,
        ]);

        return response()->json([
            'message' => 'تم إنشاء الباقة بنجاح.',
            'data' => [
                'id' => $plan->id,
                'name' => $plan->name,
                'slug' => $plan->slug,
                'duration_days' => $plan->duration_days,
                'features' => $plan->features ?? [],
            ],
        ], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $plan = SubscriptionPlan::find($id);
        if (! $plan) {
            return response()->json(['message' => 'الباقة غير موجودة.'], 404);
        }

        $request->validate([
            'name' => 'sometimes|string|max:255',
            'price' => 'nullable|numeric|min:0',
            'currency' => 'nullable|string|size:3',
            'max_users' => 'nullable|integer|min:1',
            'duration_days' => 'nullable|integer|min:1',
            'billing_cycle_months' => 'nullable|integer|min:1|max:120',
            'features' => 'nullable|array',
            'features.*' => 'string|max:100',
            'description' => 'nullable|string|max:500',
            'is_active' => 'sometimes|boolean',
            'sort_order' => 'nullable|integer|min:0',
        ]);

        if ($request->has('name')) {
            $plan->name = $request->name;
        }
        if ($request->has('price')) {
            $plan->price = $request->price;
        }
        if ($request->has('currency')) {
            $plan->currency = strtoupper($request->currency);
        }
        if (array_key_exists('max_users', $request->all())) {
            $plan->max_users = $request->max_users;
        }
        if ($request->has('duration_days')) {
            $plan->duration_days = $request->duration_days;
        }
        if ($request->has('billing_cycle_months')) {
            $plan->billing_cycle_months = $request->billing_cycle_months;
        }
        if ($request->has('sort_order')) {
            $plan->sort_order = (int) $request->sort_order;
        }
        if (array_key_exists('features', $request->all())) {
            $plan->features = $request->features ?? [];
        }
        if ($request->has('description')) {
            $plan->description = $request->description;
        }
        if ($request->has('is_active')) {
            $plan->is_active = (bool) $request->is_active;
        }
        $plan->save();

        return response()->json(['message' => 'تم تحديث الباقة بنجاح.']);
    }
}
