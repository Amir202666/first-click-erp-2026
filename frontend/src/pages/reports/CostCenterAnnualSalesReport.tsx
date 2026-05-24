import { useMemo, useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileText, FileSpreadsheet, Printer, Columns3 } from 'lucide-react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { useDocumentTitleContext } from '../../contexts/DocumentTitleContext'
import { fetchBranches, fetchCostCenterSalesAnnual, fetchSettings } from '../../api/tenant'
import type { BranchSalesAnnualMonthMeta, CostCenterSalesAnnualRow } from '../../api/tenant'
import { coerceDecimalPlaces, formatAmount } from '../../utils/currency'
import { asArray } from '../../utils/asArray'
import type { Branch } from '../../types'
import { useClientSort, type SortColumn } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

const CC_ANNUAL_COLUMN_STORAGE_KEY = 'costCenterAnnualSalesVisiblePeriodColumns_v1'

function csvCell(v: string | number): string {
  return `"${String(v).replace(/"/g, '""')}"`
}

type SalesChannel = 'all' | 'restaurant' | 'pos' | 'regular'
type AmountBasis = 'net_before_tax' | 'inclusive'
type AnnualBreakdown = 'monthly' | 'quarterly' | 'semiannual'

const BAR_BG: string[] = [
  'rgba(37, 99, 235, 0.75)',
  'rgba(5, 150, 105, 0.75)',
  'rgba(217, 119, 6, 0.75)',
  'rgba(139, 92, 246, 0.75)',
  'rgba(220, 38, 38, 0.75)',
  'rgba(8, 145, 178, 0.75)',
  'rgba(190, 24, 93, 0.75)',
  'rgba(100, 116, 139, 0.75)',
  'rgba(22, 163, 74, 0.75)',
  'rgba(79, 70, 229, 0.75)',
]

function defaultFiscalStartYear(now: Date, fyStartMonth: number): number {
  const cm = now.getMonth() + 1
  const m = fyStartMonth >= 1 && fyStartMonth <= 12 ? fyStartMonth : 1
  return cm >= m ? now.getFullYear() : now.getFullYear() - 1
}

function formatMonthNameOnly(year: number, month: number, lang: string): string {
  const d = new Date(year, month - 1, 1)
  const loc = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  return d.toLocaleDateString(loc, { month: lang === 'ar' ? 'long' : 'short' })
}

function formatPeriodColumnLabel(m: BranchSalesAnnualMonthMeta, lang: string): string {
  if (m.quarter != null) {
    const mo = formatMonthNameOnly(m.year, m.month, lang)
    return lang === 'ar' ? `الربع ${m.quarter} (${mo})` : `Q${m.quarter} (${mo})`
  }
  if (m.half != null) {
    const mo = formatMonthNameOnly(m.year, m.month, lang)
    return lang === 'ar' ? (m.half === 1 ? `النصف الأول (${mo})` : `النصف الثاني (${mo})`) : `H${m.half} (${mo})`
  }
  return formatMonthNameOnly(m.year, m.month, lang)
}

