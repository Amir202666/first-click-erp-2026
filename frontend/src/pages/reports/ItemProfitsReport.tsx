import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileSpreadsheet, Printer, Search } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchBranches,
  fetchItemCategories,
  fetchItemProfits,
  fetchWarehouses,
  type ItemProfitPerformance,
  type ItemProfitRow,
} from '../../api/tenant'
import type { Branch, ItemCategory, Warehouse } from '../../types'
import { formatAmount } from '../../utils/currency'
import { asArray } from '../../utils/asArray'
import { getReportPeriodRange, type ReportPeriodKey } from '../../utils/date'

const periodOptions: { value: ReportPeriodKey | 'custom'; labelAr: string; labelEn: string }[] = [
  { value: 'all', labelAr: 'الكل', labelEn: 'All' },
  { value: 'today', labelAr: 'اليوم', labelEn: 'Today' },
  { value: 'yesterday', labelAr: 'الأمس', labelEn: 'Yesterday' },
  { value: 'this_week', labelAr: 'هذا الأسبوع', labelEn: 'This Week' },
  { value: 'last_week', labelAr: 'الأسبوع السابق', labelEn: 'Last Week' },
  { value: 'this_month', labelAr: 'هذا الشهر', labelEn: 'This Month' },
  { value: 'last_month', labelAr: 'الشهر السابق', labelEn: 'Last Month' },
  { value: 'this_year', labelAr: 'هذه السنة', labelEn: 'This Year' },
  { value: 'custom', labelAr: 'تاريخ مخصص', labelEn: 'Custom Date' },
]

const performanceMeta: Record<
  ItemProfitPerformance,
  { labelAr: string; labelEn: string; className: string; barClass: string }
> = {
  excellent: { labelAr: 'ممتاز', labelEn: 'Excellent', className: 'bg-emerald-100 text-emerald-800', barClass: 'bg-emerald-500' },
  good: { labelAr: 'جيد', labelEn: 'Good', className: 'bg-sky-100 text-sky-800', barClass: 'bg-sky-500' },
  acceptable: { labelAr: 'مقبول', labelEn: 'Acceptable', className: 'bg-amber-100 text-amber-800', barClass: 'bg-amber-400' },
  weak: { labelAr: 'ضعيف', labelEn: 'Weak', className: 'bg-orange-100 text-orange-800', barClass: 'bg-orange-500' },
  loss: { labelAr: 'خسارة', labelEn: 'Loss', className: 'bg-rose-100 text-rose-800', barClass: 'bg-rose-500' },
}

const initialRange = getReportPeriodRange('this_year')

function KpiCard({
  title,
  value,
  tone,
}: {
  title: string
  value: string
  tone: 'emerald' | 'slate' | 'rose' | 'sky' | 'amber'
}) {
  const toneClass =
    tone === 'emerald'
      ? 'text-emerald-700'
      : tone === 'rose'
        ? 'text-rose-600'
        : tone === 'sky'
          ? 'text-sky-700'
          : tone === 'amber'
            ? 'text-amber-700'
            : 'text-slate-800'
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-1 text-xs text-slate-500">{title}</div>
      <div className={`text-lg font-semibold tabular-nums ${toneClass}`}>{value}</div>
    </div>
  )
}

