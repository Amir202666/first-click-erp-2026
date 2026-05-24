<?php

namespace App\Traits;

use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

trait BelongsToTenant
{
    public static function bootBelongsToTenant(): void
    {
        static::creating(function ($model) {
            if (! $model->tenant_id && app()->bound('current_tenant')) {
                $model->tenant_id = app('current_tenant')->id;
            }
        });

        // Always register the scope; evaluate tenant at query-time.
        // This prevents missing the scope when the model boots before SetTenantContext runs.
        static::addGlobalScope('tenant', function (Builder $builder) {
            if (! app()->bound('current_tenant')) {
                return;
            }
            $builder->where($builder->getModel()->getTable().'.tenant_id', app('current_tenant')->id);
        });
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function scopeForTenant(Builder $query, int $tenantId): Builder
    {
        return $query->where('tenant_id', $tenantId);
    }
}
