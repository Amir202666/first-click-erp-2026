import { useState, useMemo, Fragment, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchIncomeStatement, fetchSettings, fetchCurrencies, fetchBranches, fetchCostCenters } from '../../api/tenant'
import { getDefaultDateRange } from '../../utils/date'
import { formatDisplayDate } from '../../utils/date'
import { formatAmount } from '../../utils/currency'
import { Printer, FileText, FileSpreadsheet, ChevronDown } from 'lucide-react'
import type { Currency, Branch, CostCenter } from '../../types'
import { filterBarOverflowClass, filterRowInnerClass, filterSelectCompactClass } from '../../utils/filterControlStyles'

type CompareMode = 'none' | 'previous_period' | 'previous_year'

interface DetailLine {
  code: string
  name: string
  name_en?: string | null
  amount: number
}

interface MonthlyBreakdownItem {
  month: string
  year?: number
  month_num?: number
  revenue: number
  cogs: number
  expenses: number
  profit: number
}

interface IncomeStatementData {
  company?: {
    name: string
    logo: string | null
    address: string | null
    phone: string | null
    email: string | null
    tax_registration_number: string | null
  } | null
  issue_date?: string
  from_date?: string
  to_date?: string
  period?: { from: string; to: string }
  gross_sales?: number
  sales_returns?: number
  sales_discount?: number
  net_sales?: number
  revenues: DetailLine[]
  total_revenue: number
  cogs: DetailLine[]
  total_cogs: number
  gross_profit: number
  administrative_expenses: DetailLine[]
  total_administrative_expenses: number
  selling_marketing_expenses: DetailLine[]
  total_selling_marketing_expenses: number
  other_expenses: DetailLine[]
  total_other_expenses: number
  total_expenses: number
  net_income: number
  monthly_breakdown?: MonthlyBreakdownItem[]
}

function toYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function compareDateRange(
  fromStr: string,
  toStr: string,
  mode: CompareMode,
): { from: string; to: string } | null {
  if (mode === 'none') return null
  const from = new Date(fromStr + 'T12:00:00')
  const to = new Date(toStr + 'T12:00:00')
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null
  if (mode === 'previous_year') {
    const pf = new Date(from)
    pf.setFullYear(pf.getFullYear() - 1)
    const pt = new Date(to)
    pt.setFullYear(pt.getFullYear() - 1)
    return { from: toYmd(pf), to: toYmd(pt) }
  }
  const msPerDay = 86_400_000
  const daysInclusive = Math.max(1, Math.round((to.getTime() - from.getTime()) / msPerDay) + 1)
  const prevTo = new Date(from.getTime() - msPerDay)
  const prevFrom = new Date(prevTo.getTime() - (daysInclusive - 1) * msPerDay)
  return { from: toYmd(prevFrom), to: toYmd(prevTo) }
}

function linesToCodeMap(lines: DetailLine[]): Record<string, number> {
  const m: Record<string, number> = {}
  for (const l of lines) m[l.code] = l.amount
  return m
}

function fmtAccounting(n: number, fmt: (x: number) => string, showParen: boolean): { text: string; className: string } {
  if (showParen && n < 0) {
    return { text: `(${fmt(-n)})`, className: 'text-red-600' }
  }
  return { text: fmt(n), className: '' }
}

function ChangeIndicator({ current, previous }: { current: number; previous: number | undefined }) {
  if (previous === undefined || !Number.isFinite(previous) || Math.abs(previous) < 1e-9) return null
  const change = ((current - previous) / Math.abs(previous)) * 100
  const isPositive = change >= 0
  return (
    <span className={`text-[10px] tabular-nums ${isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
      {isPositive ? '↑' : '↓'} {Math.abs(change).toFixed(1)}%
    </span>
  )
}

function MarginBadge({
  value,
  label,
  color,
}: {
  value: number
  label?: string
  color: 'green' | 'red' | 'blue' | 'amber'
}) {
  const colors = {
    green: 'bg-emerald-50 text-emerald-800',
    red: 'bg-red-50 text-red-700',
    blue: 'bg-sky-50 text-sky-800',
    amber: 'bg-amber-50 text-amber-800',
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap text-[11px] leading-tight px-2.5 py-1 rounded-full font-semibold align-middle ${colors[color]}`}
    >
      {label ?? ''}
      {value.toFixed(1)}%
    </span>
  )
}

