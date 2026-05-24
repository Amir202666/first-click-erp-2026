<?php

namespace App\Models;

use App\Casts\EncryptedOrPlain;
use App\Traits\Auditable;
use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Vendor extends Model
{
    use Auditable, BelongsToTenant;

    protected $fillable = [
        'tenant_id', 'code', 'name', 'name_en', 'company_name', 'tax_number', 'address',
        'country', 'city', 'email', 'phone', 'country_code', 'account_id', 'payment_terms',
        'vendor_group_id', 'currency', 'is_active', 'contacts', 'notes',
    ];

    protected $casts = [
        'tax_number' => EncryptedOrPlain::class,
        'address' => EncryptedOrPlain::class,
        'email' => EncryptedOrPlain::class,
        'phone' => EncryptedOrPlain::class,
        'contacts' => EncryptedOrPlain::class.':array',
        'notes' => EncryptedOrPlain::class,
        'is_active' => 'boolean',
    ];

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class);
    }

    public function vendorGroup(): BelongsTo
    {
        return $this->belongsTo(VendorGroup::class, 'vendor_group_id');
    }

    public function invoices(): HasMany
    {
        return $this->hasMany(Invoice::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(Item::class, 'default_vendor_id');
    }

    /** بدون صفوف = متاح في كل الفروع. */
    public function branches(): BelongsToMany
    {
        return $this->belongsToMany(Branch::class, 'branch_vendor')->withTimestamps();
    }
}
