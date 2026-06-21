import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchDisassemblyOrders,
  deleteDisassemblyOrder,
  confirmDisassemblyOrder,
  cancelDisassemblyOrder,
  fetchBranches,
  fetchCostCenters,
  fetchSettings,
} from '../../api/tenant'
import type { Branch, CostCenter, DisassemblyOrder, PaginatedResponse, TenantSettings } from '../../types'
import SearchableSelect, { type SearchableSelectOption } from '../../components/ui/SearchableSelect'
import PageSizeSelect from '../../components/ui/PageSizeSelect'
import ReportFooter from '../../components/ui/ReportFooter'
import { formatAmount } from '../../utils/currency'
import { formatDisplayDate, getDefaultDateRange, getReportPeriodRange, type ReportPeriodKey } from '../../utils/date'
import { CheckCircle, Columns3, FileSpreadsheet, FileText, MoreVertical, Pencil, Plus, Printer, Trash2, XCircle } from 'lucide-react'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Toast, { type ToastType } from '../../components/ui/Toast'
import { filterSelectCompactClass, filterTextInputClass } from '../../utils/filterControlStyles'

const filterSelectCls = filterSelectCompactClass
const filterTextCls = filterTextInputClass
const filterGridClass = 'grid w-full gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))]'
const filterCellClass = 'min-w-0 w-full'

type ColumnKey =
  | 'number'
  | 'date'
  | 'source_item'
  | 'quantity'
  | 'warehouse'
  | 'branch'
  | 'cost_center'
  | 'total_cost'
  | 'outputs'
  | 'status'

const allColumnKeys: ColumnKey[] = [
  'number',
  'date',
  'source_item',
  'quantity',
  'warehouse',
  'branch',
  'cost_center',
  'total_cost',
  'outputs',
  'status',
]

