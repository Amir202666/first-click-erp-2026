<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Subscription;
use App\Models\SubscriptionPlan;
use App\Models\Tenant;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

/**
 * لوحة إدارة الاشتراكات (للمشرف العام فقط).
 */
class AdminSubscriptionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $perPage = (int) $request->get('per_page', 25);
        $perPage = in_array($perPage, [10, 25, 50, 100, 500]) ? $perPage : 25;
        $statusFilter = $request->get('status'); // active, expired, trial
        $planId = $request->get('plan_id');
        $search = $request->get('search');
        $today = Carbon::today()->format('Y-m-d');

        $query = Tenant::query()
            ->with(['subscriptions' => fn ($q) => $q->orderByDesc('ends_at')->limit(1)->with('plan')])
            ->orderBy('name');

        if ($search && is_string($search) && trim($search) !== '') {
            $term = '%'.trim($search).'%';
            $query->where(function ($q) use ($term) {
                $q->where('slug', 'like', $term)->orWhere('name', 'like', $term);
            });
        }

        if ($statusFilter === 'active') {
            $query->whereHas('subscriptions', fn ($q) => $q->where('status', 'active')->where('ends_at', '>=', $today));
        } elseif ($statusFilter === 'expired') {
            $query->where(function ($q) use ($today) {
                $q->whereDoesntHave('subscriptions')
                    ->orWhereHas('subscriptions', fn ($s) => $s->where('ends_at', '<', $today)->orWhere('status', 'expired'));
            });
        } elseif ($statusFilter === 'trial') {
            $query->whereHas('subscriptions', fn ($q) => $q->whereHas('plan', fn ($p) => $p->where('slug', 'trial')));
        }

        if ($planId && is_numeric($planId)) {
            $query->whereHas('subscriptions', fn ($q) => $q->where('subscription_plan_id', (int) $planId));
        }

        $tenants = $query->paginate($perPage);

        $items = collect($tenants->items())->map(function (Tenant $tenant) use ($today) {
            $sub = $tenant->subscriptions->first();
            $endsAt = $sub?->ends_at ? $sub->ends_at->format('Y-m-d') : null;
            $startsAt = $sub?->starts_at ? $sub->starts_at->format('Y-m-d') : null;
            $isExpired = ! $endsAt || $endsAt < $today;
            $displayStatus = 'expired';
            if ($sub) {
                if ($isExpired) {
                    $displayStatus = 'expired';
                } elseif ($sub->plan?->slug === 'trial' || $sub->status === 'trial') {
                    $displayStatus = 'trial';
                } else {
                    $displayStatus = $sub->status ?? 'active';
                }
            }
            $contacts = is_array($tenant->contacts) ? $tenant->contacts : [];
            $managerName = isset($contacts[0]['name']) ? $contacts[0]['name'] : null;

            return [
                'id' => $tenant->id,
                'name' => $tenant->name,
                'slug' => $tenant->slug,
                'is_active' => (bool) $tenant->is_active,
                'plan_name' => $sub?->plan?->name ?? '—',
                'plan_slug' => $sub?->plan?->slug,
                'subscription_plan_id' => $sub?->subscription_plan_id,
                'subscription_starts_at' => $startsAt,
                'subscription_ends_at' => $endsAt,
                'subscription_status' => $displayStatus,
                'manager_username' => $tenant->email,
                'manager_name' => $managerName,
                'company_email' => $tenant->email,
                'total_sales' => null,
                'last_seen_at' => null,
            ];
        });

        $summary = $this->computeSubscriptionsSummary($request);

        return response()->json([
            'data' => $items,
            'current_page' => $tenants->currentPage(),
            'last_page' => $tenants->lastPage(),
            'per_page' => $tenants->perPage(),
            'total' => $tenants->total(),
            'summary' => $summary,
        ]);
    }

    public function update(Request $request, int $tenantId): JsonResponse
    {
        $request->validate([
            'company_slug' => 'nullable|string|max:100|regex:/^[a-zA-Z0-9_-]+$/',
            'manager_name' => 'nullable|string|max:255',
            'subscription_plan_id' => 'nullable|exists:subscription_plans,id',
            'subscription_starts_at' => 'nullable|date',
            'subscription_ends_at' => 'required|date',
        ], [
            'company_slug.regex' => 'معرف الشركة المختصر: أحرف إنجليزية وأرقام وشرطة فقط.',
        ]);

        $tenant = Tenant::find($tenantId);
        if (! $tenant) {
            return response()->json(['message' => 'الشركة غير موجودة.'], 404);
        }

        if ($request->filled('company_slug')) {
            $slug = strtolower(trim($request->company_slug));
            $existing = Tenant::where('slug', $slug)->where('id', '!=', $tenantId)->first();
            if ($existing) {
                return response()->json(['message' => 'معرف الشركة المختصر مستخدم مسبقاً.'], 422);
            }
            $tenant->slug = $slug;
            $tenant->save();
        }

        if (array_key_exists('manager_name', $request->all())) {
            $tenant->contacts = $request->manager_name ? [['name' => $request->manager_name, 'role' => 'مدير']] : null;
            $tenant->save();
        }

        $endsAt = Carbon::parse($request->subscription_ends_at)->endOfDay();
        $planId = $request->subscription_plan_id;
        $startsAt = $request->filled('subscription_starts_at') ? Carbon::parse($request->subscription_starts_at)->startOfDay() : null;

        $sub = $tenant->subscriptions()->where('status', 'active')->latest('ends_at')->first()
            ?? $tenant->subscriptions()->latest('ends_at')->first();

        if ($sub) {
            $sub->ends_at = $endsAt;
            if ($planId) {
                $sub->subscription_plan_id = $planId;
            }
            if ($startsAt) {
                $sub->starts_at = $startsAt;
            }
            $sub->status = $endsAt->isPast() ? 'expired' : 'active';
            $sub->save();
        } else {
            $planId = $planId ?? SubscriptionPlan::where('is_active', true)->orderBy('sort_order')->value('id');
            if (! $planId) {
                return response()->json(['message' => 'لا توجد باقة نشطة. أضف باقة من جدول subscription_plans أولاً.'], 422);
            }
            Subscription::create([
                'tenant_id' => $tenant->id,
                'subscription_plan_id' => $planId,
                'starts_at' => $startsAt ?? now(),
                'ends_at' => $endsAt,
                'status' => $endsAt->isPast() ? 'expired' : 'active',
            ]);
        }

        return response()->json(['message' => 'تم تحديث الاشتراك بنجاح.']);
    }

    /** إحصائيات الاشتراكات للكروت التحليلية */
    private function computeSubscriptionsSummary(Request $request): array
    {
        $today = Carbon::today()->format('Y-m-d');

        $activeCount = Tenant::query()
            ->whereHas('subscriptions', fn ($q) => $q->where('status', 'active')->where('ends_at', '>=', $today))
            ->count();

        $delinquentCount = Tenant::query()
            ->where(function ($q) use ($today) {
                $q->whereDoesntHave('subscriptions')
                    ->orWhereHas('subscriptions', fn ($s) => $s->where('ends_at', '<', $today)->orWhere('status', 'expired'));
            })
            ->count();

        $newTodayCount = Tenant::query()
            ->whereHas('subscriptions', fn ($q) => $q->whereDate('starts_at', $today))
            ->count();

        $expectedCollection = 0;

        return [
            'active_count' => $activeCount,
            'expected_collection_this_month' => $expectedCollection,
            'delinquent_count' => $delinquentCount,
            'new_today_count' => $newTodayCount,
        ];
    }

    /** قائمة الباقات (للمشرف عند التعديل أو الفلترة) */
    public function plans(Request $request): JsonResponse
    {
        $plans = SubscriptionPlan::where('is_active', true)->orderBy('sort_order')->get(['id', 'name', 'slug']);

        return response()->json(['data' => $plans]);
    }

    /** إضافة شركة جديدة مع اشتراك — معرف الشركة + اسم مستخدم المدير + كلمة المرور (يدوي) */
    public function storeTenant(Request $request): JsonResponse
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'company_slug' => 'required|string|max:100|regex:/^[a-zA-Z0-9_-]+$/',
            'manager_username' => 'required|string|max:255|unique:users,email',
            'manager_password' => 'required|string|min:8',
            'default_currency' => 'nullable|string|size:3',
            'manager_name' => 'nullable|string|max:255',
            'subscription_plan_id' => 'required|exists:subscription_plans,id',
            'subscription_starts_at' => 'required|date',
        ], [
            'company_slug.regex' => 'معرف الشركة المختصر: أحرف إنجليزية وأرقام وشرطة سفلية أو وسطى فقط.',
            'manager_username.unique' => 'اسم المستخدم مستخدم مسبقاً في النظام.',
        ]);

        $slug = strtolower(trim($request->company_slug));
        $existing = Tenant::where('slug', $slug)->first();
        if ($existing) {
            return response()->json(['message' => 'معرف الشركة المختصر مستخدم مسبقاً.'], 422);
        }

        $plan = SubscriptionPlan::findOrFail($request->subscription_plan_id);
        $durationDays = $plan->duration_days;
        $startsAt = Carbon::parse($request->subscription_starts_at)->startOfDay();
        $endsAt = $startsAt->copy()->addDays($durationDays);

        $tenant = Tenant::create([
            'name' => $request->name,
            'slug' => $slug,
            'email' => $request->manager_username,
            'default_currency' => $request->default_currency ?? 'SAR',
            'is_active' => true,
            'contacts' => $request->manager_name ? [['name' => $request->manager_name, 'role' => 'مدير']] : null,
        ]);

        $user = User::create([
            'name' => $request->manager_name ?: $request->manager_username,
            'email' => $request->manager_username,
            'password' => Hash::make($request->manager_password),
        ]);

        $tenant->users()->attach($user->id, ['role' => 'admin', 'is_active' => true]);

        Subscription::create([
            'tenant_id' => $tenant->id,
            'subscription_plan_id' => $plan->id,
            'starts_at' => $startsAt,
            'ends_at' => $endsAt,
            'status' => $endsAt->isPast() ? 'expired' : 'active',
        ]);

        return response()->json(['message' => 'تم إنشاء الشركة والاشتراك ومدير الدخول بنجاح.', 'tenant_id' => $tenant->id], 201);
    }

    /** تعطيل أو تفعيل حساب الشركة */
    public function toggleTenantActive(Request $request, int $tenantId): JsonResponse
    {
        $tenant = Tenant::find($tenantId);
        if (! $tenant) {
            return response()->json(['message' => 'الشركة غير موجودة.'], 404);
        }

        $tenant->is_active = ! $tenant->is_active;
        $tenant->save();

        return response()->json([
            'message' => $tenant->is_active ? 'تم تفعيل حساب الشركة.' : 'تم تعطيل حساب الشركة.',
            'is_active' => $tenant->is_active,
        ]);
    }
}
