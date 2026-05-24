<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Webhook;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class IntegrationWebhookController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $rows = Webhook::query()
            ->where('tenant_id', $tenantId)
            ->orderByDesc('id')
            ->get(['id', 'url', 'events', 'is_active', 'last_triggered_at', 'created_at']);

        return response()->json(['data' => $rows]);
    }

    public function store(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $validated = $request->validate([
            'url' => 'required|url|max:2048',
            'events' => 'nullable|array',
            'events.*' => 'string|max:120',
        ]);

        $secret = Str::random(32);
        $hook = Webhook::create([
            'tenant_id' => $tenantId,
            'url' => $validated['url'],
            'secret' => $secret,
            'events' => $validated['events'] ?? ['*'],
            'is_active' => true,
        ]);

        return response()->json([
            'message' => 'تم إنشاء Webhook',
            'id' => $hook->id,
            'secret' => $secret,
            'url' => $hook->url,
        ], 201);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $hook = Webhook::query()->where('tenant_id', $tenantId)->where('id', $id)->firstOrFail();
        $hook->delete();

        return response()->json(['message' => 'تم الحذف']);
    }
}
