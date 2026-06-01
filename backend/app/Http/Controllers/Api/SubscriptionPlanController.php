<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SubscriptionPlan;
use Illuminate\Http\JsonResponse;

/**
 * قائمة باقات الاشتراك النشطة (عام — بدون تسجيل دخول).
 */
class SubscriptionPlanController extends Controller
{
    public function index(): JsonResponse
    {
        $plans = SubscriptionPlan::query()
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        $data = $plans->map(fn (SubscriptionPlan $p) => [
            'id' => $p->id,
            'name' => $p->name,
            'slug' => $p->slug,
            'description' => $p->description,
            'price' => (float) $p->price,
            'currency' => $p->currency ?? 'SAR',
            'billing_cycle_months' => (int) ($p->billing_cycle_months ?? 1),
            'max_users' => $p->max_users,
            'features' => $p->features ?? [],
            'sort_order' => (int) $p->sort_order,
        ]);

        return response()
            ->json(['data' => $data])
            ->header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
            ->header('Pragma', 'no-cache');
    }
}
