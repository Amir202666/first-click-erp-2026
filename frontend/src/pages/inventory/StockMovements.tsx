import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchInventoryMovements,
  fetchItems,
  fetchItem,
  adjustStock,
  fetchSettings,
  fetchWarehouses,
  cleanOrphanedProductionOrderMovements,
} from '../../api/tenant'
import { coerceDecimalPlaces, formatAmount } from '../../utils/currency'
import { getDefaultJournalDateRange, formatDisplayDate } from '../../utils/date'
import type { Item, PaginatedResponse, Warehouse } from '../../types'
import { ArrowDownCircle, ArrowUpCircle, RefreshCw, X, Trash2, Search, Printer, FileSpreadsheet, FileText, Columns3 } from 'lucide-react'
import Toast, { type ToastType } from '../../components/ui/Toast'
import { useClientSort } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'
import PageSizeSelect from '../../components/ui/PageSizeSelect'
import ReportFooter from '../../components/ui/ReportFooter'
import { asArray } from '../../utils/asArray'
import { usePersistedColumnVisibility } from '../../hooks/usePersistedColumnVisibility'
import { escHtml } from '../items/itemLedgerHelpers'
import {
  filterBarOverflowClass,
  filterSearchInputNineClass,
  filterSelectCompactClass,
  filterSelectNineLightClass,
} from '../../utils/filterControlStyles'

const typeStyles: Record<string, string> = {
  in: 'bg-emerald-100 text-emerald-700',
  out: 'bg-red-100 text-red-700',
  adjustment: 'bg-amber-100 text-amber-700',
  transfer: 'bg-blue-100 text-blue-700',
  opening_balance: 'bg-slate-100 text-slate-700',
}

interface MovementRecord {
  id: number
  date: string
  type: string
  quantity: number
  unit_cost: number
  total_cost: number
  notes: string | null
  item: Item | null
  warehouse_id: number | null
  warehouse?: { id: number; name: string; code?: string } | null
  created_by: { name: string } | null
}

type StockMvColKey =
  | 'date'
  | 'item'
  | 'warehouse'
  | 'type'
  | 'quantity'
  | 'unit_cost'
  | 'total_cost'
  | 'notes'
  | 'created_by'

const STOCK_MV_COLUMNS: StockMvColKey[] = [
  'date',
  'item',
  'warehouse',
  'type',
  'quantity',
  'unit_cost',
  'total_cost',
  'notes',
  'created_by',
]

const STOCK_MV_COL_STORAGE = 'stockMovementsPageVisibleColumns'

function formatItemPickLabel(it: Item): string {
  return `${it.code ? `${it.code} — ` : ''}${it.name}`
}

