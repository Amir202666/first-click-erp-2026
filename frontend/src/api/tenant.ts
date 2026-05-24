import { isAxiosError } from 'axios'
import { api } from './client'
import type {
  Account, Customer, CustomerGroup, Vendor, Item, ItemCategory, ItemUnit, ItemBrand,
  Invoice, Quotation, QuotationToInvoicePayload, PurchaseRequest, PurchaseRequestToInvoicePayload, JournalEntry, FiscalYear, Payment, DashboardData, PaginatedResponse,
  PaymentMethod, Currency, Branch, CostCenter,
  OpeningStockHeader, AccountStatementResponse,
  CustomerBalancesResponse, CustomerAgingResponse, CustomerAnalysisResponse, CustomerAnalysisSortBasis, VendorBalancesResponse, AccountLastMovementLine,
  TenantAccountDefault, TenantSettings, TenantUserItem, Role, Permission, AuditLogEntry,
  PosItem, PosShiftInfo, PosCartLine, PosXReport, PosZReport, PosShiftReportRow, PosShiftsReportStats, PosExpenseCategory, PosExpenseItem,
  DocumentTemplate,
  Warehouse, TransferHeader,
  BillOfMaterial, ProductionOrder,
  SalesRep,
  DeliveryDriver,
  DeliveryAssignment,
  RestaurantTable, RestaurantSection, KitchenTicket, KitchenTicketLine,
  Installment, InstallmentLine, InstallmentPeriod,
  ItemAttributeTemplate,
  PricingGroup,
  VendorGroup,
  VendorPurchaseAnalysisResponse,
  VendorAgingResponse,
  VendorPerformanceResponse,
} from '../types'
import type { CashierDailyReport, CashierDailyReportShiftOption } from '../types/cashierReport'

function tenantHeaders(tenantId: number) {
  return { headers: { 'X-Tenant-ID': tenantId.toString() } }
}

/** يطابق فلتر «اليوم» في التقارير مع تقويم المتصفح (تمريرها للـ API كـ report_tz). */
function browserIanaTimeZone(): string | undefined {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    // بعض أجهزة ويندوز تكون مضبوطة على UTC فتُكسر فلاتر «اليوم» (خصوصاً في الكويت).
    // نثبت توقيت العمل كافتراضي عندما تكون القيمة UTC أو غير معروفة.
    if (!tz || tz === 'UTC') return 'Asia/Kuwait'
    return tz
  } catch {
    return 'Asia/Kuwait'
  }
}

/** يوحّد استجابة القوائم سواء أعادها الـ API كمصفوفة أو كـ `{ data: [] }`. */
function unwrapList<T>(data: T[] | { data: T[] } | undefined | null): T[] {
  if (data == null) return []
  if (Array.isArray(data)) return data
  if (typeof data === 'object' && data !== null && 'data' in data) {
    const inner = (data as { data: unknown }).data
    return Array.isArray(inner) ? (inner as T[]) : []
  }
  return []
}

// ──── Dashboard ────
export interface DashboardParams {
  period?: string
  from_date?: string
  to_date?: string
  branch_id?: number | null
}
export const fetchDashboard = (tenantId: number, params?: DashboardParams) => {
  const search = new URLSearchParams()
  if (params?.period) search.set('period', params.period)
  if (params?.from_date) search.set('from_date', params.from_date)
  if (params?.to_date) search.set('to_date', params.to_date)
  if (params?.branch_id != null && params.branch_id > 0) search.set('branch_id', String(params.branch_id))
  const qs = search.toString()
  const url = qs ? `/dashboard?${qs}` : '/dashboard'
  return api.get<DashboardData>(url, tenantHeaders(tenantId)).then((r) => r.data)
}

// ──── Accounts ────
export const fetchAccounts = (tenantId: number, params?: Record<string, string>) =>
  api.get<Account[]>('/accounts', { ...tenantHeaders(tenantId), params }).then(r => r.data)

export const fetchAccountTree = (tenantId: number, params?: Record<string, string>) =>
  api.get<Account[]>('/accounts/tree', { ...tenantHeaders(tenantId), params }).then(r => r.data)

// ──── إعدادات الحسابات الافتراضية (للربط التلقائي بعمليات البيع/الشراء) ────
export const fetchAccountDefaults = (tenantId: number) =>
  api.get<TenantAccountDefault>('/account-defaults', tenantHeaders(tenantId)).then(r => r.data)

export const updateAccountDefaults = (tenantId: number, data: Partial<TenantAccountDefault>) =>
  api.put<TenantAccountDefault>('/account-defaults', { ...data, tenant_id: tenantId }, tenantHeaders(tenantId)).then(r => r.data)

// ──── إعدادات الشريك (محاسبة، نقطة بيع، عام) Key-Value ────
export const fetchSettings = (tenantId: number) =>
  api.get<TenantSettings>('/settings', tenantHeaders(tenantId)).then(r => r.data)

export const updateSettings = (tenantId: number, data: Partial<TenantSettings>) =>
  api.put<TenantSettings>('/settings', { ...data, tenant_id: tenantId }, tenantHeaders(tenantId)).then(r => r.data)

/** رفع شعار الشركة وحفظه كافتراضي في الإعدادات */
export const uploadCompanyLogo = (tenantId: number, file: File) => {
  const form = new FormData()
  form.append('logo', file)
  form.append('tenant_id', String(tenantId))
  return api.post<{ url: string; path: string }>('/settings/upload-company-logo', form, {
    headers: {
      'X-Tenant-ID': tenantId.toString(),
      'Content-Type': 'multipart/form-data',
    },
  }).then(r => r.data)
}

// ──── قوالب المستندات (فواتير، سندات، ...) ────
export const fetchDocumentTemplates = (tenantId: number, params?: { doc_type?: string }) =>
  api.get<DocumentTemplate[]>('/document-templates', { ...tenantHeaders(tenantId), params }).then(r => r.data)

export const fetchDocumentTemplate = (tenantId: number, id: number) =>
  api.get<DocumentTemplate>(`/document-templates/${id}`, tenantHeaders(tenantId)).then(r => r.data)

export const createDocumentTemplate = (tenantId: number, data: Pick<DocumentTemplate, 'name' | 'doc_type' | 'format' | 'content'> & { is_active?: boolean; meta?: Record<string, unknown> | null }) =>
  api.post<DocumentTemplate>('/document-templates', { ...data, tenant_id: tenantId }, tenantHeaders(tenantId)).then(r => r.data)

export const updateDocumentTemplate = (tenantId: number, id: number, data: Partial<Pick<DocumentTemplate, 'name' | 'doc_type' | 'format' | 'content' | 'is_active' | 'meta'>>) =>
  api.put<DocumentTemplate>(`/document-templates/${id}`, { ...data, tenant_id: tenantId }, tenantHeaders(tenantId)).then(r => r.data)

export const deleteDocumentTemplate = (tenantId: number, id: number) =>
  api.delete(`/document-templates/${id}`, tenantHeaders(tenantId))

/** تحويل قالب من صيغة PHP المُسلسَلة (تصدير أنظمة أخرى) إلى صيغة القالب */
export const convertPhpSerializedTemplate = (tenantId: number, content: string) =>
  api.post<{ name: string; doc_type: string; format?: string; content: string; meta?: Record<string, unknown> | null }>(
    '/document-templates/convert-php',
    { content, tenant_id: tenantId },
    tenantHeaders(tenantId)
  ).then(r => r.data)

export const createAccount = (tenantId: number, data: Partial<Account>) =>
  api.post<Account>('/accounts', data, tenantHeaders(tenantId)).then(r => r.data)

export const fetchNextAccountCode = (tenantId: number, parentId?: number | null) =>
  api.get<{ code: string }>('/accounts/next-code', {
    ...tenantHeaders(tenantId),
    params: parentId ? { parent_id: parentId } : {},
  }).then(r => r.data)

export const updateAccount = (tenantId: number, id: number, data: Partial<Account>) =>
  api.put<Account>(`/accounts/${id}`, data, tenantHeaders(tenantId)).then(r => r.data)

export const deleteAccount = (tenantId: number, id: number) =>
  api.delete(`/accounts/${id}`, tenantHeaders(tenantId))

/** تصدير دليل الحسابات CSV */
export async function exportChartOfAccounts(tenantId: number): Promise<void> {
  const res = await api.get('/accounts/export', {
    ...tenantHeaders(tenantId),
    responseType: 'blob',
  })
  const blob = res.data as Blob
  const name = res.headers['content-disposition']?.match(/filename="?([^";]+)"?/)?.[1] ?? `chart-of-accounts-${new Date().toISOString().slice(0, 10)}.csv`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/** استيراد دليل الحسابات من ملف CSV */
export function importChartOfAccounts(tenantId: number, file: File) {
  const form = new FormData()
  form.append('file', file)
  return api.post<{ message: string; created: number; updated: number; errors: string[] }>(
    '/accounts/import',
    form,
    tenantHeaders(tenantId)
  ).then(r => r.data)
}

export type ChartWizardImportRow = {
  line: number
  code: string
  name: string
  name_en?: string | null
  type?: string
  parent_code?: string
  level?: number | null
  is_postable?: boolean
  description?: string | null
  normal_balance?: 'debit' | 'credit' | null
}

/** استيراد دليل الحسابات (معالج): JSON + إدراج مجمع */
export function importChartOfAccountsWizard(tenantId: number, rows: ChartWizardImportRow[]) {
  return api
    .post<{
      inserted: number
      failed: { line: number; code: string; reason: string }[]
      success_count?: number
      failures?: { line: number; code: string; reason: string }[]
    }>('/accounts/import-wizard', { rows }, tenantHeaders(tenantId))
    .then((r) => r.data)
}

// ──── Customers ────
export const fetchCustomers = (tenantId: number, params?: Record<string, string>, signal?: AbortSignal) =>
  api.get<PaginatedResponse<Customer>>('/customers', { ...tenantHeaders(tenantId), params, signal }).then((r) => r.data)

/** بحث عملاء لرأس جدول الفواتير — POST لتفادي أعطال ترميز العربية في بعض الخوادم/الوكلاء */
export const searchCustomersParty = (tenantId: number, q: string, signal?: AbortSignal) =>
  api
    .post<PaginatedResponse<Customer>>(
      '/customers/party-search',
      { q, per_page: 100 },
      { ...tenantHeaders(tenantId), signal },
    )
    .then((r) => r.data)

/** بحث موردين لرأس جدول الفواتير — POST */
export const searchVendorsParty = (tenantId: number, q: string, signal?: AbortSignal) =>
  api
    .post<PaginatedResponse<Vendor>>(
      '/vendors/party-search',
      { q, per_page: 100 },
      { ...tenantHeaders(tenantId), signal },
    )
    .then((r) => r.data)

export const createCustomer = (tenantId: number, data: Partial<Customer>) =>
  api.post<Customer>('/customers', data, tenantHeaders(tenantId)).then(r => r.data)

export const updateCustomer = (tenantId: number, id: number, data: Partial<Customer>) =>
  api.put<Customer>(`/customers/${id}`, data, tenantHeaders(tenantId)).then(r => r.data)

export const deleteCustomer = (tenantId: number, id: number) =>
  api.delete(`/customers/${id}`, tenantHeaders(tenantId))

// ──── Customer Groups ────
export const fetchCustomerGroups = (tenantId: number) =>
  api.get<{ data: CustomerGroup[] }>('/customer-groups', tenantHeaders(tenantId)).then((r) => r.data.data)

export const createCustomerGroup = (tenantId: number, data: Partial<CustomerGroup>) =>
  api.post<CustomerGroup>('/customer-groups', data, tenantHeaders(tenantId)).then((r) => r.data)

export const updateCustomerGroup = (tenantId: number, id: number, data: Partial<CustomerGroup>) =>
  api.put<CustomerGroup>(`/customer-groups/${id}`, data, tenantHeaders(tenantId)).then((r) => r.data)

export const deleteCustomerGroup = (tenantId: number, id: number) =>
  api.delete(`/customer-groups/${id}`, tenantHeaders(tenantId))

// ──── Vendors ────
export const fetchVendors = (tenantId: number, params?: Record<string, string>, signal?: AbortSignal) =>
  api.get<PaginatedResponse<Vendor>>('/vendors', { ...tenantHeaders(tenantId), params, signal }).then((r) => r.data)

