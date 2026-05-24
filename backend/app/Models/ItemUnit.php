<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ItemUnit extends Model
{
    use BelongsToTenant;

    protected $fillable = ['tenant_id', 'name', 'name_en', 'symbol', 'is_active'];

    protected $casts = ['is_active' => 'boolean'];

    public function items(): HasMany
    {
        return $this->hasMany(Item::class, 'unit_id');
    }
}
