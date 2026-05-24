<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Middleware: التحقق من صلاحية المشرف العام.
 * يُستخدم على مجموعة Routes الخاصة بـ /api/admin/*
 */
class SuperAdminMiddleware
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->user() || ! $request->user()->isSuperAdmin()) {
            return response()->json(['message' => 'غير مصرح. هذه العملية للمشرف العام فقط.'], 403);
        }

        return $next($request);
    }
}
