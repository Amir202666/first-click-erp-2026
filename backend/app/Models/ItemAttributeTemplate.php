<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ItemAttributeTemplate extends Model
{
    use BelongsToTenant;

    protected $fillable = ['tenant_id', 'name'];

    public function values(): HasMany
    {
        return $this->hasMany(ItemAttributeTemplateValue::class, 'template_id');
    }
}
