import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchInventoryFullReport,
  fetchSettings,
  fetchWarehouses,
  fetchItemsForFilter,
  fetchItemCategories,
  fetchItemBrands,
  fetchBranches,
  fetchItemUnits,
} from '../../api/tenant'
import type { Branch, InventoryReport as IReport, InventoryReportItem, ItemUnit, TenantSettings, Warehouse } from '../../types'
import { coerceDecimalPlaces, formatAmount } from '../../utils/currency'
import { asArray } from '../../utils/asArray'
import { getDefaultDateRange } from '../../utils/date'
import {
  filterBarOverflowClass,
  filterCellGrowClass,
  filterRowInnerStretchClass,
  filterSearchableInputTallClass,
  filterSelectClass,
} from '../../utils/filterControlStyles'
import { AlertTriangle, Printer, FileText, FileSpreadsheet, Columns3 } from 'lucide-react'
import ReportFooter from '../../components/ui/ReportFooter'
import { usePersistedColumnVisibility } from '../../hooks/usePersistedColumnVisibility'
import SearchableSelect, { type SearchableSelectOption } from '../../components/ui/SearchableSelect'
import { useClientSort, type SortColumn } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'

type InventoryReportColumnKey = 'code' | 'name' | 'unit' | 'openingBalance' | 'incoming' | 'outgoing' | 'currentStock' | 'costPrice' | 'averageCost' | 'stockValue'
const INVENTORY_REPORT_COLUMN_KEYS: InventoryReportColumnKey[] = ['code', 'name', 'unit', 'openingBalance', 'incoming', 'outgoing', 'currentStock', 'costPrice', 'averageCost', 'stockValue']
const INVENTORY_COLUMNS_STORAGE_KEY = 'inventoryReportVisibleColumns'

