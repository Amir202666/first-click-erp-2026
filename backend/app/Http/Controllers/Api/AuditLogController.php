<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuditLogController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'per_page' => 'sometimes|integer|min:1|max:200',
            'user_id' => 'sometimes|integer',
            'action' => 'sometimes|string|max:100',
            'table_name' => 'sometimes|string|max:100',
            'from_date' => 'sometimes|date',
            'to_date' => 'sometimes|date',
        ]);

        $tenantId = (int) $request->tenant_id;
        $perPage = (int) ($request->per_page ?? 50);
        $perPage = min(max($perPage, 1), 200);

        $query = AuditLog::where('tenant_id', $tenantId)
            ->with('user:id,name,email')
            ->orderByDesc('created_at');

        if ($request->filled('user_id')) {
            $query->where('user_id', $request->user_id);
        }
        if ($request->filled('action')) {
            $query->where('action', $request->action);
        }
        if ($request->filled('table_name')) {
            $query->where('table_name', $request->table_name);
        }
        if ($request->filled('from_date')) {
            $query->whereDate('created_at', '>=', $request->from_date);
        }
        if ($request->filled('to_date')) {
            $query->whereDate('created_at', '<=', $request->to_date);
        }

        return response()->json($query->paginate($perPage));
    }
}
