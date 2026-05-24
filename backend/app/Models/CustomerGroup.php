<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CustomerGroup extends Model
{
    use BelongsToTenant;

    protected $fillable = [
        'tenant_id',
        'name',
        'discount_type',
        'discount_value',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'discount_value' => 'decimal:4',
    ];

    public function customers(): HasMany
    {
        return $this->hasMany(Customer::class);
    }
}
