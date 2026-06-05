import axios from 'axios'
import type { OrderPayload, OrderResponse, PublicMenuData } from '../types/menu'
import { resolveApiBase } from '../utils/apiBase'

const apiBase = resolveApiBase()
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
