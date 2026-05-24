<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class RestaurantMenuSetting extends Model
{
    use BelongsToTenant;

    protected $fillable = [
        'tenant_id',
        'primary_color',
        'service_charge_percent',
        'cover_image',
        'is_published',
    ];

    protected $casts = [
        'is_published' => 'boolean',
        'service_charge_percent' => 'integer',
    ];
}
