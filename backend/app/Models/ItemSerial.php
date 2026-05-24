<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class ItemSerial extends Model
{
    use BelongsToTenant;

    public const STATUS_AVAILABLE = 'available';

    public const STATUS_SOLD = 'sold';

    public const STATUS_RESERVED = 'reserved';

    public const STATUS_RETURNED = 'returned';

    public const STATUS_DAMAGED = 'damaged';

    protected $fillable = [
        'tenant_id', 'item_id', 'warehouse_id', 'serial_number', 'status',
        'reference_type', 'reference_id',
    ];

    protected $casts = [
        //
    ];

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function reference(): MorphTo
    {
        return $this->morphTo();
    }

    public function invoiceLineSerial(): HasOne
    {
        return $this->hasOne(InvoiceLineSerial::class, 'item_serial_id');
    }

    public function isAvailable(): bool
    {
        return $this->status === self::STATUS_AVAILABLE;
    }

    /**
     * التحقق من عدم تكرار الرقم التسلسلي لنفس الـ tenant ونفس الصنف.
     * يُسمح بتكرار الرقم لشركات (tenants) أخرى لأن العزل حسب tenant_id.
     */
    public static function isSerialUniqueForTenantItem(int $tenantId, int $itemId, string $serialNumber, ?int $excludeId = null): bool
    {
        $serialNumber = trim($serialNumber);
        if ($serialNumber === '') {
            return false;
        }

        $query = static::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->where('item_id', $itemId)
            ->where('serial_number', $serialNumber);

        if ($excludeId !== null) {
            $query->where('id', '!=', $excludeId);
        }

        return ! $query->exists();
    }
}
