import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchPurchaseRequests,
  fetchSettings,
  fetchBranches,
  fetchWarehouses,
  fetchVendors,
  deletePurchaseRequest,
  convertPurchaseRequestToInvoice,
} from '../../api/tenant'
import type { PurchaseRequest, PaginatedResponse, PurchaseRequestToInvoicePayload } from '../../types'
import { formatAmount } from '../../utils/currency'
import { Plus, MoreVertical, Edit, Trash2, FileText, FileSpreadsheet, Printer, Columns3 } from 'lucide-react'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Toast, { type ToastType } from '../../components/ui/Toast'
import SearchableSelect, { type SearchableSelectOption } from '../../components/ui/SearchableSelect'
import { getDefaultDateRange, getReportPeriodRange, formatDisplayDate, type ReportPeriodKey } from '../../utils/date'
import { usePersistedColumnVisibility } from '../../hooks/usePersistedColumnVisibility'
import { useClientSort } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'

const LIST_PAGE_SIZE = 50

function toList<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[]
  if (res && typeof res === 'object' && 'data' in res) {
    const d = (res as { data: unknown }).data
    return Array.isArray(d) ? (d as T[]) : []
  }
  return []
}

export default function PurchaseRequestList() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const navigate = useNavigate()
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const defaultRange = getDefaultDateRange()
  const [dateFrom, setDateFrom] = useState(defaultRange.dateFrom ?? '')
  const [dateTo, setDateTo] = useState(defaultRange.dateTo ?? '')
  const [periodPreset, setPeriodPreset] = useState<ReportPeriodKey | 'custom'>('all')
  const [branchId, setBranchId] = useState<string>('')
  const [warehouseId, setWarehouseId] = useState<string>('')
  const [vendorId, setVendorId] = useState<string>('')
  const [numberFilter, setNumberFilter] = useState('')
  const [actionsOpenId, setActionsOpenId] = useState<number | null>(null)
  const [actionsAnchor, setActionsAnchor] = useState<{ top: number; left: number; width: number } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PurchaseRequest | null>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)

  type ColumnKey = 'number' | 'date' | 'vendor' | 'branch' | 'warehouse' | 'total' | 'actions'
  type PrSortKey = Exclude<ColumnKey, 'actions'>
  const allColumnKeys: ColumnKey[] = ['number', 'date', 'vendor', 'branch', 'warehouse', 'total', 'actions']
  const COLUMN_STORAGE_KEY = 'purchaseRequestListVisibleColumns'
  const [visibleColumns, setVisibleColumns] = usePersistedColumnVisibility(COLUMN_STORAGE_KEY, allColumnKeys)
  const [showColumnsMenu, setShowColumnsMenu] = useState(false)
  const columnsMenuRef = useRef<HTMLDivElement | null>(null)

  const { data: settings } = useQuery({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const fmt = (n: number) => formatAmount(n, { decimal_places: (settings as { doc_amount_decimals?: number })?.doc_amount_decimals ?? 2 }, locale)

  const params: Record<string, string> = {}
  if (dateFrom) params.from_date = dateFrom
  if (dateTo) params.to_date = dateTo
  if (branchId) params.branch_id = branchId
  if (warehouseId) params.warehouse_id = warehouseId
  if (vendorId) params.vendor_id = vendorId
  if (numberFilter.trim()) params.number = numberFilter.trim()

  const { data, isLoading } = useQuery<PaginatedResponse<PurchaseRequest>>({
    queryKey: ['purchase-requests', tenantId, params],
    queryFn: () => fetchPurchaseRequests(tenantId, Object.keys(params).length ? params : undefined),
    enabled: !!tenantId,
  })

  const { data: branchesData } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId,
  })
  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses', tenantId],
    queryFn: () => fetchWarehouses(tenantId, { per_page: String(LIST_PAGE_SIZE) }),
    enabled: !!tenantId,
  })
  const { data: vendorsData } = useQuery({
    queryKey: ['vendors', tenantId, LIST_PAGE_SIZE],
    queryFn: () => fetchVendors(tenantId, { per_page: String(LIST_PAGE_SIZE) }),
    enabled: !!tenantId,
  })
  const branches = toList<{ id: number; name: string; code?: string }>(branchesData)
  const warehouses = toList<{ id: number; name: string; code?: string }>(warehousesData)
  const vendors = toList<{ id: number; name: string }>(vendorsData)

  const branchOptions: SearchableSelectOption[] = useMemo(() => {
    return [
      { value: '', label: lang === 'ar' ? 'الفرع' : 'Branch' },
      ...branches.map((b) => ({ value: b.id, label: b.code ? `${b.code} - ${b.name}` : b.name })),
    ]
  }, [branches, lang])
  const warehouseOptions: SearchableSelectOption[] = useMemo(() => {
    return [
      { value: '', label: lang === 'ar' ? 'المخزن' : 'Warehouse' },
      ...warehouses.map((w) => ({ value: w.id, label: w.code ? `${w.code} - ${w.name}` : w.name })),
    ]
  }, [warehouses, lang])
  const vendorOptions: SearchableSelectOption[] = useMemo(() => {
    return [
      { value: '', label: lang === 'ar' ? 'المورد' : 'Vendor' },
      ...vendors.map((v) => ({ value: v.id, label: v.name })),
    ]
  }, [vendors, lang])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!columnsMenuRef.current?.contains(e.target as Node)) setShowColumnsMenu(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const queryClient = useQueryClient()
  const closeActionsMenu = useCallback(() => {
    setActionsOpenId(null)
    setActionsAnchor(null)
  }, [])
  const openActionsMenu = useCallback((e: React.MouseEvent, pr: PurchaseRequest) => {
    e?.stopPropagation()
    const el = e?.currentTarget as HTMLElement
    if (el?.getBoundingClientRect) {
      const rect = el.getBoundingClientRect()
      setActionsAnchor({ top: rect.bottom, left: rect.left, width: rect.width })
    }
    setActionsOpenId(pr.id)
  }, [])

  const deleteMut = useMutation({
    mutationFn: (id: number) => deletePurchaseRequest(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-requests'] })
      setDeleteTarget(null)
      setToast({ message: lang === 'ar' ? 'تم الحذف بنجاح' : 'Deleted successfully', type: 'success' })
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setToast({ message: err?.response?.data?.message ?? (lang === 'ar' ? 'فشل الحذف' : 'Delete failed'), type: 'error' })
    },
  })

  const convertMut = useMutation({
    mutationFn: (id: number) => convertPurchaseRequestToInvoice(tenantId, id),
    onSuccess: (res: { invoice_payload: PurchaseRequestToInvoicePayload }) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-requests'] })
      closeActionsMenu()
      navigate('/invoices/create?type=purchase', { state: { fromPurchaseRequest: res.invoice_payload } })
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setToast({ message: err?.response?.data?.message ?? (lang === 'ar' ? 'فشل التحويل' : 'Convert failed'), type: 'error' })
    },
  })

  const list = data?.data ?? []
  const sortColumns = useMemo(
    () => [
      { key: 'number' as PrSortKey, type: 'string' as const, getValue: (pr: PurchaseRequest) => pr.number ?? '' },
      { key: 'date' as PrSortKey, type: 'date' as const, getValue: (pr: PurchaseRequest) => pr.date },
      { key: 'vendor' as PrSortKey, type: 'string' as const, getValue: (pr: PurchaseRequest) => pr.vendor?.name ?? '' },
      { key: 'branch' as PrSortKey, type: 'string' as const, getValue: (pr: PurchaseRequest) => pr.branch?.name ?? '' },
      { key: 'warehouse' as PrSortKey, type: 'string' as const, getValue: (pr: PurchaseRequest) => pr.warehouse?.name ?? '' },
      { key: 'total' as PrSortKey, type: 'number' as const, getValue: (pr: PurchaseRequest) => pr.total ?? 0 },
    ],
    [],
  )
  const { sort, toggleSort, sortedRows } = useClientSort<PurchaseRequest, PrSortKey>(list, sortColumns, {
    locale: lang === 'ar' ? 'ar-u-nu-latn' : 'en-US',
  })
  const filterInputClass = 'w-full border border-slate-300 rounded-lg px-2.5 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none h-10 min-w-0'
  const filterCellClass = 'flex flex-col min-w-[280px] max-w-[420px] flex-1 basis-[280px]'
  const textAlign = isRtl ? 'text-right' : 'text-left'

  const periodOptions: { value: ReportPeriodKey | 'custom'; labelAr: string; labelEn: string }[] = [
    { value: 'all', labelAr: 'الكل', labelEn: 'All' },
    { value: 'custom', labelAr: 'تاريخ مخصص', labelEn: 'Custom Date' },
    { value: 'today', labelAr: 'اليوم', labelEn: 'Today' },
    { value: 'yesterday', labelAr: 'الأمس', labelEn: 'Yesterday' },
    { value: 'this_week', labelAr: 'هذا الأسبوع', labelEn: 'This Week' },
    { value: 'last_week', labelAr: 'الأسبوع السابق', labelEn: 'Last Week' },
    { value: 'this_month', labelAr: 'هذا الشهر', labelEn: 'This Month' },
    { value: 'last_month', labelAr: 'الشهر السابق', labelEn: 'Last Month' },
    { value: 'this_year', labelAr: 'هذه السنة', labelEn: 'This Year' },
  ]

  function applyPeriodPreset(preset: ReportPeriodKey | 'custom') {
    setPeriodPreset(preset)
    if (preset !== 'custom') {
      const range = getReportPeriodRange(preset)
      setDateFrom(range.from_date)
      setDateTo(range.to_date)
    }
  }

  const showCustomDateFields = periodPreset === 'custom'
  const labelPeriod = lang === 'ar' ? 'الفترة' : 'Period'
  const labelFrom = lang === 'ar' ? 'من تاريخ' : 'From date'
  const labelTo = lang === 'ar' ? 'إلى تاريخ' : 'To date'

  function handlePrint() {
    window.print()
  }

  function exportExcel() {
    const visibleKeys = allColumnKeys.filter((k) => visibleColumns[k])
    const headerLabels: Record<ColumnKey, string> = {
      number: lang === 'ar' ? 'رقم الطلب' : 'Number',
      date: t.date,
      vendor: t.invoices?.vendor ?? 'المورد',
      branch: t.journal?.branch ?? 'الفرع',
      warehouse: t.invoices?.warehouse ?? 'المخزن',
      total: t.total,
      actions: t.actions,
    }
    const headers = visibleKeys.map((k) => headerLabels[k])
    const rows = sortedRows.map((pr) =>
      visibleKeys.map((k) => {
        if (k === 'number') return pr.number
        if (k === 'date') return pr.date ? formatDisplayDate(pr.date) : ''
        if (k === 'vendor') return pr.vendor?.name ?? ''
        if (k === 'branch') return pr.branch?.name ?? ''
        if (k === 'warehouse') return pr.warehouse?.name ?? ''
        if (k === 'total') return fmt(pr.total ?? 0)
        return ''
      })
    )
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `purchase-requests-${dateFrom}-${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-4 space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-bold text-slate-900 shrink-0">{t.nav?.purchaseRequests ?? 'طلبات الشراء'}</h1>

          {/* فلتر الفترة في منتصف الشريط */}
          <div className="flex-1 flex justify-center min-w-0">
            <div className="flex flex-wrap items-center justify-center gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-slate-600 shrink-0">{labelPeriod}</span>
                <select
                  value={periodPreset}
                  onChange={(e) => applyPeriodPreset((e.target.value as ReportPeriodKey | 'custom') || 'all')}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm min-w-[140px] max-w-[200px] box-border bg-white shrink-0"
                  title={labelPeriod}
                >
                  {periodOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {lang === 'ar' ? opt.labelAr : opt.labelEn}
                    </option>
                  ))}
                </select>
              </div>
              {showCustomDateFields && (
                <div className="flex flex-wrap items-center gap-3 justify-center">
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-sm text-slate-600 whitespace-nowrap">{labelFrom}</span>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-[140px] min-w-[140px] box-border"
                      title={labelFrom}
                    />
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-sm text-slate-600 whitespace-nowrap">{labelTo}</span>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-[140px] min-w-[140px] box-border"
                      title={labelTo}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* إضافة طلب شراء، تخصيص الأعمدة، ثم أزرار الطباعة والتصدير */}
          <div className="relative flex items-center gap-1.5 no-print shrink-0" ref={columnsMenuRef}>
              <Link
                to="/purchase-requests/create"
                className="flex items-center gap-1.5 bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-3 py-2 text-sm font-medium shrink-0"
              >
                <Plus size={16} />
                {lang === 'ar' ? 'إضافة' : 'Add'}
              </Link>
              <button
                type="button"
                onClick={() => setShowColumnsMenu((v) => !v)}
                className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-white border border-slate-300 text-slate-600 hover:bg-slate-50"
                title={lang === 'ar' ? 'تخصيص الأعمدة' : 'Customize columns'}
              >
                <Columns3 size={16} />
              </button>
              {showColumnsMenu && (
                <div className="absolute top-full right-0 mt-2 z-20 w-56 rounded-lg border border-slate-200 bg-white shadow-lg py-2 text-sm">
                  <div className="px-3 pb-2 text-xs font-semibold text-slate-500">
                    {lang === 'ar' ? 'إظهار/إخفاء الأعمدة' : 'Show / hide columns'}
                  </div>
                  {allColumnKeys.map((key) => {
                    const label =
                      key === 'number' ? (lang === 'ar' ? 'رقم الطلب' : 'Number')
                      : key === 'date' ? t.date
                      : key === 'vendor' ? (t.invoices?.vendor ?? 'المورد')
                      : key === 'branch' ? (t.journal?.branch ?? 'الفرع')
                      : key === 'warehouse' ? (t.invoices?.warehouse ?? 'المخزن')
                      : key === 'total' ? t.total
                      : t.actions
                    return (
                      <label key={key} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={visibleColumns[key]}
                          onChange={() => setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }))}
                          className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                        />
                        <span className="text-slate-700 text-xs">{label}</span>
                      </label>
                    )
                  })}
                </div>
              )}
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-[#F0F2F5] border border-[#D9DCE0] text-[#344054] hover:bg-[#E4E7EB]"
                title={t.accounts?.print ?? t.payments?.printReport ?? 'طباعة'}
              >
                <Printer size={16} />
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-[#344054] text-white hover:bg-[#2d3846]"
                title={t.accounts?.exportPdf ?? t.payments?.exportPdf ?? 'تصدير PDF'}
              >
                <FileText size={16} />
              </button>
              <button
                type="button"
                onClick={exportExcel}
                className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-500"
                title={t.accounts?.exportExcel ?? t.payments?.exportExcel ?? 'تصدير Excel'}
              >
                <FileSpreadsheet size={16} />
              </button>
            </div>
          </div>
        </div>

      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className={filterCellClass}>
            <SearchableSelect
              options={branchOptions}
              value={branchId}
              onChange={(v) => setBranchId(v === '' || v === null ? '' : String(v))}
              placeholder={lang === 'ar' ? 'الفرع' : 'Branch'}
              textAlign={isRtl ? 'right' : 'left'}
              wrapOptions
              className="w-full"
            />
          </div>
          <div className={filterCellClass}>
            <SearchableSelect
              options={warehouseOptions}
              value={warehouseId}
              onChange={(v) => setWarehouseId(v === '' || v === null ? '' : String(v))}
              placeholder={lang === 'ar' ? 'المخزن' : 'Warehouse'}
              textAlign={isRtl ? 'right' : 'left'}
              wrapOptions
              className="w-full"
            />
          </div>
          <div className={filterCellClass}>
            <SearchableSelect
              options={vendorOptions}
              value={vendorId}
              onChange={(v) => setVendorId(v === '' || v === null ? '' : String(v))}
              placeholder={lang === 'ar' ? 'المورد' : 'Vendor'}
              textAlign={isRtl ? 'right' : 'left'}
              wrapOptions
              className="w-full"
            />
          </div>
          <div className={filterCellClass}>
            <input
              type="text"
              value={numberFilter}
              onChange={(e) => setNumberFilter(e.target.value)}
              placeholder={lang === 'ar' ? 'رقم الطلب' : 'Number'}
              className={filterInputClass}
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px] table-fixed">
              <thead>
                <tr className="bg-slate-50 text-slate-600">
                  {visibleColumns.number && (
                    <SortableTh
                      label={lang === 'ar' ? 'رقم الطلب' : 'Number'}
                      sortKey="number"
                      sortState={sort}
                      onToggle={toggleSort}
                      widthClassName="min-w-[120px]"
                      className={`${textAlign} p-0 font-medium`}
                    />
                  )}
                  {visibleColumns.date && (
                    <SortableTh
                      label={t.date}
                      sortKey="date"
                      sortState={sort}
                      onToggle={toggleSort}
                      widthClassName="min-w-[100px]"
                      className={`${textAlign} p-0 font-medium`}
                    />
                  )}
                  {visibleColumns.vendor && (
                    <SortableTh
                      label={t.invoices?.vendor ?? 'المورد'}
                      sortKey="vendor"
                      sortState={sort}
                      onToggle={toggleSort}
                      widthClassName="min-w-[180px]"
                      className={`${textAlign} p-0 font-medium`}
                    />
                  )}
                  {visibleColumns.branch && (
                    <SortableTh
                      label={t.journal?.branch ?? 'الفرع'}
                      sortKey="branch"
                      sortState={sort}
                      onToggle={toggleSort}
                      widthClassName="min-w-[160px]"
                      className={`${textAlign} p-0 font-medium`}
                    />
                  )}
                  {visibleColumns.warehouse && (
                    <SortableTh
                      label={t.invoices?.warehouse ?? 'المخزن'}
                      sortKey="warehouse"
                      sortState={sort}
                      onToggle={toggleSort}
                      widthClassName="min-w-[160px]"
                      className={`${textAlign} p-0 font-medium`}
                    />
                  )}
                  {visibleColumns.total && (
                    <SortableTh
                      label={t.total}
                      sortKey="total"
                      sortState={sort}
                      onToggle={toggleSort}
                      widthClassName="min-w-[100px]"
                      className={`${textAlign} p-0 font-medium`}
                    />
                  )}
                  {visibleColumns.actions && <th className={`${textAlign} px-4 py-3 font-medium w-24`}>{t.actions}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={allColumnKeys.filter((k) => visibleColumns[k]).length || 1} className="px-4 py-12 text-center text-slate-500">
                      {lang === 'ar' ? 'لا توجد طلبات شراء' : 'No purchase requests'}
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((pr) => (
                    <tr key={pr.id} className="hover:bg-slate-50">
                      {visibleColumns.number && <td className={`px-4 py-3 font-medium text-slate-800 min-w-[120px] ${textAlign}`}>{pr.number}</td>}
                      {visibleColumns.date && <td className={`px-4 py-3 text-slate-600 min-w-[100px] ${textAlign}`}>{pr.date ? formatDisplayDate(pr.date) : ''}</td>}
                      {visibleColumns.vendor && <td className={`px-4 py-3 text-slate-700 min-w-[180px] max-w-[280px] truncate ${textAlign}`} title={pr.vendor?.name}>{pr.vendor?.name ?? '—'}</td>}
                      {visibleColumns.branch && <td className={`px-4 py-3 text-slate-700 min-w-[160px] max-w-[240px] truncate ${textAlign}`} title={pr.branch?.name}>{pr.branch?.name ?? '—'}</td>}
                      {visibleColumns.warehouse && <td className={`px-4 py-3 text-slate-700 min-w-[160px] max-w-[240px] truncate ${textAlign}`} title={pr.warehouse?.name}>{pr.warehouse?.name ?? '—'}</td>}
                      {visibleColumns.total && <td className={`px-4 py-3 font-semibold tabular-nums min-w-[100px] ${textAlign}`} dir="ltr">{fmt(pr.total ?? 0)}</td>}
                      {visibleColumns.actions && (
                        <td className="px-4 py-3 w-24">
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={(e) => openActionsMenu(e, pr)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600" title={t.actions}>
                              <MoreVertical size={16} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {actionsOpenId !== null && actionsAnchor && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeActionsMenu} aria-hidden />
          <div
            className="fixed z-50 bg-white rounded-lg border border-slate-200 shadow-lg py-1 min-w-[180px]"
            style={{ top: actionsAnchor.top + 4, left: actionsAnchor.left }}
          >
            <Link
              to={`/purchase-requests/edit/${actionsOpenId}`}
              onClick={closeActionsMenu}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left"
            >
              <Edit size={16} />
              {t.edit}
            </Link>
            <button
              type="button"
              onClick={() => { convertMut.mutate(actionsOpenId); }}
              disabled={convertMut.isPending}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 text-left"
            >
              <FileText size={16} />
              {lang === 'ar' ? 'تحويل لفاتورة مشتريات' : 'Convert to Purchase Invoice'}
            </button>
            <button
              type="button"
              onClick={() => { setDeleteTarget(list.find((pr) => pr.id === actionsOpenId) ?? null); closeActionsMenu(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 text-left"
            >
              <Trash2 size={16} />
              {t.delete}
            </button>
          </div>
        </>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={t.delete}
          message={lang === 'ar' ? `حذف طلب الشراء ${deleteTarget.number}؟` : `Delete purchase request ${deleteTarget.number}?`}
          onConfirm={() => deleteMut.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
