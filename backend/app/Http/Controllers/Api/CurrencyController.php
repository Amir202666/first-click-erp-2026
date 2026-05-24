<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Currency;
use App\Services\ExchangeRateService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CurrencyController extends Controller
{
    public function __construct(
        private ExchangeRateService $exchangeRateService
    ) {}

    public function index(Request $request): JsonResponse
    {
        $currencies = Currency::where('tenant_id', $request->tenant_id)
            ->when($request->boolean('active_only'), fn ($q) => $q->where('is_active', true))
            ->orderByDesc('is_default')
            ->orderBy('name')
            ->get();

        return response()->json($currencies);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'code' => 'required|string|max:3',
            'name' => 'required|string|max:100',
            'name_en' => 'nullable|string|max:255',
            'symbol' => 'nullable|string|max:10',
            'decimal_places' => 'sometimes|integer|min:0|max:4',
            'exchange_rate' => 'required|numeric|min:0.00000001',
            'is_default' => 'sometimes|boolean',
            'is_active' => 'sometimes|boolean',
        ]);

        $validated['tenant_id'] = $request->tenant_id;

        if (! empty($validated['is_default'])) {
            Currency::where('tenant_id', $request->tenant_id)->update(['is_default' => false]);
        }

        $currency = Currency::create($validated);

        return response()->json($currency, 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $currency = Currency::where('tenant_id', $request->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'code' => 'sometimes|string|max:3',
            'name' => 'sometimes|string|max:100',
            'name_en' => 'nullable|string|max:255',
            'symbol' => 'nullable|string|max:10',
            'decimal_places' => 'sometimes|integer|min:0|max:4',
            'exchange_rate' => 'sometimes|numeric|min:0.00000001',
            'is_default' => 'sometimes|boolean',
            'is_active' => 'sometimes|boolean',
        ]);

        if (! empty($validated['is_default'])) {
            Currency::where('tenant_id', $request->tenant_id)
                ->where('id', '!=', $id)
                ->update(['is_default' => false]);
        }

        $currency->update($validated);

        return response()->json($currency);
    }

    /**
     * تحديث إعدادات العملة (الكسور العشرية، سعر الصرف، النشاط).
     */
    public function updateSettings(Request $request, int $id): JsonResponse
    {
        $currency = Currency::where('tenant_id', $request->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'decimal_places' => 'required|integer|min:0|max:4',
            'exchange_rate' => 'required|numeric|min:0.00000001',
            'is_active' => 'sometimes|boolean',
        ]);

        $currency->update($validated);

        return response()->json(['message' => 'تم تحديث إعدادات العملة بدقة.', 'currency' => $currency->fresh()]);
    }

    /**
     * جلب أسعار الصرف الحالية من مصدر خارجي وتحديث العملات.
     */
    public function fetchRates(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        if ($tenantId < 1) {
            return response()->json(['message' => 'معرف الشريك مطلوب.'], 422);
        }

        $result = $this->exchangeRateService->fetchAndUpdateRates($tenantId);

        return response()->json($result);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $currency = Currency::where('tenant_id', $request->tenant_id)->findOrFail($id);

        if ($currency->is_default) {
            return response()->json(['message' => 'Cannot delete the default currency'], 422);
        }

        // Check if used in invoices
        $usedInInvoices = \App\Models\Invoice::where('currency', $currency->code)->exists();
        if ($usedInInvoices) {
            return response()->json(['message' => 'Cannot delete a currency used in invoices'], 422);
        }

        $currency->delete();

        return response()->json(['message' => 'Deleted successfully']);
    }
}
