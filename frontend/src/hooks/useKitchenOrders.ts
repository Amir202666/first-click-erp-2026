import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'
import {
  fetchKitchenOrders,
  updateItemStatus,
  updateOrderStatus,
  type KitchenOrder,
  type OrderStatus,
} from '../api/kitchen'

const SOUND_KEY = 'kds_sound_enabled'

function playNewOrderChime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = freq
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.15, start)
      gain.gain.exponentialRampToValueAtTime(0.01, start + duration)
      osc.start(start)
      osc.stop(start + duration)
    }
    playTone(880, ctx.currentTime, 0.12)
    playTone(1175, ctx.currentTime + 0.14, 0.18)
    setTimeout(() => void ctx.close(), 500)
  } catch {
    /* ignore */
  }
}

export function elapsedMinutes(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000)
}

export function formatElapsedMmSs(createdAt: string): string {
  const totalSec = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000))
  const mins = Math.floor(totalSec / 60)
  const secs = totalSec % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

export type KitchenFilter = 'all' | 'new' | 'cooking' | 'ready' | 'urgent' | 'with_completed'

export function useKitchenOrders() {
  const { currentTenant } = useAuth()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<KitchenFilter>('all')
  const includeCompleted = filter === 'with_completed'
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try {
      return localStorage.getItem(SOUND_KEY) !== '0'
    } catch {
      return true
    }
  })
  const [itemOverrides, setItemOverrides] = useState<Record<string, boolean>>({})
  const knownIdsRef = useRef<Set<number>>(new Set())
  const initialLoadRef = useRef(true)

  const { data: orders = [], isLoading, isFetching } = useQuery({
    queryKey: ['kitchen-orders', tenantId, includeCompleted],
    queryFn: () => fetchKitchenOrders(tenantId, { includeCompleted }),
    enabled: tenantId > 0,
    refetchInterval: 15000,
  })

  useEffect(() => {
    initialLoadRef.current = true
    knownIdsRef.current = new Set()
  }, [includeCompleted])

  useEffect(() => {
    if (!orders.length && !isFetching) {
      if (initialLoadRef.current) initialLoadRef.current = false
      return
    }
    const ids = new Set(orders.map((o) => o.id))
    if (initialLoadRef.current) {
      knownIdsRef.current = ids
      initialLoadRef.current = false
      return
    }
    let hasNew = false
    for (const id of ids) {
      if (!knownIdsRef.current.has(id)) {
        hasNew = true
        break
      }
    }
    knownIdsRef.current = ids
    if (hasNew && soundEnabled) playNewOrderChime()
  }, [orders, isFetching, soundEnabled])

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev
      try {
        localStorage.setItem(SOUND_KEY, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const statusMut = useMutation({
    mutationFn: ({ orderId, status }: { orderId: number; status: OrderStatus | 'delivered' }) =>
      updateOrderStatus(tenantId, orderId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kitchen-orders', tenantId] })
    },
  })

  const invalidateKitchenOrders = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['kitchen-orders', tenantId] })
  }, [queryClient, tenantId])

  const itemMut = useMutation({
    mutationFn: ({
      orderId,
      itemId,
      isDone,
    }: {
      orderId: number
      itemId: number
      isDone: boolean
    }) => updateItemStatus(tenantId, orderId, itemId, isDone),
    onError: (_err, vars) => {
      const key = `${vars.orderId}-${vars.itemId}`
      setItemOverrides((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    },
    onSettled: invalidateKitchenOrders,
  })

  const getItemDone = useCallback(
    (order: KitchenOrder, itemId: number, serverDone: boolean) => {
      const key = `${order.id}-${itemId}`
      if (key in itemOverrides) return itemOverrides[key]
      return serverDone
    },
    [itemOverrides],
  )

  const toggleItem = useCallback(
    (order: KitchenOrder, itemId: number, currentDone: boolean) => {
      const next = !currentDone
      const key = `${order.id}-${itemId}`
      setItemOverrides((prev) => ({ ...prev, [key]: next }))
      itemMut.mutate({ orderId: order.id, itemId, isDone: next })
    },
    [itemMut],
  )

  const advanceStatus = useCallback(
    (order: KitchenOrder) => {
      if (order.status === 'new') {
        statusMut.mutate({ orderId: order.id, status: 'cooking' })
      } else if (order.status === 'cooking') {
        statusMut.mutate({ orderId: order.id, status: 'ready' })
      } else if (order.status === 'ready') {
        statusMut.mutate({ orderId: order.id, status: 'delivered' })
      }
    },
    [statusMut],
  )

  const activeOrders = orders.filter((o) => o.status !== 'delivered')

  const filteredOrders = orders.filter((order) => {
    const urgent = elapsedMinutes(order.created_at) >= 15 && order.status !== 'delivered'
    if (filter === 'with_completed') return true
    if (filter === 'new') return order.status === 'new'
    if (filter === 'cooking') return order.status === 'cooking'
    if (filter === 'ready') return order.status === 'ready'
    if (filter === 'urgent') return urgent
    return order.status !== 'delivered'
  })

  const stats = {
    new: activeOrders.filter((o) => o.status === 'new').length,
    cooking: activeOrders.filter((o) => o.status === 'cooking').length,
    ready: activeOrders.filter((o) => o.status === 'ready').length,
    urgent: activeOrders.filter((o) => elapsedMinutes(o.created_at) >= 15).length,
    delivered: orders.filter((o) => o.status === 'delivered').length,
  }

  return {
    orders: filteredOrders,
    allOrders: orders,
    isLoading,
    isFetching,
    filter,
    setFilter,
    soundEnabled,
    toggleSound,
    stats,
    advanceStatus,
    toggleItem,
    getItemDone,
    statusPending: statusMut.isPending,
    itemPending: itemMut.isPending,
  }
}
