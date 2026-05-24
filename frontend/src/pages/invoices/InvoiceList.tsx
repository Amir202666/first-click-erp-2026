import { useState, useCallback, useMemo, useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchInvoices, postInvoice, cancelInvoice, unpostInvoice, deleteInvoice, fetchPaymentMethods, fetchSettings, fetchBranches, fetchWarehouses, fetchCostCenters, fetchTenantUsers } from '../../api/tenant'
import type { Invoice, PaginatedResponse, PaymentMethod } from '../../types'
import { coerceDecimalPlaces, formatAmount } from '../../utils/currency'
import { Plus, Send, XCircle, Edit, ChevronRight, FileText, Trash2, MoreVertical, Printer, RotateCcw, Banknote, Eye, FileSpreadsheet, Download, Columns3 } from 'lucide-react'
import Toast, { type ToastType } from '../../components/ui/Toast'
import PageSizeSelect from '../../components/ui/PageSizeSelect'
import ReportFooter from '../../components/ui/ReportFooter'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import AlertDialog from '../../components/ui/AlertDialog'
import SearchableSelect, { type SearchableSelectOption } from '../../components/ui/SearchableSelect'
import InvoiceTableHeaderSearch from '../../components/ui/InvoiceTableHeaderSearch'
import InvoicePartyHeaderSearch from '../../components/ui/InvoicePartyHeaderSearch'
import { formatDisplayDate, getDefaultDateRange, getReportPeriodRange, type ReportPeriodKey } from '../../utils/date'
import { sortUsersForFilter } from '../../utils/tenantUsersForFilter'
import { invoiceDocumentStatus, invoicePaymentStatus } from '../../utils/invoiceStatuses'
import { salesInvoiceSource, type SalesInvoiceSource } from '../../utils/invoiceSalesSource'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { openInvoiceViewForPrint } from '../../utils/openInvoicePrintDialog'
import { useClientSort } from '../../hooks/useClientSort'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'

const documentStatusStyles: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  posted: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-red-100 text-red-700',
}

const paymentStatusStyles: Record<string, string> = {
  na: 'bg-slate-100 text-slate-500',
  unpaid: 'bg-amber-100 text-amber-800',
  partial: 'bg-amber-100 text-amber-800',
  paid: 'bg-emerald-100 text-emerald-700',
  deferred: 'bg-violet-100 text-violet-800',
  overdue: 'bg-orange-100 text-orange-800',
}

type ColumnKey =
  | 'number'
  | 'date'
  | 'source'
  | 'party'
  | 'warehouse'
  | 'total'
  | 'balance'
  | 'document_status'
  | 'payment_status'
  | 'receipt_status'

const allColumnKeys: ColumnKey[] = [
  'number',
  'date',
  'source',
  'party',
  'warehouse',
  'total',
  'balance',
  'document_status',
  'payment_status',
  'receipt_status',
]

/** ترتيب عرض الأعمدة في الجدول (يجب أن يطابق thead / InvoiceRow) */
const invoiceTableColumnOrder: ColumnKey[] = [
  'number',
  'date',
  'source',
  'party',
  'warehouse',
  'total',
  'balance',
  'document_status',
  'payment_status',
  'receipt_status',
]

/** نموذج أعمدة الجدول + أوزان لـ table-layout: fixed (العميل/المورد ~19% عند إظهاره) */
function invoiceListTableColumnModel(
  visibleColumns: Record<ColumnKey, boolean>,
  isPurchasePage: boolean,
): { id: string; weight: number }[] {
  const rows: { id: string; weight: number }[] = []
  const add = (id: ColumnKey, w: number) => {
    if (visibleColumns[id]) rows.push({ id, weight: w })
  }
  add('number', 11)
  add('date', 7)
  add('source', 6)
  add('party', 25)
  add('warehouse', 18)
  add('total', 7)
  add('balance', 7)
  add('document_status', 13)
  add('payment_status', 13)
  if (isPurchasePage && visibleColumns.receipt_status) rows.push({ id: 'receipt_status', weight: 5 })
  rows.push({ id: 'actions', weight: 6 })
  return rows
}

function invoiceListColumnPercents(cols: { id: string; weight: number }[]): number[] {
  const hasParty = cols.some((c) => c.id === 'party')
  if (!hasParty) {
    const sum = cols.reduce((s, c) => s + c.weight, 0)
    return cols.map((c) => (sum ? (c.weight / sum) * 100 : 0))
  }
  const sumW = cols.filter((c) => c.id !== 'party').reduce((s, c) => s + c.weight, 0)
  const rest = 81
  return cols.map((c) => (c.id === 'party' ? 19 : sumW ? (c.weight / sumW) * rest : 0))
}

function defaultVisibleColumns(): Record<ColumnKey, boolean> {
  return allColumnKeys.reduce(
    (acc, key) => ({ ...acc, [key]: true }),
    {} as Record<ColumnKey, boolean>,
  )
}

function mergeStoredVisibleColumns(raw: unknown): Record<ColumnKey, boolean> {
  const base = defaultVisibleColumns()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base
  const o = raw as Record<string, unknown>
  const next = { ...base }
  for (const key of allColumnKeys) {
    if (typeof o[key] === 'boolean') next[key] = o[key] as boolean
  }
  if (!allColumnKeys.some((k) => next[k])) return base
  return next
}

function readVisibleColumnsFromStorage(storageKey: string): Record<ColumnKey, boolean> | null {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return null
    return mergeStoredVisibleColumns(JSON.parse(raw))
  } catch {
    return null
  }
}

function writeVisibleColumnsToStorage(storageKey: string, value: Record<ColumnKey, boolean>) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(value))
  } catch {
    /* تجاهل نفاد المساحة أو وضع التصفح الخاص */
  }
}

