import { useState, useMemo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchInstallments,
  fetchCustomers,
  fetchSettings,
  fetchBranches,
  fetchCostCenters,
  fetchInstallmentPeriods,
  approveInstallment,
  deleteInstallment,
} from '../../api/tenant'
import SearchableSelect, { type SearchableSelectOption } from '../../components/ui/SearchableSelect'
import type { Installment, InstallmentPeriod, PaginatedResponse } from '../../types'
import { formatDisplayDate } from '../../utils/date'
import { formatAmount } from '../../utils/currency'
import { Plus, Pencil, Trash2, CheckCircle, Printer, FileText, FileSpreadsheet, Columns3, MoreHorizontal, Eye, MessageCircle } from 'lucide-react'
import { messageTemplateInstallment, openWhatsApp } from '../../utils/whatsapp'
import type { InstallmentLine } from '../../types'
import { useClientSort } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import {
  filterBarOverflowClass,
  filterPageSizeSelectClass,
  filterSelectCompactClass,
  filterTextInputClass,
} from '../../utils/filterControlStyles'
import { usePersistedColumnVisibility } from '../../hooks/usePersistedColumnVisibility'

const INSTALLMENT_LIST_COLUMN_KEYS = [
  'number',
  'start_date',
  'customer',
  'total_amount',
  'paid',
  'remaining',
  'status',
  'actions',
] as const
type InstallmentListColumnKey = (typeof INSTALLMENT_LIST_COLUMN_KEYS)[number]

const INSTALLMENT_LIST_COLUMNS_STORAGE = 'erp.installmentList.visibleColumns.v1'

const INSTALLMENT_ACTIONS_MENU_MIN_PX = 200
const INSTALLMENT_ACTIONS_MENU_VIEWPORT_MARGIN = 8

function clampInstallmentActionsMenuLeft(rect: DOMRect, isRtl: boolean): number {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
  const m = INSTALLMENT_ACTIONS_MENU_VIEWPORT_MARGIN
  const w = INSTALLMENT_ACTIONS_MENU_MIN_PX
  if (isRtl) {
    let left = rect.left
    left = Math.min(left, vw - w - m)
    return Math.max(m, left)
  }
  let left = rect.right - w
  left = Math.min(left, vw - w - m)
  return Math.max(m, left)
}

function buildInstallmentListWhatsAppMessage(
  row: Installment,
  settings: Record<string, unknown> | undefined,
  lang: 'ar' | 'en',
  fmt: (n: number | string) => string,
): string {
  const lines = row.lines as InstallmentLine[] | undefined
  const templateAr = settings?.whatsapp_installment_message_ar as string | undefined
  const templateEn = settings?.whatsapp_installment_message_en as string | undefined
  const firstUnpaid = lines?.find(
    (l) => l.status !== 'paid' && (Number(l.paid_amount) || 0) < Number(l.amount),
  )
  if (firstUnpaid) {
    return messageTemplateInstallment(
      {
        customerName: row.customer?.name ?? '—',
        installmentAmount: fmt(Number(firstUnpaid.amount) - (Number(firstUnpaid.paid_amount) || 0)),
        dueDate: formatDisplayDate(firstUnpaid.due_date),
        scheduleNumber: row.number,
        lang: lang === 'ar' ? 'ar' : 'en',
      },
      templateAr,
      templateEn,
    )
  }
  return messageTemplateInstallment(
    {
      customerName: row.customer?.name ?? '—',
      installmentAmount: fmt(row.total_remaining ?? row.total_amount ?? 0),
      dueDate: formatDisplayDate(row.start_date),
      scheduleNumber: row.number,
      lang: lang === 'ar' ? 'ar' : 'en',
    },
    templateAr,
    templateEn,
  )
}

const PAGE_SIZES = [10, 25, 50, 100] as const

