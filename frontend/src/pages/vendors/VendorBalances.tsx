import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchVendorBalances, fetchAccountLastMovements, fetchBranches, fetchCostCenters, fetchSettings } from '../../api/tenant'
import type { AccountLastMovementLine, VendorBalanceRow, Branch, CostCenter, TenantSettings } from '../../types'
import { formatAmount } from '../../utils/currency'
import { asArray } from '../../utils/asArray'
import { getDefaultDateRange, getReportPeriodRange, type ReportPeriodKey } from '../../utils/date'
import { Eye, Search, FileSpreadsheet, FileText, Printer, X, Columns3 } from 'lucide-react'
import { useDocumentTitleContext } from '../../contexts/DocumentTitleContext'
import { usePersistedColumnVisibility } from '../../hooks/usePersistedColumnVisibility'
import { useClientSort } from '../../hooks/useClientSort'
import ReportFooter from '../../components/ui/ReportFooter'
import SortableTh from '../../components/ui/SortableTh'
import {
  filterBalanceCompactDateInputClass,
  filterBalancePeriodSelectClass,
  filterBalanceSearchInputClass,
  filterPageSizeSelectClass,
  filterReportSelectNineClass,
} from '../../utils/filterControlStyles'

type VendorBalanceColumnKey = 'account' | 'vendor' | 'debit' | 'credit' | 'balance' | 'quick'
const BALANCE_COLUMN_KEYS: VendorBalanceColumnKey[] = ['account', 'vendor', 'debit', 'credit', 'balance', 'quick']
const BALANCE_COLUMNS_STORAGE = 'vendorBalancesVisibleColumns'

const BALANCE_PAGE_SIZES = [10, 25, 50, 100, 200, 500] as const

