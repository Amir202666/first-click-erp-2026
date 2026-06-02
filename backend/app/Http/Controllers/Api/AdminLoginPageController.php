<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\LoginPageSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminLoginPageController extends Controller
{
    public function show(): JsonResponse
    {
        return response()->json(['data' => LoginPageSettings::get()]);
    }

    public function update(Request $request): JsonResponse
    {
        $request->validate(LoginPageSettings::validateUpdateRules());

        $payload = $request->only(array_keys(LoginPageSettings::defaults()));
        $saved = LoginPageSettings::save($payload);

        return response()->json([
            'message' => 'تم حفظ إعدادات صفحة تسجيل الدخول.',
            'data' => $saved,
        ]);
    }
}
