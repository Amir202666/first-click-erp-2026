<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TenantController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $tenants = $request->user()
            ->tenants()
            ->wherePivot('is_active', true)
            ->get(['tenants.id', 'tenants.name', 'tenants.slug']);

        return response()->json($tenants);
    }
}
