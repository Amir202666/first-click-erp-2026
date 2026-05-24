import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchItemSalesReport,
  fetchSettings,
  fetchBranches,
  fetchItemCategories,
  fetchCustomers,
  fetchItemsForFilter,
} from '../../api/tenant'
import type { ItemSalesReportResponse, ItemSalesReportRow } from '../../api/tenant'
import type { PaginatedResponse } from '../../types'
import type { Item } from '../../types'
import { getReportPeriodRange, type ReportPeriodKey } from '../../utils/date'
import { formatAmount } from '../../utils/currency'
import { FileSpreadsheet, FileText, Printer, Columns3 } from 'lucide-react'
import SearchableSelect, { type SearchableSelectOption } from '../../components/ui/SearchableSelect'
import { useDocumentTitleContext } from '../../contexts/DocumentTitleContext'
import ReportFooter from '../../components/ui/ReportFooter'
import { usePersistedColumnVisibility } from '../../hooks/usePersistedColumnVisibility'
import { useClientSort } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'

const CHART_COLORS = ['#1e40af', '#0ea5e9', '#059669', '#8b5cf6', '#dc2626', '#f59e0b', '#06b6d4', '#84cc16', '#ec4899', '#6366f1']

function toList(res: unknown): { id: number; name: string; code?: string; name_en?: string }[] {
  if (Array.isArray(res)) return res as { id: number; name: string; code?: string; name_en?: string }[]
  if (res && typeof res === 'object' && 'data' in res) {
    const d = (res as { data: unknown }).data
    return Array.isArray(d) ? (d as { id: number; name: string; code?: string; name_en?: string }[]) : []
  }
  return []
}

type ColumnKey =
  | 'code'
  | 'name'
  | 'unit'
  | 'qty'
  | 'avgPrice'
  | 'discount'
  | 'tax'
  | 'net'
  | 'pct'

const allColumnKeys: ColumnKey[] = ['code', 'name', 'unit', 'qty', 'avgPrice', 'discount', 'tax', 'net', 'pct']
const COLUMN_STORAGE_KEY = 'bestSellingReportVisibleColumns'

type SortBy = 'quantity' | 'value'

