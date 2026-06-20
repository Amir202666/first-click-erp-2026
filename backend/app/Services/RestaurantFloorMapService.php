<?php

namespace App\Services;

use App\Models\KitchenTicket;
use App\Models\RestaurantOrder;
use App\Models\RestaurantReservation;
use App\Models\RestaurantTable;
use Carbon\Carbon;
use Illuminate\Support\Collection;

class RestaurantFloorMapService
{
    /**
     * @param  Collection<int, RestaurantTable>  $tables
     * @return array<int, array<string, mixed>>
     */
    public function enrichTables(Collection $tables, int $tenantId, string $date): array
    {
        if ($tables->isEmpty()) {
            return [];
        }

        $tableIds = $tables->pluck('id')->all();

        $reservations = RestaurantReservation::query()
            ->where('tenant_id', $tenantId)
            ->where('reservation_date', $date)
            ->whereIn('table_id', $tableIds)
            ->whereIn('status', ['pending', 'confirmed'])
            ->get()
            ->keyBy('table_id');

        $openOrders = RestaurantOrder::query()
            ->where('tenant_id', $tenantId)
            ->whereIn('table_id', $tableIds)
            ->whereIn('status', ['sent', 'ready'])
            ->get()
            ->keyBy('table_id');

        $preparingTableIds = KitchenTicket::query()
            ->where('tenant_id', $tenantId)
            ->whereIn('table_id', $tableIds)
            ->where('status', 'in_progress')
            ->pluck('table_id')
            ->flip();

        return $tables->map(function (RestaurantTable $table) use ($reservations, $openOrders, $preparingTableIds) {
            $row = $table->toArray();
            $displayStatus = $this->resolveDisplayStatus($table, $reservations->get($table->id), $openOrders->get($table->id), $preparingTableIds->has($table->id));

            $row['display_status'] = $displayStatus;
            $row['number'] = $table->code ?: $table->name;

            $reservation = $reservations->get($table->id);
            if ($reservation) {
                $time = Carbon::parse($reservation->reservation_time)->format('H:i');
                $row['reservation'] = [
                    'id' => $reservation->id,
                    'customer_name' => $reservation->customer_name,
                    'customer_phone' => $reservation->customer_phone,
                    'time' => $time,
                    'guests_count' => $reservation->guests_count,
                    'status' => $reservation->status,
                ];
            } else {
                $row['reservation'] = null;
            }

            $order = $openOrders->get($table->id);
            if ($order) {
                $row['open_order_id'] = $order->id;
            }

            if ($table->occupied_at) {
                $row['occupied_since'] = $table->occupied_at->diffForHumans(null, true);
            } elseif ($order?->created_at) {
                $row['occupied_since'] = $order->created_at->diffForHumans(null, true);
            } else {
                $row['occupied_since'] = null;
            }

            return $row;
        })->values()->all();
    }

    private function resolveDisplayStatus(
        RestaurantTable $table,
        ?RestaurantReservation $reservation,
        ?RestaurantOrder $openOrder,
        bool $preparing,
    ): string {
        if ($table->status === 'closed') {
            return 'closed';
        }

        if ($table->status === 'occupied' || $openOrder) {
            return 'occupied';
        }

        if ($preparing || $table->status === 'cleaning') {
            return 'preparing';
        }

        if ($reservation) {
            return 'reserved';
        }

        return 'available';
    }
}
