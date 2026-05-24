<?php

namespace App\Models;

use App\Traits\Auditable;
use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DeliveryDriver extends Model
{
    use Auditable, BelongsToTenant;

    protected $fillable = [
        'tenant_id', 'code', 'name', 'phone', 'national_id', 'vehicle_type',
        'custody_account_id', 'is_active', 'notes',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    public function custodyAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'custody_account_id');
    }

    public function assignments(): HasMany
    {
        return $this->hasMany(DeliveryAssignment::class, 'driver_id');
    }

    public function branches(): BelongsToMany
    {
        return $this->belongsToMany(Branch::class, 'branch_delivery_driver', 'delivery_driver_id', 'branch_id')
            ->withTimestamps();
    }
}
