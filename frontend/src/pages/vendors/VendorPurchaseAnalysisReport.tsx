import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip as ChartTooltip,
  Legend,
} from 'chart.js'
import type { ChartOptions, TooltipItem } from 'chart.js'
import { Doughnut } from 'react-chartjs-2'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { useDocumentTitleContext } from '../../contexts/DocumentTitleContext'
import { fetchVendorPurchaseAnalysis, fetchBranches, fetchCostCenters, fetchCurrencies, fetchVendorGroups, fetchSettings } from '../../api/tenant'
import type { Branch, CostCenter, Currency, TenantSettings, VendorGroup, VendorPurchaseAnalysisRow } from '../../types'
import { asArray } from '../../utils/asArray'
import { formatAmount } from '../../utils/currency'
import { getDefaultDateRange, getReportPeriodRange, type ReportPeriodKey } from '../../utils/date'
import SortableTh from '../../components/ui/SortableTh'
import PageSizeSelect from '../../components/ui/PageSizeSelect'
import ReportFooter from '../../components/ui/ReportFooter'
import { useClientSort } from '../../hooks/useClientSort'
import { usePersistedColumnVisibility } from '../../hooks/usePersistedColumnVisibility'
import { FileSpreadsheet, Printer, FileText, Columns3 } from 'lucide-react'
import {
  filterPeriodBarDateInputClass,
  filterPeriodBarSelectClass,
  filterReportSelectNineClass,
} from '../../utils/filterControlStyles'

ChartJS.register(ArcElement, ChartTooltip, Legend)

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

const COL_KEYS = ['vendor', 'invoice_count', 'total_qty', 'total_purchases', 'pct_of_total', 'discount_percent'] as const
type ColKey = (typeof COL_KEYS)[number]
const TEXT_KEY_SET = new Set<ColKey>(['vendor'])

const STORAGE_KEY = 'vendorPurchaseAnalysisVisibleColumns_v1'

