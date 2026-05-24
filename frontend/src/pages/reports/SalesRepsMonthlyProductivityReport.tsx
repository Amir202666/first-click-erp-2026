import { useMemo, useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileSpreadsheet, FileText, Printer } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { useDocumentTitleContext } from '../../contexts/DocumentTitleContext'
import { fetchSalesRepsMonthlyProductivity, fetchSettings } from '../../api/tenant'
import type { BranchSalesAnnualMonthMeta, SalesRepsMonthlyProductivityRow } from '../../api/tenant'
import { useClientSort, type SortColumn } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'
import { coerceDecimalPlaces, formatAmount } from '../../utils/currency'
import { filterReportToolbarSelectClass } from '../../utils/filterControlStyles'

type SalesSource = 'all' | 'regular' | 'pos' | 'restaurant'
type AmountBasis = 'net_before_tax' | 'inclusive'

function defaultFiscalStartYear(now: Date, fyStartMonth: number): number {
  const cm = now.getMonth() + 1
  const m = fyStartMonth >= 1 && fyStartMonth <= 12 ? fyStartMonth : 1
  return cm >= m ? now.getFullYear() : now.getFullYear() - 1
}

function formatMonthNameOnly(year: number, month: number, lang: string): string {
  const d = new Date(year, month - 1, 1)
  const loc = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  return d.toLocaleDateString(loc, { month: lang === 'ar' ? 'long' : 'short' })
}

function csvCell(v: string | number): string {
  return `"${String(v).replace(/"/g, '""')}"`
}

