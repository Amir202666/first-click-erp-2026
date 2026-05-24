<?php

namespace App\Models;

use App\Services\FiscalYearLockService;
use App\Services\InventoryStockWebhookNotifier;
use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class InventoryMovement extends Model
{
    use BelongsToTenant;

    protected static function booted(): void
    {
        static::created(function (InventoryMovement $m) {
            app(InventoryStockWebhookNotifier::class)->handleMovementSaved($m);
        });

        static::deleted(function (InventoryMovement $m) {
            app(InventoryStockWebhookNotifier::class)->handleMovementDeleted($m);
        });

        static::creating(function (InventoryMovement $m) {
            FiscalYearLockService::assertDateWritable((int) $m->tenant_id, $m->date);
        });
        static::updating(function (InventoryMovement $m) {
            if ($m->isDirty('date')) {
                FiscalYearLockService::assertDateWritable((int) $m->tenant_id, $m->date);
            }
            $dirty = $m->getDirty();
            unset($dirty['updated_at'], $dirty['date']);
            if ($dirty !== []) {
                FiscalYearLockService::assertDateWritable((int) $m->tenant_id, $m->getOriginal('date'));
            }
        });
        static::deleting(function (InventoryMovement $m) {
            FiscalYearLockService::assertDateWritable((int) $m->tenant_id, $m->date);
        });
    }

    protected $fillable = [
        'tenant_id', 'item_id', 'item_variant_id', 'warehouse_id', 'branch_id', 'type', 'quantity', 'unit_cost',
        'total_cost', 'reference_type', 'reference_id',
        'date', 'notes', 'created_by',
        'expiry_date', 'batch_number',
    ];

    protected $casts = [
        'expiry_date' => 'date',
        'date' => 'date',
        'quantity' => 'decimal:4',
        'unit_cost' => 'decimal:3',
        'total_cost' => 'decimal:3',
    ];

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function itemVariant(): BelongsTo
    {
        return $this->belongsTo(ItemVariant::class, 'item_variant_id');
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    /** العلاقة المتعددة الأشكال (فاتورة، رصيد افتتاحي، إلخ) */
    public function reference(): MorphTo
    {
        return $this->morphTo();
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * تفاصيل مصدر حركة المخزون (روابط المعاينة، التعديل، الطباعة + وصف).
     * يُستخدم في كارت تتبّع الصنف (Item Ledger) للوصول السريع للمستند الأصلي.
     */
    public function getSourceDetailsAttribute(): array
    {
        $viewUrl = '';
        $editUrl = '';
        $printUrl = '';
        $label = '';
        $voucherKind = 'other';
        $voucherNumber = '';

        $reference = $this->relationLoaded('reference') ? $this->reference : null;

        switch ($this->reference_type) {
            case Invoice::class:
                /** @var \App\Models\Invoice|null $invoice */
                $invoice = $reference instanceof Invoice ? $reference : Invoice::find($this->reference_id);
                $number = $invoice?->number ?? (string) $this->reference_id;
                $voucherNumber = (string) $number;
                $viewUrl = "/invoices/view/{$this->reference_id}";
                $editUrl = "/invoices/edit/{$this->reference_id}".($invoice ? "?type={$invoice->type}" : '');
                $printUrl = $viewUrl; // نفس صفحة المعاينة تحتوي زر الطباعة
                if ($invoice) {
                    if (! empty($invoice->is_return)) {
                        $voucherKind = $invoice->type === 'purchase' ? 'purchase_return' : 'sales_return';
                        $label = $invoice->type === 'purchase'
                            ? "مرتجع مشتريات رقم: {$number}"
                            : "مرتجع مبيعات رقم: {$number}";
                    } else {
                        $voucherKind = $invoice->type === 'purchase' ? 'purchase_invoice' : 'sales_invoice';
                        $label = $invoice->type === 'purchase'
                            ? "فاتورة مشتريات رقم: {$number}"
                            : "فاتورة مبيعات رقم: {$number}";
                    }
                } else {
                    $voucherKind = 'invoice';
                    $label = "فاتورة رقم: {$number}";
                }
                break;

            case OpeningStockHeader::class:
                /** @var \App\Models\OpeningStockHeader|null $header */
                $header = $reference instanceof OpeningStockHeader ? $reference : OpeningStockHeader::find($this->reference_id);
                $refNo = $header?->reference_number ?? (string) $this->reference_id;
                $voucherNumber = (string) $refNo;
                $voucherKind = 'opening_stock';
                $viewUrl = "/opening-stock/{$this->reference_id}";
                $editUrl = $viewUrl;
                $printUrl = '';
                $label = "رصيد افتتاحي رقم: {$refNo}";
                break;

            case TransferHeader::class:
                /** @var \App\Models\TransferHeader|null $transfer */
                $transfer = $reference instanceof TransferHeader ? $reference : TransferHeader::find($this->reference_id);
                $refNo = $transfer?->number ?? (string) $this->reference_id;
                $voucherNumber = (string) $refNo;
                $voucherKind = 'stock_transfer';
                $viewUrl = '/inventory/transfers';
                $editUrl = $transfer && $transfer->status === TransferHeader::STATUS_DRAFT ? "/inventory/transfers/{$this->reference_id}/edit" : $viewUrl;
                $printUrl = "/inventory/transfers/{$this->reference_id}/print";
                $label = "تحويل مخزون رقم: {$refNo}";
                break;

            case ProductionOrder::class:
                /** @var \App\Models\ProductionOrder|null $po */
                $po = $reference instanceof ProductionOrder ? $reference : ProductionOrder::find($this->reference_id);
                $refNo = $po?->number ?? (string) $this->reference_id;
                $voucherNumber = (string) $refNo;
                $voucherKind = 'production_order';
                $viewUrl = '/manufacturing/production-orders';
                $editUrl = $viewUrl;
                $printUrl = '';
                $label = "أمر إنتاج رقم: {$refNo}";
                break;

            case InventoryAdjustment::class:
                /** @var \App\Models\InventoryAdjustment|null $adj */
                $adj = $reference instanceof InventoryAdjustment ? $reference : InventoryAdjustment::find($this->reference_id);
                $refNo = $adj?->number ?? (string) $this->reference_id;
                $voucherNumber = (string) $refNo;
                $voucherKind = 'inventory_adjustment';
                $viewUrl = "/inventory/adjustments/view/{$this->reference_id}";
                $editUrl = "/inventory/adjustments/edit/{$this->reference_id}";
                $printUrl = $viewUrl;
                $label = ($adj && $adj->adjustment_type === 'out')
                    ? "تسوية جرد (نقص) رقم: {$refNo}"
                    : "تسوية جرد (زيادة) رقم: {$refNo}";
                break;

            default:
                if ($this->type === 'adjustment') {
                    $voucherKind = 'manual_adjustment';
                    $label = 'تعديل جرد يدوي';
                } elseif ($this->reference_type && $this->reference_id) {
                    $base = class_basename($this->reference_type);
                    $voucherNumber = (string) $this->reference_id;
                    $label = "{$base} #{$this->reference_id}";
                }
                break;
        }

        return [
            'url' => $viewUrl,
            'label' => $label,
            'view_url' => $viewUrl,
            'edit_url' => $editUrl,
            'print_url' => $printUrl,
            'voucher_kind' => $voucherKind,
            'voucher_number' => $voucherNumber !== '' ? $voucherNumber : null,
        ];
    }

    /**
     * رابط المصدر فقط (اختصاراً للوصول السريع).
     */
    public function getSourceUrlAttribute(): string
    {
        return $this->source_details['url'] ?? '';
    }
}
