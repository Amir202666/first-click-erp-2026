import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchCustomers, createCustomer, updateCustomer, deleteCustomer, fetchAccounts, fetchBranches, fetchCustomerGroups, fetchPricingGroups } from '../../api/tenant'
import type { Customer, Account, Branch, CustomerGroup, PaginatedResponse, PricingGroup } from '../../types'
import { phoneHasCountryCode } from '../../utils/whatsapp'
import { COUNTRY_PHONE_CODES, DEFAULT_COUNTRY_CODE, getCountryCodeFromPhone, getNationalNumber } from '../../data/countryCodes'
import CountryCodeSelect from '../../components/CountryCodeSelect'
import { Plus, Pencil, Trash2, Search, X, Printer, FileSpreadsheet, FileText, Columns3, MoreHorizontal } from 'lucide-react'
import { usePersistedColumnVisibility } from '../../hooks/usePersistedColumnVisibility'
import { asArray } from '../../utils/asArray'
import { useClientSort } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'
import TablePageSkeleton from '../../components/ui/TablePageSkeleton'
import { getReportPeriodRange } from '../../utils/date'

type CustomerColumnKey = 'account_code' | 'company_name' | 'name' | 'email' | 'phone' | 'tax_number' | 'actions'
const CUSTOMER_COLUMN_KEYS: CustomerColumnKey[] = ['account_code', 'company_name', 'name', 'email', 'phone', 'tax_number', 'actions']
const CUSTOMER_COLUMNS_STORAGE = 'customersListVisibleColumns'

/** أوزان نسبية لـ colgroup (عرض الجدول 100%). */
const CUSTOMER_COL_WEIGHT: Record<CustomerColumnKey, number> = {
  account_code: 12,
  company_name: 18,
  name: 20,
  email: 12,
  phone: 10,
  tax_number: 7,
  actions: 5,
}

const emptyForm = { name: '', name_en: '', company_name: '', code: '', email: '', phone: '', country_code: DEFAULT_COUNTRY_CODE, country: '', city: '', tax_number: '', address: '', account_id: '' as string, customer_group_id: '' as string, pricing_group_id: '' as string, auto_create_account: true }

function customerAccountStatementPath(c: Customer): string | null {
  const aid = c.account_id ?? c.account?.id ?? null
  if (aid == null || aid < 1) return null
  const { from_date, to_date } = getReportPeriodRange('all')
  const q = new URLSearchParams({
    accountId: String(aid),
    from_date,
    to_date,
  })
  return `/accounts/statement/sheet?${q.toString()}`
}

const CUSTOMER_ACTIONS_MENU_MIN_PX = 200
const CUSTOMER_ACTIONS_MENU_VIEWPORT_MARGIN = 8

function clampCustomerActionsMenuLeft(rect: DOMRect, isRtl: boolean): number {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
  const m = CUSTOMER_ACTIONS_MENU_VIEWPORT_MARGIN
  const w = CUSTOMER_ACTIONS_MENU_MIN_PX
  if (isRtl) {
    let left = rect.left
    left = Math.min(left, vw - w - m)
    return Math.max(m, left)
  }
  let left = rect.right - w
  left = Math.min(left, vw - w - m)
  return Math.max(m, left)
}

