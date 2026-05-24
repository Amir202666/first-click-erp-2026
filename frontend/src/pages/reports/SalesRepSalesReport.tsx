import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchSalesRepSalesReport, fetchSalesReps, fetchSettings } from '../../api/tenant'
import type { SalesRepSalesReportResponse, SalesRepSalesReportRow } from '../../api/tenant'
import { getReportPeriodRange, type ReportPeriodKey } from '../../utils/date'
import { formatAmount } from '../../utils/currency'
import { FileSpreadsheet, FileText, Printer, Columns3 } from 'lucide-react'
import { usePersistedColumnVisibility } from '../../hooks/usePersistedColumnVisibility'
import ReportFooter from '../../components/ui/ReportFooter'
import PageSizeSelect from '../../components/ui/PageSizeSelect'
import SearchableSelect, { type SearchableSelectOption } from '../../components/ui/SearchableSelect'
import { useClientSort } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'

type ColumnKey = 'name' | 'region' | 'commission_percent' | 'invoice_count' | 'total_sales' | 'commission'
const allColumnKeys: ColumnKey[] = [
  'name',
  'region',
  'commission_percent',
  'invoice_count',
  'total_sales',
  'commission',
]
const COLUMN_STORAGE_KEY = 'salesRepSalesReportVisibleColumns'

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

function rowCellValue(
  row: SalesRepSalesReportRow,
  key: ColumnKey,
  fmt: (n: number) => string,
): string {
  switch (key) {
    case 'name':
      return row.name
    case 'region':
      return row.region ?? '—'
    case 'commission_percent':
      return String(Number(row.commission_percent))
    case 'invoice_count':
      return String(row.invoice_count)
    case 'total_sales':
      return fmt(row.total_sales)
    case 'commission':
      return fmt(row.commission)
    default:
      return ''
  }
}

