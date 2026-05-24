import { useState, useMemo, useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchSerialNumbersInventory,
  fetchSerialNumberHistory,
  fetchWarehouses,
  fetchItemsForFilter,
  fetchItem,
} from '../../api/tenant'
import type { SerialNumbersInventoryRow } from '../../api/tenant'
import type { Item } from '../../types'
import SortableTh from '../../components/ui/SortableTh'
import SearchableSelect, { type SearchableSelectOption } from '../../components/ui/SearchableSelect'
import { FileSpreadsheet, FileText, Printer, X } from 'lucide-react'
import type { SortState } from '../../hooks/useClientSort'
import { formatDisplayDate } from '../../utils/date'
import {
  filterBarOverflowClass,
  filterCellBasisClass,
  filterPageSizeSelectClass,
  filterRowInnerClass,
  filterSearchableInputTallClass,
  filterSelectClass,
} from '../../utils/filterControlStyles'
import { escHtml } from '../items/itemLedgerHelpers'

type SortColKey = 'serial_number' | 'item_code' | 'item_name' | 'warehouse_name' | 'status' | 'created_at' | 'updated_at'

const ITEM_FILTER_PAGE_SIZE = 2000

/** نفس أحجام الصفحة في قائمة قيود اليومية */
const PAGE_SIZES = [10, 25, 50, 100] as const

function formatItemPickLabel(it: Pick<Item, 'name'> & { code?: string | null }): string {
  return it.code ? `${it.code} — ${it.name}` : it.name
}

