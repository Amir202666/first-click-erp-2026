<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PlatformLoginPageSetting extends Model
{
    protected $table = 'platform_login_page_settings';

    protected $fillable = ['content'];

    protected $casts = [
        'content' => 'array',
    ];
}
