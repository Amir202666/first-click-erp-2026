<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class RestaurantTable extends Model
{
    use BelongsToTenant;

    protected $fillable = [
        'tenant_id',
        'branch_id',
        'name',
        'code',
        'section',
        'capacity',
        'shape',
        'status',
        'sort_order',
        'occupied_at',
        'closed_at',
    ];

    protected $casts = [
        'occupied_at' => 'datetime',
        'closed_at' => 'datetime',
    ];

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function invoices(): HasMany
    {
        return $this->hasMany(Invoice::class, 'table_id');
    }

    public function reservations(): HasMany
    {
        return $this->hasMany(RestaurantReservation::class, 'table_id');
    }
}
