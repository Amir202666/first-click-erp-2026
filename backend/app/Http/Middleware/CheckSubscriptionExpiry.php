<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * يفحص انتهاء اشتراك الشركة الحالية. إذا كان منتهياً يمنع الوصول ويرجع 402.
 * لا يطبق على المستخدمين من نوع super_admin.
 */
class CheckSubscriptionExpiry
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

        $sub = $tenant->subscriptions()->where('status', 'active')->latest('ends_at')->first()
            ?? $tenant->subscriptions()->latest('ends_at')->first();

        if (! $sub) {
            return response()->json([
                'message' => 'انتهى الاشتراك. يرجى التواصل مع الإدارة للتجديد.',
                'subscription_expired' => true,
            ], 402);
        }

        if ($sub->ends_at->isPast()) {
            return response()->json([
                'message' => 'انتهى الاشتراك. يرجى التواصل مع الإدارة للتجديد.',
                'subscription_expired' => true,
                'subscription_ends_at' => $sub->ends_at->format('Y-m-d'),
            ], 402);
        }

        return $next($request);
    }
}
