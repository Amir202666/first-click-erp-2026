import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchInstallmentsExpectedCollection, fetchSettings } from '../../api/tenant'
import { formatDisplayDate } from '../../utils/date'
import { formatAmount } from '../../utils/currency'
import { Columns3, FileSpreadsheet, FileText, Printer } from 'lucide-react'
import { usePersistedColumnVisibility } from '../../hooks/usePersistedColumnVisibility'
import { useClientSort } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'
import ReportFooter from '../../components/ui/ReportFooter'

type ExpectedRow = {
  id: number
  number: string
  customer_name: string | null
  due_date: string
  amount: number
  paid_amount: number
  remaining: number
}
type ExpectedColumnKey = 'number' | 'customer_name' | 'due_date' | 'amount' | 'paid_amount' | 'remaining'
type ExpectedSortKey = ExpectedColumnKey

const EXPECTED_COLUMN_KEYS: ExpectedColumnKey[] = [
  'number',
  'due_date',
  'customer_name',
  'amount',
  'paid_amount',
  'remaining',
]
const EXPECTED_COLUMNS_STORAGE_KEY = 'expectedCollectionVisibleColumns'
const COLUMNS_MENU_WIDTH_PX = 220
const COLUMNS_MENU_VIEWPORT_MARGIN_PX = 8

function clampColumnsMenuLeft(rect: DOMRect, isRtl: boolean): number {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
  const w = COLUMNS_MENU_WIDTH_PX
  const m = COLUMNS_MENU_VIEWPORT_MARGIN_PX
  if (isRtl) {
    let left = rect.left
    left = Math.min(left, vw - w - m)
    return Math.max(m, left)
  }
  let left = rect.right - w
  left = Math.min(left, vw - w - m)
  return Math.max(m, left)
}

