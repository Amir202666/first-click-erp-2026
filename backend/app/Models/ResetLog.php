<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ResetLog extends Model
{
    protected $fillable = [
        'tenant_id',
        'tenant_name',
        'modules',
        'deleted_counts',
        'confirmed_by',
        'executed_at',
    ];

    protected $casts = [
        'modules' => 'array',
        'deleted_counts' => 'array',
        'executed_at' => 'datetime',
    ];
}
