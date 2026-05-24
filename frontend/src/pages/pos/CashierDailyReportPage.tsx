import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchBranches,
  fetchCashierDailyReport,
  fetchCashierDailyReportCashiers,
  fetchCashierDailyReportShifts,
} from '../../api/tenant'
import type { CashierDailyReport, CashierDailyReportShiftOption } from '../../types/cashierReport'
import { BarChart2, Printer, Receipt, Scale, ArrowRight, Loader2 } from 'lucide-react'
import SearchableSelect from '../../components/ui/SearchableSelect'
import { getReportPeriodRange, type ReportPeriodKey } from '../../utils/date'

function toBranches(res: unknown): { id: number; name: string }[] {
  if (Array.isArray(res)) return res as { id: number; name: string }[]
  if (res && typeof res === 'object' && 'data' in res) {
    const d = (res as { data: unknown }).data
    return Array.isArray(d) ? (d as { id: number; name: string }[]) : []
  }
  return []
}

const PAYMENT_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  cash: { label: 'نقدي', color: '#059669', bg: '#ecfdf5' },
  نقدي: { label: 'نقدي', color: '#059669', bg: '#ecfdf5' },
  card: { label: 'بطاقة', color: '#5b21b6', bg: '#f5f3ff' },
  knet: { label: 'K-Net', color: '#2563eb', bg: '#eff6ff' },
  transfer: { label: 'تحويل', color: '#0891b2', bg: '#ecfeff' },
  bank: { label: 'بنكي', color: '#0891b2', bg: '#ecfeff' },
  mixed: { label: 'مختلط', color: '#d97706', bg: '#fffbeb' },
  other: { label: 'أخرى', color: '#6b7280', bg: '#f9fafb' },
}

function getPayStyle(method: string, labelFromApi?: string) {
  const key = method?.toLowerCase() ?? 'other'
  const base = PAYMENT_STYLES[key] ?? PAYMENT_STYLES.other
  if (labelFromApi && key === 'other') {
    return { ...base, label: labelFromApi }
  }
  return base
}

function fmt3(n: number) {
  return (Number.isFinite(n) ? n : 0).toFixed(3)
}

function paymentStatusLabel(code: string, ar: boolean): string {
  const map: Record<string, [string, string]> = {
    paid: ['مدفوع', 'Paid'],
    partial: ['جزئي', 'Partial'],
    unpaid: ['غير مدفوع', 'Unpaid'],
    na: ['—', '—'],
  }
  const pair = map[code] ?? [code, code]
  return ar ? pair[0] : pair[1]
}

function shiftOptionLabel(s: CashierDailyReportShiftOption, L: (a: string, e: string) => string) {
  const closed = s.closed_time ?? L('جارية', 'Open')
  const st = s.status === 'open' ? ` · ${L('مفتوحة', 'Open')}` : ''
  return `${s.number} | ${s.opened_time} — ${closed} | ${s.branch} | ${fmt3(s.total_sales)} KWD${st}`
}

