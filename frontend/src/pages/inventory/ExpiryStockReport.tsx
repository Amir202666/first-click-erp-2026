import { useMemo, useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchExpiryStockReport, fetchWarehouses, fetchBranches } from '../../api/tenant'
import type { Branch, ExpiryStockReportRow } from '../../types'
import { asArray } from '../../utils/asArray'
import { filterBarOverflowClass, filterRowInnerStretchClass, filterCellGrowClass, filterSelectClass } from '../../utils/filterControlStyles'
import ReportFooter from '../../components/ui/ReportFooter'
import { Package } from 'lucide-react'

const PER_PAGE = 50

type FilterMode = 'expiring' | 'expired' | 'all'

export default function ExpiryStockReport() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const [searchParams] = useSearchParams()
  const tenantId = currentTenant?.id ?? 0
  const [warehouseId, setWarehouseId] = useState('')
  const [branchId, setBranchId] = useState('')
  const [filter, setFilter] = useState<FilterMode>('expiring')
  const [withinDays, setWithinDays] = useState(90)
  const [page, setPage] = useState(1)

  useEffect(() => {
    const f = searchParams.get('filter')
    if (f === 'expiring' || f === 'expired' || f === 'all') setFilter(f)
    const wd = searchParams.get('within_days')
    if (wd) {
      const n = Number.parseInt(wd, 10)
      if (Number.isFinite(n) && n >= 1 && n <= 730) setWithinDays(n)
    }
  }, [searchParams])

  const textAlign = isRtl ? 'text-right' : 'text-left'

  const { data: warehousesResp } = useQuery({
    queryKey: ['warehouses', tenantId, 100],
    queryFn: () => fetchWarehouses(tenantId, { per_page: '100' }),
    enabled: !!tenantId,
    staleTime: 60_000,
  })
  const warehouses = warehousesResp?.data ?? []

  const { data: branchesData } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId,
    staleTime: 60_000,
  })
  const branches = asArray<Branch>(branchesData)

  const params = useMemo(() => {
    const p: Record<string, string> = {
      per_page: String(PER_PAGE),
      page: String(page),
      filter,
      within_days: String(withinDays),
    }
    if (warehouseId) p.warehouse_id = warehouseId
    if (branchId) p.branch_id = branchId
    return p
  }, [warehouseId, branchId, filter, withinDays, page])

  const { data, isLoading } = useQuery({
    queryKey: ['expiry-stock-report', tenantId, params],
    queryFn: () => fetchExpiryStockReport(tenantId, params) as Promise<{ data: ExpiryStockReportRow[]; meta: { total: number; last_page: number; current_page: number } }>,
    enabled: !!tenantId,
  })

  const rows = data?.data ?? []
  const meta = data?.meta
  const total = meta?.total ?? 0
  const lastPage = Math.max(1, meta?.last_page ?? 1)

  useEffect(() => {
    setPage(1)
  }, [warehouseId, branchId, filter, withinDays])

  useEffect(() => {
    if (page > lastPage) setPage(1)
  }, [page, lastPage])

  const title = lang === 'ar' ? 'تقرير الأصناف حسب الصلاحية' : 'Stock by expiry report'
  const subtitle =
    lang === 'ar'
      ? 'مخزون برصيد موجب مرتب حسب أقرب تاريخ انتهاء (حركات المخزون التي تحمل تاريخ صلاحية، ويمكن ربطها برقم باتش).'
      : 'Positive on-hand lots ordered by expiry (from inventory movements with an expiry date).'

  return (
    <div className="inventory-report-page px-0 py-4 space-y-4 w-full max-w-full min-w-0" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-2 sm:px-0">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Package className="shrink-0" size={22} />
            {title}
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-3xl">{subtitle}</p>
        </div>
      </div>

      <div className="no-print bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3 w-full min-w-0">
        <div className={filterBarOverflowClass}>
          <div className={filterRowInnerStretchClass}>
            <div className={filterCellGrowClass}>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as FilterMode)}
                className={filterSelectClass}
                aria-label="filter"
              >
                <option value="expiring">{lang === 'ar' ? 'قاربة الانتهاء' : 'Expiring soon'}</option>
                <option value="expired">{lang === 'ar' ? 'منتهية' : 'Expired'}</option>
                <option value="all">{lang === 'ar' ? 'كل ما له صلاحية (رصيد موجب)' : 'All dated stock'}</option>
              </select>
            </div>
            {filter === 'expiring' && (
              <div className={filterCellGrowClass}>
                <label className={`block text-xs text-slate-600 mb-0.5 ${textAlign}`}>
                  {lang === 'ar' ? 'خلال (أيام)' : 'Within (days)'}
                </label>
                <input
                  type="number"
                  min={1}
                  max={730}
                  value={withinDays}
                  onChange={(e) => setWithinDays(Math.max(1, Math.min(730, Number(e.target.value) || 90)))}
                  className={filterSelectClass}
                />
              </div>
            )}
            <div className={filterCellGrowClass}>
              <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className={filterSelectClass}>
                <option value="">{t.nav?.warehouses ?? (lang === 'ar' ? 'كل المخازن' : 'All warehouses')}</option>
                {(warehouses as { id: number; name: string }[]).map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div className={filterCellGrowClass}>
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={filterSelectClass}>
                <option value="">{t.journal?.branch ?? (lang === 'ar' ? 'كل الفروع' : 'All branches')}</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {lang === 'ar' ? b.name : b.name_en || b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="inventory-report-table-card no-print w-full min-w-0 max-w-full bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : (
          <div
            className="w-full min-w-0 overflow-x-auto overflow-y-auto print:overflow-visible"
            style={{ maxHeight: 'calc(100vh - 280px)' }}
          >
            <table className="w-full text-sm table-fixed min-w-[920px]">
              <thead>
                <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <th className={`${textAlign} px-4 py-2 font-medium`}>{t.items.itemCode}</th>
                  <th className={`${textAlign} px-4 py-2 font-medium`}>{t.items.itemName}</th>
                  <th className={`${textAlign} px-4 py-2 font-medium`}>{lang === 'ar' ? 'المتغير' : 'Variant'}</th>
                  <th className={`${textAlign} px-4 py-2 font-medium`}>{lang === 'ar' ? 'المخزن' : 'Warehouse'}</th>
                  <th className={`${textAlign} px-4 py-2 font-medium`}>{lang === 'ar' ? 'الفرع' : 'Branch'}</th>
                  <th className={`${textAlign} px-4 py-2 font-medium`}>{lang === 'ar' ? 'رقم الباتش' : 'Batch'}</th>
                  <th className={`${textAlign} px-4 py-2 font-medium`}>{lang === 'ar' ? 'تاريخ الصلاحية' : 'Expiry'}</th>
                  <th className="text-right px-4 py-2 font-medium tabular-nums">{t.items.currentStock}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                      {lang === 'ar' ? 'لا توجد بيانات مطابقة.' : 'No matching rows.'}
                    </td>
                  </tr>
                ) : (
                  rows.map((r, i) => (
                    <tr key={`${r.item_id}-${r.item_variant_id ?? 'x'}-${r.warehouse_id ?? 'w'}-${r.expiry_date ?? 'e'}-${r.batch_number ?? 'b'}-${i}`} className="hover:bg-slate-50">
                      <td className={`${textAlign} px-4 py-2`}>{r.item_code}</td>
                      <td className={`${textAlign} px-4 py-2`}>{r.item_name}</td>
                      <td className={`${textAlign} px-4 py-2 text-slate-600`}>{r.variant_name ?? '—'}</td>
                      <td className={`${textAlign} px-4 py-2 text-slate-600`}>{r.warehouse_name ?? '—'}</td>
                      <td className={`${textAlign} px-4 py-2 text-slate-600`}>{r.branch_name ?? '—'}</td>
                      <td className={`${textAlign} px-4 py-2 text-slate-600`}>{r.batch_number ?? '—'}</td>
                      <td className={`${textAlign} px-4 py-2 tabular-nums font-medium`}>{r.expiry_date ?? '—'}</td>
                      <td className="text-right px-4 py-2 tabular-nums">{Number(r.qty).toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        {!isLoading && (
          <ReportFooter
            dense
            totalCount={total}
            currentPage={page}
            lastPage={lastPage}
            from={total === 0 ? 0 : (page - 1) * PER_PAGE + 1}
            to={Math.min(page * PER_PAGE, total)}
            onPageChange={setPage}
            lang={lang}
            isRtl={isRtl}
            alwaysShowPaginationBar
            showRecordSummary={total > 0}
            recordLabel={lang === 'ar' ? 'باتش' : 'lot'}
          />
        )}
      </div>
    </div>
  )
}
