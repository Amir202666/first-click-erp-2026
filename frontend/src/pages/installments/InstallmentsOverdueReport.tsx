import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import type { CostCenter } from '../../types'
import {
  fetchInstallmentsOverdue,
  fetchSettings,
  fetchCustomers,
  fetchBranches,
  fetchCostCenters,
} from '../../api/tenant'
import { formatDisplayDate } from '../../utils/date'
import { formatAmount } from '../../utils/currency'
import { toLocalDateString } from '../../utils/date'
import { FileSpreadsheet, FileText, Printer, Columns3 } from 'lucide-react'
import { useClientSort } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'
import { usePersistedColumnVisibility } from '../../hooks/usePersistedColumnVisibility'
import ReportFooter from '../../components/ui/ReportFooter'
import { filterBarOverflowClass, filterSelectNineLightClass } from '../../utils/filterControlStyles'

type OverdueRow = { id: number; number: string; customer_name: string | null; due_date: string; amount: number; paid_amount: number; remaining: number; days_overdue: number }
type OverdueSortKey = 'number' | 'customer_name' | 'due_date' | 'amount' | 'paid_amount' | 'remaining' | 'days_overdue'
type OverdueColumnKey = OverdueSortKey

const COLUMN_KEYS: OverdueColumnKey[] = ['number', 'due_date', 'customer_name', 'amount', 'paid_amount', 'remaining', 'days_overdue']
const STORAGE_KEY = 'installmentsOverdueVisibleColumns'
const PAGE_SIZES = [10, 25, 50, 100]

