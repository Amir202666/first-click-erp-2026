import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchPosShiftsReport,
  fetchPosShiftsReportCashiers,
  fetchBranches,
  fetchSettings,
  closePosShift,
  updatePosShift,
  reopenPosShift,
} from '../../api/tenant'
import type { PosShiftReportRow } from '../../types'
import { formatAmount } from '../../utils/currency'
import { getReportPeriodRange, type ReportPeriodKey } from '../../utils/date'
import { Loader2, Store, User, ChevronDown, ChevronRight, Lock, Printer, FileSpreadsheet, Columns3, Download, Pencil, RotateCcw, AlertTriangle, BarChart2 } from 'lucide-react'
import ReportFooter from '../../components/ui/ReportFooter'
import PageSizeSelect from '../../components/ui/PageSizeSelect'
import SearchableSelect from '../../components/ui/SearchableSelect'
import { usePersistedColumnVisibility } from '../../hooks/usePersistedColumnVisibility'

function toBranches(res: unknown): { id: number; name: string }[] {
  if (Array.isArray(res)) return res as { id: number; name: string }[]
  if (res && typeof res === 'object' && 'data' in res) {
    const d = (res as { data: unknown }).data
    return Array.isArray(d) ? (d as { id: number; name: string }[]) : []
  }
  return []
}

const SHIFT_COL_KEYS = [
  'shiftNumber',
  'cashier',
  'branch',
  'opened',
  'closed',
  'invoices',
  'sales',
  'diff',
  'status',
] as const
type ShiftColKey = (typeof SHIFT_COL_KEYS)[number]

const SHIFT_COL_STORAGE = 'posShiftsReportVisibleColumns'

const PAYMENT_ICONS: Record<string, string> = {
  cash: '💵',
  card: '💳',
  knet: '💳',
  visa: '💳',
  transfer: '📱',
  bank: '🏦',
  other: '💰',
}

/** يحويل حقل المبلغ أثناء الكتابة إلى رقم للحفظ/المعاينة؛ يدعم «.» و «,» وحالات وسيطة مثل فارغ أو 0. */
function amountFromInput(raw: string): number {
  const t = raw.trim().replace(/,/g, '.')
  if (t === '' || t === '.') return 0
  const n = parseFloat(t)
  return Number.isFinite(n) ? n : 0
}

/** يقبل فقط أرقاماً ونقطة عشرية واحدة أثناء الإدخال */
function sanitizeDecimalTyping(raw: string): string {
  let v = raw.replace(/,/g, '.').replace(/[^\d.]/g, '')
  const i = v.indexOf('.')
  if (i !== -1) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, '')
  return v
}

const SHIFT_REPORT_TIMEZONE = 'Asia/Kuwait'

