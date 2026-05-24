import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchInvoices,
  postInvoice,
  cancelInvoice,
  deleteInvoice,
  fetchInvoice,
  fetchPaymentMethods,
  fetchSettings,
  fetchBranches,
  fetchTenantUsers,
} from '../../api/tenant'
import type { Branch, Invoice, PaginatedResponse, PaymentMethod } from '../../types'
import { formatAmount } from '../../utils/currency'
import {
  ChevronDown,
  ChevronLeft,
  Trash2,
  MoreVertical,
  Printer,
  Eye,
  Send,
  XCircle,
  Banknote,
  Columns3,
} from 'lucide-react'
import Toast, { type ToastType } from '../../components/ui/Toast'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import AlertDialog from '../../components/ui/AlertDialog'
import SearchableSelect, { type SearchableSelectOption } from '../../components/ui/SearchableSelect'
import ReportFooter from '../../components/ui/ReportFooter'
import { ReportToolbarIconGroup } from '../../components/reports/ReportToolbarIconGroup'
import { getReportPeriodRange, formatDisplayDate, type ReportPeriodKey } from '../../utils/date'
import { openInvoiceViewForPrint, posPrintOptionsFromSettings } from '../../utils/openInvoicePrintDialog'

const statusStyles: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  sent: 'bg-blue-100 text-blue-700',
  posted: 'bg-blue-100 text-blue-700',
  paid: 'bg-emerald-100 text-emerald-700',
  partial: 'bg-amber-100 text-amber-700',
  cancelled: 'bg-red-100 text-red-700',
  overdue: 'bg-orange-100 text-orange-700',
}

