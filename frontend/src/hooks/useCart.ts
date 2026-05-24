import { useCallback, useMemo, useState } from 'react'
import type { CartItem, MenuItem } from '../types/menu'

export function useCart(serviceChargePercent: number = 10) {
  const [cartItems, setCartItems] = useState<CartItem[]>([])

  const addItem = useCallback((itemId: number) => {
    setCartItems((prev) => {
      const existing = prev.find((i) => i.item_id === itemId)
      if (existing) {
        return prev.map((i) =>
          i.item_id === itemId ? { ...i, quantity: i.quantity + 1 } : i,
        )
      }
      return [...prev, { item_id: itemId, quantity: 1 }]
    })
  }, [])

  const removeItem = useCallback((itemId: number) => {
    setCartItems((prev) => {
      const existing = prev.find((i) => i.item_id === itemId)
      if (!existing) return prev
      if (existing.quantity === 1) return prev.filter((i) => i.item_id !== itemId)
      return prev.map((i) =>
        i.item_id === itemId ? { ...i, quantity: i.quantity - 1 } : i,
      )
    })
  }, [])

  const clearCart = useCallback(() => setCartItems([]), [])

  const getItemQuantity = useCallback(
    (itemId: number) => cartItems.find((i) => i.item_id === itemId)?.quantity ?? 0,
    [cartItems],
  )

  const totalItems = useMemo(
    () => cartItems.reduce((s, i) => s + i.quantity, 0),
    [cartItems],
  )

  const calculateTotals = useCallback(
    (menuItems: MenuItem[]) => {
      const subtotal = cartItems.reduce((s, ci) => {
        const item = menuItems.find((m) => m.id === ci.item_id)
        return s + (item ? item.price * ci.quantity : 0)
      }, 0)
      const serviceCharge = Math.round(subtotal * serviceChargePercent / 100)
      const total = subtotal + serviceCharge
      return { subtotal, serviceCharge, total }
    },
    [cartItems, serviceChargePercent],
  )

  return {
    cartItems,
    addItem,
    removeItem,
    clearCart,
    getItemQuantity,
    totalItems,
    calculateTotals,
  }
}