export const fetchVendor = (tenantId: number, id: number) =>
  api.get<Vendor>(`/vendors/${id}`, tenantHeaders(tenantId)).then((r) => r.data)

export const createVendor = (tenantId: number, data: Partial<Vendor>) =>
  api.post<Vendor>('/vendors', data, tenantHeaders(tenantId)).then(r => r.data)

export const updateVendor = (tenantId: number, id: number, data: Partial<Vendor>) =>
  api.put<Vendor>(`/vendors/${id}`, data, tenantHeaders(tenantId)).then(r => r.data)

export const deleteVendor = (tenantId: number, id: number) =>
  api.delete(`/vendors/${id}`, tenantHeaders(tenantId))

// ──── Vendor Groups ────
export const fetchVendorGroups = (tenantId: number) =>
  api.get<{ data: VendorGroup[] }>('/vendor-groups', tenantHeaders(tenantId)).then((r) => r.data.data)

export const createVendorGroup = (tenantId: number, data: Partial<VendorGroup>) =>
  api.post<VendorGroup>('/vendor-groups', { ...data, tenant_id: tenantId }, tenantHeaders(tenantId)).then((r) => r.data)

export const updateVendorGroup = (tenantId: number, id: number, data: Partial<VendorGroup>) =>
  api.put<VendorGroup>(`/vendor-groups/${id}`, { ...data, tenant_id: tenantId }, tenantHeaders(tenantId)).then((r) => r.data)

export const deleteVendorGroup = (tenantId: number, id: number) =>
  api.delete(`/vendor-groups/${id}`, tenantHeaders(tenantId))

// ──── Items ────
export const fetchItems = (tenantId: number, params?: Record<string, string>) =>
  api.get<PaginatedResponse<Item>>('/items', { ...tenantHeaders(tenantId), params: { ...params, tenant_id: String(tenantId) } }).then(r => r.data)

/** جلب صنف واحد (يتضمن average_cost من المخزن) */
export const fetchItem = (tenantId: number, itemId: number, params?: { warehouse_id?: number }) =>
  api.get<Item & { average_cost?: number }>(`/items/${itemId}`, { ...tenantHeaders(tenantId), params }).then(r => r.data)

/** قائمة أصناف خفيفة للفلاتر (بدون حساب المخزون لكل صنف) */
export const fetchItemsForFilter = (tenantId: number, params?: Record<string, string>) =>
  api.get<PaginatedResponse<Item>>('/items', {
    ...tenantHeaders(tenantId),
    params: { ...params, tenant_id: String(tenantId), for_filter: '1', per_page: params?.per_page ?? '1000' },
  })
    .then(r => r.data)
    .catch((err: { response?: { status?: number } }) =>
      err?.response?.status === 404
        ? { data: [], total: 0, current_page: 1, last_page: 1, per_page: 1000 }
        : Promise.reject(err))

function itemToFormData(data: Record<string, unknown>, imageFile?: File | null): FormData {
  const fd = new FormData()
  Object.entries(data).forEach(([key, value]) => {
    if (key === 'bom_lines' && Array.isArray(value)) {
      fd.append('bom_lines', JSON.stringify(value))
      return
    }
    if (value == null || value === '') return
    if (typeof value === 'boolean') fd.append(key, value ? '1' : '0')
    else if (typeof value === 'number') fd.append(key, String(value))
    else fd.append(key, String(value))
  })
  if (imageFile) fd.append('image', imageFile)
  return fd
}

export const createItem = (tenantId: number, data: Partial<Item>, imageFile?: File | null) => {
  if (imageFile) {
    const fd = itemToFormData(data as Record<string, unknown>, imageFile)
    return api.post<Item>('/items', fd, { headers: { ...tenantHeaders(tenantId).headers, 'Content-Type': 'multipart/form-data' } }).then(r => r.data)
  }
  return api.post<Item>('/items', data, tenantHeaders(tenantId)).then(r => r.data)
}

export const updateItem = (tenantId: number, id: number, data: Partial<Item>, imageFile?: File | null) => {
  if (imageFile) {
    const fd = itemToFormData(data as Record<string, unknown>, imageFile)
    return api.put<Item>(`/items/${id}`, fd, { headers: { ...tenantHeaders(tenantId).headers, 'Content-Type': 'multipart/form-data' } }).then(r => r.data)
  }
  return api.put<Item>(`/items/${id}`, data, tenantHeaders(tenantId)).then(r => r.data)
}

export const deleteItem = (tenantId: number, id: number) =>
  api.delete(`/items/${id}`, tenantHeaders(tenantId))

/** جلب الأرقام التسلسلية المتاحة في المخزن لصنف محدد */
export const fetchAvailableSerials = (
  tenantId: number,
  itemId: number,
  params?: { warehouse_id?: number; search?: string }
): Promise<{ id: number; serial_number: string; warehouse_id: number | null }[]> =>
  api
    .get<{ id: number; serial_number: string; warehouse_id: number | null }[]>(
      `/items/${itemId}/available-serials`,
      { ...tenantHeaders(tenantId), params: { ...params, tenant_id: String(tenantId) } }
    )
    .then(r => r.data)

export const fetchItemCategories = (tenantId: number) =>
  api.get<ItemCategory[] | { data: ItemCategory[] }>('/item-categories', { ...tenantHeaders(tenantId), params: { tenant_id: tenantId } })
    .then((r) => unwrapList<ItemCategory>(r.data))
    .catch((err: { response?: { status?: number } }) => {
      const status = err?.response?.status
      if (status === 404 || status === 422) return [] as ItemCategory[]
      return Promise.reject(err)
    })

function categoryToFormData(data: Record<string, unknown>, imageFile?: File | null): FormData {
  const fd = new FormData()
  Object.entries(data).forEach(([key, value]) => {
    if (key === 'image') return
    if (key === 'branch_ids' && Array.isArray(value)) {
      value.forEach((id) => {
        if (id != null && id !== '') fd.append('branch_ids[]', String(id))
      })
      return
    }
    if (value == null || value === '') return
    if (typeof value === 'boolean') fd.append(key, value ? '1' : '0')
    else if (typeof value === 'number') fd.append(key, String(value))
    else fd.append(key, String(value))
  })
  if (imageFile) fd.append('image', imageFile)
  return fd
}

export const createItemCategory = (tenantId: number, data: Partial<ItemCategory>, imageFile?: File | null) => {
  if (imageFile) {
    const fd = categoryToFormData(data as Record<string, unknown>, imageFile)
    return api.post<ItemCategory>('/item-categories', fd, { headers: { ...tenantHeaders(tenantId).headers, 'Content-Type': 'multipart/form-data' } }).then(r => r.data)
  }
  return api.post<ItemCategory>('/item-categories', data, tenantHeaders(tenantId)).then(r => r.data)
}

export const updateItemCategory = (tenantId: number, id: number, data: Partial<ItemCategory>, imageFile?: File | null) => {
  if (imageFile) {
    const fd = categoryToFormData(data as Record<string, unknown>, imageFile)
    return api.put<ItemCategory>(`/item-categories/${id}`, fd, { headers: { ...tenantHeaders(tenantId).headers, 'Content-Type': 'multipart/form-data' } }).then(r => r.data)
  }
  return api.put<ItemCategory>(`/item-categories/${id}`, data, tenantHeaders(tenantId)).then(r => r.data)
}

export const deleteItemCategory = (tenantId: number, id: number) =>
  api.delete(`/item-categories/${id}`, tenantHeaders(tenantId))

// ──── Item Units ────
export const fetchItemUnits = (tenantId: number) =>
  api.get<ItemUnit[]>('/item-units', tenantHeaders(tenantId)).then(r => r.data)

export const createItemUnit = (tenantId: number, data: Partial<ItemUnit>) =>
  api.post<ItemUnit>('/item-units', data, tenantHeaders(tenantId)).then(r => r.data)

export const updateItemUnit = (tenantId: number, id: number, data: Partial<ItemUnit>) =>
  api.put<ItemUnit>(`/item-units/${id}`, data, tenantHeaders(tenantId)).then(r => r.data)

export const deleteItemUnit = (tenantId: number, id: number) =>
  api.delete(`/item-units/${id}`, tenantHeaders(tenantId))

// ──── Item Brands ────
export const fetchItemBrands = (tenantId: number) =>
  api
    .get<ItemBrand[] | { data: ItemBrand[] }>('/item-brands', { ...tenantHeaders(tenantId), params: { tenant_id: tenantId } })
    .then((r) => unwrapList<ItemBrand>(r.data))
    .catch((err: { response?: { status?: number } }) => (err?.response?.status === 404 ? ([] as ItemBrand[]) : Promise.reject(err)))

export const fetchNextItemCode = (tenantId: number, categoryId: number) =>
  api.get<{ code: string }>('/items/next-code', {
    ...tenantHeaders(tenantId),
    params: { category_id: String(categoryId) },
  }).then(r => r.data.code)

export const createItemBrand = (tenantId: number, data: Partial<ItemBrand>) =>
  api.post<ItemBrand>('/item-brands', data, tenantHeaders(tenantId)).then(r => r.data)

export const updateItemBrand = (tenantId: number, id: number, data: Partial<ItemBrand>) =>
  api.put<ItemBrand>(`/item-brands/${id}`, data, tenantHeaders(tenantId)).then(r => r.data)

export const deleteItemBrand = (tenantId: number, id: number) =>
  api.delete(`/item-brands/${id}`, tenantHeaders(tenantId))

// ──── Item Variant Attribute Templates ────
export const fetchItemAttributeTemplates = (tenantId: number) =>
  api
    .get<{ data: ItemAttributeTemplate[] }>('/item-attribute-templates', {
      ...tenantHeaders(tenantId),
      params: { tenant_id: String(tenantId) },
    })
    .then((r) => r.data?.data ?? [])

export const createItemAttributeTemplate = (
  tenantId: number,
  data: { name: string; values: string[] },
) =>
  api
    .post<ItemAttributeTemplate>(
      '/item-attribute-templates',
      { ...data, tenant_id: tenantId },
      tenantHeaders(tenantId),
    )
    .then((r) => r.data)

// ──── Inventory ────
export const fetchInventoryMovements = (tenantId: number, params?: Record<string, string>) =>
  api.get('/inventory/movements', { ...tenantHeaders(tenantId), params }).then(r => r.data)

export const fetchItemMovements = (tenantId: number, itemId: number, params?: Record<string, string>) =>
  api.get(`/inventory/items/${itemId}/movements`, { ...tenantHeaders(tenantId), params }).then(r => r.data)

export const addInventoryMovement = (tenantId: number, data: Record<string, unknown>) =>
  api.post('/inventory/movements', data, tenantHeaders(tenantId)).then(r => r.data)

export const adjustStock = (tenantId: number, data: Record<string, unknown>) =>
  api.post('/inventory/adjust', data, tenantHeaders(tenantId)).then(r => r.data)

/** حذف حركات المخزون اليتيمة (المرتبطة بأوامر إنتاج محذوفة) */
export const cleanOrphanedProductionOrderMovements = (tenantId: number) =>
  api.post<{ message: string; deleted_count: number }>('/inventory/clean-orphan-production-movements', { tenant_id: tenantId }, tenantHeaders(tenantId)).then(r => r.data)

export const fetchInventoryFullReport = (tenantId: number, params?: Record<string, string>) =>
  api.get('/inventory/report', { ...tenantHeaders(tenantId), params }).then(r => r.data)

export const fetchVariantInventoryReport = (tenantId: number, params?: Record<string, string>) =>
  api.get('/inventory/variant-report', { ...tenantHeaders(tenantId), params }).then(r => r.data)

export const fetchLowStockAlerts = (tenantId: number, params?: Record<string, string>) =>
  api.get<{ data: Array<{ item_id: number; item_code: string; item_name: string; unit: string; current_stock: number; min_quantity: number; shortage: number }> }>(
    '/inventory/low-stock',
    { ...tenantHeaders(tenantId), params }
  ).then(r => r.data)

export const fetchExpiryStockAlerts = (tenantId: number, params?: Record<string, string>) =>
  api.get<{ data: Array<Record<string, unknown>>; within_days: number }>('/inventory/expiry-alerts', {
    ...tenantHeaders(tenantId),
    params,
  }).then((r) => r.data)

export const fetchExpiryStockReport = (tenantId: number, params?: Record<string, string>) =>
  api.get('/inventory/expiry-stock-report', { ...tenantHeaders(tenantId), params }).then((r) => r.data)

