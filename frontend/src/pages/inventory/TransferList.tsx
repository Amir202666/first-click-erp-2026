import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchTransfers,
  fetchBranches,
  fetchCostCenters,
  fetchTenantUsers,
  setTransferInTransit,
  setTransferReceived,
  deleteTransfer,
} from '../../api/tenant'
import type { TransferHeader, Branch, CostCenter, TenantUserItem } from '../../types'
import { Plus, ChevronDown, ChevronLeft, Truck, CheckCircle, Trash2, Printer, Pencil, MoreVertical, FileSpreadsheet, FileText, Columns3 } from 'lucide-react'
import { formatDisplayDate } from '../../utils/date'
import { formatAmount } from '../../utils/currency'
import { getDefaultDateRange, getReportPeriodRange, type ReportPeriodKey } from '../../utils/date'
import Toast, { type ToastType } from '../../components/ui/Toast'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { usePersistedColumnVisibility } from '../../hooks/usePersistedColumnVisibility'
import { useClientSort } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'
import { filterBalanceCompactDateInputClass, filterBalancePeriodSelectClass } from '../../utils/filterControlStyles'

const statusLabels: Record<string, string> = {
  draft: 'مسودة',
  in_transit: 'قيد النقل',
  received: 'مستلم',
}
const statusStyles: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  in_transit: 'bg-amber-100 text-amber-700',
  received: 'bg-emerald-100 text-emerald-700',
}
type TransferColumnKey = 'number' | 'date' | 'from' | 'to' | 'status' | 'actions'
type TransferSortKey = Exclude<TransferColumnKey, 'actions'>
const TRANSFER_COLUMN_KEYS: TransferColumnKey[] = ['number', 'date', 'from', 'to', 'status', 'actions']
const TRANSFER_COLUMNS_STORAGE = 'transferListVisibleColumns'

