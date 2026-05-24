<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class CheckPermission
{
    public function handle(Request $request, Closure $next, string $permission): Response
    {
        $user = $request->user();
        $tenant = app()->bound('current_tenant') ? app('current_tenant') : null;

        if (! $user) {
            return response()->json(['message' => 'غير مصرح'], 401);
        }

        if ($user->isSuperAdmin()) {
            return $next($request);
        }

        if (! $tenant) {
            return response()->json(['message' => 'غير مصرح'], 401);
        }

        $tenantUser = $user->tenants()
            ->where('tenants.id', $tenant->id)
            ->first();

        if (! $tenantUser) {
            return response()->json(['message' => 'ليس لديك صلاحية'], 403);
        }

        $rolePermissions = (new self)->resolvePermissions($tenantUser, $tenant->id);
        $customPermissions = $tenantUser->pivot->permissions ?? [];

        $required = array_values(array_filter(array_map('trim', explode('|', $permission))));
        if ($required === []) {
            $required = [$permission];
        }

        $allowed = false;
        foreach ($required as $perm) {
            if (in_array('*', $rolePermissions)
                || in_array($perm, $rolePermissions)
                || in_array('*', $customPermissions)
                || in_array($perm, $customPermissions)) {
                $allowed = true;
                break;
            }
        }

        if ($allowed) {
            return $next($request);
        }

        return response()->json(['message' => 'ليس لديك صلاحية لهذا الإجراء'], 403);
    }

    protected function resolvePermissions($tenantUser, int $tenantId): array
    {
        $pivot = $tenantUser->pivot;
        $roleId = $pivot->role_id ?? null;

        if ($roleId) {
            $role = \App\Models\Role::where('id', $roleId)
                ->where(function ($q) use ($tenantId) {
                    $q->where('tenant_id', $tenantId)->orWhereNull('tenant_id');
                })
                ->with('permissions')
                ->first();
            if ($role) {
                $keys = $role->permissions->pluck('key')->toArray();

                return in_array('*', $keys) ? ['*'] : $keys;
            }
        }

        $legacyRole = $pivot->role ?? null;

        return $this->getLegacyRolePermissions($legacyRole);
    }

    private function getLegacyRolePermissions(?string $role): array
    {
        return match ($role) {
            'admin' => ['*'],
            'accountant' => [
                'accounts.view', 'accounts.create', 'accounts.edit', 'accounts.delete',
                'journal.view', 'journal.create', 'journal.edit',
                'fiscal_years.view', 'fiscal_years.close', 'fiscal_years.lock',
                'invoices.view', 'invoices.create', 'invoices.edit',
                'payments.view', 'payments.create', 'payments.edit',
                'installments.view', 'installments.create', 'installments.edit', 'installments.approve', 'installments.pay',
                'reports.view', 'customers.view', 'vendors.view', 'audit.view',
            ],
            'sales' => [
                'invoices.view', 'invoices.create',
                'customers.view', 'customers.create', 'customers.edit',
                'items.view', 'payments.view', 'payments.create',
            ],
            'warehouse' => [
                'items.view', 'items.create', 'items.edit',
                'inventory.view', 'inventory.create',
            ],
            'cashier' => [
                'pos.sell', 'pos.hold_resume', 'pos.apply_discount', 'pos.view_reports',
                'invoices.view', 'items.view', 'customers.view', 'payments.view', 'payments.create',
            ],
            default => [],
        };
    }

    /** استخدم من الـ controllers للتحقق من صلاحية المستخدم الحالي */
    public static function userHasPermission(Request $request, string $permission): bool
    {
        $user = $request->user();
        $tenant = app()->bound('current_tenant') ? app('current_tenant') : null;
        if (! $user || ! $tenant) {
            return false;
        }
        if ($user->isSuperAdmin()) {
            return true;
        }
        $tenantUser = $user->tenants()->where('tenants.id', $tenant->id)->first();
        if (! $tenantUser) {
            return false;
        }
        $instance = new self;
        $rolePermissions = $instance->resolvePermissions($tenantUser, (int) $tenant->id);
        $customPermissions = $tenantUser->pivot->permissions ?? [];

        $required = array_values(array_filter(array_map('trim', explode('|', $permission))));
        if ($required === []) {
            $required = [$permission];
        }
        foreach ($required as $perm) {
            if (in_array('*', $rolePermissions) || in_array($perm, $rolePermissions)
                || in_array('*', $customPermissions) || in_array($perm, $customPermissions)) {
                return true;
            }
        }

        return false;
    }
}
