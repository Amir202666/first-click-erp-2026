import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchItemPurchasesReport,
  fetchSettings,
  fetchBranches,
  fetchVendors,
  fetchItemCategories,
  fetchItemsForFilter,
} from '../../api/tenant'
import type { ItemPurchasesReportResponse, ItemPurchasesReportRow } from '../../api/tenant'
import { getDefaultDateRange, getReportPeriodRange, addOneDay, type ReportPeriodKey } from '../../utils/date'
import { formatAmount } from '../../utils/currency'
import { FileText, FileSpreadsheet, Printer, ChevronLeft, ChevronRight, X, Columns3 } from 'lucide-react'
import SearchableSelect, { type SearchableSelectOption } from '../../components/ui/SearchableSelect'
import ReportFooter from '../../components/ui/ReportFooter'
import { usePersistedColumnVisibility } from '../../hooks/usePersistedColumnVisibility'
import { useClientSort } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'

function toList(res: unknown): { id: number; name: string; code?: string }[] {
  if (Array.isArray(res)) return res as { id: number; name: string; code?: string }[]
  if (res && typeof res === 'object' && 'data' in res) {
    const d = (res as { data: unknown }).data
    return Array.isArray(d) ? (d as { id: number; name: string; code?: string }[]) : []
  }
  return []
}

