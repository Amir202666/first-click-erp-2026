<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\VendorWizardImportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class VendorImportController extends Controller
{
    public function __construct(
        private VendorWizardImportService $importService,
    ) {}

    public function import(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'vendors' => 'required|array|min:1|max:1000',
            'vendors.*.name' => 'required|string|max:255',
            'vendors.*.name_en' => 'nullable|string|max:255',
            'vendors.*.company_name' => 'nullable|string|max:255',
            'vendors.*.tax_number' => 'nullable|string|max:50',
            'vendors.*.phone' => 'nullable|string|max:30',
            'vendors.*.mobile' => 'nullable|string|max:30',
            'vendors.*.email' => 'nullable|email|max:255',
            'vendors.*.address' => 'nullable|string',
            'vendors.*.city' => 'nullable|string|max:100',
            'vendors.*.country' => 'nullable|string|max:100',
            'vendors.*.country_code' => 'nullable|string|max:10',
            'vendors.*.currency' => 'nullable|string|max:3',
            'vendors.*.payment_terms' => 'nullable|string|max:100',
            'vendors.*.notes' => 'nullable|string',
            'vendors.*.vendor_group_id' => 'nullable|integer|exists:vendor_groups,id',
            'parent_account_id' => 'required|integer|exists:accounts,id',
            'skip_duplicates' => 'boolean',
            'update_existing' => 'boolean',
        ]);

        $tenantId = (int) $request->tenant_id;

        $result = $this->importService->import(
            $tenantId,
            $validated['vendors'],
            (int) $validated['parent_account_id'],
            (bool) ($validated['skip_duplicates'] ?? true),
            (bool) ($validated['update_existing'] ?? false),
        );

        return response()->json([
            'total' => count($validated['vendors']),
            'imported' => $result['imported'],
            'skipped' => $result['skipped'],
            'errors' => count($result['errors']),
            'accounts_opened' => $result['accountsOpened'],
            'errorRows' => $result['errors'],
        ]);
    }
}
