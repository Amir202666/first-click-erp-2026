<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\Tenant;
use App\Models\User;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

class TenantUserController extends Controller
{
    public function __construct(private AuditLogService $auditLog) {}

    public function index(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $tenant = Tenant::findOrFail($tenantId);
        $users = $tenant->users()
            ->withPivot('role', 'role_id', 'permissions', 'is_active', 'default_branch_id', 'default_warehouse_id', 'restrict_to_branch_warehouse')
            ->get()
            ->map(function ($user) use ($tenant) {
                $pivot = $user->pivot;
                $roleId = $pivot->role_id;
                $roleName = $pivot->role;
                if ($roleId) {
                    $role = Role::where('id', $roleId)->where('tenant_id', $tenant->id)->first();
                    if ($role) {
                        $roleName = $role->name;
                    }
                }

                return [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'username' => $user->username,
                    'phone' => $user->phone,
                    'tenant_id' => $tenant->id,
                    'pivot' => [
                        'id' => $pivot->id,
                        'role' => $pivot->role,
                        'role_id' => $pivot->role_id,
                        'role_name' => $roleName,
                        'permissions' => $pivot->permissions,
                        'is_active' => (bool) $pivot->is_active,
                        'default_branch_id' => $pivot->default_branch_id,
                        'default_warehouse_id' => $pivot->default_warehouse_id,
                        'restrict_to_branch_warehouse' => (bool) ($pivot->restrict_to_branch_warehouse ?? false),
                    ],
                ];
            });

        return response()->json(['data' => $users]);
    }

