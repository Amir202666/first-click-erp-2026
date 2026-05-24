<?php

namespace App\Models;

use App\Casts\EncryptedOrPlain;
use App\Traits\Auditable;
use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * العميل مرتبط بحساب فرعي في دليل الحسابات عبر account_id (حساب المدينون/العملاء الفرعي).
 * عند إضافة عميل جديد مع "إنشاء حساب تلقائياً" يُنشأ حساب فرعي تحت حساب العملاء ويُحفظ في account_id.
 */
class Customer extends Model
{
    use Auditable, BelongsToTenant;

    protected $fillable = [
        'tenant_id', 'code', 'name', 'name_en', 'company_name', 'tax_number', 'address',
        'country', 'city', 'email', 'phone', 'country_code', 'account_id', 'customer_group_id', 'payment_terms',
        'pricing_group_id', 'credit_limit', 'currency', 'is_active', 'contacts', 'notes',
        'loyalty_points_balance', 'loyalty_points_total_earned', 'loyalty_points_total_redeemed', 'loyalty_tier_id',
        'loyalty_balances',
    ];

    protected $casts = [
        'tax_number' => EncryptedOrPlain::class,
        'address' => EncryptedOrPlain::class,
        'email' => EncryptedOrPlain::class,
        'phone' => EncryptedOrPlain::class,
        'contacts' => EncryptedOrPlain::class.':array',
        'notes' => EncryptedOrPlain::class,
        'is_active' => 'boolean',
        'credit_limit' => 'decimal:4',
        'loyalty_points_balance' => 'decimal:3',
        'loyalty_points_total_earned' => 'decimal:3',
        'loyalty_points_total_redeemed' => 'decimal:3',
        'loyalty_balances' => 'array',
    ];

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class);
    }

    public function customerGroup(): BelongsTo
    {
        return $this->belongsTo(CustomerGroup::class);
    }

    public function pricingGroup(): BelongsTo
    {
        return $this->belongsTo(PricingGroup::class, 'pricing_group_id');
    }

    public function invoices(): HasMany
    {
        return $this->hasMany(Invoice::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    /**
     * فروع العمل; إن لم يُربط بأي فرع يُعتبر متاحاً في كل الفروع.
     */
    public function branches(): BelongsToMany
    {
        return $this->belongsToMany(Branch::class, 'branch_customer')->withTimestamps();
    }

    public function loyaltyTier(): BelongsTo
    {
        return $this->belongsTo(LoyaltyTier::class, 'loyalty_tier_id');
    }

    public function loyaltyPoints(): HasMany
    {
        return $this->hasMany(LoyaltyPoint::class, 'customer_id');
    }
}
