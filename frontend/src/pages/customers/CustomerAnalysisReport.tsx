import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip as ChartTooltip,
  Legend,
} from 'chart.js'
import type { ChartOptions, TooltipItem } from 'chart.js'
import { Bar } from 'react-chartjs-2'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { useDocumentTitleContext } from '../../contexts/DocumentTitleContext'
import { fetchCustomerAnalysis, fetchBranches, fetchCostCenters, fetchSettings } from '../../api/tenant'
import type {
  Branch,
  CostCenter,
  TenantSettings,
  CustomerAnalysisRow,
  CustomerSalesTier,
  CustomerAnalysisSortBasis,
} from '../../types'
import { formatAmount } from '../../utils/currency'
import { asArray } from '../../utils/asArray'
import { getDefaultDateRange, getReportPeriodRange, type ReportPeriodKey } from '../../utils/date'
import { useClientSort } from '../../hooks/useClientSort'
import { usePersistedColumnVisibility } from '../../hooks/usePersistedColumnVisibility'
import SortableTh from '../../components/ui/SortableTh'
import PageSizeSelect from '../../components/ui/PageSizeSelect'
import ReportFooter from '../../components/ui/ReportFooter'
import { FileSpreadsheet, Printer, FileText, Columns3 } from 'lucide-react'
import {
  filterPeriodBarDateInputClass,
  filterPeriodBarSelectClass,
  filterReportSelectNineClass,
} from '../../utils/filterControlStyles'

ChartJS.register(CategoryScale, LinearScale, BarElement, ChartTooltip, Legend)

const CHART_COLORS = [
  '#1e40af',
  '#0ea5e9',
  '#059669',
  '#8b5cf6',
  '#dc2626',
  '#f59e0b',
  '#06b6d4',
  '#6366f1',
  '#ec4899',
  '#84cc16',
]

const COL_KEYS = [
  'account',
  'customer',
  'invoice_count',
  'total_qty',
  'total_sales',
  'total_profit',
  'pct_of_company',
  'tier',
] as const
type ColKey = (typeof COL_KEYS)[number]
const TEXT_KEY_SET = new Set<ColKey>(['account', 'customer'])

const CUSTOMER_ANALYSIS_COLUMN_STORAGE_KEY = 'customerAnalysisReportVisibleColumns_v1'

const TIER_SORT: Record<CustomerSalesTier, number> = {
  none: 0,
  acceptable: 1,
  good: 2,
  very_good: 3,
  premium: 4,
}

function tierLabel(tier: CustomerSalesTier, lang: 'ar' | 'en'): string {
  if (lang === 'ar') {
    switch (tier) {
      case 'premium':
        return 'مميز'
      case 'very_good':
        return 'جيد جداً'
      case 'good':
        return 'جيد'
      case 'acceptable':
        return 'يحتاج متابعة'
      default:
        return '—'
    }
  }
  switch (tier) {
    case 'premium':
      return 'Premium'
    case 'very_good':
      return 'Very good'
    case 'good':
      return 'Good'
    case 'acceptable':
      return 'Needs follow-up'
    default:
      return '—'
  }
}

function tierRowClass(tier: CustomerSalesTier): string {
  const base = 'border-b border-slate-100 dark:border-slate-600/50'
  switch (tier) {
    case 'premium':
      return `${base} bg-amber-50/95 dark:bg-amber-950/30 border-l-4 border-amber-500`
    case 'very_good':
      return `${base} bg-emerald-50/85 dark:bg-emerald-950/25 border-l-4 border-emerald-500`
    case 'good':
      return `${base} bg-sky-50/80 dark:bg-sky-950/20 border-l-4 border-sky-400`
    case 'acceptable':
      return `${base} bg-orange-50/85 dark:bg-orange-950/25 border-l-4 border-orange-500`
    default:
      return base
  }
}

function tierBadgeClass(tier: CustomerSalesTier): string {
  switch (tier) {
    case 'premium':
      return 'bg-amber-200/90 dark:bg-amber-800/55 text-amber-950 dark:text-amber-50'
    case 'very_good':
      return 'bg-emerald-200/90 dark:bg-emerald-800/50 text-emerald-950 dark:text-emerald-50'
    case 'good':
      return 'bg-sky-200/90 dark:bg-sky-800/50 text-sky-950 dark:text-sky-50'
    case 'acceptable':
      return 'bg-orange-200/95 dark:bg-orange-800/55 text-orange-950 dark:text-orange-50'
    default:
      return ''
  }
}

