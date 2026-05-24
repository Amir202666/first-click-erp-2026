<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Middleware\CheckPermission;
use App\Models\BillOfMaterial;
use App\Models\BillOfMaterialLine;
use App\Models\Item;
use App\Models\ItemUnitOption;
use App\Models\ItemVariant;
use App\Services\InventoryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class ItemController extends Controller
{
    public function __construct(
        private InventoryService $inventoryService,
    ) {}

    /** دعم إرسال bom_lines كسلسلة JSON من FormData */
    private function mergeDecodedBomLines(Request $request): void
    {
        if (! $request->has('bom_lines')) {
            return;
        }
        $raw = $request->input('bom_lines');
        if (is_string($raw)) {
            $decoded = json_decode($raw, true);
            $request->merge(['bom_lines' => is_array($decoded) ? $decoded : []]);
        }
    }

    /**
     * @param  array<int, array<string, mixed>>  $lines
     */
    private function syncBillOfMaterialForItem(int $tenantId, Item $item, array $lines, bool $updateFinishedItemCost): void
    {
        if (! in_array($item->type, ['manufacturing', 'assembly'], true)) {
            BillOfMaterial::where('tenant_id', $tenantId)->where('finished_item_id', $item->id)->delete();

            return;
        }

        foreach ($lines as $row) {
            $cid = (int) ($row['component_item_id'] ?? 0);
            if ($cid === (int) $item->id) {
                throw ValidationException::withMessages([
                    'bom_lines' => ['لا يمكن أن يكون الصنف مكوّناً لنفسه.'],
                ]);
            }
            Item::where('tenant_id', $tenantId)->findOrFail($cid);
        }

        if ($lines === []) {
            BillOfMaterial::where('tenant_id', $tenantId)->where('finished_item_id', $item->id)->delete();
            if ($updateFinishedItemCost) {
                $item->update(['cost_price' => 0]);
            }

            return;
        }

        $bom = BillOfMaterial::firstOrCreate(
            ['tenant_id' => $tenantId, 'finished_item_id' => $item->id],
            ['name' => null, 'is_active' => true]
        );
        $bom->lines()->delete();
        foreach (array_values($lines) as $idx => $row) {
            BillOfMaterialLine::create([
                'bill_of_material_id' => $bom->id,
                'component_item_id' => (int) $row['component_item_id'],
                'quantity' => (float) $row['quantity'],
                'unit_id' => isset($row['unit_id']) && $row['unit_id'] !== null && $row['unit_id'] !== '' ? (int) $row['unit_id'] : null,
                'unit_cost' => null,
                'sort_order' => (int) ($row['sort_order'] ?? $idx),
            ]);
        }

        if ($updateFinishedItemCost) {
            $bom->load('lines');
            foreach ($bom->lines as $line) {
                $avg = $this->inventoryService->getItemAverageCost((int) $line->component_item_id);
                $line->setAttribute('unit_cost', round($avg, 4));
            }
            $total = $bom->getTotalCostAttribute();
            $item->update(['cost_price' => round($total, 4)]);
        }
    }

    private function appendBillOfMaterialToItem(Item $item, Request $request, bool $canViewCost): void
    {
        $item->load(['billOfMaterial.lines.componentItem.itemUnit', 'billOfMaterial.lines.unit']);
        $bom = $item->billOfMaterial;
        if (! $bom) {
            $item->setRelation('bill_of_material', null);

            return;
        }

        $warehouseId = $request->filled('warehouse_id') ? (int) $request->warehouse_id : null;
        $bomSum = 0.0;
        foreach ($bom->lines as $line) {
            $avg = $this->inventoryService->getItemAverageCost((int) $line->component_item_id, $warehouseId);
            $stock = $this->inventoryService->getItemStock((int) $line->component_item_id, $warehouseId);
            $line->setAttribute('current_stock', round($stock, 4));
            if ($canViewCost) {
                $line->setAttribute('unit_cost', round($avg, 4));
                $lt = round((float) $line->quantity * $avg, 4);
                $line->setAttribute('line_total', $lt);
                $bomSum += $lt;
            } else {
                $line->setAttribute('unit_cost', null);
                $line->setAttribute('line_total', null);
            }
        }
        if ($canViewCost) {
            $item->setAttribute('bom_total_cost', round($bomSum, 4));
        }
        $item->setRelation('bill_of_material', $bom);
    }

    /** توليد رقم صنف تلقائي داخل الفئة */
    public function nextCode(Request $request): JsonResponse
    {
        $request->validate([
            'category_id' => 'required|exists:item_categories,id',
        ]);
        $tenantId = $request->tenant_id;
        $categoryId = (int) $request->category_id;

        $prefix = \App\Models\ItemCategory::where('tenant_id', $tenantId)->where('id', $categoryId)->value('code') ?? 'CAT';

        $lastCode = Item::where('tenant_id', $tenantId)
            ->where('category_id', $categoryId)
            ->where('code', 'like', $prefix.'-%')
            ->orderByDesc('code')
            ->value('code');

        $nextNumber = 1;
        if ($lastCode && preg_match('/-(\d+)$/', $lastCode, $m)) {
            $nextNumber = ((int) $m[1]) + 1;
        }

        $code = sprintf('%s-%03d', $prefix, $nextNumber);

        return response()->json(['code' => $code]);
    }

    public function index(Request $request): JsonResponse
    {
        $tenantId = (int) ($request->tenant_id ?? $request->input('tenant_id'));
        if ($tenantId < 1) {
            return response()->json(['message' => 'يرجى تحديد المستأجر (tenant_id)'], 422);
        }
        $items = Item::where('tenant_id', $tenantId)
            ->when($request->search, function ($q, $s) {
                $q->where(function ($q2) use ($s) {
                    $q2->where('name', 'like', "%{$s}%")
                        ->orWhere('code', 'like', "%{$s}%")
                        ->orWhere('barcode', $s)
                        ->orWhereHas('unitOptions', fn ($q3) => $q3->where('barcode', $s));
                });
            })
            ->when($request->category_id, fn ($q, $c) => $q->where('category_id', $c))
            ->when($request->filled('serial_search'), function ($q) use ($request) {
                $s = trim((string) $request->serial_search);
                if ($s === '') {
                    return;
                }
                $like = '%'.addcslashes($s, '%_\\').'%';
                $q->whereHas('itemSerials', fn ($q2) => $q2->where('serial_number', 'like', $like));
            })
            ->when($request->filled('brand_id'), fn ($q) => $q->where('brand_id', (int) $request->brand_id))
            ->when($request->type, fn ($q, $t) => $q->where('type', $t))
            ->when($request->has('is_active'), fn ($q) => $q->where('is_active', $request->boolean('is_active')))
            ->with('category', 'brand', 'itemUnit', 'defaultVendor', 'unitOptions.unit')
            ->orderBy('name')
            ->paginate($request->per_page ?? 20);

        // لتجنب بطء شديد عند طلب قائمة كبيرة للفلاتر: لا نحسب المخزون لكل صنف
        $forFilter = $request->boolean('for_filter') || $request->boolean('lightweight');
        if (! $forFilter) {
            $items->getCollection()->transform(function ($item) {
                $item->setAttribute('current_stock', $this->inventoryService->getItemStock($item->id));
                $item->setAttribute('stock_value', $this->inventoryService->getItemStockValue($item->id));

                return $item;
            });
        }

        if (! CheckPermission::userHasPermission($request, 'items.view_cost')) {
            $items->getCollection()->each(fn ($i) => $i->makeHidden(['cost_price', 'stock_value']));
        }

        return response()->json($items);
    }

    public function store(Request $request): JsonResponse
    {
        $this->mergeDecodedBomLines($request);

        $validated = $request->validate([
            'code' => 'required|string|max:50',
            'name' => 'required|string|max:255',
            'name_en' => 'nullable|string|max:255',
            'description' => 'nullable|string',
            'unit' => 'nullable|string|max:20',
            'type' => 'nullable|in:inventory,service,manufacturing,assembly',
            'category_id' => 'nullable|exists:item_categories,id',
            'brand_id' => 'nullable|exists:item_brands,id',
            'unit_id' => 'nullable|exists:item_units,id',
            'default_vendor_id' => 'nullable|exists:vendors,id',
            'inventory_account_id' => 'nullable|exists:accounts,id',
            'cost_of_sales_account_id' => 'nullable|exists:accounts,id',
            'sales_account_id' => 'nullable|exists:accounts,id',
            'cost_price' => 'nullable|numeric|min:0',
            'selling_price' => 'nullable|numeric|min:0',
            'default_tax_percent' => 'nullable|numeric|min:0|max:100',
            'min_selling_price' => 'nullable|numeric|min:0',
            'max_selling_price' => 'nullable|numeric|min:0',
            'min_quantity' => 'nullable|numeric|min:0',
            'max_quantity' => 'nullable|numeric|min:0',
            'barcode' => 'nullable|string',
            'sku' => 'nullable|string',
            'track_quantity' => 'nullable|boolean',
            'initial_stock' => 'nullable|numeric|min:0',
            'image' => 'nullable|image|mimes:jpeg,png,jpg,gif,webp|max:2048',
            'unit_options' => 'nullable|array',
            'unit_options.*.unit_id' => 'required_with:unit_options|exists:item_units,id',
            'unit_options.*.conversion_factor' => 'nullable|numeric|min:0.000001',
            'unit_options.*.is_base' => 'nullable|boolean',
            'unit_options.*.sort_order' => 'nullable|integer|min:0',
            'unit_options.*.selling_price' => 'nullable|numeric|min:0',
            'unit_options.*.cost_price' => 'nullable|numeric|min:0',
            'unit_options.*.barcode' => 'nullable|string|max:100',
            'bom_lines' => 'nullable|array',
            'bom_lines.*.component_item_id' => 'required|integer|exists:items,id',
            'bom_lines.*.quantity' => 'required|numeric|min:0.0001',
            'bom_lines.*.unit_id' => 'nullable|integer|exists:item_units,id',
            'bom_lines.*.sort_order' => 'nullable|integer|min:0',
            'has_variants' => 'nullable|boolean',
            'variants' => 'nullable|array',
            'variants.*.id' => 'nullable|integer',
            'variants.*.name' => 'nullable|string|max:255',
            'variants.*.options' => 'nullable|array',
            'variants.*.options.*' => 'nullable|string|max:255',
            'variants.*.barcode' => 'nullable|string|max:100',
            'variants.*.sku' => 'nullable|string|max:100',
            'variants.*.sort_order' => 'nullable|integer|min:0',
            'variants.*.initial_stock' => 'nullable|numeric|min:0',
            'variants.*.selling_price' => 'nullable|numeric|min:0',
        ]);

        $bomLines = $validated['bom_lines'] ?? [];
        unset($validated['bom_lines']);

        $validated['tenant_id'] = $request->tenant_id;
        $initialStock = $validated['initial_stock'] ?? null;
        $unitOptions = $validated['unit_options'] ?? null;
        unset($validated['initial_stock'], $validated['image'], $validated['unit_options']);
        unset($validated['has_variants'], $validated['variants']);

        // إذا لم يحدد المستخدم حسابات يدوياً، نرثها تلقائياً من فئة الصنف (ItemCategory)
        if (! empty($validated['category_id'])) {
            $category = \App\Models\ItemCategory::where('tenant_id', $request->tenant_id)->find($validated['category_id']);
            if ($category) {
                $validated['inventory_account_id'] = $validated['inventory_account_id'] ?? $category->inventory_account_id;
                $validated['cost_of_sales_account_id'] = $validated['cost_of_sales_account_id'] ?? $category->cost_of_sales_account_id;
                $validated['sales_account_id'] = $validated['sales_account_id'] ?? $category->sales_account_id;
            }
        }

        $item = Item::create($validated);

        if (is_array($unitOptions) && count($unitOptions) > 0) {
            $this->syncItemUnitOptions($item, $unitOptions);
        }

        if ($request->hasFile('image')) {
            $path = $request->file('image')->store('items/'.$request->tenant_id, 'public');
            $item->update(['image' => $path]);
        }

        $this->syncItemVariantsFromRequest($request, $item->fresh(), true);

        $hasVariantStock = $request->boolean('has_variants')
            && collect((array) $request->input('variants', []))->sum(fn ($v) => (float) ($v['initial_stock'] ?? 0)) > 0;

        if ($initialStock && $initialStock > 0 && ($item->track_quantity ?? true) && ! $hasVariantStock) {
            $this->inventoryService->addMovement([
                'tenant_id' => $request->tenant_id,
                'item_id' => $item->id,
                'type' => 'in',
                'quantity' => $initialStock,
                'unit_cost' => $item->cost_price,
                'total_cost' => round((float) $initialStock * (float) $item->cost_price, 3),
                'date' => now()->toDateString(),
                'notes' => 'رصيد افتتاحي',
                'created_by' => $request->user()->id,
            ]);
        }

        $canUpdateBomCost = CheckPermission::userHasPermission($request, 'items.view_cost');
        $this->syncBillOfMaterialForItem((int) $request->tenant_id, $item->fresh(), is_array($bomLines) ? $bomLines : [], $canUpdateBomCost);

        $fresh = $item->fresh()->load('category', 'brand', 'itemUnit', 'defaultVendor', 'unitOptions.unit', 'itemVariants');
        $fresh->setAttribute('current_stock', $this->inventoryService->getItemStock($fresh->id));
        $this->appendBillOfMaterialToItem($fresh, $request, $canUpdateBomCost);

        return response()->json($fresh, 201);
    }

    /**
     * مزامنة وحدات القياس المتعددة للصنف (إنشاء/تحديث من مصفوفة unit_options).
     * يجب وجود وحدة أساسية واحدة (is_base=true, conversion_factor=1).
     */
    private function syncItemUnitOptions(Item $item, array $unitOptions): void
    {
        $baseIdx = null;
        foreach ($unitOptions as $i => $opt) {
            if (! empty($opt['is_base'])) {
                $baseIdx = $i;
                break;
            }
        }
        if ($baseIdx === null) {
            $baseIdx = 0;
        }
        $normalized = [];
        foreach ($unitOptions as $i => $opt) {
            $isBase = (int) $i === (int) $baseIdx;
            $factor = $isBase ? 1.0 : max(0.000001, (float) ($opt['conversion_factor'] ?? 1));
            $normalized[] = [
                'unit_id' => (int) $opt['unit_id'],
                'conversion_factor' => $factor,
                'is_base' => $isBase,
                'sort_order' => (int) ($opt['sort_order'] ?? $i),
                'selling_price' => isset($opt['selling_price']) && $opt['selling_price'] !== '' ? (float) $opt['selling_price'] : null,
                'cost_price' => isset($opt['cost_price']) && $opt['cost_price'] !== '' ? (float) $opt['cost_price'] : null,
                'barcode' => isset($opt['barcode']) && $opt['barcode'] !== '' ? (string) $opt['barcode'] : null,
            ];
        }
        $item->unitOptions()->delete();
        foreach ($normalized as $opt) {
            ItemUnitOption::create([
                'item_id' => $item->id,
                'unit_id' => $opt['unit_id'],
                'conversion_factor' => $opt['conversion_factor'],
                'is_base' => $opt['is_base'],
                'sort_order' => $opt['sort_order'],
                'selling_price' => $opt['selling_price'],
                'cost_price' => $opt['cost_price'],
                'barcode' => $opt['barcode'],
            ]);
        }
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $item = Item::where('tenant_id', $request->tenant_id)
            ->with('category', 'brand', 'itemUnit', 'defaultVendor', 'unitOptions.unit', 'itemVariants')
            ->findOrFail($id);

        $canViewCost = CheckPermission::userHasPermission($request, 'items.view_cost');

        $item->setAttribute('current_stock', $this->inventoryService->getItemStock($item->id));
        $item->setAttribute('stock_value', $this->inventoryService->getItemStockValue($item->id));
        $item->setAttribute('average_cost', $this->inventoryService->getItemAverageCost($item->id));
        $item->setAttribute('average_selling', $this->inventoryService->getItemAverageSellingPrice($item->id));
        $warehouseId = $request->has('warehouse_id') ? (int) $request->warehouse_id : null;
        $item->setAttribute('stock_breakdown', $item->getStockBreakdownByUnits($warehouseId));

        $this->appendBillOfMaterialToItem($item, $request, $canViewCost);

        if (! $canViewCost) {
            $item->makeHidden(['cost_price', 'stock_value', 'average_cost']);
            if ($item->relationLoaded('unitOptions')) {
                $item->unitOptions->each(fn ($o) => $o->makeHidden(['cost_price']));
            }
        }

        return response()->json($item);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $item = Item::where('tenant_id', $request->tenant_id)->findOrFail($id);

        $this->mergeDecodedBomLines($request);

        $validated = $request->validate([
            'code' => 'sometimes|string|max:50',
            'name' => 'sometimes|string|max:255',
            'name_en' => 'nullable|string|max:255',
            'description' => 'nullable|string',
            'unit' => 'nullable|string|max:20',
            'type' => 'nullable|in:inventory,service,manufacturing,assembly',
            'category_id' => 'nullable|exists:item_categories,id',
            'brand_id' => 'nullable|exists:item_brands,id',
            'unit_id' => 'nullable|exists:item_units,id',
            'default_vendor_id' => 'nullable|exists:vendors,id',
            'inventory_account_id' => 'nullable|exists:accounts,id',
            'cost_of_sales_account_id' => 'nullable|exists:accounts,id',
            'sales_account_id' => 'nullable|exists:accounts,id',
            'cost_price' => 'nullable|numeric|min:0',
            'selling_price' => 'nullable|numeric|min:0',
            'default_tax_percent' => 'nullable|numeric|min:0|max:100',
            'min_selling_price' => 'nullable|numeric|min:0',
            'max_selling_price' => 'nullable|numeric|min:0',
            'min_quantity' => 'nullable|numeric|min:0',
            'max_quantity' => 'nullable|numeric|min:0',
            'barcode' => 'nullable|string',
            'sku' => 'nullable|string',
            'is_active' => 'sometimes|boolean',
            'track_quantity' => 'nullable|boolean',
            'image' => 'nullable|image|mimes:jpeg,png,jpg,gif,webp|max:2048',
            'unit_options' => 'nullable|array',
            'unit_options.*.unit_id' => 'required_with:unit_options|exists:item_units,id',
            'unit_options.*.conversion_factor' => 'nullable|numeric|min:0.000001',
            'unit_options.*.is_base' => 'nullable|boolean',
            'unit_options.*.sort_order' => 'nullable|integer|min:0',
            'unit_options.*.selling_price' => 'nullable|numeric|min:0',
            'unit_options.*.cost_price' => 'nullable|numeric|min:0',
            'unit_options.*.barcode' => 'nullable|string|max:100',
            'bom_lines' => 'nullable|array',
            'bom_lines.*.component_item_id' => 'required|integer|exists:items,id',
            'bom_lines.*.quantity' => 'required|numeric|min:0.0001',
            'bom_lines.*.unit_id' => 'nullable|integer|exists:item_units,id',
            'bom_lines.*.sort_order' => 'nullable|integer|min:0',
            'has_variants' => 'nullable|boolean',
            'variants' => 'nullable|array',
            'variants.*.id' => 'nullable|integer',
            'variants.*.name' => 'nullable|string|max:255',
            'variants.*.options' => 'nullable|array',
            'variants.*.options.*' => 'nullable|string|max:255',
            'variants.*.barcode' => 'nullable|string|max:100',
            'variants.*.sku' => 'nullable|string|max:100',
            'variants.*.sort_order' => 'nullable|integer|min:0',
            'variants.*.initial_stock' => 'nullable|numeric|min:0',
            'variants.*.selling_price' => 'nullable|numeric|min:0',
        ]);

        $hadBomLinesKey = $request->has('bom_lines');
        $bomLines = $validated['bom_lines'] ?? [];
        unset($validated['bom_lines']);

        $unitOptions = $validated['unit_options'] ?? null;
        unset($validated['image'], $validated['unit_options'], $validated['has_variants'], $validated['variants']);
        $item->update($validated);

        if (array_key_exists('unit_options', $request->all())) {
            if (is_array($unitOptions) && count($unitOptions) > 0) {
                $this->syncItemUnitOptions($item->fresh(), $unitOptions);
            } else {
                $item->unitOptions()->delete();
            }
        }

        if ($request->hasFile('image')) {
            if ($item->image) {
                Storage::disk('public')->delete($item->image);
            }
            $path = $request->file('image')->store('items/'.$request->tenant_id, 'public');
            $item->update(['image' => $path]);
        }

        $tenantId = (int) $request->tenant_id;
        $fresh = $item->fresh();
        $canUpdateBomCost = CheckPermission::userHasPermission($request, 'items.view_cost');

        if (! in_array($fresh->type, ['manufacturing', 'assembly'], true)) {
            BillOfMaterial::where('tenant_id', $tenantId)->where('finished_item_id', $fresh->id)->delete();
        } elseif ($hadBomLinesKey) {
            $this->syncBillOfMaterialForItem($tenantId, $fresh, is_array($bomLines) ? $bomLines : [], $canUpdateBomCost);
        }

        if ($request->has('has_variants') || $request->has('variants')) {
            $this->syncItemVariantsFromRequest($request, $fresh->fresh(), false);
        }

        $responseItem = $fresh->fresh()->load('category', 'brand', 'itemUnit', 'defaultVendor', 'unitOptions.unit', 'itemVariants');
        $responseItem->setAttribute('current_stock', $this->inventoryService->getItemStock($responseItem->id));
        $this->appendBillOfMaterialToItem($responseItem, $request, $canUpdateBomCost);

        if (! $canUpdateBomCost) {
            $responseItem->makeHidden(['cost_price', 'stock_value', 'average_cost']);
            if ($responseItem->relationLoaded('unitOptions')) {
                $responseItem->unitOptions->each(fn ($o) => $o->makeHidden(['cost_price']));
            }
        }

        return response()->json($responseItem);
    }

    /**
     * مزامنة متغيرات الصنف مع جدول item_variants وحركات الرصيد الافتتاحية للمتغير عند الإنشاء.
     */
    private function syncItemVariantsFromRequest(Request $request, Item $item, bool $isCreate): void
    {
        $tenantId = (int) $request->tenant_id;
        if (! $request->boolean('has_variants')) {
            ItemVariant::where('item_id', $item->id)->whereDoesntHave('inventoryMovements')->delete();

            return;
        }
        $variants = $request->input('variants');
        if (! is_array($variants) || $variants === []) {
            return;
        }
        $incomingIds = [];
        foreach ($variants as $row) {
            if (! is_array($row)) {
                continue;
            }
            $name = trim((string) ($row['name'] ?? ''));
            if ($name === '') {
                continue;
            }
            $options = isset($row['options']) && is_array($row['options']) ? $row['options'] : [];
            $vid = isset($row['id']) && is_numeric($row['id']) ? (int) $row['id'] : null;
            $payload = [
                'tenant_id' => $tenantId,
                'item_id' => $item->id,
                'name' => $name,
                'options' => $options,
                'barcode' => isset($row['barcode']) && $row['barcode'] !== '' && $row['barcode'] !== null ? (string) $row['barcode'] : null,
                'sku' => isset($row['sku']) && $row['sku'] !== '' && $row['sku'] !== null ? (string) $row['sku'] : null,
                'sort_order' => (int) ($row['sort_order'] ?? 0),
            ];
            if ($vid && ItemVariant::where('id', $vid)->where('item_id', $item->id)->exists()) {
                ItemVariant::where('id', $vid)->update(array_merge($payload, ['updated_at' => now()]));
                $incomingIds[] = $vid;
            } else {
                $nv = ItemVariant::create($payload);
                $incomingIds[] = $nv->id;
                if ($isCreate && ($item->track_quantity ?? true) && isset($row['initial_stock'])) {
                    $is = (float) $row['initial_stock'];
                    if ($is > 0) {
                        $this->inventoryService->addMovement([
                            'tenant_id' => $tenantId,
                            'item_id' => $item->id,
                            'item_variant_id' => $nv->id,
                            'type' => 'in',
                            'quantity' => $is,
                            'unit_cost' => $item->cost_price,
                            'total_cost' => round($is * (float) $item->cost_price, 3),
                            'date' => now()->toDateString(),
                            'notes' => 'رصيد أول متغير',
                            'created_by' => $request->user()->id,
                        ]);
                    }
                }
            }
        }
        ItemVariant::where('item_id', $item->id)
            ->whereNotIn('id', $incomingIds)
            ->whereDoesntHave('inventoryMovements')
            ->delete();
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $item = Item::where('tenant_id', $request->tenant_id)->findOrFail($id);

        if ($item->inventoryMovements()->exists()) {
            return response()->json(['message' => 'لا يمكن حذف صنف له حركات مخزون'], 422);
        }

        $item->delete();

        return response()->json(['message' => 'تم الحذف بنجاح']);
    }

    /**
     * جلب الأرقام التسلسلية المتاحة (available) لصنف محدد.
     * GET /items/{id}/available-serials?warehouse_id=1&search=ABC
     */
    public function availableSerials(Request $request, int $id): JsonResponse
    {
        $tenantId = (int) ($request->tenant_id ?? 0);
        if ($tenantId < 1) {
            return response()->json(['message' => 'يرجى تحديد المستأجر'], 422);
        }

        $item = \App\Models\Item::where('tenant_id', $tenantId)->findOrFail($id);

        $query = \App\Models\ItemSerial::where('tenant_id', $tenantId)
            ->where('item_id', $item->id)
            ->where('status', \App\Models\ItemSerial::STATUS_AVAILABLE)
            ->when($request->warehouse_id, fn ($q, $wid) => $q->where('warehouse_id', (int) $wid))
            ->when($request->search, fn ($q, $s) => $q->where('serial_number', 'like', '%'.$s.'%'))
            ->orderBy('serial_number')
            ->limit(200)
            ->get(['id', 'serial_number', 'warehouse_id']);

        return response()->json($query);
    }

    /**
     * توليد باركود فريد للصنف وحفظه (للمنتج المصنع أو أي صنف).
     * POST /items/{id}/generate-barcode
     */
    public function generateBarcode(Request $request, int $id): JsonResponse
    {
        $tenantId = (int) ($request->tenant_id ?? 0);
        if ($tenantId < 1) {
            return response()->json(['message' => 'يرجى تحديد المستأجر'], 422);
        }

        $item = Item::where('tenant_id', $tenantId)->findOrFail($id);

        $prefix = '8'; // بداية EAN-8/13 للاستخدام الداخلي
        $maxAttempts = 20;
        for ($i = 0; $i < $maxAttempts; $i++) {
            $code = $prefix.str_pad((string) random_int(0, 9999999), 7, '0', STR_PAD_LEFT);
            $exists = Item::where('tenant_id', $tenantId)->where('barcode', $code)->where('id', '!=', $id)->exists();
            if (! $exists) {
                $item->update(['barcode' => $code]);

                return response()->json(['barcode' => $code, 'item' => $item->fresh()]);
            }
        }

        $code = $prefix.$tenantId.str_pad((string) $id, 5, '0', STR_PAD_LEFT);
        $item->update(['barcode' => $code]);

        return response()->json(['barcode' => $code, 'item' => $item->fresh()]);
    }
}
