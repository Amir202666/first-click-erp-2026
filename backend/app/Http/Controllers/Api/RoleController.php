<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class RoleController extends Controller
{
    public function __construct(private AuditLogService $auditLog) {}

    public function index(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $roles = Role::where(function ($q) use ($tenantId) {
            $q->where('tenant_id', $tenantId)->orWhereNull('tenant_id');
        })
            ->with('permissions:id,key,name_ar,name_en')
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        $data = $roles->map(fn ($r) => [
            'id' => $r->id,
            'tenant_id' => $r->tenant_id,
            'name' => $r->name,
            'slug' => $r->slug,
            'description' => $r->description,
            'is_system' => (bool) $r->is_system,
            'permissions' => $r->permissions->pluck('key')->toArray(),
            'pricing_group_ids' => is_array($r->pricing_group_ids) ? $r->pricing_group_ids : [],
        ]);

        return response()->json(['data' => $data]);
    }

    public function store(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'slug' => 'nullable|string|max:100',
            'description' => 'nullable|string|max:500',
            'permission_ids' => 'nullable|array',
            'permission_ids.*' => 'exists:permissions,id',
            'pricing_group_ids' => 'nullable|array',
            'pricing_group_ids.*' => 'integer|exists:pricing_groups,id',
        ]);

        $slug = $validated['slug'] ?? Str::slug($validated['name']);
        $slug = preg_replace('/[^a-z0-9_]/', '_', $slug) ?: 'role_'.time();

        $exists = Role::where('tenant_id', $tenantId)->where('slug', $slug)->exists();
        if ($exists) {
            return response()->json(['message' => 'دور بنفس الاسم أو الرمز موجود مسبقاً'], 422);
        }

        $role = Role::create([
            'tenant_id' => $tenantId,
            'name' => $validated['name'],
            'slug' => $slug,
            'description' => $validated['description'] ?? null,
            'pricing_group_ids' => $validated['pricing_group_ids'] ?? [],
            'is_system' => false,
            'sort_order' => 100,
        ]);

        $permissionIds = $validated['permission_ids'] ?? [];
        $role->permissions()->sync($permissionIds);

        $this->auditLog->log('created', 'roles', $role, null, $role->toArray(), $tenantId, $request->user()?->id, $request);

        return response()->json([
            'message' => 'تم إنشاء الدور',
            'role' => [
                'id' => $role->id,
                'name' => $role->name,
                'slug' => $role->slug,
                'permissions' => $role->permissions()->pluck('key')->toArray(),
            ],
        ], 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $role = Role::where(function ($q) use ($tenantId) {
            $q->where('tenant_id', $tenantId)->orWhereNull('tenant_id');
        })->with('permissions')->findOrFail($id);

        return response()->json([
            'id' => $role->id,
            'tenant_id' => $role->tenant_id,
            'name' => $role->name,
            'slug' => $role->slug,
            'description' => $role->description,
            'is_system' => (bool) $role->is_system,
            'permissions' => $role->permissions->pluck('key')->toArray(),
        ]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $role = Role::where('tenant_id', $tenantId)->findOrFail($id);

        if ($role->is_system) {
            return response()->json(['message' => 'لا يمكن تعديل دور النظام الافتراضي'], 422);
        }

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'description' => 'nullable|string|max:500',
            'permission_ids' => 'nullable|array',
            'permission_ids.*' => 'exists:permissions,id',
            'pricing_group_ids' => 'nullable|array',
            'pricing_group_ids.*' => 'integer|exists:pricing_groups,id',
        ]);

        $old = $role->toArray();
        if (isset($validated['name'])) {
            $role->name = $validated['name'];
        }
        if (array_key_exists('description', $validated)) {
            $role->description = $validated['description'];
        }
        if (array_key_exists('pricing_group_ids', $validated)) {
            $role->pricing_group_ids = $validated['pricing_group_ids'] ?? [];
        }
        $role->save();

        if (isset($validated['permission_ids'])) {
            $role->permissions()->sync($validated['permission_ids']);
        }

        $this->auditLog->log('updated', 'roles', $role, $old, $role->fresh()->toArray(), $tenantId, $request->user()?->id, $request);

        return response()->json(['message' => 'تم تحديث الدور']);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $role = Role::where('tenant_id', $tenantId)->findOrFail($id);

        if ($role->is_system) {
            return response()->json(['message' => 'لا يمكن حذف دور النظام الافتراضي'], 422);
        }

        $inUse = \Illuminate\Support\Facades\DB::table('tenant_users')->where('role_id', $id)->exists();
        if ($inUse) {
            return response()->json(['message' => 'الدور مستخدم ولا يمكن حذفه'], 422);
        }

        $role->permissions()->detach();
        $before = $role->toArray();
        $role->delete();

        $this->auditLog->log('deleted', 'roles', null, $before, null, $tenantId, $request->user()?->id, $request);

        return response()->json(['message' => 'تم حذف الدور']);
    }
}
