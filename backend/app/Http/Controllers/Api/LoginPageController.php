<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\LoginPageSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LoginPageController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $lang = $request->get('lang', 'ar');
        if (! in_array($lang, ['ar', 'en'], true)) {
            $lang = 'ar';
        }

        return response()
            ->json(['data' => LoginPageSettings::forPublic($lang)])
            ->header('Cache-Control', 'no-store, no-cache, must-revalidate');
    }
}