function defaultVisibleColumns(): Record<ColumnKey, boolean> {
  return allColumnKeys.reduce((acc, key) => ({ ...acc, [key]: true }), {} as Record<ColumnKey, boolean>)
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

export default function DisassemblyOrderList() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl, getDisplayName } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()
  const columnsMenuRef = useRef<HTMLDivElement | null>(null)
  const columnsStorageKey = tenantId ? `erp.disassemblyList.visibleColumns.v1.${tenantId}` : null

  const defaultRange = getDefaultDateRange()
  const [fromDate, setFromDate] = useState(defaultRange.dateFrom)
  const [toDate, setToDate] = useState(defaultRange.dateTo)
  const [periodPreset, setPeriodPreset] = useState<ReportPeriodKey | 'custom'>('all')
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [branchFilter, setBranchFilter] = useState('')
  const [costCenterFilter, setCostCenterFilter] = useState('')
  const [perPage, setPerPage] = useState(25)
  const [page, setPage] = useState(1)
  const [showColumnsMenu, setShowColumnsMenu] = useState(false)
  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnKey, boolean>>(() => defaultVisibleColumns())
  const [deleteTarget, setDeleteTarget] = useState<DisassemblyOrder | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<DisassemblyOrder | null>(null)
  const [cancelTarget, setCancelTarget] = useState<DisassemblyOrder | null>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [openActionsId, setOpenActionsId] = useState<number | null>(null)
  const [actionsAnchor, setActionsAnchor] = useState<{
    top?: number
    bottom?: number
    left?: number
    right?: number
  } | null>(null)

  useEffect(() => {
    if (!columnsStorageKey) return
    try {
      const raw = localStorage.getItem(columnsStorageKey)
      if (raw) setVisibleColumns(mergeStoredVisibleColumns(JSON.parse(raw)))
    } catch {
      setVisibleColumns(defaultVisibleColumns())
    }
  }, [columnsStorageKey])

  useEffect(() => {
    const onClick = (e: Event) => {
      if (!columnsMenuRef.current?.contains(e.target as Node)) setShowColumnsMenu(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const toggleColumn = useCallback(
    (key: ColumnKey) => {
      setVisibleColumns((prev) => {
        const next = { ...prev, [key]: !prev[key] }
        if (!allColumnKeys.some((k) => next[k])) return prev
        if (columnsStorageKey) {
          try {
            localStorage.setItem(columnsStorageKey, JSON.stringify(next))
          } catch {
            /* ignore */
          }
        }
        return next
      })
    },
    [columnsStorageKey],
  )

  const { data: settings } = useQuery<TenantSettings>({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const fmt = (n: number) => formatAmount(Number(n), { decimal_places: settings?.doc_amount_decimals ?? 2 }, locale)

  const { data: branches = [] } = useQuery({
    queryKey: ['branches', tenantId, 'disassembly-orders-list'],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId,
  })
  const { data: costCenters = [] } = useQuery({
    queryKey: ['cost-centers', tenantId, 'disassembly-orders-list'],
    queryFn: () => fetchCostCenters(tenantId),
    enabled: !!tenantId,
  })

  const branchFilterOptions: SearchableSelectOption[] = useMemo(
    () => [
      { value: 0, label: lang === 'ar' ? 'الفرع' : 'Branch' },
      ...branches.map((b: Branch) => ({ value: b.id, label: b.name })),
    ],
    [branches, lang],
  )
  const costCenterFilterOptions: SearchableSelectOption[] = useMemo(
    () => [
      { value: 0, label: lang === 'ar' ? 'مركز التكلفة' : 'Cost center' },
      ...costCenters.map((cc: CostCenter) => ({
        value: cc.id,
        label: getDisplayName({ name: cc.name, name_en: cc.name_en ?? null }),
      })),
    ],
    [costCenters, getDisplayName, lang],
  )

  const params: Record<string, string> = {
    per_page: String(perPage),
    page: String(page),
  }
  if (statusFilter) params.status = statusFilter
  if (search.trim()) params.search = search.trim()
  if (fromDate?.trim()) params.from_date = fromDate.trim()
  if (toDate?.trim()) params.to_date = toDate.trim()
  if (branchFilter) params.branch_id = branchFilter
  if (costCenterFilter) params.cost_center_id = costCenterFilter

  const { data, isLoading } = useQuery<PaginatedResponse<DisassemblyOrder>>({
    queryKey: [
      'disassembly-orders',
      tenantId,
      statusFilter,
      search,
      periodPreset,
      fromDate,
      toDate,
      branchFilter,
      costCenterFilter,
      perPage,
      page,
    ],
    queryFn: () => fetchDisassemblyOrders(tenantId, params),
    enabled: !!tenantId,
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteDisassemblyOrder(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disassembly-orders', tenantId] })
      setDeleteTarget(null)
      setToast({
        message:
          lang === 'ar'
            ? 'تم حذف أمر التفكيك وعكس أثره على المخزون والمحاسبة'
            : 'Disassembly order deleted and effects reversed',
        type: 'success',
      })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? (t.msg?.errorOccurred ?? 'حدث خطأ')
      setToast({ message: msg, type: 'error' })
    },
  })

  const confirmMut = useMutation({
    mutationFn: (id: number) => confirmDisassemblyOrder(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disassembly-orders', tenantId] })
      setConfirmTarget(null)
      setToast({ message: lang === 'ar' ? 'تم تنفيذ التفكيك وتحديث المخزون' : 'Disassembly completed', type: 'success' })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? (t.msg?.errorOccurred ?? 'حدث خطأ')
      setToast({ message: msg, type: 'error' })
      setConfirmTarget(null)
    },
  })

  const cancelMut = useMutation({
    mutationFn: (id: number) => cancelDisassemblyOrder(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disassembly-orders', tenantId] })
      setCancelTarget(null)
      setToast({ message: lang === 'ar' ? 'تم إلغاء أمر التفكيك' : 'Order cancelled', type: 'success' })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? (t.msg?.errorOccurred ?? 'حدث خطأ')
      setToast({ message: msg, type: 'error' })
    },
  })

  const list = data?.data ?? []

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
    setPage(1)
    if (preset !== 'custom') {
      const range = getReportPeriodRange(preset)
      setFromDate(range.from_date)
      setToDate(range.to_date)
    }
  }

  const showCustomDateFields = periodPreset === 'custom'
  const labelFrom = lang === 'ar' ? 'من تاريخ' : 'From date'
  const labelTo = lang === 'ar' ? 'إلى تاريخ' : 'To date'
  const labelPeriod = lang === 'ar' ? 'الفترة' : 'Period'
  const pageTitle = t.nav?.disassemblyOrders ?? (lang === 'ar' ? 'تفكيك الأصناف' : 'Item disassembly')

  const columnLabel = (key: ColumnKey) => {
    switch (key) {
      case 'number':
        return lang === 'ar' ? 'رقم الأمر' : 'Number'
      case 'date':
        return t.date
      case 'source_item':
        return lang === 'ar' ? 'الصنف المُفكَّك' : 'Source item'
      case 'quantity':
        return lang === 'ar' ? 'الكمية' : 'Qty'
      case 'warehouse':
        return lang === 'ar' ? 'المستودع' : 'Warehouse'
      case 'branch':
        return lang === 'ar' ? 'الفرع' : 'Branch'
      case 'cost_center':
        return lang === 'ar' ? 'مركز التكلفة' : 'Cost center'
      case 'total_cost':
        return lang === 'ar' ? 'إجمالي التكلفة' : 'Total cost'
      case 'outputs':
        return lang === 'ar' ? 'أصناف ناتجة' : 'Outputs'
      case 'status':
        return lang === 'ar' ? 'الحالة' : 'Status'
      default:
        return key
    }
  }

  const statusLabel = (s: string) => {
    if (s === 'draft') return lang === 'ar' ? 'مسودة' : 'Draft'
    if (s === 'completed') return lang === 'ar' ? 'مكتمل' : 'Completed'
    if (s === 'cancelled') return lang === 'ar' ? 'ملغى' : 'Cancelled'
    return s
  }

  const statusBadgeClass = (s: string) => {
    if (s === 'draft') return 'bg-gray-100 text-gray-700 border border-gray-200'
    if (s === 'completed') return 'bg-emerald-50 text-emerald-700 border border-emerald-200'
    if (s === 'cancelled') return 'bg-red-50 text-red-600 border border-red-200'
    return 'bg-gray-100 text-gray-600'
  }

  const itemLabel = (o: DisassemblyOrder) => {
    const it = o.item
    if (!it) return '—'
    return it.code ? `${it.code} — ${it.name}` : it.name
  }

  const branchLabel = (o: DisassemblyOrder) => o.branch?.name ?? '—'

  const costCenterLabel = (o: DisassemblyOrder) => {
    const cc = o.costCenter ?? o.cost_center
    return cc ? getDisplayName({ name: cc.name, name_en: cc.name_en ?? null }) : '—'
  }

  const deleteMessage = (order: DisassemblyOrder) => {
    if (order.status === 'completed') {
      return lang === 'ar'
        ? `هل تريد حذف أمر التفكيك ${order.number}؟ سيتم حذف الأمر وعكس أثره على المخزون والمحاسبة (إن وُجد).`
        : `Delete disassembly order ${order.number}? This will remove the order and reverse its inventory and accounting effects (if any).`
    }
    if (order.status === 'cancelled') {
      return lang === 'ar'
        ? `هل تريد حذف أمر التفكيك ${order.number}؟`
        : `Delete disassembly order ${order.number}?`
    }
    return lang === 'ar'
      ? `هل تريد حذف أمر التفكيك ${order.number}؟`
      : `Delete disassembly order ${order.number}?`
  }

  const confirmMessage = useMemo(() => {
    if (!confirmTarget) return ''
    const name = confirmTarget.item?.name ?? '—'
    const qty = confirmTarget.quantity
    return lang === 'ar'
      ? `سيتم خصم ${qty} وحدة من «${name}» وإضافة الأصناف الناتجة للمخزون. هل تريد المتابعة؟`
      : `This will deduct ${qty} units from «${name}» and add output items to stock. Continue?`
  }, [confirmTarget, lang])

  const visibleColCount = allColumnKeys.filter((k) => visibleColumns[k]).length + 1

  const closeActionsMenu = () => {
    setOpenActionsId(null)
    setActionsAnchor(null)
  }

  const openActionsMenu = (e: MouseEvent, order: DisassemblyOrder) => {
    e.preventDefault()
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const margin = 8
    const estMenuW = 220
    const estMenuH = 160
    const spaceBelow = vh - rect.bottom
    const openUp = spaceBelow < estMenuH && rect.top > spaceBelow
    const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
    const horizontal = isRtl
      ? { left: clamp(rect.right - estMenuW, margin, vw - margin - estMenuW) }
      : { left: clamp(rect.left, margin, vw - margin - estMenuW) }
    const nextAnchor = openUp
      ? { bottom: vh - rect.top + margin, ...horizontal }
      : { top: rect.bottom + margin, ...horizontal }

    setOpenActionsId((prev) => {
      if (prev === order.id) {
        setActionsAnchor(null)
        return null
      }
      setActionsAnchor(nextAnchor)
      return order.id
    })
  }

  function handlePrint() {
    window.print()
  }

  function exportExcel() {
    const activeKeys = allColumnKeys.filter((key) => visibleColumns[key])
    const headers = activeKeys.map((key) => columnLabel(key))
    const rows = list.map((order) =>
      activeKeys.map((key) => {
        switch (key) {
          case 'number':
            return order.number
          case 'date':
            return formatDisplayDate(order.date)
          case 'source_item':
            return itemLabel(order)
          case 'quantity':
            return String(order.quantity)
          case 'warehouse':
            return order.warehouse?.name ?? '—'
          case 'branch':
            return branchLabel(order)
          case 'cost_center':
            return costCenterLabel(order)
          case 'total_cost':
            return fmt(Number(order.total_cost ?? 0))
          case 'outputs':
            return String(order.lines?.length ?? 0)
          case 'status':
            return statusLabel(order.status)
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
    a.download = `disassembly-orders-${fromDate}-${toDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="px-0 py-3 space-y-3 w-full min-w-0 max-w-full" dir={isRtl ? 'rtl' : 'ltr'}>
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
                    value={fromDate}
                    onChange={(e) => {
                      setFromDate(e.target.value)
                      setPage(1)
                    }}
                    className="border border-slate-300 rounded-lg px-2 h-8 text-sm w-[140px] min-w-[140px] box-border bg-white leading-normal"
                    title={labelFrom}
                  />
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-sm text-slate-600 whitespace-nowrap">{labelTo}</span>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => {
                      setToDate(e.target.value)
                      setPage(1)
                    }}
                    className="border border-slate-300 rounded-lg px-2 h-8 text-sm w-[140px] min-w-[140px] box-border bg-white leading-normal"
                    title={labelTo}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="relative z-[120] flex flex-wrap items-center gap-1 no-print shrink-0" ref={columnsMenuRef}>
          <Link
            to="/manufacturing/disassembly-orders/create"
            className="inline-flex items-center gap-1.5 bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-2.5 h-8 text-sm font-medium transition-colors shrink-0"
          >
            <Plus className="h-4 w-4" />
            {lang === 'ar' ? 'أمر تفكيك جديد' : 'New order'}
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
              {allColumnKeys.map((key) => (
                <label key={key} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={visibleColumns[key]}
                    onChange={() => toggleColumn(key)}
                    className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-slate-700 text-xs">{columnLabel(key)}</span>
                </label>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#F0F2F5] border border-[#D9DCE0] text-[#344054] hover:bg-[#E4E7EB] no-print"
            title={t.accounts?.print ?? (lang === 'ar' ? 'طباعة' : 'Print')}
          >
            <Printer size={15} />
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#344054] text-white hover:bg-[#2d3846] no-print"
            title={t.accounts?.exportPdf ?? (lang === 'ar' ? 'تصدير PDF' : 'Export PDF')}
          >
            <FileText size={15} />
          </button>
          <button
            type="button"
            onClick={exportExcel}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-500 no-print"
            title={t.accounts?.exportExcel ?? (lang === 'ar' ? 'تصدير Excel' : 'Export Excel')}
          >
            <FileSpreadsheet size={15} />
          </button>
        </div>
      </div>

      <div className={`bg-white rounded-xl border border-slate-200 p-4 ${filterGridClass}`}>
        <div className={filterCellClass}>
          <input
            type="text"
            className={filterTextCls}
            placeholder={lang === 'ar' ? 'رقم الأمر...' : 'Order number...'}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <div className={filterCellClass}>
          <select
            className={filterSelectCls}
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              setPage(1)
            }}
          >
            <option value="">{lang === 'ar' ? 'الحالة — الكل' : 'Status — All'}</option>
            <option value="draft">{statusLabel('draft')}</option>
            <option value="completed">{statusLabel('completed')}</option>
            <option value="cancelled">{statusLabel('cancelled')}</option>
          </select>
        </div>
        <div className={filterCellClass}>
          <SearchableSelect
            options={branchFilterOptions}
            value={branchFilter === '' ? 0 : Number(branchFilter) || 0}
            onChange={(v) => {
              setBranchFilter(v === 0 || v === null ? '' : String(v))
              setPage(1)
            }}
            placeholder={lang === 'ar' ? 'الفرع' : 'Branch'}
            textAlign={isRtl ? 'right' : 'left'}
            matchTriggerWidth
            className="w-full min-w-0"
          />
        </div>
        <div className={filterCellClass}>
          <SearchableSelect
            options={costCenterFilterOptions}
            value={costCenterFilter === '' ? 0 : Number(costCenterFilter) || 0}
            onChange={(v) => {
              setCostCenterFilter(v === 0 || v === null ? '' : String(v))
              setPage(1)
            }}
            placeholder={lang === 'ar' ? 'مركز التكلفة' : 'Cost center'}
            textAlign={isRtl ? 'right' : 'left'}
            wrapOptions
            matchTriggerWidth
            className="w-full min-w-0"
          />
        </div>
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

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                {visibleColumns.number && (
                  <th className="px-3 py-2 text-start font-medium">{columnLabel('number')}</th>
                )}
                {visibleColumns.date && (
                  <th className="px-3 py-2 text-start font-medium">{columnLabel('date')}</th>
                )}
                {visibleColumns.source_item && (
                  <th className="px-3 py-2 text-start font-medium">{columnLabel('source_item')}</th>
                )}
                {visibleColumns.quantity && (
                  <th className="px-3 py-2 text-start font-medium">{columnLabel('quantity')}</th>
                )}
                {visibleColumns.warehouse && (
                  <th className="px-3 py-2 text-start font-medium">{columnLabel('warehouse')}</th>
                )}
                {visibleColumns.branch && (
                  <th className="px-3 py-2 text-start font-medium">{columnLabel('branch')}</th>
                )}
                {visibleColumns.cost_center && (
                  <th className="px-3 py-2 text-start font-medium">{columnLabel('cost_center')}</th>
                )}
                {visibleColumns.total_cost && (
                  <th className="px-3 py-2 text-end font-medium">{columnLabel('total_cost')}</th>
                )}
                {visibleColumns.outputs && (
                  <th className="px-3 py-2 text-start font-medium">{columnLabel('outputs')}</th>
                )}
                {visibleColumns.status && (
                  <th className="px-3 py-2 text-start font-medium">{columnLabel('status')}</th>
                )}
                <th className="px-3 py-2 text-start font-medium w-16">{lang === 'ar' ? 'إجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (
                <tr>
                  <td colSpan={visibleColCount} className="px-3 py-8 text-center text-slate-400">
                    {lang === 'ar' ? 'جاري التحميل...' : 'Loading...'}
                  </td>
                </tr>
              )}
              {!isLoading && list.length === 0 && (
                <tr>
                  <td colSpan={visibleColCount} className="px-3 py-8 text-center text-slate-400">
                    {lang === 'ar' ? 'لا توجد أوامر' : 'No orders'}
                  </td>
                </tr>
              )}
              {list.map((order) => (
                <tr key={order.id} className="hover:bg-slate-50/80">
                  {visibleColumns.number && (
                    <td className="px-3 py-2 font-medium text-primary-700">
                      <Link to={`/manufacturing/disassembly-orders/${order.id}`} state={null}>{order.number}</Link>
                    </td>
                  )}
                  {visibleColumns.date && (
                    <td className="px-3 py-2">{formatDisplayDate(order.date)}</td>
                  )}
                  {visibleColumns.source_item && (
                    <td className="px-3 py-2">{itemLabel(order)}</td>
                  )}
                  {visibleColumns.quantity && (
                    <td className="px-3 py-2">{order.quantity}</td>
                  )}
                  {visibleColumns.warehouse && (
                    <td className="px-3 py-2">{order.warehouse?.name ?? '—'}</td>
                  )}
                  {visibleColumns.branch && (
                    <td className="px-3 py-2">{branchLabel(order)}</td>
                  )}
                  {visibleColumns.cost_center && (
                    <td className="px-3 py-2">{costCenterLabel(order)}</td>
                  )}
                  {visibleColumns.total_cost && (
                    <td className="px-3 py-2 text-end tabular-nums">{fmt(Number(order.total_cost ?? 0))}</td>
                  )}
                  {visibleColumns.outputs && (
                    <td className="px-3 py-2">{order.lines?.length ?? 0}</td>
                  )}
                  {visibleColumns.status && (
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(order.status)}`}>
                        {statusLabel(order.status)}
                      </span>
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      title={lang === 'ar' ? 'إجراءات' : 'Actions'}
                      aria-label={lang === 'ar' ? 'إجراءات' : 'Actions'}
                      onClick={(e) => openActionsMenu(e, order)}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
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
            recordLabel={lang === 'ar' ? 'أمر' : 'order'}
            dense
          />
        )}
      </div>

      <div id="disassembly-orders-list-print" className="report-print-only" dir={isRtl ? 'rtl' : 'ltr'}>
        <div className="report-print-header">
          {!!(settings as Record<string, unknown>)?.company_logo && (
            <div className="mb-3">
              <img
                src={String((settings as Record<string, unknown>).company_logo)}
                alt=""
                className="h-14 object-contain"
              />
            </div>
          )}
          <h2 className="text-xl font-bold text-slate-900 mb-1">
            {String((settings as Record<string, unknown>)?.company_name ?? currentTenant?.name ?? '—')}
          </h2>
          <h3 className="text-lg font-semibold text-slate-800 mt-4 mb-1">{pageTitle}</h3>
          <p className="text-sm text-slate-600">
            {lang === 'ar' ? 'الفترة' : 'Period'}: {fromDate} — {toDate}
          </p>
        </div>
        <div className="report-print-table-wrap">
          <table className="report-print-table w-full text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-medium">
                {allColumnKeys.filter((k) => visibleColumns[k]).map((key) => (
                  <th key={key} className="px-3 py-2 border-b border-slate-200 text-start">
                    {columnLabel(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((order) => (
                <tr key={order.id}>
                  {visibleColumns.number && <td className="px-3 py-2 border-b border-slate-100">{order.number}</td>}
                  {visibleColumns.date && (
                    <td className="px-3 py-2 border-b border-slate-100">{formatDisplayDate(order.date)}</td>
                  )}
                  {visibleColumns.source_item && (
                    <td className="px-3 py-2 border-b border-slate-100">{itemLabel(order)}</td>
                  )}
                  {visibleColumns.quantity && (
                    <td className="px-3 py-2 border-b border-slate-100">{order.quantity}</td>
                  )}
                  {visibleColumns.warehouse && (
                    <td className="px-3 py-2 border-b border-slate-100">{order.warehouse?.name ?? '—'}</td>
                  )}
                  {visibleColumns.branch && (
                    <td className="px-3 py-2 border-b border-slate-100">{branchLabel(order)}</td>
                  )}
                  {visibleColumns.cost_center && (
                    <td className="px-3 py-2 border-b border-slate-100">{costCenterLabel(order)}</td>
                  )}
                  {visibleColumns.total_cost && (
                    <td className="px-3 py-2 border-b border-slate-100">{fmt(Number(order.total_cost ?? 0))}</td>
                  )}
                  {visibleColumns.outputs && (
                    <td className="px-3 py-2 border-b border-slate-100">{order.lines?.length ?? 0}</td>
                  )}
                  {visibleColumns.status && (
                    <td className="px-3 py-2 border-b border-slate-100">{statusLabel(order.status)}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {openActionsId != null && actionsAnchor && (() => {
        const openOrder = list.find((o) => o.id === openActionsId)
        if (!openOrder) return null
        return (
          <>
            <div className="fixed inset-0 z-40" onClick={closeActionsMenu} aria-hidden />
            <div
              className={`fixed z-50 bg-white rounded-lg border border-slate-200 shadow-lg py-1 min-w-[200px] max-w-[min(280px,calc(100vw-16px))] ${isRtl ? 'text-right' : 'text-left'}`}
              style={{
                ...(actionsAnchor.top != null ? { top: actionsAnchor.top } : {}),
                ...(actionsAnchor.bottom != null ? { bottom: actionsAnchor.bottom } : {}),
                ...(actionsAnchor.left != null ? { left: actionsAnchor.left } : {}),
                ...(actionsAnchor.right != null ? { right: actionsAnchor.right } : {}),
              }}
            >
              <Link
                to={`/manufacturing/disassembly-orders/${openOrder.id}`}
                state={null}
                onClick={closeActionsMenu}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <Pencil className="h-4 w-4 text-primary-600" />
                {openOrder.status === 'draft'
                  ? (lang === 'ar' ? 'تعديل' : 'Edit')
                  : (lang === 'ar' ? 'عرض' : 'View')}
              </Link>
              {openOrder.status === 'draft' && (
                <>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-50"
                    onClick={() => {
                      closeActionsMenu()
                      setConfirmTarget(openOrder)
                    }}
                  >
                    <CheckCircle className="h-4 w-4" /> {lang === 'ar' ? 'تأكيد وتنفيذ' : 'Confirm'}
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-amber-700 hover:bg-amber-50"
                    onClick={() => {
                      closeActionsMenu()
                      setCancelTarget(openOrder)
                    }}
                  >
                    <XCircle className="h-4 w-4" /> {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                  </button>
                </>
              )}
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                onClick={() => {
                  closeActionsMenu()
                  setDeleteTarget(openOrder)
                }}
              >
                <Trash2 className="h-4 w-4" /> {lang === 'ar' ? 'حذف' : 'Delete'}
              </button>
            </div>
          </>
        )
      })()}

      {deleteTarget && (
        <ConfirmDialog
          title={lang === 'ar' ? 'حذف أمر التفكيك' : 'Delete order'}
          message={deleteMessage(deleteTarget)}
          confirmLabel={lang === 'ar' ? 'نعم، حذف' : 'Yes, delete'}
          variant="danger"
          onConfirm={() => deleteMut.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
          isLoading={deleteMut.isPending}
        />
      )}
      {confirmTarget && (
        <ConfirmDialog
          title={lang === 'ar' ? 'تأكيد التفكيك' : 'Confirm disassembly'}
          message={confirmMessage}
          confirmLabel={lang === 'ar' ? 'تنفيذ' : 'Execute'}
          variant="warning"
          onConfirm={() => confirmMut.mutate(confirmTarget.id)}
          onCancel={() => setConfirmTarget(null)}
          isLoading={confirmMut.isPending}
        />
      )}
      {cancelTarget && (
        <ConfirmDialog
          title={lang === 'ar' ? 'إلغاء الأمر' : 'Cancel order'}
          message={lang === 'ar' ? 'هل تريد إلغاء أمر التفكيك؟' : 'Cancel this draft order?'}
          confirmLabel={lang === 'ar' ? 'إلغاء الأمر' : 'Cancel order'}
          variant="warning"
          onConfirm={() => cancelMut.mutate(cancelTarget.id)}
          onCancel={() => setCancelTarget(null)}
          isLoading={cancelMut.isPending}
        />
      )}
    </div>
  )
}
