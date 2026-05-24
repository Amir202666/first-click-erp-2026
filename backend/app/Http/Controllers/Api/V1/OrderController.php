<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\Item;
use App\Models\Tenant;
use App\Models\Warehouse;
use App\Services\InvoiceService;
use App\Services\TenantSettingsService;
use App\Services\WebhookService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class OrderController extends Controller
{
    public function __construct(
        private InvoiceService $invoiceService,
        private TenantSettingsService $tenantSettings,
        private WebhookService $webhookService,
    ) {}

    public function store(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;

        $validated = $request->validate([
            'customer_id' => 'nullable|integer',
            'branch_id' => 'nullable|integer',
            'warehouse_id' => 'nullable|integer',
            'date' => 'nullable|date',
            'reference' => 'nullable|string|max:120',
            'lines' => 'required|array|min:1',
            'lines.*.item_id' => 'required|integer',
            'lines.*.quantity' => 'required|numeric|min:0.0001',
            'lines.*.unit_price' => 'nullable|numeric|min:0',
            'lines.*.discount_percent' => 'nullable|numeric|min:0|max:100',
            'lines.*.tax_percent' => 'nullable|numeric|min:0|max:100',
            'lines.*.description' => 'nullable|string|max:500',
        ]);

        $tenant = Tenant::findOrFail($tenantId);
        $defaultVat = $this->tenantSettings->get($tenantId, 'default_vat_rate');
        $vatRate = $defaultVat !== null && $defaultVat !== '' ? (float) $defaultVat : (float) ($tenant->vat_rate ?? 15);

        $branchId = $validated['branch_id'] ?? null;
        if (! $branchId) {
            $branchId = Branch::where('tenant_id', $tenantId)->orderBy('id')->value('id');
        }
        if (! $branchId) {
            return response()->json(['message' => 'لا يوجد فرع للشركة. أضف فرعاً أو مرّر branch_id.'], 422);
        }
        Branch::where('tenant_id', $tenantId)->findOrFail($branchId);

        $warehouseId = $validated['warehouse_id'] ?? null;
        if (! $warehouseId) {
            $warehouseId = Warehouse::where('tenant_id', $tenantId)->orderBy('id')->value('id');
        }
        if (! $warehouseId) {
            return response()->json(['message' => 'لا يوجد مخزن للشركة. أضف مخزناً أو مرّر warehouse_id.'], 422);
        }
        Warehouse::where('tenant_id', $tenantId)->findOrFail($warehouseId);

        $customerId = $validated['customer_id'] ?? null;
        if ($customerId) {
            Customer::where('tenant_id', $tenantId)->findOrFail($customerId);
        } else {
            $useDefault = $this->tenantSettings->get($tenantId, 'pos_use_default_customer');
            $defaultId = $this->tenantSettings->get($tenantId, 'pos_default_customer_id');
            if ($useDefault && $defaultId !== null && $defaultId !== '') {
                $defaultCustomer = Customer::where('tenant_id', $tenantId)->find((int) $defaultId);
                if ($defaultCustomer) {
                    $customerId = $defaultCustomer->id;
                }
            }
        }

        $lines = [];
        foreach ($validated['lines'] as $row) {
            $item = Item::where('tenant_id', $tenantId)->findOrFail((int) $row['item_id']);
            $unitPrice = isset($row['unit_price']) ? (float) $row['unit_price'] : (float) ($item->selling_price ?? 0);
            $lineDesc = isset($row['description']) ? trim((string) $row['description']) : '';
            $desc = $lineDesc !== '' ? $lineDesc : (string) ($item->name ?? '');
            $lines[] = [
                'item_id' => $item->id,
                'unit_id' => $item->unit_id,
                'quantity' => $row['quantity'],
                'unit_price' => $unitPrice,
                'discount_percent' => $row['discount_percent'] ?? 0,
                'tax_percent' => $row['tax_percent'] ?? $vatRate,
                'description' => $desc,
            ];
        }

        $currency = (string) ($tenant->default_currency ?? 'KWD');

        $invoiceData = [
            'tenant_id' => $tenantId,
            'type' => 'sales',
            'customer_id' => $customerId,
            'branch_id' => (int) $branchId,
            'warehouse_id' => (int) $warehouseId,
            'date' => $validated['date'] ?? now()->toDateString(),
            'status' => 'draft',
            'document_status' => 'draft',
            'payment_status' => 'na',
            'created_by' => null,
            'reference_number' => $validated['reference'] ?? null,
            'currency' => $currency,
            'exchange_rate' => 1,
            'discount_amount' => 0,
            'amount_paid' => 0,
        ];

        try {
            $invoice = DB::transaction(function () use ($invoiceData, $lines) {
                return $this->invoiceService->createInvoice($invoiceData, $lines, false);
            });
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'message' => 'تعذر إنشاء الفاتورة',
                'detail' => config('app.debug') ? $e->getMessage() : null,
            ], 422);
        }

        $this->webhookService->dispatch('invoice.created', [
            'id' => $invoice->id,
            'number' => $invoice->number,
            'total' => (float) $invoice->total,
            'customer_id' => $invoice->customer_id,
            'date' => (string) $invoice->date,
            'status' => $invoice->status,
        ], $tenantId);

        return response()->json([
            'message' => 'تم إنشاء الفاتورة (مسودة)',
            'invoice' => $invoice->load(['lines.item', 'customer']),
        ], 201);
    }

    public function fulfill(Request $request, int $id): JsonResponse
    {
        return response()->json(['message' => 'استخدم واجهة الفواتير الداخلية لترحيل الطلب حالياً.'], 501);
    }
}