export default function ItemProfitsReport() {
  const { currentTenant } = useAuth()
  const { lang } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'

  const [periodPreset, setPeriodPreset] = useState<ReportPeriodKey | 'custom'>('this_year')
  const [fromDate, setFromDate] = useState(initialRange.from_date)
  const [toDate, setToDate] = useState(initialRange.to_date)
  const [search, setSearch] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [branchId, setBranchId] = useState('')

  const labelPeriod = lang === 'ar' ? 'الفترة' : 'Period'
  const labelFrom = lang === 'ar' ? 'من تاريخ' : 'From date'
  const labelTo = lang === 'ar' ? 'إلى تاريخ' : 'To date'
  const showCustomDateFields = periodPreset === 'custom'

  function applyPeriodPreset(preset: ReportPeriodKey | 'custom') {
    setPeriodPreset(preset)
    if (preset !== 'custom') {
      const range = getReportPeriodRange(preset)
      setFromDate(range.from_date)
      setToDate(range.to_date)
    }
  }

  const { data: branchesData } = useQuery({
    queryKey: ['branches', tenantId, 'item-profits'],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId,
  })
  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses', tenantId, 'item-profits'],
    queryFn: () => fetchWarehouses(tenantId, { per_page: '500' }),
    enabled: !!tenantId,
  })
  const { data: categoriesData } = useQuery({
    queryKey: ['item-categories', tenantId, 'item-profits'],
    queryFn: () => fetchItemCategories(tenantId),
    enabled: !!tenantId,
  })

  const branches = asArray<Branch>(branchesData)
  const warehouses = asArray<Warehouse>(warehousesData)
  const categories = asArray<ItemCategory>(categoriesData)

  const params = useMemo(() => {
    const p: Record<string, string> = { from_date: fromDate, to_date: toDate }
    if (branchId) p.branch_id = branchId
    if (warehouseId) p.warehouse_id = warehouseId
    if (categoryId) p.category_id = categoryId
    if (search.trim()) p.search = search.trim()
    return p
  }, [fromDate, toDate, branchId, warehouseId, categoryId, search])

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['item-profits', tenantId, params],
    queryFn: () => fetchItemProfits(tenantId, params),
    enabled: !!tenantId && !!fromDate && !!toDate,
  })

  const rows = data?.rows ?? []
  const totals = data?.totals
  const performance = data?.performance

  const fmt = (n: number) => formatAmount(n, { decimal_places: 3 }, locale)
  const fmtPct = (n: number) =>
    `${n.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`

  const performanceTotal = useMemo(() => {
    if (!performance) return 0
    return (
      (performance.excellent ?? 0) +
      (performance.good ?? 0) +
      (performance.acceptable ?? 0) +
      (performance.weak ?? 0) +
      (performance.loss ?? 0)
    )
  }, [performance])

  useEffect(() => {
    document.title = lang === 'ar' ? 'أرباح الأصناف' : 'Item Profits'
  }, [lang])

  function handleExportExcel() {
    if (!rows.length) return
    const headers = [
      '#',
      lang === 'ar' ? 'الصنف' : 'Item',
      lang === 'ar' ? 'الكود' : 'Code',
      lang === 'ar' ? 'الفئة' : 'Category',
      lang === 'ar' ? 'الكمية' : 'Qty',
      lang === 'ar' ? 'الإيرادات' : 'Revenue',
      lang === 'ar' ? 'التكلفة' : 'Cost',
      lang === 'ar' ? 'الربح' : 'Profit',
      lang === 'ar' ? 'الهامش %' : 'Margin %',
      lang === 'ar' ? 'الأداء' : 'Performance',
      lang === 'ar' ? 'متوسط البيع' : 'Avg sale',
      lang === 'ar' ? 'متوسط التكلفة' : 'Avg cost',
    ]
    const lines = rows.map((r, idx) => [
      String(idx + 1),
      r.item_name,
      r.item_code,
      r.category_name ?? '',
      String(r.quantity),
      String(r.revenue),
      String(r.cost),
      String(r.profit),
      String(r.margin),
      lang === 'ar' ? performanceMeta[r.performance].labelAr : performanceMeta[r.performance].labelEn,
      String(r.avg_sale_price),
      String(r.avg_cost),
    ])
    const csv = [headers, ...lines]
      .map((line) => line.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `item-profits-${fromDate}-${toDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="w-full min-w-0 max-w-full space-y-3 px-0 py-3">
      {/* الشريط العلوي: العنوان · فلتر الفترة في الوسط · Excel/طباعة */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-1.5">
        <div className="min-w-0 shrink-0">
          <h1 className="truncate text-base font-semibold leading-tight text-slate-900">
            {lang === 'ar' ? 'أرباح الأصناف' : 'Item Profits'}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            {rows.length} {lang === 'ar' ? 'صنف' : 'items'} · {fromDate} → {toDate}
          </p>
        </div>

        <div className="flex min-w-0 flex-1 justify-center">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="shrink-0 text-sm text-slate-600">{labelPeriod}</span>
              <select
                value={periodPreset}
                onChange={(e) => applyPeriodPreset((e.target.value as ReportPeriodKey | 'custom') || 'this_year')}
                className="box-border h-8 min-w-[140px] max-w-[200px] shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 text-sm leading-normal outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500"
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
              <div className="flex flex-wrap items-center justify-center gap-2">
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="whitespace-nowrap text-sm text-slate-600">{labelFrom}</span>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="box-border h-8 w-[140px] min-w-[140px] rounded-lg border border-slate-300 bg-white px-2 text-sm leading-normal outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500"
                    title={labelFrom}
                  />
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="whitespace-nowrap text-sm text-slate-600">{labelTo}</span>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="box-border h-8 w-[140px] min-w-[140px] rounded-lg border border-slate-300 bg-white px-2 text-sm leading-normal outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500"
                    title={labelTo}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="no-print flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={!rows.length}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            <FileSpreadsheet size={15} />
            Excel
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!data}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Printer size={15} />
            {lang === 'ar' ? 'طباعة' : 'Print'}
          </button>
        </div>
      </div>

      {/* فلاتر أخرى فقط — بدون فلتر التاريخ */}
      <div className="no-print flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5">
        <div className="relative min-w-[180px] max-w-[280px] flex-1 basis-[180px]">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={lang === 'ar' ? 'بحث عن صنف...' : 'Search item...'}
            className="h-8 w-full rounded-lg border border-slate-300 bg-white pe-2 ps-8 text-sm"
          />
        </div>
        <select
          value={warehouseId}
          onChange={(e) => setWarehouseId(e.target.value)}
          className="h-8 min-w-[140px] rounded-lg border border-slate-300 bg-white px-2.5 text-sm"
        >
          <option value="">{lang === 'ar' ? 'كل المخازن' : 'All warehouses'}</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="h-8 min-w-[140px] rounded-lg border border-slate-300 bg-white px-2.5 text-sm"
        >
          <option value="">{lang === 'ar' ? 'كل الفئات' : 'All categories'}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          className="h-8 min-w-[140px] rounded-lg border border-slate-300 bg-white px-2.5 text-sm"
        >
          <option value="">{lang === 'ar' ? 'كل الفروع' : 'All branches'}</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <KpiCard title={lang === 'ar' ? 'إجمالي الإيرادات' : 'Total revenue'} value={fmt(totals?.revenue ?? 0)} tone="emerald" />
        <KpiCard title={lang === 'ar' ? 'إجمالي التكلفة' : 'Total cost'} value={fmt(totals?.cost ?? 0)} tone="slate" />
        <KpiCard title={lang === 'ar' ? 'إجمالي الربح' : 'Total profit'} value={fmt(totals?.profit ?? 0)} tone={(totals?.profit ?? 0) >= 0 ? 'emerald' : 'rose'} />
        <KpiCard title={lang === 'ar' ? 'متوسط الهامش' : 'Avg margin'} value={fmtPct(totals?.margin ?? 0)} tone={(totals?.margin ?? 0) >= 0 ? 'sky' : 'rose'} />
        <KpiCard title={lang === 'ar' ? 'إجمالي الخصومات' : 'Total discounts'} value={fmt(totals?.discount ?? 0)} tone="amber" />
      </div>

      {performance && performanceTotal > 0 && (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            {(Object.keys(performanceMeta) as ItemProfitPerformance[]).map((key) => {
              const count = performance[key] ?? 0
              if (!count) return null
              const pct = (count / performanceTotal) * 100
              return (
                <div
                  key={key}
                  className={performanceMeta[key].barClass}
                  style={{ width: `${pct}%` }}
                  title={`${lang === 'ar' ? performanceMeta[key].labelAr : performanceMeta[key].labelEn}: ${count}`}
                />
              )
            })}
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-slate-600">
            {(Object.keys(performanceMeta) as ItemProfitPerformance[]).map((key) => (
              <span key={key} className="inline-flex items-center gap-1.5">
                <span className={`inline-block size-2 rounded-full ${performanceMeta[key].barClass}`} />
                {lang === 'ar' ? performanceMeta[key].labelAr : performanceMeta[key].labelEn}
                <strong className="tabular-nums">{performance[key] ?? 0}</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {lang === 'ar' ? 'تعذر تحميل التقرير.' : 'Failed to load report.'}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-start font-medium">#</th>
                <th className="px-3 py-2 text-start font-medium">{lang === 'ar' ? 'الصنف' : 'Item'}</th>
                <th className="px-3 py-2 text-start font-medium">{lang === 'ar' ? 'الفئة' : 'Category'}</th>
                <th className="px-3 py-2 text-end font-medium">{lang === 'ar' ? 'الكمية' : 'Qty'}</th>
                <th className="px-3 py-2 text-end font-medium">{lang === 'ar' ? 'الإيرادات' : 'Revenue'}</th>
                <th className="px-3 py-2 text-end font-medium">{lang === 'ar' ? 'التكلفة' : 'Cost'}</th>
                <th className="px-3 py-2 text-end font-medium">{lang === 'ar' ? 'الربح' : 'Profit'}</th>
                <th className="px-3 py-2 text-end font-medium">{lang === 'ar' ? 'الهامش' : 'Margin'}</th>
                <th className="px-3 py-2 text-center font-medium">{lang === 'ar' ? 'الأداء' : 'Performance'}</th>
                <th className="px-3 py-2 text-end font-medium">{lang === 'ar' ? 'متوسط البيع' : 'Avg sale'}</th>
                <th className="px-3 py-2 text-end font-medium">{lang === 'ar' ? 'متوسط التكلفة' : 'Avg cost'}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading || isFetching ? (
                <tr>
                  <td colSpan={11} className="px-3 py-8 text-center text-slate-500">
                    {lang === 'ar' ? 'جاري التحميل...' : 'Loading...'}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-8 text-center text-slate-500">
                    {lang === 'ar' ? 'لا توجد بيانات للفترة المحددة.' : 'No data for the selected period.'}
                  </td>
                </tr>
              ) : (
                rows.map((r: ItemProfitRow, idx) => (
                  <tr key={r.item_id} className="border-b border-slate-100 hover:bg-slate-50/60">
                    <td className="px-3 py-2 tabular-nums text-slate-500">{idx + 1}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900">{r.item_name}</div>
                      <div className="font-mono text-xs text-slate-500">{r.item_code}</div>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{r.category_name ?? '—'}</td>
                    <td className="px-3 py-2 text-end tabular-nums">{fmt(r.quantity)}</td>
                    <td className="px-3 py-2 text-end tabular-nums text-emerald-700">{fmt(r.revenue)}</td>
                    <td className="px-3 py-2 text-end tabular-nums">{fmt(r.cost)}</td>
                    <td className={`px-3 py-2 text-end font-medium tabular-nums ${r.profit >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                      {fmt(r.profit)}
                    </td>
                    <td className={`px-3 py-2 text-end tabular-nums ${r.margin >= 0 ? 'text-slate-800' : 'text-rose-600'}`}>
                      {fmtPct(r.margin)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${performanceMeta[r.performance].className}`}>
                        {lang === 'ar' ? performanceMeta[r.performance].labelAr : performanceMeta[r.performance].labelEn}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-end tabular-nums text-slate-600">{fmt(r.avg_sale_price)}</td>
                    <td className="px-3 py-2 text-end tabular-nums text-slate-600">{fmt(r.avg_cost)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