export default function StockMovements() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()

  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const { data: settings } = useQuery({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const fmt = (n: number) => formatAmount(n, { decimal_places: coerceDecimalPlaces(settings?.doc_amount_decimals, 2) }, locale)
  const qtyDecimals = coerceDecimalPlaces(settings?.doc_quantity_decimals, 2)
  const fmtQty = (n: number) => Number(n).toLocaleString(locale, { minimumFractionDigits: qtyDecimals, maximumFractionDigits: qtyDecimals })

  const typeLabels: Record<string, string> = {
    in: t.inventory.in,
    out: t.inventory.out,
    adjustment: t.inventory.adjustment,
    transfer: t.inventory.transfer,
    opening_balance: t.inventory.openingBalance ?? 'رصيد افتتاحي',
  }

  const defaultRange = getDefaultJournalDateRange()
  const [itemFilter, setItemFilter] = useState('')
  const [itemInputQuery, setItemInputQuery] = useState('')
  const [itemListOpen, setItemListOpen] = useState(false)
  const [debouncedItemSearch, setDebouncedItemSearch] = useState('')
  const itemComboRef = useRef<HTMLDivElement>(null)

  const [typeFilter, setTypeFilter] = useState('')
  const [warehouseIdFilter, setWarehouseIdFilter] = useState('')
  const [dateFrom, setDateFrom] = useState(defaultRange.dateFrom)
  const [dateTo, setDateTo] = useState(defaultRange.dateTo)
  const [showAdjustModal, setShowAdjustModal] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)

  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)

  const [adjustForm, setAdjustForm] = useState({ item_id: '', new_quantity: '', notes: '' })

  const [showColumnsMenu, setShowColumnsMenu] = useState(false)
  const columnsMenuRef = useRef<HTMLDivElement>(null)
  const [visibleColumns, setVisibleColumns] = usePersistedColumnVisibility<StockMvColKey>(STOCK_MV_COL_STORAGE, STOCK_MV_COLUMNS)

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedItemSearch(itemInputQuery.trim()), 260)
    return () => window.clearTimeout(id)
  }, [itemInputQuery])

  useEffect(() => {
    if (!itemListOpen) return
    function onDocDown(e: MouseEvent) {
      const node = itemComboRef.current
      if (node && !node.contains(e.target as Node)) setItemListOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [itemListOpen])

  useEffect(() => {
    if (!showColumnsMenu) return
    function handleClickOutside(e: MouseEvent) {
      if (columnsMenuRef.current && !columnsMenuRef.current.contains(e.target as Node)) setShowColumnsMenu(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showColumnsMenu])

  const params: Record<string, string> = {}
  if (itemFilter) params.item_id = itemFilter
  if (typeFilter) params.type = typeFilter
  if (warehouseIdFilter) params.warehouse_id = warehouseIdFilter
  if (dateFrom?.trim()) params.from_date = dateFrom.trim()
  if (dateTo?.trim()) params.to_date = dateTo.trim()

  const { data: warehousesResp } = useQuery<{ data: Warehouse[] }>({
    queryKey: ['warehouses', tenantId],
    queryFn: () => fetchWarehouses(tenantId),
    enabled: !!tenantId,
  })
  const warehouses = warehousesResp?.data ?? []

  const { data: movementsData, isLoading } = useQuery({
    queryKey: ['inventory-movements', tenantId, itemFilter, typeFilter, warehouseIdFilter, dateFrom, dateTo],
    queryFn: () => fetchInventoryMovements(tenantId, Object.keys(params).length ? params : undefined),
    enabled: !!tenantId,
  })

  const { data: itemsModalData } = useQuery<PaginatedResponse<Item>>({
    queryKey: ['items', tenantId, 'adjust-stock-modal'],
    queryFn: () => fetchItems(tenantId, { per_page: '500' }),
    enabled: !!tenantId && showAdjustModal,
  })
  const items = itemsModalData?.data ?? []

  const { data: itemSearchData, isFetching: itemSearchLoading } = useQuery({
    queryKey: ['stock-mv-item-search', tenantId, debouncedItemSearch, itemListOpen],
    queryFn: () =>
      fetchItems(tenantId, {
        per_page: '50',
        for_filter: '1',
        ...(debouncedItemSearch ? { search: debouncedItemSearch } : {}),
      }),
    enabled: tenantId > 0 && itemListOpen,
  })
  const searchItems: Item[] = asArray<Item>(itemSearchData?.data)

  const { data: selectedFilterItem } = useQuery({
    queryKey: ['stock-mv-filter-item', tenantId, itemFilter],
    queryFn: () => fetchItem(tenantId, Number(itemFilter)),
    enabled: tenantId > 0 && itemFilter !== '' && !itemListOpen,
  })

  useEffect(() => {
    if (!itemFilter || itemListOpen || !selectedFilterItem) return
    const label = formatItemPickLabel(selectedFilterItem)
    setItemInputQuery((prev) => (prev === label ? prev : label))
  }, [itemFilter, itemListOpen, selectedFilterItem])

  const movements: MovementRecord[] = movementsData?.data ?? []

  const { sort, toggleSort, sortedRows } = useClientSort(
    movements,
    [
      { key: 'date', type: 'date', getValue: (m: MovementRecord) => m.date },
      { key: 'item', type: 'string', getValue: (m: MovementRecord) => m.item?.name ?? '' },
      { key: 'warehouse', type: 'string', getValue: (m: MovementRecord) => m.warehouse?.name ?? '' },
      { key: 'type', type: 'string', getValue: (m: MovementRecord) => typeLabels[m.type] ?? m.type },
      { key: 'quantity', type: 'number', getValue: (m: MovementRecord) => Number(m.quantity) },
      { key: 'unit_cost', type: 'number', getValue: (m: MovementRecord) => Number(m.unit_cost) },
      { key: 'total_cost', type: 'number', getValue: (m: MovementRecord) => Number(m.total_cost) },
      { key: 'notes', type: 'string', getValue: (m: MovementRecord) => m.notes ?? '' },
      { key: 'created_by', type: 'string', getValue: (m: MovementRecord) => m.created_by?.name ?? '' },
    ],
    { locale },
  )

  const totalCount = sortedRows.length
  const lastPage = Math.max(1, Math.ceil(totalCount / perPage) || 1)

  const pagedRows = useMemo(() => {
    const start = (page - 1) * perPage
    return sortedRows.slice(start, start + perPage)
  }, [sortedRows, page, perPage])

  const from = totalCount === 0 ? 0 : (page - 1) * perPage + 1
  const to = Math.min(page * perPage, totalCount)

  const visibleColCount = useMemo(
    () => STOCK_MV_COLUMNS.reduce((n, k) => n + (visibleColumns[k] ? 1 : 0), 0),
    [visibleColumns],
  )

  const columnLabels = useMemo(
    (): Record<StockMvColKey, string> => ({
      date: t.date,
      item: t.items.item,
      warehouse: t.nav?.warehouses ?? (lang === 'ar' ? 'المخزن' : 'Warehouse'),
      type: t.inventory.movementType,
      quantity: t.invoices.quantity,
      unit_cost: t.inventory.unitCost,
      total_cost: t.inventory.totalCost,
      notes: t.notes,
      created_by: t.inventory.createdBy,
    }),
    [t, lang],
  )

  const toggleColumn = useCallback((key: StockMvColKey, checked: boolean) => {
    setVisibleColumns((prev) => {
      if (!checked) {
        const next = { ...prev, [key]: false }
        if (!STOCK_MV_COLUMNS.some((k) => next[k])) return prev
        return next
      }
      return { ...prev, [key]: true }
    })
  }, [setVisibleColumns])

  useEffect(() => {
    setPage(1)
  }, [itemFilter, typeFilter, warehouseIdFilter, dateFrom, dateTo])

  useEffect(() => {
    if (page > lastPage) setPage(lastPage)
  }, [page, lastPage])

  const selectItemFilter = useCallback((it: Item | null) => {
    if (!it) {
      setItemFilter('')
      setItemInputQuery('')
      setItemListOpen(false)
      setPage(1)
      return
    }
    setItemFilter(String(it.id))
    setItemInputQuery(formatItemPickLabel(it))
    setItemListOpen(false)
    setPage(1)
  }, [])

  const handleExportExcel = useCallback(() => {
    if (sortedRows.length === 0) return
    const headers: string[] = []
    if (visibleColumns.date) headers.push(columnLabels.date)
    if (visibleColumns.item) headers.push(columnLabels.item)
    if (visibleColumns.warehouse) headers.push(columnLabels.warehouse)
    if (visibleColumns.type) headers.push(columnLabels.type)
    if (visibleColumns.quantity) headers.push(columnLabels.quantity)
    if (visibleColumns.unit_cost) headers.push(columnLabels.unit_cost)
    if (visibleColumns.total_cost) headers.push(columnLabels.total_cost)
    if (visibleColumns.notes) headers.push(columnLabels.notes)
    if (visibleColumns.created_by) headers.push(columnLabels.created_by)
    const lines = [headers.join(',')]
    for (const m of sortedRows) {
      const cells: string[] = []
      if (visibleColumns.date) cells.push(formatDisplayDate(m.date))
      if (visibleColumns.item) cells.push(m.item?.name ?? '')
      if (visibleColumns.warehouse) cells.push(m.warehouse?.name ?? '')
      if (visibleColumns.type) cells.push(typeLabels[m.type] ?? m.type)
      if (visibleColumns.quantity) cells.push(String(m.quantity))
      if (visibleColumns.unit_cost) cells.push(String(m.unit_cost))
      if (visibleColumns.total_cost) cells.push(String(m.total_cost))
      if (visibleColumns.notes) cells.push(m.notes ?? '')
      if (visibleColumns.created_by) cells.push(m.created_by?.name ?? '')
      lines.push(cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    }
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `stock-movements-${dateFrom}-${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [sortedRows, visibleColumns, columnLabels, typeLabels, dateFrom, dateTo])

  const handlePrint = useCallback(() => {
    if (sortedRows.length === 0) return
    const ths: string[] = []
    if (visibleColumns.date) ths.push(`<th>${escHtml(columnLabels.date)}</th>`)
    if (visibleColumns.item) ths.push(`<th>${escHtml(columnLabels.item)}</th>`)
    if (visibleColumns.warehouse) ths.push(`<th>${escHtml(columnLabels.warehouse)}</th>`)
    if (visibleColumns.type) ths.push(`<th>${escHtml(columnLabels.type)}</th>`)
    if (visibleColumns.quantity) ths.push(`<th>${escHtml(columnLabels.quantity)}</th>`)
    if (visibleColumns.unit_cost) ths.push(`<th>${escHtml(columnLabels.unit_cost)}</th>`)
    if (visibleColumns.total_cost) ths.push(`<th>${escHtml(columnLabels.total_cost)}</th>`)
    if (visibleColumns.notes) ths.push(`<th>${escHtml(columnLabels.notes)}</th>`)
    if (visibleColumns.created_by) ths.push(`<th>${escHtml(columnLabels.created_by)}</th>`)
    const rows = sortedRows
      .map((m) => {
        const tds: string[] = []
        if (visibleColumns.date) tds.push(`<td>${escHtml(formatDisplayDate(m.date))}</td>`)
        if (visibleColumns.item) tds.push(`<td>${escHtml(m.item?.name ?? '—')}</td>`)
        if (visibleColumns.warehouse) tds.push(`<td>${escHtml(m.warehouse?.name ?? '—')}</td>`)
        if (visibleColumns.type) tds.push(`<td>${escHtml(typeLabels[m.type] ?? m.type)}</td>`)
        if (visibleColumns.quantity) tds.push(`<td class="num">${escHtml(fmtQty(m.quantity))}</td>`)
        if (visibleColumns.unit_cost) tds.push(`<td class="num">${escHtml(fmt(m.unit_cost))}</td>`)
        if (visibleColumns.total_cost) tds.push(`<td class="num">${escHtml(fmt(m.total_cost))}</td>`)
        if (visibleColumns.notes) tds.push(`<td>${escHtml(m.notes ?? '')}</td>`)
        if (visibleColumns.created_by) tds.push(`<td>${escHtml(m.created_by?.name ?? '')}</td>`)
        return `<tr>${tds.join('')}</tr>`
      })
      .join('')
    const title = escHtml(t.inventory.stockMovements)
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html dir="${isRtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:Arial,sans-serif;padding:16px;} table{border-collapse:collapse;width:100%;font-size:11pt;} th,td{border:1px solid #ccc;padding:6px 8px;} th{background:#f5f5f5;} .num{text-align:left;direction:ltr;}</style></head><body>
<h2>${title}</h2><p>${escHtml(`${dateFrom} — ${dateTo}`)}</p>
<table><thead><tr>${ths.join('')}</tr></thead><tbody>${rows}</tbody></table>
</body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => {
      win.print()
      win.close()
    }, 250)
  }, [sortedRows, visibleColumns, columnLabels, typeLabels, dateFrom, dateTo, isRtl, t.inventory.stockMovements, fmt, fmtQty])

  const adjustMut = useMutation({
    mutationFn: (data: Record<string, unknown>) => adjustStock(tenantId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
      setShowAdjustModal(false)
      setAdjustForm({ item_id: '', new_quantity: '', notes: '' })
    },
  })

  const cleanOrphanMut = useMutation({
    mutationFn: () => cleanOrphanedProductionOrderMovements(tenantId),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
      setToast({ message: res.message, type: res.deleted_count > 0 ? 'success' : 'info' })
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      setToast({ message: e?.response?.data?.message ?? (lang === 'ar' ? 'فشل التنظيف' : 'Cleanup failed'), type: 'error' })
    },
  })

  function handleAdjust(e: React.FormEvent) {
    e.preventDefault()
    adjustMut.mutate({
      item_id: +adjustForm.item_id,
      new_quantity: +adjustForm.new_quantity,
      notes: adjustForm.notes || null,
    })
  }

  const thClass = `${isRtl ? 'text-right' : 'text-left'} px-3 py-2 font-medium`
  const itemSearchPlaceholder =
    lang === 'ar' ? 'ابحث عن صنف أو اختر الكل…' : 'Search item or leave for all…'
  const itemComboAria = lang === 'ar' ? 'تصفية حسب الصنف' : 'Filter by item'
  const titlePrint = lang === 'ar' ? 'طباعة' : 'Print'
  const titlePdf = lang === 'ar' ? 'PDF' : 'PDF'
  const titleExcel = lang === 'ar' ? 'تصدير Excel' : 'Export Excel'
  const titleColumns = lang === 'ar' ? 'تخصيص الأعمدة' : 'Columns'
  const labelShowColumns = lang === 'ar' ? 'إظهار/إخفاء الأعمدة' : 'Show / hide columns'
  const exportDisabled = isLoading || tenantId <= 0 || sortedRows.length === 0

  return (
    <div className="px-4 py-3 space-y-3 max-w-full min-w-0">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <div className="flex flex-wrap items-center justify-between gap-2 gap-y-1.5 border-b border-slate-200 pb-2">
        <h1 className="text-base font-semibold text-slate-900 truncate leading-tight">{t.inventory.stockMovements}</h1>
        <div className="flex items-center gap-1.5 flex-wrap">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className={filterSelectCompactClass}
            title={lang === 'ar' ? 'من' : 'From'}
          />
          <span className="text-slate-400 text-xs">—</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className={filterSelectCompactClass}
            title={lang === 'ar' ? 'إلى' : 'To'}
          />
        </div>
        <div className="relative flex flex-wrap items-center gap-1.5 shrink-0" ref={columnsMenuRef}>
          <button
            type="button"
            onClick={() => cleanOrphanMut.mutate()}
            disabled={cleanOrphanMut.isPending}
            className="inline-flex items-center gap-1.5 border border-slate-400 text-slate-600 hover:bg-slate-50 rounded-md px-2.5 h-8 text-xs transition-colors disabled:opacity-50"
            title={lang === 'ar' ? 'حذف حركات المخزون المرتبطة بأوامر إنتاج محذوفة' : 'Delete movements linked to deleted production orders'}
          >
            <Trash2 size={14} />
            {lang === 'ar' ? 'حذف الحركات اليتيمة' : 'Clean orphan movements'}
          </button>
          <button
            type="button"
            onClick={() => setShowAdjustModal(true)}
            className="inline-flex items-center gap-1.5 border border-amber-600 text-amber-600 hover:bg-amber-50 rounded-md px-2.5 h-8 text-xs transition-colors"
          >
            <RefreshCw size={14} /> {t.inventory.adjustStock}
          </button>
          <button
            type="button"
            onClick={() => setShowColumnsMenu((v) => !v)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 border border-slate-300 text-slate-600 hover:bg-slate-50"
            title={titleColumns}
          >
            <Columns3 size={15} />
          </button>
          {showColumnsMenu && (
            <div
              className={`absolute top-full z-50 mt-2 w-56 rounded-lg border border-slate-200 bg-white py-2 shadow-lg text-sm ${isRtl ? 'left-0' : 'right-0'}`}
            >
              <div className="px-3 pb-2 text-xs font-semibold text-slate-500">{labelShowColumns}</div>
              {STOCK_MV_COLUMNS.map((key) => (
                <label key={key} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={visibleColumns[key]}
                    onChange={(e) => toggleColumn(key, e.target.checked)}
                    className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-slate-700">{columnLabels[key]}</span>
                </label>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => void handlePrint()}
            disabled={exportDisabled}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            title={titlePrint}
          >
            <Printer size={15} />
          </button>
          <button
            type="button"
            onClick={() => void handlePrint()}
            disabled={exportDisabled}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-50"
            title={titlePdf}
          >
            <FileText size={15} />
          </button>
          <button
            type="button"
            onClick={() => handleExportExcel()}
            disabled={exportDisabled}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
            title={titleExcel}
          >
            <FileSpreadsheet size={15} />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3">
        <div className={`${filterBarOverflowClass} flex flex-wrap gap-2 items-center`}>
          <div ref={itemComboRef} className="relative w-full min-w-[260px] max-w-[22rem] shrink-0">
            <div className="relative">
              <Search
                size={15}
                className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-400 ${isRtl ? 'right-2' : 'left-2'}`}
              />
              <input
                type="text"
                value={itemInputQuery}
                onChange={(e) => {
                  const v = e.target.value
                  setItemInputQuery(v)
                  setItemListOpen(true)
                  if (itemFilter) {
                    setItemFilter('')
                    setPage(1)
                  }
                }}
                onFocus={() => setItemListOpen(true)}
                onBlur={() => {
                  window.setTimeout(() => {
                    if (!itemInputQuery.trim()) selectItemFilter(null)
                  }, 120)
                }}
                placeholder={itemSearchPlaceholder}
                aria-label={itemComboAria}
                autoComplete="off"
                className={`${filterSearchInputNineClass} ${isRtl ? 'pr-8 pl-2' : 'pl-8 pr-2'}`}
              />
            </div>
            {itemListOpen && (
              <ul
                className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg"
                dir={isRtl ? 'rtl' : 'ltr'}
              >
                <li>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-start hover:bg-slate-50 text-slate-700"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectItemFilter(null)}
                  >
                    {t.inventory.allItems}
                  </button>
                </li>
                {itemSearchLoading && (
                  <li className="px-3 py-2 text-xs text-slate-500">{lang === 'ar' ? 'جاري البحث…' : 'Searching…'}</li>
                )}
                {!itemSearchLoading &&
                  searchItems.map((it) => (
                    <li key={it.id}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-start hover:bg-slate-50 text-slate-800"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectItemFilter(it)}
                      >
                        {formatItemPickLabel(it)}
                      </button>
                    </li>
                  ))}
                {!itemSearchLoading && debouncedItemSearch && searchItems.length === 0 && (
                  <li className="px-3 py-2 text-xs text-slate-500">{lang === 'ar' ? 'لا نتائج' : 'No results'}</li>
                )}
              </ul>
            )}
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className={`${filterSelectNineLightClass} min-w-[140px]`}
          >
            <option value="">{t.inventory.allTypes}</option>
            <option value="in">{t.inventory.in}</option>
            <option value="out">{t.inventory.out}</option>
            <option value="adjustment">{t.inventory.adjustment}</option>
            <option value="transfer">{t.inventory.transfer}</option>
            <option value="opening_balance">{t.inventory.openingBalance ?? 'رصيد افتتاحي'}</option>
          </select>
          <select
            value={warehouseIdFilter}
            onChange={(e) => setWarehouseIdFilter(e.target.value)}
            className={`${filterSelectNineLightClass} min-w-[180px]`}
          >
            <option value="">{t.nav?.warehouses ?? (lang === 'ar' ? 'المخازن' : 'Warehouses')}</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code ? `${w.code} - ` : ''}
                {w.name}
              </option>
            ))}
          </select>
          <PageSizeSelect
            value={perPage}
            onChange={(n) => {
              setPerPage(n)
              setPage(1)
            }}
            showLabel={false}
            ariaLabel={lang === 'ar' ? 'عدد السجلات في الصفحة' : 'Rows per page'}
            className="!text-sm shrink-0"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1080px]">
              <thead>
                <tr className="bg-slate-50 text-slate-600">
                  {visibleColumns.date && (
                    <SortableTh
                      label={t.date}
                      sortKey="date"
                      sortState={sort}
                      onToggle={toggleSort}
                      truncateLabel={false}
                      widthClassName="min-w-[7.5rem]"
                      className={`${thClass} text-slate-700 dark:text-slate-200`}
                    />
                  )}
                  {visibleColumns.item && (
                    <SortableTh
                      label={t.items.item}
                      sortKey="item"
                      sortState={sort}
                      onToggle={toggleSort}
                      truncateLabel={false}
                      widthClassName="min-w-[10rem]"
                      className={`${thClass} text-slate-700 dark:text-slate-200`}
                    />
                  )}
                  {visibleColumns.warehouse && (
                    <SortableTh
                      label={t.nav?.warehouses ?? 'المخزن'}
                      sortKey="warehouse"
                      sortState={sort}
                      onToggle={toggleSort}
                      truncateLabel={false}
                      widthClassName="min-w-[9rem]"
                      className={`${thClass} text-slate-700 dark:text-slate-200`}
                    />
                  )}
                  {visibleColumns.type && (
                    <SortableTh
                      label={t.inventory.movementType}
                      sortKey="type"
                      sortState={sort}
                      onToggle={toggleSort}
                      truncateLabel={false}
                      widthClassName="min-w-[9rem]"
                      className={`${thClass} text-slate-700 dark:text-slate-200`}
                    />
                  )}
                  {visibleColumns.quantity && (
                    <SortableTh
                      label={t.invoices.quantity}
                      sortKey="quantity"
                      sortState={sort}
                      onToggle={toggleSort}
                      truncateLabel={false}
                      widthClassName="min-w-[6.5rem]"
                      className={`${thClass} text-slate-700 dark:text-slate-200`}
                    />
                  )}
                  {visibleColumns.unit_cost && (
                    <SortableTh
                      label={t.inventory.unitCost}
                      sortKey="unit_cost"
                      sortState={sort}
                      onToggle={toggleSort}
                      truncateLabel={false}
                      widthClassName="min-w-[10rem]"
                      className={`${thClass} text-slate-700 dark:text-slate-200`}
                    />
                  )}
                  {visibleColumns.total_cost && (
                    <SortableTh
                      label={t.inventory.totalCost}
                      sortKey="total_cost"
                      sortState={sort}
                      onToggle={toggleSort}
                      truncateLabel={false}
                      widthClassName="min-w-[10rem]"
                      className={`${thClass} text-slate-700 dark:text-slate-200`}
                    />
                  )}
                  {visibleColumns.notes && (
                    <SortableTh
                      label={t.notes}
                      sortKey="notes"
                      sortState={sort}
                      onToggle={toggleSort}
                      truncateLabel={false}
                      widthClassName="min-w-[8rem]"
                      className={`${thClass} text-slate-700 dark:text-slate-200`}
                    />
                  )}
                  {visibleColumns.created_by && (
                    <SortableTh
                      label={t.inventory.createdBy}
                      sortKey="created_by"
                      sortState={sort}
                      onToggle={toggleSort}
                      truncateLabel={false}
                      widthClassName="min-w-[8rem]"
                      className={`${thClass} text-slate-700 dark:text-slate-200`}
                    />
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {totalCount === 0 ? (
                  <tr>
                    <td colSpan={Math.max(1, visibleColCount)} className="text-center py-8 text-slate-400">
                      {t.inventory.noMovements}
                    </td>
                  </tr>
                ) : (
                  pagedRows.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50">
                      {visibleColumns.date && <td className="px-3 py-2 text-slate-600">{formatDisplayDate(m.date)}</td>}
                      {visibleColumns.item && <td className="px-3 py-2 font-medium text-slate-900">{m.item?.name ?? '—'}</td>}
                      {visibleColumns.warehouse && <td className="px-3 py-2 text-slate-700">{m.warehouse?.name ?? '—'}</td>}
                      {visibleColumns.type && (
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${typeStyles[m.type] ?? 'bg-slate-100 text-slate-600'}`}
                          >
                            {m.type === 'in' && <ArrowDownCircle size={12} />}
                            {m.type === 'out' && <ArrowUpCircle size={12} />}
                            {typeLabels[m.type] ?? m.type}
                          </span>
                        </td>
                      )}
                      {visibleColumns.quantity && (
                        <td className={`px-3 py-2 font-medium ${m.quantity > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {m.quantity > 0 ? '+' : ''}
                          {fmtQty(m.quantity)}
                        </td>
                      )}
                      {visibleColumns.unit_cost && <td className="px-3 py-2">{fmt(m.unit_cost)}</td>}
                      {visibleColumns.total_cost && <td className="px-3 py-2">{fmt(m.total_cost)}</td>}
                      {visibleColumns.notes && (
                        <td className="px-3 py-2 text-slate-500 text-xs max-w-[240px] whitespace-normal break-words">{m.notes ?? '—'}</td>
                      )}
                      {visibleColumns.created_by && <td className="px-3 py-2 text-slate-500 text-xs">{m.created_by?.name ?? '—'}</td>}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {!isLoading && totalCount > 0 && (
          <ReportFooter
            totals={[]}
            totalCount={totalCount}
            currentPage={page}
            lastPage={lastPage}
            from={from}
            to={to}
            onPageChange={(p) => setPage(p)}
            lang={lang}
            isRtl={isRtl}
            alwaysShowPaginationBar
            dense
          />
        )}
      </div>

      {showAdjustModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAdjustModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">{t.inventory.adjustStock}</h3>
              <button type="button" onClick={() => setShowAdjustModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAdjust} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.items.item} *</label>
                <select
                  value={adjustForm.item_id}
                  onChange={(e) => setAdjustForm({ ...adjustForm, item_id: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                  required
                >
                  <option value="">{t.items.selectItem}</option>
                  {items
                    .filter((i) => i.type === 'inventory')
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.code}) — {t.items.currentStock}: {item.current_stock != null ? fmtQty(item.current_stock) : 0}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.inventory.newQuantity} *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={adjustForm.new_quantity}
                  onChange={(e) => setAdjustForm({ ...adjustForm, new_quantity: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.notes}</label>
                <input
                  type="text"
                  value={adjustForm.notes}
                  onChange={(e) => setAdjustForm({ ...adjustForm, notes: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                />
              </div>
              {adjustMut.isError && <div className="text-sm text-red-600">{t.msg.adjustError}</div>}
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowAdjustModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={adjustMut.isPending}
                  className="bg-amber-600 hover:bg-amber-500 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50 transition-colors"
                >
                  {adjustMut.isPending ? t.inventory.adjusting : t.inventory.adjustStock}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
