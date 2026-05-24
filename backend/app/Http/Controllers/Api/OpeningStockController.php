<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\OpeningStockHeader;
use App\Services\OpeningStockService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class OpeningStockController extends Controller
{
    public function __construct(
        private OpeningStockService $openingStockService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $list = OpeningStockHeader::where('tenant_id', $request->tenant_id)
            ->when($request->branch_id, fn ($q, $v) => $q->where('branch_id', $v))
            ->when($request->warehouse_id, fn ($q, $v) => $q->where('warehouse_id', $v))
            ->when($request->status, fn ($q, $v) => $q->where('status', $v))
            ->with('branch', 'warehouse', 'createdBy', 'items.item', 'journalEntry')
            ->orderByDesc('date')
            ->orderByDesc('id')
            ->paginate($request->per_page ?? 20);

        return response()->json($list);
    }

    public function store(Request $request): JsonResponse
    {
        try {
            $this->validateNoInvoicesAfterOpening($request->tenant_id);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $validated = $request->validate([
            'branch_id' => 'required|exists:branches,id',
            'warehouse_id' => 'required|exists:warehouses,id',
            'date' => 'required|date',
            'reference_number' => 'nullable|string|max:100',
            'notes' => 'nullable|string',
            'items' => 'required|array|min:1',
            'items.*.item_id' => 'required|exists:items,id',
            'items.*.quantity' => 'required|numeric|min:0.0001',
            'items.*.unit_cost' => 'required|numeric|min:0',
            'items.*.cost_center_id' => 'nullable|exists:cost_centers,id',
        ]);

        $itemIds = collect($validated['items'])->pluck('item_id');
        if ($itemIds->duplicates()->isNotEmpty()) {
            return response()->json(['message' => 'لا يسمح بتكرار نفس الصنف داخل نفس العملية.'], 422);
        }

        $transactionDate = $validated['date'];
        if (is_string($transactionDate) && preg_match('/^\d{4}-\d{2}-\d{2}/', $transactionDate)) {
            $transactionDate = substr($transactionDate, 0, 10);
        } else {
            $transactionDate = \Carbon\Carbon::parse($transactionDate)->format('Y-m-d');
        }
        $selectedStoreId = (int) $validated['warehouse_id'];

        $header = \Illuminate\Support\Facades\DB::transaction(function () use ($request, $validated, $transactionDate, $selectedStoreId) {
            $header = OpeningStockHeader::create([
                'tenant_id' => $request->tenant_id,
                'branch_id' => $validated['branch_id'],
                'warehouse_id' => $selectedStoreId,
                'date' => $transactionDate,
                'reference_number' => $validated['reference_number'] ?? null,
                'notes' => $validated['notes'] ?? null,
                'status' => 'draft',
                'created_by' => $request->user()->id,
            ]);

            foreach ($validated['items'] as $idx => $row) {
                $qty = (float) $row['quantity'];
                $unitCost = (float) $row['unit_cost'];
                $header->items()->create([
                    'item_id' => $row['item_id'],
                    'quantity' => $qty,
                    'unit_cost' => $unitCost,
                    'total_cost' => $qty * $unitCost,
                    'cost_center_id' => $row['cost_center_id'] ?? null,
                ]);
            }

            return $header->load('items.item', 'branch', 'warehouse', 'createdBy');
        });

        return response()->json($header, 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $header = OpeningStockHeader::where('tenant_id', $request->tenant_id)
            ->with('items.item.itemUnit', 'items.costCenter', 'branch', 'warehouse', 'createdBy', 'approvedBy', 'journalEntry.lines.account')
            ->findOrFail($id);

        return response()->json($header);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $payload = [];
        $rawBody = $request->getContent();
        if (is_string($rawBody) && $rawBody !== '') {
            $decoded = json_decode($rawBody, true);
            if (is_array($decoded)) {
                $payload = $decoded;
            }
        }
        if (empty($payload) || ! isset($payload['items'])) {
            $payload = $request->json()->all();
            if (! is_array($payload)) {
                $payload = $request->all();
            }
        }

        $header = OpeningStockHeader::where('tenant_id', $request->tenant_id)->findOrFail($id);

        if (! $header->isDraft()) {
            return response()->json(['message' => 'لا يمكن تعديل عملية معتمدة.'], 422);
        }

        $rules = [
            'branch_id' => 'nullable|exists:branches,id',
            'warehouse_id' => 'required|exists:warehouses,id',
            'date' => 'required|date',
            'reference_number' => 'nullable|string|max:100',
            'notes' => 'nullable|string',
            'items' => 'required|array|min:1',
            'items.*.item_id' => 'required|exists:items,id',
            'items.*.quantity' => 'required|numeric|min:0.0001',
            'items.*.unit_cost' => 'required|numeric|min:0',
            'items.*.cost_center_id' => 'nullable|exists:cost_centers,id',
        ];
        $validated = Validator::make($payload, $rules)->validate();

        $itemIds = collect($validated['items'])->pluck('item_id');
        if ($itemIds->duplicates()->isNotEmpty()) {
            return response()->json(['message' => 'لا يسمح بتكرار نفس الصنف داخل نفس العملية.'], 422);
        }

        $selectedStoreId = null;
        if ($request->filled('warehouse_id')) {
            $selectedStoreId = (int) $request->input('warehouse_id');
        }
        if (! $selectedStoreId && isset($payload['warehouse_id']) && $payload['warehouse_id'] !== '' && $payload['warehouse_id'] !== null) {
            $selectedStoreId = (int) $payload['warehouse_id'];
        }
        if (! $selectedStoreId) {
            return response()->json(['message' => 'يجب اختيار المخزن.'], 422);
        }

        $rawDate = $request->input('date');
        if (! $rawDate || (is_string($rawDate) && trim($rawDate) === '')) {
            $rawDate = $payload['date'] ?? null;
        }
        if (! $rawDate || (is_string($rawDate) && trim($rawDate) === '')) {
            return response()->json(['message' => 'يجب تحديد التاريخ.'], 422);
        }
        $selectedDate = is_string($rawDate) && preg_match('/^\d{4}-\d{2}-\d{2}/', $rawDate)
            ? substr($rawDate, 0, 10)
            : \Carbon\Carbon::parse($rawDate)->format('Y-m-d');

        \Illuminate\Support\Facades\DB::transaction(function () use ($header, $validated, $selectedStoreId, $selectedDate) {
            $header->items()->delete();
            foreach ($validated['items'] as $row) {
                $qty = (float) $row['quantity'];
                $unitCost = (float) $row['unit_cost'];
                $header->items()->create([
                    'item_id' => $row['item_id'],
                    'quantity' => $qty,
                    'unit_cost' => $unitCost,
                    'total_cost' => $qty * $unitCost,
                    'cost_center_id' => $row['cost_center_id'] ?? null,
                ]);
            }

            \Illuminate\Support\Facades\DB::table('opening_stock_headers')
                ->where('id', $header->id)
                ->update([
                    'branch_id' => $validated['branch_id'] ?? $header->branch_id,
                    'warehouse_id' => $selectedStoreId,
                    'date' => $selectedDate,
                    'reference_number' => $validated['reference_number'] ?? $header->reference_number,
                    'notes' => $validated['notes'] ?? $header->notes,
                ]);
        });

        $saved = $header->fresh(['items.item', 'branch', 'warehouse']);
        $warehouseName = $saved->warehouse ? $saved->warehouse->name : '';

        return response()->json([
            'opening_stock' => $saved,
            'message' => 'تم الحفظ بنجاح في مخزن: '.$warehouseName.' بتاريخ: '.\Carbon\Carbon::parse($selectedDate)->format('d/m/Y'),
            'saved_warehouse_id' => $selectedStoreId,
            'saved_date' => $selectedDate,
        ]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $header = OpeningStockHeader::where('tenant_id', $request->tenant_id)->findOrFail($id);

        if (! $header->isDraft()) {
            return response()->json(['message' => 'لا يمكن حذف عملية معتمدة.'], 422);
        }

        \Illuminate\Support\Facades\DB::transaction(function () use ($header) {
            $header->items()->delete();
            $header->delete();
        });

        return response()->json(['message' => 'تم الحذف بنجاح']);
    }

    public function approve(Request $request, int $id): JsonResponse
    {
        $header = OpeningStockHeader::where('tenant_id', $request->tenant_id)
            ->with('items.item')
            ->findOrFail($id);

        $tenantUser = $request->user()->tenants()->where('tenants.id', $request->tenant_id)->first();
        if (! $tenantUser || $tenantUser->pivot->role !== 'admin') {
            return response()->json(['message' => 'فقط المدير يمكنه اعتماد رصيد أول المدة.'], 403);
        }

        try {
            $header = $this->openingStockService->approve($header);

            return response()->json(['message' => 'تم اعتماد رصيد أول المدة بنجاح.', 'opening_stock' => $header]);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function unpost(Request $request, int $id): JsonResponse
    {
        $header = OpeningStockHeader::where('tenant_id', $request->tenant_id)->findOrFail($id);

        $tenantUser = $request->user()->tenants()->where('tenants.id', $request->tenant_id)->first();
        if (! $tenantUser || $tenantUser->pivot->role !== 'admin') {
            return response()->json(['message' => 'فقط المدير يمكنه إلغاء ترحيل رصيد أول المدة.'], 403);
        }

        try {
            $header = $this->openingStockService->unpost($header);

            return response()->json(['message' => 'تم إلغاء الترحيل. يمكنك الآن تعديل أو حذف رصيد أول المدة.', 'opening_stock' => $header]);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    private function validateNoInvoicesAfterOpening(int $tenantId): void
    {
        $hasInvoices = \App\Models\Invoice::where('tenant_id', $tenantId)
            ->where('status', 'sent')
            ->whereIn('type', ['sales', 'purchase'])
            ->exists();

        if ($hasInvoices) {
            throw new \InvalidArgumentException('لا يمكن إدخال رصيد افتتاحي بعد وجود فواتير مبيعات أو مشتريات مرحّلة.');
        }
    }
}
