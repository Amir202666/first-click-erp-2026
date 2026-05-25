export interface Tenant {
  id: number
  name: string
  slug: string
  email: string
  plan: string
  is_active: boolean
  created_at: string
  stats: {
    invoices_count: number
    customers_count: number
    items_count: number
    journals_count: number
    db_size_mb: number
  }
}

export type BackupScope = 'full' | 'tenant'

export interface BackupJob {
  id: string
  scope: BackupScope
  tenant_id?: number
  tenant_name?: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  file_name?: string
  file_size_mb?: number
  download_url?: string
  started_at: string
  completed_at?: string
  error?: string
}

export type ResetModule =
  | 'invoices'
  | 'journals'
  | 'payments'
  | 'inventory'
  | 'customers'
  | 'items'
  | 'accounts'
  | 'all'

export interface ResetJob {
  id: string
  tenant_id: number
  tenant_name: string
  modules: ResetModule[]
  status: 'pending' | 'running' | 'completed' | 'failed'
  deleted_counts: Partial<Record<ResetModule, number>>
  started_at: string
  completed_at?: string
  confirmed_by: string
}

export const RESET_MODULE_LABELS: Record<Exclude<ResetModule, 'all'>, { ar: string; en: string; icon: string }> = {
  invoices: { ar: 'الفواتير (مبيعات + مشتريات)', en: 'Invoices (sales + purchases)', icon: '🧾' },
  journals: { ar: 'القيود اليومية', en: 'Journal entries', icon: '📒' },
  payments: { ar: 'سندات القبض والصرف', en: 'Payment vouchers', icon: '💰' },
  inventory: { ar: 'حركات المخزون', en: 'Inventory movements', icon: '📦' },
  customers: { ar: 'العملاء والموردين', en: 'Customers & vendors', icon: '👥' },
  items: { ar: 'الأصناف والمخزون', en: 'Items & stock', icon: '🏷' },
  accounts: { ar: 'دليل الحسابات', en: 'Chart of accounts', icon: '📊' },
}
