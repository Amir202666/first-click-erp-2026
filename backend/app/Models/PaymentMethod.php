<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class PaymentMethod extends Model
{
    use BelongsToTenant, SoftDeletes;

    protected $fillable = [
        'tenant_id', 'name', 'name_en', 'type', 'linked_account_id', 'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    public function linkedAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'linked_account_id');
    }

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'payment_method_user')->withTimestamps();
    }
}
