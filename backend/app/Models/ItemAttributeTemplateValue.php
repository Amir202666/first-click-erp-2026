<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ItemAttributeTemplateValue extends Model
{
    protected $fillable = ['template_id', 'value'];

    public function template(): BelongsTo
    {
        return $this->belongsTo(ItemAttributeTemplate::class, 'template_id');
    }
}
