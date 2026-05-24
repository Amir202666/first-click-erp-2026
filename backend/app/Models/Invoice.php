<?php

namespace App\Models;

use App\Services\FiscalYearLockService;
use App\Traits\Auditable;
use App\Traits\BelongsToTenant;
use App\Traits\HasAutoNumber;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Support\Facades\Storage;

class Invoice extends Model
{
    use Auditable, BelongsToTenant, HasAutoNumber;

    protected static function booted(): void
    {
        static::creating(function (Invoice $invoice) {
            FiscalYearLockService::assertDateWritable((int) $invoice->tenant_id, $invoice->date);
            if ($invoice->document_status === null || $invoice->document_status === '') {
                $invoice->document_status = 'draft';
            }
            if ($invoice->payment_status === null || $invoice->payment_status === '') {
                $invoice->payment_status = 'na';
            }
        });

        static::updating(function (Invoice $invoice) {
            if ($invoice->isDirty('date')) {
                FiscalYearLockService::assertDateWritable((int) $invoice->tenant_id, $invoice->date);
            }
            $dirty = $invoice->getDirty();
            unset($dirty['updated_at'], $dirty['date']);
            if ($dirty !== []) {
                FiscalYearLockService::assertDateWritable((int) $invoice->tenant_id, $invoice->getOriginal('date'));
            }
        });

        static::deleting(function (Invoice $invoice) {
            FiscalYearLockService::assertDateWritable((int) $invoice->tenant_id, $invoice->date);
            // 0. حذف مدفوعات نقطة البيع المرتبطة (invoice_payments)
            $invoice->invoicePayments()->delete();

            // 1. حذف أسطر الفاتورة أولاً (المنتجات داخل الفاتورة)
            $invoice->lines()->delete();

            // 2. حذف حركات المخزن المرتبطة (مبيعات، مشتريات، مرتجعات)
            \App\Models\InventoryMovement::withoutGlobalScopes()
                ->where('reference_type', get_class($invoice))
                ->where('reference_id', $invoice->id)
                ->delete();

            // 3. حذف القيد المحاسبي المرتبط
            foreach (['journal_entry_id', 'manufacturing_journal_entry_id'] as $jeField) {
                $jid = $invoice->{$jeField} ?? null;
                if ($jid) {
                    $entry = \App\Models\JournalEntry::withoutGlobalScopes()->find($jid);
                    if ($entry) {
                        $entry->lines()->delete();
                        $entry->delete();
                    }
                }
            }

            // حذف المرفق من التخزين
            if ($invoice->attachment) {
                Storage::disk('public')->delete($invoice->attachment);
            }
        });
    }

    protected string $numberPrefix = '';

    protected $fillable = [
        'tenant_id', 'number', 'reference_number', 'type', 'is_return', 'parent_invoice_id', 'status', 'document_status', 'payment_status',
        'customer_id', 'vendor_id', 'branch_id', 'warehouse_id', 'pos_shift_id', 'pos_session_id', 'payment_method_id', 'pricing_group_id', 'cost_center_id',
        'date', 'due_date', 'payment_terms', 'receipt_status', 'payment_timing',
        'subtotal', 'tax_amount', 'discount_amount', 'total', 'cost_amount', 'auto_manufacturing_applied',
        'amount_paid', 'balance', 'currency', 'exchange_rate',
        'journal_entry_id', 'manufacturing_journal_entry_id', 'quotation_id', 'printed_at', 'delivery_ready_at', 'notes', 'metadata', 'created_by', 'sales_rep_id',
        'order_type', 'table_id', 'delivery_driver_id', 'attachment',
        'delivery_fees', 'delivery_fees_total',
    ];

    protected $appends = ['attachment_url'];

