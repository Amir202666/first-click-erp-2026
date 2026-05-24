import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchBranches, fetchCostCenters, fetchCustomers, fetchQuotations, fetchSettings, fetchTenantUsers, deleteQuotation, convertQuotationToInvoice } from '../../api/tenant'
import type { Branch, CostCenter, Customer, Quotation, PaginatedResponse, QuotationToInvoicePayload } from '../../types'
import { formatAmount } from '../../utils/currency'
import { Plus, MoreVertical, Eye, Edit, Trash2, FileText, Copy, Printer, FileSpreadsheet, Download, Columns3 } from 'lucide-react'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Toast, { type ToastType } from '../../components/ui/Toast'
import { getDefaultDateRange, getReportPeriodRange, formatDisplayDate, type ReportPeriodKey } from '../../utils/date'
import { usePersistedColumnVisibility } from '../../hooks/usePersistedColumnVisibility'
import SearchableSelect, { type SearchableSelectOption } from '../../components/ui/SearchableSelect'
import PageSizeSelect from '../../components/ui/PageSizeSelect'
import ReportFooter from '../../components/ui/ReportFooter'
import { useClientSort } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'

const statusLabels: Record<string, string> = {
  draft: 'مسودة',
  approved: 'معتمد',
  converted: 'تم التحويل',
}

type ColumnKey = 'number' | 'date' | 'customer' | 'vendor' | 'total' | 'status'
const allColumnKeys: ColumnKey[] = ['number', 'date', 'customer', 'vendor', 'total', 'status']
const COLUMN_STORAGE_KEY = 'quotationListVisibleColumns'

