<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ProductModifierGroup extends Model
{
    use BelongsToTenant;

    protected $fillable = [
        'tenant_id',
        'name',
        'is_required',
        'max_select',
        'sort_order',
    ];

    protected $casts = [
        'is_required' => 'boolean',
    ];

    public function options(): HasMany
    {
        return $this->hasMany(ProductModifierOption::class, 'group_id');
    }

    public function items(): BelongsToMany
    {
        return $this->belongsToMany(Item::class, 'item_modifier_group', 'group_id', 'item_id');
    }
}
