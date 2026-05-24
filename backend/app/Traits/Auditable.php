<?php

namespace App\Traits;

use App\Models\AuditLog;

trait Auditable
{
    public static function bootAuditable(): void
    {
        static::created(function ($model) {
            static::logAudit($model, 'created', null, $model->toArray());
        });

        static::updated(function ($model) {
            $original = $model->getOriginal();
            $changes = $model->getChanges();
            if (! empty($changes)) {
                static::logAudit($model, 'updated', $original, $changes);
            }
        });

        static::deleted(function ($model) {
            static::logAudit($model, 'deleted', $model->toArray(), null);
        });
    }

    protected static function logAudit($model, string $action, ?array $oldValues, ?array $newValues): void
    {
        try {
            AuditLog::create([
                'tenant_id' => $model->tenant_id ?? null,
                'user_id' => auth()->id(),
                'action' => $action,
                'model_type' => get_class($model),
                'model_id' => $model->id,
                'table_name' => $model->getTable(),
                'old_values' => $oldValues,
                'new_values' => $newValues,
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);
        } catch (\Throwable) {
            // Silently fail to not break main operations
        }
    }
}
