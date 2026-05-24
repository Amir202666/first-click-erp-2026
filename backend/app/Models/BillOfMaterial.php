<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class BillOfMaterial extends Model
{
    use BelongsToTenant;

    protected $table = 'bill_of_materials';

    protected $fillable = [
        'tenant_id',
        'finished_item_id',
        'name',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    public function finishedItem(): BelongsTo
    {
        return $this->belongsTo(Item::class, 'finished_item_id');
    }

    public function lines(): HasMany
    {
        return $this->hasMany(BillOfMaterialLine::class, 'bill_of_material_id')->orderBy('sort_order');
    }

    public function getTotalCostAttribute(): float
    {
        $sum = 0;
        foreach ($this->lines as $line) {
            $sum += $line->line_total;
        }

        return round((float) $sum, 4);
    }
}