export default function InventoryReport() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const defaultRange = getDefaultDateRange()
  const [dateFrom, setDateFrom] = useState(defaultRange.dateFrom)
  const [dateTo, setDateTo] = useState(defaultRange.dateTo)
  const [warehouseIdFilter, setWarehouseIdFilter] = useState('')
  const [itemIdFilter, setItemIdFilter] = useState('')
  const [categoryIdFilter, setCategoryIdFilter] = useState('')
  const [brandIdFilter, setBrandIdFilter] = useState('')
  const [unitIdFilter, setUnitIdFilter] = useState('')
  /** unit_match عند اختيار وحدة عرض — يُرسل للـ API مع unit_id */
  const [unitMatchFilter, setUnitMatchFilter] = useState<'hide' | 'show_zero'>('hide')
  const [branchIdFilter, setBranchIdFilter] = useState('')
  const [visibleColumns, setVisibleColumns] = usePersistedColumnVisibility(
    INVENTORY_COLUMNS_STORAGE_KEY,
    INVENTORY_REPORT_COLUMN_KEYS,
  )
  const [showColumnsMenu, setShowColumnsMenu] = useState(false)
  const columnsMenuRef = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(1)
  const perPage = 50

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (columnsMenuRef.current && !columnsMenuRef.current.contains(e.target as Node)) setShowColumnsMenu(false)
    }
    if (showColumnsMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showColumnsMenu])

  const { data: settings } = useQuery<TenantSettings>({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const displayUnitDecimals = Boolean(unitIdFilter)
  const amountDecimals = displayUnitDecimals ? 3 : coerceDecimalPlaces(settings?.doc_amount_decimals, 2)
  const qtyDecimals = displayUnitDecimals ? 3 : coerceDecimalPlaces(settings?.doc_quantity_decimals, 2)
  const fmt = (n: number) => formatAmount(n, { decimal_places: amountDecimals }, locale)
  const fmtQty = (n: number) => Number(n).toLocaleString(locale, { minimumFractionDigits: qtyDecimals, maximumFractionDigits: qtyDecimals })

  /** حجم دفعة المخازن؛ الأصناف تُجلب دفعة كبيرة للبحث داخل الفلتر */
  const LIST_INITIAL_PAGE_SIZE = 50
  const ITEM_FILTER_PAGE_SIZE = 2000

  const { data: warehousesResp } = useQuery<{ data: Warehouse[] }>({
    queryKey: ['warehouses', tenantId, LIST_INITIAL_PAGE_SIZE],
    queryFn: () => fetchWarehouses(tenantId, { per_page: String(LIST_INITIAL_PAGE_SIZE) }),
    enabled: !!tenantId,
    staleTime: 60_000,
  })
  const warehouses = warehousesResp?.data ?? []

  const { data: itemsResp } = useQuery({
    queryKey: ['items', tenantId, 'inventory-report-filter', ITEM_FILTER_PAGE_SIZE],
    queryFn: () => fetchItemsForFilter(tenantId, { per_page: String(ITEM_FILTER_PAGE_SIZE) }),
    enabled: !!tenantId,
    staleTime: 60_000,
  })
  const itemsList = itemsResp?.data ?? []

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

  const { data: itemUnitsData } = useQuery<ItemUnit[]>({
    queryKey: ['item-units', tenantId],
    queryFn: () => fetchItemUnits(tenantId),
    enabled: !!tenantId,
    staleTime: 60_000,
  })
  const itemUnitsList = Array.isArray(itemUnitsData) ? itemUnitsData : []

  const reportParams: Record<string, string> = {}
  if (dateFrom) reportParams.from_date = dateFrom
  if (dateTo) reportParams.to_date = dateTo
  if (warehouseIdFilter) reportParams.warehouse_id = warehouseIdFilter
  if (itemIdFilter) reportParams.item_id = itemIdFilter
  if (categoryIdFilter) reportParams.category_id = categoryIdFilter
  if (brandIdFilter) reportParams.brand_id = brandIdFilter
  if (unitIdFilter) {
    reportParams.unit_id = unitIdFilter
    reportParams.unit_match = unitMatchFilter
  }
  const hasReportParams = Object.keys(reportParams).length > 0

  const { data, isLoading } = useQuery<IReport>({
    queryKey: ['inventory-report', tenantId, reportParams],
    queryFn: () => fetchInventoryFullReport(tenantId, hasReportParams ? reportParams : undefined),
    enabled: !!tenantId,
  })

  const allItems = data?.items ?? []
  const reportSummary = data?.summary

  const inventorySortColumns = useMemo((): SortColumn<InventoryReportItem, InventoryReportColumnKey>[] => {
    return [
      { key: 'code', type: 'string', getValue: (i) => i.code ?? '' },
      { key: 'name', type: 'string', getValue: (i) => i.name ?? '' },
      { key: 'unit', type: 'string', getValue: (i) => i.unit ?? '' },
      { key: 'openingBalance', type: 'number', getValue: (i) => (i.opening_balance == null ? 0 : Number(i.opening_balance)) },
      { key: 'incoming', type: 'number', getValue: (i) => (i.incoming == null ? 0 : Number(i.incoming)) },
      { key: 'outgoing', type: 'number', getValue: (i) => (i.outgoing == null ? 0 : Number(i.outgoing)) },
      { key: 'currentStock', type: 'number', getValue: (i) => Number(i.current_stock) },
      { key: 'costPrice', type: 'number', getValue: (i) => Number(i.cost_price) },
      { key: 'averageCost', type: 'number', getValue: (i) => Number(i.average_cost) },
      { key: 'stockValue', type: 'number', getValue: (i) => Number(i.stock_value) },
    ]
  }, [])
  const { sort, toggleSort, sortedRows: sortedInventoryItems } = useClientSort(allItems, inventorySortColumns, { locale })

  /** تنسيق الرصيد المفصّل (مثلاً: 5 كرتون، 2 علبة، 3 قطع) */
  function formatStockBreakdown(item: { current_stock: number; stock_breakdown?: { unit_name: string; quantity: number }[] }): string {
    const breakdown = item.stock_breakdown
    if (breakdown && breakdown.length > 0) {
      return breakdown
        .filter(b => Number(b.quantity) >= 0.0001)
        .map(b => `${Number(b.quantity)} ${b.unit_name}`)
        .join(lang === 'ar' ? ' و ' : ', ') || fmtQty(item.current_stock)
    }
    return fmtQty(item.current_stock)
  }

  const filteredItems = sortedInventoryItems
  const totalCount = filteredItems.length
  const lastPage = Math.max(1, Math.ceil(totalCount / perPage))
  const from = totalCount === 0 ? 0 : (page - 1) * perPage + 1
  const to = Math.min(page * perPage, totalCount)
  const paginatedItems = filteredItems.slice((page - 1) * perPage, page * perPage)

  useEffect(() => {
    if (page > lastPage) setPage(1)
  }, [page, lastPage])

  const columnLabels: Record<InventoryReportColumnKey, string> = {
    code: t.items.itemCode,
    name: t.items.itemName,
    unit: t.items.unit,
    openingBalance: lang === 'ar' ? 'رصيد أول' : 'Opening balance',
    incoming: lang === 'ar' ? 'الوارد' : 'Incoming',
    outgoing: lang === 'ar' ? 'الصادر' : 'Outgoing',
    currentStock: t.items.currentStock,
    costPrice: t.items.costPrice,
    averageCost: t.inventory.averageCost,
    stockValue: t.items.stockValue,
  }
  const visibleColumnKeys = INVENTORY_REPORT_COLUMN_KEYS.filter((k) => visibleColumns[k])
  const noDataColSpan = Math.max(visibleColumnKeys.length, 1)
  const textAlign = isRtl ? 'text-right' : 'text-left'
  const labelFooterKeys = ['code', 'name', 'unit', 'openingBalance', 'incoming', 'outgoing'] as const
  const labelFooterColSpan = Math.max(1, labelFooterKeys.filter((k) => visibleColumns[k]).length)

  function exportExcel() {
    const keys = visibleColumnKeys
    if (keys.length === 0) return
    const headers = keys.map((k) => columnLabels[k])
    const rows = filteredItems.map((i) =>
      keys.map((k) => {
        if (k === 'code') return i.code
        if (k === 'name') return i.name
        if (k === 'unit') return i.unit
        if (k === 'openingBalance') return i.opening_balance != null ? fmtQty(i.opening_balance) : '—'
        if (k === 'incoming') return i.incoming != null ? fmtQty(i.incoming) : '—'
        if (k === 'outgoing') return i.outgoing != null ? fmtQty(i.outgoing) : '—'
        if (k === 'currentStock') return fmtQty(i.current_stock)
        if (k === 'costPrice') return fmt(Number(i.cost_price))
        if (k === 'averageCost') return fmt(Number(i.average_cost))
        if (k === 'stockValue') return fmt(Number(i.stock_value))
        return ''
      })
    )
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `inventory-report-${dateFrom || ''}-${dateTo || ''}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handlePrint() {
    window.print()
  }

  const companyName = (settings as Record<string, unknown>)?.company_name as string | undefined
  const companyLogo = (settings as Record<string, unknown>)?.company_logo as string | undefined
  const periodLabel = [dateFrom, dateTo].filter(Boolean).join(' — ') || (lang === 'ar' ? 'الفترة' : 'Period')

  return (
    <div className="inventory-report-page inventory-report-full-bleed px-0 py-4 space-y-4 print:p-0 print:space-y-0 w-full max-w-full min-w-0">
      {/* شريط العنوان والتواريخ والأزرار — يخفى عند الطباعة */}
      <div className="no-print flex flex-wrap items-center justify-between gap-2 py-1.5">
        <h1 className="text-xl font-bold text-slate-900">{t.inventory.inventoryReport}</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 border border-slate-300 rounded-lg px-2.5 text-sm bg-white" title={t.date} />
          <span className="text-slate-400 text-sm">—</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 border border-slate-300 rounded-lg px-2.5 text-sm bg-white" title={t.date} />
        </div>
        <div className="relative flex items-center gap-1.5 no-print" ref={columnsMenuRef}>
          <button
            type="button"
            onClick={() => setShowColumnsMenu((v) => !v)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white border border-slate-300 text-slate-600 hover:bg-slate-50"
            title={lang === 'ar' ? 'تخصيص الأعمدة' : 'Customize columns'}
          >
            <Columns3 size={14} />
          </button>
          {showColumnsMenu && (
            <div className={`absolute top-full mt-2 z-20 w-56 rounded-lg border border-slate-200 bg-white shadow-lg py-2 text-sm ${isRtl ? 'right-0' : 'left-0'}`}>
              <div className="px-3 pb-2 text-xs font-semibold text-slate-500">
                {lang === 'ar' ? 'إظهار / إخفاء الأعمدة' : 'Show / hide columns'}
              </div>
              {INVENTORY_REPORT_COLUMN_KEYS.map((key) => (
                <label
                  key={key}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    checked={visibleColumns[key]}
                    onChange={() =>
                      setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }))
                    }
                    className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-slate-700 text-xs">{columnLabels[key]}</span>
                </label>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#F0F2F5] border border-[#D9DCE0] text-[#344054] hover:bg-[#E4E7EB]"
            title={t.accounts?.print ?? (lang === 'ar' ? 'طباعة' : 'Print')}
          >
            <Printer size={14} />
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#344054] text-white hover:bg-[#2d3846]"
            title={t.accounts?.exportPdf ?? (lang === 'ar' ? 'تصدير PDF' : 'Export PDF')}
          >
            <FileText size={14} />
          </button>
          <button
            type="button"
            onClick={exportExcel}
            disabled={filteredItems.length === 0}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
            title={t.accounts?.exportExcel ?? (lang === 'ar' ? 'تصدير Excel' : 'Export Excel')}
          >
            <FileSpreadsheet size={14} />
          </button>
        </div>
      </div>

      {/* Filters — سطر واحد، عرض متساوٍ؛ اسم الحقل في الخيار الفارغ */}
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
                <option key={w.id} value={w.id}>{w.code ? `${w.code} - ` : ''}{w.name}</option>
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
              value={unitIdFilter}
              onChange={(e) => {
                const v = e.target.value
                setUnitIdFilter(v)
                if (!v) setUnitMatchFilter('hide')
                setPage(1)
              }}
              className={filterSelectClass}
              aria-label={t.items.itemUnitFilter}
            >
              <option value="">{t.items.itemUnitFilter}</option>
              {itemUnitsList
                .filter((u) => u.is_active !== false)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {lang === 'ar' ? u.name : u.name_en || u.name}
                    {u.symbol ? ` (${u.symbol})` : ''}
                  </option>
                ))}
            </select>
          </div>
          <div className={`${filterCellGrowClass} flex flex-col gap-0.5 justify-center min-w-0`}>
            <span className="text-[11px] leading-tight text-slate-500 dark:text-slate-400 truncate">
              {(t.inventory as { reportDisplayUnitBehaviorLabel?: string }).reportDisplayUnitBehaviorLabel ?? ''}
            </span>
            <select
              value={unitMatchFilter}
              onChange={(e) => {
                setUnitMatchFilter(e.target.value === 'show_zero' ? 'show_zero' : 'hide')
                setPage(1)
              }}
              disabled={!unitIdFilter}
              title={(t.inventory as { reportDisplayUnitBehaviorHint?: string }).reportDisplayUnitBehaviorHint}
              className={`${filterSelectClass}${!unitIdFilter ? ' opacity-60 cursor-not-allowed' : ''}`}
              aria-label={
                (t.inventory as { reportDisplayUnitBehaviorLabel?: string }).reportDisplayUnitBehaviorLabel ??
                'unit_match'
              }
            >
              <option value="hide">{t.inventory.reportUnitMatchHide}</option>
              <option value="show_zero">{t.inventory.reportUnitMatchZeros}</option>
            </select>
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
                <option key={c.id} value={c.id}>{c.name}</option>
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
                <option key={b.id} value={b.id}>{b.name}</option>
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
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          </div>
        </div>
        <p className="mt-2 text-xs leading-snug text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-700 pt-2">
          {(t.inventory as { itemVariantsVsUnitFilterHint?: string }).itemVariantsVsUnitFilterHint}
        </p>
      </div>

      {/* Report Table — نفس أسلوب تقرير مبيعات الأصناف: table-fixed + SortableTh الافتراضي + px-4 py-2 */}
      <div className="inventory-report-table-card no-print w-full min-w-0 max-w-full bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : (
          <div
            className="w-full min-w-0 overflow-x-auto overflow-y-auto print:overflow-visible"
            style={{ maxHeight: 'calc(100vh - 260px)' }}
          >
            <table className="w-full text-sm table-fixed">
              {/*
                table-layout: fixed يوزّع الأعمدة حسب <col>؛ min-w على th لا يكفي لعرض اسم الصنف.
                عمود الاسم بعرض صريح (قابل للتعديل عبر <col>).
              */}
              <colgroup>
                {visibleColumns.code && <col style={{ width: '90px' }} />}
                {visibleColumns.name && <col style={{ width: '256px' }} />}
                {visibleColumns.unit && <col style={{ width: '70px' }} />}
                {visibleColumns.openingBalance && <col style={{ width: '80px' }} />}
                {visibleColumns.incoming && <col style={{ width: '80px' }} />}
                {visibleColumns.outgoing && <col style={{ width: '80px' }} />}
                {visibleColumns.currentStock && <col style={{ width: '80px' }} />}
                {visibleColumns.costPrice && <col style={{ width: '100px' }} />}
                {visibleColumns.averageCost && <col style={{ width: '100px' }} />}
                {visibleColumns.stockValue && <col style={{ width: '110px' }} />}
              </colgroup>
              <thead>
                <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  {visibleColumns.code && (
                    <SortableTh
                      label={columnLabels.code}
                      sortKey="code"
                      sortState={sort}
                      onToggle={toggleSort}
                      truncateLabel={false}
                      widthClassName="min-w-[90px]"
                      className={`${textAlign} p-0 font-medium`}
                    />
                  )}
                  {visibleColumns.name && (
                    <SortableTh
                      label={columnLabels.name}
                      sortKey="name"
                      sortState={sort}
                      onToggle={toggleSort}
                      truncateLabel={false}
                      widthClassName="min-w-[256px]"
                      className={`${textAlign} p-0 font-medium`}
                    />
                  )}
                  {visibleColumns.unit && (
                    <SortableTh
                      label={columnLabels.unit}
                      sortKey="unit"
                      sortState={sort}
                      onToggle={toggleSort}
                      truncateLabel={false}
                      widthClassName="min-w-[70px]"
                      className={`${textAlign} p-0 font-medium`}
                    />
                  )}
                  {visibleColumns.openingBalance && (
                    <SortableTh
                      label={columnLabels.openingBalance}
                      sortKey="openingBalance"
                      sortState={sort}
                      onToggle={toggleSort}
                      truncateLabel={false}
                      widthClassName="min-w-[80px]"
                      className="text-right p-0 font-medium tabular-nums"
                    />
                  )}
                  {visibleColumns.incoming && (
                    <SortableTh
                      label={columnLabels.incoming}
                      sortKey="incoming"
                      sortState={sort}
                      onToggle={toggleSort}
                      truncateLabel={false}
                      widthClassName="min-w-[80px]"
                      className="text-right p-0 font-medium tabular-nums"
                    />
                  )}
                  {visibleColumns.outgoing && (
                    <SortableTh
                      label={columnLabels.outgoing}
                      sortKey="outgoing"
                      sortState={sort}
                      onToggle={toggleSort}
                      truncateLabel={false}
                      widthClassName="min-w-[80px]"
                      className="text-right p-0 font-medium tabular-nums"
                    />
                  )}
                  {visibleColumns.currentStock && (
                    <SortableTh
                      label={columnLabels.currentStock}
                      sortKey="currentStock"
                      sortState={sort}
                      onToggle={toggleSort}
                      truncateLabel={false}
                      widthClassName="min-w-[80px]"
                      className="text-right p-0 font-medium tabular-nums"
                    />
                  )}
                  {visibleColumns.costPrice && (
                    <SortableTh
                      label={columnLabels.costPrice}
                      sortKey="costPrice"
                      sortState={sort}
                      onToggle={toggleSort}
                      truncateLabel={false}
                      widthClassName="min-w-[100px]"
                      className="text-right p-0 font-medium tabular-nums"
                    />
                  )}
                  {visibleColumns.averageCost && (
                    <SortableTh
                      label={columnLabels.averageCost}
                      sortKey="averageCost"
                      sortState={sort}
                      onToggle={toggleSort}
                      truncateLabel={false}
                      widthClassName="min-w-[100px]"
                      className="text-right p-0 font-medium tabular-nums"
                    />
                  )}
                  {visibleColumns.stockValue && (
                    <SortableTh
                      label={columnLabels.stockValue}
                      sortKey="stockValue"
                      sortState={sort}
                      onToggle={toggleSort}
                      truncateLabel={false}
                      widthClassName="min-w-[110px]"
                      className="text-right p-0 font-medium tabular-nums"
                    />
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {paginatedItems.length === 0 ? (
                  <tr>
                    <td colSpan={noDataColSpan} className="text-center py-12 text-slate-400">
                      {t.items.noItems}
                    </td>
                  </tr>
                ) : (
                  paginatedItems.map((item, index) => {
                    const isEven = index % 2 === 0
                    const rowBg = item.is_low_stock
                      ? 'bg-red-50/70 hover:bg-red-100/70'
                      : isEven
                        ? 'bg-white hover:bg-slate-50'
                        : 'bg-slate-50/80 hover:bg-slate-100'
                    return (
                      <tr key={item.id} className={`transition-colors ${rowBg}`}>
                        {visibleColumns.code && (
                          <td className={`${textAlign} px-4 py-2 font-mono text-slate-700`}>{item.code}</td>
                        )}
                        {visibleColumns.name && (
                          <td className={`${textAlign} px-4 py-2 text-slate-800 font-medium`} title={item.name}>
                            <span className="inline-flex items-center gap-1 min-w-0 max-w-full">
                              <span className="truncate block min-w-0">{item.name}</span>
                              {item.is_low_stock && <AlertTriangle size={12} className="text-red-500 shrink-0" />}
                            </span>
                          </td>
                        )}
                        {visibleColumns.unit && (
                          <td className={`${textAlign} px-4 py-2 text-slate-600 whitespace-nowrap`} title={item.unit ?? undefined}>
                            {item.unit}
                          </td>
                        )}
                        {visibleColumns.openingBalance && (
                          <td className="text-right px-4 py-2 tabular-nums text-slate-700 whitespace-nowrap">
                            {item.opening_balance != null ? fmtQty(item.opening_balance) : '—'}
                          </td>
                        )}
                        {visibleColumns.incoming && (
                          <td className="text-right px-4 py-2 tabular-nums text-emerald-700 whitespace-nowrap">
                            {item.incoming != null ? fmtQty(item.incoming) : '—'}
                          </td>
                        )}
                        {visibleColumns.outgoing && (
                          <td className="text-right px-4 py-2 tabular-nums text-red-700 whitespace-nowrap">
                            {item.outgoing != null ? fmtQty(item.outgoing) : '—'}
                          </td>
                        )}
                        {visibleColumns.currentStock && (
                          <td
                            className={`text-right px-4 py-2 tabular-nums font-medium whitespace-nowrap ${item.is_low_stock ? 'text-red-600' : 'text-slate-900'}`}
                            title={formatStockBreakdown(item)}
                          >
                            {fmtQty(item.current_stock)}
                          </td>
                        )}
                        {visibleColumns.costPrice && (
                          <td className="text-right px-4 py-2 tabular-nums">{fmt(item.cost_price)}</td>
                        )}
                        {visibleColumns.averageCost && (
                          <td className="text-right px-4 py-2 tabular-nums text-blue-700 font-medium">{fmt(item.average_cost)}</td>
                        )}
                        {visibleColumns.stockValue && (
                          <td className="text-right px-4 py-2 tabular-nums font-medium">{fmt(item.stock_value)}</td>
                        )}
                      </tr>
                    )
                  })
                )}
              </tbody>
              {filteredItems.length > 0 && (() => {
                const totalBalance = filteredItems.reduce((s, i) => s + Number(i.current_stock), 0)
                const totalStockValueFromRows = filteredItems.reduce((s, i) => s + Number(i.stock_value), 0)
                const totalStockValueFooter =
                  reportSummary != null && typeof reportSummary.total_stock_value === 'number'
                    ? Number(reportSummary.total_stock_value)
                    : totalStockValueFromRows
                return (
                  <tfoot>
                    <tr className="bg-gradient-to-r from-slate-100 to-slate-50 border-t-2 border-slate-400 font-bold text-slate-900 shadow-[0_-2px_4px_rgba(0,0,0,0.04)]">
                      <td colSpan={labelFooterColSpan} className={`${textAlign} px-4 py-4 text-base`}>
                        {t.total}
                      </td>
                      {visibleColumns.currentStock && (
                        <td className="text-right px-4 py-4 tabular-nums whitespace-nowrap">{fmtQty(totalBalance)}</td>
                      )}
                      {visibleColumns.costPrice && <td className="text-right px-4 py-4 tabular-nums text-slate-400">—</td>}
                      {visibleColumns.averageCost && <td className="text-right px-4 py-4 tabular-nums text-slate-400">—</td>}
                      {visibleColumns.stockValue && (
                        <td className="text-right px-4 py-4 tabular-nums">{fmt(totalStockValueFooter)}</td>
                      )}
                    </tr>
                  </tfoot>
                )
              })()}
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
            recordLabel={lang === 'ar' ? 'صنف' : 'item'}
            dense
          />
        )}
      </div>

      {/* منطقة الطباعة فقط (نفس تنسيق فواتير المشتريات): ترويسة + جدول + تذييل */}
      <div id="inventory-report-print" className="report-print-only" dir={isRtl ? 'rtl' : 'ltr'}>
        <div className="report-print-header">
          {companyLogo && (
            <div className="mb-3">
              <img src={companyLogo} alt="" className="h-14 object-contain" />
            </div>
          )}
          <h2 className="text-xl font-bold text-slate-900 mb-1">{companyName ?? currentTenant?.name ?? '—'}</h2>
          <h3 className="text-lg font-semibold text-slate-800 mt-4 mb-1">{t.inventory.inventoryReport}</h3>
          <p className="text-sm text-slate-600">
            {lang === 'ar' ? 'الفترة' : 'Period'}: {dateFrom} — {dateTo}
          </p>
        </div>
        <div className="report-print-table-wrap">
          {visibleColumnKeys.length === 0 ? (
            <p className="text-sm text-slate-500">{lang === 'ar' ? 'لا أعمدة معروضة' : 'No columns visible'}</p>
          ) : (
          <table className="report-print-table w-full text-sm table-auto border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-medium">
                {visibleColumnKeys.map((key) => (
                  <th key={key} className="px-3 py-2 border-b border-slate-200">{columnLabels[key]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={noDataColSpan} className="text-center py-6 text-slate-500">{t.items.noItems}</td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100">
                    {visibleColumnKeys.map((k) => (
                      <td key={k} className="px-3 py-2 tabular-nums">
                        {k === 'code' && item.code}
                        {k === 'name' && item.name}
                        {k === 'unit' && item.unit}
                        {k === 'openingBalance' && (item.opening_balance != null ? fmtQty(item.opening_balance) : '—')}
                        {k === 'incoming' && (item.incoming != null ? fmtQty(item.incoming) : '—')}
                        {k === 'outgoing' && (item.outgoing != null ? fmtQty(item.outgoing) : '—')}
                        {k === 'currentStock' && fmtQty(item.current_stock)}
                        {k === 'costPrice' && fmt(Number(item.cost_price))}
                        {k === 'averageCost' && fmt(Number(item.average_cost))}
                        {k === 'stockValue' && fmt(Number(item.stock_value))}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
            {filteredItems.length > 0 && (() => {
              const totalBalance = filteredItems.reduce((s, i) => s + Number(i.current_stock), 0)
              const totalStockValueFromRows = filteredItems.reduce((s, i) => s + Number(i.stock_value), 0)
              const totalStockValueFooter =
                reportSummary != null && typeof reportSummary.total_stock_value === 'number'
                  ? Number(reportSummary.total_stock_value)
                  : totalStockValueFromRows
              const labelSpan = Math.max(1, labelFooterKeys.filter((k) => visibleColumns[k]).length)
              const restKeys = visibleColumnKeys.slice(labelSpan)
              const cn = 'px-3 py-2 tabular-nums text-right'
              const footerValue = (key: InventoryReportColumnKey) => {
                if (key === 'currentStock') return fmtQty(totalBalance)
                if (key === 'stockValue') return fmt(totalStockValueFooter)
                if (key === 'incoming') return fmtQty(filteredItems.reduce((s, i) => s + (i.incoming ?? 0), 0))
                if (key === 'outgoing') return fmtQty(filteredItems.reduce((s, i) => s + (i.outgoing ?? 0), 0))
                return '—'
              }
              return (
                <tfoot>
                  <tr className="bg-slate-100 font-bold border-t-2 border-slate-400">
                    <td colSpan={labelSpan} className="px-3 py-2">{t.total}</td>
                    {restKeys.map((key) => (
                      <td key={key} className={cn}>{footerValue(key)}</td>
                    ))}
                  </tr>
                </tfoot>
              )
            })()}
          </table>
          )}
        </div>
        <div className="report-print-footer">
          <span>{lang === 'ar' ? 'تاريخ الطباعة' : 'Print Date'}: {new Date().toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' })}</span>
          <span>{lang === 'ar' ? 'صفحة' : 'Page'} <span className="report-page-num" /></span>
        </div>
      </div>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #inventory-report-print, #inventory-report-print * { visibility: visible; }
        }
        @media screen {
          #inventory-report-print { display: none !important; }
        }
      `}</style>
    </div>
  )
}