export default function ItemPurchasesReport() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const defaultRange = getDefaultDateRange()
  const [dateFrom, setDateFrom] = useState(defaultRange.dateFrom ?? '')
  const [dateTo, setDateTo] = useState(defaultRange.dateTo ?? '')
  const [periodPreset, setPeriodPreset] = useState<ReportPeriodKey | 'custom'>('all')
  const [categoryId, setCategoryId] = useState<string>('')
  const [branchId, setBranchId] = useState<string>('')
  const [vendorId, setVendorId] = useState<string>('')
  const [itemId, setItemId] = useState<string>('')
  const [paymentType, setPaymentType] = useState<'all' | 'cash' | 'credit'>('all')
  const [page, setPage] = useState(1)
  const perPage = 25

  const { data: settings } = useQuery({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const decimals = Number((settings as Record<string, unknown>)?.doc_amount_decimals ?? 2)
  const qtyDecimals = Number((settings as Record<string, unknown>)?.doc_quantity_decimals ?? 2)
  const fmt = (n: number) => formatAmount(n, { decimal_places: decimals }, locale)
  const fmtQty = (n: number) =>
    Number(n).toLocaleString(locale, { minimumFractionDigits: qtyDecimals, maximumFractionDigits: qtyDecimals })

  const LIST_INITIAL_PAGE_SIZE = 50

  const { data: branchesData } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId,
    retry: false,
    staleTime: 60_000,
  })
  const branches = toList(branchesData)

  const { data: categoriesData } = useQuery({
    queryKey: ['item-categories', tenantId],
    queryFn: () => fetchItemCategories(tenantId),
    enabled: !!tenantId,
    retry: false,
    staleTime: 60_000,
  })
  const categories = toList(categoriesData)

  const { data: itemsData } = useQuery({
    queryKey: ['items', tenantId, 'filter', LIST_INITIAL_PAGE_SIZE],
    queryFn: () => fetchItemsForFilter(tenantId, { per_page: String(LIST_INITIAL_PAGE_SIZE) }),
    enabled: !!tenantId,
    retry: false,
    staleTime: 60_000,
  })
  const itemsList = toList(itemsData)

  const { data: vendorsData } = useQuery({
    queryKey: ['vendors', tenantId, 'filter', 200, branchId],
    queryFn: () =>
      fetchVendors(tenantId, {
        per_page: '200',
        ...(branchId ? { branch_id: branchId } : {}),
      }),
    enabled: !!tenantId,
    retry: false,
    staleTime: 60_000,
  })
  const vendorsList: { id: number; name: string }[] = Array.isArray((vendorsData as { data?: unknown })?.data)
    ? (vendorsData as { data: { id: number; name: string }[] }).data
    : []

  const params = useMemo(() => {
    const p: Record<string, string> = {
      from_date: dateFrom,
      to_date: addOneDay(dateTo),
      per_page: String(perPage),
      page: String(page),
    }
    if (categoryId) p.category_id = categoryId
    if (branchId) p.branch_id = branchId
    if (vendorId) p.vendor_id = vendorId
    if (itemId) p.item_id = itemId
    if (paymentType && paymentType !== 'all') p.payment_type = paymentType
    return p
  }, [dateFrom, dateTo, categoryId, branchId, vendorId, itemId, paymentType, page])

  const { data, isLoading } = useQuery<ItemPurchasesReportResponse>({
    queryKey: ['item-purchases-report', tenantId, params],
    queryFn: () => fetchItemPurchasesReport(tenantId, params),
    enabled: !!tenantId && !!dateFrom && !!dateTo,
  })

  const reportTitle = lang === 'ar' ? 'تقرير مشتريات الأصناف' : 'Item Purchases Report'
  const companyLogo = (data?.company?.logo ?? (settings as Record<string, unknown>)?.company_logo) as string | undefined

  const rows = data?.data ?? []
  const total = data?.total ?? 0
  const currentPage = data?.current_page ?? 1
  const lastPage = data?.last_page ?? 1
  const from = total === 0 ? 0 : (currentPage - 1) * perPage + 1
  const to = Math.min(currentPage * perPage, total)

  const labels = {
    itemCode: lang === 'ar' ? 'كود الصنف' : 'Item Code',
    itemName: lang === 'ar' ? 'اسم الصنف' : 'Item Name',
    category: lang === 'ar' ? 'الفئة' : 'Category',
    baseUnit: lang === 'ar' ? 'الوحدة' : 'Unit',
    qtyPurchased: lang === 'ar' ? 'كمية مشتراة' : 'Qty Purchased',
    qtyReturned: lang === 'ar' ? 'كمية مرتجع' : 'Qty Returned',
    qtyNet: lang === 'ar' ? 'الكمية الصافية' : 'Net Qty',
    amountPurchased: lang === 'ar' ? 'مبلغ المشتريات' : 'Amount Purchased',
    amountReturned: lang === 'ar' ? 'مبلغ المرتجع' : 'Amount Returned',
    discount: lang === 'ar' ? 'الخصم' : 'Discount',
    amountNet: lang === 'ar' ? 'صافي المبلغ (بعد الخصم)' : 'Net Amount (after discount)',
    from: lang === 'ar' ? 'من' : 'From',
    to: lang === 'ar' ? 'إلى' : 'To',
    period: lang === 'ar' ? 'الفترة' : 'Period',
    noData: lang === 'ar' ? 'لا توجد بيانات في الفترة المحددة' : 'No data for the selected period',
    prev: lang === 'ar' ? 'السابق' : 'Previous',
    next: lang === 'ar' ? 'التالي' : 'Next',
    pageOf: (a: number, b: number) => (lang === 'ar' ? `صفحة ${a} من ${b}` : `Page ${a} of ${b}`),
  }

  type ColumnKey =
    | 'code'
    | 'name'
    | 'category'
    | 'unit'
    | 'qtyPurchased'
    | 'qtyReturned'
    | 'qtyNet'
    | 'amountPurchased'
    | 'amountReturned'
    | 'discount'
    | 'amountNet'

  const labelColumns: ColumnKey[] = ['code', 'name', 'category', 'unit']

  const allColumnKeys: ColumnKey[] = [
    'code',
    'name',
    'category',
    'unit',
    'qtyPurchased',
    'qtyReturned',
    'qtyNet',
    'amountPurchased',
    'amountReturned',
    'discount',
    'amountNet',
  ]

  const COLUMN_STORAGE_KEY = 'itemPurchasesReportVisibleColumns'

  const [visibleColumns, setVisibleColumns] = usePersistedColumnVisibility(COLUMN_STORAGE_KEY, allColumnKeys)
  const [showColumnsMenu, setShowColumnsMenu] = useState(false)
  const columnsMenuRef = useRef<HTMLDivElement | null>(null)

  const discountNet = (r: ItemPurchasesReportRow) => Number(r.discount_sold ?? 0) - Number(r.discount_returned ?? 0)
  const amountNetDisplay = (r: ItemPurchasesReportRow) =>
    Number(r.amount_sold ?? 0) - Number(r.amount_returned ?? 0) - discountNet(r)

  const itemPurchasesSortColumns = useMemo(
    () => [
      { key: 'code' as ColumnKey, type: 'string' as const, getValue: (r: ItemPurchasesReportRow) => r.item_code ?? '' },
      { key: 'name' as ColumnKey, type: 'string' as const, getValue: (r: ItemPurchasesReportRow) => r.item_name ?? '' },
      { key: 'category' as ColumnKey, type: 'string' as const, getValue: (r: ItemPurchasesReportRow) => r.category_name ?? '' },
      { key: 'unit' as ColumnKey, type: 'string' as const, getValue: (r: ItemPurchasesReportRow) => r.base_unit_name ?? '' },
      { key: 'qtyPurchased' as ColumnKey, type: 'number' as const, getValue: (r: ItemPurchasesReportRow) => Number(r.quantity_sold_base ?? 0) },
      { key: 'qtyReturned' as ColumnKey, type: 'number' as const, getValue: (r: ItemPurchasesReportRow) => Number(r.quantity_returned_base ?? 0) },
      { key: 'qtyNet' as ColumnKey, type: 'number' as const, getValue: (r: ItemPurchasesReportRow) => Number(r.quantity_net_base ?? 0) },
      { key: 'amountPurchased' as ColumnKey, type: 'number' as const, getValue: (r: ItemPurchasesReportRow) => Number(r.amount_sold ?? 0) },
      { key: 'amountReturned' as ColumnKey, type: 'number' as const, getValue: (r: ItemPurchasesReportRow) => Number(r.amount_returned ?? 0) },
      {
        key: 'discount' as ColumnKey,
        type: 'number' as const,
        getValue: (r: ItemPurchasesReportRow) => Number(r.discount_sold ?? 0) - Number(r.discount_returned ?? 0),
      },
      {
        key: 'amountNet' as ColumnKey,
        type: 'number' as const,
        getValue: (r: ItemPurchasesReportRow) => {
          const disc = Number(r.discount_sold ?? 0) - Number(r.discount_returned ?? 0)
          return Number(r.amount_sold ?? 0) - Number(r.amount_returned ?? 0) - disc
        },
      },
    ],
    [],
  )
  const { sort, toggleSort, sortedRows } = useClientSort<ItemPurchasesReportRow, ColumnKey>(rows, itemPurchasesSortColumns, { locale })

  const totals = useMemo(() => {
    if (rows.length === 0) return null
    return {
      quantitySold: rows.reduce((s, r) => s + Number(r.quantity_sold_base ?? 0), 0),
      quantityReturned: rows.reduce((s, r) => s + Number(r.quantity_returned_base ?? 0), 0),
      amountSold: rows.reduce((s, r) => s + Number(r.amount_sold ?? 0), 0),
      amountReturned: rows.reduce((s, r) => s + Number(r.amount_returned ?? 0), 0),
      discount: rows.reduce((s, r) => s + discountNet(r), 0),
      amountNet: rows.reduce((s, r) => s + amountNetDisplay(r), 0),
    }
  }, [rows])

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

  function buildPrintContent() {
    const visibleKeys = allColumnKeys.filter((k) => visibleColumns[k])
    const theadCells = visibleKeys
      .map((key) => {
        const isNumeric =
          key === 'qtyPurchased' ||
          key === 'qtyReturned' ||
          key === 'qtyNet' ||
          key === 'amountPurchased' ||
          key === 'amountReturned' ||
          key === 'discount' ||
          key === 'amountNet'
        const label =
          key === 'code'
            ? labels.itemCode
            : key === 'name'
              ? labels.itemName
              : key === 'category'
                ? labels.category
                : key === 'unit'
                  ? labels.baseUnit
                  : key === 'qtyPurchased'
                    ? labels.qtyPurchased
                    : key === 'qtyReturned'
                      ? labels.qtyReturned
                      : key === 'qtyNet'
                        ? labels.qtyNet
                        : key === 'amountPurchased'
                          ? labels.amountPurchased
                          : key === 'amountReturned'
                            ? labels.amountReturned
                            : key === 'discount'
                              ? labels.discount
                              : key === 'amountNet'
                                ? labels.amountNet
                                : labels.amountNet
        return `<th${isNumeric ? ' class="num"' : ''}>${label}</th>`
      })
      .join('')
    const thead = `<thead><tr>${theadCells}</tr></thead>`

    const tbody = sortedRows
      .map((r: ItemPurchasesReportRow) => {
        const cells = visibleKeys
          .map((key) => {
            if (key === 'code') return `<td>${r.item_code ?? ''}</td>`
            if (key === 'name') return `<td>${r.item_name ?? ''}</td>`
            if (key === 'category') return `<td>${r.category_name ?? '—'}</td>`
            if (key === 'unit') return `<td>${r.base_unit_name ?? '—'}</td>`
            if (key === 'qtyPurchased') return `<td class="num">${fmtQty(Number(r.quantity_sold_base))}</td>`
            if (key === 'qtyReturned') return `<td class="num">${fmtQty(Number(r.quantity_returned_base))}</td>`
            if (key === 'qtyNet') return `<td class="num">${fmtQty(Number(r.quantity_net_base))}</td>`
            if (key === 'amountPurchased') return `<td class="num">${fmt(Number(r.amount_sold))}</td>`
            if (key === 'amountReturned') return `<td class="num">${fmt(Number(r.amount_returned))}</td>`
            if (key === 'discount') return `<td class="num">${fmt(discountNet(r))}</td>`
            if (key === 'amountNet') return `<td class="num">${fmt(amountNetDisplay(r))}</td>`
            return `<td></td>`
          })
          .join('')
        return `<tr>${cells}</tr>`
      })
      .join('')
    const printTotals = rows.length
      ? {
          quantitySold: rows.reduce((s, r) => s + Number(r.quantity_sold_base ?? 0), 0),
          amountSold: rows.reduce((s, r) => s + Number(r.amount_sold ?? 0), 0),
          amountReturned: rows.reduce((s, r) => s + Number(r.amount_returned ?? 0), 0),
          discount: rows.reduce((s, r) => s + discountNet(r), 0),
          amountNet: rows.reduce((s, r) => s + amountNetDisplay(r), 0),
        }
      : null
    const hasLabelCols = labelColumns.some((k) => visibleColumns[k])
    const tfoot = printTotals && hasLabelCols
      ? (() => {
          const visibleLabelCount = labelColumns.filter((k) => visibleColumns[k]).length
          const restKeys = visibleKeys.filter((k) => !labelColumns.includes(k))
          const cells: string[] = []
          cells.push(
            `<td colspan="${visibleLabelCount}" style="text-align:${isRtl ? 'right' : 'left'};padding:10px 8px;">${
              lang === 'ar' ? 'الإجمالي' : 'Total'
            }</td>`,
          )
          restKeys.forEach((key) => {
            if (key === 'qtyPurchased') {
              cells.push(`<td class="num">${fmtQty(printTotals.quantitySold)}</td>`)
            } else if (key === 'amountPurchased') {
              cells.push(`<td class="num">${fmt(printTotals.amountSold)}</td>`)
            } else if (key === 'amountReturned') {
              cells.push(`<td class="num">${fmt(printTotals.amountReturned)}</td>`)
            } else if (key === 'discount') {
              cells.push(`<td class="num">${fmt(printTotals.discount)}</td>`)
            } else if (key === 'amountNet') {
              cells.push(`<td class="num">${fmt(printTotals.amountNet)}</td>`)
            } else {
              cells.push('<td></td>')
            }
          })
          return `<tfoot><tr style="background:#e2e8f0;font-weight:400;border-top:2px solid #94a3b8;">${cells.join(
            '',
          )}</tr></tfoot>`
        })()
      : ''
    return `
      <table class="report-table">
        ${thead}
        <tbody>${tbody}</tbody>
        ${tfoot}
      </table>`
  }

  function handlePrint() {
    if (!data) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <!DOCTYPE html><html dir="${isRtl ? 'rtl' : 'ltr'}"><head>
        <meta charset="utf-8"><title>${reportTitle}</title>
        <style>
          body{font-family:Arial,sans-serif;padding:24px;max-width:100%;}
          table{width:100%;border-collapse:collapse;margin-top:16px;font-size:12px;}
          th,td{border:1px solid #ddd;padding:8px;}
          th{background:#f1f5f9;}
          .num{text-align:right;font-variant-numeric:tabular-nums;}
          .header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;}
          .logo{max-height:56px;}
        </style>
      </head><body>
        <div class="header">
          ${companyLogo ? `<img src="${companyLogo}" alt="Logo" class="logo" />` : ''}
          <div>
            <h2 style="margin:0;">${reportTitle}</h2>
            <p style="margin:8px 0 0;color:#64748b;">${labels.period}: ${dateFrom} — ${dateTo}</p>
            <p style="margin:4px 0 0;font-size:12px;">${data.company?.name ?? ''}</p>
          </div>
        </div>
        ${buildPrintContent()}
        <p style="margin-top:16px;font-size:11px;color:#64748b;">${labels.pageOf(currentPage, lastPage)} • ${labels.from} ${from} ${labels.to} ${to} (${total} ${lang === 'ar' ? 'صنف' : 'items'})</p>
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
    const visibleKeys = allColumnKeys.filter((k) => visibleColumns[k])

    const headers = visibleKeys.map((key) =>
      key === 'code'
        ? labels.itemCode
        : key === 'name'
          ? labels.itemName
          : key === 'category'
            ? labels.category
            : key === 'unit'
              ? labels.baseUnit
              : key === 'qtyPurchased'
                ? labels.qtyPurchased
                : key === 'qtyReturned'
                  ? labels.qtyReturned
                  : key === 'qtyNet'
                    ? labels.qtyNet
                    : key === 'amountPurchased'
                      ? labels.amountPurchased
                      : key === 'amountReturned'
                        ? labels.amountReturned
                        : key === 'discount'
                          ? labels.discount
                          : key === 'amountNet'
                            ? labels.amountNet
                            : labels.amountNet,
    )

    const lines = [headers.join(',')]
    sortedRows.forEach((r: ItemPurchasesReportRow) => {
      const values = visibleKeys.map((key) => {
        if (key === 'code') return `"${(r.item_code ?? '').replace(/"/g, '""')}"`
        if (key === 'name') return `"${(r.item_name ?? '').replace(/"/g, '""')}"`
        if (key === 'category') return `"${(r.category_name ?? '').replace(/"/g, '""')}"`
        if (key === 'unit') return `"${(r.base_unit_name ?? '').replace(/"/g, '""')}"`
        if (key === 'qtyPurchased') return String(r.quantity_sold_base)
        if (key === 'qtyReturned') return String(r.quantity_returned_base)
        if (key === 'qtyNet') return String(r.quantity_net_base)
        if (key === 'amountPurchased') return String(r.amount_sold)
        if (key === 'amountReturned') return String(r.amount_returned)
        if (key === 'discount') return String(discountNet(r))
        if (key === 'amountNet') return String(amountNetDisplay(r))
        return ''
      })
      lines.push(values.join(','))
    })
    if (totals) {
      const totalValues = visibleKeys.map((key) => {
        if (key === 'code') return ''
        if (key === 'name') return lang === 'ar' ? 'الإجمالي' : 'Total'
        if (key === 'category') return ''
        if (key === 'unit') return ''
        if (key === 'qtyPurchased') return String(totals.quantitySold)
        if (key === 'qtyReturned') return String(totals.quantityReturned)
        if (key === 'qtyNet') return ''
        if (key === 'amountPurchased') return String(totals.amountSold)
        if (key === 'amountReturned') return String(totals.amountReturned)
        if (key === 'discount') return String(totals.discount)
        if (key === 'amountNet') return String(totals.amountNet)
        return ''
      })
      lines.push(totalValues.join(','))
    }
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `item-purchases-report-${dateFrom}-${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const textAlign = isRtl ? 'text-right' : 'text-left'
  const visibleColumnKeys = allColumnKeys.filter((k) => visibleColumns[k])
  const noDataColSpan = visibleColumnKeys.length || 1
  const hasLabelColumns = labelColumns.some((k) => visibleColumns[k])
  const totalsLabelColSpan = labelColumns.filter((k) => visibleColumns[k]).length || 1

  const allLabel = lang === 'ar' ? 'الكل' : 'All'
  const categoryOptions: SearchableSelectOption[] = useMemo(() => {
    const list = Array.isArray(categories) ? categories : []
    return [
      { value: 0, label: allLabel },
      ...list.map((c) => ({
        value: c.id,
        label: lang === 'ar' ? c.name : (c as { name_en?: string }).name_en || c.name,
      })),
    ]
  }, [categories, lang, allLabel])
  const branchOptions: SearchableSelectOption[] = useMemo(() => {
    const list = Array.isArray(branches) ? branches : []
    return [
      { value: 0, label: allLabel },
      ...list.map((b) => ({ value: b.id, label: b.name })),
    ]
  }, [branches, allLabel])
  const itemOptions: SearchableSelectOption[] = useMemo(() => {
    const list = Array.isArray(itemsList) ? itemsList : []
    return [
      { value: 0, label: allLabel },
      ...list.map((i) => ({
        value: i.id,
        label: i.code ? `${i.code} - ${i.name}` : i.name,
      })),
    ]
  }, [itemsList, lang, allLabel])

  const vendorOptions: SearchableSelectOption[] = useMemo(() => {
    return [
      { value: 0, label: allLabel },
      ...vendorsList.map((v) => ({ value: v.id, label: v.name })),
    ]
  }, [vendorsList, allLabel])

  const paymentOptions: SearchableSelectOption[] = useMemo(() => [
    { value: 'all', label: allLabel },
    { value: 'cash', label: lang === 'ar' ? 'كاش' : 'Cash' },
    { value: 'credit', label: lang === 'ar' ? 'آجل' : 'Credit' },
  ], [allLabel, lang])

  const periodOptions: { value: ReportPeriodKey | 'custom'; labelAr: string; labelEn: string }[] = [
    { value: 'custom', labelAr: 'تاريخ مخصص', labelEn: 'Custom Date' },
    { value: 'all', labelAr: 'الكل', labelEn: 'All' },
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
    if (preset !== 'custom') {
      const range = getReportPeriodRange(preset)
      setDateFrom(range.from_date)
      setDateTo(range.to_date)
    }
    setPage(1)
  }

  function onDateFromChange(value: string) {
    setDateFrom(value)
    setPage(1)
  }

  function onDateToChange(value: string) {
    setDateTo(value)
    setPage(1)
  }

  const showCustomDateFields = periodPreset === 'custom'

  const labelFrom = lang === 'ar' ? 'من تاريخ' : 'From date'
  const labelTo = lang === 'ar' ? 'إلى تاريخ' : 'To date'
  const labelPeriod = lang === 'ar' ? 'الفترة' : 'Period'

  return (
    <div className="py-3 px-2 space-y-4">
      {/* شريط علوي مضغوط: العنوان، الفترة، أزرار التصدير */}
      <div className="bg-white rounded-xl border border-slate-200 py-2 px-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-lg font-semibold text-slate-900 shrink-0 leading-tight">{reportTitle}</h1>

          {/* فلتر الفترة في منتصف الشريط */}
          <div className="flex-1 flex justify-center">
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-slate-600 shrink-0">{labelPeriod}</span>
                <select
                  value={periodPreset}
                  onChange={(e) => applyPeriodPreset((e.target.value as ReportPeriodKey | 'custom') || 'all')}
                  className="h-8 border border-slate-300 rounded-lg px-2.5 text-xs min-w-[140px] bg-white focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none shrink-0"
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
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-slate-600 whitespace-nowrap">{labelFrom}</span>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => onDateFromChange(e.target.value)}
                      className="h-8 border border-slate-300 rounded-lg px-2 text-xs bg-white w-[132px] focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                      title={labelFrom}
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-slate-600 whitespace-nowrap">{labelTo}</span>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => onDateToChange(e.target.value)}
                      className="h-8 border border-slate-300 rounded-lg px-2 text-xs bg-white w-[132px] focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                      title={labelTo}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* أزرار التصدير — قائمة الأعمدة بـ end-0 لتتمدد للداخل في RTL ولليسار في LTR */}
          <div className="flex items-center gap-1 no-print shrink-0" ref={columnsMenuRef}>
              <div className="relative shrink-0 z-[120]">
                <button
                  type="button"
                  onClick={() => setShowColumnsMenu((v) => !v)}
                  aria-expanded={showColumnsMenu}
                  aria-haspopup="true"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 border border-slate-300 text-slate-600 hover:bg-slate-50"
                  title={lang === 'ar' ? 'تخصيص الأعمدة' : 'Customize columns'}
                >
                  <Columns3 size={15} />
                </button>
                {showColumnsMenu && (
                  <div
                    className="absolute top-full end-0 mt-2 z-[130] w-64 rounded-lg border border-slate-200 bg-white shadow-lg py-2 text-sm ring-1 ring-slate-200/80"
                    role="menu"
                    aria-label={lang === 'ar' ? 'إظهار/إخفاء الأعمدة' : 'Show / hide columns'}
                  >
                  <div className="px-3 pb-2 text-xs font-semibold text-slate-500">
                    {lang === 'ar' ? 'إظهار/إخفاء الأعمدة' : 'Show / hide columns'}
                  </div>
                  {allColumnKeys.map((key) => {
                    const label =
                      key === 'code'
                        ? labels.itemCode
                        : key === 'name'
                          ? labels.itemName
                          : key === 'category'
                            ? labels.category
                            : key === 'unit'
                              ? labels.baseUnit
                              : key === 'qtyPurchased'
                                ? labels.qtyPurchased
                                : key === 'qtyReturned'
                                  ? labels.qtyReturned
                                  : key === 'qtyNet'
                                    ? labels.qtyNet
                                    : key === 'amountPurchased'
                                      ? labels.amountPurchased
                                      : key === 'amountReturned'
                                        ? labels.amountReturned
                                        : key === 'discount'
                                          ? labels.discount
                                          : key === 'amountNet'
                                            ? labels.amountNet
                                            : labels.amountNet
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
              <button
                type="button"
                onClick={handleExportExcel}
                disabled={!data || rows.length === 0}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
                title={t.payments.exportExcel}
              >
                <FileSpreadsheet size={15} />
              </button>
              <button
                type="button"
                onClick={handlePrint}
                disabled={!data}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-50"
                title={t.payments.exportPdf}
              >
                <FileText size={15} />
              </button>
              <button
                type="button"
                onClick={handlePrint}
                disabled={!data}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                title={t.payments.printReport}
              >
                <Printer size={15} />
              </button>
          </div>
        </div>
      </div>

      {/* Filters: بدون تسميات فوق الحقول؛ placeholder + aria-label للوصولية */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-start gap-3 overflow-visible">
        <div className="flex-1 min-w-[180px] basis-0 overflow-visible">
          <SearchableSelect
            options={categoryOptions}
            value={categoryId === '' ? null : (Number(categoryId) || null)}
            onChange={(v) => { setCategoryId(v === 0 || v === null ? '' : String(v)); setPage(1) }}
            placeholder={lang === 'ar' ? 'اختر الفئة' : 'Select category'}
            aria-label={labels.category}
            textAlign={isRtl ? 'right' : 'left'}
            wrapOptions
            className="w-full"
          />
        </div>
        <div className="flex-1 min-w-[180px] basis-0 overflow-visible">
          <SearchableSelect
            options={itemOptions}
            value={itemId === '' ? null : (Number(itemId) || null)}
            onChange={(v) => { setItemId(v === 0 || v === null ? '' : String(v)); setPage(1) }}
            placeholder={lang === 'ar' ? 'اختر الصنف' : 'Select item'}
            aria-label={lang === 'ar' ? 'الصنف' : 'Item'}
            textAlign={isRtl ? 'right' : 'left'}
            wrapOptions
            className="w-full"
          />
        </div>
        <div className="flex-1 min-w-[180px] basis-0 overflow-visible">
          <SearchableSelect
            options={branchOptions}
            value={branchId === '' ? null : (Number(branchId) || null)}
            onChange={(v) => { setBranchId(v === 0 || v === null ? '' : String(v)); setPage(1) }}
            placeholder={lang === 'ar' ? 'اختر الفرع' : 'Select branch'}
            aria-label={t.journal?.branch ?? (lang === 'ar' ? 'الفرع' : 'Branch')}
            textAlign={isRtl ? 'right' : 'left'}
            className="w-full"
          />
        </div>
        <div className="flex-1 min-w-[180px] basis-0 overflow-visible">
          <SearchableSelect
            options={vendorOptions}
            value={vendorId === '' ? null : (Number(vendorId) || null)}
            onChange={(v) => { setVendorId(v === 0 || v === null ? '' : String(v)); setPage(1) }}
            placeholder={lang === 'ar' ? 'اختر المورد' : 'Select vendor'}
            aria-label={lang === 'ar' ? 'المورد' : 'Vendor'}
            textAlign={isRtl ? 'right' : 'left'}
            wrapOptions
            className="w-full"
          />
        </div>
        <div className="flex-1 min-w-[180px] basis-0 overflow-visible">
          <SearchableSelect
            options={paymentOptions}
            value={paymentType === 'all' ? null : paymentType}
            onChange={(v) => { setPaymentType((v === null || v === 'all') ? 'all' : (v as 'cash' | 'credit')); setPage(1) }}
            placeholder={lang === 'ar' ? 'اختر طريقة الدفع' : 'Select payment method'}
            aria-label={lang === 'ar' ? 'طريقة الدفع' : 'Payment method'}
            textAlign={isRtl ? 'right' : 'left'}
            className="w-full"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center items-center h-48">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-500 border-t-transparent" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm table-fixed">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    {visibleColumns.code && (
                      <SortableTh
                        label={labels.itemCode}
                        sortKey="code"
                        sortState={sort}
                        onToggle={toggleSort}
                        truncateLabel={false}
                        widthClassName="min-w-[90px]"
                        className={`${textAlign} p-0 font-medium text-slate-600`}
                      />
                    )}
                    {visibleColumns.name && (
                      <SortableTh
                        label={labels.itemName}
                        sortKey="name"
                        sortState={sort}
                        onToggle={toggleSort}
                        truncateLabel={false}
                        widthClassName="min-w-[180px]"
                        className={`${textAlign} p-0 font-medium text-slate-600`}
                      />
                    )}
                    {visibleColumns.category && (
                      <SortableTh
                        label={labels.category}
                        sortKey="category"
                        sortState={sort}
                        onToggle={toggleSort}
                        truncateLabel={false}
                        widthClassName="min-w-[140px]"
                        className={`${textAlign} p-0 font-medium text-slate-600`}
                      />
                    )}
                    {visibleColumns.unit && (
                      <SortableTh
                        label={labels.baseUnit}
                        sortKey="unit"
                        sortState={sort}
                        onToggle={toggleSort}
                        truncateLabel={false}
                        widthClassName="min-w-[70px]"
                        className={`${textAlign} p-0 font-medium text-slate-600`}
                      />
                    )}
                    {visibleColumns.qtyPurchased && (
                      <SortableTh
                        label={labels.qtyPurchased}
                        sortKey="qtyPurchased"
                        sortState={sort}
                        onToggle={toggleSort}
                        truncateLabel={false}
                        widthClassName="min-w-[80px]"
                        className="text-right p-0 font-medium tabular-nums text-slate-600"
                      />
                    )}
                    {visibleColumns.qtyReturned && (
                      <SortableTh
                        label={labels.qtyReturned}
                        sortKey="qtyReturned"
                        sortState={sort}
                        onToggle={toggleSort}
                        truncateLabel={false}
                        widthClassName="min-w-[80px]"
                        className="text-right p-0 font-medium tabular-nums text-slate-600"
                      />
                    )}
                    {visibleColumns.qtyNet && (
                      <SortableTh
                        label={labels.qtyNet}
                        sortKey="qtyNet"
                        sortState={sort}
                        onToggle={toggleSort}
                        truncateLabel={false}
                        widthClassName="min-w-[80px]"
                        className="text-right p-0 font-medium tabular-nums text-slate-600"
                      />
                    )}
                    {visibleColumns.amountPurchased && (
                      <SortableTh
                        label={labels.amountPurchased}
                        sortKey="amountPurchased"
                        sortState={sort}
                        onToggle={toggleSort}
                        truncateLabel={false}
                        widthClassName="min-w-[100px]"
                        className="text-right p-0 font-medium tabular-nums text-slate-600"
                      />
                    )}
                    {visibleColumns.amountReturned && (
                      <SortableTh
                        label={labels.amountReturned}
                        sortKey="amountReturned"
                        sortState={sort}
                        onToggle={toggleSort}
                        truncateLabel={false}
                        widthClassName="min-w-[100px]"
                        className="text-right p-0 font-medium tabular-nums text-slate-600"
                      />
                    )}
                    {visibleColumns.discount && (
                      <SortableTh
                        label={labels.discount}
                        sortKey="discount"
                        sortState={sort}
                        onToggle={toggleSort}
                        truncateLabel={false}
                        widthClassName="min-w-[90px]"
                        className="text-right p-0 font-medium tabular-nums text-slate-600"
                      />
                    )}
                    {visibleColumns.amountNet && (
                      <SortableTh
                        label={labels.amountNet}
                        sortKey="amountNet"
                        sortState={sort}
                        onToggle={toggleSort}
                        truncateLabel={false}
                        widthClassName="min-w-[110px]"
                        className="text-right p-0 font-medium tabular-nums text-slate-600"
                      />
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {sortedRows.length === 0 ? (
                    <tr>
                      <td colSpan={noDataColSpan} className="text-center py-12 text-slate-400">
                        {labels.noData}
                      </td>
                    </tr>
                  ) : (
                    sortedRows.map((r: ItemPurchasesReportRow) => (
                      <tr key={r.item_id} className="hover:bg-slate-50/50">
                        {visibleColumns.code && (
                          <td className={`${textAlign} px-3 py-1.5 font-mono text-slate-700 text-sm`}>
                            <Link
                              to={`/items/${r.item_id}/ledger`}
                              className="text-primary-600 hover:underline"
                            >
                              {r.item_code ?? '—'}
                            </Link>
                          </td>
                        )}
                        {visibleColumns.name && (
                          <td className={`${textAlign} px-3 py-1.5 text-slate-800 text-sm`}>{r.item_name ?? '—'}</td>
                        )}
                        {visibleColumns.category && (
                          <td className={`${textAlign} px-3 py-1.5 text-slate-600 text-sm`}>{r.category_name ?? '—'}</td>
                        )}
                        {visibleColumns.unit && (
                          <td className={`${textAlign} px-3 py-1.5 text-slate-600 text-sm`}>{r.base_unit_name ?? '—'}</td>
                        )}
                        {visibleColumns.qtyPurchased && (
                          <td className="text-right px-3 py-1.5 tabular-nums text-sm">{fmtQty(Number(r.quantity_sold_base))}</td>
                        )}
                        {visibleColumns.qtyReturned && (
                          <td className="text-right px-3 py-1.5 tabular-nums text-sm">
                            <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-sm font-medium text-amber-800">
                              {fmtQty(Number(r.quantity_returned_base))}
                            </span>
                          </td>
                        )}
                        {visibleColumns.qtyNet && (
                          <td className="text-right px-3 py-1.5 tabular-nums font-medium text-sm">
                            {fmtQty(Number(r.quantity_net_base))}
                          </td>
                        )}
                        {visibleColumns.amountPurchased && (
                          <td className="text-right px-3 py-1.5 tabular-nums text-sm">{fmt(Number(r.amount_sold))}</td>
                        )}
                        {visibleColumns.amountReturned && (
                          <td className="text-right px-3 py-1.5 tabular-nums text-amber-700 text-sm">
                            {fmt(Number(r.amount_returned))}
                          </td>
                        )}
                        {visibleColumns.discount && (
                          <td className="text-right px-3 py-1.5 tabular-nums text-slate-600 text-sm">
                            {fmt(discountNet(r))}
                          </td>
                        )}
                        {visibleColumns.amountNet && (
                          <td className="text-right px-3 py-1.5 tabular-nums text-sm">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-semibold ${
                                amountNetDisplay(r) >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {fmt(amountNetDisplay(r))}
                            </span>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
                {totals && hasLabelColumns && (
                  <tfoot>
                    <tr className="bg-gradient-to-r from-slate-100 to-slate-50 border-t-2 border-slate-400 font-bold text-slate-900 shadow-[0_-2px_4px_rgba(0,0,0,0.04)]">
                      <td colSpan={totalsLabelColSpan} className={`${textAlign} px-3 py-3 text-base`}>
                        {lang === 'ar' ? 'الإجمالي' : 'Total'}
                      </td>
                      {visibleColumns.qtyPurchased && (
                        <td className="text-right px-3 py-3 tabular-nums">{fmtQty(totals.quantitySold)}</td>
                      )}
                      {visibleColumns.qtyReturned && (
                        <td className="text-right px-3 py-3 tabular-nums">{fmtQty(totals.quantityReturned)}</td>
                      )}
                      {visibleColumns.qtyNet && <td className="text-right px-3 py-3 tabular-nums" />}
                      {visibleColumns.amountPurchased && (
                        <td className="text-right px-3 py-3 tabular-nums">{fmt(totals.amountSold)}</td>
                      )}
                      {visibleColumns.amountReturned && (
                        <td className="text-right px-3 py-3 tabular-nums text-amber-700">
                          {fmt(totals.amountReturned)}
                        </td>
                      )}
                      {visibleColumns.discount && (
                        <td className="text-right px-3 py-3 tabular-nums text-slate-700">{fmt(totals.discount)}</td>
                      )}
                      {visibleColumns.amountNet && (
                        <td
                          className={`text-right px-3 py-3 tabular-nums ${
                            totals.amountNet >= 0 ? 'text-emerald-800' : 'text-red-700'
                          }`}
                        >
                          {fmt(totals.amountNet)}
                        </td>
                      )}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <ReportFooter
              totals={[]}
              currentPage={currentPage}
              lastPage={lastPage}
              onPageChange={setPage}
              lang={lang as 'ar' | 'en'}
              isRtl={isRtl}
              alwaysShowPaginationBar={true}
              showRecordSummary={false}
            />
          </>
        )}
      </div>

    </div>
  )
}