/** يستخرج مصفوفة الأقساط سواء كان الرد paginated (object.data) أو مصفوفة مباشرة */
function toInstallmentList(raw: unknown): Installment[] {
  if (raw == null) return []
  if (Array.isArray(raw)) return raw as Installment[]
  if (typeof raw === 'object' && raw !== null && 'data' in raw && Array.isArray((raw as PaginatedResponse<Installment>).data))
    return (raw as PaginatedResponse<Installment>).data
  return []
}

export default function InstallmentList() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const navigate = useNavigate()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()

  const [customerIdFilter, setCustomerIdFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [frequencyMonthsFilter, setFrequencyMonthsFilter] = useState('')
  const [branchIdFilter, setBranchIdFilter] = useState('')
  const [costCenterIdFilter, setCostCenterIdFilter] = useState('')
  const [numberFilter, setNumberFilter] = useState('')
  const [pageSize, setPageSize] = useState<number>(25)
  const [deleteTarget, setDeleteTarget] = useState<Installment | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [actionsMenuAnchor, setActionsMenuAnchor] = useState<{ installmentId: number; rect: DOMRect } | null>(null)
  const [approveTarget, setApproveTarget] = useState<Installment | null>(null)
  const [showColumnsMenu, setShowColumnsMenu] = useState(false)
  const columnsMenuRef = useRef<HTMLDivElement>(null)

  const [visibleColumns, setVisibleColumns] = usePersistedColumnVisibility<InstallmentListColumnKey>(
    INSTALLMENT_LIST_COLUMNS_STORAGE,
    INSTALLMENT_LIST_COLUMN_KEYS,
  )

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (columnsMenuRef.current && !columnsMenuRef.current.contains(e.target as Node)) setShowColumnsMenu(false)
    }
    if (showColumnsMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showColumnsMenu])

  useEffect(() => {
    if (actionsMenuAnchor == null) return
    const iid = actionsMenuAnchor.installmentId
    const onDocDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null
      if (!el) return
      if (el.closest('[data-installment-actions-menu]')) return
      if (el.closest(`[data-installment-actions-trigger="${iid}"]`)) return
      setActionsMenuAnchor(null)
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [actionsMenuAnchor])

  useEffect(() => {
    if (actionsMenuAnchor == null) return
    const close = () => setActionsMenuAnchor(null)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [actionsMenuAnchor])

  const params: Record<string, string> = {}
  if (customerIdFilter) params.customer_id = customerIdFilter
  if (statusFilter) params.status = statusFilter
  if (frequencyMonthsFilter) params.frequency_months = frequencyMonthsFilter
  if (branchIdFilter) params.branch_id = branchIdFilter
  if (costCenterIdFilter) params.cost_center_id = costCenterIdFilter
  if (numberFilter.trim()) params.number = numberFilter.trim()
  params.per_page = String(pageSize)

  const { data, isLoading } = useQuery({
    queryKey: ['installments', tenantId, params],
    queryFn: () => fetchInstallments(tenantId, params),
    enabled: !!tenantId,
  })

  const { data: customersData } = useQuery({
    queryKey: ['customers', tenantId, 'filter'],
    queryFn: () => fetchCustomers(tenantId, { per_page: '500' }),
    enabled: !!tenantId,
  })

  const { data: settings } = useQuery({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })

  const { data: branches = [] } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId,
  })

  const { data: costCenters = [] } = useQuery({
    queryKey: ['costCenters', tenantId],
    queryFn: () => fetchCostCenters(tenantId),
    enabled: !!tenantId,
  })

  const { data: installmentPeriods = [] } = useQuery({
    queryKey: ['installment-periods', tenantId],
    queryFn: () => fetchInstallmentPeriods(tenantId),
    enabled: !!tenantId,
  })

  const periodFilterOptions = useMemo(() => {
    const rows = Array.isArray(installmentPeriods) ? installmentPeriods : []
    const byMonth = new Map<number, InstallmentPeriod>()
    for (const p of rows) {
      const m = Number(p.months)
      if (!Number.isFinite(m) || m <= 0) continue
      if (!byMonth.has(m)) byMonth.set(m, p)
    }
    return [...byMonth.entries()].sort(([a], [b]) => a - b).map(([, p]) => p)
  }, [installmentPeriods])

  const approveMut = useMutation({
    mutationFn: (id: number) => approveInstallment(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['installments', tenantId] })
      setApproveTarget(null)
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteInstallment(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['installments', tenantId] })
      setDeleteError('')
      setDeleteTarget(null)
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (lang === 'ar' ? 'تعذر حذف الجدول' : 'Could not delete the schedule')
      setDeleteError(msg)
    },
  })

  const list = toInstallmentList(data)
  const customersList = customersData != null && typeof customersData === 'object' && 'data' in customersData && Array.isArray((customersData as PaginatedResponse<{ id: number; name: string }>).data)
    ? (customersData as PaginatedResponse<{ id: number; name: string }>).data
    : Array.isArray(customersData)
      ? (customersData as { id: number; name: string }[])
      : []
  const customers = customersList

  const filterSelectCls = filterSelectCompactClass
  const filterTextCls = filterTextInputClass

  const branchFilterOptions: SearchableSelectOption[] = useMemo(
    () => [
      { value: 0, label: lang === 'ar' ? 'الفرع' : 'Select branch' },
      ...branches.map((b) => ({ value: b.id, label: b.name })),
    ],
    [branches, lang],
  )

  const costCenterFilterOptions: SearchableSelectOption[] = useMemo(
    () => [
      { value: 0, label: lang === 'ar' ? 'مركز التكلفة' : 'Select cost center' },
      ...costCenters.map((cc) => ({ value: cc.id, label: cc.name })),
    ],
    [costCenters, lang],
  )

  const customerFilterOptions: SearchableSelectOption[] = useMemo(
    () => [
      { value: 0, label: t.installments?.selectCustomer ?? t.all ?? (lang === 'ar' ? 'كل العملاء' : 'All customers') },
      ...customers.map((c) => ({ value: c.id, label: c.name })),
    ],
    [customers, t.installments?.selectCustomer, t.all, lang],
  )

  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const fmt = (n: number | string) => formatAmount(Number(n), { decimal_places: 3 }, locale)

  const statusLabel = (row: Installment) =>
    row.status === 'approved' ? (t.installments?.approved ?? 'معتمد') : (t.installments?.draft ?? 'مسودة')

  const { sort, toggleSort, sortedRows } = useClientSort(list, [
    { key: 'number', type: 'string', getValue: (row: Installment) => row.number ?? '' },
    { key: 'customer', type: 'string', getValue: (row: Installment) => row.customer?.name ?? '' },
    { key: 'total_amount', type: 'number', getValue: (row: Installment) => Number(row.total_amount) },
    { key: 'start_date', type: 'date', getValue: (row: Installment) => row.start_date },
    { key: 'status', type: 'string', getValue: (row: Installment) => statusLabel(row) },
    { key: 'paid', type: 'number', getValue: (row: Installment) => Number(row.total_paid ?? 0) },
    { key: 'remaining', type: 'number', getValue: (row: Installment) => Number(row.total_remaining ?? row.total_amount) },
  ], { locale })

  const actionsMenuInstallment =
    actionsMenuAnchor != null ? sortedRows.find((x) => x.id === actionsMenuAnchor.installmentId) : undefined

  function toggleInstallmentColumn(key: InstallmentListColumnKey) {
    setVisibleColumns((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      const count = INSTALLMENT_LIST_COLUMN_KEYS.filter((k) => next[k]).length
      if (count === 0) return prev
      return next
    })
  }

  function handlePrint() {
    window.print()
  }

  function handleExportPdf() {
    window.print()
  }

  function handleExportExcel() {
    const headers: string[] = []
    if (visibleColumns.number) headers.push(t.installments?.number ?? '#')
    if (visibleColumns.start_date) headers.push(t.installments?.startDate ?? '')
    if (visibleColumns.customer) headers.push(t.installments?.customer ?? '')
    if (visibleColumns.total_amount) headers.push(t.installments?.totalAmount ?? '')
    if (visibleColumns.paid) headers.push(t.installments?.paidAmount ?? '')
    if (visibleColumns.remaining) headers.push(t.installments?.remaining ?? '')
    if (visibleColumns.status) headers.push(t.status)
    if (visibleColumns.actions) headers.push(t.actions)

    const rows = sortedRows.map((row) => {
      const cells: (string | number)[] = []
      if (visibleColumns.number) cells.push(row.number ?? '')
      if (visibleColumns.start_date) cells.push(formatDisplayDate(row.start_date))
      if (visibleColumns.customer) cells.push(row.customer?.name ?? '—')
      if (visibleColumns.total_amount) cells.push(row.total_amount ?? 0)
      if (visibleColumns.paid) cells.push(row.total_paid ?? 0)
      if (visibleColumns.remaining) cells.push(row.total_remaining ?? row.total_amount ?? 0)
      if (visibleColumns.status) cells.push(statusLabel(row))
      if (visibleColumns.actions) cells.push('')
      return cells
    })

    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `installments-list-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const columnMenuLabel = (key: InstallmentListColumnKey) =>
    key === 'number'
      ? (t.installments?.number ?? '#')
      : key === 'customer'
        ? (t.installments?.customer ?? '')
        : key === 'total_amount'
          ? (t.installments?.totalAmount ?? '')
          : key === 'start_date'
            ? (t.installments?.startDate ?? '')
            : key === 'status'
              ? t.status
              : key === 'paid'
                ? (t.installments?.paidAmount ?? '')
                : key === 'remaining'
                  ? (t.installments?.remaining ?? '')
                  : t.actions

  return (
    <div className="p-4 space-y-3 w-full min-w-0 max-w-full">
      <div className="flex flex-wrap items-center justify-between gap-2 no-print">
        <h1 className="text-base font-semibold text-slate-900 leading-tight">
          {t.installments?.listTitle ?? t.nav?.installmentsList}
        </h1>
        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            to="/installments/create"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-sm text-white transition-colors hover:bg-primary-500"
          >
            <Plus size={16} />
            {t.nav?.installmentsCreate}
          </Link>
          <div className="relative" ref={columnsMenuRef}>
            <button
              type="button"
              onClick={() => setShowColumnsMenu((v) => !v)}
              className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              title={lang === 'ar' ? 'تخصيص الأعمدة' : 'Customize columns'}
            >
              <Columns3 size={16} />
            </button>
            {showColumnsMenu && (
              <div className="absolute top-full end-0 z-30 mt-2 w-56 rounded-lg border border-slate-200 bg-white py-2 text-sm shadow-lg">
                <div className="px-3 pb-2 text-xs font-semibold text-slate-500">
                  {lang === 'ar' ? 'إظهار/إخفاء الأعمدة' : 'Show / hide columns'}
                </div>
                {INSTALLMENT_LIST_COLUMN_KEYS.map((key) => (
                  <label
                    key={key}
                    className="flex cursor-pointer select-none items-center gap-2 px-3 py-1.5 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={visibleColumns[key]}
                      onChange={() => toggleInstallmentColumn(key)}
                      className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-xs text-slate-700">{columnMenuLabel(key)}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md border border-[#D9DCE0] bg-[#F0F2F5] text-[#344054] hover:bg-[#E4E7EB]"
            title={t.journal?.print ?? (lang === 'ar' ? 'طباعة' : 'Print')}
          >
            <Printer size={16} />
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-[#344054] text-white hover:bg-[#2d3846]"
            title={lang === 'ar' ? 'تصدير PDF' : 'Export PDF'}
          >
            <FileText size={16} />
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-500"
            title={t.accounts?.exportExcel ?? (lang === 'ar' ? 'تصدير Excel' : 'Export Excel')}
          >
            <FileSpreadsheet size={16} />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 py-2.5 px-3 no-print">
        <div className={`flex flex-nowrap items-center justify-between gap-3 ${filterBarOverflowClass}`} dir={isRtl ? 'rtl' : 'ltr'}>
          <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-3">
            <div className="w-[7rem] min-w-[6rem] max-w-[7.5rem] shrink-0">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label={lang === 'ar' ? 'النوع' : 'Type'}
                title={lang === 'ar' ? 'النوع' : 'Type'}
                className={filterSelectCls}
                style={{ textAlign: isRtl ? 'right' : 'left' }}
              >
                <option value="">{lang === 'ar' ? 'النوع' : 'Type'}</option>
                <option value="draft">{t.installments?.draft ?? 'مسودة'}</option>
                <option value="approved">{t.installments?.approved ?? 'معتمد'}</option>
              </select>
            </div>

            <div className="min-w-[10.5rem] w-44 shrink-0">
              <select
                value={frequencyMonthsFilter}
                onChange={(e) => setFrequencyMonthsFilter(e.target.value)}
                aria-label={t.installments?.installmentPeriodTypeFilter ?? (lang === 'ar' ? 'نوع التقسيط' : 'Installment period')}
                title={t.installments?.installmentPeriodTypeFilter ?? (lang === 'ar' ? 'نوع التقسيط' : 'Installment period')}
                className={filterSelectCls}
                style={{ textAlign: isRtl ? 'right' : 'left' }}
              >
                <option value="">
                  {t.installments?.installmentPeriodTypeFilter ?? (lang === 'ar' ? 'نوع التقسيط' : 'Installment period')}
                </option>
                {periodFilterOptions.map((p) => (
                  <option key={`${p.id}-${p.months}`} value={String(p.months)}>
                    {lang === 'ar' ? p.name : (p.name_en || p.name)}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-[16rem] w-72 shrink-0">
              <div className="h-8 min-w-0">
                <SearchableSelect
                  options={customerFilterOptions}
                  value={customerIdFilter === '' ? 0 : Number(customerIdFilter) || 0}
                  onChange={(v) => setCustomerIdFilter(v === 0 || v === null ? '' : String(v))}
                  placeholder={t.installments?.selectCustomer ?? (lang === 'ar' ? 'اختر العميل' : 'Select customer')}
                  textAlign={isRtl ? 'right' : 'left'}
                  wrapOptions
                  matchTriggerWidth
                  className="h-full min-w-0 overflow-visible"
                  inputClassName={filterSelectCls}
                  aria-label={t.installments?.selectCustomer ?? (lang === 'ar' ? 'العميل' : 'Customer')}
                />
              </div>
            </div>

            <div className="min-w-[11rem] w-52 shrink-0">
              <div className="h-8 min-w-0">
                <SearchableSelect
                  options={branchFilterOptions}
                  value={branchIdFilter === '' ? 0 : Number(branchIdFilter) || 0}
                  onChange={(v) => setBranchIdFilter(v === 0 || v === null ? '' : String(v))}
                  placeholder={lang === 'ar' ? 'الفرع' : 'Select branch'}
                  textAlign={isRtl ? 'right' : 'left'}
                  matchTriggerWidth
                  className="h-full min-w-0 overflow-visible"
                  inputClassName={filterSelectCls}
                  aria-label={lang === 'ar' ? 'الفرع' : 'Branch'}
                />
              </div>
            </div>

            <div className="min-w-[11rem] w-52 shrink-0">
              <div className="h-8 min-w-0">
                <SearchableSelect
                  options={costCenterFilterOptions}
                  value={costCenterIdFilter === '' ? 0 : Number(costCenterIdFilter) || 0}
                  onChange={(v) => setCostCenterIdFilter(v === 0 || v === null ? '' : String(v))}
                  placeholder={lang === 'ar' ? 'مركز التكلفة' : 'Select cost center'}
                  textAlign={isRtl ? 'right' : 'left'}
                  wrapOptions
                  matchTriggerWidth
                  className="h-full min-w-0 overflow-visible"
                  inputClassName={filterSelectCls}
                  aria-label={lang === 'ar' ? 'مركز التكلفة' : 'Cost center'}
                />
              </div>
            </div>

            <div className="min-w-[12rem] max-w-[20rem] flex-1 basis-[12rem]">
              <input
                type="text"
                placeholder={lang === 'ar' ? 'رقم الجدول' : 'Schedule number'}
                value={numberFilter}
                onChange={(e) => setNumberFilter(e.target.value)}
                className={filterTextCls}
                dir={isRtl ? 'rtl' : 'ltr'}
                aria-label={lang === 'ar' ? 'رقم الجدول' : 'Schedule number'}
              />
            </div>
          </div>
          <div className="flex w-14 shrink-0 items-center">
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
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

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="p-8 text-center text-slate-500">{t.loading}</div>
        ) : sortedRows.length === 0 ? (
          <div className="p-8 text-center text-slate-500">{t.noData}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-sm" dir={isRtl ? 'rtl' : 'ltr'}>
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  {visibleColumns.number && (
                    <SortableTh
                      compact
                      headerLayout="clusterCenter"
                      label={t.installments?.number ?? '#'}
                      sortKey="number"
                      sortState={sort}
                      onToggle={toggleSort}
                      widthClassName="w-28"
                      className="p-0 text-center font-medium text-slate-700"
                    />
                  )}
                  {visibleColumns.start_date && (
                    <SortableTh
                      compact
                      headerLayout="clusterCenter"
                      label={t.installments?.startDate ?? ''}
                      sortKey="start_date"
                      sortState={sort}
                      onToggle={toggleSort}
                      widthClassName="w-32"
                      className="p-0 text-center font-medium text-slate-700"
                    />
                  )}
                  {visibleColumns.customer && (
                    <SortableTh
                      compact
                      headerLayout="clusterCenter"
                      label={t.installments?.customer ?? ''}
                      sortKey="customer"
                      sortState={sort}
                      onToggle={toggleSort}
                      widthClassName="w-44"
                      className="p-0 text-center font-medium text-slate-700"
                    />
                  )}
                  {visibleColumns.total_amount && (
                    <SortableTh
                      compact
                      headerLayout="clusterCenter"
                      label={t.installments?.totalAmount ?? ''}
                      sortKey="total_amount"
                      sortState={sort}
                      onToggle={toggleSort}
                      widthClassName="w-32"
                      className="p-0 text-center font-medium text-slate-700"
                    />
                  )}
                  {visibleColumns.paid && (
                    <SortableTh
                      compact
                      headerLayout="clusterCenter"
                      label={t.installments?.paidAmount ?? ''}
                      sortKey="paid"
                      sortState={sort}
                      onToggle={toggleSort}
                      widthClassName="w-32"
                      className="p-0 text-center font-medium text-slate-700"
                    />
                  )}
                  {visibleColumns.remaining && (
                    <SortableTh
                      compact
                      headerLayout="clusterCenter"
                      label={t.installments?.remaining ?? ''}
                      sortKey="remaining"
                      sortState={sort}
                      onToggle={toggleSort}
                      widthClassName="w-32"
                      className="p-0 text-center font-medium text-slate-700"
                    />
                  )}
                  {visibleColumns.status && (
                    <SortableTh
                      compact
                      headerLayout="clusterCenter"
                      label={t.status}
                      sortKey="status"
                      sortState={sort}
                      onToggle={toggleSort}
                      widthClassName="w-28"
                      className="p-0 text-center font-medium text-slate-700"
                    />
                  )}
                  {visibleColumns.actions && (
                    <th className="w-14 px-2 py-2 text-center font-medium align-middle">{t.actions}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => (
                  <tr
                    key={row.id}
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('a,button,input,textarea,select,[role="listbox"]')) return
                      navigate(`/installments/${row.id}`)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        if (!(e.target as HTMLElement).closest('a,button')) navigate(`/installments/${row.id}`)
                      }
                    }}
                  >
                    {visibleColumns.number && <td className="px-2 py-1.5 text-center">{row.number}</td>}
                    {visibleColumns.start_date && (
                      <td className="px-2 py-1.5 text-center">{formatDisplayDate(row.start_date)}</td>
                    )}
                    {visibleColumns.customer && (
                      <td className="px-2 py-1.5 text-center">{row.customer?.name ?? '—'}</td>
                    )}
                    {visibleColumns.total_amount && (
                      <td className="px-2 py-1.5 text-center font-nums">{fmt(row.total_amount)}</td>
                    )}
                    {visibleColumns.paid && (
                      <td className="px-2 py-1.5 text-center font-nums">{fmt(row.total_paid ?? 0)}</td>
                    )}
                    {visibleColumns.remaining && (
                      <td className="px-2 py-1.5 text-center font-nums">{fmt(row.total_remaining ?? row.total_amount)}</td>
                    )}
                    {visibleColumns.status && (
                      <td className="px-2 py-1.5 text-center">
                        <span className={row.status === 'approved' ? 'text-emerald-600' : 'text-amber-600'}>
                          {row.status === 'approved' ? (t.installments?.approved ?? 'معتمد') : (t.installments?.draft ?? 'مسودة')}
                        </span>
                      </td>
                    )}
                    {visibleColumns.actions && (
                      <td className="px-2 py-1.5 text-center align-middle">
                        <div className="flex justify-center">
                          <button
                            type="button"
                            data-installment-actions-trigger={row.id}
                            className={`inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 ${actionsMenuAnchor?.installmentId === row.id ? 'ring-2 ring-primary-500 ring-offset-1 dark:ring-offset-slate-900' : ''}`}
                            aria-expanded={actionsMenuAnchor?.installmentId === row.id}
                            aria-haspopup="menu"
                            aria-label={t.actions}
                            title={t.actions}
                            onClick={(e) => {
                              e.stopPropagation()
                              const btn = e.currentTarget
                              if (actionsMenuAnchor?.installmentId === row.id) {
                                setActionsMenuAnchor(null)
                                return
                              }
                              setActionsMenuAnchor({ installmentId: row.id, rect: btn.getBoundingClientRect() })
                            }}
                          >
                            <MoreHorizontal size={16} aria-hidden />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {approveTarget && (
        <ConfirmDialog
          title={t.installments?.approveSchedule ?? (lang === 'ar' ? 'اعتماد الجدول' : 'Approve schedule')}
          message={
            t.installments?.confirmApprove ??
            (lang === 'ar'
              ? 'اعتماد الجدول إدارياً فقط — دون قيد محاسبي. التحصيل عبر سند القبض على ذمة العميل.'
              : 'Approve for scheduling and reminders only — no journal. Collect via receipt vouchers to customer receivable.')
          }
          variant="warning"
          highlightMessage
          confirmLabel={lang === 'ar' ? 'تأكيد الاعتماد' : 'Confirm approval'}
          cancelLabel={t.cancel}
          isLoading={approveMut.isPending}
          overlayZClass="z-[120]"
          onCancel={() => !approveMut.isPending && setApproveTarget(null)}
          onConfirm={() => {
            if (!approveTarget) return
            approveMut.mutate(approveTarget.id)
          }}
        />
      )}

      {actionsMenuAnchor &&
        actionsMenuInstallment &&
        createPortal(
          <div
            data-installment-actions-menu
            role="menu"
            dir={isRtl ? 'rtl' : 'ltr'}
            className="fixed z-[300] min-w-[12.5rem] rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg dark:border-slate-600 dark:bg-slate-800"
            style={{
              top: actionsMenuAnchor.rect.bottom + 4,
              left: clampInstallmentActionsMenuLeft(actionsMenuAnchor.rect, isRtl),
            }}
          >
            {(() => {
              const row = actionsMenuInstallment
              const phone = row.customer?.phone ?? undefined
              const waMsg = buildInstallmentListWhatsAppMessage(
                row,
                settings as Record<string, unknown> | undefined,
                lang,
                fmt,
              )
              const defaultCc = (settings as Record<string, unknown>)?.whatsapp_default_country_code as string | undefined
              return (
                <>
                  <Link
                    to={`/installments/${row.id}`}
                    role="menuitem"
                    className="flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-700/60"
                    onClick={() => setActionsMenuAnchor(null)}
                  >
                    <Eye size={14} className="shrink-0 opacity-70" aria-hidden />
                    {t.installments?.menuViewDetails ?? (lang === 'ar' ? 'عرض التفاصيل' : 'View details')}
                  </Link>
                  {phone ? (
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 px-3 py-2 text-start text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                      onClick={() => {
                        openWhatsApp(phone, waMsg, defaultCc && defaultCc.trim() ? defaultCc.trim() : undefined)
                        setActionsMenuAnchor(null)
                      }}
                    >
                      <MessageCircle size={14} className="shrink-0" aria-hidden />
                      {t.installments?.menuWhatsapp ?? (lang === 'ar' ? 'تذكير واتساب' : 'WhatsApp')}
                    </button>
                  ) : (
                    <div
                      className="cursor-not-allowed px-3 py-2 text-xs text-slate-400 dark:text-slate-500"
                      title={t.installments?.menuNoPhone}
                    >
                      <span className="inline-flex items-center gap-2 text-slate-500">
                        <MessageCircle size={14} aria-hidden />
                        {t.installments?.menuWhatsapp ?? 'WhatsApp'}
                      </span>
                      <span className="mt-0.5 block text-[10px] leading-tight">{t.installments?.menuNoPhone}</span>
                    </div>
                  )}
                  <Link
                    to={`/installments/${row.id}/edit`}
                    role="menuitem"
                    className="flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-700/60"
                    onClick={() => setActionsMenuAnchor(null)}
                  >
                    <Pencil size={14} className="shrink-0 text-primary-600" aria-hidden />
                    {t.edit}
                  </Link>
                  {row.status === 'draft' && (
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 px-3 py-2 text-start text-emerald-700 hover:bg-emerald-50 dark:text-emerald-600 dark:hover:bg-emerald-950/30"
                      onClick={() => {
                        setApproveTarget(row)
                        setActionsMenuAnchor(null)
                      }}
                    >
                      <CheckCircle size={14} className="shrink-0" aria-hidden />
                      {t.installments?.approveSchedule ?? (lang === 'ar' ? 'اعتماد الجدول' : 'Approve')}
                    </button>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-start text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                    onClick={() => {
                      setDeleteError('')
                      setDeleteTarget(row)
                      setActionsMenuAnchor(null)
                    }}
                  >
                    <Trash2 size={14} className="shrink-0" aria-hidden />
                    {t.installments?.deleteSchedule ?? t.delete}
                  </button>
                </>
              )
            })()}
          </div>,
          document.body,
        )}

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => {
            if (!deleteMut.isPending) {
              setDeleteError('')
              setDeleteTarget(null)
            }
          }}
        >
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <p className="text-slate-700 mb-2 font-medium">
              {t.installments?.confirmDeleteScheduleTitle ?? (lang === 'ar' ? 'تأكيد حذف جدول التقسيط' : 'Confirm delete')}
            </p>
            <p className="text-slate-600 text-sm mb-3">
              <span className="font-mono text-slate-800">{deleteTarget.number}</span>
              {' — '}
              {deleteTarget.status === 'approved'
                ? (t.installments?.confirmDeleteScheduleApproved ??
                  (lang === 'ar'
                    ? 'حذف هذا الجدول سيحذف قيد إعادة التصنيف المحاسبي المرتبط به. لا يمكن الحذف إن وُجدت أقساط محصّلة.'
                    : 'Deleting removes the linked reclassification journal entry. You cannot delete if any installment was collected.'))
                : (t.installments?.confirmDeleteScheduleDraft ??
                  (lang === 'ar'
                    ? 'سيتم حذف الجدول وجميع بنوده.'
                    : 'The schedule and all lines will be deleted.'))}
            </p>
            {deleteError ? <p className="text-sm text-red-600 mb-3">{deleteError}</p> : null}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  if (!deleteMut.isPending) {
                    setDeleteError('')
                    setDeleteTarget(null)
                  }
                }}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={() => deleteMut.mutate(deleteTarget.id)}
                disabled={deleteMut.isPending}
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMut.isPending ? t.deleting : t.delete}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
