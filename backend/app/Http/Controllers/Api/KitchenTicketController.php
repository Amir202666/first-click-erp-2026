<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\KitchenTicket;
use App\Models\KitchenTicketLine;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class KitchenTicketController extends Controller
{
    /** @return array<string, string> */
    private function kdsStatusToDb(string $status): ?string
    {
        return match ($status) {
            'new' => 'pending',
            'cooking' => 'in_progress',
            'ready' => 'ready',
            'delivered', 'done' => 'done',
            'pending', 'in_progress', 'done', 'cancelled' => $status,
            default => null,
        };
    }

    private function dbStatusToKds(string $status): string
    {
        return match ($status) {
            'pending' => 'new',
            'in_progress' => 'cooking',
            'ready' => 'ready',
            'done' => 'delivered',
            default => 'new',
        };
    }

    /** @return array<string, mixed> */
    private function ticketToKdsOrder(KitchenTicket $ticket): array
    {
        $ticket->loadMissing(['table', 'invoice', 'lines']);

        return [
            'id' => $ticket->id,
            'number' => $ticket->invoice?->number ?? (string) $ticket->id,
            'table_name' => $ticket->table?->name ?? '',
            'section_name' => $ticket->table?->section ?? null,
            'status' => $this->dbStatusToKds((string) $ticket->status),
            'created_at' => $ticket->created_at?->toIso8601String() ?? now()->toIso8601String(),
            'items' => $ticket->lines->map(fn (KitchenTicketLine $line) => [
                'id' => $line->id,
                'name' => $line->item_name,
                'quantity' => (float) $line->quantity,
                'notes' => $line->kitchen_note,
                'is_done' => (bool) $line->is_completed,
            ])->values()->all(),
        ];
    }

    public function index(Request $request): JsonResponse
    {
        $tenantId = $request->attributes->get('tenant_id');
        $status = $request->query('status');
        $branchId = $request->query('branch_id');
        $kds = $request->query('kds') === '1' || $request->query('kds') === 'true';

        $query = KitchenTicket::with(['table', 'invoice.createdBy', 'lines'])
            ->where('tenant_id', $tenantId)
            ->orderBy('created_at', 'asc');

        if ($status !== null && $status !== '') {
            $dbStatus = $this->kdsStatusToDb((string) $status) ?? $status;
            $query->where('status', $dbStatus);
        }

        if ($kds) {
            $this->applyKdsScope($query, $request);
        }

        if ($branchId) {
            $query->where('branch_id', $branchId);
        }

        if ($kds) {
            return response()->json([
                'data' => $query->get()->map(fn (KitchenTicket $t) => $this->ticketToKdsOrder($t))->values(),
            ]);
        }

        return response()->json($query->get());
    }

    private function includeCompletedRequested(Request $request): bool
    {
        return $request->query('include_completed') === '1'
            || $request->query('include_completed') === 'true'
            || $request->boolean('include_completed');
    }

    private function applyKdsScope($query, Request $request): void
    {
        if ($this->includeCompletedRequested($request)) {
            $query->includingAllForKds();
        } else {
            $query->activeForKds();
        }
    }

    /** GET /kitchen-orders — KDS payload */
    public function indexKds(Request $request): JsonResponse
    {
        $tenantId = $request->attributes->get('tenant_id');
        $branchId = $request->query('branch_id');
        $status = $request->query('status');

        $query = KitchenTicket::with(['table', 'invoice', 'lines'])
            ->where('tenant_id', $tenantId)
            ->orderBy('created_at', 'asc');

        if ($status !== null && $status !== '') {
            $dbStatus = $this->kdsStatusToDb((string) $status) ?? $status;
            $query->where('status', $dbStatus);
        }

        $this->applyKdsScope($query, $request);

        if ($branchId) {
            $query->where('branch_id', $branchId);
        }

        return response()->json([
            'data' => $query->get()->map(fn (KitchenTicket $t) => $this->ticketToKdsOrder($t))->values(),
        ]);
    }

    public function updateStatus(Request $request, int $id): JsonResponse
    {
        $tenantId = (int) $request->attributes->get('tenant_id');
        $ticket = KitchenTicket::with('table')->where('tenant_id', $tenantId)->findOrFail($id);

        $rawStatus = (string) $request->input('status');
        $status = $this->kdsStatusToDb($rawStatus);
        if ($status === null) {
            return response()->json(['message' => 'Invalid status'], 422);
        }

        $wasDone = $ticket->status === 'done';
        $ticket->update(['status' => $status]);

        if ($status === 'done' && ! $wasDone) {
            if ($ticket->restaurant_order_id) {
                \App\Models\RestaurantOrder::where('id', $ticket->restaurant_order_id)->update(['status' => 'ready']);
            }
            $tableName = $ticket->table?->name ?? (string) $ticket->table_id;
            app(NotificationService::class)->createKitchenReadyNotification(
                $tenantId,
                $ticket->id,
                $ticket->branch_id,
                $tableName
            );
        }

        $fresh = $ticket->fresh(['table', 'invoice', 'restaurantOrder', 'lines']);
        if ($request->query('kds') === '1' || $request->header('X-KDS') === '1') {
            return response()->json(['data' => $this->ticketToKdsOrder($fresh)]);
        }

        return response()->json($fresh);
    }

    /** PATCH /kitchen-orders/{id}/status */
    public function updateStatusKds(Request $request, int $id): JsonResponse
    {
        $request->headers->set('X-KDS', '1');

        return $this->updateStatus($request, $id);
    }

    public function updateLineCompleted(Request $request, int $id, int $lineId): JsonResponse
    {
        $tenantId = $request->attributes->get('tenant_id');
        $ticket = KitchenTicket::where('tenant_id', $tenantId)->findOrFail($id);
        $line = KitchenTicketLine::where('ticket_id', $ticket->id)->findOrFail($lineId);

        $isDone = $request->has('is_done')
            ? (bool) $request->input('is_done')
            : (bool) $request->input('is_completed', true);
        $line->update(['is_completed' => $isDone]);

        if ($request->query('kds') === '1' || $request->header('X-KDS') === '1') {
            return response()->json([
                'data' => [
                    'id' => $line->id,
                    'is_done' => (bool) $line->is_completed,
                ],
            ]);
        }

        return response()->json($line);
    }

    /** PATCH /kitchen-orders/{id}/items/{lineId} */
    public function updateLineKds(Request $request, int $id, int $lineId): JsonResponse
    {
        $request->headers->set('X-KDS', '1');

        return $this->updateLineCompleted($request, $id, $lineId);
    }
}
