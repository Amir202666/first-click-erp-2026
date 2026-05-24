<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SalesRep extends Model
{
    use BelongsToTenant;

    protected $table = 'sales_reps';

    protected $fillable = [
        'tenant_id',
        'name',
        'region',
        'address',
        'phone',
        'commission_percent',
        'is_active',
    ];

    protected $casts = [
        'commission_percent' => 'decimal:2',
        'is_active' => 'boolean',
    ];

    public function branches(): BelongsToMany
    {
        return $this->belongsToMany(Branch::class, 'sales_rep_branch', 'sales_rep_id', 'branch_id');
    }

    public function invoices(): HasMany
    {
        return $this->hasMany(Invoice::class, 'sales_rep_id');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class, 'sales_rep_id');
    }
}
