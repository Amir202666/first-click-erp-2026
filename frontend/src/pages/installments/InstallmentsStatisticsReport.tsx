import { useMemo, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
} from 'chart.js'
import type { Chart } from 'chart.js'
import { Doughnut, Bar } from 'react-chartjs-2'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchInstallmentStatistics,
  fetchCustomers,
  fetchBranches,
  fetchCostCenters,
  fetchSettings,
  type InstallmentStatisticsResponse,
} from '../../api/tenant'
import type { CostCenter } from '../../types'
import { formatAmount } from '../../utils/currency'
import { getReportPeriodRange, type ReportPeriodKey } from '../../utils/date'
import { FileText, Printer, PieChart } from 'lucide-react'
import {
  filterBarOverflowClass,
  filterSelectCompactClass,
  filterPeriodBarDateInputClass,
} from '../../utils/filterControlStyles'

const filterSelectCls = filterSelectCompactClass

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement)

const SEGMENT_ORDER = ['paid', 'overdue', 'partial', 'pending'] as const
type SegmentKey = (typeof SEGMENT_ORDER)[number]

export default function InstallmentsStatisticsReport() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl, getDisplayName } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const navigate = useNavigate()

  const [customerIdFilter, setCustomerIdFilter] = useState('')
  const [branchFilter, setBranchFilter] = useState('')
  const [costCenterFilter, setCostCenterFilter] = useState('')
  const initialAllRange = getReportPeriodRange('all')
  const [fromDate, setFromDate] = useState(initialAllRange.from_date)
  const [toDate, setToDate] = useState(initialAllRange.to_date)
  const [periodPreset, setPeriodPreset] = useState<ReportPeriodKey | 'custom'>('all')

  const doughnutRef = useRef<Chart<'doughnut'>>(null)
  const barPayersRef = useRef<Chart<'bar'>>(null)
  const barDelinquentRef = useRef<Chart<'bar'>>(null)

  const { data: settings } = useQuery({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const fmt = (n: number) => formatAmount(n, { decimal_places: settings?.doc_amount_decimals ?? 3 }, locale)

  const params = useMemo(() => {
    const p: Record<string, string> = {}
    if (customerIdFilter) p.customer_id = customerIdFilter
    if (branchFilter) p.branch_id = branchFilter
    if (costCenterFilter) p.cost_center_id = costCenterFilter
    if (periodPreset !== 'all') {
      if (fromDate) p.from_date = fromDate
      if (toDate) p.to_date = toDate
    }
    return p
  }, [customerIdFilter, branchFilter, costCenterFilter, periodPreset, fromDate, toDate])

  const { data: stats, isLoading } = useQuery<InstallmentStatisticsResponse>({
    queryKey: ['installments-statistics', tenantId, params],
    queryFn: () => fetchInstallmentStatistics(tenantId, params),
    enabled: !!tenantId,
  })

  const { data: customersData } = useQuery({
    queryKey: ['customers', tenantId, 'filter'],
    queryFn: () => fetchCustomers(tenantId, { per_page: '500' }),
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

  const customersList = useMemo(() => {
    const raw = customersData as { data?: { id: number; name: string }[] } | undefined
    return Array.isArray(raw?.data) ? raw.data : []
  }, [customersData])

  const labelForSegment = useCallback(
    (k: SegmentKey) => {
      if (k === 'paid') return t.installments?.followUpLineStatusPaid ?? (lang === 'ar' ? 'مدفوع' : 'Paid')
      if (k === 'overdue') return t.installments?.followUpLineStatusOverdue ?? (lang === 'ar' ? 'متأخر' : 'Overdue')
      if (k === 'partial') return t.installments?.followUpLineStatusPartial ?? (lang === 'ar' ? 'جزئي' : 'Partial')
      return t.installments?.followUpLineStatusPending ?? (lang === 'ar' ? 'مستحق' : 'Pending')
    },
    [t, lang],
  )

  const buildFollowUpUrl = useCallback(
    (lineStatus: SegmentKey) => {
      const p = new URLSearchParams()
      p.set('line_status', lineStatus)
      p.set('status', 'approved')
      if (customerIdFilter) p.set('customer_id', customerIdFilter)
      if (branchFilter) p.set('branch_id', branchFilter)
      if (costCenterFilter) p.set('cost_center_id', costCenterFilter)
      if (periodPreset !== 'all') {
        if (fromDate) p.set('from_date', fromDate)
        if (toDate) p.set('to_date', toDate)
      }
      return `/installments/reports/follow-up?${p.toString()}`
    },
    [customerIdFilter, branchFilter, costCenterFilter, periodPreset, fromDate, toDate],
  )

  const doughnutData = useMemo(() => {
    if (!stats?.lines) return null
    const values = SEGMENT_ORDER.map((k) => Number(stats.lines[k] ?? 0))
    return {
      labels: SEGMENT_ORDER.map((k) => labelForSegment(k)),
      datasets: [
        {
          data: values,
          backgroundColor: ['#10b981', '#ef4444', '#f59e0b', '#94a3b8'],
          borderWidth: 2,
          borderColor: '#ffffff',
        },
      ],
    }
  }, [stats, labelForSegment])

  const doughnutOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' as const, rtl: isRtl },
        tooltip: { rtl: isRtl },
      },
      onClick: (_evt: unknown, elements: { index: number }[]) => {
        if (!elements.length) return
        const idx = elements[0].index
        const key = SEGMENT_ORDER[idx]
        if (key) navigate(buildFollowUpUrl(key))
      },
    }),
    [navigate, buildFollowUpUrl, isRtl],
  )

  const barPayersData = useMemo(() => {
    const rows = stats?.top_payers ?? []
    if (rows.length === 0) {
      return {
        labels: [lang === 'ar' ? 'لا بيانات' : 'No data'],
        datasets: [{ label: t.installments?.paidAmount ?? 'Paid', data: [0], backgroundColor: '#e2e8f0' }],
      }
    }
    return {
      labels: rows.map((r) => r.customer_name),
      datasets: [
        {
          label: t.installments?.paidAmount ?? 'Paid',
          data: rows.map((r) => r.total_paid),
          backgroundColor: '#0ea5e9',
        },
      ],
    }
  }, [stats, t, lang])

  const barDelinquentData = useMemo(() => {
    const rows = stats?.top_delinquent ?? []
    if (rows.length === 0) {
      return {
        labels: [lang === 'ar' ? 'لا بيانات' : 'No data'],
        datasets: [{ label: t.installments?.remaining ?? 'Remaining', data: [0], backgroundColor: '#e2e8f0' }],
      }
    }
    return {
      labels: rows.map((r) => r.customer_name),
      datasets: [
        {
          label: t.installments?.remaining ?? 'Remaining',
          data: rows.map((r) => r.overdue_remaining),
          backgroundColor: '#f97316',
        },
      ],
    }
  }, [stats, t, lang])

  const buildFollowUpBaseParams = useCallback(() => {
    const p = new URLSearchParams()
    p.set('status', 'approved')
    if (branchFilter) p.set('branch_id', branchFilter)
    if (costCenterFilter) p.set('cost_center_id', costCenterFilter)
    if (periodPreset !== 'all') {
      if (fromDate) p.set('from_date', fromDate)
      if (toDate) p.set('to_date', toDate)
    }
    return p
  }, [branchFilter, costCenterFilter, periodPreset, fromDate, toDate])

  const barPayersOptions = useMemo(
    () => ({
      indexAxis: 'y' as const,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { rtl: isRtl },
      },
      scales: {
        x: { beginAtZero: true, ticks: { callback: (v: string | number) => fmt(Number(v)) } },
      },
      onClick: (_evt: unknown, elements: { index: number }[]) => {
        if (!elements.length || !stats?.top_payers?.length) return
        const row = stats.top_payers[elements[0].index]
        if (!row) return
        const p = buildFollowUpBaseParams()
        p.set('customer_id', String(row.customer_id))
        navigate(`/installments/reports/follow-up?${p.toString()}`)
      },
    }),
    [isRtl, fmt, stats?.top_payers, navigate, buildFollowUpBaseParams],
  )

  const barDelinquentOptions = useMemo(
    () => ({
      indexAxis: 'y' as const,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { rtl: isRtl },
      },
      scales: {
        x: { beginAtZero: true, ticks: { callback: (v: string | number) => fmt(Number(v)) } },
      },
      onClick: (_evt: unknown, elements: { index: number }[]) => {
        if (!elements.length || !stats?.top_delinquent?.length) return
        const row = stats.top_delinquent[elements[0].index]
        if (!row) return
        const p = buildFollowUpBaseParams()
        p.set('line_status', 'overdue')
        p.set('customer_id', String(row.customer_id))
        navigate(`/installments/reports/follow-up?${p.toString()}`)
      },
    }),
    [isRtl, fmt, stats?.top_delinquent, navigate, buildFollowUpBaseParams],
  )

  function applyPeriodPreset(preset: ReportPeriodKey | 'custom') {
    setPeriodPreset(preset)
    if (preset !== 'custom') {
      const range = getReportPeriodRange(preset)
      setFromDate(range.from_date)
      setToDate(range.to_date)
    }
  }

  function handleExportPdf() {
    const title = t.installments?.statsTitle ?? 'Installment statistics'
    const sub = t.installments?.statsSubtitle ?? ''
    const dImg = doughnutRef.current?.toBase64Image('image/png', 1) ?? ''
    const bpImg = barPayersRef.current?.toBase64Image('image/png', 1) ?? ''
    const bdImg = barDelinquentRef.current?.toBase64Image('image/png', 1) ?? ''
    const filterLines = [
      periodPreset !== 'all' ? `${fromDate} → ${toDate}` : lang === 'ar' ? 'كل الفترات (حسب الاستحقاق)' : 'All periods (due date)',
      branchFilter ? `${t.nav?.branches ?? 'Branch'}: ${branches.find((b) => String(b.id) === branchFilter)?.name ?? branchFilter}` : '',
      customerIdFilter
        ? `${t.installments?.customer ?? 'Customer'}: ${customersList.find((c) => String(c.id) === customerIdFilter)?.name ?? customerIdFilter}`
        : '',
    ]
      .filter(Boolean)
      .join('<br/>')

    const amounts = stats?.amounts
    const lines = stats?.lines
    const payersRows =
      stats?.top_payers
        ?.map(
          (r, i) =>
            `<tr><td>${i + 1}</td><td>${r.customer_name}</td><td class="num">${fmt(r.total_paid)}</td></tr>`,
        )
        .join('') ?? ''
    const delRows =
      stats?.top_delinquent
        ?.map(
          (r, i) =>
            `<tr><td>${i + 1}</td><td>${r.customer_name}</td><td class="num">${fmt(r.overdue_remaining)}</td><td>${r.overdue_lines}</td></tr>`,
        )
        .join('') ?? ''

    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html dir="${isRtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"/><title>${title}</title>
<style>
body{font-family:system-ui,sans-serif;padding:24px;color:#0f172a;line-height:1.5;}
h1{font-size:1.5rem;margin:0 0 8px;}
.sub{color:#64748b;font-size:0.9rem;margin-bottom:16px;}
.filters{font-size:0.85rem;color:#475569;margin-bottom:20px;padding:12px;background:#f8fafc;border-radius:8px;}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:20px 0;}
.card{border:1px solid #e2e8f0;border-radius:12px;padding:16px;}
.card h2{font-size:1rem;margin:0 0 12px;}
img{max-width:100%;height:auto;}
table{width:100%;border-collapse:collapse;margin-top:12px;font-size:0.85rem;}
th,td{border:1px solid #e2e8f0;padding:8px;text-align:center;}
th{background:#f1f5f9;}
.num{font-variant-numeric:tabular-nums;}
@media print{body{padding:12px;}}
</style></head><body>
<h1>${title}</h1>
<p class="sub">${sub}</p>
<div class="filters"><strong>${lang === 'ar' ? 'الفلاتر' : 'Filters'}:</strong><br/>${filterLines || '—'}</div>
${amounts && lines ? `<p><strong>${t.installments?.statsTotalScheduled ?? ''}:</strong> ${fmt(amounts.total_scheduled)} · <strong>${t.installments?.statsTotalCollected ?? ''}:</strong> ${fmt(amounts.total_collected)} · <strong>${t.installments?.statsOverdueRemaining ?? ''}:</strong> ${fmt(amounts.overdue_remaining)} · <strong>${lang === 'ar' ? 'إجمالي البنود' : 'Lines'}:</strong> ${lines.total}</p>` : ''}
<div class="grid">
<div class="card"><h2>${t.installments?.statsLinesByStatus ?? ''}</h2>${dImg ? `<img src="${dImg}" alt="" />` : ''}</div>
<div class="card"><h2>${t.installments?.statsTopPayers ?? ''}</h2>${bpImg ? `<img src="${bpImg}" alt="" />` : ''}</div>
</div>
<div class="card" style="margin-top:16px;"><h2>${t.installments?.statsTopDelinquent ?? ''}</h2>${bdImg ? `<img src="${bdImg}" alt="" />` : ''}
<table><thead><tr><th>#</th><th>${t.installments?.customer ?? 'Customer'}</th><th>${t.installments?.remaining ?? 'Remaining'}</th><th>${t.installments?.statsOverdueLines ?? ''}</th></tr></thead><tbody>${delRows}</tbody></table>
</div>
<div class="card" style="margin-top:16px;"><h2>${t.installments?.statsTopPayers ?? ''}</h2>
<table><thead><tr><th>#</th><th>${t.installments?.customer ?? 'Customer'}</th><th>${t.installments?.paidAmount ?? 'Paid'}</th></tr></thead><tbody>${payersRows}</tbody></table>
</div>
<p style="margin-top:24px;font-size:0.8rem;color:#94a3b8;">${lang === 'ar' ? 'تاريخ التقرير' : 'Report date'}: ${stats?.as_of ?? ''}</p>
<script>window.onload=function(){window.print();}</script>
</body></html>`)
    win.document.close()
  }

  const periodOptions: { value: ReportPeriodKey | 'custom'; labelAr: string; labelEn: string }[] = [
    { value: 'all', labelAr: 'الكل', labelEn: 'All' },
    { value: 'custom', labelAr: 'تاريخ مخصص', labelEn: 'Custom' },
    { value: 'this_month', labelAr: 'هذا الشهر', labelEn: 'This month' },
    { value: 'last_month', labelAr: 'الشهر السابق', labelEn: 'Last month' },
    { value: 'this_year', labelAr: 'هذه السنة', labelEn: 'This year' },
  ]

  const showCustomDates = periodPreset === 'custom'

  const filterPeriodLabel = t.installments?.followUpScheduleType ?? (lang === 'ar' ? 'نوع الجدول' : 'Schedule type')
  const filterBranchLabel = t.nav?.branches ?? (lang === 'ar' ? 'الفروع' : 'Branches')
  const filterCustomerLabel = lang === 'ar' ? 'العميل' : 'Customer'
  const filterCostCenterLabel = t.nav.costCenters

  return (
    <div className="p-6 space-y-4 w-full min-w-0 max-w-full">
      <div className="flex flex-wrap items-center justify-between gap-4 no-print">
        <div className="flex items-center gap-2">
          <PieChart className="text-primary-600 shrink-0" size={28} />
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t.installments?.statsTitle ?? '—'}</h1>
            <p className="text-sm text-slate-600 max-w-2xl">{t.installments?.statsSubtitle}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={!stats || stats.lines.total === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            <FileText size={18} />
            {t.installments?.statsExportPdf ?? 'PDF'}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-500"
          >
            <Printer size={18} />
            {lang === 'ar' ? 'طباعة' : 'Print'}
          </button>
        </div>
      </div>

      <div className="no-print rounded-xl border border-slate-200 bg-white py-2.5 px-3 shadow-sm">
        <div className={`flex flex-nowrap items-center gap-3 ${filterBarOverflowClass}`}>
          <div className="min-w-[12rem] w-56 max-w-[17rem] shrink-0">
            <select
              value={periodPreset}
              onChange={(e) => applyPeriodPreset((e.target.value as ReportPeriodKey | 'custom') || 'all')}
              className={filterSelectCls}
              aria-label={filterPeriodLabel}
              title={filterPeriodLabel}
            >
              {periodOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.value === 'all' ? filterPeriodLabel : lang === 'ar' ? o.labelAr : o.labelEn}
                </option>
              ))}
            </select>
          </div>
          {showCustomDates && (
            <>
              <div className="shrink-0">
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className={`${filterPeriodBarDateInputClass} !min-w-[168px] !w-[168px]`}
                  aria-label={lang === 'ar' ? 'من تاريخ الاستحقاق' : 'Due date from'}
                  title={lang === 'ar' ? 'من تاريخ الاستحقاق' : 'Due date from'}
                />
              </div>
              <div className="shrink-0">
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className={`${filterPeriodBarDateInputClass} !min-w-[168px] !w-[168px]`}
                  aria-label={lang === 'ar' ? 'إلى تاريخ الاستحقاق' : 'Due date to'}
                  title={lang === 'ar' ? 'إلى تاريخ الاستحقاق' : 'Due date to'}
                />
              </div>
            </>
          )}
          <div className="min-w-[12rem] w-56 shrink-0">
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className={filterSelectCls}
              aria-label={filterBranchLabel}
              title={filterBranchLabel}
            >
              <option value="">{filterBranchLabel}</option>
              {branches.map((b) => (
                <option key={b.id} value={String(b.id)}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[12rem] w-56 shrink-0">
            <select
              value={costCenterFilter}
              onChange={(e) => setCostCenterFilter(e.target.value)}
              className={filterSelectCls}
              aria-label={filterCostCenterLabel}
              title={filterCostCenterLabel}
            >
              <option value="">{filterCostCenterLabel}</option>
              {costCenters.map((cc) => (
                <option key={cc.id} value={String(cc.id)}>
                  {getDisplayName({ name: cc.name, name_en: cc.name_en ?? null })}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[17rem] w-[22rem] max-w-[min(22rem,100%)] shrink-0">
            <select
              value={customerIdFilter}
              onChange={(e) => setCustomerIdFilter(e.target.value)}
              className={filterSelectCls}
              aria-label={filterCustomerLabel}
              title={filterCustomerLabel}
            >
              <option value="">{filterCustomerLabel}</option>
              {customersList.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-slate-500">{t.loading}</div>
      ) : !stats || stats.lines.total === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-slate-500">
          {t.installments?.statsNoData}
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-500 no-print">{t.installments?.statsClickChartHint}</p>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-1">
              <h2 className="text-sm font-semibold text-slate-800 mb-2">{t.installments?.statsAmountsSummary}</h2>
              <ul className="text-sm space-y-2 text-slate-700">
                <li className="flex justify-between gap-2">
                  <span>{t.installments?.statsTotalScheduled}</span>
                  <span className="font-nums font-medium">{fmt(stats.amounts.total_scheduled)}</span>
                </li>
                <li className="flex justify-between gap-2">
                  <span>{t.installments?.statsTotalCollected}</span>
                  <span className="font-nums font-medium text-emerald-700">{fmt(stats.amounts.total_collected)}</span>
                </li>
                <li className="flex justify-between gap-2">
                  <span>{t.installments?.statsOverdueRemaining}</span>
                  <span className="font-nums font-medium text-red-600">{fmt(stats.amounts.overdue_remaining)}</span>
                </li>
                <li className="flex justify-between gap-2 text-slate-500 text-xs pt-2 border-t border-slate-100">
                  <span>{lang === 'ar' ? 'حتى تاريخ' : 'As of'}</span>
                  <span>{stats.as_of}</span>
                </li>
              </ul>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2 h-[320px]">
              <h2 className="text-sm font-semibold text-slate-800 mb-2">{t.installments?.statsLinesByStatus}</h2>
              {doughnutData && (
                <div className="h-[260px]">
                  <Doughnut ref={doughnutRef} data={doughnutData} options={doughnutOptions} />
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm h-[340px]">
              <h2 className="text-sm font-semibold text-slate-800 mb-2">{t.installments?.statsTopPayers}</h2>
              <div className="h-[280px]">
                <Bar ref={barPayersRef} data={barPayersData} options={barPayersOptions} />
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm h-[340px]">
              <h2 className="text-sm font-semibold text-slate-800 mb-2">{t.installments?.statsTopDelinquent}</h2>
              <div className="h-[280px]">
                <Bar ref={barDelinquentRef} data={barDelinquentData} options={barDelinquentOptions} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 print:break-inside-avoid">
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
              <div className="bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-800">{t.installments?.statsTopPayers}</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-600">
                    <th className="p-3 text-center w-12">{t.installments?.statsRank}</th>
                    <th className={`p-3 ${isRtl ? 'text-right' : 'text-left'}`}>{t.installments?.customer}</th>
                    <th className="p-3 text-center font-nums">{t.installments?.paidAmount}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.top_payers.map((r, i) => (
                    <tr key={r.customer_id} className="border-b border-slate-100">
                      <td className="p-3 text-center tabular-nums">{i + 1}</td>
                      <td className={`p-3 ${isRtl ? 'text-right' : 'text-left'}`}>{r.customer_name}</td>
                      <td className="p-3 text-center font-nums">{fmt(r.total_paid)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
              <div className="bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-800">{t.installments?.statsTopDelinquent}</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-600">
                    <th className="p-3 text-center w-12">{t.installments?.statsRank}</th>
                    <th className={`p-3 ${isRtl ? 'text-right' : 'text-left'}`}>{t.installments?.customer}</th>
                    <th className="p-3 text-center font-nums">{t.installments?.remaining}</th>
                    <th className="p-3 text-center">{t.installments?.statsOverdueLines}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.top_delinquent.map((r, i) => (
                    <tr key={r.customer_id} className="border-b border-slate-100">
                      <td className="p-3 text-center tabular-nums">{i + 1}</td>
                      <td className={`p-3 ${isRtl ? 'text-right' : 'text-left'}`}>{r.customer_name}</td>
                      <td className="p-3 text-center font-nums text-red-700">{fmt(r.overdue_remaining)}</td>
                      <td className="p-3 text-center tabular-nums">{r.overdue_lines}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
