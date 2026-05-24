<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * يمنع الوصول إلى مسارات API حسب ميزات الباقة.
 * يعمل بعد CheckSubscriptionExpiry، لذا الاشتراك غير المنتهي مضمون.
 * إذا كانت الباقة لا تحتوي على الميزة المطلوبة للمسار، يُرجع 403.
 */
class CheckPlanFeatures
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user()?->isSuperAdmin()) {
            return $next($request);
        }

        $tenant = $request->tenant_id ? \App\Models\Tenant::find($request->tenant_id) : null;
        if (! $tenant) {
            return $next($request);
        }

        $sub = $tenant->subscriptions()->with('plan')->where('status', 'active')->latest('ends_at')->first()
            ?? $tenant->subscriptions()->with('plan')->latest('ends_at')->first();

        if (! $sub || ! $sub->plan) {
            return $next($request);
        }

        $planFeatures = is_array($sub->plan->features) ? $sub->plan->features : [];
        if (empty($planFeatures)) {
            return $next($request);
        }

        $path = $request->path();
        $pathWithoutApi = preg_replace('#^api/#', '', $path);
        $pathToFeatures = config('plan_features.path_to_features', []);

        foreach ($pathToFeatures as $segment => $requiredFeatures) {
            if (str_contains($pathWithoutApi, $segment)) {
                $allowed = array_intersect($requiredFeatures, $planFeatures);
                if (empty($allowed)) {
                    return response()->json([
                        'message' => 'هذه الميزة غير متوفرة في باقتك. يرجى التواصل مع الإدارة للترقية.',
                        'subscription_expired' => false,
                        'feature_required' => $requiredFeatures[0] ?? null,
                    ], 403);
                }
                break;
            }
        }

        return $next($request);
    }
}
