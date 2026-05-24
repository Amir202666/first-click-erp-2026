<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class InstallmentPeriod extends Model
{
    protected $fillable = [
        'tenant_id',
        'code',
        'months',
        'name',
        'name_en',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];
}
