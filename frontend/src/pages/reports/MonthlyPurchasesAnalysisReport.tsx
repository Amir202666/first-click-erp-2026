import { useMemo, useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
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
import { FileText, FileSpreadsheet, Printer, Columns3 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { useDocumentTitleContext } from '../../contexts/DocumentTitleContext'
import { fetchMonthlyPurchasesAnalysis, fetchBranches, fetchSettings } from '../../api/tenant'
import type { MonthlyPurchasesAnalysisMonthRow, MonthlyPurchasesAnalysisYearTotals } from '../../api/tenant'
import { coerceDecimalPlaces, formatAmount } from '../../utils/currency'
import type { Branch } from '../../types'
import { useClientSort, type SortColumn } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

const MONTHLY_PURCHASES_COL_STORAGE_KEY = 'monthlyPurchasesAnalysisVisiblePeriodColumns_v1'

type MetricKey = keyof MonthlyPurchasesAnalysisYearTotals

/** صفوف التفصيل (بدون صف «شامل الضريبة» — يُعرض في صف الإجمالي مثل تقرير الفروع) */
const METRIC_ROWS: { key: Exclude<MetricKey, 'total'>; labelAr: string; labelEn: string }[] = [
  { key: 'subtotal', labelAr: 'المشتريات (قبل الخصم)', labelEn: 'Purchases (before discount)' },
  { key: 'discount', labelAr: 'الخصم', labelEn: 'Discount' },
  { key: 'shipping', labelAr: 'مصاريف شراء إضافية', labelEn: 'Additional purchase expenses' },
  { key: 'net_before_tax', labelAr: 'إجمالي المشتريات بدون ضريبة', labelEn: 'Total purchases excl. tax' },
  { key: 'tax_amount', labelAr: 'الضريبة', labelEn: 'Tax' },
]

type PurchasesMetricSortKey = 'name' | `p:${string}` | 'year_total'

type MetricRow = { metric: Exclude<MetricKey, 'total'> }

function csvCell(v: string | number): string {
  return `"${String(v).replace(/"/g, '""')}"`
}

function defaultFiscalStartYear(now: Date, fyStartMonth: number): number {
  const cm = now.getMonth() + 1
  const m = fyStartMonth >= 1 && fyStartMonth <= 12 ? fyStartMonth : 1
  return cm >= m ? now.getFullYear() : now.getFullYear() - 1
}

function formatMonthNameOnly(year: number, month: number, lang: string): string {
  const d = new Date(year, month - 1, 1)
  const loc = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  return d.toLocaleDateString(loc, { month: lang === 'ar' ? 'long' : 'short', year: 'numeric' })
}

function monthLabel(year: number, month: number, lang: string): string {
  return formatMonthNameOnly(year, month, lang)
}

/** اسم الشهر فقط (جدول + مخطط) */
function monthColumnHeader(year: number, month: number, lang: string): string {
  const d = new Date(year, month - 1, 1)
  const loc = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  return d.toLocaleDateString(loc, { month: lang === 'ar' ? 'long' : 'short' })
}

type AmountBasis = 'net_before_tax' | 'inclusive'

const BAR_PURCHASES = 'rgba(37, 99, 235, 0.75)'

export default function MonthlyPurchasesAnalysisReport() {
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
    typeof rawFyMonth === 'number' ? rawFyMonth : typeof rawFyMonth === 'string' ? Number(rawFyMonth) : NaN
  const fyStartMonth =
    Number.isFinite(fyParsed) && fyParsed >= 1 && fyParsed <= 12 ? Math.floor(fyParsed) : 1

  const decimals = coerceDecimalPlaces((settings as Record<string, unknown> | undefined)?.doc_amount_decimals, 2)
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const fmt = (n: number) => formatAmount(n, { decimal_places: decimals }, locale)

  const [fiscalYear, setFiscalYear] = useState(() => defaultFiscalStartYear(new Date(), fyStartMonth))
  const [branchId, setBranchId] = useState<string>('')
  const [amountBasis, setAmountBasis] = useState<AmountBasis>('net_before_tax')
  const [showColumnsMenu, setShowColumnsMenu] = useState(false)
  const columnsMenuRef = useRef<HTMLDivElement | null>(null)
  const [periodColumnVisible, setPeriodColumnVisible] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setFiscalYear(defaultFiscalStartYear(new Date(), fyStartMonth))
  }, [fyStartMonth])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!columnsMenuRef.current) return
      if (!columnsMenuRef.current.contains(e.target as Node)) setShowColumnsMenu(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const { data: branches = [] } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId,
    staleTime: 60_000,
  })

  const params = useMemo(() => {
    const p: Record<string, string> = {
      fiscal_year: String(fiscalYear),
      amount_basis: amountBasis,
    }
    if (branchId) p.branch_id = branchId
    return p
  }, [fiscalYear, branchId, amountBasis])

  const { data, isLoading, error } = useQuery({
    queryKey: ['monthly-purchases-analysis', tenantId, params],
    queryFn: () => fetchMonthlyPurchasesAnalysis(tenantId, params),
    enabled: !!tenantId,
  })

  const monthKeysSig = data?.data?.map((d) => d.key).join('|') ?? ''
  useEffect(() => {
    if (!data?.data?.length) return
    let parsed: Record<string, unknown> = {}
    try {
      const raw = localStorage.getItem(MONTHLY_PURCHASES_COL_STORAGE_KEY)
      if (raw) parsed = JSON.parse(raw) as Record<string, unknown>
    } catch {
      /* ignore */
    }
    const next: Record<string, boolean> = {}
    for (const row of data.data) {
      next[row.key] = typeof parsed[row.key] === 'boolean' ? (parsed[row.key] as boolean) : true
    }
    next.year_total = typeof parsed.year_total === 'boolean' ? parsed.year_total : true
    setPeriodColumnVisible(next)
  }, [data?.fiscal_year, monthKeysSig])

  useEffect(() => {
    if (!data?.data?.length || Object.keys(periodColumnVisible).length === 0) return
    try {
      localStorage.setItem(MONTHLY_PURCHASES_COL_STORAGE_KEY, JSON.stringify(periodColumnVisible))
    } catch {
      /* ignore */
    }
  }, [periodColumnVisible, data?.data?.length])

  const isPeriodColVisible = (key: string) => periodColumnVisible[key] !== false

  const titleFull = lang === 'ar' ? 'تحليل المشتريات الشهرية' : 'Monthly purchase analysis'
  const titleNav = (t.nav as Record<string, string | undefined>).monthlyPurchasesAnalysisReport ?? titleFull

  useEffect(() => {
    setPageTitle(titleNav)
    return () => setPageTitle(null)
  }, [titleNav, setPageTitle])

  const companyName =
    String((settings as Record<string, unknown> | undefined)?.company_name ?? '') ||
    currentTenant?.name ||
    data?.company?.name ||
    ''

  const branchName = useMemo(() => {
    if (!branchId || !data?.branch_id) return ''
    const b = (branches as Branch[]).find((x) => x.id === data.branch_id)
    return b?.name ?? ''
  }, [branchId, branches, data?.branch_id])

  const yearOptions = useMemo(() => {
    const y = new Date().getFullYear()
    const list: number[] = []
    for (let i = y - 8; i <= y + 1; i++) list.push(i)
    return list
  }, [])

  const monthLabels = useMemo(() => {
    if (!data?.months?.length) return []
    return data.months.map((m) => monthColumnHeader(m.year, m.month, lang))
  }, [data?.months, lang])

  const metricRows = useMemo<MetricRow[]>(() => METRIC_ROWS.map((m) => ({ metric: m.key })), [])

  const sortColumns = useMemo((): SortColumn<MetricRow, PurchasesMetricSortKey>[] => {
    if (!data?.data?.length) return []
    const cols: SortColumn<MetricRow, PurchasesMetricSortKey>[] = [
      {
        key: 'name',
        type: 'string',
        getValue: (r) => {
          const def = METRIC_ROWS.find((x) => x.key === r.metric)
          return lang === 'ar' ? def?.labelAr ?? '' : def?.labelEn ?? ''
        },
      },
    ]
    data.data.forEach((mr) => {
      cols.push({
        key: `p:${mr.key}` as PurchasesMetricSortKey,
        type: 'number',
        getValue: (r) => Number((data.data.find((d) => d.key === mr.key) as MonthlyPurchasesAnalysisMonthRow | undefined)?.[r.metric] ?? 0),
      })
    })
    cols.push({
      key: 'year_total',
      type: 'number',
      getValue: (r) => Number((data.totals as MonthlyPurchasesAnalysisYearTotals)[r.metric] ?? 0),
    })
    return cols
  }, [data, lang])

  const { sort, toggleSort, sortedRows: sortedMetricRows } = useClientSort<MetricRow, PurchasesMetricSortKey>(
    metricRows,
    sortColumns,
    { locale },
  )

  const chartData = useMemo(() => {
    if (!data?.amounts?.length || !monthLabels.length || !data.data.length) return null
    const idxs = data.data.map((row, i) => (isPeriodColVisible(row.key) ? i : -1)).filter((i) => i >= 0)
    if (idxs.length === 0) return null
    const labels = idxs.map((i) => monthLabels[i])
    return {
      labels,
      datasets: [
        {
          label: lang === 'ar' ? 'المشتريات' : 'Purchases',
          data: idxs.map((i) => data.amounts[i] ?? 0),
          backgroundColor: BAR_PURCHASES,
          borderColor: BAR_PURCHASES.replace('0.75', '1'),
          borderWidth: 1,
        },
      ],
    }
  }, [data?.amounts, data?.data, monthLabels, lang, periodColumnVisible])

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
          text: lang === 'ar' ? 'مقارنة أداء المشتريات شهرياً' : 'Monthly purchases performance',
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
          ticks: { callback: (v: string | number) => tickFmt(Number(v)) },
        },
      },
    }
  }, [lang, decimals, locale])

  const stickyEdge = isRtl ? 'sticky end-0' : 'sticky start-0'
  const stickyShadow = isRtl
    ? 'shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.08)]'
    : 'shadow-[4px_0_6px_-2px_rgba(0,0,0,0.08)]'
  /** عمود «البند»: عرض كافٍ لأسماء المقاييس الطويلة مع التفاف بدون قص */
  const itemColWidths =
    'min-w-[13rem] max-w-[20rem] w-[min(20rem,calc(100vw-10rem))] px-2.5 box-border'
  const itemColClass = `z-20 bg-white ${stickyEdge} ${stickyShadow} ${itemColWidths} whitespace-normal break-words leading-snug align-top`
  const itemColHeadClass = `z-30 bg-slate-50 ${stickyEdge} ${stickyShadow} ${itemColWidths}`
  const itemColFootClass = `z-20 bg-slate-100 ${stickyEdge} ${stickyShadow} ${itemColWidths} whitespace-normal break-words align-top`

  function buildPrintTableHtml(): string {
    if (!data) return ''
    const totalHdr = lang === 'ar' ? 'إجمالي السنة' : 'Year total'
    const headCells: string[] = ['<th class="row-label"></th>']
    data.data.forEach((row) => {
      if (isPeriodColVisible(row.key)) {
        headCells.push(`<th class="col-month">${monthColumnHeader(row.year, row.month, lang)}</th>`)
      }
    })
    if (isPeriodColVisible('year_total')) headCells.push(`<th class="num col-total">${totalHdr}</th>`)

    const bodyRows = sortedMetricRows
      .map((mr) => {
        const def = METRIC_ROWS.find((x) => x.key === mr.metric)
        const label = lang === 'ar' ? def?.labelAr ?? '' : def?.labelEn ?? ''
        const cells: string[] = [`<td class="row-label">${label}</td>`]
        data.data.forEach((row) => {
          if (isPeriodColVisible(row.key)) {
            const v = row[mr.metric] as number
            cells.push(`<td class="num">${fmt(v)}</td>`)
          }
        })
        if (isPeriodColVisible('year_total')) {
          cells.push(`<td class="num"><strong>${fmt((data.totals as MonthlyPurchasesAnalysisYearTotals)[mr.metric])}</strong></td>`)
        }
        return `<tr>${cells.join('')}</tr>`
      })
      .join('')

    const footCells: string[] = [`<td class="row-label"><strong>${lang === 'ar' ? 'الإجمالي' : 'Total'}</strong></td>`]
    data.data.forEach((row) => {
      if (isPeriodColVisible(row.key)) footCells.push(`<td class="num"><strong>${fmt(row.total)}</strong></td>`)
    })
    if (isPeriodColVisible('year_total')) {
      footCells.push(`<td class="num"><strong>${fmt((data.totals as MonthlyPurchasesAnalysisYearTotals).total)}</strong></td>`)
    }
    const footRow = `<tr class="foot-total">${footCells.join('')}</tr>`

    return `<table class="wide"><thead><tr>${headCells.join('')}</tr></thead><tbody>${bodyRows}</tbody><tfoot>${footRow}</tfoot></table>`
  }

  function handlePrint() {
    if (!data) return
    const win = window.open('', '_blank')
    if (!win) return
    const periodLine = `${data.period_from} — ${data.period_to}`
    const branchLine =
      data.branch_id && branchName
        ? `<p class="meta">${lang === 'ar' ? 'الفرع' : 'Branch'}: ${branchName}</p>`
        : ''
    const basisLine =
      lang === 'ar'
        ? data.amount_basis === 'inclusive'
          ? 'أساس المبلغ: شامل الضريبة'
          : 'أساس المبلغ: صافي قبل الضريبة'
        : data.amount_basis === 'inclusive'
          ? 'Amount basis: tax-inclusive'
          : 'Amount basis: net before tax'
    win.document.write(`<!DOCTYPE html><html dir="${isRtl ? 'rtl' : 'ltr'}"><head>
<meta charset="utf-8"><title>${titleFull}</title>
<style>
body{font-family:Arial,sans-serif;padding:24px;}
table.wide{width:100%;border-collapse:collapse;margin-top:16px;font-size:11px;table-layout:auto;}
th,td{border:1px solid #ddd;padding:6px 8px;}
th{background:#f1f5f9;}
th.col-month{text-align:center;font-weight:600;white-space:nowrap;}
th.row-label,td.row-label{background:#f8fafc;font-weight:600;min-width:13rem;max-width:20rem;white-space:normal;word-break:break-word;vertical-align:top;}
th.col-total{background:#e2e8f0;}
.num{text-align:end;font-variant-numeric:tabular-nums;direction:ltr;unicode-bidi:plaintext;white-space:nowrap;}
tfoot .foot-total td{background:#f1f5f9;font-weight:700;}
h2{margin:0;}
.meta{color:#64748b;font-size:13px;margin-top:8px;}
</style></head><body>
<h2>${titleFull}</h2>
<p class="meta">${companyName ? `${companyName} · ` : ''}${periodLine} · ${lang === 'ar' ? 'السنة المالية' : 'FY'} ${data.fiscal_year} · ${basisLine}</p>
${branchLine}
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
    const totalHdr = lang === 'ar' ? 'إجمالي السنة' : 'Year total'
    const headerRow: string[] = [csvCell(lang === 'ar' ? 'البند' : 'Item')]
    data.data.forEach((row) => {
      if (isPeriodColVisible(row.key)) headerRow.push(csvCell(monthLabel(row.year, row.month, lang)))
    })
    if (isPeriodColVisible('year_total')) headerRow.push(csvCell(totalHdr))
    const lines = [headerRow.join(',')]
    const t = data.totals as MonthlyPurchasesAnalysisYearTotals

    for (const mr of sortedMetricRows) {
      const def = METRIC_ROWS.find((x) => x.key === mr.metric)
      const label = lang === 'ar' ? def?.labelAr ?? '' : def?.labelEn ?? ''
      const cells: string[] = [csvCell(label)]
      data.data.forEach((row) => {
        if (isPeriodColVisible(row.key)) cells.push(String((row[mr.metric] as number) ?? 0))
      })
      if (isPeriodColVisible('year_total')) cells.push(String(t[mr.metric] ?? 0))
      lines.push(cells.join(','))
    }
    const totalCells: string[] = [csvCell(lang === 'ar' ? 'الإجمالي' : 'Total')]
    data.data.forEach((row) => {
      if (isPeriodColVisible(row.key)) totalCells.push(String(row.total))
    })
    if (isPeriodColVisible('year_total')) totalCells.push(String(t.total))
    lines.push(totalCells.join(','))

    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `monthly-purchases-analysis-fy${data.fiscal_year}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

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
            disabled={!data?.data?.length}
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
            disabled={!data || !data.data.length}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
            title={t.payments?.exportExcel ?? (lang === 'ar' ? 'تصدير Excel' : 'Export Excel')}
          >
            <FileSpreadsheet size={15} />
          </button>
          {showColumnsMenu && data?.data.length ? (
            <div
              className={`absolute top-full mt-2 z-20 w-64 max-h-[70vh] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg py-2 text-sm ${isRtl ? 'left-0' : 'right-0'}`}
            >
              <div className="px-3 pb-2 text-xs font-semibold text-slate-500">
                {lang === 'ar' ? 'إظهار/إخفاء أعمدة الفترة' : 'Show / hide period columns'}
              </div>
              {data.data.map((m) => (
                <label
                  key={m.key}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    checked={isPeriodColVisible(m.key)}
                    onChange={() =>
                      setPeriodColumnVisible((prev) => ({
                        ...prev,
                        [m.key]: !isPeriodColVisible(m.key),
                      }))
                    }
                    className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-slate-700 text-xs">{monthColumnHeader(m.year, m.month, lang)}</span>
                </label>
              ))}
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
        <div className="grid w-full min-w-0 grid-cols-1 sm:grid-cols-3 items-end gap-2">
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
            <span className="truncate text-xs text-slate-600" title={lang === 'ar' ? 'الفرع' : 'Branch'}>
              {lang === 'ar' ? 'الفرع' : 'Branch'}
            </span>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="h-9 w-full min-w-0 max-w-full border border-slate-300 rounded-lg px-2.5 text-sm bg-white leading-normal"
            >
              <option value="">{lang === 'ar' ? 'كل الفروع' : 'All branches'}</option>
              {(branches as Branch[]).map((b) => (
                <option key={b.id} value={String(b.id)}>
                  {b.name}
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
              <option value="net_before_tax">{lang === 'ar' ? 'صافي قبل الضريبة' : 'Net before tax'}</option>
              <option value="inclusive">{lang === 'ar' ? 'شامل الضريبة' : 'Tax inclusive'}</option>
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
              <table className="w-full text-sm min-w-[1060px]">
                <thead>
                  <tr className="bg-slate-50 text-slate-700 border-b border-slate-200">
                    <SortableTh
                      label={lang === 'ar' ? 'البند' : 'Item'}
                      sortKey="name"
                      sortState={sort}
                      onToggle={toggleSort}
                      truncateLabel={false}
                      className={`py-0 font-medium text-start whitespace-normal ${itemColHeadClass}`}
                    />
                    {data.data.map((m) =>
                      isPeriodColVisible(m.key) ? (
                        <SortableTh
                          key={m.key}
                          label={monthColumnHeader(m.year, m.month, lang)}
                          sortKey={`p:${m.key}` as PurchasesMetricSortKey}
                          sortState={sort}
                          onToggle={toggleSort}
                          className="px-0 py-0 font-medium text-end whitespace-nowrap tabular-nums min-w-[72px]"
                          title={monthLabel(m.year, m.month, lang)}
                        />
                      ) : null,
                    )}
                    {isPeriodColVisible('year_total') ? (
                      <SortableTh
                        label={lang === 'ar' ? 'إجمالي السنة' : 'Year total'}
                        sortKey="year_total"
                        sortState={sort}
                        onToggle={toggleSort}
                        className="px-0 py-0 font-medium text-end whitespace-nowrap tabular-nums min-w-[110px] bg-slate-100"
                      />
                    ) : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedMetricRows.map((mr) => {
                    const def = METRIC_ROWS.find((x) => x.key === mr.metric)
                    const label = lang === 'ar' ? def?.labelAr ?? '' : def?.labelEn ?? ''
                    return (
                      <tr key={mr.metric} className="hover:bg-slate-50/80">
                        <td className={`py-1.5 text-slate-900 font-medium text-sm ${itemColClass}`} title={label}>
                          {label}
                        </td>
                        {data.data.map((row) =>
                          isPeriodColVisible(row.key) ? (
                            <td key={`${row.key}-${mr.metric}`} className="px-1 py-1.5 text-end tabular-nums text-slate-800">
                              {fmt((row[mr.metric] as number) ?? 0)}
                            </td>
                          ) : null,
                        )}
                        {isPeriodColVisible('year_total') ? (
                          <td className="px-3 py-1.5 text-end tabular-nums font-semibold bg-slate-50/90 text-slate-900">
                            {fmt((data.totals as MonthlyPurchasesAnalysisYearTotals)[mr.metric])}
                          </td>
                        ) : null}
                      </tr>
                    )
                  })}
                  <tr className="bg-slate-100 font-semibold text-slate-900 border-t-2 border-slate-200">
                    <td className={`py-2 font-semibold text-slate-900 text-sm ${itemColFootClass}`}>
                      {lang === 'ar' ? 'الإجمالي' : 'Total'}
                    </td>
                    {data.data.map((row) =>
                      isPeriodColVisible(row.key) ? (
                        <td key={`foot-${row.key}`} className="px-1 py-2 text-end tabular-nums">
                          {fmt(row.total)}
                        </td>
                      ) : null,
                    )}
                    {isPeriodColVisible('year_total') ? (
                      <td className="px-3 py-2 text-end tabular-nums bg-slate-200/80">
                        {fmt((data.totals as MonthlyPurchasesAnalysisYearTotals).total)}
                      </td>
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
