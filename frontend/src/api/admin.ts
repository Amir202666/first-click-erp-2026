import { api } from './client'

export interface AdminSubscriptionRow {
  id: number
  /** اسم الشركة */
  name: string
  /** كود/Slug الشركة (يُستخدم كمعرّف فريد) */
  slug: string
  is_active: boolean
  plan_name: string
  plan_slug: string | null
  subscription_plan_id?: number | null
  subscription_starts_at?: string | null
  subscription_ends_at: string | null
  subscription_status: string
  /** اسم مستخدم المدير (قد يكون بريداً إلكترونياً) */
  manager_username?: string | null
  manager_name?: string | null
  /** بريد الشركة (اختياري إن وفره الـ API) */
  company_email?: string | null
  /** إجمالي مبيعات الشركة للمراقبة */
  total_sales?: number | null
  /** آخر ظهور (آخر دخول/نشاط) */
  last_seen_at?: string | null
}

export interface AdminSubscriptionsResponse {
  data: AdminSubscriptionRow[]
  current_page: number
  last_page: number
  per_page: number
  total: number
  /** ملخص تحليلي اختياري يعيده الـ API */
  summary?: {
    active_count?: number
    expected_collection_this_month?: number
    delinquent_count?: number
    new_today_count?: number
  }
}

export interface SubscriptionPlanOption {
  id: number
  name: string
  slug: string
}

export interface AdminPlanRow {
  id: number
  name: string
  slug: string
  description: string | null
  price: number
  currency: string
  max_users: number | null
  duration_days: number
  billing_cycle_months: number
  features: string[]
  is_active: boolean
  sort_order: number
}

export type AdminPlanPayload = {
  name: string
  price?: number
  currency?: string
  max_users?: number | null
  duration_days?: number
  billing_cycle_months?: number
  features?: string[]
  description?: string
  is_active?: boolean
  sort_order?: number
}

export function fetchAdminSubscriptions(params: {
  status?: string
  plan_id?: number
  per_page?: number
  page?: number
  /** بحث بالكود/الاسم/البريد حسب ما يدعمه الـ API */
  search?: string
}): Promise<AdminSubscriptionsResponse> {
  const search = new URLSearchParams()
  if (params.status) search.set('status', params.status)
  if (params.plan_id) search.set('plan_id', String(params.plan_id))
  if (params.per_page) search.set('per_page', String(params.per_page))
  if (params.page) search.set('page', String(params.page))
  if (params.search) search.set('search', params.search)
  return api.get<AdminSubscriptionsResponse>(`/admin/subscriptions?${search}`).then((r) => r.data)
}

export function fetchAdminSubscriptionPlans(): Promise<{ data: SubscriptionPlanOption[] }> {
  return api.get<{ data: SubscriptionPlanOption[] }>('/admin/subscriptions/plans').then((r) => r.data)
}

export function updateAdminSubscription(
  tenantId: number,
  data: {
    company_slug?: string
    manager_name?: string
    subscription_plan_id?: number
    subscription_starts_at?: string
    subscription_ends_at: string
  }
): Promise<{ message: string }> {
  return api.put<{ message: string }>(`/admin/subscriptions/${tenantId}`, data).then((r) => r.data)
}

export function createAdminTenant(data: {
  name: string
  company_slug: string
  manager_username: string
  manager_password: string
  default_currency?: string
  manager_name?: string
  subscription_plan_id: number
  subscription_starts_at: string
}): Promise<{ message: string; tenant_id: number }> {
  return api.post<{ message: string; tenant_id: number }>('/admin/subscriptions/tenants', data).then((r) => r.data)
}

export function toggleAdminTenantActive(tenantId: number): Promise<{ message: string; is_active: boolean }> {
  return api.patch<{ message: string; is_active: boolean }>(`/admin/subscriptions/tenants/${tenantId}/toggle-active`).then((r) => r.data)
}

export function fetchAdminPlans(): Promise<{ data: AdminPlanRow[] }> {
  return api.get<{ data: AdminPlanRow[] }>('/admin/plans').then((r) => r.data)
}

export function createAdminPlan(data: AdminPlanPayload): Promise<{ message: string; data: AdminPlanRow }> {
  return api.post<{ message: string; data: AdminPlanRow }>('/admin/plans', data).then((r) => r.data)
}

export function updateAdminPlan(id: number, data: Partial<AdminPlanPayload>): Promise<{ message: string }> {
  return api.put<{ message: string }>(`/admin/plans/${id}`, data).then((r) => r.data)
}
