import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchInvoices, deleteInvoice, fetchInvoice, fetchCustomers, fetchVendors, fetchSettings, fetchBranches, fetchCostCenters, fetchTenantUsers } from '../../api/tenant'
import type { Invoice, PaginatedResponse } from '../../types'
import { coerceDecimalPlaces, formatAmount } from '../../utils/currency'
import { Plus, Edit, ChevronDown, ChevronLeft, Trash2, MoreVertical, Eye, Printer, FileSpreadsheet, Download, Columns3 } from 'lucide-react'
import Toast, { type ToastType } from '../../components/ui/Toast'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import AlertDialog from '../../components/ui/AlertDialog'
import { getDefaultDateRange, getReportPeriodRange, formatDisplayDate, type ReportPeriodKey } from '../../utils/date'
import SearchableSelect, { type SearchableSelectOption } from '../../components/ui/SearchableSelect'
import PageSizeSelect from '../../components/ui/PageSizeSelect'
import ReportFooter from '../../components/ui/ReportFooter'
import { useClientSort } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'

const statusStyles: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  sent: 'bg-blue-100 text-blue-700',
  posted: 'bg-blue-100 text-blue-700',
  paid: 'bg-emerald-100 text-emerald-700',
  partial: 'bg-amber-100 text-amber-700',
  cancelled: 'bg-red-100 text-red-700',
}

interface ReturnsListPageProps {
  returnType: 'sales' | 'purchase'
}

