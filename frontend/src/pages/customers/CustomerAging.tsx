import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchCustomerAging, fetchBranches, fetchSettings, fetchCustomers, fetchTenantUsers, fetchCostCenters } from '../../api/tenant'
import type {
  Branch,
  CostCenter,
  TenantSettings,
  CustomerAgingRow,
  CustomerAgingInvoiceDetail,
  CustomerAgingBucketDetailKey,
} from '../../types'
import { formatAmount } from '../../utils/currency'
import { asArray } from '../../utils/asArray'
import { getDefaultDateRange, getReportPeriodRange, type ReportPeriodKey } from '../../utils/date'
import { Columns3, FileSpreadsheet, FileText, Printer, X } from 'lucide-react'
import { useDocumentTitleContext } from '../../contexts/DocumentTitleContext'
import { usePersistedColumnVisibility } from '../../hooks/usePersistedColumnVisibility'
import { useClientSort } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'
import PageSizeSelect from '../../components/ui/PageSizeSelect'
import ReportFooter from '../../components/ui/ReportFooter'
import {
  filterPeriodBarDateInputClass,
  filterPeriodBarSelectClass,
  filterReportSelectNineClass,
} from '../../utils/filterControlStyles'

const AGING_COLUMN_KEYS = [
  'account',
  'customer',
  'branch',
  'sales_rep',
  'not_yet_due',
  'days_1_30',
  'days_31_60',
  'days_61_90',
  'over_90',
  'total',
] as const
type AgingColumnKey = (typeof AGING_COLUMN_KEYS)[number]

const AGING_COLUMNS_STORAGE = 'customer-aging-column-visibility'

const TEXT_COL_KEYS: AgingColumnKey[] = ['account', 'customer', 'branch', 'sales_rep']
const TEXT_KEY_SET = new Set<AgingColumnKey>(TEXT_COL_KEYS)

const DETAIL_BUCKET_KEYS: CustomerAgingBucketDetailKey[] = [
  'not_yet_due',
  'days_1_30',
  'days_31_60',
  'days_61_90',
  'over_90',
]

const OVERDUE_AMOUNT_KEYS = new Set<AgingColumnKey>(['days_1_30', 'days_31_60', 'days_61_90', 'over_90'])

