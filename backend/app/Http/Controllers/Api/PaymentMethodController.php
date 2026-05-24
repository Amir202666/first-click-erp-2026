<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PaymentMethod;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PaymentMethodController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $methods = PaymentMethod::where('tenant_id', $request->tenant_id)
            ->when($request->status === 'active', fn ($q) => $q->where('is_active', true))
            ->when($request->status === 'inactive', fn ($q) => $q->where('is_active', false))
            ->when($request->type, fn ($q, $type) => $q->where('type', $type))
            ->with(['linkedAccount', 'users:id,name'])
            ->orderBy('name')
            ->get();

        return response()->json($methods);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'name_en' => 'nullable|string|max:255',
            'type' => 'required|in:cash,bank,credit,other',
            'linked_account_id' => 'nullable|exists:accounts,id',
            'user_ids' => 'sometimes|array',
            'user_ids.*' => 'integer|exists:users,id',
            'is_active' => 'sometimes|boolean',
        ]);

        $validated['tenant_id'] = $request->tenant_id;
        $method = PaymentMethod::create($validated);
        if (isset($validated['user_ids'])) {
            $method->users()->sync($validated['user_ids']);
        }

        return response()->json($method->load(['linkedAccount', 'users:id,name']), 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $method = PaymentMethod::where('tenant_id', $request->tenant_id)
            ->with(['linkedAccount', 'users:id,name'])
            ->findOrFail($id);

        return response()->json($method);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $method = PaymentMethod::where('tenant_id', $request->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:100',
            'name_en' => 'nullable|string|max:255',
            'type' => 'sometimes|in:cash,bank,credit,other',
            'linked_account_id' => 'nullable|exists:accounts,id',
            'user_ids' => 'sometimes|array',
            'user_ids.*' => 'integer|exists:users,id',
            'is_active' => 'sometimes|boolean',
        ]);

        $method->update($validated);
        if (array_key_exists('user_ids', $validated)) {
            $method->users()->sync($validated['user_ids'] ?? []);
        }

        return response()->json($method->load(['linkedAccount', 'users:id,name']));
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $method = PaymentMethod::where('tenant_id', $request->tenant_id)->findOrFail($id);

        // Check if used in payments
        $usedInPayments = \App\Models\Payment::where('payment_method_id', $method->id)->exists();
        if ($usedInPayments) {
            return response()->json(['message' => 'Cannot delete a payment method used in transactions'], 422);
        }

        // Check if used in invoices
        $usedInInvoices = \App\Models\Invoice::where('payment_method_id', $method->id)->exists();
        if ($usedInInvoices) {
            return response()->json(['message' => 'Cannot delete a payment method used in invoices'], 422);
        }

        $method->delete();

        return response()->json(['message' => 'Deleted successfully']);
    }
}
