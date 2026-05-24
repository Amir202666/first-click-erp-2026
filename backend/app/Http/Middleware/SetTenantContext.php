<?php

namespace App\Http\Middleware;

use App\Models\Tenant;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class SetTenantContext
{
    public function handle(Request $request, Closure $next): Response
    {
        $tenantId = $request->header('X-Tenant-ID');

        if (! $tenantId) {
            return response()->json(['message' => 'يرجى تحديد المستأجر (Tenant)'], 422);
        }

        $tenant = Tenant::where('id', $tenantId)->where('is_active', true)->first();

        if (! $tenant) {
            return response()->json(['message' => 'المستأجر غير موجود أو غير نشط'], 404);
        }

        $user = $request->user();
        if ($user && ! $user->isSuperAdmin() && ! $user->tenants()->where('tenants.id', $tenant->id)->exists()) {
            return response()->json(['message' => 'ليس لديك صلاحية الوصول لهذا المستأجر'], 403);
        }

        app()->instance('current_tenant', $tenant);
        $request->merge(['tenant_id' => $tenant->id]);
        $request->attributes->set('tenant_id', (int) $tenant->id);

        return $next($request);
    }
}
