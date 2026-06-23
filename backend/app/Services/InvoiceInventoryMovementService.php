<?php

namespace App\Services;

use App\Models\Invoice;
use App\Models\InvoiceManufacturingFrozenComponent;
use App\Models\InventoryMovement;

/**
 * حذف/عكس حركات المخزون المرتبطة بفاتورة (مبيعات، مشتريات، مرتجعات، تصنيع آلي).
 */
class InvoiceInventoryMovementService
{
    public function deleteForInvoice(Invoice $invoice): int
    {
        $tenantId = (int) $invoice->tenant_id;
        $invoiceId = (int) $invoice->id;
        if ($tenantId <= 0 || $invoiceId <= 0) {
            return 0;
        }

        $deleted = (int) InventoryMovement::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->where('reference_type', Invoice::class)
            ->where('reference_id', $invoiceId)
            ->delete();

        $frozenMovementIds = InvoiceManufacturingFrozenComponent::query()
            ->whereHas('batch', fn ($q) => $q->where('invoice_id', $invoiceId))
            ->whereNotNull('inventory_movement_out_id')
            ->pluck('inventory_movement_out_id');

        if ($frozenMovementIds->isNotEmpty()) {
            $deleted += (int) InventoryMovement::withoutGlobalScopes()
                ->where('tenant_id', $tenantId)
                ->whereIn('id', $frozenMovementIds)
                ->delete();
        }

        return $deleted;
    }

    /** @param list<int> $invoiceIds */
    public function deleteForInvoiceIds(int $tenantId, array $invoiceIds): int
    {
        $invoiceIds = array_values(array_unique(array_filter(array_map('intval', $invoiceIds), fn ($id) => $id > 0)));
        if ($tenantId <= 0 || $invoiceIds === []) {
            return 0;
        }

        return (int) InventoryMovement::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->where('reference_type', Invoice::class)
            ->whereIn('reference_id', $invoiceIds)
            ->delete();
    }
}
