<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Promotion;
use App\Models\PromotionUsage;
use App\Services\PromotionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class PromotionController extends Controller
{
    public function __construct(private PromotionService $service) {}

    public function index(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $status = $request->query('status');

        $query = Promotion::where('tenant_id', $tenantId)
            ->with('createdBy:id,name')
            ->orderByDesc('priority')
            ->orderByDesc('id');

        if ($status && $status !== 'all') {
            $query->where('status', $status);
        }

        $promos = $query->get();

        $usageStats = PromotionUsage::where('tenant_id', $tenantId)
            ->select('promotion_id', DB::raw('SUM(discount_amount) as total_discount'), DB::raw('COUNT(*) as usage_count'))
            ->groupBy('promotion_id')
            ->get()
            ->keyBy('promotion_id');

        $today = now('Asia/Kuwait')->toDateString();
        $upcoming = $promos->filter(fn (Promotion $p) => $p->start_date && $p->start_date->toDateString() > $today)->count();
        $activeCount = $promos->where('status', 'active')->count();
        $totalDiscount = (float) PromotionUsage::where('tenant_id', $tenantId)->sum('discount_amount');
        $invoicesWithPromo = PromotionUsage::where('tenant_id', $tenantId)
            ->where('source_type', \App\Models\Invoice::class)
            ->distinct('source_id')
            ->count('source_id');

        $data = $promos->map(function (Promotion $p) use ($usageStats) {
            $stat = $usageStats->get($p->id);

            return array_merge($p->toArray(), [
                'total_discount_given' => round((float) ($stat->total_discount ?? 0), 3),
                'usage_count' => (int) ($stat->usage_count ?? 0),
            ]);
        });

        return response()->json([
            'data' => $data,
            'summary' => [
                'active_count' => $activeCount,
                'total_discount' => round($totalDiscount, 3),
                'invoices_count' => $invoicesWithPromo,
                'upcoming_count' => $upcoming,
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $this->validatePromotion($request);
        $validated['tenant_id'] = $request->tenant_id;
        $validated['created_by'] = $request->user()->id;
        $validated['current_uses'] = 0;
        $validated['channels'] = $validated['channels'] ?? ['invoice', 'pos'];

        $promo = Promotion::create($validated);

        return response()->json(['data' => $promo->load('createdBy:id,name')], 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $promo = Promotion::where('tenant_id', $request->tenant_id)->findOrFail($id);

        return response()->json(['data' => $promo->load('createdBy:id,name')]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $promo = Promotion::where('tenant_id', $request->tenant_id)->findOrFail($id);
        $validated = $this->validatePromotion($request, $promo->id);
        $promo->update($validated);

        return response()->json(['data' => $promo->fresh()->load('createdBy:id,name')]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $promo = Promotion::where('tenant_id', $request->tenant_id)->findOrFail($id);
        $promo->delete();

        return response()->json(['message' => 'تم حذف العرض بنجاح']);
    }

    public function toggle(Request $request, int $id): JsonResponse
    {
        $promo = Promotion::where('tenant_id', $request->tenant_id)->findOrFail($id);
        $promo->status = $promo->status === 'active' ? 'inactive' : 'active';
        $promo->save();

        return response()->json(['data' => $promo]);
    }

    public function calculate(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'channel' => 'required|in:invoice,pos,restaurant,delivery',
            'order_total' => 'required|numeric|min:0',
            'customer_id' => 'nullable|exists:customers,id',
            'item_ids' => 'nullable|array',
            'item_ids.*' => 'integer',
            'items' => 'nullable|array',
            'items.*.item_id' => 'nullable|integer',
            'items.*.quantity' => 'nullable|numeric|min:0',
            'items.*.unit_price' => 'nullable|numeric|min:0',
        ]);

        $tenantId = (int) $request->tenant_id;
        $itemIds = $validated['item_ids'] ?? [];
        $items = $validated['items'] ?? [];

        $eligible = $this->service->getEligiblePromotions(
            $tenantId,
            $validated['channel'],
            (float) $validated['order_total'],
            isset($validated['customer_id']) ? (int) $validated['customer_id'] : null,
            array_map('intval', $itemIds),
        );

        $results = $eligible->map(fn (Promotion $p) => $this->service->calculateDiscount(
            $p,
            (float) $validated['order_total'],
            $items
        ))->values();

        return response()->json(['data' => $results]);
    }

    public function report(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $from = $request->query('from');
        $to = $request->query('to');

        $query = PromotionUsage::where('tenant_id', $tenantId)
            ->with(['promotion:id,name,type', 'customer:id,name', 'usedByUser:id,name']);

        if ($from) {
            $query->whereDate('used_at', '>=', $from);
        }
        if ($to) {
            $query->whereDate('used_at', '<=', $to);
        }

        $usages = $query->orderByDesc('used_at')->limit(500)->get();

        $byPromotion = PromotionUsage::where('tenant_id', $tenantId)
            ->when($from, fn ($q) => $q->whereDate('used_at', '>=', $from))
            ->when($to, fn ($q) => $q->whereDate('used_at', '<=', $to))
            ->select('promotion_id', DB::raw('COUNT(*) as uses'), DB::raw('SUM(discount_amount) as discount'))
            ->groupBy('promotion_id')
            ->get();

        $promoNames = Promotion::where('tenant_id', $tenantId)
            ->whereIn('id', $byPromotion->pluck('promotion_id'))
            ->pluck('name', 'id');

        return response()->json([
            'data' => $usages,
            'by_promotion' => $byPromotion->map(fn ($row) => [
                'promotion_id' => $row->promotion_id,
                'promotion_name' => $promoNames[$row->promotion_id] ?? '—',
                'uses' => (int) $row->uses,
                'discount' => round((float) $row->discount, 3),
            ]),
            'totals' => [
                'uses' => $usages->count(),
                'discount' => round((float) $usages->sum('discount_amount'), 3),
            ],
        ]);
    }

    private function validatePromotion(Request $request, ?int $ignoreId = null): array
    {
        $tenantId = (int) $request->tenant_id;

        return $request->validate([
            'name' => 'required|string|max:255',
            'code' => [
                'nullable',
                'string',
                'max:64',
                Rule::unique('promotions', 'code')
                    ->where(fn ($q) => $q->where('tenant_id', $tenantId))
                    ->ignore($ignoreId),
            ],
            'description' => 'nullable|string|max:5000',
            'type' => 'required|in:percentage,fixed,bogo,min_purchase',
            'value' => 'required|numeric|min:0',
            'min_purchase_amount' => 'nullable|numeric|min:0',
            'max_discount_amount' => 'nullable|numeric|min:0',
            'buy_quantity' => 'nullable|integer|min:1',
            'get_quantity' => 'nullable|integer|min:1',
            'get_discount_percent' => 'nullable|numeric|min:0|max:100',
            'channels' => 'nullable|array',
            'channels.*' => 'in:invoice,pos,restaurant,delivery',
            'customer_tiers' => 'nullable|array',
            'customer_tiers.*' => 'string|max:120',
            'customer_ids' => 'nullable|array',
            'customer_ids.*' => ['integer', Rule::exists('customers', 'id')->where('tenant_id', $tenantId)],
            'item_ids' => 'nullable|array',
            'item_ids.*' => ['integer', Rule::exists('items', 'id')->where('tenant_id', $tenantId)],
            'category_ids' => 'nullable|array',
            'category_ids.*' => ['integer', Rule::exists('item_categories', 'id')->where('tenant_id', $tenantId)],
            'max_uses' => 'nullable|integer|min:1',
            'max_uses_per_day' => 'nullable|integer|min:1',
            'max_uses_per_customer' => 'nullable|integer|min:1',
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date|after_or_equal:start_date',
            'active_days' => 'nullable|array',
            'active_days.*' => 'integer|min:0|max:6',
            'active_from' => 'nullable|date_format:H:i',
            'active_to' => 'nullable|date_format:H:i',
            'status' => 'nullable|in:active,inactive,draft',
            'is_combinable' => 'nullable|boolean',
            'priority' => 'nullable|integer|min:0|max:9999',
        ]);
    }
}