export default function CashierDailyReportPage() {
  const { shiftId: shiftIdParam } = useParams<{ shiftId: string }>()
  const location = useLocation()
  const isTodayRoute = location.pathname === '/pos/cashier/today'
  const urlShiftId = shiftIdParam ? parseInt(shiftIdParam, 10) : NaN
  const initialShiftId = Number.isFinite(urlShiftId) ? urlShiftId : null

  const { currentTenant, user, can, meData } = useAuth()
  const tenantId = currentTenant?.id
  const isRestrictedBranch = !!(meData?.restrict_to_branch_warehouse && meData?.default_branch_id != null)
  const appliedBranchRef = useRef(false)
  const { t, isRtl, lang } = useLanguage()
  const L = (ar: string, en: string) => (isRtl ? ar : en)

  const [fromDate, setFromDate] = useState(() => getReportPeriodRange('all').from_date)
  const [toDate, setToDate] = useState(() => getReportPeriodRange('all').to_date)
  const [periodPreset, setPeriodPreset] = useState<ReportPeriodKey | 'custom'>('all')
  const [filterUserId, setFilterUserId] = useState<number | ''>('')
  const [branchId, setBranchId] = useState<string>('')
  const [selectedShiftId, setSelectedShiftId] = useState<number | null>(initialShiftId)
  const [activeTab, setActiveTab] = useState<'daily' | 'invoices' | 'reconcile'>('daily')
  const [actualInput, setActualInput] = useState('')
  const syncedFiltersFromReport = useRef(false)

  useEffect(() => {
    if (isTodayRoute && user?.id) {
      setFilterUserId(user.id)
    }
  }, [isTodayRoute, user?.id])

  useEffect(() => {
    if (appliedBranchRef.current || !isRestrictedBranch || meData?.default_branch_id == null) return
    setBranchId(String(meData.default_branch_id))
    appliedBranchRef.current = true
  }, [isRestrictedBranch, meData?.default_branch_id])

  const branchesQuery = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId!),
    enabled: Boolean(tenantId),
    staleTime: 60_000,
  })
  const branches = useMemo(() => toBranches(branchesQuery.data), [branchesQuery.data])

  const branchIdForApi = useMemo(() => {
    if (!branchId) return undefined
    const n = parseInt(branchId, 10)
    return Number.isFinite(n) && n > 0 ? n : undefined
  }, [branchId])

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
    setSelectedShiftId(null)
    if (preset !== 'custom') {
      const range = getReportPeriodRange(preset)
      setFromDate(range.from_date)
      setToDate(range.to_date)
    }
  }

  const showCustomDateFields = periodPreset === 'custom'

  /** يحدّث نطاق «اليوم/الأمس» مع تقويم المتصفح */
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

  const cashiersQuery = useQuery({
    queryKey: ['cashier-daily-report-cashiers', tenantId],
    queryFn: () => fetchCashierDailyReportCashiers(tenantId!),
    enabled: Boolean(tenantId),
    staleTime: 60_000,
  })

  const dateToParam = toDate !== fromDate ? toDate : undefined
  const shiftsQuery = useQuery({
    queryKey: ['cashier-daily-report-shifts', tenantId, fromDate, dateToParam ?? '', filterUserId, branchIdForApi ?? ''],
    queryFn: () =>
      fetchCashierDailyReportShifts(tenantId!, {
        date: fromDate,
        date_to: dateToParam,
        user_id: filterUserId === '' ? undefined : filterUserId,
        branch_id: branchIdForApi,
      }),
    enabled: Boolean(tenantId && fromDate),
    staleTime: 15_000,
  })

  const shiftRows = shiftsQuery.data ?? []

  const filterGridClass =
    'grid w-full gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))]'
  const filterCellClass = 'min-w-0 w-full'

  const branchFilterOptions = useMemo(() => {
    if (isRestrictedBranch && meData?.default_branch_id != null) {
      const id = meData.default_branch_id
      const name =
        branches.find((b) => b.id === id)?.name ?? (lang === 'ar' ? 'الفرع' : 'Branch')
      return [{ value: id, label: name }]
    }
    return [
      { value: 0, label: lang === 'ar' ? 'الفرع' : 'Select branch' },
      ...branches.map((b) => ({ value: b.id, label: b.name })),
    ]
  }, [branches, lang, isRestrictedBranch, meData?.default_branch_id])

  const cashierFilterOptions = useMemo(
    () => [
      {
        value: 0,
        label: lang === 'ar' ? 'الكاشير — الكل' : 'Cashier — All',
        primaryLabel: lang === 'ar' ? 'الكاشير — الكل' : 'Cashier — All',
      },
      ...(cashiersQuery.data ?? []).map((c) => ({
        value: c.id,
        label: c.name,
        searchText: c.name,
        primaryLabel: lang === 'ar' ? 'الكاشير' : 'Cashier',
        secondaryLabel: c.name,
      })),
    ],
    [cashiersQuery.data, lang],
  )

  const shiftFilterOptions = useMemo(() => {
    const Ls = (ar: string, en: string) => (isRtl ? ar : en)
    return [
      { value: 0, label: lang === 'ar' ? 'الوردية' : 'Select shift' },
      ...shiftRows.map((s) => ({
        value: s.id,
        label: shiftOptionLabel(s, Ls),
        searchText: `${s.number} ${s.cashier_name} ${s.branch}`,
      })),
    ]
  }, [shiftRows, lang, isRtl])

  useEffect(() => {
    if (shiftRows.length !== 1) return
    if (selectedShiftId != null) return
    setSelectedShiftId(shiftRows[0].id)
  }, [shiftRows, selectedShiftId])

  useEffect(() => {
    if (selectedShiftId == null) return
    if (shiftRows.some((s) => s.id === selectedShiftId)) return
    setSelectedShiftId(null)
  }, [shiftRows, selectedShiftId])

  const reportQuery = useQuery({
    queryKey: ['cashier-daily-report-data', tenantId, selectedShiftId],
    queryFn: () => fetchCashierDailyReport(tenantId!, selectedShiftId!),
    enabled: Boolean(tenantId && selectedShiftId != null && selectedShiftId > 0),
    retry: 1,
  })

  const report: CashierDailyReport | undefined = reportQuery.data
  const reportErrorMsg = useMemo(() => {
    const e = reportQuery.error
    if (!e) return null
    if (isAxiosError(e)) {
      const msg = (e.response?.data as { message?: string } | undefined)?.message
      return msg ?? e.message
    }
    return String(e)
  }, [reportQuery.error])

  useEffect(() => {
    if (!report?.shift || syncedFiltersFromReport.current) return
    if (!initialShiftId || report.shift.id !== initialShiftId) return
    if (report.shift.opened_date) {
      setPeriodPreset('custom')
      setFromDate(report.shift.opened_date)
      setToDate(report.shift.opened_date)
    }
    if (report.shift.user_id != null && report.shift.user_id > 0) {
      setFilterUserId(report.shift.user_id)
    }
    if (report.shift.branch_id != null && report.shift.branch_id > 0 && !isRestrictedBranch) {
      setBranchId(String(report.shift.branch_id))
    }
    syncedFiltersFromReport.current = true
  }, [report, initialShiftId, isRestrictedBranch])

  useEffect(() => {
    if (!report) return
    const a = report.reconciliation.actual_in_drawer
    if (a != null && Number.isFinite(a)) {
      setActualInput(fmt3(a))
    } else {
      setActualInput('')
    }
  }, [report])

  const actualNum = useMemo(() => {
    const n = parseFloat(String(actualInput).replace(/,/g, ''))
    return Number.isFinite(n) ? n : 0
  }, [actualInput])

  const difference = useMemo(() => {
    if (!report) return 0
    const exp = report.reconciliation.expected_in_drawer
    return Math.round((actualNum - exp) * 1000) / 1000
  }, [report, actualNum])

  const totalPayments = useMemo(() => {
    if (!report) return 0
    return Object.values(report.payment_breakdown).reduce((s, v) => s + (v?.amount ?? 0), 0)
  }, [report])

  const getPercent = (amount: number) =>
    totalPayments > 0 ? ((amount / totalPayments) * 100).toFixed(1) : '0'

  if (!tenantId) {
    return (
      <div className="p-6 text-center text-slate-500" dir={isRtl ? 'rtl' : 'ltr'}>
        {L('اختر شركة', 'Select a company')}
      </div>
    )
  }

  const loadingShifts = shiftsQuery.isFetching
  const showNoShiftsHint =
    !loadingShifts &&
    !shiftsQuery.isLoading &&
    shiftRows.length === 0 &&
    Boolean(fromDate) &&
    !shiftsQuery.isError

  const labelPeriod = L('الفترة', 'Period')
  const labelFrom = L('من تاريخ', 'From date')
  const labelTo = L('إلى تاريخ', 'To date')
  const customDateInputClass =
    'h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-sm bg-white dark:bg-slate-800 dark:text-slate-100 w-[140px]'

  return (
    <div className="p-4 space-y-4 w-full min-w-0 max-w-full" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* شريط علوي: رجوع | فلتر الفترة (نفس ShiftsReport) | طباعة */}
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between lg:gap-4 border-b border-slate-200 dark:border-slate-700 pb-3 no-print">
        <div className="flex items-center gap-3 min-w-0 shrink-0">
          <Link
            to="/pos/shifts-report"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-indigo-600 dark:text-slate-300 shrink-0"
          >
            {isRtl ? <ArrowRight className="w-4 h-4 rotate-180" /> : <ArrowRight className="w-4 h-4" />}
            {L('تقرير الورديات', 'Shifts report')}
          </Link>
        </div>
        <div className="flex flex-1 flex-wrap items-center justify-center gap-2 min-w-0">
          <span className="text-sm text-slate-600 dark:text-slate-400 shrink-0">{labelPeriod}</span>
          <select
            value={periodPreset}
            onChange={(e) => applyPeriodPreset((e.target.value as ReportPeriodKey | 'custom') || 'all')}
            className="h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-sm bg-white dark:bg-slate-800 dark:text-slate-100 min-w-[150px]"
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
                    setSelectedShiftId(null)
                  }}
                  className={customDateInputClass}
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
                    setSelectedShiftId(null)
                  }}
                  className={customDateInputClass}
                  title={labelTo}
                />
              </div>
            </>
          )}
        </div>
        <div className="shrink-0">
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!report}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 h-9 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <Printer className="w-4 h-4 shrink-0" />
            {L('طباعة', 'Print')}
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-2xl p-4 shadow-sm no-print">
        <div className={filterGridClass}>
          <div className={filterCellClass}>
            <SearchableSelect
              options={branchFilterOptions}
              value={
                isRestrictedBranch && meData?.default_branch_id != null
                  ? meData.default_branch_id
                  : branchId === ''
                    ? 0
                    : Number(branchId) || 0
              }
              onChange={(v) => {
                setBranchId(v === 0 || v == null ? '' : String(v))
                setSelectedShiftId(null)
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
              options={cashierFilterOptions}
              value={filterUserId === '' ? 0 : filterUserId}
              onChange={(v) => {
                setFilterUserId(v === 0 || v == null ? '' : Number(v))
                setSelectedShiftId(null)
              }}
              disabled={!can('invoices.view')}
              placeholder={lang === 'ar' ? 'الكاشير' : 'Select cashier'}
              textAlign={isRtl ? 'right' : 'left'}
              wrapOptions
              matchTriggerWidth
              className="w-full min-w-0"
              aria-label={L('تصفية حسب الكاشير', 'Filter by cashier')}
            />
          </div>
          <div className={`${filterCellClass} flex items-center gap-2`}>
            <SearchableSelect
              options={shiftFilterOptions}
              value={selectedShiftId == null || selectedShiftId < 1 ? 0 : selectedShiftId}
              onChange={(v) => {
                setSelectedShiftId(v === 0 || v == null ? null : Number(v))
              }}
              disabled={shiftRows.length === 0 && !loadingShifts}
              placeholder={lang === 'ar' ? 'الوردية' : 'Select shift'}
              textAlign={isRtl ? 'right' : 'left'}
              wrapOptions
              matchTriggerWidth
              dropdownMinWidth={320}
              className="w-full min-w-0 flex-1"
              aria-label={L('الوردية', 'Shift')}
            />
            {loadingShifts && (
              <Loader2 className="w-4 h-4 shrink-0 animate-spin text-slate-400" aria-hidden />
            )}
          </div>
        </div>

        {shiftsQuery.isError && (
          <p className="text-xs text-red-600 mt-3 text-center">
            {L('تعذر تحميل قائمة الورديات.', 'Failed to load shifts.')}
          </p>
        )}
        {showNoShiftsHint && (
          <p className="text-xs text-slate-400 text-center mt-3">
            {L(
              'لا توجد ورديات في هذه الفترة للفلاتر المحددة.',
              'No shifts for the selected period / branch / cashier.',
            )}
          </p>
        )}
      </div>

      {!selectedShiftId && (
        <div className="text-center py-16 text-slate-400 no-print border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
          <BarChart2 className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">
            {L('اختر وردية لعرض التقرير', 'Pick a shift to view the report')}
          </p>
          <p className="text-xs text-slate-500">
            {L(
              'حدد الفرع والكاشير والفترة ثم اختر الوردية من القائمة.',
              'Set branch, cashier and period, then choose a shift.',
            )}
          </p>
        </div>
      )}

      {selectedShiftId != null && reportQuery.isLoading && (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          <span>{t.loading ?? L('جاري التحميل...', 'Loading...')}</span>
        </div>
      )}

      {selectedShiftId != null && reportQuery.isError && (
        <div className="p-6 text-center text-red-600 rounded-xl border border-red-100 bg-red-50/50 dark:bg-red-950/20 dark:border-red-900 dark:text-red-300">
          {reportErrorMsg ?? L('تعذر تحميل التقرير.', 'Failed to load report.')}
        </div>
      )}

      {selectedShiftId != null && report && (
        <>
          <div className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-600 no-print">
            {(
              [
                { key: 'daily' as const, label: L('اليومية', 'Daily'), icon: BarChart2 },
                {
                  key: 'invoices' as const,
                  label: L(`الفواتير (${report.kpis.total_invoices})`, `Invoices (${report.kpis.total_invoices})`),
                  icon: Receipt,
                },
                { key: 'reconcile' as const, label: L('التسوية النقدية', 'Cash reconciliation'), icon: Scale },
              ]
            ).map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border border-b-0 transition-colors ${
                    activeTab === tab.key
                      ? 'bg-white text-indigo-600 border-slate-200 -mb-px dark:bg-slate-900 dark:border-slate-600 dark:text-indigo-400'
                      : 'bg-slate-50 text-slate-500 border-transparent hover:bg-slate-100 dark:bg-slate-800/60 dark:text-slate-400 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {tab.label}
                </button>
              )
            })}
          </div>

          <ReportBody
            activeTab={activeTab}
            report={report}
            L={L}
            isRtl={isRtl}
            isOpen={report.shift.status === 'open'}
            actualInput={actualInput}
            setActualInput={setActualInput}
            difference={difference}
            getPercent={getPercent}
            paymentStatusLabel={paymentStatusLabel}
          />
        </>
      )}
    </div>
  )
}

