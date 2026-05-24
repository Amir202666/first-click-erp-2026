import { api } from './client'
import type { FiscalYear } from '../types'

function tenantHeaders(tenantId: number) {
  return { headers: { 'X-Tenant-ID': tenantId.toString() } }
}

export interface EquityAccountOption {
  id: number
  code: string
  name: string
  type: string
  name_en?: string | null
}

export interface PreCloseChecksResponse {
  journal_entries: { total_posted: number; draft_count: number; is_ok: boolean }
  trial_balance: {
    total_debits: number
    total_credits: number
    is_balanced: boolean
    difference: number
  }
  invoices: { pending_count: number; is_ok: boolean }
  installments: { overdue_count: number; is_ok: boolean }
  can_close: boolean
}

export interface ClosingPreviewLine {
  account_id: number
  account_name: string
  account_code: string
  debit: number
  credit: number
  description: string
  is_retained_earnings_line?: boolean
}

export interface ClosingPreviewResponse {
  lines: ClosingPreviewLine[]
  total_revenue: number
  total_cogs: number
  total_expenses: number
  net_profit: number
  is_profit: boolean
  retained_earnings_account: { id: number; code: string; name: string; type?: string } | null
}

export interface CloseWizardPayload {
  retained_earnings_account_id: number
  confirmation: string
  confirmed_checks: boolean[]
  archive_inventory?: boolean
}

export interface CloseWizardResponse {
  message: string
  closing_entry_id?: number | null
  net_profit?: number | null
  fiscal_year?: FiscalYear
  closing_journal_entry?: unknown
}

export const fiscalYearApi = {
  list: (tenantId: number) =>
    api.get<FiscalYear[]>('/fiscal-years', tenantHeaders(tenantId)).then((r) => r.data),

  equityAccounts: (tenantId: number) =>
    api
      .get<{ data: EquityAccountOption[] }>('/fiscal-years/equity-accounts', tenantHeaders(tenantId))
      .then((r) => r.data.data ?? []),

  preCloseChecks: (tenantId: number, id: number) =>
    api
      .get<PreCloseChecksResponse>(`/fiscal-years/${id}/pre-close-checks`, tenantHeaders(tenantId))
      .then((r) => r.data),

  previewClosingEntry: (tenantId: number, id: number, retainedEarningsAccountId: number) =>
    api
      .get<ClosingPreviewResponse>(`/fiscal-years/${id}/preview-closing-entry`, {
        ...tenantHeaders(tenantId),
        params: { retained_earnings_account_id: retainedEarningsAccountId },
      })
      .then((r) => r.data),

  closeWizard: (tenantId: number, id: number, payload: CloseWizardPayload) =>
    api
      .post<CloseWizardResponse>(`/fiscal-years/${id}/close`, payload, tenantHeaders(tenantId))
      .then((r) => r.data),
}
