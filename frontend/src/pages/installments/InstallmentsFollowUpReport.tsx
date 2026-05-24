import { useState, useEffect, useRef, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchInstallmentsFollowUp, fetchCustomers, fetchSettings, fetchBranches, fetchCostCenters } from '../../api/tenant'
import type { CostCenter } from '../../types'
import type { InstallmentFollowUpRow, InstallmentsFollowUpResponse } from '../../api/tenant'
import { formatDisplayDate, getReportPeriodRange, type ReportPeriodKey } from '../../utils/date'
import ReportFooter from '../../components/ui/ReportFooter'
import {
  filterBarOverflowClass,
  filterSelectNineLightClass,
} from '../../utils/filterControlStyles'
import { formatAmount } from '../../utils/currency'
import { FileSpreadsheet, FileText, Printer, Columns3, CheckCircle2, AlertTriangle, Clock3 } from 'lucide-react'
import { usePersistedColumnVisibility } from '../../hooks/usePersistedColumnVisibility'
import { useClientSort } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'

type ColumnKey = 'number' | 'customer_name' | 'sequence' | 'due_date' | 'amount' | 'paid_amount' | 'remaining' | 'status'
const COLUMN_KEYS: ColumnKey[] = ['sequence', 'number', 'customer_name', 'due_date', 'amount', 'paid_amount', 'remaining', 'status']
const STORAGE_KEY = 'installmentsFollowUpVisibleColumns'
const PAGE_SIZES = [10, 25, 50, 100]