function PerformanceBadge({ tier, lang }: { tier: string; lang: string }) {
  if (tier === 'none') return null
  const cfg: Record<string, { ar: string; en: string; className: string }> = {
    high: {
      ar: 'مرتفع',
      en: 'High',
      className: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
    },
    medium: {
      ar: 'متوسط',
      en: 'Medium',
      className: 'bg-amber-100 text-amber-800 border border-amber-200',
    },
    low: {
      ar: 'منخفض',
      en: 'Low',
      className: 'bg-slate-100 text-slate-700 border border-slate-200',
    },
  }
  const c = cfg[tier]
  if (!c) return null
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0 ${c.className}`}>
      {lang === 'ar' ? c.ar : c.en}
    </span>
  )
}

export default function SalesRepsMonthlyProductivityReport() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const { setPageTitle } = useDocumentTitleContext()
  const tenantId = currentTenant?.id ?? 0

  const { data: settings } = useQuery({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })

  const rawFyMonth = (settings as Record<string, unknown> | undefined)?.fiscal_year_start_month
  const fyParsed =
    typeof rawFyMonth === 'number' ? rawFyMonth : typeof rawFyMonth === 'string' ? Number(rawFyMonth) : NaN
  const fyStartMonth =
    Number.isFinite(fyParsed) && fyParsed >= 1 && fyParsed <= 12 ? Math.floor(fyParsed) : 1

  const decimals = coerceDecimalPlaces((settings as Record<string, unknown> | undefined)?.doc_amount_decimals, 2)
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const fmt = (n: number) => formatAmount(n, { decimal_places: decimals }, locale)

  const [fiscalYear, setFiscalYear] = useState(() => defaultFiscalStartYear(new Date(), fyStartMonth))
  const [salesSource, setSalesSource] = useState<SalesSource>('all')
  const [amountBasis, setAmountBasis] = useState<AmountBasis>('net_before_tax')

  useEffect(() => {
    setFiscalYear(defaultFiscalStartYear(new Date(), fyStartMonth))
  }, [fyStartMonth])

  const params = useMemo(
    () => ({
      fiscal_year: String(fiscalYear),
      sales_source: salesSource,
      amount_basis: amountBasis,
    }),
    [fiscalYear, salesSource, amountBasis],
  )

  const { data, isLoading, error } = useQuery({
    queryKey: ['sales-reps-monthly-productivity', tenantId, params],
    queryFn: () => fetchSalesRepsMonthlyProductivity(tenantId, params),
    enabled: !!tenantId,
  })

  const titleMenu =
    (t.nav as Record<string, string | undefined>).salesRepsMonthlyProductivityReport ??
    (lang === 'ar' ? 'تقرير إنتاجية المناديب الشهري' : 'Monthly Sales Rep Productivity')

  useEffect(() => {
    setPageTitle(titleMenu)
    return () => setPageTitle(null)
  }, [titleMenu, setPageTitle])

  const yearOptions = useMemo(() => {
    const y = new Date().getFullYear()
    const list: number[] = []
    for (let i = y - 8; i <= y + 1; i++) list.push(i)
    return list
  }, [])

  const monthLabels = useMemo(() => {
    if (!data?.months?.length) return []
    return data.months.map((m: BranchSalesAnnualMonthMeta) => formatMonthNameOnly(m.year, m.month, lang))
  }, [data?.months, lang])

  type RepProdSortKey = 'name' | 'year_total' | `p:${string}`
  const repRows = data?.reps ?? []
  const repProdSortColumns = useMemo((): SortColumn<SalesRepsMonthlyProductivityRow, RepProdSortKey>[] => {
    if (!data?.month_keys?.length) return []
    const cols: SortColumn<SalesRepsMonthlyProductivityRow, RepProdSortKey>[] = [
      { key: 'name', type: 'string', getValue: (r) => r.name ?? '' },
    ]
    data.month_keys.forEach((mk, i) => {
      cols.push({
        key: `p:${mk}` as RepProdSortKey,
        type: 'number',
        getValue: (r) => Number(r.months[i] ?? 0),
      })
    })
    cols.push({ key: 'year_total', type: 'number', getValue: (r) => Number(r.year_total) })
    return cols
  }, [data?.month_keys])
  const { sort, toggleSort, sortedRows: sortedRepRows } = useClientSort<
    SalesRepsMonthlyProductivityRow,
    RepProdSortKey
  >(repRows, repProdSortColumns, { locale })

  const labelFiscalYear = lang === 'ar' ? 'السنة المالية' : 'Fiscal year'
  const labelSalesType = lang === 'ar' ? 'نوع المبيعات' : 'Sales type'
  const labelAmountBasis = lang === 'ar' ? 'أساس المبلغ' : 'Amount basis'

  const filterSelectClass = filterReportToolbarSelectClass
  const repColLabel = lang === 'ar' ? 'المندوب' : 'Representative'
  const totalColLabel = lang === 'ar' ? 'المجموع' : 'Total'
  const footerTotalLabel = lang === 'ar' ? 'الإجمالي' : 'Total'

  const sourceOptions: { value: SalesSource; ar: string; en: string }[] = [
    { value: 'all', ar: 'الكل', en: 'All' },
    { value: 'regular', ar: 'فواتير عادية', en: 'Regular invoices' },
    { value: 'pos', ar: 'نقاط البيع (POS)', en: 'POS' },
    { value: 'restaurant', ar: 'المطعم', en: 'Restaurant' },
  ]

  function handleExportExcel() {
    if (!data?.reps?.length && !data?.column_totals?.length) return
    const headers = [repColLabel, ...monthLabels, totalColLabel]
    const lines = [headers.map(csvCell).join(',')]
    for (const r of sortedRepRows) {
      lines.push(
        [r.name, ...r.months.map((x) => fmt(x)), fmt(r.year_total)].map(csvCell).join(','),
      )
    }
    lines.push(
      [footerTotalLabel, ...data.column_totals.map((x) => fmt(x)), fmt(data.grand_total)].map(csvCell).join(','),
    )
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sales-reps-monthly-${data.fiscal_year}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handlePrintPdf() {
    if (!data) return
    const thMonths = monthLabels.map((h) => `<th class="num">${h}</th>`).join('')
    const rowsHtml = sortedRepRows
      .map(
        (r) =>
          `<tr><td class="name">${r.name}</td>${r.months.map((v) => `<td class="num">${fmt(v)}</td>`).join('')}<td class="num"><strong>${fmt(r.year_total)}</strong></td></tr>`,
      )
      .join('')
    const footHtml = `<tr class="foot"><td class="name"><strong>${footerTotalLabel}</strong></td>${data.column_totals.map((v) => `<td class="num"><strong>${fmt(v)}</strong></td>`).join('')}<td class="num"><strong>${fmt(data.grand_total)}</strong></td></tr>`

    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html dir="${isRtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${titleMenu}</title>
      <style>
        body{font-family:Arial,sans-serif;padding:20px;font-size:12px;}
        h2{margin:0 0 8px;}
        .meta{color:#64748b;font-size:11px;margin-bottom:12px;}
        table{width:100%;border-collapse:collapse;}
        th,td{border:1px solid #cbd5e1;padding:6px 8px;}
        th{background:#f1f5f9;}
        .name{text-align:right;min-width:140px;}
        .num{text-align:left;font-variant-numeric:tabular-nums;}
        tr.foot td{background:#e2e8f0;}
      </style></head><body>
      <h2>${titleMenu}</h2>
      <p class="meta">${data.period_from} — ${data.period_to} · ${labelSalesType}: ${sourceOptions.find((o) => o.value === salesSource)?.[lang === 'ar' ? 'ar' : 'en']}</p>
      <table><thead><tr><th class="name">${repColLabel}</th>${thMonths}<th class="num">${totalColLabel}</th></tr></thead>
      <tbody>${rowsHtml}</tbody><tfoot>${footHtml}</tfoot></table>
      </body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => {
      win.print()
      win.close()
    }, 300)
  }

  return (
    <div className="px-0 py-3 space-y-3 w-full min-w-0 max-w-full">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-1.5">
        <h1 className="text-base font-semibold text-slate-900 truncate shrink-0 leading-tight">{titleMenu}</h1>
        <div className="flex flex-wrap items-center gap-2 shrink-0 no-print">
          <button
            type="button"
            onClick={handlePrintPdf}
            disabled={!data || isLoading}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#F0F2F5] border border-[#D9DCE0] text-[#344054] hover:bg-[#E4E7EB] disabled:opacity-50"
            title={t.payments?.printReport ?? (lang === 'ar' ? 'طباعة / PDF' : 'Print / PDF')}
          >
            <Printer size={15} />
          </button>
          <button
            type="button"
            onClick={handlePrintPdf}
            disabled={!data || isLoading}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#344054] text-white hover:bg-[#2d3846] disabled:opacity-50"
            title={t.payments?.exportPdf ?? 'PDF'}
          >
            <FileText size={15} />
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={!data || isLoading}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
            title={t.payments?.exportExcel ?? 'Excel'}
          >
            <FileSpreadsheet size={15} />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-3 w-full">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <select
              value={fiscalYear}
              onChange={(e) => setFiscalYear(Number(e.target.value))}
              className={`${filterSelectClass} min-w-[120px]`}
              aria-label={labelFiscalYear}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div>
            <select
              value={salesSource}
              onChange={(e) => setSalesSource(e.target.value as SalesSource)}
              className={`${filterSelectClass} min-w-[220px]`}
              aria-label={labelSalesType}
            >
              {sourceOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {lang === 'ar' ? o.ar : o.en}
                </option>
              ))}
            </select>
          </div>
          <div>
            <select
              value={amountBasis}
              onChange={(e) => setAmountBasis(e.target.value as AmountBasis)}
              className={`${filterSelectClass} min-w-[220px]`}
              aria-label={labelAmountBasis}
            >
              <option value="net_before_tax">{lang === 'ar' ? 'صافي قبل الضريبة' : 'Net before tax'}</option>
              <option value="inclusive">{lang === 'ar' ? 'شامل الضريبة' : 'Tax inclusive'}</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {t.msg?.errorOccurred ?? 'حدث خطأ'}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-500 text-sm">{t.loading}</div>
        ) : !data ? (
          <div className="p-8 text-center text-slate-500 text-sm">{t.noData}</div>
        ) : (
          <div className="overflow-x-auto">
            <table
              className="w-full text-sm border-collapse min-w-[900px]"
              dir={isRtl ? 'rtl' : 'ltr'}
            >
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <SortableTh
                    label={repColLabel}
                    sortKey="name"
                    sortState={sort}
                    onToggle={toggleSort}
                    className="sticky start-0 z-10 bg-slate-50 p-0 font-semibold text-slate-800 border-e border-slate-200 text-right min-w-[150px] align-middle"
                  />
                  {monthLabels.map((label, i) => (
                    <SortableTh
                      key={data.month_keys[i] ?? i}
                      label={label}
                      sortKey={`p:${data.month_keys[i]}` as RepProdSortKey}
                      sortState={sort}
                      onToggle={toggleSort}
                      className="px-0 py-0 font-semibold text-slate-700 text-center whitespace-nowrap align-middle"
                    />
                  ))}
                  <SortableTh
                    label={totalColLabel}
                    sortKey="year_total"
                    sortState={sort}
                    onToggle={toggleSort}
                    className="px-0 py-0 font-semibold text-slate-800 text-left min-w-[120px] align-middle"
                  />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedRepRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={monthLabels.length + 2}
                      className="px-3 py-10 text-center text-slate-500"
                    >
                      {t.noData}
                    </td>
                  </tr>
                ) : (
                  sortedRepRows.map((r) => (
                  <tr key={r.sales_rep_id} className="group hover:bg-slate-50/80">
                    <th
                      scope="row"
                      className="sticky start-0 z-[1] bg-white group-hover:bg-slate-50/80 px-3 py-2.5 font-medium text-slate-900 border-e border-slate-100 text-right align-middle min-w-[150px]"
                    >
                      {r.name}
                    </th>
                    {r.months.map((v, mi) => (
                      <td
                        key={data.month_keys[mi] ?? mi}
                        className="px-2 py-2.5 text-left tabular-nums text-slate-700 align-middle"
                        dir="ltr"
                      >
                        {fmt(v)}
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-left tabular-nums font-medium text-slate-900 align-middle" dir="ltr">
                      <div className="flex flex-row items-center gap-2 flex-nowrap justify-start">
                        <span>{fmt(r.year_total)}</span>
                        <PerformanceBadge tier={r.performance_tier} lang={lang} />
                      </div>
                    </td>
                  </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="bg-gradient-to-r from-slate-100 to-slate-50 border-t-2 border-slate-400 font-semibold text-slate-900">
                  <th
                    scope="row"
                    className="sticky start-0 z-[1] bg-slate-100 px-3 py-3 text-right border-e border-slate-200 min-w-[150px] align-middle"
                  >
                    {footerTotalLabel}
                  </th>
                  {data.column_totals.map((v, mi) => (
                    <td
                      key={data.month_keys[mi] ?? mi}
                      className="px-2 py-3 text-left tabular-nums align-middle"
                      dir="ltr"
                    >
                      {fmt(v)}
                    </td>
                  ))}
                  <td className="px-3 py-3 text-left tabular-nums font-bold align-middle" dir="ltr">
                    {fmt(data.grand_total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
