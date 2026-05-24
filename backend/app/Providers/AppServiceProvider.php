<?php

namespace App\Providers;

use App\Routing\Utf8SafeResponseFactory;
use Illuminate\Contracts\Routing\ResponseFactory as ResponseFactoryContract;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // بعد تسجيل مزودي الإطار (بما فيها RoutingServiceProvider) نستبدل مصنع الاستجابة
        // لضمان استخدام Utf8JsonResponse على كل response()->json().
        $this->app->forgetInstance(ResponseFactoryContract::class);
        $this->app->singleton(ResponseFactoryContract::class, function ($app) {
            return new Utf8SafeResponseFactory($app['view'], $app['redirect']);
        });
    }
}