export default function InstallmentsFollowUpReport() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl, getDisplayName } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const [searchParams] = useSearchParams()

  const [customerIdFilter, setCustomerIdFilter] = useState('')
  const [lineStatusFilter, setLineStatusFilter] = useState('')
  const [scheduleStatusFilter, setScheduleStatusFilter] = useState<'draft' | 'approved'>('approved')
  const initialAllRange = getReportPeriodRange('all')
  const [fromDate, setFromDate] = useState(initialAllRange.from_date)
  const [toDate, setToDate] = useState(initialAllRange.to_date)
  const [periodPreset, setPeriodPreset] = useState<ReportPeriodKey | 'custom'>('all')
  const [branchFilter, setBranchFilter] = useState('')
  const [costCenterFilter, setCostCenterFilter] = useState('')
  const [pageSize, setPageSize] = useState(25)
  const [page, setPage] = useState(1)
  const [visibleColumns, setVisibleColumns] = usePersistedColumnVisibility(STORAGE_KEY, COLUMN_KEYS)
  const [showColumnsMenu, setShowColumnsMenu] = useState(false)
  const columnsMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (columnsMenuRef.current && !columnsMenuRef.current.contains(e.target as Node)) setShowColumnsMenu(false)
    }
    if (showColumnsMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showColumnsMenu])

  /** مزامنة الفلاتر من الرابط (مثلاً من صفحة الإحصائيات عند النقر على الرسم) */
  useEffect(() => {
    const ls = searchParams.get('line_status')
    if (ls === 'pending' || ls === 'paid' || ls === 'partial' || ls === 'overdue') {
      setLineStatusFilter(ls)
    }
    const st = searchParams.get('status')
    if (st === 'draft' || st === 'approved') {
      setScheduleStatusFilter(st)
    }
    const cid = searchParams.get('customer_id')
    if (cid) setCustomerIdFilter(cid)
    const bid = searchParams.get('branch_id')
    if (bid) setBranchFilter(bid)
    const cc = searchParams.get('cost_center_id')
    if (cc) setCostCenterFilter(cc)
    const fd = searchParams.get('from_date')
    const td = searchParams.get('to_date')
    if (fd || td) {
      setPeriodPreset('custom')
      if (fd) setFromDate(fd)
      if (td) setToDate(td)
    }
  }, [searchParams])

  const params: Record<string, string> = {
    status: scheduleStatusFilter,
    per_page: String(pageSize),
    page: String(page),
  }
  if (lineStatusFilter) params.line_status = lineStatusFilter
  if (customerIdFilter) params.customer_id = customerIdFilter
  if (branchFilter) params.branch_id = branchFilter
  if (costCenterFilter) params.cost_center_id = costCenterFilter
  if (periodPreset !== 'all') {
    if (fromDate) params.from_date = fromDate
    if (toDate) params.to_date = toDate
  }

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

  const filterSelectCls = `${filterSelectNineLightClass} w-full font-semibold text-xs`
  const filterPageSizeCls = `${filterSelectNineLightClass} w-full text-center font-semibold tabular-nums`
  const showCustomDateFields = periodPreset === 'custom'
  const labelPeriod = lang === 'ar' ? 'الفترة' : 'Period'
  const labelFrom = lang === 'ar' ? 'من تاريخ' : 'From date'
  const labelTo = lang === 'ar' ? 'إلى تاريخ' : 'To date'

  const { data: settings } = useQuery({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const fmt = (n: number) => formatAmount(n, { decimal_places: settings?.doc_amount_decimals ?? 3 }, locale)

  const { data: followUpResp, isLoading } = useQuery<InstallmentsFollowUpResponse>({
    queryKey: ['installments-follow-up', tenantId, params],
    queryFn: () => fetchInstallmentsFollowUp(tenantId, params),
    enabled: !!tenantId,
  })

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
    queryKey: ['customers', tenantId, 'list'],
    queryFn: () => fetchCustomers(tenantId, { per_page: '500' }),
    enabled: !!tenantId,
  })
  const customers = (customersData as { data?: { id: number; name: string }[] })?.data ?? []

  const rows: InstallmentFollowUpRow[] = followUpResp?.data ?? []
  const followUpTotal = followUpResp?.total ?? 0
  const followUpLastPage = followUpResp?.last_page ?? 1
  const followUpCurrentPage = followUpResp?.current_page ?? 1
  const followUpPerPage = followUpResp?.per_page ?? pageSize
  const grandTotals = followUpResp?.totals
  const followUpSortColumns = useMemo(
    () => [
      { key: 'sequence' as ColumnKey, type: 'number' as const, getValue: (r: InstallmentFollowUpRow) => Number(r.sequence) },
      { key: 'number' as ColumnKey, type: 'string' as const, getValue: (r: InstallmentFollowUpRow) => r.number ?? '' },
      { key: 'customer_name' as ColumnKey, type: 'string' as const, getValue: (r: InstallmentFollowUpRow) => r.customer_name ?? '' },
      { key: 'due_date' as ColumnKey, type: 'date' as const, getValue: (r: InstallmentFollowUpRow) => r.due_date },
      { key: 'amount' as ColumnKey, type: 'number' as const, getValue: (r: InstallmentFollowUpRow) => Number(r.amount) },
      { key: 'paid_amount' as ColumnKey, type: 'number' as const, getValue: (r: InstallmentFollowUpRow) => Number(r.paid_amount) },
      { key: 'remaining' as ColumnKey, type: 'number' as const, getValue: (r: InstallmentFollowUpRow) => Number(r.remaining) },
      { key: 'status' as ColumnKey, type: 'string' as const, getValue: (r: InstallmentFollowUpRow) => r.status ?? '' },
    ],
    [],
  )
  const { sort, toggleSort, sortedRows } = useClientSort<InstallmentFollowUpRow, ColumnKey>(rows, followUpSortColumns, { locale })
  const columnLabels: Record<ColumnKey, string> = {
    number: t.installments?.number ?? 'رقم الجدول',
    customer_name: t.installments?.customer ?? 'العميل',
    sequence: t.installments?.sequence ?? 'م',
    due_date: t.installments?.dueDate ?? 'تاريخ الاستحقاق',
    amount: t.amount,
    paid_amount: t.installments?.paidAmount ?? 'المسدد',
    remaining: t.installments?.remaining ?? 'المتبقي',
    status: t.status,
  }
  const visibleColumnKeys = COLUMN_KEYS.filter((k) => visibleColumns[k])
  const reportTitle = t.installments?.followUpTitle ?? 'متابعة الأقساط'

  function followUpColumnThWidth(k: ColumnKey): string | undefined {
    if (k === 'sequence') return 'w-11 min-w-[2.5rem] max-w-[3.25rem]'
    if (k === 'customer_name') return 'min-w-[13rem] w-[24%]'
    return undefined
  }

  function followUpColumnTdClass(k: ColumnKey): string {
    if (k === 'sequence') return 'w-11 min-w-[2.5rem] max-w-[3.25rem]'
    if (k === 'customer_name') return 'min-w-[13rem] w-[24%]'
    return ''
  }

  function statusChip(status: string | null | undefined) {
    const s = status || 'pending'
    if (s === 'paid') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
          <CheckCircle2 size={14} className="text-emerald-600" /> {lang === 'ar' ? 'مدفوع' : 'Paid'}
        </span>
      )
    }
    if (s === 'overdue') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
          <AlertTriangle size={14} className="text-red-600" /> {lang === 'ar' ? 'متأخر' : 'Overdue'}
        </span>
      )
    }
    if (s === 'partial') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
          <Clock3 size={14} className="text-amber-600" /> {lang === 'ar' ? 'جزئي' : 'Partial'}
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
        <Clock3 size={14} className="text-amber-600" /> {lang === 'ar' ? 'مستحق' : 'Pending'}
      </span>
    )
  }

  function buildPrintContent() {
    const keys = visibleColumnKeys
    if (keys.length === 0) return `<p>${lang === 'ar' ? 'لا أعمدة معروضة' : 'No columns visible'}</p>`
    const headerCells = keys.map((k) => `<th>${columnLabels[k]}</th>`).join('')
    const rowsHtml = sortedRows.map((r) => {
      const cells = keys.map((k) => {
        if (k === 'number') return `<td>${r.number}</td>`
        if (k === 'customer_name') return `<td>${r.customer_name ?? '—'}</td>`
        if (k === 'sequence') return `<td>${r.sequence}</td>`
        if (k === 'due_date') return `<td>${formatDisplayDate(r.due_date)}</td>`
        if (k === 'amount') return `<td class="num">${fmt(r.amount)}</td>`
        if (k === 'paid_amount') return `<td class="num">${fmt(r.paid_amount)}</td>`
        if (k === 'remaining') return `<td class="num">${fmt(r.remaining)}</td>`
        if (k === 'status') return `<td>${r.status ?? '—'}</td>`
        return '<td></td>'
      })
      return `<tr>${cells.join('')}</tr>`
    }).join('')
    return `<table class="report-table"><thead><tr>${headerCells}</tr></thead><tbody>${rowsHtml}</tbody></table>`
  }

  function handlePrint() {
    const table = buildPrintContent()
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
<!DOCTYPE html><html dir="${isRtl ? 'rtl' : 'ltr'}"><head>
<meta charset="utf-8"><title>${reportTitle}</title>
<style>body{font-family:Arial,sans-serif;padding:24px;} .report-table{width:100%;border-collapse:collapse;} .report-table th,.report-table td{border:1px solid #ddd;padding:8px;text-align:center;} .report-table th{background:#f1f5f9;} .num{text-align:center;}</style>
</head><body><h2>${reportTitle}</h2>${table}</body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 300)
  }

  function handleExportPdf() {
    window.print()
  }

  function handleExportCsv() {
    const headers = visibleColumnKeys.map((k) => columnLabels[k])
    const lines = [headers.join(',')]
    sortedRows.forEach((r) => {
      const cells = visibleColumnKeys.map((k) => {
        if (k === 'number') return r.number
        if (k === 'customer_name') return `"${(r.customer_name ?? '').replace(/"/g, '""')}"`
        if (k === 'sequence') return r.sequence
        if (k === 'due_date') return formatDisplayDate(r.due_date)
        if (k === 'amount') return r.amount
        if (k === 'paid_amount') return r.paid_amount
        if (k === 'remaining') return r.remaining
        if (k === 'status') return r.status ?? ''
        return ''
      })
      lines.push(cells.join(','))
    })
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `installments-follow-up.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-6 space-y-4 w-full min-w-0 max-w-full">
      <div className="flex flex-wrap items-center justify-between gap-4 no-print">
        <h1 className="text-2xl font-bold text-slate-900">{reportTitle}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-600 shrink-0">{labelPeriod}</span>
            <select
              value={periodPreset}
              onChange={(e) => applyPeriodPreset((e.target.value as ReportPeriodKey | 'custom') || 'all')}
              className="h-9 border border-slate-300 rounded-lg px-3 text-sm bg-white min-w-[150px]"
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
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value)
                    setPage(1)
                  }}
                  className="h-9 border border-slate-300 rounded-lg px-3 text-sm bg-white w-[140px]"
                  title={labelFrom}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-slate-600 whitespace-nowrap">{labelTo}</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    setToDate(e.target.value)
                    setPage(1)
                  }}
                  className="h-9 border border-slate-300 rounded-lg px-3 text-sm bg-white w-[140px]"
                  title={labelTo}
                />
              </div>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="relative" ref={columnsMenuRef}>
            <button
              type="button"
              onClick={() => setShowColumnsMenu((v) => !v)}
              className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-white border border-slate-300 text-slate-600 hover:bg-slate-50"
              title={lang === 'ar' ? 'تخصيص الأعمدة' : 'Columns'}
            >
              <Columns3 size={16} />
            </button>
            {showColumnsMenu && (
              <div className="absolute top-full end-0 mt-2 z-30 w-56 rounded-lg border border-slate-200 bg-white shadow-lg py-2 text-sm">
                <div className="px-3 pb-2 text-xs font-semibold text-slate-500">
                  {lang === 'ar' ? 'إظهار/إخفاء الأعمدة' : 'Show / hide columns'}
                </div>
                {COLUMN_KEYS.map((key) => (
                  <label key={key} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={visibleColumns[key]}
                      onChange={(e) => setVisibleColumns((prev) => ({ ...prev, [key]: e.target.checked }))}
                      className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-slate-700 text-xs">{columnLabels[key]}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-[#F0F2F5] border border-[#D9DCE0] text-[#344054] hover:bg-[#E4E7EB]"
            title={lang === 'ar' ? 'طباعة' : 'Print'}
          >
            <Printer size={16} />
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-[#344054] text-white hover:bg-[#2d3846]"
            title={t.payments?.exportPdf ?? t.accounts?.exportPdf ?? (lang === 'ar' ? 'تصدير PDF' : 'Export PDF')}
          >
            <FileText size={16} />
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-500"
            title={t.exportCsv}
          >
            <FileSpreadsheet size={16} />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 py-2.5 px-3 no-print">
        <div className={`flex flex-nowrap items-center justify-between gap-3 ${filterBarOverflowClass}`}>
          <div className="flex flex-nowrap items-center gap-3 min-w-0 flex-1">
            <div className="min-w-[9rem] w-40 shrink-0">
              <select
                value={lineStatusFilter}
                onChange={(e) => {
                  setLineStatusFilter(e.target.value)
                  setPage(1)
                }}
                aria-label={t.installments?.followUpLineStatusAll ?? 'حالة القسط'}
                title={t.installments?.followUpLineStatusAll ?? 'حالة القسط'}
                className={filterSelectCls}
              >
                <option value="">{t.installments?.followUpLineStatusAll ?? 'حالة القسط'}</option>
                <option value="pending">{t.installments?.followUpLineStatusPending ?? 'مستحق'}</option>
                <option value="paid">{t.installments?.followUpLineStatusPaid ?? 'مدفوع'}</option>
                <option value="partial">{t.installments?.followUpLineStatusPartial ?? 'جزئي'}</option>
                <option value="overdue">{t.installments?.followUpLineStatusOverdue ?? 'متأخر'}</option>
              </select>
            </div>
            <div className="min-w-[9rem] w-36 shrink-0">
              <select
                value={scheduleStatusFilter}
                onChange={(e) => {
                  setScheduleStatusFilter(e.target.value as 'draft' | 'approved')
                  setPage(1)
                }}
                aria-label={t.installments?.followUpScheduleType ?? 'نوع الجدول'}
                title={t.installments?.followUpScheduleType ?? 'نوع الجدول'}
                className={filterSelectCls}
              >
                <option value="approved">{t.installments?.approved}</option>
                <option value="draft">{t.installments?.draft}</option>
              </select>
            </div>
            <div className="min-w-[14rem] w-72 max-w-[22rem] shrink-0">
              <select
                value={customerIdFilter}
                onChange={(e) => {
                  setCustomerIdFilter(e.target.value)
                  setPage(1)
                }}
                aria-label={t.installments?.selectCustomer ?? 'العميل'}
                title={t.installments?.selectCustomer ?? 'العميل'}
                className={filterSelectCls}
              >
                <option value="">{t.installments?.selectCustomer ?? 'كل العملاء'}</option>
                {customers.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[12rem] w-56 max-w-[16rem] shrink-0">
              <select
                value={branchFilter}
                onChange={(e) => {
                  setBranchFilter(e.target.value)
                  setPage(1)
                }}
                aria-label={t.journal.branch}
                title={t.journal.branch}
                className={filterSelectCls}
              >
                <option value="">{t.journal.branch}</option>
                {branches.map((b: { id: number; name: string }) => (
                  <option key={b.id} value={String(b.id)}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[12rem] w-56 max-w-[16rem] shrink-0">
              <select
                value={costCenterFilter}
                onChange={(e) => {
                  setCostCenterFilter(e.target.value)
                  setPage(1)
                }}
                aria-label={t.nav.costCenters}
                title={t.nav.costCenters}
                className={filterSelectCls}
              >
                <option value="">{t.nav.costCenters}</option>
                {costCenters.map((cc) => (
                  <option key={cc.id} value={String(cc.id)}>
                    {getDisplayName({ name: cc.name, name_en: cc.name_en ?? null })}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="w-14 shrink-0 flex items-center">
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value))
                setPage(1)
              }}
              title={lang === 'ar' ? 'عدد السجلات في الصفحة' : 'Rows per page'}
              className={filterPageSizeCls}
              aria-label={lang === 'ar' ? 'عدد السجلات في الصفحة' : 'Rows per page'}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-8 text-center text-slate-500">{t.loading}</div>
        ) : (
          <>
            {sortedRows.length === 0 ? (
              <div className="p-8 text-center text-slate-500">{t.noData}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm table-fixed">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      {visibleColumnKeys.map((k) => (
                        <SortableTh
                          key={k}
                          label={columnLabels[k]}
                          sortKey={k}
                          sortState={sort}
                          onToggle={toggleSort}
                          headerLayout="clusterCenter"
                          dense
                          widthClassName={followUpColumnThWidth(k)}
                          className="p-0 text-center"
                        />
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map((r) => (
                      <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                        {visibleColumnKeys.map((k) => {
                          const numeric = k === 'amount' || k === 'paid_amount' || k === 'remaining'
                          return (
                            <td
                              key={k}
                              className={`p-3 text-center align-middle ${followUpColumnTdClass(k)} ${numeric ? 'font-nums' : ''}`.trim()}
                            >
                              {k === 'number' && r.number}
                              {k === 'customer_name' && (r.customer_name ?? '—')}
                              {k === 'sequence' && r.sequence}
                              {k === 'due_date' && formatDisplayDate(r.due_date)}
                              {k === 'amount' && fmt(r.amount)}
                              {k === 'paid_amount' && fmt(r.paid_amount)}
                              {k === 'remaining' && fmt(r.remaining)}
                              {k === 'status' && statusChip(r.status)}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                  {grandTotals && followUpTotal > 0 && (() => {
                    const isNumericCol = (k: ColumnKey) => k === 'amount' || k === 'paid_amount' || k === 'remaining'
                    const firstNumericIdx = visibleColumnKeys.findIndex(isNumericCol)
                    const lastNumericIdx = visibleColumnKeys.reduce((last, k, i) => (isNumericCol(k) ? i : last), -1)
                    if (firstNumericIdx === -1 || lastNumericIdx === -1) return null
                    const totalLabel = lang === 'ar' ? 'الإجمالي' : 'Total'
                    const trailSpan = visibleColumnKeys.length - lastNumericIdx - 1
                    const footerRowClass =
                      'bg-gradient-to-r from-slate-100 to-slate-50 border-t-2 border-slate-400 font-bold text-slate-900 shadow-[0_-2px_4px_rgba(0,0,0,0.04)]'
                    return (
                      <tfoot>
                        <tr className={footerRowClass}>
                          {firstNumericIdx > 0 && (
                            <td colSpan={firstNumericIdx} className="p-3 text-sm text-center">
                              {totalLabel}
                            </td>
                          )}
                          {visibleColumnKeys.slice(firstNumericIdx, lastNumericIdx + 1).map((k) => (
                            <td
                              key={k}
                              className={`p-3 text-center text-sm tabular-nums font-semibold font-nums ${followUpColumnTdClass(k)}`.trim()}
                              dir="ltr"
                            >
                              {k === 'amount' && fmt(grandTotals.amount)}
                              {k === 'paid_amount' && fmt(grandTotals.paid_amount)}
                              {k === 'remaining' && fmt(grandTotals.remaining)}
                            </td>
                          ))}
                          {trailSpan > 0 && <td colSpan={trailSpan} className="p-3 text-center" aria-hidden />}
                        </tr>
                      </tfoot>
                    )
                  })()}
                </table>
              </div>
            )}
            {!isLoading && followUpResp && (
              <ReportFooter
                totalCount={followUpTotal}
                currentPage={followUpCurrentPage}
                lastPage={followUpLastPage}
                from={followUpTotal === 0 ? 0 : (followUpCurrentPage - 1) * followUpPerPage + 1}
                to={followUpTotal === 0 ? 0 : Math.min(followUpCurrentPage * followUpPerPage, followUpTotal)}
                onPageChange={setPage}
                lang={lang}
                isRtl={isRtl}
                alwaysShowPaginationBar
                showRecordSummary={followUpTotal > 0}
                recordLabel={lang === 'ar' ? 'قسط' : 'installment'}
                dense
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
