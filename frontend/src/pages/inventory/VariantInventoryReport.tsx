import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchVariantInventoryReport,
  fetchWarehouses,
  fetchItemsForFilter,
  fetchItemCategories,
  fetchItemBrands,
  fetchBranches,
  fetchItemAttributeTemplates,
  fetchSettings,
} from '../../api/tenant'
import type { Branch, ItemAttributeTemplate, VariantInventoryReportResponse, VariantInventoryRow } from '../../types'
import { coerceDecimalPlaces, formatAmount } from '../../utils/currency'
import { asArray } from '../../utils/asArray'
import {
  filterBarOverflowClass,
  filterCellGrowClass,
  filterRowInnerStretchClass,
  filterSearchableInputTallClass,
  filterSelectClass,
} from '../../utils/filterControlStyles'
import ReportFooter from '../../components/ui/ReportFooter'
import SearchableSelect, { type SearchableSelectOption } from '../../components/ui/SearchableSelect'

const LIST_INITIAL_PAGE_SIZE = 50
const ITEM_FILTER_PAGE_SIZE = 2000
const PER_PAGE = 50

export default function VariantInventoryReport() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const [warehouseIdFilter, setWarehouseIdFilter] = useState('')
  const [branchIdFilter, setBranchIdFilter] = useState('')
  const [itemIdFilter, setItemIdFilter] = useState('')
  const [categoryIdFilter, setCategoryIdFilter] = useState('')
  const [brandIdFilter, setBrandIdFilter] = useState('')
  const [attributeTemplateId, setAttributeTemplateId] = useState('')
  const [attributeValue, setAttributeValue] = useState('')
  const [page, setPage] = useState(1)

  const { data: settings } = useQuery({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
    staleTime: 60_000,
  })

  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const amountDecimals = 3
  const qtyDecimals = coerceDecimalPlaces((settings as { doc_quantity_decimals?: number } | undefined)?.doc_quantity_decimals, 3)
  const fmt = (n: number) => formatAmount(n, { decimal_places: amountDecimals }, locale)
  const fmtQty = (n: number) => Number(n).toLocaleString(locale, { minimumFractionDigits: qtyDecimals, maximumFractionDigits: qtyDecimals })

  const { data: warehousesResp } = useQuery({
    queryKey: ['warehouses', tenantId, LIST_INITIAL_PAGE_SIZE],
    queryFn: () => fetchWarehouses(tenantId, { per_page: String(LIST_INITIAL_PAGE_SIZE) }),
    enabled: !!tenantId,
    staleTime: 60_000,
  })
  const warehouses = warehousesResp?.data ?? []

  const { data: itemsResp } = useQuery({
    queryKey: ['items', tenantId, 'variant-inventory-filter', ITEM_FILTER_PAGE_SIZE],
    queryFn: () => fetchItemsForFilter(tenantId, { per_page: String(ITEM_FILTER_PAGE_SIZE) }),
    enabled: !!tenantId,
    staleTime: 60_000,
  })
  const itemsList = itemsResp?.data ?? []

  const { data: categoriesData } = useQuery({
    queryKey: ['item-categories', tenantId],
    queryFn: () => fetchItemCategories(tenantId),
    enabled: !!tenantId,
    staleTime: 60_000,
  })
  const categories = asArray(categoriesData)

  const { data: brandsData } = useQuery({
    queryKey: ['item-brands', tenantId],
    queryFn: () => fetchItemBrands(tenantId),
    enabled: !!tenantId,
    staleTime: 60_000,
  })
  const brands = asArray(brandsData)

  const { data: branchesData } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId,
    staleTime: 60_000,
  })
  const branches = asArray<Branch>(branchesData)

  const { data: templatesData } = useQuery({
    queryKey: ['item-attribute-templates', tenantId],
    queryFn: () => fetchItemAttributeTemplates(tenantId),
    enabled: !!tenantId,
    staleTime: 60_000,
  })
  const templates: ItemAttributeTemplate[] = Array.isArray(templatesData) ? templatesData : []

  const itemNameFieldLabel = t.items.itemName
  const itemFilterOptions: SearchableSelectOption[] = useMemo(() => {
    const list = Array.isArray(itemsList) ? itemsList : []
    return [
      { value: 0, label: itemNameFieldLabel },
      ...list.map((i: { id: number; name: string; code?: string }) => ({
        value: i.id,
        label: i.code ? `${i.code} - ${i.name}` : i.name,
      })),
    ]
  }, [itemsList, itemNameFieldLabel])

  const reportParams = useMemo((): Record<string, string> => {
    const p: Record<string, string> = {
      per_page: String(PER_PAGE),
      page: String(page),
    }
    if (warehouseIdFilter) p.warehouse_id = warehouseIdFilter
    if (branchIdFilter) p.branch_id = branchIdFilter
    if (itemIdFilter) p.item_id = itemIdFilter
    if (categoryIdFilter) p.category_id = categoryIdFilter
    if (brandIdFilter) p.brand_id = brandIdFilter
    if (attributeTemplateId) p.attribute_template_id = attributeTemplateId
    if (attributeValue.trim()) p.attribute_value = attributeValue.trim()
    return p
  }, [warehouseIdFilter, branchIdFilter, itemIdFilter, categoryIdFilter, brandIdFilter, attributeTemplateId, attributeValue, page])

  const { data, isLoading } = useQuery({
    queryKey: ['variant-inventory-report', tenantId, reportParams],
    queryFn: () => fetchVariantInventoryReport(tenantId, reportParams) as Promise<VariantInventoryReportResponse>,
    enabled: !!tenantId,
  })

  const rows: VariantInventoryRow[] = data?.data ?? []
  const meta = data?.meta
  const summary = data?.summary
  const totalCount = meta?.total ?? 0
  const lastPage = Math.max(1, meta?.last_page ?? 1)
  const from = totalCount === 0 ? 0 : (page - 1) * PER_PAGE + 1
  const to = Math.min(page * PER_PAGE, totalCount)

  useEffect(() => {
    setPage(1)
  }, [warehouseIdFilter, branchIdFilter, itemIdFilter, categoryIdFilter, brandIdFilter, attributeTemplateId, attributeValue])

  useEffect(() => {
    if (page > lastPage) setPage(1)
  }, [page, lastPage])

  const textAlign = isRtl ? 'text-right' : 'text-left'
  const inv = t.inventory as {
    variantInventoryReport?: string
    attributeTemplateFilter?: string
    attributeValueFilter?: string
    totalStockValue?: string
    totalQuantityVariants?: string
  }

  return (
    <div
      className="inventory-report-page inventory-report-full-bleed px-0 py-4 space-y-4 w-full max-w-full min-w-0"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-2 sm:px-0">
        <h1 className="text-xl font-bold text-slate-900">
          {inv.variantInventoryReport ?? (lang === 'ar' ? 'جرد المتغيرات' : 'Variant Inventory Report')}
        </h1>
      </div>

      <div className="no-print bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3 w-full min-w-0">
        <div className={filterBarOverflowClass}>
          <div className={filterRowInnerStretchClass}>
            <div className={filterCellGrowClass}>
              <select
                value={warehouseIdFilter}
                onChange={(e) => setWarehouseIdFilter(e.target.value)}
                className={filterSelectClass}
                aria-label={t.nav?.warehouses ?? (lang === 'ar' ? 'المخازن' : 'Warehouses')}
              >
                <option value="">{t.nav?.warehouses ?? (lang === 'ar' ? 'المخازن' : 'Warehouses')}</option>
                {warehouses.map((w: { id: number; code?: string; name: string }) => (
                  <option key={w.id} value={w.id}>
                    {w.code ? `${w.code} - ` : ''}
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div className={filterCellGrowClass}>
              <SearchableSelect
                options={itemFilterOptions}
                value={itemIdFilter === '' ? 0 : Number(itemIdFilter) || 0}
                onChange={(v) => {
                  setItemIdFilter(v === null || v === 0 || v === '' ? '' : String(v))
                  setPage(1)
                }}
                placeholder={itemNameFieldLabel}
                textAlign={isRtl ? 'right' : 'left'}
                wrapOptions
                className="w-full min-w-0 overflow-visible"
                inputClassName={filterSearchableInputTallClass}
              />
            </div>
            <div className={filterCellGrowClass}>
              <select
                value={categoryIdFilter}
                onChange={(e) => setCategoryIdFilter(e.target.value)}
                className={filterSelectClass}
                aria-label={t.items.category}
              >
                <option value="">{t.items.category}</option>
                {(categories as { id: number; name: string }[]).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className={filterCellGrowClass}>
              <select
                value={brandIdFilter}
                onChange={(e) => setBrandIdFilter(e.target.value)}
                className={filterSelectClass}
                aria-label={t.items.brand ?? (lang === 'ar' ? 'العلامة التجارية' : 'Brand')}
              >
                <option value="">{t.items.brand ?? (lang === 'ar' ? 'العلامة التجارية' : 'Brand')}</option>
                {(brands as { id: number; name: string }[]).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className={filterCellGrowClass}>
              <select
                value={branchIdFilter}
                onChange={(e) => setBranchIdFilter(e.target.value)}
                className={filterSelectClass}
                aria-label={t.journal?.branch ?? (lang === 'ar' ? 'الفرع' : 'Branch')}
              >
                <option value="">{t.journal?.branch ?? (lang === 'ar' ? 'الفرع' : 'Branch')}</option>
                {(branches as { id: number; name: string }[]).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className={filterCellGrowClass}>
              <select
                value={attributeTemplateId}
                onChange={(e) => setAttributeTemplateId(e.target.value)}
                className={filterSelectClass}
                aria-label={inv.attributeTemplateFilter ?? (lang === 'ar' ? 'قالب الخاصية' : 'Attribute template')}
              >
                <option value="">
                  {inv.attributeTemplateFilter ?? (lang === 'ar' ? 'كل قوالب الخصائص' : 'All attribute templates')}
                </option>
                {templates.map((tpl) => (
                  <option key={tpl.id} value={String(tpl.id)}>
                    {tpl.name}
                  </option>
                ))}
              </select>
            </div>
            <div className={filterCellGrowClass}>
              <input
                type="text"
                value={attributeValue}
                onChange={(e) => setAttributeValue(e.target.value)}
                placeholder={inv.attributeValueFilter ?? (lang === 'ar' ? 'بحث في قيمة المتغير' : 'Variant value search')}
                className={filterSelectClass}
                aria-label={inv.attributeValueFilter ?? 'attribute_value'}
              />
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
            className="inventory-report-table-scroll inventory-report-table-wrap w-full min-w-0 overflow-x-auto overflow-y-auto print:overflow-visible"
            style={{ maxHeight: 'calc(100vh - 280px)' }}
          >
            <table className="inventory-report-table w-full text-sm table-fixed min-w-[900px]">
              <colgroup>
                <col style={{ width: '100px' }} />
                <col style={{ width: '200px' }} />
                <col style={{ width: '160px' }} />
                <col style={{ width: '220px' }} />
                <col style={{ width: '110px' }} />
                <col style={{ width: '70px' }} />
                <col style={{ width: '100px' }} />
                <col style={{ width: '100px' }} />
                <col style={{ width: '110px' }} />
              </colgroup>
              <thead>
                <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <th className={`${textAlign} px-4 py-2 font-medium`}>{t.items.itemCode}</th>
                  <th className={`${textAlign} px-4 py-2 font-medium`}>{t.items.itemName}</th>
                  <th className={`${textAlign} px-4 py-2 font-medium`}>{lang === 'ar' ? 'المتغير' : 'Variant'}</th>
                  <th className={`${textAlign} px-4 py-2 font-medium`}>{lang === 'ar' ? 'الخصائص' : 'Attributes'}</th>
                  <th className={`${textAlign} px-4 py-2 font-medium`}>{t.items.barcode}</th>
                  <th className={`${textAlign} px-4 py-2 font-medium`}>{t.items.unit}</th>
                  <th className="text-right px-4 py-2 font-medium tabular-nums">{t.items.currentStock}</th>
                  <th className="text-right px-4 py-2 font-medium tabular-nums">{t.inventory.averageCost}</th>
                  <th className="text-right px-4 py-2 font-medium tabular-nums">{t.items.stockValue}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-slate-400">
                      {t.items.noItems}
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/50">
                      <td className={`${textAlign} px-4 py-2 font-mono text-slate-700`}>{r.item_code}</td>
                      <td className={`${textAlign} px-4 py-2 text-slate-800 font-medium`}>{r.item_name}</td>
                      <td className={`${textAlign} px-4 py-2 text-slate-700`}>{r.variant_name}</td>
                      <td className={`${textAlign} px-4 py-2 text-slate-600 text-xs`} title={r.options_display}>
                        <span className="line-clamp-2">{r.options_display || '—'}</span>
                      </td>
                      <td className={`${textAlign} px-4 py-2 font-mono text-slate-600 text-xs`}>{r.barcode ?? '—'}</td>
                      <td className={`${textAlign} px-4 py-2 text-slate-600`}>{r.item_unit}</td>
                      <td className="text-right px-4 py-2 tabular-nums">{fmtQty(r.current_stock)}</td>
                      <td className="text-right px-4 py-2 tabular-nums">{fmt(r.average_cost)}</td>
                      <td className="text-right px-4 py-2 tabular-nums font-medium">{fmt(r.stock_value)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {rows.length > 0 && summary != null && (
                <tfoot>
                  <tr className="bg-gradient-to-r from-slate-100 to-slate-50 border-t-2 border-slate-400 font-bold text-slate-900 shadow-[0_-2px_4px_rgba(0,0,0,0.04)]">
                    <td colSpan={6} className={`${textAlign} px-4 py-3 text-base`}>
                      {t.total}
                    </td>
                    <td className="text-right px-4 py-3 tabular-nums">{fmtQty(summary.total_quantity)}</td>
                    <td className="text-right px-4 py-3 tabular-nums text-slate-400">—</td>
                    <td className="text-right px-4 py-3 tabular-nums">{fmt(summary.total_stock_value)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
        {!isLoading && (
          <ReportFooter
            totalCount={totalCount}
            currentPage={page}
            lastPage={lastPage}
            from={from}
            to={to}
            onPageChange={setPage}
            lang={lang}
            isRtl={isRtl}
            alwaysShowPaginationBar
            showRecordSummary={totalCount > 0}
            recordLabel={lang === 'ar' ? 'متغير' : 'variant'}
            dense
          />
        )}
      </div>
    </div>
  )
}