export default function ReturnsListPage({ returnType }: ReturnsListPageProps) {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()
  const locale = 'ar-u-nu-latn'
  const textAlign = isRtl ? 'text-right' : 'text-left'
  const { data: settings } = useQuery({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const fmt = (n: number) => formatAmount(n, { decimal_places: coerceDecimalPlaces(settings?.doc_amount_decimals, 2) }, locale)
  const qtyDecimals = coerceDecimalPlaces(settings?.doc_quantity_decimals, 2)
  const fmtQty = (n: number) => Number(n).toLocaleString(locale, { minimumFractionDigits: qtyDecimals, maximumFractionDigits: qtyDecimals })

  const defaultRange = getDefaultDateRange()
  const [dateFrom, setDateFrom] = useState(defaultRange.dateFrom)
  const [dateTo, setDateTo] = useState(defaultRange.dateTo)
  const [periodPreset, setPeriodPreset] = useState<ReportPeriodKey | 'custom'>('all')
  const [numberFilter, setNumberFilter] = useState('')
  const [partnerId, setPartnerId] = useState('')
  const [branchIdFilter, setBranchIdFilter] = useState('')
  const [costCenterIdFilter, setCostCenterIdFilter] = useState('')
  const [createdByFilter, setCreatedByFilter] = useState('')
  type SalesSource = 'regular' | 'pos' | 'restaurant'
  const [salesSourceFilter, setSalesSourceFilter] = useState<SalesSource | ''>('')
  const [perPage, setPerPage] = useState(25)
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null)
  const [paymentWarningMessage, setPaymentWarningMessage] = useState<string | null>(null)
  const [actionsOpenId, setActionsOpenId] = useState<number | null>(null)
  const [actionsAnchor, setActionsAnchor] = useState<{ top: number; left: number; width: number } | null>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)

  type ColumnKey = 'number' | 'date' | 'source' | 'partner' | 'warehouse' | 'total' | 'balance' | 'status'
  const allColumnKeys: ColumnKey[] = ['number', 'date', 'source', 'partner', 'warehouse', 'total', 'balance', 'status']
  const columnsStorageKey = useMemo(() => `erp.returnsList.visibleColumns.v1.${tenantId}.${returnType}`, [tenantId, returnType])
  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnKey, boolean>>(() =>
    allColumnKeys.reduce((acc, k) => ({ ...acc, [k]: true }), {} as Record<ColumnKey, boolean>)
  )
  const [showColumnsMenu, setShowColumnsMenu] = useState(false)
  const columnsMenuRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(columnsStorageKey)
      if (!raw) return
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const next = { ...visibleColumns }
      for (const k of allColumnKeys) {
        if (typeof parsed[k] === 'boolean') next[k] = parsed[k] as boolean
      }
      if (allColumnKeys.some((k) => next[k])) setVisibleColumns(next)
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnsStorageKey])
  useEffect(() => {
    try {
      localStorage.setItem(columnsStorageKey, JSON.stringify(visibleColumns))
    } catch {
      /* ignore */
    }
  }, [columnsStorageKey, visibleColumns])
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!columnsMenuRef.current) return
      if (!columnsMenuRef.current.contains(e.target as Node)) setShowColumnsMenu(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const closeActionsMenu = useCallback(() => {
    setActionsOpenId(null)
    setActionsAnchor(null)
  }, [])

  const showToast = useCallback((message: string, type: ToastType) => setToast({ message, type }), [])

  const params: Record<string, string> = {
    is_return: '1',
    type: returnType,
    date_from: dateFrom,
    date_to: dateTo,
    per_page: String(perPage),
    page: String(page),
  }
  if (numberFilter.trim()) params.number = numberFilter.trim()
  if (partnerId) {
    if (returnType === 'sales') params.customer_id = partnerId
    else params.vendor_id = partnerId
  }
  if (branchIdFilter) params.branch_id = branchIdFilter
  if (costCenterIdFilter) params.cost_center_id = costCenterIdFilter
  if (createdByFilter) params.created_by = createdByFilter

  const { data, isLoading } = useQuery<PaginatedResponse<Invoice>>({
    queryKey: ['invoices', tenantId, 'returns', returnType, dateFrom, dateTo, numberFilter, partnerId, branchIdFilter, costCenterIdFilter, createdByFilter, perPage, page],
    queryFn: ({ signal }) => fetchInvoices(tenantId, params, signal),
    enabled: !!tenantId,
  })

  const { data: customersPartners } = useQuery({
    queryKey: ['customers', tenantId, 'returns-filter'],
    queryFn: () => fetchCustomers(tenantId, { per_page: '200' }),
    enabled: !!tenantId && returnType === 'sales',
  })
  const { data: vendorsPartners } = useQuery({
    queryKey: ['vendors', tenantId, 'returns-filter'],
    queryFn: () => fetchVendors(tenantId, { per_page: '200' }),
    enabled: !!tenantId && returnType === 'purchase',
  })

  const partners = (returnType === 'sales' ? customersPartners?.data : vendorsPartners?.data) ?? []

  const { data: branches = [] } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId,
  })
  const { data: costCenters = [] } = useQuery({
    queryKey: ['cost-centers', tenantId],
    queryFn: () => fetchCostCenters(tenantId),
    enabled: !!tenantId,
  })
  const { data: tenantUsersData } = useQuery({
    queryKey: ['tenant-users', tenantId],
    queryFn: () => fetchTenantUsers(tenantId),
    enabled: !!tenantId,
  })
  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteInvoice(tenantId, id),
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.setQueriesData(
        { queryKey: ['invoices'] },
        (old: PaginatedResponse<Invoice> | undefined) => {
          if (!old?.data) return old
          return { ...old, data: old.data.filter((inv) => inv.id !== deletedId) }
        }
      )
      setDeleteTarget(null)
      closeActionsMenu()
      showToast(t.msg.deletedSuccess, 'success')
    },
    onError: (err: any) => {
      setDeleteTarget(null)
      const msg = err?.response?.data?.message ?? t.msg.deleteError
      if (typeof msg === 'string' && (msg.includes('أرقام السندات') || msg.includes('سند'))) {
        setPaymentWarningMessage(msg)
      } else {
        showToast(msg, 'error')
      }
    },
  })

  function salesInvoiceSource(inv: Invoice): SalesSource {
    const anyInv = inv as Invoice & { is_pos?: boolean | number; is_restaurant?: boolean | number }
    if (anyInv.is_restaurant || inv.order_type != null || inv.table_id != null) return 'restaurant'
    if (anyInv.is_pos) return 'pos'
    return 'regular'
  }

  const returnsRaw = data?.data ?? []
  const returns = useMemo(() => {
    if (returnType !== 'sales') return returnsRaw
    if (!salesSourceFilter) return returnsRaw
    return returnsRaw.filter((inv) => salesInvoiceSource(inv) === salesSourceFilter)
  }, [returnsRaw, returnType, salesSourceFilter])

  const returnSortColumns = useMemo(
    () => [
      { key: 'number' as ColumnKey, type: 'string' as const, getValue: (inv: Invoice) => inv.number ?? '' },
      { key: 'date' as ColumnKey, type: 'date' as const, getValue: (inv: Invoice) => inv.date },
      { key: 'source' as ColumnKey, type: 'string' as const, getValue: (inv: Invoice) => salesInvoiceSource(inv) },
      {
        key: 'partner' as ColumnKey,
        type: 'string' as const,
        getValue: (inv: Invoice) => (returnType === 'sales' ? inv.customer?.name : inv.vendor?.name) ?? '',
      },
      { key: 'warehouse' as ColumnKey, type: 'string' as const, getValue: (inv: Invoice) => inv.warehouse?.name ?? '' },
      { key: 'total' as ColumnKey, type: 'number' as const, getValue: (inv: Invoice) => Number(inv.total ?? 0) },
      { key: 'balance' as ColumnKey, type: 'number' as const, getValue: (inv: Invoice) => Number(inv.balance ?? 0) },
      { key: 'status' as ColumnKey, type: 'string' as const, getValue: (inv: Invoice) => inv.status ?? '' },
    ],
    [returnType],
  )
  const { sort, toggleSort, sortedRows: sortedReturns } = useClientSort(returns, returnSortColumns, {
    locale: lang === 'ar' ? 'ar-u-nu-latn' : 'en-US',
  })

  const summaryTotals = useMemo(() => {
    if (returns.length === 0) return null
    const sumTotal = returns.reduce((s, inv) => s + Number(inv.total ?? 0), 0)
    const sumBalance = returns.reduce((s, inv) => s + Number(inv.balance ?? 0), 0)
    return { sumTotal, sumBalance }
  }, [returns])

  /** عمود التوسيع (1) + الأعمدة الظاهرة قبل الإجمالي — لحساب colSpan في شريط الإجماليات */
  const summaryLabelColSpan =
    1 + (['number', 'date', 'source', 'partner', 'warehouse'] as const).filter((k) => visibleColumns[k]).length

  const total = data?.total ?? 0
  const currentPage = data?.current_page ?? 1
  const lastPage = data?.last_page ?? 1
  const from = total === 0 ? 0 : (currentPage - 1) * perPage + 1
  const to = total === 0 ? 0 : Math.min(currentPage * perPage, total)
  const pageTitle = returnType === 'sales' ? (t.nav?.salesReturns ?? 'مرتجعات المبيعات') : (t.nav?.purchaseReturns ?? 'مرتجعات المشتريات')
  const createPath = returnType === 'sales' ? '/invoices/create?type=sales&is_return=1' : '/invoices/create?type=purchase&is_return=1'

  const statusLabels: Record<string, string> = {
    draft: t.invoices?.statuses?.draft ?? 'مسودة',
    sent: t.invoices?.statuses?.sent ?? 'مرحّل',
    posted: t.invoices?.statuses?.posted ?? 'مرحّل',
    paid: t.invoices?.statuses?.paid ?? 'مدفوعة',
    partial: t.invoices?.statuses?.partial ?? 'جزئي',
    cancelled: t.invoices?.statuses?.cancelled ?? 'ملغاة',
  }

  async function toggleDetail(inv: Invoice) {
    if (expandedId === inv.id) {
      setExpandedId(null)
      setDetailInvoice(null)
      return
    }
    setExpandedId(inv.id)
    try {
      const detail = await fetchInvoice(tenantId, inv.id)
      setDetailInvoice(detail)
    } catch {
      setDetailInvoice(null)
    }
  }

  const openActionsMenu = useCallback((e: React.MouseEvent, inv: Invoice) => {
    e?.stopPropagation()
    const el = e?.currentTarget as HTMLElement
    if (el) {
      const rect = el.getBoundingClientRect()
      setActionsAnchor({ top: rect.bottom, left: rect.left, width: rect.width })
      setActionsOpenId(inv.id)
    }
  }, [])

  /** نفس تخطيط فلاتر صفحة فواتير المبيعات */
  const filterNativeClass =
    'w-full min-w-0 max-w-full h-9 border border-slate-300 rounded-lg py-2 text-sm bg-white box-border focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none ' +
    (isRtl ? 'pl-10 pr-3' : 'pl-3 pr-10')
  /** شريط فلاتر مرن يملأ كامل العرض بدون فراغات */
  const filterRowClass = 'flex w-full flex-wrap items-center gap-2'
  const filterCellBase = 'min-w-0'
  const filterCellCompact = `${filterCellBase} flex-[0_0_150px] min-w-[150px]`
  const filterCellRegular = `${filterCellBase} flex-[1_1_160px] min-w-[160px]`
  const filterCellWide = `${filterCellBase} flex-[3_1_200px] min-w-[200px]`
  const filterCellTiny = `${filterCellBase} flex-[0_0_84px] min-w-[84px]`

  const partnerOptions: SearchableSelectOption[] = [
    { value: 0, label: returnType === 'sales' ? (t.invoices?.customer ?? (lang === 'ar' ? 'العميل' : 'Customer')) : (t.invoices?.vendor ?? (lang === 'ar' ? 'المورد' : 'Vendor')) },
    ...partners.map((p: { id: number; name: string }) => ({ value: p.id, label: p.name })),
  ]
  const branchOptions: SearchableSelectOption[] = [
    { value: 0, label: lang === 'ar' ? 'الفرع' : 'Branch' },
    ...(branches as { id: number; name: string }[]).map((b) => ({ value: b.id, label: b.name })),
  ]
  const costCenterOptions: SearchableSelectOption[] = [
    { value: 0, label: lang === 'ar' ? 'مركز التكلفة' : 'Cost center' },
    ...(costCenters as { id: number; name: string }[]).map((cc) => ({ value: cc.id, label: cc.name })),
  ]
  const usersList = (tenantUsersData as { data?: { id: number; name: string }[] } | undefined)?.data ?? []
  const userOptions: SearchableSelectOption[] = [
    { value: 0, label: lang === 'ar' ? 'المستخدم' : 'User' },
    ...usersList.map((u) => ({ value: u.id, label: u.name })),
  ]
  const sourceOptions: SearchableSelectOption[] = [
    { value: 0, label: lang === 'ar' ? 'النوع' : 'Source' },
    { value: 'regular', label: lang === 'ar' ? 'مبيعات' : 'Sales' },
    { value: 'pos', label: lang === 'ar' ? 'نقاط بيع (POS)' : 'POS' },
    { value: 'restaurant', label: lang === 'ar' ? 'مطعم' : 'Restaurant' },
  ]

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

  function onDateFromChange(value: string) {
    setDateFrom(value)
    setPeriodPreset('custom')
  }

  function onDateToChange(value: string) {
    setDateTo(value)
    setPeriodPreset('custom')
  }

  useEffect(() => {
    setPage(1)
  }, [returnType, dateFrom, dateTo, periodPreset, numberFilter, partnerId, branchIdFilter, costCenterIdFilter, createdByFilter, salesSourceFilter, perPage])

  function handlePrint() {
    window.print()
  }

  function exportExcel() {
    const headers = [t.invoices?.invoiceNumber ?? 'رقم السند', t.date, returnType === 'sales' ? (t.invoices?.customer ?? 'العميل') : (t.invoices?.vendor ?? 'المورد'), t.invoices?.warehouse ?? 'المخزن', t.total, t.invoices?.balance ?? 'الرصيد', t.status]
    const rows = sortedReturns.map((inv) => [
      inv.number,
      inv.date ? formatDisplayDate(inv.date) : '',
      (returnType === 'sales' ? inv.customer?.name : inv.vendor?.name) ?? '',
      inv.warehouse?.name ?? '—',
      fmt(Number(inv.total ?? 0)),
      fmt(Number(inv.balance ?? 0)),
      statusLabels[inv.status] ?? inv.status,
    ])
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `returns-${returnType}-${dateFrom}-${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-3 space-y-3">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-1.5">
        <h1 className="text-lg font-semibold text-slate-900 truncate">{pageTitle}</h1>
        <div className="flex-1 flex justify-center min-w-0">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-600 shrink-0">{labelPeriod}</span>
              <select
                value={periodPreset}
                onChange={(e) => applyPeriodPreset((e.target.value as ReportPeriodKey | 'custom') || 'all')}
                className="border border-slate-300 rounded-lg px-2.5 h-8 text-sm min-w-[140px] max-w-[200px] box-border bg-white shrink-0 leading-normal"
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
              <div className="flex flex-wrap items-center gap-2 justify-center">
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-sm text-slate-600 whitespace-nowrap">{labelFrom}</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => onDateFromChange(e.target.value)}
                    className="border border-slate-300 rounded-lg px-2 h-8 text-sm w-[140px] min-w-[140px] box-border bg-white leading-normal"
                    title={labelFrom}
                  />
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-sm text-slate-600 whitespace-nowrap">{labelTo}</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => onDateToChange(e.target.value)}
                    className="border border-slate-300 rounded-lg px-2 h-8 text-sm w-[140px] min-w-[140px] box-border bg-white leading-normal"
                    title={labelTo}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
        <div
          className="z-[120] flex flex-wrap items-center gap-1.5 no-print shrink-0"
          ref={columnsMenuRef}
        >
          <Link
            to={createPath}
            className="flex items-center gap-1.5 bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors shrink-0"
          >
            <Plus size={16} />
            {t.invoices?.newReturn ?? 'مرتجع جديد'}
          </Link>
          <div className="shrink-0 w-[140px] min-w-[140px]">
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
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setShowColumnsMenu((v) => !v)}
              aria-expanded={showColumnsMenu}
              aria-haspopup="true"
              className={`inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 ${showColumnsMenu ? 'ring-1 ring-slate-300/80' : ''}`}
              title={lang === 'ar' ? 'تخصيص الأعمدة' : 'Customize columns'}
            >
              <Columns3 size={16} />
            </button>
            {showColumnsMenu && (
              <div
                className="absolute top-full end-0 mt-2 z-[130] w-56 rounded-xl border border-slate-200/95 bg-white py-2 text-sm shadow-xl ring-1 ring-slate-200/80"
                role="menu"
                aria-label={lang === 'ar' ? 'إظهار/إخفاء الأعمدة' : 'Show / hide columns'}
              >
                <div className="px-3 pb-2 text-xs font-semibold text-slate-500">
                  {lang === 'ar' ? 'إظهار/إخفاء الأعمدة' : 'Show / hide columns'}
                </div>
                {allColumnKeys.map((key) => {
                  const label =
                    key === 'number'
                      ? (t.invoices?.invoiceNumber ?? 'رقم السند')
                      : key === 'date'
                        ? t.date
                        : key === 'source'
                          ? (lang === 'ar' ? 'النوع' : 'Source')
                        : key === 'partner'
                          ? (returnType === 'sales' ? (t.invoices?.customer ?? 'العميل') : (t.invoices?.vendor ?? 'المورد'))
                          : key === 'warehouse'
                            ? (t.invoices?.warehouse ?? 'المخزن')
                            : key === 'total'
                              ? t.total
                              : key === 'balance'
                                ? (t.invoices?.balance ?? 'الرصيد')
                                : t.status
                  return (
                    <label key={key} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={visibleColumns[key]}
                        onChange={() =>
                          setVisibleColumns((prev) => {
                            const next = { ...prev, [key]: !prev[key] }
                            if (!allColumnKeys.some((k) => next[k])) return prev
                            return next
                          })
                        }
                        className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-slate-700 text-xs">{label}</span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
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

      <div className="bg-white rounded-xl border border-slate-200 p-3">
        <div className={filterRowClass}>
        <div className={filterCellCompact}>
          <input
            type="text"
            placeholder={t.invoices?.documentNumber ?? 'رقم السند'}
            value={numberFilter}
            onChange={(e) => setNumberFilter(e.target.value)}
            className={filterNativeClass}
            style={{ textAlign: isRtl ? 'right' : 'left' }}
          />
        </div>
        <div className={filterCellWide}>
          <SearchableSelect
            options={partnerOptions}
            value={partnerId === '' ? 0 : Number(partnerId) || 0}
            onChange={(v) => setPartnerId(v === 0 || v === null ? '' : String(v))}
            placeholder={returnType === 'sales' ? (t.invoices?.customer ?? 'العميل') : (t.invoices?.vendor ?? 'المورد')}
            textAlign={isRtl ? 'right' : 'left'}
            matchTriggerWidth
            className="w-full min-w-0"
          />
        </div>
        <div className={filterCellRegular}>
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
        <div className={filterCellRegular}>
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
        {returnType === 'sales' && (
          <div className={filterCellRegular}>
            <SearchableSelect
              options={sourceOptions}
              value={salesSourceFilter === '' ? 0 : salesSourceFilter}
              onChange={(v) => setSalesSourceFilter(v === 0 || v === null ? '' : (String(v) as SalesSource))}
              placeholder={lang === 'ar' ? 'النوع' : 'Source'}
              textAlign={isRtl ? 'right' : 'left'}
              wrapOptions
              matchTriggerWidth
              className="w-full min-w-0"
            />
          </div>
        )}
        <div className={filterCellRegular}>
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

      {paymentWarningMessage && (
        <AlertDialog
          title={lang === 'ar' ? 'لا يمكن حذف الفاتورة' : 'Cannot delete invoice'}
          message={paymentWarningMessage}
          confirmLabel={lang === 'ar' ? 'حسناً' : 'OK'}
          variant="warning"
          onClose={() => setPaymentWarningMessage(null)}
        />
      )}

      <div className="bg-white rounded-lg border border-slate-200">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : (
          <div className="w-full overflow-x-auto overflow-y-visible">
            <table className="w-full text-sm min-w-[800px] table-fixed">
              <thead>
                <tr className="bg-slate-50 text-slate-600">
                  <th className={`${textAlign} px-4 py-3 font-medium w-10`}></th>
                  {visibleColumns.number && (
                    <SortableTh
                      label={t.invoices?.invoiceNumber ?? 'رقم السند'}
                      sortKey="number"
                      sortState={sort}
                      onToggle={toggleSort}
                      className={`${textAlign} p-0 font-medium`}
                    />
                  )}
                  {visibleColumns.date && (
                    <SortableTh label={t.date} sortKey="date" sortState={sort} onToggle={toggleSort} className={`${textAlign} p-0 font-medium`} />
                  )}
                  {visibleColumns.source && (
                    <SortableTh
                      label={lang === 'ar' ? 'النوع' : 'Source'}
                      sortKey="source"
                      sortState={sort}
                      onToggle={toggleSort}
                      className={`${textAlign} p-0 font-medium`}
                    />
                  )}
                  {visibleColumns.partner && (
                    <SortableTh
                      label={returnType === 'sales' ? (t.invoices?.customer ?? 'العميل') : (t.invoices?.vendor ?? 'المورد')}
                      sortKey="partner"
                      sortState={sort}
                      onToggle={toggleSort}
                      className={`${textAlign} p-0 font-medium`}
                    />
                  )}
                  {visibleColumns.warehouse && (
                    <SortableTh
                      label={t.invoices?.warehouse ?? 'المخزن'}
                      sortKey="warehouse"
                      sortState={sort}
                      onToggle={toggleSort}
                      className={`${textAlign} p-0 font-medium`}
                    />
                  )}
                  {visibleColumns.total && (
                    <SortableTh label={t.total} sortKey="total" sortState={sort} onToggle={toggleSort} className={`${textAlign} p-0 font-medium`} />
                  )}
                  {visibleColumns.balance && (
                    <SortableTh
                      label={t.invoices?.balance ?? 'الرصيد'}
                      sortKey="balance"
                      sortState={sort}
                      onToggle={toggleSort}
                      className={`${textAlign} p-0 font-medium`}
                    />
                  )}
                  {visibleColumns.status && (
                    <SortableTh label={t.status} sortKey="status" sortState={sort} onToggle={toggleSort} className={`${textAlign} p-0 font-medium`} />
                  )}
                  <th className={`${textAlign} px-4 py-3 font-medium w-28`}>{t.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedReturns.length === 0 ? (
                  <tr>
                    <td colSpan={2 + allColumnKeys.filter((k) => visibleColumns[k]).length} className="text-center py-8 text-slate-400">
                      {t.invoices?.noReturnsYet ?? 'لا توجد مرتجعات مسجلة'}
                    </td>
                  </tr>
                ) : (
                  sortedReturns.map((inv) => (
                    <ReturnsRow
                      key={inv.id}
                      inv={inv}
                      returnType={returnType}
                      isExpanded={expandedId === inv.id}
                      detail={expandedId === inv.id ? detailInvoice : null}
                      onToggle={() => toggleDetail(inv)}
                      onActionsToggle={(e) => openActionsMenu(e, inv)}
                      actionsOpen={actionsOpenId === inv.id}
                      onCloseActions={closeActionsMenu}
                      onDelete={() => { setDeleteTarget(inv); closeActionsMenu() }}
                      fmt={fmt}
                      fmtQty={fmtQty}
                      statusLabels={statusLabels}
                      textAlign={textAlign}
                      t={t}
                      visibleColumns={visibleColumns}
                    />
                  ))
                )}
              </tbody>
              {summaryTotals && (
                <tfoot>
                  <tr className="bg-gradient-to-r from-slate-100 to-slate-50 border-t-2 border-slate-400 font-bold text-slate-900 shadow-[0_-2px_4px_rgba(0,0,0,0.04)]">
                    <td colSpan={summaryLabelColSpan} className={`${textAlign} p-3 text-sm leading-tight`}>
                      {lang === 'ar' ? 'الإجمالي' : 'Total'}
                    </td>
                    {visibleColumns.total && (
                      <td
                        className={`p-3 text-sm tabular-nums font-semibold leading-tight ${isRtl ? 'text-right' : 'text-center'}`}
                        dir="ltr"
                      >
                        {fmt(summaryTotals.sumTotal)}
                      </td>
                    )}
                    {visibleColumns.balance && (
                      <td
                        className={`p-3 text-sm tabular-nums font-semibold leading-tight ${isRtl ? 'text-right' : 'text-center'}`}
                        dir="ltr"
                      >
                        {fmt(summaryTotals.sumBalance)}
                      </td>
                    )}
                    {visibleColumns.status && <td className="p-3" aria-hidden />}
                    <td className="p-3" aria-hidden />
                  </tr>
                </tfoot>
              )}
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
        recordLabel={lang === 'ar' ? 'مرتجع' : 'return'}
        alwaysShowPaginationBar
        dense
      />

      {/* منطقة الطباعة فقط (نفس تنسيق قيود اليومية) */}
      <div id="returns-list-print" className="report-print-only" dir={isRtl ? 'rtl' : 'ltr'}>
        <div className="report-print-header">
          {typeof (settings as Record<string, unknown>)?.company_logo === 'string' &&
            String((settings as Record<string, unknown>).company_logo) !== '' && (
            <div className="mb-3">
              <img src={String((settings as Record<string, unknown>).company_logo)} alt="" className="h-14 object-contain" />
            </div>
          )}
          <h2 className="text-xl font-bold text-slate-900 mb-1">
            {String((settings as Record<string, unknown>)?.company_name ?? currentTenant?.name ?? '—')}
          </h2>
          <h3 className="text-lg font-semibold text-slate-800 mt-4 mb-1">{pageTitle}</h3>
          <p className="text-sm text-slate-600">
            {lang === 'ar' ? 'الفترة' : 'Period'}: {dateFrom} — {dateTo}
          </p>
        </div>
        <div className="report-print-table-wrap">
          <table className="report-print-table w-full text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-medium">
                <th className={`${textAlign} px-3 py-2 border-b border-slate-200`}>{t.invoices?.invoiceNumber ?? 'رقم السند'}</th>
                <th className={`${textAlign} px-3 py-2 border-b border-slate-200`}>{t.date}</th>
                <th className={`${textAlign} px-3 py-2 border-b border-slate-200`}>{returnType === 'sales' ? (t.invoices?.customer ?? 'العميل') : (t.invoices?.vendor ?? 'المورد')}</th>
                <th className={`${textAlign} px-3 py-2 border-b border-slate-200`}>{t.invoices?.warehouse ?? 'المخزن'}</th>
                <th className="text-end px-3 py-2 border-b border-slate-200 w-28">{t.total}</th>
                <th className="text-end px-3 py-2 border-b border-slate-200 w-28">{t.invoices?.balance ?? 'الرصيد'}</th>
                <th className={`${textAlign} px-3 py-2 border-b border-slate-200`}>{t.status}</th>
              </tr>
            </thead>
            <tbody>
              {sortedReturns.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-6 text-slate-500">{t.invoices?.noReturnsYet ?? 'لا توجد مرتجعات مسجلة'}</td></tr>
              ) : (
                sortedReturns.map((inv) => (
                  <tr key={inv.id} className="border-b border-slate-100">
                    <td className={`px-3 py-2 font-mono text-slate-800`}>{inv.number}</td>
                    <td className={`px-3 py-2 text-slate-700`}>{inv.date ? formatDisplayDate(inv.date) : '—'}</td>
                    <td className={`px-3 py-2 text-slate-700`}>{(returnType === 'sales' ? inv.customer?.name : inv.vendor?.name) ?? '—'}</td>
                    <td className={`px-3 py-2 text-slate-700`}>{inv.warehouse?.name ?? '—'}</td>
                    <td className="text-end px-3 py-2 font-medium tabular-nums">{fmt(Number(inv.total ?? 0))}</td>
                    <td className="text-end px-3 py-2 font-medium tabular-nums">{fmt(Number(inv.balance ?? 0))}</td>
                    <td className={`px-3 py-2 text-slate-700`}>{statusLabels[inv.status] ?? inv.status}</td>
                  </tr>
                ))
              )}
            </tbody>
            {summaryTotals && (
              <tfoot>
                <tr className="bg-slate-100 font-bold border-t-2 border-slate-400">
                  <td colSpan={4} className={`px-3 py-2 ${textAlign}`}>
                    {lang === 'ar' ? 'الإجمالي' : 'Total'}
                  </td>
                  <td className="text-end px-3 py-2 tabular-nums">{fmt(summaryTotals.sumTotal)}</td>
                  <td className="text-end px-3 py-2 tabular-nums">{fmt(summaryTotals.sumBalance)}</td>
                  <td className="px-3 py-2" aria-hidden />
                </tr>
              </tfoot>
            )}
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
          #returns-list-print, #returns-list-print * { visibility: visible; }
        }
        @media screen {
          #returns-list-print { display: none !important; }
        }
      `}</style>

      {actionsOpenId != null && actionsAnchor && (() => {
        const openInv = sortedReturns.find((i) => i.id === actionsOpenId)
        if (!openInv) return null
        const canEdit = openInv.status === 'draft' || (openInv.status === 'sent' && (Number(openInv.amount_paid) || 0) === 0)
        const canDelete = (Number(openInv.amount_paid) || 0) === 0
        const menuContent = (
          <>
            <div className="fixed inset-0 z-[100]" aria-hidden onClick={closeActionsMenu} />
            <div
              className="fixed z-[101] min-w-[180px] bg-white border border-slate-200 rounded-lg shadow-lg py-1"
              style={{ top: actionsAnchor.top + 4, left: actionsAnchor.left }}
            >
              <Link to={`/invoices/view/${openInv.id}`} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={closeActionsMenu}>
                <Eye size={14} />
                {t.invoices?.viewPrint ?? 'عرض للطباعة'}
              </Link>
              {canEdit && (
                <Link to={`/invoices/create?type=${openInv.type}&id=${openInv.id}`} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={closeActionsMenu}>
                  <Edit size={14} />
                  {t.edit}
                </Link>
              )}
              <div className="border-t border-slate-100 my-1" />
              <button type="button" onClick={() => { canDelete && (setDeleteTarget(openInv), closeActionsMenu()) }} className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-right ${canDelete ? 'text-red-600 hover:bg-red-50' : 'text-slate-400 cursor-not-allowed'}`} title={!canDelete ? (t.invoices?.cannotDeleteWithPayments ?? 'لا يمكن الحذف عند وجود مدفوعات') : undefined}>
                <Trash2 size={14} />
                {t.invoices?.deleteInvoice ?? 'حذف'}
              </button>
            </div>
          </>
        )
        return createPortal(menuContent, document.body)
      })()}

      {deleteTarget && (
        <ConfirmDialog
          title={t.invoices?.deleteInvoice ?? 'حذف المرتجع'}
          message={(t.invoices?.confirmDeleteInvoice ?? 'هل أنت متأكد من حذف السند "{number}"؟').replace('{number}', deleteTarget.number)}
          confirmLabel={t.delete}
          variant="danger"
          isLoading={deleteMut.isPending}
          onConfirm={() => deleteMut.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}

function ReturnsRow({
  inv,
  returnType,
  isExpanded,
  detail,
  onToggle,
  onActionsToggle,
  actionsOpen,
  onCloseActions,
  onDelete,
  fmt,
  fmtQty,
  statusLabels,
  textAlign,
  t,
  visibleColumns,
}: {
  inv: Invoice
  returnType: 'sales' | 'purchase'
  isExpanded: boolean
  detail: Invoice | null
  onToggle: () => void
  onActionsToggle: (e: React.MouseEvent) => void
  actionsOpen: boolean
  onCloseActions: () => void
  onDelete: () => void
  fmt: (n: number) => string
  fmtQty: (n: number) => string
  statusLabels: Record<string, string>
  textAlign: string
  t: any
  visibleColumns: Record<string, boolean>
}) {
  const canDelete = inv.amount_paid === 0
  const anyInv = inv as Invoice & { is_pos?: boolean | number; is_restaurant?: boolean | number }
  const srcLabel =
    inv.type !== 'sales'
      ? '—'
      : anyInv.is_restaurant || inv.order_type != null || inv.table_id != null
        ? (t?.nav?.restaurantSales ?? (typeof document !== 'undefined' && document.documentElement.dir === 'rtl' ? 'مطعم' : 'Restaurant'))
        : anyInv.is_pos
          ? (typeof document !== 'undefined' && document.documentElement.dir === 'rtl' ? 'نقاط بيع (POS)' : 'POS')
          : (typeof document !== 'undefined' && document.documentElement.dir === 'rtl' ? 'مبيعات' : 'Sales')

  return (
    <>
      <tr className="hover:bg-slate-50">
        <td className="px-4 py-3">
          <button type="button" onClick={onToggle} className="text-slate-400 hover:text-slate-600">
            {isExpanded ? <ChevronDown size={16} /> : <ChevronLeft size={16} />}
          </button>
        </td>
        {visibleColumns.number && <td className="px-4 py-3 font-mono text-xs text-emerald-600 font-medium">{inv.number}</td>}
        {visibleColumns.date && <td className="px-4 py-3 text-slate-600">{formatDisplayDate(inv.date)}</td>}
        {visibleColumns.source && <td className="px-4 py-3 text-slate-700">{srcLabel}</td>}
        {visibleColumns.partner && (
          <td className="px-4 py-3 text-slate-900">
            {returnType === 'sales' ? inv.customer?.name : inv.vendor?.name ?? '—'}
          </td>
        )}
        {visibleColumns.warehouse && <td className="px-4 py-3 text-slate-600">{inv.warehouse?.name ?? '—'}</td>}
        {visibleColumns.total && <td className="px-4 py-3 font-medium">{fmt(inv.total)}</td>}
        {visibleColumns.balance && <td className="px-4 py-3 font-medium">{fmt(inv.balance)}</td>}
        {visibleColumns.status && (
          <td className="px-4 py-3">
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusStyles[inv.status] ?? 'bg-slate-100 text-slate-600'}`}>
              {statusLabels[inv.status] ?? inv.status}
            </span>
          </td>
        )}
        <td className="px-4 py-3">
          <div className="relative">
            <button
              type="button"
              onClick={onActionsToggle}
              className="p-1.5 rounded text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              title={t.invoices?.actionsMenu ?? 'إجراءات'}
            >
              <MoreVertical size={16} />
            </button>
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={2 + Object.values(visibleColumns).filter(Boolean).length} className="bg-slate-50 px-0 py-0">
            <div className="px-8 py-4">
              {!detail ? (
                <div className="flex justify-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-700 mb-2">{t.invoices?.lineItems ?? 'بنود الفاتورة'}</h4>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-slate-500">
                          <th className={`${textAlign} pb-2 font-medium`}>{t.invoices?.item ?? 'الصنف'}</th>
                          <th className={`${textAlign} pb-2 font-medium`}>{t.invoices?.quantity ?? 'الكمية'}</th>
                          <th className={`${textAlign} pb-2 font-medium`}>{t.invoices?.unitPrice ?? 'سعر الوحدة'}</th>
                          <th className={`${textAlign} pb-2 font-medium`}>{t.amount}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {detail.lines?.map((line, idx) => (
                          <tr key={idx}>
                            <td className="py-1.5 text-slate-800">{line.item?.name ?? line.description ?? '—'}</td>
                            <td className="py-1.5">{fmtQty(line.quantity)}</td>
                            <td className="py-1.5">{fmt(line.unit_price)}</td>
                            <td className="py-1.5 font-medium">{fmt(line.total ?? 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {detail.parent_invoice && (
                    <p className="text-xs text-slate-500">
                      {t.invoices?.returnSourceInvoice ?? 'الفاتورة الأصلية'}: #{detail.parent_invoice.number}
                    </p>
                  )}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