    public function store(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $tenant = Tenant::findOrFail($tenantId);

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'nullable|email',
            'phone' => 'nullable|string|max:50',
            'username' => 'required|string|max:255|alpha_dash|unique:users,username',
            'password' => ['required', 'string', 'min:8', 'regex:/^(?=.*[A-Za-z])(?=.*\d).+$/'],
            'role_id' => ['nullable', 'integer', Rule::exists('roles', 'id')->where('tenant_id', $tenantId)],
            'is_active' => 'boolean',
            'default_branch_id' => ['nullable', 'integer', Rule::exists('branches', 'id')->where('tenant_id', $tenantId)],
            'default_warehouse_id' => ['nullable', 'integer', Rule::exists('warehouses', 'id')->where('tenant_id', $tenantId)],
            'restrict_to_branch_warehouse' => 'boolean',
        ]);

        $email = $validated['email'] ?? null;
        if (! $email) {
            // Email is optional in UI; keep DB happy with a generated unique placeholder.
            $email = $validated['username'].'@local.invalid';
        }

        $user = User::where('username', $validated['username'])
            ->orWhere('email', $email)
            ->first();

        if ($user) {
            if ($tenant->users()->where('user_id', $user->id)->exists()) {
                return response()->json(['message' => 'المستخدم مضاف مسبقاً لهذه الشركة'], 422);
            }
        } else {
            $user = User::create([
                'name' => $validated['name'],
                'username' => $validated['username'],
                'email' => $email,
                'phone' => $validated['phone'] ?? null,
                'password' => Hash::make($validated['password']),
            ]);
        }

        $roleId = $validated['role_id'] ?? null;
        $role = $roleId ? Role::where('id', $roleId)->where('tenant_id', $tenantId)->first() : null;
        $roleSlug = $role ? $role->slug : 'accountant';

        $tenant->users()->attach($user->id, [
            'role' => $roleSlug,
            'role_id' => $roleId,
            'is_active' => $validated['is_active'] ?? true,
            'default_branch_id' => $validated['default_branch_id'] ?? null,
            'default_warehouse_id' => $validated['default_warehouse_id'] ?? null,
            'restrict_to_branch_warehouse' => $validated['restrict_to_branch_warehouse'] ?? false,
        ]);

        $this->auditLog->log('created', 'tenant_users', null, null, [
            'tenant_id' => $tenantId,
            'user_id' => $user->id,
            'email' => $user->email,
        ], $tenantId, $request->user()?->id, $request);

        return response()->json([
            'message' => 'تمت إضافة المستخدم',
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'username' => $user->username,
                'phone' => $user->phone,
                'role_id' => $roleId,
                'role_name' => $role?->name ?? $roleSlug,
            ],
        ], 201);
    }

    public function update(Request $request, int $userId): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $tenant = Tenant::findOrFail($tenantId);

        $validated = $request->validate([
            'name' => 'nullable|string|max:255',
            'email' => 'nullable|email',
            'phone' => 'nullable|string|max:50',
            'username' => [
                'nullable',
                'string',
                'max:255',
                'alpha_dash',
                Rule::unique('users', 'username')->ignore($userId),
            ],
            'password' => ['nullable', 'string', 'min:8', 'regex:/^(?=.*[A-Za-z])(?=.*\d).+$/'],
            'role_id' => ['nullable', 'integer', Rule::exists('roles', 'id')->where(function ($q) use ($tenantId) {
                $q->where('tenant_id', $tenantId)->orWhereNull('tenant_id');
            })],
            'is_active' => 'boolean',
            'permissions' => 'nullable|array',
            'permissions.*' => 'string',
            'default_branch_id' => ['nullable', 'integer', Rule::exists('branches', 'id')->where('tenant_id', $tenantId)],
            'default_warehouse_id' => ['nullable', 'integer', Rule::exists('warehouses', 'id')->where('tenant_id', $tenantId)],
            'restrict_to_branch_warehouse' => 'boolean',
        ]);

        $tenantUser = $tenant->users()->where('user_id', $userId)->first();
        if (! $tenantUser) {
            return response()->json(['message' => 'المستخدم غير مرتبط بهذه الشركة'], 404);
        }

        $user = $tenantUser;

        $roleSlug = $tenantUser->pivot->role;
        if (! empty($validated['role_id'])) {
            $role = Role::where('id', $validated['role_id'])->where(function ($q) use ($tenantId) {
                $q->where('tenant_id', $tenantId)->orWhereNull('tenant_id');
            })->first();
            if ($role) {
                $roleSlug = $role->slug;
            }
        }

        $tenant->users()->updateExistingPivot($userId, [
            'role_id' => $validated['role_id'] ?? $tenantUser->pivot->role_id,
            'role' => $roleSlug,
            'is_active' => $validated['is_active'] ?? $tenantUser->pivot->is_active,
            'permissions' => $validated['permissions'] ?? $tenantUser->pivot->permissions,
            'default_branch_id' => array_key_exists('default_branch_id', $validated) ? $validated['default_branch_id'] : $tenantUser->pivot->default_branch_id,
            'default_warehouse_id' => array_key_exists('default_warehouse_id', $validated) ? $validated['default_warehouse_id'] : $tenantUser->pivot->default_warehouse_id,
            'restrict_to_branch_warehouse' => $validated['restrict_to_branch_warehouse'] ?? $tenantUser->pivot->restrict_to_branch_warehouse ?? false,
        ]);

        // تحديث بيانات المستخدم الأساسية إن وُجدت في الطلب
        $userData = [];
        if (array_key_exists('name', $validated)) {
            $userData['name'] = $validated['name'] ?? $user->name;
        }
        if (array_key_exists('email', $validated)) {
            $email = $validated['email'] ?? $user->email;
            if (! $email) {
                $email = ($validated['username'] ?? $user->username ?? ('user'.$user->id)).'@local.invalid';
            }
            $userData['email'] = $email;
        }
        if (array_key_exists('phone', $validated)) {
            $userData['phone'] = $validated['phone'] ?? null;
        }
        if (array_key_exists('username', $validated) && $validated['username']) {
            $userData['username'] = $validated['username'];
        }
        if (! empty($validated['password'])) {
            $userData['password'] = Hash::make($validated['password']);
        }
        if (! empty($userData)) {
            $user->fill($userData);
            $user->save();
        }

        $this->auditLog->log('updated', 'tenant_users', null, [
            'role_id' => $tenantUser->pivot->role_id,
            'is_active' => $tenantUser->pivot->is_active,
        ], $validated, $tenantId, $request->user()?->id, $request);

        return response()->json(['message' => 'تم تحديث المستخدم']);
    }

    public function destroy(Request $request, int $userId): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $tenant = Tenant::findOrFail($tenantId);

        $tenantUser = $tenant->users()->where('user_id', $userId)->first();
        if (! $tenantUser) {
            return response()->json(['message' => 'المستخدم غير مرتبط بهذه الشركة'], 404);
        }

        $before = ['user_id' => $userId, 'email' => $tenantUser->email];
        $tenant->users()->detach($userId);

        $this->auditLog->log('deleted', 'tenant_users', null, $before, null, $tenantId, $request->user()?->id, $request);

        return response()->json(['message' => 'تم إلغاء ربط المستخدم بالشركة']);
    }
}