export default function RestaurantSalesPage() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const { data: settings } = useQuery({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const amountDecimals = Number(settings?.doc_amount_decimals ?? 2)
  const qtyDecimals = Number(settings?.doc_quantity_decimals ?? 2)
  const fmt = (n: number) => formatAmount(n, { decimal_places: amountDecimals }, locale)
  const fmtQty = (n: number) =>
    Number(n).toLocaleString(locale, { minimumFractionDigits: qtyDecimals, maximumFractionDigits: qtyDecimals })

  const statusLabels: Record<string, string> = {
    draft: t.invoices?.statuses?.draft ?? 'مسودة',
    sent: t.invoices?.statuses?.sent ?? 'مرسل',
    posted: t.invoices?.statuses?.posted ?? 'مرحّل',
    paid: t.invoices?.statuses?.paid ?? 'مدفوع',
    partial: t.invoices?.statuses?.partial ?? 'جزئي',
    cancelled: t.invoices?.statuses?.cancelled ?? 'ملغى',
    overdue: t.invoices?.statuses?.overdue ?? 'متأخر',
  }

  const initialPeriodRange = getReportPeriodRange('all')
  const [searchParams] = useSearchParams()
  const initialNumberFilter = searchParams.get('number') ?? ''
  const [dateFrom, setDateFrom] = useState(initialPeriodRange.from_date)
  const [dateTo, setDateTo] = useState(initialPeriodRange.to_date)
  const [datePreset, setDatePreset] = useState<ReportPeriodKey | 'custom'>('all')
  const periodOptions: { value: ReportPeriodKey | 'custom'; labelAr: string; labelEn: string }[] = [
    { value: 'all', labelAr: 'الكل', labelEn: 'All' },
    { value: 'today', labelAr: 'اليوم', labelEn: 'Today' },
    { value: 'this_week', labelAr: 'هذا الأسبوع', labelEn: 'This Week' },
    { value: 'this_month', labelAr: 'هذا الشهر', labelEn: 'This Month' },
    { value: 'this_year', labelAr: 'هذه السنة', labelEn: 'This Year' },
    { value: 'custom', labelAr: 'تاريخ مخصص', labelEn: 'Custom Date' },
  ]
  function applyDatePreset(preset: ReportPeriodKey | 'custom') {
    setDatePreset(preset)
    if (preset !== 'custom') {
      const range = getReportPeriodRange(preset)
      setDateFrom(range.from_date)
      setDateTo(range.to_date)
    }
  }
  const [branchId, setBranchId] = useState('')
  const [createdBy, setCreatedBy] = useState('')
  const [numberFilter, setNumberFilter] = useState(initialNumberFilter)
  const [statusFilter, setStatusFilter] = useState('')
  const [orderTypeFilter, setOrderTypeFilter] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null)
  const [actionsOpenId, setActionsOpenId] = useState<number | null>(null)
  const [actionsAnchor, setActionsAnchor] = useState<{ top: number; inlineStart: number } | null>(null)
  const navigate = useNavigate()
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [paymentWarningMessage, setPaymentWarningMessage] = useState<string | null>(null)

  const RESTAURANT_SALES_COLUMNS_KEY = 'restaurantSalesVisibleColumns'
  type RestaurantColumnKey = 'number' | 'date' | 'table' | 'orderType' | 'customer' | 'branch' | 'total' | 'status'
  const restaurantColumnKeys: RestaurantColumnKey[] = ['number', 'date', 'table', 'orderType', 'customer', 'branch', 'total', 'status']
  const [visibleColumns, setVisibleColumns] = useState<Record<RestaurantColumnKey, boolean>>(() => {
    try {
      const raw = window.localStorage.getItem(RESTAURANT_SALES_COLUMNS_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, boolean>
        return restaurantColumnKeys.reduce((acc, k) => ({ ...acc, [k]: parsed[k] !== false }), {} as Record<RestaurantColumnKey, boolean>)
      }
    } catch {
      /* ignore */
    }
    return restaurantColumnKeys.reduce((acc, k) => ({ ...acc, [k]: true }), {} as Record<RestaurantColumnKey, boolean>)
  })
  const [showColumnsMenu, setShowColumnsMenu] = useState(false)
  const columnsMenuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    try {
      window.localStorage.setItem(RESTAURANT_SALES_COLUMNS_KEY, JSON.stringify(visibleColumns))
    } catch {
      /* ignore */
    }
  }, [visibleColumns])
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (columnsMenuRef.current && !columnsMenuRef.current.contains(e.target as Node)) setShowColumnsMenu(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  const visibleColumnCount = restaurantColumnKeys.filter((k) => visibleColumns[k]).length

  const showToast = useCallback((message: string, type: ToastType) => setToast({ message, type }), [])

  const posPrintOpts = useMemo(
    () => posPrintOptionsFromSettings(settings as Record<string, unknown> | undefined),
    [settings],
  )

  const closeActionsMenu = useCallback(() => {
    setActionsOpenId(null)
    setActionsAnchor(null)
  }, [])

  const openActionsMenu = useCallback(
    (e: React.MouseEvent, inv: Invoice) => {
      e.stopPropagation()
      const el = e.currentTarget as HTMLElement
      const rect = el.getBoundingClientRect()
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1024
      const pad = 8
      const menuW = 220
      const rawInlineStart = isRtl ? Math.max(pad, vw - rect.right) : Math.max(pad, rect.left)
      const inlineStart = Math.min(rawInlineStart, vw - pad - menuW)
      setActionsAnchor({ top: rect.bottom, inlineStart })
      setActionsOpenId(inv.id)
    },
    [isRtl],
  )

  const perPage = 25
  const [page, setPage] = useState(1)
  useEffect(() => {
    setPage(1)
  }, [dateFrom, dateTo, branchId, createdBy, numberFilter, statusFilter, orderTypeFilter])
  const params: Record<string, string> = {
    type: 'sales',
    is_restaurant: '1',
    page: String(page),
    per_page: String(perPage),
  }
  if (dateFrom) params.date_from = dateFrom
  if (dateTo) params.date_to = dateTo
  if (branchId) params.branch_id = branchId
  if (createdBy) params.created_by = createdBy
  if (numberFilter.trim()) params.number = numberFilter.trim()
  if (statusFilter) params.status = statusFilter
  if (orderTypeFilter) params.order_type = orderTypeFilter

  const { data, isLoading } = useQuery<PaginatedResponse<Invoice>>({
    queryKey: ['invoices', 'restaurant', tenantId, params],
    queryFn: ({ signal }) => fetchInvoices(tenantId, params, signal),
    enabled: !!tenantId,
  })

  const { data: branchesList } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId,
  })
  const branches: Branch[] = Array.isArray(branchesList)
    ? (branchesList as Branch[])
    : ((branchesList as unknown as { data?: Branch[] })?.data ?? [])

  const { data: usersData } = useQuery({
    queryKey: ['tenant-users', tenantId],
    queryFn: () => fetchTenantUsers(tenantId),
    enabled: !!tenantId,
  })
  const users: { id: number; name: string }[] = (usersData as unknown as { data?: { id: number; name: string }[] })?.data ?? []

  const branchOptions: SearchableSelectOption[] = useMemo(() => {
    return [
      { value: 0, label: lang === 'ar' ? 'اختر الفرع' : 'Select branch' },
      ...branches.map((b) => ({ value: b.id, label: b.name })),
    ]
  }, [branches, lang])
  const userOptions: SearchableSelectOption[] = useMemo(() => {
    return [
      { value: 0, label: lang === 'ar' ? 'اختر المستخدم' : 'Select user' },
      ...users.map((u) => ({ value: u.id, label: u.name })),
    ]
  }, [users, lang])
  const orderTypeOptions: SearchableSelectOption[] = useMemo(
    () => [
      { value: '', label: lang === 'ar' ? 'كل أنواع الطلب' : 'All order types' },
      { value: 'dine_in', label: lang === 'ar' ? 'محلي' : 'Dine in' },
      { value: 'takeaway', label: lang === 'ar' ? 'سفري' : 'Takeaway' },
      { value: 'delivery', label: lang === 'ar' ? 'توصيل' : 'Delivery' },
    ],
    [lang],
  )

  const statusOptions: SearchableSelectOption[] = useMemo(() => {
    return [
      { value: '', label: t.invoices?.allStatuses ?? (lang === 'ar' ? 'كل الحالات' : 'All statuses') },
      { value: 'draft', label: statusLabels.draft },
      { value: 'posted', label: statusLabels.posted },
      { value: 'paid', label: statusLabels.paid },
      { value: 'cancelled', label: statusLabels.cancelled },
    ]
  }, [lang, t.invoices?.allStatuses, statusLabels.draft, statusLabels.posted, statusLabels.paid, statusLabels.cancelled])

  const postMut = useMutation({
    mutationFn: (id: number) => postInvoice(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      showToast(t.msg?.postedSuccess ?? 'تم الترحيل', 'success')
    },
    onError: (err: unknown) => showToast((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? t.msg?.errorOccurred ?? 'خطأ', 'error'),
  })

  const cancelMut = useMutation({
    mutationFn: (id: number) => cancelInvoice(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      showToast(t.msg?.cancelledSuccess ?? 'تم الإلغاء', 'success')
    },
    onError: (err: unknown) => showToast((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? t.msg?.errorOccurred ?? 'خطأ', 'error'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteInvoice(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['invoices', 'restaurant'] })
      setDeleteTarget(null)
      setActionsOpenId(null)
      showToast(t.msg?.deletedSuccess ?? 'تم الحذف', 'success')
    },
    onError: (err: unknown) => {
      setDeleteTarget(null)
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? t.msg?.deleteError ?? 'فشل الحذف'
      if (typeof msg === 'string' && (msg.includes('أرقام السندات') || msg.includes('سند'))) {
        setPaymentWarningMessage(msg)
      } else {
        showToast(msg, 'error')
      }
    },
  })

  const invoices = data?.data ?? []
  const total = data?.total ?? 0
  const currentPage = data?.current_page ?? 1
  const lastPage = data?.last_page ?? 1
  const from = total === 0 ? 0 : (currentPage - 1) * perPage + 1
  const to = Math.min(currentPage * perPage, total)
  const textAlign = isRtl ? 'text-right' : 'text-left'

  const summaryTotals = useMemo(() => {
    if (invoices.length === 0) return null
    const sumTotal = invoices.reduce((s, inv) => s + Number(inv.total ?? 0), 0)
    const sumBalance = invoices.reduce((s, inv) => s + Number(inv.balance ?? 0), 0)
    return { sumTotal, sumBalance }
  }, [invoices])

  const totalIdx = restaurantColumnKeys.indexOf('total')
  const summaryLabelColSpan =
    1 + restaurantColumnKeys.slice(0, totalIdx).filter((key) => visibleColumns[key]).length
  const columnKeysAfterTotal = restaurantColumnKeys.slice(totalIdx + 1)

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

  useEffect(() => {
    const next = searchParams.get('number') ?? ''
    setNumberFilter((prev) => (prev === next ? prev : next))
  }, [searchParams])

  function handleExportCsv() {
    if (!invoices.length) return
    const headers = [
      t.invoices?.invoiceNumber ?? 'رقم الفاتورة',
      t.date ?? 'التاريخ',
      lang === 'ar' ? 'الطاولة' : 'Table',
      t.invoices?.customer ?? 'العميل',
      t.invoices?.branch ?? 'الفرع',
      t.total ?? 'الإجمالي',
      t.status ?? 'الحالة',
    ]
    const rows = invoices.map((inv) => {
      const invWithTable = inv as Invoice & { table?: { name: string } }
      return [
        inv.number,
        inv.date ? formatDisplayDate(inv.date) : '',
        invWithTable.table?.name ?? '—',
        inv.customer?.name ?? '—',
        inv.branch?.name ?? '—',
        fmt(Number(inv.total ?? 0)),
        statusLabels[inv.status] ?? inv.status,
      ]
    })
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `restaurant-sales-${dateFrom}-${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const orderTypeLabel = (ot: string | undefined) => {
    if (!ot) return '—'
    if (lang === 'ar') return ot === 'dine_in' ? 'محلي' : ot === 'takeaway' ? 'سفري' : ot === 'delivery' ? 'توصيل' : ot
    return ot === 'dine_in' ? 'Dine in' : ot === 'takeaway' ? 'Takeaway' : ot === 'delivery' ? 'Delivery' : ot
  }

  const labelPeriod = lang === 'ar' ? 'الفترة' : 'Period'
  const labelFrom = lang === 'ar' ? 'من تاريخ' : 'From date'
  const labelTo = lang === 'ar' ? 'إلى تاريخ' : 'To date'
  const showCustomDateFields = datePreset === 'custom'

  const columnLabels: Record<RestaurantColumnKey, { ar: string; en: string }> = {
    number: { ar: 'رقم الفاتورة', en: 'Invoice Number' },
    date: { ar: 'التاريخ', en: 'Date' },
    table: { ar: 'الطاولة', en: 'Table' },
    orderType: { ar: 'نوع الطلب', en: 'Order Type' },
    customer: { ar: 'العميل', en: 'Customer' },
    branch: { ar: 'الفرع', en: 'Branch' },
    total: { ar: 'الإجمالي', en: 'Total' },
    status: { ar: 'الحالة', en: 'Status' },
  }

  return (
    <div className="p-5 space-y-4">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex flex-wrap items-center gap-4 py-1">
        <h1 className="text-xl font-semibold text-slate-900 whitespace-nowrap">
          {lang === 'ar' ? 'مبيعات المطعم' : 'Restaurant Sales'}
        </h1>
        <div className="flex-1 flex justify-center flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-600 shrink-0">{labelPeriod}</span>
            <select
              value={datePreset}
              onChange={(e) => applyDatePreset((e.target.value as ReportPeriodKey | 'custom') || 'custom')}
              className="h-9 border border-slate-300 rounded-lg px-3 text-sm min-w-[150px] bg-white focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
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
            <>
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-slate-600 whitespace-nowrap">{labelFrom}</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-9 border border-slate-300 rounded-lg px-3 text-sm bg-white w-[140px] focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                  title={labelFrom}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-slate-600 whitespace-nowrap">{labelTo}</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-9 border border-slate-300 rounded-lg px-3 text-sm bg-white w-[140px] focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                  title={labelTo}
                />
              </div>
            </>
          )}
        </div>
        <ReportToolbarIconGroup
          ref={columnsMenuRef}
          onExportExcel={handleExportCsv}
          onPrint={() => window.print()}
          onExportPdf={() => window.print()}
          columnsSlot={
            <>
              <button
                type="button"
                onClick={() => setShowColumnsMenu((v) => !v)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 border border-slate-300 text-slate-600 hover:bg-slate-50"
                title={lang === 'ar' ? 'تخصيص الأعمدة' : 'Customize columns'}
              >
                <Columns3 size={16} />
              </button>
              {showColumnsMenu && (
                <div className="absolute top-full right-0 mt-1 z-50 min-w-[200px] rounded-lg border border-slate-200 bg-white shadow-lg p-2">
                  <div className="text-xs font-medium text-slate-500 mb-1.5 px-1">
                    {lang === 'ar' ? 'إظهار الأعمدة' : 'Show columns'}
                  </div>
                  {restaurantColumnKeys.map((key) => (
                    <label key={key} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-slate-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={visibleColumns[key]}
                        onChange={(e) => setVisibleColumns((prev) => ({ ...prev, [key]: e.target.checked }))}
                        className="rounded border-slate-300"
                      />
                      <span className="text-sm">{lang === 'ar' ? columnLabels[key].ar : columnLabels[key].en}</span>
                    </label>
                  ))}
                </div>
              )}
            </>
          }
        />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-center gap-4">
        <div className="min-w-[200px] flex-1 basis-[200px] max-w-[340px]">
          <input
            type="text"
            placeholder={t.invoices?.invoiceNumber ?? 'رقم الفاتورة'}
            value={numberFilter}
            onChange={(e) => setNumberFilter(e.target.value)}
            className="w-full h-9 border border-slate-300 rounded-lg px-3 py-2 text-sm leading-normal focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none bg-white placeholder:text-slate-500"
            style={{ textAlign: isRtl ? 'right' : 'left' }}
          />
        </div>
        <div className="min-w-[200px] flex-1 basis-[200px] max-w-[340px]">
          <SearchableSelect
            options={branchOptions}
            value={branchId === '' ? 0 : Number(branchId) || 0}
            onChange={(v) => setBranchId(v === 0 || v === null ? '' : String(v))}
            placeholder={lang === 'ar' ? 'اختر الفرع' : 'Select branch'}
            textAlign={isRtl ? 'right' : 'left'}
            className="w-full"
          />
        </div>
        <div className="min-w-[200px] flex-1 basis-[200px] max-w-[340px]">
          <SearchableSelect
            options={userOptions}
            value={createdBy === '' ? 0 : Number(createdBy) || 0}
            onChange={(v) => setCreatedBy(v === 0 || v === null ? '' : String(v))}
            placeholder={lang === 'ar' ? 'اختر المستخدم' : 'Select user'}
            textAlign={isRtl ? 'right' : 'left'}
            className="w-full"
          />
        </div>
        <div className="min-w-[200px] flex-1 basis-[200px] max-w-[340px]">
          <SearchableSelect
            options={orderTypeOptions}
            value={orderTypeFilter}
            onChange={(v) => setOrderTypeFilter(v === null || v === '' ? '' : String(v))}
            placeholder={lang === 'ar' ? 'نوع الطلب' : 'Order type'}
            textAlign={isRtl ? 'right' : 'left'}
            className="w-full"
          />
        </div>
        <div className="min-w-[200px] flex-1 basis-[200px] max-w-[340px]">
          <SearchableSelect
            options={statusOptions}
            value={statusFilter}
            onChange={(v) => setStatusFilter(v === null || v === '' ? '' : String(v))}
            placeholder={t.invoices?.allStatuses ?? (lang === 'ar' ? 'كل الحالات' : 'All statuses')}
            textAlign={isRtl ? 'right' : 'left'}
            className="w-full"
          />
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

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="bg-slate-50 text-slate-600">
                  <th className={`${textAlign} px-4 py-3 font-medium w-10`} />
                  {visibleColumns.number && <th className={`${textAlign} px-4 py-3 font-medium`}>{t.invoices?.invoiceNumber ?? 'رقم الفاتورة'}</th>}
                  {visibleColumns.date && <th className={`${textAlign} px-4 py-3 font-medium`}>{t.date ?? 'التاريخ'}</th>}
                  {visibleColumns.table && <th className={`${textAlign} px-4 py-3 font-medium`}>{lang === 'ar' ? 'الطاولة' : 'Table'}</th>}
                  {visibleColumns.orderType && <th className={`${textAlign} px-4 py-3 font-medium`}>{lang === 'ar' ? 'نوع الطلب' : 'Order type'}</th>}
                  {visibleColumns.customer && <th className={`${textAlign} px-4 py-3 font-medium`}>{t.invoices?.customer ?? 'العميل'}</th>}
                  {visibleColumns.branch && <th className={`${textAlign} px-4 py-3 font-medium`}>{t.invoices?.branch ?? 'الفرع'}</th>}
                  {visibleColumns.total && <th className={`${textAlign} px-4 py-3 font-medium`}>{t.total ?? 'الإجمالي'}</th>}
                  {visibleColumns.status && <th className={`${textAlign} px-4 py-3 font-medium`}>{t.status ?? 'الحالة'}</th>}
                  <th className={`${textAlign} px-4 py-3 font-medium w-28`}>{t.actions ?? 'إجراءات'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumnCount + 2} className="text-center py-8 text-slate-400">
                      {lang === 'ar' ? 'لا توجد فواتير مبيعات من نقطة بيع المطعم' : 'No restaurant POS invoices'}
                    </td>
                  </tr>
                ) : (
                  invoices.map((inv) => {
                    const invWithTable = inv as Invoice & { table?: { name: string }; order_type?: string }
                    const isExpanded = expandedId === inv.id
                    const canPost = inv.status === 'draft'
                    const canCancel = inv.status !== 'cancelled' && (Number(inv.amount_paid) ?? 0) === 0
                    return (
                      <React.Fragment key={inv.id}>
                        <tr className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <button type="button" onClick={() => toggleDetail(inv)} className="text-slate-400 hover:text-slate-600">
                              {isExpanded ? <ChevronDown size={16} /> : <ChevronLeft size={16} />}
                            </button>
                          </td>
                          {visibleColumns.number && <td className="px-4 py-3 font-mono text-xs text-primary-600 font-medium">{inv.number}</td>}
                          {visibleColumns.date && <td className="px-4 py-3 text-slate-600">{formatDisplayDate(inv.date)}</td>}
                          {visibleColumns.table && <td className="px-4 py-3 text-slate-700">{invWithTable.table?.name ?? '—'}</td>}
                          {visibleColumns.orderType && <td className="px-4 py-3 text-slate-600">{orderTypeLabel(invWithTable.order_type)}</td>}
                          {visibleColumns.customer && <td className="px-4 py-3 text-slate-900">{inv.customer?.name ?? '—'}</td>}
                          {visibleColumns.branch && <td className="px-4 py-3 text-slate-600">{inv.branch?.name ?? '—'}</td>}
                          {visibleColumns.total && <td className="px-4 py-3 font-medium">{fmt(Number(inv.total))}</td>}
                          {visibleColumns.status && (
                            <td className="px-4 py-3">
                              <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusStyles[inv.status] ?? 'bg-slate-100 text-slate-600'}`}>
                                {statusLabels[inv.status] ?? inv.status}
                              </span>
                            </td>
                          )}
                          <td className="px-4 py-3 text-center">
                            <button
                              type="button"
                              onClick={(e) => openActionsMenu(e, inv)}
                              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                              title={t.actions ?? 'إجراءات'}
                            >
                              <MoreVertical size={16} />
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={10} className="bg-slate-50 px-0 py-0">
                              <div className="px-8 py-4">
                                {!detailInvoice ? (
                                  <div className="flex justify-center py-4"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" /></div>
                                ) : (
                                  <div>
                                    <div className="flex items-center justify-between mb-2">
                                      <h4 className="text-sm font-semibold text-slate-700">{t.invoices?.lineItems ?? 'البنود'}</h4>
                                      <button
                                        type="button"
                                        onClick={() => openInvoiceViewForPrint(detailInvoice.id)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-200 rounded-lg border border-slate-200"
                                      >
                                        <Printer size={14} />
                                        {t.invoices?.viewPrint ?? 'عرض وطباعة'}
                                      </button>
                                    </div>
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="text-slate-500">
                                          <th className={`${textAlign} pb-2 font-medium`}>{t.invoices?.item ?? 'الصنف'}</th>
                                          <th className={`${textAlign} pb-2 font-medium`}>{t.invoices?.quantity ?? 'الكمية'}</th>
                                          <th className={`${textAlign} pb-2 font-medium`}>{t.invoices?.unitPrice ?? 'السعر'}</th>
                                          <th className={`${textAlign} pb-2 font-medium`}>{t.total ?? 'الإجمالي'}</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-200">
                                        {detailInvoice.lines?.map((line, idx) => (
                                          <tr key={idx}>
                                            <td className="py-1.5 text-slate-800">{line.description ?? '—'}</td>
                                            <td className="py-1.5">{fmtQty(line.quantity)}</td>
                                            <td className="py-1.5">{fmt(line.unit_price ?? 0)}</td>
                                            <td className="py-1.5 font-medium">{fmt(line.total ?? 0)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })
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
                    {columnKeysAfterTotal
                      .filter((key) => visibleColumns[key])
                      .map((key) => (
                        <td key={key} className="p-3" aria-hidden />
                      ))}
                    <td className="p-3" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {actionsOpenId != null && actionsAnchor && (() => {
        const openInv = invoices.find((i) => i.id === actionsOpenId)
        if (!openInv) return null
        const canPost = openInv.status === 'draft'
        const canCancel = openInv.status !== 'cancelled' && (Number(openInv.amount_paid) ?? 0) === 0
        const canAddPayment = openInv.status !== 'cancelled' && Number(openInv.balance ?? 0) > 0.0005
        return createPortal(
          <>
            <div className="fixed inset-0 z-[130000]" aria-hidden onClick={closeActionsMenu} />
            <div
              className="fixed z-[130001] min-w-[180px] bg-white border border-slate-200 rounded-lg shadow-lg py-1"
              style={{ top: actionsAnchor.top + 4, insetInlineStart: actionsAnchor.inlineStart }}
            >
              <button
                type="button"
                onClick={() => {
                  closeActionsMenu()
                  openInvoiceViewForPrint(openInv.id, posPrintOpts)
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 ${isRtl ? 'text-right' : 'text-left'}`}
              >
                <Printer size={14} />
                {t.invoices?.viewPrint ?? (lang === 'ar' ? 'عرض وطباعة' : 'View & Print')}
              </button>
              <Link
                to={`/invoices/view/${openInv.id}`}
                className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                onClick={closeActionsMenu}
              >
                <Eye size={14} />
                {lang === 'ar' ? 'عرض الفاتورة' : 'View invoice'}
              </Link>
              {canPost && (
                <button
                  type="button"
                  onClick={() => {
                    postMut.mutate(openInv.id)
                    closeActionsMenu()
                  }}
                  disabled={postMut.isPending}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 ${isRtl ? 'text-right' : 'text-left'}`}
                >
                  <Send size={14} />
                  {t.invoices?.post ?? (lang === 'ar' ? 'ترحيل' : 'Post')}
                </button>
              )}
              {canCancel && (
                <button
                  type="button"
                  onClick={() => {
                    cancelMut.mutate(openInv.id)
                    closeActionsMenu()
                  }}
                  disabled={cancelMut.isPending}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 ${isRtl ? 'text-right' : 'text-left'}`}
                >
                  <XCircle size={14} />
                  {t.invoices?.cancelInvoice ?? (lang === 'ar' ? 'إلغاء الفاتورة' : 'Cancel invoice')}
                </button>
              )}
              {canAddPayment && (
                <button
                  type="button"
                  onClick={() => {
                    closeActionsMenu()
                    navigate(`/payments/create-voucher?voucher_type=receipt&invoice_id=${openInv.id}`)
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 ${isRtl ? 'text-right' : 'text-left'}`}
                >
                  <Banknote size={14} />
                  {t.invoices?.addPayment ?? (lang === 'ar' ? 'إضافة دفعة' : 'Add payment')}
                </button>
              )}
              <div className="border-t border-slate-100 my-1" />
              <button
                type="button"
                onClick={() => {
                  setDeleteTarget(openInv)
                  closeActionsMenu()
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 ${isRtl ? 'text-right' : 'text-left'}`}
              >
                <Trash2 size={14} />
                {t.invoices?.deleteInvoice ?? (lang === 'ar' ? 'حذف الفاتورة' : 'Delete invoice')}
              </button>
            </div>
          </>,
          document.body,
        )
      })()}

      {data && (
        <ReportFooter
          totalCount={total}
          currentPage={currentPage}
          lastPage={lastPage}
          from={from}
          to={to}
          onPageChange={setPage}
          lang={lang}
          isRtl={isRtl}
          recordLabel={lang === 'ar' ? 'فاتورة' : 'invoice'}
          alwaysShowPaginationBar
          showRecordSummary={total > 0}
          dense
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={t.invoices?.deleteInvoice ?? 'حذف الفاتورة'}
          message={(t.invoices?.confirmDeleteInvoice ?? 'تأكيد حذف الفاتورة {number}').replace('{number}', deleteTarget.number)}
          confirmLabel={t.delete ?? 'حذف'}
          variant="danger"
          isLoading={deleteMut.isPending}
          onConfirm={() => deleteMut.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
