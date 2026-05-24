import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchProductionOrders,
  deleteProductionOrder,
  approveProductionOrder,
  fetchSettings,
  fetchBranches,
  fetchCostCenters,
  fetchTenantUsers,
} from '../../api/tenant'
import type { ProductionOrder, PaginatedResponse, TenantSettings, Branch, CostCenter } from '../../types'
import SearchableSelect, { type SearchableSelectOption } from '../../components/ui/SearchableSelect'
import { sortUsersForFilter } from '../../utils/tenantUsersForFilter'
import { formatAmount } from '../../utils/currency'
import { formatDisplayDate, getReportPeriodRange, type ReportPeriodKey } from '../../utils/date'
import { CheckCircle, MoreVertical, Pencil, Plus, Printer, Trash2 } from 'lucide-react'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Toast, { type ToastType } from '../../components/ui/Toast'
import { useClientSort, type SortColumn } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'
import { filterBarOverflowClass, filterSelectCompactClass } from '../../utils/filterControlStyles'

const filterSelectCls = filterSelectCompactClass

const filterCellClass = 'grow shrink min-w-[11rem] basis-[13rem] max-w-[20rem] min-w-0 w-full'

export default function ProductionOrderList() {
  const { currentTenant, user: currentUser } = useAuth()
  const { t, lang, isRtl, getDisplayName } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()
  const initialAllRange = getReportPeriodRange('all')
  const [fromDate, setFromDate] = useState(initialAllRange.from_date)
  const [toDate, setToDate] = useState(initialAllRange.to_date)
  const [periodPreset, setPeriodPreset] = useState<ReportPeriodKey | 'custom'>('all')
  const [statusFilter, setStatusFilter] = useState('')
  const [branchFilter, setBranchFilter] = useState('')
  const [costCenterFilter, setCostCenterFilter] = useState('')
  const [createdByFilter, setCreatedByFilter] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<ProductionOrder | null>(null)
  const [approveTarget, setApproveTarget] = useState<ProductionOrder | null>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [openActionsId, setOpenActionsId] = useState<number | null>(null)
  const [actionsAnchor, setActionsAnchor] = useState<{
    top?: number
    bottom?: number
    left?: number
    right?: number
  } | null>(null)

  const { data: settings } = useQuery<TenantSettings>({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const fmt = (n: number) => formatAmount(Number(n), { decimal_places: settings?.doc_amount_decimals ?? 2 }, locale)

  const { data: branches = [] } = useQuery({
    queryKey: ['branches', tenantId, 'production-orders-list'],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId,
  })
  const { data: costCenters = [] } = useQuery({
    queryKey: ['cost-centers', tenantId, 'production-orders-list'],
    queryFn: () => fetchCostCenters(tenantId),
    enabled: !!tenantId,
  })
  const { data: tenantUsersData } = useQuery({
    queryKey: ['tenant-users', tenantId, 'production-orders-list'],
    queryFn: () => fetchTenantUsers(tenantId),
    enabled: !!tenantId,
  })
  const usersFromApi = tenantUsersData?.data ?? []
  const usersList = useMemo(() => {
    let list = usersFromApi as { id: number; name: string; email?: string }[]
    if (currentUser) {
      const hasCurrent = list.some((u) => u.id === currentUser.id)
      if (!hasCurrent) list = [{ id: currentUser.id, name: currentUser.name, email: currentUser.email }, ...list]
    }
    return sortUsersForFilter(list)
  }, [usersFromApi, currentUser])

  const labelBranchFilter = lang === 'ar' ? 'الفرع' : 'Branch'
  const labelCostCenterFilter = lang === 'ar' ? 'مركز التكلفة' : 'Cost center'
  const labelCreatedByFilter = t.inventory?.createdBy ?? (lang === 'ar' ? 'بواسطة' : 'Created by')
  const neutralBranchLabel = labelBranchFilter
  const neutralCostCenterLabel = labelCostCenterFilter
  const neutralUserLabel = labelCreatedByFilter

  const branchFilterOptions: SearchableSelectOption[] = useMemo(
    () => [
      { value: 0, label: neutralBranchLabel },
      ...branches.map((b: Branch) => ({ value: b.id, label: b.name })),
    ],
    [branches, neutralBranchLabel],
  )
  const costCenterFilterOptions: SearchableSelectOption[] = useMemo(
    () => [
      { value: 0, label: neutralCostCenterLabel },
      ...costCenters.map((cc: CostCenter) => ({
        value: cc.id,
        label: getDisplayName({ name: cc.name, name_en: cc.name_en ?? null }),
      })),
    ],
    [costCenters, getDisplayName, neutralCostCenterLabel],
  )
  const userFilterOptions: SearchableSelectOption[] = useMemo(
    () => [
      { value: 0, label: neutralUserLabel },
      ...usersList.map((u) => ({ value: u.id, label: u.name })),
    ],
    [usersList, neutralUserLabel],
  )

  const params: Record<string, string> = {}
  if (statusFilter) params.status = statusFilter
  if (branchFilter) params.branch_id = branchFilter
  if (costCenterFilter) params.cost_center_id = costCenterFilter
  if (createdByFilter) params.created_by = createdByFilter
  /* preset=all: لا نرسل فلتر التاريخ؛ غير ذلك نرسل من/إلى — كقيود اليومية */
  if (periodPreset !== 'all') {
    if (fromDate?.trim()) params.from_date = fromDate.trim()
    if (toDate?.trim()) params.to_date = toDate.trim()
  }

  const { data, isLoading } = useQuery<PaginatedResponse<ProductionOrder>>({
    queryKey: [
      'production-orders',
      tenantId,
      statusFilter,
      branchFilter,
      costCenterFilter,
      createdByFilter,
      periodPreset,
      fromDate,
      toDate,
    ],
    queryFn: () => fetchProductionOrders(tenantId, Object.keys(params).length ? params : undefined),
    enabled: !!tenantId,
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteProductionOrder(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['production-orders', tenantId] })
      setDeleteTarget(null)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? (t.msg?.errorOccurred ?? 'حدث خطأ')
      setToast({ message: msg, type: 'error' })
    },
  })

  const approveMut = useMutation({
    mutationFn: (id: number) => approveProductionOrder(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['production-orders', tenantId] })
      setApproveTarget(null)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? (t.msg?.errorOccurred ?? 'حدث خطأ')
      setToast({ message: msg, type: 'error' })
      setApproveTarget(null)
    },
  })

  const list = data?.data ?? []

  const closeActionsMenu = () => {
    setOpenActionsId(null)
    setActionsAnchor(null)
  }

  const openActionsMenu = (e: React.MouseEvent, order: ProductionOrder) => {
    e.preventDefault()
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const margin = 8
    const estMenuW = 220
    const estMenuH = 120
    const spaceBelow = vh - rect.bottom
    const openUp = spaceBelow < estMenuH && rect.top > spaceBelow

    const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

    const horizontal = isRtl
      ? { left: clamp(rect.right - estMenuW, margin, vw - margin - estMenuW) }
      : { left: clamp(rect.left, margin, vw - margin - estMenuW) }

    const nextAnchor = openUp ? { bottom: vh - rect.top + margin, ...horizontal } : { top: rect.bottom + margin, ...horizontal }

    setOpenActionsId((prev) => {
      if (prev === order.id) {
        setActionsAnchor(null)
        return null
      }
      setActionsAnchor(nextAnchor)
      return order.id
    })
  }

  const statusLabel = (s: string) =>
    s === 'draft' ? (lang === 'ar' ? 'مسودة' : 'Draft') : s === 'approved' ? (lang === 'ar' ? 'معتمد' : 'Approved') : lang === 'ar' ? 'مكتمل' : 'Completed'
  const statusBadgeClass = (s: string) =>
    s === 'draft' ? 'bg-amber-100 text-amber-800' : s === 'approved' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'

  function printProductionOrder(order: ProductionOrder) {
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
    const productName =
      order.finished_item?.name ?? order.finishedItem?.name ?? (lang === 'ar' ? '—' : '—')
    const st = statusLabel(order.status)
    const title = lang === 'ar' ? 'أمر إنتاج' : 'Production order'
    const rows: [string, string][] = [
      [lang === 'ar' ? 'الرقم' : 'Number', order.number ?? ''],
      [lang === 'ar' ? 'التاريخ' : 'Date', formatDisplayDate(order.order_date)],
      [lang === 'ar' ? 'المنتج' : 'Product', productName],
      [lang === 'ar' ? 'الكمية' : 'Quantity', String(order.quantity ?? '')],
      [lang === 'ar' ? 'الحالة' : 'Status', st],
      [lang === 'ar' ? 'الإجمالي' : 'Total', fmt(Number(order.total_cost))],
      [lang === 'ar' ? 'مصاريف' : 'Overhead', fmt(Number(order.overhead_cost ?? 0))],
    ]
    const bodyRows = rows
      .map(
        ([k, v]) =>
          `<tr><th style="text-align:${isRtl ? 'right' : 'left'};padding:8px;border:1px solid #e5e7eb;background:#f8fafc;width:35%;">${esc(k)}</th><td style="padding:8px;border:1px solid #e5e7eb;">${esc(String(v))}</td></tr>`,
      )
      .join('')
    const html = `<!doctype html><html dir="${isRtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"/><title>${esc(title)}</title></head><body style="font-family:system-ui;padding:16px"><h2 style="margin:0 0 12px">${esc(title)}</h2><table style="width:100%;border-collapse:collapse">${bodyRows}</table><script>window.onload=function(){window.print();setTimeout(function(){window.close()},250)}<\/script></body></html>`
    const w = window.open('', '_blank')
    if (!w) return
    w.document.open()
    w.document.write(html)
    w.document.close()
    w.focus()
  }

  type PoSortKey = 'number' | 'order_date' | 'product' | 'quantity' | 'status' | 'total_cost' | 'overhead_cost'
  const productionOrderSortColumns = useMemo((): SortColumn<ProductionOrder, PoSortKey>[] => {
    return [
      { key: 'number', type: 'string', getValue: (o) => o.number ?? '' },
      { key: 'order_date', type: 'date', getValue: (o) => o.order_date ?? '' },
      {
        key: 'product',
        type: 'string',
        getValue: (o) => o.finished_item?.name ?? o.finishedItem?.name ?? String(o.finished_item_id ?? ''),
      },
      { key: 'quantity', type: 'number', getValue: (o) => Number(o.quantity) },
      { key: 'status', type: 'string', getValue: (o) => o.status ?? '' },
      { key: 'total_cost', type: 'number', getValue: (o) => Number(o.total_cost) },
      { key: 'overhead_cost', type: 'number', getValue: (o) => Number(o.overhead_cost ?? 0) },
    ]
  }, [])
  const { sort, toggleSort, sortedRows: sortedProductionOrders } = useClientSort(list, productionOrderSortColumns, { locale })

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
      setFromDate(range.from_date)
      setToDate(range.to_date)
    }
  }

  const showCustomDateFields = periodPreset === 'custom'
  const labelPeriod = lang === 'ar' ? 'الفترة' : 'Period'
  const labelFrom = lang === 'ar' ? 'من تاريخ' : 'From date'
  const labelTo = lang === 'ar' ? 'إلى تاريخ' : 'To date'
  const allStatusesLabel = lang === 'ar' ? 'الحالة' : 'Status'

  return (
    <div className="w-full max-w-full min-w-0 px-0 py-3 space-y-3">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-1.5">
        <h1 className="text-base font-semibold text-slate-900 truncate shrink-0 leading-tight">
          {t.nav?.productionOrders ?? 'أوامر الإنتاج'}
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
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="border border-slate-300 rounded-lg px-2 h-8 text-sm w-[140px] min-w-[140px] box-border bg-white leading-normal"
                    title={labelFrom}
                  />
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-sm text-slate-600 whitespace-nowrap">{labelTo}</span>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="border border-slate-300 rounded-lg px-2 h-8 text-sm w-[140px] min-w-[140px] box-border bg-white leading-normal"
                    title={labelTo}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="relative z-[120] flex flex-wrap items-center gap-1 no-print shrink-0">
          <Link
            to="/manufacturing/production-orders/create"
            className="inline-flex items-center gap-1.5 bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-2.5 h-8 text-sm font-medium transition-colors shrink-0"
          >
            <Plus size={15} />
            {t.add}
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 py-2.5 px-3">
        <div className={`${filterBarOverflowClass} flex flex-wrap items-center gap-3 w-full min-w-0`}>
          <div className="w-[7rem] min-w-[6rem] max-w-[8rem] shrink-0">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label={t.status}
              title={t.status}
              className={filterSelectCls}
            >
              <option value="">{allStatusesLabel}</option>
              <option value="draft">{statusLabel('draft')}</option>
              <option value="approved">{statusLabel('approved')}</option>
            </select>
          </div>
          <div className={filterCellClass}>
            <SearchableSelect
              options={branchFilterOptions}
              value={branchFilter === '' ? 0 : Number(branchFilter) || 0}
              onChange={(v) => setBranchFilter(v === 0 || v === null ? '' : String(v))}
              placeholder={labelBranchFilter}
              textAlign={isRtl ? 'right' : 'left'}
              matchTriggerWidth
              wrapOptions
              className="w-full min-w-0"
              inputClassName={filterSelectCls}
            />
          </div>
          <div className={filterCellClass}>
            <SearchableSelect
              options={costCenterFilterOptions}
              value={costCenterFilter === '' ? 0 : Number(costCenterFilter) || 0}
              onChange={(v) => setCostCenterFilter(v === 0 || v === null ? '' : String(v))}
              placeholder={labelCostCenterFilter}
              textAlign={isRtl ? 'right' : 'left'}
              matchTriggerWidth
              wrapOptions
              className="w-full min-w-0"
              inputClassName={filterSelectCls}
            />
          </div>
          <div className={filterCellClass}>
            <SearchableSelect
              options={userFilterOptions}
              value={createdByFilter === '' ? 0 : Number(createdByFilter) || 0}
              onChange={(v) => setCreatedByFilter(v === 0 || v === null ? '' : String(v))}
              placeholder={labelCreatedByFilter}
              textAlign={isRtl ? 'right' : 'left'}
              matchTriggerWidth
              wrapOptions
              className="w-full min-w-0"
              inputClassName={filterSelectCls}
            />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white w-full">
        {isLoading ? (
          <div className="p-8 text-center text-slate-500">{t.loading}</div>
        ) : sortedProductionOrders.length === 0 ? (
          <div className="p-8 text-center text-slate-500">{t.noData}</div>
        ) : (
          <table className="w-full min-w-[720px] text-xs table-fixed">
            <thead className="border-b bg-slate-50">
              <tr className="[&_*]:whitespace-normal [&_*]:break-words">
                <SortableTh label={lang === 'ar' ? 'الرقم' : 'Number'} sortKey="number" sortState={sort} onToggle={toggleSort} truncateLabel={false} className="px-0 py-0 text-right font-medium text-slate-700 min-w-[96px]" />
                <SortableTh label={t.date} sortKey="order_date" sortState={sort} onToggle={toggleSort} truncateLabel={false} className="px-0 py-0 text-right font-medium text-slate-700 min-w-[88px]" />
                <SortableTh label={lang === 'ar' ? 'المنتج' : 'Product'} sortKey="product" sortState={sort} onToggle={toggleSort} truncateLabel={false} className="px-0 py-0 text-right font-medium text-slate-700 min-w-[128px]" />
                <SortableTh label={lang === 'ar' ? 'الكمية' : 'Qty'} sortKey="quantity" sortState={sort} onToggle={toggleSort} truncateLabel={false} className="px-0 py-0 text-right font-medium text-slate-700 min-w-[72px]" />
                <SortableTh label={t.status} sortKey="status" sortState={sort} onToggle={toggleSort} truncateLabel={false} className="px-0 py-0 text-right font-medium text-slate-700 min-w-[88px]" />
                <SortableTh label={t.total} sortKey="total_cost" sortState={sort} onToggle={toggleSort} truncateLabel={false} className="px-0 py-0 text-right font-medium text-slate-700 min-w-[104px]" />
                <SortableTh label={lang === 'ar' ? 'مصاريف' : 'Overhead'} sortKey="overhead_cost" sortState={sort} onToggle={toggleSort} truncateLabel={false} className="px-0 py-0 text-right font-medium text-slate-700 min-w-[104px]" />
                <th className="px-2 py-1.5 text-right font-medium text-slate-700 w-28 shrink-0 whitespace-normal break-words">{t.actions}</th>
              </tr>
            </thead>
            <tbody>
              {sortedProductionOrders.map((order) => (
                <tr key={order.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-2 py-1.5 font-medium">{order.number}</td>
                  <td className="px-2 py-1.5">{formatDisplayDate(order.order_date)}</td>
                  <td className="px-2 py-1.5">
                    {order.finished_item?.name ?? order.finishedItem?.name ?? `#${order.finished_item_id}`}
                  </td>
                  <td className="px-2 py-1.5">{Number(order.quantity)}</td>
                  <td className="px-2 py-1.5">
                    <span className={`inline-flex rounded-full px-1.5 py-0.5 text-xs font-medium ${statusBadgeClass(order.status)}`}>
                      {statusLabel(order.status)}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">{fmt(Number(order.total_cost))}</td>
                  <td className="px-2 py-1.5">{fmt(Number(order.overhead_cost ?? 0))}</td>
                  <td className="px-2 py-1.5">
                    <button
                      type="button"
                      onClick={(e) => openActionsMenu(e, order)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      title={t.actions}
                      aria-label={t.actions}
                    >
                      <MoreVertical size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {openActionsId != null && actionsAnchor && (() => {
        const openOrder = sortedProductionOrders.find((o) => o.id === openActionsId)
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
                to={`/manufacturing/production-orders/${openOrder.id}`}
                onClick={closeActionsMenu}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <Pencil size={16} className="text-primary-600" />
                <span>{t.edit}</span>
              </Link>
              <button
                type="button"
                onClick={() => {
                  closeActionsMenu()
                  printProductionOrder(openOrder)
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <Printer size={16} className="text-slate-700" />
                <span>{lang === 'ar' ? 'طباعة' : 'Print'}</span>
              </button>
              {openOrder.status === 'draft' && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      closeActionsMenu()
                      setApproveTarget(openOrder)
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-50"
                  >
                    <CheckCircle size={16} />
                    <span>{lang === 'ar' ? 'اعتماد' : 'Approve'}</span>
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  closeActionsMenu()
                  setDeleteTarget(openOrder)
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                <Trash2 size={16} />
                <span>{t.delete}</span>
              </button>
            </div>
          </>
        )
      })()}
      {deleteTarget && (
        <ConfirmDialog
          title={t.delete}
          message={`${t.confirm} حذف أمر الإنتاج ${deleteTarget.number}؟`}
          onConfirm={() => deleteMut.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
          isLoading={deleteMut.isPending}
        />
      )}
      {approveTarget && (
        <ConfirmDialog
          title="اعتماد أمر الإنتاج"
          message={`سيتم خصم المواد الخام من المخزن وإضافة المنتج النهائي. تأكيد اعتماد ${approveTarget.number}؟`}
          onConfirm={() => approveMut.mutate(approveTarget.id)}
          onCancel={() => setApproveTarget(null)}
          isLoading={approveMut.isPending}
        />
      )}
    </div>
  )
}
