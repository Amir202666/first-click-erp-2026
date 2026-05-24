<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PrintTemplate extends Model
{
    protected $fillable = [
        'tenant_id',
        'name',
        'document_type',
        'layout',
        'paper_size',
        'orientation',
        'margins',
        'settings',
        'sections',
        'html_content',
        'blocks_json',
        'is_default',
        'is_system',
        'sort_order',
    ];

    protected $casts = [
        'margins' => 'array',
        'settings' => 'array',
        'sections' => 'array',
        'is_default' => 'boolean',
        'is_system' => 'boolean',
    ];

    /** @var array<string, string> */
    public const TYPES = [
        'invoice' => 'فاتورة مبيعات',
        'receipt' => 'سند قبض',
        'payment' => 'سند صرف',
        'journal' => 'قيد يومية',
        'purchase' => 'فاتورة مشتريات',
        'inventory' => 'تسوية مخزنية',
        'pos' => 'إيصال POS',
    ];

    /** @var array<string, array{width: int, height: int|null, label: string}> */
    public const PAPER_SIZES = [
        'A4' => ['width' => 210, 'height' => 297, 'label' => 'A4'],
        'A5' => ['width' => 148, 'height' => 210, 'label' => 'A5'],
        'thermal_80' => ['width' => 80, 'height' => null, 'label' => 'حراري 80mm'],
        'thermal_58' => ['width' => 58, 'height' => null, 'label' => 'حراري 58mm'],
    ];

    public static function defaultMargins(): array
    {
        return [
            'top' => 10,
            'right' => 10,
            'bottom' => 10,
            'left' => 10,
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    /** @param  \Illuminate\Database\Eloquent\Builder<self>  $query */
    public function scopeForTenant($query, int $tenantId)
    {
        return $query->where('tenant_id', $tenantId);
    }
}