export default function SalesRepSalesReport() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const allRange = getReportPeriodRange('all')
  const [periodPreset, setPeriodPreset] = useState<ReportPeriodKey | 'custom'>('all')
  const [dateFrom, setDateFrom] = useState(allRange.from_date)
  const [dateTo, setDateTo] = useState(allRange.to_date)
  const [perPage, setPerPage] = useState(50)
  const [page, setPage] = useState(1)
  const [salesRepIdFilter, setSalesRepIdFilter] = useState(0)

  const [visibleColumns, setVisibleColumns] = usePersistedColumnVisibility(COLUMN_STORAGE_KEY, allColumnKeys)
  const [showColumnsMenu, setShowColumnsMenu] = useState(false)
  const columnsMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!columnsMenuRef.current?.contains(e.target as Node)) setShowColumnsMenu(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const reportTitle = lang === 'ar' ? 'عمولات المناديب' : 'Sales Reps Commissions'

  const { data: settings } = useQuery({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const decimals = (settings as Record<string, unknown>)?.doc_amount_decimals ?? 2
  const fmt = (n: number) => formatAmount(n, { decimal_places: decimals }, locale)

  const { data: salesRepsRes } = useQuery({
    queryKey: ['sales-reps', tenantId, 'sales-rep-sales-report'],
    queryFn: () => fetchSalesReps(tenantId, { per_page: '500' }),
    enabled: !!tenantId,
  })
  const salesRepsList = salesRepsRes?.data ?? []

  const salesRepFilterOptions: SearchableSelectOption[] = useMemo(
    () => [
      { value: 0, label: lang === 'ar' ? 'كل المناديب' : 'All representatives' },
      ...salesRepsList.map((r) => ({
        value: r.id,
        label: r.name,
        searchText: [r.name, r.region, r.phone].filter(Boolean).join(' '),
      })),
    ],
    [salesRepsList, lang],
  )

  const params = useMemo(() => {
    const p: { from_date: string; to_date: string; per_page: number; page: number; sales_rep_id?: number } = {
      from_date: dateFrom,
      to_date: dateTo,
      per_page: perPage,
      page,
    }
    if (salesRepIdFilter > 0) p.sales_rep_id = salesRepIdFilter
    return p
  }, [dateFrom, dateTo, perPage, page, salesRepIdFilter])

  const { data, isLoading } = useQuery<SalesRepSalesReportResponse>({
    queryKey: ['sales-rep-sales-report', tenantId, params],
    queryFn: () => fetchSalesRepSalesReport(tenantId, params),
    enabled: !!tenantId && !!dateFrom && !!dateTo,
  })

  const rows = data?.data ?? []
  const lastPage = data ? Math.max(1, Math.ceil(data.total_count / data.per_page) || 1) : 1

  const keysToShow = useMemo(() => {
    const v = allColumnKeys.filter((k) => visibleColumns[k])
    return v.length > 0 ? v : allColumnKeys
  }, [visibleColumns])

  const columnLabels: Record<ColumnKey, string> = {
    name: lang === 'ar' ? 'المندوب' : 'Rep',
    region: lang === 'ar' ? 'المنطقة' : 'Region',
    commission_percent: lang === 'ar' ? 'نسبة العمولة %' : 'Commission %',
    invoice_count: lang === 'ar' ? 'عدد الفواتير' : 'Invoices',
    total_sales: lang === 'ar' ? 'إجمالي المبيعات' : 'Total Sales',
    commission: lang === 'ar' ? 'العمولة' : 'Commission',
  }

  const salesRepSortColumns = useMemo(
    () => [
      { key: 'name' as ColumnKey, type: 'string' as const, getValue: (r: SalesRepSalesReportRow) => r.name ?? '' },
      { key: 'region' as ColumnKey, type: 'string' as const, getValue: (r: SalesRepSalesReportRow) => r.region ?? '' },
      { key: 'commission_percent' as ColumnKey, type: 'number' as const, getValue: (r: SalesRepSalesReportRow) => Number(r.commission_percent ?? 0) },
      { key: 'invoice_count' as ColumnKey, type: 'number' as const, getValue: (r: SalesRepSalesReportRow) => Number(r.invoice_count ?? 0) },
      { key: 'total_sales' as ColumnKey, type: 'number' as const, getValue: (r: SalesRepSalesReportRow) => Number(r.total_sales ?? 0) },
      { key: 'commission' as ColumnKey, type: 'number' as const, getValue: (r: SalesRepSalesReportRow) => Number(r.commission ?? 0) },
    ],
    [],
  )
  const { sort, toggleSort, sortedRows } = useClientSort<SalesRepSalesReportRow, ColumnKey>(rows, salesRepSortColumns, { locale })

  function applyPeriodPreset(preset: ReportPeriodKey | 'custom') {
    setPeriodPreset(preset)
    if (preset !== 'custom') {
      const range = getReportPeriodRange(preset)
      setDateFrom(range.from_date)
      setDateTo(range.to_date)
    }
    setPage(1)
  }

  const showCustomDateFields = periodPreset === 'custom'
  const labelPeriod = lang === 'ar' ? 'الفترة' : 'Period'
  const labelFrom = lang === 'ar' ? 'من تاريخ' : 'From date'
  const labelTo = lang === 'ar' ? 'إلى تاريخ' : 'To date'

  function handlePrintReport() {
    const totalsLabel = lang === 'ar' ? 'الإجمالي' : 'Totals'
    const salesLabel = lang === 'ar' ? 'إجمالي المبيعات' : 'Total sales'
    const commissionLabel = lang === 'ar' ? 'العمولة' : 'Commission'
    const headers = keysToShow.map((k) => columnLabels[k])
    const tableRows = sortedRows
      .map((row) => {
        const cells = keysToShow
          .map((k) => {
            const isNum = k === 'commission_percent' || k === 'invoice_count' || k === 'total_sales' || k === 'commission'
            const v = rowCellValue(row, k, fmt)
            return `<td class="${isNum ? 'num' : ''}">${v}</td>`
          })
          .join('')
        return `<tr>${cells}</tr>`
      })
      .join('')
    const summary =
      data && (data.total_sales !== 0 || data.total_commission !== 0)
        ? `<tr class="footer"><td colspan="${keysToShow.length}"><strong>${totalsLabel}</strong> — ${salesLabel}: ${fmt(data.total_sales)} — ${commissionLabel}: ${fmt(data.total_commission)}</td></tr>`
        : ''
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <!DOCTYPE html><html dir="${isRtl ? 'rtl' : 'ltr'}"><head>
        <meta charset="utf-8"><title>${reportTitle}</title>
        <style>
          body{font-family:Arial,sans-serif;padding:24px;max-width:100%;}
          table{width:100%;border-collapse:collapse;margin-top:12px;}
          th,td{border:1px solid #ddd;padding:8px;}
          th{background:#f1f5f9;}
          .num{text-align:right;font-variant-numeric:tabular-nums;}
          .footer{font-weight:400;border-top:2px solid #334155;background:#f0f0f0;}
        </style>
      </head><body>
        <h2 style="margin-bottom:8px;">${reportTitle}</h2>
        <p style="color:#64748b;font-size:0.9rem;">${lang === 'ar' ? 'من' : 'From'}: ${dateFrom} — ${lang === 'ar' ? 'إلى' : 'To'}: ${dateTo}</p>
        <table>
          <thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
          <tbody>${tableRows}</tbody>
          ${summary ? `<tfoot>${summary}</tfoot>` : ''}
        </table>
      </body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => {
      win.print()
      win.close()
    }, 300)
  }

  function handleExportExcel() {
    const headers = keysToShow.map((k) => columnLabels[k])
    const lines = [headers.join(',')]
    sortedRows.forEach((row) => {
      lines.push(keysToShow.map((k) => rowCellValue(row, k, fmt)).join(','))
    })
    if (data && (data.total_sales !== 0 || data.total_commission !== 0)) {
      lines.push('')
      const blank: string[] = keysToShow.map((_, i) => (i === 0 ? (lang === 'ar' ? 'الإجمالي' : 'Totals') : ''))
      keysToShow.forEach((k, i) => {
        if (k === 'total_sales') blank[i] = fmt(data.total_sales)
        if (k === 'commission') blank[i] = fmt(data.total_commission)
      })
      lines.push(blank.join(','))
    }
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sales-rep-commissions-${dateFrom}-${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const colCount = 1 + keysToShow.length
  const colPct = 100 / colCount

  const textAlign = isRtl ? 'text-right' : 'text-left'
  const idxFirstAggregate = keysToShow.findIndex((k) => k === 'total_sales' || k === 'commission')
  const summaryLabelColSpan = idxFirstAggregate === -1 ? colCount : 1 + idxFirstAggregate
  const showTableFooter = !!data && sortedRows.length > 0

  return (
    <div className="px-0 py-3 space-y-3 w-full min-w-0 max-w-full">
      {/* شريط علوي: نفس تنسيق فواتير المبيعات/المشتريات وتقارير الأصناف */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-1.5">
        <h1 className="text-base font-semibold text-slate-900 truncate shrink-0 leading-tight">{reportTitle}</h1>
        <div className="flex-1 flex justify-center min-w-0">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-600 shrink-0">{labelPeriod}</span>
              <select
                value={periodPreset}
                onChange={(e) => applyPeriodPreset((e.target.value as ReportPeriodKey | 'custom') || 'all')}
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
            {showCustomDateFields && (
              <div className="flex flex-wrap items-center gap-2 justify-center">
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-sm text-slate-600 whitespace-nowrap">{labelFrom}</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => {
                      setDateFrom(e.target.value)
                      setPage(1)
                    }}
                    className="border border-slate-300 rounded-lg px-2 h-8 text-sm w-[140px] min-w-[140px] box-border bg-white leading-normal"
                    title={labelFrom}
                  />
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-sm text-slate-600 whitespace-nowrap">{labelTo}</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => {
                      setDateTo(e.target.value)
                      setPage(1)
                    }}
                    className="border border-slate-300 rounded-lg px-2 h-8 text-sm w-[140px] min-w-[140px] box-border bg-white leading-normal"
                    title={labelTo}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="relative z-[120] flex flex-wrap items-center gap-1 no-print shrink-0" ref={columnsMenuRef}>
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
          <button
            type="button"
            onClick={handlePrintReport}
            disabled={isLoading}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#F0F2F5] border border-[#D9DCE0] text-[#344054] hover:bg-[#E4E7EB] disabled:opacity-50"
            title={t.payments?.printReport ?? (lang === 'ar' ? 'طباعة التقرير' : 'Print Report')}
          >
            <Printer size={15} />
          </button>
          <button
            type="button"
            onClick={handlePrintReport}
            disabled={isLoading}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#344054] text-white hover:bg-[#2d3846] disabled:opacity-50"
            title={t.payments?.exportPdf ?? (lang === 'ar' ? 'تصدير PDF' : 'Export PDF')}
          >
            <FileText size={15} />
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={isLoading || sortedRows.length === 0}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
            title={t.payments?.exportExcel ?? (lang === 'ar' ? 'تصدير Excel' : 'Export Excel')}
          >
            <FileSpreadsheet size={15} />
          </button>
          {showColumnsMenu && (
            <div
              className="absolute top-full end-0 mt-2 z-[130] w-64 rounded-xl border border-slate-200/95 bg-white py-2 text-sm shadow-xl ring-1 ring-slate-200/80"
              role="menu"
              aria-label={lang === 'ar' ? 'إظهار/إخفاء الأعمدة' : 'Show / hide columns'}
            >
              <div className="px-3 pb-2 text-xs font-semibold text-slate-500">
                {lang === 'ar' ? 'إظهار/إخفاء الأعمدة' : 'Show / hide columns'}
              </div>
              {allColumnKeys.map((key) => (
                <label key={key} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={visibleColumns[key]}
                    onChange={() => setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }))}
                    className="rounded border-slate-300"
                  />
                  <span>{columnLabels[key]}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 bg-white rounded-xl border border-slate-200 py-2 px-3">
        <div className="min-w-[200px] max-w-[min(100%,400px)] flex-1">
          <SearchableSelect
            options={salesRepFilterOptions}
            value={salesRepIdFilter}
            onChange={(v) => {
              const n = v === null || v === '' ? 0 : Number(v)
              setSalesRepIdFilter(Number.isFinite(n) ? n : 0)
              setPage(1)
            }}
            placeholder={lang === 'ar' ? 'المندوب' : 'Representative'}
            textAlign={isRtl ? 'right' : 'left'}
            wrapOptions
            dropdownMinWidth={260}
            className="w-full"
            aria-label={lang === 'ar' ? 'فلتر المندوب' : 'Sales rep filter'}
          />
        </div>
        <PageSizeSelect
          value={perPage}
          onChange={(v) => {
            setPerPage(v)
            setPage(1)
          }}
          showLabel={false}
          ariaLabel={lang === 'ar' ? 'عدد السجلات' : 'Records per page'}
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-center text-slate-500 text-sm">{t.loading}</div>
        ) : (
          <>
            <div className="table-responsive-wrap">
              <table className="w-full text-sm border-collapse table-fixed min-w-[500px]">
                <colgroup>
                  <col style={{ width: `${colPct}%` }} />
                  {keysToShow.map((k) => (
                    <col key={k} style={{ width: `${colPct}%` }} />
                  ))}
                </colgroup>
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-xs">
                    <th className="px-3 py-2.5 text-right font-semibold text-slate-700 min-w-0">#</th>
                    {keysToShow.map((key) => {
                      const isNum =
                        key === 'commission_percent' || key === 'invoice_count' || key === 'total_sales' || key === 'commission'
                      return (
                        <SortableTh
                          key={key}
                          label={columnLabels[key]}
                          sortKey={key}
                          sortState={sort}
                          onToggle={toggleSort}
                          className={`px-0 py-0 font-semibold text-slate-700 min-w-0 ${isNum ? 'text-right' : 'text-right'}`}
                        />
                      )
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedRows.length === 0 ? (
                    <tr>
                      <td colSpan={colCount} className="px-3 py-12 text-center text-slate-500 text-sm">
                        {t.noData}
                      </td>
                    </tr>
                  ) : (
                    sortedRows.map((row, idx) => (
                      <tr key={row.sales_rep_id} className="hover:bg-slate-50/80">
                        <td className="px-3 py-2.5 text-slate-600 min-w-0">{(data!.page - 1) * data!.per_page + idx + 1}</td>
                        {keysToShow.map((key) => {
                          const isNum =
                            key === 'commission_percent' ||
                            key === 'invoice_count' ||
                            key === 'total_sales' ||
                            key === 'commission'
                          const raw = rowCellValue(row, key, fmt)
                          if (key === 'name') {
                            return (
                              <td key={key} className="px-3 py-2.5 font-medium text-slate-900 min-w-0 truncate text-right" title={row.name}>
                                {row.name}
                              </td>
                            )
                          }
                          return (
                            <td
                              key={key}
                              className={`px-3 py-2.5 text-slate-600 min-w-0 ${isNum ? 'text-right tabular-nums' : 'truncate text-right'}`}
                              title={key === 'region' ? (row.region ?? undefined) : undefined}
                            >
                              {raw}
                            </td>
                          )
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
                {showTableFooter && (
                  <tfoot>
                    <tr className="bg-gradient-to-r from-slate-100 to-slate-50 border-t-2 border-slate-400 font-bold text-slate-900 shadow-[0_-2px_4px_rgba(0,0,0,0.04)]">
                      {idxFirstAggregate === -1 ? (
                        <td colSpan={colCount} className={`${textAlign} px-3 py-3.5 text-sm leading-tight tabular-nums`} dir={isRtl ? 'rtl' : 'ltr'}>
                          {lang === 'ar' ? 'الإجمالي' : 'Total'}: {fmt(data!.total_sales)} — {lang === 'ar' ? 'العمولة' : 'Commission'}:{' '}
                          {fmt(data!.total_commission)}
                        </td>
                      ) : (
                        <>
                          <td colSpan={summaryLabelColSpan} className={`${textAlign} px-3 py-3.5 text-sm leading-tight`}>
                            {lang === 'ar' ? 'الإجمالي' : 'Total'}
                          </td>
                          {keysToShow.slice(idxFirstAggregate).map((key) => {
                            if (key === 'total_sales') {
                              return (
                                <td
                                  key={key}
                                  className={`px-3 py-3.5 text-sm tabular-nums font-semibold leading-tight ${isRtl ? 'text-right' : 'text-center'}`}
                                  dir="ltr"
                                >
                                  {fmt(data!.total_sales)}
                                </td>
                              )
                            }
                            if (key === 'commission') {
                              return (
                                <td
                                  key={key}
                                  className={`px-3 py-3.5 text-sm tabular-nums font-semibold leading-tight ${isRtl ? 'text-right' : 'text-center'}`}
                                  dir="ltr"
                                >
                                  {fmt(data!.total_commission)}
                                </td>
                              )
                            }
                            return <td key={key} className="px-3 py-3.5" aria-hidden />
                          })}
                        </>
                      )}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {data && (
              <ReportFooter
                totalCount={data.total_count}
                currentPage={data.page}
                lastPage={lastPage}
                from={data.total_count === 0 ? 0 : (data.page - 1) * data.per_page + 1}
                to={data.total_count === 0 ? 0 : Math.min(data.page * data.per_page, data.total_count)}
                onPageChange={setPage}
                lang={lang}
                isRtl={isRtl}
                alwaysShowPaginationBar
                showRecordSummary={data.total_count > 0}
                recordLabel={lang === 'ar' ? 'مندوب' : 'rep'}
                dense
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