export default function QuotationList() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const navigate = useNavigate()
  const locale = 'ar-u-nu-latn'
  const { data: settings } = useQuery({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const fmt = (n: number) => formatAmount(n, { decimal_places: settings?.doc_amount_decimals ?? 2 }, locale)

  const defaultRange = getDefaultDateRange()
  const [statusFilter, setStatusFilter] = useState('')
  const [dateFrom, setDateFrom] = useState(defaultRange.dateFrom)
  const [dateTo, setDateTo] = useState(defaultRange.dateTo)
  const [periodPreset, setPeriodPreset] = useState<ReportPeriodKey | 'custom'>('all')
  const [numberFilter, setNumberFilter] = useState('')
  const [branchIdFilter, setBranchIdFilter] = useState('')
  const [costCenterIdFilter, setCostCenterIdFilter] = useState('')
  const [customerIdFilter, setCustomerIdFilter] = useState('')
  const [createdByFilter, setCreatedByFilter] = useState('')
  const [perPage, setPerPage] = useState(25)
  const [page, setPage] = useState(1)
  const [actionsOpenId, setActionsOpenId] = useState<number | null>(null)
  const [actionsAnchor, setActionsAnchor] = useState<{ top: number; left: number; width: number } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Quotation | null>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [showColumnsMenu, setShowColumnsMenu] = useState(false)
  const columnsMenuRef = useRef<HTMLDivElement | null>(null)
  const [visibleColumns, setVisibleColumns] = usePersistedColumnVisibility(COLUMN_STORAGE_KEY, allColumnKeys)

  const params: Record<string, string> = { per_page: String(perPage), page: String(page) }
  if (statusFilter) params.status = statusFilter
  if (dateFrom) params.date_from = dateFrom
  if (dateTo) params.date_to = dateTo
  if (numberFilter.trim()) params.number = numberFilter.trim()
  if (branchIdFilter) params.branch_id = branchIdFilter
  if (costCenterIdFilter) params.cost_center_id = costCenterIdFilter
  if (customerIdFilter) params.customer_id = customerIdFilter
  if (createdByFilter) params.created_by = createdByFilter

  const { data, isLoading } = useQuery<PaginatedResponse<Quotation>>({
    queryKey: ['quotations', tenantId, statusFilter, dateFrom, dateTo, numberFilter, branchIdFilter, costCenterIdFilter, customerIdFilter, createdByFilter, perPage, page],
    queryFn: () => fetchQuotations(tenantId, Object.keys(params).length ? params : undefined),
    enabled: !!tenantId,
  })

  const queryClient = useQueryClient()
  const closeActionsMenu = useCallback(() => {
    setActionsOpenId(null)
    setActionsAnchor(null)
  }, [])
  const openActionsMenu = useCallback((e: React.MouseEvent, q: Quotation) => {
    e?.stopPropagation()
    const el = e?.currentTarget as HTMLElement
    if (el?.getBoundingClientRect) {
      const rect = el.getBoundingClientRect()
      setActionsAnchor({ top: rect.bottom, left: rect.left, width: rect.width })
    }
    setActionsOpenId(q.id)
  }, [])

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteQuotation(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] })
      setDeleteTarget(null)
      setToast({ message: 'تم الحذف بنجاح', type: 'success' })
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setToast({ message: err?.response?.data?.message ?? 'فشل الحذف', type: 'error' })
    },
  })

  const convertMut = useMutation({
    mutationFn: async ({ id, target }: { id: number; target: 'sales' | 'purchase' }) => {
      const res = await convertQuotationToInvoice(tenantId, id, target)
      return { ...res, target }
    },
    onSuccess: (res: { invoice_payload: QuotationToInvoicePayload; target: 'sales' | 'purchase' }) => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] })
      closeActionsMenu()
      navigate(`/invoices/create?type=${res.target}`, { state: { fromQuotation: res.invoice_payload } })
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setToast({ message: err?.response?.data?.message ?? 'فشل التحويل', type: 'error' })
    },
  })

  const showToast = useCallback((message: string, type: ToastType) => setToast({ message, type }), [])

  const quotations = data?.data ?? []
  const quotationSortColumns = useMemo(
    () => [
      { key: 'number' as ColumnKey, type: 'string' as const, getValue: (q: Quotation) => q.number ?? '' },
      { key: 'date' as ColumnKey, type: 'date' as const, getValue: (q: Quotation) => q.date },
      { key: 'customer' as ColumnKey, type: 'string' as const, getValue: (q: Quotation) => q.customer?.name ?? '' },
      { key: 'vendor' as ColumnKey, type: 'string' as const, getValue: (q: Quotation) => q.vendor?.name ?? '' },
      { key: 'total' as ColumnKey, type: 'number' as const, getValue: (q: Quotation) => q.total ?? 0 },
      { key: 'status' as ColumnKey, type: 'string' as const, getValue: (q: Quotation) => statusLabels[q.status] ?? q.status ?? '' },
    ],
    [],
  )
  const { sort, toggleSort, sortedRows: sortedQuotations } = useClientSort(quotations, quotationSortColumns, {
    locale: lang === 'ar' ? 'ar-u-nu-latn' : 'en-US',
  })
  const total = data?.total ?? 0
  const currentPage = data?.current_page ?? 1
  const lastPage = data?.last_page ?? 1
  const from = total === 0 ? 0 : (currentPage - 1) * perPage + 1
  const to = total === 0 ? 0 : Math.min(currentPage * perPage, total)
  // Match SearchableSelect default control height (h-9) for consistent filter row.
  const filterInputClass = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none h-9 leading-normal bg-white placeholder:text-slate-500'
  const filterCellClass = 'flex flex-col min-w-[160px]'
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
  const showCustomDateFields = periodPreset === 'custom'
  const labelPeriod = lang === 'ar' ? 'الفترة' : 'Period'
  const labelFrom = lang === 'ar' ? 'من تاريخ' : 'From date'
  const labelTo = lang === 'ar' ? 'إلى تاريخ' : 'To date'

  function applyPeriodPreset(preset: ReportPeriodKey | 'custom') {
    setPeriodPreset(preset)
    if (preset !== 'custom') {
      const range = getReportPeriodRange(preset)
      setDateFrom(range.from_date)
      setDateTo(range.to_date)
    }
  }

  function onQuotationDateFromChange(value: string) {
    setDateFrom(value)
    setPeriodPreset('custom')
  }

  function onQuotationDateToChange(value: string) {
    setDateTo(value)
    setPeriodPreset('custom')
  }

  useEffect(() => {
    setPage(1)
  }, [tenantId, statusFilter, dateFrom, dateTo, periodPreset, numberFilter, branchIdFilter, costCenterIdFilter, customerIdFilter, createdByFilter, perPage])

  const { data: branches = [] } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId,
  })
  const { data: costCenters = [] } = useQuery<CostCenter[]>({
    queryKey: ['cost-centers', tenantId],
    queryFn: () => fetchCostCenters(tenantId),
    enabled: !!tenantId,
  })
  const { data: customersData } = useQuery({
    queryKey: ['customers', tenantId, 'quotations-filters', branchIdFilter],
    queryFn: () =>
      fetchCustomers(tenantId, {
        per_page: '500',
        ...(branchIdFilter ? { branch_id: branchIdFilter } : {}),
      }),
    enabled: !!tenantId,
  })
  const customers = (customersData as PaginatedResponse<Customer> | undefined)?.data ?? []
  const { data: tenantUsersData } = useQuery({
    queryKey: ['tenant-users', tenantId],
    queryFn: () => fetchTenantUsers(tenantId),
    enabled: !!tenantId,
  })
  const users = (tenantUsersData as { data?: { id: number; name: string }[] } | undefined)?.data ?? []

  const branchOptions: SearchableSelectOption[] = useMemo(
    () => [
      { value: 0, label: lang === 'ar' ? 'الفرع' : 'Branch' },
      ...(branches as Branch[]).map((b) => ({ value: b.id, label: b.name })),
    ],
    [branches, lang],
  )
  const costCenterOptions: SearchableSelectOption[] = useMemo(
    () => [
      { value: 0, label: lang === 'ar' ? 'مركز التكلفة' : 'Cost center' },
      ...costCenters.map((cc) => ({ value: cc.id, label: cc.name })),
    ],
    [costCenters, lang],
  )
  const customerOptions: SearchableSelectOption[] = useMemo(
    () => [
      { value: 0, label: lang === 'ar' ? 'العميل' : 'Customer' },
      ...customers.map((c) => ({ value: c.id, label: c.name })),
    ],
    [customers, lang],
  )
  const userOptions: SearchableSelectOption[] = useMemo(
    () => [
      { value: 0, label: lang === 'ar' ? 'المستخدم' : 'User' },
      ...users.map((u) => ({ value: u.id, label: u.name })),
    ],
    [users, lang],
  )
  const statusOptions: SearchableSelectOption[] = useMemo(
    () => [
      { value: 0, label: t.status ?? (lang === 'ar' ? 'الحالة' : 'Status') },
      { value: 'draft', label: statusLabels.draft },
      { value: 'approved', label: statusLabels.approved },
      { value: 'converted', label: statusLabels.converted },
    ],
    [t.status, lang],
  )

  function handlePrint() {
    window.print()
  }

  function exportExcel() {
    const activeKeys = allColumnKeys.filter((key) => visibleColumns[key])
    const headers = activeKeys.map((key) => {
      switch (key) {
        case 'number':
          return t.invoices?.invoiceNumber ?? 'رقم العرض'
        case 'date':
          return t.date
        case 'customer':
          return t.invoices?.customer ?? 'العميل'
        case 'vendor':
          return t.invoices?.vendor ?? 'المورد'
        case 'total':
          return t.total
        case 'status':
        default:
          return t.status
      }
    })
    const rows = sortedQuotations.map((q) =>
      activeKeys.map((key) => {
        switch (key) {
          case 'number':
            return q.number
          case 'date':
            return q.date ? formatDisplayDate(q.date) : ''
          case 'customer':
            return q.customer?.name ?? ''
          case 'vendor':
            return q.vendor?.name ?? ''
          case 'total':
            return fmt(q.total ?? 0)
          case 'status':
          default:
            return statusLabels[q.status] ?? q.status
        }
      }),
    )
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `quotations-${dateFrom}-${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!columnsMenuRef.current) return
      if (!columnsMenuRef.current.contains(e.target as Node)) {
        setShowColumnsMenu(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-2">
        <h1 className="text-lg font-semibold text-slate-900 truncate shrink-0">{t.nav?.quotations ?? 'عروض الأسعار'}</h1>
        <div className="flex-1 flex justify-center min-w-0">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-600 shrink-0">{labelPeriod}</span>
              <select
                value={periodPreset}
                onChange={(e) => applyPeriodPreset((e.target.value as ReportPeriodKey | 'custom') || 'all')}
                className="border border-slate-300 rounded-lg px-2.5 h-8 text-sm min-w-[140px] max-w-[200px] box-border bg-white shrink-0 leading-normal"
                title={labelPeriod}
                aria-label={labelPeriod}
              >
                {periodOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {lang === 'ar' ? opt.labelAr : opt.labelEn}
                  </option>
                ))}
              </select>
            </div>
            {showCustomDateFields && (
              <div className="flex flex-wrap items-center gap-2 justify-center">
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-sm text-slate-600 whitespace-nowrap">{labelFrom}</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => onQuotationDateFromChange(e.target.value)}
                    className="border border-slate-300 rounded-lg px-2 h-8 text-sm w-[140px] min-w-[140px] box-border bg-white leading-normal"
                    title={labelFrom}
                    aria-label={labelFrom}
                  />
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-sm text-slate-600 whitespace-nowrap">{labelTo}</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => onQuotationDateToChange(e.target.value)}
                    className="border border-slate-300 rounded-lg px-2 h-8 text-sm w-[140px] min-w-[140px] box-border bg-white leading-normal"
                    title={labelTo}
                    aria-label={labelTo}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="relative flex flex-wrap items-center gap-1.5 no-print shrink-0" ref={columnsMenuRef}>
          <Link
            to="/invoices/quotations/create"
            className="flex items-center gap-1.5 bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors shrink-0"
          >
            <Plus size={16} />
            {lang === 'ar' ? 'إضافة' : 'Add'}
          </Link>
          <div className="shrink-0 w-[110px] min-w-[110px]">
            <PageSizeSelect
              value={perPage}
              onChange={(v) => {
                setPerPage(v)
                setPage(1)
              }}
              showLabel={false}
              ariaLabel={lang === 'ar' ? 'عدد السجلات' : 'Records per page'}
            />
          </div>
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
                  key === 'number'
                    ? t.invoices?.invoiceNumber ?? 'رقم العرض'
                    : key === 'date'
                      ? t.date
                      : key === 'customer'
                        ? t.invoices?.customer ?? 'العميل'
                        : key === 'vendor'
                          ? t.invoices?.vendor ?? 'المورد'
                          : key === 'total'
                            ? t.total
                            : t.status
                return (
                  <label
                    key={key}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      checked={visibleColumns[key]}
                      onChange={() =>
                        setVisibleColumns((prev) => ({
                          ...prev,
                          [key]: !prev[key],
                        }))
                      }
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
            title={t.accounts?.print ?? 'طباعة'}
          >
            <Printer size={16} />
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-[#344054] text-white hover:bg-[#2d3846]"
            title={t.accounts?.exportPdf ?? 'تصدير PDF'}
          >
            <Download size={16} />
          </button>
          <button
            type="button"
            onClick={exportExcel}
            className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-500"
            title={t.accounts?.exportExcel ?? 'تصدير Excel'}
          >
            <FileSpreadsheet size={16} />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2 items-end">
          <div className={filterCellClass} style={{ maxWidth: 190 }}>
            <input type="text" value={numberFilter} onChange={(e) => setNumberFilter(e.target.value)} placeholder={t.invoices?.invoiceNumber ?? 'رقم العرض'} className={filterInputClass} />
          </div>
          <div className={filterCellClass} style={{ maxWidth: 150 }}>
            <SearchableSelect
              options={statusOptions}
              value={statusFilter === '' ? 0 : statusFilter}
              onChange={(v) => setStatusFilter(v === 0 || v === null ? '' : String(v))}
              placeholder={t.status ?? (lang === 'ar' ? 'الحالة' : 'Status')}
              textAlign={isRtl ? 'right' : 'left'}
              matchTriggerWidth
              className="w-full min-w-0"
            />
          </div>
          <div className={filterCellClass}>
            <SearchableSelect
              options={branchOptions}
              value={branchIdFilter === '' ? 0 : Number(branchIdFilter) || 0}
              onChange={(v) => setBranchIdFilter(v === 0 || v === null ? '' : String(v))}
              placeholder={lang === 'ar' ? 'الفرع' : 'Branch'}
              textAlign={isRtl ? 'right' : 'left'}
              matchTriggerWidth
              className="w-full min-w-0"
            />
          </div>
          <div className={filterCellClass}>
            <SearchableSelect
              options={costCenterOptions}
              value={costCenterIdFilter === '' ? 0 : Number(costCenterIdFilter) || 0}
              onChange={(v) => setCostCenterIdFilter(v === 0 || v === null ? '' : String(v))}
              placeholder={lang === 'ar' ? 'مركز التكلفة' : 'Cost center'}
              textAlign={isRtl ? 'right' : 'left'}
              wrapOptions
              matchTriggerWidth
              className="w-full min-w-0"
            />
          </div>
          <div
            className={filterCellClass}
            style={{ gridColumn: 'span 2 / span 2', width: '100%', maxWidth: 520 }}
          >
            <SearchableSelect
              options={customerOptions}
              value={customerIdFilter === '' ? 0 : Number(customerIdFilter) || 0}
              onChange={(v) => setCustomerIdFilter(v === 0 || v === null ? '' : String(v))}
              placeholder={lang === 'ar' ? 'العميل' : 'Customer'}
              textAlign={isRtl ? 'right' : 'left'}
              wrapOptions
              matchTriggerWidth
              className="w-full min-w-0"
            />
          </div>
          <div className={filterCellClass}>
            <SearchableSelect
              options={userOptions}
              value={createdByFilter === '' ? 0 : Number(createdByFilter) || 0}
              onChange={(v) => setCreatedByFilter(v === 0 || v === null ? '' : String(v))}
              placeholder={lang === 'ar' ? 'المستخدم' : 'User'}
              textAlign={isRtl ? 'right' : 'left'}
              matchTriggerWidth
              className="w-full min-w-0"
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
            <table className="w-full text-sm min-w-[700px] table-fixed">
              <thead>
                <tr className="bg-slate-50 text-slate-600">
                  {visibleColumns.number && (
                    <SortableTh
                      label={t.invoices?.invoiceNumber ?? 'رقم العرض'}
                      sortKey="number"
                      sortState={sort}
                      onToggle={toggleSort}
                      className={`${textAlign} p-0 font-medium`}
                    />
                  )}
                  {visibleColumns.date && (
                    <SortableTh label={t.date} sortKey="date" sortState={sort} onToggle={toggleSort} className={`${textAlign} p-0 font-medium`} />
                  )}
                  {visibleColumns.customer && (
                    <SortableTh
                      label={t.invoices?.customer ?? 'العميل'}
                      sortKey="customer"
                      sortState={sort}
                      onToggle={toggleSort}
                      widthClassName="min-w-[240px]"
                      className={`${textAlign} p-0 font-medium`}
                    />
                  )}
                  {visibleColumns.vendor && (
                    <SortableTh
                      label={t.invoices?.vendor ?? 'المورد'}
                      sortKey="vendor"
                      sortState={sort}
                      onToggle={toggleSort}
                      className={`${textAlign} p-0 font-medium`}
                    />
                  )}
                  {visibleColumns.total && (
                    <SortableTh label={t.total} sortKey="total" sortState={sort} onToggle={toggleSort} className={`${textAlign} p-0 font-medium`} />
                  )}
                  {visibleColumns.status && (
                    <SortableTh label={t.status} sortKey="status" sortState={sort} onToggle={toggleSort} className={`${textAlign} p-0 font-medium`} />
                  )}
                  <th className={`${textAlign} px-4 py-2 font-medium w-24`}>{t.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedQuotations.length === 0 ? (
                  <tr>
                    <td colSpan={allColumnKeys.filter((k) => visibleColumns[k]).length + 1} className="text-center py-8 text-slate-400">
                      {t.invoices?.noInvoices ?? 'لا توجد عروض أسعار'}
                    </td>
                  </tr>
                ) : (
                  sortedQuotations.map((q) => (
                    <tr key={q.id} className="hover:bg-slate-50">
                      {visibleColumns.number && (
                        <td className="px-4 py-2 font-mono text-emerald-600 font-medium">{q.number}</td>
                      )}
                      {visibleColumns.date && (
                        <td className="px-4 py-2 text-slate-600">{formatDisplayDate(q.date)}</td>
                      )}
                      {visibleColumns.customer && (
                        <td className="px-4 py-2 text-slate-900 min-w-[240px]">{q.customer?.name ?? '—'}</td>
                      )}
                      {visibleColumns.vendor && (
                        <td className="px-4 py-2 text-slate-900">{q.vendor?.name ?? '—'}</td>
                      )}
                      {visibleColumns.total && (
                        <td className="px-4 py-2 font-medium">{fmt(q.total)}</td>
                      )}
                      {visibleColumns.status && (
                        <td className="px-4 py-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs ${
                              q.status === 'converted'
                                ? 'bg-slate-200 text-slate-700'
                                : q.status === 'approved'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {statusLabels[q.status] ?? q.status}
                          </span>
                        </td>
                      )}
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          onClick={(e) => openActionsMenu(e, q)}
                          className="p-1.5 rounded text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                          title={t.actions}
                        >
                          <MoreVertical size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ReportFooter
        totalCount={total}
        currentPage={currentPage}
        lastPage={lastPage}
        from={from}
        to={to}
        onPageChange={setPage}
        lang={lang}
        isRtl={isRtl}
        recordLabel={lang === 'ar' ? 'عرض' : 'quotation'}
        alwaysShowPaginationBar
        dense
      />

      {/* منطقة الطباعة فقط (نفس تنسيق قيود اليومية) */}
      <div id="quotations-list-print" className="report-print-only" dir={isRtl ? 'rtl' : 'ltr'}>
        <div className="report-print-header">
          {typeof (settings as Record<string, unknown>)?.company_logo === 'string' && String((settings as Record<string, unknown>).company_logo) !== '' && (
            <div className="mb-3">
              <img src={String((settings as Record<string, unknown>).company_logo)} alt="" className="h-14 object-contain" />
            </div>
          )}
          <h2 className="text-xl font-bold text-slate-900 mb-1">
            {String((settings as Record<string, unknown>)?.company_name ?? currentTenant?.name ?? '—')}
          </h2>
          <h3 className="text-lg font-semibold text-slate-800 mt-4 mb-1">{t.nav?.quotations ?? 'عروض الأسعار'}</h3>
          <p className="text-sm text-slate-600">
            {lang === 'ar' ? 'الفترة' : 'Period'}: {dateFrom} — {dateTo}
          </p>
        </div>
        <div className="report-print-table-wrap">
          <table className="report-print-table w-full text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-medium">
                <th className={`${textAlign} px-3 py-2 border-b border-slate-200`}>{t.invoices?.invoiceNumber ?? 'رقم العرض'}</th>
                <th className={`${textAlign} px-3 py-2 border-b border-slate-200`}>{t.date}</th>
                <th className={`${textAlign} px-3 py-2 border-b border-slate-200`}>{t.invoices?.customer ?? 'العميل'}</th>
                <th className={`${textAlign} px-3 py-2 border-b border-slate-200`}>{t.invoices?.vendor ?? 'المورد'}</th>
                <th className="text-end px-3 py-2 border-b border-slate-200 w-28">{t.total}</th>
                <th className={`${textAlign} px-3 py-2 border-b border-slate-200`}>{t.status}</th>
              </tr>
            </thead>
            <tbody>
              {quotations.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-6 text-slate-500">{t.invoices?.noInvoices ?? 'لا توجد عروض أسعار'}</td></tr>
              ) : (
                quotations.map((q) => (
                  <tr key={q.id} className="border-b border-slate-100">
                    <td className={`px-3 py-2 font-mono text-slate-800`}>{q.number}</td>
                    <td className={`px-3 py-2 text-slate-700`}>{q.date ? formatDisplayDate(q.date) : '—'}</td>
                    <td className={`px-3 py-2 text-slate-700`}>{q.customer?.name ?? '—'}</td>
                    <td className={`px-3 py-2 text-slate-700`}>{q.vendor?.name ?? '—'}</td>
                    <td className="text-end px-3 py-2 font-medium tabular-nums">{fmt(q.total ?? 0)}</td>
                    <td className={`px-3 py-2 text-slate-700`}>{statusLabels[q.status] ?? q.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="report-print-footer">
          <span>{lang === 'ar' ? 'تاريخ الطباعة' : 'Print Date'}: {new Date().toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' })}</span>
          <span>{lang === 'ar' ? 'صفحة' : 'Page'} <span className="report-page-num"></span></span>
        </div>
      </div>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #quotations-list-print, #quotations-list-print * { visibility: visible; }
        }
        @media screen {
          #quotations-list-print { display: none !important; }
        }
      `}</style>

      {actionsOpenId != null && actionsAnchor && (() => {
        const openQ = sortedQuotations.find((q) => q.id === actionsOpenId)
        if (!openQ) return null
        const isConverted = openQ.status === 'converted'
        const menuItemClass = 'flex items-center gap-2 px-3 py-2 text-sm w-full text-right'
        const menuContent = (
          <>
            <div className="fixed inset-0 z-[100]" aria-hidden onClick={closeActionsMenu} />
            <div
              dir="rtl"
              className="fixed z-[101] min-w-[200px] max-h-[80vh] overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg py-1"
              style={{ top: Math.min(actionsAnchor.top + 4, window.innerHeight - 320), left: actionsAnchor.left }}
            >
              <Link to={`/invoices/quotations/${openQ.id}`} className={`${menuItemClass} text-slate-700 hover:bg-slate-50`} onClick={closeActionsMenu}>
                <Eye size={14} />
                {(t as any).view ?? 'عرض'}
              </Link>
              <Link to="/invoices/quotations/create" state={{ copyFromQuotationId: openQ.id }} className={`${menuItemClass} text-slate-700 hover:bg-slate-50`} onClick={closeActionsMenu}>
                <Copy size={14} />
                تكرار
              </Link>
              <Link to={`/invoices/quotations/edit/${openQ.id}`} className={`${menuItemClass} text-slate-700 hover:bg-slate-50`} onClick={closeActionsMenu}>
                <Edit size={14} />
                {t.edit}
              </Link>
              <button type="button" onClick={() => { setDeleteTarget(openQ); closeActionsMenu() }} className={`${menuItemClass} text-red-600 hover:bg-red-50`}>
                <Trash2 size={14} />
                {t.delete ?? 'حذف'}
              </button>
              <div className="border-t border-slate-100 my-1" />
              {isConverted ? (
                <span className={`${menuItemClass} text-slate-400 cursor-not-allowed`}>
                  <FileText size={14} />
                  تحويل للبيع
                </span>
              ) : (
                <button type="button" onClick={() => { convertMut.mutate({ id: openQ.id, target: 'sales' }); closeActionsMenu() }} disabled={convertMut.isPending} className={`${menuItemClass} text-slate-700 hover:bg-slate-50 disabled:opacity-50`}>
                  <FileText size={14} />
                  تحويل للبيع
                </button>
              )}
              {isConverted ? (
                <span className={`${menuItemClass} text-slate-400 cursor-not-allowed`}>
                  <FileText size={14} />
                  تحويل لشراء
                </span>
              ) : (
                <button type="button" onClick={() => { convertMut.mutate({ id: openQ.id, target: 'purchase' }); closeActionsMenu() }} disabled={convertMut.isPending} className={`${menuItemClass} text-slate-700 hover:bg-slate-50 disabled:opacity-50`}>
                  <FileText size={14} />
                  تحويل لشراء
                </button>
              )}
            </div>
          </>
        )
        return createPortal(menuContent, document.body)
      })()}

      {deleteTarget && (
        <ConfirmDialog
          title={t.delete ?? 'حذف'}
          message={`هل تريد حذف عرض السعر ${deleteTarget.number}؟`}
          confirmLabel={t.delete ?? 'حذف'}
          variant="danger"
          isLoading={deleteMut.isPending}
          onConfirm={() => deleteMut.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  )
}