    public function parentInvoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class, 'parent_invoice_id');
    }

    public function quotation(): BelongsTo
    {
        return $this->belongsTo(Quotation::class);
    }

    public function returnInvoices(): HasMany
    {
        return $this->hasMany(Invoice::class, 'parent_invoice_id');
    }

    public function deliveryAssignments(): HasMany
    {
        return $this->hasMany(DeliveryAssignment::class);
    }

    /** إسناد نشط بانتظار التحصيل من السائق */
    public function activeDeliveryAssignment(): HasOne
    {
        return $this->hasOne(DeliveryAssignment::class)->where('status', 'assigned');
    }

    public function deliveryDriver(): BelongsTo
    {
        return $this->belongsTo(DeliveryDriver::class, 'delivery_driver_id');
    }

    public function shippingOrder(): HasOne
    {
        return $this->hasOne(ShippingOrder::class);
    }

    protected $casts = [
        'auto_manufacturing_applied' => 'boolean',
        'is_return' => 'boolean',
        'date' => 'date',
        'due_date' => 'date',
        'subtotal' => 'decimal:3',
        'tax_amount' => 'decimal:3',
        'discount_amount' => 'decimal:3',
        'delivery_fees_total' => 'decimal:3',
        'total' => 'decimal:3',
        'amount_paid' => 'decimal:3',
        'balance' => 'decimal:3',
        'exchange_rate' => 'decimal:8',
        'metadata' => 'array',
        'delivery_fees' => 'array',
        'printed_at' => 'datetime',
        'delivery_ready_at' => 'datetime',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function vendor(): BelongsTo
    {
        return $this->belongsTo(Vendor::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function paymentMethod(): BelongsTo
    {
        return $this->belongsTo(PaymentMethod::class);
    }

    public function pricingGroup(): BelongsTo
    {
        return $this->belongsTo(PricingGroup::class, 'pricing_group_id');
    }

    public function costCenter(): BelongsTo
    {
        return $this->belongsTo(CostCenter::class);
    }

    public function table(): BelongsTo
    {
        return $this->belongsTo(RestaurantTable::class, 'table_id');
    }

    public function salesRep(): BelongsTo
    {
        return $this->belongsTo(SalesRep::class, 'sales_rep_id');
    }

    public function lines(): HasMany
    {
        return $this->hasMany(InvoiceLine::class)->orderBy('sort_order')->orderBy('id');
    }

    /** جدول أقساط مرتبط بالفاتورة (إن وُجد) */
    public function installment(): HasOne
    {
        return $this->hasOne(Installment::class);
    }

    /** مصاريف الشراء الإضافية (شحن، جمارك، …) مع توزيع التكلفة على أسطر الأصناف */
    public function additionalExpenses(): HasMany
    {
        return $this->hasMany(InvoiceAdditionalExpense::class)->orderBy('sort_order')->orderBy('id');
    }

    public function journalEntry(): BelongsTo
    {
        return $this->belongsTo(JournalEntry::class);
    }

    /** قيد التصنيع الآلي (BOM عند البيع) — منفصل عن قيد المبيعات */
    public function manufacturingJournalEntry(): BelongsTo
    {
        return $this->belongsTo(JournalEntry::class, 'manufacturing_journal_entry_id');
    }

    /** لقطات BOM المجمّدة لحظة ترحيل البيع (لا تتأثر بتعديل BOM لاحقاً) */
    public function manufacturingFrozenBatches(): HasMany
    {
        return $this->hasMany(InvoiceManufacturingFrozenBatch::class);
    }

    /** حركات المخزن المرتبطة بالفاتورة (علاقة متعددة الأشكال) */
    public function inventoryMovements(): MorphMany
    {
        return $this->morphMany(InventoryMovement::class, 'reference');
    }

    public function posShift(): BelongsTo
    {
        return $this->belongsTo(PosShift::class, 'pos_shift_id');
    }

    public function posSession(): BelongsTo
    {
        return $this->belongsTo(PosSession::class, 'pos_session_id');
    }

    /** فواتير كاشير POS (تستثني مبيعات المطعم التي قد تشارك نفس الوردية) */
    public function scopePosSalesOnly($query)
    {
        return $query->whereNotNull('pos_shift_id')
            ->where(function ($q) {
                $q->whereNull('table_id')
                    ->where(function ($q2) {
                        $q2->whereNull('order_type')
                            ->orWhere('order_type', '!=', 'dine_in');
                    });
            });
    }

    /** فواتير مطعم: محلي (dine_in) أو مرتبطة بطاولة */
    public function scopeRestaurantSalesOnly($query)
    {
        return $query->where(function ($w) {
            $w->whereNotNull('table_id')
                ->orWhere('order_type', 'dine_in');
        });
    }

    public function invoicePayments(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(InvoicePayment::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class, 'invoice_id');
    }

    public function kitchenTickets(): HasMany
    {
        return $this->hasMany(KitchenTicket::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function getAttachmentUrlAttribute(): ?string
    {
        if (! $this->attachment) {
            return null;
        }

        return Storage::disk('public')->exists($this->attachment)
            ? asset('storage/'.$this->attachment)
            : null;
    }

    /**
     * إعادة حساب المجموع والضريبة والإجمالي من البنود.
     * الوعاء الضريبي = المجموع الفرعي − الخصم + رسوم التوصيل/الإضافات؛ تُقيَّس ضريبة البنود تناسبياً مع ذلك ثم الصافي = الوعاء + الضريبة.
     */
    public function recalculate(): void
    {
        $decimals = $this->getCurrencyDecimalPlaces();
        $lines = $this->lines()->get();

        $rawSubtotal = $lines->sum(fn ($l) => (float) $l->quantity * (float) $l->unit_price);
        $this->subtotal = round($rawSubtotal, $decimals);

        $amountAfterLineDiscount = round((float) $this->lines()->sum('amount'), $decimals);
        $lineDiscountTotal = round($rawSubtotal - $amountAfterLineDiscount, $decimals);
        $headerDiscount = (float) $this->discount_amount;
        $totalDiscount = round($lineDiscountTotal + $headerDiscount, $decimals);

        $taxableBeforeDelivery = round(max(0, $rawSubtotal - $totalDiscount), $decimals);
        $deliveryExtra = round((float) ($this->delivery_fees_total ?? 0), $decimals);
        $taxableAmount = round($taxableBeforeDelivery + $deliveryExtra, $decimals);
        $taxSumLines = (float) $lines->sum('tax_amount');
        if ($taxableBeforeDelivery > 0.0000001) {
            $taxAmount = round($taxSumLines * ($taxableAmount / $taxableBeforeDelivery), $decimals);
        } else {
            $taxAmount = round($taxSumLines, $decimals);
        }
        $this->tax_amount = $taxAmount;
        $this->total = round($taxableAmount + $taxAmount, $decimals);
        $this->balance = round($this->total - (float) $this->amount_paid, $decimals);
        $this->saveQuietly();
    }

    /** عدد الكسور العشرية لعملة الفاتورة (من إعدادات العملة أو إعدادات المستند). */
    public function getCurrencyDecimalPlaces(): int
    {
        if ($this->currency) {
            $currencyModel = Currency::where('tenant_id', $this->tenant_id)->where('code', $this->currency)->first();
            if ($currencyModel) {
                return (int) ($currencyModel->decimal_places ?: 2);
            }
        }
        $settings = app(\App\Services\TenantSettingsService::class)->getAll($this->tenant_id);
        $docDecimals = $settings['doc_amount_decimals'] ?? null;
        if ($docDecimals !== null && $docDecimals !== '') {
            return (int) $docDecimals;
        }
        $defaultCode = $settings['doc_default_currency_code'] ?? null;
        if ($defaultCode) {
            $currencyModel = Currency::where('tenant_id', $this->tenant_id)->where('code', $defaultCode)->first();
            if ($currencyModel) {
                return (int) ($currencyModel->decimal_places ?: 2);
            }
        }

        return 2;
    }

    public function isPaid(): bool
    {
        return bccomp((string) $this->balance, '0', 4) <= 0;
    }

    public function isOverdue(): bool
    {
        return $this->due_date && $this->due_date->isPast() && ! $this->isPaid();
    }

    public function getNumberPrefix(): string
    {
        if (! empty($this->is_return)) {
            return '';
        }

        return $this->type === 'sales' ? 'INV' : 'PUR';
    }

    protected static function generateNextNumber($model): string
    {
        $defaultPrefix = $model->getNumberPrefix();
        if ($defaultPrefix === '') {
            return (string) ((int) static::withoutGlobalScopes()->where('tenant_id', $model->tenant_id)->max('id') + 1);
        }

        // قراءة إعدادات "الأرقام المرجعية" (إن وُجدت) لتوليد رقم الفاتورة فعلياً
        $settingsSvc = app(\App\Services\TenantSettingsService::class);
        $refSettings = $settingsSvc->get((int) $model->tenant_id, 'ref_number_settings', null);
        $format = is_array($refSettings) ? (string) ($refSettings['format'] ?? 'sequential') : 'sequential';
        $docs = is_array($refSettings) ? ($refSettings['docs'] ?? []) : [];
        $docKey = $model->type === 'sales' ? 'sales' : 'purchases';
        $docCfg = is_array($docs) && array_key_exists($docKey, $docs) && is_array($docs[$docKey]) ? $docs[$docKey] : [];

        $cfgPrefixRaw = (string) ($docCfg['prefix'] ?? '');

        // لو المستخدم كتب رقم مثل 0001 نعتبره "بداية التسلسل" وليس بادئة
        $startSeqMin = 1;
        $prefix = $defaultPrefix;
        if ($cfgPrefixRaw !== '' && preg_match('/^\d+$/', $cfgPrefixRaw)) {
            $startSeqMin = max(1, (int) $cfgPrefixRaw);
        } elseif ($cfgPrefixRaw !== '') {
            $prefix = $cfgPrefixRaw;
        }

        $date = $model->date ? (string) $model->date : date('Y-m-d');
        $year = (int) substr($date, 0, 4);
        $month = (int) substr($date, 5, 2);

        // أقصى تسلسل من كل فواتير النوع للمستأجر (بدون تقييد بالفرع): رقم الفاتورة فريد على مستوى
        // المستأجر؛ تقييد الاستعلام بالفرع فقط كان يُولّد INV-2026-0001 لكل فرع على حدة ويصطدم بقيد التفرد.
        $q = static::withoutGlobalScopes()
            ->where('tenant_id', $model->tenant_id)
            ->where('is_return', false)
            ->where('type', $model->type);

        // تضييق البحث حسب الصيغة لتسريع/تقليل أخطاء الالتقاط
        if ($format === 'month_year_seq') {
            $q->where('number', 'like', $prefix.'-%/%/%');
        } elseif ($format === 'year_seq') {
            $q->where('number', 'like', $prefix.'-%-%');
        } elseif ($format === 'random') {
            $q->where('number', 'like', $prefix.'-%');
        } else {
            $q->where('number', 'like', $prefix.'-%');
        }

        $numbers = $q->pluck('number');

        $maxSeq = 0;
        foreach ($numbers as $num) {
            $num = (string) $num;
            $seq = null;

            if ($format === 'month_year_seq') {
                // PREFIX-MM/YYYY/SEQ
                if (preg_match('/^'.preg_quote($prefix, '/').'\-(\d{1,2})\/(\d{4})\/(\d+)$/', $num, $m)) {
                    $mMonth = (int) $m[1];
                    $mYear = (int) $m[2];
                    if ($mYear === $year && $mMonth === $month) {
                        $seq = (int) $m[3];
                    }
                }
            } elseif ($format === 'year_seq') {
                // PREFIX-YYYY-SEQ
                if (preg_match('/^'.preg_quote($prefix, '/').'\-(\d{4})\-(\d+)$/', $num, $m)) {
                    $mYear = (int) $m[1];
                    if ($mYear === $year) {
                        $seq = (int) $m[2];
                    }
                }
            } elseif ($format === 'random') {
                // لا نعتمد تسلسل، سنولّد قيمة عشوائية
                $seq = null;
            } else {
                // sequential: PREFIX-SEQ
                if (preg_match('/^'.preg_quote($prefix, '/').'\-(\d+)$/', $num, $m)) {
                    $seq = (int) $m[1];
                }
            }

            if ($seq !== null && $seq > $maxSeq) {
                $maxSeq = $seq;
            }
        }

        if ($format === 'random') {
            // رقم عشوائي 6 خانات مع التأكد من عدم التكرار قدر الإمكان
            for ($i = 0; $i < 20; $i++) {
                $rand = (string) random_int(100000, 999999);
                $candidate = $prefix.'-'.$rand;
                $exists = static::withoutGlobalScopes()
                    ->where('tenant_id', $model->tenant_id)
                    ->where('number', $candidate)
                    ->exists();
                if (! $exists) {
                    return $candidate;
                }
            }

            // fallback
            return $prefix.'-'.(string) random_int(100000, 999999);
        }

        $next = max($startSeqMin, $maxSeq + 1);
        $seqStr = str_pad((string) $next, 4, '0', STR_PAD_LEFT);

        if ($format === 'month_year_seq') {
            return sprintf('%s-%02d/%04d/%s', $prefix, $month, $year, $seqStr);
        }
        if ($format === 'year_seq') {
            return sprintf('%s-%04d-%s', $prefix, $year, $seqStr);
        }

        return $prefix.'-'.$seqStr;
    }
}
