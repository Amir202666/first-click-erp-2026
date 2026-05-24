import { useMutation } from '@tanstack/react-query'
import { publicMenuApi } from '../api/publicMenu'
import type { OrderPayload, OrderResponse } from '../types/menu'

export function useOrder(
  slug: string | undefined,
  options?: { onSuccess?: (data: OrderResponse) => void },
) {
  return useMutation({
    mutationFn: (payload: OrderPayload) => publicMenuApi.placeOrder(slug!, payload),
    onSuccess: options?.onSuccess,
  })
}