export default function VendorBalances() {
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
  const docDecimals = settings?.doc_amount_decimals
  const decimalPlaces = typeof docDecimals === 'number' ? docDecimals : 2
  const fmt = (n: number) => formatAmount(n, { decimal_places: decimalPlaces }, locale)
  const textAlign = isRtl ? 'text-right' : 'text-left'
  /** رأس وسيط + خلايا وسطية + أرقام لاتينية — محاذاة عمودية للمقارنة في الجداول العربية */
  const amountAlign = 'text-center tabular-nums'

  const defaultRange = getDefaultDateRange()
  const [search, setSearch] = useState('')
  const [branchId, setBranchId] = useState<number | ''>('')
  const [costCenterId, setCostCenterId] = useState<number | ''>('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [asOfDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [periodPreset, setPeriodPreset] = useState<ReportPeriodKey | 'custom'>('all')
  const [lastTxnFrom, setLastTxnFrom] = useState(defaultRange.dateFrom ?? '')
  const [lastTxnTo, setLastTxnTo] = useState(defaultRange.dateTo ?? '')
  const [onlyWithBalance] = useState(false)
  const [modalAccountId, setModalAccountId] = useState<number | null>(null)
  const [modalVendorName, setModalVendorName] = useState('')
  const [visibleColumns, setVisibleColumns] = usePersistedColumnVisibility(BALANCE_COLUMNS_STORAGE, BALANCE_COLUMN_KEYS)
  const [showColumnsMenu, setShowColumnsMenu] = useState(false)
  const columnsMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setPageTitle(lang === 'ar' ? 'أرصدة الموردين' : 'Vendor Balances')
    return () => setPageTitle(null)
  }, [lang, setPageTitle])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (columnsMenuRef.current && !columnsMenuRef.current.contains(e.target as Node)) setShowColumnsMenu(false)
    }
    if (showColumnsMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showColumnsMenu])

  const params = useMemo(() => {
    const p: {
      branch_id?: number
      cost_center_id?: number
      as_of_date?: string
      last_transaction_from?: string
      last_transaction_to?: string
      only_with_balance?: boolean
    } = {}
    if (asOfDate) p.as_of_date = asOfDate
    if (branchId) p.branch_id = Number(branchId)
    if (costCenterId) p.cost_center_id = Number(costCenterId)
    if (periodPreset !== 'all') {
      if (lastTxnFrom) p.last_transaction_from = lastTxnFrom
      if (lastTxnTo) p.last_transaction_to = lastTxnTo
    }
    if (onlyWithBalance) p.only_with_balance = true
    return p
  }, [asOfDate, branchId, costCenterId, periodPreset, lastTxnFrom, lastTxnTo, onlyWithBalance])

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
    : ((costCentersData as unknown) as { data?: CostCenter[] })?.data ?? []

  const { data, isLoading } = useQuery({
    queryKey: ['vendorBalances', tenantId, params],
    queryFn: () => fetchVendorBalances(tenantId, params),
    enabled: !!tenantId,
  })

  const { data: lastMovements, isLoading: loadingMovements } = useQuery({
    queryKey: ['accountLastMovements', tenantId, modalAccountId],
    queryFn: () => fetchAccountLastMovements(tenantId, modalAccountId!, 10),
    enabled: !!tenantId && !!modalAccountId,
  })

  const modalMovementLines = lastMovements?.lines ?? []
  const { sort: modalSort, toggleSort: toggleModalSort, sortedRows: sortedModalLines } = useClientSort(modalMovementLines, [
    { key: 'date', type: 'date', getValue: (l: AccountLastMovementLine) => l.date },
    { key: 'reference_number', type: 'string', getValue: (l: AccountLastMovementLine) => l.reference_number ?? '' },
    { key: 'operation_type', type: 'string', getValue: (l: AccountLastMovementLine) => l.operation_type ?? '' },
    { key: 'debit', type: 'number', getValue: (l: AccountLastMovementLine) => Number(l.debit) },
    { key: 'credit', type: 'number', getValue: (l: AccountLastMovementLine) => Number(l.credit) },
  ], { locale })

  const rows: VendorBalanceRow[] = data?.data ?? []
  const company = data?.company ?? null

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.trim().toLowerCase()
    return rows.filter(
      (r) =>
        r.account_code.toLowerCase().includes(q) ||
        (r.vendor_name || '').toLowerCase().includes(q) ||
        (r.vendor_name_en || '').toLowerCase().includes(q)
    )
  }, [rows, search])

  const { sort, toggleSort, sortedRows } = useClientSort(filteredRows, [
    { key: 'account', type: 'string', getValue: (r: VendorBalanceRow) => r.account_code },
    { key: 'vendor', type: 'string', getValue: (r: VendorBalanceRow) => (lang === 'ar' ? r.vendor_name : (r.vendor_name_en || r.vendor_name)) },
    { key: 'debit', type: 'number', getValue: (r: VendorBalanceRow) => r.total_debit },
    { key: 'credit', type: 'number', getValue: (r: VendorBalanceRow) => r.total_credit },
    { key: 'balance', type: 'number', getValue: (r: VendorBalanceRow) => r.balance },
  ], { locale })

  const totalFiltered = sortedRows.length
  const lastPage = Math.max(1, Math.ceil(totalFiltered / pageSize) || 1)

  useEffect(() => {
    setPage((p) => Math.min(p, lastPage))
  }, [lastPage])

  useEffect(() => {
    setPage(1)
  }, [search, branchId, costCenterId, asOfDate, periodPreset, lastTxnFrom, lastTxnTo, onlyWithBalance, rows.length, pageSize, sort?.key, sort?.direction])

  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize
    return sortedRows.slice(start, start + pageSize)
  }, [sortedRows, page, pageSize])

  const totals = useMemo(() => {
    let sumDebit = 0
    let sumCredit = 0
    let sumBalance = 0
    sortedRows.forEach((r) => {
      sumDebit += r.total_debit
      sumCredit += r.total_credit
      sumBalance += r.balance
    })
    return { sumDebit, sumCredit, sumBalance }
  }, [sortedRows])

  const columnLabels = useMemo((): Record<VendorBalanceColumnKey, string> => {
    const ar = lang === 'ar'
    return {
      account: ar ? 'رقم الحساب' : 'Account',
      vendor: ar ? 'اسم المورد' : 'Vendor',
      debit: ar ? 'إجمالي المدين' : 'Total Debit',
      credit: ar ? 'إجمالي المدفوع' : 'Total Credit',
      balance: ar ? 'الرصيد المتبقي' : 'Balance',
      quick: ar ? 'كشف سريع' : 'Quick',
    }
  }, [lang])

  const visibleColumnKeys = useMemo(() => {
    const keys = BALANCE_COLUMN_KEYS.filter((k) => visibleColumns[k])
    return keys.length > 0 ? keys : BALANCE_COLUMN_KEYS
  }, [visibleColumns])

  const balanceFooterLayout = useMemo(() => {
    const amountSet = new Set<VendorBalanceColumnKey>(['debit', 'credit', 'balance'])
    const idx = visibleColumnKeys.findIndex((k) => amountSet.has(k))
    const preKeys =
      idx === -1
        ? visibleColumnKeys.filter((k) => k !== 'quick' && !amountSet.has(k))
        : visibleColumnKeys.slice(0, idx)
    const amountKeys = visibleColumnKeys.filter((k) => amountSet.has(k))
    const showQuickFoot = visibleColumnKeys.includes('quick')
    return { preKeys, amountKeys, showQuickFoot }
  }, [visibleColumnKeys])

  const dataColumnKeys = useMemo(
    () => visibleColumnKeys.filter((k) => k !== 'quick'),
    [visibleColumnKeys],
  )

  function escapeHtml(s: string) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
  }

  const handleExportExcel = () => {
    if (dataColumnKeys.length === 0) return
    const headers = dataColumnKeys.map((k) => columnLabels[k])
    const lines = [headers.join(',')]
    sortedRows.forEach((r) => {
      const cells = dataColumnKeys.map((k) => {
        if (k === 'account') return r.account_code
        if (k === 'vendor') return `"${String(r.vendor_name ?? '').replace(/"/g, '""')}"`
        if (k === 'debit') return r.total_debit
        if (k === 'credit') return r.total_credit
        if (k === 'balance') return r.balance
        return ''
      })
      lines.push(cells.join(','))
    })
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vendor-balances-${data?.as_of_date ?? 'report'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handlePrint = () => {
    if (dataColumnKeys.length === 0) return
    const headerRow = dataColumnKeys
      .map((k) => {
        const cls = k === 'debit' || k === 'credit' || k === 'balance' ? ' class="num"' : ''
        return `<th${cls}>${escapeHtml(columnLabels[k])}</th>`
      })
      .join('')
    const tableRows = sortedRows
      .map((r) => {
        const cells = dataColumnKeys
          .map((k) => {
            if (k === 'account') return `<td>${escapeHtml(r.account_code)}</td>`
            if (k === 'vendor')
              return `<td>${escapeHtml(lang === 'ar' ? r.vendor_name : (r.vendor_name_en || r.vendor_name))}</td>`
            if (k === 'debit') return `<td class="num">${fmt(r.total_debit)}</td>`
            if (k === 'credit') return `<td class="num">${fmt(r.total_credit)}</td>`
            if (k === 'balance') return `<td class="num">${fmt(r.balance)}</td>`
            return '<td></td>'
          })
          .join('')
        return `<tr>${cells}</tr>`
      })
      .join('')
    const textCols = dataColumnKeys.filter((k) => k === 'account' || k === 'vendor').length
    const hasNumCols = dataColumnKeys.some((k) => k === 'debit' || k === 'credit' || k === 'balance')
    let footerRow = '<tr class="footer">'
    if (textCols > 0) {
      footerRow += `<td colspan="${textCols}"><strong>${lang === 'ar' ? 'الإجمالي' : 'Total'}</strong></td>`
    } else if (hasNumCols) {
      footerRow += `<td><strong>${lang === 'ar' ? 'الإجمالي' : 'Total'}</strong></td>`
    }
    for (const k of dataColumnKeys) {
      if (k === 'debit') footerRow += `<td class="num">${fmt(totals.sumDebit)}</td>`
      if (k === 'credit') footerRow += `<td class="num">${fmt(totals.sumCredit)}</td>`
      if (k === 'balance') footerRow += `<td class="num">${fmt(totals.sumBalance)}</td>`
    }
    footerRow += '</tr>'
    const table = `
      <table>
        <thead><tr>${headerRow}</tr></thead>
        <tbody>${tableRows}</tbody>
        <tfoot>${footerRow}</tfoot>
      </table>`
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <!DOCTYPE html><html dir="${isRtl ? 'rtl' : 'ltr'}"><head>
        <meta charset="utf-8"><title>${lang === 'ar' ? 'أرصدة الموردين' : 'Vendor Balances'}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th, td { border: 1px solid #ddd; padding: 8px; }
          th { background: #f5f5f5; text-align: right; }
          td { text-align: right; }
          .num { font-variant-numeric: tabular-nums; }
          .logo { max-height: 60px; }
          .company { margin-bottom: 16px; }
          .footer { font-weight: 400; border-top: 2px solid #333; background: #f0f0f0; }
        </style>
      </head><body>
        <div class="company">
          ${company?.logo ? `<img class="logo" src="${company.logo}" alt="" />` : ''}
          <h2>${company?.name ?? ''}</h2>
          <p>${lang === 'ar' ? 'أرصدة الموردين' : 'Vendor Balances'} — ${data?.as_of_date ?? ''}</p>
        </div>
        ${table}
      </body></html>
    `)
    win.document.close()
    win.focus()
    setTimeout(() => {
      win.print()
      win.close()
    }, 300)
  }

  const handleExportPDF = () => {
    handlePrint()
  }

  if (!tenantId) {
    return (
      <div className="p-6">
        <p className="text-amber-600">{lang === 'ar' ? 'يرجى اختيار الشركة أولاً.' : 'Please select a company first.'}</p>
      </div>
    )
  }

  const periodOptions: { value: ReportPeriodKey | 'custom'; labelAr: string; labelEn: string }[] = [
    { value: 'all', labelAr: 'الفترة', labelEn: 'Period' },
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
    if (preset !== 'custom') {
      const range = getReportPeriodRange(preset)
      setLastTxnFrom(range.from_date)
      setLastTxnTo(range.to_date)
    }
  }

  function onLastTxnFromChange(value: string) {
    setLastTxnFrom(value)
  }

  function onLastTxnToChange(value: string) {
    setLastTxnTo(value)
  }

  const showCustomDateFields = periodPreset === 'custom'
  const labelPeriod = lang === 'ar' ? 'الفترة' : 'Period'
  const labelFrom = lang === 'ar' ? 'من' : 'From'
  const labelTo = lang === 'ar' ? 'إلى' : 'To'

  const reportTitle = lang === 'ar' ? 'أرصدة الموردين' : 'Vendor Balances'
  const labelSearch = lang === 'ar' ? 'بحث باسم المورد أو رقم الحساب' : 'Search by vendor or account code'
  const labelBranch = lang === 'ar' ? 'الفرع' : 'Branch'
  const labelCostCenter = lang === 'ar' ? 'مركز التكلفة' : 'Cost center'

  const titlePrint = lang === 'ar' ? 'طباعة التقرير' : 'Print report'
  const titlePdf = lang === 'ar' ? 'تصدير PDF' : 'Export PDF'
  const titleExcel = lang === 'ar' ? 'تصدير Excel' : 'Export Excel'

  const titleColumns = lang === 'ar' ? 'تخصيص الأعمدة' : 'Customize columns'
  const labelShowColumns = lang === 'ar' ? 'إظهار/إخفاء الأعمدة' : 'Show / hide columns'

  function toggleColumn(key: VendorBalanceColumnKey, checked: boolean) {
    setVisibleColumns((prev) => {
      const next = { ...prev, [key]: checked }
      if (!BALANCE_COLUMN_KEYS.some((k) => next[k])) return prev
      return next
    })
  }

  return (
    <div className="py-3 px-2 space-y-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2 gap-y-1.5 min-h-0">
          <h1 className="text-base font-semibold leading-tight text-slate-900 dark:text-slate-100 shrink-0">{reportTitle}</h1>

          <div className="flex-1 flex justify-center min-w-0">
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <select
                  value={periodPreset}
                  onChange={(e) => applyPeriodPreset((e.target.value as ReportPeriodKey | 'custom') || 'all')}
                  className={filterBalancePeriodSelectClass}
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
                <>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">{labelFrom}</span>
                    <input
                      type="date"
                      value={lastTxnFrom}
                      onChange={(e) => onLastTxnFromChange(e.target.value)}
                      className={filterBalanceCompactDateInputClass}
                      title={labelFrom}
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">{labelTo}</span>
                    <input
                      type="date"
                      value={lastTxnTo}
                      onChange={(e) => onLastTxnToChange(e.target.value)}
                      className={filterBalanceCompactDateInputClass}
                      title={labelTo}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="relative flex items-center gap-1 no-print shrink-0" ref={columnsMenuRef}>
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
                {BALANCE_COLUMN_KEYS.map((key) => (
                  <label
                    key={key}
                    className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <input
                      type="checkbox"
                      checked={visibleColumns[key]}
                      onChange={(e) => toggleColumn(key, e.target.checked)}
                      className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-200">{columnLabels[key]}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex flex-wrap items-stretch gap-3">
        <div className="min-w-[200px] flex-1 basis-[200px] max-w-[340px] flex">
          <div className="relative w-full">
            <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 ltr:left-3 rtl:right-3 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={labelSearch}
              aria-label={labelSearch}
              className={filterBalanceSearchInputClass}
            />
          </div>
        </div>
        <div className="min-w-[180px] flex-1 basis-[180px] max-w-[280px] flex">
          <select
            value={branchId === '' ? '' : String(branchId)}
            onChange={(e) => setBranchId(e.target.value ? Number(e.target.value) : '')}
            className={filterReportSelectNineClass}
            aria-label={labelBranch}
            title={labelBranch}
          >
            <option value="">{labelBranch}</option>
            {branches.filter((b) => b.is_active).map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div className="min-w-[180px] flex-1 basis-[180px] max-w-[280px] flex">
          <select
            value={costCenterId === '' ? '' : String(costCenterId)}
            onChange={(e) => setCostCenterId(e.target.value ? Number(e.target.value) : '')}
            className={filterReportSelectNineClass}
            aria-label={labelCostCenter}
            title={labelCostCenter}
          >
            <option value="">{labelCostCenter}</option>
            {costCenters.filter((c) => c.is_active).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="w-14 shrink-0 flex items-center self-stretch">
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value))
              setPage(1)
            }}
            title={lang === 'ar' ? 'عدد السجلات في الصفحة' : 'Rows per page'}
            aria-label={lang === 'ar' ? 'عدد السجلات في الصفحة' : 'Rows per page'}
            className={filterPageSizeSelectClass}
          >
            {BALANCE_PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col min-h-0">
        <div className="overflow-x-auto flex-1 min-h-0">
          {isLoading ? (
            <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-500 border-t-transparent" /></div>
          ) : (
            <table className="w-full text-sm table-fixed" dir={isRtl ? 'rtl' : 'ltr'}>
              <thead className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-600 sticky top-0 z-10">
                <tr>
                  {visibleColumnKeys.map((k) => (
                    k === 'quick' ? (
                      <th key={k} className={`px-4 py-2 font-medium text-slate-700 dark:text-slate-200 text-center w-14`}>
                        {columnLabels[k]}
                      </th>
                    ) : (
                      <SortableTh
                        key={k}
                        label={columnLabels[k]}
                        sortKey={k}
                        sortState={sort}
                        onToggle={toggleSort}
                        widthClassName={
                          k === 'account'
                            ? 'w-28'
                            : k === 'vendor'
                              ? 'w-[28rem]'
                              : k === 'debit' || k === 'credit' || k === 'balance'
                                ? 'w-40 min-w-[10rem]'
                                : ''
                        }
                        headerLayout={
                          k === 'debit' || k === 'credit' || k === 'balance' ? 'clusterCenter' : 'spread'
                        }
                        className={`font-medium text-slate-700 dark:text-slate-200 ${
                          k === 'debit' || k === 'credit' || k === 'balance' ? 'text-center' : textAlign
                        }`}
                      />
                    )
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((r) => (
                  <tr key={r.vendor_id} className="border-b border-slate-100 hover:bg-slate-50/50">
                    {visibleColumnKeys.map((k) => {
                      if (k === 'account')
                        return (
                          <td key={k} className={`px-4 py-2 ${textAlign}`} dir="ltr">
                            {r.account_code}
                          </td>
                        )
                      if (k === 'vendor')
                        return (
                          <td key={k} className={`px-4 py-2 ${textAlign}`}>
                            {lang === 'ar' ? r.vendor_name : (r.vendor_name_en || r.vendor_name)}
                          </td>
                        )
                      if (k === 'debit')
                        return (
                          <td key={k} className={`px-4 py-2 ${amountAlign}`} dir="ltr">
                            {fmt(r.total_debit)}
                          </td>
                        )
                      if (k === 'credit')
                        return (
                          <td key={k} className={`px-4 py-2 ${amountAlign}`} dir="ltr">
                            {fmt(r.total_credit)}
                          </td>
                        )
                      if (k === 'balance')
                        return (
                          <td key={k} className={`px-4 py-2 ${amountAlign} font-medium`} dir="ltr">
                            {fmt(r.balance)}
                          </td>
                        )
                      return (
                        <td key={k} className="px-4 py-1.5 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setModalAccountId(r.account_id)
                              setModalVendorName(lang === 'ar' ? r.vendor_name : (r.vendor_name_en || r.vendor_name))
                            }}
                            className="p-1.5 rounded-lg text-slate-600 hover:bg-primary-100 hover:text-primary-700"
                            title={lang === 'ar' ? 'آخر 10 عمليات' : 'Last 10 transactions'}
                          >
                            <Eye size={18} />
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
              {!isLoading && totalFiltered > 0 && balanceFooterLayout.amountKeys.length > 0 && (
                <tfoot>
                  <tr className="bg-gradient-to-r from-slate-100 to-slate-50 dark:from-slate-700 dark:to-slate-800 border-t-2 border-slate-400 dark:border-slate-500 font-bold text-slate-900 dark:text-slate-100 shadow-[0_-2px_4px_rgba(0,0,0,0.04)]">
                    {balanceFooterLayout.preKeys.length > 0 ? (
                      <td
                        colSpan={balanceFooterLayout.preKeys.length}
                        className={`${textAlign} px-4 py-2 text-sm leading-tight`}
                      >
                        {lang === 'ar' ? 'الإجمالي' : 'Total'}
                      </td>
                    ) : (
                      <td className={`${textAlign} px-4 py-2 text-sm leading-tight`}>
                        {lang === 'ar' ? 'الإجمالي' : 'Total'}
                      </td>
                    )}
                    {balanceFooterLayout.amountKeys.map((k) => {
                      const val =
                        k === 'debit' ? totals.sumDebit : k === 'credit' ? totals.sumCredit : totals.sumBalance
                      return (
                        <td
                          key={k}
                          className={`px-4 py-2 text-sm font-semibold leading-tight ${amountAlign}`}
                          dir="ltr"
                        >
                          {fmt(val)}
                        </td>
                      )
                    })}
                    {balanceFooterLayout.showQuickFoot && <td className="px-4 py-2" aria-hidden />}
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>

        {!isLoading && totalFiltered > 0 && (
          <ReportFooter
            totalCount={totalFiltered}
            currentPage={page}
            lastPage={lastPage}
            from={totalFiltered === 0 ? 0 : (page - 1) * pageSize + 1}
            to={totalFiltered === 0 ? 0 : Math.min(page * pageSize, totalFiltered)}
            onPageChange={setPage}
            lang={lang === 'ar' ? 'ar' : 'en'}
            isRtl={isRtl}
            alwaysShowPaginationBar
            showRecordSummary={totalFiltered > 0}
            recordLabel={lang === 'ar' ? 'مورد' : 'vendor'}
            dense
          />
        )}
      </div>

      {!isLoading && totalFiltered === 0 && (
        <p className="text-center text-slate-500 dark:text-slate-400 py-8">{lang === 'ar' ? 'لا توجد بيانات لعرضها.' : 'No data to display.'}</p>
      )}

      {modalAccountId != null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setModalAccountId(null)}>
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold">{lang === 'ar' ? 'آخر 10 عمليات — ' : 'Last 10 transactions — '}{modalVendorName}</h3>
              <button type="button" onClick={() => setModalAccountId(null)} className="p-2 rounded-lg hover:bg-slate-100"><X size={20} /></button>
            </div>
            <div className="p-4 overflow-auto flex-1 min-h-0">
              {loadingMovements ? (
                <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-500 border-t-transparent" /></div>
              ) : sortedModalLines.length ? (
                <table className="w-full text-sm table-fixed">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <SortableTh label={lang === 'ar' ? 'التاريخ' : 'Date'} sortKey="date" sortState={modalSort} onToggle={toggleModalSort} widthClassName="w-32" className={`${textAlign} font-medium text-slate-700`} />
                      <SortableTh label={lang === 'ar' ? 'الرقم' : 'Ref'} sortKey="reference_number" sortState={modalSort} onToggle={toggleModalSort} widthClassName="w-36" className={`${textAlign} font-medium text-slate-700`} />
                      <SortableTh label={lang === 'ar' ? 'النوع' : 'Type'} sortKey="operation_type" sortState={modalSort} onToggle={toggleModalSort} widthClassName="w-40" className={`${textAlign} font-medium text-slate-700`} />
                      <SortableTh label={lang === 'ar' ? 'مدين' : 'Debit'} sortKey="debit" sortState={modalSort} onToggle={toggleModalSort} widthClassName="w-32 min-w-[8rem]" headerLayout="clusterCenter" className="text-center font-medium text-slate-700" />
                      <SortableTh label={lang === 'ar' ? 'دائن' : 'Credit'} sortKey="credit" sortState={modalSort} onToggle={toggleModalSort} widthClassName="w-32 min-w-[8rem]" headerLayout="clusterCenter" className="text-center font-medium text-slate-700" />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedModalLines.map((line, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        <td className={`py-2 ${textAlign}`} dir="ltr">{line.date}</td>
                        <td className={`py-2 ${textAlign}`}>{line.reference_number}</td>
                        <td className={`py-2 ${textAlign}`}>{line.operation_type}</td>
                        <td className={`py-2 ${amountAlign}`} dir="ltr">{fmt(line.debit)}</td>
                        <td className={`py-2 ${amountAlign}`} dir="ltr">{fmt(line.credit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-slate-500 text-center py-6">{lang === 'ar' ? 'لا توجد حركات.' : 'No transactions.'}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
