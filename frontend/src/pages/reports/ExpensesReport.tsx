import { useState, useMemo, useEffect, useRef, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchExpensesReport,
  fetchSettings,
  fetchBranches,
  fetchCostCenters,
  fetchPaymentMethods,
  fetchAccounts,
} from '../../api/tenant'
import type { ExpensesReportResponse, ExpensesReportRow } from '../../api/tenant'
import type { Account } from '../../types'
import { getDefaultDateRange, getReportPeriodRange, type ReportPeriodKey } from '../../utils/date'
import { formatAmount } from '../../utils/currency'
import { FileText, FileSpreadsheet, Printer, Columns3 } from 'lucide-react'
import SearchableSelect, { type SearchableSelectOption } from '../../components/ui/SearchableSelect'
import ReportFooter from '../../components/ui/ReportFooter'
import PageSizeSelect from '../../components/ui/PageSizeSelect'
import { usePersistedColumnVisibility } from '../../hooks/usePersistedColumnVisibility'
import { useClientSort } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'

type ExpensesReportColumnKey =
  | 'date'
  | 'voucher'
  | 'expenseItem'
  | 'costCenter'
  | 'description'
  | 'amount'
  | 'vat'
  | 'total'
const EXPENSES_REPORT_COLUMN_KEYS: ExpensesReportColumnKey[] = [
  'date',
  'voucher',
  'expenseItem',
  'costCenter',
  'description',
  'amount',
  'vat',
  'total',
]
const EXPENSES_COLUMNS_STORAGE_KEY = 'expensesReportVisibleColumns'

const EXPENSES_NUMERIC_COLUMN_KEYS: ExpensesReportColumnKey[] = ['amount', 'vat', 'total']

function toBranchList(res: unknown): { id: number; name: string; code?: string }[] {
  if (Array.isArray(res)) return res as { id: number; name: string; code?: string }[]
  if (res && typeof res === 'object' && 'data' in res) {
    const d = (res as { data: unknown }).data
    return Array.isArray(d) ? (d as { id: number; name: string; code?: string }[]) : []
  }
  return []
}

function formatDisplayDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const raw = String(dateStr).trim()
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) return `${match[3]}/${match[2]}/${match[1]}`
  return raw.slice(0, 10)
}

