<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Branch extends Model
{
    use BelongsToTenant, SoftDeletes;

    protected $fillable = [
        'tenant_id', 'name', 'name_en', 'code', 'address', 'phone', 'manager_name', 'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    public function customers(): BelongsToMany
    {
        return $this->belongsToMany(Customer::class, 'branch_customer')->withTimestamps();
    }

    public function vendors(): BelongsToMany
    {
        return $this->belongsToMany(Vendor::class, 'branch_vendor')->withTimestamps();
    }
}
