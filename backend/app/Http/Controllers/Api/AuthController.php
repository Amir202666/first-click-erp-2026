<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\Tenant;
use App\Models\User;
use App\Services\AuditLogService;
use App\Support\PlanFeatureResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function __construct(private AuditLogService $auditLog) {}

    public function login(Request $request): JsonResponse
    {
        $request->validate([
            'company' => 'required|string|max:255',
            'username' => 'required|string|max:255',
            'password' => 'required',
        ]);

        $companyInput = trim($request->company);
        $usernameInput = trim($request->username);
        $ip = (string) ($request->ip() ?? 'unknown');

        // حماية ضد brute-force: قفل مؤقت بعد محاولات فاشلة متكررة (بالـ tenant + username + ip).
        $maxAttempts = (int) config('auth.login_max_attempts', 5);
        $windowSeconds = (int) config('auth.login_attempt_window_seconds', 10 * 60);
        $lockSeconds = (int) config('auth.login_lock_seconds', 15 * 60);
        $baseKey = 'auth:login:'.strtolower($companyInput).':'.strtolower($usernameInput).':'.$ip;
        $lockKey = $baseKey.':locked';
        $attemptKey = $baseKey.':attempts';

        if ($this->safeCacheHas($lockKey)) {
            $this->auditLog->log('login_locked', 'sessions', null, null, ['company' => $companyInput, 'username' => $usernameInput], null, null);
            throw ValidationException::withMessages([
                'username' => ['تم قفل تسجيل الدخول مؤقتاً بسبب محاولات متكررة. حاول لاحقاً.'],
            ]);
        }

        // الدخول حصراً بمعرف الشركة المختصر (slug) + اسم المستخدم + كلمة المرور
        $tenant = Tenant::where('is_active', true)->where('slug', $companyInput)->first();

        if (! $tenant) {
            $this->auditLog->log('login_failed', 'sessions', null, null, ['company' => $companyInput, 'username' => $usernameInput], null, null);
            $this->registerLoginFailure($attemptKey, $lockKey, $maxAttempts, $windowSeconds, $lockSeconds);
            throw ValidationException::withMessages([
                'company' => ['معرف الشركة غير صحيح أو الحساب غير نشط.'],
            ]);
        }

        $user = User::query()
            ->where(function ($q) use ($usernameInput) {
                $q->where('username', $usernameInput)
                    ->orWhere('email', $usernameInput);
            })
            ->first();

        if (! $user || ! Hash::check($request->password, $user->password)) {
            $this->auditLog->log('login_failed', 'sessions', null, null, ['company' => $companyInput, 'username' => $usernameInput], $tenant->id, $user?->id);
            $this->registerLoginFailure($attemptKey, $lockKey, $maxAttempts, $windowSeconds, $lockSeconds);
            throw ValidationException::withMessages([
                'username' => ['اسم المستخدم أو كلمة المرور غير صحيحة.'],
            ]);
        }

        if (! $user->isSuperAdmin()) {
            $tenantUser = $user->tenants()->where('tenants.id', $tenant->id)->first();
            if (! $tenantUser || ! $tenantUser->pivot->is_active) {
                $this->auditLog->log('login_failed', 'sessions', null, null, ['company' => $companyInput, 'username' => $usernameInput], $tenant->id, $user->id);
                $this->registerLoginFailure($attemptKey, $lockKey, $maxAttempts, $windowSeconds, $lockSeconds);
                throw ValidationException::withMessages([
                    'company' => ['ليس لديك صلاحية الدخول لهذه الشركة.'],
                ]);
            }
        } elseif (! $user->tenants()->where('tenants.id', $tenant->id)->exists()) {
            $this->linkSuperAdminToTenant($user, $tenant);
        }

        $this->auditLog->logLogin($user->id, true, $tenant->id);
        $this->safeCacheForget($attemptKey);
        $this->safeCacheForget($lockKey);

        $token = $user->createToken('auth-token')->plainTextToken;

        return response()->json([
            'token' => $token,
            'token_type' => 'Bearer',
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
            ],
            'tenant' => [
                'id' => $tenant->id,
                'name' => $tenant->name,
                'slug' => $tenant->slug,
            ],
        ]);
    }

    public function register(Request $request): JsonResponse
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:users',
            'password' => 'required|string|min:8|confirmed',
            'tenant_name' => 'required|string|max:255',
            'tenant_activity' => 'nullable|string|in:commercial,industrial,service',
        ]);

        $user = User::create([
            'name' => $request->name,
            'email' => $request->email,
            'password' => Hash::make($request->password),
        ]);

        $tenant = Tenant::create([
            'name' => $request->tenant_name,
            'slug' => \Illuminate\Support\Str::slug($request->tenant_name),
            'email' => $request->email,
            'activity' => $request->tenant_activity ?? 'commercial',
            'is_active' => true,
        ]);

        $tenant->users()->attach($user->id, ['role' => 'admin', 'is_active' => true]);

        $token = $user->createToken('auth-token')->plainTextToken;

        return response()->json([
            'token' => $token,
            'token_type' => 'Bearer',
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
            ],
        ], 201);
    }

    public function logout(Request $request): JsonResponse
    {
        $user = $request->user();
        $tenantId = $request->header('X-Tenant-ID') ? (int) $request->header('X-Tenant-ID') : null;
        $this->auditLog->logLogout($user->id, $tenantId ?: null);
        $user->currentAccessToken()->delete();

        return response()->json(['message' => 'تم تسجيل الخروج بنجاح']);
    }

    public function user(Request $request): JsonResponse
    {
        return response()->json([
            'id' => $request->user()->id,
            'name' => $request->user()->name,
            'email' => $request->user()->email,
        ]);
    }

    /** بيانات المستخدم مع صلاحياته للشريك الحالي (يتطلب X-Tenant-ID) */
    public function me(Request $request): JsonResponse
    {
        $user = $request->user();
        $tenant = $request->tenant_id ? \App\Models\Tenant::find($request->tenant_id) : null;
        $role = null;
        $roleSlug = null;
        $permissions = [];

        if ($user->isSuperAdmin()) {
            return response()->json([
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'role' => 'super_admin',
                'role_slug' => 'super_admin',
                'is_super_admin' => true,
                'permissions' => ['*'],
            ]);
        }

        if ($tenant) {
            $tenantUser = $user->tenants()->where('tenants.id', $tenant->id)->first();
            if ($tenantUser) {
                $pivot = $tenantUser->pivot;
                $roleSlug = $pivot->role;
                $roleId = $pivot->role_id ?? null;
                if ($roleId) {
                    $roleModel = \App\Models\Role::where('id', $roleId)->where(function ($q) use ($tenant) {
                        $q->where('tenant_id', $tenant->id)->orWhereNull('tenant_id');
                    })->with('permissions')->first();
                    if ($roleModel) {
                        $role = $roleModel->name;
                        $roleSlug = $roleModel->slug;
                        $permKeys = $roleModel->permissions->pluck('key')->toArray();
                        $permissions = in_array('*', $permKeys) ? ['*'] : $permKeys;
                        $pricingGroupIds = is_array($roleModel->pricing_group_ids) ? $roleModel->pricing_group_ids : [];
                    }
                }
                if (empty($permissions)) {
                    $permissions = $this->getRolePermissions($roleSlug ?? '');
                }
                $customPerms = $pivot->permissions ?? [];
                $permissions = array_values(array_unique(array_merge($permissions, $customPerms)));
            }
        }

        $defaultBranchId = null;
        $defaultWarehouseId = null;
        $restrictToBranchWarehouse = false;
        $tenantUserId = null;
        if ($tenant && $tenantUser) {
            $defaultBranchId = $tenantUser->pivot->default_branch_id;
            $defaultWarehouseId = $tenantUser->pivot->default_warehouse_id;
            $restrictToBranchWarehouse = (bool) ($tenantUser->pivot->restrict_to_branch_warehouse ?? false);
            $tenantUserId = $tenantUser->pivot->id ?? null;
        }

        $subscriptionEndsAt = null;
        $subscriptionStatus = null;
        $subscriptionExpired = false;
        $planFeatures = [];
        if ($tenant) {
            $sub = $tenant->subscriptions()->with('plan')->where('status', 'active')->latest('ends_at')->first()
                ?? $tenant->subscriptions()->with('plan')->latest('ends_at')->first();
            if ($sub) {
                $subscriptionEndsAt = $sub->ends_at->format('Y-m-d');
                $subscriptionStatus = $sub->status;
                $subscriptionExpired = $sub->ends_at->isPast();
                if ($sub->plan) {
                    $raw = is_array($sub->plan->features) ? $sub->plan->features : [];
                    $planFeatures = PlanFeatureResolver::expand($raw);
                }
            } else {
                $subscriptionStatus = 'expired';
                $subscriptionExpired = true;
            }
        }

        return response()->json([
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $role ?? $roleSlug,
            'role_slug' => $roleSlug,
            'is_super_admin' => $user->isSuperAdmin(),
            'permissions' => $permissions,
            'default_branch_id' => $defaultBranchId,
            'default_warehouse_id' => $defaultWarehouseId,
            'restrict_to_branch_warehouse' => $restrictToBranchWarehouse,
            'tenant_user_id' => $tenantUserId,
            'subscription_ends_at' => $subscriptionEndsAt,
            'subscription_status' => $subscriptionStatus,
            'subscription_expired' => $subscriptionExpired,
            'plan_features' => $planFeatures,
            'pricing_group_ids' => $pricingGroupIds ?? [],
        ]);
    }

    private function getRolePermissions(string $role): array
    {
        return match ($role) {
            'admin' => ['*'],
            'accountant' => [
                'accounts.view', 'accounts.create', 'accounts.edit', 'accounts.delete',
                'journal.view', 'journal.create', 'journal.edit',
                'invoices.view', 'invoices.create', 'invoices.edit',
                'payments.view', 'payments.create', 'payments.edit',
                'installments.view', 'installments.create', 'installments.edit', 'installments.approve', 'installments.pay',
                'reports.view', 'customers.view', 'vendors.view',
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

    private function linkSuperAdminToTenant(User $user, Tenant $tenant): void
    {
        $adminRole = Role::where('tenant_id', $tenant->id)->where('slug', 'admin')->first();
        $tenant->users()->syncWithoutDetaching([
            $user->id => [
                'role' => 'admin',
                'role_id' => $adminRole?->id,
                'is_active' => true,
            ],
        ]);
    }

    private function registerLoginFailure(
        string $attemptKey,
        string $lockKey,
        int $maxAttempts,
        int $windowSeconds,
        int $lockSeconds
    ): void {
        $attempts = (int) $this->safeCacheGet($attemptKey, 0);
        $attempts++;
        $this->safeCachePut($attemptKey, $attempts, now()->addSeconds(max(1, $windowSeconds)));

        if ($attempts >= max(1, $maxAttempts)) {
            $this->safeCachePut($lockKey, true, now()->addSeconds(max(1, $lockSeconds)));
        }
    }

    private function safeCacheHas(string $key): bool
    {
        try {
            return Cache::has($key);
        } catch (\Throwable) {
            return false;
        }
    }

    private function safeCacheGet(string $key, mixed $default = null): mixed
    {
        try {
            return Cache::get($key, $default);
        } catch (\Throwable) {
            return $default;
        }
    }

    private function safeCachePut(string $key, mixed $value, \DateTimeInterface|\DateInterval|int|null $ttl = null): void
    {
        try {
            Cache::put($key, $value, $ttl);
        } catch (\Throwable) {
            // Redis/Cache غير متاح — لا نمنع تسجيل الدخول
        }
    }

    private function safeCacheForget(string $key): void
    {
        try {
            Cache::forget($key);
        } catch (\Throwable) {
            //
        }
    }
}
