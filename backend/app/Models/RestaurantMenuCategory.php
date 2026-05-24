<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Storage;

class RestaurantMenuCategory extends Model
{
    use BelongsToTenant;

    protected $appends = ['image_url'];

    protected $fillable = [
        'tenant_id',
        'name',
        'name_en',
        'icon',
        'image',
        'sort_order',
    ];

    public function items(): HasMany
    {
        return $this->hasMany(RestaurantMenuItem::class, 'category_id');
    }

    public function getImageUrlAttribute(): ?string
    {
        if (! $this->image) {
            return null;
        }

        return Storage::disk('public')->exists($this->image)
            ? asset('storage/'.$this->image)
            : null;
    }
}