export default function VendorPurchaseAnalysisReport() {
  const { currentTenant } = useAuth()
  const { lang, isRtl } = useLanguage()
  const { setPageTitle } = useDocumentTitleContext()
  const tenantId = currentTenant?.id ?? 0

  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const { data: settings } = useQuery<TenantSettings>({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const amountDecimals =
    typeof settings?.doc_amount_decimals === 'number' ? settings.doc_amount_decimals : 2
  const fmt = (n: number) => formatAmount(n, { decimal_places: amountDecimals }, locale)
  const fmtQty = (n: number) => formatAmount(n, { decimal_places: 2 }, locale)

  const defaultRange = useMemo(() => getDefaultDateRange(), [])
  const [dateFrom, setDateFrom] = useState(defaultRange.dateFrom)
  const [dateTo, setDateTo] = useState(defaultRange.dateTo)
  const [periodPreset, setPeriodPreset] = useState<ReportPeriodKey | 'custom'>('all')
  const [branchId, setBranchId] = useState<number | ''>('')
  const [costCenterId, setCostCenterId] = useState<number | ''>('')
  const [currency, setCurrency] = useState<string>('')
  const [vendorGroupId, setVendorGroupId] = useState<number | ''>('')

  const [perPage, setPerPage] = useState(50)
  const [page, setPage] = useState(1)

  const [visibleColumns, setVisibleColumns] = usePersistedColumnVisibility<ColKey>(
    STORAGE_KEY,
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
    setPageTitle(lang === 'ar' ? 'تحليل المشتريات والموردين' : 'Supplier purchase analysis')
    return () => setPageTitle(null)
  }, [lang, setPageTitle])

  useEffect(() => {
    setPage(1)
  }, [dateFrom, dateTo, branchId, costCenterId, currency, vendorGroupId])

  const params = useMemo(
    () => ({
      from_date: dateFrom,
      to_date: dateTo,
      ...(branchId ? { branch_id: Number(branchId) } : {}),
      ...(costCenterId ? { cost_center_id: Number(costCenterId) } : {}),
      ...(currency ? { currency } : {}),
      ...(vendorGroupId ? { vendor_group_id: Number(vendorGroupId) } : {}),
    }),
    [dateFrom, dateTo, branchId, costCenterId, currency, vendorGroupId],
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
  const costCenters: CostCenter[] = Array.isArray(costCentersData)
    ? costCentersData
    : ((costCentersData as any)?.data ?? [])

  const { data: currenciesData } = useQuery<Currency[]>({
    queryKey: ['currencies', tenantId],
    queryFn: () => fetchCurrencies(tenantId),
    enabled: !!tenantId,
  })
  const currencies = currenciesData ?? []

  const { data: vendorGroups } = useQuery<VendorGroup[]>({
    queryKey: ['vendor-groups', tenantId],
    queryFn: () => fetchVendorGroups(tenantId),
    enabled: !!tenantId,
  })

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['vendorPurchaseAnalysis', tenantId, params],
    queryFn: () => fetchVendorPurchaseAnalysis(tenantId, params),
    enabled: !!tenantId,
    placeholderData: (prev) => prev,
  })

  const rows: VendorPurchaseAnalysisRow[] = data?.data ?? []

  function colLabel(key: ColKey) {
    switch (key) {
      case 'vendor':
        return lang === 'ar' ? 'اسم المورد' : 'Vendor'
      case 'invoice_count':
        return lang === 'ar' ? 'عدد الفواتير' : 'Invoices'
      case 'total_qty':
        return lang === 'ar' ? 'كمية المشتريات' : 'Purchased qty'
      case 'total_purchases':
        return lang === 'ar' ? 'إجمالي المشتريات' : 'Total purchases'
      case 'pct_of_total':
        return lang === 'ar' ? 'من إجمالي المشتريات' : 'Of total purchases'
      case 'discount_percent':
        return lang === 'ar' ? 'نسبة الخصم' : 'Discount %'
    }
  }

  function cellRaw(r: VendorPurchaseAnalysisRow, key: ColKey): string | number {
    const name = lang === 'ar' ? r.vendor_name : r.vendor_name_en || r.vendor_name
    switch (key) {
      case 'vendor':
        return name ?? ''
      case 'invoice_count':
        return r.invoice_count
      case 'total_qty':
        return r.total_qty
      case 'total_purchases':
        return r.total_purchases
      case 'pct_of_total':
        return r.pct_of_total
      case 'discount_percent':
        return r.discount_percent
    }
  }

  const sortColumns = useMemo(
    () =>
      COL_KEYS.map((key) => ({
        key,
        type: (TEXT_KEY_SET.has(key) ? 'string' : 'number') as 'string' | 'number',
        getValue: (r: VendorPurchaseAnalysisRow) => cellRaw(r, key),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang],
  )

  const { sort, toggleSort, sortedRows } = useClientSort<VendorPurchaseAnalysisRow, ColKey>(
    rows,
    sortColumns,
    { locale },
  )

  const keysToShow = useMemo(() => {
    const v = COL_KEYS.filter((k) => visibleColumns[k])
    return v.length > 0 ? v : [...COL_KEYS]
  }, [visibleColumns])

  const totals = useMemo(() => {
    let sumInvoices = 0
    let sumQty = 0
    let sumPurchases = 0
    let weightedDiscount = 0
    let weight = 0
    sortedRows.forEach((r) => {
      sumInvoices += Number(r.invoice_count ?? 0)
      sumQty += Number(r.total_qty ?? 0)
      const p = Number(r.total_purchases ?? 0)
      sumPurchases += p
      const d = Number(r.discount_percent ?? 0)
      if (p > 0) {
        weightedDiscount += d * p
        weight += p
      }
    })
    const avgDiscount = weight > 0.0000001 ? weightedDiscount / weight : 0
    return { sumInvoices, sumQty, sumPurchases, avgDiscount }
  }, [sortedRows])

  const footerLayout = useMemo(() => {
    const numericSet = new Set<ColKey>([
      'invoice_count',
      'total_qty',
      'total_purchases',
      'pct_of_total',
      'discount_percent',
    ])
    const idx = keysToShow.findIndex((k) => numericSet.has(k))
    const preKeys = idx === -1 ? keysToShow : keysToShow.slice(0, idx)
    const numericKeys = keysToShow.filter((k) => numericSet.has(k))
    return { preKeys, numericKeys }
  }, [keysToShow])

  const lastPage = Math.max(1, Math.ceil(sortedRows.length / perPage) || 1)
  const effectivePage = Math.min(Math.max(1, page), lastPage)
  useEffect(() => {
    setPage((p) => (p > lastPage ? lastPage : p))
  }, [lastPage])

  const pagedRows = useMemo(() => {
    const start = (effectivePage - 1) * perPage
    return sortedRows.slice(start, start + perPage)
  }, [sortedRows, effectivePage, perPage])

  const donutLabels = (data?.donut ?? []).map((d) =>
    lang === 'ar' ? d.vendor_name : d.vendor_name_en || d.vendor_name,
  )
  const donutValues = (data?.donut ?? []).map((d) => d.value)

  const donutChartData = useMemo(
    () => ({
      labels: donutLabels,
      datasets: [
        {
          data: donutValues,
          backgroundColor: donutValues.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]),
          borderWidth: 0,
        },
      ],
    }),
    [donutLabels, donutValues],
  )

  const donutOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom' as const,
          labels: { boxWidth: 10, boxHeight: 10, font: { size: 11 } },
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.94)',
          titleColor: '#f8fafc',
          bodyColor: '#e2e8f0',
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: (item: TooltipItem<'doughnut'>) => {
              const v = Number(item.raw ?? 0)
              return `${fmt(v)}`
            },
          },
        },
      },
    } satisfies ChartOptions<'doughnut'>
  }, [fmt])

  function applyPeriodPreset(preset: ReportPeriodKey | 'custom') {
    setPeriodPreset(preset)
    if (preset !== 'custom') {
      const range = getReportPeriodRange(preset)
      setDateFrom(range.from_date)
      setDateTo(range.to_date)
    }
  }

  const showCustomDateFields = periodPreset === 'custom'
  const textAlign = isRtl ? 'text-right' : 'text-left'
  const numAlign = 'text-center tabular-nums'

  const filterSelectCls = filterReportSelectNineClass
  const periodTopBarSelectCls = filterPeriodBarSelectClass
  const periodTopBarDateInputCls = filterPeriodBarDateInputClass

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

  const handleExportCsv = () => {
    const headers = keysToShow.map((k) => colLabel(k))
    const lines = [headers.join(',')]
    sortedRows.forEach((r) => {
      const cells = keysToShow.map((key) => {
        const v = cellRaw(r, key)
        return typeof v === 'number' ? String(v) : `"${String(v).replace(/"/g, '""')}"`
      })
      lines.push(cells.join(','))
    })
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vendor-purchase-analysis-${dateFrom}-${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handlePrint = () => {
    const th = keysToShow.map((k) => `<th>${colLabel(k)}</th>`).join('')
    const body = sortedRows
      .map((r) => {
        const name = lang === 'ar' ? r.vendor_name : r.vendor_name_en || r.vendor_name
        const tds = keysToShow
          .map((key) => {
            if (key === 'vendor') return `<td>${name}</td>`
            if (key === 'invoice_count') return `<td class="num">${r.invoice_count}</td>`
            if (key === 'total_qty') return `<td class="num">${r.total_qty}</td>`
            if (key === 'total_purchases') return `<td class="num">${fmt(r.total_purchases)}</td>`
            if (key === 'pct_of_total') return `<td class="num">${r.pct_of_total.toFixed(2)}</td>`
            if (key === 'discount_percent') return `<td class="num">${r.discount_percent.toFixed(2)}</td>`
            return '<td></td>'
          })
          .join('')
        return `<tr>${tds}</tr>`
      })
      .join('')
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <!DOCTYPE html><html dir="${isRtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${lang === 'ar' ? 'تحليل المشتريات والموردين' : 'Supplier purchase analysis'}</title>
      <style>body{font-family:system-ui,sans-serif;padding:1rem}.num{text-align:center} table{width:100%;border-collapse:collapse} th,td{border:1px solid #ccc;padding:6px} th{background:#f5f5f5}</style></head><body>
      <h1>${lang === 'ar' ? 'تحليل المشتريات والموردين' : 'Supplier purchase analysis'}</h1>
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

  return (
    <div className="py-3 px-2 space-y-4 w-full min-w-0 max-w-full" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="no-print flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-600 pb-2">
        <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate shrink-0 leading-tight">
          {lang === 'ar' ? 'تحليل المشتريات والموردين' : 'Supplier purchase analysis'}
        </h1>
        <div className="flex-1 flex justify-center min-w-0">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-600 dark:text-slate-400 shrink-0">
                {lang === 'ar' ? 'الفترة' : 'Period'}
              </span>
              <select
                value={periodPreset}
                onChange={(e) => applyPeriodPreset((e.target.value as ReportPeriodKey | 'custom') || 'all')}
                className={periodTopBarSelectCls}
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
                  <span className="text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">
                    {lang === 'ar' ? 'من تاريخ' : 'From'}
                  </span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className={periodTopBarDateInputCls}
                  />
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">
                    {lang === 'ar' ? 'إلى تاريخ' : 'To'}
                  </span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className={periodTopBarDateInputCls}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="relative z-[120] flex flex-wrap items-center gap-1 shrink-0 no-print" ref={columnsMenuRef}>
          <button
            type="button"
            onClick={() => setShowColumnsMenu((v) => !v)}
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
                value={vendorGroupId === '' ? '' : String(vendorGroupId)}
                onChange={(e) => setVendorGroupId(e.target.value ? Number(e.target.value) : '')}
                className={filterSelectCls}
                title={lang === 'ar' ? 'فئة المورد' : 'Vendor group'}
              >
                <option value="">{lang === 'ar' ? 'كل فئات الموردين' : 'All vendor groups'}</option>
                {(vendorGroups ?? []).filter((g) => g.is_active).map((g) => (
                  <option key={g.id} value={g.id}>
                    {lang === 'ar' ? g.name : g.name_en || g.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0">
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className={filterSelectCls}
                title={lang === 'ar' ? 'العملة' : 'Currency'}
              >
                <option value="">{lang === 'ar' ? 'كل العملات' : 'All currencies'}</option>
                {currencies.filter((c) => c.is_active).map((c) => (
                  <option key={c.id} value={c.code}>
                    {c.code}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0">
              <select
                value={branchId === '' ? '' : String(branchId)}
                onChange={(e) => setBranchId(e.target.value ? Number(e.target.value) : '')}
                className={filterSelectCls}
                title={lang === 'ar' ? 'الفرع' : 'Branch'}
              >
                <option value="">{lang === 'ar' ? 'كل الفروع' : 'All branches'}</option>
                {branches.filter((b) => b.is_active).map((b) => (
                  <option key={b.id} value={b.id}>
                    {lang === 'ar' ? b.name : b.name_en || b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0">
              <select
                value={costCenterId === '' ? '' : String(costCenterId)}
                onChange={(e) => setCostCenterId(e.target.value ? Number(e.target.value) : '')}
                className={filterSelectCls}
                title={lang === 'ar' ? 'مركز التكلفة' : 'Cost center'}
              >
                <option value="">{lang === 'ar' ? 'كل المراكز' : 'All cost centers'}</option>
                {costCenters.filter((c) => c.is_active).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
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

      {!isLoading && donutValues.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm relative">
          {isFetching && (
            <div className="absolute inset-0 z-[1] flex items-center justify-center rounded-xl bg-white/70 dark:bg-slate-900/60 backdrop-blur-[1px]">
              <div className="h-9 w-9 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
            </div>
          )}
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {lang === 'ar' ? 'توزيع المشتريات حسب المورد' : 'Purchases distribution by vendor'}
            </h2>
            <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
              {data?.from_date} — {data?.to_date}
            </span>
          </div>
          <div className="w-full h-[260px] min-h-[200px]">
            <Doughnut data={donutChartData} options={donutOptions} />
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
                  {keysToShow.map((key) => (
                    <SortableTh
                      key={key}
                      label={colLabel(key)}
                      sortKey={key}
                      sortState={sort}
                      onToggle={toggleSort}
                      headerLayout={key === 'vendor' ? 'spread' : 'clusterCenter'}
                      truncateLabel={false}
                      className={`font-medium text-slate-700 dark:text-slate-200 ${
                        key === 'vendor' ? textAlign : 'text-center'
                      }`}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((r) => {
                  const name = lang === 'ar' ? r.vendor_name : r.vendor_name_en || r.vendor_name
                  return (
                    <tr key={r.vendor_id} className="border-b border-slate-100 hover:bg-slate-50/50 dark:border-slate-600/50 dark:hover:bg-slate-700/30">
                      {keysToShow.map((key) => {
                        if (key === 'vendor') {
                          return (
                            <td key={key} className={`px-3 py-2.5 align-middle ${textAlign}`}>
                              <Link
                                to={`/vendors/${r.vendor_id}`}
                                className="font-medium text-primary-700 hover:underline dark:text-primary-400"
                                title={lang === 'ar' ? 'فتح ملف المورد' : 'Open vendor profile'}
                              >
                                {name}
                              </Link>
                            </td>
                          )
                        }
                        if (key === 'invoice_count') {
                          return (
                            <td key={key} className={`px-3 py-2.5 align-middle ${numAlign}`} dir="ltr">
                              {r.invoice_count}
                            </td>
                          )
                        }
                        if (key === 'total_qty') {
                          return (
                            <td key={key} className={`px-3 py-2.5 align-middle ${numAlign}`} dir="ltr">
                              {r.total_qty}
                            </td>
                          )
                        }
                        if (key === 'total_purchases') {
                          return (
                            <td key={key} className={`px-3 py-2.5 align-middle ${numAlign} font-medium`} dir="ltr">
                              {fmt(r.total_purchases)}
                            </td>
                          )
                        }
                        if (key === 'pct_of_total') {
                          return (
                            <td key={key} className={`px-3 py-2.5 align-middle ${numAlign}`} dir="ltr">
                              {r.pct_of_total.toFixed(2)}%
                            </td>
                          )
                        }
                        return (
                          <td key={key} className={`px-3 py-2.5 align-middle ${numAlign}`} dir="ltr">
                            {r.discount_percent.toFixed(2)}%
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
              {!isLoading && sortedRows.length > 0 && footerLayout.numericKeys.length > 0 && (
                <tfoot>
                  <tr className="bg-gradient-to-r from-slate-100 to-slate-50 dark:from-slate-700 dark:to-slate-800 border-t-2 border-slate-400 dark:border-slate-500 font-bold text-slate-900 dark:text-slate-100 shadow-[0_-2px_4px_rgba(0,0,0,0.04)]">
                    {footerLayout.preKeys.length > 0 ? (
                      <td colSpan={footerLayout.preKeys.length} className={`${textAlign} px-3 py-2 text-sm leading-tight`}>
                        {lang === 'ar' ? 'الإجمالي' : 'Total'}
                      </td>
                    ) : (
                      <td className={`${textAlign} px-3 py-2 text-sm leading-tight`}>
                        {lang === 'ar' ? 'الإجمالي' : 'Total'}
                      </td>
                    )}
                    {footerLayout.numericKeys.map((k) => {
                      if (k === 'invoice_count') {
                        return (
                          <td key={k} className={`px-3 py-2 text-sm font-semibold leading-tight ${numAlign}`} dir="ltr">
                            {totals.sumInvoices}
                          </td>
                        )
                      }
                      if (k === 'total_qty') {
                        return (
                          <td key={k} className={`px-3 py-2 text-sm font-semibold leading-tight ${numAlign}`} dir="ltr">
                            {fmtQty(totals.sumQty)}
                          </td>
                        )
                      }
                      if (k === 'total_purchases') {
                        return (
                          <td key={k} className={`px-3 py-2 text-sm font-semibold leading-tight ${numAlign}`} dir="ltr">
                            {fmt(totals.sumPurchases)}
                          </td>
                        )
                      }
                      if (k === 'pct_of_total') {
                        return (
                          <td key={k} className={`px-3 py-2 text-sm font-semibold leading-tight ${numAlign}`} dir="ltr">
                            100.00%
                          </td>
                        )
                      }
                      if (k === 'discount_percent') {
                        return (
                          <td key={k} className={`px-3 py-2 text-sm font-semibold leading-tight ${numAlign}`} dir="ltr">
                            {totals.avgDiscount.toFixed(2)}%
                          </td>
                        )
                      }
                      return (
                        <td key={k} className={`px-3 py-2 text-sm font-semibold leading-tight ${numAlign}`} dir="ltr">
                          —
                        </td>
                      )
                    })}
                  </tr>
                </tfoot>
              )}
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
            recordLabel={lang === 'ar' ? 'مورد' : 'vendor'}
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

