import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchLowStockAlerts, fetchWarehouses, fetchItemsForFilter, fetchItemCategories, fetchItemBrands, createPurchaseRequestFromShortage } from '../../api/tenant'
import type { Warehouse } from '../../types'
import SearchableSelect from '../../components/ui/SearchableSelect'
import { AlertTriangle, Download, FileSpreadsheet, Printer, ShoppingCart } from 'lucide-react'
import Toast, { type ToastType } from '../../components/ui/Toast'
import { useClientSort } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'

type LowStockAlertRow = {
  item_id: number
  item_code: string
  item_name: string
  unit: string
  current_stock: number
  min_quantity: number
  shortage: number
}

type LowStockSortKey = 'item_code' | 'item_name' | 'unit' | 'current_stock' | 'min_quantity' | 'shortage'

/** استخراج مصفوفة من استجابة API (نفس مصدر "بيانات الأصناف": paginator أو { data: [] } أو مصفوفة) */
function toList(res: unknown): unknown[] {
  if (Array.isArray(res)) return res
  if (res && typeof res === 'object' && 'data' in res) {
    const d = (res as { data: unknown }).data
    return Array.isArray(d) ? d : []
  }
  return []
}

export default function LowStockAlerts() {
  const { currentTenant, meData, can } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const textAlign = isRtl ? 'text-right' : 'text-left'

  const createPRFromShortageMut = useMutation({
    mutationFn: () => createPurchaseRequestFromShortage(tenantId, warehouseId ? { warehouse_id: Number(warehouseId) } : undefined),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['low-stock'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-requests'] })
      setToast({ message: res.message, type: 'success' })
      if (res.purchase_request?.id) navigate(`/purchase-requests/edit/${res.purchase_request.id}`)
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setToast({ message: err?.response?.data?.message ?? (lang === 'ar' ? 'فشل إنشاء طلب الشراء' : 'Failed to create purchase request'), type: 'error' })
    },
  })

  const [warehouseId, setWarehouseId] = useState<string>('')
  const appliedUserWarehouseRef = useRef(false)
  const isRestrictedWarehouse = !!(meData?.restrict_to_branch_warehouse && meData?.default_warehouse_id != null)
  const canChangeWarehouse = can('*') || meData?.role_slug === 'admin'

  useEffect(() => {
    if (appliedUserWarehouseRef.current || !meData?.restrict_to_branch_warehouse || meData?.default_warehouse_id == null) return
    setWarehouseId(String(meData.default_warehouse_id))
    appliedUserWarehouseRef.current = true
  }, [meData?.restrict_to_branch_warehouse, meData?.default_warehouse_id])
  const [itemIdFilter, setItemIdFilter] = useState<string>('')
  const [categoryIdFilter, setCategoryIdFilter] = useState<string>('')
  const [brandIdFilter, setBrandIdFilter] = useState<string>('')

  const reportParams: Record<string, string> = {}
  if (warehouseId) reportParams.warehouse_id = warehouseId
  if (itemIdFilter) reportParams.item_id = itemIdFilter
  if (categoryIdFilter) reportParams.category_id = categoryIdFilter
  if (brandIdFilter) reportParams.brand_id = brandIdFilter
  const hasParams = Object.keys(reportParams).length > 0

  const { data, isLoading } = useQuery({
    queryKey: ['low-stock', tenantId, reportParams],
    queryFn: () => fetchLowStockAlerts(tenantId, hasParams ? reportParams : undefined),
    enabled: !!tenantId,
  })

  /** حجم الدفعة الأولى للقوائم (يُجلب فور تحميل الصفحة لظهور البيانات عند فتح القائمة مباشرة) */
  const LIST_INITIAL_PAGE_SIZE = 50

  const { data: warehousesData, isError: warehousesError, error: warehousesErr, refetch: refetchWarehouses } = useQuery({
    queryKey: ['warehouses', tenantId, LIST_INITIAL_PAGE_SIZE],
    queryFn: () => fetchWarehouses(tenantId, { per_page: String(LIST_INITIAL_PAGE_SIZE) }),
    enabled: !!tenantId,
    staleTime: 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    retry: 1,
  })
  const warehouses = toList(warehousesData) as Warehouse[]

  const { data: itemsResp, isError: itemsError, error: itemsErr, refetch: refetchItems } = useQuery({
    queryKey: ['items', tenantId, 'filter-list', LIST_INITIAL_PAGE_SIZE],
    queryFn: () => fetchItemsForFilter(tenantId, { per_page: String(LIST_INITIAL_PAGE_SIZE) }),
    enabled: !!tenantId,
    staleTime: 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    retry: 1,
  })
  const itemsList = toList(itemsResp) as { id: number; name: string; code?: string }[]

  const { data: categoriesData, isError: categoriesError, error: categoriesErr, refetch: refetchCategories } = useQuery({
    queryKey: ['item-categories', tenantId],
    queryFn: () => fetchItemCategories(tenantId),
    enabled: !!tenantId,
    staleTime: 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    retry: 1,
  })
  const categories = toList(categoriesData) as { id: number; name: string }[]

  const { data: brandsData, isError: brandsError, error: brandsErr, refetch: refetchBrands } = useQuery({
    queryKey: ['item-brands', tenantId],
    queryFn: () => fetchItemBrands(tenantId),
    enabled: !!tenantId,
    staleTime: 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    retry: 1,
  })
  const brands = toList(brandsData) as { id: number; name: string }[]

  const listsLoadFailed = warehousesError || itemsError || categoriesError || brandsError
  const listErrorMessage = (warehousesErr as { response?: { data?: { message?: string }; status?: number } })?.response?.data?.message
    ?? (itemsErr as { response?: { data?: { message?: string } } })?.response?.data?.message
    ?? (categoriesErr as { response?: { data?: { message?: string } } })?.response?.data?.message
    ?? (brandsErr as { response?: { data?: { message?: string } } })?.response?.data?.message
    ?? (warehousesErr as { message?: string })?.message
  function retryLists() {
    refetchWarehouses()
    refetchItems()
    refetchCategories()
    refetchBrands()
  }

  const alerts = (data?.data ?? []) as LowStockAlertRow[]
  const lowStockSortColumns = useMemo(
    () => [
      { key: 'item_code' as LowStockSortKey, type: 'string' as const, getValue: (r: LowStockAlertRow) => r.item_code ?? '' },
      { key: 'item_name' as LowStockSortKey, type: 'string' as const, getValue: (r: LowStockAlertRow) => r.item_name ?? '' },
      { key: 'unit' as LowStockSortKey, type: 'string' as const, getValue: (r: LowStockAlertRow) => r.unit ?? '' },
      { key: 'current_stock' as LowStockSortKey, type: 'number' as const, getValue: (r: LowStockAlertRow) => r.current_stock },
      { key: 'min_quantity' as LowStockSortKey, type: 'number' as const, getValue: (r: LowStockAlertRow) => r.min_quantity },
      { key: 'shortage' as LowStockSortKey, type: 'number' as const, getValue: (r: LowStockAlertRow) => r.shortage },
    ],
    [],
  )
  const { sort, toggleSort, sortedRows: sortedAlerts } = useClientSort(alerts, lowStockSortColumns, {
    locale: lang === 'ar' ? 'ar-u-nu-latn' : 'en-US',
  })

  const exportHeaders = [
    t.items?.itemCode ?? 'كود الصنف',
    t.items?.itemName ?? 'اسم الصنف',
    t.items?.unit ?? 'الوحدة',
    lang === 'ar' ? 'الرصيد الحالي' : 'Current Stock',
    lang === 'ar' ? 'حد الطلب' : 'Reorder Level',
    lang === 'ar' ? 'النقص' : 'Shortage',
  ]
  function buildCsvContent(rows: LowStockAlertRow[]) {
    const exportRows = rows.map((row) => [row.item_code, row.item_name, row.unit, row.current_stock, row.min_quantity, row.shortage])
    return '\uFEFF' + [exportHeaders.join(','), ...exportRows.map((r: (string | number)[]) => r.join(','))].join('\n')
  }

  function exportCSV() {
    const csvContent = buildCsvContent(sortedAlerts)
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `low-stock-alerts-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportExcel() {
    const csvContent = buildCsvContent(sortedAlerts)
    const blob = new Blob([csvContent], { type: 'application/vnd.ms-excel;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `low-stock-alerts-${new Date().toISOString().slice(0, 10)}.xls`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handlePrint() {
    window.print()
  }

  return (
    <div className="p-4 space-y-4 print:p-0">
      {listsLoadFailed && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 no-print">
          <div>
            <span>{lang === 'ar' ? 'فشل تحميل قوائم الأصناف/الفئات/العلامات/المخازن. تحقق من الاتصال والمستأجر ثم أعد المحاولة.' : 'Failed to load item/category/brand/warehouse lists. Check connection and tenant, then retry.'}</span>
            {listErrorMessage && <p className="mt-1 text-sm text-amber-900 font-mono">{listErrorMessage}</p>}
          </div>
          <button type="button" onClick={retryLists} className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700">
            {lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-2">
        <h1 className="text-lg font-semibold text-slate-900">{t.nav?.lowStockAlerts ?? 'تنبيهات النواقص'}</h1>
        <div className="flex items-center gap-1.5 flex-wrap no-print flex-row-reverse">
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-[#F0F2F5] border border-[#D9DCE0] text-[#344054] hover:bg-[#E4E7EB]"
            title={t.accounts?.print ?? (lang === 'ar' ? 'طباعة' : 'Print')}
          >
            <Printer size={16} />
          </button>
          <button
            type="button"
            onClick={exportExcel}
            disabled={alerts.length === 0}
            className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
            title={lang === 'ar' ? 'تصدير Excel' : 'Export Excel'}
          >
            <FileSpreadsheet size={16} />
          </button>
          <button
            type="button"
            onClick={exportCSV}
            disabled={alerts.length === 0}
            className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-[#344054] text-white hover:bg-[#2d3846] disabled:opacity-50"
            title={t.exportCsv}
          >
            <Download size={16} />
          </button>
          <button type="button" onClick={() => createPRFromShortageMut.mutate()} disabled={alerts.length === 0 || createPRFromShortageMut.isPending}
            className="flex items-center gap-2 px-3 py-2 h-9 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-50 bg-[#0ea5e9] hover:bg-[#0284c7]"
            title={lang === 'ar' ? 'إنشاء طلب شراء بالأصناف التي وصلت لحد الطلب' : 'Create purchase request from items below reorder level'}>
            <ShoppingCart size={16} /> {lang === 'ar' ? 'إنشاء طلب شراء من النواقص' : 'Create PR from shortage'}
          </button>
        </div>
      </div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="sticky top-0 z-40 bg-[#f4f4f5] pb-2 -mx-4 px-4 pt-1 no-print border-b border-slate-200/80 shadow-sm min-w-0">
        <div className="bg-white rounded-xl border border-slate-200 p-3 mt-2 w-full min-w-0">
          <div className="flex flex-nowrap items-stretch gap-2 w-full min-w-0 overflow-x-auto">
          <div className="min-w-0 flex-1 basis-0 shrink flex items-center">
            <SearchableSelect
              placeholder={t.nav?.warehouses ?? (lang === 'ar' ? 'المخازن' : 'Warehouses')}
              options={[
                { value: 0, label: t.nav?.warehouses ?? (lang === 'ar' ? 'المخازن' : 'Warehouses') },
                ...warehouses.map((w: Warehouse) => ({ value: w.id, label: w.name })),
              ]}
              value={warehouseId ? Number(warehouseId) : 0}
              onChange={(v) => setWarehouseId(v === null || v === 0 ? '' : String(v))}
              textAlign={isRtl ? 'right' : 'left'}
              disabled={isRestrictedWarehouse && !canChangeWarehouse}
              wrapOptions
              className="w-full min-w-0 [&_input]:h-10 [&_input]:py-0 [&_input]:leading-none"
            />
          </div>
          <div className="min-w-0 flex-1 basis-0 shrink flex items-center">
            <SearchableSelect
              placeholder={t.items?.itemName ?? (lang === 'ar' ? 'اسم الصنف' : 'Item name')}
              options={[
                { value: 0, label: t.items?.itemName ?? (lang === 'ar' ? 'اسم الصنف' : 'Item name') },
                ...itemsList.map((item: { id: number; name: string; code?: string }) => ({
                  value: item.id,
                  label: `${item.name} (${item.code ?? item.id})`,
                })),
              ]}
              value={itemIdFilter ? Number(itemIdFilter) : 0}
              onChange={(v) => setItemIdFilter(v === null || v === 0 ? '' : String(v))}
              textAlign={isRtl ? 'right' : 'left'}
              wrapOptions
              className="w-full min-w-0 [&_input]:h-10 [&_input]:py-0 [&_input]:leading-none"
            />
          </div>
          <div className="min-w-0 flex-1 basis-0 shrink flex items-center">
            <SearchableSelect
              placeholder={t.items?.category ?? (lang === 'ar' ? 'الفئة' : 'Category')}
              options={[
                { value: 0, label: t.items?.category ?? (lang === 'ar' ? 'الفئة' : 'Category') },
                ...(categories as { id: number; name: string }[]).map((c) => ({ value: c.id, label: c.name })),
              ]}
              value={categoryIdFilter ? Number(categoryIdFilter) : 0}
              onChange={(v) => setCategoryIdFilter(v === null || v === 0 ? '' : String(v))}
              textAlign={isRtl ? 'right' : 'left'}
              wrapOptions
              className="w-full min-w-0 [&_input]:h-10 [&_input]:py-0 [&_input]:leading-none"
            />
          </div>
          <div className="min-w-0 flex-1 basis-0 shrink flex items-center">
            <SearchableSelect
              placeholder={t.items?.brand ?? (lang === 'ar' ? 'العلامة التجارية' : 'Brand')}
              options={[
                { value: 0, label: t.items?.brand ?? (lang === 'ar' ? 'العلامة التجارية' : 'Brand') },
                ...(brands as { id: number; name: string }[]).map((b) => ({ value: b.id, label: b.name })),
              ]}
              value={brandIdFilter ? Number(brandIdFilter) : 0}
              onChange={(v) => setBrandIdFilter(v === null || v === 0 ? '' : String(v))}
              textAlign={isRtl ? 'right' : 'left'}
              wrapOptions
              className="w-full min-w-0 [&_input]:h-10 [&_input]:py-0 [&_input]:leading-none"
            />
          </div>
        </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : alerts.length === 0 ? (
          <div className="py-12 text-center text-slate-500">
            <AlertTriangle className="mx-auto mb-2 opacity-50" size={40} />
            <p>{lang === 'ar' ? 'لا توجد أصناف تحت حد الطلب حالياً.' : 'No items below reorder level.'}</p>
          </div>
        ) : (
          <table className="w-full text-sm low-stock-table table-fixed">
            <thead>
              <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <SortableTh
                  label={t.items?.itemCode ?? 'كود الصنف'}
                  sortKey="item_code"
                  sortState={sort}
                  onToggle={toggleSort}
                  className={`${textAlign} p-0 font-medium`}
                />
                <SortableTh
                  label={t.items?.itemName ?? 'اسم الصنف'}
                  sortKey="item_name"
                  sortState={sort}
                  onToggle={toggleSort}
                  className={`${textAlign} p-0 font-medium`}
                />
                <SortableTh label={t.items?.unit ?? 'الوحدة'} sortKey="unit" sortState={sort} onToggle={toggleSort} className={`${textAlign} p-0 font-medium`} />
                <SortableTh
                  label={lang === 'ar' ? 'الرصيد الحالي' : 'Current Stock'}
                  sortKey="current_stock"
                  sortState={sort}
                  onToggle={toggleSort}
                  className={`${textAlign} p-0 font-medium`}
                />
                <SortableTh
                  label={lang === 'ar' ? 'حد الطلب' : 'Reorder Level'}
                  sortKey="min_quantity"
                  sortState={sort}
                  onToggle={toggleSort}
                  className={`${textAlign} p-0 font-medium`}
                />
                <SortableTh
                  label={lang === 'ar' ? 'النقص' : 'Shortage'}
                  sortKey="shortage"
                  sortState={sort}
                  onToggle={toggleSort}
                  className={`${textAlign} p-0 font-medium`}
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedAlerts.map((row) => (
                <tr key={row.item_id} className="hover:bg-amber-50/50">
                  <td className={`px-4 py-3 font-mono text-slate-800`}>{row.item_code}</td>
                  <td className={`px-4 py-3 font-medium text-slate-800`}>{row.item_name}</td>
                  <td className={`px-4 py-3 text-slate-600`}>{row.unit}</td>
                  <td className="low-stock-cell-qty px-4 py-3 tabular-nums text-amber-700 font-medium">{row.current_stock}</td>
                  <td className="low-stock-cell-qty px-4 py-3 tabular-nums text-slate-700 font-medium">{row.min_quantity}</td>
                  <td className="low-stock-cell-shortage px-4 py-3 tabular-nums font-bold">{row.shortage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
