<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ItemWizardImportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ItemImportController extends Controller
{
    public function __construct(
        private ItemWizardImportService $importService,
    ) {}

    public function import(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'items' => 'required|array|min:1|max:2000',
            'items.*.name' => 'required|string|max:255',
            'items.*.name_en' => 'nullable|string|max:255',
            'items.*.code' => 'nullable|string|max:50',
            'items.*.barcode' => 'nullable|string|max:100',
            'items.*.description' => 'nullable|string',
            'items.*.category_code' => 'nullable|string|max:20',
            'items.*.category_name' => 'nullable|string|max:255',
            'items.*.base_unit_name' => 'nullable|string|max:50',
            'items.*.base_unit_symbol' => 'nullable|string|max:10',
            'items.*.unit_name' => 'nullable|string|max:50',
            'items.*.unit_name' => 'nullable|string|max:50',
            'items.*.brand' => 'nullable|string|max:255',
            'items.*.sale_price' => 'required|numeric|min:0',
            'items.*.cost_price' => 'nullable|numeric|min:0',
            'items.*.min_sale_price' => 'nullable|numeric|min:0',
            'items.*.wholesale_price' => 'nullable|numeric|min:0',
            'items.*.tax_percent' => 'nullable|numeric|min:0|max:100',
            'items.*.tax_inclusive' => 'nullable|boolean',
            'items.*.track_inventory' => 'nullable|boolean',
            'items.*.opening_stock' => 'nullable|numeric|min:0',
            'items.*.min_stock' => 'nullable|numeric|min:0',
            'items.*.max_stock' => 'nullable|numeric|min:0',
            'items.*.is_service' => 'nullable|boolean',
            'items.*.is_active' => 'nullable|boolean',
            'items.*.notes' => 'nullable|string',
            'settings' => 'nullable|array',
            'settings.skip_duplicates' => 'boolean',
            'settings.update_existing' => 'boolean',
            'settings.create_categories' => 'boolean',
            'settings.create_units' => 'boolean',
        ]);

        $tenantId = (int) $request->tenant_id;
        $settings = $validated['settings'] ?? [];

        $result = $this->importService->import(
            $tenantId,
            $validated['items'],
            (bool) ($settings['skip_duplicates'] ?? true),
            (bool) ($settings['update_existing'] ?? false),
            (bool) ($settings['create_categories'] ?? true),
            (bool) ($settings['create_units'] ?? true),
            $request->user()?->id,
        );

        return response()->json([
            'total' => count($validated['items']),
            'imported' => $result['imported'],
            'updated' => $result['updated'],
            'skipped' => $result['skipped'],
            'errors' => count($result['errors']),
            'categories_created' => $result['categoriesCreated'],
            'units_created' => $result['unitsCreated'],
            'errorRows' => $result['errors'],
        ]);
    }
}