// ──── Inventory Adjustments (تسوية جردية) ────
export const fetchInventoryAdjustments = (tenantId: number, params?: Record<string, string>) =>
  api.get('/inventory/adjustments', { ...tenantHeaders(tenantId), params }).then(r => r.data)

export const fetchInventoryAdjustment = (tenantId: number, id: number) =>
  api.get(`/inventory/adjustments/${id}`, tenantHeaders(tenantId)).then(r => r.data)

export const createInventoryAdjustment = (tenantId: number, data: Record<string, unknown>) =>
  api.post('/inventory/adjustments', data, tenantHeaders(tenantId)).then(r => r.data)

export const updateInventoryAdjustment = (tenantId: number, id: number, data: Record<string, unknown>) =>
  api.put(`/inventory/adjustments/${id}`, data, tenantHeaders(tenantId)).then(r => r.data)

export const deleteInventoryAdjustment = (tenantId: number, id: number) =>
  api.delete(`/inventory/adjustments/${id}`, tenantHeaders(tenantId))

export const uploadInventoryAdjustmentAttachment = (tenantId: number, id: number, attachment: File) => {
  const form = new FormData()
  form.append('attachment', attachment)
  return api.post(`/inventory/adjustments/${id}/attachment`, form, {
    ...tenantHeaders(tenantId),
    headers: { ...(tenantHeaders(tenantId).headers ?? {}), 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data)
}

// ──── Warehouses ────
export type WarehouseMutationPayload = Partial<Warehouse> & {
  branch_ids?: number[]
  applies_to_all_branches?: boolean
}

export const fetchWarehouses = (tenantId: number, params?: { per_page?: string }) =>
  api.get<{ data: Warehouse[] }>('/warehouses', { ...tenantHeaders(tenantId), params: { ...params, tenant_id: String(tenantId) } }).then(r => r.data)

export const createWarehouse = (tenantId: number, data: WarehouseMutationPayload) =>
  api.post<Warehouse>('/warehouses', data, tenantHeaders(tenantId)).then(r => r.data)

export const updateWarehouse = (tenantId: number, id: number, data: WarehouseMutationPayload) =>
  api.put<Warehouse>(`/warehouses/${id}`, data, tenantHeaders(tenantId)).then(r => r.data)

export const deleteWarehouse = (tenantId: number, id: number) =>
  api.delete(`/warehouses/${id}`, tenantHeaders(tenantId))

// ──── Transfers ────
export const fetchTransfers = (tenantId: number, params?: Record<string, string>) =>
  api.get<PaginatedResponse<TransferHeader>>('/transfers', { ...tenantHeaders(tenantId), params }).then(r => r.data)

export const fetchTransferNextNumber = (tenantId: number) =>
  api.get<{ number: string }>('/transfers/next-number', tenantHeaders(tenantId)).then(r => r.data.number)

export const fetchTransfer = (tenantId: number, id: number) =>
  api.get<TransferHeader>(`/transfers/${id}`, tenantHeaders(tenantId)).then(r => r.data)

export const createTransfer = (tenantId: number, data: Record<string, unknown>) =>
  api.post<TransferHeader>('/transfers', data, tenantHeaders(tenantId)).then(r => r.data)

export const updateTransfer = (tenantId: number, id: number, data: Record<string, unknown>) =>
  api.put<TransferHeader>(`/transfers/${id}`, data, tenantHeaders(tenantId)).then(r => r.data)

export const deleteTransfer = (tenantId: number, id: number) =>
  api.delete(`/transfers/${id}`, tenantHeaders(tenantId))

export const setTransferInTransit = (tenantId: number, id: number) =>
  api.post<TransferHeader>(`/transfers/${id}/in-transit`, {}, tenantHeaders(tenantId)).then(r => r.data)

export const setTransferReceived = (tenantId: number, id: number) =>
  api.post<TransferHeader>(`/transfers/${id}/received`, {}, tenantHeaders(tenantId)).then(r => r.data)

// ──── Invoices ────
export const fetchInvoices = (tenantId: number, params?: Record<string, string>, signal?: AbortSignal) =>
  api
    .get<PaginatedResponse<Invoice>>('/invoices', { ...tenantHeaders(tenantId), params, signal })
    .then((r) => r.data)

export const fetchInvoice = (tenantId: number, id: number) =>
  api.get<Invoice>(`/invoices/${id}`, tenantHeaders(tenantId)).then(r => r.data)

/** رابط مشاركة الفاتورة (معاينة + PDF عند توفره من السيرفر) */
export const fetchInvoiceShareUrl = (tenantId: number, invoiceId: number) =>
  api.get<{ view_url: string; pdf_url: string | null }>(`/invoices/${invoiceId}/share-url`, tenantHeaders(tenantId)).then(r => r.data)

/** استجابة إنشاء فاتورة — قد تتضمّن سند قبض تلقائياً */
export type CreateInvoiceReceiptSummary = {
  receipt_ids: number[]
  references: string[]
  reference: string
  amount: number
  remaining: number
  date: string
}

export type CreateInvoiceResponse = {
  message?: string
  invoice: Invoice
  receipt: CreateInvoiceReceiptSummary | null
  has_receipt: boolean
}

export const createInvoice = (tenantId: number, data: Record<string, unknown>) =>
  api.post<CreateInvoiceResponse>('/invoices', data, tenantHeaders(tenantId)).then((r) => r.data)

/** مهلة أطول لطلبات الحفظ الثقيلة (إلغاء قيد + إنشاء قيد جديد) — 120 ثانية */
const INVOICE_UPDATE_TIMEOUT_MS = 120000

export const updateInvoice = (tenantId: number, id: number, data: Record<string, unknown>) =>
  api.put<Invoice>(`/invoices/${id}`, data, { ...tenantHeaders(tenantId), timeout: INVOICE_UPDATE_TIMEOUT_MS }).then(r => r.data)

export const updateInvoiceReceiptStatus = (tenantId: number, id: number, receipt_status: string | null) =>
  api.patch<Invoice>(`/invoices/${id}/receipt-status`, { receipt_status }, tenantHeaders(tenantId)).then(r => r.data)

export const deleteInvoice = (tenantId: number, id: number) =>
  api.delete(`/invoices/${id}`, tenantHeaders(tenantId))

export const postInvoice = (tenantId: number, id: number, body?: { delivery_driver_id?: number | null }) =>
  api.post(`/invoices/${id}/post`, body ?? {}, tenantHeaders(tenantId)).then(r => r.data)

export const cancelInvoice = (tenantId: number, id: number) =>
  api.post(`/invoices/${id}/cancel`, {}, tenantHeaders(tenantId)).then(r => r.data)

export const unpostInvoice = (tenantId: number, id: number) =>
  api.post<{ message: string; invoice: Invoice }>(`/invoices/${id}/unpost`, {}, tenantHeaders(tenantId)).then(r => r.data)

/** إعادة بناء القيد والحركات المخزنية لفاتورة مبيعات مرحّلة (بعد تغيير إعدادات التصنيع أو المنطق). */
export const rebuildInvoiceJournal = (tenantId: number, id: number) =>
  api
    .post<{ message: string; invoice: Invoice }>(`/invoices/${id}/rebuild-journal`, {}, tenantHeaders(tenantId))
    .then((r) => r.data)

export const addInvoicePayment = (
  tenantId: number,
  invoiceId: number,
  data: { amount: number; date: string; payment_method_id?: number | null; notes?: string }
) =>
  api.post<{ message: string; payment: Payment; invoice: Invoice }>(
    `/invoices/${invoiceId}/payments`,
    data,
    tenantHeaders(tenantId)
  ).then((r) => r.data)

// ──── Quotations (عروض الأسعار) ────
export const fetchQuotations = (tenantId: number, params?: Record<string, string>) =>
  api.get<PaginatedResponse<Quotation>>('/quotations', { ...tenantHeaders(tenantId), params }).then(r => r.data)

export const fetchQuotation = (tenantId: number, id: number) =>
  api.get<Quotation>(`/quotations/${id}`, tenantHeaders(tenantId)).then(r => r.data)

export const createQuotation = (tenantId: number, data: Record<string, unknown>) =>
  api.post<Quotation>('/quotations', data, tenantHeaders(tenantId)).then(r => r.data)

export const updateQuotation = (tenantId: number, id: number, data: Record<string, unknown>) =>
  api.put<Quotation>(`/quotations/${id}`, data, tenantHeaders(tenantId)).then(r => r.data)

export const deleteQuotation = (tenantId: number, id: number) =>
  api.delete(`/quotations/${id}`, tenantHeaders(tenantId))

export const convertQuotationToInvoice = (tenantId: number, id: number, target: 'sales' | 'purchase') =>
  api.post<{ message: string; invoice_payload: QuotationToInvoicePayload }>(
    `/quotations/${id}/convert-to-invoice`,
    { target },
    tenantHeaders(tenantId)
  ).then(r => r.data)

// ──── Purchase Requests (طلبات الشراء — غير مرحل) ────
export const fetchPurchaseRequests = (tenantId: number, params?: Record<string, string>) =>
  api.get<PaginatedResponse<PurchaseRequest>>('/purchase-requests', { ...tenantHeaders(tenantId), params }).then(r => r.data)

export const fetchPurchaseRequest = (tenantId: number, id: number) =>
  api.get<PurchaseRequest>(`/purchase-requests/${id}`, tenantHeaders(tenantId)).then(r => r.data)

export const createPurchaseRequest = (tenantId: number, data: Record<string, unknown>) =>
  api.post<PurchaseRequest>('/purchase-requests', data, tenantHeaders(tenantId)).then(r => r.data)

export const updatePurchaseRequest = (tenantId: number, id: number, data: Record<string, unknown>) =>
  api.put<PurchaseRequest>(`/purchase-requests/${id}`, data, tenantHeaders(tenantId)).then(r => r.data)

export const deletePurchaseRequest = (tenantId: number, id: number) =>
  api.delete(`/purchase-requests/${id}`, tenantHeaders(tenantId))

export const convertPurchaseRequestToInvoice = (tenantId: number, id: number) =>
  api.get<{ message: string; invoice_payload: PurchaseRequestToInvoicePayload; purchase_request_number: string }>(
    `/purchase-requests/${id}/convert-to-invoice`,
    tenantHeaders(tenantId)
  ).then(r => r.data)

export const createPurchaseRequestFromShortage = (tenantId: number, params?: { warehouse_id?: number; branch_id?: number }) =>
  api.post<{ message: string; purchase_request: PurchaseRequest }>(
    '/purchase-requests/from-shortage',
    { tenant_id: tenantId, ...params },
    tenantHeaders(tenantId)
  ).then(r => r.data)

// ──── Journal Entries ────
export const fetchJournalEntries = (tenantId: number, params?: Record<string, string>) =>
  api.get<PaginatedResponse<JournalEntry>>('/journal-entries', { ...tenantHeaders(tenantId), params }).then(r => r.data)

export const createJournalEntry = (tenantId: number, data: Record<string, unknown>) =>
  api.post<JournalEntry>('/journal-entries', data, tenantHeaders(tenantId)).then(r => r.data)

export const fetchJournalEntry = (tenantId: number, id: number) =>
  api.get<JournalEntry>(`/journal-entries/${id}`, tenantHeaders(tenantId)).then(r => r.data)

export const updateJournalEntry = (tenantId: number, id: number, data: Record<string, unknown>) =>
  api.put<JournalEntry>(`/journal-entries/${id}`, data, tenantHeaders(tenantId)).then(r => r.data)

export const deleteJournalEntry = (tenantId: number, id: number) =>
  api.delete(`/journal-entries/${id}`, tenantHeaders(tenantId)).then(r => r.data)

export const unpostJournalEntry = (tenantId: number, id: number) =>
  api.post<JournalEntry>(`/journal-entries/${id}/unpost`, {}, tenantHeaders(tenantId)).then(r => r.data)

export const voidJournalEntry = (tenantId: number, id: number) =>
  api.post<JournalEntry>(`/journal-entries/${id}/void`, {}, tenantHeaders(tenantId)).then(r => r.data)

export const postJournalEntry = (tenantId: number, id: number) =>
  api.post<JournalEntry>(`/journal-entries/${id}/post`, {}, tenantHeaders(tenantId)).then(r => r.data)

// ──── السنوات المالية (إقفال / قفل) ────
export const fetchFiscalYears = (tenantId: number) =>
  api.get<FiscalYear[]>('/fiscal-years', tenantHeaders(tenantId)).then((r) => r.data)

export interface CloseFiscalYearResponse {
  message: string
  fiscal_year?: FiscalYear
  closing_journal_entry?: JournalEntry | null
  closing_entry_id?: number | null
  net_profit?: number | null
  inventory_snapshot?: unknown
}

export const closeFiscalYear = (tenantId: number, id: number, body?: { archive_inventory?: boolean }) =>
  api.post<CloseFiscalYearResponse>(`/fiscal-years/${id}/close`, body ?? {}, tenantHeaders(tenantId)).then((r) => r.data)

export const setFiscalYearLock = (tenantId: number, id: number, locked: boolean) =>
  api.patch<{ message: string; fiscal_year: FiscalYear }>(`/fiscal-years/${id}/lock`, { locked }, tenantHeaders(tenantId)).then((r) => r.data)

// ──── Payments ────
export const fetchPayments = (tenantId: number, params?: Record<string, string>) =>
  api.get<PaginatedResponse<Payment>>('/payments', { ...tenantHeaders(tenantId), params }).then(r => r.data)

export const createPayment = (tenantId: number, data: Record<string, unknown>) =>
  api.post<Payment>('/payments', data, tenantHeaders(tenantId)).then(r => r.data)

export const fetchPayment = (tenantId: number, id: number) =>
  api.get<Payment>(`/payments/${id}`, tenantHeaders(tenantId)).then(r => r.data)

export const updatePayment = (tenantId: number, id: number, data: Record<string, unknown>) =>
  api.put<Payment>(`/payments/${id}`, data, tenantHeaders(tenantId)).then(r => r.data)

export const approvePayment = (tenantId: number, id: number) =>
  api.post<{ message: string; payment: Payment }>(`/payments/${id}/approve`, {}, tenantHeaders(tenantId)).then(r => r.data)

export const uploadPaymentAttachment = (tenantId: number, id: number, file: File) => {
  const form = new FormData()
  form.append('attachment', file)
  return api.post<{ message: string; payment: Payment }>(`/payments/${id}/attachment`, form, {
    headers: { ...tenantHeaders(tenantId).headers, 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)
}

// ──── Invoice Attachments ────
export const uploadInvoiceAttachment = (tenantId: number, id: number, file: File) => {
  const form = new FormData()
  form.append('attachment', file)
  return api.post<{ message?: string; invoice?: any }>(`/invoices/${id}/attachment`, form, {
    headers: { ...tenantHeaders(tenantId).headers, 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)
}

export const deletePayment = (tenantId: number, id: number) =>
  api.delete(`/payments/${id}`, tenantHeaders(tenantId))

// ──── Payment Methods ────
export const fetchPaymentMethods = (tenantId: number, params?: Record<string, string>) =>
  api
    .get<PaymentMethod[] | { data: PaymentMethod[] }>('/payment-methods', { ...tenantHeaders(tenantId), params })
    .then((r) => unwrapList<PaymentMethod>(r.data))

export const createPaymentMethod = (tenantId: number, data: Partial<PaymentMethod>) =>
  api.post<PaymentMethod>('/payment-methods', data, tenantHeaders(tenantId)).then(r => r.data)

export const updatePaymentMethod = (tenantId: number, id: number, data: Partial<PaymentMethod>) =>
  api.put<PaymentMethod>(`/payment-methods/${id}`, data, tenantHeaders(tenantId)).then(r => r.data)

export const deletePaymentMethod = (tenantId: number, id: number) =>
  api.delete(`/payment-methods/${id}`, tenantHeaders(tenantId))

// ──── Pricing Groups ────
export const fetchPricingGroups = (tenantId: number) =>
  api.get<PricingGroup[] | { data: PricingGroup[] }>('/pricing-groups', tenantHeaders(tenantId)).then(r => unwrapList<PricingGroup>(r.data))

export const createPricingGroup = (tenantId: number, data: Partial<PricingGroup>) =>
  api.post<PricingGroup>('/pricing-groups', data, tenantHeaders(tenantId)).then(r => r.data)

export const updatePricingGroup = (tenantId: number, id: number, data: Partial<PricingGroup>) =>
  api.put<PricingGroup>(`/pricing-groups/${id}`, data, tenantHeaders(tenantId)).then(r => r.data)

export const deletePricingGroup = (tenantId: number, id: number) =>
  api.delete(`/pricing-groups/${id}`, tenantHeaders(tenantId))

// ──── Currencies ────
export const fetchCurrencies = (tenantId: number, params?: Record<string, string>) =>
  api.get<Currency[]>('/currencies', { ...tenantHeaders(tenantId), params }).then(r => r.data)

export const createCurrency = (tenantId: number, data: Partial<Currency>) =>
  api.post<Currency>('/currencies', data, tenantHeaders(tenantId)).then(r => r.data)

export const updateCurrency = (tenantId: number, id: number, data: Partial<Currency>) =>
  api.put<Currency>(`/currencies/${id}`, data, tenantHeaders(tenantId)).then(r => r.data)

export const updateCurrencySettings = (tenantId: number, id: number, data: { decimal_places: number; exchange_rate: number; is_active?: boolean }) =>
  api.put<{ message: string; currency: Currency }>(`/currencies/${id}/settings`, data, tenantHeaders(tenantId)).then(r => r.data)

export interface FetchRatesResponse {
  updated: number
  failed: string[]
  message: string
}
export const fetchExchangeRates = (tenantId: number) =>
  api.post<FetchRatesResponse>('/currencies/fetch-rates', { tenant_id: tenantId }, tenantHeaders(tenantId)).then(r => r.data)

export const deleteCurrency = (tenantId: number, id: number) =>
  api.delete(`/currencies/${id}`, tenantHeaders(tenantId))

// ──── Branches ────
export const fetchBranches = (tenantId: number, params?: Record<string, string>) =>
  api.get<Branch[] | { data: Branch[] }>('/branches', { ...tenantHeaders(tenantId), params })
    .then((r) => unwrapList<Branch>(r.data))
    .catch((err: { response?: { status?: number } }) => {
      const status = err?.response?.status
      if (status === 404 || status === 422) return [] as Branch[]
      return Promise.reject(err)
    })

export const createBranch = (tenantId: number, data: Partial<Branch>) =>
  api.post<Branch>('/branches', data, tenantHeaders(tenantId)).then(r => r.data)

export const updateBranch = (tenantId: number, id: number, data: Partial<Branch>) =>
  api.put<Branch>(`/branches/${id}`, data, tenantHeaders(tenantId)).then(r => r.data)

export const deleteBranch = (tenantId: number, id: number) =>
  api.delete(`/branches/${id}`, tenantHeaders(tenantId))

// ──── Cost Centers ────
export const fetchCostCenters = (tenantId: number, params?: Record<string, string>) =>
  api.get<CostCenter[]>('/cost-centers', { ...tenantHeaders(tenantId), params }).then(r => r.data)

export const fetchCostCenterTree = (tenantId: number) =>
  api.get<CostCenter[]>('/cost-centers/tree', tenantHeaders(tenantId)).then(r => r.data)

export const createCostCenter = (tenantId: number, data: Partial<CostCenter>) =>
  api.post<CostCenter>('/cost-centers', data, tenantHeaders(tenantId)).then(r => r.data)

export const updateCostCenter = (tenantId: number, id: number, data: Partial<CostCenter>) =>
  api.put<CostCenter>(`/cost-centers/${id}`, data, tenantHeaders(tenantId)).then(r => r.data)

export const deleteCostCenter = (tenantId: number, id: number) =>
  api.delete(`/cost-centers/${id}`, tenantHeaders(tenantId))

// ──── Installments (التقسيط) ────
export const fetchInstallments = (tenantId: number, params?: Record<string, string>) =>
  api.get<PaginatedResponse<Installment> | Installment[]>('/installments', { ...tenantHeaders(tenantId), params }).then(r => r.data)

export const fetchInstallment = (tenantId: number, id: number) =>
  api.get<Installment>(`/installments/${id}`, tenantHeaders(tenantId)).then(r => r.data)

export interface GenerateInstallmentParams {
  total_amount: number
  start_date: string
  num_installments: number
  frequency_months?: number
  period_months?: number
}
export const generateInstallmentSchedule = (tenantId: number, params: GenerateInstallmentParams) =>
  api.post<{ lines: InstallmentLine[] }>('/installments/generate', params, tenantHeaders(tenantId)).then(r => r.data)

export type CreateInstallmentPayload = {
  customer_id?: number | null
  vendor_id?: number | null
  invoice_id?: number | null
  account_id?: number | null
  total_amount: number
  currency?: string
  start_date: string
  frequency_months?: number
  branch_id?: number | null
  cost_center_id?: number | null
  notes?: string
  lines: { sequence: number; due_date: string; amount: number }[]
}

export const createInstallment = (tenantId: number, data: CreateInstallmentPayload) =>
  api.post<Installment>('/installments', data, tenantHeaders(tenantId)).then(r => r.data)

export type CreateInstallmentFromInvoicePayload = {
  start_date: string
  num_installments: number
  frequency_months?: number
  period_months?: number
  branch_id?: number | null
  account_id?: number | null
}

export const createInstallmentScheduleFromInvoice = (
  tenantId: number,
  invoiceId: number,
  data: CreateInstallmentFromInvoicePayload,
) =>
  api.post<Installment>(`/invoices/${invoiceId}/installments`, data, tenantHeaders(tenantId)).then(r => r.data)

export const payInstallmentLine = (
  tenantId: number,
  lineId: number,
  data: { amount?: number; date?: string; payment_method_id?: number | null; cash_bank_account_id?: number | null; notes?: string },
) =>
  api.post<{ payment: Payment; line: InstallmentLine }>(`/installments/lines/${lineId}/pay`, data, tenantHeaders(tenantId)).then(r => r.data)

export const updateInstallment = (tenantId: number, id: number, data: { total_amount?: number; start_date?: string; branch_id?: number | null; cost_center_id?: number | null; notes?: string; lines?: { id?: number; sequence: number; due_date: string; amount: number }[] }) =>
  api.put<Installment>(`/installments/${id}`, data, tenantHeaders(tenantId)).then(r => r.data)

export const deleteInstallment = (tenantId: number, id: number) =>
  api.delete(`/installments/${id}`, tenantHeaders(tenantId))

export const approveInstallment = (tenantId: number, id: number) =>
  api.post<Installment>(`/installments/${id}/approve`, {}, tenantHeaders(tenantId)).then(r => r.data)

export const fetchInstallmentPeriods = (tenantId: number) =>
  api.get<{ data: InstallmentPeriod[] }>('/installment-periods', tenantHeaders(tenantId)).then((r) => r.data?.data ?? [])

export interface InstallmentFollowUpRow {
  id: number
  installment_id: number
  customer_id: number | null
  customer_name: string | null
  vendor_name?: string | null
  number: string
  sequence: number
  due_date: string
  amount: number
  paid_amount: number
  remaining: number
  status: string
  paid_at?: string | null
  payment_number?: string | null
}

export interface InstallmentsFollowUpResponse {
  data: InstallmentFollowUpRow[]
  total: number
  current_page: number
  last_page: number
  per_page: number
  totals: { amount: number; paid_amount: number; remaining: number }
}

export interface InstallmentStatisticsResponse {
  as_of: string
  lines: { total: number; paid: number; overdue: number; partial: number; pending: number }
  amounts: { total_scheduled: number; total_collected: number; overdue_remaining: number }
  top_payers: { customer_id: number; customer_name: string; total_paid: number }[]
  top_delinquent: { customer_id: number; customer_name: string; overdue_remaining: number; overdue_lines: number }[]
}

export const fetchInstallmentStatistics = (tenantId: number, params?: Record<string, string>) =>
  api.get<InstallmentStatisticsResponse>('/installments/reports/statistics', { ...tenantHeaders(tenantId), params }).then((r) => r.data)

export const fetchInstallmentsFollowUp = (tenantId: number, params?: Record<string, string>) =>
  api.get<InstallmentsFollowUpResponse>('/installments/reports/follow-up', { ...tenantHeaders(tenantId), params }).then((r) => r.data)

export interface InstallmentOverdueRow {
  id: number
  installment_id: number
  number: string
  customer_name: string | null
  due_date: string
  amount: number
  paid_amount: number
  remaining: number
  days_overdue: number
}

export interface InstallmentsOverdueResponse {
  data: InstallmentOverdueRow[]
  total: number
  current_page: number
  last_page: number
  per_page: number
}

export const fetchInstallmentsOverdue = (tenantId: number, params?: Record<string, string>) =>
  api.get<InstallmentsOverdueResponse>('/installments/reports/overdue', { ...tenantHeaders(tenantId), params }).then((r) => r.data)

export interface InstallmentExpectedRow {
  id: number
  installment_id: number
  number: string
  customer_name: string | null
  due_date: string
  amount: number
  paid_amount: number
  remaining: number
}
export const fetchInstallmentsExpectedCollection = (tenantId: number, params?: { month?: string }) =>
  api.get<{ month: string; data: InstallmentExpectedRow[]; total_expected: number }>('/installments/reports/expected-collection', { ...tenantHeaders(tenantId), params }).then(r => r.data)

// ──── Opening Stock ────
export const fetchOpeningStockList = (tenantId: number, params?: Record<string, string>) =>
  api.get<PaginatedResponse<OpeningStockHeader>>('/opening-stock', { ...tenantHeaders(tenantId), params }).then(r => r.data)

export const fetchOpeningStock = (tenantId: number, id: number) =>
  api.get<OpeningStockHeader>(`/opening-stock/${id}`, tenantHeaders(tenantId)).then(r => r.data)

export const createOpeningStock = (tenantId: number, data: Record<string, unknown>) =>
  api.post<OpeningStockHeader>('/opening-stock', data, tenantHeaders(tenantId)).then(r => r.data)

export interface UpdateOpeningStockResponse {
  opening_stock: OpeningStockHeader
  message: string
  saved_warehouse_id: number
  saved_date: string
}
export const updateOpeningStock = (tenantId: number, id: number, data: Record<string, unknown>) => {
  const warehouseId = data.warehouse_id != null ? String(data.warehouse_id) : ''
  const date = data.date != null ? String(data.date) : ''
  const params = new URLSearchParams()
  if (warehouseId) params.set('warehouse_id', warehouseId)
  if (date) params.set('date', date)
  const qs = params.toString()
  const url = `/opening-stock/${id}/update${qs ? `?${qs}` : ''}`
  return api.post<UpdateOpeningStockResponse>(url, data, tenantHeaders(tenantId)).then(r => r.data)
}

export const deleteOpeningStock = (tenantId: number, id: number) =>
  api.delete(`/opening-stock/${id}`, tenantHeaders(tenantId))

export const approveOpeningStock = (tenantId: number, id: number) =>
  api.post<{ message: string; opening_stock: OpeningStockHeader }>(`/opening-stock/${id}/approve`, {}, tenantHeaders(tenantId)).then(r => r.data)

export const unpostOpeningStock = (tenantId: number, id: number) =>
  api.post<{ message: string; opening_stock: OpeningStockHeader }>(`/opening-stock/${id}/unpost`, {}, tenantHeaders(tenantId)).then(r => r.data)

// ──── Manufacturing: BOM ────
export const fetchBoms = (tenantId: number, params?: Record<string, string>) =>
  api.get<PaginatedResponse<BillOfMaterial>>('/boms', { ...tenantHeaders(tenantId), params }).then(r => r.data)

export const fetchBom = (tenantId: number, id: number, params?: Record<string, string>) =>
  api.get<BillOfMaterial>(`/boms/${id}`, { ...tenantHeaders(tenantId), params }).then(r => r.data)

export const createBom = (tenantId: number, data: Record<string, unknown>) =>
  api.post<BillOfMaterial>('/boms', data, tenantHeaders(tenantId)).then(r => r.data)

export const updateBom = (tenantId: number, id: number, data: Record<string, unknown>) =>
  api.put<BillOfMaterial>(`/boms/${id}`, data, tenantHeaders(tenantId)).then(r => r.data)

// ──── Sales Representatives (المناديب) ────
export const fetchSalesReps = (tenantId: number, params?: Record<string, string>) =>
  api.get<PaginatedResponse<SalesRep>>('/sales-reps', { ...tenantHeaders(tenantId), params }).then(r => r.data)

export const fetchSalesRep = (tenantId: number, id: number) =>
  api.get<SalesRep>(`/sales-reps/${id}`, tenantHeaders(tenantId)).then(r => r.data)

export const createSalesRep = (tenantId: number, data: Partial<SalesRep>) =>
  api.post<SalesRep>('/sales-reps', data, tenantHeaders(tenantId)).then(r => r.data)

export const updateSalesRep = (tenantId: number, id: number, data: Partial<SalesRep>) =>
  api.put<SalesRep>(`/sales-reps/${id}`, data, tenantHeaders(tenantId)).then(r => r.data)

export const deleteSalesRep = (tenantId: number, id: number) =>
  api.delete(`/sales-reps/${id}`, tenantHeaders(tenantId))

// ──── إدارة التوصيل ────
export const fetchDeliveryDrivers = (tenantId: number, params?: Record<string, string>) =>
  api.get<PaginatedResponse<DeliveryDriver>>('/delivery-drivers', { ...tenantHeaders(tenantId), params }).then(r => r.data)

export const fetchDeliveryDriver = (tenantId: number, id: number) =>
  api.get<DeliveryDriver>(`/delivery-drivers/${id}`, tenantHeaders(tenantId)).then(r => r.data)

export const createDeliveryDriver = (tenantId: number, data: Partial<DeliveryDriver>) =>
  api.post<DeliveryDriver>('/delivery-drivers', data, tenantHeaders(tenantId)).then(r => r.data)

export const updateDeliveryDriver = (tenantId: number, id: number, data: Partial<DeliveryDriver>) =>
  api.put<DeliveryDriver>(`/delivery-drivers/${id}`, data, tenantHeaders(tenantId)).then(r => r.data)

export const deleteDeliveryDriver = (tenantId: number, id: number) =>
  api.delete(`/delivery-drivers/${id}`, tenantHeaders(tenantId))

export const fetchDeliveryReadyInvoices = (tenantId: number, params?: Record<string, string>) =>
  api.get<PaginatedResponse<Invoice>>('/delivery/ready-invoices', { ...tenantHeaders(tenantId), params }).then(r => r.data)

export const markInvoiceDeliveryReady = (tenantId: number, invoiceId: number) =>
  api.post<Invoice>(`/delivery/invoices/${invoiceId}/ready`, {}, tenantHeaders(tenantId)).then(r => r.data)

export const unmarkInvoiceDeliveryReady = (tenantId: number, invoiceId: number) =>
  api.delete(`/delivery/invoices/${invoiceId}/ready`, tenantHeaders(tenantId)).then(r => r.data)

export const assignDeliveryInvoice = (tenantId: number, invoiceId: number, driverId: number) =>
  api.post<DeliveryAssignment>('/delivery/assign', { invoice_id: invoiceId, driver_id: driverId }, tenantHeaders(tenantId)).then(r => r.data)

export const cancelDeliveryAssignment = (tenantId: number, assignmentId: number) =>
  api.post(`/delivery/assignments/${assignmentId}/cancel`, {}, tenantHeaders(tenantId))

export const markDeliveryAssignmentDelivered = (tenantId: number, assignmentId: number) =>
  api.post<DeliveryAssignment>(`/delivery/assignments/${assignmentId}/delivered`, {}, tenantHeaders(tenantId)).then(r => r.data)

export interface PendingSettlementDriverGroup {
  driver: { id: number; name: string; phone: string | null; custody_account_id: number } | null
  assignments: Array<{
    id: number
    invoice_id: number
    custody_amount: number
    assigned_at: string | null
    delivered_at: string | null
    invoice: {
      id: number
      number: string
      date: string
      total: number
      balance: number
      customer?: { id: number; name: string; phone?: string | null } | null
      branch?: { id: number; name: string } | null
    }
  }>
}

export const fetchDeliveryPendingSettlements = (tenantId: number, params?: Record<string, string>) =>
  api.get<{ data: PendingSettlementDriverGroup[] }>('/delivery/pending-settlements', { ...tenantHeaders(tenantId), params }).then(r => r.data)

export const settleDeliveryInvoices = (
  tenantId: number,
  body: { driver_id: number; payment_method_id: number; date: string; invoices: Array<{ invoice_id: number; amount?: number }> },
) =>
  api.post<{ payments: Array<{ id: number; number: string; amount: number; invoice_id: number | null }> }>('/delivery/settle', body, tenantHeaders(tenantId)).then(r => r.data)

export interface DeliveryPerformanceRow {
  driver_id: number
  driver_name: string | null
  trip_count: number
  avg_delivery_minutes: number | null
  total_collected: number
}

export const fetchDeliveryPerformanceReport = (tenantId: number, params: Record<string, string>) =>
  api.get<{ from_date: string; to_date: string; rows: DeliveryPerformanceRow[] }>('/reports/delivery-performance', {
    ...tenantHeaders(tenantId),
    params,
  }).then(r => r.data)

export interface SalesRepSalesReportRow {
  sales_rep_id: number
  name: string
  region: string | null
  commission_percent: number
  invoice_count: number
  total_sales: number
  commission: number
}

export interface SalesRepSalesReportResponse {
  data: SalesRepSalesReportRow[]
  from_date: string
  to_date: string
  total_sales: number
  total_commission: number
  total_count: number
  per_page: number
  page: number
}

export const fetchSalesRepSalesReport = (
  tenantId: number,
  params: { from_date: string; to_date: string; per_page?: number; page?: number; sales_rep_id?: number },
) =>
  api.get<SalesRepSalesReportResponse>('/reports/sales-rep-sales', { ...tenantHeaders(tenantId), params }).then((r) => r.data)

export const deleteBom = (tenantId: number, id: number) =>
  api.delete(`/boms/${id}`, tenantHeaders(tenantId))

// ──── Manufacturing: Production Orders ────
export const fetchProductionOrdersNextNumber = (tenantId: number) =>
  api.get<{ number: string }>('/production-orders/next-number', tenantHeaders(tenantId)).then(r => r.data.number)

export const fetchProductionOrders = (tenantId: number, params?: Record<string, string>) =>
  api.get<PaginatedResponse<ProductionOrder>>('/production-orders', { ...tenantHeaders(tenantId), params }).then(r => r.data)

export const fetchProductionOrder = (tenantId: number, id: number) =>
  api.get<ProductionOrder>(`/production-orders/${id}`, tenantHeaders(tenantId)).then(r => r.data)

export const createProductionOrder = (tenantId: number, data: Record<string, unknown>) =>
  api.post<ProductionOrder>('/production-orders', data, tenantHeaders(tenantId)).then(r => r.data)

export const updateProductionOrder = (tenantId: number, id: number, data: Record<string, unknown>) =>
  api.put<ProductionOrder>(`/production-orders/${id}`, data, tenantHeaders(tenantId)).then(r => r.data)

export const deleteProductionOrder = (tenantId: number, id: number) =>
  api.delete(`/production-orders/${id}`, tenantHeaders(tenantId))

export const approveProductionOrder = (tenantId: number, id: number) =>
  api.post<ProductionOrder>(`/production-orders/${id}/approve`, {}, tenantHeaders(tenantId)).then(r => r.data)

export const generateItemBarcode = (tenantId: number, itemId: number) =>
  api.post<{ barcode: string; item: Item }>(`/items/${itemId}/generate-barcode`, {}, tenantHeaders(tenantId)).then(r => r.data)

// ──── Reports ────
export const fetchTrialBalance = (tenantId: number, params?: Record<string, string>) =>
  api.get('/reports/trial-balance', { ...tenantHeaders(tenantId), params }).then(r => r.data)

export const fetchIncomeStatement = (tenantId: number, params: Record<string, string>) =>
  api.get('/reports/income-statement', { ...tenantHeaders(tenantId), params }).then(r => r.data)

export const fetchBalanceSheet = (tenantId: number, params: Record<string, string>) =>
  api.get('/reports/balance-sheet', { ...tenantHeaders(tenantId), params }).then(r => r.data)

export const fetchInventoryReport = (tenantId: number) =>
  api.get('/reports/inventory', tenantHeaders(tenantId)).then(r => r.data)

export interface SerialNumbersInventoryRow {
  id: number
  serial_number: string
  status: string
  item_id: number
  warehouse_id: number | null
  item_code: string | null
  item_name: string | null
  warehouse_name: string | null
  created_at: string
  updated_at: string
}

export interface SerialNumbersInventoryResponse {
  data: SerialNumbersInventoryRow[]
  total: number
  per_page: number
  current_page: number
  last_page: number
}

export const fetchSerialNumbersInventory = (tenantId: number, params: Record<string, string>) =>
  api
    .get<SerialNumbersInventoryResponse>('/reports/serial-numbers-inventory', { ...tenantHeaders(tenantId), params })
    .then((r) => r.data)

export interface SerialHistoryEvent {
  kind: 'in' | 'out'
  date: string | null
  document_type: string
  document_id: number
  document_number: string | null
  counterparty_role: 'vendor' | 'customer'
  counterparty_name: string | null
}

export interface SerialNumberHistoryResponse {
  serial: {
    id: number
    serial_number: string
    status: string
    item: { id: number; code?: string; name: string } | null
    warehouse: { id: number; name: string; code?: string } | null
  }
  events: SerialHistoryEvent[]
}

export const fetchSerialNumberHistory = (tenantId: number, serialId: number) =>
  api
    .get<SerialNumberHistoryResponse>(`/reports/serial-numbers-inventory/${serialId}/history`, tenantHeaders(tenantId))
    .then((r) => r.data)

export interface TaxDeclarationReport {
  company: { name?: string; tax_registration_number?: string } | null
  from_date: string
  to_date: string
  taxable_sales: number
  taxable_purchases: number
  sales_tax: number
  purchase_tax: number
  net_tax_due: number
}

export const fetchTaxDeclaration = (tenantId: number, params: { from_date: string; to_date: string; branch_id?: number; cost_center_id?: number }) =>
  api.get<TaxDeclarationReport>('/reports/tax-declaration', { ...tenantHeaders(tenantId), params }).then(r => r.data)

export const fetchAccountStatement = (
  tenantId: number,
  params: {
    account_id: number
    from_date: string
    to_date: string
    journal_customer_id?: number
    /** false = كشف «الديون العادية» فقط (حساب عميل مرتبط) */
    include_installments?: boolean
  },
) =>
  api.get<AccountStatementResponse>('/reports/account-statement', {
    ...tenantHeaders(tenantId),
    params: {
      account_id: params.account_id,
      from_date: params.from_date,
      to_date: params.to_date,
      ...(params.journal_customer_id != null && params.journal_customer_id > 0
        ? { journal_customer_id: String(params.journal_customer_id) }
        : {}),
      ...(params.include_installments === false ? { include_installments: '0' } : {}),
    },
  }).then(r => r.data)

export const fetchCustomerBalances = (
  tenantId: number,
  params?: {
    branch_id?: number
    cost_center_id?: number
    as_of_date?: string
    last_transaction_from?: string
    last_transaction_to?: string
    only_with_balance?: boolean
  }
) =>
  api.get<CustomerBalancesResponse>('/reports/customer-balances', {
    ...tenantHeaders(tenantId),
    params: { tenant_id: tenantId, ...params },
  }).then(r => r.data)

export const fetchCustomerAging = (
  tenantId: number,
  params?: {
    as_of_date?: string
    invoice_date_from?: string
    invoice_date_to?: string
    customer_id?: number
    branch_id?: number
    cost_center_id?: number
    created_by?: number
    include_zero_balance?: boolean
  }
) =>
  api.get<CustomerAgingResponse>('/reports/customer-aging', {
    ...tenantHeaders(tenantId),
    params: { tenant_id: tenantId, ...params },
  }).then(r => r.data)

export const fetchCustomerAnalysis = (
  tenantId: number,
  params: {
    from_date: string
    to_date: string
    branch_id?: number
    cost_center_id?: number
    sort_basis?: CustomerAnalysisSortBasis
  },
) =>
  api.get<CustomerAnalysisResponse>('/reports/customer-analysis', {
    ...tenantHeaders(tenantId),
    params: { tenant_id: tenantId, ...params },
  }).then((r) => r.data)

export const fetchAccountLastMovements = (tenantId: number, accountId: number, limit = 10) =>
  api.get<{ lines: AccountLastMovementLine[] }>('/reports/account-last-movements', {
    ...tenantHeaders(tenantId),
    params: { tenant_id: tenantId, account_id: accountId, limit },
  }).then(r => r.data)

export const fetchVendorBalances = (
  tenantId: number,
  params?: {
    branch_id?: number
    cost_center_id?: number
    as_of_date?: string
    last_transaction_from?: string
    last_transaction_to?: string
    only_with_balance?: boolean
  }
) =>
  api.get<VendorBalancesResponse>('/reports/vendor-balances', {
    ...tenantHeaders(tenantId),
    params: { tenant_id: tenantId, ...params },
  }).then(r => r.data)

export const fetchVendorPurchaseAnalysis = (
  tenantId: number,
  params: {
    from_date: string
    to_date: string
    branch_id?: number
    cost_center_id?: number
    currency?: string
    vendor_group_id?: number
  },
) =>
  api.get<VendorPurchaseAnalysisResponse>('/reports/vendor-purchase-analysis', {
    ...tenantHeaders(tenantId),
    params: { tenant_id: tenantId, ...params },
  }).then((r) => r.data)

export const fetchVendorAging = (
  tenantId: number,
  params?: {
    as_of_date?: string
    invoice_date_from?: string
    invoice_date_to?: string
    vendor_id?: number
    vendor_group_id?: number
    branch_id?: number
    cost_center_id?: number
    currency?: string
    include_zero_balance?: boolean
  },
) =>
  api.get<VendorAgingResponse>('/reports/vendor-aging', {
    ...tenantHeaders(tenantId),
    params: { tenant_id: tenantId, ...params },
  }).then((r) => r.data)

export const fetchVendorPerformance = (
  tenantId: number,
  params: {
    from_date: string
    to_date: string
    vendor_id?: number
    vendor_group_id?: number
    branch_id?: number
    cost_center_id?: number
    currency?: string
  },
) =>
  api.get<VendorPerformanceResponse>('/reports/vendor-performance', {
    ...tenantHeaders(tenantId),
    params: { tenant_id: tenantId, ...params },
  }).then((r) => r.data)

export interface ItemSalesReportRow {
  item_id: number
  item_code: string
  item_name: string
  category_id: number | null
  category_name: string | null
  base_unit_name: string | null
  quantity_sold_base: string
  quantity_returned_base: string
  quantity_net_base: string
  amount_sold: string
  amount_returned: string
  discount_sold: string
  discount_returned: string
  amount_net: string
  invoice_count: string
}

export interface ItemSalesReportResponse {
  company: { name?: string; logo?: string; address?: string } | null
  from_date: string
  to_date: string
  data: ItemSalesReportRow[]
  total: number
  per_page: number
  current_page: number
  last_page: number
}

export const fetchItemSalesReport = (tenantId: number, params: Record<string, string>) =>
  api.get<ItemSalesReportResponse>('/reports/item-sales', { ...tenantHeaders(tenantId), params }).then(r => r.data)

/** فواتير مبيعات تحتوي على صنف معين ضمن فترة (لـ drill-down من تقرير مبيعات الأصناف) */
export interface ItemSalesReportInvoiceRow {
  id: number
  number: string
  date: string
  total?: number
  customer_id?: number
  customer?: { id: number; name: string }
}
export const fetchItemSalesReportInvoices = (
  tenantId: number,
  params: { item_id: number; from_date: string; to_date: string }
) =>
  api
    .get<{ data: ItemSalesReportInvoiceRow[] }>('/reports/item-sales/invoices', {
      ...tenantHeaders(tenantId),
      params: { ...params, tenant_id: String(tenantId) },
    })
    .then(r => r.data?.data ?? [])

// ──── تقرير مشتريات الأصناف (نفس بنية تقرير المبيعات) ────
export interface ItemPurchasesReportRow {
  item_id: number
  item_code: string
  item_name: string
  category_id: number | null
  category_name: string | null
  base_unit_name: string | null
  quantity_sold_base: string
  quantity_returned_base: string
  quantity_net_base: string
  amount_sold: string
  amount_returned: string
  discount_sold: string
  discount_returned: string
  amount_net: string
  invoice_count: string
}

export interface ItemPurchasesReportResponse {
  company: { name?: string; logo?: string; address?: string } | null
  from_date: string
  to_date: string
  data: ItemPurchasesReportRow[]
  total: number
  per_page: number
  current_page: number
  last_page: number
  /** مجموع إجماليات الفواتير (مطابق لصفحة فواتير المشتريات) */
  sum_invoice_totals?: number
  /** مجموع أرصدة الفواتير (مطابق لصفحة فواتير المشتريات) */
  sum_invoice_balance?: number
}

export const fetchItemPurchasesReport = (tenantId: number, params: Record<string, string>) =>
  api.get<ItemPurchasesReportResponse>('/reports/item-purchases', { ...tenantHeaders(tenantId), params }).then(r => r.data)

/** تحليل المشتريات الشهرية (سنة مالية، اختياري فرع) */
export interface MonthlyPurchasesAnalysisMonthRow {
  month_index: number
  year: number
  month: number
  key: string
  /** صافي أو شامل حسب amount_basis (للمخطط) */
  amount: number
  /** مجموع البنود قبل الخصم (خام الفاتورة) */
  subtotal: number
  /** خصم البنود + خصم الفاتورة */
  discount: number
  shipping: number
  net_before_tax: number
  tax_amount: number
  total: number
}

export interface MonthlyPurchasesAnalysisYearTotals {
  subtotal: number
  discount: number
  shipping: number
  net_before_tax: number
  tax_amount: number
  total: number
}

export interface MonthlyPurchasesAnalysisResponse {
  company: { name?: string; logo?: string; address?: string; phone?: string } | null
  fiscal_year: number
  fiscal_year_start_month: number
  period_from: string
  period_to: string
  branch_id: number | null
  amount_basis: 'net_before_tax' | 'inclusive'
  months: BranchSalesAnnualMonthMeta[]
  amounts: number[]
  data: MonthlyPurchasesAnalysisMonthRow[]
  /** إجماليات السنة المالية (مجمّعة من الاستعلام) */
  totals: MonthlyPurchasesAnalysisYearTotals
  total_year: number
}

export const fetchMonthlyPurchasesAnalysis = (tenantId: number, params: Record<string, string>) =>
  api
    .get<MonthlyPurchasesAnalysisResponse>('/reports/monthly-purchases-analysis', {
      ...tenantHeaders(tenantId),
      params,
    })
    .then((r) => r.data)

export interface ItemPurchasesReportInvoiceRow {
  id: number
  number: string
  date: string
  total?: number
  vendor_id?: number
  vendor?: { id: number; name: string }
}
export const fetchItemPurchasesReportInvoices = (
  tenantId: number,
  params: { item_id: number; from_date: string; to_date: string; payment_type?: string }
) =>
  api
    .get<{ data: ItemPurchasesReportInvoiceRow[] }>('/reports/item-purchases/invoices', {
      ...tenantHeaders(tenantId),
      params: { ...params, tenant_id: String(tenantId) },
    })
    .then(r => r.data?.data ?? [])

// ──── تقرير المصروفات ────
export interface ExpensesReportRow {
  date: string
  voucher_number: string
  expense_item_name: string
  account_id: number
  cost_center_name: string | null
  description: string | null
  /** النص الكامل عند اختصار description في التقرير */
  description_full?: string | null
  amount: number
  vat: number
  total: number
}
export interface ExpensesReportResponse {
  company?: { name?: string; logo?: string }
  from_date: string
  to_date: string
  summary: { total_without_vat: number; total_vat: number; net_total: number }
  rows: ExpensesReportRow[]
  pie_data: { account_id: number; account_name: string; amount: number }[]
  bar_data: { current_period: number; previous_period: number }
  /** عند إرجاع التقرير مع ترقيم صفحات */
  total?: number
  current_page?: number
  last_page?: number
}
export const fetchExpensesReport = (tenantId: number, params: Record<string, string>) =>
  api.get<ExpensesReportResponse>('/reports/expenses', { ...tenantHeaders(tenantId), params }).then(r => r.data)

export interface InvoiceProfitRow {
  id: number
  number: string
  date: string
  branch_name?: string
  customer?: string
  sales_net: number
  cost: number
  profit: number
  margin: number
}

export interface InvoiceProfitTotals {
  sales_net: number
  cost: number
  profit: number
  margin: number
}

export interface InvoiceProfitsResponse {
  rows: InvoiceProfitRow[]
  totals: InvoiceProfitTotals
  /** إجمالي الفواتير المطابقة للفلتر (قد يزيد عن عدد الصفوف المعروضة عند تفعيل limit) */
  total_matching?: number
  /** حد الصفوف المطبّق على الجدول، أو null = الكل */
  limit?: number | null
}

export const fetchInvoiceProfits = (tenantId: number, params: Record<string, string>) =>
  api.get<InvoiceProfitsResponse>('/reports/invoice-profits', { ...tenantHeaders(tenantId), params }).then(r => r.data)

export interface BranchSalesAnnualMonthMeta {
  month_index: number
  year: number
  month: number
  key: string
  quarter?: number
  half?: number
}

export interface BranchSalesAnnualRow {
  branch_id: number
  branch_name: string
  months: number[]
  year_total: number
}

export interface BranchSalesAnnualResponse {
  fiscal_year: number
  fiscal_year_start_month: number
  period_from: string
  period_to: string
  amount_basis: 'net_before_tax' | 'inclusive'
  sales_channel: string
  breakdown: 'monthly' | 'quarterly' | 'semiannual'
  month_keys: string[]
  months: BranchSalesAnnualMonthMeta[]
  branches: BranchSalesAnnualRow[]
  column_totals: number[]
  grand_total: number
}

export const fetchBranchSalesAnnual = (tenantId: number, params: Record<string, string>) =>
  api
    .get<BranchSalesAnnualResponse>('/reports/branch-sales-annual', { ...tenantHeaders(tenantId), params })
    .then((r) => r.data)

export interface SalesRepsMonthlyProductivityRow {
  sales_rep_id: number
  name: string
  months: number[]
  year_total: number
  performance_tier: 'none' | 'high' | 'medium' | 'low'
}

export interface SalesRepsMonthlyProductivityResponse {
  fiscal_year: number
  fiscal_year_start_month: number
  period_from: string
  period_to: string
  amount_basis: 'net_before_tax' | 'inclusive'
  sales_source: string
  month_keys: string[]
  months: BranchSalesAnnualMonthMeta[]
  reps: SalesRepsMonthlyProductivityRow[]
  column_totals: number[]
  grand_total: number
}

export const fetchSalesRepsMonthlyProductivity = (tenantId: number, params: Record<string, string>) =>
  api
    .get<SalesRepsMonthlyProductivityResponse>('/reports/sales-reps-monthly-productivity', {
      ...tenantHeaders(tenantId),
      params,
    })
    .then((r) => r.data)

export interface CostCenterSalesAnnualRow {
  cost_center_id: number | null
  cost_center_name: string | null
  months: number[]
  year_total: number
}

export interface CostCenterSalesAnnualResponse {
  fiscal_year: number
  fiscal_year_start_month: number
  period_from: string
  period_to: string
  amount_basis: 'net_before_tax' | 'inclusive'
  sales_channel: string
  branch_id: number | null
  breakdown: 'monthly' | 'quarterly' | 'semiannual'
  month_keys: string[]
  months: BranchSalesAnnualMonthMeta[]
  cost_centers: CostCenterSalesAnnualRow[]
  column_totals: number[]
  grand_total: number
}

export const fetchCostCenterSalesAnnual = (tenantId: number, params: Record<string, string>) =>
  api
    .get<CostCenterSalesAnnualResponse>('/reports/cost-center-sales-annual', {
      ...tenantHeaders(tenantId),
      params,
    })
    .then((r) => r.data)

// ──── User Management ────
export const fetchTenantUsers = (tenantId: number) =>
  api.get<{ data: TenantUserItem[] }>('/tenant-users', tenantHeaders(tenantId)).then(r => r.data)

export const createTenantUser = (tenantId: number, data: { name: string; username: string; password: string; email?: string; phone?: string; role_id?: number; is_active?: boolean; default_branch_id?: number | null; default_warehouse_id?: number | null; restrict_to_branch_warehouse?: boolean }) =>
  api.post<{ message: string; user: Record<string, unknown> }>('/tenant-users', { ...data, tenant_id: tenantId }, tenantHeaders(tenantId)).then(r => r.data)

export const updateTenantUser = (tenantId: number, userId: number, data: { name?: string; email?: string; phone?: string; username?: string; password?: string; role_id?: number; is_active?: boolean; permissions?: string[]; default_branch_id?: number | null; default_warehouse_id?: number | null; restrict_to_branch_warehouse?: boolean }) =>
  api.put<{ message: string }>(`/tenant-users/${userId}`, { ...data, tenant_id: tenantId }, tenantHeaders(tenantId)).then(r => r.data)

export const deleteTenantUser = (tenantId: number, userId: number) =>
  api.delete(`/tenant-users/${userId}`, tenantHeaders(tenantId))

export const fetchRoles = (tenantId: number) =>
  api.get<{ data: Role[] }>('/roles', tenantHeaders(tenantId)).then(r => r.data)

export const fetchRole = (tenantId: number, id: number) =>
  api.get<Role>(`/roles/${id}`, tenantHeaders(tenantId)).then(r => r.data)

export const createRole = (tenantId: number, data: { name: string; slug?: string; description?: string; permission_ids?: number[]; pricing_group_ids?: number[] }) =>
  api.post<{ message: string; role: Role }>('/roles', { ...data, tenant_id: tenantId }, tenantHeaders(tenantId)).then(r => r.data)

export const updateRole = (tenantId: number, id: number, data: { name?: string; description?: string; permission_ids?: number[]; pricing_group_ids?: number[] }) =>
  api.put<{ message: string }>(`/roles/${id}`, { ...data, tenant_id: tenantId }, tenantHeaders(tenantId)).then(r => r.data)

export const deleteRole = (tenantId: number, id: number) =>
  api.delete(`/roles/${id}`, tenantHeaders(tenantId))

export const fetchPermissions = (tenantId: number) =>
  api.get<{ data: Permission[]; by_module: Record<string, Permission[]> }>('/permissions', tenantHeaders(tenantId)).then(r => r.data)

export const fetchAuditLogs = (
  tenantId: number,
  params?: {
    user_id?: number
    action?: string
    table_name?: string
    from_date?: string
    to_date?: string
    page?: number
    per_page?: number
  },
) =>
  api.get<PaginatedResponse<AuditLogEntry>>('/audit-logs', { ...tenantHeaders(tenantId), params }).then((r) => r.data)

// ──── Restaurant Module ────
export const fetchRestaurantTables = (tenantId: number, params?: { branch_id?: number }) =>
  api.get<RestaurantTable[]>('/restaurant/tables', { ...tenantHeaders(tenantId), params }).then(r => r.data)

export const saveRestaurantTable = (tenantId: number, data: Partial<RestaurantTable> & { id?: number }) => {
  if (data.id) {
    return api.put<RestaurantTable>(`/restaurant/tables/${data.id}`, data, tenantHeaders(tenantId)).then(r => r.data)
  }
  return api.post<RestaurantTable>('/restaurant/tables', data, tenantHeaders(tenantId)).then(r => r.data)
}

export const deleteRestaurantTable = (tenantId: number, id: number) =>
  api.delete(`/restaurant/tables/${id}`, tenantHeaders(tenantId))

export const fetchRestaurantSections = (tenantId: number) =>
  api.get<RestaurantSection[]>('/restaurant/sections', tenantHeaders(tenantId)).then(r => r.data)

export const saveRestaurantSection = (tenantId: number, data: Partial<RestaurantSection> & { id?: number }) => {
  if (data.id) {
    return api.put<RestaurantSection>(`/restaurant/sections/${data.id}`, data, tenantHeaders(tenantId)).then(r => r.data)
  }
  return api.post<RestaurantSection>('/restaurant/sections', data, tenantHeaders(tenantId)).then(r => r.data)
}

export const deleteRestaurantSection = (tenantId: number, id: number) =>
  api.delete(`/restaurant/sections/${id}`, tenantHeaders(tenantId))

export interface RestaurantOrderLineInput {
  item_id: number
  quantity: number
  unit_price: number
  discount_percent?: number
  tax_percent?: number
  description?: string
  modifiers?: Array<{ name: string; price_delta?: number }>
  kitchen_note?: string | null
}

export interface RestaurantOrderPayload {
  invoice_id?: number
  branch_id: number
  warehouse_id: number
  table_id?: number | null
  order_type: 'dine_in' | 'takeaway' | 'delivery'
  customer_id?: number | null
  date: string
  lines: RestaurantOrderLineInput[]
}

export const saveRestaurantOrder = (tenantId: number, payload: RestaurantOrderPayload) =>
  api.post<Invoice>('/restaurant/pos/orders', { ...payload, tenant_id: tenantId }, tenantHeaders(tenantId)).then(r => r.data)

/** إرسال طلب للمطبخ دون إنشاء فاتورة — يظهر في الطلبات المفتوحة بعد «تم التجهيز» */
export const sendRestaurantOrder = (tenantId: number, payload: Omit<RestaurantOrderPayload, 'invoice_id'>) =>
  api.post<{ order: RestaurantOrder; ticket: KitchenTicket }>('/restaurant/pos/send-order', { ...payload, tenant_id: tenantId }, tenantHeaders(tenantId)).then(r => r.data)

export interface RestaurantOrder {
  id: number
  tenant_id: number
  branch_id: number
  warehouse_id: number
  table_id: number | null
  customer_id: number | null
  order_type: string
  status: string
  invoice_id: number | null
  date: string
  subtotal: number
  tax_amount: number
  total: number
  table?: { id: number; name: string }
  lines?: Array<{ id: number; item_id: number; quantity: number; unit_price: number; description?: string; item?: { id: number; name: string; name_en?: string } }>
}

export const fetchRestaurantOpenOrders = (tenantId: number, params?: { branch_id?: number }) =>
  api.get<RestaurantOrder[]>('/restaurant/pos/open-orders', { ...tenantHeaders(tenantId), params: { ...params, tenant_id: tenantId } }).then(r => r.data)

export const fetchRestaurantOpenOrderByTable = (tenantId: number, tableId: number, params?: { branch_id?: number }) =>
  api.get<RestaurantOrder>(`/restaurant/pos/open-order-by-table/${tableId}`, { ...tenantHeaders(tenantId), params }).then(r => r.data)

export const sendRestaurantOrderToKitchen = (tenantId: number, invoiceId: number) =>
  api.post<KitchenTicket>(`/restaurant/pos/orders/${invoiceId}/send-to-kitchen`, { tenant_id: tenantId }, tenantHeaders(tenantId)).then(r => r.data)

export type RestaurantCheckoutPaymentLine = { payment_method_id: number; amount: number }

export const checkoutRestaurantOrder = (
  tenantId: number,
  orderId: number,
  data: {
    amount?: number
    date: string
    payment_method_id?: number | null
    payments?: RestaurantCheckoutPaymentLine[]
    notes?: string
    shift_id?: number | null
    delivery_driver_id?: number | null
    redeem_points?: number
    loyalty_program_id?: number
  },
) =>
  api.post<{ message: string; invoice: Invoice }>(`/restaurant/pos/orders/${orderId}/checkout`, { ...data, tenant_id: tenantId }, tenantHeaders(tenantId)).then(r => r.data)

export const cancelRestaurantOrder = (tenantId: number, invoiceId: number) =>
  api.post<{ message: string }>(`/restaurant/pos/orders/${invoiceId}/cancel`, { tenant_id: tenantId }, tenantHeaders(tenantId)).then(r => r.data)

/** إلغاء طلب مطعم (قبل التحصيل) عندما الطلب من نوع restaurant order */
export const cancelRestaurantOrderByOrderId = (tenantId: number, orderId: number) =>
  api.post<{ message: string }>(`/restaurant/pos/order/${orderId}/cancel`, { tenant_id: tenantId }, tenantHeaders(tenantId)).then(r => r.data)

export const fetchKitchenTickets = (tenantId: number, params?: { status?: 'pending' | 'in_progress' | 'done' | 'cancelled'; branch_id?: number }) =>
  api.get<KitchenTicket[]>('/restaurant/kitchen-tickets', { ...tenantHeaders(tenantId), params }).then(r => r.data)

export const updateKitchenTicketStatus = (tenantId: number, ticketId: number, status: KitchenTicket['status']) =>
  api.patch<KitchenTicket>(`/restaurant/kitchen-tickets/${ticketId}`, { status }, tenantHeaders(tenantId)).then(r => r.data)

export const updateKitchenTicketLineCompleted = (tenantId: number, ticketId: number, lineId: number, isCompleted: boolean) =>
  api.patch<KitchenTicketLine>(`/restaurant/kitchen-tickets/${ticketId}/lines/${lineId}`, { is_completed: isCompleted }, tenantHeaders(tenantId)).then(r => r.data)

// ──── نقطة البيع (POS) ────
export const fetchPosItems = (tenantId: number, params: { q?: string; category_id?: number; per_page?: number; pos_kind?: 'pos' | 'restaurant' }) =>
  api.get<{ data: PosItem[] }>('/pos/items', { ...tenantHeaders(tenantId), params }).then(r => r.data)

export const fetchPosShift = (tenantId: number, branchId: number) =>
  api.get<{ shift: PosShiftInfo | null }>('/pos/shift', { ...tenantHeaders(tenantId), params: { tenant_id: tenantId, branch_id: branchId } }).then(r => r.data)

export const openPosShift = (tenantId: number, data: { branch_id: number; opening_cash?: number }) =>
  api.post<{ message: string; shift: PosShiftInfo }>('/pos/shift/open', { ...data, tenant_id: tenantId }, tenantHeaders(tenantId)).then(r => r.data)

export const createPosSale = (tenantId: number, data: {
  branch_id: number
  warehouse_id?: number | null
  shift_id?: number
  customer_id?: number
  discount_amount?: number
  redeem_points?: number
  loyalty_discount?: number
  loyalty_program_id?: number
  payment_method_id?: number
  payment_amount?: number
  payment_lines?: Array<{ payment_method_id: number; amount: number }>
  order_type?: 'takeaway' | 'delivery' | null
  delivery_driver_id?: number | null
  lines: Array<{ item_id: number; quantity: number; unit_price: number; discount_percent?: number; tax_percent?: number; description?: string | null }>
}) =>
  api.post<{ message: string; invoice: Invoice }>('/pos/sale', { ...data, tenant_id: tenantId }, tenantHeaders(tenantId)).then(r => r.data)

export const createPosReturn = (tenantId: number, data: {
  mode: 'by_invoice'
  invoice_id: number
  branch_id: number
  warehouse_id?: number | null
  shift_id?: number | null
  lines: Array<{ invoice_line_id: number; quantity: number }>
}) =>
  api.post<{ message: string; invoice: Invoice }>('/pos/return', { ...data, tenant_id: tenantId }, tenantHeaders(tenantId)).then(r => r.data)

export const holdPosCart = (tenantId: number, data: { branch_id: number; payload: Record<string, unknown> }) =>
  api.post<{ message: string; id: number }>('/pos/hold', { ...data, tenant_id: tenantId }, tenantHeaders(tenantId)).then(r => r.data)

export const fetchPosHeldList = (tenantId: number, branchId: number) =>
  api.get<{ data: Array<{ id: number; user_id: number; payload: unknown; created_at: string; user?: { name: string } }> }>('/pos/hold', { ...tenantHeaders(tenantId), params: { tenant_id: tenantId, branch_id: branchId } }).then(r => r.data)

export const resumePosHeld = (tenantId: number, branchId: number, heldId: number) =>
  api.post<{ message: string; payload: { cart: PosCartLine[]; invoiceDiscount?: number } }>(`/pos/hold/${heldId}/resume`, { tenant_id: tenantId, branch_id: branchId }, tenantHeaders(tenantId)).then(r => r.data)

export const fetchPosXReport = (tenantId: number, branchId: number) =>
  api.get<{ report: PosXReport | null; shift: PosShiftInfo | null }>('/pos/shift/x-report', { ...tenantHeaders(tenantId), params: { tenant_id: tenantId, branch_id: branchId } }).then(r => r.data)

export const closePosShift = (tenantId: number, data: { branch_id: number; closing_cash: number; cash_denominations?: Array<{ value: number; count: number }> }) =>
  api.post<{ message: string; shift: PosShiftInfo; z_report: PosZReport; variance_journal_id?: number }>('/pos/shift/close', { ...data, tenant_id: tenantId }, tenantHeaders(tenantId)).then(r => r.data)

export const updatePosShift = (tenantId: number, shiftId: number, data: { opening_cash: number }) =>
  api
    .patch<{ message: string; shift: PosShiftInfo }>(`/pos/shift/${shiftId}`, { ...data, tenant_id: tenantId }, tenantHeaders(tenantId))
    .then((r) => r.data)

export const reopenPosShift = (tenantId: number, shiftId: number) =>
  api
    .post<{ message: string; shift: PosShiftInfo }>(`/pos/shift/${shiftId}/reopen`, { tenant_id: tenantId }, tenantHeaders(tenantId))
    .then((r) => r.data)

export const fetchPosShiftsReport = (
  tenantId: number,
  params?: {
    branch_id?: number
    user_id?: number
    cashier_id?: number
    status?: string
    date_from?: string
    date_to?: string
    search?: string
    page?: number
    per_page?: number
  },
) => {
  const p: Record<string, string | number> = { tenant_id: tenantId }
  if (params?.branch_id != null) p.branch_id = params.branch_id
  if (params?.user_id != null) p.user_id = params.user_id
  if (params?.cashier_id != null && params.cashier_id > 0) p.cashier_id = params.cashier_id
  if (params?.status) p.status = params.status
  if (params?.date_from) p.date_from = params.date_from
  if (params?.date_to) p.date_to = params.date_to
  if (params?.search) p.search = params.search
  if (params?.page != null) p.page = params.page
  if (params?.per_page != null) p.per_page = params.per_page
  const tz = browserIanaTimeZone()
  if (tz) p.report_tz = tz
  return api
    .get<{ data: PaginatedResponse<PosShiftReportRow>; stats: PosShiftsReportStats }>('/pos/shifts-report', {
      ...tenantHeaders(tenantId),
      params: p,
    })
    .then((r) => r.data)
}

export const fetchPosShiftsReportCashiers = (
  tenantId: number,
  params?: { branch_id?: number; date_from?: string; date_to?: string },
) => {
  const p: Record<string, string | number> = { tenant_id: tenantId }
  if (params?.branch_id != null && params.branch_id > 0) p.branch_id = params.branch_id
  if (params?.date_from) p.date_from = params.date_from
  if (params?.date_to) p.date_to = params.date_to
  const tz = browserIanaTimeZone()
  if (tz) p.report_tz = tz
  return api
    .get<{ data: { id: number; name: string }[] }>('/pos/shifts-report/cashiers', {
      ...tenantHeaders(tenantId),
      params: p,
    })
    .then((r) => r.data)
}

export const fetchCashierDailyReport = (tenantId: number, shiftId: number) =>
  api
    .get<{ data: CashierDailyReport }>(`/pos/shifts/${shiftId}/daily-report`, {
      ...tenantHeaders(tenantId),
      params: { tenant_id: tenantId },
    })
    .then((r) => r.data.data)

export const fetchCashierDailyReportCashiers = (tenantId: number) =>
  api
    .get<{ data: { id: number; name: string }[] }>('/pos/cashier-daily-report/cashiers', {
      ...tenantHeaders(tenantId),
      params: { tenant_id: tenantId },
    })
    .then((r) => r.data.data ?? [])

export const fetchCashierDailyReportShifts = (
  tenantId: number,
  params: { date: string; date_to?: string; user_id?: number; branch_id?: number },
) => {
  const p: Record<string, string | number> = { tenant_id: tenantId, date: params.date }
  if (params.date_to && params.date_to !== params.date) p.date_to = params.date_to
  if (params.user_id != null && params.user_id > 0) p.user_id = params.user_id
  if (params.branch_id != null && params.branch_id > 0) p.branch_id = params.branch_id
  const tz = browserIanaTimeZone()
  if (tz) p.report_tz = tz
  return api
    .get<{ data: CashierDailyReportShiftOption[] }>('/pos/cashier-daily-report/shifts', {
      ...tenantHeaders(tenantId),
      params: p,
    })
    .then((r) => r.data.data ?? [])
}

export const fetchCashierTodayReport = async (tenantId: number) => {
  try {
    const r = await api.get<{ data: CashierDailyReport | null; message?: string }>('/pos/cashier/today-report', {
      ...tenantHeaders(tenantId),
      params: { tenant_id: tenantId },
    })
    return r.data
  } catch (e: unknown) {
    if (isAxiosError(e) && e.response?.status === 404) {
      const body = e.response?.data as { message?: string } | undefined
      return { data: null as CashierDailyReport | null, message: body?.message ?? 'لا توجد وردية اليوم' }
    }
    throw e
  }
}

// POS Expense Categories
export const fetchPosExpenseCategories = (tenantId: number) =>
  api.get<{ data: PosExpenseCategory[] }>('/pos/expense-categories', tenantHeaders(tenantId)).then(r => r.data?.data ?? [])

export const createPosExpenseCategory = (tenantId: number, data: Partial<PosExpenseCategory>) =>
  api.post<{ message: string; category: PosExpenseCategory }>('/pos/expense-categories', { ...data, tenant_id: tenantId }, tenantHeaders(tenantId)).then(r => r.data)

export const updatePosExpenseCategory = (tenantId: number, id: number, data: Partial<PosExpenseCategory>) =>
  api.put<{ message: string; category: PosExpenseCategory }>(`/pos/expense-categories/${id}`, { ...data, tenant_id: tenantId }, tenantHeaders(tenantId)).then(r => r.data)

export const deletePosExpenseCategory = (tenantId: number, id: number) =>
  api.delete(`/pos/expense-categories/${id}`, tenantHeaders(tenantId))

// POS Expense Items
export const fetchPosExpenseItems = (tenantId: number) =>
  api
    .get<{ data: PosExpenseItem[] }>('/pos/expense-items', tenantHeaders(tenantId))
    .then(r => r.data?.data ?? [])

export const createPosExpenseItem = (tenantId: number, data: Partial<PosExpenseItem>) =>
  api
    .post<{ message: string; item: PosExpenseItem }>('/pos/expense-items', { ...data, tenant_id: tenantId }, tenantHeaders(tenantId))
    .then(r => r.data)

export const updatePosExpenseItem = (tenantId: number, id: number, data: Partial<PosExpenseItem>) =>
  api
    .put<{ message: string; item: PosExpenseItem }>(`/pos/expense-items/${id}`, { ...data, tenant_id: tenantId }, tenantHeaders(tenantId))
    .then(r => r.data)

export const deletePosExpenseItem = (tenantId: number, id: number) =>
  api.delete(`/pos/expense-items/${id}`, tenantHeaders(tenantId))

/** تسجيل مصروف من نقطة البيع: يولد سند صرف ويؤثر في حساب الصندوق وحساب المصروف (حسب بند/فئة المصروف) */
export const recordPosExpense = (tenantId: number, data: {
  branch_id: number
  shift_id?: number | null
  expense_item_id: number
  payment_method_id: number
  amount: number
  notes?: string | null
}) =>
  api.post<{ message: string; payment_id?: number }>('/pos/expense', { ...data, tenant_id: tenantId }, tenantHeaders(tenantId)).then(r => r.data)

// ──── الإشعارات المركزية ────
export interface NotificationItem {
  id: number
  type: string
  title: string
  body: string | null
  link_path: string | null
  link_params: Record<string, unknown> | null
  severity: 'info' | 'warning' | 'danger' | 'success'
  read_at: string | null
  created_at: string
}

export const fetchNotifications = (
  tenantId: number,
  params?: { per_page?: number; page?: number },
  lang?: 'ar' | 'en'
) => {
  const opts = tenantHeaders(tenantId)
  const headers = { ...opts.headers, ...(lang ? { 'Accept-Language': lang === 'ar' ? 'ar' : 'en' } : {}) }
  return api.get<{ data: NotificationItem[]; meta: { current_page: number; last_page: number; per_page: number; total: number } }>(
    '/notifications',
    { ...opts, params, headers }
  ).then(r => r.data)
}

export const fetchNotificationUnreadCount = (tenantId: number) =>
  api.get<{ count: number }>('/notifications/unread-count', tenantHeaders(tenantId)).then(r => r.data.count)

export const markNotificationAsRead = (tenantId: number, id: number) =>
  api.post<NotificationItem>(`/notifications/${id}/read`, {}, tenantHeaders(tenantId)).then(r => r.data)

export const markAllNotificationsAsRead = (tenantId: number) =>
  api.post<{ message: string }>('/notifications/read-all', {}, tenantHeaders(tenantId)).then(r => r.data)
