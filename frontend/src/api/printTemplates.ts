import { api } from './client'
import type { PrintDocumentType, PrintMargins, PrintOrientation, PrintPaperSize, PrintTemplate, PrintTemplatesIndexResponse } from '../types/printTemplate'

function tenantHeaders(tenantId: number) {
  return { headers: { 'X-Tenant-ID': tenantId.toString() } }
}

/** يدعم شكل Laravel القياسي { data: [] } وأشكالاً نادرة مثل paginator أو مصفوفة جذرية. */
function normalizePrintTemplatesIndex(body: unknown): PrintTemplatesIndexResponse {
  if (!body || typeof body !== 'object') {
    return { data: [], types: {}, paper_sizes: {} }
  }
  const o = body as Record<string, unknown>
  const types = (o.types as PrintTemplatesIndexResponse['types']) ?? {}
  const paper_sizes = (o.paper_sizes as PrintTemplatesIndexResponse['paper_sizes']) ?? {}

  if (Array.isArray(o.data)) {
    return { data: o.data as PrintTemplate[], types, paper_sizes }
  }

  const mid = o.data
  if (mid && typeof mid === 'object' && Array.isArray((mid as { data?: unknown }).data)) {
    return { data: (mid as { data: PrintTemplate[] }).data, types, paper_sizes }
  }

  if (Array.isArray(o.templates)) {
    return { data: o.templates as PrintTemplate[], types, paper_sizes }
  }

  return { data: [], types, paper_sizes }
}

export async function fetchPrintTemplates(tenantId: number, type?: PrintDocumentType, signal?: AbortSignal) {
  const { data } = await api.get<unknown>('/print-templates', {
    ...tenantHeaders(tenantId),
    params: type ? { type } : {},
    signal,
  })
  return normalizePrintTemplatesIndex(data)
}

/** واجهة تجميعية (مفيدة للاستدعاء من مكوّنات تستخدم نمط `printTemplatesApi.list`) */
export const printTemplatesApi = {
  list(tenantId: number, opts?: { type?: PrintDocumentType; signal?: AbortSignal }) {
    return fetchPrintTemplates(tenantId, opts?.type, opts?.signal)
  },
}

export async function fetchPrintTemplate(tenantId: number, id: number) {
  const { data } = await api.get<{ data: PrintTemplate }>(`/print-templates/${id}`, tenantHeaders(tenantId))
  return data.data
}

export async function fetchDefaultPrintTemplate(tenantId: number, type: PrintDocumentType) {
  const { data } = await api.get<{ data: PrintTemplate | null }>(`/print-templates/default/${type}`, tenantHeaders(tenantId))
  return data.data
}

export interface PrintTemplatePayload {
  name: string
  document_type: PrintDocumentType
  paper_size: PrintPaperSize
  orientation?: PrintOrientation
  margins?: PrintMargins
  settings?: Record<string, unknown> | null
  sections?: Record<string, boolean> | null
  html_content?: string | null
  blocks_json?: string | null
  is_default?: boolean
  sort_order?: number
}

export async function createPrintTemplate(tenantId: number, body: PrintTemplatePayload) {
  const { data } = await api.post<{ data: PrintTemplate }>('/print-templates', body, tenantHeaders(tenantId))
  return data.data
}

export async function updatePrintTemplate(
  tenantId: number,
  id: number,
  body: Partial<Omit<PrintTemplatePayload, 'document_type'>> & { name?: string },
) {
  const { data } = await api.put<{ data: PrintTemplate }>(`/print-templates/${id}`, body, tenantHeaders(tenantId))
  return data.data
}

export async function deletePrintTemplate(tenantId: number, id: number) {
  await api.delete(`/print-templates/${id}`, tenantHeaders(tenantId))
}

export async function setDefaultPrintTemplate(tenantId: number, id: number) {
  await api.put(`/print-templates/${id}/set-default`, {}, tenantHeaders(tenantId))
}

export async function duplicatePrintTemplate(tenantId: number, id: number) {
  const { data } = await api.post<{ data: PrintTemplate }>(`/print-templates/${id}/duplicate`, {}, tenantHeaders(tenantId))
  return data.data
}

export async function seedPrintTemplates(tenantId: number) {
  await api.post('/print-templates/seed', {}, tenantHeaders(tenantId))
}

export async function clearAllPrintTemplates(tenantId: number) {
  await api.post('/print-templates/clear', {}, tenantHeaders(tenantId))
}
