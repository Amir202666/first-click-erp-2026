<?php

namespace App\Http\Middleware;

use App\Models\ApiKey;
use App\Models\Tenant;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AuthenticateApiKey
{
    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->header('X-API-Key')
            ?? $request->bearerToken()
            ?? $request->query('api_key');

        if (! is_string($token) || $token === '') {
            return response()->json(['error' => 'API key required'], 401);
        }

        $key = ApiKey::query()
            ->where('token', $token)
            ->where('is_active', true)
            ->first();

        if (! $key) {
            return response()->json(['error' => 'Invalid API key'], 401);
        }

        $allowed = $key->allowed_ips;
        if (is_array($allowed) && $allowed !== []) {
            $ip = $request->ip();
            if (! in_array($ip, $allowed, true)) {
                return response()->json(['error' => 'IP not allowed for this API key'], 403);
            }
        }

        $tenant = Tenant::query()->where('id', $key->tenant_id)->where('is_active', true)->first();
        if (! $tenant) {
            return response()->json(['error' => 'Tenant inactive'], 403);
        }

        app()->instance('current_tenant', $tenant);
        $request->merge(['tenant_id' => $tenant->id]);
        $request->attributes->set('tenant_id', (int) $tenant->id);
        $request->attributes->set('api_key', $key);

        $key->forceFill(['last_used_at' => now()])->saveQuietly();

        return $next($request);
    }
}
