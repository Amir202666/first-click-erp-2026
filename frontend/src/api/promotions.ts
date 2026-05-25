import { api } from './client'
import type { Promotion, PromotionCalculateResult, PromotionsSummary, PromotionUsageRow } from '../types/promotions'

const h = (tenantId: number) => ({ headers: { 'X-Tenant-ID': tenantId.toString() } })

export const promotionsApi = {
  list: (tenantId: number, params?: { status?: string }) =>
    api.get<{ data: Promotion[]; summary: PromotionsSummary }>('/promotions', { params, ...h(tenantId) }),

  get: (tenantId: number, id: number) =>
    api.get<{ data: Promotion }>(`/promotions/${id}`, h(tenantId)),

  create: (tenantId: number, data: Partial<Promotion>) =>
    api.post<{ data: Promotion }>('/promotions', data, h(tenantId)),

  update: (tenantId: number, id: number, data: Partial<Promotion>) =>
    api.put<{ data: Promotion }>(`/promotions/${id}`, data, h(tenantId)),

  delete: (tenantId: number, id: number) =>
    api.delete(`/promotions/${id}`, h(tenantId)),

  toggle: (tenantId: number, id: number) =>
    api.put<{ data: Promotion }>(`/promotions/${id}/toggle`, {}, h(tenantId)),

  calculate: (
    tenantId: number,
    data: {
      channel: string
      order_total: number
      customer_id?: number
      item_ids?: number[]
      items?: { item_id?: number; quantity?: number; unit_price?: number }[]
    }
  ) => api.post<{ data: PromotionCalculateResult[] }>('/promotions/calculate', data, h(tenantId)),

  report: (tenantId: number, params?: { from?: string; to?: string }) =>
    api.get<{
      data: PromotionUsageRow[]
      by_promotion: { promotion_id: number; promotion_name: string; uses: number; discount: number }[]
      totals: { uses: number; discount: number }
    }>('/promotions/report', { params, ...h(tenantId) }),
}