export default function CostCenterAnnualSalesReport() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const { setPageTitle } = useDocumentTitleContext()
  const tenantId = currentTenant?.id ?? 0

  const { data: settings } = useQuery({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })

  const rawFyMonth = (settings as Record<string, unknown> | undefined)?.fiscal_year_start_month
  const fyParsed =
    typeof rawFyMonth === 'number'
      ? rawFyMonth
      : typeof rawFyMonth === 'string'
        ? Number(rawFyMonth)
        : NaN
  const fyStartMonth =
    Number.isFinite(fyParsed) && fyParsed >= 1 && fyParsed <= 12 ? Math.floor(fyParsed) : 1

  const decimals = coerceDecimalPlaces((settings as Record<string, unknown> | undefined)?.doc_amount_decimals, 2)
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const fmt = (n: number) => formatAmount(n, { decimal_places: decimals }, locale)

  const [fiscalYear, setFiscalYear] = useState(() => defaultFiscalStartYear(new Date(), fyStartMonth))
  const [amountBasis, setAmountBasis] = useState<AmountBasis>('net_before_tax')
  const [salesChannel, setSalesChannel] = useState<SalesChannel>('all')
  const [breakdown, setBreakdown] = useState<AnnualBreakdown>('monthly')
  const [branchId, setBranchId] = useState<string>('')
  const [showColumnsMenu, setShowColumnsMenu] = useState(false)
  const columnsMenuRef = useRef<HTMLDivElement | null>(null)
  const [periodColumnVisible, setPeriodColumnVisible] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setFiscalYear(defaultFiscalStartYear(new Date(), fyStartMonth))
  }, [fyStartMonth])

  const { data: branchesData } = useQuery({
    queryKey: ['branches', tenantId, 'cc-annual-sales'],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId,
  })
  const branches: Branch[] = asArray<Branch>(branchesData)

  const params = useMemo(() => {
    const p: Record<string, string> = {
      fiscal_year: String(fiscalYear),
      amount_basis: amountBasis,
      sales_channel: salesChannel,
      breakdown,
    }
    if (branchId) p.branch_id = branchId
    return p
  }, [fiscalYear, amountBasis, salesChannel, breakdown, branchId])

  const { data, isLoading, error } = useQuery({
    queryKey: ['cost-center-sales-annual', tenantId, params],
    queryFn: () => fetchCostCenterSalesAnnual(tenantId, params),
    enabled: !!tenantId,
  })

  const monthKeysSig = data?.month_keys?.join('|') ?? ''
  useEffect(() => {
    if (!data?.month_keys?.length) return
    let parsed: Record<string, unknown> = {}
    try {
      const raw = localStorage.getItem(CC_ANNUAL_COLUMN_STORAGE_KEY)
      if (raw) parsed = JSON.parse(raw) as Record<string, unknown>
    } catch {
      /* ignore */
    }
    const next: Record<string, boolean> = {}
    for (const k of data.month_keys) {
      next[k] = typeof parsed[k] === 'boolean' ? (parsed[k] as boolean) : true
    }
    next.year_total = typeof parsed.year_total === 'boolean' ? parsed.year_total : true
    setPeriodColumnVisible(next)
  }, [data?.fiscal_year, data?.breakdown, monthKeysSig])

  useEffect(() => {
    if (!data?.month_keys?.length || Object.keys(periodColumnVisible).length === 0) return
    try {
      localStorage.setItem(CC_ANNUAL_COLUMN_STORAGE_KEY, JSON.stringify(periodColumnVisible))
    } catch {
      /* ignore */
    }
  }, [periodColumnVisible, data?.month_keys?.length])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!columnsMenuRef.current) return
      if (!columnsMenuRef.current.contains(e.target as Node)) setShowColumnsMenu(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const isPeriodColVisible = (key: string) => periodColumnVisible[key] !== false

  const titleFull = lang === 'ar' ? 'مبيعات مراكز التكلفة (سنوي)' : 'Annual Cost Center Sales'
  const titleMenu = (t.nav as Record<string, string | undefined>).costCenterSalesReport ?? titleFull
  const noCcLabel = lang === 'ar' ? 'بدون مركز' : 'No cost center'

  useEffect(() => {
    setPageTitle(titleMenu)
    return () => setPageTitle(null)
  }, [titleMenu, setPageTitle])

  const rowLabel = (name: string | null) => (name == null || name === '' ? noCcLabel : name)

  const yearOptions = useMemo(() => {
    const y = new Date().getFullYear()
    const list: number[] = []
    for (let i = y - 8; i <= y + 1; i++) list.push(i)
    return list
  }, [])

  const monthLabels = useMemo(() => {
    if (!data?.months?.length) return []
    return data.months.map((m) => formatPeriodColumnLabel(m, lang))
  }, [data?.months, lang])

  type CcAnnualSortKey = 'name' | 'year_total' | `p:${string}`
  const ccRows = data?.cost_centers ?? []
  const ccAnnualSortColumns = useMemo((): SortColumn<CostCenterSalesAnnualRow, CcAnnualSortKey>[] => {
    if (!data?.month_keys?.length) return []
    const cols: SortColumn<CostCenterSalesAnnualRow, CcAnnualSortKey>[] = [
      {
        key: 'name',
        type: 'string',
        getValue: (r) => (r.cost_center_name == null || r.cost_center_name === '' ? noCcLabel : r.cost_center_name),
      },
    ]
    data.month_keys.forEach((mk, i) => {
      cols.push({
        key: `p:${mk}` as CcAnnualSortKey,
        type: 'number',
        getValue: (r) => Number(r.months[i] ?? 0),
      })
    })
    cols.push({ key: 'year_total', type: 'number', getValue: (r) => Number(r.year_total) })
    return cols
  }, [data?.month_keys, noCcLabel])
  const { sort, toggleSort, sortedRows: sortedCcRows } = useClientSort<CostCenterSalesAnnualRow, CcAnnualSortKey>(
    ccRows,
    ccAnnualSortColumns,
    { locale },
  )

  const chartData = useMemo(() => {
    if (!sortedCcRows.length || !monthLabels.length || !data?.month_keys.length) return null
    const idxs = data.month_keys
      .map((k, i) => (periodColumnVisible[k] !== false ? i : -1))
      .filter((i) => i >= 0)
    if (idxs.length === 0) return null
    const labels = idxs.map((i) => monthLabels[i])
    return {
      labels,
      datasets: sortedCcRows.map((b, i) => ({
        label: rowLabel(b.cost_center_name),
        data: idxs.map((j) => b.months[j] ?? 0),
        backgroundColor: BAR_BG[i % BAR_BG.length],
        borderColor: BAR_BG[i % BAR_BG.length].replace('0.75', '1'),
        borderWidth: 1,
      })),
    }
  }, [sortedCcRows, monthLabels, data?.month_keys, periodColumnVisible, noCcLabel])

  const companyName =
    String((settings as Record<string, unknown> | undefined)?.company_name ?? '') || currentTenant?.name || ''

  function buildPrintTableHtml(): string {
    if (!data) return ''
    const ccHdr = lang === 'ar' ? 'مركز التكلفة' : 'Cost center'
    const totalHdr = lang === 'ar' ? 'إجمالي السنة' : 'Year total'
    const headCells: string[] = [`<th>${ccHdr}</th>`]
    data.months.forEach((m, i) => {
      if (isPeriodColVisible(data.month_keys[i])) {
        headCells.push(`<th class="num">${formatPeriodColumnLabel(m, lang)}</th>`)
      }
    })
    if (isPeriodColVisible('year_total')) headCells.push(`<th class="num">${totalHdr}</th>`)
    const bodyRows = sortedCcRows
      .map((row) => {
        const cells: string[] = [`<td>${rowLabel(row.cost_center_name)}</td>`]
        data.month_keys.forEach((k, i) => {
          if (isPeriodColVisible(k)) cells.push(`<td class="num">${fmt(row.months[i] ?? 0)}</td>`)
        })
        if (isPeriodColVisible('year_total')) cells.push(`<td class="num">${fmt(row.year_total)}</td>`)
        return `<tr>${cells.join('')}</tr>`
      })
      .join('')
    const footCells: string[] = [`<td><strong>${lang === 'ar' ? 'الإجمالي' : 'Total'}</strong></td>`]
    data.month_keys.forEach((k, i) => {
      if (isPeriodColVisible(k)) footCells.push(`<td class="num"><strong>${fmt(data.column_totals[i] ?? 0)}</strong></td>`)
    })
    if (isPeriodColVisible('year_total')) footCells.push(`<td class="num"><strong>${fmt(data.grand_total)}</strong></td>`)
    return `<table><thead><tr>${headCells.join('')}</tr></thead><tbody>${bodyRows}</tbody><tfoot><tr>${footCells.join('')}</tr></tfoot></table>`
  }

  function handlePrint() {
    if (!data) return
    const win = window.open('', '_blank')
    if (!win) return
    const periodLine = `${data.period_from} — ${data.period_to}`
    win.document.write(`<!DOCTYPE html><html dir="${isRtl ? 'rtl' : 'ltr'}"><head>
<meta charset="utf-8"><title>${titleFull}</title>
<style>
body{font-family:Arial,sans-serif;padding:24px;}
table{width:100%;border-collapse:collapse;margin-top:16px;font-size:12px;}
th,td{border:1px solid #ddd;padding:8px;}
th{background:#f1f5f9;}
.num{text-align:end;font-variant-numeric:tabular-nums;}
h2{margin:0;}
.meta{color:#64748b;font-size:13px;margin-top:8px;}
</style></head><body>
<h2>${titleFull}</h2>
<p class="meta">${companyName ? `${companyName} · ` : ''}${periodLine} · ${lang === 'ar' ? 'السنة المالية' : 'FY'} ${data.fiscal_year}</p>
${buildPrintTableHtml()}
</body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => {
      win.print()
      win.close()
    }, 300)
  }

  function handleExportExcel() {
    if (!data) return
    const ccHdr = lang === 'ar' ? 'مركز التكلفة' : 'Cost center'
    const totalHdr = lang === 'ar' ? 'إجمالي السنة' : 'Year total'
    const headers: string[] = [csvCell(ccHdr)]
    data.months.forEach((m, i) => {
      if (isPeriodColVisible(data.month_keys[i])) headers.push(csvCell(formatPeriodColumnLabel(m, lang)))
    })
    if (isPeriodColVisible('year_total')) headers.push(csvCell(totalHdr))
    const lines = [headers.join(',')]
    for (const row of sortedCcRows) {
      const cells: string[] = [csvCell(rowLabel(row.cost_center_name))]
      data.month_keys.forEach((k, i) => {
        if (isPeriodColVisible(k)) cells.push(String(row.months[i] ?? 0))
      })
      if (isPeriodColVisible('year_total')) cells.push(String(row.year_total))
      lines.push(cells.join(','))
    }
    const totalCells: string[] = [csvCell(lang === 'ar' ? 'الإجمالي' : 'Total')]
    data.month_keys.forEach((k, i) => {
      if (isPeriodColVisible(k)) totalCells.push(String(data.column_totals[i] ?? 0))
    })
    if (isPeriodColVisible('year_total')) totalCells.push(String(data.grand_total))
    lines.push(totalCells.join(','))
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cost-center-sales-annual-${data.fiscal_year}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const chartOptions = useMemo(() => {
    const tickFmt = (n: number) => formatAmount(n, { decimal_places: decimals }, locale)
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom' as const,
          labels: { boxWidth: 12, font: { size: 11 } },
        },
        title: {
          display: true,
          text:
            data?.breakdown === 'quarterly'
              ? lang === 'ar'
                ? 'مقارنة مراكز التكلفة ربع سنوياً'
                : 'Quarterly performance by cost center'
              : data?.breakdown === 'semiannual'
                ? lang === 'ar'
                  ? 'مقارنة مراكز التكلفة نصف سنوياً'
                  : 'Semi-annual performance by cost center'
                : lang === 'ar'
                  ? 'مقارنة مراكز التكلفة شهرياً'
                  : 'Monthly performance by cost center',
          font: { size: 14 },
        },
        tooltip: {
          mode: 'index' as const,
          intersect: false,
          callbacks: {
            label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) => {
              const v = ctx.parsed.y ?? 0
              return `${ctx.dataset.label ?? ''}: ${tickFmt(v)}`
            },
          },
        },
      },
      scales: {
        x: {
          stacked: false,
          ticks: { maxRotation: 45, minRotation: 0 },
        },
        y: {
          stacked: false,
          beginAtZero: true,
          ticks: {
            callback: (v: string | number) => tickFmt(Number(v)),
          },
        },
      },
    }
  }, [lang, decimals, locale, data?.breakdown])

  const stickyEdge = isRtl ? 'sticky end-0' : 'sticky start-0'
  const stickyShadow = isRtl
    ? 'shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.08)]'
    : 'shadow-[4px_0_6px_-2px_rgba(0,0,0,0.08)]'

  if (!tenantId) {
    return (
      <div className="px-0 py-3">
        <p className="text-amber-600">{lang === 'ar' ? 'يرجى اختيار الشركة أولاً.' : 'Please select a company first.'}</p>
      </div>
    )
  }

  return (
    <div className="px-0 py-3 space-y-3 w-full min-w-0 max-w-full" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-1.5">
        <h1 className="text-base font-semibold text-slate-900 leading-tight">{titleFull}</h1>
        <div className="relative flex items-center gap-1.5 no-print shrink-0" ref={columnsMenuRef}>
          <button
            type="button"
            onClick={() => setShowColumnsMenu((v) => !v)}
            disabled={!data?.month_keys?.length}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#D9DCE0] bg-[#F0F2F5] text-[#344054] shadow-sm transition-colors hover:bg-[#E4E7EB] disabled:opacity-50"
            title={lang === 'ar' ? 'تخصيص الأعمدة' : 'Customize columns'}
          >
            <Columns3 size={16} strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={!data}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#F0F2F5] border border-[#D9DCE0] text-[#344054] hover:bg-[#E4E7EB] disabled:opacity-50"
            title={t.payments?.printReport ?? (lang === 'ar' ? 'طباعة التقرير' : 'Print report')}
          >
            <Printer size={15} />
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={!data}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#344054] text-white hover:bg-[#2d3846] disabled:opacity-50"
            title={t.payments?.exportPdf ?? (lang === 'ar' ? 'تصدير PDF' : 'Export PDF')}
          >
            <FileText size={15} />
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={!data || !data.cost_centers.length}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
            title={t.payments?.exportExcel ?? (lang === 'ar' ? 'تصدير Excel' : 'Export Excel')}
          >
            <FileSpreadsheet size={15} />
          </button>
          {showColumnsMenu && data?.month_keys.length ? (
            <div
              className={`absolute top-full mt-2 z-20 w-64 max-h-[70vh] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg py-2 text-sm ${isRtl ? 'left-0' : 'right-0'}`}
            >
              <div className="px-3 pb-2 text-xs font-semibold text-slate-500">
                {lang === 'ar' ? 'إظهار/إخفاء أعمدة الفترة' : 'Show / hide period columns'}
              </div>
              {data.months.map((m, i) => {
                const key = data.month_keys[i]
                return (
                  <label
                    key={key}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      checked={isPeriodColVisible(key)}
                      onChange={() =>
                        setPeriodColumnVisible((prev) => ({
                          ...prev,
                          [key]: !isPeriodColVisible(key),
                        }))
                      }
                      className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-slate-700 text-xs">{formatPeriodColumnLabel(m, lang)}</span>
                  </label>
                )
              })}
              <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer select-none border-t border-slate-100 mt-1 pt-2">
                <input
                  type="checkbox"
                  checked={isPeriodColVisible('year_total')}
                  onChange={() =>
                    setPeriodColumnVisible((prev) => ({
                      ...prev,
                      year_total: !isPeriodColVisible('year_total'),
                    }))
                  }
                  className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-slate-700 text-xs">{lang === 'ar' ? 'إجمالي السنة' : 'Year total'}</span>
              </label>
            </div>
          ) : null}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 py-3.5 px-3">
        <div className="grid w-full min-w-0 grid-cols-5 items-end gap-2">
          <div className="flex min-w-0 flex-col gap-2">
            <span
              className="truncate text-xs text-slate-600"
              title={lang === 'ar' ? 'السنة المالية (بداية)' : 'Fiscal year (start)'}
            >
              {lang === 'ar' ? 'السنة المالية (بداية)' : 'Fiscal year (start)'}
            </span>
            <select
              value={fiscalYear}
              onChange={(e) => setFiscalYear(Number(e.target.value))}
              className="h-9 w-full min-w-0 max-w-full border border-slate-300 rounded-lg px-2.5 text-sm bg-white leading-normal"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <span className="truncate text-xs text-slate-600" title={lang === 'ar' ? 'أساس المبلغ' : 'Amount basis'}>
              {lang === 'ar' ? 'أساس المبلغ' : 'Amount basis'}
            </span>
            <select
              value={amountBasis}
              onChange={(e) => setAmountBasis(e.target.value as AmountBasis)}
              className="h-9 w-full min-w-0 max-w-full border border-slate-300 rounded-lg px-2.5 text-sm bg-white leading-normal"
            >
              <option value="net_before_tax">
                {lang === 'ar' ? 'صافي قبل الضريبة' : 'Net before tax'}
              </option>
              <option value="inclusive">{lang === 'ar' ? 'شامل الضريبة' : 'Tax inclusive'}</option>
            </select>
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <span className="truncate text-xs text-slate-600" title={lang === 'ar' ? 'نوع المبيعات' : 'Sales channel'}>
              {lang === 'ar' ? 'نوع المبيعات' : 'Sales channel'}
            </span>
            <select
              value={salesChannel}
              onChange={(e) => setSalesChannel(e.target.value as SalesChannel)}
              className="h-9 w-full min-w-0 max-w-full border border-slate-300 rounded-lg px-2.5 text-sm bg-white leading-normal"
            >
              <option value="all">{lang === 'ar' ? 'الكل' : 'All'}</option>
              <option value="restaurant">{lang === 'ar' ? 'مطعم' : 'Restaurant'}</option>
              <option value="pos">{lang === 'ar' ? 'نقاط بيع (POS)' : 'POS'}</option>
              <option value="regular">{lang === 'ar' ? 'مبيعات جملة / عادية' : 'Wholesale / regular'}</option>
            </select>
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <span className="truncate text-xs text-slate-600" title={lang === 'ar' ? 'تجميع الفترة' : 'Period breakdown'}>
              {lang === 'ar' ? 'تجميع الفترة' : 'Period breakdown'}
            </span>
            <select
              value={breakdown}
              onChange={(e) => setBreakdown(e.target.value as AnnualBreakdown)}
              className="h-9 w-full min-w-0 max-w-full border border-slate-300 rounded-lg px-2.5 text-sm bg-white leading-normal"
            >
              <option value="monthly">{lang === 'ar' ? 'شهري (سنة كاملة)' : 'Monthly (full year)'}</option>
              <option value="quarterly">{lang === 'ar' ? 'ربع سنوي' : 'Quarterly'}</option>
              <option value="semiannual">{lang === 'ar' ? 'نصف سنوي' : 'Semi-annual'}</option>
            </select>
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <span className="truncate text-xs text-slate-600" title={lang === 'ar' ? 'الفرع' : 'Branch'}>
              {lang === 'ar' ? 'الفرع' : 'Branch'}
            </span>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="h-9 w-full min-w-0 max-w-full border border-slate-300 rounded-lg px-2.5 text-sm bg-white leading-normal"
            >
              <option value="">{lang === 'ar' ? 'كل الفروع' : 'All branches'}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-3 py-2">
          {lang === 'ar' ? 'تعذر تحميل التقرير.' : 'Failed to load report.'}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-500 border-t-transparent" />
        </div>
      ) : data ? (
        <>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto scroll-smooth overscroll-x-contain ps-1 pe-3">
              <table
                className={`w-full text-sm ${
                  data.breakdown === 'monthly' ? 'min-w-[960px]' : data.breakdown === 'quarterly' ? 'min-w-[480px]' : 'min-w-[360px]'
                }`}
              >
                <thead>
                  <tr className="bg-slate-50 text-slate-700 border-b border-slate-200">
                    <SortableTh
                      label={lang === 'ar' ? 'مركز التكلفة' : 'Cost center'}
                      sortKey="name"
                      sortState={sort}
                      onToggle={toggleSort}
                      className={`px-0 font-medium text-start whitespace-nowrap z-30 bg-slate-50 ${stickyEdge} ${stickyShadow} min-w-[180px]`}
                    />
                    {data.months.map((m, idx) =>
                      isPeriodColVisible(data.month_keys[idx]) ? (
                        <SortableTh
                          key={m.key}
                          label={formatPeriodColumnLabel(m, lang)}
                          sortKey={`p:${data.month_keys[idx]}` as CcAnnualSortKey}
                          sortState={sort}
                          onToggle={toggleSort}
                          className={`px-0 font-medium text-end whitespace-nowrap tabular-nums ${
                            data.breakdown === 'monthly' ? 'min-w-[72px]' : 'min-w-[88px]'
                          }`}
                        />
                      ) : null,
                    )}
                    {isPeriodColVisible('year_total') ? (
                      <SortableTh
                        label={lang === 'ar' ? 'إجمالي السنة' : 'Year total'}
                        sortKey="year_total"
                        sortState={sort}
                        onToggle={toggleSort}
                        className="px-0 font-medium text-end whitespace-nowrap tabular-nums min-w-[110px] bg-slate-100"
                      />
                    ) : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedCcRows.map((row, ri) => (
                    <tr
                      key={row.cost_center_id != null ? `cc-${row.cost_center_id}` : `cc-none-${ri}`}
                      className="hover:bg-slate-50/80"
                    >
                      <td
                        className={`px-3 py-1.5 text-slate-900 font-medium whitespace-nowrap z-20 bg-white ${stickyEdge} ${stickyShadow} min-w-[180px]`}
                      >
                        {rowLabel(row.cost_center_name)}
                      </td>
                      {row.months.map((amount, idx) =>
                        isPeriodColVisible(data.month_keys[idx]) ? (
                          <td key={data.month_keys[idx] ?? idx} className="px-1 py-1.5 text-end tabular-nums text-slate-800">
                            {fmt(amount)}
                          </td>
                        ) : null,
                      )}
                      {isPeriodColVisible('year_total') ? (
                        <td className="px-3 py-1.5 text-end tabular-nums font-semibold bg-slate-50/90 text-slate-900">
                          {fmt(row.year_total)}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                  <tr className="bg-slate-100 font-semibold text-slate-900 border-t-2 border-slate-200">
                    <td
                      className={`px-3 py-2 whitespace-nowrap z-20 bg-slate-100 ${stickyEdge} ${stickyShadow} min-w-[180px]`}
                    >
                      {lang === 'ar' ? 'الإجمالي' : 'Total'}
                    </td>
                    {data.column_totals.map((amount, idx) =>
                      isPeriodColVisible(data.month_keys[idx]) ? (
                        <td key={data.month_keys[idx] ?? idx} className="px-1 py-2 text-end tabular-nums">
                          {fmt(amount)}
                        </td>
                      ) : null,
                    )}
                    {isPeriodColVisible('year_total') ? (
                      <td className="px-3 py-2 text-end tabular-nums bg-slate-200/80">{fmt(data.grand_total)}</td>
                    ) : null}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <div className="h-[380px] w-full min-h-[320px]">
              {chartData && <Bar data={chartData} options={chartOptions} />}
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