function MiniBar({ value, total, color }: { value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.min((Math.abs(value) / total) * 100, 100) : 0
  return (
    <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden ms-auto">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

function SectionTableBlock({
  title,
  lines,
  total,
  fmt,
  isRtl,
  showNegative,
  isExpanded,
  onToggle,
  getDisplayName,
  compareMode,
  prevTotal,
  prevByCode,
  revenueBase,
  headerExtra,
}: {
  title: string
  lines: DetailLine[]
  total: number
  fmt: (n: number) => string
  isRtl: boolean
  showNegative?: boolean
  isExpanded: boolean
  onToggle: () => void
  getDisplayName: (entity: { name?: string; name_en?: string | null }) => string
  compareMode: CompareMode
  prevTotal?: number
  prevByCode: Record<string, number>
  revenueBase: number
  headerExtra?: ReactNode
}) {
  const showCompare = compareMode !== 'none'
  const tDisp = fmtAccounting(total, fmt, !!showNegative)
  const ptDisp =
    prevTotal !== undefined ? fmtAccounting(prevTotal, fmt, !!showNegative) : null

  return (
    <Fragment>
      <tr className="border-b border-slate-100 bg-slate-50/60">
        <td className="px-3 py-2 text-slate-800 font-semibold">
          <button
            type="button"
            onClick={onToggle}
            className="flex min-w-0 items-center gap-2 text-start w-full cursor-pointer select-none hover:text-primary-700"
          >
            <ChevronDown
              size={14}
              className={`text-slate-500 shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-0' : '-rotate-90'}`}
            />
            <span className="flex min-w-0 flex-1 items-center gap-4 flex-nowrap">
              <span className="min-w-0 truncate text-start" title={title}>
                {title}
              </span>
              {headerExtra}
            </span>
          </button>
        </td>
        <td className={`px-3 py-2 tabular-nums text-end font-semibold ${tDisp.className}`}>{tDisp.text}</td>
        {showCompare && (
          <>
            <td className={`px-3 py-2 tabular-nums text-end text-slate-600 ${ptDisp?.className ?? ''}`}>
              {ptDisp?.text ?? '—'}
            </td>
            <td className="px-3 py-2 text-end">
              <ChangeIndicator current={total} previous={prevTotal} />
            </td>
          </>
        )}
        <td className="px-3 py-2">
          <MiniBar value={total} total={revenueBase} color="#E24B4A" />
        </td>
      </tr>
      {isExpanded &&
        (lines.length > 0 ? (
          lines.map((line, i) => {
            const prevAmt = prevByCode[line.code]
            const ld = fmtAccounting(line.amount, fmt, !!showNegative)
            const pd =
              prevAmt !== undefined ? fmtAccounting(prevAmt, fmt, !!showNegative) : null
            return (
              <tr key={`${line.code}-${i}`} className="border-b border-slate-50 hover:bg-slate-50/80">
                <td className="px-3 py-1.5 ps-10 text-slate-700 text-sm">
                  {line.code} — {getDisplayName(line)}
                </td>
                <td className={`px-3 py-1.5 tabular-nums text-end text-sm ${ld.className}`}>{ld.text}</td>
                {showCompare && (
                  <>
                    <td className={`px-3 py-1.5 tabular-nums text-end text-sm text-slate-600 ${pd?.className ?? ''}`}>
                      {pd?.text ?? '—'}
                    </td>
                    <td className="px-3 py-1.5 text-end">
                      <ChangeIndicator current={line.amount} previous={prevAmt} />
                    </td>
                  </>
                )}
                <td className="px-3 py-1.5">
                  <MiniBar value={line.amount} total={revenueBase} color="#185FA5" />
                </td>
              </tr>
            )
          })
        ) : (
          <tr>
            <td colSpan={showCompare ? 5 : 3} className="px-3 py-2 ps-10 text-xs text-slate-400">
              {isRtl ? 'لا توجد تفاصيل لهذا القسم.' : 'No detail lines for this section.'}
            </td>
          </tr>
        ))}
    </Fragment>
  )
}

export default function IncomeStatement() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl, getDisplayName } = useLanguage()
  const tenantId = currentTenant?.id ?? 0

  const defaultRange = getDefaultDateRange()
  const [dateFrom, setDateFrom] = useState(defaultRange.dateFrom)
  const [dateTo, setDateTo] = useState(defaultRange.dateTo)
  const [branchId, setBranchId] = useState<string>('')
  const [costCenterId, setCostCenterId] = useState<string>('')
  const [compareMode, setCompareMode] = useState<CompareMode>('none')

  const params: Record<string, string> = {}
  if (dateFrom) params.from_date = dateFrom
  if (dateTo) params.to_date = dateTo
  if (branchId) params.branch_id = branchId
  if (costCenterId) params.cost_center_id = costCenterId

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId,
  })
  const { data: costCenters = [] } = useQuery<CostCenter[]>({
    queryKey: ['costCenters', tenantId],
    queryFn: () => fetchCostCenters(tenantId),
    enabled: !!tenantId,
  })

  const { data, isLoading } = useQuery<IncomeStatementData>({
    queryKey: ['incomeStatement', tenantId, dateFrom, dateTo, branchId, costCenterId],
    queryFn: () => fetchIncomeStatement(tenantId, params),
    enabled: !!tenantId && !!dateFrom && !!dateTo,
  })

  const prevRange = useMemo(() => compareDateRange(dateFrom, dateTo, compareMode), [dateFrom, dateTo, compareMode])
  const prevParams = useMemo(() => {
    if (!prevRange) return null
    const p: Record<string, string> = {
      from_date: prevRange.from,
      to_date: prevRange.to,
    }
    if (branchId) p.branch_id = branchId
    if (costCenterId) p.cost_center_id = costCenterId
    return p
  }, [prevRange, branchId, costCenterId])

  const { data: prevData } = useQuery<IncomeStatementData>({
    queryKey: ['incomeStatementPrev', tenantId, prevParams, compareMode],
    queryFn: () => fetchIncomeStatement(tenantId, prevParams!),
    enabled: !!tenantId && !!prevParams && compareMode !== 'none',
  })

  const { data: settings } = useQuery({ queryKey: ['settings', tenantId], queryFn: () => fetchSettings(tenantId), enabled: !!tenantId })
  const { data: currencies = [] } = useQuery<Currency[]>({ queryKey: ['currencies', tenantId], queryFn: () => fetchCurrencies(tenantId), enabled: !!tenantId })
  const reportCurrency = useMemo(() => {
    const code = (settings?.report_default_currency_code as string) || (currencies.find((c) => c.is_default)?.code)
    return code ? currencies.find((c) => c.code === code) ?? null : null
  }, [settings?.report_default_currency_code, currencies])
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const fmt = (n: number) => formatAmount(n, reportCurrency, locale)

  const revenueBase = data ? (data.net_sales ?? data.total_revenue ?? 0) : 0

  const kpis = useMemo(() => {
    if (!data) {
      return {
        revenue: 0,
        cogs: 0,
        grossProfit: 0,
        expenses: 0,
        netProfit: 0,
        grossMargin: 0,
        netMargin: 0,
        cogsRatio: 0,
        expenseRatio: 0,
      }
    }
    const revenue = data.net_sales ?? data.total_revenue ?? 0
    const cogs = data.total_cogs ?? 0
    const grossProfit = data.gross_profit ?? 0
    const expenses = data.total_expenses ?? 0
    const netProfit = data.net_income ?? 0
    const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0
    const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0
    const cogsRatio = revenue > 0 ? (cogs / revenue) * 100 : 0
    const expenseRatio = revenue > 0 ? (expenses / revenue) * 100 : 0
    return { revenue, cogs, grossProfit, expenses, netProfit, grossMargin, netMargin, cogsRatio, expenseRatio }
  }, [data])

  const [expandedSections, setExpandedSections] = useState({
    cogs: true,
    admin: true,
    selling: true,
    other: true,
  })

  const toggleSection = (key: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const prevMaps = useMemo(() => {
    if (!prevData) {
      return {
        cogs: {} as Record<string, number>,
        admin: {} as Record<string, number>,
        selling: {} as Record<string, number>,
        other: {} as Record<string, number>,
      }
    }
    return {
      cogs: linesToCodeMap(prevData.cogs ?? []),
      admin: linesToCodeMap(prevData.administrative_expenses ?? []),
      selling: linesToCodeMap(prevData.selling_marketing_expenses ?? []),
      other: linesToCodeMap(prevData.other_expenses ?? []),
    }
  }, [prevData])

  const expenseDonutData = useMemo(() => {
    if (!data) return []
    const parts = [
      { name: isRtl ? 'تكلفة المبيعات' : 'COGS', value: Math.max(0, data.total_cogs ?? 0), fill: '#185FA5' },
      { name: isRtl ? 'إدارية وعمومية' : 'Admin', value: Math.max(0, data.total_administrative_expenses ?? 0), fill: '#BA7517' },
      { name: isRtl ? 'بيعية وتسويقية' : 'Selling', value: Math.max(0, data.total_selling_marketing_expenses ?? 0), fill: '#639922' },
      { name: isRtl ? 'مصروفات أخرى' : 'Other', value: Math.max(0, data.total_other_expenses ?? 0), fill: '#E24B4A' },
    ]
    return parts.filter((p) => p.value > 0.0005)
  }, [data, isRtl])

  const monthlyChartData = useMemo(() => {
    const raw = data?.monthly_breakdown
    if (!Array.isArray(raw) || raw.length === 0) return []
    return raw.map((item) => ({
      month: item.month,
      revenue: item.revenue,
      expenses: (item.cogs ?? 0) + (item.expenses ?? 0),
      profit: item.profit,
    }))
  }, [data?.monthly_breakdown])

  const hasMonthly = monthlyChartData.length > 0

  function exportExcel() {
    if (!data) return
    const rows: string[][] = []
    const pushRow = (a: string, b: string, c?: string, d?: string) => {
      rows.push(c !== undefined ? [a, b, c, d ?? ''] : [a, b])
    }
    pushRow(t.reports.grossSales, fmt(data.gross_sales ?? 0))
    pushRow(`${t.reports.salesReturns} (-)`, fmt(data.sales_returns ?? 0))
    pushRow(`${t.reports.salesDiscount} (-)`, fmt(data.sales_discount ?? 0))
    pushRow(t.reports.netSales, fmt(data.net_sales ?? data.total_revenue))
    if (compareMode !== 'none' && prevData) {
      pushRow(
        `${t.reports.netSales} (${isRtl ? 'مقارنة' : 'compare'})`,
        fmt(prevData.net_sales ?? prevData.total_revenue),
      )
    }
    pushRow(t.reports.costOfGoodsSold, fmt(data.total_cogs))
    pushRow(t.reports.grossProfit, fmt(data.gross_profit))
    pushRow(t.reports.administrativeExpenses, fmt(data.total_administrative_expenses))
    pushRow(t.reports.sellingMarketingExpenses, fmt(data.total_selling_marketing_expenses))
    pushRow(t.reports.otherExpenses, fmt(data.total_other_expenses))
    pushRow(t.reports.totalExpenses, fmt(data.total_expenses))
    pushRow(data.net_income >= 0 ? t.reports.netIncome : t.reports.netLoss, fmt(data.net_income))

    const csv = ['\ufeff' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')]
    const blob = new Blob(csv, { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `income-statement-${dateFrom}-${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const compareColTitle =
    compareMode === 'previous_year'
      ? String(new Date(dateFrom + 'T12:00:00').getFullYear() - 1)
      : isRtl
        ? 'الفترة السابقة'
        : 'Prior period'

  const currYearLabel = String(new Date(dateFrom + 'T12:00:00').getFullYear())

  return (
    <div className="p-6 space-y-6 w-full max-w-full" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="flex flex-nowrap items-center justify-between gap-4 border-b border-slate-200 pb-1 no-print">
        <h1 className="text-sm font-semibold text-slate-900 shrink-0">{t.reports.incomeStatement}</h1>
        <div className={`${filterBarOverflowClass} min-w-0 flex-1`}>
          <div className={`${filterRowInnerClass} text-xs`}>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs text-slate-700 whitespace-nowrap">{t.from}</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className={`${filterSelectCompactClass} min-w-[150px]`}
              />
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs text-slate-700 whitespace-nowrap">{t.to}</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className={`${filterSelectCompactClass} min-w-[150px]`}
              />
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className={`${filterSelectCompactClass} min-w-[200px]`}
              >
                <option value="">{t.reports.branchLabel}</option>
                {branches.map((b) => (
                  <option key={b.id} value={String(b.id)}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <select
                value={costCenterId}
                onChange={(e) => setCostCenterId(e.target.value)}
                className={`${filterSelectCompactClass} min-w-[200px]`}
              >
                <option value="">{t.reports.costCenterLabel}</option>
                {costCenters.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-nowrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-[#F0F2F5] border border-[#D9DCE0] text-[#344054] hover:bg-[#E4E7EB]"
            title={t.journal.print}
          >
            <Printer size={16} />
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-[#344054] text-white hover:bg-[#2d3846]"
            title={t.accounts.exportPdf}
          >
            <FileText size={16} />
          </button>
          <button
            type="button"
            onClick={exportExcel}
            className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-500"
            title={t.accounts.exportExcel}
          >
            <FileSpreadsheet size={16} />
          </button>
        </div>
      </div>

      {data && !isLoading && (
        <div className="no-print space-y-3" dir={isRtl ? 'rtl' : 'ltr'}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">{isRtl ? 'مقارنة مع:' : 'Compare:'}</span>
            {(
              [
                { value: 'previous_period' as const, label: isRtl ? 'الفترة السابقة' : 'Previous period' },
                { value: 'previous_year' as const, label: isRtl ? 'السنة السابقة' : 'Previous year' },
                { value: 'none' as const, label: isRtl ? 'بدون مقارنة' : 'None' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setCompareMode(opt.value)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  compareMode === opt.value
                    ? 'bg-sky-600 text-white border-sky-600'
                    : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
            <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
              <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide mb-3">
                {isRtl ? 'الإيرادات والمصروفات والربح (شهري)' : 'Revenue, expenses & profit'}
              </p>
              {hasMonthly ? (
                <>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={monthlyChartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                      <XAxis
                        dataKey="month"
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        tickFormatter={(val: string) => String(val).replace(/\s\d{4}/, '')}
                      />
                      <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                      <Tooltip
                        formatter={(value: number | undefined, name: string | undefined) => [
                          (value ?? 0).toFixed(3) + ' KWD',
                          name ?? '',
                        ]}
                        contentStyle={{ fontSize: 12, direction: isRtl ? 'rtl' : 'ltr' }}
                      />
                      <Bar dataKey="revenue" name={isRtl ? 'إيرادات' : 'Revenue'} fill="#185FA5" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="expenses" name={isRtl ? 'مصروفات' : 'Expenses'} fill="#E24B4A" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="profit" name={isRtl ? 'ربح' : 'Profit'} fill="#3B6D11" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="flex gap-4 mt-2 justify-center flex-wrap text-xs text-slate-500">
                    {[
                      { color: '#185FA5', label: isRtl ? 'إيرادات' : 'Revenue' },
                      { color: '#E24B4A', label: isRtl ? 'مصروفات' : 'Expenses' },
                      { color: '#3B6D11', label: isRtl ? 'ربح' : 'Profit' },
                    ].map((l) => (
                      <div key={l.label} className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ background: l.color }} />
                        {l.label}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-400 py-8 text-center">
                  {isRtl
                    ? 'لا تتوفر بيانات شهرية من الخادم لهذا التقرير حالياً.'
                    : 'No monthly breakdown from API for this report.'}
                </p>
              )}
            </div>
            <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
              <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide mb-3">
                {isRtl ? 'توزيع المصروفات' : 'Expense mix'}
              </p>
              {expenseDonutData.length > 0 ? (
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="w-[200px] h-[140px] shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={expenseDonutData}
                          cx="50%"
                          cy="50%"
                          innerRadius={38}
                          outerRadius={58}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {expenseDonutData.map((entry, i) => (
                            <Cell key={i} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number | string | undefined) => fmt(Number(v ?? 0))} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-col gap-2 text-xs flex-1 min-w-0">
                    {expenseDonutData.map((item) => (
                      <div key={item.name} className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: item.fill }} />
                        <span className="text-slate-500 flex-1 truncate">{item.name}</span>
                        <span className="font-medium tabular-nums">{fmt(item.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-400 text-center py-6">{isRtl ? 'لا مصروفات لعرضها' : 'No expenses'}</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto w-full income-statement-report" id="income-statement-print">
        {isLoading ? (
          <div className="flex justify-center items-center h-40">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
          </div>
        ) : data ? (
          <div dir={isRtl ? 'rtl' : 'ltr'} className="p-6">
            <header className="border-b border-slate-200 pb-4 mb-4">
              <h3 className="text-lg font-bold text-slate-800 mt-2 text-center">{t.reports.incomeStatement}</h3>
              <p className="text-sm text-slate-600 text-center mt-2">
                {t.reports.periodFromTo} {data.from_date ? formatDisplayDate(data.from_date) : '—'} {t.to}{' '}
                {data.to_date ? formatDisplayDate(data.to_date) : '—'}
              </p>
              <p className="text-sm text-slate-500 text-center mt-0.5">
                {t.reports.issueDate}: {data.issue_date ? formatDisplayDate(data.issue_date) : '—'}
              </p>
            </header>

            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-start text-[10px] font-medium text-slate-500 px-3 py-2">{isRtl ? 'البند' : 'Item'}</th>
                    <th className="text-end text-[10px] font-medium text-slate-500 px-3 py-2 tabular-nums">
                      {currYearLabel} ({reportCurrency?.code ?? 'KWD'})
                    </th>
                    {compareMode !== 'none' && (
                      <>
                        <th className="text-end text-[10px] font-medium text-slate-500 px-3 py-2 tabular-nums">
                          {compareColTitle}
                        </th>
                        <th className="text-end text-[10px] font-medium text-slate-500 px-3 py-2">{isRtl ? 'التغيير' : 'Δ %'}</th>
                      </>
                    )}
                    <th className="text-end text-[10px] font-medium text-slate-500 px-3 py-2 w-24">
                      {isRtl ? 'الوزن' : 'Weight'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-100">
                    <td className="px-3 py-2 font-semibold text-slate-800">{t.reports.totalRevenue}</td>
                    <td className="px-3 py-2" />
                    {compareMode !== 'none' && (
                      <>
                        <td className="px-3 py-2" />
                        <td className="px-3 py-2" />
                      </>
                    )}
                    <td className="px-3 py-2" />
                  </tr>
                  <tr className="border-b border-slate-50">
                    <td className="px-3 py-1.5 text-slate-700">{t.reports.grossSales}</td>
                    <td className="px-3 py-1.5 tabular-nums text-end">{fmt(data.gross_sales ?? 0)}</td>
                    {compareMode !== 'none' && (
                      <>
                        <td className="px-3 py-1.5 tabular-nums text-end text-slate-600">
                          {prevData ? fmt(prevData.gross_sales ?? 0) : '—'}
                        </td>
                        <td className="px-3 py-1.5 text-end">
                          <ChangeIndicator current={data.gross_sales ?? 0} previous={prevData?.gross_sales} />
                        </td>
                      </>
                    )}
                    <td className="px-3 py-1.5">
                      <MiniBar value={data.gross_sales ?? 0} total={revenueBase} color="#185FA5" />
                    </td>
                  </tr>
                  {(data.sales_returns ?? 0) !== 0 && (
                    <tr className="border-b border-slate-50">
                      <td className="px-3 py-1.5 text-slate-700">{t.reports.salesReturns} (-)</td>
                      <td className="px-3 py-1.5 tabular-nums text-end text-red-600">
                        ({fmt(Math.abs(data.sales_returns ?? 0))})
                      </td>
                      {compareMode !== 'none' && (
                        <>
                          <td className="px-3 py-1.5 tabular-nums text-end text-slate-600">
                            {prevData ? `(${fmt(Math.abs(prevData.sales_returns ?? 0))})` : '—'}
                          </td>
                          <td className="px-3 py-1.5 text-end">
                            <ChangeIndicator current={data.sales_returns ?? 0} previous={prevData?.sales_returns} />
                          </td>
                        </>
                      )}
                      <td className="px-3 py-1.5">
                        <MiniBar value={data.sales_returns ?? 0} total={revenueBase} color="#185FA5" />
                      </td>
                    </tr>
                  )}
                  {(data.sales_discount ?? 0) !== 0 && (
                    <tr className="border-b border-slate-50">
                      <td className="px-3 py-1.5 text-slate-700">{t.reports.salesDiscount} (-)</td>
                      <td className="px-3 py-1.5 tabular-nums text-end text-red-600">
                        ({fmt(Math.abs(data.sales_discount ?? 0))})
                      </td>
                      {compareMode !== 'none' && (
                        <>
                          <td className="px-3 py-1.5 tabular-nums text-end text-slate-600">
                            {prevData ? `(${fmt(Math.abs(prevData.sales_discount ?? 0))})` : '—'}
                          </td>
                          <td className="px-3 py-1.5 text-end">
                            <ChangeIndicator current={data.sales_discount ?? 0} previous={prevData?.sales_discount} />
                          </td>
                        </>
                      )}
                      <td className="px-3 py-1.5">
                        <MiniBar value={data.sales_discount ?? 0} total={revenueBase} color="#185FA5" />
                      </td>
                    </tr>
                  )}
                  <tr className="border-b border-slate-200 font-semibold bg-slate-50/50">
                    <td className="px-3 py-2">{t.reports.netSales}</td>
                    <td className="px-3 py-2 tabular-nums text-end">{fmt(data.net_sales ?? data.total_revenue)}</td>
                    {compareMode !== 'none' && (
                      <>
                        <td className="px-3 py-2 tabular-nums text-end text-slate-700">
                          {prevData ? fmt(prevData.net_sales ?? prevData.total_revenue) : '—'}
                        </td>
                        <td className="px-3 py-2 text-end">
                          <ChangeIndicator
                            current={data.net_sales ?? data.total_revenue}
                            previous={prevData ? (prevData.net_sales ?? prevData.total_revenue) : undefined}
                          />
                        </td>
                      </>
                    )}
                    <td className="px-3 py-2">
                      <MiniBar value={revenueBase} total={revenueBase} color="#185FA5" />
                    </td>
                  </tr>

                  <SectionTableBlock
                    title={t.reports.costOfGoodsSold}
                    lines={data.cogs ?? []}
                    total={data.total_cogs}
                    fmt={fmt}
                    isRtl={isRtl}
                    showNegative
                    isExpanded={expandedSections.cogs}
                    onToggle={() => toggleSection('cogs')}
                    getDisplayName={getDisplayName}
                    compareMode={compareMode}
                    prevTotal={prevData?.total_cogs}
                    prevByCode={prevMaps.cogs}
                    revenueBase={revenueBase}
                    headerExtra={<MarginBadge value={kpis.cogsRatio} label={isRtl ? 'من الإيراد ' : '% rev '} color="red" />}
                  />

                  <tr className="border-y-2 border-slate-300 font-bold text-slate-900 bg-slate-50/80">
                    <td className="px-3 py-2">
                      <div className="flex min-w-0 items-center gap-4 flex-nowrap">
                        <span className="min-w-0 shrink">{t.reports.grossProfit}</span>
                        <MarginBadge value={kpis.grossMargin} label={isRtl ? 'هامش ' : 'Margin '} color="green" />
                      </div>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-end">{fmt(data.gross_profit)}</td>
                    {compareMode !== 'none' && (
                      <>
                        <td className="px-3 py-2 tabular-nums text-end text-slate-700">
                          {prevData ? fmt(prevData.gross_profit) : '—'}
                        </td>
                        <td className="px-3 py-2 text-end">
                          <ChangeIndicator current={data.gross_profit} previous={prevData?.gross_profit} />
                        </td>
                      </>
                    )}
                    <td className="px-3 py-2">
                      <MiniBar value={data.gross_profit} total={revenueBase} color="#3B6D11" />
                    </td>
                  </tr>

                  <SectionTableBlock
                    title={t.reports.administrativeExpenses}
                    lines={data.administrative_expenses ?? []}
                    total={data.total_administrative_expenses}
                    fmt={fmt}
                    isRtl={isRtl}
                    showNegative
                    isExpanded={expandedSections.admin}
                    onToggle={() => toggleSection('admin')}
                    getDisplayName={getDisplayName}
                    compareMode={compareMode}
                    prevTotal={prevData?.total_administrative_expenses}
                    prevByCode={prevMaps.admin}
                    revenueBase={revenueBase}
                  />
                  <SectionTableBlock
                    title={t.reports.sellingMarketingExpenses}
                    lines={data.selling_marketing_expenses ?? []}
                    total={data.total_selling_marketing_expenses}
                    fmt={fmt}
                    isRtl={isRtl}
                    showNegative
                    isExpanded={expandedSections.selling}
                    onToggle={() => toggleSection('selling')}
                    getDisplayName={getDisplayName}
                    compareMode={compareMode}
                    prevTotal={prevData?.total_selling_marketing_expenses}
                    prevByCode={prevMaps.selling}
                    revenueBase={revenueBase}
                  />
                  <SectionTableBlock
                    title={t.reports.otherExpenses}
                    lines={data.other_expenses ?? []}
                    total={data.total_other_expenses}
                    fmt={fmt}
                    isRtl={isRtl}
                    showNegative
                    isExpanded={expandedSections.other}
                    onToggle={() => toggleSection('other')}
                    getDisplayName={getDisplayName}
                    compareMode={compareMode}
                    prevTotal={prevData?.total_other_expenses}
                    prevByCode={prevMaps.other}
                    revenueBase={revenueBase}
                  />

                  <tr className="border-t border-slate-200 font-semibold text-slate-800">
                    <td className="px-3 py-2">
                      <div className="flex min-w-0 items-center gap-4 flex-nowrap">
                        <span className="min-w-0 shrink">{t.reports.totalExpenses}</span>
                        <MarginBadge value={kpis.expenseRatio} label={isRtl ? 'من الإيراد ' : 'of rev '} color="amber" />
                      </div>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-end">{fmt(data.total_expenses)}</td>
                    {compareMode !== 'none' && (
                      <>
                        <td className="px-3 py-2 tabular-nums text-end text-slate-700">
                          {prevData ? fmt(prevData.total_expenses) : '—'}
                        </td>
                        <td className="px-3 py-2 text-end">
                          <ChangeIndicator current={data.total_expenses} previous={prevData?.total_expenses} />
                        </td>
                      </>
                    )}
                    <td className="px-3 py-2">
                      <MiniBar value={data.total_expenses} total={revenueBase} color="#E24B4A" />
                    </td>
                  </tr>
                  <tr
                    className={`font-bold text-lg ${
                      data.net_income >= 0 ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'
                    }`}
                  >
                    <td className="px-3 py-3 rounded-s-lg">
                      <div className="flex min-w-0 items-center gap-4 flex-nowrap">
                        <span className="min-w-0 shrink">
                          {data.net_income >= 0 ? t.reports.netIncome : t.reports.netLoss}
                        </span>
                        <MarginBadge
                          value={kpis.netMargin}
                          label={isRtl ? 'هامش ' : 'Margin '}
                          color={kpis.netMargin >= 0 ? 'green' : 'red'}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-3 tabular-nums text-end">{fmt(data.net_income)}</td>
                    {compareMode !== 'none' && (
                      <>
                        <td className="px-3 py-3 tabular-nums text-end opacity-90">
                          {prevData ? fmt(prevData.net_income) : '—'}
                        </td>
                        <td className="px-3 py-3 text-end">
                          <ChangeIndicator current={data.net_income} previous={prevData?.net_income} />
                        </td>
                      </>
                    )}
                    <td className="px-3 py-3">
                      <MiniBar value={data.net_income} total={revenueBase} color={data.net_income >= 0 ? '#3B6D11' : '#E24B4A'} />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <footer className="mt-6 pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500 no-print">
              <span>
                {isRtl ? 'تاريخ الإصدار:' : 'Issued:'}{' '}
                {new Date().toLocaleDateString(isRtl ? 'ar-KW' : 'en-KW')}
              </span>
              <span className="tabular-nums">
                {isRtl ? 'الفترة:' : 'Period:'} {dateFrom} → {dateTo}
              </span>
              <button
                type="button"
                onClick={exportExcel}
                className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-500 shrink-0"
                title={t.accounts.exportExcel}
              >
                <FileSpreadsheet size={16} />
              </button>
            </footer>

            <div className="mt-8 pt-6 border-t border-slate-200 print:mt-6">
              <div className="flex justify-center">
                <div className="text-center text-sm text-slate-600">
                  <p className="font-medium text-slate-700">{t.reports.preparedBy}</p>
                  <div className="h-10 w-48 border-b border-slate-300 mt-4 mx-auto" />
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 12mm 15mm; }
          body * { visibility: hidden; }
          #income-statement-print, #income-statement-print * { visibility: visible; }
          #income-statement-print { position: absolute; left: 0; top: 0; width: 100%; max-width: 210mm; margin: 0; padding: 0; background: white; border: none; }
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  )
}
