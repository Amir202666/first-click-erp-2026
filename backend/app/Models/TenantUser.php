<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\Pivot;

/**
 * يمثل صف الربط بين المستخدم والشركة (tenant_users) وله id مستقل.
 */
class TenantUser extends Pivot
{
    protected $table = 'tenant_users';

    protected $guarded = [];

    protected $casts = [
        'permissions' => 'array',
        'is_active' => 'boolean',
        'restrict_to_branch_warehouse' => 'boolean',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function roleModel(): BelongsTo
    {
        return $this->belongsTo(Role::class, 'role_id');
    }
}
