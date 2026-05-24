<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * تعطيل HTTP caching لـ API responses
 * هذا يضمن أن الـ browser لا يخزن استجابات API مخزنة مسبقاً
 * مهم بشكل خاص للبيانات الديناميكية مثل قوالب الطباعة الافتراضية
 */
class DisableApiCache
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        // منع الـ browser من تخزين الاستجابة
        $response->headers->set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0, private');
        $response->headers->set('Pragma', 'no-cache');
        $response->headers->set('Expires', '0');

        return $response;
    }
}
