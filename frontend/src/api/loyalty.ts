import { api } from './client'

const h = (tenantId: number) => ({ headers: { 'X-Tenant-ID': tenantId.toString() } })

export const loyaltyApi = {
  // Programs (multi-program)
  listPrograms: (t: number) => api.get('/loyalty/programs', h(t)),
  createProgram: (t: number, data: any) => api.post('/loyalty/programs', data, h(t)),
  updateProgram: (t: number, id: number, data: any) => api.put(`/loyalty/programs/${id}`, data, h(t)),
  deleteProgram: (t: number, id: number) => api.delete(`/loyalty/programs/${id}`, h(t)),
  calculateForProgram: (t: number, programId: number, params: { customer_id: number; amount: number; redeem_points?: number }) =>
    api.get(`/loyalty/programs/${programId}/calculate`, { params, ...h(t) }),

  // Backward compatible (single-program)
  getProgram: (t: number) => api.get('/loyalty/program', h(t)),
  saveProgram: (t: number, data: any) => api.post('/loyalty/program', data, h(t)),
  // Tiers per program
  getTiers: (t: number, programId?: number) =>
    programId ? api.get(`/loyalty/programs/${programId}/tiers`, h(t)) : api.get('/loyalty/tiers', h(t)),
  saveTier: (t: number, data: any, programId?: number) =>
    programId ? api.post(`/loyalty/programs/${programId}/tiers`, data, h(t)) : api.post('/loyalty/tiers', data, h(t)),
  deleteTier: (t: number, id: number) => api.delete(`/loyalty/tiers/${id}`, h(t)),
  getCustomers: (t: number, params?: { page?: number; per_page?: number }) =>
    api.get('/loyalty/customers', { params, ...h(t) }),
  getCustomerPoints: (t: number, id: number) => api.get(`/loyalty/customers/${id}`, h(t)),
  calculate: (t: number, params: { customer_id: number; amount: number; redeem_points?: number; program_id?: number }) =>
    api.get('/loyalty/calculate', { params, ...h(t) }),
  manualAdjust: (t: number, data: any) => api.post('/loyalty/manual', data, h(t)),
}