export default function BestSellingReport() {
  const { currentTenant } = useAuth()
  const { lang, isRtl } = useLanguage()
  const { setPageTitle } = useDocumentTitleContext()
  const tenantId = currentTenant?.id ?? 0
  const defaultRange = getReportPeriodRange('all')
  const [periodPreset, setPeriodPreset] = useState<ReportPeriodKey | 'custom'>('all')
  const [dateFrom, setDateFrom] = useState(defaultRange.from_date)
  const [dateTo, setDateTo] = useState(defaultRange.to_date)
  const [categoryId, setCategoryId] = useState<string>('')
  const [itemIdFilter, setItemIdFilter] = useState<string>('')
  const [branchId, setBranchId] = useState<string>('')
  const [customerId, setCustomerId] = useState<string>('')
  const [sortBy, setSortBy] = useState<SortBy>('value')
  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnKey, boolean>>(() =>
    allColumnKeys.reduce(
      (acc, key) => ({ ...acc, [key]: true }),
      {} as Record<ColumnKey, boolean>,
    ),
  )
  const [showColumnsMenu, setShowColumnsMenu] = useState(false)
  const columnsMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (periodPreset !== 'custom') {
      const range = getReportPeriodRange(periodPreset)
      setDateFrom(range.from_date)
      setDateTo(range.to_date)
    }
  }, [periodPreset])

  useEffect(() => {
    setPageTitle(lang === 'ar' ? 'الأكثر مبيعاً' : 'Best Selling')
    return () => setPageTitle(null)
  }, [lang, setPageTitle])

  const { data: settings } = useQuery({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const decimals = Number((settings as Record<string, unknown>)?.doc_amount_decimals ?? 2)
  const qtyDecimals = Number((settings as Record<string, unknown>)?.doc_quantity_decimals ?? 2)
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const fmt = (n: number) => formatAmount(n, { decimal_places: decimals }, locale)
  const fmtQty = (n: number) =>
    Number(n).toLocaleString(locale, { minimumFractionDigits: qtyDecimals, maximumFractionDigits: qtyDecimals })
  const textAlign = isRtl ? 'text-right' : 'text-left'
  const numAlign = 'text-end'
  const visibleColumnKeys = allColumnKeys.filter((k) => visibleColumns[k])

  const params = useMemo(() => {
    const p: Record<string, string> = {
      from_date: dateFrom,
      to_date: dateTo,
      per_page: '100',
      page: '1',
    }
    if (categoryId) p.category_id = categoryId
    if (itemIdFilter) p.item_id = itemIdFilter
    if (branchId) p.branch_id = branchId
    if (customerId) p.customer_id = customerId
    return p
  }, [dateFrom, dateTo, categoryId, itemIdFilter, branchId, customerId])

  const { data, isLoading } = useQuery<ItemSalesReportResponse>({
    queryKey: ['item-sales-report', 'best-selling', tenantId, params],
    queryFn: () => fetchItemSalesReport(tenantId, params),
    enabled: !!tenantId && !!dateFrom && !!dateTo,
  })

  const { data: branchesData } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId,
  })
  const { data: categoriesData } = useQuery({
    queryKey: ['item-categories', tenantId],
    queryFn: () => fetchItemCategories(tenantId),
    enabled: !!tenantId,
  })
  const { data: customersData } = useQuery({
    queryKey: ['customers', tenantId, 'list'],
    queryFn: () => fetchCustomers(tenantId, { per_page: '200' }),
    enabled: !!tenantId,
  })
  const { data: itemsData } = useQuery<PaginatedResponse<Item>>({
    queryKey: ['items', tenantId, 'best-selling-filter'],
    queryFn: () => fetchItemsForFilter(tenantId, { per_page: '2000' }),
    enabled: !!tenantId,
  })
  const items = itemsData?.data ?? []
  const branches = toList(branchesData)
  const categories = toList(categoriesData)
  const customersList: { id: number; name: string }[] = Array.isArray((customersData as { data?: unknown })?.data)
    ? (customersData as { data: { id: number; name: string }[] }).data
    : []

  const discountNet = (r: ItemSalesReportRow) => Number(r.discount_sold ?? 0) - Number(r.discount_returned ?? 0)
  const amountNetRow = (r: ItemSalesReportRow) =>
    Number(r.amount_sold ?? 0) - Number(r.amount_returned ?? 0) - discountNet(r)
  const qtySold = (r: ItemSalesReportRow) => Number(r.quantity_sold_base ?? 0)

  const { processedRows, totalNet, top10ForChart } = useMemo(() => {
    const raw = data?.data ?? []
    const withMeta = raw.map((r) => {
      const net = amountNetRow(r)
      const qty = qtySold(r)
      const avgPrice = qty > 0 ? net / qty : 0
      return {
        ...r,
        _qtySold: qty,
        _net: net,
        _avgPrice: avgPrice,
        _discount: discountNet(r),
        _tax: 0,
      }
    })
    const sorted =
      sortBy === 'quantity'
        ? [...withMeta].sort((a, b) => b._qtySold - a._qtySold)
        : [...withMeta].sort((a, b) => b._net - a._net)
    const total = sorted.reduce((s, r) => s + r._net, 0)
    const withPct = sorted.map((r) => ({
      ...r,
      _pct: total > 0 ? (r._net / total) * 100 : 0,
    }))
    const top10 = withPct.slice(0, 10).map((r, i) => ({
      name: r.item_name || r.item_code || '—',
      value: sortBy === 'quantity' ? r._qtySold : r._net,
      fill: CHART_COLORS[i % CHART_COLORS.length],
    }))
    return {
      processedRows: withPct,
      totalNet: total,
      top10ForChart: top10,
    }
  }, [data?.data, sortBy, lang])

  type ProcessedBestSellingRow = ItemSalesReportRow & {
    _qtySold: number
    _net: number
    _avgPrice: number
    _discount: number
    _tax: number
    _pct: number
  }

  const bestSellingSortColumns = useMemo(
    () => [
      { key: 'code' as ColumnKey, type: 'string' as const, getValue: (r: ProcessedBestSellingRow) => r.item_code ?? '' },
      { key: 'name' as ColumnKey, type: 'string' as const, getValue: (r: ProcessedBestSellingRow) => r.item_name ?? '' },
      { key: 'unit' as ColumnKey, type: 'string' as const, getValue: (r: ProcessedBestSellingRow) => r.base_unit_name ?? '' },
      { key: 'qty' as ColumnKey, type: 'number' as const, getValue: (r: ProcessedBestSellingRow) => r._qtySold },
      { key: 'avgPrice' as ColumnKey, type: 'number' as const, getValue: (r: ProcessedBestSellingRow) => r._avgPrice },
      { key: 'discount' as ColumnKey, type: 'number' as const, getValue: (r: ProcessedBestSellingRow) => r._discount },
      { key: 'tax' as ColumnKey, type: 'number' as const, getValue: (r: ProcessedBestSellingRow) => r._tax },
      { key: 'net' as ColumnKey, type: 'number' as const, getValue: (r: ProcessedBestSellingRow) => r._net },
      { key: 'pct' as ColumnKey, type: 'number' as const, getValue: (r: ProcessedBestSellingRow) => r._pct },
    ],
    [],
  )
  const { sort, toggleSort, sortedRows } = useClientSort<ProcessedBestSellingRow, ColumnKey>(
    processedRows,
    bestSellingSortColumns,
    { locale },
  )

  const totalsRow = useMemo(() => {
    let sumQty = 0
    let sumNet = 0
    let sumDiscount = 0
    let sumTax = 0
    let weightedAvgPriceNum = 0
    let weightedAvgPriceDen = 0
    sortedRows.forEach((r) => {
      const qty = Number(r._qtySold ?? 0)
      const net = Number(r._net ?? 0)
      const disc = Number(r._discount ?? 0)
      const tax = Number(r._tax ?? 0)
      sumQty += qty
      sumNet += net
      sumDiscount += disc
      sumTax += tax
      if (qty > 0) {
        weightedAvgPriceNum += (net / qty) * qty
        weightedAvgPriceDen += qty
      }
    })
    const avgPrice = weightedAvgPriceDen > 0.0000001 ? weightedAvgPriceNum / weightedAvgPriceDen : 0
    return { sumQty, avgPrice, sumDiscount, sumTax, sumNet }
  }, [sortedRows])

  const periodOptions: { value: ReportPeriodKey | 'custom'; labelAr: string; labelEn: string }[] = [
    { value: 'all', labelAr: 'الكل', labelEn: 'All' },
    { value: 'today', labelAr: 'يومي', labelEn: 'Daily' },
    { value: 'this_week', labelAr: 'أسبوعي', labelEn: 'Weekly' },
    { value: 'this_month', labelAr: 'شهري', labelEn: 'Monthly' },
    { value: 'this_year', labelAr: 'سنوي', labelEn: 'Yearly' },
    { value: 'custom', labelAr: 'تاريخ مخصص', labelEn: 'Custom' },
  ]

  const labelCategory = lang === 'ar' ? 'التصنيف / الفئة' : 'Category'
  const labelItem = lang === 'ar' ? 'الصنف' : 'Item'
  const labelBranch = lang === 'ar' ? 'الفرع' : 'Branch'
  const labelCustomer = lang === 'ar' ? 'العميل' : 'Customer'

  const categoryOptions: SearchableSelectOption[] = useMemo(
    () => [
      { value: 0, label: labelCategory },
      ...categories.map((c) => ({
        value: c.id,
        label: lang === 'ar' ? c.name : (c.name_en || c.name),
      })),
    ],
    [categories, lang, labelCategory]
  )
  const branchOptions: SearchableSelectOption[] = useMemo(
    () => [{ value: 0, label: labelBranch }, ...branches.map((b) => ({ value: b.id, label: b.name }))],
    [branches, labelBranch]
  )
  const customerOptions: SearchableSelectOption[] = useMemo(
    () => [{ value: 0, label: labelCustomer }, ...customersList.map((c) => ({ value: c.id, label: c.name }))],
    [customersList, labelCustomer]
  )

  const itemFilterOptions: SearchableSelectOption[] = useMemo(() => {
    const base: SearchableSelectOption[] = [{ value: 0, label: labelItem, primaryLabel: labelItem, searchText: labelItem }]
    const opts = items.map((i: Item) => {
      const code = i.code ?? ''
      const barcode = i.barcode ?? ''
      return {
        value: i.id,
        label: code ? `${i.name} (${code})` : i.name,
        primaryLabel: i.name,
        secondaryLabel: code || undefined,
        searchText: `${i.name} ${code} ${barcode}`.trim(),
      } as SearchableSelectOption
    })
    return [...base, ...opts]
  }, [items, labelItem])

  const handleExportExcel = () => {
    const headers = visibleColumnKeys.map((key) => {
      if (lang === 'ar') {
        switch (key) {
          case 'code':
            return 'كود الصنف'
          case 'name':
            return 'اسم الصنف'
          case 'unit':
            return 'الوحدة'
          case 'qty':
            return 'الكمية المباعة'
          case 'avgPrice':
            return 'متوسط سعر البيع'
          case 'discount':
            return 'إجمالي الخصم'
          case 'tax':
            return 'الضريبة'
          case 'net':
            return 'صافي المبيعات'
          case 'pct':
          default:
            return 'النسبة %'
        }
      }
      switch (key) {
        case 'code':
          return 'Code'
        case 'name':
          return 'Item'
        case 'unit':
          return 'Unit'
        case 'qty':
          return 'Qty Sold'
        case 'avgPrice':
          return 'Avg Price'
        case 'discount':
          return 'Discount'
        case 'tax':
          return 'Tax'
        case 'net':
          return 'Net Sales'
        case 'pct':
        default:
          return '%'
      }
    })
    const lines = [headers.join(',')]
    sortedRows.forEach((r) => {
      const rowValues = visibleColumnKeys.map((key) => {
        switch (key) {
          case 'code':
            return r.item_code
          case 'name':
            return r.item_name
          case 'unit':
            return r.base_unit_name ?? ''
          case 'qty':
            return String(r._qtySold)
          case 'avgPrice':
            return r._avgPrice.toFixed(decimals)
          case 'discount':
            return r._discount.toFixed(decimals)
          case 'tax':
            return r._tax.toFixed(decimals)
          case 'net':
            return r._net.toFixed(decimals)
          case 'pct':
          default:
            return r._pct.toFixed(2)
        }
      })
      lines.push(rowValues.join(','))
    })
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `best-selling-${dateFrom}-${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handlePrint = () => {
    const th = visibleColumnKeys
      .map((key) => {
        if (lang === 'ar') {
          switch (key) {
            case 'code':
              return '<th>كود الصنف</th>'
            case 'name':
              return '<th>اسم الصنف</th>'
            case 'unit':
              return '<th>الوحدة</th>'
            case 'qty':
              return '<th>الكمية المباعة</th>'
            case 'avgPrice':
              return '<th>متوسط سعر البيع</th>'
            case 'discount':
              return '<th>الخصم</th>'
            case 'tax':
              return '<th>الضريبة</th>'
            case 'net':
              return '<th>صافي المبيعات</th>'
            case 'pct':
            default:
              return '<th>النسبة %</th>'
          }
        }
        switch (key) {
          case 'code':
            return '<th>Code</th>'
          case 'name':
            return '<th>Item</th>'
          case 'unit':
            return '<th>Unit</th>'
          case 'qty':
            return '<th>Qty Sold</th>'
          case 'avgPrice':
            return '<th>Avg Price</th>'
          case 'discount':
            return '<th>Discount</th>'
          case 'tax':
            return '<th>Tax</th>'
          case 'net':
            return '<th>Net Sales</th>'
          case 'pct':
          default:
            return '<th>%</th>'
        }
      })
      .join('')

    const rows = sortedRows
      .slice(0, 100)
      .map((r) => {
        const cells = visibleColumnKeys
          .map((key) => {
            switch (key) {
              case 'code':
                return `<td>${r.item_code}</td>`
              case 'name':
                return `<td>${r.item_name}</td>`
              case 'unit':
                return `<td>${r.base_unit_name ?? '—'}</td>`
              case 'qty':
                return `<td class="num">${fmtQty(r._qtySold)}</td>`
              case 'avgPrice':
                return `<td class="num">${fmt(r._avgPrice)}</td>`
              case 'discount':
                return `<td class="num">${fmt(r._discount)}</td>`
              case 'tax':
                return `<td class="num">${fmt(r._tax)}</td>`
              case 'net':
                return `<td class="num">${fmt(r._net)}</td>`
              case 'pct':
              default:
                return `<td class="num">${r._pct.toFixed(2)}%</td>`
            }
          })
          .join('')
        return `<tr>${cells}</tr>`
      })
      .join('')
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <!DOCTYPE html><html dir="${isRtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${lang === 'ar' ? 'الأكثر مبيعاً' : 'Best Selling'}</title>
      <style>body{font-family:system-ui,sans-serif;padding:1rem}.num{text-align:right} table{width:100%;border-collapse:collapse} th,td{border:1px solid #ccc;padding:6px} th{background:#f5f5f5}</style></head><body>
      <h1>${lang === 'ar' ? 'تقرير الأكثر مبيعاً' : 'Best Selling Report'}</h1>
      <p>${dateFrom} — ${dateTo}</p>
      <table><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table></body></html>
    `)
    win.document.close()
    win.focus()
    setTimeout(() => {
      win.print()
      win.close()
    }, 300)
  }

  const reportTitle = lang === 'ar' ? 'الأكثر مبيعاً' : 'Best Selling'
  const labelPeriod = lang === 'ar' ? 'نطاق التاريخ' : 'Date range'
  const labelSortBy = lang === 'ar' ? 'ترتيب حسب' : 'Sort by'
  const sortQuantity = lang === 'ar' ? 'الكمية المباعة' : 'Quantity sold'
  const sortValue = lang === 'ar' ? 'القيمة (الإيراد)' : 'Value (Revenue)'
  const colCode = lang === 'ar' ? 'كود الصنف' : 'Code'
  const colName = lang === 'ar' ? 'اسم الصنف' : 'Item'
  const colUnit = lang === 'ar' ? 'الوحدة' : 'Unit'
  const colQty = lang === 'ar' ? 'الكمية المباعة' : 'Qty sold'
  const colAvgPrice = lang === 'ar' ? 'متوسط سعر البيع' : 'Avg price'
  const colDiscount = lang === 'ar' ? 'إجمالي الخصم الممنوح' : 'Total discount'
  const colTax = lang === 'ar' ? 'إجمالي الضريبة' : 'Total tax'
  const colNet = lang === 'ar' ? 'صافي قيمة المبيعات' : 'Net sales'
  const colPct = lang === 'ar' ? 'النسبة %' : '%'
  const chartTitle = lang === 'ar' ? 'أعلى 10 أصناف مبيعاً' : 'Top 10 best selling'

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!columnsMenuRef.current) return
      if (!columnsMenuRef.current.contains(e.target as Node)) {
        setShowColumnsMenu(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  if (!tenantId) {
    return (
      <div className="p-6">
        <p className="text-amber-600">{lang === 'ar' ? 'يرجى اختيار الشركة أولاً.' : 'Please select a company first.'}</p>
      </div>
    )
  }

  return (
    <div className="px-0 py-3 space-y-3 w-full min-w-0 max-w-full" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* شريط علوي: العنوان، نطاق التاريخ، ترتيب، أزرار التصدير والطباعة */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-1.5">
        <h1 className="text-base font-semibold text-slate-900 truncate shrink-0 leading-tight">{reportTitle}</h1>

        {/* فلتر الفترة في منتصف الشريط (نفس فواتير المبيعات) */}
        <div className="flex-1 flex justify-center min-w-0">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-600 shrink-0">{labelPeriod}</span>
              <select
                value={periodPreset}
                onChange={(e) => {
                  const v = (e.target.value as ReportPeriodKey | 'custom') || 'all'
                  setPeriodPreset(v)
                  if (v !== 'custom') {
                    const range = getReportPeriodRange(v)
                    setDateFrom(range.from_date)
                    setDateTo(range.to_date)
                  }
                }}
                className="border border-slate-300 rounded-lg px-2.5 h-8 text-sm min-w-[140px] max-w-[200px] box-border bg-white shrink-0 leading-normal"
                title={labelPeriod}
              >
                {periodOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {lang === 'ar' ? opt.labelAr : opt.labelEn}
                  </option>
                ))}
              </select>
            </div>
            {periodPreset === 'custom' && (
              <div className="flex flex-wrap items-center gap-2 justify-center">
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-sm text-slate-600 whitespace-nowrap">{lang === 'ar' ? 'من تاريخ' : 'From date'}</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="border border-slate-300 rounded-lg px-2 h-8 text-sm w-[140px] min-w-[140px] box-border bg-white leading-normal"
                    title={lang === 'ar' ? 'من تاريخ' : 'From date'}
                  />
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-sm text-slate-600 whitespace-nowrap">{lang === 'ar' ? 'إلى تاريخ' : 'To date'}</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="border border-slate-300 rounded-lg px-2 h-8 text-sm w-[140px] min-w-[140px] box-border bg-white leading-normal"
                    title={lang === 'ar' ? 'إلى تاريخ' : 'To date'}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 no-print shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">{labelSortBy}</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy((e.target.value as SortBy) || 'value')}
              className="border border-slate-300 rounded-lg px-2.5 h-8 text-sm min-w-[140px] max-w-[200px] box-border bg-white shrink-0 leading-normal"
              title={labelSortBy}
            >
              <option value="quantity">{sortQuantity}</option>
              <option value="value">{sortValue}</option>
            </select>
          </div>

          <div className="relative flex items-center gap-1.5" ref={columnsMenuRef}>
            <button
              type="button"
              onClick={() => setShowColumnsMenu((v) => !v)}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#D9DCE0] bg-[#F0F2F5] text-[#344054] shadow-sm transition-colors hover:bg-[#E4E7EB]"
              title={lang === 'ar' ? 'تخصيص الأعمدة' : 'Customize columns'}
            >
              <Columns3 size={16} strokeWidth={2} aria-hidden />
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={isLoading}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#F0F2F5] border border-[#D9DCE0] text-[#344054] hover:bg-[#E4E7EB] disabled:opacity-50"
              title={lang === 'ar' ? 'طباعة التقرير' : 'Print report'}
            >
              <Printer size={15} />
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={isLoading}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#344054] text-white hover:bg-[#2d3846] disabled:opacity-50"
              title="PDF"
            >
              <FileText size={15} />
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={isLoading}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
              title={lang === 'ar' ? 'تصدير Excel' : 'Export Excel'}
            >
              <FileSpreadsheet size={15} />
            </button>

            {showColumnsMenu && (
              <div className="absolute top-full right-0 mt-2 z-20 w-64 rounded-lg border border-slate-200 bg-white shadow-lg py-2 text-sm">
                <div className="px-3 pb-2 text-xs font-semibold text-slate-500">
                  {lang === 'ar' ? 'إظهار/إخفاء الأعمدة' : 'Show / hide columns'}
                </div>
                {allColumnKeys.map((key) => {
                  const label =
                    key === 'code'
                      ? (lang === 'ar' ? 'كود الصنف' : 'Code')
                      : key === 'name'
                        ? (lang === 'ar' ? 'اسم الصنف' : 'Item')
                        : key === 'unit'
                          ? (lang === 'ar' ? 'الوحدة' : 'Unit')
                          : key === 'qty'
                            ? (lang === 'ar' ? 'الكمية المباعة' : 'Qty sold')
                            : key === 'avgPrice'
                              ? (lang === 'ar' ? 'متوسط سعر البيع' : 'Avg price')
                              : key === 'discount'
                                ? (lang === 'ar' ? 'إجمالي الخصم الممنوح' : 'Total discount')
                                : key === 'tax'
                                  ? (lang === 'ar' ? 'إجمالي الضريبة' : 'Total tax')
                                  : key === 'net'
                                    ? (lang === 'ar' ? 'صافي قيمة المبيعات' : 'Net sales')
                                    : (lang === 'ar' ? 'النسبة %' : '%')
                  return (
                    <label
                      key={key}
                      className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer select-none"
                    >
                      <input
                        type="checkbox"
                        checked={visibleColumns[key]}
                        onChange={() =>
                          setVisibleColumns((prev) => ({
                            ...prev,
                            [key]: !prev[key],
                          }))
                        }
                        className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-slate-700 text-xs">{label}</span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* فلاتر: التصنيف، الصنف، الفرع، العميل */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex flex-wrap items-end gap-4">
        <div className="min-w-[200px] flex-1 basis-[200px] max-w-[280px]">
          <SearchableSelect
            options={categoryOptions}
            value={categoryId === '' ? 0 : Number(categoryId) || 0}
            onChange={(v) => setCategoryId(v === 0 || v === null ? '' : String(v))}
            placeholder={labelCategory}
            matchTriggerWidth
            textAlign={isRtl ? 'right' : 'left'}
            className="w-full"
          />
        </div>
        <div className="min-w-[220px] flex-1 basis-[220px] max-w-[320px]">
          <SearchableSelect
            options={itemFilterOptions}
            value={itemIdFilter === '' ? 0 : Number(itemIdFilter) || 0}
            onChange={(v) => setItemIdFilter(v === 0 || v === null ? '' : String(v))}
            placeholder={labelItem}
            matchTriggerWidth
            wrapOptions
            textAlign={isRtl ? 'right' : 'left'}
            className="w-full"
          />
        </div>
        <div className="min-w-[200px] flex-1 basis-[200px] max-w-[280px]">
          <SearchableSelect
            options={branchOptions}
            value={branchId === '' ? 0 : Number(branchId) || 0}
            onChange={(v) => setBranchId(v === 0 || v === null ? '' : String(v))}
            placeholder={labelBranch}
            matchTriggerWidth
            textAlign={isRtl ? 'right' : 'left'}
            className="w-full"
          />
        </div>
        <div className="min-w-[200px] flex-1 basis-[200px] max-w-[280px]">
          <SearchableSelect
            options={customerOptions}
            value={customerId === '' ? 0 : Number(customerId) || 0}
            onChange={(v) => setCustomerId(v === 0 || v === null ? '' : String(v))}
            placeholder={labelCustomer}
            matchTriggerWidth
            textAlign={isRtl ? 'right' : 'left'}
            className="w-full"
          />
        </div>
      </div>

      {/* رسم بياني عمودي: أعلى 10 (أعلى الجدول) */}
      {processedRows.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">{chartTitle}</h2>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={260} minHeight={200}>
              <BarChart data={top10ForChart} margin={{ top: 12, right: 12, left: 48, bottom: 90 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  angle={-45}
                  textAnchor="end"
                  height={70}
                  interval={0}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="number"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number | undefined) => (sortBy === 'quantity' ? fmtQty(Number(v ?? 0)) : fmt(Number(v ?? 0)))}
                  width={56}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(value: number | undefined) => (sortBy === 'quantity' ? fmtQty(Number(value ?? 0)) : fmt(Number(value ?? 0)))}
                  labelFormatter={(l) => l}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={40}>
                  {top10ForChart.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* جدول البيانات */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-500 border-t-transparent" />
            </div>
          ) : (
            <table className="w-full text-sm min-w-[800px] table-fixed">
              <thead className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-600">
                <tr>
                  {visibleColumns.code && (
                    <SortableTh
                      label={colCode}
                      sortKey="code"
                      sortState={sort}
                      onToggle={toggleSort}
                      truncateLabel={false}
                      widthClassName="min-w-[88px]"
                      className={`${textAlign} p-0 font-medium text-slate-700 dark:text-slate-200`}
                    />
                  )}
                  {visibleColumns.name && (
                    <SortableTh
                      label={colName}
                      sortKey="name"
                      sortState={sort}
                      onToggle={toggleSort}
                      truncateLabel={false}
                      widthClassName="min-w-[160px]"
                      className={`${textAlign} p-0 font-medium text-slate-700 dark:text-slate-200`}
                    />
                  )}
                  {visibleColumns.unit && (
                    <SortableTh
                      label={colUnit}
                      sortKey="unit"
                      sortState={sort}
                      onToggle={toggleSort}
                      truncateLabel={false}
                      widthClassName="min-w-[72px]"
                      className={`${textAlign} p-0 font-medium text-slate-700 dark:text-slate-200`}
                    />
                  )}
                  {visibleColumns.qty && (
                    <SortableTh
                      label={colQty}
                      sortKey="qty"
                      sortState={sort}
                      onToggle={toggleSort}
                      truncateLabel={false}
                      widthClassName="min-w-[88px]"
                      className={`${numAlign} p-0 font-medium text-slate-700 dark:text-slate-200`}
                    />
                  )}
                  {visibleColumns.avgPrice && (
                    <SortableTh
                      label={colAvgPrice}
                      sortKey="avgPrice"
                      sortState={sort}
                      onToggle={toggleSort}
                      truncateLabel={false}
                      widthClassName="min-w-[96px]"
                      className={`${numAlign} p-0 font-medium text-slate-700 dark:text-slate-200`}
                    />
                  )}
                  {visibleColumns.discount && (
                    <SortableTh
                      label={colDiscount}
                      sortKey="discount"
                      sortState={sort}
                      onToggle={toggleSort}
                      truncateLabel={false}
                      widthClassName="min-w-[88px]"
                      className={`${numAlign} p-0 font-medium text-slate-700 dark:text-slate-200`}
                    />
                  )}
                  {visibleColumns.tax && (
                    <SortableTh
                      label={colTax}
                      sortKey="tax"
                      sortState={sort}
                      onToggle={toggleSort}
                      truncateLabel={false}
                      widthClassName="min-w-[72px]"
                      className={`${numAlign} p-0 font-medium text-slate-700 dark:text-slate-200`}
                    />
                  )}
                  {visibleColumns.net && (
                    <SortableTh
                      label={colNet}
                      sortKey="net"
                      sortState={sort}
                      onToggle={toggleSort}
                      truncateLabel={false}
                      widthClassName="min-w-[96px]"
                      className={`${numAlign} p-0 font-medium text-slate-700 dark:text-slate-200`}
                    />
                  )}
                  {visibleColumns.pct && (
                    <SortableTh
                      label={colPct}
                      sortKey="pct"
                      sortState={sort}
                      onToggle={toggleSort}
                      truncateLabel={false}
                      widthClassName="min-w-[72px]"
                      className={`${numAlign} p-0 font-medium text-slate-700 dark:text-slate-200`}
                    />
                  )}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r) => (
                  <tr key={r.item_id} className="border-b border-slate-100 dark:border-slate-600/50 hover:bg-slate-50/50 dark:hover:bg-slate-700/30">
                    {visibleColumns.code && (
                      <td className={`px-3 py-2.5 ${textAlign}`} dir="ltr">{r.item_code}</td>
                    )}
                    {visibleColumns.name && (
                      <td className={`px-3 py-2.5 ${textAlign}`}>{r.item_name}</td>
                    )}
                    {visibleColumns.unit && (
                      <td className={`px-3 py-2.5 ${textAlign}`}>{r.base_unit_name ?? '—'}</td>
                    )}
                    {visibleColumns.qty && (
                      <td className={`px-3 py-2.5 ${numAlign}`} dir="ltr">{fmtQty(r._qtySold)}</td>
                    )}
                    {visibleColumns.avgPrice && (
                      <td className={`px-3 py-2.5 ${numAlign}`} dir="ltr">{fmt(r._avgPrice)}</td>
                    )}
                    {visibleColumns.discount && (
                      <td className={`px-3 py-2.5 ${numAlign}`} dir="ltr">{fmt(r._discount)}</td>
                    )}
                    {visibleColumns.tax && (
                      <td className={`px-3 py-2.5 ${numAlign}`} dir="ltr">{fmt(r._tax)}</td>
                    )}
                    {visibleColumns.net && (
                      <td className={`px-3 py-2.5 ${numAlign} font-medium`} dir="ltr">{fmt(r._net)}</td>
                    )}
                    {visibleColumns.pct && (
                      <td className={`px-3 py-2.5 ${numAlign}`} dir="ltr">{r._pct.toFixed(2)}%</td>
                    )}
                  </tr>
                ))}
              </tbody>
              {!isLoading && sortedRows.length > 0 && (
                <tfoot>
                  <tr className="bg-gradient-to-r from-slate-100 to-slate-50 dark:from-slate-700 dark:to-slate-800 border-t-2 border-slate-400 dark:border-slate-500 font-bold text-slate-900 dark:text-slate-100 shadow-[0_-2px_4px_rgba(0,0,0,0.04)]">
                    <td
                      colSpan={[visibleColumns.code, visibleColumns.name, visibleColumns.unit].filter(Boolean).length || 1}
                      className={`${textAlign} px-3 py-2 text-sm leading-tight`}
                    >
                      {lang === 'ar' ? 'الإجمالي' : 'Total'}
                    </td>
                    {visibleColumns.qty && (
                      <td className={`px-3 py-2 text-sm font-semibold leading-tight ${numAlign}`} dir="ltr">
                        {fmtQty(totalsRow.sumQty)}
                      </td>
                    )}
                    {visibleColumns.avgPrice && (
                      <td className={`px-3 py-2 text-sm font-semibold leading-tight ${numAlign}`} dir="ltr">
                        {fmt(totalsRow.avgPrice)}
                      </td>
                    )}
                    {visibleColumns.discount && (
                      <td className={`px-3 py-2 text-sm font-semibold leading-tight ${numAlign}`} dir="ltr">
                        {fmt(totalsRow.sumDiscount)}
                      </td>
                    )}
                    {visibleColumns.tax && (
                      <td className={`px-3 py-2 text-sm font-semibold leading-tight ${numAlign}`} dir="ltr">
                        {fmt(totalsRow.sumTax)}
                      </td>
                    )}
                    {visibleColumns.net && (
                      <td className={`px-3 py-2 text-sm font-semibold leading-tight ${numAlign}`} dir="ltr">
                        {fmt(totalsRow.sumNet)}
                      </td>
                    )}
                    {visibleColumns.pct && (
                      <td className={`px-3 py-2 text-sm font-semibold leading-tight ${numAlign}`} dir="ltr">
                        100.00%
                      </td>
                    )}
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>
      </div>

      {!isLoading && processedRows.length === 0 && (
        <p className="text-center text-slate-500 dark:text-slate-400 py-8">{lang === 'ar' ? 'لا توجد بيانات في الفترة المحددة.' : 'No data for the selected period.'}</p>
      )}
    </div>
  )
}
