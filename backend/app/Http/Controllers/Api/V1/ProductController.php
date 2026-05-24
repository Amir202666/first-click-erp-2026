<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Item;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProductController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $items = Item::query()
            ->where('tenant_id', $tenantId)
            ->when($request->search, function ($q, $s) {
                $q->where(function ($q2) use ($s) {
                    $q2->where('name', 'like', "%{$s}%")
                        ->orWhere('code', 'like', "%{$s}%")
                        ->orWhere('barcode', $s);
                });
            })
            ->when($request->has('is_active'), fn ($q) => $q->where('is_active', $request->boolean('is_active')))
            ->orderBy('name')
            ->paginate(min((int) $request->get('per_page', 20), 100));

        return response()->json($items);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $tenantId = (int) $request->tenant_id;
        $item = Item::query()
            ->where('tenant_id', $tenantId)
            ->with(['category', 'brand', 'itemUnit'])
            ->findOrFail($id);

        return response()->json($item);
    }
}
