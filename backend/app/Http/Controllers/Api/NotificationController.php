<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Notification;
use App\Models\Role;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    /** خريطة نوع الإشعار → صلاحية مطلوبة لعرضه */
    private const TYPE_PERMISSION_MAP = [
        Notification::TYPE_STOCK_LOW => 'inventory.view',
        Notification::TYPE_INSTALLMENT_DUE_TODAY => 'payments.view',
        Notification::TYPE_INSTALLMENT_OVERDUE => 'payments.view',
        Notification::TYPE_EXPIRY_SOON => 'invoices.view',
        Notification::TYPE_KITCHEN_READY => 'pos.sell',
    ];

    /**
     * قائمة الإشعارات للمستخدم الحالي (حسب صلاحياته)، من الأحدث للأقدم.
     */
    public function index(Request $request): JsonResponse
    {
        $tenantId = (int) $request->attributes->get('tenant_id');
        $user = $request->user();
        $allowedTypes = $this->getAllowedTypesForUser($request);

        $query = Notification::forTenant($tenantId)
            ->where(function ($q) use ($user) {
                $q->whereNull('user_id')->orWhere('user_id', $user->id);
            })
            ->orderByDesc('created_at');

        if ($allowedTypes !== true) {
            $query->whereIn('type', $allowedTypes);
        }

        $perPage = min((int) ($request->input('per_page', 20)), 50);
        $notifications = $query->paginate($perPage);

        $items = $notifications->getCollection()->map(fn ($n) => $this->formatNotification($n, $request));

        return response()->json([
            'data' => $items,
            'meta' => [
                'current_page' => $notifications->currentPage(),
                'last_page' => $notifications->lastPage(),
                'per_page' => $notifications->perPage(),
                'total' => $notifications->total(),
            ],
        ]);
    }

    /**
     * عدد الإشعارات غير المقروءة (للعرض في الـ Badge).
     */
    public function unreadCount(Request $request): JsonResponse
    {
        $tenantId = (int) $request->attributes->get('tenant_id');
        $user = $request->user();
        $allowedTypes = $this->getAllowedTypesForUser($request);

        $query = Notification::forTenant($tenantId)
            ->unread()
            ->where(function ($q) use ($user) {
                $q->whereNull('user_id')->orWhere('user_id', $user->id);
            });

        if ($allowedTypes !== true) {
            $query->whereIn('type', $allowedTypes);
        }

        return response()->json(['count' => $query->count()]);
    }

    public function markAsRead(Request $request, int $id): JsonResponse
    {
        $tenantId = (int) $request->attributes->get('tenant_id');
        $notification = Notification::forTenant($tenantId)->findOrFail($id);
        $notification->update(['read_at' => now()]);

        return response()->json($this->formatNotification($notification->fresh(), $request));
    }

    public function markAllAsRead(Request $request): JsonResponse
    {
        $tenantId = (int) $request->attributes->get('tenant_id');
        $user = $request->user();
        $allowedTypes = $this->getAllowedTypesForUser($request);

        $query = Notification::forTenant($tenantId)
            ->unread()
            ->where(function ($q) use ($user) {
                $q->whereNull('user_id')->orWhere('user_id', $user->id);
            });

        if ($allowedTypes !== true) {
            $query->whereIn('type', $allowedTypes);
        }

        $query->update(['read_at' => now()]);

        return response()->json(['message' => 'ok']);
    }

    /**
     * @return true (كل الأنواع) أو list<string>
     */
    private function getAllowedTypesForUser(Request $request): array|bool
    {
        $user = $request->user();
        if ($user->isSuperAdmin()) {
            return true;
        }

        $tenantId = (int) $request->attributes->get('tenant_id');
        $tenantUser = $user->tenants()->where('tenants.id', $tenantId)->first();
        if (! $tenantUser) {
            return [];
        }

        $permissions = $this->resolvePermissions($tenantUser, $tenantId);
        $allowed = [];
        foreach (self::TYPE_PERMISSION_MAP as $type => $perm) {
            if (in_array('*', $permissions) || in_array($perm, $permissions)) {
                $allowed[] = $type;
            }
        }

        return $allowed;
    }

    private function resolvePermissions($tenantUser, int $tenantId): array
    {
        $pivot = $tenantUser->pivot;
        $roleId = $pivot->role_id ?? null;
        $permissions = [];
        if ($roleId) {
            $role = Role::where('id', $roleId)
                ->where(fn ($q) => $q->where('tenant_id', $tenantId)->orWhereNull('tenant_id'))
                ->with('permissions')
                ->first();
            if ($role) {
                $keys = $role->permissions->pluck('key')->toArray();
                $permissions = in_array('*', $keys) ? ['*'] : $keys;
            }
        }
        $custom = $pivot->permissions ?? [];
        $custom = is_array($custom) ? $custom : [];

        return array_values(array_unique(array_merge($permissions, $custom)));
    }

    private function formatNotification(Notification $n, Request $request): array
    {
        $lang = $request->header('Accept-Language', 'ar');
        $useAr = str_contains($lang, 'ar');

        return [
            'id' => $n->id,
            'type' => $n->type,
            'title' => $useAr ? $n->title_ar : ($n->title_en ?? $n->title_ar),
            'body' => $useAr ? $n->body_ar : ($n->body_en ?? $n->body_ar),
            'link_path' => $n->link_path,
            'link_params' => $n->link_params,
            'severity' => $n->severity,
            'read_at' => $n->read_at?->toIso8601String(),
            'created_at' => $n->created_at->toIso8601String(),
        ];
    }
}
