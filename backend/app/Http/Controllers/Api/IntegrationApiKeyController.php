<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ApiKey;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class IntegrationApiKeyController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $keys = ApiKey::query()
            ->where('tenant_id', $tenantId)
            ->orderByDesc('id')
            ->get(['id', 'name', 'is_active', 'last_used_at', 'created_at']);

        return response()->json(['data' => $keys]);
    }

    public function store(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $validated = $request->validate([
            'name' => 'required|string|max:120',
            'allowed_ips' => 'nullable|array',
            'allowed_ips.*' => 'string',
        ]);

        $token = 'fc_'.Str::lower(Str::random(10)).'_'.Str::lower(Str::random(32));

        $key = ApiKey::create([
            'tenant_id' => $tenantId,
            'name' => $validated['name'],
            'token' => $token,
            'permissions' => $request->input('permissions', []),
            'allowed_ips' => $validated['allowed_ips'] ?? null,
            'is_active' => true,
        ]);

        return response()->json([
            'message' => 'تم إنشاء المفتاح. احفظ القيمة الآن — لن تُعرض مرة أخرى بالكامل.',
            'id' => $key->id,
            'name' => $key->name,
            'token' => $token,
        ], 201);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $key = ApiKey::query()->where('tenant_id', $tenantId)->where('id', $id)->firstOrFail();
        $key->delete();

        return response()->json(['message' => 'تم إلغاء المفتاح']);
    }
}