export default function InstallmentsOverdueReport() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl, getDisplayName } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'

  const [asOf, setAsOf] = useState(() => toLocalDateString(new Date()))
  const [customerIdFilter, setCustomerIdFilter] = useState('')
  const [branchFilter, setBranchFilter] = useState('')
  const [costCenterFilter, setCostCenterFilter] = useState('')
  const [pageSize, setPageSize] = useState(25)
  const [page, setPage] = useState(1)
  const [visibleColumns, setVisibleColumns] = usePersistedColumnVisibility(STORAGE_KEY, COLUMN_KEYS)
  const [showColumnsMenu, setShowColumnsMenu] = useState(false)
  const columnsMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setPage(1)
  }, [asOf, customerIdFilter, branchFilter, costCenterFilter])

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
  const fmt = (n: number) => formatAmount(n, { decimal_places: settings?.doc_amount_decimals ?? 3 }, locale)

  const overdueParams = useMemo(() => {
    const p: Record<string, string> = {
      as_of: asOf,
      per_page: String(pageSize),
      page: String(page),
    }
    if (customerIdFilter) p.customer_id = customerIdFilter
    if (branchFilter) p.branch_id = branchFilter
    if (costCenterFilter) p.cost_center_id = costCenterFilter
    return p
  }, [asOf, customerIdFilter, branchFilter, costCenterFilter, pageSize, page])

  const { data: customersData } = useQuery({
    queryKey: ['customers', tenantId, 'overdue-report'],
    queryFn: () => fetchCustomers(tenantId, { per_page: '500' }),
    enabled: !!tenantId,
  })
  const customers = (customersData as { data?: { id: number; name: string }[] })?.data ?? []

  const { data: branches = [] } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId,
  })

  const { data: costCenters = [] } = useQuery<CostCenter[]>({
    queryKey: ['cost-centers', tenantId],
    queryFn: () => fetchCostCenters(tenantId),
    enabled: !!tenantId,
  })

  const { data: overdueResp, isLoading } = useQuery({
    queryKey: ['installments-overdue', tenantId, overdueParams],
    queryFn: () => fetchInstallmentsOverdue(tenantId, overdueParams),
    enabled: !!tenantId,
  })

  const rows: OverdueRow[] = overdueResp?.data ?? []
  const totalCount = overdueResp?.total ?? 0
  const currentPage = overdueResp?.current_page ?? page
  const lastPage = overdueResp?.last_page ?? 1
  const perPageResp = overdueResp?.per_page ?? pageSize
  const fromRow = totalCount === 0 ? 0 : (currentPage - 1) * perPageResp + 1
  const toRow = totalCount === 0 ? 0 : Math.min(currentPage * perPageResp, totalCount)

  const filterSelectCls = `${filterSelectNineLightClass} w-full font-semibold text-xs`
  const filterPageSizeCls = `${filterSelectNineLightClass} w-full text-center font-semibold tabular-nums`
  const overdueSortColumns = useMemo(
    () => [
      { key: 'number' as OverdueSortKey, type: 'string' as const, getValue: (r: OverdueRow) => r.number ?? '' },
      { key: 'due_date' as OverdueSortKey, type: 'date' as const, getValue: (r: OverdueRow) => r.due_date },
      { key: 'customer_name' as OverdueSortKey, type: 'string' as const, getValue: (r: OverdueRow) => r.customer_name ?? '' },
      { key: 'amount' as OverdueSortKey, type: 'number' as const, getValue: (r: OverdueRow) => Number(r.amount) },
      { key: 'paid_amount' as OverdueSortKey, type: 'number' as const, getValue: (r: OverdueRow) => Number(r.paid_amount) },
      { key: 'remaining' as OverdueSortKey, type: 'number' as const, getValue: (r: OverdueRow) => Number(r.remaining) },
      { key: 'days_overdue' as OverdueSortKey, type: 'number' as const, getValue: (r: OverdueRow) => Number(r.days_overdue) },
    ],
    [],
  )
  const { sort, toggleSort, sortedRows } = useClientSort<OverdueRow, OverdueSortKey>(rows, overdueSortColumns, { locale })
  const reportTitle = t.installments?.overdueTitle ?? 'الأقساط المتأخرة'

  const columnLabels: Record<OverdueColumnKey, string> = useMemo(
    () => ({
      number: t.installments?.number ?? '',
      customer_name: t.installments?.customer ?? '',
      due_date: t.installments?.dueDate ?? '',
      amount: t.amount,
      paid_amount: t.installments?.paidAmount ?? '',
      remaining: t.installments?.remaining ?? '',
      days_overdue: t.installments?.daysOverdue ?? '',
    }),
    [t],
  )

  const visibleColumnKeys = COLUMN_KEYS.filter((k) => visibleColumns[k])

  function toggleColumn(key: OverdueColumnKey, checked: boolean) {
    if (!checked) {
      const nOn = COLUMN_KEYS.filter((k) => visibleColumns[k]).length
      if (nOn <= 1) return
    }
    setVisibleColumns((prev) => ({ ...prev, [key]: checked }))
  }

  function buildPrintTableHtml(): string {
    const keys = visibleColumnKeys
    if (keys.length === 0) return `<p>${lang === 'ar' ? 'لا أعمدة معروضة' : 'No columns visible'}</p>`
    const headerCells = keys.map((k) => `<th>${columnLabels[k]}</th>`).join('')
    const rowsHtml = sortedRows
      .map((r) => {
        const cells = keys
          .map((k) => {
            if (k === 'number') return `<td>${r.number}</td>`
            if (k === 'customer_name') return `<td>${r.customer_name ?? '—'}</td>`
            if (k === 'due_date') return `<td>${formatDisplayDate(r.due_date)}</td>`
            if (k === 'amount') return `<td class="num">${fmt(r.amount)}</td>`
            if (k === 'paid_amount') return `<td class="num">${fmt(r.paid_amount)}</td>`
            if (k === 'remaining') return `<td class="num">${fmt(r.remaining)}</td>`
            if (k === 'days_overdue') return `<td>${r.days_overdue}</td>`
            return '<td></td>'
          })
          .join('')
        return `<tr>${cells}</tr>`
      })
      .join('')
    return `<table><thead><tr>${headerCells}</tr></thead><tbody>${rowsHtml}</tbody></table>`
  }

  function handlePrint() {
    const win = window.open('', '_blank')
    if (!win) return
    const table = buildPrintTableHtml()
    win.document.write(`
<!DOCTYPE html><html dir="${isRtl ? 'rtl' : 'ltr'}"><head>
<meta charset="utf-8"><title>${reportTitle}</title>
<style>body{font-family:Arial,sans-serif;padding:24px;} table{width:100%;border-collapse:collapse;table-layout:auto;} th,td{border:1px solid #ddd;padding:8px;text-align:center;} th{background:#f1f5f9;} .num{text-align:center;}</style>
</head><body>
<h2>${reportTitle}</h2>
<p>${t.installments?.asOf ?? 'حتى تاريخ'}: ${asOf}</p>
${table}
</body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => {
      win.print()
      win.close()
    }, 300)
  }

  function handleExportPdf() {
    window.print()
  }

  function handleExportCsv() {
    const keys = visibleColumnKeys
    if (keys.length === 0) return
    const headers = keys.map((k) => columnLabels[k])
    const lines = [
      headers.join(','),
      ...sortedRows.map((r) =>
        keys
          .map((k) => {
            if (k === 'number') return r.number
            if (k === 'customer_name') return `"${(r.customer_name ?? '').replace(/"/g, '""')}"`
            if (k === 'due_date') return formatDisplayDate(r.due_date)
            if (k === 'amount') return r.amount
            if (k === 'paid_amount') return r.paid_amount
            if (k === 'remaining') return r.remaining
            if (k === 'days_overdue') return r.days_overdue
            return ''
          })
          .join(','),
      ),
    ]
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `installments-overdue-${asOf}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const thBase = 'p-0 text-center align-middle'
  const tdBase = 'px-3 py-2 text-center align-middle'

  /** عرض أضيق لرقم الجدول والتاريخ، وأوسع قليلاً للعميل */
  const colWidthNumber = 'w-[10rem] max-w-[10rem]'
  const colWidthDueDate = 'w-[10rem] max-w-[10rem]'
  const colWidthCustomer = 'min-w-[13.5rem] w-[32%] max-w-[22rem]'

  function tdClass(k: OverdueColumnKey): string {
    let w = ''
    if (k === 'number') w = `${colWidthNumber} whitespace-nowrap`
    else if (k === 'due_date') w = `${colWidthDueDate} whitespace-nowrap`
    else if (k === 'customer_name') w = `${colWidthCustomer} break-words`
    if (k === 'amount' || k === 'paid_amount' || k === 'remaining') return `${tdBase} font-nums tabular-nums ${w}`.trim()
    return `${tdBase} ${w}`.trim()
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 pb-3 no-print">
        <h1 className="text-2xl font-bold text-slate-900 shrink-0 min-w-0">{reportTitle}</h1>
        <div className="flex flex-1 justify-center min-w-[12rem]">
          <label className="flex items-center gap-2 text-sm text-slate-600 whitespace-nowrap">
            <span>{t.installments?.asOf ?? 'حتى تاريخ'}</span>
            <input
              type="date"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
              className="h-9 border border-slate-300 rounded-lg px-3 text-sm bg-white w-[140px]"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <div className="relative" ref={columnsMenuRef}>
            <button
              type="button"
              onClick={() => setShowColumnsMenu((v) => !v)}
              className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-white border border-slate-300 text-slate-600 hover:bg-slate-50"
              title={lang === 'ar' ? 'تخصيص الأعمدة' : 'Customize columns'}
            >
              <Columns3 size={16} />
            </button>
            {showColumnsMenu && (
              <div className="absolute top-full end-0 mt-2 z-30 w-56 rounded-lg border border-slate-200 bg-white shadow-lg py-2 text-sm">
                <div className="px-3 pb-2 text-xs font-semibold text-slate-500">
                  {lang === 'ar' ? 'إظهار/إخفاء الأعمدة' : 'Show / hide columns'}
                </div>
                {COLUMN_KEYS.map((key) => (
                  <label key={key} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={visibleColumns[key]}
                      onChange={(e) => toggleColumn(key, e.target.checked)}
                      className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-slate-700 text-xs">{columnLabels[key]}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-[#F0F2F5] border border-[#D9DCE0] text-[#344054] hover:bg-[#E4E7EB]"
            title={lang === 'ar' ? 'طباعة' : 'Print'}
          >
            <Printer size={16} />
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-[#344054] text-white hover:bg-[#2d3846]"
            title={t.payments?.exportPdf ?? t.accounts?.exportPdf ?? (lang === 'ar' ? 'تصدير PDF' : 'Export PDF')}
          >
            <FileText size={16} />
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-500"
            title={t.exportCsv}
          >
            <FileSpreadsheet size={16} />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 py-2.5 px-3 no-print">
        <div className={`flex flex-nowrap items-center justify-between gap-3 ${filterBarOverflowClass}`}>
          <div className="flex flex-nowrap items-center gap-3 min-w-0 flex-1">
            <div className="min-w-[14rem] w-72 max-w-[22rem] shrink-0">
              <select
                value={customerIdFilter}
                onChange={(e) => setCustomerIdFilter(e.target.value)}
                aria-label={t.installments?.selectCustomer ?? 'العميل'}
                title={t.installments?.selectCustomer ?? 'العميل'}
                className={filterSelectCls}
              >
                <option value="">{t.installments?.selectCustomer ?? 'كل العملاء'}</option>
                {customers.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[12rem] w-56 max-w-[16rem] shrink-0">
              <select
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                aria-label={t.journal.branch}
                title={t.journal.branch}
                className={filterSelectCls}
              >
                <option value="">{t.journal.branch}</option>
                {branches.map((b: { id: number; name: string }) => (
                  <option key={b.id} value={String(b.id)}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[12rem] w-56 max-w-[16rem] shrink-0">
              <select
                value={costCenterFilter}
                onChange={(e) => setCostCenterFilter(e.target.value)}
                aria-label={t.nav.costCenters}
                title={t.nav.costCenters}
                className={filterSelectCls}
              >
                <option value="">{t.nav.costCenters}</option>
                {costCenters.map((cc) => (
                  <option key={cc.id} value={String(cc.id)}>
                    {getDisplayName({ name: cc.name, name_en: cc.name_en ?? null })}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="w-14 shrink-0 flex items-center">
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value))
                setPage(1)
              }}
              title={lang === 'ar' ? 'عدد السجلات في الصفحة' : 'Rows per page'}
              className={filterPageSizeCls}
              aria-label={lang === 'ar' ? 'عدد السجلات في الصفحة' : 'Rows per page'}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden report-print-area">
        {isLoading ? (
          <div className="p-8 text-center text-slate-500">{t.loading}</div>
        ) : visibleColumnKeys.length === 0 ? (
          <div className="p-8 text-center text-slate-500">{lang === 'ar' ? 'فعّل عموداً واحداً على الأقل من تخصيص الأعمدة' : 'Enable at least one column from column settings'}</div>
        ) : (
          <>
            {sortedRows.length === 0 ? (
              <div className="p-8 text-center text-slate-500">{t.noData}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm table-auto min-w-full report-print-table">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                  {visibleColumnKeys.includes('number') && (
                    <SortableTh
                      label={columnLabels.number}
                      sortKey="number"
                      sortState={sort}
                      onToggle={toggleSort}
                      className={thBase}
                      widthClassName={colWidthNumber}
                      headerLayout="clusterCenter"
                      compact
                    />
                  )}
                  {visibleColumnKeys.includes('due_date') && (
                    <SortableTh
                      label={columnLabels.due_date}
                      sortKey="due_date"
                      sortState={sort}
                      onToggle={toggleSort}
                      className={thBase}
                      widthClassName={colWidthDueDate}
                      headerLayout="clusterCenter"
                      compact
                    />
                  )}
                  {visibleColumnKeys.includes('customer_name') && (
                    <SortableTh
                      label={columnLabels.customer_name}
                      sortKey="customer_name"
                      sortState={sort}
                      onToggle={toggleSort}
                      className={thBase}
                      widthClassName={colWidthCustomer}
                      headerLayout="clusterCenter"
                      compact
                    />
                  )}
                  {visibleColumnKeys.includes('amount') && (
                    <SortableTh
                      label={columnLabels.amount}
                      sortKey="amount"
                      sortState={sort}
                      onToggle={toggleSort}
                      className={thBase}
                      headerLayout="clusterCenter"
                      compact
                    />
                  )}
                  {visibleColumnKeys.includes('paid_amount') && (
                    <SortableTh
                      label={columnLabels.paid_amount}
                      sortKey="paid_amount"
                      sortState={sort}
                      onToggle={toggleSort}
                      className={thBase}
                      headerLayout="clusterCenter"
                      compact
                    />
                  )}
                  {visibleColumnKeys.includes('remaining') && (
                    <SortableTh
                      label={columnLabels.remaining}
                      sortKey="remaining"
                      sortState={sort}
                      onToggle={toggleSort}
                      className={thBase}
                      headerLayout="clusterCenter"
                      compact
                    />
                  )}
                  {visibleColumnKeys.includes('days_overdue') && (
                    <SortableTh
                      label={columnLabels.days_overdue}
                      sortKey="days_overdue"
                      sortState={sort}
                      onToggle={toggleSort}
                      className={thBase}
                      headerLayout="clusterCenter"
                      compact
                    />
                  )}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map((r) => (
                      <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                        {visibleColumnKeys.includes('number') && <td className={tdClass('number')}>{r.number}</td>}
                        {visibleColumnKeys.includes('due_date') && <td className={tdClass('due_date')}>{formatDisplayDate(r.due_date)}</td>}
                        {visibleColumnKeys.includes('customer_name') && <td className={tdClass('customer_name')}>{r.customer_name ?? '—'}</td>}
                        {visibleColumnKeys.includes('amount') && <td className={tdClass('amount')}>{fmt(r.amount)}</td>}
                        {visibleColumnKeys.includes('paid_amount') && <td className={tdClass('paid_amount')}>{fmt(r.paid_amount)}</td>}
                        {visibleColumnKeys.includes('remaining') && <td className={tdClass('remaining')}>{fmt(r.remaining)}</td>}
                        {visibleColumnKeys.includes('days_overdue') && <td className={tdClass('days_overdue')}>{r.days_overdue}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!isLoading && overdueResp && (
              <ReportFooter
                totalCount={totalCount}
                currentPage={currentPage}
                lastPage={lastPage}
                from={fromRow}
                to={toRow}
                onPageChange={setPage}
                lang={lang}
                isRtl={isRtl}
                alwaysShowPaginationBar
                showRecordSummary={totalCount > 0}
                recordLabel={lang === 'ar' ? 'قسط' : 'line'}
                dense
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