/** تاريخ ووقت بتوقيت الكويت + أرقام لاتينية ثابتة (يمنع مشاكل RTL/UTC على ويندوز). */
function formatShiftDateTimeLocal(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  try {
    // en-GB => DD/MM/YYYY مع أرقام لاتينية
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: SHIFT_REPORT_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d).replace(' ', '\u00a0')
  } catch {
    // fallback لو Intl/timeZone غير مدعوم
    const day = String(d.getDate()).padStart(2, '0')
    const mo = String(d.getMonth() + 1).padStart(2, '0')
    const y = d.getFullYear()
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${day}/${mo}/${y}\u00a0${hh}:${mm}`
  }
}

export default function ShiftsReport() {
  const { currentTenant, meData, can } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const qc = useQueryClient()
  const navigate = useNavigate()
  const appliedBranchRef = useRef(false)

  const [branchId, setBranchId] = useState<string>('')
  const [status, setStatus] = useState<'all' | 'open' | 'closed'>('all')
  const initialPeriodRange = getReportPeriodRange('all')
  const [fromDate, setFromDate] = useState(initialPeriodRange.from_date)
  const [toDate, setToDate] = useState(initialPeriodRange.to_date)
  const [periodPreset, setPeriodPreset] = useState<ReportPeriodKey | 'custom'>('all')
  const [cashierIdFilter, setCashierIdFilter] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [showColumnsMenu, setShowColumnsMenu] = useState(false)
  const columnsMenuRef = useRef<HTMLDivElement>(null)
  const [visibleColumns, setVisibleColumns] = usePersistedColumnVisibility<ShiftColKey>(SHIFT_COL_STORAGE, SHIFT_COL_KEYS)

  const [showClose, setShowClose] = useState<PosShiftReportRow | null>(null)
  /** نص حقل النقد عند الإغلاق — يُخزَّن كنص لتفادي تعطيل الكتابة مع type=number وparseFloat */
  const [closingCashInput, setClosingCashInput] = useState('')
  const [showEditShift, setShowEditShift] = useState<PosShiftReportRow | null>(null)
  const [editOpeningCashInput, setEditOpeningCashInput] = useState('')
  const [reopenErrorMessage, setReopenErrorMessage] = useState<string | null>(null)
  const [showReopenConfirm, setShowReopenConfirm] = useState<PosShiftReportRow | null>(null)

  const isRestrictedBranch = !!(meData?.restrict_to_branch_warehouse && meData?.default_branch_id != null)

  useEffect(() => {
    if (appliedBranchRef.current || !isRestrictedBranch || meData?.default_branch_id == null) return
    setBranchId(String(meData.default_branch_id))
    appliedBranchRef.current = true
  }, [isRestrictedBranch, meData?.default_branch_id])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (columnsMenuRef.current && !columnsMenuRef.current.contains(e.target as Node)) {
        setShowColumnsMenu(false)
      }
    }
    if (showColumnsMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showColumnsMenu])

  function toggleShiftColumn(key: ShiftColKey) {
    setVisibleColumns((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      const count = SHIFT_COL_KEYS.filter((k) => next[k]).length
      if (count === 0) return prev
      return next
    })
  }

  const { data: settings } = useQuery({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const decimals = Number((settings as Record<string, unknown>)?.doc_amount_decimals ?? 3)
  const fmt = (n: number) => formatAmount(n, { decimal_places: decimals }, locale)

  const { data: branchesData } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId,
    staleTime: 60_000,
  })
  const branches = toBranches(branchesData)

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
    setPage(1)
    if (preset !== 'custom') {
      const range = getReportPeriodRange(preset)
      setFromDate(range.from_date)
      setToDate(range.to_date)
    }
  }

  /** يحدّث نطاق «اليوم/الأمس» مع تقويم المتصفح (بعد منتصف الليل أو عند العودة للصفحة) */
  useEffect(() => {
    if (periodPreset !== 'today' && periodPreset !== 'yesterday') return
    function syncRollingDayRange() {
      if (periodPreset !== 'today' && periodPreset !== 'yesterday') return
      const range = getReportPeriodRange(periodPreset)
      setFromDate(range.from_date)
      setToDate(range.to_date)
    }
    syncRollingDayRange()
    const interval = setInterval(syncRollingDayRange, 60_000)
    function onVisibility() {
      if (document.visibilityState === 'visible') syncRollingDayRange()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [periodPreset])

  const dateFromParam = periodPreset === 'all' ? undefined : fromDate
  const dateToParam = periodPreset === 'all' ? undefined : toDate

  const cashiersQuery = useQuery({
    queryKey: ['pos-shifts-report-cashiers', tenantId, branchId, dateFromParam, dateToParam],
    queryFn: () =>
      fetchPosShiftsReportCashiers(tenantId, {
        branch_id: branchId ? Number(branchId) : undefined,
        date_from: dateFromParam,
        date_to: dateToParam,
      }),
    enabled: !!tenantId,
    staleTime: 30_000,
  })
  const cashiersForFilter = cashiersQuery.data?.data ?? []

  const reportQuery = useQuery({
    queryKey: ['pos-shifts-report', tenantId, branchId, status, dateFromParam, dateToParam, cashierIdFilter, page, perPage],
    queryFn: () =>
      fetchPosShiftsReport(tenantId, {
        branch_id: branchId ? Number(branchId) : undefined,
        status: status === 'all' ? undefined : status,
        date_from: dateFromParam,
        date_to: dateToParam,
        cashier_id:
          cashierIdFilter && Number(cashierIdFilter) > 0 ? Number(cashierIdFilter) : undefined,
        page,
        per_page: perPage,
      }),
    enabled: !!tenantId,
  })

  const paginator = reportQuery.data?.data
  const stats = reportQuery.data?.stats
  const shifts = paginator?.data ?? []

  const closeMut = useMutation({
    mutationFn: () =>
      closePosShift(tenantId, {
        branch_id: showClose ? showClose.branch_id : Number(branchId),
        closing_cash: amountFromInput(closingCashInput),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-shifts-report'] })
      setShowClose(null)
      setClosingCashInput('')
    },
  })

  const updateShiftMut = useMutation({
    mutationFn: () =>
      updatePosShift(tenantId, showEditShift!.id, { opening_cash: amountFromInput(editOpeningCashInput) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-shifts-report'] })
      qc.invalidateQueries({ queryKey: ['pos-shifts-report-cashiers'] })
      setShowEditShift(null)
      setEditOpeningCashInput('')
    },
  })

  const reopenShiftMut = useMutation({
    mutationFn: (shiftId: number) => reopenPosShift(tenantId, shiftId),
    onMutate: () => setReopenErrorMessage(null),
    onSuccess: () => {
      setShowReopenConfirm(null)
      qc.invalidateQueries({ queryKey: ['pos-shifts-report'] })
      qc.invalidateQueries({ queryKey: ['pos-shifts-report-cashiers'] })
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (lang === 'ar' ? 'تعذر إعادة فتح الوردية' : 'Could not reopen shift')
      setReopenErrorMessage(msg)
    },
  })

  const L = (ar: string, en: string) => (lang === 'ar' ? ar : en)

  /** مطابق لشريط فلاتر قائمة فواتير المبيعات (InvoiceList) */
  const filterGridClass =
    'grid w-full gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))]'
  const filterCellClass = 'min-w-0 w-full'

  const branchFilterOptions = useMemo(
    () => [
      { value: 0, label: lang === 'ar' ? 'الفرع' : 'Select branch' },
      ...branches.map((b) => ({ value: b.id, label: b.name })),
    ],
    [branches, lang],
  )
  const statusFilterOptions = useMemo(
    () => [
      { value: 'all', label: lang === 'ar' ? 'الحالة' : 'Select status' },
      { value: 'open', label: L('مفتوحة', 'Open') },
      { value: 'closed', label: L('مغلقة', 'Closed') },
    ],
    [lang],
  )
  const cashierFilterOptions = useMemo(
    () => [
      { value: 0, label: lang === 'ar' ? 'الكاشير' : 'Select cashier' },
      ...cashiersForFilter.map((u) => ({ value: u.id, label: u.name })),
    ],
    [cashiersForFilter, lang],
  )

  useEffect(() => {
    if (!cashierIdFilter) return
    const ok = cashiersForFilter.some((u) => String(u.id) === cashierIdFilter)
    if (!ok) setCashierIdFilter('')
  }, [cashiersForFilter, cashierIdFilter])

  const showCustomDateFields = periodPreset === 'custom'
  const labelPeriod = L('الفترة', 'Period')
  const labelFrom = L('من', 'From')
  const labelTo = L('إلى', 'To')

  const tableColSpan = useMemo(() => 1 + SHIFT_COL_KEYS.filter((k) => visibleColumns[k]).length + 1, [visibleColumns])

  const firstSummaryCol = useMemo((): 'invoices' | 'sales' | null => {
    if (visibleColumns.invoices) return 'invoices'
    if (visibleColumns.sales) return 'sales'
    return null
  }, [visibleColumns])

  const summaryLabelColSpan = useMemo(() => {
    if (!firstSummaryCol) return 1
    const idx = SHIFT_COL_KEYS.indexOf(firstSummaryCol)
    const n = SHIFT_COL_KEYS.slice(0, idx).filter((k) => visibleColumns[k]).length
    return Math.max(1, 1 + n)
  }, [visibleColumns, firstSummaryCol])

  const pageSummaryTotals = useMemo(() => {
    if (shifts.length === 0 || !firstSummaryCol) return null
    return {
      sumInvoices: shifts.reduce((s, x) => s + x.total_invoices, 0),
      sumSales: shifts.reduce((s, x) => s + x.total_sales, 0),
    }
  }, [shifts, firstSummaryCol])

  const paginatorTotal = paginator?.total ?? 0
  const paginatorPage = paginator?.current_page ?? 1
  const paginatorLast = paginator?.last_page ?? 1
  const paginatorPerPage = paginator?.per_page ?? perPage
  const rangeFrom = paginatorTotal > 0 ? (paginatorPage - 1) * paginatorPerPage + 1 : 0
  const rangeTo = paginatorTotal > 0 ? Math.min(paginatorPage * paginatorPerPage, paginatorTotal) : 0

  const shiftColTitles: Record<ShiftColKey, string> = {
    shiftNumber: L('رقم الوردية', 'Shift #'),
    cashier: L('الكاشير', 'Cashier'),
    branch: L('الفرع', 'Branch'),
    opened: L('البداية', 'Opened'),
    closed: L('النهاية', 'Closed'),
    invoices: L('الفواتير', 'Inv.'),
    sales: L('المبيعات', 'Sales'),
    diff: L('الفرق', 'Diff.'),
    status: L('الحالة', 'Status'),
  }

  function exportShiftsExcel() {
    const keys = SHIFT_COL_KEYS.filter((k) => visibleColumns[k])
    const headers = keys.map((k) => shiftColTitles[k])
    const rows = shifts.map((shift) =>
      keys.map((k) => {
        if (k === 'shiftNumber') return shift.shift_number
        if (k === 'cashier') return shift.cashier?.name ?? ''
        if (k === 'branch') return shift.branch?.name ?? ''
        if (k === 'opened') return formatShiftDateTimeLocal(shift.opened_at)
        if (k === 'closed') return shift.closed_at ? formatShiftDateTimeLocal(shift.closed_at) : ''
        if (k === 'invoices') return String(shift.total_invoices)
        if (k === 'sales') return String(shift.total_sales)
        if (k === 'diff') return shift.difference != null ? String(shift.difference) : ''
        if (k === 'status') return shift.status === 'open' ? L('مفتوحة', 'Open') : L('مغلقة', 'Closed')
        return ''
      }),
    )
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pos-shifts-${dateFromParam ?? 'all'}-${dateToParam ?? 'all'}-p${paginatorPage}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handlePrint() {
    window.print()
  }

  const periodLinePrint =
    periodPreset === 'all' ? L('الكل', 'All') : lang === 'ar' ? `${fromDate} — ${toDate}` : `${fromDate} – ${toDate}`

  const kpi = [
    {
      label: L('إجمالي الورديات', 'Total shifts'),
      value: String(stats?.total_shifts ?? 0),
      sub: L(`${stats?.open_shifts ?? 0} مفتوحة`, `${stats?.open_shifts ?? 0} open`),
      color: '#6366f1',
    },
    {
      label: L('إجمالي المبيعات', 'Total sales'),
      value: fmt(stats?.total_sales ?? 0),
      sub: 'KWD',
      color: '#10b981',
    },
    {
      label: L('إجمالي الفواتير', 'Invoices'),
      value: String(stats?.total_invoices ?? 0),
      sub: L('فاتورة', 'invoices'),
      color: '#3b82f6',
    },
    {
      label: L('متوسط الوردية', 'Avg / shift'),
      value: fmt(stats?.avg_per_shift ?? 0),
      sub: 'KWD',
      color: '#f59e0b',
    },
    {
      label: L('ورديات بفرق', 'With variance'),
      value: String(stats?.shifts_with_diff ?? 0),
      sub: L('مراجعة', 'review'),
      color: '#ef4444',
    },
  ]

  return (
    <div className="p-4 space-y-4 w-full min-w-0 max-w-full" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* شريط علوي: عنوان | فلتر الفترة (وسط) | أزرار مثل باقي الصفحات */}
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between lg:gap-4 border-b border-slate-200 dark:border-slate-700 pb-3 no-print">
        <div className="flex items-center gap-3 min-w-0 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-white shadow-md shrink-0">
            <Store className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 truncate">
              {t.nav?.posShiftsReport ?? L('تقرير الورديات', 'POS shifts report')}
            </h1>
          </div>
        </div>
        <div className="flex flex-1 flex-wrap items-center justify-center gap-2 min-w-0">
          <span className="text-sm text-slate-600 dark:text-slate-400 shrink-0">{labelPeriod}</span>
          <select
            value={periodPreset}
            onChange={(e) => applyPeriodPreset((e.target.value as ReportPeriodKey | 'custom') || 'all')}
            className="h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-sm bg-white dark:bg-slate-800 min-w-[150px]"
            title={labelPeriod}
          >
            {periodOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {lang === 'ar' ? opt.labelAr : opt.labelEn}
              </option>
            ))}
          </select>
          {showCustomDateFields && (
            <>
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">{labelFrom}</span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value)
                    setPage(1)
                  }}
                  className="h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-sm bg-white dark:bg-slate-800 w-[140px]"
                  title={labelFrom}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">{labelTo}</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    setToDate(e.target.value)
                    setPage(1)
                  }}
                  className="h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-sm bg-white dark:bg-slate-800 w-[140px]"
                  title={labelTo}
                />
              </div>
            </>
          )}
        </div>
        <div className="relative flex flex-wrap items-center justify-center gap-1.5 shrink-0" ref={columnsMenuRef}>
          <button
            type="button"
            onClick={() => setShowColumnsMenu((v) => !v)}
            className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-600"
            title={lang === 'ar' ? 'تخصيص الأعمدة' : 'Customize columns'}
          >
            <Columns3 size={16} />
          </button>
          {showColumnsMenu && (
            <div className="absolute top-full end-0 mt-2 z-30 w-56 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 shadow-lg py-2 text-sm">
              <div className="px-3 pb-2 text-xs font-semibold text-slate-500">
                {lang === 'ar' ? 'إظهار/إخفاء الأعمدة' : 'Show / hide columns'}
              </div>
              {SHIFT_COL_KEYS.map((key) => (
                <label
                  key={key}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    checked={visibleColumns[key]}
                    onChange={() => toggleShiftColumn(key)}
                    className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-slate-700 dark:text-slate-200 text-sm">{shiftColTitles[key]}</span>
                </label>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-[#F0F2F5] border border-[#D9DCE0] text-[#344054] hover:bg-[#E4E7EB] dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200"
            title={t.accounts?.print ?? L('طباعة', 'Print')}
          >
            <Printer size={16} />
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-[#344054] text-white hover:bg-[#2d3846]"
            title={t.accounts?.exportPdf ?? L('تصدير PDF', 'Export PDF')}
          >
            <Download size={16} />
          </button>
          <button
            type="button"
            onClick={exportShiftsExcel}
            disabled={!shifts.length}
            className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40"
            title={t.accounts?.exportExcel ?? L('تصدير Excel', 'Export Excel')}
          >
            <FileSpreadsheet size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 no-print">
        {kpi.map((k) => (
          <div
            key={k.label}
            className="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-800"
            style={{ borderInlineEnd: `4px solid ${k.color}` }}
          >
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wide mb-1">{k.label}</p>
            <p className="text-xl font-extrabold tabular-nums" style={{ color: k.color }}>
              {k.value}
            </p>
            <p className="text-xs text-slate-400">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className={`bg-white rounded-xl border border-slate-200 p-4 no-print ${filterGridClass}`}>
        <div className={filterCellClass}>
          <SearchableSelect
            options={branchFilterOptions}
            value={branchId === '' ? 0 : Number(branchId) || 0}
            onChange={(v) => {
              setBranchId(v === 0 || v == null ? '' : String(v))
              setPage(1)
            }}
            disabled={isRestrictedBranch}
            placeholder={lang === 'ar' ? 'الفرع' : 'Select branch'}
            textAlign={isRtl ? 'right' : 'left'}
            matchTriggerWidth
            className="w-full min-w-0"
            aria-label={L('الفرع', 'Branch')}
          />
        </div>
        <div className={filterCellClass}>
          <SearchableSelect
            options={statusFilterOptions}
            value={status}
            onChange={(v) => {
              const s = v === 'open' || v === 'closed' ? v : 'all'
              setStatus(s)
              setPage(1)
            }}
            placeholder={lang === 'ar' ? 'الحالة' : 'Select status'}
            textAlign={isRtl ? 'right' : 'left'}
            wrapOptions
            matchTriggerWidth
            dropdownMinWidth={180}
            className="w-full min-w-0"
            aria-label={L('الحالة', 'Status')}
          />
        </div>
        <div className={filterCellClass}>
          <SearchableSelect
            options={cashierFilterOptions}
            value={cashierIdFilter === '' ? 0 : Number(cashierIdFilter) || 0}
            onChange={(v) => {
              setCashierIdFilter(v === 0 || v == null ? '' : String(v))
              setPage(1)
            }}
            placeholder={lang === 'ar' ? 'الكاشير' : 'Select cashier'}
            textAlign={isRtl ? 'right' : 'left'}
            wrapOptions
            matchTriggerWidth
            className="w-full min-w-0"
            aria-label={L('الكاشير', 'Cashier')}
          />
        </div>
        <div className={filterCellClass}>
          <PageSizeSelect
            value={perPage}
            onChange={(v) => {
              setPerPage(v)
              setPage(1)
            }}
            showLabel={false}
            ariaLabel={L('عدد السجلات', 'Records per page')}
          />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
        {reportQuery.isLoading ? (
          <div className="flex justify-center py-16 text-slate-400 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            {L('جاري التحميل...', 'Loading...')}
          </div>
        ) : reportQuery.isError ? (
          <div className="text-center py-12 text-red-500 text-sm">{L('تعذر تحميل التقرير', 'Failed to load report')}</div>
        ) : (
          <div className="overflow-x-auto no-print">
            <table className="w-full text-base min-w-[720px]">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-800">
                  <th className="w-10 px-3 py-3.5 text-center" aria-label="expand" />
                  {visibleColumns.shiftNumber && (
                    <th className="text-center text-xs font-bold text-slate-500 dark:text-slate-400 uppercase px-3 py-3.5 whitespace-nowrap">
                      {shiftColTitles.shiftNumber}
                    </th>
                  )}
                  {visibleColumns.cashier && (
                    <th className="text-center text-xs font-bold text-slate-500 dark:text-slate-400 uppercase px-3 py-3.5 whitespace-nowrap">
                      {shiftColTitles.cashier}
                    </th>
                  )}
                  {visibleColumns.branch && (
                    <th className="text-center text-xs font-bold text-slate-500 dark:text-slate-400 uppercase px-3 py-3.5 whitespace-nowrap">
                      {shiftColTitles.branch}
                    </th>
                  )}
                  {visibleColumns.opened && (
                    <th className="text-center text-xs font-bold text-slate-500 dark:text-slate-400 uppercase px-3 py-3.5 whitespace-nowrap min-w-[11rem]">
                      {shiftColTitles.opened}
                    </th>
                  )}
                  {visibleColumns.closed && (
                    <th className="text-center text-xs font-bold text-slate-500 dark:text-slate-400 uppercase px-3 py-3.5 whitespace-nowrap min-w-[11rem]">
                      {shiftColTitles.closed}
                    </th>
                  )}
                  {visibleColumns.invoices && (
                    <th className="text-center text-xs font-bold text-slate-500 dark:text-slate-400 uppercase px-3 py-3.5 whitespace-nowrap">
                      {shiftColTitles.invoices}
                    </th>
                  )}
                  {visibleColumns.sales && (
                    <th className="text-center text-xs font-bold text-slate-500 dark:text-slate-400 uppercase px-3 py-3.5 whitespace-nowrap">
                      {shiftColTitles.sales}
                    </th>
                  )}
                  {visibleColumns.diff && (
                    <th className="text-center text-xs font-bold text-slate-500 dark:text-slate-400 uppercase px-3 py-3.5 whitespace-nowrap">
                      {shiftColTitles.diff}
                    </th>
                  )}
                  {visibleColumns.status && (
                    <th className="text-center text-xs font-bold text-slate-500 dark:text-slate-400 uppercase px-3 py-3.5 whitespace-nowrap">
                      {shiftColTitles.status}
                    </th>
                  )}
                  <th className="text-center text-xs font-bold text-slate-500 dark:text-slate-400 uppercase px-3 py-3.5 whitespace-nowrap no-print">
                    {L('إجراء', 'Actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {shifts.length === 0 ? (
                  <tr>
                    <td colSpan={tableColSpan} className="text-center py-12 text-slate-400 text-base">
                      {L('لا توجد ورديات', 'No shifts')}
                    </td>
                  </tr>
                ) : (
                  shifts.map((shift) => {
                    const diff = shift.difference != null ? shift.difference : null
                    return (
                      <React.Fragment key={shift.id}>
                      <tr
                        className={`border-b border-slate-50 dark:border-slate-800/80 cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-800/40 ${
                          expandedId === shift.id ? 'bg-indigo-50/50 dark:bg-indigo-950/20' : ''
                        }`}
                        onClick={() => setExpandedId(expandedId === shift.id ? null : shift.id)}
                      >
                        <td className="px-3 py-2.5 w-10 align-middle text-center">
                          {expandedId === shift.id ? (
                            <ChevronDown className="w-4 h-4 text-indigo-500 mx-auto" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-slate-400 mx-auto" />
                          )}
                        </td>
                        {visibleColumns.shiftNumber && (
                          <td className="px-3 py-2.5 font-bold text-indigo-600 tabular-nums align-middle text-center">
                            {shift.shift_number}
                          </td>
                        )}
                        {visibleColumns.cashier && (
                          <td className="px-3 py-2.5 align-middle text-center">
                            <div className="flex items-center justify-center gap-2 min-w-0 mx-auto">
                              <User className="w-4 h-4 text-slate-400 shrink-0" />
                              <span className="truncate max-w-[8rem]">{shift.cashier?.name ?? '—'}</span>
                            </div>
                          </td>
                        )}
                        {visibleColumns.branch && (
                          <td className="px-3 py-2.5 text-slate-600 align-middle text-center">
                            <div className="truncate max-w-[6rem] mx-auto inline-block text-slate-600">{shift.branch?.name ?? '—'}</div>
                          </td>
                        )}
                        {visibleColumns.opened && (
                          <td
                            className="px-3 py-2.5 text-slate-600 whitespace-nowrap align-middle min-w-[11rem] tabular-nums text-center"
                            dir="ltr"
                          >
                            {formatShiftDateTimeLocal(shift.opened_at)}
                          </td>
                        )}
                        {visibleColumns.closed && (
                          <td className="px-3 py-2.5 whitespace-nowrap align-middle min-w-[11rem] tabular-nums text-center">
                            {shift.closed_at ? (
                              <span className="text-slate-600" dir="ltr">
                                {formatShiftDateTimeLocal(shift.closed_at)}
                              </span>
                            ) : (
                              <span className="text-emerald-600 font-semibold">{L('جارية', 'Open')}</span>
                            )}
                          </td>
                        )}
                        {visibleColumns.invoices && (
                          <td className="px-3 py-2.5 font-bold text-blue-600 tabular-nums align-middle text-center">
                            {shift.total_invoices}
                          </td>
                        )}
                        {visibleColumns.sales && (
                          <td className="px-3 py-2.5 font-bold text-emerald-600 tabular-nums align-middle text-center" dir="ltr">
                            {fmt(shift.total_sales)}
                          </td>
                        )}
                        {visibleColumns.diff && (
                          <td className="px-3 py-2.5 tabular-nums align-middle text-center" dir="ltr">
                            {shift.status === 'open' || diff == null ? (
                              '—'
                            ) : Math.abs(diff) < 0.001 ? (
                              <span className="text-slate-400">0</span>
                            ) : diff > 0 ? (
                              <span className="text-emerald-600 font-semibold">+{fmt(diff)}</span>
                            ) : (
                              <span className="text-red-500 font-semibold">{fmt(diff)}</span>
                            )}
                          </td>
                        )}
                        {visibleColumns.status && (
                          <td className="px-3 py-2.5 align-middle text-center">
                            <span
                              className={`inline-flex text-xs px-2.5 py-1 rounded-full font-semibold ${
                                shift.status === 'open'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : diff != null && Math.abs(diff) > 0.001
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {shift.status === 'open' ? L('مفتوحة', 'Open') : L('مغلقة', 'Closed')}
                            </span>
                          </td>
                        )}
                        <td className="px-3 py-2.5 no-print align-middle text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1 flex-wrap">
                            {can('invoices.view') && (
                              <button
                                type="button"
                                title={L('يومية الكاشير', 'Cashier daily report')}
                                onClick={() => navigate(`/pos/shifts/${shift.id}/daily-report`)}
                                className="p-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-950/60"
                              >
                                <BarChart2 className="w-4 h-4" />
                              </button>
                            )}
                            {shift.status === 'open' && (
                              <>
                                {can('invoices.edit') && (
                                  <button
                                    type="button"
                                    title={L('تعديل الرصيد الافتتاحي', 'Edit opening cash')}
                                    onClick={() => {
                                      setShowClose(null)
                                      setClosingCashInput('')
                                      updateShiftMut.reset()
                                      setShowEditShift(shift)
                                      setEditOpeningCashInput(
                                        shift.opening_balance != null ? String(shift.opening_balance) : '',
                                      )
                                    }}
                                    className="p-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-950/60"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  title={L('إغلاق الوردية', 'Close shift')}
                                  onClick={() => {
                                    setShowEditShift(null)
                                    setEditOpeningCashInput('')
                                    setShowClose(shift)
                                    setClosingCashInput('')
                                  }}
                                  className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/60"
                                >
                                  <Lock className="w-4 h-4" />
                                </button>
                              </>
                            )}
                            {shift.status === 'closed' && can('invoices.edit') && (
                              <button
                                type="button"
                                disabled={
                                  (reopenShiftMut.isPending && reopenShiftMut.variables === shift.id) ||
                                  (shift.journal_entry_id != null && shift.journal_entry_id > 0)
                                }
                                title={
                                  shift.journal_entry_id != null && shift.journal_entry_id > 0
                                    ? L('لا يمكن إعادة الفتح — قيد محاسبي مرتبط', 'Cannot reopen — journal entry linked')
                                    : L('إعادة فتح الوردية', 'Reopen shift')
                                }
                                onClick={() => {
                                  reopenShiftMut.reset()
                                  setReopenErrorMessage(null)
                                  setShowReopenConfirm(shift)
                                }}
                                className="p-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <RotateCcw className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expandedId === shift.id && (
                        <tr key={`${shift.id}-detail`} className="bg-indigo-50/40 dark:bg-indigo-950/15">
                          <td colSpan={tableColSpan} className="px-4 py-4">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                              <div className="bg-white dark:bg-slate-900 rounded-xl p-3 border border-indigo-100 dark:border-slate-700">
                                <p className="text-xs text-slate-400 mb-1">{L('الرصيد الافتتاحي', 'Opening cash')}</p>
                                <p className="font-bold tabular-nums" dir="ltr">
                                  {fmt(shift.opening_balance)} KWD
                                </p>
                              </div>
                              <div className="bg-white dark:bg-slate-900 rounded-xl p-3 border border-indigo-100 dark:border-slate-700">
                                <p className="text-xs text-slate-400 mb-1">{L('المتوقع (نظام)', 'Expected (system)')}</p>
                                <p className="font-bold text-indigo-600 tabular-nums" dir="ltr">
                                  {fmt(shift.closing_balance_system)} KWD
                                </p>
                              </div>
                              <div className="bg-white dark:bg-slate-900 rounded-xl p-3 border border-indigo-100 dark:border-slate-700">
                                <p className="text-xs text-slate-400 mb-1">{L('الفعلي عند الإغلاق', 'Actual closing')}</p>
                                <p className="font-bold tabular-nums" dir="ltr">
                                  {shift.closing_balance_actual != null ? `${fmt(shift.closing_balance_actual)} KWD` : '—'}
                                </p>
                              </div>
                              <div className="bg-white dark:bg-slate-900 rounded-xl p-3 border border-indigo-100 dark:border-slate-700">
                                <p className="text-xs text-slate-400 mb-1">{L('الفرق', 'Variance')}</p>
                                <p className="font-bold tabular-nums" dir="ltr">
                                  {diff != null && Math.abs(diff) > 0.001 ? fmt(diff) : L('لا فرق', '—')}
                                </p>
                              </div>
                            </div>
                            {shift.sales_by_payment && Object.keys(shift.sales_by_payment).length > 0 && (
                              <>
                                <p className="text-sm font-bold text-slate-500 mb-2">
                                  {L('المبيعات حسب طريقة الدفع', 'Sales by payment type')}
                                </p>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                  {Object.entries(shift.sales_by_payment).map(([method, amount]) => (
                                    <div
                                      key={method}
                                      className="bg-white dark:bg-slate-900 rounded-xl p-3 border border-slate-100 dark:border-slate-700 text-center"
                                    >
                                      <div className="text-lg mb-1">{PAYMENT_ICONS[method] ?? '💰'}</div>
                                      <p className="text-xs text-slate-400">{method}</p>
                                      <p className="text-base font-bold tabular-nums" dir="ltr">
                                        {fmt(amount as number)}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                    )
                  })
                )}
              </tbody>
              {pageSummaryTotals && (
                <tfoot>
                  <tr className="bg-gradient-to-r from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-800/80 border-t-2 border-slate-400 dark:border-slate-500 font-bold text-slate-900 dark:text-slate-100 shadow-[0_-2px_4px_rgba(0,0,0,0.04)]">
                    <td colSpan={summaryLabelColSpan} className="p-3 text-sm leading-tight text-center">
                      {lang === 'ar' ? 'الإجمالي' : 'Total'}
                    </td>
                    {visibleColumns.invoices && (
                      <td className="p-3 text-sm tabular-nums font-semibold leading-tight text-center" dir="ltr">
                        {pageSummaryTotals.sumInvoices}
                      </td>
                    )}
                    {visibleColumns.sales && (
                      <td className="p-3 text-sm tabular-nums font-semibold leading-tight text-center" dir="ltr">
                        {fmt(pageSummaryTotals.sumSales)}
                      </td>
                    )}
                    {visibleColumns.diff && <td className="p-3 text-center" />}
                    {visibleColumns.status && <td className="p-3 text-center" />}
                    <td className="p-3 no-print text-center" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
        {paginator && !reportQuery.isLoading && !reportQuery.isError && (
          <ReportFooter
            totalCount={paginatorTotal}
            currentPage={paginatorPage}
            lastPage={paginatorLast}
            from={rangeFrom}
            to={rangeTo}
            onPageChange={(p) => setPage(p)}
            lang={lang === 'ar' ? 'ar' : 'en'}
            isRtl={isRtl}
            alwaysShowPaginationBar
            showRecordSummary={paginatorTotal > 0}
            recordLabel={lang === 'ar' ? 'وردية' : 'shift'}
            dense
          />
        )}
      </div>

      <div id="pos-shifts-report-print" className="report-print-only" dir={isRtl ? 'rtl' : 'ltr'}>
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
          <h3 className="text-lg font-semibold text-slate-800 mt-4 mb-1">
            {t.nav?.posShiftsReport ?? L('تقرير الورديات', 'POS shifts report')}
          </h3>
          <p className="text-sm text-slate-600">
            {labelPeriod}: {periodLinePrint}
          </p>
        </div>
        <div className="report-print-table-wrap">
          <table className="report-print-table w-full text-base">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-medium">
                {SHIFT_COL_KEYS.filter((k) => visibleColumns[k]).map((k) => (
                  <th key={k} className="px-3 py-2 border-b border-slate-200 text-center">
                    {shiftColTitles[k]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shifts.map((shift) => {
                const diff = shift.difference != null ? shift.difference : null
                return (
                  <tr key={shift.id}>
                    {visibleColumns.shiftNumber && <td className="tabular-nums text-center">{shift.shift_number}</td>}
                    {visibleColumns.cashier && <td className="text-center">{shift.cashier?.name ?? '—'}</td>}
                    {visibleColumns.branch && <td className="text-center">{shift.branch?.name ?? '—'}</td>}
                    {visibleColumns.opened && (
                      <td dir="ltr" className="whitespace-nowrap tabular-nums text-center">
                        {formatShiftDateTimeLocal(shift.opened_at)}
                      </td>
                    )}
                    {visibleColumns.closed && (
                      <td dir="ltr" className="whitespace-nowrap tabular-nums text-center">
                        {shift.closed_at ? formatShiftDateTimeLocal(shift.closed_at) : '—'}
                      </td>
                    )}
                    {visibleColumns.invoices && <td className="tabular-nums text-center">{shift.total_invoices}</td>}
                    {visibleColumns.sales && <td className="tabular-nums text-center">{fmt(shift.total_sales)}</td>}
                    {visibleColumns.diff && (
                      <td className="tabular-nums text-center" dir="ltr">
                        {shift.status === 'open' || diff == null ? '—' : fmt(diff)}
                      </td>
                    )}
                    {visibleColumns.status && (
                      <td className="text-center">{shift.status === 'open' ? L('مفتوحة', 'Open') : L('مغلقة', 'Closed')}</td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="report-print-footer mt-4 text-sm text-slate-600 flex flex-wrap gap-4 justify-center border-t border-slate-200 pt-3">
          <span>
            {L('إجمالي المبيعات', 'Total sales')}: <strong dir="ltr">{fmt(stats?.total_sales ?? 0)}</strong>
          </span>
          <span>
            {L('إجمالي الفواتير', 'Invoices')}: <strong>{stats?.total_invoices ?? 0}</strong>
          </span>
          <span>
            {L('إجمالي الورديات', 'Shifts')}: <strong>{stats?.total_shifts ?? 0}</strong>
          </span>
        </div>
      </div>

      {showClose && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" dir={isRtl ? 'rtl' : 'ltr'}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="font-bold text-slate-900 dark:text-slate-100">
                  {L('إغلاق الوردية', 'Close shift')} {showClose.shift_number}
                </h2>
                <p className="text-xs text-red-600/80 dark:text-red-400/90 mt-0.5">
                  {L('أدخل النقد الموجود في الدرج عند الإغلاق', 'Enter the cash counted in the drawer')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowClose(null)
                  setClosingCashInput('')
                }}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              >
                ×
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="p-3 bg-indigo-50 dark:bg-indigo-950/30 rounded-xl text-xs space-y-1 border border-indigo-100 dark:border-indigo-900">
                <div className="flex justify-between gap-2" dir="ltr">
                  <span className="text-slate-500">{L('المتوقع في الدرج', 'Expected in drawer')}</span>
                  <span className="font-bold text-indigo-600 tabular-nums">{fmt(showClose.closing_balance_system)}</span>
                </div>
                <div className="flex justify-between gap-2" dir="ltr">
                  <span className="text-slate-500">{L('مبيعات', 'Sales')}</span>
                  <span className="font-bold tabular-nums">{fmt(showClose.total_sales)}</span>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">{L('النقد الفعلي (KWD)', 'Actual cash (KWD)')}</label>
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0.000"
                  value={closingCashInput}
                  onChange={(e) => setClosingCashInput(sanitizeDecimalTyping(e.target.value))}
                  className="w-full border rounded-xl px-3 py-2 text-center font-bold dark:bg-slate-800 dark:border-slate-600 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 outline-none"
                  dir="ltr"
                />
                <p className="text-[10px] text-center mt-1 text-slate-500" dir="ltr">
                  {L('فرق', 'Variance')}:{' '}
                  {fmt(amountFromInput(closingCashInput) - showClose.closing_balance_system)}
                </p>
              </div>
              {closeMut.isError && (
                <p className="text-xs text-red-500">
                  {(closeMut.error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                    L('فشل إغلاق الوردية', 'Failed to close shift')}
                </p>
              )}
            </div>
            <div className="flex gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setShowClose(null)
                  setClosingCashInput('')
                }}
                className="px-4 py-2 rounded-xl border text-sm"
              >
                {L('إلغاء', 'Cancel')}
              </button>
              <button
                type="button"
                disabled={closeMut.isPending}
                onClick={() => closeMut.mutate()}
                className="flex-1 py-2 rounded-xl bg-red-600 text-white text-sm font-bold disabled:opacity-40"
              >
                {closeMut.isPending ? L('جاري...', '...') : L('إغلاق', 'Close shift')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showReopenConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-[2px]"
          dir={isRtl ? 'rtl' : 'ltr'}
          role="dialog"
          aria-modal="true"
          aria-labelledby="reopen-shift-title"
        >
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200/80 dark:border-slate-600/80 overflow-hidden ring-1 ring-black/5 dark:ring-white/10">
            <div className="px-5 pt-5 pb-4">
              <div className="flex gap-4 items-start">
                <div className="shrink-0 w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-500/15 flex items-center justify-center text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="w-6 h-6" strokeWidth={2} aria-hidden />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <h2 id="reopen-shift-title" className="text-lg font-bold text-slate-900 dark:text-slate-50 leading-snug">
                    {L('إعادة فتح الوردية', 'Reopen shift')}
                  </h2>
                  <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 tabular-nums" dir="ltr">
                    {showReopenConfirm.shift_number}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    reopenShiftMut.reset()
                    setShowReopenConfirm(null)
                  }}
                  className="shrink-0 -mt-1 -me-1 p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
                  aria-label={L('إغلاق', 'Close')}
                >
                  <span className="text-xl leading-none">×</span>
                </button>
              </div>
              <div className="mt-4 rounded-xl border border-amber-200/80 dark:border-amber-500/25 bg-amber-50/90 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-950 dark:text-amber-100/95 leading-relaxed">
                {L(
                  'سيتم إرجاع الوردية إلى حالة «مفتوحة». بيانات الإغلاق الحالية (النقد الفعلي، المتوقع، الفرق، وتقرير الإغلاق إن وُجد) ستُمسح ولا يمكن التراجع عن ذلك من هذه الشاشة.',
                  'The shift will return to Open. Current closing data (actual cash, expected amount, variance, and any closing report snapshot) will be cleared. This cannot be undone from here.',
                )}
              </div>
            </div>
            <div className="flex gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
              <button
                type="button"
                onClick={() => {
                  reopenShiftMut.reset()
                  setShowReopenConfirm(null)
                }}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 transition-colors"
              >
                {L('إلغاء', 'Cancel')}
              </button>
              <button
                type="button"
                disabled={reopenShiftMut.isPending && reopenShiftMut.variables === showReopenConfirm.id}
                onClick={() => reopenShiftMut.mutate(showReopenConfirm.id)}
                className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400 text-white text-sm font-bold shadow-sm disabled:opacity-45 disabled:cursor-not-allowed transition-colors"
              >
                <RotateCcw className="w-4 h-4 shrink-0" aria-hidden />
                {reopenShiftMut.isPending && reopenShiftMut.variables === showReopenConfirm.id
                  ? L('جاري إعادة الفتح...', 'Reopening...')
                  : L('تأكيد إعادة الفتح', 'Confirm reopen')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditShift && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" dir={isRtl ? 'rtl' : 'ltr'}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="font-bold text-slate-900 dark:text-slate-100">
                  {L('تعديل الوردية', 'Edit shift')} {showEditShift.shift_number}
                </h2>
                <p className="text-xs text-amber-700 dark:text-amber-400/95 mt-0.5">
                  {L('تعديل الرصيد الافتتاحي فقط — ليس إغلاق الوردية', 'Opening cash only — not closing the shift')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  updateShiftMut.reset()
                  setShowEditShift(null)
                  setEditOpeningCashInput('')
                }}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              >
                ×
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-500">
                {L(
                  'يمكن تعديل الرصيد الافتتاحي فقط طالما الوردية مفتوحة.',
                  'Only opening cash can be edited while the shift is open.',
                )}
              </p>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">
                  {L('الرصيد الافتتاحي (KWD)', 'Opening cash (KWD)')}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0.000"
                  value={editOpeningCashInput}
                  onChange={(e) => setEditOpeningCashInput(sanitizeDecimalTyping(e.target.value))}
                  className="w-full border rounded-xl px-3 py-2 text-center font-bold dark:bg-slate-800 dark:border-slate-600 focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 outline-none"
                  dir="ltr"
                />
              </div>
              {updateShiftMut.isError && (
                <p className="text-xs text-red-500">
                  {(updateShiftMut.error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                    L('فشل التعديل', 'Update failed')}
                </p>
              )}
            </div>
            <div className="flex gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  updateShiftMut.reset()
                  setShowEditShift(null)
                  setEditOpeningCashInput('')
                }}
                className="px-4 py-2 rounded-xl border text-sm"
              >
                {L('إلغاء', 'Cancel')}
              </button>
              <button
                type="button"
                disabled={updateShiftMut.isPending}
                onClick={() => updateShiftMut.mutate()}
                className="flex-1 py-2 rounded-xl bg-amber-600 text-white text-sm font-bold disabled:opacity-40"
              >
                {updateShiftMut.isPending ? L('جاري...', '...') : L('حفظ', 'Save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {reopenErrorMessage && (
        <div className="fixed bottom-4 start-4 end-4 z-50 no-print md:start-auto md:end-4 md:max-w-md" dir={isRtl ? 'rtl' : 'ltr'}>
          <div className="rounded-xl border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm shadow-lg flex justify-between gap-3 items-start">
            <span>{reopenErrorMessage}</span>
            <button type="button" className="shrink-0 font-bold" onClick={() => setReopenErrorMessage(null)}>
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
