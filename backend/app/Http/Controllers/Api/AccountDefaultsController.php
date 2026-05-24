<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\AccountResolutionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * إعدادات الحسابات الافتراضية.
 * الحسابات مرتبطة بمعرف العميل (tenant_id) فقط وليست مرتبطة بالفرع (branch).
 */
class AccountDefaultsController extends Controller
{
    public function __construct(
        private AccountResolutionService $resolutionService
    ) {}

    /**
     * عرض إعدادات الحسابات الافتراضية للعميل (حسب tenant_id).
     */
    public function show(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $defaults = $this->resolutionService->getDefaults($tenantId);
        $defaults->load([
            'cashAccount', 'bankAccount', 'customersAccount', 'vendorsAccount',
            'inventoryAccount', 'salesAccount', 'salesReturnsAccount', 'cogsAccount',
            'purchasesAccount', 'discountsAccount', 'purchaseDiscountsAccount', 'taxPayableAccount', 'capitalAccount',
            'installmentsReceivableAccount', 'installmentsPayableAccount',
            'inventoryAdjustmentGainAccount', 'inventoryAdjustmentLossAccount',
        ]);

        return response()->json($defaults);
    }

    /**
     * تحديث إعدادات الحسابات الافتراضية.
     * رأس المال يُخزّن للعرض فقط ولا يُستخدم تلقائياً في عمليات البيع/الشراء.
     */
    public function update(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        if ($tenantId < 1) {
            return response()->json(['message' => 'يجب اختيار العميل/الشركة أولاً (معرف العميل غير محدد).'], 422);
        }
        $validated = $request->validate([
            'cash_account_id' => 'nullable|exists:accounts,id',
            'bank_account_id' => 'nullable|exists:accounts,id',
            'customers_account_id' => 'nullable|exists:accounts,id',
            'vendors_account_id' => 'nullable|exists:accounts,id',
            'inventory_account_id' => 'nullable|exists:accounts,id',
            'sales_account_id' => 'nullable|exists:accounts,id',
            'sales_returns_account_id' => 'nullable|exists:accounts,id',
            'cogs_account_id' => 'nullable|exists:accounts,id',
            'purchases_account_id' => 'nullable|exists:accounts,id',
            'discounts_account_id' => 'nullable|exists:accounts,id',
            'purchase_discounts_account_id' => 'nullable|exists:accounts,id',
            'tax_payable_account_id' => 'nullable|exists:accounts,id',
            'capital_account_id' => 'nullable|exists:accounts,id',
            'inventory_adjustment_gain_account_id' => 'nullable|exists:accounts,id',
            'inventory_adjustment_loss_account_id' => 'nullable|exists:accounts,id',
            'installments_receivable_account_id' => 'nullable|exists:accounts,id',
            'installments_payable_account_id' => 'nullable|exists:accounts,id',
        ]);

        $defaults = $this->resolutionService->getDefaults($tenantId);
        $defaults->update($validated);

        $defaults->load([
            'cashAccount', 'bankAccount', 'customersAccount', 'vendorsAccount',
            'inventoryAccount', 'salesAccount', 'salesReturnsAccount', 'cogsAccount',
            'purchasesAccount', 'discountsAccount', 'purchaseDiscountsAccount', 'taxPayableAccount', 'capitalAccount',
            'installmentsReceivableAccount', 'installmentsPayableAccount',
            'inventoryAdjustmentGainAccount', 'inventoryAdjustmentLossAccount',
        ]);

        return response()->json($defaults);
    }
}
