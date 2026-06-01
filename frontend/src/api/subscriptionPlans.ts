import { api } from './client'

export interface PublicSubscriptionPlan {
  id: number
  name: string
  slug: string
  description: string | null
  price: number
  currency: string
  billing_cycle_months: number
  max_users: number | null
  features: string[]
  sort_order: number
}

export function fetchSubscriptionPlans(): Promise<{ data: PublicSubscriptionPlan[] }> {
  return api
    .get<{ data: PublicSubscriptionPlan[] }>('/subscription-plans', {
      params: { _t: Date.now() },
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    })
    .then((r) => r.data)
}
