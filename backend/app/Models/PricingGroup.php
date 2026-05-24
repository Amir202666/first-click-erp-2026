<?php

namespace App\Models;

use App\Traits\Auditable;
use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PricingGroup extends Model
{
    use Auditable, BelongsToTenant;

    protected $fillable = [
        'tenant_id',
        'name',
        'operation_type', // discount_percent | increase_percent | fixed_price
        'pricing_type', // fixed | percent
        'value',
        'is_active',
    ];

    protected $casts = [
        'value' => 'decimal:4',
        'is_active' => 'boolean',
    ];

    public function customers(): HasMany
    {
        return $this->hasMany(Customer::class, 'pricing_group_id');
    }

    public function branches(): BelongsToMany
    {
        return $this->belongsToMany(Branch::class, 'pricing_group_branch')->withTimestamps();
    }

    /** مستخدمو الشركة (tenant_users) الذين يُسمح لهم باستخدام هذه المجموعة */
    public function tenantUsers(): BelongsToMany
    {
        return $this->belongsToMany(
            TenantUser::class,
            'pricing_group_tenant_user',
            'pricing_group_id',
            'tenant_user_id',
            'id',
            'id'
        )->withTimestamps();
    }
}
