import { useState, useMemo, useRef, useEffect, useLayoutEffect, useCallback, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchItemMovements,
  fetchItems,
  fetchItemCategories,
  fetchSettings,
  fetchWarehouses,
  fetchBranches,
  fetchCostCenters,
  fetchTenantUsers,
} from '../../api/tenant'
import ItemLedgerDocumentPreviewModal from './ItemLedgerDocumentPreviewModal'
import type { ItemLedgerResponse, MovementRow } from './itemLedgerHelpers'
import {
  escHtml,
  ledgerCanOpenPreview,
  ledgerVoucherNumberFromMovement,
  ledgerVoucherTypeFromMovement,
  movementSourceNavigatePath,
  voucherKindLabel,
} from './itemLedgerHelpers'
import type { Branch, CostCenter, Item, ItemCategory, TenantUserItem, Warehouse } from '../../types'
import PageSizeSelect from '../../components/ui/PageSizeSelect'
import ReportFooter from '../../components/ui/ReportFooter'
import { usePersistedColumnVisibility } from '../../hooks/usePersistedColumnVisibility'
import { asArray } from '../../utils/asArray'
import { getDefaultDateRange, getReportPeriodRange, formatDisplayDate, type ReportPeriodKey } from '../../utils/date'
import { coerceDecimalPlaces, formatAmount } from '../../utils/currency'
import { ArrowRight, Eye, Printer, FileSpreadsheet, FileText, Search, Package, ArrowDownToLine, ArrowUpFromLine, Columns3 } from 'lucide-react'
import type { PaginatedResponse } from '../../types'

const defaultCustomRange = getDefaultDateRange()

type ItemMovementColumnKey =
  | 'datetime'
  | 'docType'
  | 'docNumber'
  | 'qtyIn'
  | 'qtyOut'
  | 'balance'
  | 'cost'
  | 'createdBy'
  | 'actions'

const ITEM_MOVEMENT_COLUMN_KEYS: ItemMovementColumnKey[] = [
  'datetime',
  'docType',
  'docNumber',
  'qtyIn',
  'qtyOut',
  'balance',
  'cost',
  'createdBy',
  'actions',
]
const ITEM_MOVEMENT_COLUMNS_STORAGE = 'itemMovementPageVisibleColumns'

const periodOptions: { value: ReportPeriodKey | 'custom'; labelAr: string; labelEn: string }[] = [
  { value: 'custom', labelAr: 'تاريخ مخصص', labelEn: 'Custom Date' },
  { value: 'all', labelAr: 'الكل', labelEn: 'All' },
  { value: 'today', labelAr: 'اليوم', labelEn: 'Today' },
  { value: 'yesterday', labelAr: 'الأمس', labelEn: 'Yesterday' },
  { value: 'this_week', labelAr: 'هذا الأسبوع', labelEn: 'This Week' },
  { value: 'last_week', labelAr: 'الأسبوع السابق', labelEn: 'Last Week' },
  { value: 'this_month', labelAr: 'هذا الشهر', labelEn: 'This Month' },
  { value: 'last_month', labelAr: 'الشهر السابق', labelEn: 'Last Month' },
  { value: 'this_year', labelAr: 'هذه السنة', labelEn: 'This Year' },
]

function formatMovementDateTime(m: MovementRow, locale: string): string {
  const datePart = formatDisplayDate(m.date)
  const ca = m.created_at?.trim()
  if (ca && ca.includes(' ')) {
    const timePart = ca.split(' ')[1]?.slice(0, 8) ?? ''
    if (timePart) return `${datePart} ${timePart}`
  }
  return datePart
}

