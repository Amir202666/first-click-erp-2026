<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * منع حقن معرف المستأجر من الرابط أو الجسم (URL/body injection).
 * الاعتماد فقط على X-Tenant-ID في الـ header الذي تم التحقق منه في SetTenantContext.
 *
 * ملاحظة أمان: الوصول إلى مورد برقم معرف في المسار (مثل GET /items/123) يُتحقق منه في الـ Controller
 * عبر Model::where('tenant_id', $request->tenant_id)->findOrFail($id)، فيُرجع 404 إذا كان المورد
 * يتبع شركة أخرى (عزل بيانات Multi-tenancy).
 */
class EnforceTenantFromHeader
{
    public function handle(Request $request, Closure $next): Response
    {
        $tenantId = $request->header('X-Tenant-ID');
        if (! $tenantId) {
            return $next($request);
        }
        $fromQuery = $request->query('tenant_id');
        // Covers both form-data and JSON bodies.
        $fromBody = $request->input('tenant_id');

        if ($fromQuery !== null && (string) $fromQuery !== (string) $tenantId) {
            return response()->json([
                'message' => 'لا يمكن تغيير المستأجر من الرابط أو الجسم. يتم استخدام المستأجر من الهيدر فقط.',
            ], 403);
        }
        if ($fromBody !== null && (string) $fromBody !== (string) $tenantId) {
            return response()->json([
                'message' => 'لا يمكن تغيير المستأجر من الرابط أو الجسم. يتم استخدام المستأجر من الهيدر فقط.',
            ], 403);
        }

        return $next($request);
    }
}
