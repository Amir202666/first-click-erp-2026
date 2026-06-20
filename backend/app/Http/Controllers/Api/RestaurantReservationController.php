<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\RestaurantReservation;
use App\Models\RestaurantTable;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class RestaurantReservationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $tenantId = (int) $request->attributes->get('tenant_id');

        $validated = $request->validate([
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'section' => ['nullable', 'string', 'max:255'],
            'status' => ['nullable', 'string', Rule::in(['pending', 'confirmed', 'cancelled', 'completed', 'all'])],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date'],
            'date' => ['nullable', 'date'],
        ]);

        $query = RestaurantReservation::query()
            ->where('tenant_id', $tenantId)
            ->with(['table:id,name,code,section,capacity'])
            ->orderBy('reservation_date')
            ->orderBy('reservation_time');

        if (! empty($validated['branch_id'])) {
            $query->where('branch_id', $validated['branch_id']);
        }
        if (! empty($validated['section'])) {
            $query->where('section', $validated['section']);
        }
        if (! empty($validated['status']) && $validated['status'] !== 'all') {
            $query->where('status', $validated['status']);
        }
        if (! empty($validated['date'])) {
            $query->whereDate('reservation_date', $validated['date']);
        } else {
            if (! empty($validated['date_from'])) {
                $query->whereDate('reservation_date', '>=', $validated['date_from']);
            }
            if (! empty($validated['date_to'])) {
                $query->whereDate('reservation_date', '<=', $validated['date_to']);
            }
        }

        return response()->json($query->get());
    }

    public function store(Request $request): JsonResponse
    {
        $tenantId = (int) $request->attributes->get('tenant_id');

        $data = $request->validate([
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'table_id' => ['nullable', 'integer', 'exists:restaurant_tables,id'],
            'section' => ['nullable', 'string', 'max:255'],
            'customer_name' => ['required', 'string', 'max:255'],
            'customer_phone' => ['nullable', 'string', 'max:50'],
            'reservation_date' => ['required', 'date'],
            'reservation_time' => ['required', 'date_format:H:i'],
            'guests_count' => ['nullable', 'integer', 'min:1', 'max:50'],
            'status' => ['nullable', Rule::in(['pending', 'confirmed'])],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $data['tenant_id'] = $tenantId;
        $data['guests_count'] = $data['guests_count'] ?? 2;
        $data['status'] = $data['status'] ?? 'confirmed';

        if (! empty($data['table_id'])) {
            $this->assertTableAvailable(
                $tenantId,
                (int) $data['table_id'],
                $data['reservation_date'],
                $data['reservation_time'],
            );
            $table = RestaurantTable::where('tenant_id', $tenantId)->find($data['table_id']);
            if ($table && empty($data['section'])) {
                $data['section'] = $table->section;
            }
        }

        $reservation = RestaurantReservation::create($data);

        return response()->json($reservation->load('table:id,name,code,section,capacity'), 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $tenantId = (int) $request->attributes->get('tenant_id');
        $reservation = RestaurantReservation::where('tenant_id', $tenantId)->findOrFail($id);

        $data = $request->validate([
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'table_id' => ['nullable', 'integer', 'exists:restaurant_tables,id'],
            'section' => ['nullable', 'string', 'max:255'],
            'customer_name' => ['sometimes', 'string', 'max:255'],
            'customer_phone' => ['nullable', 'string', 'max:50'],
            'reservation_date' => ['sometimes', 'date'],
            'reservation_time' => ['sometimes', 'date_format:H:i'],
            'guests_count' => ['nullable', 'integer', 'min:1', 'max:50'],
            'status' => ['sometimes', Rule::in(['pending', 'confirmed', 'cancelled', 'completed'])],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $date = $data['reservation_date'] ?? $reservation->reservation_date->format('Y-m-d');
        $time = $data['reservation_time'] ?? Carbon::parse($reservation->reservation_time)->format('H:i');
        $tableId = array_key_exists('table_id', $data) ? $data['table_id'] : $reservation->table_id;

        if ($tableId) {
            $this->assertTableAvailable($tenantId, (int) $tableId, $date, $time, $reservation->id);
        }

        $reservation->update($data);

        if ($reservation->status === 'completed' && $reservation->table_id) {
            RestaurantTable::where('tenant_id', $tenantId)
                ->where('id', $reservation->table_id)
                ->update([
                    'status' => 'occupied',
                    'occupied_at' => now(),
                ]);
        }

        if ($reservation->status === 'cancelled' && $reservation->table_id) {
            $table = RestaurantTable::where('tenant_id', $tenantId)->find($reservation->table_id);
            if ($table && $table->status !== 'occupied') {
                $table->update(['status' => 'available']);
            }
        }

        return response()->json($reservation->fresh()->load('table:id,name,code,section,capacity'));
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $tenantId = (int) $request->attributes->get('tenant_id');
        $reservation = RestaurantReservation::where('tenant_id', $tenantId)->findOrFail($id);
        $tableId = $reservation->table_id;
        $reservation->update(['status' => 'cancelled']);

        if ($tableId) {
            $table = RestaurantTable::where('tenant_id', $tenantId)->find($tableId);
            if ($table && $table->status !== 'occupied') {
                $table->update(['status' => 'available']);
            }
        }

        return response()->json(['message' => 'تم إلغاء الحجز', 'success' => true]);
    }

    private function assertTableAvailable(
        int $tenantId,
        int $tableId,
        string $date,
        string $time,
        ?int $ignoreReservationId = null,
    ): void {
        $conflict = RestaurantReservation::query()
            ->where('tenant_id', $tenantId)
            ->where('table_id', $tableId)
            ->whereDate('reservation_date', $date)
            ->where('reservation_time', $time)
            ->whereIn('status', ['pending', 'confirmed'])
            ->when($ignoreReservationId, fn ($q) => $q->where('id', '!=', $ignoreReservationId))
            ->exists();

        if ($conflict) {
            abort(422, 'الطاولة محجوزة في هذا الوقت');
        }
    }
}
