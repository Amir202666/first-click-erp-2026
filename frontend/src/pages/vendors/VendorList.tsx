import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchVendors, createVendor, updateVendor, deleteVendor, fetchAccounts, fetchBranches } from '../../api/tenant'
import type { Vendor, Account, Branch, PaginatedResponse } from '../../types'
import { phoneHasCountryCode } from '../../utils/whatsapp'
import { COUNTRY_PHONE_CODES, DEFAULT_COUNTRY_CODE, getCountryCodeFromPhone, getNationalNumber } from '../../data/countryCodes'
import CountryCodeSelect from '../../components/CountryCodeSelect'
import { Plus, Pencil, Trash2, Search, X, Printer, FileSpreadsheet, FileText, Columns3, MoreHorizontal } from 'lucide-react'
import { usePersistedColumnVisibility } from '../../hooks/usePersistedColumnVisibility'
import { asArray } from '../../utils/asArray'
import { useClientSort } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'
import { getReportPeriodRange } from '../../utils/date'

type VendorColumnKey = 'code' | 'company_name' | 'name' | 'email' | 'phone' | 'tax_number' | 'actions'
const VENDOR_COLUMN_KEYS: VendorColumnKey[] = ['code', 'company_name', 'name', 'email', 'phone', 'tax_number', 'actions']
const VENDOR_COLUMNS_STORAGE = 'vendorsListVisibleColumns'

/** أوزان نسبية لـ colgroup: تُحسب النسبة لكل عمود ظاهر بحيث يبلغ المجموع 100% من عرض الجدول. */
const VENDOR_COL_WEIGHT: Record<VendorColumnKey, number> = {
  code: 13,
  company_name: 22,
  name: 22,
  email: 15,
  phone: 11,
  tax_number: 7,
  actions: 6,
}

const emptyForm = { name: '', name_en: '', company_name: '', email: '', phone: '', country_code: DEFAULT_COUNTRY_CODE, country: '', city: '', tax_number: '', address: '', account_id: '' as string, auto_create_account: true }

function vendorAccountStatementPath(v: Vendor): string | null {
  const aid = v.account_id ?? v.account?.id ?? null
  if (aid == null || aid < 1) return null
  const { from_date, to_date } = getReportPeriodRange('all')
  const q = new URLSearchParams({
    accountId: String(aid),
    from_date,
    to_date,
  })
  return `/accounts/statement/sheet?${q.toString()}`
}

const VENDOR_ACTIONS_MENU_MIN_PX = 200
const VENDOR_ACTIONS_MENU_VIEWPORT_MARGIN = 8

function clampVendorActionsMenuLeft(rect: DOMRect, isRtl: boolean): number {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
  const m = VENDOR_ACTIONS_MENU_VIEWPORT_MARGIN
  const w = VENDOR_ACTIONS_MENU_MIN_PX
  if (isRtl) {
    let left = rect.left
    left = Math.min(left, vw - w - m)
    return Math.max(m, left)
  }
  let left = rect.right - w
  left = Math.min(left, vw - w - m)
  return Math.max(m, left)
}

