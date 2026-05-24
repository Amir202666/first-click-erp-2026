<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class TenantSetting extends Model
{
    use BelongsToTenant;

    protected $table = 'tenant_settings';

    protected $fillable = ['tenant_id', 'key', 'value'];
}
