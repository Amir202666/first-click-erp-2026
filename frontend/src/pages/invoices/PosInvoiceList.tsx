import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchInvoices,
  postInvoice,
  cancelInvoice,
  deleteInvoice,
  fetchInvoice,
  fetchPaymentMethods,
  fetchSettings,
  fetchBranches,
  fetchCostCenters,
  fetchTenantUsers,
} from '../../api/tenant'
import type { CostCenter, Invoice, PaginatedResponse, PaymentMethod } from '../../types'
import { coerceDecimalPlaces, formatAmount } from '../../utils/currency'
import { sortUsersForFilter } from '../../utils/tenantUsersForFilter'
import {
  Plus,
  Send,
  XCircle,
  Edit,
  ChevronDown,
  ChevronLeft,
  FileText,
  Trash2,
  MoreVertical,
  Printer,
  RotateCcw,
  Banknote,
  Eye,
  ShoppingCart,
  FileSpreadsheet,
  Columns3,
  MessageCircle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'
import Toast, { type ToastType } from '../../components/ui/Toast'
import {
  openInvoiceViewForPrint,
  posPrintOptionsFromSettings,
  type OpenInvoicePrintOptions,
} from '../../utils/openInvoicePrintDialog'
import PageSizeSelect from '../../components/ui/PageSizeSelect'
import ReportFooter from '../../components/ui/ReportFooter'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import AlertDialog from '../../components/ui/AlertDialog'
import SearchableSelect, { type SearchableSelectOption } from '../../components/ui/SearchableSelect'
import InvoiceTableHeaderSearch from '../../components/ui/InvoiceTableHeaderSearch'
import InvoicePartyHeaderSearch from '../../components/ui/InvoicePartyHeaderSearch'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { getDefaultDateRange, formatDisplayDate, getReportPeriodRange, type ReportPeriodKey } from '../../utils/date'
import { openWhatsApp, messageTemplateInvoice } from '../../utils/whatsapp'
import { invoiceDocumentStatus, invoicePaymentStatus } from '../../utils/invoiceStatuses'
import { useClientSort, type SortColumn } from '../../hooks/useClientSort'

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

/** الـ API يعيد العلاقة بمفتاح `payment_method` (snake_case) */
function invoicePaymentMethodName(inv: Invoice): string | undefined {
  const pm = inv.paymentMethod ?? inv.payment_method
  if (!pm) return undefined
  const n = pm.name?.trim()
  if (n) return n
  const en = pm.name_en?.trim()
  if (en) return en
  return undefined
}

type ColumnKey =
  | 'number'
  | 'date'
  | 'customer'
  | 'branch'
  | 'user'
  | 'paymentMethod'
  | 'total'
  | 'balance'
  | 'document_status'
  | 'payment_status'

const allColumnKeys: ColumnKey[] = [
  'number',
  'date',
  'customer',
  'branch',
  'user',
  'paymentMethod',
  'total',
  'balance',
  'document_status',
  'payment_status',
]

function posInvoiceTableColumnModel(visible: Record<ColumnKey, boolean>): { id: string; weight: number }[] {
  const rows: { id: string; weight: number }[] = [{ id: '_expand', weight: 4 }]
  const add = (id: ColumnKey, w: number) => {
    if (visible[id]) rows.push({ id, weight: w })
  }
  add('number', 11)
  add('date', 7)
  add('customer', 25)
  add('branch', 8)
  add('user', 8)
  add('paymentMethod', 13)
  add('total', 6)
  add('balance', 6)
  add('document_status', 12)
  add('payment_status', 12)
  rows.push({ id: 'actions', weight: 5 })
  return rows
}

function posInvoiceColumnPercents(cols: { id: string; weight: number }[]): number[] {
  const hasCustomer = cols.some((c) => c.id === 'customer')
  if (!hasCustomer) {
    const sum = cols.reduce((s, c) => s + c.weight, 0)
    return cols.map((c) => (sum ? (c.weight / sum) * 100 : 0))
  }
  const sumW = cols.filter((c) => c.id !== 'customer').reduce((s, c) => s + c.weight, 0)
  const rest = 81
  return cols.map((c) => (c.id === 'customer' ? 19 : sumW ? (c.weight / sumW) * rest : 0))
}

export default function PosInvoiceList() {
  const { currentTenant, user: currentUser } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const { data: settings } = useQuery({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const amountDecimals = coerceDecimalPlaces(settings?.doc_amount_decimals, 2)
  const qtyDecimals = coerceDecimalPlaces(settings?.doc_quantity_decimals, 2)
  const fmt = (n: number) => formatAmount(n, { decimal_places: amountDecimals }, locale)
  const fmtQty = (n: number) =>
    Number(n).toLocaleString(locale, {
      minimumFractionDigits: qtyDecimals,
      maximumFractionDigits: qtyDecimals,
    })

  const posPrintOpts = useMemo(
    () => posPrintOptionsFromSettings(settings as Record<string, unknown> | undefined),
    [settings],
  )

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
  const [searchParams] = useSearchParams()
  const initialNumberFilter = searchParams.get('number') ?? ''
  const [dateFrom, setDateFrom] = useState(defaultRange.dateFrom)
  const [dateTo, setDateTo] = useState(defaultRange.dateTo)
  const [periodPreset, setPeriodPreset] = useState<ReportPeriodKey | 'custom'>('all')
  const [branchId, setBranchId] = useState('')
  const [costCenterId, setCostCenterId] = useState('')
  const [createdBy, setCreatedBy] = useState('')
  const [paymentMethodId, setPaymentMethodId] = useState('')
  const [partyNameInput, setPartyNameInput] = useState('')
  const [numberFilter, setNumberFilter] = useState(initialNumberFilter)
  const [documentStatusFilter, setDocumentStatusFilter] = useState('')
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null)
  const [paymentWarningMessage, setPaymentWarningMessage] = useState<string | null>(null)
  const [actionsOpenId, setActionsOpenId] = useState<number | null>(null)
  const navigate = useNavigate()
  const [actionsAnchor, setActionsAnchor] = useState<{ top: number; inlineStart: number } | null>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [showColumnsMenu, setShowColumnsMenu] = useState(false)
  const columnsMenuRef = useRef<HTMLDivElement | null>(null)
  const [perPage, setPerPage] = useState(25)
  const [page, setPage] = useState(1)
  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnKey, boolean>>(
    () =>
      allColumnKeys.reduce(
        (acc, key) => ({ ...acc, [key]: true }),
        {} as Record<ColumnKey, boolean>,
      ),
  )

  const posTableColModel = useMemo(() => posInvoiceTableColumnModel(visibleColumns), [visibleColumns])
  const posTableColPercents = useMemo(() => posInvoiceColumnPercents(posTableColModel), [posTableColModel])

  const closeActionsMenu = useCallback(() => {
    setActionsOpenId(null)
    setActionsAnchor(null)
  }, [])

  const openActionsMenu = useCallback((e: React.MouseEvent, inv: Invoice) => {
    e?.stopPropagation()
    const el = e?.currentTarget as HTMLElement
    if (el) {
      const rect = el.getBoundingClientRect()
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1024
      const pad = 8
      const menuW = 220
      // insetInlineStart: left في LTR و right في RTL
      const rawInlineStart = isRtl ? Math.max(pad, vw - rect.right) : Math.max(pad, rect.left)
      // إبقاء القائمة داخل الشاشة تقريباً
      const inlineStart = isRtl ? Math.min(rawInlineStart, vw - pad - menuW) : Math.min(rawInlineStart, vw - pad - menuW)
      setActionsAnchor({ top: rect.bottom, inlineStart })
      setActionsOpenId(inv.id)
    }
  }, [isRtl])

  const showToast = useCallback((message: string, type: ToastType) => setToast({ message, type }), [])

  const debouncedNumber = useDebouncedValue(numberFilter, 350)
  const debouncedParty = useDebouncedValue(partyNameInput, 500)

  const params: Record<string, string> = {
    type: 'sales',
    is_pos: '1',
  }
  if (dateFrom) params.date_from = dateFrom
  if (dateTo) params.date_to = dateTo
  if (branchId) params.branch_id = branchId
  if (costCenterId) params.cost_center_id = costCenterId
  if (createdBy) params.created_by = createdBy
  if (paymentMethodId) params.payment_method_id = paymentMethodId
  if (debouncedNumber.trim()) params.number = debouncedNumber.trim()
  const partyQ = debouncedParty.trim()
  if (partyQ) params.customer_name = partyQ
  if (documentStatusFilter) params.document_status = documentStatusFilter
  if (paymentStatusFilter) params.payment_status = paymentStatusFilter
  params.per_page = String(perPage)
  params.page = String(page)

  const { data, isLoading, isFetching } = useQuery<PaginatedResponse<Invoice>>({
    queryKey: [
      'invoices',
      'pos',
      tenantId,
      dateFrom,
      dateTo,
      branchId,
      costCenterId,
      createdBy,
      paymentMethodId,
      documentStatusFilter,
      paymentStatusFilter,
      debouncedNumber,
      debouncedParty,
      perPage,
      page,
    ],
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

  const { data: branchesList } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId,
  })
  const branches = Array.isArray(branchesList) ? branchesList : []

  const { data: costCentersList } = useQuery({
    queryKey: ['cost-centers', tenantId],
    queryFn: () => fetchCostCenters(tenantId),
    enabled: !!tenantId,
  })
  const costCenters: CostCenter[] = Array.isArray(costCentersList) ? (costCentersList as CostCenter[]) : []

  const { data: usersData } = useQuery({
    queryKey: ['tenant-users', tenantId],
    queryFn: () => fetchTenantUsers(tenantId),
    enabled: !!tenantId,
  })
  const users = useMemo(() => {
    let list = (usersData?.data ?? []) as { id: number; name: string; email?: string; pivot?: { role?: string; role_name?: string } }[]
    if (currentUser) {
      const hasCurrent = list.some((u) => u.id === currentUser.id)
      if (!hasCurrent) list = [{ id: currentUser.id, name: currentUser.name, email: currentUser.email }, ...list]
    }
    return sortUsersForFilter(list)
  }, [usersData?.data, currentUser])

  const { data: paymentMethods = [] } = useQuery<PaymentMethod[]>({
    queryKey: ['payment-methods', tenantId],
    queryFn: () => fetchPaymentMethods(tenantId),
    enabled: !!tenantId,
  })

  const filterAllLabel = lang === 'ar' ? 'الكل' : 'All'
  /** صف فلاتر: flex يضمن gap ثابت ويقلّل التداخل مع RTL مقارنةً بـ auto-fit + justify-self */
  const filterRowClass = 'flex flex-wrap items-center gap-x-2 gap-y-2 w-full'
  const filterCellClass = 'min-w-0 w-full overflow-hidden'

  const branchFilterOptions: SearchableSelectOption[] = useMemo(
    () => [
      { value: 0, label: lang === 'ar' ? 'الفرع' : 'Select branch' },
      ...branches.map((b) => ({ value: b.id, label: b.name })),
    ],
    [branches, lang],
  )
  const costCenterFilterOptions: SearchableSelectOption[] = useMemo(
    () => [
      { value: 0, label: lang === 'ar' ? 'مركز التكلفة' : 'Cost center' },
      ...costCenters.map((c) => ({ value: c.id, label: c.name })),
    ],
    [costCenters, lang],
  )
  const userFilterOptions: SearchableSelectOption[] = useMemo(
    () => [
      { value: 0, label: (t.invoices as { filterUserAll?: string }).filterUserAll ?? t.invoices.filterUser },
      ...users.map((u) => ({ value: u.id, label: u.name })),
    ],
    [users, t.invoices],
  )
  const paymentMethodHeaderOptions: SearchableSelectOption[] = useMemo(
    () => [
      { value: '', label: filterAllLabel, dotClass: 'bg-slate-400' },
      ...paymentMethods.map((pm) => ({
        value: pm.id,
        label: pm.name,
        dotClass:
          pm.type === 'cash'
            ? 'bg-emerald-500'
            : pm.type === 'bank'
              ? 'bg-blue-500'
              : pm.type === 'credit'
                ? 'bg-amber-500'
                : 'bg-slate-500',
      })),
    ],
    [filterAllLabel, paymentMethods],
  )
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

  const postMut = useMutation({
    mutationFn: (id: number) => postInvoice(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      showToast(t.msg.postedSuccess, 'success')
    },
    onError: (err: unknown) => showToast((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? t.msg.errorOccurred, 'error'),
  })

  const cancelMut = useMutation({
    mutationFn: (id: number) => cancelInvoice(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      showToast(t.msg.cancelledSuccess, 'success')
    },
    onError: (err: unknown) => showToast((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? t.msg.errorOccurred, 'error'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteInvoice(tenantId, id),
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['invoices', 'pos'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.setQueriesData(
        { queryKey: ['invoices', 'pos'] },
        (old: PaginatedResponse<Invoice> | undefined) => {
          if (!old?.data) return old
          return { ...old, data: old.data.filter((inv) => inv.id !== deletedId) }
        }
      )
      setDeleteTarget(null)
      closeActionsMenu()
      showToast(t.msg.deletedSuccess, 'success')
    },
    onError: (err: unknown) => {
      setDeleteTarget(null)
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? t.msg.deleteError
      if (typeof msg === 'string' && (msg.includes('أرقام السندات') || msg.includes('سند'))) {
        setPaymentWarningMessage(msg)
      } else {
        showToast(msg, 'error')
      }
    },
  })

  const invoices = data?.data ?? []

  const summaryTotals = useMemo(() => {
    if (invoices.length === 0) return null
    const sumTotal = invoices.reduce((s, inv) => s + Number(inv.total ?? 0), 0)
    const sumBalance = invoices.reduce((s, inv) => s + Number(inv.balance ?? 0), 0)
    return { sumTotal, sumBalance }
  }, [invoices])

  const totalIdxPos = allColumnKeys.indexOf('total')
  const summaryLabelColSpan =
    1 + allColumnKeys.slice(0, totalIdxPos).filter((key) => visibleColumns[key]).length
  const columnKeysAfterBalance = allColumnKeys.slice(allColumnKeys.indexOf('balance') + 1)

  const posInvoiceSortColumns = useMemo((): SortColumn<Invoice, ColumnKey>[] => {
    return [
      { key: 'number', type: 'string', getValue: (inv) => inv.number ?? '' },
      { key: 'date', type: 'date', getValue: (inv) => inv.date ?? '' },
      { key: 'customer', type: 'string', getValue: (inv) => inv.customer?.name ?? '' },
      { key: 'branch', type: 'string', getValue: (inv) => inv.branch?.name ?? '' },
      { key: 'user', type: 'string', getValue: (inv) => (inv as Invoice & { createdBy?: { name: string } }).createdBy?.name ?? '' },
      { key: 'paymentMethod', type: 'string', getValue: (inv) => invoicePaymentMethodName(inv) ?? '' },
      { key: 'total', type: 'number', getValue: (inv) => Number(inv.total ?? 0) },
      { key: 'balance', type: 'number', getValue: (inv) => Number(inv.balance ?? 0) },
      { key: 'document_status', type: 'string', getValue: (inv) => invoiceDocumentStatus(inv) },
      { key: 'payment_status', type: 'string', getValue: (inv) => invoicePaymentStatus(inv) },
    ]
  }, [])

  const { sort: posSort, toggleSort: togglePosSort, sortedRows: sortedPosInvoices } = useClientSort(invoices, posInvoiceSortColumns, {
    locale,
  })

  const posSortIcon = (key: ColumnKey) => {
    const active = posSort?.key === key
    if (!active) return <ArrowUpDown size={14} className="shrink-0" />
    return posSort?.direction === 'asc' ? <ArrowUp size={14} className="shrink-0" /> : <ArrowDown size={14} className="shrink-0" />
  }

  useEffect(() => {
    const next = searchParams.get('number') ?? ''
    setNumberFilter((prev) => (prev === next ? prev : next))
  }, [searchParams])

  useEffect(() => {
    setPage(1)
  }, [
    dateFrom,
    dateTo,
    branchId,
    costCenterId,
    createdBy,
    paymentMethodId,
    documentStatusFilter,
    paymentStatusFilter,
    debouncedNumber,
    debouncedParty,
    perPage,
  ])

  async function toggleDetail(inv: Invoice) {
    if (expandedId === inv.id) {
      setExpandedId(null)
      setDetailInvoice(null)
      return
    }
    setExpandedId(inv.id)
    try {
      const detail = await fetchInvoice(tenantId, inv.id)
      setDetailInvoice(detail)
    } catch {
      setDetailInvoice(null)
    }
  }

  const textAlign = isRtl ? 'text-right' : 'text-left'
  const thHeaderCellBase = 'align-top min-w-0 box-border'
  const thHeaderCellExpand = `${thHeaderCellBase} px-2 py-3 w-10 min-w-[2.25rem] max-w-[2.25rem]`
  const thHeaderCell = `${thHeaderCellBase} p-3`
  const thFilterCellInner = 'w-full min-w-0 min-h-0'
  const thFilterActive = 'bg-primary-50/90 transition-[background-color] duration-150'
  const searchClearAria = lang === 'ar' ? 'مسح البحث' : 'Clear search'
  const selectClearAria = lang === 'ar' ? 'مسح التصفية' : 'Clear filter'
  const thHeadText = isRtl ? 'invoice-list-th-heading text-right' : 'invoice-list-th-heading text-left'
  const thHeadNum = isRtl ? 'invoice-list-th-heading text-right tabular-nums' : 'invoice-list-th-heading text-center tabular-nums'

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

  function handlePrintList() {
    window.print()
  }

  function handleExportExcel() {
    if (!sortedPosInvoices.length) return
    const activeKeys = allColumnKeys.filter((key) => visibleColumns[key])
    const headers = activeKeys.map((key) => {
      switch (key) {
        case 'number':
          return t.invoices.invoiceNumber
        case 'date':
          return t.date
        case 'customer':
          return t.invoices.customer
        case 'branch':
          return t.invoices.branch
        case 'user':
          return t.invoices.filterUser
        case 'paymentMethod':
          return t.invoices.paymentMethod
        case 'total':
          return t.total
        case 'balance':
          return t.invoices.balance
        case 'document_status':
          return t.invoices.documentStatusCol
        case 'payment_status':
          return t.invoices.paymentStatusColFilter
        default:
          return ''
      }
    })
    const rows = sortedPosInvoices.map((inv) =>
      activeKeys.map((key) => {
        switch (key) {
          case 'number':
            return inv.number
          case 'date':
            return inv.date ? formatDisplayDate(inv.date) : ''
          case 'customer':
            return inv.customer?.name ?? ''
          case 'branch':
            return inv.branch?.name ?? ''
          case 'user':
            return (inv as Invoice & { createdBy?: { name: string } }).createdBy?.name ?? ''
          case 'paymentMethod':
            return invoicePaymentMethodName(inv) ?? ''
          case 'total':
            return fmt(Number(inv.total ?? 0))
          case 'balance':
            return fmt(Number(inv.balance ?? 0))
          case 'document_status':
            return documentStatusLabels[invoiceDocumentStatus(inv)] ?? invoiceDocumentStatus(inv)
          case 'payment_status':
            return paymentStatusLabels[invoicePaymentStatus(inv)] ?? invoicePaymentStatus(inv)
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
    a.download = `pos-invoices-${dateFrom}-${dateTo}.csv`
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
  }

  function onPosDateFromChange(value: string) {
    setDateFrom(value)
  }

  function onPosDateToChange(value: string) {
    setDateTo(value)
  }

  const showCustomDateFields = periodPreset === 'custom'
  const labelFrom = lang === 'ar' ? 'من تاريخ' : 'From date'
  const labelTo = lang === 'ar' ? 'إلى تاريخ' : 'To date'
  const labelPeriod = lang === 'ar' ? 'الفترة' : 'Period'

  return (
    <div className="px-0 pt-4 pb-6 space-y-6 w-full min-w-0 max-w-full">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* شريط علوي: العنوان + فلتر الفترة/التاريخ (نفس فواتير المبيعات) + أزرار التصدير والطباعة */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-1.5">
        <h1 className="text-base font-semibold text-slate-900 truncate shrink-0 leading-tight">
          {t.invoices.posInvoiceListTitle}
        </h1>
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
                    onChange={(e) => onPosDateFromChange(e.target.value)}
                    className="border border-slate-300 rounded-lg px-2 h-8 text-sm w-[140px] min-w-[140px] box-border bg-white leading-normal"
                    title={labelFrom}
                  />
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-sm text-slate-600 whitespace-nowrap">{labelTo}</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => onPosDateToChange(e.target.value)}
                    className="border border-slate-300 rounded-lg px-2 h-8 text-sm w-[140px] min-w-[140px] box-border bg-white leading-normal"
                    title={labelTo}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="relative flex items-center gap-1.5 no-print shrink-0" ref={columnsMenuRef}>
          <button
            type="button"
            onClick={() => setShowColumnsMenu((v) => !v)}
            className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-white border border-slate-300 text-slate-600 hover:bg-slate-50"
            title={lang === 'ar' ? 'تخصيص الأعمدة' : 'Customize columns'}
          >
            <Columns3 size={16} />
          </button>
          {showColumnsMenu && (
            <div
              className="absolute top-full right-0 mt-2 z-[130002] w-56 rounded-lg border border-slate-200 bg-white opacity-100 shadow-[0_12px_48px_-12px_rgba(15,23,42,0.28)] py-2 text-sm pointer-events-auto isolation-isolate"
              style={{ backgroundColor: '#fff' }}
            >
              <div className="px-3 pb-2 text-xs font-semibold text-slate-500">
                {lang === 'ar' ? 'إظهار/إخفاء الأعمدة' : 'Show / hide columns'}
              </div>
              {allColumnKeys.map((key) => {
                const label =
                  key === 'number'
                    ? t.invoices.invoiceNumber
                    : key === 'date'
                      ? t.date
                      : key === 'customer'
                        ? t.invoices.customer
                        : key === 'branch'
                          ? t.invoices.branch
                          : key === 'user'
                            ? t.invoices.filterUser
                            : key === 'paymentMethod'
                              ? t.invoices.paymentMethod
                              : key === 'total'
                                ? t.total
                                : key === 'balance'
                                  ? t.invoices.balance
                                  : key === 'document_status'
                                    ? t.invoices.documentStatusCol
                                    : key === 'payment_status'
                                      ? t.invoices.paymentStatusColFilter
                                      : t.status
                return (
                  <label
                    key={key}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer select-none"
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
                    <span className="text-slate-700 text-xs">{label}</span>
                  </label>
                )
              })}
            </div>
          )}
          <button
            type="button"
            onClick={handlePrintList}
            className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-[#F0F2F5] border border-[#D9DCE0] text-[#344054] hover:bg-[#E4E7EB]"
            title={t.accounts?.print ?? t.invoices?.viewPrint ?? 'طباعة'}
          >
            <Printer size={16} />
          </button>
          <button
            type="button"
            onClick={handlePrintList}
            className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-[#344054] text-white hover:bg-[#2d3846]"
            title={t.accounts?.exportPdf ?? 'تصدير PDF'}
          >
            <FileText size={16} />
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-500"
            title={t.accounts?.exportExcel ?? 'تصدير Excel'}
          >
            <FileSpreadsheet size={16} />
          </button>
        </div>
      </div>

      <div className={`bg-white rounded-xl border border-slate-200 px-3 py-2 sm:px-3 sm:py-2.5 ${filterRowClass}`}>
        <div className={`${filterCellClass} grow shrink min-w-[11rem] basis-[13rem] max-w-[20rem]`}>
          <SearchableSelect
            options={branchFilterOptions}
            value={branchId === '' ? 0 : Number(branchId) || 0}
            onChange={(v) => setBranchId(v === 0 || v === null ? '' : String(v))}
            placeholder={lang === 'ar' ? 'الفرع' : 'Select branch'}
            textAlign={isRtl ? 'right' : 'left'}
            matchTriggerWidth
            wrapOptions
            className="w-full min-w-0"
          />
        </div>
        <div className={`${filterCellClass} grow shrink min-w-[11rem] basis-[13rem] max-w-[20rem]`}>
          <SearchableSelect
            options={costCenterFilterOptions}
            value={costCenterId === '' ? 0 : Number(costCenterId) || 0}
            onChange={(v) => setCostCenterId(v === 0 || v === null ? '' : String(v))}
            placeholder={lang === 'ar' ? 'مركز التكلفة' : 'Cost center'}
            textAlign={isRtl ? 'right' : 'left'}
            matchTriggerWidth
            wrapOptions
            className="w-full min-w-0"
          />
        </div>
        <div className={`${filterCellClass} grow shrink min-w-[11rem] basis-[13rem] max-w-[20rem]`}>
          <SearchableSelect
            options={userFilterOptions}
            value={createdBy === '' ? 0 : Number(createdBy) || 0}
            onChange={(v) => setCreatedBy(v === 0 || v === null ? '' : String(v))}
            placeholder={(t.invoices as { filterUserAll?: string }).filterUserAll ?? t.invoices.filterUser}
            textAlign={isRtl ? 'right' : 'left'}
            matchTriggerWidth
            wrapOptions
            className="w-full min-w-0"
          />
        </div>
        <div className={`${filterCellClass} grow shrink min-w-[11rem] basis-[13rem] max-w-[20rem]`}>
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
                {posTableColPercents.map((pct, i) => (
                  <col key={posTableColModel[i].id} style={{ width: `${pct}%` }} />
                ))}
              </colgroup>
              <thead className="invoice-list-thead">
                <tr className="bg-slate-50 text-slate-600">
                  <th className={thHeaderCellExpand} scope="col" aria-hidden>
                    <div className="invoice-list-th-row invoice-list-th-row--center min-h-[32px]" aria-hidden />
                  </th>
                  {visibleColumns.number && (
                    <th
                      className={`${thHeaderCell} relative z-[60] ${numberFilter.trim() ? thFilterActive : ''}`}
                      scope="col"
                    >
                      <div className="invoice-list-th-row items-start gap-1">
                        <div className={`invoice-list-th-filter ${thFilterCellInner} flex-1 min-w-0`} dir={isRtl ? 'rtl' : 'ltr'}>
                          <InvoiceTableHeaderSearch
                            value={numberFilter}
                            onChange={setNumberFilter}
                            placeholder={t.invoices.invoiceNumber}
                            aria-label={t.invoices.invoiceNumber}
                            isRtl={isRtl}
                            title={t.invoices.invoiceNumber}
                            clearAriaLabel={searchClearAria}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => togglePosSort('number')}
                          className="shrink-0 mt-0.5 p-1 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                          title={lang === 'ar' ? 'ترتيب' : 'Sort'}
                          aria-label={lang === 'ar' ? 'ترتيب حسب رقم الفاتورة' : 'Sort by invoice number'}
                        >
                          {posSortIcon('number')}
                        </button>
                      </div>
                    </th>
                  )}
                  {visibleColumns.date && (
                    <th className={thHeaderCell} scope="col">
                      <div className="invoice-list-th-row">
                        <button
                          type="button"
                          onClick={() => togglePosSort('date')}
                          className={`inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-slate-100 ${thHeadText}`}
                        >
                          <span>{t.date}</span>
                          <span className="opacity-60">{posSortIcon('date')}</span>
                        </button>
                      </div>
                    </th>
                  )}
                  {visibleColumns.customer && (
                    <th
                      className={`${thHeaderCell} relative z-[60] ${partyNameInput.trim() ? thFilterActive : ''}`}
                      scope="col"
                    >
                      <div className="invoice-list-th-row items-start gap-1">
                        <div className={`invoice-list-th-filter ${thFilterCellInner} flex-1 min-w-0`} dir={isRtl ? 'rtl' : 'ltr'}>
                          <InvoicePartyHeaderSearch
                            value={partyNameInput}
                            onChange={setPartyNameInput}
                            placeholder={t.invoices.customer}
                            aria-label={t.invoices.customer}
                            isRtl={isRtl}
                            title={t.invoices.customer}
                            clearAriaLabel={searchClearAria}
                            tenantId={tenantId}
                            partyMode="customers"
                            listFetching={partyListFetching}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => togglePosSort('customer')}
                          className="shrink-0 mt-0.5 p-1 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                          title={lang === 'ar' ? 'ترتيب' : 'Sort'}
                          aria-label={lang === 'ar' ? 'ترتيب حسب العميل' : 'Sort by customer'}
                        >
                          {posSortIcon('customer')}
                        </button>
                      </div>
                    </th>
                  )}
                  {visibleColumns.branch && (
                    <th className={thHeaderCell} scope="col">
                      <div className="invoice-list-th-row">
                        <button
                          type="button"
                          onClick={() => togglePosSort('branch')}
                          className={`inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-slate-100 ${thHeadText}`}
                        >
                          <span>{t.invoices.branch}</span>
                          <span className="opacity-60">{posSortIcon('branch')}</span>
                        </button>
                      </div>
                    </th>
                  )}
                  {visibleColumns.user && (
                    <th className={thHeaderCell} scope="col">
                      <div className="invoice-list-th-row">
                        <button
                          type="button"
                          onClick={() => togglePosSort('user')}
                          className={`inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-slate-100 ${thHeadText}`}
                        >
                          <span>{t.invoices.filterUser}</span>
                          <span className="opacity-60">{posSortIcon('user')}</span>
                        </button>
                      </div>
                    </th>
                  )}
                  {visibleColumns.paymentMethod && (
                    <th
                      className={`${thHeaderCell} relative z-[60] min-w-[11rem] ${paymentMethodId ? thFilterActive : ''}`}
                      scope="col"
                    >
                      <div className="invoice-list-th-row items-start gap-1">
                        <div className={`invoice-list-th-filter ${thFilterCellInner} flex-1 min-w-0`} dir={isRtl ? 'rtl' : 'ltr'}>
                          <SearchableSelect
                            options={paymentMethodHeaderOptions}
                            value={paymentMethodId}
                            onChange={(v) => setPaymentMethodId(v === '' || v === null ? '' : String(v))}
                            placeholder={t.invoices.paymentMethod}
                            textAlign={isRtl ? 'right' : 'left'}
                            wrapOptions
                            dropdownMinWidth={240}
                            variant="header"
                            statusHeader
                            tableHeaderControl
                            clearAriaLabel={selectClearAria}
                            className="w-full min-w-0 max-w-full overflow-visible"
                            aria-label={t.invoices.paymentMethod}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => togglePosSort('paymentMethod')}
                          className="shrink-0 mt-0.5 p-1 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                          title={lang === 'ar' ? 'ترتيب' : 'Sort'}
                          aria-label={lang === 'ar' ? 'ترتيب حسب طريقة الدفع' : 'Sort by payment method'}
                        >
                          {posSortIcon('paymentMethod')}
                        </button>
                      </div>
                    </th>
                  )}
                  {visibleColumns.total && (
                    <th className={thHeaderCell} scope="col">
                      <div className="invoice-list-th-row invoice-list-th-row--center">
                        <button
                          type="button"
                          onClick={() => togglePosSort('total')}
                          className={`inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-slate-100 ${thHeadNum}`}
                        >
                          <span>{t.total}</span>
                          <span className="opacity-60">{posSortIcon('total')}</span>
                        </button>
                      </div>
                    </th>
                  )}
                  {visibleColumns.balance && (
                    <th className={thHeaderCell} scope="col">
                      <div className="invoice-list-th-row invoice-list-th-row--center">
                        <button
                          type="button"
                          onClick={() => togglePosSort('balance')}
                          className={`inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-slate-100 ${thHeadNum}`}
                        >
                          <span>{t.invoices.balance}</span>
                          <span className="opacity-60">{posSortIcon('balance')}</span>
                        </button>
                      </div>
                    </th>
                  )}
                  {visibleColumns.document_status && (
                    <th
                      className={`${thHeaderCell} relative z-[60] min-w-[10rem] ${documentStatusFilter ? thFilterActive : ''}`}
                      scope="col"
                    >
                      <div className="invoice-list-th-row items-start gap-1">
                        <div className={`invoice-list-th-filter ${thFilterCellInner} flex-1 min-w-0`} dir={isRtl ? 'rtl' : 'ltr'}>
                          <SearchableSelect
                            options={documentStatusHeaderOptions}
                            value={documentStatusFilter}
                            onChange={(v) => setDocumentStatusFilter(v === null || v === undefined ? '' : String(v))}
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
                        <button
                          type="button"
                          onClick={() => togglePosSort('document_status')}
                          className="shrink-0 mt-0.5 p-1 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                          title={lang === 'ar' ? 'ترتيب' : 'Sort'}
                          aria-label={lang === 'ar' ? 'ترتيب حسب حالة المستند' : 'Sort by document status'}
                        >
                          {posSortIcon('document_status')}
                        </button>
                      </div>
                    </th>
                  )}
                  {visibleColumns.payment_status && (
                    <th
                      className={`${thHeaderCell} relative z-[60] min-w-[10rem] ${paymentStatusFilter ? thFilterActive : ''}`}
                      scope="col"
                    >
                      <div className="invoice-list-th-row items-start gap-1">
                        <div className={`invoice-list-th-filter ${thFilterCellInner} flex-1 min-w-0`} dir={isRtl ? 'rtl' : 'ltr'}>
                          <SearchableSelect
                            options={paymentStatusHeaderOptions}
                            value={paymentStatusFilter}
                            onChange={(v) => setPaymentStatusFilter(v === null || v === undefined ? '' : String(v))}
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
                        <button
                          type="button"
                          onClick={() => togglePosSort('payment_status')}
                          className="shrink-0 mt-0.5 p-1 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                          title={lang === 'ar' ? 'ترتيب' : 'Sort'}
                          aria-label={lang === 'ar' ? 'ترتيب حسب حالة السداد' : 'Sort by payment status'}
                        >
                          {posSortIcon('payment_status')}
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
              <tbody className="divide-y divide-slate-100">
                {sortedPosInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={posTableColModel.length} className="text-center py-8 text-slate-400">
                      {t.invoices.noPosInvoices}
                    </td>
                  </tr>
                ) : (
                  sortedPosInvoices.map((inv) => {
                    const isExpanded = expandedId === inv.id
                    return (
                      <PosInvoiceRow
                        key={inv.id}
                        inv={inv}
                        isExpanded={isExpanded}
                        detail={isExpanded ? detailInvoice : null}
                        onToggle={() => toggleDetail(inv)}
                        onPost={() => postMut.mutate(inv.id)}
                        onCancel={() => cancelMut.mutate(inv.id)}
                        onActionsToggle={(e) => openActionsMenu(e, inv)}
                        isPosting={postMut.isPending}
                        isCancelling={cancelMut.isPending}
                        fmt={fmt}
                        fmtQty={fmtQty}
                        documentStatusLabels={documentStatusLabels}
                        paymentStatusLabels={paymentStatusLabels}
                        textAlign={textAlign}
                        isRtl={isRtl}
                        tableColSpan={posTableColModel.length}
                        t={t}
                        visibleColumns={visibleColumns}
                        posPrintOpts={posPrintOpts}
                      />
                    )
                  })
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

      {actionsOpenId != null && actionsAnchor && (() => {
        const openInv = sortedPosInvoices.find((i) => i.id === actionsOpenId)
        if (!openInv) return null
        const openDoc = invoiceDocumentStatus(openInv)
        const canEdit =
          openDoc === 'draft' || (openDoc === 'posted' && (Number(openInv.amount_paid) || 0) === 0)
        const inPostedShift = !!(openInv as Invoice & { in_posted_shift?: boolean }).in_posted_shift
        const canDelete = !inPostedShift
        const canAddPayment = openDoc !== 'cancelled' && Number(openInv.balance) > 0
        const deleteDisabledReason = inPostedShift
          ? (t.invoices.cannotDeleteInPostedShift ?? '')
          : ''
        return createPortal(
          <>
            <div className="fixed inset-0 z-[130000]" aria-hidden onClick={closeActionsMenu} />
            <div
              className="fixed z-[130001] min-w-[180px] bg-white border border-slate-200 rounded-lg shadow-lg py-1"
              style={{ top: actionsAnchor.top + 4, insetInlineStart: actionsAnchor.inlineStart }}
            >
              <button
                type="button"
                onClick={() => {
                  closeActionsMenu()
                  openInvoiceViewForPrint(openInv.id, posPrintOpts)
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 ${isRtl ? 'text-right' : 'text-left'}`}
              >
                <Printer size={14} />
                {t.invoices.viewPrint}
              </button>
              <Link
                to={`/invoices/view/${openInv.id}`}
                className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                onClick={closeActionsMenu}
              >
                <Eye size={14} />
                {lang === 'ar' ? 'عرض الفاتورة' : 'View invoice'}
              </Link>
              <button
                type="button"
                onClick={() => {
                  const viewUrl = typeof window !== 'undefined' ? `${window.location.origin}/invoices/view/${openInv.id}` : ''
                  const message = messageTemplateInvoice(
                    {
                      customerName: openInv.customer?.name ?? '',
                      invoiceNumber: openInv.number,
                      total: fmt(Number(openInv.total ?? 0)),
                      pdfOrViewUrl: viewUrl,
                      lang: lang === 'ar' ? 'ar' : 'en',
                    },
                    (settings as Record<string, unknown>)?.whatsapp_invoice_message_ar as string | undefined,
                    (settings as Record<string, unknown>)?.whatsapp_invoice_message_en as string | undefined
                  )
                  openWhatsApp(openInv.customer?.phone ?? null, message, (settings as Record<string, unknown>)?.whatsapp_default_country_code as string | undefined)
                  closeActionsMenu()
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 ${isRtl ? 'text-right' : 'text-left'}`}
              >
                <MessageCircle size={14} />
                {lang === 'ar' ? 'إرسال عبر واتساب' : 'Send via WhatsApp'}
              </button>
              {canEdit && (
                <Link
                  to={`/invoices/create?type=sales&id=${openInv.id}`}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  onClick={closeActionsMenu}
                >
                  <Edit size={14} />
                  {t.edit}
                </Link>
              )}
              <div className="border-t border-slate-100 my-1" />
              <button
                type="button"
                onClick={() => {
                  if (canDelete) {
                    setDeleteTarget(openInv)
                    closeActionsMenu()
                  }
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm ${isRtl ? 'text-right' : 'text-left'} ${canDelete ? 'text-red-600 hover:bg-red-50' : 'text-slate-400 cursor-not-allowed'}`}
                title={!canDelete ? deleteDisabledReason : undefined}
              >
                <Trash2 size={14} />
                {t.invoices.deleteInvoice}
              </button>
              <div className="border-t border-slate-100 my-1" />
              <Link
                to={`/invoices/return/${openInv.id}`}
                className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                onClick={closeActionsMenu}
              >
                <RotateCcw size={14} />
                {t.invoices.returnInvoice}
              </Link>
              {canAddPayment && (
                <button
                  type="button"
                  onClick={() => {
                    closeActionsMenu()
                    navigate(`/payments/create-voucher?voucher_type=receipt&invoice_id=${openInv.id}`)
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 ${isRtl ? 'text-right' : 'text-left'}`}
                >
                  <Banknote size={14} />
                  {t.invoices.addPayment}
                </button>
              )}
            </div>
          </>,
          document.body
        )
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

    </div>
  )
}

function PosInvoiceRow({
  inv,
  isExpanded,
  detail,
  onToggle,
  onPost,
  onCancel,
  onActionsToggle,
  isPosting,
  isCancelling,
  fmt,
  fmtQty,
  documentStatusLabels,
  paymentStatusLabels,
  textAlign,
  isRtl = false,
  tableColSpan,
  t,
  visibleColumns,
  posPrintOpts,
}: {
  inv: Invoice
  isExpanded: boolean
  detail: Invoice | null
  onToggle: () => void
  onPost: () => void
  onCancel: () => void
  onActionsToggle: (e: React.MouseEvent) => void
  isPosting: boolean
  isCancelling: boolean
  fmt: (n: number) => string
  fmtQty: (n: number) => string
  documentStatusLabels: Record<string, string>
  paymentStatusLabels: Record<string, string>
  textAlign: string
  isRtl?: boolean
  tableColSpan: number
  t: unknown
  visibleColumns: Record<ColumnKey, boolean>
  posPrintOpts: OpenInvoicePrintOptions
}) {
  const docSt = invoiceDocumentStatus(inv)
  const paySt = invoicePaymentStatus(inv)
  const canPost = docSt === 'draft'
  const canCancel = docSt !== 'cancelled' && (Number(inv.amount_paid) ?? 0) === 0
  const tt = t as { invoices: Record<string, string>; date: string; total: string; amount: string; status: string; edit: string; msg?: Record<string, string> }
  const createdByName =
    (inv as Invoice & { createdBy?: { name?: string } | null }).createdBy?.name ||
    ((inv as unknown as { created_by?: { name?: string } | number | null }).created_by &&
    typeof (inv as unknown as { created_by?: unknown }).created_by === 'object'
      ? ((inv as unknown as { created_by?: { name?: string } }).created_by?.name ?? '')
      : '') ||
    ((inv as unknown as { created_by_user?: { name?: string } | null }).created_by_user?.name ?? '') ||
    '—'

  return (
    <>
      <tr className="hover:bg-slate-50">
        <td className="px-2 py-3 box-border">
          <button type="button" onClick={onToggle} className="text-slate-400 hover:text-slate-600">
            {isExpanded ? <ChevronDown size={16} /> : <ChevronLeft size={16} />}
          </button>
        </td>
        {visibleColumns.number && (
          <td className={`${textAlign} p-3 font-mono text-xs text-primary-600 font-medium`}>{inv.number}</td>
        )}
        {visibleColumns.date && (
          <td className={`${textAlign} p-3 text-slate-600`}>{formatDisplayDate(inv.date)}</td>
        )}
        {visibleColumns.customer && (
          <td className={`${textAlign} p-3 text-slate-900`}>{inv.customer?.name ?? '—'}</td>
        )}
        {visibleColumns.branch && (
          <td className={`${textAlign} p-3 text-slate-600`}>{inv.branch?.name ?? '—'}</td>
        )}
        {visibleColumns.user && (
          <td className={`${textAlign} p-3 text-slate-600`}>{createdByName}</td>
        )}
        {visibleColumns.paymentMethod && (
          <td className={`${textAlign} p-3 text-slate-600`}>{invoicePaymentMethodName(inv) ?? '—'}</td>
        )}
        {visibleColumns.total && (
          <td className={`p-3 font-medium tabular-nums ${isRtl ? 'text-right' : 'text-center'}`} dir="ltr">
            {fmt(Number(inv.total))}
          </td>
        )}
        {visibleColumns.balance && (
          <td className={`p-3 font-medium tabular-nums ${isRtl ? 'text-right' : 'text-center'}`} dir="ltr">
            {fmt(Number(inv.balance))}
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
        <td className={`${textAlign} p-3 align-top box-border`}>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onActionsToggle}
              className="p-1.5 rounded text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              title={tt.invoices.actionsMenu}
            >
              <MoreVertical size={16} />
            </button>
            {canPost && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onPost()
                }}
                disabled={isPosting}
                className="text-emerald-600 hover:text-emerald-500 p-1 rounded disabled:opacity-50"
                title={tt.invoices.post}
              >
                <Send size={15} />
              </button>
            )}
            {canCancel && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onCancel()
                }}
                disabled={isCancelling}
                className="text-red-500 hover:text-red-600 p-1 rounded disabled:opacity-50"
                title={tt.invoices.cancelInvoice}
              >
                <XCircle size={15} />
              </button>
            )}
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={tableColSpan} className="bg-slate-50 px-0 py-0">
            <div className="px-8 py-4 space-y-4">
              {!detail ? (
                <div className="flex items-center justify-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-slate-700">{tt.invoices.lineItems}</h4>
                    <button
                      type="button"
                      onClick={() =>
                        openInvoiceViewForPrint(detail.id, posPrintOpts)
                      }
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-200 rounded-lg border border-slate-200"
                    >
                      <Printer size={14} />
                      {tt.invoices.viewPrint}
                    </button>
                  </div>
                  <div>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-slate-500">
                          <th className={`${textAlign} pb-2 font-medium`}>{tt.invoices.item}</th>
                          <th className={`${textAlign} pb-2 font-medium`}>{tt.invoices.quantity}</th>
                          <th className={`${textAlign} pb-2 font-medium`}>{tt.invoices.unitPrice}</th>
                          <th className={`${textAlign} pb-2 font-medium`}>{tt.invoices.discount} %</th>
                          <th className={`${textAlign} pb-2 font-medium`}>{tt.invoices.tax} %</th>
                          <th className={`${textAlign} pb-2 font-medium`}>{tt.amount}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {detail.lines?.map((line, idx) => (
                          <tr key={idx}>
                            <td className="py-1.5 text-slate-800">{line.item?.name ?? '—'}</td>
                            <td className="py-1.5">{fmtQty(line.quantity)}</td>
                            <td className="py-1.5">{fmt(line.unit_price ?? 0)}</td>
                            <td className="py-1.5">{line.discount_percent ?? 0}%</td>
                            <td className="py-1.5">{line.tax_percent ?? 0}%</td>
                            <td className="py-1.5 font-medium">{fmt(line.total ?? 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {detail.journal_entry && (
                    <div className="border-t border-slate-200 pt-3">
                      <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                        <FileText size={14} />
                        {tt.invoices.linkedJournalEntry}: {detail.journal_entry.number}
                      </h4>
                    </div>
                  )}
                </>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
