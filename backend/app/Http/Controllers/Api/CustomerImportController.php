<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\CustomerWizardImportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CustomerImportController extends Controller
{
    public function __construct(
        private CustomerWizardImportService $importService,
    ) {}

    public function import(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'customers' => 'required|array|min:1|max:1000',
            'customers.*.name' => 'required|string|max:255',
            'customers.*.company_name' => 'nullable|string|max:255',
            'customers.*.tax_number' => 'nullable|string|max:50',
            'customers.*.phone' => 'nullable|string|max:30',
            'customers.*.mobile' => 'nullable|string|max:30',
            'customers.*.email' => 'nullable|email|max:255',
            'customers.*.address' => 'nullable|string',
            'customers.*.city' => 'nullable|string|max:100',
            'customers.*.country' => 'nullable|string|max:100',
            'customers.*.currency' => 'nullable|string|max:3',
            'customers.*.credit_limit' => 'nullable|numeric|min:0',
            'customers.*.payment_terms' => 'nullable|numeric|min:0',
            'customers.*.opening_balance' => 'nullable|numeric',
            'customers.*.opening_balance_date' => 'nullable|date',
            'customers.*.notes' => 'nullable|string',
            'customers.*.customer_group_id' => 'nullable|integer|exists:customer_groups,id',
            'parent_account_id' => 'required|integer|exists:accounts,id',
            'skip_duplicates' => 'boolean',
            'update_existing' => 'boolean',
            'import_opening_balance' => 'boolean',
        ]);

        $tenantId = (int) $request->tenant_id;

        $result = $this->importService->import(
            $tenantId,
            $validated['customers'],
            (int) $validated['parent_account_id'],
            (bool) ($validated['skip_duplicates'] ?? true),
            (bool) ($validated['update_existing'] ?? false),
            (bool) ($validated['import_opening_balance'] ?? true),
        );

        return response()->json([
            'total' => count($validated['customers']),
            'imported' => $result['imported'],
            'skipped' => $result['skipped'],
            'errors' => count($result['errors']),
            'accounts_opened' => $result['accounts_opened'] ?? 0,
            'errorRows' => $result['errors'],
        ]);
    }
}