function ReportBody({
  activeTab,
  report,
  L,
  isRtl,
  isOpen,
  actualInput,
  setActualInput,
  difference,
  getPercent,
  paymentStatusLabel,
}: {
  activeTab: 'daily' | 'invoices' | 'reconcile'
  report: CashierDailyReport
  L: (ar: string, en: string) => string
  isRtl: boolean
  isOpen: boolean
  actualInput: string
  setActualInput: (v: string) => void
  difference: number
  getPercent: (n: number) => string
  paymentStatusLabel: (code: string, ar: boolean) => string
}) {
  const { shift, kpis, payment_breakdown, reconciliation, invoices } = report

  const KPI_CARDS = [
    {
      label: L('إجمالي المبيعات', 'Total sales'),
      value: fmt3(kpis.total_sales),
      sub: 'KWD',
      color: '#059669',
      border: '#a7f3d0',
    },
    {
      label: L('عدد الفواتير', 'Invoices'),
      value: String(kpis.total_invoices),
      sub: L('فاتورة', 'invoices'),
      color: '#2563eb',
      border: '#bfdbfe',
    },
    {
      label: L('متوسط الفاتورة', 'Avg. invoice'),
      value: fmt3(kpis.avg_invoice),
      sub: 'KWD',
      color: '#d97706',
      border: '#fde68a',
    },
    {
      label: L('الرصيد الافتتاحي', 'Opening cash'),
      value: fmt3(kpis.opening_balance),
      sub: 'KWD',
      color: '#6b7280',
      border: '#e5e7eb',
    },
  ]

  const electronicEntries = Object.entries(payment_breakdown).filter(
    ([m]) => !['cash', 'نقدي'].includes(m.toLowerCase()),
  )

  return (
    <>
      {activeTab === 'daily' && (
        <>
          <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-600 rounded-2xl p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold text-slate-900 dark:text-slate-100 text-base mb-2">
                  {L('يومية صندوق الكاشير', 'Cashier cash report')} — {shift.cashier}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <span>
                    {L('الفرع', 'Branch')}: {shift.branch}
                  </span>
                  <span>
                    {L('البداية', 'Opened')}: {shift.opened_at}
                  </span>
                  {shift.closed_at && (
                    <span>
                      {L('النهاية', 'Closed')}: {shift.closed_at}
                    </span>
                  )}
                  <span>
                    {L('المدة', 'Duration')}: {shift.duration}
                  </span>
                  <span dir="ltr" className="tabular-nums">
                    {shift.number}
                  </span>
                </div>
              </div>
              <span
                className={`text-xs px-3 py-1.5 rounded-full font-semibold shrink-0 ${
                  isOpen
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                    : 'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600'
                }`}
              >
                {isOpen ? L('مفتوحة', 'Open') : L('مغلقة', 'Closed')}
              </span>
            </div>
          </div>

          <p className="sr-only">
            {L('ملخص المؤشرات وتوزيع المبيعات حسب طريقة الدفع', 'KPI summary and sales by payment method')}
          </p>
          <div
            className="flex flex-nowrap items-stretch gap-2 sm:gap-3 w-full min-w-0 overflow-x-auto overscroll-x-contain pb-0.5"
            role="group"
          >
            {KPI_CARDS.map((k) => (
              <div
                key={k.label}
                className="flex-1 min-w-0 basis-0 flex flex-col justify-center bg-white dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-700 shadow-sm px-2.5 py-3 sm:px-3.5 sm:py-4 min-h-[5.25rem] sm:min-h-[5.75rem]"
                style={{ borderInlineEnd: `3px solid ${k.border}` }}
              >
                <p className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wide mb-1 leading-snug text-center truncate">
                  {k.label}
                </p>
                <p
                  className="text-base sm:text-lg font-bold tabular-nums mb-1 text-center leading-tight truncate"
                  style={{ color: k.color }}
                  dir="ltr"
                >
                  {k.value}
                </p>
                <p className="text-[10px] sm:text-xs text-slate-400 text-center truncate">{k.sub}</p>
              </div>
            ))}
            {Object.entries(payment_breakdown).map(([method, data]) => {
              const style = getPayStyle(method, data.label)
              const pct = getPercent(data.amount)
              return (
                <div
                  key={method}
                  className="flex-1 min-w-0 basis-0 flex flex-col justify-center bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-lg px-2.5 py-3 sm:px-3.5 sm:py-4 text-center shadow-sm min-h-[5.25rem] sm:min-h-[5.75rem]"
                  style={{ borderInlineEnd: `3px solid ${style.color}` }}
                  title={L('توزيع المبيعات حسب طريقة الدفع', 'Sales by payment method')}
                >
                  <p className="text-[10px] sm:text-xs text-slate-500 mb-1 leading-snug truncate">{style.label}</p>
                  <p
                    className="text-base sm:text-lg font-bold tabular-nums mb-1 leading-tight truncate"
                    style={{ color: style.color }}
                    dir="ltr"
                  >
                    {fmt3(data.amount)}
                  </p>
                  <p className="text-[10px] sm:text-xs text-slate-400 mb-1.5 leading-snug truncate">
                    {data.count} · {pct}%
                  </p>
                  <div className="h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mx-px min-w-0 shrink-0">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${Math.min(100, parseFloat(pct))}%`, background: style.color }}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
              {L('ملخص صندوق اليوم', 'Drawer summary')}
            </p>
            <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 rounded-2xl p-4 space-y-1.5">
              {[
                {
                  label: L('الرصيد الافتتاحي', 'Opening balance'),
                  value: reconciliation.opening_balance,
                  sign: '',
                  pos: false,
                },
                {
                  label: L('مبيعات نقدية', 'Cash sales'),
                  value: reconciliation.cash_sales,
                  sign: '+',
                  pos: true,
                },
                {
                  label: L('مرتجعات (من إجمالي الوردية)', 'Returns (shift total)'),
                  value: reconciliation.cash_returns,
                  sign: '-',
                  pos: false,
                },
                ...(reconciliation.total_expenses != null && reconciliation.total_expenses > 0.0005
                  ? [
                      {
                        label: L('مصاريف الصندوق', 'Drawer expenses'),
                        value: reconciliation.total_expenses,
                        sign: '-',
                        pos: false,
                      },
                    ]
                  : []),
                {
                  label: L('خصومات نقدية', 'Cash discounts'),
                  value: reconciliation.cash_discounts,
                  sign: '-',
                  pos: false,
                },
              ].map((r) => (
                <div key={r.label} className="flex justify-between text-sm gap-2">
                  <span className="text-slate-500 dark:text-slate-400">{r.label}</span>
                  <span
                    className={`font-medium tabular-nums shrink-0 ${r.pos ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-200'}`}
                    dir="ltr"
                  >
                    {r.sign ? `${r.sign} ` : ''}
                    {fmt3(r.value)} KWD
                  </span>
                </div>
              ))}
              <div className="border-t border-slate-200 dark:border-slate-600 mt-2 pt-2 flex justify-between gap-2">
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {L('الرصيد المتوقع في الدرج', 'Expected in drawer')}
                </span>
                <span className="text-sm font-bold text-emerald-600 tabular-nums dark:text-emerald-400" dir="ltr">
                  {fmt3(reconciliation.expected_in_drawer)} KWD
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === 'invoices' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {L('فواتير الوردية', 'Shift invoices')}
            </span>
            <span className="text-xs text-slate-400">{invoices.length}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-700">
                  {[
                    L('رقم الفاتورة', 'Invoice #'),
                    L('الوقت', 'Time'),
                    L('العميل', 'Customer'),
                    L('الأصناف', 'Items'),
                    L('الإجمالي', 'Total'),
                    L('الدفع', 'Payment'),
                    L('الرصيد', 'Balance'),
                    L('الحالة', 'Status'),
                  ].map((h) => (
                    <th
                      key={h}
                      className="text-center text-[10px] font-semibold text-slate-500 dark:text-slate-400 px-3 py-2.5 whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-slate-400">
                      {L('لا توجد فواتير في هذه الوردية', 'No invoices in this shift')}
                    </td>
                  </tr>
                ) : (
                  invoices.map((inv) => {
                    const pStyle = getPayStyle(inv.payment_method, inv.payment_method_label)
                    return (
                      <tr
                        key={inv.id}
                        className="border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                      >
                        <td className="px-3 py-2.5 text-center font-semibold text-indigo-600 tabular-nums">{inv.number}</td>
                        <td className="px-3 py-2.5 text-center text-slate-500 tabular-nums" dir="ltr">
                          {inv.date ? `${inv.date} ` : ''}
                          {inv.time}
                        </td>
                        <td className="px-3 py-2.5 text-center text-slate-700 dark:text-slate-200 max-w-[140px] truncate">
                          {inv.customer_name}
                        </td>
                        <td className="px-3 py-2.5 text-center text-slate-500 text-xs max-w-[180px] truncate">
                          {inv.items_summary}
                        </td>
                        <td className="px-3 py-2.5 text-center font-bold text-emerald-600 tabular-nums" dir="ltr">
                          {fmt3(inv.total)}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span
                            className="text-[10px] px-2 py-0.5 rounded-md font-medium inline-block max-w-[120px] truncate"
                            style={{ background: pStyle.bg, color: pStyle.color }}
                          >
                            {inv.payment_method_label ?? pStyle.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center text-slate-500 tabular-nums" dir="ltr">
                          {fmt3(inv.balance)}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 font-medium">
                            {paymentStatusLabel(inv.status, isRtl)}
                          </span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 gap-2">
            <span className="text-xs text-slate-500">
              {L('إجمالي', 'Total')} {invoices.length}
            </span>
            <span className="text-sm font-bold text-emerald-600 tabular-nums dark:text-emerald-400" dir="ltr">
              {fmt3(kpis.total_sales)} KWD
            </span>
          </div>
        </div>
      )}

      {activeTab === 'reconcile' && (
        <>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
            {L('التسوية النقدية — جرد الصندوق', 'Cash reconciliation')}
          </p>
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm mb-4">
            {[
              {
                label: L('الرصيد الافتتاحي (نقد في الدرج)', 'Opening cash in drawer'),
                value: `${fmt3(reconciliation.opening_balance)} KWD`,
                color: 'text-slate-700 dark:text-slate-200',
              },
              {
                label: L('مبيعات نقدية', 'Cash sales'),
                value: `+ ${fmt3(reconciliation.cash_sales)} KWD`,
                color: 'text-emerald-600 dark:text-emerald-400',
              },
              {
                label: L('مرتجعات (من إجمالي الوردية)', 'Returns (shift)'),
                value: `- ${fmt3(reconciliation.cash_returns)} KWD`,
                color: 'text-slate-500',
              },
              {
                label: L('خصومات نقدية', 'Cash discounts'),
                value: `- ${fmt3(reconciliation.cash_discounts)} KWD`,
                color: 'text-slate-500',
              },
            ].map((r) => (
              <div
                key={r.label}
                className="flex justify-between items-center px-4 py-3 border-b border-slate-50 dark:border-slate-800 text-sm gap-2"
              >
                <span className="text-slate-500 dark:text-slate-400">{r.label}</span>
                <span className={`font-medium tabular-nums shrink-0 ${r.color}`} dir="ltr">
                  {r.value}
                </span>
              </div>
            ))}
            <div className="flex justify-between items-center px-4 py-3 border-b border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50 text-sm font-semibold gap-2">
              <span className="text-slate-800 dark:text-slate-100">
                {L('الرصيد المتوقع في الدرج (نظام)', 'Expected (system)')}
              </span>
              <span className="text-emerald-600 tabular-nums dark:text-emerald-400" dir="ltr">
                {fmt3(reconciliation.expected_in_drawer)} KWD
              </span>
            </div>
            <div className="flex justify-between items-center px-4 py-3 border-b border-slate-50 dark:border-slate-800 text-sm gap-2 flex-wrap">
              <span className="text-slate-500 dark:text-slate-400">
                {L('الرصيد الفعلي (عد يدوي)', 'Actual (manual count)')}
              </span>
              <input
                type="number"
                step="0.001"
                min="0"
                value={actualInput}
                onChange={(e) => setActualInput(e.target.value)}
                className="w-32 border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm font-bold text-center bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 tabular-nums"
                placeholder="0.000"
                dir="ltr"
              />
            </div>
            <div
              className={`flex justify-between items-center px-4 py-3 text-sm font-bold gap-2 ${
                Math.abs(difference) < 0.001
                  ? 'bg-emerald-50 dark:bg-emerald-950/30'
                  : difference < 0
                    ? 'bg-red-50 dark:bg-red-950/30'
                    : 'bg-sky-50 dark:bg-sky-950/30'
              }`}
            >
              <span
                className={
                  Math.abs(difference) < 0.001
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : difference < 0
                      ? 'text-red-700 dark:text-red-300'
                      : 'text-sky-700 dark:text-sky-300'
                }
              >
                {L('الفرق (عجز / زيادة)', 'Variance')}
              </span>
              <span
                className={`tabular-nums shrink-0 ${
                  Math.abs(difference) < 0.001
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : difference < 0
                      ? 'text-red-700 dark:text-red-300'
                      : 'text-sky-700 dark:text-sky-300'
                }`}
                dir="ltr"
              >
                {Math.abs(difference) < 0.001
                  ? L('0.000 KWD — لا فرق', '0.000 KWD — balanced')
                  : difference > 0
                    ? `+ ${fmt3(difference)} KWD (${L('زيادة', 'overage')})`
                    : `${fmt3(difference)} KWD (${L('عجز', 'shortage')})`}
              </span>
            </div>
          </div>

          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
            {L('مبيعات الدفع الإلكتروني', 'Non-cash payments')}
          </p>
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm mb-4">
            {electronicEntries.length === 0 ? (
              <div className="px-4 py-6 text-center text-slate-400 text-sm">
                {L('لا توجد مدفوعات إلكترونية', 'No electronic payments')}
              </div>
            ) : (
              electronicEntries.map(([method, data]) => {
                const style = getPayStyle(method, data.label)
                return (
                  <div
                    key={method}
                    className="flex justify-between items-center px-4 py-3 border-b border-slate-50 dark:border-slate-800 text-sm gap-2"
                  >
                    <span className="text-slate-500 dark:text-slate-400">
                      {style.label} ({data.count})
                    </span>
                    <span className="font-medium tabular-nums text-slate-800 dark:text-slate-200" dir="ltr">
                      {fmt3(data.amount)} KWD
                    </span>
                  </div>
                )
              })
            )}
            <div className="flex justify-between items-center px-4 py-3 bg-slate-50 dark:bg-slate-800/50 text-sm font-semibold gap-2">
              <span className="text-slate-700 dark:text-slate-200">
                {L('إجمالي غير النقدي', 'Non-cash total')}
              </span>
              <span className="text-slate-900 dark:text-slate-100 tabular-nums" dir="ltr">
                {fmt3(electronicEntries.reduce((s, [, d]) => s + (d?.amount ?? 0), 0))} KWD
              </span>
            </div>
          </div>

          <div className="bg-emerald-50 dark:bg-emerald-950/25 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-4 flex justify-between items-center gap-2">
            <span className="font-semibold text-emerald-900 dark:text-emerald-200">
              {L('إجمالي المبيعات (نقدي + إلكتروني)', 'Total sales (cash + non-cash)')}
            </span>
            <span className="text-lg font-bold text-emerald-700 tabular-nums dark:text-emerald-400" dir="ltr">
              {fmt3(kpis.total_sales)} KWD
            </span>
          </div>
        </>
      )}
    </>
  )
}