function nextMonthYMD(): string {
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

export default function InstallmentsExpectedCollectionReport() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'

  const [month, setMonth] = useState(() => nextMonthYMD())
  const [perPage, setPerPage] = useState(25)
  const [page, setPage] = useState(1)
  const [showColumnsMenu, setShowColumnsMenu] = useState(false)
  const columnsMenuRef = useRef<HTMLDivElement>(null)
  const [columnsMenuAnchor, setColumnsMenuAnchor] = useState<{ rect: DOMRect } | null>(null)
  const [visibleColumns, setVisibleColumns] = usePersistedColumnVisibility<ExpectedColumnKey>(
    EXPECTED_COLUMNS_STORAGE_KEY,
    EXPECTED_COLUMN_KEYS,
  )

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (columnsMenuRef.current && !columnsMenuRef.current.contains(e.target as Node)) setShowColumnsMenu(false)
    }
    if (showColumnsMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showColumnsMenu])

  useEffect(() => {
    if (!showColumnsMenu) {
      setColumnsMenuAnchor(null)
      return
    }
    const close = () => setShowColumnsMenu(false)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [showColumnsMenu])

  const { data: settings } = useQuery({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const fmt = (n: number) => formatAmount(n, { decimal_places: settings?.doc_amount_decimals ?? 3 }, locale)

  const { data, isLoading } = useQuery({
    queryKey: ['installments-expected-collection', tenantId, month],
    queryFn: () => fetchInstallmentsExpectedCollection(tenantId, { month: month + '-01' }),
    enabled: !!tenantId,
  })

  const rows: ExpectedRow[] = (data?.data ?? []) as ExpectedRow[]
  const totalExpected = data?.total_expected ?? 0
  const expectedSortColumns = useMemo(
    () => [
      { key: 'number' as ExpectedSortKey, type: 'string' as const, getValue: (r: ExpectedRow) => r.number ?? '' },
      { key: 'due_date' as ExpectedSortKey, type: 'date' as const, getValue: (r: ExpectedRow) => r.due_date },
      { key: 'customer_name' as ExpectedSortKey, type: 'string' as const, getValue: (r: ExpectedRow) => r.customer_name ?? '' },
      { key: 'amount' as ExpectedSortKey, type: 'number' as const, getValue: (r: ExpectedRow) => Number(r.amount) },
      { key: 'paid_amount' as ExpectedSortKey, type: 'number' as const, getValue: (r: ExpectedRow) => Number(r.paid_amount) },
      { key: 'remaining' as ExpectedSortKey, type: 'number' as const, getValue: (r: ExpectedRow) => Number(r.remaining) },
    ],
    [],
  )
  const { sort, toggleSort, sortedRows } = useClientSort<ExpectedRow, ExpectedSortKey>(rows, expectedSortColumns, { locale })
  const reportTitle = t.installments?.expectedCollectionTitle ?? 'التحصيل المتوقع'
  const visibleColumnKeys = useMemo(() => EXPECTED_COLUMN_KEYS.filter((k) => visibleColumns[k]), [visibleColumns])
  const noDataColSpan = Math.max(visibleColumnKeys.length, 1)

  const totals = useMemo(() => {
    let amount = 0
    let paid_amount = 0
    let remaining = 0
    rows.forEach((r) => {
      amount += Number(r.amount) || 0
      paid_amount += Number(r.paid_amount) || 0
      remaining += Number(r.remaining) || 0
    })
    return { amount, paid_amount, remaining }
  }, [rows])

  const totalCount = sortedRows.length
  const lastPage = Math.max(1, Math.ceil(totalCount / perPage) || 1)
  const effectivePage = Math.min(Math.max(1, page), lastPage)
  useEffect(() => {
    setPage((p) => (p > lastPage ? lastPage : p))
  }, [lastPage])
  const from = totalCount === 0 ? 0 : (effectivePage - 1) * perPage + 1
  const to = totalCount === 0 ? 0 : Math.min(effectivePage * perPage, totalCount)
  const pagedRows = useMemo(() => {
    const start = (effectivePage - 1) * perPage
    return sortedRows.slice(start, start + perPage)
  }, [sortedRows, effectivePage, perPage])

  function expectedColumnLabel(key: ExpectedColumnKey): string {
    switch (key) {
      case 'number':
        return t.installments?.number ?? (lang === 'ar' ? 'رقم الجدول' : 'Number')
      case 'customer_name':
        return t.installments?.customer ?? (lang === 'ar' ? 'العميل' : 'Customer')
      case 'due_date':
        return t.installments?.dueDate ?? (lang === 'ar' ? 'تاريخ الاستحقاق' : 'Due date')
      case 'amount':
        return t.amount ?? (lang === 'ar' ? 'المبلغ' : 'Amount')
      case 'paid_amount':
        return t.installments?.paidAmount ?? (lang === 'ar' ? 'المسدد' : 'Paid')
      case 'remaining':
        return t.installments?.remaining ?? (lang === 'ar' ? 'المتبقي' : 'Remaining')
    }
  }

  function handlePrint() {
    const win = window.open('', '_blank')
    if (!win) return

    const keys = visibleColumnKeys.length ? visibleColumnKeys : EXPECTED_COLUMN_KEYS
    const headerHtml = keys.map((k) => `<th>${expectedColumnLabel(k)}</th>`).join('')
    const rowsHtml = sortedRows
      .map((r) => {
        const cells = keys
          .map((k) => {
            if (k === 'number') return `<td>${r.number}</td>`
            if (k === 'customer_name') return `<td>${r.customer_name ?? '—'}</td>`
            if (k === 'due_date') return `<td>${formatDisplayDate(r.due_date)}</td>`
            if (k === 'amount') return `<td class="num">${fmt(r.amount)}</td>`
            if (k === 'paid_amount') return `<td class="num">${fmt(r.paid_amount)}</td>`
            return `<td class="num">${fmt(r.remaining)}</td>`
          })
          .join('')
        return `<tr>${cells}</tr>`
      })
      .join('')

    const totalLabel = t.installments?.totalExpected ?? (lang === 'ar' ? 'إجمالي المتوقع' : 'Total expected')
    const valueKey = (['remaining', 'amount', 'paid_amount'] as ExpectedColumnKey[]).find((k) => keys.includes(k)) ?? keys[keys.length - 1]
    const footerCells = keys
      .map((k, idx) => {
        if (k === valueKey) return `<td class="num"><strong>${fmt(totalExpected)}</strong></td>`
        if (idx === 0) return `<td><strong>${totalLabel}</strong></td>`
        return `<td></td>`
      })
      .join('')
    win.document.write(`
      <!DOCTYPE html><html dir="${isRtl ? 'rtl' : 'ltr'}"><head>
        <meta charset="utf-8"><title>${reportTitle}</title>
        <style>body{font-family:Arial,sans-serif;padding:24px;} table{width:100%;border-collapse:collapse;} th,td{border:1px solid #ddd;padding:8px;} th{background:#f1f5f9;} .num{text-align:right;} .total{font-weight:400;border-top:2px solid #334155;}</style>
      </head><body>
        <h2>${reportTitle}</h2>
        <p>${t.installments?.month ?? 'الشهر'}: ${month}</p>
        <table><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody><tfoot><tr class="total">${footerCells}</tr></tfoot></table>
      </body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 300)
  }

  function handleExportCsv() {
    const keys = visibleColumnKeys.length ? visibleColumnKeys : EXPECTED_COLUMN_KEYS
    const headers = keys.map((k) => expectedColumnLabel(k))
    const lines = [headers.join(',')]

    sortedRows.forEach((r) => {
      const cells = keys.map((k) => {
        if (k === 'number') return String(r.number ?? '')
        if (k === 'customer_name') return `"${String(r.customer_name ?? '').replace(/"/g, '""')}"`
        if (k === 'due_date') return formatDisplayDate(r.due_date)
        if (k === 'amount') return String(r.amount)
        if (k === 'paid_amount') return String(r.paid_amount)
        return String(r.remaining)
      })
      lines.push(cells.join(','))
    })

    const totalLabel = t.installments?.totalExpected ?? 'Total Expected'
    const valueKey = (['remaining', 'amount', 'paid_amount'] as ExpectedColumnKey[]).find((k) => keys.includes(k)) ?? keys[keys.length - 1]
    lines.push('')
    lines.push(
      keys
        .map((k, idx) => {
          if (k === valueKey) return String(totalExpected)
          if (idx === 0) return `"${String(totalLabel).replace(/"/g, '""')}"`
          return ''
        })
        .join(','),
    )
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `expected-collection-${month}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-1.5">
        <h1 className="text-base font-semibold text-slate-900 truncate shrink-0 leading-tight">{reportTitle}</h1>
        <div className="flex-1 flex justify-center min-w-0">
          <label className="flex items-center gap-2 text-sm text-slate-600 shrink-0">
            {t.installments?.month ?? 'الشهر'}
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="h-10 box-border border border-slate-300 rounded-lg px-3 py-0 text-sm leading-10 bg-white focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none"
              style={{ textAlign: isRtl ? 'right' : 'left' }}
            />
          </label>
        </div>
        <div dir="ltr" className="relative z-[120] flex flex-wrap items-center gap-1.5 no-print shrink-0">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={isLoading}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
            title={t.exportCsv}
          >
            <FileSpreadsheet size={15} />
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={isLoading}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#344054] text-white hover:bg-[#2d3846] disabled:opacity-50"
            title={lang === 'ar' ? 'تصدير PDF' : 'Export PDF'}
          >
            <FileText size={15} />
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
          <div className="relative" ref={columnsMenuRef}>
            <button
              type="button"
              onClick={(e) => {
                const next = !showColumnsMenu
                if (next) {
                  setColumnsMenuAnchor({ rect: (e.currentTarget as HTMLButtonElement).getBoundingClientRect() })
                } else {
                  setColumnsMenuAnchor(null)
                }
                setShowColumnsMenu(next)
              }}
              aria-expanded={showColumnsMenu}
              aria-haspopup="true"
              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#D9DCE0] bg-[#F0F2F5] text-[#344054] shadow-sm transition-colors hover:bg-[#E4E7EB] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 ${showColumnsMenu ? 'bg-[#E4E7EB] ring-1 ring-slate-300/80' : ''}`}
              title={lang === 'ar' ? 'تخصيص الأعمدة' : 'Customize columns'}
            >
              <Columns3 size={16} strokeWidth={2} aria-hidden />
            </button>
            {showColumnsMenu && (
              <div
                className="fixed z-[300] w-[220px] bg-white border border-slate-200 rounded-lg shadow-lg py-2 max-h-72 overflow-y-auto"
                style={{
                  top: (columnsMenuAnchor?.rect.bottom ?? 0) + 4,
                  left: columnsMenuAnchor ? clampColumnsMenuLeft(columnsMenuAnchor.rect, isRtl) : 0,
                }}
              >
                <p className="px-3 py-1.5 text-xs font-semibold text-slate-500 border-b border-slate-100 mb-1">
                  {lang === 'ar' ? 'إظهار الأعمدة' : 'Show columns'}
                </p>
                {EXPECTED_COLUMN_KEYS.map((key) => (
                  <label key={key} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={visibleColumns[key]}
                      onChange={(e) => setVisibleColumns((prev) => ({ ...prev, [key]: e.target.checked }))}
                      className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-slate-700 text-xs">{expectedColumnLabel(key)}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="p-8 text-center text-slate-500">{t.loading}</div>
        ) : (
          <>
            {sortedRows.length === 0 ? (
              <div className="p-8 text-center text-slate-500">{t.noData}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full table-fixed text-sm" dir={isRtl ? 'rtl' : 'ltr'}>
                  <thead className="border-b border-slate-200 bg-slate-50">
                    <tr>
                      {visibleColumns.number && (
                        <SortableTh
                          headerLayout="clusterCenter"
                          label={expectedColumnLabel('number')}
                          sortKey="number"
                          sortState={sort}
                          onToggle={toggleSort}
                          widthClassName="w-36"
                          className="p-0 text-center font-medium text-slate-700"
                        />
                      )}
                      {visibleColumns.due_date && (
                        <SortableTh
                          headerLayout="clusterCenter"
                          label={expectedColumnLabel('due_date')}
                          sortKey="due_date"
                          sortState={sort}
                          onToggle={toggleSort}
                          widthClassName="w-36"
                          className="p-0 text-center font-medium text-slate-700"
                        />
                      )}
                      {visibleColumns.customer_name && (
                        <SortableTh
                          headerLayout="clusterCenter"
                          label={expectedColumnLabel('customer_name')}
                          sortKey="customer_name"
                          sortState={sort}
                          onToggle={toggleSort}
                          widthClassName="w-56"
                          className="p-0 text-center font-medium text-slate-700"
                        />
                      )}
                      {visibleColumns.amount && (
                        <SortableTh
                          headerLayout="clusterCenter"
                          label={expectedColumnLabel('amount')}
                          sortKey="amount"
                          sortState={sort}
                          onToggle={toggleSort}
                          widthClassName="w-32"
                          className="p-0 text-center font-medium text-slate-700"
                        />
                      )}
                      {visibleColumns.paid_amount && (
                        <SortableTh
                          headerLayout="clusterCenter"
                          label={expectedColumnLabel('paid_amount')}
                          sortKey="paid_amount"
                          sortState={sort}
                          onToggle={toggleSort}
                          widthClassName="w-32"
                          className="p-0 text-center font-medium text-slate-700"
                        />
                      )}
                      {visibleColumns.remaining && (
                        <SortableTh
                          headerLayout="clusterCenter"
                          label={expectedColumnLabel('remaining')}
                          sortKey="remaining"
                          sortState={sort}
                          onToggle={toggleSort}
                          widthClassName="w-32"
                          className="p-0 text-center font-medium text-slate-700"
                        />
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.map((r) => (
                      <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                        {visibleColumns.number && <td className="p-3 text-center align-middle">{r.number}</td>}
                        {visibleColumns.due_date && <td className="p-3 text-center align-middle">{formatDisplayDate(r.due_date)}</td>}
                        {visibleColumns.customer_name && <td className="p-3 text-center align-middle">{r.customer_name ?? '—'}</td>}
                        {visibleColumns.amount && <td className="p-3 text-center align-middle font-nums">{fmt(r.amount)}</td>}
                        {visibleColumns.paid_amount && <td className="p-3 text-center align-middle font-nums">{fmt(r.paid_amount)}</td>}
                        {visibleColumns.remaining && <td className="p-3 text-center align-middle font-nums">{fmt(r.remaining)}</td>}
                      </tr>
                    ))}
                  </tbody>
                  {totalCount > 0 && (() => {
                    const keys = visibleColumnKeys.length ? visibleColumnKeys : EXPECTED_COLUMN_KEYS
                    const labelKeys = keys.filter((k) => !['amount', 'paid_amount', 'remaining'].includes(k))
                    const numericKeys = keys.filter((k) => ['amount', 'paid_amount', 'remaining'].includes(k))
                    if (numericKeys.length === 0) return null
                    return (
                      <tfoot>
                        <tr className="bg-gradient-to-r from-slate-100 to-slate-50 border-t-2 border-slate-400 font-bold text-slate-900 shadow-[0_-2px_4px_rgba(0,0,0,0.04)]">
                          {labelKeys.length > 0 ? (
                            <td colSpan={labelKeys.length} className="p-3 text-sm text-center">
                              {t.installments?.totalExpected ?? (lang === 'ar' ? 'إجمالي المتوقع' : 'Total expected')}
                            </td>
                          ) : (
                            <td className="p-3 text-sm text-center">
                              {t.installments?.totalExpected ?? (lang === 'ar' ? 'إجمالي المتوقع' : 'Total expected')}
                            </td>
                          )}
                          {numericKeys.map((k) => (
                            <td key={k} className="p-3 text-center text-sm tabular-nums font-semibold font-nums" dir="ltr">
                              {k === 'amount' ? fmt(totals.amount) : k === 'paid_amount' ? fmt(totals.paid_amount) : fmt(totalExpected || totals.remaining)}
                            </td>
                          ))}
                        </tr>
                      </tfoot>
                    )
                  })()}
                </table>
              </div>
            )}
          </>
        )}
      </div>

      <ReportFooter
        totalCount={totalCount}
        currentPage={effectivePage}
        lastPage={lastPage}
        from={from}
        to={to}
        onPageChange={setPage}
        lang={lang === 'ar' ? 'ar' : 'en'}
        isRtl={isRtl}
        alwaysShowPaginationBar
        showRecordSummary={totalCount > 0}
        recordLabel={lang === 'ar' ? 'سجل' : 'record'}
        dense
      />
    </div>
  )
}