export default function TransferList() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()
  const textAlign = isRtl ? 'text-right' : 'text-left'
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TransferHeader | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [branchId, setBranchId] = useState<number | ''>('')
  const [costCenterId, setCostCenterId] = useState<number | ''>('')
  const [userId, setUserId] = useState<number | ''>('')
  const defaultRange = getDefaultDateRange()
  const [periodPreset, setPeriodPreset] = useState<ReportPeriodKey | 'custom'>('all')
  const [fromDate, setFromDate] = useState(defaultRange.dateFrom ?? '')
  const [toDate, setToDate] = useState(defaultRange.dateTo ?? '')
  const [actionsOpenId, setActionsOpenId] = useState<number | null>(null)
  const [actionsAnchor, setActionsAnchor] = useState<{ top: number; left: number; width: number } | null>(null)
  const [showColumnsMenu, setShowColumnsMenu] = useState(false)
  const columnsMenuRef = useRef<HTMLDivElement>(null)
  const [visibleColumns, setVisibleColumns] = usePersistedColumnVisibility(TRANSFER_COLUMNS_STORAGE, TRANSFER_COLUMN_KEYS)

  const closeActionsMenu = useCallback(() => {
    setActionsOpenId(null)
    setActionsAnchor(null)
  }, [])
  const openActionsMenu = useCallback((e: React.MouseEvent, tr: TransferHeader) => {
    e?.stopPropagation()
    const el = e?.currentTarget as HTMLElement
    if (el?.getBoundingClientRect) {
      const rect = el.getBoundingClientRect()
      setActionsAnchor({ top: rect.bottom, left: rect.left, width: rect.width })
    }
    setActionsOpenId(tr.id)
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (columnsMenuRef.current && !columnsMenuRef.current.contains(e.target as Node)) setShowColumnsMenu(false)
    }
    if (showColumnsMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showColumnsMenu])

  const periodOptions: Array<{ value: ReportPeriodKey | 'custom'; labelAr: string; labelEn: string }> = [
    { value: 'all', labelAr: 'الفترة', labelEn: 'Period' },
    { value: 'custom', labelAr: 'تاريخ مخصص', labelEn: 'Custom date' },
    { value: 'today', labelAr: 'اليوم', labelEn: 'Today' },
    { value: 'yesterday', labelAr: 'الأمس', labelEn: 'Yesterday' },
    { value: 'this_week', labelAr: 'هذا الأسبوع', labelEn: 'This week' },
    { value: 'last_week', labelAr: 'الأسبوع السابق', labelEn: 'Last week' },
    { value: 'this_month', labelAr: 'هذا الشهر', labelEn: 'This month' },
    { value: 'last_month', labelAr: 'الشهر السابق', labelEn: 'Last month' },
    { value: 'this_year', labelAr: 'هذه السنة', labelEn: 'This year' },
  ]

  function applyPeriodPreset(next: ReportPeriodKey | 'custom') {
    setPeriodPreset(next)
    if (next === 'custom' || next === 'all') return
    const range = getReportPeriodRange(next)
    setFromDate(range.from_date)
    setToDate(range.to_date)
  }

  const params: Record<string, string> = {}
  if (statusFilter) params.status = statusFilter
  if (branchId) params.branch_id = String(branchId)
  if (costCenterId) params.cost_center_id = String(costCenterId)
  if (userId) params.created_by = String(userId)
  if (periodPreset !== 'all') {
    if (fromDate) params.from_date = fromDate
    if (toDate) params.to_date = toDate
  }

  const { data: branchesData } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId,
  })
  const branches: Branch[] = Array.isArray(branchesData)
    ? branchesData
    : ((branchesData as unknown) as { data?: Branch[] })?.data ?? []

  const { data: costCentersData } = useQuery({
    queryKey: ['cost-centers', tenantId],
    queryFn: () => fetchCostCenters(tenantId, { active_only: '1' }),
    enabled: !!tenantId,
  })
  const costCenters: CostCenter[] = Array.isArray(costCentersData)
    ? costCentersData
    : ((costCentersData as unknown) as { data?: CostCenter[] })?.data ?? []
  const { data: usersData } = useQuery<{ data: TenantUserItem[] }>({
    queryKey: ['tenant-users', tenantId, 'transfer-list'],
    queryFn: () => fetchTenantUsers(tenantId),
    enabled: !!tenantId,
  })
  const tenantUsers: TenantUserItem[] = usersData?.data ?? []

  const { data, isLoading } = useQuery({
    queryKey: ['transfers', tenantId, params],
    queryFn: () => fetchTransfers(tenantId, Object.keys(params).length ? params : undefined),
    enabled: !!tenantId,
  })
  const transfers = data?.data ?? []
  const transferSortColumns = useMemo(
    () => [
      { key: 'number' as TransferSortKey, type: 'string' as const, getValue: (tr: TransferHeader) => tr.number ?? '' },
      { key: 'date' as TransferSortKey, type: 'date' as const, getValue: (tr: TransferHeader) => tr.date },
      {
        key: 'from' as TransferSortKey,
        type: 'string' as const,
        getValue: (tr: TransferHeader) => tr.from_warehouse?.name ?? '',
      },
      {
        key: 'to' as TransferSortKey,
        type: 'string' as const,
        getValue: (tr: TransferHeader) => tr.to_warehouse?.name ?? '',
      },
      { key: 'status' as TransferSortKey, type: 'string' as const, getValue: (tr: TransferHeader) => tr.status ?? '' },
    ],
    [],
  )
  const { sort, toggleSort, sortedRows: sortedTransfers } = useClientSort(transfers, transferSortColumns, {
    locale: lang === 'ar' ? 'ar-u-nu-latn' : 'en-US',
  })
  const currentPage = data?.current_page ?? 1
  const lastPage = data?.last_page ?? 1

  const inTransitMut = useMutation({
    mutationFn: (id: number) => setTransferInTransit(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfers'] })
      setToast({ message: 'تم قيد النقل', type: 'success' })
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      setToast({ message: e?.response?.data?.message ?? 'فشل', type: 'error' }),
  })
  const receivedMut = useMutation({
    mutationFn: (id: number) => setTransferReceived(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfers'] })
      setToast({ message: 'تم الاستلام', type: 'success' })
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      setToast({ message: e?.response?.data?.message ?? 'فشل', type: 'error' }),
  })
  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteTransfer(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfers'] })
      setDeleteTarget(null)
      setExpandedId(null)
      setToast({ message: t.msg?.deletedSuccess ?? 'تم الحذف', type: 'success' })
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      setToast({ message: e?.response?.data?.message ?? 'فشل', type: 'error' }),
  })

  const locale = 'ar-u-nu-latn'
  const fmt = (n: number) => formatAmount(n, { decimal_places: 2 }, locale)
  const visibleColumnKeys = useMemo(() => {
    const keys = TRANSFER_COLUMN_KEYS.filter((k) => visibleColumns[k])
    return keys.length > 0 ? keys : TRANSFER_COLUMN_KEYS
  }, [visibleColumns])
  const tableColSpan = 1 + visibleColumnKeys.length
  const columnLabels = useMemo((): Record<TransferColumnKey, string> => ({
    number: isRtl ? 'رقم التحويل' : 'Transfer No.',
    date: isRtl ? 'التاريخ' : 'Date',
    from: isRtl ? 'من مخزن' : 'From warehouse',
    to: isRtl ? 'إلى مخزن' : 'To warehouse',
    status: isRtl ? 'الحالة' : 'Status',
    actions: isRtl ? 'إجراءات' : 'Actions',
  }), [isRtl])
  const titleColumns = isRtl ? 'تخصيص الأعمدة' : 'Customize columns'
  const titleExcel = isRtl ? 'تصدير Excel' : 'Export Excel'
  const titlePdf = isRtl ? 'تصدير PDF' : 'Export PDF'
  const titlePrint = isRtl ? 'طباعة' : 'Print'
  const labelShowColumns = isRtl ? 'إظهار/إخفاء الأعمدة' : 'Show / hide columns'
  const labelPeriod = lang === 'ar' ? 'الفترة' : 'Period'
  const labelFrom = lang === 'ar' ? 'من' : 'From'
  const labelTo = lang === 'ar' ? 'إلى' : 'To'

  function toggleColumn(key: TransferColumnKey, checked: boolean) {
    setVisibleColumns((prev) => {
      const next = { ...prev, [key]: checked }
      if (!TRANSFER_COLUMN_KEYS.some((k) => next[k])) return prev
      return next
    })
  }

  function downloadTextFile(content: string, fileName: string, mime: string) {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleExportExcel() {
    const headers = visibleColumnKeys.map((k) => columnLabels[k]).join(',')
    const lines = sortedTransfers.map((tr) => {
      const values: Record<TransferColumnKey, string> = {
        number: tr.number ?? '',
        date: formatDisplayDate(tr.date),
        from: tr.from_warehouse?.name ?? '—',
        to: tr.to_warehouse?.name ?? '—',
        status: statusLabels[tr.status] ?? tr.status,
        actions: '',
      }
      return visibleColumnKeys.map((k) => `"${String(values[k]).replace(/"/g, '""')}"`).join(',')
    })
    downloadTextFile([headers, ...lines].join('\n'), `transfers-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8;')
  }

  function handleExportPDF() {
    window.print()
  }

  function handlePrint() {
    window.print()
  }

  return (
    <div className="px-0 py-4 space-y-4 w-full min-w-0 max-w-full">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2 gap-y-1.5 min-h-0">
          <h1 className="text-base font-semibold leading-tight text-slate-900 dark:text-slate-100 shrink-0">
            {t.nav?.transfers ?? 'تحويلات المخزون'}
          </h1>

          <div className="flex-1 flex justify-center min-w-0">
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <select
                  value={periodPreset}
                  onChange={(e) => applyPeriodPreset((e.target.value as ReportPeriodKey | 'custom') || 'all')}
                  className={filterBalancePeriodSelectClass}
                  title={labelPeriod}
                  aria-label={labelPeriod}
                >
                  {periodOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {lang === 'ar' ? opt.labelAr : opt.labelEn}
                    </option>
                  ))}
                </select>
              </div>
              {periodPreset === 'custom' && (
                <>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">{labelFrom}</span>
                    <input
                      type="date"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      className={`${filterBalanceCompactDateInputClass} box-border`}
                      title={labelFrom}
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">{labelTo}</span>
                    <input
                      type="date"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                      className={`${filterBalanceCompactDateInputClass} box-border`}
                      title={labelTo}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="relative flex flex-wrap items-center gap-1 shrink-0 no-print" ref={columnsMenuRef}>
            <Link
              to="/inventory/transfers/create"
              dir="ltr"
              className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-md bg-primary-600 hover:bg-primary-500 text-white transition-colors"
            >
              <Plus size={15} />
              {t.add ?? 'إضافة'} تحويل
            </Link>
            <button
              type="button"
              onClick={handlePrint}
              disabled={isLoading}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 disabled:opacity-50"
              title={titlePrint}
            >
              <Printer size={15} />
            </button>
            <button
              type="button"
              onClick={handleExportPDF}
              disabled={isLoading}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-800 dark:bg-slate-600 text-white hover:bg-slate-700 dark:hover:bg-slate-500 disabled:opacity-50"
              title={titlePdf}
            >
              <FileText size={15} />
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={isLoading}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
              title={titleExcel}
            >
              <FileSpreadsheet size={15} />
            </button>
            <button
              type="button"
              onClick={() => setShowColumnsMenu((v) => !v)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600"
              title={titleColumns}
            >
              <Columns3 size={15} />
            </button>
            {showColumnsMenu && (
              <div
                className={`absolute top-full z-50 mt-2 w-56 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 py-2 shadow-lg text-sm ${isRtl ? 'left-0' : 'right-0'}`}
              >
                <div className="px-3 pb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">{labelShowColumns}</div>
                {TRANSFER_COLUMN_KEYS.map((key) => (
                  <label
                    key={key}
                    className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <input
                      type="checkbox"
                      checked={visibleColumns[key]}
                      onChange={(e) => toggleColumn(key, e.target.checked)}
                      className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-200">{columnLabels[key]}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-700 pb-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 min-w-[11rem] max-w-[16rem] w-[min(100%,13rem)] border border-slate-300 rounded-lg px-3 text-sm bg-white dark:bg-slate-900 dark:border-slate-600"
          title={t.filter ?? 'تصفية'}
        >
          <option value="">{t.filter ?? 'الكل'}</option>
          <option value="draft">{statusLabels.draft}</option>
          <option value="in_transit">{statusLabels.in_transit}</option>
          <option value="received">{statusLabels.received}</option>
        </select>
        <select
          value={branchId === '' ? '' : String(branchId)}
          onChange={(e) => setBranchId(e.target.value ? Number(e.target.value) : '')}
          className="h-9 min-w-[12.5rem] max-w-[20rem] w-[min(100%,14rem)] border border-slate-300 rounded-lg px-3 text-sm bg-white dark:bg-slate-900 dark:border-slate-600"
          title={t.journal?.branch ?? (lang === 'ar' ? 'الفرع' : 'Branch')}
        >
          <option value="">{lang === 'ar' ? 'الفرع' : 'Branch'}</option>
          {branches
            .filter((b) => b.is_active)
            .map((b) => (
              <option key={b.id} value={b.id}>
                {b.code ? `${b.code} - ` : ''}
                {lang === 'ar' ? b.name : b.name_en || b.name}
              </option>
            ))}
        </select>
        <select
          value={costCenterId === '' ? '' : String(costCenterId)}
          onChange={(e) => setCostCenterId(e.target.value ? Number(e.target.value) : '')}
          className="h-9 min-w-[14rem] max-w-[22rem] w-[min(100%,16rem)] border border-slate-300 rounded-lg px-3 text-sm bg-white dark:bg-slate-900 dark:border-slate-600"
          title={t.journal?.costCenter ?? (lang === 'ar' ? 'مركز التكلفة' : 'Cost center')}
        >
          <option value="">{lang === 'ar' ? 'مركز التكلفة' : 'Cost center'}</option>
          {costCenters
            .filter((c) => c.is_active)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.code ? `${c.code} - ` : ''}
                {lang === 'ar' ? c.name : c.name_en || c.name}
              </option>
            ))}
        </select>
        <select
          value={userId === '' ? '' : String(userId)}
          onChange={(e) => setUserId(e.target.value ? Number(e.target.value) : '')}
          className="h-9 min-w-[12.5rem] max-w-[20rem] w-[min(100%,14rem)] border border-slate-300 rounded-lg px-3 text-sm bg-white dark:bg-slate-900 dark:border-slate-600"
          title={lang === 'ar' ? 'المستخدم' : 'User'}
        >
          <option value="">{lang === 'ar' ? 'المستخدم' : 'User'}</option>
          {tenantUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-visible shadow-sm">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : (
          <table className="w-full text-sm table-fixed">
            <thead>
              <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <th className="w-10 px-2 py-3" />
                {visibleColumnKeys.includes('number') && (
                  <SortableTh
                    label={columnLabels.number}
                    sortKey="number"
                    sortState={sort}
                    onToggle={toggleSort}
                    className={`${textAlign} p-0 font-medium`}
                  />
                )}
                {visibleColumnKeys.includes('date') && (
                  <SortableTh label={columnLabels.date} sortKey="date" sortState={sort} onToggle={toggleSort} className={`${textAlign} p-0 font-medium`} />
                )}
                {visibleColumnKeys.includes('from') && (
                  <SortableTh label={columnLabels.from} sortKey="from" sortState={sort} onToggle={toggleSort} className={`${textAlign} p-0 font-medium`} />
                )}
                {visibleColumnKeys.includes('to') && (
                  <SortableTh label={columnLabels.to} sortKey="to" sortState={sort} onToggle={toggleSort} className={`${textAlign} p-0 font-medium`} />
                )}
                {visibleColumnKeys.includes('status') && (
                  <SortableTh label={columnLabels.status} sortKey="status" sortState={sort} onToggle={toggleSort} className={`${textAlign} p-0 font-medium`} />
                )}
                {visibleColumnKeys.includes('actions') && <th className={`${textAlign} px-4 py-3 font-medium w-40`}>{columnLabels.actions}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedTransfers.length === 0 ? (
                <tr>
                  <td colSpan={tableColSpan} className="text-center py-8 text-slate-400">
                    لا توجد تحويلات. أضف تحويلاً جديداً.
                  </td>
                </tr>
              ) : (
                sortedTransfers.map((tr) => {
                  const isExpanded = expandedId === tr.id
                  return (
                    <React.Fragment key={tr.id}>
                      <tr
                        key={tr.id}
                        className="hover:bg-slate-50 cursor-pointer"
                        onClick={() => setExpandedId(isExpanded ? null : tr.id)}
                      >
                        <td className="px-2 py-3">
                          {isExpanded ? (
                            <ChevronDown size={18} className="text-slate-500" />
                          ) : (
                            <ChevronLeft size={18} className="text-slate-500" style={isRtl ? { transform: 'rotate(180deg)' } : undefined} />
                          )}
                        </td>
                        {visibleColumnKeys.includes('number') && <td className={`px-4 py-3 font-mono font-medium`}>{tr.number}</td>}
                        {visibleColumnKeys.includes('date') && <td className={`px-4 py-3 text-slate-700`}>{formatDisplayDate(tr.date)}</td>}
                        {visibleColumnKeys.includes('from') && <td className={`px-4 py-3 text-slate-700`}>{tr.from_warehouse?.name ?? '—'}</td>}
                        {visibleColumnKeys.includes('to') && <td className={`px-4 py-3 text-slate-700`}>{tr.to_warehouse?.name ?? '—'}</td>}
                        {visibleColumnKeys.includes('status') && (
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[tr.status] ?? 'bg-slate-100 text-slate-700'}`}>
                              {statusLabels[tr.status] ?? tr.status}
                            </span>
                          </td>
                        )}
                        {visibleColumnKeys.includes('actions') && (
                          <td className={`px-4 py-3`} onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={(e) => openActionsMenu(e, tr)}
                              className="p-1.5 rounded text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                              title={t.actions ?? 'إجراءات'}
                            >
                              <MoreVertical size={16} />
                            </button>
                          </td>
                        )}
                      </tr>
                      {isExpanded && tr.lines && tr.lines.length > 0 && (
                        <tr key={`${tr.id}-detail`} className="bg-slate-50/70">
                          <td colSpan={tableColSpan} className="px-4 py-3">
                            <div className="rounded-lg border border-slate-200 bg-white overflow-hidden inline-block min-w-[400px]">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="bg-slate-100 text-slate-600">
                                    <th className={`${textAlign} px-3 py-2 font-medium`}>الصنف</th>
                                    <th className={`${textAlign} px-3 py-2 font-medium`}>الكمية</th>
                                    <th className={`${textAlign} px-3 py-2 font-medium`}>التكلفة</th>
                                    <th className={`${textAlign} px-3 py-2 font-medium`}>الإجمالي</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {tr.lines.map((line) => (
                                    <tr key={line.id} className="border-t border-slate-100">
                                      <td className={`px-3 py-2 text-slate-800`}>{line.item?.name ?? line.item_id}</td>
                                      <td className={`px-3 py-2 tabular-nums`}>{Number(line.quantity).toLocaleString(locale)}</td>
                                      <td className={`px-3 py-2 tabular-nums`}>{fmt(Number(line.unit_cost))}</td>
                                      <td className={`px-3 py-2 tabular-nums font-medium`}>{fmt(Number(line.total_cost))}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        )}
        {lastPage > 1 && (
          <div className="px-4 py-2 border-t border-slate-200 flex justify-between items-center text-sm text-slate-600">
            <span>صفحة {currentPage} من {lastPage}</span>
          </div>
        )}
      </div>

      {actionsOpenId != null && actionsAnchor && (() => {
        const openTr = sortedTransfers.find((tr) => tr.id === actionsOpenId)
        if (!openTr) return null
        const menuItemClass = `flex items-center gap-2 px-3 py-2 text-sm w-full ${isRtl ? 'text-right' : 'text-left'}`
        const menuStyle: React.CSSProperties = {
          top: Math.min(actionsAnchor.top + 4, window.innerHeight - 320),
          ...(isRtl ? { right: window.innerWidth - (actionsAnchor.left + actionsAnchor.width), left: 'auto' } : { left: actionsAnchor.left }),
        }
        const menuContent = (
          <>
            <div className="fixed inset-0 z-[9998]" aria-hidden onClick={closeActionsMenu} />
            <div
              role="menu"
              dir={isRtl ? 'rtl' : 'ltr'}
              className="fixed z-[9999] min-w-[180px] max-h-[80vh] overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg py-1"
              style={menuStyle}
              onClick={(e) => e.stopPropagation()}
            >
              {openTr.status === 'draft' && (
                <button
                  type="button"
                  onClick={() => { inTransitMut.mutate(openTr.id); closeActionsMenu() }}
                  disabled={inTransitMut.isPending}
                  className={`${menuItemClass} text-amber-700 hover:bg-amber-50`}
                >
                  <Truck size={14} />
                  قيد النقل
                </button>
              )}
              {openTr.status === 'in_transit' && (
                <button
                  type="button"
                  onClick={() => { receivedMut.mutate(openTr.id); closeActionsMenu() }}
                  disabled={receivedMut.isPending}
                  className={`${menuItemClass} text-emerald-700 hover:bg-emerald-50`}
                >
                  <CheckCircle size={14} />
                  استلام
                </button>
              )}
              <Link to={`/inventory/transfers/${openTr.id}/edit`} className={`${menuItemClass} text-slate-700 hover:bg-slate-50`} onClick={closeActionsMenu}>
                <Pencil size={14} />
                {t.edit ?? 'تعديل'}
              </Link>
              <button type="button" onClick={() => { setDeleteTarget(openTr); closeActionsMenu() }} className={`${menuItemClass} text-red-600 hover:bg-red-50`}>
                <Trash2 size={14} />
                {t.delete ?? 'حذف'}
              </button>
              <div className="border-t border-slate-100 my-1" />
              <button
                type="button"
                onClick={() => {
                  closeActionsMenu()
                  const url = `/inventory/transfers/${openTr.id}/print?autoprint=1`
                  const w = window.open(url, '_blank', 'noopener,noreferrer')
                  if (!w) {
                    setToast({
                      message: isRtl ? 'يرجى السماح بفتح النوافذ المنبثقة لتتم الطباعة' : 'Allow pop-ups to open the print window',
                      type: 'warning',
                    })
                  }
                }}
                className={`${menuItemClass} text-slate-800 hover:bg-slate-100 font-medium`}
              >
                <Printer size={14} className="shrink-0" />
                {isRtl ? 'طباعة' : 'Print'}
              </button>
              <Link
                to={`/inventory/transfers/${openTr.id}/print`}
                onClick={closeActionsMenu}
                className={`${menuItemClass} text-slate-600 hover:bg-slate-50 no-underline`}
              >
                <FileText size={14} className="shrink-0" />
                {isRtl ? 'معاينة قبل الطباعة' : 'Preview'}
              </Link>
            </div>
          </>
        )
        return createPortal(menuContent, document.body)
      })()}

      {deleteTarget && (
        <ConfirmDialog
          title="حذف التحويل"
          message={`سيتم حذف التحويل ${deleteTarget.number} نهائيًا`}
          confirmLabel={t.delete ?? 'حذف'}
          variant="danger"
          isLoading={deleteMut.isPending}
          onConfirm={() => deleteMut.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
