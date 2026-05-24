<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withSchedule(function (\Illuminate\Console\Scheduling\Schedule $schedule): void {
        $schedule->command('inventory:low-stock-alerts')->everyFifteenMinutes()->withoutOverlapping(5);
        $schedule->command('notifications:sync')->everyFifteenMinutes()->withoutOverlapping(10);
        $schedule->command('integrations:sync')->everyFifteenMinutes()->withoutOverlapping(10);
        $schedule->call(function () {
            foreach (\App\Models\LoyaltyProgram::where('is_active', true)->get(['tenant_id']) as $program) {
                app(\App\Services\LoyaltyService::class)->expirePoints((int) $program->tenant_id);
            }
        })->daily()->name('loyalty:expire-points')->withoutOverlapping(30);
    })
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->api(prepend: [
            \App\Http\Middleware\SanitizeJsonRequestUtf8::class,
            \App\Http\Middleware\DisableApiCache::class,
        ]);
        $middleware->alias([
            'tenant' => \App\Http\Middleware\SetTenantContext::class,
            'enforce_tenant' => \App\Http\Middleware\EnforceTenantFromHeader::class,
            'check_subscription' => \App\Http\Middleware\CheckSubscriptionExpiry::class,
            'check_plan_features' => \App\Http\Middleware\CheckPlanFeatures::class,
            'permission' => \App\Http\Middleware\CheckPermission::class,
            'super_admin' => \App\Http\Middleware\SuperAdminMiddleware::class,
            'api.key' => \App\Http\Middleware\AuthenticateApiKey::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->render(function (\Symfony\Component\Routing\Exception\RouteNotFoundException $e, Request $request) {
            if (($request->expectsJson() || $request->is('api/*')) && str_contains($e->getMessage(), 'Route [login] not defined')) {
                return response()->json(['message' => 'غير مصرح'], 401);
            }
        });
        $exceptions->render(function (\Illuminate\Auth\AuthenticationException $e, Request $request) {
            if ($request->expectsJson() || $request->is('api/*')) {
                return response()->json(['message' => 'غير مصرح'], 401);
            }
        });
        $exceptions->render(function (\Illuminate\Database\Eloquent\ModelNotFoundException $e, Request $request) {
            if ($request->expectsJson() || $request->is('api/*')) {
                return response()->json(['message' => 'السجل غير موجود.'], 404);
            }
        });
        $exceptions->render(function (\Symfony\Component\HttpKernel\Exception\NotFoundHttpException $e, Request $request) {
            if ($request->expectsJson() || $request->is('api/*')) {
                return response()->json(['message' => 'المسار غير موجود.'], 404);
            }
        });
    })->create();
