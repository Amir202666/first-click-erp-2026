<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Tenant extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'name',
        'name_en',
        'slug',
        'address',
        'country',
        'city',
        'activity',
        'tax_registration_number',
        'contacts',
        'email',
        'phone',
        'logo',
        'domain',
        'database_name',
        'schema_name',
        'default_currency',
        'fiscal_year_start',
        'inventory_method',
        'vat_enabled',
        'vat_rate',
        'is_active',
        'settings',
    ];

    protected $casts = [
        'contacts' => 'array',
        'settings' => 'array',
        'vat_enabled' => 'boolean',
        'is_active' => 'boolean',
        'vat_rate' => 'decimal:2',
    ];

    public function users()
    {
        return $this->belongsToMany(User::class, 'tenant_users')
            ->withPivot('role', 'role_id', 'permissions', 'is_active', 'default_branch_id', 'default_warehouse_id', 'restrict_to_branch_warehouse')
            ->withTimestamps();
    }

    public function roles(): HasMany
    {
        return $this->hasMany(Role::class);
    }

    public function subscriptions(): HasMany
    {
        return $this->hasMany(Subscription::class);
    }

    public function activeSubscription()
    {
        return $this->hasOne(Subscription::class)->where('status', 'active')->latest();
    }
}
