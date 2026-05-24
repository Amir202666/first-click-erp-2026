import axios from 'axios'
import type { OrderPayload, OrderResponse, PublicMenuData } from '../types/menu'

const apiBase = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://127.0.0.1:8000/api' : '/api')
const BASE = `${apiBase}/public/menu`

/** عميل بدون auth — لا يُعاد توجيه 401 إلى صفحة الدخول */
const publicClient = axios.create({
  baseURL: BASE,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
  timeout: 30000,
})

export const publicMenuApi = {
  getMenu: (slug: string): Promise<PublicMenuData> =>
    publicClient.get(`/${slug}`).then((r) => r.data),

  placeOrder: (slug: string, payload: OrderPayload): Promise<OrderResponse> =>
    publicClient.post(`/${slug}/orders`, payload).then((r) => r.data),

  trackOrder: (slug: string, orderNumber: string) =>
    publicClient.get(`/${slug}/orders/${orderNumber}`).then((r) => r.data),
}
