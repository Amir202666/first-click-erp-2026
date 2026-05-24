<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

class RestaurantMenuItem extends Model
{
    use BelongsToTenant;

    protected $appends = ['image_url'];

    protected $fillable = [
        'tenant_id',
        'category_id',
        'item_id',
        'name',
        'name_en',
        'description',
        'description_en',
        'price',
        'original_price',
        'image',
        'emoji',
        'is_available',
        'allergens',
        'calories',
        'sort_order',
    ];

    protected $casts = [
        'price' => 'decimal:2',
        'original_price' => 'decimal:2',
        'is_available' => 'boolean',
        'allergens' => 'array',
    ];

    public function category(): BelongsTo
    {
        return $this->belongsTo(RestaurantMenuCategory::class, 'category_id');
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class, 'item_id');
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