function truncateLabel(s: string, maxLen: number): string {
  const t = (s || '').trim()
  if (t.length <= maxLen) return t
  return `${t.slice(0, Math.max(1, maxLen - 1))}…`
}

function getChartValue(r: CustomerAnalysisRow, basis: CustomerAnalysisSortBasis): number {
  switch (basis) {
    case 'invoice_count':
      return r.invoice_count
    case 'total_qty':
      return r.total_qty
    case 'total_profit':
      return r.total_profit
    default:
      return r.total_sales
  }
}

function compareRowsForBasis(
  a: CustomerAnalysisRow,
  b: CustomerAnalysisRow,
  basis: CustomerAnalysisSortBasis,
): number {
  const va = getChartValue(a, basis)
  const vb = getChartValue(b, basis)
  if (vb !== va) return vb - va
  return b.total_sales - a.total_sales || b.invoice_count - a.invoice_count
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

export default function CustomerAnalysisReport() {
  const { currentTenant } = useAuth()
  const { lang, isRtl } = useLanguage()
  const { setPageTitle } = useDocumentTitleContext()
  const tenantId = currentTenant?.id ?? 0

  const { data: settings } = useQuery<TenantSettings>({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const amountDecimals =
    typeof settings?.doc_amount_decimals === 'number' ? settings.doc_amount_decimals : 2
  const fmt = (n: number) => formatAmount(n, { decimal_places: amountDecimals }, locale)
  const fmtQty = (n: number) => formatAmount(n, { decimal_places: 2 }, locale)
  const textAlign = isRtl ? 'text-right' : 'text-left'
  const numAlign = 'text-center'

  const defaultRange = useMemo(() => getDefaultDateRange(), [])
  const [dateFrom, setDateFrom] = useState(defaultRange.dateFrom)
  const [dateTo, setDateTo] = useState(defaultRange.dateTo)
  const [periodPreset, setPeriodPreset] = useState<ReportPeriodKey | 'custom'>('all')
  const [branchId, setBranchId] = useState<number | ''>('')
  const [costCenterId, setCostCenterId] = useState<number | ''>('')
  const [sortBasis, setSortBasis] = useState<CustomerAnalysisSortBasis>('total_sales')
  const [perPage, setPerPage] = useState(50)
  const [page, setPage] = useState(1)

  const [visibleColumns, setVisibleColumns] = usePersistedColumnVisibility<ColKey>(
    CUSTOMER_ANALYSIS_COLUMN_STORAGE_KEY,
    COL_KEYS,
  )
  const [showColumnsMenu, setShowColumnsMenu] = useState(false)
  const columnsMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!columnsMenuRef.current?.contains(e.target as Node)) setShowColumnsMenu(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  useEffect(() => {
    setPageTitle(lang === 'ar' ? 'تقييم وتحليل العملاء' : 'Customer evaluation & analysis')
    return () => setPageTitle(null)
  }, [lang, setPageTitle])

  useEffect(() => {
    setPage(1)
  }, [dateFrom, dateTo, branchId, costCenterId, sortBasis])

  const params = useMemo(
    () => ({
      from_date: dateFrom,
      to_date: dateTo,
      sort_basis: sortBasis,
      ...(branchId ? { branch_id: Number(branchId) } : {}),
      ...(costCenterId ? { cost_center_id: Number(costCenterId) } : {}),
    }),
    [dateFrom, dateTo, branchId, costCenterId, sortBasis],
  )

  const { data: branchesData } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId,
  })
  const branches: Branch[] = asArray<Branch>(branchesData)

  const { data: costCentersData } = useQuery({
    queryKey: ['cost-centers', tenantId],
    queryFn: () => fetchCostCenters(tenantId, { active_only: '1' }),
    enabled: !!tenantId,
  })
  const costCenters: CostCenter[] = !costCentersData
    ? []
    : Array.isArray(costCentersData)
      ? costCentersData
      : (costCentersData as { data?: CostCenter[] }).data ?? []

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['customerAnalysis', tenantId, params],
    queryFn: () => fetchCustomerAnalysis(tenantId, params),
    enabled: !!tenantId,
    placeholderData: (prev) => prev,
  })

  const rows: CustomerAnalysisRow[] = useMemo(() => {
    return (data?.data ?? []).map((r) => ({
      ...r,
      total_qty: typeof r.total_qty === 'number' ? r.total_qty : 0,
      total_profit: typeof r.total_profit === 'number' ? r.total_profit : 0,
    }))
  }, [data?.data])

  function colLabel(key: ColKey): string {
    switch (key) {
      case 'account':
        return lang === 'ar' ? 'رقم الحساب' : 'Account'
      case 'customer':
        return lang === 'ar' ? 'اسم العميل' : 'Customer'
      case 'invoice_count':
        return lang === 'ar' ? 'عدد الفواتير' : 'Invoices'
      case 'total_qty':
        return lang === 'ar' ? 'كمية الأصناف المباعة' : 'Quantity sold'
      case 'total_sales':
        return lang === 'ar' ? 'إجمالي المبيعات' : 'Total sales'
      case 'total_profit':
        return lang === 'ar' ? 'إجمالي الربح' : 'Gross profit'
      case 'pct_of_company':
        return lang === 'ar' ? 'من إجمالي المبيعات' : 'From total sales'
      case 'tier':
        return lang === 'ar' ? 'التصنيف' : 'Classification'
    }
  }

  function cellRaw(r: CustomerAnalysisRow, key: ColKey): string | number {
    const name = lang === 'ar' ? r.customer_name : (r.customer_name_en || r.customer_name)
    switch (key) {
      case 'account':
        return r.account_code
      case 'customer':
        return name ?? ''
      case 'invoice_count':
        return r.invoice_count
      case 'total_qty':
        return r.total_qty
      case 'total_sales':
        return r.total_sales
      case 'total_profit':
        return r.total_profit
      case 'pct_of_company':
        return r.pct_of_company
      case 'tier':
        return TIER_SORT[r.sales_tier] ?? 0
    }
  }

  const sortColumns = useMemo(
    () =>
      COL_KEYS.map((key) => ({
        key,
        type: (TEXT_KEY_SET.has(key) ? 'string' : 'number') as 'string' | 'number',
        getValue: (r: CustomerAnalysisRow) => cellRaw(r, key),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang],
  )

  const { sort, toggleSort, sortedRows } = useClientSort<CustomerAnalysisRow, ColKey>(rows, sortColumns, { locale })

  const keysToShow = useMemo(() => {
    const v = COL_KEYS.filter((k) => visibleColumns[k])
    return v.length > 0 ? v : [...COL_KEYS]
  }, [visibleColumns])

  const lastPage = Math.max(1, Math.ceil(sortedRows.length / perPage) || 1)
  const effectivePage = Math.min(Math.max(1, page), lastPage)

  useEffect(() => {
    setPage((p) => (p > lastPage ? lastPage : p))
  }, [lastPage])

  const pagedRows = useMemo(() => {
    const start = (effectivePage - 1) * perPage
    return sortedRows.slice(start, start + perPage)
  }, [sortedRows, effectivePage, perPage])

  const chartPayload = useMemo(() => {
    const basis = (data?.sort_basis ?? sortBasis) as CustomerAnalysisSortBasis
    const copy = [...rows]
    copy.sort((a, b) => compareRowsForBasis(a, b, basis))
    const top = copy.slice(0, 10)
    const labelsShort = top.map((r) => {
      const fullName = lang === 'ar' ? r.customer_name : (r.customer_name_en || r.customer_name)
      return truncateLabel((fullName || '—').trim(), 14)
    })
    const meta = top.map((r) => {
      const fullName = lang === 'ar' ? r.customer_name : (r.customer_name_en || r.customer_name)
      return { row: r, fullName: (fullName || '—').trim() }
    })
    const values = top.map((r) => getChartValue(r, basis))
    return { labelsShort, meta, values, basis }
  }, [rows, data?.sort_basis, sortBasis, lang])

  const barChartData = useMemo(
    () => ({
      labels: chartPayload.labelsShort,
      datasets: [
        {
          data: chartPayload.values,
          backgroundColor: chartPayload.values.map(
            (_, i) => CHART_COLORS[i % CHART_COLORS.length],
          ),
          borderRadius: 6,
          maxBarThickness: 44,
        },
      ],
    }),
    [chartPayload],
  )

  const chartOptions = useMemo(() => {
    const basis = chartPayload.basis
    const meta = chartPayload.meta
    const ar = lang === 'ar'

    const formatYTick = (raw: number | string) => {
      const v = typeof raw === 'number' ? raw : Number(raw)
      if (Number.isNaN(v)) return String(raw)
      if (basis === 'invoice_count') return String(Math.round(v))
      if (basis === 'total_qty')
        return formatAmount(v, { decimal_places: 2 }, locale)
      return fmt(v)
    }

    return {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'x' as const,
      plugins: {
        legend: { display: false },
        title: { display: false },
        tooltip: {
          displayColors: true,
          backgroundColor: 'rgba(15, 23, 42, 0.94)',
          titleColor: '#f8fafc',
          bodyColor: '#e2e8f0',
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            title: (items: TooltipItem<'bar'>[]) => {
              const i = items[0]?.dataIndex ?? 0
              return meta[i]?.fullName ?? ''
            },
            label: () => '',
            afterBody: (items: TooltipItem<'bar'>[]) => {
              const i = items[0]?.dataIndex ?? 0
              const m = meta[i]
              if (!m) return []
              const { row: r } = m
              const tierT = tierLabel(r.sales_tier, ar ? 'ar' : 'en')
              const main =
                basis === 'invoice_count'
                  ? `${ar ? 'عدد الفواتير' : 'Invoices'}: ${r.invoice_count}`
                  : basis === 'total_qty'
                    ? `${ar ? 'كمية مباعة' : 'Qty sold'}: ${formatAmount(r.total_qty, { decimal_places: 2 }, locale)}`
                    : basis === 'total_profit'
                      ? `${ar ? 'مجمل الربح' : 'Gross profit'}: ${fmt(r.total_profit)}`
                      : `${ar ? 'إجمالي المبيعات' : 'Total sales'}: ${fmt(r.total_sales)}`
              return [
                `${ar ? 'الحساب' : 'Account'}: ${r.account_code}`,
                main,
                `${ar ? 'المبيعات' : 'Sales'}: ${fmt(r.total_sales)} · ${ar ? 'فواتير' : 'Inv.'} ${r.invoice_count}`,
                `${ar ? 'الكمية' : 'Quantity'}: ${formatAmount(r.total_qty, { decimal_places: 2 }, locale)} · ${ar ? 'الربح' : 'Profit'}: ${fmt(r.total_profit)}`,
                `${ar ? 'من إجمالي المبيعات' : 'From total sales'}: ${r.pct_of_company.toFixed(2)}%`,
                `${ar ? 'التصنيف' : 'Tier'}: ${tierT}`,
              ]
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            font: { size: 10 },
            maxRotation: 45,
            minRotation: 45,
            autoSkip: true,
          },
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(148, 163, 184, 0.2)' },
          ticks: {
            font: { size: 11 },
            callback: (tickValue: string | number) => formatYTick(tickValue),
          },
        },
      },
    } satisfies ChartOptions<'bar'>
  }, [chartPayload, lang, locale, fmt])

  function applyPeriodPreset(preset: ReportPeriodKey | 'custom') {
    setPeriodPreset(preset)
    if (preset !== 'custom') {
      const range = getReportPeriodRange(preset)
      setDateFrom(range.from_date)
      setDateTo(range.to_date)
    }
  }

  const handleExportCsv = () => {
    const headers = keysToShow.map((k) => colLabel(k))
    const lines = [headers.join(',')]
    sortedRows.forEach((r) => {
      const cells = keysToShow.map((key) => {
        if (key === 'tier') {
          return tierLabel(r.sales_tier, lang === 'ar' ? 'ar' : 'en')
        }
        const v = cellRaw(r, key)
        return typeof v === 'number' ? String(v) : `"${String(v).replace(/"/g, '""')}"`
      })
      lines.push(cells.join(','))
    })
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `customer-analysis-${dateFrom}-${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handlePrint = () => {
    const th = keysToShow.map((k) => `<th>${colLabel(k)}</th>`).join('')
    const body = sortedRows
      .map((r) => {
        const name = lang === 'ar' ? r.customer_name : (r.customer_name_en || r.customer_name)
        const tierText = tierLabel(r.sales_tier, lang === 'ar' ? 'ar' : 'en')
        const tds = keysToShow
          .map((key) => {
            switch (key) {
              case 'account':
                return `<td>${r.account_code}</td>`
              case 'customer':
                return `<td>${name}</td>`
              case 'invoice_count':
                return `<td class="num">${r.invoice_count}</td>`
              case 'total_qty':
                return `<td class="num">${fmtQty(r.total_qty)}</td>`
              case 'total_sales':
                return `<td class="num">${fmt(r.total_sales)}</td>`
              case 'total_profit':
                return `<td class="num">${fmt(r.total_profit)}</td>`
              case 'pct_of_company':
                return `<td class="num">${r.pct_of_company.toFixed(2)}</td>`
              case 'tier':
                return `<td>${tierText}</td>`
              default:
                return '<td></td>'
            }
          })
          .join('')
        return `<tr>${tds}</tr>`
      })
      .join('')
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <!DOCTYPE html><html dir="${isRtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${lang === 'ar' ? 'تقييم العملاء' : 'Customer analysis'}</title>
      <style>body{font-family:system-ui,sans-serif;padding:1rem}.num{text-align:center} table{width:100%;border-collapse:collapse} th,td{border:1px solid #ccc;padding:6px} th{background:#f5f5f5}</style></head><body>
      <h1>${lang === 'ar' ? 'تقييم وتحليل العملاء' : 'Customer evaluation & analysis'}</h1>
      <p>${dateFrom} — ${dateTo}</p>
      <table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>
      </body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => {
      win.print()
      win.close()
    }, 300)
  }

  if (!tenantId) {
    return (
      <div className="p-6">
        <p className="text-amber-600">{lang === 'ar' ? 'يرجى اختيار الشركة أولاً.' : 'Please select a company first.'}</p>
      </div>
    )
  }

  const filterSelectCls = filterReportSelectNineClass
  const showCustomDateFields = periodPreset === 'custom'

  const labelPeriod = lang === 'ar' ? 'الفترة' : 'Period'
  const labelFrom = lang === 'ar' ? 'من تاريخ' : 'From date'
  const labelTo = lang === 'ar' ? 'إلى تاريخ' : 'To date'
  const labelBranch = lang === 'ar' ? 'الفرع' : 'Branch'
  const labelCostCenter = lang === 'ar' ? 'مركز التكلفة' : 'Cost center'
  const labelSortBasis = lang === 'ar' ? 'أساس الترتيب الافتراضي' : 'Default sort basis'
  const optSales = lang === 'ar' ? 'بالقيمة (إجمالي المبيعات)' : 'By value (total sales)'
  const optInvoices = lang === 'ar' ? 'بعدد الفواتير' : 'By invoice count'
  const optQty = lang === 'ar' ? 'بكمية الأصناف المباعة' : 'By quantity sold'
  const optProfit = lang === 'ar' ? 'بالربحية (إجمالي الربح)' : 'By profitability (gross profit)'
  const chartTitle = lang === 'ar' ? 'أعلى 10 عملاء' : 'Top 10 customers'
  const chartAxisLine =
    chartPayload.basis === 'invoice_count'
      ? lang === 'ar'
        ? 'المحور الرأسي: عدد الفواتير المرحّلة في الفترة'
        : 'Y-axis: posted invoice count in period'
      : chartPayload.basis === 'total_qty'
        ? lang === 'ar'
          ? 'المحور الرأسي: مجموع كميات بنود الفاتورة'
          : 'Y-axis: sum of invoice line quantities'
        : chartPayload.basis === 'total_profit'
          ? lang === 'ar'
            ? 'المحور الرأسي: الربح (المبيعات − التكلفة المسجّلة على الفاتورة)'
            : 'Y-axis: gross profit (sales − recorded invoice cost)'
          : lang === 'ar'
            ? 'المحور الرأسي: إجمالي المبيعات المرحّلة'
            : 'Y-axis: posted sales totals'

  const periodTopBarSelectCls = filterPeriodBarSelectClass
  const periodTopBarDateInputCls = filterPeriodBarDateInputClass

  function renderBodyCell(key: ColKey, r: CustomerAnalysisRow) {
    const name = lang === 'ar' ? r.customer_name : (r.customer_name_en || r.customer_name)
    const tier = r.sales_tier
    switch (key) {
      case 'account':
        return (
          <td key={key} className={`px-3 py-2.5 align-middle ${textAlign} font-mono text-xs`} dir="ltr">
            {r.account_code}
          </td>
        )
      case 'customer':
        return (
          <td key={key} className={`px-3 py-2.5 align-middle ${textAlign}`}>
            {name}
          </td>
        )
      case 'invoice_count':
        return (
          <td key={key} className={`px-3 py-2.5 align-middle ${numAlign} tabular-nums`} dir="ltr">
            {r.invoice_count}
          </td>
        )
      case 'total_qty':
        return (
          <td key={key} className={`px-3 py-2.5 align-middle ${numAlign} tabular-nums`} dir="ltr">
            {fmtQty(r.total_qty)}
          </td>
        )
      case 'total_sales':
        return (
          <td key={key} className={`px-3 py-2.5 align-middle ${numAlign} tabular-nums font-medium`} dir="ltr">
            {fmt(r.total_sales)}
          </td>
        )
      case 'total_profit':
        return (
          <td key={key} className={`px-3 py-2.5 align-middle ${numAlign} tabular-nums`} dir="ltr">
            {fmt(r.total_profit)}
          </td>
        )
      case 'pct_of_company':
        return (
          <td key={key} className={`px-3 py-2.5 ${numAlign} align-middle`} dir="ltr">
            <div className="inline-flex flex-col items-center gap-1.5 w-full max-w-[140px] mx-auto">
              <span className="tabular-nums text-sm font-medium text-slate-800 dark:text-slate-100">
                {r.pct_of_company.toFixed(2)}%
              </span>
              <div
                className="w-full h-2 rounded-full bg-slate-200/90 dark:bg-slate-600/80 overflow-hidden"
                title={`${r.pct_of_company.toFixed(2)}%`}
              >
                <div
                  className="h-full rounded-full bg-gradient-to-l from-primary-600 to-primary-400 dark:from-primary-400 dark:to-primary-500"
                  style={{ width: `${Math.min(100, Math.max(0, r.pct_of_company))}%` }}
                />
              </div>
            </div>
          </td>
        )
      case 'tier':
        return (
          <td key={key} className="px-3 py-2.5 align-middle text-center text-xs">
            {tier === 'none' ? (
              <span className="text-slate-400">—</span>
            ) : (
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 font-medium ${tierBadgeClass(tier)}`}
              >
                {tierLabel(tier, lang === 'ar' ? 'ar' : 'en')}
              </span>
            )}
          </td>
        )
      default:
        return <td key={key} />
    }
  }

  return (
    <div className="py-3 px-2 space-y-4 w-full min-w-0 max-w-full" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* شريط علوي: نفس تنسيق تقارير المبيعات / مناديب المبيعات */}
      <div className="no-print flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-600 pb-2">
        <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate shrink-0 leading-tight">
          {lang === 'ar' ? 'تقييم وتحليل العملاء' : 'Customer evaluation & analysis'}
        </h1>
        <div className="flex-1 flex justify-center min-w-0">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-600 dark:text-slate-400 shrink-0">{labelPeriod}</span>
              <select
                id="ca-period"
                value={periodPreset}
                onChange={(e) => applyPeriodPreset((e.target.value as ReportPeriodKey | 'custom') || 'all')}
                className={periodTopBarSelectCls}
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
                  <span className="text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">{labelFrom}</span>
                  <input
                    id="ca-from"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className={periodTopBarDateInputCls}
                    title={labelFrom}
                    aria-label={labelFrom}
                  />
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">{labelTo}</span>
                  <input
                    id="ca-to"
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className={periodTopBarDateInputCls}
                    title={labelTo}
                    aria-label={labelTo}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
        <div
          className="relative z-[120] flex flex-wrap items-center gap-1 shrink-0 no-print"
          ref={columnsMenuRef}
        >
          <button
            type="button"
            onClick={() => setShowColumnsMenu((v) => !v)}
            aria-expanded={showColumnsMenu}
            aria-haspopup="true"
            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#D9DCE0] bg-[#F0F2F5] text-[#344054] shadow-sm transition-colors hover:bg-[#E4E7EB] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600 ${showColumnsMenu ? 'bg-[#E4E7EB] ring-1 ring-slate-300/80 dark:bg-slate-600 dark:ring-slate-500/80' : ''}`}
            title={lang === 'ar' ? 'تخصيص الأعمدة' : 'Customize columns'}
          >
            <Columns3 size={16} strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={isLoading && !data}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#F0F2F5] border border-[#D9DCE0] text-[#344054] hover:bg-[#E4E7EB] disabled:opacity-50 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-600"
            title={lang === 'ar' ? 'طباعة التقرير' : 'Print report'}
          >
            <Printer size={15} />
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={isLoading && !data}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#344054] text-white hover:bg-[#2d3846] disabled:opacity-50 dark:bg-slate-800 dark:hover:bg-slate-900"
            title={lang === 'ar' ? 'تصدير PDF' : 'Export PDF'}
          >
            <FileText size={15} />
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={isLoading && !data}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 shadow-sm"
            title={lang === 'ar' ? 'تصدير Excel' : 'Export Excel'}
          >
            <FileSpreadsheet size={15} />
          </button>
          {showColumnsMenu && (
            <div
              className="absolute top-full end-0 mt-2 z-[130] w-64 rounded-xl border border-slate-200/95 bg-white py-2 text-sm shadow-xl ring-1 ring-slate-200/80 dark:border-slate-600 dark:bg-slate-800 dark:ring-slate-700/80"
              role="menu"
              aria-label={lang === 'ar' ? 'إظهار/إخفاء الأعمدة' : 'Show / hide columns'}
            >
              <div className="px-3 pb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                {lang === 'ar' ? 'إظهار/إخفاء الأعمدة' : 'Show / hide columns'}
              </div>
              {COL_KEYS.map((key) => (
                <label
                  key={key}
                  className="flex cursor-pointer select-none items-center gap-2 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700/60"
                >
                  <input
                    type="checkbox"
                    checked={visibleColumns[key]}
                    onChange={() => setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }))}
                    className="rounded border-slate-300 dark:border-slate-600"
                  />
                  <span className="text-slate-800 dark:text-slate-100">{colLabel(key)}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="no-print bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-4 py-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-x-4 gap-y-3 items-center">
            <div className="min-w-0">
              <select
                id="ca-branch"
                value={branchId === '' ? '' : String(branchId)}
                onChange={(e) => setBranchId(e.target.value ? Number(e.target.value) : '')}
                className={filterSelectCls}
                aria-label={labelBranch}
                title={labelBranch}
              >
                <option value="">{lang === 'ar' ? 'كل الفروع' : 'All branches'}</option>
                {branches.filter((b) => b.is_active).map((b) => (
                  <option key={b.id} value={b.id}>
                    {lang === 'ar' ? b.name : (b.name_en || b.name)}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0">
              <select
                id="ca-cc"
                value={costCenterId === '' ? '' : String(costCenterId)}
                onChange={(e) => setCostCenterId(e.target.value ? Number(e.target.value) : '')}
                className={filterSelectCls}
                aria-label={labelCostCenter}
                title={labelCostCenter}
              >
                <option value="">{lang === 'ar' ? 'كل المراكز' : 'All cost centers'}</option>
                {costCenters.filter((c) => c.is_active).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0 xl:col-span-2">
              <select
                id="ca-sort"
                value={sortBasis}
                onChange={(e) => {
                  const v = e.target.value
                  if (
                    v === 'total_sales' ||
                    v === 'invoice_count' ||
                    v === 'total_qty' ||
                    v === 'total_profit'
                  ) {
                    setSortBasis(v)
                  }
                }}
                className={filterSelectCls}
                title={labelSortBasis}
                aria-label={labelSortBasis}
              >
                <option value="total_sales">{optSales}</option>
                <option value="invoice_count">{optInvoices}</option>
                <option value="total_qty">{optQty}</option>
                <option value="total_profit">{optProfit}</option>
              </select>
            </div>
            <div className="min-w-[120px] max-w-[200px]">
              <PageSizeSelect
                value={perPage}
                onChange={(v) => {
                  setPerPage(v)
                  setPage(1)
                }}
                showLabel={false}
                ariaLabel={lang === 'ar' ? 'حجم الصفحة' : 'Page size'}
                className="w-full min-w-0"
              />
            </div>
          </div>
        </div>
      </div>

      {!isLoading && chartPayload.values.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm relative">
          {isFetching && (
            <div
              className="absolute inset-0 z-[1] flex items-center justify-center rounded-xl bg-white/70 dark:bg-slate-900/60 backdrop-blur-[1px]"
              aria-hidden
            >
              <div className="h-9 w-9 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
            </div>
          )}
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{chartTitle}</h2>
            <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
              {data?.from_date} — {data?.to_date}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">{chartAxisLine}</p>
          <div className="w-full h-[380px] min-h-[280px]">
            <Bar data={barChartData} options={chartOptions} />
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col min-h-0">
        <div className="overflow-x-auto flex-1 min-h-0">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-500 border-t-transparent" />
            </div>
          ) : (
            <table className="w-full text-sm min-w-[960px] table-fixed" dir={isRtl ? 'rtl' : 'ltr'}>
              <thead className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-600 sticky top-0 z-10">
                <tr>
                  {keysToShow.map((key) => {
                    const numericHeader =
                      key === 'invoice_count' ||
                      key === 'total_qty' ||
                      key === 'total_sales' ||
                      key === 'total_profit' ||
                      key === 'pct_of_company'
                    const tierHeader = key === 'tier'
                    return (
                      <SortableTh
                        key={key}
                        label={colLabel(key)}
                        sortKey={key}
                        sortState={sort}
                        onToggle={toggleSort}
                        headerLayout={numericHeader || tierHeader ? 'clusterCenter' : 'spread'}
                        truncateLabel={key !== 'total_qty'}
                        widthClassName={
                          key === 'customer'
                            ? 'min-w-[180px]'
                            : key === 'account'
                              ? 'min-w-[50px]'
                              : key === 'invoice_count'
                                ? 'min-w-[50px]'
                                : key === 'tier'
                                  ? 'min-w-[130px]'
                                  : key === 'pct_of_company'
                                    ? 'min-w-[150px]'
                                    : key === 'total_qty'
                                      ? 'min-w-[168px]'
                                      : key === 'total_profit'
                                        ? 'min-w-[112px]'
                                        : 'min-w-[100px]'
                        }
                        className={`font-medium text-slate-700 dark:text-slate-200 ${
                          key === 'account' || key === 'customer' ? textAlign : 'text-center'
                        }`}
                      />
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((r) => {
                  const tier = r.sales_tier
                  const rowCls = `${tierRowClass(tier)} hover:bg-slate-50/50 dark:hover:bg-slate-700/30`
                  return (
                    <tr key={r.customer_id} className={rowCls}>
                      {keysToShow.map((key) => renderBodyCell(key, r))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
        {!isLoading && data != null && (
          <ReportFooter
            totalCount={sortedRows.length}
            currentPage={effectivePage}
            lastPage={lastPage}
            from={sortedRows.length === 0 ? 0 : (effectivePage - 1) * perPage + 1}
            to={sortedRows.length === 0 ? 0 : Math.min(effectivePage * perPage, sortedRows.length)}
            onPageChange={setPage}
            lang={lang === 'ar' ? 'ar' : 'en'}
            isRtl={isRtl}
            alwaysShowPaginationBar
            showRecordSummary={sortedRows.length > 0}
            recordLabel={lang === 'ar' ? 'عميل' : 'customer'}
            dense
          />
        )}
      </div>

      {!isLoading && rows.length === 0 && (
        <p className="text-center text-slate-500 dark:text-slate-400 py-8">
          {lang === 'ar' ? 'لا توجد بيانات في الفترة والفلاتر المحددة.' : 'No data for the selected period and filters.'}
        </p>
      )}
    </div>
  )
}
