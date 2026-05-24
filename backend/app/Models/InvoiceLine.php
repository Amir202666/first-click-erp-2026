<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class InvoiceLine extends Model
{
    protected $fillable = [
        'invoice_id', 'item_id', 'item_variant_id', 'unit_id', 'account_id', 'description',
        'quantity', 'unit_price', 'discount_percent', 'discount_amount', 'tax_percent',
        'amount', 'tax_amount', 'total', 'sort_order', 'serial_numbers',
        'landed_cost_allocated', 'distribution_weight',
        'expiry_date', 'batch_number',
    ];

    protected $casts = [
        'expiry_date' => 'date',
        'quantity' => 'decimal:4',
        'unit_price' => 'decimal:3',
        'discount_percent' => 'decimal:2',
        'discount_amount' => 'decimal:3',
        'tax_percent' => 'decimal:2',
        'amount' => 'decimal:3',
        'tax_amount' => 'decimal:3',
        'total' => 'decimal:3',
        'landed_cost_allocated' => 'decimal:3',
        'distribution_weight' => 'decimal:4',
    ];

    /** الأرقام التسلسلية (JSON). يعيد [] إذا كان العمود غير موجود أو القيمة فارغة (Null-safe للفواتير القديمة). */
    protected function serialNumbers(): \Illuminate\Database\Eloquent\Casts\Attribute
    {
        return \Illuminate\Database\Eloquent\Casts\Attribute::make(
            get: function (mixed $value): array {
                if ($value === null || $value === '') {
                    return [];
                }
                if (is_array($value)) {
                    return $value;
                }
                $decoded = is_string($value) ? json_decode($value, true) : null;

                return is_array($decoded) ? $decoded : [];
            },
            set: fn (mixed $value) => is_array($value) ? json_encode($value) : json_encode([]),
        );
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function itemVariant(): BelongsTo
    {
        return $this->belongsTo(ItemVariant::class, 'item_variant_id');
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(ItemUnit::class, 'unit_id');
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class);
    }

    public function modifiers(): HasMany
    {
        return $this->hasMany(InvoiceLineModifier::class, 'invoice_line_id');
    }

    public function serials(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(InvoiceLineSerial::class)->with('itemSerial');
    }

    /**
     * حقول تاريخ الصلاحية ورقم الباتش لنسخها إلى حركات المخزون.
     *
     * @return array{expiry_date: ?string, batch_number: ?string}
     */
    public function movementExpiryPayload(): array
    {
        $b = $this->batch_number;
        $batch = $b !== null && trim((string) $b) !== '' ? mb_substr(trim((string) $b), 0, 120) : null;
        $exp = $this->expiry_date;
        $expStr = $exp instanceof \Carbon\CarbonInterface
            ? $exp->format('Y-m-d')
            : ($exp ? (string) $exp : null);

        return [
            'expiry_date' => $expStr,
            'batch_number' => $batch,
        ];
    }

    /**
     * مبلغ السطر بعد خصم السطر، ثم ضريبة السطر حسب نسبة الضريبة المعرّفة للبند (صفر = بدون ضريبة).
     */
    public function calculateTotals(): void
    {
        $gross = (float) $this->quantity * (float) $this->unit_price;
        $discAmt = (float) ($this->discount_amount ?? 0);
        if ($discAmt > 0.000001) {
            $afterDisc = max(0, $gross - min($discAmt, $gross));
        } else {
            $afterDisc = $gross * (1 - (float) ($this->discount_percent ?? 0) / 100);
        }
        $taxPct = (float) ($this->tax_percent ?? 0);
        $this->amount = round($afterDisc, 3);
        $this->tax_amount = round($this->amount * ($taxPct / 100), 3);
        $this->total = round($this->amount + $this->tax_amount, 3);
    }
}
