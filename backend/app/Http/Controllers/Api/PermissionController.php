<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Permission;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PermissionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $permissions = Permission::orderBy('module')->orderBy('sort_order')->get([
            'id', 'key', 'module', 'name_ar', 'name_en',
        ]);

        $byModule = $permissions->groupBy('module')->map(fn ($items) => $items->values()->all())->toArray();

        return response()->json([
            'data' => $permissions,
            'by_module' => $byModule,
        ]);
    }
}
