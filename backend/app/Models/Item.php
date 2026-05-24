<?php

namespace App\Models;

use App\Traits\Auditable;
use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Facades\Storage;

class Item extends Model
{
    use Auditable, BelongsToTenant;

    protected $appends = ['image_url'];

    protected $fillable = [
        'tenant_id', 'category_id', 'brand_id', 'unit_id', 'default_vendor_id',
        'inventory_account_id', 'cost_of_sales_account_id', 'sales_account_id',
        'code', 'name', 'name_en', 'description', 'unit', 'type',
        'cost_price', 'selling_price', 'default_tax_percent', 'min_selling_price', 'max_selling_price', 'min_quantity', 'max_quantity',
        'currency', 'is_active', 'track_quantity', 'use_serial_number', 'barcode', 'sku', 'image',
    ];

    protected $casts = [
        'cost_price' => 'decimal:4',
        'selling_price' => 'decimal:4',
        'default_tax_percent' => 'decimal:2',
        'min_selling_price' => 'decimal:4',
        'max_selling_price' => 'decimal:4',
        'min_quantity' => 'decimal:4',
        'max_quantity' => 'decimal:4',
        'is_active' => 'boolean',
        'track_quantity' => 'boolean',
        'use_serial_number' => 'boolean',
    ];

    public function category(): BelongsTo
    {
        return $this->belongsTo(ItemCategory::class, 'category_id');
    }

    public function brand(): BelongsTo
    {
        return $this->belongsTo(ItemBrand::class, 'brand_id');
    }

    public function itemUnit(): BelongsTo
    {
        return $this->belongsTo(ItemUnit::class, 'unit_id');
    }

    /** وحدات القياس المتعددة للصنف (معامل تحويل، سعر، باركود لكل وحدة) */
    public function unitOptions(): HasMany
    {
        return $this->hasMany(ItemUnitOption::class)->orderBy('sort_order')->orderBy('conversion_factor');
    }

    public function defaultVendor(): BelongsTo
    {
        return $this->belongsTo(Vendor::class, 'default_vendor_id');
    }

    /** قائمة مواد (BOM) واحدة للصنف التجميعي/التصنيعي */
    public function billOfMaterial(): HasOne
    {
        return $this->hasOne(BillOfMaterial::class, 'finished_item_id');
    }

    public function inventoryMovements(): HasMany
    {
        return $this->hasMany(InventoryMovement::class);
    }

    /** متغيرات الصنف (مقاس، لون، …) */
    public function itemVariants(): HasMany
    {
        return $this->hasMany(ItemVariant::class)->orderBy('sort_order')->orderBy('id');
    }

    public function itemSerials(): HasMany
    {
        return $this->hasMany(ItemSerial::class);
    }

    public function getImageUrlAttribute(): ?string
    {
        if (! $this->image) {
            return null;
        }

        return Storage::disk('public')->exists($this->image)
            ? asset('storage/'.$this->image)
            : null;
    }

    public function currentStock(?int $warehouseId = null): float
    {
        $q = $this->inventoryMovements();
        if ($warehouseId !== null) {
            $q->where('warehouse_id', $warehouseId);
        }

        return (float) $q->sum('quantity');
    }

    public function stockValue(): float
    {
        $stock = $this->currentStock();

        return $stock * (float) $this->cost_price;
    }

    /**
     * معامل التحويل من الوحدة المحددة إلى الوحدة الصغرى (الأساسية).
     * إذا لم يُحدد unit_id أو لا يوجد خيار للوحدة، يُعاد 1.
     */
    public function getConversionFactorToBase(?int $unitId): float
    {
        if ($unitId === null) {
            return 1.0;
        }
        $option = $this->unitOptions()->where('unit_id', $unitId)->first();
        if ($option) {
            return (float) $option->conversion_factor;
        }
        if ($this->unit_id == $unitId) {
            return 1.0;
        }

        return 1.0;
    }

    /**
     * عدد وحدات القياس الأصغر (أساس المخزون) في 1 وحدة من نوع $unitId.
     * null إذا الصنف لا يعرّف هذه الوحدة (لا في unit_options ولا كـ unit_id للصنف).
     */
    public function conversionFactorBasePerOneUnit(?int $unitId): ?float
    {
        if ($unitId === null) {
            return null;
        }
        $opts = $this->relationLoaded('unitOptions') ? $this->unitOptions : $this->unitOptions()->get();
        $option = $opts->firstWhere('unit_id', $unitId);
        if ($option) {
            $f = (float) $option->conversion_factor;

            return $f > 0 ? $f : null;
        }
        if ((int) $this->unit_id === (int) $unitId) {
            return 1.0;
        }

        return null;
    }

    /**
     * تحويل كمية من وحدة معينة إلى الوحدة الصغرى (للتخزين في الحركات).
     */
    public function quantityToBase(float $quantity, ?int $unitId): float
    {
        $factor = $this->getConversionFactorToBase($unitId);

        return round($quantity * $factor, 6);
    }

    /**
     * تحويل الرصيد (بالوحدة الصغرى) إلى تفصيل حسب الوحدات (كرتون، علبة، قطعة).
     * يُرجع مصفوفة [ ['unit_id' => x, 'unit_name' => '...', 'quantity' => n], ... ] من الأكبر للأصغر.
     */
    public function getStockBreakdownByUnits(?int $warehouseId = null): array
    {
        $baseQty = $this->currentStock($warehouseId);
        $options = $this->unitOptions()->with('unit')->orderByDesc('conversion_factor')->get();
        if ($options->isEmpty()) {
            $u = $this->itemUnit;

            return [
                [
                    'unit_id' => $this->unit_id,
                    'unit_name' => $u ? $u->name : ($this->unit ?? '—'),
                    'quantity' => round($baseQty, 4),
                ],
            ];
        }
        $breakdown = [];
        $remaining = (float) $baseQty;
        $baseOption = $options->firstWhere('is_base', true) ?? $options->sortBy('conversion_factor')->first();
        foreach ($options as $opt) {
            $factor = (float) $opt->conversion_factor;
            if ($factor <= 0) {
                continue;
            }
            $qtyInThisUnit = floor($remaining / $factor);
            if ($qtyInThisUnit >= 0.0001) {
                $breakdown[] = [
                    'unit_id' => $opt->unit_id,
                    'unit_name' => $opt->unit ? $opt->unit->name : '—',
                    'quantity' => round($qtyInThisUnit, 4),
                ];
                $remaining -= $qtyInThisUnit * $factor;
            }
        }
        if ($remaining >= 0.0001 && $baseOption) {
            $breakdown[] = [
                'unit_id' => $baseOption->unit_id,
                'unit_name' => $baseOption->unit ? $baseOption->unit->name : '—',
                'quantity' => round($remaining, 4),
            ];
        }

        return $breakdown;
    }
}
