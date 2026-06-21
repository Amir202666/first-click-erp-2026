const CHANNEL = 'fc-restaurant-kitchen'

export type KitchenSyncEvent = {
  type: 'order-delivered'
  tenantId: number
  branchId?: number | null
}

export function broadcastKitchenOrderDelivered(tenantId: number, branchId?: number | null): void {
  try {
    const bc = new BroadcastChannel(CHANNEL)
    bc.postMessage({ type: 'order-delivered', tenantId, branchId } satisfies KitchenSyncEvent)
    bc.close()
  } catch {
    /* BroadcastChannel unavailable */
  }
}

export function subscribeKitchenSync(handler: (event: KitchenSyncEvent) => void): () => void {
  try {
    const bc = new BroadcastChannel(CHANNEL)
    bc.onmessage = (e: MessageEvent<KitchenSyncEvent>) => {
      if (e.data?.type === 'order-delivered') handler(e.data)
    }
    return () => bc.close()
  } catch {
    return () => {}
  }
}
