<?php

namespace App\Services;

use App\Models\Invoice;
use App\Models\InvoiceLine;
use App\Models\Item;
use App\Models\ItemSerial;
use Illuminate\Support\Facades\DB;

class SerialNumbersService
{
    /**
     * التحقق من أن الأصناف التي تستخدم الرقم التسلسلي تحتوي على أرقام مسجلة بعدد الكمية.
     * للاستخدام عند حفظ فاتورة مشتريات أو إضافة مخزنية.
     *
     * @param  array<int, array{serial_number: string}>  $itemSerials  [ item_id => [ ['serial_number' => 'S1'], ... ] ]
     */
    public function validateSerialsForInbound(int $tenantId, array $lines, array $itemSerials, ?int $warehouseId = null): array
    {
        $errors = [];
        foreach ($lines as $line) {
            $itemId = (int) ($line['item_id'] ?? 0);
            $quantity = (float) ($line['quantity'] ?? 0);
            if ($itemId <= 0 || $quantity <= 0) {
                continue;
            }

            $item = Item::withoutGlobalScopes()->where('tenant_id', $tenantId)->find($itemId);
            if (! $item || ! $item->use_serial_number) {
                continue;
            }

            $requiredCount = (int) round($quantity);
            $serials = $itemSerials[$itemId] ?? [];
            $serialNumbers = array_values(array_filter(array_map(function ($s) {
                return isset($s['serial_number']) ? trim((string) $s['serial_number']) : null;
            }, $serials)));

            if (count($serialNumbers) !== $requiredCount) {
                $errors[] = "Item #{$itemId} ({$item->name}): requires {$requiredCount} serial number(s), got ".count($serialNumbers);

                continue;
            }

            $uniqueSerials = array_unique($serialNumbers);
            if (count($uniqueSerials) !== count($serialNumbers)) {
                $errors[] = "Item #{$itemId}: duplicate serial numbers are not allowed.";
            }

            foreach ($serialNumbers as $sn) {
                if (! ItemSerial::isSerialUniqueForTenantItem($tenantId, $itemId, $sn)) {
                    $errors[] = "Item #{$itemId}: serial \"{$sn}\" already exists.";
                }
            }
        }

        return $errors;
    }

    /**
     * إنشاء سجلات الأرقام التسلسلية عند إدخال مخزني (مشتريات / إضافة / رصيد افتتاحي).
     */
    public function createSerialsForInbound(
        int $tenantId,
        int $itemId,
        int $warehouseId,
        array $serialNumbers,
        string $referenceType,
        int $referenceId
    ): void {
        foreach ($serialNumbers as $sn) {
            $sn = trim((string) $sn);
            if ($sn === '') {
                continue;
            }
            ItemSerial::withoutGlobalScopes()->create([
                'tenant_id' => $tenantId,
                'item_id' => $itemId,
                'warehouse_id' => $warehouseId,
                'serial_number' => $sn,
                'status' => ItemSerial::STATUS_AVAILABLE,
                'reference_type' => $referenceType,
                'reference_id' => $referenceId,
            ]);
        }
    }

    /**
     * جلب الأرقام التسلسلية المتاحة لصنف في مستودع معين (لاختيارها في فاتورة مبيعات).
     *
     * @return \Illuminate\Database\Eloquent\Collection<int, ItemSerial>
     */
    public function getAvailableSerialsForItemInWarehouse(int $tenantId, int $itemId, int $warehouseId, int $limit = 500)
    {
        return ItemSerial::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->where('item_id', $itemId)
            ->where('warehouse_id', $warehouseId)
            ->where('status', ItemSerial::STATUS_AVAILABLE)
            ->orderBy('id')
            ->limit($limit)
            ->get();
    }

    /**
     * ربط أرقام تسلسلية محددة بأسطر فاتورة مبيعات وتحديث حالتها إلى sold.
     * يُستدعى عند تأكيد الفاتورة.
     */
    public function allocateSerialsToInvoiceLine(InvoiceLine $line, array $itemSerialIds): void
    {
        $invoice = $line->invoice;
        $warehouseId = (int) $invoice->warehouse_id;
        $itemId = (int) $line->item_id;
        $quantity = (int) round((float) $line->quantity);

        if (count($itemSerialIds) !== $quantity) {
            throw new \InvalidArgumentException("Line requires {$quantity} serial(s), got ".count($itemSerialIds));
        }

        $tenantId = (int) $line->invoice->tenant_id;
        $serials = ItemSerial::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->whereIn('id', $itemSerialIds)
            ->where('item_id', $itemId)
            ->where('warehouse_id', $warehouseId)
            ->where('status', ItemSerial::STATUS_AVAILABLE)
            ->get();

        if ($serials->count() !== $quantity) {
            throw new \InvalidArgumentException('One or more serials are not available in this warehouse.');
        }

        DB::transaction(function () use ($line, $serials) {
            foreach ($serials as $serial) {
                $serial->update([
                    'status' => ItemSerial::STATUS_SOLD,
                    'reference_type' => InvoiceLine::class,
                    'reference_id' => $line->id,
                ]);
                $line->serials()->create(['item_serial_id' => $serial->id]);
            }
        });
    }

    /**
     * التحقق من أن أسطر فاتورة المبيعات لأصناف تسلسلية تحتوي على اختيار أرقام بعدد الكمية.
     */
    public function validateSerialsForSalesInvoice(Invoice $invoice): array
    {
        $invoice->loadMissing(['lines.item']);
        $errors = [];
        $warehouseId = (int) $invoice->warehouse_id;
        if ($warehouseId <= 0) {
            return ['Invoice must have a warehouse selected for serial-tracked items.'];
        }

        foreach ($invoice->lines as $line) {
            $item = $line->item;
            if (! $item || ! $item->use_serial_number) {
                continue;
            }

            $quantity = (int) round((float) $line->quantity);
            $allocated = $line->serials()->count();
            if ($allocated !== $quantity) {
                $errors[] = "Line (item: {$item->name}): requires {$quantity} serial(s), got {$allocated}.";
            }
        }

        return $errors;
    }
}