export default function VendorList() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl, getDisplayName } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Vendor | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [deleteTarget, setDeleteTarget] = useState<Vendor | null>(null)
  const [phoneError, setPhoneError] = useState('')
  const [branchScopeError, setBranchScopeError] = useState('')
  const [vendAllBranches, setVendAllBranches] = useState(true)
  const [vendBranchIds, setVendBranchIds] = useState<number[]>([])
  const [visibleColumns, setVisibleColumns] = usePersistedColumnVisibility<VendorColumnKey>(
    VENDOR_COLUMNS_STORAGE,
    VENDOR_COLUMN_KEYS,
  )
  const [showColumnsMenu, setShowColumnsMenu] = useState(false)
  const columnsMenuRef = useRef<HTMLDivElement>(null)
  const [actionsMenuAnchor, setActionsMenuAnchor] = useState<{ vendorId: number; rect: DOMRect } | null>(null)

  const { data, isLoading } = useQuery<PaginatedResponse<Vendor>>({
    queryKey: ['vendors', tenantId, search],
    queryFn: () => fetchVendors(tenantId, search ? { search } : undefined),
    enabled: !!tenantId,
  })

  const { data: accounts } = useQuery<Account[]>({
    queryKey: ['accounts-flat', tenantId],
    queryFn: () => fetchAccounts(tenantId, { active_only: '1' }),
    enabled: !!tenantId && showModal,
  })

  const { data: branchesData } = useQuery({
    queryKey: ['branches', tenantId, 'vendor-list-modal'],
    queryFn: () => fetchBranches(tenantId, { status: 'active' }),
    enabled: !!tenantId && showModal,
  })
  const branchesList: Branch[] = asArray<Branch>(branchesData)

  const createMut = useMutation({
    mutationFn: (d: Partial<Vendor>) => createVendor(tenantId, d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['vendors', tenantId] }); queryClient.invalidateQueries({ queryKey: ['accounts'] }); closeModal() },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data: d }: { id: number; data: Partial<Vendor> }) => updateVendor(tenantId, id, d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['vendors', tenantId] }); closeModal() },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteVendor(tenantId, id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['vendors', tenantId] }); setDeleteTarget(null) },
  })

  function closeModal() {
    setShowModal(false)
    setEditing(null)
    setForm(emptyForm)
    setPhoneError('')
    setBranchScopeError('')
    setVendAllBranches(true)
    setVendBranchIds([])
    setActionsMenuAnchor(null)
  }

  function openEdit(v: Vendor) {
    setActionsMenuAnchor(null)
    setEditing(v)
    const dialCode = v.country_code ?? getCountryCodeFromPhone(v.phone)
    const national = getNationalNumber(v.phone, dialCode ?? null)
    setForm({
      name: v.name,
      name_en: v.name_en ?? '',
      company_name: v.company_name ?? '',
      email: v.email ?? '',
      phone: national || (v.phone ?? ''),
      country_code: dialCode ?? DEFAULT_COUNTRY_CODE,
      country: v.country ?? '',
      city: v.city ?? '',
      tax_number: v.tax_number ?? '',
      address: v.address ?? '',
      account_id: v.account_id ? String(v.account_id) : '',
      auto_create_account: false,
    })
    const br = v.branches ?? []
    if (br.length === 0) {
      setVendAllBranches(true)
      setVendBranchIds([])
    } else {
      setVendAllBranches(false)
      setVendBranchIds(br.map((b) => b.id))
    }
    setBranchScopeError('')
    setPhoneError('')
    setShowModal(true)
  }

  function toggleVendBranch(id: number) {
    setVendBranchIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPhoneError('')
    setBranchScopeError('')
    if (!vendAllBranches && vendBranchIds.length === 0) {
      setBranchScopeError(lang === 'ar' ? 'اختر فرعاً واحداً على الأقل أو «كل الفروع».' : 'Pick at least one branch or «All branches».')
      return
    }
    const phoneDigits = (form.phone ?? '').replace(/\D/g, '')
    const fullPhone = form.country_code ? form.country_code + phoneDigits : (form.phone ?? '').trim()
    if (phoneDigits && fullPhone && !phoneHasCountryCode(fullPhone)) {
      setPhoneError(
        lang === 'ar'
          ? 'يرجى إدخال رقم الهاتف مع كود الدولة (مثال: 96551234567 أو 966501234567)'
          : 'Please enter the phone number with country code (e.g. 96551234567 or 966501234567)',
      )
      return
    }
    const payload: Record<string, unknown> = {
      name: form.name,
      name_en: form.name_en || null,
      company_name: form.company_name?.trim() || null,
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
      payload.all_branches = vendAllBranches
      if (!vendAllBranches) {
        payload.branch_ids = vendBranchIds
      }
      updateMut.mutate({ id: editing.id, data: payload })
    } else {
      if (form.auto_create_account) {
        payload.auto_create_account = true
      } else {
        payload.account_id = form.account_id ? Number(form.account_id) : null
        payload.auto_create_account = false
      }
      payload.all_branches = vendAllBranches
      if (!vendAllBranches) {
        payload.branch_ids = vendBranchIds
      }
      createMut.mutate(payload as Partial<Vendor>)
    }
  }

  const vendors = data?.data ?? []
  const { sort, toggleSort, sortedRows } = useClientSort(vendors, [
    { key: 'code', type: 'string', getValue: (v: Vendor) => v.code ?? '' },
    { key: 'company_name', type: 'string', getValue: (v: Vendor) => v.company_name ?? '' },
    { key: 'name', type: 'string', getValue: (v: Vendor) => getDisplayName(v) },
    { key: 'email', type: 'string', getValue: (v: Vendor) => v.email ?? '' },
    { key: 'phone', type: 'string', getValue: (v: Vendor) => v.phone ?? '' },
    { key: 'tax_number', type: 'string', getValue: (v: Vendor) => v.tax_number ?? '' },
  ], { locale: lang === 'ar' ? 'ar-u-nu-latn' : 'en-US' })
  const isSaving = createMut.isPending || updateMut.isPending
  const thAlign = isRtl ? 'text-right' : 'text-left'
  const searchIconPos = isRtl ? 'right-3' : 'left-3'
  const searchInputPadding = isRtl ? 'pr-10 pl-3' : 'pl-10 pr-3'

  const columnLabels: Record<VendorColumnKey, string> = {
    code: t.vendors.vendorNumber,
    company_name: t.vendors.companyName,
    name: t.vendors.vendorName,
    email: t.email,
    phone: t.customers.phone,
    tax_number: t.customers.taxNumber,
    actions: t.actions,
  }
  const visibleColumnKeys = useMemo(() => {
    const v = VENDOR_COLUMN_KEYS.filter((k) => visibleColumns[k])
    return v.length > 0 ? v : [...VENDOR_COLUMN_KEYS]
  }, [visibleColumns])
  const vendorColPercentStyles = useMemo(() => {
    const keys = visibleColumnKeys
    const sum = keys.reduce((s, k) => s + VENDOR_COL_WEIGHT[k], 0)
    return keys.map((k) => ({
      key: k,
      style: { width: `${(VENDOR_COL_WEIGHT[k] / sum) * 100}%` } as const,
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
    const vid = actionsMenuAnchor.vendorId
    const onDocDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null
      if (!el) return
      if (el.closest('[data-vendor-actions-menu]')) return
      if (el.closest(`[data-vendor-actions-trigger="${vid}"]`)) return
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
    const rowsHtml = vendors.map((v) => {
      const cells = dataColumnKeys.map((k) => {
        if (k === 'code') return `<td>${v.code ?? '—'}</td>`
        if (k === 'company_name') return `<td>${(v.company_name ?? '—').replace(/</g, '&lt;')}</td>`
        if (k === 'name') return `<td>${(getDisplayName(v) ?? '').replace(/</g, '&lt;')}</td>`
        if (k === 'email') return `<td>${(v.email ?? '—').replace(/</g, '&lt;')}</td>`
        if (k === 'phone') return `<td>${(v.phone ?? '—').replace(/</g, '&lt;')}</td>`
        if (k === 'tax_number') return `<td>${(v.tax_number ?? '—').replace(/</g, '&lt;')}</td>`
        return '<td></td>'
      })
      return `<tr>${cells.join('')}</tr>`
    }).join('')
    const headerCells = headers.map((h) => `<th>${h.replace(/</g, '&lt;')}</th>`).join('')
    const title = t.vendors.title
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
    vendors.forEach((v) => {
      const cells = dataColumnKeys.map((k) => {
        const val = k === 'code' ? (v.code ?? '') : k === 'company_name' ? (v.company_name ?? '') : k === 'name' ? (getDisplayName(v) ?? '') : k === 'email' ? (v.email ?? '') : k === 'phone' ? (v.phone ?? '') : k === 'tax_number' ? (v.tax_number ?? '') : ''
        return `"${String(val).replace(/"/g, '""')}"`
      })
      lines.push(cells.join(','))
    })
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vendors.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const actionsMenuVendor =
    actionsMenuAnchor != null ? sortedRows.find((x) => x.id === actionsMenuAnchor.vendorId) : undefined

  return (
    <div className="min-w-0 max-w-full space-y-6 p-6">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-slate-900 shrink-0">{t.vendors.title}</h1>
        <div className="flex-1 flex justify-center min-w-0 px-2">
          <div className="relative w-full max-w-[22rem]">
            <Search size={18} className={`absolute ${searchIconPos} top-1/2 -translate-y-1/2 text-slate-400`} />
            <input type="text" placeholder={t.search} value={search} onChange={(e) => setSearch(e.target.value)} className={`w-full border border-slate-300 rounded-lg py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none ${searchInputPadding}`} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={() => {
              setForm(emptyForm)
              setEditing(null)
              setVendAllBranches(true)
              setVendBranchIds([])
              setBranchScopeError('')
              setPhoneError('')
              setShowModal(true)
            }}
            className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-4 py-2 transition-colors"
          >
            <Plus size={18} />
            {t.vendors.addVendor}
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
                {VENDOR_COLUMN_KEYS.map((key) => (
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
          <button type="button" onClick={handlePrint} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50" title={t.payments?.printReport ?? t.accounts?.print ?? 'طباعة'}>
            <Printer size={18} />
          </button>
          <button type="button" onClick={handlePrint} className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-700 text-white hover:bg-slate-600" title={t.payments?.exportPdf ?? t.accounts?.exportPdf ?? 'تصدير PDF'}>
            <FileText size={18} />
          </button>
          <button type="button" onClick={handleExportExcel} className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-500" title={t.payments?.exportExcel ?? t.accounts?.exportExcel ?? 'تصدير Excel'}>
            <FileSpreadsheet size={18} />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : (
          <div className="w-full min-w-0 overflow-x-auto">
            <table className="w-full table-fixed border-collapse bg-white text-sm dark:bg-slate-800 [&_tbody_td]:min-w-0">
              <colgroup>
                {vendorColPercentStyles.map(({ key, style }) => (
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
                      {t.vendors.noVendors}
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50">
                      {visibleColumnKeys.map((k) => {
                        if (k === 'code')
                          return (
                            <td
                              key={k}
                              className="truncate px-3 py-2 font-mono text-xs text-slate-600"
                              title={v.code ?? undefined}
                            >
                              {v.code ?? '—'}
                            </td>
                          )
                        if (k === 'company_name')
                          return (
                            <td key={k} className="break-words px-4 py-2 text-sm text-slate-600">
                              {v.company_name ?? '—'}
                            </td>
                          )
                        if (k === 'name')
                          return (
                            <td key={k} className="break-words px-4 py-2 font-medium text-slate-900">
                              {getDisplayName(v)}
                            </td>
                          )
                        if (k === 'email')
                          return (
                            <td key={k} className="break-all px-4 py-2 text-slate-600">
                              {v.email ?? '—'}
                            </td>
                          )
                        if (k === 'phone')
                          return (
                            <td key={k} className="break-words px-4 py-2 text-slate-600">
                              {v.phone ?? '—'}
                            </td>
                          )
                        if (k === 'tax_number')
                          return (
                            <td key={k} className="break-all px-3 py-2 text-xs text-slate-600">
                              {v.tax_number ?? '—'}
                            </td>
                          )
                        if (k === 'actions') {
                          return (
                            <td key={k} className="px-4 py-2 align-middle">
                              <div className="flex justify-center">
                                <button
                                  type="button"
                                  data-vendor-actions-trigger={v.id}
                                  className={`inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 ${actionsMenuAnchor?.vendorId === v.id ? 'ring-2 ring-primary-500 ring-offset-1 dark:ring-offset-slate-900' : ''}`}
                                  aria-expanded={actionsMenuAnchor?.vendorId === v.id}
                                  aria-haspopup="menu"
                                  aria-label={lang === 'ar' ? 'إجراءات' : 'Actions'}
                                  title={lang === 'ar' ? 'إجراءات' : 'Actions'}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    const btn = e.currentTarget
                                    if (actionsMenuAnchor?.vendorId === v.id) {
                                      setActionsMenuAnchor(null)
                                      return
                                    }
                                    setActionsMenuAnchor({ vendorId: v.id, rect: btn.getBoundingClientRect() })
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

      {/* Add/Edit Modal - عرضي (عمودين) مع الدولة والمدينة وكود الدولة */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={closeModal}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">{editing ? t.vendors.editVendor : t.vendors.addVendor}</h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t.vendors.vendorName} *</label>
                  <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t.nameEn}</label>
                  <input type="text" value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none" dir="ltr" placeholder="English name (optional)" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t.vendors.companyName}</label>
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
                          onChange={(e) => {
                            setForm({ ...form, phone: e.target.value })
                            setPhoneError('')
                          }}
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
                          onChange={(e) => {
                            setForm({ ...form, phone: e.target.value })
                            setPhoneError('')
                          }}
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
                      ? 'يظهر المورد في فواتير المشتريات والشاشات المرتبطة فقط للفروع المحددة؛ «كل الفروع» = بدون تقييد.'
                      : 'Vendor appears only in selected branches for purchases; «All branches» = no restriction.'}
                  </p>
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="vend-branch-scope"
                        checked={vendAllBranches}
                        onChange={() => {
                          setVendAllBranches(true)
                          setVendBranchIds([])
                        }}
                        className="text-primary-600 focus:ring-primary-500"
                      />
                      {lang === 'ar' ? 'كل الفروع' : 'All branches'}
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="vend-branch-scope"
                        checked={!vendAllBranches}
                        onChange={() => setVendAllBranches(false)}
                        className="text-primary-600 focus:ring-primary-500"
                      />
                      {lang === 'ar' ? 'فروع محددة' : 'Selected branches'}
                    </label>
                  </div>
                  {!vendAllBranches && (
                    <div className="max-h-32 overflow-y-auto rounded-md border border-slate-200 bg-white p-2 space-y-1">
                      {branchesList.filter((b) => b.is_active).map((b) => (
                        <label key={b.id} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={vendBranchIds.includes(b.id)}
                            onChange={() => toggleVendBranch(b.id)}
                            className="rounded border-slate-300 text-primary-600"
                          />
                          <span>{lang === 'ar' ? b.name : b.name_en || b.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {branchScopeError && <p className="text-xs text-red-600">{branchScopeError}</p>}
                </div>
                <div className="col-span-2 border border-slate-200 rounded-lg p-3 space-y-3 bg-slate-50/50">
                  <label className="block text-sm font-semibold text-slate-700">{t.vendors.linkedAccount}</label>
                  {!editing && (
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="radio" checked={form.auto_create_account} onChange={() => setForm({ ...form, auto_create_account: true, account_id: '' })}
                          className="text-primary-600 focus:ring-primary-500" />
                        {t.vendors.autoCreateAccount}
                      </label>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="radio" checked={!form.auto_create_account} onChange={() => setForm({ ...form, auto_create_account: false })}
                          className="text-primary-600 focus:ring-primary-500" />
                        {t.vendors.selectExistingAccount}
                      </label>
                    </div>
                  )}
                  {form.auto_create_account && !editing ? (
                    <p className="text-xs text-emerald-600 bg-emerald-50 rounded-md px-3 py-2">{t.vendors.accountAutoCreated}</p>
                  ) : (
                    <select value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none">
                      <option value="">{t.vendors.selectAccount}</option>
                      {(accounts ?? []).map((a) => (
                        <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setDeleteTarget(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">{t.msg.confirmDeleteTitle}</h3>
            <p className="text-slate-600 text-sm mb-6">{t.delete} &quot;{deleteTarget.name}&quot;? {t.msg.cannotUndo}</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">{t.cancel}</button>
              <button
                onClick={() => deleteMut.mutate(deleteTarget.id)}
                disabled={deleteMut.isPending}
                className="bg-red-600 hover:bg-red-500 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50 transition-colors"
              >
                {deleteMut.isPending ? t.deleting : t.delete}
              </button>
            </div>
          </div>
        </div>
      )}

      {actionsMenuAnchor &&
        actionsMenuVendor &&
        createPortal(
          <div
            data-vendor-actions-menu
            role="menu"
            dir={isRtl ? 'rtl' : 'ltr'}
            className="fixed z-[300] min-w-[12.5rem] rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg dark:border-slate-600 dark:bg-slate-800"
            style={{
              top: actionsMenuAnchor.rect.bottom + 4,
              left: clampVendorActionsMenuLeft(actionsMenuAnchor.rect, isRtl),
            }}
          >
            {(() => {
              const v = actionsMenuVendor
              const statementPath = vendorAccountStatementPath(v)
              const statementLabel =
                lang === 'ar' ? 'عرض كشف حساب' : 'View account statement'
              const noAccountHint =
                lang === 'ar'
                  ? 'لا يوجد حساب مرتبط لهذا المورد'
                  : 'No linked account for this vendor'
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
                      openEdit(v)
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
                      setDeleteTarget(v)
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