const agingPeriodOptions: { value: ReportPeriodKey | 'custom'; labelAr: string; labelEn: string }[] = [
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

function detailLinesForCell(row: CustomerAgingRow, key: AgingColumnKey): CustomerAgingInvoiceDetail[] {
  if (!row.details) return []
  if (key === 'total') {
    return DETAIL_BUCKET_KEYS.flatMap((k) => row.details![k] ?? [])
  }
  if (DETAIL_BUCKET_KEYS.includes(key as CustomerAgingBucketDetailKey)) {
    return row.details[key as CustomerAgingBucketDetailKey] ?? []
  }
  return []
}

export default function CustomerAging() {
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
  const textAlign = isRtl ? 'text-right' : 'text-left'
  const numAlign = 'text-right'

  const defaultRange = useMemo(() => getDefaultDateRange(), [])
  const [dateFrom, setDateFrom] = useState(defaultRange.dateFrom)
  const [dateTo, setDateTo] = useState(defaultRange.dateTo)
  const [periodPreset, setPeriodPreset] = useState<ReportPeriodKey | 'custom'>('all')
  const [customerId, setCustomerId] = useState<number | ''>('')
  const [branchId, setBranchId] = useState<number | ''>('')
  const [costCenterId, setCostCenterId] = useState<number | ''>('')
  const [salesRepId, setSalesRepId] = useState<number | ''>('')
  const [perPage, setPerPage] = useState(25)
  const [page, setPage] = useState(1)
  const [showColumnsMenu, setShowColumnsMenu] = useState(false)
  const columnsMenuRef = useRef<HTMLDivElement>(null)
  const [agingModal, setAgingModal] = useState<{ title: string; lines: CustomerAgingInvoiceDetail[] } | null>(null)
  const [visibleColumns, setVisibleColumns] = usePersistedColumnVisibility<AgingColumnKey>(
    AGING_COLUMNS_STORAGE,
    AGING_COLUMN_KEYS,
  )

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (columnsMenuRef.current && !columnsMenuRef.current.contains(e.target as Node)) {
        setShowColumnsMenu(false)
      }
    }
    if (showColumnsMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showColumnsMenu])

  function toggleAgingColumn(key: AgingColumnKey) {
    setVisibleColumns((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      const count = AGING_COLUMN_KEYS.filter((k) => next[k]).length
      if (count === 0) return prev
      if (!TEXT_COL_KEYS.some((k) => next[k])) return prev
      return next
    })
  }

  function applyPeriodPreset(preset: ReportPeriodKey | 'custom') {
    setPeriodPreset(preset)
    if (preset !== 'custom') {
      const range = getReportPeriodRange(preset)
      setDateFrom(range.from_date)
      setDateTo(range.to_date)
    }
  }

  function onInvoiceDateFromChange(value: string) {
    setDateFrom(value)
  }

  function onInvoiceDateToChange(value: string) {
    setDateTo(value)
  }

  useEffect(() => {
    setPageTitle(lang === 'ar' ? 'أعمار ديون العملاء' : 'Customer Aging Report')
    return () => setPageTitle(null)
  }, [lang, setPageTitle])

  useEffect(() => {
    if (!agingModal) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAgingModal(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [agingModal])

  const params = useMemo(() => {
    const p: {
      as_of_date?: string
      invoice_date_from?: string
      invoice_date_to?: string
      customer_id?: number
      branch_id?: number
      cost_center_id?: number
      created_by?: number
    } = {
      as_of_date: dateTo,
      invoice_date_from: dateFrom,
      invoice_date_to: dateTo,
    }
    if (customerId) p.customer_id = Number(customerId)
    if (branchId) p.branch_id = Number(branchId)
    if (costCenterId) p.cost_center_id = Number(costCenterId)
    if (salesRepId) p.created_by = Number(salesRepId)
    return p
  }, [dateFrom, dateTo, customerId, branchId, costCenterId, salesRepId])

  useEffect(() => {
    setPage(1)
  }, [dateFrom, dateTo, customerId, branchId, costCenterId, salesRepId])

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

  const { data: customersResp } = useQuery({
    queryKey: ['customers', tenantId, 'list'],
    queryFn: () => fetchCustomers(tenantId, { per_page: '500' }),
    enabled: !!tenantId,
  })
  const customers = customersResp?.data ?? []

  const { data: usersResp } = useQuery({
    queryKey: ['tenant-users', tenantId],
    queryFn: () => fetchTenantUsers(tenantId),
    enabled: !!tenantId,
  })
  const salesReps = usersResp?.data ?? []

  const { data, isLoading } = useQuery({
    queryKey: ['customerAging', tenantId, params],
    queryFn: () => fetchCustomerAging(tenantId, params),
    enabled: !!tenantId,
  })

  const rows: CustomerAgingRow[] = data?.data ?? []

  const agingSortColumns = useMemo(
    () =>
      AGING_COLUMN_KEYS.map((key) => {
        const isText = TEXT_KEY_SET.has(key)
        return {
          key,
          type: (isText ? 'string' : 'number') as 'string' | 'number',
          getValue: (r: CustomerAgingRow) => agingCellRaw(r, key),
        }
      }),
    // agingCellRaw depends on lang (and row shape). Rebuild on lang changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang],
  )
  const { sort, toggleSort, sortedRows } = useClientSort<CustomerAgingRow, AgingColumnKey>(rows, agingSortColumns, { locale })

  const lastPage = Math.max(1, Math.ceil(sortedRows.length / perPage) || 1)
  const effectivePage = Math.min(Math.max(1, page), lastPage)

  useEffect(() => {
    setPage((p) => (p > lastPage ? lastPage : p))
  }, [lastPage])

  const pagedRows = useMemo(() => {
    const start = (effectivePage - 1) * perPage
    return sortedRows.slice(start, start + perPage)
  }, [sortedRows, effectivePage, perPage])

  const totals = useMemo(() => {
    let not_yet_due = 0
    let days_1_30 = 0
    let days_31_60 = 0
    let days_61_90 = 0
    let over_90 = 0
    let total = 0
    rows.forEach((r) => {
      not_yet_due += r.not_yet_due
      days_1_30 += r.days_1_30
      days_31_60 += r.days_31_60
      days_61_90 += r.days_61_90
      over_90 += r.over_90
      total += r.total
    })
    return { not_yet_due, days_1_30, days_31_60, days_61_90, over_90, total }
  }, [rows])

  function agingColumnLabel(key: AgingColumnKey): string {
    switch (key) {
      case 'account':
        return lang === 'ar' ? 'رقم الحساب' : 'Account'
      case 'customer':
        return lang === 'ar' ? 'اسم العميل' : 'Customer'
      case 'branch':
        return lang === 'ar' ? 'الفرع' : 'Branch'
      case 'sales_rep':
        return lang === 'ar' ? 'مندوب المبيعات' : 'Sales rep'
      case 'not_yet_due':
        return lang === 'ar' ? 'غير مستحق بعد' : 'Not yet due'
      case 'days_1_30':
        return lang === 'ar' ? 'من 1 إلى 30 يوم' : '1-30 days'
      case 'days_31_60':
        return lang === 'ar' ? 'من 31 إلى 60 يوم' : '31-60 days'
      case 'days_61_90':
        return lang === 'ar' ? 'من 61 إلى 90 يوم' : '61-90 days'
      case 'over_90':
        return lang === 'ar' ? 'أكثر من 90 يوم' : 'Over 90 days'
      case 'total':
        return lang === 'ar' ? 'الإجمالي' : 'Total'
    }
  }

  function agingCellRaw(r: CustomerAgingRow, key: AgingColumnKey): string | number {
    const name = lang === 'ar' ? r.customer_name : (r.customer_name_en || r.customer_name)
    const branch = lang === 'ar' ? r.branch_name : (r.branch_name_en || r.branch_name)
    switch (key) {
      case 'account':
        return r.account_code
      case 'customer':
        return name ?? ''
      case 'branch':
        return branch ?? ''
      case 'sales_rep':
        return r.sales_rep_name ?? ''
      case 'not_yet_due':
        return r.not_yet_due
      case 'days_1_30':
        return r.days_1_30
      case 'days_31_60':
        return r.days_31_60
      case 'days_61_90':
        return r.days_61_90
      case 'over_90':
        return r.over_90
      case 'total':
        return r.total
    }
  }

  function agingTotalForKey(key: AgingColumnKey): number {
    switch (key) {
      case 'not_yet_due':
        return totals.not_yet_due
      case 'days_1_30':
        return totals.days_1_30
      case 'days_31_60':
        return totals.days_31_60
      case 'days_61_90':
        return totals.days_61_90
      case 'over_90':
        return totals.over_90
      case 'total':
        return totals.total
      default:
        return 0
    }
  }

  const visibleColumnOrder = useMemo(
    () => AGING_COLUMN_KEYS.filter((k) => visibleColumns[k]),
    [visibleColumns],
  )

  const handleExportExcel = () => {
    const keys = visibleColumnOrder
    const headers = keys.map((k) => agingColumnLabel(k))
    const lines = [headers.join(',')]
    sortedRows.forEach((r) => {
      const cells = keys.map((key) => {
        const v = agingCellRaw(r, key)
        return typeof v === 'number' ? String(v) : String(v)
      })
      lines.push(cells.join(','))
    })
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `customer-aging-${dateFrom}-${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportPDF = () => {
    handlePrint()
  }

  const handlePrint = () => {
    const keys = visibleColumnOrder
    const h = keys.map((k) => agingColumnLabel(k))
    const tableRows = sortedRows
      .map((r) => {
        const tds = keys
          .map((key) => {
            const v = agingCellRaw(r, key)
            const isNum = typeof v === 'number'
            const inner = isNum ? fmt(v) : String(v)
            return `<td${isNum ? ' class="num"' : ''}>${inner}</td>`
          })
          .join('')
        return `<tr>${tds}</tr>`
      })
      .join('')
    const textVisible = TEXT_COL_KEYS.filter((k) => visibleColumns[k]).length
    const labelColSpan = Math.max(1, textVisible)
    const numericKeys = keys.filter((k) => !TEXT_KEY_SET.has(k))
    const totalCells = numericKeys
      .map((key) => `<td class="num">${fmt(agingTotalForKey(key))}</td>`)
      .join('')
    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    printWindow.document.write(`
      <!DOCTYPE html><html dir="${isRtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${lang === 'ar' ? 'أعمار ديون العملاء' : 'Customer Aging'}</title>
      <style>body{font-family:system-ui,sans-serif;padding:1rem}.num{text-align:right} table{width:100%;border-collapse:collapse} th,td{border:1px solid #ccc;padding:6px} th{background:#f5f5f5}</style></head><body>
      <h1>${lang === 'ar' ? 'أعمار ديون العملاء' : 'Customer Aging Report'}</h1>
      <p>${lang === 'ar' ? 'اعتباراً من تاريخ:' : 'As of date:'} ${data?.as_of_date ?? dateTo}</p>
      <p>${lang === 'ar' ? 'فواتير المبيعات (تاريخ الفاتورة):' : 'Sales invoices (document date):'} ${dateFrom} — ${dateTo}</p>
      <table><thead><tr>${h.map((x) => `<th>${x}</th>`).join('')}</tr></thead><tbody>${tableRows}
      <tr class="footer"><td colspan="${labelColSpan}"><strong>${lang === 'ar' ? 'الإجمالي' : 'Total'}</strong></td>${totalCells}</tr>
      </tbody></table></body></html>
    `)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => {
      printWindow.print()
      printWindow.close()
    }, 300)
  }

  if (!tenantId) {
    return (
      <div className="p-6">
        <p className="text-amber-600">{lang === 'ar' ? 'يرجى اختيار الشركة أولاً.' : 'Please select a company first.'}</p>
      </div>
    )
  }

  const reportTitle = lang === 'ar' ? 'أعمار ديون العملاء' : 'Customer Aging Report'
  const labelPeriod = lang === 'ar' ? 'الفترة' : 'Period'
  const labelFrom = lang === 'ar' ? 'من تاريخ' : 'From date'
  const labelTo = lang === 'ar' ? 'إلى تاريخ' : 'To date'
  const labelCustomer = lang === 'ar' ? 'اسم العميل' : 'Customer'
  const labelBranch = lang === 'ar' ? 'الفرع' : 'Branch'
  const labelCostCenter = lang === 'ar' ? 'مركز التكلفة' : 'Cost center'
  const labelSalesRep = lang === 'ar' ? 'مندوب المبيعات' : 'Sales rep'
  const titlePrint = lang === 'ar' ? 'طباعة التقرير' : 'Print report'
  const titlePdf = lang === 'ar' ? 'تصدير PDF' : 'Export PDF'
  const titleExcel = lang === 'ar' ? 'تصدير Excel' : 'Export Excel'
  const titleColumns = lang === 'ar' ? 'تخصيص الأعمدة' : 'Customize columns'
  const labelShowColumns = lang === 'ar' ? 'إظهار/إخفاء الأعمدة' : 'Show / hide columns'
  const labelInvoiceNo = lang === 'ar' ? 'رقم الفاتورة' : 'Invoice #'
  const labelDueDateCol = lang === 'ar' ? 'تاريخ الاستحقاق' : 'Due date'
  const labelBalanceCol = lang === 'ar' ? 'المبلغ' : 'Amount'
  const labelAgingDetailTitle = lang === 'ar' ? 'تفاصيل الفواتير' : 'Invoice breakdown'

  const filterSelectCls = filterReportSelectNineClass
  const showCustomDateFields = periodPreset === 'custom'
  const invoiceStyleDateInputCls = filterPeriodBarDateInputClass

  const textColsVisible = TEXT_COL_KEYS.filter((k) => visibleColumns[k]).length
  const labelFooterColSpan = Math.max(1, textColsVisible)
  const numericColsVisible = AGING_COLUMN_KEYS.filter((k) => visibleColumns[k] && !TEXT_KEY_SET.has(k))

  return (
    <div className="py-3 px-2 space-y-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2">
        <div className="no-print flex flex-wrap items-center justify-between gap-2 gap-y-1.5 min-h-0 py-0.5">
          <h1 className="text-base font-semibold leading-tight text-slate-900 dark:text-slate-100 shrink-0">{reportTitle}</h1>

          <div className="flex flex-1 justify-center items-center min-w-0">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-slate-600 dark:text-slate-400 shrink-0">{labelPeriod}</span>
                <select
                  value={periodPreset}
                  onChange={(e) => applyPeriodPreset((e.target.value as ReportPeriodKey | 'custom') || 'all')}
                  className={filterPeriodBarSelectClass}
                  title={labelPeriod}
                  aria-label={labelPeriod}
                >
                  {agingPeriodOptions.map((opt) => (
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
                      type="date"
                      value={dateFrom}
                      onChange={(e) => onInvoiceDateFromChange(e.target.value)}
                      className={invoiceStyleDateInputCls}
                      title={labelFrom}
                      aria-label={labelFrom}
                    />
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">{labelTo}</span>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => onInvoiceDateToChange(e.target.value)}
                      className={invoiceStyleDateInputCls}
                      title={labelTo}
                      aria-label={labelTo}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="relative flex items-center gap-1 shrink-0" ref={columnsMenuRef}>
            <button
              type="button"
              onClick={() => setShowColumnsMenu((v) => !v)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600"
              title={titleColumns}
            >
              <Columns3 size={15} />
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={isLoading}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
              title={titleExcel}
            >
              <FileSpreadsheet size={15} />
            </button>
            <button
              type="button"
              onClick={handleExportPDF}
              disabled={isLoading}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-800 dark:bg-slate-600 text-white hover:bg-slate-700 dark:hover:bg-slate-500 disabled:opacity-50"
              title={titlePdf}
            >
              <FileText size={15} />
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={isLoading}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 disabled:opacity-50"
              title={titlePrint}
            >
              <Printer size={15} />
            </button>
            {showColumnsMenu && (
              <div
                className={`absolute top-full z-50 mt-2 w-64 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 py-2 shadow-lg text-sm ${isRtl ? 'right-0' : 'left-0'}`}
              >
                <div className="px-3 pb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">{labelShowColumns}</div>
                {AGING_COLUMN_KEYS.map((key) => (
                  <label
                    key={key}
                    className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <input
                      type="checkbox"
                      checked={visibleColumns[key]}
                      onChange={() => toggleAgingColumn(key)}
                      className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-200">{agingColumnLabel(key)}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex flex-wrap items-stretch gap-3 no-print">
        <div className="min-w-[180px] flex-1 basis-[180px] max-w-[280px] flex">
          <select
            value={customerId === '' ? '' : String(customerId)}
            onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : '')}
            className={filterSelectCls}
            aria-label={labelCustomer}
            title={labelCustomer}
          >
            <option value="">{labelCustomer}</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {lang === 'ar' ? c.name : (c.name_en || c.name)}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[180px] flex-1 basis-[180px] max-w-[280px] flex">
          <select
            value={branchId === '' ? '' : String(branchId)}
            onChange={(e) => setBranchId(e.target.value ? Number(e.target.value) : '')}
            className={filterSelectCls}
            aria-label={labelBranch}
            title={labelBranch}
          >
            <option value="">{labelBranch}</option>
            {branches.filter((b) => b.is_active).map((b) => (
              <option key={b.id} value={b.id}>
                {lang === 'ar' ? b.name : (b.name_en || b.name)}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[180px] flex-1 basis-[180px] max-w-[280px] flex">
          <select
            value={costCenterId === '' ? '' : String(costCenterId)}
            onChange={(e) => setCostCenterId(e.target.value ? Number(e.target.value) : '')}
            className={filterSelectCls}
            aria-label={labelCostCenter}
            title={labelCostCenter}
          >
            <option value="">{labelCostCenter}</option>
            {costCenters.filter((c) => c.is_active).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[180px] flex-1 basis-[180px] max-w-[280px] flex">
          <select
            value={salesRepId === '' ? '' : String(salesRepId)}
            onChange={(e) => setSalesRepId(e.target.value ? Number(e.target.value) : '')}
            className={filterSelectCls}
            aria-label={labelSalesRep}
            title={labelSalesRep}
          >
            <option value="">{labelSalesRep}</option>
            {salesReps.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[120px] flex-1 basis-[120px] max-w-[200px] flex items-center">
          <PageSizeSelect
            value={perPage}
            onChange={(v) => {
              setPerPage(v)
              setPage(1)
            }}
            showLabel={false}
            ariaLabel={lang === 'ar' ? 'عدد السجلات' : 'Records per page'}
            className="w-full min-w-0"
          />
        </div>
      </div>

      {/* الجدول + شريط الصفحات (نفس فواتير المبيعات) */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col min-h-0">
        <div className="overflow-x-auto flex-1 min-h-0">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-500 border-t-transparent" />
            </div>
          ) : (
            <table className="w-full text-sm table-fixed" dir={isRtl ? 'rtl' : 'ltr'}>
              <thead className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-600 sticky top-0 z-10">
                <tr>
                  {AGING_COLUMN_KEYS.filter((k) => visibleColumns[k]).map((key) => (
                    <SortableTh
                      key={key}
                      label={agingColumnLabel(key)}
                      sortKey={key}
                      sortState={sort}
                      onToggle={toggleSort}
                      className={`font-medium text-slate-700 dark:text-slate-200 ${TEXT_KEY_SET.has(key) ? textAlign : numAlign}`}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((r) => (
                  <tr
                    key={r.customer_id}
                    className="border-b border-slate-100 hover:bg-slate-50/50 dark:border-slate-600/50 dark:hover:bg-slate-700/30"
                  >
                    {AGING_COLUMN_KEYS.filter((k) => visibleColumns[k]).map((key) => {
                      const raw = agingCellRaw(r, key)
                      const isNum = typeof raw === 'number'
                      const isAccount = key === 'account'
                      const lines = isNum ? detailLinesForCell(r, key) : []
                      const clickable = isNum && raw > 0 && lines.length > 0
                      const overdueStyle =
                        isNum && raw > 0 && OVERDUE_AMOUNT_KEYS.has(key)
                          ? 'bg-orange-50/90 dark:bg-orange-950/30'
                          : ''
                      const customerLabel = lang === 'ar' ? r.customer_name : (r.customer_name_en || r.customer_name)
                      return (
                        <td
                          key={key}
                          className={`px-4 py-2 ${TEXT_KEY_SET.has(key) ? textAlign : numAlign} ${key === 'total' ? 'font-medium' : ''} ${overdueStyle} ${clickable ? 'cursor-pointer hover:brightness-[0.98] dark:hover:brightness-110' : ''}`}
                          dir={isNum || isAccount ? 'ltr' : undefined}
                          onClick={
                            clickable
                              ? () =>
                                  setAgingModal({
                                    title: `${customerLabel} — ${agingColumnLabel(key)}`,
                                    lines,
                                  })
                              : undefined
                          }
                          onKeyDown={
                            clickable
                              ? (e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    setAgingModal({
                                      title: `${customerLabel} — ${agingColumnLabel(key)}`,
                                      lines,
                                    })
                                  }
                                }
                              : undefined
                          }
                          role={clickable ? 'button' : undefined}
                          tabIndex={clickable ? 0 : undefined}
                          title={clickable ? (lang === 'ar' ? 'انقر لعرض الفواتير' : 'Click to view invoices') : undefined}
                        >
                          {isNum ? <span dir="ltr">{fmt(raw)}</span> : key === 'sales_rep' ? (raw || '—') : String(raw)}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
              {!isLoading && sortedRows.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-100 dark:bg-slate-700 border-t-2 border-slate-300 dark:border-slate-600 font-bold text-slate-800 dark:text-slate-200">
                    <td className={`px-4 py-2 ${textAlign}`} colSpan={labelFooterColSpan}>
                      {lang === 'ar' ? 'الإجمالي' : 'Total'}
                    </td>
                    {numericColsVisible.map((key) => (
                      <td key={key} className={`px-4 py-2 ${numAlign}`} dir="ltr">
                        {fmt(agingTotalForKey(key))}
                      </td>
                    ))}
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
            recordLabel={lang === 'ar' ? 'عميل' : 'customer'}
            dense
          />
        )}
      </div>

      {!isLoading && rows.length === 0 && (
        <p className="text-center text-slate-500 dark:text-slate-400 py-8">{lang === 'ar' ? 'لا توجد بيانات لعرضها.' : 'No data to display.'}</p>
      )}

      {agingModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setAgingModal(null)}
          role="presentation"
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-600 max-w-lg w-full max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="aging-modal-title"
          >
            <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-600 shrink-0">
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{labelAgingDetailTitle}</p>
                <h2 id="aging-modal-title" className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {agingModal.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setAgingModal(null)}
                className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label={lang === 'ar' ? 'إغلاق' : 'Close'}
              >
                <X size={18} />
              </button>
            </div>
            <div className="overflow-auto flex-1 min-h-0 px-4 py-3">
              <table className="w-full text-sm border-collapse" dir={isRtl ? 'rtl' : 'ltr'}>
                <thead>
                  <tr className={`border-b border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 ${textAlign}`}>
                    <th className="py-2 pe-2 font-medium">{labelInvoiceNo}</th>
                    <th className="py-2 pe-2 font-medium">{labelDueDateCol}</th>
                    <th className={`py-2 font-medium ${numAlign}`}>{labelBalanceCol}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {agingModal.lines.map((line) => (
                    <tr key={line.invoice_id}>
                      <td className="py-2 pe-2 font-mono text-slate-800 dark:text-slate-200" dir="ltr">
                        {line.number || '—'}
                      </td>
                      <td className="py-2 pe-2 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {new Date(line.due_date + 'T12:00:00').toLocaleDateString(locale)}
                      </td>
                      <td className={`py-2 ${numAlign} text-slate-800 dark:text-slate-200`} dir="ltr">
                        {fmt(line.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
