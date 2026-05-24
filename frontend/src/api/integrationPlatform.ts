import { api } from './client'

function tenantHeaders(tenantId: number) {
  return { headers: { 'X-Tenant-ID': tenantId.toString() } }
}

export interface IntegrationApiKeyRow {
  id: number
  name: string
  is_active: boolean
  last_used_at: string | null
  created_at: string
}

export interface IntegrationWebhookRow {
  id: number
  url: string
  events: string[] | null
  is_active: boolean
  last_triggered_at: string | null
  created_at: string
}

export const fetchIntegrationApiKeys = (tenantId: number) =>
  api.get<{ data: IntegrationApiKeyRow[] }>('/integration-api-keys', tenantHeaders(tenantId)).then((r) => r.data)

export const createIntegrationApiKey = (tenantId: number, body: { name: string; allowed_ips?: string[] }) =>
  api.post<{ id: number; name: string; token: string; message?: string }>('/integration-api-keys', body, tenantHeaders(tenantId)).then((r) => r.data)

export const revokeIntegrationApiKey = (tenantId: number, id: number) =>
  api.delete<{ message?: string }>(`/integration-api-keys/${id}`, tenantHeaders(tenantId)).then((r) => r.data)

export const fetchIntegrationWebhooks = (tenantId: number) =>
  api.get<{ data: IntegrationWebhookRow[] }>('/integration-webhooks', tenantHeaders(tenantId)).then((r) => r.data)

export const createIntegrationWebhook = (tenantId: number, body: { url: string; events?: string[] }) =>
  api.post<{ id: number; secret: string; url: string; message?: string }>('/integration-webhooks', body, tenantHeaders(tenantId)).then((r) => r.data)

export const deleteIntegrationWebhook = (tenantId: number, id: number) =>
  api.delete<{ message?: string }>(`/integration-webhooks/${id}`, tenantHeaders(tenantId)).then((r) => r.data)