export default function SerialNumbersInventoryReport() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'

  const title = lang === 'ar' ? 'جرد الأرقام التسلسلية' : 'Serial numbers inventory'

  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(50)
  const [sort, setSort] = useState<SortState<SortColKey>>({ key: 'item_code', direction: 'asc' })
  const [warehouseId, setWarehouseId] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [itemId, setItemId] = useState('')
  const [search, setSearch] = useState('')
  const [historySerialId, setHistorySerialId] = useState<number | null>(null)

  useEffect(() => {
    setPerPage((p) => ((PAGE_SIZES as readonly number[]).includes(p) ? p : 50))
  }, [])

  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses', tenantId],
    queryFn: () => fetchWarehouses(tenantId),
    enabled: !!tenantId,
    staleTime: 60_000,
  })
  const warehouses =
    (warehousesData as { data?: { id: number; name: string; code?: string }[] } | undefined)?.data ?? []

  const { data: itemsFilterResp } = useQuery({
    queryKey: ['items', tenantId, 'serial-numbers-inv-filter', ITEM_FILTER_PAGE_SIZE],
    queryFn: () => fetchItemsForFilter(tenantId, { per_page: String(ITEM_FILTER_PAGE_SIZE) }),
    enabled: !!tenantId,
    staleTime: 60_000,
  })
  const itemsForFilterList: Item[] = itemsFilterResp?.data ?? []

  const { data: selectedFilterItem } = useQuery({
    queryKey: ['item', tenantId, itemId],
    queryFn: () => fetchItem(tenantId, Number(itemId)),
    enabled: tenantId > 0 && itemId !== '',
  })

  const params = useMemo(() => {
    const p: Record<string, string> = {
      page: String(page),
      per_page: String(perPage),
      sort_by: sort?.key ?? 'item_code',
      sort_dir: sort?.direction ?? 'asc',
    }
    if (warehouseId) p.warehouse_id = warehouseId
    if (statusFilter) p.status = statusFilter
    if (itemId) p.item_id = itemId
    const q = search.trim()
    if (q) p.search = q
    return p
  }, [page, perPage, sort, warehouseId, statusFilter, itemId, search])

  const { data, isLoading } = useQuery({
    queryKey: ['serial-numbers-inventory', tenantId, params],
    queryFn: () => fetchSerialNumbersInventory(tenantId, params),
    enabled: !!tenantId,
  })

  const rows = data?.data ?? []
  const total = data?.total ?? 0
  const lastPage = data?.last_page ?? 1

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['serial-number-history', tenantId, historySerialId],
    queryFn: () => fetchSerialNumberHistory(tenantId, historySerialId!),
    enabled: !!tenantId && historySerialId != null,
  })

  const labels = useMemo(
    () => ({
      serial: lang === 'ar' ? 'الرقم التسلسلي' : 'Serial number',
      itemCode: lang === 'ar' ? 'كود الصنف' : 'Item code',
      itemName: lang === 'ar' ? 'اسم الصنف' : 'Item name',
      warehouse: t.nav?.warehouses ?? (lang === 'ar' ? 'المخزن' : 'Warehouse'),
      status: lang === 'ar' ? 'الحالة' : 'Status',
      createdAt: lang === 'ar' ? 'تاريخ الإنشاء' : 'Created at',
      updatedAt: lang === 'ar' ? 'آخر تحديث' : 'Updated at',
      searchPlaceholder: lang === 'ar' ? 'الرقم التسلسلي — ابحث…' : 'Serial number — search…',
      noData: lang === 'ar' ? 'لا توجد أرقام تسلسلية' : 'No serial numbers',
      prev: lang === 'ar' ? 'السابق' : 'Previous',
      next: lang === 'ar' ? 'التالي' : 'Next',
      pageOf: (a: number, b: number) => (lang === 'ar' ? `صفحة ${a} من ${b}` : `Page ${a} of ${b}`),
      historyTitle: lang === 'ar' ? 'سجل حركة الرقم' : 'Serial movement history',
      eventIn: lang === 'ar' ? 'دخول للمخزون' : 'Stock in',
      eventOut: lang === 'ar' ? 'خروج من المخزون' : 'Stock out',
      vendor: lang === 'ar' ? 'المورد' : 'Vendor',
      customer: lang === 'ar' ? 'العميل' : 'Customer',
      document: lang === 'ar' ? 'المستند' : 'Document',
      close: lang === 'ar' ? 'إغلاق' : 'Close',
      print: lang === 'ar' ? 'طباعة' : 'Print',
      pdf: lang === 'ar' ? 'PDF' : 'PDF',
      excel: lang === 'ar' ? 'تصدير Excel' : 'Export Excel',
      exporting: lang === 'ar' ? 'جاري التصدير…' : 'Exporting…',
    }),
    [t, lang],
  )

  const statusLabel = useCallback(
    (s: string) => {
      const map: Record<string, { ar: string; en: string }> = {
        available: { ar: 'متاح', en: 'Available' },
        sold: { ar: 'مباع', en: 'Sold' },
        reserved: { ar: 'محجوز', en: 'Reserved' },
        returned: { ar: 'مرتجع', en: 'Returned' },
        damaged: { ar: 'تالف', en: 'Damaged' },
      }
      const m = map[s]
      if (!m) return s
      return lang === 'ar' ? m.ar : m.en
    },
    [lang],
  )

  const itemFieldShort = t.items?.item ?? (lang === 'ar' ? 'الصنف' : 'Item')

  const itemFilterOptions = useMemo((): SearchableSelectOption[] => {
    const out: SearchableSelectOption[] = [{ value: 0, label: itemFieldShort }]
    const seen = new Set<number>([0])
    if (selectedFilterItem && !itemsForFilterList.some((i) => i.id === selectedFilterItem.id)) {
      out.push({
        value: selectedFilterItem.id,
        label: formatItemPickLabel(selectedFilterItem),
        searchText: `${selectedFilterItem.code ?? ''} ${selectedFilterItem.barcode ?? ''} ${selectedFilterItem.name}`.trim(),
      })
      seen.add(selectedFilterItem.id)
    }
    for (const i of itemsForFilterList) {
      if (seen.has(i.id)) continue
      seen.add(i.id)
      out.push({
        value: i.id,
        label: formatItemPickLabel(i),
        searchText: `${i.code ?? ''} ${i.barcode ?? ''} ${i.name}`.trim(),
      })
    }
    return out
  }, [itemsForFilterList, selectedFilterItem, itemFieldShort])

  const toggleSort = useCallback((key: SortColKey) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, direction: 'asc' }
      if (prev.direction === 'asc') return { key, direction: 'desc' }
      return { key: 'item_code', direction: 'asc' }
    })
    setPage(1)
  }, [])

  const thClass = `${isRtl ? 'text-right' : 'text-left'} px-3 py-2 font-medium`

  const fetchAllRowsForExport = useCallback(async (): Promise<SerialNumbersInventoryRow[]> => {
    const base: Record<string, string> = {
      per_page: '200',
      sort_by: sort?.key ?? 'item_code',
      sort_dir: sort?.direction ?? 'asc',
    }
    if (warehouseId) base.warehouse_id = warehouseId
    if (statusFilter) base.status = statusFilter
    if (itemId) base.item_id = itemId
    const q = search.trim()
    if (q) base.search = q

    const first = await fetchSerialNumbersInventory(tenantId, { ...base, page: '1' })
    const out = [...first.data]
    let p = 2
    const maxPages = Math.min(first.last_page, 100)
    while (p <= maxPages) {
      const batch = await fetchSerialNumbersInventory(tenantId, { ...base, page: String(p) })
      out.push(...batch.data)
      p++
    }
    return out
  }, [tenantId, sort, warehouseId, statusFilter, itemId, search])

  const handleExportExcel = useCallback(async () => {
    if (tenantId <= 0 || total === 0) return
    const all = await fetchAllRowsForExport()
    const headers = [
      labels.itemCode,
      labels.itemName,
      labels.serial,
      labels.warehouse,
      labels.status,
      labels.createdAt,
      labels.updatedAt,
    ]
    const lines = [headers.join(',')]
    for (const r of all) {
      const cells = [
        r.item_code ?? '',
        r.item_name ?? '',
        r.serial_number,
        r.warehouse_name ?? '',
        statusLabel(r.status),
        r.created_at ? formatDisplayDate(r.created_at.slice(0, 10)) : '',
        r.updated_at ? formatDisplayDate(r.updated_at.slice(0, 10)) : '',
      ]
      lines.push(cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    }
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `serial-numbers-inventory-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [tenantId, total, fetchAllRowsForExport, labels, statusLabel])

  const handlePrint = useCallback(async () => {
    if (tenantId <= 0 || total === 0) return
    const all = await fetchAllRowsForExport()
    const win = window.open('', '_blank')
    if (!win) return
    const head = `<th>${escHtml(labels.itemCode)}</th><th>${escHtml(labels.itemName)}</th><th>${escHtml(labels.serial)}</th><th>${escHtml(labels.warehouse)}</th><th>${escHtml(labels.status)}</th><th>${escHtml(labels.createdAt)}</th><th>${escHtml(labels.updatedAt)}</th>`
    const body = all
      .map(
        (r) =>
          `<tr><td>${escHtml(r.item_code ?? '')}</td><td>${escHtml(r.item_name ?? '')}</td><td>${escHtml(r.serial_number)}</td><td>${escHtml(r.warehouse_name ?? '')}</td><td>${escHtml(statusLabel(r.status))}</td><td>${escHtml(r.created_at ? formatDisplayDate(r.created_at.slice(0, 10)) : '')}</td><td>${escHtml(r.updated_at ? formatDisplayDate(r.updated_at.slice(0, 10)) : '')}</td></tr>`,
      )
      .join('')
    win.document.write(`<!DOCTYPE html><html dir="${isRtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${escHtml(title)}</title>
<style>body{font-family:Arial,sans-serif;padding:16px;} table{border-collapse:collapse;width:100%;font-size:11pt;} th,td{border:1px solid #ccc;padding:6px 8px;} th{background:#f5f5f5;}</style></head><body>
<h2>${escHtml(title)}</h2>
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
</body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => {
      win.print()
      win.close()
    }, 250)
  }, [tenantId, total, fetchAllRowsForExport, labels, title, isRtl, statusLabel])

  const exportDisabled = isLoading || tenantId <= 0 || total === 0
  const from = total === 0 ? 0 : (page - 1) * perPage + 1
  const to = Math.min(page * perPage, total)

  return (
    <div className="px-4 py-3 space-y-3 max-w-full min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2 gap-y-1.5 border-b border-slate-200 pb-2">
        <h1 className="text-base font-semibold text-slate-900 truncate leading-tight">{title}</h1>
        <div className="flex items-center gap-1 flex-wrap shrink-0">
          <button
            type="button"
            onClick={() => void handlePrint()}
            disabled={exportDisabled}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            title={labels.print}
          >
            <Printer size={15} />
          </button>
          <button
            type="button"
            onClick={() => void handlePrint()}
            disabled={exportDisabled}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-50"
            title={labels.pdf}
          >
            <FileText size={15} />
          </button>
          <button
            type="button"
            onClick={() => void handleExportExcel()}
            disabled={exportDisabled}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
            title={labels.excel}
          >
            <FileSpreadsheet size={15} />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3">
        <div className={`no-print mb-3 ${filterBarOverflowClass}`}>
          <div className={filterRowInnerClass}>
          <div className={filterCellBasisClass}>
            <select
              value={warehouseId}
              onChange={(e) => {
                setWarehouseId(e.target.value)
                setPage(1)
              }}
              className={filterSelectClass}
              aria-label={labels.warehouse}
              title={labels.warehouse}
            >
              <option value="">{labels.warehouse}</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code ? `${w.code} — ` : ''}
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div className={filterCellBasisClass}>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value)
                setPage(1)
              }}
              className={filterSelectClass}
              aria-label={labels.status}
              title={labels.status}
            >
              <option value="">{labels.status}</option>
              <option value="available">{statusLabel('available')}</option>
              <option value="sold">{statusLabel('sold')}</option>
              <option value="reserved">{statusLabel('reserved')}</option>
              <option value="returned">{statusLabel('returned')}</option>
              <option value="damaged">{statusLabel('damaged')}</option>
            </select>
          </div>
          <div className={`${filterCellBasisClass} min-w-[14rem] flex-[1.35]`}>
            <SearchableSelect
              options={itemFilterOptions}
              value={itemId === '' ? 0 : Number(itemId) || 0}
              onChange={(v) => {
                setItemId(v === null || v === 0 || v === '' ? '' : String(v))
                setPage(1)
              }}
              placeholder={lang === 'ar' ? `${itemFieldShort} — ابحث أو اختر` : `${itemFieldShort} — search or pick`}
              textAlign={isRtl ? 'right' : 'left'}
              wrapOptions
              matchTriggerWidth
              className="w-full min-w-0 overflow-visible"
              inputClassName={filterSearchableInputTallClass}
              aria-label={itemFieldShort}
            />
          </div>
          <div className={`${filterCellBasisClass} min-w-[12rem] flex-[1.2]`}>
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder={labels.searchPlaceholder}
              aria-label={labels.searchPlaceholder}
              className={`${filterSelectClass} px-3`}
            />
          </div>
          <div className="w-14 shrink-0 flex items-center overflow-visible">
            <select
              value={perPage}
              onChange={(e) => {
                setPerPage(Number(e.target.value))
                setPage(1)
              }}
              title={lang === 'ar' ? 'عدد السجلات في الصفحة' : 'Rows per page'}
              className={filterPageSizeSelectClass}
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

        <div className="overflow-x-auto -mx-3 sm:mx-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
            </div>
          ) : (
            <table className="w-full text-sm min-w-[980px]">
              <thead>
                <tr className="bg-slate-50 text-slate-600">
                  <SortableTh
                    label={labels.itemCode}
                    sortKey="item_code"
                    sortState={sort}
                    onToggle={toggleSort}
                    truncateLabel={false}
                    widthClassName="min-w-[7rem]"
                    className={`${thClass} text-slate-700`}
                  />
                  <SortableTh
                    label={labels.itemName}
                    sortKey="item_name"
                    sortState={sort}
                    onToggle={toggleSort}
                    truncateLabel={false}
                    widthClassName="min-w-[12rem]"
                    className={`${thClass} text-slate-700`}
                  />
                  <SortableTh
                    label={labels.serial}
                    sortKey="serial_number"
                    sortState={sort}
                    onToggle={toggleSort}
                    truncateLabel={false}
                    widthClassName="min-w-[10rem]"
                    className={`${thClass} text-slate-700`}
                  />
                  <SortableTh
                    label={labels.warehouse}
                    sortKey="warehouse_name"
                    sortState={sort}
                    onToggle={toggleSort}
                    truncateLabel={false}
                    widthClassName="min-w-[9rem]"
                    className={`${thClass} text-slate-700`}
                  />
                  <SortableTh
                    label={labels.status}
                    sortKey="status"
                    sortState={sort}
                    onToggle={toggleSort}
                    truncateLabel={false}
                    widthClassName="min-w-[7rem]"
                    className={`${thClass} text-slate-700`}
                  />
                  <SortableTh
                    label={labels.createdAt}
                    sortKey="created_at"
                    sortState={sort}
                    onToggle={toggleSort}
                    truncateLabel={false}
                    widthClassName="min-w-[8.5rem]"
                    className={`${thClass} text-slate-700`}
                  />
                  <SortableTh
                    label={labels.updatedAt}
                    sortKey="updated_at"
                    sortState={sort}
                    onToggle={toggleSort}
                    truncateLabel={false}
                    widthClassName="min-w-[8.5rem]"
                    className={`${thClass} text-slate-700`}
                  />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-10 text-slate-400">
                      {labels.noData}
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-700">{r.item_code ?? '—'}</td>
                      <td className="px-3 py-2 text-slate-800">{r.item_name ?? '—'}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => setHistorySerialId(r.id)}
                          className="font-mono text-primary-700 hover:underline text-start"
                        >
                          {r.serial_number}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-slate-700">{r.warehouse_name ?? '—'}</td>
                      <td className="px-3 py-2">{statusLabel(r.status)}</td>
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                        {r.created_at ? formatDisplayDate(r.created_at.slice(0, 10)) : '—'}
                      </td>
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                        {r.updated_at ? formatDisplayDate(r.updated_at.slice(0, 10)) : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        {total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-2 border-t border-slate-100 text-xs text-slate-600">
            <span>
              {from} — {to} / {total.toLocaleString(locale)}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-2 py-1 rounded border border-slate-300 disabled:opacity-40"
              >
                {labels.prev}
              </button>
              <span>{labels.pageOf(page, lastPage)}</span>
              <button
                type="button"
                disabled={page >= lastPage}
                onClick={() => setPage((p) => p + 1)}
                className="px-2 py-1 rounded border border-slate-300 disabled:opacity-40"
              >
                {labels.next}
              </button>
            </div>
          </div>
        )}
      </div>

      {historySerialId != null && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="serial-history-title"
          onClick={() => setHistorySerialId(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200">
              <h2 id="serial-history-title" className="text-base font-semibold text-slate-900">
                {labels.historyTitle}
              </h2>
              <button
                type="button"
                onClick={() => setHistorySerialId(null)}
                className="p-1 rounded-md hover:bg-slate-100 text-slate-600"
                aria-label={labels.close}
              >
                <X size={20} />
              </button>
            </div>
            <div className="px-4 py-3 overflow-y-auto text-sm">
              {historyLoading && (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
                </div>
              )}
              {!historyLoading && historyData && (
                <>
                  <div className="space-y-1 mb-4 text-slate-700">
                    <p>
                      <span className="text-slate-500">{labels.serial}:</span>{' '}
                      <span className="font-mono font-medium">{historyData.serial.serial_number}</span>
                    </p>
                    <p>
                      <span className="text-slate-500">{labels.status}:</span> {statusLabel(historyData.serial.status)}
                    </p>
                    {historyData.serial.item && (
                      <p>
                        <span className="text-slate-500">{labels.itemName}:</span> {historyData.serial.item.name}
                      </p>
                    )}
                    {historyData.serial.warehouse && (
                      <p>
                        <span className="text-slate-500">{labels.warehouse}:</span> {historyData.serial.warehouse.name}
                      </p>
                    )}
                  </div>
                  {historyData.events.length === 0 ? (
                    <p className="text-slate-500">{lang === 'ar' ? 'لا توجد أحداث مسجّلة.' : 'No recorded events.'}</p>
                  ) : (
                    <ul className="space-y-3">
                      {historyData.events.map((ev, i) => (
                        <li key={i} className="border border-slate-100 rounded-lg p-3 bg-slate-50/80">
                          <div className="font-medium text-slate-900">
                            {ev.kind === 'in' ? labels.eventIn : labels.eventOut}
                            {ev.date ? ` — ${formatDisplayDate(ev.date)}` : ''}
                          </div>
                          <div className="text-slate-600 mt-1">
                            {ev.kind === 'in' ? labels.vendor : labels.customer}: {ev.counterparty_name ?? '—'}
                          </div>
                          <div className="text-slate-500 text-xs mt-1">
                            {labels.document}: {ev.document_number ?? ev.document_id}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