export default function CustomerList() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl, getDisplayName } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [phoneError, setPhoneError] = useState('')
  const [branchScopeError, setBranchScopeError] = useState('')
  const [custAllBranches, setCustAllBranches] = useState(true)
  const [custBranchIds, setCustBranchIds] = useState<number[]>([])
  const [visibleColumns, setVisibleColumns] = usePersistedColumnVisibility<CustomerColumnKey>(
    CUSTOMER_COLUMNS_STORAGE,
    CUSTOMER_COLUMN_KEYS,
  )
  const [showColumnsMenu, setShowColumnsMenu] = useState(false)
  const columnsMenuRef = useRef<HTMLDivElement>(null)
  const [actionsMenuAnchor, setActionsMenuAnchor] = useState<{ customerId: number; rect: DOMRect } | null>(null)

  const { data, isLoading } = useQuery<PaginatedResponse<Customer>>({
    queryKey: ['customers', tenantId, search],
    queryFn: () => fetchCustomers(tenantId, search ? { search } : undefined),
    enabled: !!tenantId,
  })

  const { data: accounts } = useQuery<Account[]>({
    queryKey: ['accounts-flat', tenantId],
    queryFn: () => fetchAccounts(tenantId, { active_only: '1' }),
    enabled: !!tenantId && showModal,
  })

  const { data: customerGroups = [] } = useQuery<CustomerGroup[]>({
    queryKey: ['customer-groups', tenantId],
    queryFn: () => fetchCustomerGroups(tenantId),
    enabled: !!tenantId && showModal,
  })

  const { data: pricingGroups = [] } = useQuery<PricingGroup[]>({
    queryKey: ['pricing-groups', tenantId],
    queryFn: () => fetchPricingGroups(tenantId),
    enabled: !!tenantId && showModal,
  })

  const { data: branchesData } = useQuery({
    queryKey: ['branches', tenantId, 'customer-list-modal'],
    queryFn: () => fetchBranches(tenantId, { status: 'active' }),
    enabled: !!tenantId && showModal,
  })
  const branchesList: Branch[] = asArray<Branch>(branchesData)

  const createMut = useMutation({
    mutationFn: (d: Partial<Customer>) => createCustomer(tenantId, d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      closeModal()
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data: d }: { id: number; data: Partial<Customer> }) => updateCustomer(tenantId, id, d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['customers', tenantId] }); closeModal() },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteCustomer(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      setDeleteTarget(null)
      setDeleteError('')
    },
    onError: (err: { response?: { data?: { message?: string }; status?: number } }) => {
      const msg = err?.response?.data?.message
      setDeleteError(msg && typeof msg === 'string' ? msg : (lang === 'ar' ? 'لا يمكن حذف هذا العميل.' : 'This customer cannot be deleted.'))
    },
  })

  function closeModal() {
    setShowModal(false)
    setEditing(null)
    setForm(emptyForm)
    setPhoneError('')
    setBranchScopeError('')
    setCustAllBranches(true)
    setCustBranchIds([])
    setActionsMenuAnchor(null)
  }

  function openEdit(c: Customer) {
    setActionsMenuAnchor(null)
    setEditing(c)
    const dialCode = c.country_code ?? getCountryCodeFromPhone(c.phone)
    const national = getNationalNumber(c.phone, dialCode ?? null)
    setForm({
      name: c.name,
      name_en: c.name_en ?? '',
      company_name: c.company_name ?? '',
      code: c.code ?? '',
      email: c.email ?? '',
      phone: national || (c.phone ?? ''),
      country_code: dialCode ?? DEFAULT_COUNTRY_CODE,
      country: c.country ?? '',
      city: c.city ?? '',
      tax_number: c.tax_number ?? '',
      address: c.address ?? '',
      account_id: c.account_id ? String(c.account_id) : '',
      customer_group_id: c.customer_group_id ? String(c.customer_group_id) : '',
      pricing_group_id: c.pricing_group_id ? String(c.pricing_group_id) : '',
      auto_create_account: false,
    })
    const br = c.branches ?? []
    if (br.length === 0) {
      setCustAllBranches(true)
      setCustBranchIds([])
    } else {
      setCustAllBranches(false)
      setCustBranchIds(br.map((b) => b.id))
    }
    setBranchScopeError('')
    setShowModal(true)
  }

  function toggleCustBranch(id: number) {
    setCustBranchIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPhoneError('')
    setBranchScopeError('')
    if (!custAllBranches && custBranchIds.length === 0) {
      setBranchScopeError(lang === 'ar' ? 'اختر فرعاً واحداً على الأقل أو «كل الفروع».' : 'Pick at least one branch or «All branches».')
      return
    }
    const phoneDigits = (form.phone ?? '').replace(/\D/g, '')
    const fullPhone = form.country_code
      ? form.country_code + phoneDigits
      : (form.phone ?? '').trim()
    if (phoneDigits && fullPhone && !phoneHasCountryCode(fullPhone)) {
      setPhoneError(lang === 'ar'
        ? 'يرجى إدخال رقم الهاتف مع كود الدولة (مثال: 96551234567 أو 966501234567)'
        : 'Please enter the phone number with country code (e.g. 96551234567 or 966501234567)')
      return
    }
    const payload: Record<string, unknown> = {
      name: form.name,
      name_en: form.name_en || null,
      company_name: form.company_name?.trim() || null,
      code: form.code || null,
      email: form.email || null,
      phone: fullPhone || null,
      country_code: form.country_code || null,
      country: form.country?.trim() || null,
      city: form.city?.trim() || null,
      tax_number: form.tax_number || null,
      address: form.address || null,
    }
    if (editing) {
      payload.account_id = form.account_id ? Number(form.account_id) : null
      payload.customer_group_id = form.customer_group_id ? Number(form.customer_group_id) : null
      payload.pricing_group_id = form.pricing_group_id ? Number(form.pricing_group_id) : null
      payload.all_branches = custAllBranches
      if (!custAllBranches) {
        payload.branch_ids = custBranchIds
      }
      updateMut.mutate({ id: editing.id, data: payload })
    } else {
      if (form.auto_create_account) {
        payload.auto_create_account = true
      } else {
        payload.account_id = form.account_id ? Number(form.account_id) : null
        payload.auto_create_account = false
      }
      payload.customer_group_id = form.customer_group_id ? Number(form.customer_group_id) : null
      payload.pricing_group_id = form.pricing_group_id ? Number(form.pricing_group_id) : null
      payload.all_branches = custAllBranches
      if (!custAllBranches) {
        payload.branch_ids = custBranchIds
      }
      createMut.mutate(payload as Partial<Customer>)
    }
  }

  const customers = data?.data ?? []
  const { sort, toggleSort, sortedRows } = useClientSort(customers, [
    { key: 'account_code', type: 'string', getValue: (c: Customer) => c.account?.code ?? '' },
    { key: 'company_name', type: 'string', getValue: (c: Customer) => c.company_name ?? '' },
    { key: 'name', type: 'string', getValue: (c: Customer) => getDisplayName(c) },
    { key: 'email', type: 'string', getValue: (c: Customer) => c.email ?? '' },
    { key: 'phone', type: 'string', getValue: (c: Customer) => c.phone ?? '' },
    { key: 'tax_number', type: 'string', getValue: (c: Customer) => c.tax_number ?? '' },
  ], { locale: lang === 'ar' ? 'ar-u-nu-latn' : 'en-US' })
  const isSaving = createMut.isPending || updateMut.isPending
  const thAlign = isRtl ? 'text-right' : 'text-left'
  const searchIconPos = isRtl ? 'right-3' : 'left-3'
  const searchInputPadding = isRtl ? 'pr-10 pl-3' : 'pl-10 pr-3'

  const columnLabels: Record<CustomerColumnKey, string> = {
    account_code: t.customers.accountNumber,
    company_name: t.customers.companyName,
    name: t.customers.customerName,
    email: t.email,
    phone: t.customers.phone,
    tax_number: t.customers.taxNumber,
    actions: t.actions,
  }
  const visibleColumnKeys = useMemo(() => {
    const v = CUSTOMER_COLUMN_KEYS.filter((k) => visibleColumns[k])
    return v.length > 0 ? v : [...CUSTOMER_COLUMN_KEYS]
  }, [visibleColumns])
  const customerColPercentStyles = useMemo(() => {
    const keys = visibleColumnKeys
    const sum = keys.reduce((s, k) => s + CUSTOMER_COL_WEIGHT[k], 0)
    return keys.map((k) => ({
      key: k,
      style: { width: `${(CUSTOMER_COL_WEIGHT[k] / sum) * 100}%` } as const,
    }))
  }, [visibleColumnKeys])
  const dataColumnKeys = visibleColumnKeys.filter((k) => k !== 'actions')

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (columnsMenuRef.current && !columnsMenuRef.current.contains(e.target as Node)) setShowColumnsMenu(false)
    }
    if (showColumnsMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showColumnsMenu])

  useEffect(() => {
    if (actionsMenuAnchor == null) return
    const cid = actionsMenuAnchor.customerId
    const onDocDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null
      if (!el) return
      if (el.closest('[data-customer-actions-menu]')) return
      if (el.closest(`[data-customer-actions-trigger="${cid}"]`)) return
      setActionsMenuAnchor(null)
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [actionsMenuAnchor])

  useEffect(() => {
    if (actionsMenuAnchor == null) return
    const close = () => setActionsMenuAnchor(null)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [actionsMenuAnchor])

  function handlePrint() {
    if (dataColumnKeys.length === 0) return
    const headers = dataColumnKeys.map((k) => columnLabels[k])
    const rowsHtml = customers.map((c) => {
      const cells = dataColumnKeys.map((k) => {
        if (k === 'account_code') return `<td>${(c.account?.code ?? '—').replace(/</g, '&lt;')}</td>`
        if (k === 'company_name') return `<td>${(c.company_name ?? '—').replace(/</g, '&lt;')}</td>`
        if (k === 'name') return `<td>${(getDisplayName(c) ?? '').replace(/</g, '&lt;')}</td>`
        if (k === 'email') return `<td>${(c.email ?? '—').replace(/</g, '&lt;')}</td>`
        if (k === 'phone') return `<td>${(c.phone ?? '—').replace(/</g, '&lt;')}</td>`
        if (k === 'tax_number') return `<td>${(c.tax_number ?? '—').replace(/</g, '&lt;')}</td>`
        return '<td></td>'
      })
      return `<tr>${cells.join('')}</tr>`
    }).join('')
    const headerCells = headers.map((h) => `<th>${h.replace(/</g, '&lt;')}</th>`).join('')
    const title = t.customers.title
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
<!DOCTYPE html><html dir="${isRtl ? 'rtl' : 'ltr'}"><head>
<meta charset="utf-8"><title>${title}</title>
<style>body{font-family:Arial,sans-serif;padding:24px;} table{width:100%;border-collapse:collapse;} th,td{border:1px solid #ddd;padding:8px;} th{background:#f1f5f9;}</style>
</head><body><h2>${title}</h2><table><thead><tr>${headerCells}</tr></thead><tbody>${rowsHtml}</tbody></table></body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 300)
  }

  function handleExportExcel() {
    if (dataColumnKeys.length === 0) return
    const headers = dataColumnKeys.map((k) => columnLabels[k])
    const lines = [headers.join(',')]
    customers.forEach((c) => {
      const cells = dataColumnKeys.map((k) => {
        const v = k === 'account_code' ? (c.account?.code ?? '') : k === 'company_name' ? (c.company_name ?? '') : k === 'name' ? (getDisplayName(c) ?? '') : k === 'email' ? (c.email ?? '') : k === 'phone' ? (c.phone ?? '') : k === 'tax_number' ? (c.tax_number ?? '') : ''
        return `"${String(v).replace(/"/g, '""')}"`
      })
      lines.push(cells.join(','))
    })
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `customers.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const actionsMenuCustomer =
    actionsMenuAnchor != null ? sortedRows.find((x) => x.id === actionsMenuAnchor.customerId) : undefined

  return (
    <div className="min-w-0 max-w-full space-y-6 p-6">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <h1 className="shrink-0 text-2xl font-bold text-slate-900">{t.customers.title}</h1>
        <div className="flex min-w-0 flex-1 justify-center px-2">
          <div className="relative w-full max-w-[22rem]">
            <Search size={18} className={`absolute ${searchIconPos} top-1/2 -translate-y-1/2 text-slate-400`} />
            <input
              type="text"
              placeholder={t.search}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`w-full rounded-lg border border-slate-300 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-inset focus:ring-primary-500 ${searchInputPadding}`}
            />
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setForm(emptyForm)
              setEditing(null)
              setCustAllBranches(true)
              setCustBranchIds([])
              setBranchScopeError('')
              setPhoneError('')
              setShowModal(true)
            }}
            className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-white transition-colors hover:bg-primary-500"
          >
            <Plus size={18} />
            {t.customers.addCustomer}
          </button>
          <div className="relative z-[120] shrink-0" ref={columnsMenuRef}>
            <button
              type="button"
              onClick={() => setShowColumnsMenu((v) => !v)}
              aria-expanded={showColumnsMenu}
              aria-haspopup="true"
              className={`inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#D9DCE0] bg-[#F0F2F5] text-[#344054] shadow-sm transition-colors hover:bg-[#E4E7EB] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600 ${showColumnsMenu ? 'bg-[#E4E7EB] ring-1 ring-slate-300/80 dark:bg-slate-600 dark:ring-slate-500/80' : ''}`}
              title={lang === 'ar' ? 'تخصيص الأعمدة' : 'Customize columns'}
            >
              <Columns3 size={16} strokeWidth={2} aria-hidden />
            </button>
            {showColumnsMenu && (
              <div
                className={`absolute top-full z-[130] mt-2 w-64 max-h-[min(70vh,22rem)] overflow-y-auto rounded-xl border border-slate-200/95 bg-white py-2 text-sm shadow-xl ring-1 ring-slate-200/80 dark:border-slate-600 dark:bg-slate-800 dark:ring-slate-700/80 ${isRtl ? 'end-0' : 'start-0'}`}
                role="menu"
                aria-label={lang === 'ar' ? 'إظهار/إخفاء الأعمدة' : 'Show / hide columns'}
              >
                <div className="border-b border-slate-100 px-3 pb-2 text-xs font-semibold text-slate-500 dark:border-slate-600 dark:text-slate-400">
                  {lang === 'ar' ? 'إظهار/إخفاء الأعمدة' : 'Show / hide columns'}
                </div>
                {CUSTOMER_COLUMN_KEYS.map((key) => (
                  <label
                    key={key}
                    className="flex cursor-pointer select-none items-center gap-2 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700/60"
                  >
                    <input
                      type="checkbox"
                      checked={visibleColumns[key]}
                      onChange={() => setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }))}
                      className="rounded border-slate-300 text-primary-600 dark:border-slate-600"
                    />
                    <span className="text-slate-800 dark:text-slate-100">{columnLabels[key]}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            title={t.payments?.printReport ?? t.accounts?.print ?? 'طباعة'}
          >
            <Printer size={18} />
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-700 text-white hover:bg-slate-600"
            title={t.payments?.exportPdf ?? t.accounts?.exportPdf ?? 'تصدير PDF'}
          >
            <FileText size={18} />
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-500"
            title={t.payments?.exportExcel ?? t.accounts?.exportExcel ?? 'تصدير Excel'}
          >
            <FileSpreadsheet size={18} />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        {isLoading ? (
          <TablePageSkeleton rows={10} />
        ) : (
          <div className="w-full min-w-0 overflow-x-auto">
            <table className="w-full table-fixed border-collapse bg-white text-sm dark:bg-slate-800 [&_tbody_td]:min-w-0">
              <colgroup>
                {customerColPercentStyles.map(({ key, style }) => (
                  <col key={key} style={style} />
                ))}
              </colgroup>
              <thead>
                <tr className="bg-slate-50 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300">
                  {visibleColumnKeys.map((k) =>
                    k === 'actions' ? (
                      <th
                        key={k}
                        className={`${thAlign} whitespace-nowrap px-3 py-2 font-medium text-slate-700 dark:text-slate-200`}
                      >
                        {columnLabels[k]}
                      </th>
                    ) : (
                      <SortableTh
                        key={k}
                        label={columnLabels[k]}
                        sortKey={k}
                        sortState={sort as any}
                        onToggle={toggleSort as any}
                        truncateLabel={false}
                        compact
                        widthClassName="min-w-0"
                        className={`${thAlign} font-medium text-slate-700 dark:text-slate-200`}
                      />
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {sortedRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={visibleColumnKeys.length}
                      className="py-6 text-center text-slate-400 dark:text-slate-500"
                    >
                      {t.customers.noCustomers}
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                      {visibleColumnKeys.map((k) => {
                        if (k === 'account_code') {
                          const ac = c.account?.code ?? null
                          return (
                            <td
                              key={k}
                              className="truncate px-3 py-2 font-mono text-xs text-slate-600"
                              title={ac ?? undefined}
                            >
                              {ac ?? '—'}
                            </td>
                          )
                        }
                        if (k === 'company_name')
                          return (
                            <td key={k} className="break-words px-4 py-2 text-sm text-slate-600">
                              {c.company_name ?? '—'}
                            </td>
                          )
                        if (k === 'name')
                          return (
                            <td key={k} className="break-words px-4 py-2 font-medium text-slate-900 dark:text-slate-100">
                              {getDisplayName(c)}
                            </td>
                          )
                        if (k === 'email')
                          return (
                            <td key={k} className="break-all px-4 py-2 text-slate-600">
                              {c.email ?? '—'}
                            </td>
                          )
                        if (k === 'phone')
                          return (
                            <td key={k} className="break-words px-4 py-2 text-slate-600">
                              {c.phone ?? '—'}
                            </td>
                          )
                        if (k === 'tax_number')
                          return (
                            <td key={k} className="break-all px-3 py-2 text-xs text-slate-600">
                              {c.tax_number ?? '—'}
                            </td>
                          )
                        if (k === 'actions') {
                          return (
                            <td key={k} className="px-4 py-2 align-middle">
                              <div className="flex justify-center">
                                <button
                                  type="button"
                                  data-customer-actions-trigger={c.id}
                                  className={`inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 ${actionsMenuAnchor?.customerId === c.id ? 'ring-2 ring-primary-500 ring-offset-1 dark:ring-offset-slate-900' : ''}`}
                                  aria-expanded={actionsMenuAnchor?.customerId === c.id}
                                  aria-haspopup="menu"
                                  aria-label={lang === 'ar' ? 'إجراءات' : 'Actions'}
                                  title={lang === 'ar' ? 'إجراءات' : 'Actions'}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    const btn = e.currentTarget
                                    if (actionsMenuAnchor?.customerId === c.id) {
                                      setActionsMenuAnchor(null)
                                      return
                                    }
                                    setActionsMenuAnchor({ customerId: c.id, rect: btn.getBoundingClientRect() })
                                  }}
                                >
                                  <MoreHorizontal size={16} aria-hidden />
                                </button>
                              </div>
                            </td>
                          )
                        }
                        return <td key={k} />
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Modal - عرضي (عمودين) */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={closeModal}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">{editing ? t.customers.editCustomer : t.customers.addCustomer}</h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t.customers.customerName} *</label>
                  <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t.nameEn}</label>
                  <input type="text" value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none" dir="ltr" placeholder="English name (optional)" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t.customers.companyName}</label>
                  <input type="text" value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none" placeholder={lang === 'ar' ? 'اسم الشركة' : 'Company name'} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t.customers.taxNumber}</label>
                  <input type="text" value={form.tax_number} onChange={(e) => setForm({ ...form, tax_number: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t.email}</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t.customers.country}</label>
                  <input type="text" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none" placeholder={lang === 'ar' ? 'الدولة' : 'Country'} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t.customers.city}</label>
                  <input type="text" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none" placeholder={lang === 'ar' ? 'المدينة' : 'City'} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t.customers.phone}</label>
                  <div className="flex gap-2" dir={isRtl ? 'rtl' : 'ltr'}>
                    {isRtl ? (
                      <>
                        <input
                          type="text"
                          value={form.phone}
                          onChange={(e) => { setForm({ ...form, phone: e.target.value }); setPhoneError('') }}
                          className={`flex-1 min-w-0 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none ${phoneError ? 'border-red-500 focus:border-red-500' : 'border-slate-300 focus:border-primary-500'}`}
                          dir="ltr"
                          placeholder={lang === 'ar' ? 'رقم الهاتف بدون كود الدولة' : 'Phone number without country code'}
                        />
                        <CountryCodeSelect
                          value={form.country_code}
                          options={COUNTRY_PHONE_CODES}
                          onChange={(code) => setForm({ ...form, country_code: code })}
                          lang={lang === 'ar' ? 'ar' : 'en'}
                          title={t.customers.countryCode}
                        />
                      </>
                    ) : (
                      <>
                        <CountryCodeSelect
                          value={form.country_code}
                          options={COUNTRY_PHONE_CODES}
                          onChange={(code) => setForm({ ...form, country_code: code })}
                          lang={lang === 'ar' ? 'ar' : 'en'}
                          title={t.customers.countryCode}
                        />
                        <input
                          type="text"
                          value={form.phone}
                          onChange={(e) => { setForm({ ...form, phone: e.target.value }); setPhoneError('') }}
                          className={`flex-1 min-w-0 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none ${phoneError ? 'border-red-500 focus:border-red-500' : 'border-slate-300 focus:border-primary-500'}`}
                          dir="ltr"
                          placeholder={lang === 'ar' ? 'رقم الهاتف بدون كود الدولة' : 'Phone number without country code'}
                        />
                      </>
                    )}
                  </div>
                  {phoneError && <p className="mt-1 text-xs text-red-600">{phoneError}</p>}
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t.customers.address}</label>
                  <textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none" rows={2} />
                </div>
                <div className="col-span-2 border border-slate-200 rounded-lg p-3 space-y-2 bg-slate-50/50">
                  <label className="block text-sm font-semibold text-slate-700">{lang === 'ar' ? 'الفروع' : 'Branches'}</label>
                  <p className="text-xs text-slate-500">
                    {lang === 'ar'
                      ? 'يظهر العميل في الفواتير ونقاط البيع فقط للفروع المحددة؛ «كل الفروع» = بدون تقييد.'
                      : 'Customer appears only in selected branches in invoices/POS; «All branches» = no restriction.'}
                  </p>
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="list-cust-branch"
                        checked={custAllBranches}
                        onChange={() => {
                          setCustAllBranches(true)
                          setCustBranchIds([])
                        }}
                        className="text-primary-600 focus:ring-primary-500"
                      />
                      {lang === 'ar' ? 'كل الفروع' : 'All branches'}
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="list-cust-branch"
                        checked={!custAllBranches}
                        onChange={() => setCustAllBranches(false)}
                        className="text-primary-600 focus:ring-primary-500"
                      />
                      {lang === 'ar' ? 'فروع محددة' : 'Selected branches'}
                    </label>
                  </div>
                  {!custAllBranches && (
                    <div className="max-h-32 overflow-y-auto rounded-md border border-slate-200 bg-white p-2 space-y-1">
                      {branchesList.filter((b) => b.is_active).map((b) => (
                        <label key={b.id} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={custBranchIds.includes(b.id)}
                            onChange={() => toggleCustBranch(b.id)}
                            className="rounded border-slate-300 text-primary-600"
                          />
                          <span>{lang === 'ar' ? b.name : b.name_en || b.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {branchScopeError && <p className="text-xs text-red-600">{branchScopeError}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t.customers.group}</label>
                  <select
                    value={form.customer_group_id}
                    onChange={(e) => setForm({ ...form, customer_group_id: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                  >
                    <option value="">{t.customers.selectGroup}</option>
                    {customerGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({g.discount_type === 'percent' ? g.discount_value + '%' : g.discount_value})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{lang === 'ar' ? 'مجموعة التسعير' : 'Pricing group'}</label>
                  <select
                    value={form.pricing_group_id}
                    onChange={(e) => setForm({ ...form, pricing_group_id: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                  >
                    <option value="">{lang === 'ar' ? 'بدون' : 'None'}</option>
                    {(pricingGroups as PricingGroup[])
                      .filter((g) => g.is_active)
                      .map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t.customers.linkedAccount}</label>
                  {!editing && (
                    <div className="flex items-center gap-4 mb-2">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="radio" checked={form.auto_create_account} onChange={() => setForm({ ...form, auto_create_account: true, account_id: '' })}
                          className="text-primary-600 focus:ring-primary-500" />
                        {t.customers.autoCreateAccount}
                      </label>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="radio" checked={!form.auto_create_account} onChange={() => setForm({ ...form, auto_create_account: false })}
                          className="text-primary-600 focus:ring-primary-500" />
                        {t.customers.selectExistingAccount}
                      </label>
                    </div>
                  )}
                  {form.auto_create_account && !editing ? (
                    <p className="text-xs text-emerald-600 bg-emerald-50 rounded-md px-3 py-2">{t.customers.accountAutoCreated}</p>
                  ) : (
                    <select value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none">
                      <option value="">{t.customers.selectAccount}</option>
                      {(accounts ?? []).map((a) => (
                        <option key={a.id} value={a.id}>{a.code} - {getDisplayName(a)}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-6 mt-2 border-t border-slate-200">
                <button type="button" onClick={closeModal} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">{t.cancel}</button>
                <button type="submit" disabled={isSaving} className="bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50 transition-colors">
                  {isSaving ? t.saving : t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setDeleteTarget(null); setDeleteError('') }}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">{t.msg.confirmDeleteTitle}</h3>
            {deleteError ? (
              <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                {deleteError}
              </div>
            ) : (
              <p className="text-slate-600 text-sm mb-6">{t.delete} &quot;{getDisplayName(deleteTarget)}&quot;? {t.msg.cannotUndo}</p>
            )}
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setDeleteTarget(null); setDeleteError('') }} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">{t.cancel}</button>
              {!deleteError && (
                <button
                  onClick={() => deleteMut.mutate(deleteTarget.id)}
                  disabled={deleteMut.isPending}
                  className="bg-red-600 hover:bg-red-500 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50 transition-colors"
                >
                  {deleteMut.isPending ? t.deleting : t.delete}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {actionsMenuAnchor &&
        actionsMenuCustomer &&
        createPortal(
          <div
            data-customer-actions-menu
            role="menu"
            dir={isRtl ? 'rtl' : 'ltr'}
            className="fixed z-[300] min-w-[12.5rem] rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg dark:border-slate-600 dark:bg-slate-800"
            style={{
              top: actionsMenuAnchor.rect.bottom + 4,
              left: clampCustomerActionsMenuLeft(actionsMenuAnchor.rect, isRtl),
            }}
          >
            {(() => {
              const c = actionsMenuCustomer
              const statementPath = customerAccountStatementPath(c)
              const statementLabel =
                lang === 'ar' ? 'عرض كشف حساب' : 'View account statement'
              const noAccountHint =
                lang === 'ar'
                  ? 'لا يوجد حساب مرتبط بهذا العميل'
                  : 'No linked account for this customer'
              return (
                <>
                  {statementPath ? (
                    <Link
                      to={statementPath}
                      role="menuitem"
                      className="flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-700/60"
                      onClick={() => setActionsMenuAnchor(null)}
                    >
                      <FileText size={14} className="shrink-0 opacity-70" aria-hidden />
                      {statementLabel}
                    </Link>
                  ) : (
                    <div
                      className="cursor-not-allowed px-3 py-2 text-xs text-slate-400 dark:text-slate-500"
                      title={noAccountHint}
                    >
                      {statementLabel}
                      <span className="mt-0.5 block text-[10px] leading-tight">{noAccountHint}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-start text-slate-700 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-700/60"
                    onClick={() => {
                      openEdit(c)
                      setActionsMenuAnchor(null)
                    }}
                  >
                    <Pencil size={14} className="shrink-0 text-primary-600" aria-hidden />
                    {t.edit}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-start text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                    onClick={() => {
                      setDeleteTarget(c)
                      setActionsMenuAnchor(null)
                    }}
                  >
                    <Trash2 size={14} className="shrink-0" aria-hidden />
                    {t.delete}
                  </button>
                </>
              )
            })()}
          </div>,
          document.body,
        )}
    </div>
  )
}
