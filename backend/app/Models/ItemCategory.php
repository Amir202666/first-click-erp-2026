<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Storage;

class ItemCategory extends Model
{
    use BelongsToTenant;

    protected $appends = ['image_url'];

    protected $fillable = [
        'tenant_id', 'parent_id', 'code', 'name', 'name_en', 'description', 'image', 'is_active',
        'show_in_pos', 'show_in_restaurant_pos',
        'applies_to_all_branches',
        'inventory_account_id', 'cost_of_sales_account_id', 'sales_account_id',
    ];

    public function inventoryAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'inventory_account_id');
    }

    public function costOfSalesAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'cost_of_sales_account_id');
    }

    public function salesAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'sales_account_id');
    }

    protected $casts = [
        'is_active' => 'boolean',
        'applies_to_all_branches' => 'boolean',
        'show_in_pos' => 'boolean',
        'show_in_restaurant_pos' => 'boolean',
    ];

    public function branches(): BelongsToMany
    {
        return $this->belongsToMany(Branch::class, 'branch_item_category')->withTimestamps();
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(ItemCategory::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(ItemCategory::class, 'parent_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(Item::class, 'category_id');
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
