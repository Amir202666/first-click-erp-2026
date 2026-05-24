<?php

namespace App\Services;

use App\Models\AuditLog;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class AuditLogService
{
    public function log(
        string $action,
        ?string $tableName,
        ?Model $model = null,
        ?array $oldValues = null,
        ?array $newValues = null,
        ?int $tenantId = null,
        ?int $userId = null,
        ?Request $request = null
    ): AuditLog {
        $request = $request ?? request();
        $userId = $userId ?? Auth::id();
        if ($model) {
            $tenantId = $tenantId ?? ($model->tenant_id ?? null);
        }

        $tableNameResolved = $tableName ?? ($model ? $model->getTable() : null);

        return AuditLog::create([
            'tenant_id' => $tenantId,
            'user_id' => $userId,
            'action' => $action,
            'model_type' => $model ? $model->getMorphClass() : ($tableNameResolved ?? 'audit'),
            'model_id' => $model?->getKey(),
            'table_name' => $tableNameResolved,
            'old_values' => $oldValues,
            'new_values' => $newValues,
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);
    }

    public function logLogin(int $userId, bool $success = true, ?int $tenantId = null): void
    {
        $this->log(
            $success ? 'login' : 'login_failed',
            'sessions',
            null,
            null,
            ['user_id' => $userId],
            $tenantId,
            $userId
        );
    }

    public function logLogout(int $userId, ?int $tenantId = null): void
    {
        $this->log('logout', 'sessions', null, null, ['user_id' => $userId], $tenantId, $userId);
    }
}