export default function InvoiceList() {
  const { currentTenant, user: currentUser } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const navigate = useNavigate()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()
  const { type: urlTypeRaw } = useParams<{ type?: string }>()
  const urlType = (urlTypeRaw ?? '').toLowerCase()
  const invoiceColumnsStorageKey = useMemo(() => {
    if (!tenantId) return null
    const scope =
      urlType === 'sales' ? 'sales' : urlType === 'purchases' ? 'purchases' : 'all'
    return `erp.invoiceList.visibleColumns.v1.${tenantId}.${scope}`
  }, [tenantId, urlType])
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const { data: settings } = useQuery({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const amountDecimals = coerceDecimalPlaces(settings?.doc_amount_decimals, 2)
  const qtyDecimals = coerceDecimalPlaces(settings?.doc_quantity_decimals, 2)
  const fmt = (n: number) => formatAmount(n, { decimal_places: amountDecimals }, locale)
  const fmtQty = (n: number) => Number(n).toLocaleString(locale, { minimumFractionDigits: qtyDecimals, maximumFractionDigits: qtyDecimals })

  const documentStatusLabels: Record<string, string> = {
    draft: t.invoices.documentStatuses.draft,
    posted: t.invoices.documentStatuses.posted,
    cancelled: t.invoices.documentStatuses.cancelled,
  }

  const paymentStatusLabels: Record<string, string> = {
    na: t.invoices.paymentStatuses.na,
    unpaid: t.invoices.paymentStatuses.unpaid,
    partial: t.invoices.paymentStatuses.partial,
    paid: t.invoices.paymentStatuses.paid,
    deferred: t.invoices.paymentStatuses.deferred,
    overdue: t.invoices.paymentStatuses.overdue,
  }

  const defaultRange = getDefaultDateRange()
  const [typeFilter, setTypeFilter] = useState<string>(urlType === 'purchases' ? 'purchase' : urlType === 'sales' ? 'sales' : '')
  const [documentStatusFilter, setDocumentStatusFilter] = useState('')
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('')
  const [dateFrom, setDateFrom] = useState(defaultRange.dateFrom)
  const [dateTo, setDateTo] = useState(defaultRange.dateTo)
  const [periodPreset, setPeriodPreset] = useState<ReportPeriodKey | 'custom'>('all')
  const [numberInput, setNumberInput] = useState('')
  const [partyNameInput, setPartyNameInput] = useState('')
  const [branchIdFilter, setBranchIdFilter] = useState('')
  const [warehouseIdFilter, setWarehouseIdFilter] = useState('')
  const [createdByFilter, setCreatedByFilter] = useState('')
  const [costCenterIdFilter, setCostCenterIdFilter] = useState('')
  const [salesSourceFilter, setSalesSourceFilter] = useState<SalesInvoiceSource | ''>('')
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null)
  const [paymentWarningMessage, setPaymentWarningMessage] = useState<string | null>(null)
  const [unpostTarget, setUnpostTarget] = useState<Invoice | null>(null)
  const [actionsOpenId, setActionsOpenId] = useState<number | null>(null)
  const [actionsAnchor, setActionsAnchor] = useState<{ top: number; left: number; width: number } | null>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [perPage, setPerPage] = useState(25)
  const [page, setPage] = useState(1)
  const [showColumnsMenu, setShowColumnsMenu] = useState(false)
  const columnsMenuRef = useRef<HTMLDivElement | null>(null)
  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnKey, boolean>>(() => defaultVisibleColumns())

  useLayoutEffect(() => {
    if (!invoiceColumnsStorageKey) {
      setVisibleColumns(defaultVisibleColumns())
      return
    }
    const stored = readVisibleColumnsFromStorage(invoiceColumnsStorageKey)
    setVisibleColumns(stored ?? defaultVisibleColumns())
  }, [invoiceColumnsStorageKey])

  const toggleInvoiceColumn = useCallback(
    (key: ColumnKey) => {
      setVisibleColumns((prev) => {
        const next = { ...prev, [key]: !prev[key] }
        if (!allColumnKeys.some((k) => next[k])) return prev
        if (invoiceColumnsStorageKey) writeVisibleColumnsToStorage(invoiceColumnsStorageKey, next)
        return next
      })
    },
    [invoiceColumnsStorageKey],
  )

  const debouncedNumber = useDebouncedValue(numberInput, 350)
  /** فلتر العميل/المورد: 500ms لتفادي طلبات متتالية أثناء الكتابة السريعة */
  const debouncedParty = useDebouncedValue(partyNameInput, 500)

  useEffect(() => {
    if (urlType === 'sales') setTypeFilter('sales')
    else if (urlType === 'purchases') setTypeFilter('purchase')
  }, [urlType])

  useEffect(() => {
    setPage(1)
  }, [debouncedParty, debouncedNumber])

  const closeActionsMenu = useCallback(() => {
    setActionsOpenId(null)
    setActionsAnchor(null)
  }, [])

  const openActionsMenu = useCallback((e: React.MouseEvent, inv: Invoice) => {
    e?.stopPropagation()
    const el = e?.currentTarget as HTMLElement
    if (el) {
      const rect = el.getBoundingClientRect()
      setActionsAnchor({ top: rect.bottom, left: rect.left, width: rect.width })
      setActionsOpenId(inv.id)
    }
  }, [])

  const showToast = useCallback((message: string, type: ToastType) => setToast({ message, type }), [])

  const listKind =
    urlType === 'sales'
      ? 'sales'
      : urlType === 'purchases'
        ? 'purchase'
        : typeFilter === 'sales'
          ? 'sales'
          : typeFilter === 'purchase'
            ? 'purchase'
            : ''

  const params: Record<string, string> = {}
  if (urlType === 'purchases' || urlType === 'sales') {
    params.type = urlType === 'purchases' ? 'purchase' : 'sales'
  } else if (typeFilter) {
    const tf = typeFilter.toLowerCase()
    if (tf === 'sales') params.type = 'sales'
    else if (tf === 'purchase' || tf === 'purchases') params.type = 'purchase'
    else params.type = typeFilter
  }
  if (documentStatusFilter) params.document_status = documentStatusFilter
  if (paymentStatusFilter) params.payment_status = paymentStatusFilter
  if (dateFrom) params.date_from = dateFrom
  if (dateTo) params.date_to = dateTo
  if (debouncedNumber.trim()) params.number = debouncedNumber.trim()
  const partyQ = debouncedParty.trim()
  if (partyQ) {
    if (params.type === 'sales') params.customer_name = partyQ
    else if (params.type === 'purchase') params.vendor_name = partyQ
    else params.party_search = partyQ
  }
  if (branchIdFilter) params.branch_id = branchIdFilter
  if (warehouseIdFilter) params.warehouse_id = warehouseIdFilter
  if (createdByFilter) params.created_by = createdByFilter
  if (costCenterIdFilter) params.cost_center_id = costCenterIdFilter
  if (listKind === 'sales' && salesSourceFilter === 'pos') params.is_pos = '1'
  if (listKind === 'sales' && salesSourceFilter === 'restaurant') params.is_restaurant = '1'
  if (listKind === 'sales' && salesSourceFilter === 'regular') params.sales_source = 'regular'
  params.per_page = String(perPage)
  params.page = String(page)

  const { data, isLoading, isFetching } = useQuery<PaginatedResponse<Invoice>>({
    queryKey: ['invoices', tenantId, urlType, typeFilter, documentStatusFilter, paymentStatusFilter, dateFrom, dateTo, debouncedNumber, debouncedParty, branchIdFilter, warehouseIdFilter, createdByFilter, costCenterIdFilter, salesSourceFilter, perPage, page],
    queryFn: ({ signal }) => fetchInvoices(tenantId, params, signal),
    enabled: !!tenantId,
  })

  const partyFilterDebouncing =
    partyNameInput.trim() !== '' && partyNameInput.trim() !== debouncedParty.trim()
  const partyFilterRefetching =
    partyNameInput.trim() !== '' &&
    partyNameInput.trim() === debouncedParty.trim() &&
    isFetching &&
    !isLoading
  const partyListFetching = partyFilterDebouncing || partyFilterRefetching

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!columnsMenuRef.current) return
      if (!columnsMenuRef.current.contains(e.target as Node)) {
        setShowColumnsMenu(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  useEffect(() => {
    setPage(1)
  }, [
    typeFilter,
    documentStatusFilter,
    paymentStatusFilter,
    dateFrom,
    dateTo,
    debouncedNumber,
    debouncedParty,
    branchIdFilter,
    warehouseIdFilter,
    createdByFilter,
    costCenterIdFilter,
    salesSourceFilter,
    perPage,
  ])

  const postMut = useMutation({
    mutationFn: (id: number) => postInvoice(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      showToast(t.msg.postedSuccess, 'success')
    },
    onError: (err: any) => showToast(err?.response?.data?.message ?? t.msg.errorOccurred, 'error'),
  })

  const cancelMut = useMutation({
    mutationFn: (id: number) => cancelInvoice(tenantId, id),
    onSuccess: () => {
      setUnpostTarget(null)
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      showToast(t.msg.cancelledSuccess, 'success')
    },
    onError: (err: any) => showToast(err?.response?.data?.message ?? t.msg.errorOccurred, 'error'),
  })

  const unpostMut = useMutation({
    mutationFn: (id: number) => unpostInvoice(tenantId, id),
    onSuccess: () => {
      setUnpostTarget(null)
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] })
      showToast(t.invoices?.unpostSuccess ?? (lang === 'ar' ? 'تم إلغاء الترحيل. الفاتورة مسودة ويمكنك تعديلها وترحيلها مجدداً.' : 'Unposted. Invoice is draft; you can edit and post again.'), 'success')
    },
    onError: (err: any) => showToast(err?.response?.data?.message ?? t.msg?.errorOccurred ?? 'Error', 'error'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteInvoice(tenantId, id),
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.setQueriesData(
        { queryKey: ['invoices'] },
        (old: PaginatedResponse<Invoice> | undefined) => {
          if (!old?.data) return old
          return { ...old, data: old.data.filter((inv) => inv.id !== deletedId) }
        }
      )
      setDeleteTarget(null)
      closeActionsMenu()
      showToast(t.msg.deletedSuccess, 'success')
    },
    onError: (err: any) => {
      setDeleteTarget(null)
      const msg = err?.response?.data?.message ?? t.msg.deleteError
      if (typeof msg === 'string' && (msg.includes('أرقام السندات') || msg.includes('سند'))) {
        setPaymentWarningMessage(msg)
      } else {
        showToast(msg, 'error')
      }
    },
  })

  const invoicesRaw = data?.data ?? []
  /** عند اختيار مصدر المبيعات يُفلتر من الـ API (is_pos / is_restaurant / sales_source) */
  const invoices = invoicesRaw

  const { sort: sortInv, toggleSort: toggleSortInv, sortedRows: sortedInvoices } = useClientSort(invoices, [
    { key: 'date', type: 'date', getValue: (inv: Invoice) => inv.date },
    { key: 'source', type: 'string', getValue: (inv: Invoice) => {
      const src = salesInvoiceSource(inv)
      return lang === 'ar'
        ? (src === 'regular' ? 'مبيعات' : src === 'pos' ? 'نقاط بيع (POS)' : 'مطعم')
        : (src === 'regular' ? 'Sales' : src === 'pos' ? 'POS' : 'Restaurant')
    }},
    { key: 'warehouse', type: 'string', getValue: (inv: Invoice) => inv.warehouse?.name ?? '' },
    { key: 'total', type: 'number', getValue: (inv: Invoice) => Number(inv.total ?? 0) },
    { key: 'balance', type: 'number', getValue: (inv: Invoice) => Number(inv.balance ?? 0) },
    { key: 'document_status', type: 'string', getValue: (inv: Invoice) => documentStatusLabels[invoiceDocumentStatus(inv)] ?? invoiceDocumentStatus(inv) },
    { key: 'payment_status', type: 'string', getValue: (inv: Invoice) => paymentStatusLabels[invoicePaymentStatus(inv)] ?? invoicePaymentStatus(inv) },
    { key: 'receipt_status', type: 'string', getValue: (inv: Invoice) => inv.receipt_status ?? '' },
  ], { locale })

  const sortIcon = (key: string) => {
    const active = sortInv?.key === (key as any)
    if (!active) return <ArrowUpDown size={14} />
    return sortInv?.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
  }
  const summaryTotals = useMemo(() => {
    if (invoices.length === 0) return null
    const sumTotal = invoices.reduce((s, inv) => s + Number(inv.total ?? 0), 0)
    const sumBalance = invoices.reduce((s, inv) => s + Number(inv.balance ?? 0), 0)
    return { sumTotal, sumBalance }
  }, [invoices])
  const pageTitle =
    listKind === 'sales'
      ? t.invoices.salesInvoices
      : listKind === 'purchase'
        ? t.invoices.purchaseInvoices
        : t.invoices.title
  const createType = listKind === 'purchase' ? 'purchase' : 'sales'
  const partySuggestMode: 'customers' | 'vendors' | 'both' =
    listKind === 'sales' ? 'customers' : listKind === 'purchase' ? 'vendors' : 'both'

  const { data: paymentMethods = [] } = useQuery({
    queryKey: ['payment-methods', tenantId],
    queryFn: () => fetchPaymentMethods(tenantId),
    enabled: !!tenantId,
  })

  const { data: branches = [] } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId,
  })
  const { data: warehousesResp } = useQuery<{ data: { id: number; name: string; code?: string }[] }>({
    queryKey: ['warehouses', tenantId],
    queryFn: () => fetchWarehouses(tenantId),
    enabled: !!tenantId,
  })
  const warehousesList = warehousesResp?.data ?? []
  const { data: costCenters = [] } = useQuery({
    queryKey: ['cost-centers', tenantId],
    queryFn: () => fetchCostCenters(tenantId),
    enabled: !!tenantId,
  })
  const { data: tenantUsersData } = useQuery({
    queryKey: ['tenant-users', tenantId],
    queryFn: () => fetchTenantUsers(tenantId),
    enabled: !!tenantId,
  })
  const usersFromApi = tenantUsersData?.data ?? []
  const usersList = useMemo(() => {
    let list = usersFromApi as { id: number; name: string; email?: string; pivot?: { role?: string; role_name?: string } }[]
    if (currentUser) {
      const hasCurrent = list.some((u) => u.id === currentUser.id)
      if (!hasCurrent) list = [{ id: currentUser.id, name: currentUser.name, email: currentUser.email }, ...list]
    }
    return sortUsersForFilter(list)
  }, [usersFromApi, currentUser])

  const branchFilterOptions: SearchableSelectOption[] = useMemo(
    () => [
      { value: 0, label: lang === 'ar' ? 'الفرع' : 'Select branch' },
      ...branches.map((b) => ({ value: b.id, label: b.name })),
    ],
    [branches, lang],
  )
  const userFilterOptions: SearchableSelectOption[] = useMemo(
    () => [
      { value: 0, label: (t.invoices as { filterUserAll?: string }).filterUserAll ?? t.invoices.filterUser },
      ...usersList.map((u) => ({ value: u.id, label: u.name })),
    ],
    [usersList, t.invoices],
  )
  const costCenterFilterOptions: SearchableSelectOption[] = useMemo(
    () => [
      { value: 0, label: lang === 'ar' ? 'مركز التكلفة' : 'Select cost center' },
      ...costCenters.map((cc) => ({ value: cc.id, label: cc.name })),
    ],
    [costCenters, lang],
  )

  const textAlign = isRtl ? 'text-right' : 'text-left'

  const isSalesPage = urlType === 'sales'
  const isPurchasePage = urlType === 'purchases'
  const showTypeFilter = !isSalesPage && !isPurchasePage
  const columnKeysForMenu: ColumnKey[] = useMemo(() => {
    return isPurchasePage ? allColumnKeys : allColumnKeys.filter((k) => k !== 'receipt_status')
  }, [isPurchasePage])

  const invoiceTableColModel = useMemo(
    () => invoiceListTableColumnModel(visibleColumns, isPurchasePage),
    [visibleColumns, isPurchasePage],
  )
  const invoiceTableColPercents = useMemo(
    () => invoiceListColumnPercents(invoiceTableColModel),
    [invoiceTableColModel],
  )

  const sourceHeaderOptions: SearchableSelectOption[] = useMemo(() => {
    const allLabel = lang === 'ar' ? 'الكل' : 'All'
    return [
      { value: '', label: allLabel, dotClass: 'bg-slate-400' },
      { value: 'regular', label: lang === 'ar' ? 'مبيعات' : 'Sales', dotClass: 'bg-primary-500' },
      { value: 'pos', label: lang === 'ar' ? 'نقاط بيع (POS)' : 'POS', dotClass: 'bg-emerald-500' },
      { value: 'restaurant', label: lang === 'ar' ? 'مطعم' : 'Restaurant', dotClass: 'bg-violet-500' },
    ]
  }, [lang])

  const filterAllLabel = lang === 'ar' ? 'الكل' : 'All'

  const documentStatusHeaderOptions: SearchableSelectOption[] = useMemo(
    () => [
      { value: '', label: filterAllLabel, dotClass: 'bg-slate-400' },
      { value: 'draft', label: t.invoices.documentStatuses.draft, dotClass: 'bg-slate-500' },
      { value: 'posted', label: t.invoices.documentStatuses.posted, dotClass: 'bg-blue-500' },
      { value: 'cancelled', label: t.invoices.documentStatuses.cancelled, dotClass: 'bg-red-500' },
    ],
    [filterAllLabel, t.invoices],
  )
  const paymentStatusHeaderOptions: SearchableSelectOption[] = useMemo(
    () => [
      { value: '', label: filterAllLabel, dotClass: 'bg-slate-400' },
      { value: 'na', label: t.invoices.paymentStatuses.na, dotClass: 'bg-slate-400' },
      { value: 'unpaid', label: t.invoices.paymentStatuses.unpaid, dotClass: 'bg-amber-500' },
      { value: 'partial', label: t.invoices.paymentStatuses.partial, dotClass: 'bg-amber-500' },
      { value: 'paid', label: t.invoices.paymentStatuses.paid, dotClass: 'bg-emerald-500' },
      { value: 'deferred', label: t.invoices.paymentStatuses.deferred, dotClass: 'bg-violet-500' },
      { value: 'overdue', label: t.invoices.paymentStatuses.overdue, dotClass: 'bg-orange-500' },
    ],
    [filterAllLabel, t.invoices],
  )
  const warehouseHeaderOptions: SearchableSelectOption[] = useMemo(
    () => [
      { value: '', label: filterAllLabel, dotClass: 'bg-slate-400' },
      ...warehousesList.map((w) => ({
        value: String(w.id),
        label: w.code ? `${w.code} - ${w.name}` : w.name,
        dotClass: 'bg-primary-500',
      })),
    ],
    [filterAllLabel, warehousesList],
  )

  const receiptStatusLabels: Record<string, string> = {
    received: t.invoices?.receiptReceived ?? 'مستلمة',
    pending: t.invoices?.receiptPending ?? 'معلقة',
    partial: t.invoices?.receiptPartial ?? 'استلام جزئي',
  }
  /** نفس ارتفاع وحواف SearchableSelect؛ حشوة أوسع بجهة سهم القائمة لتفادي قص النص المعروض */
  const filterNativeClass =
    'w-full min-w-0 max-w-full h-9 border border-slate-300 rounded-lg py-2 text-sm bg-white box-border focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none ' +
    (isRtl ? 'pl-10 pr-3' : 'pl-3 pr-10')
  /** أعمدة متساوية العرض في كل صف */
  const filterGridClass =
    'grid w-full gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))]'
  const filterCellClass = 'min-w-0 w-full'
  /** لا تستخدم flex على <th> — يكسر تخطيط الجدول؛ الـ flex داخل div فقط */
  const thHeaderCell = 'align-top p-3 min-w-0 box-border'
  const thFilterCellInner = 'w-full min-w-0 min-h-0'
  const thFilterActive = 'bg-primary-50/90 transition-[background-color] duration-150'
  const searchClearAria = lang === 'ar' ? 'مسح البحث' : 'Clear search'
  const selectClearAria = lang === 'ar' ? 'مسح التصفية' : 'Clear filter'
  const thHeadText = isRtl ? 'invoice-list-th-heading text-right' : 'invoice-list-th-heading text-left'
  const thHeadNum = isRtl ? 'invoice-list-th-heading text-right tabular-nums' : 'invoice-list-th-heading text-center tabular-nums'
  const totalIdxInTable = invoiceTableColumnOrder.indexOf('total')
  const columnKeysBeforeTotal = invoiceTableColumnOrder.slice(0, totalIdxInTable)
  const summaryLabelColSpan =
    columnKeysBeforeTotal.filter((key) => visibleColumns[key]).length || 1
  const columnKeysAfterBalance = invoiceTableColumnOrder.slice(
    invoiceTableColumnOrder.indexOf('balance') + 1,
  )

  function handlePrint() {
    window.print()
  }

  function exportExcel() {
    const activeKeys = allColumnKeys.filter((key) => visibleColumns[key])
    const headers = activeKeys.map((key) => {
      switch (key) {
        case 'number':
          return t.invoices.invoiceNumber
        case 'date':
          return t.date
        case 'source':
          return lang === 'ar' ? 'النوع' : 'Source'
        case 'party':
          return t.journal.customerOrVendor
        case 'warehouse':
          return t.invoices.warehouse
        case 'total':
          return t.total
        case 'balance':
          return t.invoices.balance
        case 'document_status':
          return t.invoices.documentStatusCol
        case 'payment_status':
          return t.invoices.paymentStatusColFilter
        case 'receipt_status':
          return t.invoices.receiptStatus ?? (lang === 'ar' ? 'حالة الاستلام' : 'Receipt status')
        default:
          return ''
      }
    })
    const rows = invoices.map((inv) =>
      activeKeys.map((key) => {
        switch (key) {
          case 'number':
            return inv.number
          case 'date':
            return inv.date ? formatDisplayDate(inv.date) : ''
          case 'source': {
            const src = salesInvoiceSource(inv)
            return lang === 'ar'
              ? (src === 'regular' ? 'مبيعات' : src === 'pos' ? 'نقاط بيع (POS)' : 'مطعم')
              : (src === 'regular' ? 'Sales' : src === 'pos' ? 'POS' : 'Restaurant')
          }
          case 'party':
            return (inv.type === 'sales' ? inv.customer?.name : inv.vendor?.name) ?? ''
          case 'warehouse':
            return inv.warehouse?.name ?? '—'
          case 'total':
            return fmt(Number(inv.total ?? 0))
          case 'balance':
            return fmt(Number(inv.balance ?? 0))
          case 'document_status':
            return documentStatusLabels[invoiceDocumentStatus(inv)] ?? invoiceDocumentStatus(inv)
          case 'payment_status':
            return paymentStatusLabels[invoicePaymentStatus(inv)] ?? invoicePaymentStatus(inv)
          case 'receipt_status':
            return inv.receipt_status
              ? (receiptStatusLabels[inv.receipt_status] ?? inv.receipt_status)
              : '—'
          default:
            return ''
        }
      }),
    )
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `invoices-${dateFrom}-${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

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

  function applyPeriodPreset(preset: ReportPeriodKey | 'custom') {
    setPeriodPreset(preset)
    if (preset !== 'custom') {
      const range = getReportPeriodRange(preset)
      setDateFrom(range.from_date)
      setDateTo(range.to_date)
    }
    setPage(1)
  }

  function onInvoiceDateFromChange(value: string) {
    setDateFrom(value)
    setPage(1)
  }

  function onInvoiceDateToChange(value: string) {
    setDateTo(value)
    setPage(1)
  }

  const showCustomDateFields = periodPreset === 'custom'
  const labelFrom = lang === 'ar' ? 'من تاريخ' : 'From date'
  const labelTo = lang === 'ar' ? 'إلى تاريخ' : 'To date'
  const labelPeriod = lang === 'ar' ? 'الفترة' : 'Period'

  return (
    <div className="px-0 py-3 space-y-3 w-full min-w-0 max-w-full">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-1.5">
        <h1 className="text-base font-semibold text-slate-900 truncate shrink-0 leading-tight">{pageTitle}</h1>
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
                    onChange={(e) => onInvoiceDateFromChange(e.target.value)}
                    className="border border-slate-300 rounded-lg px-2 h-8 text-sm w-[140px] min-w-[140px] box-border bg-white leading-normal"
                    title={labelFrom}
                  />
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-sm text-slate-600 whitespace-nowrap">{labelTo}</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => onInvoiceDateToChange(e.target.value)}
                    className="border border-slate-300 rounded-lg px-2 h-8 text-sm w-[140px] min-w-[140px] box-border bg-white leading-normal"
                    title={labelTo}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
        <div
          className="relative z-[120] flex flex-wrap items-center gap-1 no-print shrink-0"
          ref={columnsMenuRef}
        >
          <Link
            to={`/invoices/create?type=${createType}`}
            className="inline-flex items-center gap-1.5 bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-2.5 h-8 text-sm font-medium transition-colors shrink-0"
          >
            <Plus size={15} />
            {t.invoices.newInvoice}
          </Link>
          <button
            type="button"
            onClick={() => setShowColumnsMenu((v) => !v)}
            aria-expanded={showColumnsMenu}
            aria-haspopup="true"
            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#D9DCE0] bg-[#F0F2F5] text-[#344054] shadow-sm transition-colors hover:bg-[#E4E7EB] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 no-print ${showColumnsMenu ? 'bg-[#E4E7EB] ring-1 ring-slate-300/80' : ''}`}
            title={lang === 'ar' ? 'تخصيص الأعمدة' : 'Customize columns'}
          >
            <Columns3 size={16} strokeWidth={2} aria-hidden />
          </button>
          {showColumnsMenu && (
            <div
              className="absolute top-full right-0 mt-2 z-[130] w-56 rounded-xl border border-slate-200/95 bg-white py-2 text-sm shadow-xl ring-1 ring-slate-200/80"
              role="menu"
              aria-label={lang === 'ar' ? 'إظهار/إخفاء الأعمدة' : 'Show / hide columns'}
            >
              <div className="px-3 pb-2 text-xs font-semibold text-slate-500">
                {lang === 'ar' ? 'إظهار/إخفاء الأعمدة' : 'Show / hide columns'}
              </div>
              {columnKeysForMenu.map((key) => {
                const label =
                  key === 'number'
                    ? t.invoices.invoiceNumber
                    : key === 'date'
                      ? t.date
                      : key === 'source'
                        ? (lang === 'ar' ? 'النوع' : 'Source')
                        : key === 'party'
                          ? t.journal.customerOrVendor
                          : key === 'warehouse'
                            ? t.invoices.warehouse
                            : key === 'total'
                              ? t.total
                              : key === 'balance'
                                ? t.invoices.balance
                                : key === 'document_status'
                                  ? t.invoices.documentStatusCol
                                  : key === 'payment_status'
                                    ? t.invoices.paymentStatusColFilter
                                    : key === 'receipt_status'
                                      ? (t.invoices.receiptStatus ?? (lang === 'ar' ? 'حالة الاستلام' : 'Receipt status'))
                                    : t.status
                return (
                  <label
                    key={key}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      checked={visibleColumns[key]}
                      onChange={() => toggleInvoiceColumn(key)}
                      className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-slate-700 text-xs">{label}</span>
                  </label>
                )
              })}
            </div>
          )}
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#F0F2F5] border border-[#D9DCE0] text-[#344054] hover:bg-[#E4E7EB] no-print"
            title={t.accounts?.print ?? t.invoices?.viewPrint ?? 'طباعة'}
          >
            <Printer size={15} />
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#344054] text-white hover:bg-[#2d3846] no-print"
            title={t.accounts?.exportPdf ?? 'تصدير PDF'}
          >
            <FileText size={15} />
          </button>
          <button
            type="button"
            onClick={exportExcel}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-500 no-print"
            title={t.accounts?.exportExcel ?? 'تصدير Excel'}
          >
            <FileSpreadsheet size={15} />
          </button>
        </div>
      </div>

      <div className={`bg-white rounded-xl border border-slate-200 p-4 ${filterGridClass}`}>
        {showTypeFilter && (
          <div className={filterCellClass}>
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value)
                setPage(1)
              }}
              className={filterNativeClass}
              style={{ textAlign: isRtl ? 'right' : 'left' }}
            >
              <option value="">{t.type}</option>
              <option value="sales">{t.invoices.sales}</option>
              <option value="purchase">{t.invoices.purchase}</option>
            </select>
          </div>
        )}
        <div className={filterCellClass}>
          <SearchableSelect
            options={branchFilterOptions}
            value={branchIdFilter === '' ? 0 : Number(branchIdFilter) || 0}
            onChange={(v) => {
              setBranchIdFilter(v === 0 || v === null ? '' : String(v))
              setPage(1)
            }}
            placeholder={lang === 'ar' ? 'الفرع' : 'Select branch'}
            textAlign={isRtl ? 'right' : 'left'}
            matchTriggerWidth
            className="w-full min-w-0"
          />
        </div>
        <div className={filterCellClass}>
          <SearchableSelect
            options={costCenterFilterOptions}
            value={costCenterIdFilter === '' ? 0 : Number(costCenterIdFilter) || 0}
            onChange={(v) => {
              setCostCenterIdFilter(v === 0 || v === null ? '' : String(v))
              setPage(1)
            }}
            placeholder={lang === 'ar' ? 'مركز التكلفة' : 'Select cost center'}
            textAlign={isRtl ? 'right' : 'left'}
            wrapOptions
            matchTriggerWidth
            className="w-full min-w-0"
          />
        </div>
        <div className={filterCellClass}>
          <SearchableSelect
            options={userFilterOptions}
            value={createdByFilter === '' ? 0 : Number(createdByFilter) || 0}
            onChange={(v) => {
              setCreatedByFilter(v === 0 || v === null ? '' : String(v))
              setPage(1)
            }}
            placeholder={(t.invoices as { filterUserAll?: string }).filterUserAll ?? t.invoices.filterUser}
            textAlign={isRtl ? 'right' : 'left'}
            wrapOptions
            matchTriggerWidth
            className="w-full min-w-0"
          />
        </div>
        {listKind === 'sales' && (
          <div className={filterCellClass}>
            <SearchableSelect
              options={sourceHeaderOptions}
              value={salesSourceFilter}
              onChange={(v) => {
                const next = v === null || v === undefined ? '' : String(v)
                setSalesSourceFilter((next as SalesInvoiceSource) || '')
                setPage(1)
              }}
              placeholder={lang === 'ar' ? 'النوع' : 'Source'}
              textAlign={isRtl ? 'right' : 'left'}
              wrapOptions
              dropdownMinWidth={180}
              matchTriggerWidth
              className="w-full min-w-0"
              aria-label={lang === 'ar' ? 'فلتر النوع' : 'Source filter'}
            />
          </div>
        )}
        <div className={filterCellClass}>
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
      </div>

      {paymentWarningMessage && (
        <AlertDialog
          title={lang === 'ar' ? 'لا يمكن حذف الفاتورة' : 'Cannot delete invoice'}
          message={paymentWarningMessage}
          confirmLabel={lang === 'ar' ? 'حسناً' : 'OK'}
          variant="warning"
          onClose={() => setPaymentWarningMessage(null)}
        />
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : (
          <>
          <div className="invoice-list-table-wrap w-full min-w-0 max-w-full">
            <table
              className="invoice-list-table-fixed w-full table-fixed border-collapse text-sm"
              dir={isRtl ? 'rtl' : 'ltr'}
            >
              <colgroup>
                {invoiceTableColPercents.map((pct, i) => (
                  <col key={invoiceTableColModel[i].id} style={{ width: `${pct}%` }} />
                ))}
              </colgroup>
              <thead className="invoice-list-thead">
                <tr className="bg-slate-50 text-slate-600">
                  {visibleColumns.number && (
                    <th
                      className={`${thHeaderCell} relative z-[60] ${numberInput.trim() ? thFilterActive : ''}`}
                      scope="col"
                    >
                      <div className="invoice-list-th-row">
                        <div className={`invoice-list-th-filter ${thFilterCellInner}`} dir={isRtl ? 'rtl' : 'ltr'}>
                          <InvoiceTableHeaderSearch
                            value={numberInput}
                            onChange={setNumberInput}
                            placeholder={t.invoices.invoiceNumber}
                            aria-label={t.invoices.invoiceNumber}
                            isRtl={isRtl}
                            title={t.invoices.invoiceNumber}
                            clearAriaLabel={searchClearAria}
                          />
                        </div>
                      </div>
                    </th>
                  )}
                  {visibleColumns.date && (
                    <th className={thHeaderCell} scope="col">
                      <div className="invoice-list-th-row">
                        <button
                          type="button"
                          onClick={() => toggleSortInv('date' as any)}
                          className={`${thHeadText} inline-flex items-center gap-2 hover:underline`}
                        >
                          <span>{t.date}</span>
                          <span className="opacity-60">{sortIcon('date')}</span>
                        </button>
                      </div>
                    </th>
                  )}
                  {visibleColumns.source && (
                    <th className={thHeaderCell} scope="col">
                      <div className="invoice-list-th-row">
                        <button
                          type="button"
                          onClick={() => toggleSortInv('source' as any)}
                          className={`${thHeadText} inline-flex items-center gap-2 hover:underline`}
                        >
                          <span>{lang === 'ar' ? 'النوع' : 'Source'}</span>
                          <span className="opacity-60">{sortIcon('source')}</span>
                        </button>
                      </div>
                    </th>
                  )}
                  {visibleColumns.party && (
                    <th
                      className={`${thHeaderCell} relative z-[60] ${partyNameInput.trim() ? thFilterActive : ''}`}
                      scope="col"
                    >
                      <div className="invoice-list-th-row">
                        <div className={`invoice-list-th-filter ${thFilterCellInner}`} dir={isRtl ? 'rtl' : 'ltr'}>
                          <InvoicePartyHeaderSearch
                            value={partyNameInput}
                            onChange={setPartyNameInput}
                            placeholder={t.journal.customerOrVendor}
                            aria-label={t.journal.customerOrVendor}
                            isRtl={isRtl}
                            title={t.journal.customerOrVendor}
                            clearAriaLabel={searchClearAria}
                            tenantId={tenantId}
                            partyMode={partySuggestMode}
                            listFetching={partyListFetching}
                          />
                        </div>
                      </div>
                    </th>
                  )}
                  {visibleColumns.warehouse && (
                    <th
                      className={`${thHeaderCell} relative z-[60] min-w-[11rem] ${warehouseIdFilter ? thFilterActive : ''}`}
                      scope="col"
                    >
                      <div className="invoice-list-th-row">
                        <div className={`invoice-list-th-filter ${thFilterCellInner}`} dir={isRtl ? 'rtl' : 'ltr'}>
                          <SearchableSelect
                            options={warehouseHeaderOptions}
                            value={warehouseIdFilter}
                            onChange={(v) => {
                              setWarehouseIdFilter(v === null || v === undefined ? '' : String(v))
                              setPage(1)
                            }}
                            placeholder={t.invoices.warehouse}
                            textAlign={isRtl ? 'right' : 'left'}
                            wrapOptions
                            dropdownMinWidth={240}
                            variant="header"
                            tableHeaderControl
                            clearAriaLabel={selectClearAria}
                            className="w-full min-w-0 max-w-full overflow-visible"
                            aria-label={t.invoices.warehouse}
                          />
                        </div>
                      </div>
                    </th>
                  )}
                  {visibleColumns.total && (
                    <th className={thHeaderCell} scope="col">
                      <div className="invoice-list-th-row invoice-list-th-row--center">
                        <button
                          type="button"
                          onClick={() => toggleSortInv('total' as any)}
                          className={`${thHeadNum} inline-flex items-center gap-2 hover:underline`}
                        >
                          <span>{t.total}</span>
                          <span className="opacity-60">{sortIcon('total')}</span>
                        </button>
                      </div>
                    </th>
                  )}
                  {visibleColumns.balance && (
                    <th className={thHeaderCell} scope="col">
                      <div className="invoice-list-th-row invoice-list-th-row--center">
                        <button
                          type="button"
                          onClick={() => toggleSortInv('balance' as any)}
                          className={`${thHeadNum} inline-flex items-center gap-2 hover:underline`}
                        >
                          <span>{t.invoices.balance}</span>
                          <span className="opacity-60">{sortIcon('balance')}</span>
                        </button>
                      </div>
                    </th>
                  )}
                  {visibleColumns.document_status && (
                    <th
                      className={`${thHeaderCell} relative z-[60] min-w-[10rem] ${documentStatusFilter ? thFilterActive : ''}`}
                      scope="col"
                    >
                      <div className="invoice-list-th-row">
                        <div className={`invoice-list-th-filter ${thFilterCellInner}`} dir={isRtl ? 'rtl' : 'ltr'}>
                          <SearchableSelect
                            options={documentStatusHeaderOptions}
                            value={documentStatusFilter}
                            onChange={(v) => {
                              setDocumentStatusFilter(v === null || v === undefined ? '' : String(v))
                              setPage(1)
                            }}
                            placeholder={t.invoices.documentStatusCol}
                            textAlign={isRtl ? 'right' : 'left'}
                            wrapOptions
                            dropdownMinWidth={220}
                            variant="header"
                            statusHeader
                            tableHeaderControl
                            clearAriaLabel={selectClearAria}
                            className="w-full min-w-0 max-w-full overflow-visible"
                            aria-label={t.invoices.documentStatusCol}
                          />
                        </div>
                      </div>
                    </th>
                  )}
                  {visibleColumns.payment_status && (
                    <th
                      className={`${thHeaderCell} relative z-[60] min-w-[10rem] ${paymentStatusFilter ? thFilterActive : ''}`}
                      scope="col"
                    >
                      <div className="invoice-list-th-row">
                        <div className={`invoice-list-th-filter ${thFilterCellInner}`} dir={isRtl ? 'rtl' : 'ltr'}>
                          <SearchableSelect
                            options={paymentStatusHeaderOptions}
                            value={paymentStatusFilter}
                            onChange={(v) => {
                              setPaymentStatusFilter(v === null || v === undefined ? '' : String(v))
                              setPage(1)
                            }}
                            placeholder={t.invoices.paymentStatusColFilter}
                            textAlign={isRtl ? 'right' : 'left'}
                            wrapOptions
                            dropdownMinWidth={220}
                            variant="header"
                            statusHeader
                            tableHeaderControl
                            clearAriaLabel={selectClearAria}
                            className="w-full min-w-0 max-w-full overflow-visible"
                            aria-label={t.invoices.paymentStatusColFilter}
                          />
                        </div>
                      </div>
                    </th>
                  )}
                  {isPurchasePage && visibleColumns.receipt_status && (
                    <th className={thHeaderCell} scope="col">
                      <div className="invoice-list-th-row invoice-list-th-row--center">
                        <button
                          type="button"
                          onClick={() => toggleSortInv('receipt_status' as any)}
                          className={`${thHeadNum} inline-flex items-center gap-2 hover:underline`}
                        >
                          <span>{t.invoices.receiptStatus ?? 'حالة الاستلام'}</span>
                          <span className="opacity-60">{sortIcon('receipt_status')}</span>
                        </button>
                      </div>
                    </th>
                  )}
                  <th className={`${thHeaderCell} relative z-20`} scope="col">
                    <div className="invoice-list-th-row invoice-list-th-row--center">
                      <span className={thHeadNum}>{t.actions}</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {!tenantId ? (
                  <tr><td colSpan={invoiceTableColModel.length} className="text-center py-12 text-amber-600">{t.invoices.selectCompanyFirst ?? 'يرجى اختيار الشركة من أعلى الصفحة لعرض الفواتير.'}</td></tr>
                ) : sortedInvoices.length === 0 ? (
                  <tr><td colSpan={invoiceTableColModel.length} className="text-center py-12 text-slate-400">{t.invoices.noInvoices}</td></tr>
                ) : (
                  sortedInvoices.map((inv) => (
                    <InvoiceRow
                      key={inv.id}
                      inv={inv}
                      isPurchasePage={isPurchasePage}
                      receiptStatusLabels={receiptStatusLabels}
                      onPost={() => postMut.mutate(inv.id)}
                      onCancel={() => cancelMut.mutate(inv.id)}
                      onActionsToggle={(e) => openActionsMenu(e, inv)}
                      isPosting={postMut.isPending}
                      isCancelling={cancelMut.isPending}
                      fmt={fmt}
                      documentStatusLabels={documentStatusLabels}
                      paymentStatusLabels={paymentStatusLabels}
                      textAlign={textAlign}
                      isRtl={isRtl}
                      t={t}
                      lang={lang}
                      listKind={listKind}
                      visibleColumns={visibleColumns}
                    />
                  ))
                )}
              </tbody>
              {summaryTotals && (
                <tfoot>
                  <tr className="bg-gradient-to-r from-slate-100 to-slate-50 border-t-2 border-slate-400 font-bold text-slate-900 shadow-[0_-2px_4px_rgba(0,0,0,0.04)]">
                    <td colSpan={summaryLabelColSpan} className={`${textAlign} p-3 text-sm leading-tight`}>
                      {lang === 'ar' ? 'الإجمالي' : 'Total'}
                    </td>
                    {visibleColumns.total && (
                      <td
                        className={`p-3 text-sm tabular-nums font-semibold leading-tight ${isRtl ? 'text-right' : 'text-center'}`}
                        dir="ltr"
                      >
                        {fmt(summaryTotals.sumTotal)}
                      </td>
                    )}
                    {visibleColumns.balance && (
                      <td
                        className={`p-3 text-sm tabular-nums font-semibold leading-tight ${isRtl ? 'text-right' : 'text-center'}`}
                        dir="ltr"
                      >
                        {fmt(summaryTotals.sumBalance)}
                      </td>
                    )}
                    {columnKeysAfterBalance
                      .filter((key) => visibleColumns[key])
                      .map((key) => (
                        <td key={key} className="p-3" aria-hidden />
                      ))}
                    {isPurchasePage && visibleColumns.receipt_status ? <td className="p-3" /> : null}
                    <td className="p-3" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {data && (
            <ReportFooter
              totalCount={data.total}
              currentPage={data.current_page}
              lastPage={data.last_page}
              from={data.total === 0 ? 0 : (data.current_page - 1) * data.per_page + 1}
              to={data.total === 0 ? 0 : Math.min(data.current_page * data.per_page, data.total)}
              onPageChange={setPage}
              lang={lang}
              isRtl={isRtl}
              alwaysShowPaginationBar
              showRecordSummary={data.total > 0}
              recordLabel={lang === 'ar' ? 'فاتورة' : 'invoice'}
              dense
            />
          )}
          </>
        )}
      </div>

      {/* منطقة الطباعة فقط (نفس تنسيق قيود اليومية): ترويسة + جدول + تذييل */}
      <div id="invoices-list-print" className="report-print-only" dir={isRtl ? 'rtl' : 'ltr'}>
        <div className="report-print-header">
          {!!(settings as Record<string, unknown>)?.company_logo && (
            <div className="mb-3">
              <img src={String((settings as Record<string, unknown>).company_logo)} alt="" className="h-14 object-contain" />
            </div>
          )}
          <h2 className="text-xl font-bold text-slate-900 mb-1">
            {String((settings as Record<string, unknown>)?.company_name ?? currentTenant?.name ?? '—')}
          </h2>
          <h3 className="text-lg font-semibold text-slate-800 mt-4 mb-1">{pageTitle}</h3>
          <p className="text-sm text-slate-600">
            {lang === 'ar' ? 'الفترة' : 'Period'}: {dateFrom} — {dateTo}
          </p>
        </div>
        <div className="report-print-table-wrap">
          <table className="report-print-table w-full text-sm" style={{ tableLayout: 'auto' }}>
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-medium">
                {visibleColumns.number && (
                  <th className={`${textAlign} px-3 py-2 border-b border-slate-200`}>{t.invoices.invoiceNumber}</th>
                )}
                {visibleColumns.date && (
                  <th className={`${textAlign} px-3 py-2 border-b border-slate-200`}>{t.date}</th>
                )}
                {visibleColumns.source && (
                  <th className={`${textAlign} px-3 py-2 border-b border-slate-200`}>{lang === 'ar' ? 'النوع' : 'Source'}</th>
                )}
                {visibleColumns.party && (
                  <th className={`${textAlign} px-3 py-2 border-b border-slate-200`}>{t.journal.customerOrVendor}</th>
                )}
                {visibleColumns.warehouse && (
                  <th className={`${textAlign} px-3 py-2 border-b border-slate-200`}>{t.invoices.warehouse}</th>
                )}
                {visibleColumns.total && (
                  <th className="text-center px-3 py-2 border-b border-slate-200 w-28">{t.total}</th>
                )}
                {visibleColumns.balance && (
                  <th className="text-center px-3 py-2 border-b border-slate-200 w-28">{t.invoices.balance}</th>
                )}
                {visibleColumns.document_status && (
                  <th className={`${textAlign} px-3 py-2 border-b border-slate-200`}>{t.invoices.documentStatusCol}</th>
                )}
                {visibleColumns.payment_status && (
                  <th className={`${textAlign} px-3 py-2 border-b border-slate-200`}>{t.invoices.paymentStatusColFilter}</th>
                )}
                {isPurchasePage && visibleColumns.receipt_status && (
                  <th className={`${textAlign} px-3 py-2 border-b border-slate-200`}>{t.invoices.receiptStatus ?? 'حالة الاستلام'}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {!tenantId ? (
                <tr><td colSpan={allColumnKeys.filter((k) => visibleColumns[k]).length} className="text-center py-6 text-amber-600">{t.invoices.selectCompanyFirst ?? 'يرجى اختيار الشركة من أعلى الصفحة.'}</td></tr>
              ) : invoices.length === 0 ? (
                <tr><td colSpan={allColumnKeys.filter((k) => visibleColumns[k]).length} className="text-center py-6 text-slate-500">{t.invoices.noInvoices}</td></tr>
              ) : (
                invoices.map((inv) => {
                  const receiptLabel = inv.receipt_status ? (receiptStatusLabels[inv.receipt_status] ?? inv.receipt_status) : '—'
                  return (
                    <tr key={inv.id} className="border-b border-slate-100">
                      {visibleColumns.number && (
                        <td className={`px-3 py-2 font-mono text-slate-800`}>{inv.number}</td>
                      )}
                      {visibleColumns.date && (
                        <td className={`px-3 py-2 text-slate-700`}>{inv.date ? formatDisplayDate(inv.date) : '—'}</td>
                      )}
                      {visibleColumns.source && (
                        <td className={`px-3 py-2 text-slate-700`}>
                          {inv.type === 'purchase'
                            ? t.invoices.purchase
                            : (() => {
                              const src = salesInvoiceSource(inv)
                              return lang === 'ar'
                                ? (src === 'regular' ? 'مبيعات' : src === 'pos' ? 'نقاط بيع (POS)' : 'مطعم')
                                : (src === 'regular' ? 'Sales' : src === 'pos' ? 'POS' : 'Restaurant')
                            })()}
                        </td>
                      )}
                      {visibleColumns.party && (
                        <td className={`px-3 py-2 text-slate-700`}>{(inv.type === 'sales' ? inv.customer?.name : inv.vendor?.name) ?? '—'}</td>
                      )}
                      {visibleColumns.warehouse && (
                        <td className={`px-3 py-2 text-slate-700`}>{inv.warehouse?.name ?? '—'}</td>
                      )}
                      {visibleColumns.total && (
                        <td className="text-center px-3 py-2 font-medium tabular-nums">{fmt(Number(inv.total ?? 0))}</td>
                      )}
                      {visibleColumns.balance && (
                        <td className="text-center px-3 py-2 font-medium tabular-nums">{fmt(Number(inv.balance ?? 0))}</td>
                      )}
                      {visibleColumns.document_status && (
                        <td className={`px-3 py-2 text-slate-700`}>
                          {documentStatusLabels[invoiceDocumentStatus(inv)] ?? invoiceDocumentStatus(inv)}
                        </td>
                      )}
                      {visibleColumns.payment_status && (
                        <td className={`px-3 py-2 text-slate-700`}>
                          {paymentStatusLabels[invoicePaymentStatus(inv)] ?? invoicePaymentStatus(inv)}
                        </td>
                      )}
                      {isPurchasePage && visibleColumns.receipt_status ? (
                        <td className={`px-3 py-2 text-slate-700 ${textAlign}`}>{receiptLabel}</td>
                      ) : null}
                    </tr>
                  )
                })
              )}
            </tbody>
            {summaryTotals && (
              <tfoot>
                <tr className="bg-slate-100 font-bold border-t-2 border-slate-400">
                  <td colSpan={summaryLabelColSpan} className={`px-3 py-2 ${textAlign}`}>
                    {lang === 'ar' ? 'الإجمالي' : 'Total'}
                  </td>
                  {visibleColumns.total && (
                    <td className="text-center px-3 py-2 tabular-nums">{fmt(summaryTotals.sumTotal)}</td>
                  )}
                  {visibleColumns.balance && (
                    <td className="text-center px-3 py-2 tabular-nums">{fmt(summaryTotals.sumBalance)}</td>
                  )}
                  {columnKeysAfterBalance
                    .filter((key) => visibleColumns[key])
                    .map((key) => (
                      <td key={`print-${key}`} className="px-3 py-2" aria-hidden />
                    ))}
                  {isPurchasePage && visibleColumns.receipt_status ? <td className="px-3 py-2" /> : null}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <div className="report-print-footer">
          <span>{lang === 'ar' ? 'تاريخ الطباعة' : 'Print Date'}: {new Date().toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' })}</span>
          <span>{lang === 'ar' ? 'صفحة' : 'Page'} <span className="report-page-num"></span></span>
        </div>
      </div>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #invoices-list-print, #invoices-list-print * { visibility: visible; }
        }
        @media screen {
          #invoices-list-print { display: none !important; }
        }
      `}</style>

      {actionsOpenId != null && actionsAnchor && (() => {
        const openInv = invoices.find((i) => i.id === actionsOpenId)
        if (!openInv) return null
        const openDocSt = invoiceDocumentStatus(openInv)
        const openCanPost = openDocSt === 'draft'
        const openCanCancel = openDocSt !== 'cancelled' && (Number(openInv.amount_paid) || 0) === 0
        const menuContent = (
          <>
            <div className="fixed inset-0 z-[100]" aria-hidden onClick={closeActionsMenu} />
            <div
              className="fixed z-[101] min-w-[180px] bg-white border border-slate-200 rounded-lg shadow-lg py-1"
              style={{
                top: actionsAnchor.top + 4,
                left: actionsAnchor.left,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  closeActionsMenu()
                  openInvoiceViewForPrint(openInv.id)
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 ${isRtl ? 'text-right' : 'text-left'}`}
              >
                <Eye size={14} />
                {t.invoices.viewPrint}
              </button>
              <Link to={`/invoices/create?type=${openInv.type}&id=${openInv.id}`} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={closeActionsMenu}>
                <Edit size={14} />
                {t.edit}
              </Link>
              {openCanPost && (
                <button
                  type="button"
                  onClick={() => { postMut.mutate(openInv.id); closeActionsMenu() }}
                  disabled={postMut.isPending}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-right text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                >
                  <Send size={14} />
                  {t.invoices.post}
                </button>
              )}
              {openCanCancel && (
                <button
                  type="button"
                  onClick={() => { cancelMut.mutate(openInv.id); closeActionsMenu() }}
                  disabled={cancelMut.isPending}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-right text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  <XCircle size={14} />
                  {t.invoices.cancelInvoice}
                </button>
              )}
              <button type="button" onClick={() => { setUnpostTarget(openInv); closeActionsMenu() }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-right text-amber-700 hover:bg-amber-50">
                <XCircle size={14} />
                {t.invoices.unpostInvoice}
              </button>
              <div className="border-t border-slate-100 my-1" />
              <button type="button" onClick={() => { setDeleteTarget(openInv); closeActionsMenu() }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-right text-red-600 hover:bg-red-50">
                <Trash2 size={14} />
                {t.invoices.deleteInvoice}
              </button>
              <div className="border-t border-slate-100 my-1" />
              <Link to={`/invoices/return/${openInv.id}`} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={closeActionsMenu}>
                <RotateCcw size={14} />
                {t.invoices.returnInvoice}
              </Link>
              <button
                type="button"
                onClick={() => {
                  closeActionsMenu()
                  navigate(openInv.type === 'sales'
                    ? `/payments/create-voucher?voucher_type=receipt&invoice_id=${openInv.id}`
                    : `/payments/create-voucher?voucher_type=payment&invoice_id=${openInv.id}`)
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 text-right"
              >
                <Banknote size={14} />
                {t.invoices.addPayment}
              </button>
            </div>
          </>
        )
        return createPortal(menuContent, document.body)
      })()}

      {deleteTarget && (
        <ConfirmDialog
          title={t.invoices.deleteInvoice}
          message={t.invoices.confirmDeleteInvoice.replace('{number}', deleteTarget.number)}
          confirmLabel={t.delete}
          variant="danger"
          isLoading={deleteMut.isPending}
          onConfirm={() => deleteMut.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {unpostTarget && (
        <ConfirmDialog
          title={t.invoices.unpostInvoice}
          message={t.invoices.confirmUnpostInvoice.replace('{number}', unpostTarget.number)}
          confirmLabel={t.journal?.unpost ?? t.invoices.unpostInvoice}
          variant="danger"
          isLoading={unpostMut.isPending}
          onConfirm={() => unpostMut.mutate(unpostTarget.id)}
          onCancel={() => setUnpostTarget(null)}
        />
      )}

    </div>
  )
}

function InvoiceRow({
  inv,
  isPurchasePage = false,
  receiptStatusLabels = {},
  onPost,
  onCancel,
  onActionsToggle,
  isPosting,
  isCancelling,
  fmt,
  documentStatusLabels,
  paymentStatusLabels,
  textAlign,
  isRtl = false,
  t,
  lang,
  listKind,
  visibleColumns,
}: {
  inv: Invoice
  isPurchasePage?: boolean
  receiptStatusLabels?: Record<string, string>
  onPost: () => void
  onCancel: () => void
  onActionsToggle: (e: React.MouseEvent) => void
  isPosting: boolean
  isCancelling: boolean
  fmt: (n: number) => string
  documentStatusLabels: Record<string, string>
  paymentStatusLabels: Record<string, string>
  textAlign: string
  isRtl?: boolean
  t: any
  lang: 'ar' | 'en'
  listKind: string
  visibleColumns: Record<ColumnKey, boolean>
}) {
  const docSt = invoiceDocumentStatus(inv)
  const paySt = invoicePaymentStatus(inv)
  const canPost = docSt === 'draft'
  const canCancel = docSt !== 'cancelled' && (Number(inv.amount_paid) || 0) === 0
  return (
    <tr className="hover:bg-slate-50/50">
        {visibleColumns.number && (
        <td className={`${textAlign} p-3 font-mono text-slate-700`}>
          {inv.id != null && Number.isFinite(Number(inv.id)) ? (
            <Link
              to={(() => {
                if (listKind === 'sales' && inv.type === 'sales') {
                  const src = salesInvoiceSource(inv)
                  if (src === 'pos') return `/invoices/pos-list?number=${encodeURIComponent(inv.number)}`
                  if (src === 'restaurant') return `/restaurant/sales?number=${encodeURIComponent(inv.number)}`
                }
                return `/invoices/view/${inv.id}`
              })()}
              className="inline-flex items-center gap-1 text-emerald-600 font-medium hover:text-emerald-700 hover:underline transition-colors duration-150"
              title={listKind === 'sales' && inv.type === 'sales'
                ? (salesInvoiceSource(inv) === 'pos'
                  ? (lang === 'ar' ? 'فتح في قائمة فواتير POS' : 'Open in POS invoices list')
                  : salesInvoiceSource(inv) === 'restaurant'
                    ? (lang === 'ar' ? 'فتح في قائمة مبيعات المطعم' : 'Open in restaurant sales list')
                    : undefined)
                : undefined}
            >
              {inv.number}
              <ChevronRight size={14} className={isRtl ? 'rotate-180' : ''} />
            </Link>
          ) : (
            <span className="text-slate-600">{inv.number}</span>
          )}
        </td>
        )}
        {visibleColumns.date && (
        <td className={`${textAlign} p-3 text-slate-600`}>{formatDisplayDate(inv.date)}</td>
        )}
        {visibleColumns.source && (
        <td className={`${textAlign} p-3`}>
          {inv.type === 'purchase' ? (
            <span className="invoice-cell-pill items-center bg-blue-100 text-blue-700">
              {t.invoices.purchase}
            </span>
          ) : listKind === 'sales' ? (
            (() => {
              const src = salesInvoiceSource(inv)
              const label = src === 'regular'
                ? (lang === 'ar' ? 'مبيعات' : 'Sales')
                : src === 'pos'
                  ? (lang === 'ar' ? 'نقاط بيع (POS)' : 'POS')
                  : (lang === 'ar' ? 'مطعم' : 'Restaurant')
              const cls = src === 'regular'
                ? 'bg-primary-100 text-primary-700'
                : src === 'pos'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-violet-100 text-violet-800'
              return (
                <span className={`invoice-cell-pill items-center ${cls}`}>
                  {label}
                </span>
              )
            })()
          ) : (
            <span className="invoice-cell-pill items-center bg-emerald-100 text-emerald-700">
              {t.invoices.sales}
            </span>
          )}
        </td>
        )}
        {visibleColumns.party && (
        <td className={`${textAlign} p-3 text-slate-800`}>
          {inv.type === 'sales' ? inv.customer?.name : inv.vendor?.name ?? '—'}
        </td>
        )}
        {visibleColumns.warehouse && (
        <td className={`${textAlign} p-3 text-slate-600`}>{inv.warehouse?.name ?? '—'}</td>
        )}
        {visibleColumns.total && (
        <td className={`p-3 tabular-nums text-slate-800 ${isRtl ? 'text-right' : 'text-center'}`} dir="ltr">
          {fmt(inv.total)}
        </td>
        )}
        {visibleColumns.balance && (
        <td className={`p-3 tabular-nums text-slate-800 ${isRtl ? 'text-right' : 'text-center'}`} dir="ltr">
          {fmt(inv.balance)}
        </td>
        )}
        {visibleColumns.document_status && (
        <td className={`p-3 min-w-0 ${isRtl ? 'text-right' : 'text-center'}`}>
          <span
            className={`invoice-cell-pill ${documentStatusStyles[docSt] ?? 'bg-slate-100 text-slate-600'}`}
          >
            {documentStatusLabels[docSt] ?? docSt}
          </span>
        </td>
        )}
        {visibleColumns.payment_status && (
        <td className={`p-3 min-w-0 ${isRtl ? 'text-right' : 'text-center'}`}>
          <span
            className={`invoice-cell-pill ${paymentStatusStyles[paySt] ?? 'bg-slate-100 text-slate-600'}`}
          >
            {paymentStatusLabels[paySt] ?? paySt}
          </span>
        </td>
        )}
        {isPurchasePage && visibleColumns.receipt_status && (
          <td className={`p-3 text-slate-700 ${isRtl ? 'text-right' : 'text-center'}`}>
            {inv.receipt_status ? (
              <span className="invoice-cell-pill bg-slate-50 text-slate-700">
                {receiptStatusLabels[inv.receipt_status] ?? inv.receipt_status}
              </span>
            ) : (
              <span className="text-slate-400">—</span>
            )}
          </td>
        )}
        <td className={`${textAlign} p-3 align-top box-border`}>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onActionsToggle}
              className="p-1.5 rounded text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              title={t.invoices.actionsMenu}
            >
              <MoreVertical size={16} />
            </button>
          </div>
        </td>
      </tr>
  )
}