export default function ItemMovementPage() {
  const { currentTenant, can } = useAuth()
  const canViewCost = can('items.view_cost')
  const { t, lang, isRtl } = useLanguage()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tenantId = currentTenant?.id ?? 0
  const inv = t.inventory

  const initialItem = Number(searchParams.get('item') || '')
  const initialCategory = searchParams.get('category') || ''
  const initialSerial = searchParams.get('serial') || ''
  const [selectedItemId, setSelectedItemId] = useState<number | null>(
    Number.isFinite(initialItem) && initialItem > 0 ? initialItem : null,
  )
  const [categoryFilter, setCategoryFilter] = useState(
    initialCategory && Number.isFinite(Number(initialCategory)) && Number(initialCategory) > 0 ? initialCategory : '',
  )
  const [serialFilter, setSerialFilter] = useState(initialSerial)
  const [debouncedSerial, setDebouncedSerial] = useState(initialSerial.trim())

  const [periodPreset, setPeriodPreset] = useState<ReportPeriodKey | 'custom'>('all')
  const [dateFrom, setDateFrom] = useState(defaultCustomRange.dateFrom)
  const [dateTo, setDateTo] = useState(defaultCustomRange.dateTo)
  const [warehouseId, setWarehouseId] = useState('')
  const [branchId, setBranchId] = useState('')
  const [costCenterId, setCostCenterId] = useState('')
  const [voucherKindFilter, setVoucherKindFilter] = useState('')
  const [createdByUserId, setCreatedByUserId] = useState('')

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [previewMovement, setPreviewMovement] = useState<MovementRow | null>(null)
  const columnsMenuRef = useRef<HTMLDivElement>(null)
  const [showColumnsMenu, setShowColumnsMenu] = useState(false)
  const [visibleColumns, setVisibleColumns] = usePersistedColumnVisibility<ItemMovementColumnKey>(
    ITEM_MOVEMENT_COLUMNS_STORAGE,
    ITEM_MOVEMENT_COLUMN_KEYS,
  )

  const [itemQuery, setItemQuery] = useState('')
  const [debouncedItemQuery, setDebouncedItemQuery] = useState('')
  const [comboboxOpen, setComboboxOpen] = useState(false)
  const itemInputRef = useRef<HTMLInputElement>(null)
  const serialInputRef = useRef<HTMLInputElement>(null)
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null)

  useEffect(() => {
    const id = Number(searchParams.get('item') || '')
    if (Number.isFinite(id) && id > 0) setSelectedItemId(id)
    else setSelectedItemId(null)
    const cat = searchParams.get('category') || ''
    setCategoryFilter(
      cat && Number.isFinite(Number(cat)) && Number(cat) > 0 ? cat : '',
    )
  }, [searchParams])

  useEffect(() => {
    const tmr = window.setTimeout(() => setDebouncedItemQuery(itemQuery.trim()), 280)
    return () => clearTimeout(tmr)
  }, [itemQuery])

  useEffect(() => {
    const tmr = window.setTimeout(() => {
      const d = serialFilter.trim()
      setDebouncedSerial(d)
      setSearchParams((prev) => {
        const p = new URLSearchParams(prev)
        if (d) p.set('serial', d)
        else p.delete('serial')
        return p
      }, { replace: true })
    }, 300)
    return () => clearTimeout(tmr)
  }, [serialFilter, setSearchParams])

  useLayoutEffect(() => {
    if (!comboboxOpen || !itemInputRef.current) {
      setDropdownRect(null)
      return
    }
    const el = itemInputRef.current
    const update = () => {
      const r = el.getBoundingClientRect()
      const minW = 280
      const isRtlLayout = document.documentElement.dir === 'rtl' || isRtl
      const left = isRtlLayout ? Math.max(8, r.right - Math.max(r.width, minW)) : r.left
      setDropdownRect({
        top: r.bottom + 4,
        left,
        width: Math.max(r.width, minW),
      })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [comboboxOpen, isRtl])

  useEffect(() => {
    if (!comboboxOpen) return
    function onDocMouseDown(e: MouseEvent) {
      const t = e.target as Node
      if (itemInputRef.current?.contains(t)) return
      if (serialInputRef.current?.contains(t)) return
      const portal = document.getElementById('item-movement-combobox-portal')
      if (portal?.contains(t)) return
      setComboboxOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [comboboxOpen])

  useEffect(() => {
    if (!showColumnsMenu) return
    function handleClickOutside(e: MouseEvent) {
      if (columnsMenuRef.current && !columnsMenuRef.current.contains(e.target as Node)) setShowColumnsMenu(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showColumnsMenu])

  const { data: itemCategoriesData } = useQuery({
    queryKey: ['item-categories', tenantId],
    queryFn: () => fetchItemCategories(tenantId),
    enabled: tenantId > 0,
  })
  const itemCategories: ItemCategory[] = asArray<ItemCategory>(itemCategoriesData)

  const { data: itemsSearchData, isFetching: itemsSearchLoading } = useQuery<PaginatedResponse<Item>>({
    queryKey: ['item-movement-search', tenantId, debouncedItemQuery, categoryFilter, debouncedSerial],
    queryFn: () => {
      const p: Record<string, string> = { per_page: '50', for_filter: '1' }
      if (debouncedItemQuery) p.search = debouncedItemQuery
      if (categoryFilter) p.category_id = categoryFilter
      if (debouncedSerial) p.serial_search = debouncedSerial
      return fetchItems(tenantId, p)
    },
    /** لا يُفتح القائمة من حقل التسلسل؛ الجلب عند فتح قائمة البحث أو عند وجود فلتر تسلسلي (تحميل مسبق) */
    enabled:
      tenantId > 0 &&
      (comboboxOpen || debouncedSerial.trim().length > 0),
  })
  const searchItems: Item[] = asArray<Item>(itemsSearchData?.data)

  const selectItem = useCallback(
    (item: Item) => {
      setSelectedItemId(item.id)
      setItemQuery(`${item.code ? `${item.code} — ` : ''}${item.name}`)
      setComboboxOpen(false)
      setCategoryFilter(item.category_id ? String(item.category_id) : '')
      setSerialFilter('')
      setDebouncedSerial('')
      setSearchParams((prev) => {
        const p = new URLSearchParams(prev)
        p.set('item', String(item.id))
        p.delete('serial')
        if (item.category_id) p.set('category', String(item.category_id))
        else p.delete('category')
        return p
      })
      setPage(1)
    },
    [setSearchParams],
  )

  const clearItem = useCallback(() => {
    setSelectedItemId(null)
    setItemQuery('')
    setSerialFilter('')
    setDebouncedSerial('')
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev)
      p.delete('item')
      p.delete('serial')
      return p
    })
    setPage(1)
  }, [setSearchParams])

  const onCategoryFilterChange = useCallback(
    (value: string) => {
      setCategoryFilter(value)
      setSelectedItemId(null)
      setItemQuery('')
      setComboboxOpen(false)
      setSearchParams((prev) => {
        const p = new URLSearchParams(prev)
        p.delete('item')
        if (value) p.set('category', value)
        else p.delete('category')
        return p
      })
      setPage(1)
    },
    [setSearchParams],
  )

  const apiParams = useMemo(() => {
    const p: Record<string, string> = {}
    if (periodPreset === 'custom') {
      if (dateFrom?.trim()) p.from_date = dateFrom.trim()
      if (dateTo?.trim()) p.to_date = dateTo.trim()
    } else if (periodPreset !== 'all') {
      const r = getReportPeriodRange(periodPreset)
      p.from_date = r.from_date
      p.to_date = r.to_date
    }
    if (warehouseId) p.warehouse_id = warehouseId
    if (branchId) p.branch_id = branchId
    if (costCenterId) p.cost_center_id = costCenterId
    if (voucherKindFilter) p.voucher_kind = voucherKindFilter
    if (createdByUserId) p.created_by = createdByUserId
    return p
  }, [periodPreset, dateFrom, dateTo, warehouseId, branchId, costCenterId, voucherKindFilter, createdByUserId])

  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses', tenantId],
    queryFn: () => fetchWarehouses(tenantId),
    enabled: !!tenantId,
  })
  const warehouses: Warehouse[] = asArray<Warehouse>(warehousesData)

  const { data: branchesData } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId, { status: 'active' }),
    enabled: !!tenantId,
  })
  const branches: Branch[] = asArray<Branch>(branchesData)

  const { data: costCentersData } = useQuery({
    queryKey: ['cost-centers', tenantId],
    queryFn: () => fetchCostCenters(tenantId, { active_only: '1' }),
    enabled: !!tenantId,
  })
  const costCenters: CostCenter[] = asArray<CostCenter>(costCentersData)

  const { data: tenantUsersData } = useQuery({
    queryKey: ['tenant-users', tenantId],
    queryFn: () => fetchTenantUsers(tenantId),
    enabled: !!tenantId,
  })
  const tenantUsers: TenantUserItem[] = asArray<TenantUserItem>(tenantUsersData).filter(
    (u) => u.pivot?.is_active !== false,
  )

  const { data: settings } = useQuery({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })

  const { data, isLoading, error } = useQuery<ItemLedgerResponse>({
    queryKey: [
      'item-ledger',
      tenantId,
      selectedItemId,
      periodPreset,
      dateFrom,
      dateTo,
      warehouseId,
      branchId,
      costCenterId,
      voucherKindFilter,
      createdByUserId,
    ],
    queryFn: () => fetchItemMovements(tenantId, selectedItemId!, Object.keys(apiParams).length ? apiParams : undefined),
    enabled: !!tenantId && !!selectedItemId,
  })

  useEffect(() => {
    if (!data?.item || selectedItemId !== data.item.id || comboboxOpen) return
    setItemQuery(`${data.item.code ? `${data.item.code} — ` : ''}${data.item.name}`)
  }, [data?.item, selectedItemId, comboboxOpen])

  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const qtyDecimals = Math.min(6, Math.max(0, Math.floor(Number(settings?.doc_quantity_decimals ?? 2))))
  const amountDecimals = coerceDecimalPlaces(settings?.doc_amount_decimals, 2)
  const fmtQty = (n: number) =>
    Number(n).toLocaleString(locale, { minimumFractionDigits: qtyDecimals, maximumFractionDigits: qtyDecimals })
  const fmtMoney = (n: number) => formatAmount(n, { decimal_places: amountDecimals }, locale)

  const textAlign = isRtl ? 'text-right' : 'text-left'
  const numAlign = 'text-right'

  const movements: MovementRow[] = data?.movements ?? []
  const totalFiltered = movements.length
  const lastPage = Math.max(1, Math.ceil(totalFiltered / pageSize) || 1)

  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize
    return movements.slice(start, start + pageSize)
  }, [movements, page, pageSize])

  const movementQtyTotals = useMemo(() => {
    let sumIn = 0
    let sumOut = 0
    for (const m of movements) {
      sumIn += Number(m.quantity_in) || 0
      sumOut += Number(m.quantity_out) || 0
    }
    return { sumIn, sumOut }
  }, [movements])

  const visibleColumnCount = useMemo(() => {
    let n = 0
    if (visibleColumns.datetime) n++
    if (visibleColumns.docType) n++
    if (visibleColumns.docNumber) n++
    if (visibleColumns.qtyIn) n++
    if (visibleColumns.qtyOut) n++
    if (visibleColumns.balance) n++
    if (canViewCost && visibleColumns.cost) n++
    if (visibleColumns.createdBy) n++
    if (visibleColumns.actions) n++
    return Math.max(1, n)
  }, [visibleColumns, canViewCost])

  const openSource = useCallback(
    (m: MovementRow) => {
      const path = movementSourceNavigatePath(m)
      if (!path) return
      if (path.startsWith('http://') || path.startsWith('https://')) {
        window.open(path, '_blank', 'noopener,noreferrer')
        return
      }
      navigate(path)
    },
    [navigate],
  )

  const voucherKindFilterOptions = useMemo(() => {
    const kinds = [
      'purchase_invoice',
      'sales_invoice',
      'purchase_return',
      'sales_return',
      'opening_stock',
      'stock_transfer',
      'production_order',
      'inventory_adjustment',
      'manual_adjustment',
      'invoice',
      'other',
    ] as const
    return kinds.map((k) => ({ value: k, label: voucherKindLabel(k, inv) }))
  }, [inv])

  const labelBranch = lang === 'ar' ? 'الفرع' : 'Branch'
  const labelWarehouse = t.nav?.warehouses ?? (lang === 'ar' ? 'المخزن' : 'Warehouse')
  const labelCostCenter = lang === 'ar' ? 'مركز التكلفة' : 'Cost center'
  const labelUser = lang === 'ar' ? 'المستخدم' : 'User'
  const labelFrom = lang === 'ar' ? 'من تاريخ' : 'From date'
  const labelTo = lang === 'ar' ? 'إلى تاريخ' : 'To date'
  const labelPeriod = lang === 'ar' ? 'الفترة' : 'Period'
  const showCustomDateFields = periodPreset === 'custom'

  function applyPeriodPreset(preset: ReportPeriodKey | 'custom') {
    setPeriodPreset(preset)
    if (preset === 'custom') {
      const dr = getDefaultDateRange()
      setDateFrom(dr.dateFrom)
      setDateTo(dr.dateTo)
    }
  }
  const title = inv.itemMovementPageTitle ?? (lang === 'ar' ? 'حركة الصنف' : 'Item movement')
  const pickPlaceholder = inv.itemMovementSearchPlaceholder ?? t.searchPlaceholder

  function itemMovementColumnLabel(key: ItemMovementColumnKey): string {
    switch (key) {
      case 'datetime':
        return inv.itemMovementDateTime ?? (lang === 'ar' ? 'التاريخ والوقت' : 'Date & time')
      case 'docType':
        return inv.documentTypeCol ?? (lang === 'ar' ? 'نوع المستند' : 'Document type')
      case 'docNumber':
        return inv.documentNumberCol ?? (lang === 'ar' ? 'رقم المستند' : 'Document no.')
      case 'qtyIn':
        return inv.quantityIn
      case 'qtyOut':
        return inv.quantityOut
      case 'balance':
        return inv.cumulativeBalance ?? t.accounts?.runningBalance ?? inv.runningBalance
      case 'cost':
        return inv.movementFinancialValue ?? (lang === 'ar' ? 'التكلفة / القيمة' : 'Cost / value')
      case 'createdBy':
        return inv.itemMovementUserCol ?? (lang === 'ar' ? 'المستخدم' : 'User')
      case 'actions':
        return t.actions
      default:
        return key
    }
  }

  const ledgerTfoot = useMemo(() => {
    let sumIn = 0
    let sumOut = 0
    for (const m of movements) {
      sumIn += Number(m.quantity_in) || 0
      sumOut += Number(m.quantity_out) || 0
    }
    const net = sumIn - sumOut
    const baseTd =
      'border-t-2 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/80 px-3 py-2.5 text-xs font-semibold tabular-nums'

    const leadKeys: ItemMovementColumnKey[] = ['datetime', 'docType', 'docNumber']
    const leadVisible = leadKeys.filter((k) => visibleColumns[k])
    const cells: ReactElement[] = []
    if (leadVisible.length > 0) {
      cells.push(
        <td key="tf-label" colSpan={leadVisible.length} className={`${textAlign} ${baseTd} text-slate-600`}>
          {lang === 'ar' ? 'الإجمالي' : 'Total'}
        </td>,
      )
    } else {
      cells.push(
        <td key="tf-label" className={`${textAlign} ${baseTd} text-slate-600`}>
          {lang === 'ar' ? 'الإجمالي' : 'Total'}
        </td>,
      )
    }
    if (visibleColumns.qtyIn) {
      cells.push(
        <td key="tf-in" className={`${numAlign} ${baseTd} text-emerald-700 dark:text-emerald-400`}>{fmtQty(sumIn)}</td>,
      )
    }
    if (visibleColumns.qtyOut) {
      cells.push(
        <td key="tf-out" className={`${numAlign} ${baseTd} text-red-700 dark:text-red-400`}>{fmtQty(sumOut)}</td>,
      )
    }
    if (visibleColumns.balance) {
      cells.push(
        <td key="tf-bal" className={`${numAlign} ${baseTd} text-slate-800 dark:text-slate-200`}>{fmtQty(net)}</td>,
      )
    }
    if (canViewCost && visibleColumns.cost) {
      cells.push(
        <td key="tf-cost" className={`${numAlign} ${baseTd} text-slate-600`}>
          —
        </td>,
      )
    }
    if (visibleColumns.createdBy) {
      cells.push(<td key="tf-user" className={`${textAlign} ${baseTd} text-slate-600`} />)
    }
    if (visibleColumns.actions) {
      cells.push(<td key="tf-actions" className={`${baseTd} w-24`} />)
    }

    return (
      <tfoot>
        <tr>{cells}</tr>
      </tfoot>
    )
  }, [movements, fmtQty, textAlign, numAlign, lang, canViewCost, visibleColumns])

  useEffect(() => {
    setPage(1)
  }, [costCenterId, warehouseId, branchId, voucherKindFilter, createdByUserId, periodPreset, dateFrom, dateTo, selectedItemId])

  useEffect(() => {
    if (page > lastPage) setPage(lastPage)
  }, [page, lastPage])

  useEffect(() => {
    if (!previewMovement) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPreviewMovement(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [previewMovement])

  function handleExportExcel() {
    if (!data?.movements?.length || !selectedItemId) return
    const headers = [
      inv.itemMovementDateTime ?? (lang === 'ar' ? 'التاريخ والوقت' : 'Date & time'),
      inv.documentTypeCol ?? (lang === 'ar' ? 'نوع المستند' : 'Document type'),
      inv.documentNumberCol ?? (lang === 'ar' ? 'رقم المستند' : 'Document no.'),
      inv.quantityIn,
      inv.quantityOut,
      inv.cumulativeBalance ?? t.accounts?.runningBalance ?? inv.runningBalance,
      ...(canViewCost ? [inv.movementFinancialValue ?? (lang === 'ar' ? 'التكلفة / القيمة' : 'Cost / value')] : []),
      inv.itemMovementUserCol ?? (lang === 'ar' ? 'المستخدم' : 'User'),
    ]
    const lines = [headers.join(',')]
    for (const m of data.movements) {
      const row = [
        formatMovementDateTime(m, locale),
        ledgerVoucherTypeFromMovement(m, inv),
        ledgerVoucherNumberFromMovement(m),
        m.quantity_in ? String(m.quantity_in) : '',
        m.quantity_out ? String(m.quantity_out) : '',
        String(m.balance_after),
        ...(canViewCost ? [String(m.total_cost ?? '')] : []),
        m.created_by_name?.trim() ?? '',
      ]
      lines.push(row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    }
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `item-movement-${selectedItemId}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handlePrintTable() {
    if (!data || !selectedItemId) return
    const it = data.item
    const itemLine = it ? escHtml(`${it.code ? `${it.code} — ` : ''}${it.name}`) : ''
    const dateMeta =
      apiParams.from_date && apiParams.to_date
        ? `${labelFrom}: ${apiParams.from_date} | ${labelTo}: ${apiParams.to_date}`
        : periodPreset === 'all'
          ? lang === 'ar'
            ? 'الفترة: الكل'
            : 'Period: All'
          : ''
    const docTypeMeta =
      voucherKindFilter !== ''
        ? `${inv.documentTypeCol ?? (lang === 'ar' ? 'نوع المستند' : 'Document type')}: ${voucherKindLabel(voucherKindFilter, inv)}`
        : ''
    const filterLine = escHtml(
      [
        dateMeta,
        docTypeMeta,
        warehouseId && `${labelWarehouse}: ${warehouses.find((w) => String(w.id) === warehouseId)?.name}`,
        branchId && `${labelBranch}: ${branches.find((b) => String(b.id) === branchId)?.name}`,
        costCenterId && `${labelCostCenter}: ${costCenters.find((c) => String(c.id) === costCenterId)?.name}`,
        createdByUserId && `${labelUser}: ${tenantUsers.find((u) => String(u.id) === createdByUserId)?.name}`,
      ]
        .filter(Boolean)
        .join(' | '),
    )
    const thCost = canViewCost
      ? `<th>${escHtml(inv.movementFinancialValue ?? (lang === 'ar' ? 'التكلفة / القيمة' : 'Cost / value'))}</th>`
      : ''
    const thUser = `<th>${escHtml(inv.itemMovementUserCol ?? (lang === 'ar' ? 'المستخدم' : 'User'))}</th>`
    const headers = [
      inv.itemMovementDateTime ?? (lang === 'ar' ? 'التاريخ والوقت' : 'Date & time'),
      inv.documentTypeCol ?? (lang === 'ar' ? 'نوع المستند' : 'Document type'),
      inv.documentNumberCol ?? (lang === 'ar' ? 'رقم المستند' : 'Document no.'),
      inv.quantityIn,
      inv.quantityOut,
      inv.cumulativeBalance ?? t.accounts?.runningBalance ?? inv.runningBalance,
    ]
    const headerHtml = headers.map((h) => `<th>${escHtml(h)}</th>`).join('') + thCost + thUser

    const rowsHtml = movements
      .map((m) => {
        const qin = m.quantity_in ? escHtml(fmtQty(m.quantity_in)) : '—'
        const qout = m.quantity_out ? escHtml(fmtQty(m.quantity_out)) : '—'
        const costCell = canViewCost ? `<td class="num">${escHtml(fmtMoney(Number(m.total_cost || 0)))}</td>` : ''
        const userCell = `<td>${escHtml(m.created_by_name?.trim() ? m.created_by_name : '—')}</td>`
        return `<tr>
<td>${escHtml(formatMovementDateTime(m, locale))}</td>
<td>${escHtml(ledgerVoucherTypeFromMovement(m, inv))}</td>
<td class="mono">${escHtml(ledgerVoucherNumberFromMovement(m))}</td>
<td class="num in">${qin}</td>
<td class="num out">${qout}</td>
<td class="num">${escHtml(fmtQty(m.balance_after))}</td>
${costCell}
${userCell}
</tr>`
      })
      .join('')

    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html dir="${isRtl ? 'rtl' : 'ltr'}"><head>
<meta charset="utf-8"><title>${escHtml(title)}</title>
<style>
@page { size: A4; margin: 10mm; }
body{font-family:'Cairo',Arial,sans-serif;margin:0;padding:12px;color:#000;background:#fff;}
h1{font-size:18px;margin:0 0 8px;}
.meta{font-size:11px;color:#333;margin-bottom:12px;}
table{width:100%;border-collapse:collapse;font-size:11pt;table-layout:auto;}
th,td{border:1px solid #000;padding:6px 8px;vertical-align:middle;}
th{background:#f3f4f6;font-weight:700;}
td.num{text-align:end;font-variant-numeric:tabular-nums;}
td.in{color:#047857;font-weight:600;}
td.out{color:#b91c1c;font-weight:600;}
td.mono{font-family:ui-monospace,monospace;font-size:10pt;}
</style></head><body>
<h1>${escHtml(title)}</h1>
<div class="meta"><strong>${itemLine}</strong><br/>${filterLine}</div>
<table><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>
</body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => {
      win.print()
      win.close()
    }, 350)
  }

  if (error) {
    return (
      <div className="p-6">
        <p className="text-red-600">{t.msg?.errorOccurred ?? 'Error'}</p>
        <Link to="/items" className="inline-flex items-center gap-2 mt-2 text-primary-600">
          <ArrowRight size={18} className={isRtl ? 'rotate-180' : ''} />
          {t.back}
        </Link>
      </div>
    )
  }

  return (
    <div className="w-full max-w-[100%] min-w-0 px-2 sm:px-4 pt-3 pb-8 space-y-4">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-600 pb-2">
        <div className="flex items-center gap-2 shrink-0 min-w-0">
          <Link to="/items" className="text-slate-600 hover:text-slate-900 dark:text-slate-400 shrink-0 p-1">
            <ArrowRight size={20} className={isRtl ? 'rotate-180' : ''} />
          </Link>
          <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100 leading-tight truncate">{title}</h1>
        </div>
        <div className="flex-1 flex justify-center min-w-0 no-print">
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <span className="text-sm text-slate-600 dark:text-slate-400 shrink-0">{labelPeriod}</span>
            <select
              value={periodPreset}
              onChange={(e) => applyPeriodPreset((e.target.value as ReportPeriodKey | 'custom') || 'all')}
              className="h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-sm min-w-[140px] max-w-[220px] bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shrink-0"
              title={labelPeriod}
            >
              {periodOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {lang === 'ar' ? opt.labelAr : opt.labelEn}
                </option>
              ))}
            </select>
            {showCustomDateFields && (
              <>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">{labelFrom}</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 w-[140px] min-w-0"
                    title={labelFrom}
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">{labelTo}</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 w-[140px] min-w-0"
                    title={labelTo}
                  />
                </div>
              </>
            )}
          </div>
        </div>
        <div className="relative flex items-center gap-1 no-print shrink-0" ref={columnsMenuRef}>
          <button
            type="button"
            onClick={() => setShowColumnsMenu((v) => !v)}
            className="inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-md sm:rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
            title={lang === 'ar' ? 'تخصيص الأعمدة' : 'Customize columns'}
          >
            <Columns3 size={15} />
          </button>
          {showColumnsMenu && (
            <div
              className={`absolute top-full mt-1 z-50 min-w-[220px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg py-2 max-h-72 overflow-y-auto ${
                isRtl ? 'left-0' : 'right-0'
              }`}
            >
              <p className="px-3 py-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700 mb-1">
                {lang === 'ar' ? 'إظهار الأعمدة' : 'Show columns'}
              </p>
              {ITEM_MOVEMENT_COLUMN_KEYS.filter((k) => k !== 'cost' || canViewCost).map((key) => (
                <label
                  key={key}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700/80 cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    checked={visibleColumns[key]}
                    onChange={() =>
                      setVisibleColumns((prev) => ({
                        ...prev,
                        [key]: !prev[key],
                      }))
                    }
                    className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-slate-700 dark:text-slate-200 text-sm">{itemMovementColumnLabel(key)}</span>
                </label>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={!data?.movements?.length}
            className="inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-md sm:rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40"
            title={inv.exportExcelMovement ?? t.accounts?.exportExcel ?? 'Excel'}
          >
            <FileSpreadsheet size={15} />
          </button>
          <button
            type="button"
            onClick={handlePrintTable}
            disabled={!data || !selectedItemId}
            className="inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-md sm:rounded-lg bg-[#F0F2F5] border border-[#D9DCE0] text-[#344054] hover:bg-[#E4E7EB] disabled:opacity-40"
            title={t.accounts?.print ?? (lang === 'ar' ? 'طباعة' : 'Print')}
          >
            <Printer size={15} />
          </button>
          <button
            type="button"
            onClick={handlePrintTable}
            disabled={!data || !selectedItemId}
            className="inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-md sm:rounded-lg bg-[#344054] text-white hover:bg-[#2d3846] disabled:opacity-40"
            title={t.accounts?.exportPdf ?? (lang === 'ar' ? 'تصدير PDF' : 'Export PDF')}
          >
            <FileText size={15} />
          </button>
        </div>
      </div>

      {/* بحث الصنف + بطاقات الملخص — صف واحد على الشاشات الواسعة */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 w-full">
        <div className="w-full lg:flex-1 lg:min-w-0 min-w-0 max-w-none">
          <div className="relative bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3 sm:p-3.5">
            <div className="relative flex flex-wrap gap-2 items-stretch">
              <div className="relative flex-1 min-w-[176px] max-w-[min(100%,19rem)]">
                <Search
                  size={18}
                  className={`absolute top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none ${isRtl ? 'right-2.5' : 'left-2.5'}`}
                />
                <input
                  ref={itemInputRef}
                  type="text"
                  value={itemQuery}
                  onChange={(e) => {
                    setItemQuery(e.target.value)
                    setComboboxOpen(true)
                  }}
                  onFocus={() => setComboboxOpen(true)}
                  placeholder={pickPlaceholder}
                  aria-label={pickPlaceholder}
                  className={`w-full h-10 sm:h-11 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm ${isRtl ? 'pr-9 pl-2.5' : 'pl-9 pr-2.5'} focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none`}
                  autoComplete="off"
                />
              </div>
              <input
                ref={serialInputRef}
                type="text"
                value={serialFilter}
                onChange={(e) => setSerialFilter(e.target.value)}
                placeholder={lang === 'ar' ? 'الرقم التسلسلي…' : 'Serial number…'}
                title={lang === 'ar' ? 'تصفية الأصناف التي تحتوي هذا الرقم التسلسلي' : 'Filter items by serial number'}
                aria-label={lang === 'ar' ? 'فلتر الرقم التسلسلي' : 'Serial number filter'}
                className="h-10 sm:h-11 shrink-0 min-w-[13rem] max-w-[min(100%,18rem)] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                autoComplete="off"
              />
              <select
                value={categoryFilter}
                onChange={(e) => onCategoryFilterChange(e.target.value)}
                className="h-10 sm:h-11 shrink-0 min-w-[13rem] max-w-[min(100%,22rem)] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2.5 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                title={t.items.category}
                aria-label={lang === 'ar' ? 'فلتر الفئة' : 'Category filter'}
              >
                <option value="">{lang === 'ar' ? 'كل الفئات' : 'All categories'}</option>
                {itemCategories
                  .filter((c) => c.is_active)
                  .map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.code ? `${c.code} — ` : ''}
                      {lang === 'ar' ? c.name : c.name_en || c.name}
                    </option>
                  ))}
              </select>
              {selectedItemId && (
                <button
                  type="button"
                  onClick={clearItem}
                  className="shrink-0 h-10 sm:h-11 px-2.5 sm:px-3 rounded-lg border border-slate-300 dark:border-slate-600 text-sm text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  {lang === 'ar' ? 'إلغاء' : 'Clear'}
                </button>
              )}
            </div>
          </div>
        </div>

        {selectedItemId && data?.item && (
          <div className="flex flex-wrap sm:flex-nowrap gap-2 shrink-0 lg:max-w-[min(100%,26.5rem)]">
            <div className="bg-primary-50 dark:bg-primary-950/40 border border-primary-200 dark:border-primary-800 rounded-xl px-3 py-2.5 w-[8.25rem] sm:w-[8.5rem] flex flex-col justify-center">
              <div className="flex items-center gap-1.5 text-primary-800 dark:text-primary-200 text-[11px] sm:text-xs font-medium mb-0.5 leading-snug">
                <ArrowDownToLine size={15} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span className="line-clamp-2">
                  {inv.itemMovementTotalInCard ?? (lang === 'ar' ? 'إجمالي الوارد' : 'Total in')}
                </span>
              </div>
              <div className="text-base sm:text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-300 leading-tight">
                {fmtQty(movementQtyTotals.sumIn)}{' '}
                <span className="text-xs font-semibold opacity-80">{data.item.unit || ''}</span>
              </div>
            </div>
            <div className="bg-primary-50 dark:bg-primary-950/40 border border-primary-200 dark:border-primary-800 rounded-xl px-3 py-2.5 w-[8.25rem] sm:w-[8.5rem] flex flex-col justify-center">
              <div className="flex items-center gap-1.5 text-primary-800 dark:text-primary-200 text-[11px] sm:text-xs font-medium mb-0.5 leading-snug">
                <ArrowUpFromLine size={15} className="shrink-0 text-red-600 dark:text-red-400" />
                <span className="line-clamp-2">
                  {inv.itemMovementTotalOutCard ?? (lang === 'ar' ? 'إجمالي الصادر' : 'Total out')}
                </span>
              </div>
              <div className="text-base sm:text-lg font-bold tabular-nums text-red-700 dark:text-red-300 leading-tight">
                {fmtQty(movementQtyTotals.sumOut)}{' '}
                <span className="text-xs font-semibold opacity-80">{data.item.unit || ''}</span>
              </div>
            </div>
            <div className="bg-primary-50 dark:bg-primary-950/40 border border-primary-200 dark:border-primary-800 rounded-xl px-3 py-2.5 w-[8.25rem] sm:w-[8.5rem] flex flex-col justify-center">
              <div className="flex items-center gap-1.5 text-primary-800 dark:text-primary-200 text-[11px] sm:text-xs font-medium mb-0.5 leading-snug">
                <Package size={15} className="shrink-0" />
                <span className="line-clamp-2">
                  {inv.currentStockCard ?? (lang === 'ar' ? 'الرصيد الحالي' : 'Current stock')}
                </span>
              </div>
              <div className="text-base sm:text-lg font-bold tabular-nums text-primary-950 dark:text-primary-100 leading-tight">
                {fmtQty(Number(data.item.current_stock))}{' '}
                <span className="text-xs font-semibold opacity-80">{data.item.unit || ''}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* فلاتر سطر واحد — عرض متساوٍ للقوائم */}
      <div
        className="no-print bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3 w-full min-w-0"
        aria-label={lang === 'ar' ? 'تصفية الحركات' : 'Filters'}
      >
        <div className="flex flex-nowrap items-stretch gap-2 w-full min-w-0 overflow-x-auto">
          <div className="min-w-0 flex-1 basis-0 shrink flex items-center">
            <select
              value={voucherKindFilter}
              onChange={(e) => setVoucherKindFilter(e.target.value)}
              className="h-9 w-full min-w-0 box-border border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-0 text-sm leading-none bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
              aria-label={inv.documentTypeCol ?? (lang === 'ar' ? 'نوع المستند' : 'Document type')}
            >
              <option value="">{inv.documentTypeCol ?? (lang === 'ar' ? 'نوع المستند' : 'Document type')}</option>
              {voucherKindFilterOptions.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0 flex-1 basis-0 shrink flex items-center">
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="h-9 w-full min-w-0 box-border border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-0 text-sm leading-none bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
              aria-label={labelWarehouse}
            >
              <option value="">{labelWarehouse}</option>
              {warehouses.filter((w) => w.is_active).map((w) => (
                <option key={w.id} value={String(w.id)}>{w.name}</option>
              ))}
            </select>
          </div>
          <div className="min-w-0 flex-1 basis-0 shrink flex items-center">
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="h-9 w-full min-w-0 box-border border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-0 text-sm leading-none bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
              aria-label={labelBranch}
            >
              <option value="">{labelBranch}</option>
              {branches.filter((b) => b.is_active).map((b) => (
                <option key={b.id} value={String(b.id)}>{b.code ? `${b.code} — ` : ''}{b.name}</option>
              ))}
            </select>
          </div>
          <div className="min-w-0 flex-1 basis-0 shrink flex items-center">
            <select
              value={costCenterId}
              onChange={(e) => setCostCenterId(e.target.value)}
              className="h-9 w-full min-w-0 box-border border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-0 text-sm leading-none bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
              aria-label={labelCostCenter}
            >
              <option value="">{labelCostCenter}</option>
              {costCenters.filter((c) => c.is_active).map((c) => (
                <option key={c.id} value={String(c.id)}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="min-w-0 flex-1 basis-0 shrink flex items-center">
            <select
              value={createdByUserId}
              onChange={(e) => setCreatedByUserId(e.target.value)}
              className="h-9 w-full min-w-0 box-border border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-0 text-sm leading-none bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
              aria-label={labelUser}
            >
              <option value="">{labelUser}</option>
              {tenantUsers.map((u) => (
                <option key={u.id} value={String(u.id)}>{u.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center shrink-0 w-[4.5rem]">
            <PageSizeSelect
              value={pageSize}
              onChange={(n) => {
                setPageSize(n)
                setPage(1)
              }}
              showLabel={false}
              ariaLabel={lang === 'ar' ? 'عدد السجلات' : 'Page size'}
              className="!text-sm w-full"
            />
          </div>
        </div>
      </div>

      {/* جدول */}
      <div
        id="item-movement-print-area"
        className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden"
      >
        {!selectedItemId ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-2">
            <Package size={40} className="opacity-40" />
            <p className="text-sm">{inv.pickItemToViewMovements ?? (lang === 'ar' ? 'اختر صنفاً لعرض حركته' : 'Select an item to view movements')}</p>
          </div>
        ) : isLoading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-600 border-t-transparent" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto w-full min-w-0">
              <table className="w-full min-w-[920px] text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-600">
                  <tr className="text-slate-600 dark:text-slate-400 text-xs uppercase tracking-wide">
                    {visibleColumns.datetime && (
                      <th className={`${textAlign} px-3 py-3 font-medium whitespace-nowrap`}>
                        {itemMovementColumnLabel('datetime')}
                      </th>
                    )}
                    {visibleColumns.docType && (
                      <th className={`${textAlign} px-3 py-3 font-medium min-w-[140px]`}>
                        {itemMovementColumnLabel('docType')}
                      </th>
                    )}
                    {visibleColumns.docNumber && (
                      <th className={`${textAlign} px-3 py-3 font-medium min-w-[120px]`}>
                        {itemMovementColumnLabel('docNumber')}
                      </th>
                    )}
                    {visibleColumns.qtyIn && (
                      <th className={`${numAlign} px-3 py-3 font-medium w-28`}>{itemMovementColumnLabel('qtyIn')}</th>
                    )}
                    {visibleColumns.qtyOut && (
                      <th className={`${numAlign} px-3 py-3 font-medium w-28`}>{itemMovementColumnLabel('qtyOut')}</th>
                    )}
                    {visibleColumns.balance && (
                      <th className={`${numAlign} px-3 py-3 font-medium w-32`}>{itemMovementColumnLabel('balance')}</th>
                    )}
                    {canViewCost && visibleColumns.cost && (
                      <th className={`${numAlign} px-3 py-3 font-medium min-w-[100px]`}>
                        {itemMovementColumnLabel('cost')}
                      </th>
                    )}
                    {visibleColumns.createdBy && (
                      <th className={`${textAlign} px-3 py-3 font-medium min-w-[100px] whitespace-nowrap`}>
                        {itemMovementColumnLabel('createdBy')}
                      </th>
                    )}
                    {visibleColumns.actions && (
                      <th className={`${textAlign} px-3 py-3 font-medium w-24 whitespace-nowrap`}>
                        {itemMovementColumnLabel('actions')}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {movements.length === 0 ? (
                    <tr>
                      <td colSpan={visibleColumnCount} className="text-center py-14 text-slate-500">
                        {inv.noMovements}
                      </td>
                    </tr>
                  ) : (
                    pagedRows.map((m) => {
                      const canPrev = ledgerCanOpenPreview(m)
                      const hasNav = !!movementSourceNavigatePath(m)
                      return (
                        <tr
                          key={m.id}
                          onClick={() => hasNav && openSource(m)}
                          className={`transition-colors ${hasNav ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/50' : ''}`}
                          title={hasNav ? (inv.clickRowForSource ?? '') : undefined}
                        >
                          {visibleColumns.datetime && (
                            <td className={`px-3 py-3 text-slate-600 dark:text-slate-300 text-xs whitespace-nowrap ${textAlign}`}>
                              {formatMovementDateTime(m, locale)}
                            </td>
                          )}
                          {visibleColumns.docType && (
                            <td className={`px-3 py-3 text-slate-700 dark:text-slate-200 text-xs ${textAlign}`}>
                              {ledgerVoucherTypeFromMovement(m, inv)}
                            </td>
                          )}
                          {visibleColumns.docNumber && (
                            <td className={`px-3 py-3 ${textAlign}`}>
                              <button
                                type="button"
                                disabled={!canPrev}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (canPrev) setPreviewMovement(m)
                                }}
                                className={`font-mono text-xs underline-offset-2 ${
                                  canPrev
                                    ? 'text-primary-600 hover:text-primary-500 underline'
                                    : 'text-slate-400 cursor-default no-underline'
                                }`}
                              >
                                {ledgerVoucherNumberFromMovement(m)}
                              </button>
                            </td>
                          )}
                          {visibleColumns.qtyIn && (
                            <td className={`px-3 py-3 tabular-nums text-xs font-medium text-emerald-600 dark:text-emerald-400 ${numAlign}`}>
                              {m.quantity_in ? fmtQty(m.quantity_in) : '—'}
                            </td>
                          )}
                          {visibleColumns.qtyOut && (
                            <td className={`px-3 py-3 tabular-nums text-xs font-medium text-red-600 dark:text-red-400 ${numAlign}`}>
                              {m.quantity_out ? fmtQty(m.quantity_out) : '—'}
                            </td>
                          )}
                          {visibleColumns.balance && (
                            <td className={`px-3 py-3 tabular-nums text-xs font-semibold text-slate-800 dark:text-slate-100 ${numAlign}`}>
                              {fmtQty(m.balance_after)}
                            </td>
                          )}
                          {canViewCost && visibleColumns.cost && (
                            <td className={`px-3 py-3 tabular-nums text-xs text-slate-700 dark:text-slate-200 ${numAlign}`}>
                              {fmtMoney(Number(m.total_cost || 0))}
                            </td>
                          )}
                          {visibleColumns.createdBy && (
                            <td
                              className={`px-3 py-3 text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap ${textAlign}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {m.created_by_name?.trim() ? m.created_by_name : '—'}
                            </td>
                          )}
                          {visibleColumns.actions && (
                            <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                              {canPrev ? (
                                <button
                                  type="button"
                                  onClick={() => setPreviewMovement(m)}
                                  className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-500 text-xs"
                                >
                                  <Eye size={14} /> {inv.viewSource}
                                </button>
                              ) : (
                                <span className="text-slate-400 text-xs">—</span>
                              )}
                            </td>
                          )}
                        </tr>
                      )
                    })
                  )}
                </tbody>
                {!isLoading && movements.length > 0 && ledgerTfoot}
              </table>
            </div>
            {totalFiltered > 0 && (
              <ReportFooter
                totalCount={totalFiltered}
                currentPage={page}
                lastPage={lastPage}
                from={(page - 1) * pageSize + 1}
                to={Math.min(page * pageSize, totalFiltered)}
                onPageChange={setPage}
                lang={lang === 'ar' ? 'ar' : 'en'}
                isRtl={isRtl}
                alwaysShowPaginationBar
                showRecordSummary
                recordLabel={lang === 'ar' ? 'حركة' : 'movement'}
                totalsInBar
              />
            )}
          </>
        )}
      </div>

      {typeof document !== 'undefined' &&
        comboboxOpen &&
        dropdownRect &&
        createPortal(
          <div
            id="item-movement-combobox-portal"
            className="fixed z-[10020] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-2xl overflow-hidden max-h-72 flex flex-col"
            style={{
              top: dropdownRect.top,
              left: dropdownRect.left,
              width: dropdownRect.width,
            }}
          >
            <div className="overflow-y-auto py-1" dir={isRtl ? 'rtl' : 'ltr'}>
              {itemsSearchLoading && (
                <div className="px-3 py-4 text-sm text-slate-500 text-center">{t.loading}</div>
              )}
              {!itemsSearchLoading &&
                searchItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`w-full px-3 py-2.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 ${isRtl ? 'text-right' : 'text-left'}`}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      selectItem(item)
                    }}
                  >
                    <span className="font-medium text-slate-900 dark:text-slate-100">{item.name}</span>
                    {item.code ? (
                      <span className="text-slate-500 text-xs ms-2 font-mono">({item.code})</span>
                    ) : null}
                  </button>
                ))}
              {!itemsSearchLoading && searchItems.length === 0 && (
                <div className="px-3 py-4 text-sm text-slate-500">{t.noData}</div>
              )}
            </div>
          </div>,
          document.body,
        )}

      {previewMovement && selectedItemId && (
        <ItemLedgerDocumentPreviewModal
          movement={previewMovement}
          ledgerItemId={selectedItemId}
          tenantId={tenantId}
          onClose={() => setPreviewMovement(null)}
        />
      )}
    </div>
  )
}
