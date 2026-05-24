<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Item;
use App\Models\PurchaseRequest;
use App\Services\InventoryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PurchaseRequestController extends Controller
{
    public function __construct(private InventoryService $inventoryService) {}

    public function index(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $fromDate = $request->from_date ?? $request->date_from;
        $toDate = $request->to_date ?? $request->date_to;
        if ($fromDate) {
            $fromDate = \Carbon\Carbon::parse($fromDate)->format('Y-m-d');
        }
        if ($toDate) {
            $toDate = \Carbon\Carbon::parse($toDate)->format('Y-m-d');
        }

        $query = PurchaseRequest::where('tenant_id', $tenantId)
            ->when($request->filled('branch_id'), fn ($q) => $q->where('branch_id', $request->branch_id))
            ->when($request->filled('warehouse_id'), fn ($q) => $q->where('warehouse_id', $request->warehouse_id))
            ->when($request->filled('vendor_id'), fn ($q) => $q->where('vendor_id', $request->vendor_id))
            ->when($fromDate, fn ($q) => $q->whereDate('date', '>=', $fromDate))
            ->when($toDate, fn ($q) => $q->whereDate('date', '<=', $toDate))
            ->when($request->filled('number'), fn ($q) => $q->where('number', 'like', '%'.$request->number.'%'));

        $pivot = $request->user()?->tenants()->where('tenants.id', $tenantId)->first()?->pivot;
        if ($pivot && $pivot->restrict_to_branch_warehouse && $pivot->default_branch_id) {
            $query->where('branch_id', $pivot->default_branch_id);
        }
        if ($pivot && $pivot->restrict_to_branch_warehouse && $pivot->default_warehouse_id) {
            $query->where('warehouse_id', $pivot->default_warehouse_id);
        }

        $list = $query
            ->with('vendor', 'branch', 'warehouse', 'createdBy')
            ->orderByDesc('date')
            ->orderByDesc('id')
            ->paginate($request->per_page ?? 20);

        return response()->json($list);
    }

    public function store(Request $request): JsonResponse
    {
        $this->normalizeOptionalIds($request);
        $validated = $this->validateRequest($request);

        $tenantId = (int) $request->tenant_id;
        $validated['tenant_id'] = $tenantId;
        $validated['created_by'] = $request->user()->id;

        $pivot = $request->user()?->tenants()->where('tenants.id', $tenantId)->first()?->pivot;
        if ($pivot && $pivot->restrict_to_branch_warehouse) {
            if ($pivot->default_branch_id) {
                $validated['branch_id'] = $pivot->default_branch_id;
            }
            if ($pivot->default_warehouse_id) {
                $validated['warehouse_id'] = $pivot->default_warehouse_id;
            }
        }

        $pr = $this->createOrUpdate(new PurchaseRequest, $validated);

        return response()->json($pr->load('lines.item', 'lines.unit', 'vendor', 'branch', 'warehouse'), 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $pr = PurchaseRequest::where('tenant_id', $request->tenant_id)
            ->with('lines.item.itemUnit', 'lines.unit', 'vendor', 'branch', 'warehouse', 'createdBy')
            ->findOrFail($id);

        return response()->json($pr);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $pr = PurchaseRequest::where('tenant_id', $request->tenant_id)->findOrFail($id);

        $this->normalizeOptionalIds($request);
        $validated = $this->validateRequest($request);

        $tenantId = (int) $request->tenant_id;
        $pivot = $request->user()?->tenants()->where('tenants.id', $tenantId)->first()?->pivot;
        if ($pivot && $pivot->restrict_to_branch_warehouse) {
            if ($pivot->default_branch_id) {
                $validated['branch_id'] = $pivot->default_branch_id;
            }
            if ($pivot->default_warehouse_id) {
                $validated['warehouse_id'] = $pivot->default_warehouse_id;
            }
        }

        $pr = $this->createOrUpdate($pr, $validated);

        return response()->json($pr->load('lines.item', 'lines.unit', 'vendor', 'branch', 'warehouse'));
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $pr = PurchaseRequest::where('tenant_id', $request->tenant_id)->findOrFail($id);
        $pr->lines()->delete();
        $pr->delete();

        return response()->json(['message' => 'تم الحذف']);
    }

    /**
     * إرجاع بيانات لإنشاء فاتورة مشتريات من طلب الشراء (مرجع = رقم الطلب).
     * المستند غير مرحل؛ التحويل ينشئ فاتورة مسودة فقط.
     */
    public function convertToInvoice(Request $request, int $id): JsonResponse
    {
        $pr = PurchaseRequest::where('tenant_id', $request->tenant_id)
            ->with('lines.item', 'lines.unit', 'vendor', 'branch', 'warehouse')
            ->findOrFail($id);

        $payload = [
            'type' => 'purchase',
            'is_return' => false,
            'vendor_id' => $pr->vendor_id,
            'branch_id' => $pr->branch_id,
            'warehouse_id' => $pr->warehouse_id,
            'date' => $pr->date->format('Y-m-d'),
            'due_date' => $pr->date->copy()->addDays(30)->format('Y-m-d'),
            'reference_number' => $pr->number,
            'notes' => $pr->notes,
            'discount_amount' => (float) $pr->discount_amount,
            'lines' => $pr->lines->map(function ($line) {
                return [
                    'item_id' => $line->item_id,
                    'unit_id' => $line->unit_id,
                    'description' => $line->description ?: ($line->item?->name ?? ''),
                    'quantity' => (float) $line->quantity,
                    'unit_price' => (float) $line->unit_price,
                    'discount_percent' => (float) $line->discount_percent,
                    'tax_percent' => (float) $line->tax_percent,
                ];
            })->toArray(),
        ];

        return response()->json([
            'message' => 'استخدم البيانات لإنشاء فاتورة مشتريات (مرجع: '.$pr->number.')',
            'invoice_payload' => $payload,
            'purchase_request_number' => $pr->number,
        ]);
    }

    /**
     * إنشاء طلب شراء تلقائي من تنبيهات النواقص (أصناف تحت حد الطلب).
     * يستخدم فرع/مخزن المستخدم عند التقييد.
     */
    public function fromShortage(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $warehouseId = $request->filled('warehouse_id') ? (int) $request->warehouse_id : null;
        $branchId = $request->filled('branch_id') ? (int) $request->branch_id : null;

        $pivot = $request->user()?->tenants()->where('tenants.id', $tenantId)->first()?->pivot;
        if ($pivot && $pivot->restrict_to_branch_warehouse) {
            if ($pivot->default_branch_id) {
                $branchId = (int) $pivot->default_branch_id;
            }
            if ($pivot->default_warehouse_id) {
                $warehouseId = (int) $pivot->default_warehouse_id;
            }
        }

        $alerts = $this->inventoryService->getLowStockAlerts($tenantId, $warehouseId);
        if (empty($alerts)) {
            return response()->json(['message' => 'لا توجد أصناف تحت حد الطلب في المخزن المحدد'], 422);
        }

        $lines = [];
        foreach ($alerts as $alert) {
            $item = Item::where('tenant_id', $tenantId)->find($alert['item_id']);
            if (! $item) {
                continue;
            }
            $qty = max((float) ($alert['shortage'] ?? 0), (float) ($alert['min_quantity'] ?? 1));
            if ($qty <= 0) {
                continue;
            }
            $lines[] = [
                'item_id' => $item->id,
                'unit_id' => $item->unit_id,
                'description' => $item->name ?? '',
                'quantity' => $qty,
                'unit_price' => (float) ($item->cost_price ?? 0),
                'discount_percent' => 0,
                'tax_percent' => 0,
            ];
        }

        if (empty($lines)) {
            return response()->json(['message' => 'لا توجد أصناف صالحة لطلب الشراء'], 422);
        }

        $data = [
            'tenant_id' => $tenantId,
            'date' => now()->format('Y-m-d'),
            'vendor_id' => null,
            'branch_id' => $branchId,
            'warehouse_id' => $warehouseId,
            'discount_amount' => 0,
            'notes' => 'طلب شراء تلقائي من تنبيهات النواقص',
            'created_by' => $request->user()->id,
            'lines' => $lines,
        ];

        $pr = $this->createOrUpdate(new PurchaseRequest, $data);

        return response()->json([
            'message' => 'تم إنشاء طلب الشراء '.$pr->number.' من تنبيهات النواقص',
            'purchase_request' => $pr->load('lines.item', 'lines.unit', 'vendor', 'branch', 'warehouse'),
        ], 201);
    }

    private function createOrUpdate(PurchaseRequest $pr, array $data): PurchaseRequest
    {
        $linesData = $data['lines'] ?? [];
        unset($data['lines']);

        $pr->fill($data);
        $pr->save();

        $pr->lines()->delete();
        foreach ($linesData as $i => $row) {
            $line = $pr->lines()->make([
                'item_id' => $row['item_id'] ?? null,
                'unit_id' => $row['unit_id'] ?? null,
                'description' => $row['description'] ?? '',
                'quantity' => $row['quantity'] ?? 1,
                'unit_price' => $row['unit_price'] ?? 0,
                'discount_percent' => $row['discount_percent'] ?? 0,
                'tax_percent' => $row['tax_percent'] ?? 0,
                'sort_order' => $i,
            ]);
            $line->calculateTotals();
            $line->save();
        }

        $pr->load('lines');
        $pr->recalculate();

        return $pr;
    }

    private function normalizeOptionalIds(Request $request): void
    {
        $optionalIds = ['vendor_id', 'branch_id', 'warehouse_id'];
        foreach ($optionalIds as $key) {
            if ($request->has($key)) {
                $v = $request->input($key);
                if ($v === '' || $v === 0 || $v === '0') {
                    $request->merge([$key => null]);
                }
            }
        }
        if ($request->has('lines') && is_array($request->lines)) {
            foreach ($request->lines as $i => $line) {
                if (isset($line['item_id']) && ($line['item_id'] === '' || $line['item_id'] === 0)) {
                    $request->lines[$i]['item_id'] = null;
                }
                if (isset($line['unit_id']) && ($line['unit_id'] === '' || $line['unit_id'] === 0)) {
                    $request->lines[$i]['unit_id'] = null;
                }
            }
        }
    }

    private function validateRequest(Request $request): array
    {
        return $request->validate([
            'date' => 'required|date',
            'vendor_id' => 'nullable|exists:vendors,id',
            'branch_id' => 'nullable|exists:branches,id',
            'warehouse_id' => 'nullable|exists:warehouses,id',
            'reference_number' => 'nullable|string|max:100',
            'discount_amount' => 'nullable|numeric|min:0',
            'notes' => 'nullable|string',
            'lines' => 'required|array|min:1',
            'lines.*.item_id' => 'nullable|exists:items,id',
            'lines.*.unit_id' => 'nullable|exists:item_units,id',
            'lines.*.description' => 'nullable|string',
            'lines.*.quantity' => 'required|numeric|min:0.0001',
            'lines.*.unit_price' => 'required|numeric|min:0',
            'lines.*.discount_percent' => 'nullable|numeric|min:0|max:100',
            'lines.*.tax_percent' => 'nullable|numeric|min:0|max:100',
        ]);
    }
}
