import { api } from './client'

export type OrderStatus = 'new' | 'cooking' | 'ready' | 'delivered'

export interface KitchenOrderItem {
  id: number
  name: string
  quantity: number
  notes?: string | null
  is_done: boolean
}

export interface KitchenOrder {
  id: number
  number: string
  table_name: string
  section_name?: string | null
  status: OrderStatus
  created_at: string
  items: KitchenOrderItem[]
}

function tenantHeaders(tenantId: number) {
  return { headers: { 'X-Tenant-ID': tenantId.toString() } }
}

function normalizeOrders(body: unknown): KitchenOrder[] {
  if (!body || typeof body !== 'object') return []
  const o = body as { data?: KitchenOrder[] }
  if (Array.isArray(o.data)) return o.data
  if (Array.isArray(body)) return body as KitchenOrder[]
  return []
}

export async function fetchKitchenOrders(
  tenantId: number,
  options?: { includeCompleted?: boolean },
): Promise<KitchenOrder[]> {
  const { data } = await api.get<unknown>('/kitchen-orders', {
    ...tenantHeaders(tenantId),
    params: options?.includeCompleted ? { include_completed: '1' } : undefined,
  })
  return normalizeOrders(data)
}

export async function updateOrderStatus(
  tenantId: number,
  orderId: number,
  status: OrderStatus | 'delivered',
): Promise<void> {
  await api.patch(
    `/kitchen-orders/${orderId}/status`,
    { status: status === 'delivered' ? 'delivered' : status },
    tenantHeaders(tenantId),
  )
}

export async function updateItemStatus(
  tenantId: number,
  orderId: number,
  itemId: number,
  isDone: boolean,
): Promise<void> {
  await api.patch(
    `/kitchen-orders/${orderId}/items/${itemId}`,
    { is_done: isDone },
    tenantHeaders(tenantId),
  )
}