export default function ExpensesReport() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const defaultRange = getDefaultDateRange()
  const [periodPreset, setPeriodPreset] = useState<ReportPeriodKey | 'custom'>('all')
  const [dateFrom, setDateFrom] = useState(defaultRange.dateFrom ?? '')
  const [dateTo, setDateTo] = useState(defaultRange.dateTo ?? '')
  const [branchId, setBranchId] = useState<string>('')
  const [costCenterId, setCostCenterId] = useState<string>('')
  const [accountId, setAccountId] = useState<string>('')
  const [paymentMethodId, setPaymentMethodId] = useState<string>('')
  const [perPage, setPerPage] = useState(25)
  const [page, setPage] = useState(1)
  const [visibleColumns, setVisibleColumns] = usePersistedColumnVisibility(
    EXPENSES_COLUMNS_STORAGE_KEY,
    EXPENSES_REPORT_COLUMN_KEYS,
  )
  const [showColumnsMenu, setShowColumnsMenu] = useState(false)
  const columnsMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (columnsMenuRef.current && !columnsMenuRef.current.contains(e.target as Node)) setShowColumnsMenu(false)
    }
    if (showColumnsMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showColumnsMenu])

  const { data: settings } = useQuery({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const decimals = (settings as Record<string, unknown>)?.doc_amount_decimals ?? 2
  const fmt = (n: number) => formatAmount(n, { decimal_places: decimals }, locale)

  const params = useMemo(() => {
    const p: Record<string, string> = {
      from_date: dateFrom,
      to_date: dateTo,
      per_page: String(perPage),
      page: String(page),
    }
    if (branchId) p.branch_id = branchId
    if (costCenterId) p.cost_center_id = costCenterId
    if (accountId) p.account_id = accountId
    if (paymentMethodId) p.payment_method_id = paymentMethodId
    return p
  }, [dateFrom, dateTo, branchId, costCenterId, accountId, paymentMethodId, perPage, page])

  const { data, isLoading } = useQuery<ExpensesReportResponse>({
    queryKey: ['expenses-report', tenantId, params],
    queryFn: () => fetchExpensesReport(tenantId, params),
    enabled: !!tenantId && !!dateFrom && !!dateTo,
  })

  const { data: branchesData } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId,
  })
  const branches = toBranchList(branchesData)

  const { data: costCentersData } = useQuery({
    queryKey: ['cost-centers', tenantId],
    queryFn: () => fetchCostCenters(tenantId, { active_only: '1' }),
    enabled: !!tenantId,
  })
  const costCenters = Array.isArray(costCentersData) ? costCentersData : []

  const { data: paymentMethods = [] } = useQuery({
    queryKey: ['payment-methods', tenantId],
    queryFn: () => fetchPaymentMethods(tenantId, { status: 'active' }),
    enabled: !!tenantId,
  })

  const { data: accountsData } = useQuery({
    queryKey: ['accounts', tenantId, 'expense'],
    queryFn: () => fetchAccounts(tenantId, { type: 'expense', active_only: '1' }),
    enabled: !!tenantId,
  })
  const accountsList: Account[] = Array.isArray(accountsData)
    ? accountsData
    : (accountsData != null && typeof accountsData === 'object' && 'data' in accountsData && Array.isArray((accountsData as { data: Account[] }).data)
      ? (accountsData as { data: Account[] }).data
      : [])

  const filterLbl = {
    branch: t.journal?.branch ?? (lang === 'ar' ? 'الفرع' : 'Branch'),
    costCenter: t.invoices?.costCenter ?? (lang === 'ar' ? 'مركز التكلفة' : 'Cost Center'),
    expenseItem: lang === 'ar' ? 'بند المصروف' : 'Expense Item',
    paymentMethod: lang === 'ar' ? 'طريقة الدفع' : 'Payment method',
  }
  const branchOptions: SearchableSelectOption[] = useMemo(() => [
    { value: 0, label: filterLbl.branch },
    ...branches.map((b) => ({ value: b.id, label: b.code ? `${b.code} - ${b.name}` : b.name })),
  ], [branches, filterLbl.branch])
  const costCenterOptions: SearchableSelectOption[] = useMemo(() => [
    { value: 0, label: filterLbl.costCenter },
    ...costCenters.map((cc) => ({ value: cc.id, label: cc.code ? `${cc.code} - ${cc.name}` : cc.name })),
  ], [costCenters, filterLbl.costCenter])
  const accountOptions: SearchableSelectOption[] = useMemo(() => [
    { value: 0, label: filterLbl.expenseItem },
    ...accountsList.map((a) => ({ value: a.id, label: a.code ? `${a.code} - ${a.name}` : a.name })),
  ], [accountsList, filterLbl.expenseItem])

  const summary = data?.summary ?? { total_without_vat: 0, total_vat: 0, net_total: 0 }
  const rows = data?.rows ?? []
  const sortColumns = useMemo(
    () =>
      EXPENSES_REPORT_COLUMN_KEYS.map((k) => ({
        key: k,
        type: (EXPENSES_NUMERIC_COLUMN_KEYS.includes(k) ? 'number' : k === 'date' ? 'date' : 'string') as 'string' | 'number' | 'date',
        getValue: (r: ExpensesReportRow) => {
          if (k === 'date') return r.date
          if (k === 'amount') return Number(r.amount ?? 0)
          if (k === 'vat') return Number(r.vat ?? 0)
          if (k === 'total') return Number(r.total ?? 0)
          if (k === 'voucher') return r.voucher_number ?? ''
          if (k === 'expenseItem') return r.expense_item_name ?? ''
          if (k === 'costCenter') return r.cost_center_name ?? ''
          if (k === 'description') return r.description ?? ''
          return ''
        },
      })),
    [],
  )
  const { sort, toggleSort, sortedRows } = useClientSort<ExpensesReportRow, ExpensesReportColumnKey>(rows, sortColumns, { locale })
  const totalCount = data?.total ?? rows.length
  const currentPage = data?.current_page ?? page
  const lastPage = data?.last_page ?? 1
  const fromRow = totalCount === 0 ? 0 : (currentPage - 1) * perPage + 1
  const toRow = Math.min(currentPage * perPage, totalCount)
  const textAlign = isRtl ? 'text-right' : 'text-left'
  const reportTitle = lang === 'ar' ? 'تقرير المصروفات' : 'Expenses Report'

  const visibleColumnKeys = useMemo(
    () => EXPENSES_REPORT_COLUMN_KEYS.filter((k) => visibleColumns[k]),
    [visibleColumns],
  )
  const noDataColSpan = Math.max(visibleColumnKeys.length, 1)

  const columnLabels: Record<ExpensesReportColumnKey, string> = useMemo(
    () => ({
      date: lang === 'ar' ? 'التاريخ' : 'Date',
      voucher: lang === 'ar' ? 'رقم السند' : 'Voucher No.',
      expenseItem: lang === 'ar' ? 'بند المصروف' : 'Expense Item',
      costCenter: lang === 'ar' ? 'مركز التكلفة' : 'Cost Center',
      description: lang === 'ar' ? 'البيان / الوصف' : 'Description',
      amount: lang === 'ar' ? 'المبلغ' : 'Amount',
      vat: lang === 'ar' ? 'ض.ق.م' : 'VAT',
      total: lang === 'ar' ? 'الإجمالي شامل الضريبة' : 'Total (incl. VAT)',
    }),
    [lang],
  )

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

  function applyPeriodPreset(preset: ReportPeriodKey | 'custom') {
    setPeriodPreset(preset)
    if (preset !== 'custom') {
      const range = getReportPeriodRange(preset)
      setDateFrom(range.from_date)
      setDateTo(range.to_date)
    }
    setPage(1)
  }

  function onExpenseDateFromChange(value: string) {
    setDateFrom(value)
    setPage(1)
  }

  function onExpenseDateToChange(value: string) {
    setDateTo(value)
    setPage(1)
  }

  const showCustomDateFields = periodPreset === 'custom'
  const labelFrom = lang === 'ar' ? 'من تاريخ' : 'From date'
  const labelTo = lang === 'ar' ? 'إلى تاريخ' : 'To date'
  const labelPeriod = lang === 'ar' ? 'الفترة' : 'Period'

  const filterNativeClass =
    'w-full min-w-0 max-w-full h-10 box-border border border-slate-300 rounded-lg py-0 text-sm leading-10 bg-white focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none ps-3 pe-10'
  const filterRowClass = 'flex flex-wrap items-end gap-2 sm:gap-3'
  /** عرض ثابت 14rem لكل فلتر */
  const filterCellCompact = 'min-w-0 shrink-0 w-56 max-w-56'
  const filterSearchableInputClass =
    'h-10 min-h-[40px] border border-slate-300 rounded-lg py-0 text-sm leading-10 focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500'

  function expenseCellRaw(r: ExpensesReportRow, k: ExpensesReportColumnKey): string {
    switch (k) {
      case 'date':
        return formatDisplayDate(r.date)
      case 'voucher':
        return r.voucher_number
      case 'expenseItem':
        return r.expense_item_name
      case 'costCenter':
        return r.cost_center_name ?? ''
      case 'description':
        return r.description ?? ''
      case 'amount':
        return String(r.amount)
      case 'vat':
        return String(r.vat)
      case 'total':
        return String(r.total)
      default:
        return ''
    }
  }

  function renderExpenseCell(r: ExpensesReportRow, k: ExpensesReportColumnKey): ReactNode {
    switch (k) {
      case 'date':
        return formatDisplayDate(r.date)
      case 'voucher':
        return <span className="font-mono text-slate-800">{r.voucher_number}</span>
      case 'expenseItem':
        return <span className="text-slate-900">{r.expense_item_name}</span>
      case 'costCenter':
        return r.cost_center_name ?? '—'
      case 'description':
        return (
          <span
            className="text-slate-600 max-w-[min(20rem,40vw)] truncate block"
            title={(r.description_full ?? r.description) || undefined}
          >
            {r.description ?? '—'}
          </span>
        )
      case 'amount':
        return <span className="tabular-nums font-medium">{fmt(r.amount)}</span>
      case 'vat':
        return <span className="tabular-nums">{fmt(r.vat)}</span>
      case 'total':
        return <span className="tabular-nums font-semibold">{fmt(r.total)}</span>
      default:
        return null
    }
  }

  function handlePrint() {
    const win = window.open('', '_blank')
    if (!win || !data) return
    const keys = visibleColumnKeys.length > 0 ? visibleColumnKeys : EXPENSES_REPORT_COLUMN_KEYS
    if (keys.length === 0) {
      win.document.write(
        `<!DOCTYPE html><html dir="${isRtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${reportTitle}</title></head><body><p>${lang === 'ar' ? 'لا أعمدة معروضة' : 'No columns visible'}</p></body></html>`,
      )
      win.document.close()
      win.focus()
      setTimeout(() => {
        win.print()
        win.close()
      }, 300)
      return
    }
    const ths = keys.map((k) => `<th>${columnLabels[k]}</th>`).join('')
    const rowsHtml = rows
      .map((r: ExpensesReportRow) => {
        const tds = keys
          .map((k) => {
            const cls = k === 'amount' || k === 'vat' || k === 'total' ? ' class="num"' : ''
            return `<td${cls}>${expenseCellRaw(r, k)}</td>`
          })
          .join('')
        return `<tr>${tds}</tr>`
      })
      .join('')
    win.document.write(`
      <!DOCTYPE html><html dir="${isRtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${reportTitle}</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;} table{width:100%;border-collapse:collapse;} th,td{border:1px solid #ddd;padding:8px;} th{background:#f1f5f9;} .num{text-align:right;}</style>
      </head><body>
      <h2>${reportTitle}</h2>
      <p>${t.payments?.dateFrom ?? (lang === 'ar' ? 'من تاريخ' : 'From date')}: ${dateFrom} — ${t.payments?.dateTo ?? (lang === 'ar' ? 'إلى تاريخ' : 'To date')}: ${dateTo}</p>
      <table><thead><tr>${ths}</tr></thead><tbody>${rowsHtml}</tbody></table>
      </body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 300)
  }

  function handleExportExcel() {
    const keys = visibleColumnKeys.length > 0 ? visibleColumnKeys : EXPENSES_REPORT_COLUMN_KEYS
    if (keys.length === 0) {
      const msg = lang === 'ar' ? 'لا أعمدة معروضة' : 'No columns visible'
      const blob = new Blob(['\ufeff' + msg + '\n'], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `expenses-report-${dateFrom}-${dateTo}.csv`
      a.click()
      URL.revokeObjectURL(url)
      return
    }
    const headers = keys.map((k) => columnLabels[k])
    const lines = [headers.join(',')]
    rows.forEach((r: ExpensesReportRow) => {
      lines.push(keys.map((k) => expenseCellRaw(r, k)).join(','))
    })
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `expenses-report-${dateFrom}-${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="px-0 py-3 space-y-3 w-full min-w-0 max-w-full">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-1.5">
        <h1 className="text-base font-semibold text-slate-900 truncate shrink-0 leading-tight">{reportTitle}</h1>
        <div className="flex-1 flex justify-center min-w-0">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-600 shrink-0">{labelPeriod}</span>
              <select
                value={periodPreset}
                onChange={(e) => applyPeriodPreset((e.target.value as ReportPeriodKey | 'custom') || 'all')}
                className="h-10 box-border border border-slate-300 rounded-lg py-0 ps-3 pe-10 text-sm leading-10 min-w-[140px] max-w-[200px] bg-white shrink-0 focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none"
                style={{ textAlign: isRtl ? 'right' : 'left' }}
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
              <div className="flex flex-wrap items-center gap-2 justify-center">
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-sm text-slate-600 whitespace-nowrap">{labelFrom}</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => onExpenseDateFromChange(e.target.value)}
                    className="h-10 box-border border border-slate-300 rounded-lg px-2 py-0 text-sm w-[140px] min-w-[140px] bg-white leading-normal focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none"
                    title={labelFrom}
                  />
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-sm text-slate-600 whitespace-nowrap">{labelTo}</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => onExpenseDateToChange(e.target.value)}
                    className="h-10 box-border border border-slate-300 rounded-lg px-2 py-0 text-sm w-[140px] min-w-[140px] bg-white leading-normal focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none"
                    title={labelTo}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
        <div dir="ltr" className="relative z-[120] flex flex-wrap items-center gap-1.5 no-print shrink-0">
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={!data || rows.length === 0}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 no-print"
            title={t.payments?.exportExcel ?? (lang === 'ar' ? 'تصدير Excel' : 'Export Excel')}
          >
            <FileSpreadsheet size={15} />
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={!data}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#344054] text-white hover:bg-[#2d3846] disabled:opacity-50 no-print"
            title={t.payments?.exportPdf ?? 'PDF'}
          >
            <FileText size={15} />
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={!data}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#F0F2F5] border border-[#D9DCE0] text-[#344054] hover:bg-[#E4E7EB] disabled:opacity-50 no-print"
            title={t.payments?.printReport ?? (lang === 'ar' ? 'طباعة التقرير' : 'Print report')}
          >
            <Printer size={15} />
          </button>
          <div className="relative" ref={columnsMenuRef}>
            <button
              type="button"
              onClick={() => setShowColumnsMenu((v) => !v)}
              aria-expanded={showColumnsMenu}
              aria-haspopup="true"
              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#D9DCE0] bg-[#F0F2F5] text-[#344054] shadow-sm transition-colors hover:bg-[#E4E7EB] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 ${showColumnsMenu ? 'bg-[#E4E7EB] ring-1 ring-slate-300/80' : ''}`}
              title={lang === 'ar' ? 'تخصيص الأعمدة' : 'Customize columns'}
            >
              <Columns3 size={16} strokeWidth={2} aria-hidden />
            </button>
            {showColumnsMenu && (
              <div className="absolute top-full end-0 mt-1 z-50 min-w-[200px] bg-white border border-slate-200 rounded-lg shadow-lg py-2 max-h-72 overflow-y-auto">
                <p className="px-3 py-1.5 text-xs font-semibold text-slate-500 border-b border-slate-100 mb-1">
                  {lang === 'ar' ? 'إظهار الأعمدة' : 'Show columns'}
                </p>
                {EXPENSES_REPORT_COLUMN_KEYS.map((key) => (
                  <label key={key} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={visibleColumns[key]}
                      onChange={(e) => setVisibleColumns((prev) => ({ ...prev, [key]: e.target.checked }))}
                      className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-slate-700 text-xs">{columnLabels[key]}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* فلاتر: الاسم داخل الحقل + عرض أقصى أضيق */}
      <div className={`bg-white rounded-xl border border-slate-200 p-4 ${filterRowClass}`}>
        <div className={filterCellCompact}>
          <SearchableSelect
            options={branchOptions}
            value={branchId ? Number(branchId) : 0}
            onChange={(v) => setBranchId(v && v !== 0 ? String(v) : '')}
            placeholder={filterLbl.branch}
            textAlign={isRtl ? 'right' : 'left'}
            className="w-full min-w-0"
            inputClassName={filterSearchableInputClass}
            aria-label={filterLbl.branch}
          />
        </div>
        <div className={filterCellCompact}>
          <SearchableSelect
            options={costCenterOptions}
            value={costCenterId ? Number(costCenterId) : 0}
            onChange={(v) => setCostCenterId(v && v !== 0 ? String(v) : '')}
            placeholder={filterLbl.costCenter}
            textAlign={isRtl ? 'right' : 'left'}
            className="w-full min-w-0"
            inputClassName={filterSearchableInputClass}
            aria-label={filterLbl.costCenter}
          />
        </div>
        <div className={filterCellCompact}>
          <SearchableSelect
            options={accountOptions}
            value={accountId ? Number(accountId) : 0}
            onChange={(v) => setAccountId(v && v !== 0 ? String(v) : '')}
            placeholder={filterLbl.expenseItem}
            textAlign={isRtl ? 'right' : 'left'}
            className="w-full min-w-0"
            inputClassName={filterSearchableInputClass}
            aria-label={filterLbl.expenseItem}
          />
        </div>
        <div className={filterCellCompact}>
          <select
            value={paymentMethodId}
            onChange={(e) => setPaymentMethodId(e.target.value)}
            className={filterNativeClass}
            style={{ textAlign: isRtl ? 'right' : 'left' }}
            aria-label={filterLbl.paymentMethod}
            title={filterLbl.paymentMethod}
          >
            <option value="">{filterLbl.paymentMethod}</option>
            {paymentMethods.map((pm: { id: number; name: string }) => (
              <option key={pm.id} value={pm.id}>{pm.name}</option>
            ))}
          </select>
        </div>
        <div className={filterCellCompact}>
          <PageSizeSelect
            value={perPage}
            onChange={(val) => {
              setPerPage(val)
              setPage(1)
            }}
            showLabel={false}
            ariaLabel={lang === 'ar' ? 'عدد السجلات' : 'Records per page'}
            className="w-full min-w-0"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-48">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-500 border-t-transparent" />
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm table-fixed">
                {visibleColumnKeys.length > 0 && (
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                      {visibleColumnKeys.map((k) => (
                        <SortableTh
                          key={k}
                          label={columnLabels[k]}
                          sortKey={k}
                          sortState={sort}
                          onToggle={toggleSort}
                          className={`${EXPENSES_NUMERIC_COLUMN_KEYS.includes(k) ? 'text-right tabular-nums' : textAlign} font-medium`}
                        />
                      ))}
                    </tr>
                  </thead>
                )}
                <tbody className="divide-y divide-slate-200">
                  {visibleColumnKeys.length === 0 ? (
                    <tr>
                      <td className="text-center py-12 text-slate-400">
                        {lang === 'ar'
                          ? 'فعّل عموداً واحداً على الأقل من زر تخصيص الأعمدة'
                          : 'Enable at least one column using the column customize button'}
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={noDataColSpan} className="text-center py-12 text-slate-400">
                        {t.noData}
                      </td>
                    </tr>
                  ) : (
                    sortedRows.map((r: ExpensesReportRow, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                        {visibleColumnKeys.map((k) => (
                          <td
                            key={k}
                            className={`px-4 py-3 ${EXPENSES_NUMERIC_COLUMN_KEYS.includes(k) ? 'text-right' : textAlign}`}
                            dir={EXPENSES_NUMERIC_COLUMN_KEYS.includes(k) ? 'ltr' : undefined}
                          >
                            {renderExpenseCell(r, k)}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
                {rows.length > 0 && visibleColumnKeys.length > 0 && (
                  <tfoot>
                    <tr className="bg-gradient-to-r from-slate-100 to-slate-50 border-t-2 border-slate-400 font-bold text-slate-900 shadow-[0_-2px_4px_rgba(0,0,0,0.04)]">
                      {(() => {
                        const keys = visibleColumnKeys
                        const idxFirstNumeric = keys.findIndex((k) => EXPENSES_NUMERIC_COLUMN_KEYS.includes(k))
                        const summaryNum = (k: ExpensesReportColumnKey) =>
                          k === 'amount'
                            ? summary.total_without_vat
                            : k === 'vat'
                              ? summary.total_vat
                              : k === 'total'
                                ? summary.net_total
                                : 0
                        const numericCellClass = (k: ExpensesReportColumnKey) =>
                          `p-3 text-sm tabular-nums font-semibold leading-tight ${isRtl ? 'text-right' : 'text-center'} ${k === 'total' ? 'text-primary-700' : ''}`

                        if (idxFirstNumeric < 0) {
                          return (
                            <td colSpan={noDataColSpan} className={`${textAlign} p-3 text-sm leading-tight`}>
                              <span className="me-2">{lang === 'ar' ? 'الإجمالي' : 'Total'}:</span>
                              <span className="tabular-nums font-semibold" dir="ltr">
                                {fmt(summary.total_without_vat)}
                              </span>
                              <span className="mx-2 opacity-60">·</span>
                              <span>{lang === 'ar' ? 'ض.ق.م' : 'VAT'}:</span>{' '}
                              <span className="tabular-nums font-semibold" dir="ltr">
                                {fmt(summary.total_vat)}
                              </span>
                              <span className="mx-2 opacity-60">·</span>
                              <span className="text-primary-700">
                                {lang === 'ar' ? 'الصافي' : 'Net'}:{' '}
                                <span className="tabular-nums font-semibold" dir="ltr">
                                  {fmt(summary.net_total)}
                                </span>
                              </span>
                              <span className="mx-2 opacity-60">·</span>
                              <span>{lang === 'ar' ? 'عدد السجلات' : 'Total records'}:</span>{' '}
                              <span className="tabular-nums font-semibold">{totalCount}</span>
                            </td>
                          )
                        }

                        if (idxFirstNumeric === 0) {
                          return (
                            <>
                              {keys.map((k, i) => (
                                <td key={k} className={numericCellClass(k)} dir="ltr">
                                  <div>{fmt(summaryNum(k))}</div>
                                  {i === keys.length - 1 && (
                                    <div className="text-xs font-normal text-slate-600 mt-1">
                                      {lang === 'ar' ? 'عدد السجلات' : 'Total records'}:{' '}
                                      <span className="tabular-nums font-semibold text-slate-800">{totalCount}</span>
                                    </div>
                                  )}
                                </td>
                              ))}
                            </>
                          )
                        }

                        return (
                          <>
                            <td colSpan={idxFirstNumeric} className={`${textAlign} p-3 text-sm leading-tight`}>
                              <span className="me-2">{lang === 'ar' ? 'الإجمالي' : 'Total'}</span>
                              <span className="mx-2 opacity-60">·</span>
                              <span>{lang === 'ar' ? 'عدد السجلات' : 'Total records'}:</span>{' '}
                              <span className="tabular-nums font-semibold">{totalCount}</span>
                            </td>
                            {keys.slice(idxFirstNumeric).map((k) => (
                              <td key={k} className={numericCellClass(k)} dir="ltr">
                                {fmt(summaryNum(k))}
                              </td>
                            ))}
                          </>
                        )
                      })()}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <ReportFooter
              totalCount={totalCount}
              currentPage={currentPage}
              lastPage={lastPage}
              from={fromRow}
              to={toRow}
              onPageChange={setPage}
              lang={lang as 'ar' | 'en'}
              isRtl={isRtl}
              alwaysShowPaginationBar
              showRecordSummary={totalCount > 0}
              recordLabel={lang === 'ar' ? 'سجل' : 'record'}
              dense
            />
          </div>
        </>
      )}
    </div>
  )
}
