import { useLayoutEffect, useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { usePersistedColumnVisibility } from '../../hooks/usePersistedColumnVisibility'
import { deleteInventoryAdjustment, fetchBranches, fetchCostCenters, fetchInventoryAdjustments, fetchTenantUsers, fetchWarehouses } from '../../api/tenant'
import type { Branch, CostCenter, InventoryAdjustment, TenantUserItem, Warehouse } from '../../types'
import { formatDisplayDate, getDefaultDateRange, getReportPeriodRange, toLocalDateString, type ReportPeriodKey } from '../../utils/date'
import { Plus, Paperclip, Columns3, FileSpreadsheet, FileText, Printer, MoreVertical, Eye, Pencil, Trash2 } from 'lucide-react'
import PageSizeSelect from '../../components/ui/PageSizeSelect'
import ReportFooter from '../../components/ui/ReportFooter'
import InventoryAdjustmentPreviewModal from './InventoryAdjustmentPreviewModal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Toast, { type ToastType } from '../../components/ui/Toast'
import { useClientSort } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'
import { filterBalanceCompactDateInputClass, filterBalancePeriodSelectClass } from '../../utils/filterControlStyles'

interface PaginatedAdjustments {
  data: InventoryAdjustment[]
  current_page: number
  last_page: number
  per_page: number
  total: number
}

type AdjColumnKey = 'number' | 'date' | 'warehouse' | 'targetAccount' | 'type' | 'attachment' | 'user'

const ADJ_LIST_ALL_COLUMNS: AdjColumnKey[] = [
  'number',
  'date',
  'warehouse',
  'targetAccount',
  'type',
  'attachment',
  'user',
]

const ADJ_LIST_COLUMNS_STORAGE = 'inventoryAdjustmentListVisibleColumns'

function adjustmentTargetAccount(r: InventoryAdjustment) {
  return r.targetAccount ?? r.target_account ?? null
}

function adjustmentCreatedByUser(r: InventoryAdjustment) {
  if (r.createdBy) return r.createdBy
  const cb = r.created_by
  if (cb && typeof cb === 'object' && 'name' in cb) return cb
  return null
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
}

export default function InventoryAdjustmentList() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const textAlign = isRtl ? 'text-right' : 'text-left'
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const defaultRange = getDefaultDateRange()
  const [periodPreset, setPeriodPreset] = useState<ReportPeriodKey | 'custom'>('all')
  const [dateFrom, setDateFrom] = useState(defaultRange.dateFrom)
  const [dateTo, setDateTo] = useState(defaultRange.dateTo)
  const [warehouseFilter, setWarehouseFilter] = useState('')
  const [branchFilter, setBranchFilter] = useState('')
  const [costCenterFilter, setCostCenterFilter] = useState('')
  const [userFilter, setUserFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  const [previewId, setPreviewId] = useState<number | null>(null)
  const [showColumnsMenu, setShowColumnsMenu] = useState(false)
  const columnsMenuRef = useRef<HTMLDivElement>(null)
  const [openActionsId, setOpenActionsId] = useState<number | null>(null)
  const actionsMenuRef = useRef<HTMLDivElement>(null)
  const actionsBtnRef = useRef<HTMLButtonElement | null>(null)
  const [actionsDropdownRect, setActionsDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)

  const [visibleColumns, setVisibleColumns] = usePersistedColumnVisibility<AdjColumnKey>(
    ADJ_LIST_COLUMNS_STORAGE,
    ADJ_LIST_ALL_COLUMNS,
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
    function handleClickOutside(e: MouseEvent) {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) setOpenActionsId(null)
    }
    if (openActionsId !== null) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [openActionsId])

  useLayoutEffect(() => {
    if (openActionsId === null) {
      setActionsDropdownRect(null)
      return
    }
    const el = actionsBtnRef.current
    if (!el) {
      setActionsDropdownRect(null)
      return
    }
    const update = () => {
      const r = el.getBoundingClientRect()
      // نفتح القائمة "للداخل" حسب اتجاه الصفحة لتجنب خروجها خارج الشاشة
      const minW = 180
      const left = isRtl ? Math.max(8, r.right - Math.max(r.width, minW)) : r.left
      setActionsDropdownRect({ top: r.bottom + 6, left, width: Math.max(r.width, minW) })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [openActionsId, isRtl])

  const filterParamsOnly = useMemo(() => {
    const p: Record<string, string> = {}
    if (periodPreset !== 'all') {
      if (dateFrom) p.from_date = dateFrom
      if (dateTo) p.to_date = dateTo
    }
    if (warehouseFilter) p.warehouse_id = warehouseFilter
    if (branchFilter) p.branch_id = branchFilter
    if (costCenterFilter) p.cost_center_id = costCenterFilter
    if (userFilter) p.created_by = userFilter
    if (typeFilter) p.adjustment_type = typeFilter
    return p
  }, [periodPreset, dateFrom, dateTo, warehouseFilter, branchFilter, costCenterFilter, userFilter, typeFilter])

  const listParams = useMemo(() => {
    const p: Record<string, string> = {
      page: String(page),
      per_page: String(perPage),
    }
    Object.assign(p, filterParamsOnly)
    return p
  }, [page, perPage, filterParamsOnly])

  const { data: warehousesResp } = useQuery<{ data: Warehouse[] }>({
    queryKey: ['warehouses', tenantId, 'adj-list'],
    queryFn: () => fetchWarehouses(tenantId),
    enabled: tenantId > 0,
  })
  const warehouses = warehousesResp?.data ?? []

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches', tenantId, 'adj-list'],
    queryFn: () => fetchBranches(tenantId),
    enabled: tenantId > 0,
  })

  const { data: costCenters = [] } = useQuery<CostCenter[]>({
    queryKey: ['cost-centers', tenantId, 'adj-list'],
    queryFn: () => fetchCostCenters(tenantId, { active_only: '1' }),
    enabled: tenantId > 0,
  })

  const { data: tenantUsersResp } = useQuery({
    queryKey: ['tenant-users', tenantId, 'adj-list'],
    queryFn: () => fetchTenantUsers(tenantId),
    enabled: tenantId > 0,
  })
  const tenantUsers = (tenantUsersResp?.data ?? []) as TenantUserItem[]

  const { data, isLoading } = useQuery<PaginatedAdjustments>({
    queryKey: ['inventory-adjustments', tenantId, listParams],
    queryFn: () => fetchInventoryAdjustments(tenantId, listParams) as Promise<PaginatedAdjustments>,
    enabled: tenantId > 0,
  })

  const rows = data?.data ?? []
  const adjustmentSortColumns = useMemo(
    () => [
      {
        key: 'number' as AdjColumnKey,
        type: 'string' as const,
        getValue: (r: InventoryAdjustment) => r.number ?? `#${r.id}`,
      },
      { key: 'date' as AdjColumnKey, type: 'date' as const, getValue: (r: InventoryAdjustment) => r.date },
      {
        key: 'warehouse' as AdjColumnKey,
        type: 'string' as const,
        getValue: (r: InventoryAdjustment) => r.warehouse?.name ?? '',
      },
      {
        key: 'targetAccount' as AdjColumnKey,
        type: 'string' as const,
        getValue: (r: InventoryAdjustment) => {
          const acc = adjustmentTargetAccount(r)
          return acc ? `${acc.code} ${acc.name}` : ''
        },
      },
      {
        key: 'type' as AdjColumnKey,
        type: 'string' as const,
        getValue: (r: InventoryAdjustment) => r.adjustment_type ?? '',
      },
      {
        key: 'attachment' as AdjColumnKey,
        type: 'number' as const,
        getValue: (r: InventoryAdjustment) => (r.attachment_url ? 1 : 0),
      },
      {
        key: 'user' as AdjColumnKey,
        type: 'string' as const,
        getValue: (r: InventoryAdjustment) => adjustmentCreatedByUser(r)?.name ?? '',
      },
    ],
    [],
  )
  const { sort, toggleSort, sortedRows } = useClientSort(rows, adjustmentSortColumns, {
    locale: lang === 'ar' ? 'ar-u-nu-latn' : 'en-US',
  })
  const currentPage = data?.current_page ?? 1
  const lastPage = data?.last_page ?? 1
  const total = data?.total ?? 0
  const from = total === 0 ? 0 : (currentPage - 1) * (data?.per_page ?? perPage) + 1
  const to = total === 0 ? 0 : Math.min(currentPage * (data?.per_page ?? perPage), total)

  const labelFrom = lang === 'ar' ? 'من' : 'From'
  const labelTo = lang === 'ar' ? 'إلى' : 'To'
  const labelPeriod = lang === 'ar' ? 'الفترة' : 'Period'

  const periodOptions: { value: ReportPeriodKey | 'custom'; labelAr: string; labelEn: string }[] = [
    { value: 'all', labelAr: 'الفترة', labelEn: 'Period' },
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
    if (preset === 'custom') {
      const today = toLocalDateString(new Date())
      setDateFrom(today)
      setDateTo(today)
      return
    }
    if (preset === 'all') return
    const range = getReportPeriodRange(preset)
    setDateFrom(range.from_date)
    setDateTo(range.to_date)
  }

  const columnLabels: Record<AdjColumnKey, string> = useMemo(
    () => ({
      number: lang === 'ar' ? 'الرقم' : 'No.',
      date: lang === 'ar' ? 'التاريخ' : 'Date',
      warehouse: t.openingStock.warehouse,
      targetAccount: t.inventory.targetAccount,
      type: lang === 'ar' ? 'النوع' : 'Type',
      attachment: lang === 'ar' ? 'مرفق' : 'Attachment',
      user: lang === 'ar' ? 'المستخدم' : 'User',
    }),
    [lang, t.openingStock.warehouse, t.inventory.targetAccount],
  )

  const visibleColumnKeys = useMemo(() => {
    const keys = ADJ_LIST_ALL_COLUMNS.filter((k) => visibleColumns[k])
    return keys.length > 0 ? keys : ADJ_LIST_ALL_COLUMNS
  }, [visibleColumns])

  const fetchAllForExport = useCallback(async (): Promise<InventoryAdjustment[]> => {
    const pageSize = 500
    let pg = 1
    let lastPg = 1
    const out: InventoryAdjustment[] = []
    do {
      const res = (await fetchInventoryAdjustments(tenantId, {
        ...filterParamsOnly,
        page: String(pg),
        per_page: String(pageSize),
      })) as PaginatedAdjustments
      const chunk = res?.data ?? []
      out.push(...chunk)
      lastPg = res?.last_page ?? 1
      pg++
    } while (pg <= lastPg && pg <= 200)
    return out
  }, [tenantId, filterParamsOnly])

  function typeLabel(r: InventoryAdjustment) {
    return r.adjustment_type === 'out' ? (lang === 'ar' ? 'صرف' : 'Out') : lang === 'ar' ? 'إضافة' : 'In'
  }

  const deleteMut = useMutation({
    mutationFn: async (id: number) => deleteInventoryAdjustment(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-adjustments', tenantId] })
      setOpenActionsId(null)
      setConfirmDeleteId(null)
    },
  })

  function rowCellCsv(k: AdjColumnKey, r: InventoryAdjustment): string {
    switch (k) {
      case 'number':
        return r.number ?? `#${r.id}`
      case 'date':
        return formatDisplayDate(r.date)
      case 'warehouse':
        return r.warehouse?.name ?? '—'
      case 'targetAccount': {
        const acc = adjustmentTargetAccount(r)
        return acc
          ? `${acc.code} — ${lang === 'ar' ? acc.name : acc.name_en || acc.name}`
          : '—'
      }
      case 'type':
        return typeLabel(r)
      case 'attachment':
        return r.attachment_url ? (lang === 'ar' ? 'نعم' : 'Yes') : lang === 'ar' ? 'لا' : 'No'
      case 'user':
        return adjustmentCreatedByUser(r)?.name ?? '—'
      default:
        return ''
    }
  }

  function toggleColumn(key: AdjColumnKey, checked: boolean) {
    setVisibleColumns((prev) => {
      const next = { ...prev, [key]: checked }
      if (!ADJ_LIST_ALL_COLUMNS.some((k) => next[k])) return prev
      return next
    })
  }

  const titleColumns = lang === 'ar' ? 'تخصيص الأعمدة' : 'Customize columns'
  const labelShowColumns = lang === 'ar' ? 'إظهار/إخفاء الأعمدة' : 'Show / hide columns'
  const titlePrint = lang === 'ar' ? 'طباعة' : 'Print'
  const titlePdf = lang === 'ar' ? 'تصدير PDF' : 'Export PDF'
  const titleExcel = lang === 'ar' ? 'تصدير Excel' : 'Export Excel'

  const handleExportExcel = async () => {
    if (visibleColumnKeys.length === 0 || tenantId <= 0) return
    setShowColumnsMenu(false)
    const allRows = await fetchAllForExport()
    const headers = visibleColumnKeys.map((k) => columnLabels[k])
    const lines = [
      headers.join(','),
      ...allRows.map((r) =>
        visibleColumnKeys
          .map((k) => {
            const v = rowCellCsv(k, r)
            return `"${String(v).replace(/"/g, '""')}"`
          })
          .join(','),
      ),
    ]
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `inventory-adjustments-${dateFrom}-${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handlePrint = async () => {
    if (visibleColumnKeys.length === 0 || tenantId <= 0) return
    setShowColumnsMenu(false)
    const allRows = await fetchAllForExport()
    const headerRow = visibleColumnKeys.map((k) => `<th>${escapeHtml(columnLabels[k])}</th>`).join('')
    const tableRows = allRows
      .map((r) => {
        const cells = visibleColumnKeys.map((k) => `<td>${escapeHtml(rowCellCsv(k, r))}</td>`).join('')
        return `<tr>${cells}</tr>`
      })
      .join('')
    const reportTitle = t.nav.inventoryAdjustmentsList
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <!DOCTYPE html><html dir="${isRtl ? 'rtl' : 'ltr'}"><head>
        <meta charset="utf-8"><title>${escapeHtml(reportTitle)}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th, td { border: 1px solid #ddd; padding: 8px; }
          th { background: #f5f5f5; }
        </style>
      </head><body>
        <h2>${escapeHtml(reportTitle)}</h2>
        <p>${periodPreset === 'all' ? (lang === 'ar' ? 'كل الفترات' : 'All periods') : `${escapeHtml(dateFrom)} — ${escapeHtml(dateTo)}`}</p>
        <table><thead><tr>${headerRow}</tr></thead><tbody>${tableRows}</tbody></table>
      </body></html>
    `)
    win.document.close()
    win.focus()
    setTimeout(() => {
      win.print()
      win.close()
    }, 300)
  }

  const handleExportPdf = () => handlePrint()

  const addAdjustmentLink = (
    <Link
      to="/inventory/adjustments/create"
      dir="ltr"
      className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-md bg-primary-600 hover:bg-primary-500 text-white transition-colors"
    >
      <Plus size={15} />
      {t.add}
    </Link>
  )

  const adjustmentListIconToolbar = (
    <>
      <button
        type="button"
        onClick={() => void handlePrint()}
        disabled={isLoading || tenantId <= 0}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 disabled:opacity-50"
        title={titlePrint}
      >
        <Printer size={15} />
      </button>
      <button
        type="button"
        onClick={() => void handleExportPdf()}
        disabled={isLoading || tenantId <= 0}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-800 dark:bg-slate-600 text-white hover:bg-slate-700 dark:hover:bg-slate-500 disabled:opacity-50"
        title={titlePdf}
      >
        <FileText size={15} />
      </button>
      <button
        type="button"
        onClick={() => void handleExportExcel()}
        disabled={isLoading || tenantId <= 0}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
        title={titleExcel}
      >
        <FileSpreadsheet size={15} />
      </button>
    </>
  )

  const columnsMenuToggleButton = (
    <button
      type="button"
      onClick={() => setShowColumnsMenu((v) => !v)}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600"
      title={titleColumns}
    >
      <Columns3 size={15} />
    </button>
  )

  return (
    <div className="px-0 py-4 space-y-4 w-full min-w-0 max-w-full">
      {/* شريط علوي بنفس أسلوب أرصدة العملاء: عنوان | فلتر تاريخ في المنتصف | زر جديد */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2 gap-y-1.5 min-h-0">
          <h1 className="text-base font-semibold leading-tight text-slate-900 dark:text-slate-100 shrink-0">
            {t.nav.inventoryAdjustmentsList}
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
                      value={dateFrom}
                      onChange={(e) => {
                        setDateFrom(e.target.value)
                        setPage(1)
                      }}
                      className={`${filterBalanceCompactDateInputClass} box-border`}
                      title={labelFrom}
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">{labelTo}</span>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => {
                        setDateTo(e.target.value)
                        setPage(1)
                      }}
                      className={`${filterBalanceCompactDateInputClass} box-border`}
                      title={labelTo}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="relative flex flex-wrap items-center gap-1 shrink-0" ref={columnsMenuRef}>
            {/* RTL: إضافة يمين المجموعة، ثم تخصيص الأعمدة بجانبها، ثم الطباعة والتصدير */}
            {addAdjustmentLink}
            {columnsMenuToggleButton}
            {adjustmentListIconToolbar}
            {showColumnsMenu && (
              <div
                className={`absolute top-full z-50 mt-2 w-56 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 py-2 shadow-lg text-sm ${isRtl ? 'left-0' : 'right-0'}`}
              >
                <div className="px-3 pb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">{labelShowColumns}</div>
                {ADJ_LIST_ALL_COLUMNS.map((key) => (
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

      {/* الشريط الثانوي: النوع ثم المخزن + بقية الفلاتر + حجم الصفحة */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
        <select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value)
            setPage(1)
          }}
          className="h-9 min-w-[140px] border border-slate-300 rounded-lg px-3 text-sm bg-white"
          title={lang === 'ar' ? 'النوع' : 'Type'}
        >
          <option value="">{lang === 'ar' ? 'النوع' : 'Type'}</option>
          <option value="in">{lang === 'ar' ? 'إضافة' : 'In'}</option>
          <option value="out">{lang === 'ar' ? 'صرف' : 'Out'}</option>
        </select>
        <select
          value={warehouseFilter}
          onChange={(e) => {
            setWarehouseFilter(e.target.value)
            setPage(1)
          }}
          className="h-9 min-w-[192px] border border-slate-300 rounded-lg px-3 text-sm bg-white"
          title={t.openingStock.warehouse}
        >
          <option value="">{lang === 'ar' ? 'المخزن' : 'Warehouse'}</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.code ? `${w.code} - ` : ''}
              {w.name}
            </option>
          ))}
        </select>
        <select
          value={branchFilter}
          onChange={(e) => {
            setBranchFilter(e.target.value)
            setPage(1)
          }}
          className="h-9 min-w-[192px] border border-slate-300 rounded-lg px-3 text-sm bg-white dark:bg-slate-900 dark:border-slate-600"
          title={t.journal.branch}
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
          value={costCenterFilter}
          onChange={(e) => {
            setCostCenterFilter(e.target.value)
            setPage(1)
          }}
          className="h-9 min-w-[208px] border border-slate-300 rounded-lg px-3 text-sm bg-white dark:bg-slate-900 dark:border-slate-600"
          title={t.journal.costCenter}
        >
          <option value="">{lang === 'ar' ? 'مركز التكلفة' : 'Cost center'}</option>
          {costCenters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code ? `${c.code} - ` : ''}
              {lang === 'ar' ? c.name : c.name_en || c.name}
            </option>
          ))}
        </select>
        <select
          value={userFilter}
          onChange={(e) => {
            setUserFilter(e.target.value)
            setPage(1)
          }}
          className="h-9 min-w-[192px] border border-slate-300 rounded-lg px-3 text-sm bg-white dark:bg-slate-900 dark:border-slate-600"
          title={columnLabels.user}
        >
          <option value="">{lang === 'ar' ? 'المستخدم' : 'User'}</option>
          {tenantUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
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
          className="!text-sm"
        />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-visible shadow-sm">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-500 border-t-transparent" />
          </div>
        ) : (
          <div className="overflow-x-auto overflow-y-visible">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  {visibleColumnKeys.map((key) => (
                    <SortableTh
                      key={key}
                      label={columnLabels[key]}
                      sortKey={key}
                      sortState={sort}
                      onToggle={toggleSort}
                      className={`${textAlign} p-0 font-medium`}
                    />
                  ))}
                  <th className={`px-4 py-3 font-medium ${textAlign} w-16`}>
                    {lang === 'ar' ? 'إجراءات' : 'Actions'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumnKeys.length + 1} className="px-4 py-10 text-center text-slate-400">
                      {lang === 'ar' ? 'لا توجد تسويات في النطاق المحدد.' : 'No adjustments in this range.'}
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((r) => (
                    <tr
                      key={r.id}
                      className="hover:bg-slate-50 cursor-pointer"
                      onClick={() => setPreviewId(r.id)}
                      title={lang === 'ar' ? 'معاينة' : 'Preview'}
                    >
                      {visibleColumnKeys.map((key) => (
                        <td key={key} className={`px-4 py-3 ${textAlign} ${key === 'number' ? 'font-mono text-slate-800' : ''} ${key === 'date' ? 'text-slate-700' : ''} ${key === 'warehouse' ? 'text-slate-700' : ''} ${key === 'targetAccount' ? 'text-slate-700 text-xs' : ''} ${key === 'user' ? 'text-slate-500 text-xs' : ''}`}>
                          {key === 'type' ? (
                            <span
                              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                                r.adjustment_type === 'out' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                              }`}
                            >
                              {typeLabel(r)}
                            </span>
                          ) : key === 'attachment' ? (
                            r.attachment_url ? <Paperclip size={16} className="inline text-slate-500" /> : '—'
                          ) : key === 'number' ? (
                            r.number ?? `#${r.id}`
                          ) : key === 'date' ? (
                            formatDisplayDate(r.date)
                          ) : key === 'warehouse' ? (
                            r.warehouse?.name ?? '—'
                          ) : key === 'targetAccount' ? (
                            (() => {
                              const acc = adjustmentTargetAccount(r)
                              return acc
                                ? `${acc.code} — ${lang === 'ar' ? acc.name : acc.name_en || acc.name}`
                                : '—'
                            })()
                          ) : key === 'user' ? (
                            adjustmentCreatedByUser(r)?.name ?? '—'
                          ) : null}
                        </td>
                      ))}
                      <td className={`px-4 py-3 ${textAlign}`} onClick={(e) => e.stopPropagation()}>
                        <div className="relative inline-block" ref={openActionsId === r.id ? actionsMenuRef : undefined}>
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                            ref={openActionsId === r.id ? (el) => { actionsBtnRef.current = el } : undefined}
                            onClick={(e) => {
                              e.stopPropagation()
                              setOpenActionsId((cur) => (cur === r.id ? null : r.id))
                            }}
                            aria-label={lang === 'ar' ? 'إجراءات' : 'Actions'}
                            title={lang === 'ar' ? 'إجراءات' : 'Actions'}
                          >
                            <MoreVertical size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {!isLoading && total > 0 && (
          <ReportFooter
            totalCount={total}
            currentPage={currentPage}
            lastPage={lastPage}
            from={from}
            to={to}
            onPageChange={(p) => setPage(p)}
            lang={lang}
            isRtl={isRtl}
            alwaysShowPaginationBar
            totals={[]}
          />
        )}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {previewId && (
        <InventoryAdjustmentPreviewModal tenantId={tenantId} adjustmentId={previewId} onClose={() => setPreviewId(null)} />
      )}

      {typeof document !== 'undefined' &&
        openActionsId !== null &&
        actionsDropdownRect !== null &&
        createPortal(
          <div
            className="fixed z-[9999] bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden min-w-[180px]"
            style={{
              top: actionsDropdownRect.top,
              left: actionsDropdownRect.left,
              width: actionsDropdownRect.width,
              maxHeight: 'min(14rem, 50vh)',
            }}
          >
            <div className="max-h-56 overflow-y-auto overflow-x-hidden py-1" dir="ltr">
              <button
                type="button"
                className={`w-full px-3 py-2 text-sm hover:bg-slate-100 flex items-center gap-2 ${isRtl ? 'justify-end' : 'justify-start'}`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  setPreviewId(openActionsId)
                  setOpenActionsId(null)
                }}
              >
                <Eye size={16} className="text-slate-500" />
                {lang === 'ar' ? 'معاينة' : 'Preview'}
              </button>
              <button
                type="button"
                className={`w-full px-3 py-2 text-sm hover:bg-slate-100 flex items-center gap-2 ${isRtl ? 'justify-end' : 'justify-start'}`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  const id = openActionsId
                  setOpenActionsId(null)
                  navigate(`/inventory/adjustments/edit/${id}`)
                }}
              >
                <Pencil size={16} className="text-slate-500" />
                {lang === 'ar' ? 'تعديل' : 'Edit'}
              </button>
              <button
                type="button"
                disabled={deleteMut.isPending}
                className={`w-full px-3 py-2 text-sm hover:bg-red-50 text-red-700 flex items-center gap-2 disabled:opacity-50 ${isRtl ? 'justify-end' : 'justify-start'}`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  setConfirmDeleteId(openActionsId)
                  setOpenActionsId(null)
                }}
              >
                <Trash2 size={16} />
                {lang === 'ar' ? 'حذف' : 'Delete'}
              </button>
              <div className="border-t border-slate-100 my-1" />
              <button
                type="button"
                className={`w-full px-3 py-2 text-sm hover:bg-slate-100 flex items-center gap-2 font-medium text-slate-800 ${isRtl ? 'justify-end' : 'justify-start'}`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  const id = openActionsId
                  setOpenActionsId(null)
                  const url = `/inventory/adjustments/view/${id}?autoprint=1`
                  const w = window.open(url, '_blank', 'noopener,noreferrer')
                  if (!w) {
                    setToast({
                      message: isRtl
                        ? 'يرجى السماح بفتح النوافذ المنبثقة لتتم الطباعة'
                        : 'Allow pop-ups to open the print window',
                      type: 'warning',
                    })
                  }
                }}
              >
                <Printer size={16} className="text-slate-600 shrink-0" />
                {lang === 'ar' ? 'طباعة' : 'Print'}
              </button>
              <Link
                to={`/inventory/adjustments/view/${openActionsId}`}
                className={`w-full px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2 text-slate-600 no-underline ${isRtl ? 'justify-end' : 'justify-start'}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setOpenActionsId(null)}
              >
                <FileText size={16} className="shrink-0" />
                {lang === 'ar' ? 'معاينة قبل الطباعة' : 'Print preview'}
              </Link>
            </div>
          </div>,
          document.body,
        )}

      {confirmDeleteId !== null && (
        <ConfirmDialog
          title={lang === 'ar' ? 'تأكيد الحذف' : 'Confirm delete'}
          message={
            lang === 'ar'
              ? 'سيتم حذف التسوية نهائياً مع عكس أثرها. المتابعة؟'
              : 'This adjustment will be permanently deleted and its impact reversed. Continue?'
          }
          confirmLabel={lang === 'ar' ? 'حذف' : 'Delete'}
          cancelLabel={lang === 'ar' ? 'إلغاء' : 'Cancel'}
          variant="danger"
          isLoading={deleteMut.isPending}
          onCancel={() => setConfirmDeleteId(null)}
          onConfirm={() => deleteMut.mutate(confirmDeleteId)}
          overlayZClass="z-[10000]"
        />
      )}
    </div>
  )
}
