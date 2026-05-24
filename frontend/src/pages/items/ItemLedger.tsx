import { useState, useMemo, useRef, useEffect, type ReactElement } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchItemMovements,
  fetchSettings,
  fetchWarehouses,
  fetchBranches,
  fetchCostCenters,
  fetchTenantUsers,
} from '../../api/tenant'
import ItemLedgerDocumentPreviewModal from './ItemLedgerDocumentPreviewModal'
import type {
  ItemLedgerResponse,
  MovementRow,
} from './itemLedgerHelpers'
import {
  escHtml,
  ledgerCanOpenPreview,
  ledgerVoucherNumberFromMovement,
  ledgerVoucherTypeFromMovement,
} from './itemLedgerHelpers'
import type { Branch, CostCenter, TenantUserItem, Warehouse } from '../../types'
import PageSizeSelect from '../../components/ui/PageSizeSelect'
import ReportFooter from '../../components/ui/ReportFooter'
import { asArray } from '../../utils/asArray'
import { getDefaultDateRange, getReportPeriodRange, formatDisplayDate, type ReportPeriodKey } from '../../utils/date'
import { ArrowRight, Eye, Printer, Columns3, FileSpreadsheet, FileText } from 'lucide-react'
import { usePersistedColumnVisibility } from '../../hooks/usePersistedColumnVisibility'

type LedgerColumnKey =
  | 'date'
  | 'voucher'
  | 'voucher_number'
  | 'quantity_in'
  | 'quantity_out'
  | 'running_balance'
  | 'created_by'
  | 'actions'
const LEDGER_COLUMN_KEYS: LedgerColumnKey[] = [
  'date',
  'voucher',
  'voucher_number',
  'quantity_in',
  'quantity_out',
  'running_balance',
  'created_by',
  'actions',
]
/** إصدار المفتاح: تغيير أسماء الأعمدة (المصدر → السند + رقم السند) */
const LEDGER_COLUMNS_STORAGE_KEY = 'itemLedgerVisibleColumns_v2'

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

const defaultCustomRange = getDefaultDateRange()

export default function ItemLedger() {
  const { id } = useParams<{ id: string }>()
  const itemId = Number(id)
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0

  const [periodPreset, setPeriodPreset] = useState<ReportPeriodKey | 'custom'>('all')
  const [dateFrom, setDateFrom] = useState(defaultCustomRange.dateFrom)
  const [dateTo, setDateTo] = useState(defaultCustomRange.dateTo)

  const [warehouseId, setWarehouseId] = useState('')
  const [branchId, setBranchId] = useState('')
  const [costCenterId, setCostCenterId] = useState('')
  const [createdByUserId, setCreatedByUserId] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [previewMovement, setPreviewMovement] = useState<MovementRow | null>(null)

  const [visibleColumns, setVisibleColumns] = usePersistedColumnVisibility(LEDGER_COLUMNS_STORAGE_KEY, LEDGER_COLUMN_KEYS)
  const [showColumnsMenu, setShowColumnsMenu] = useState(false)
  const columnsMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (columnsMenuRef.current && !columnsMenuRef.current.contains(e.target as Node)) setShowColumnsMenu(false)
    }
    if (showColumnsMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showColumnsMenu])

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
    if (createdByUserId) p.created_by = createdByUserId
    return p
  }, [periodPreset, dateFrom, dateTo, warehouseId, branchId, costCenterId, createdByUserId])

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
  const tenantUsers: TenantUserItem[] = asArray<TenantUserItem>(tenantUsersData).filter((u) => u.pivot?.is_active !== false)

  const { data: settings } = useQuery({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const { data, isLoading, error } = useQuery<ItemLedgerResponse>({
    queryKey: ['item-ledger', tenantId, itemId, periodPreset, dateFrom, dateTo, warehouseId, branchId, costCenterId, createdByUserId],
    queryFn: () => fetchItemMovements(tenantId, itemId, Object.keys(apiParams).length ? apiParams : undefined),
    enabled: !!tenantId && !!itemId,
  })

  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const qtyDecimals = Math.min(6, Math.max(0, Math.floor(Number(settings?.doc_quantity_decimals ?? 2))))
  const fmtQty = (n: number) =>
    Number(n).toLocaleString(locale, { minimumFractionDigits: qtyDecimals, maximumFractionDigits: qtyDecimals })
  /** محاذاة رؤوس الجدول */
  const textAlign = isRtl ? 'text-right' : 'text-left'

  const showCustomDateFields = periodPreset === 'custom'
  const labelFrom = lang === 'ar' ? 'من تاريخ' : 'From date'
  const labelTo = lang === 'ar' ? 'إلى تاريخ' : 'To date'
  const labelPeriod = lang === 'ar' ? 'الفترة' : 'Period'
  const labelBranch = lang === 'ar' ? 'الفرع' : 'Branch'
  const labelWarehouse = t.nav?.warehouses ?? (lang === 'ar' ? 'المخازن' : 'Warehouses')
  const labelCostCenter = lang === 'ar' ? 'مركز التكلفة' : 'Cost center'
  const labelUser = lang === 'ar' ? 'المستخدم' : 'User'

  function applyPeriodPreset(preset: ReportPeriodKey | 'custom') {
    setPeriodPreset(preset)
    if (preset === 'custom') {
      const dr = getDefaultDateRange()
      setDateFrom(dr.dateFrom)
      setDateTo(dr.dateTo)
    }
  }

  const inv = t.inventory

  const columnLabels: Record<LedgerColumnKey, string> = {
    date: t.date,
    voucher: inv.ledgerVoucher ?? (lang === 'ar' ? 'السند' : 'Voucher'),
    voucher_number: inv.ledgerVoucherNumber ?? (lang === 'ar' ? 'رقم السند' : 'Voucher no.'),
    quantity_in: inv.quantityIn,
    quantity_out: inv.quantityOut,
    running_balance: inv.runningBalance,
    created_by: inv.createdBy,
    actions: t.actions,
  }

  const visibleColumnKeys = LEDGER_COLUMN_KEYS.filter((k) => visibleColumns[k])

  const movements: MovementRow[] = data?.movements ?? []
  const totalFiltered = movements.length
  const lastPage = Math.max(1, Math.ceil(totalFiltered / pageSize) || 1)

  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize
    return movements.slice(start, start + pageSize)
  }, [movements, page, pageSize])

  const ledgerTfoot = useMemo(() => {
    const keys = visibleColumnKeys
    const hasQtyCol = keys.some((k) => k === 'quantity_in' || k === 'quantity_out' || k === 'running_balance')
    if (!hasQtyCol) return null

    let sumIn = 0
    let sumOut = 0
    for (const m of movements) {
      sumIn += Number(m.quantity_in) || 0
      sumOut += Number(m.quantity_out) || 0
    }
    const net = sumIn - sumOut

    const baseTd =
      'border-t-2 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/80'
    const cells: ReactElement[] = []
    let i = 0
    while (i < keys.length) {
      const k = keys[i]
      if (k === 'quantity_in') {
        cells.push(
          <td
            key={`tf-${i}`}
            className={`${textAlign} px-3 py-2.5 font-semibold tabular-nums text-xs text-emerald-700 dark:text-emerald-400 ${baseTd}`}
            title={lang === 'ar' ? 'إجمالي الوارد' : 'Total in'}
          >
            {fmtQty(sumIn)}
          </td>,
        )
        i += 1
      } else if (k === 'quantity_out') {
        cells.push(
          <td
            key={`tf-${i}`}
            className={`${textAlign} px-3 py-2.5 font-semibold tabular-nums text-xs text-red-700 dark:text-red-400 ${baseTd}`}
            title={lang === 'ar' ? 'إجمالي الصادر' : 'Total out'}
          >
            {fmtQty(sumOut)}
          </td>,
        )
        i += 1
      } else if (k === 'running_balance') {
        cells.push(
          <td
            key={`tf-${i}`}
            className={`${textAlign} px-3 py-2.5 font-semibold tabular-nums text-xs text-slate-800 dark:text-slate-200 ${baseTd}`}
            title={lang === 'ar' ? 'الفرق (وارد − صادر)' : 'Net (in − out)'}
          >
            {fmtQty(net)}
          </td>,
        )
        i += 1
      } else {
        let j = i
        while (
          j < keys.length &&
          keys[j] !== 'quantity_in' &&
          keys[j] !== 'quantity_out' &&
          keys[j] !== 'running_balance'
        ) {
          j += 1
        }
        const span = Math.max(1, j - i)
        const hasQtyAfter = keys
          .slice(j)
          .some((kk) => kk === 'quantity_in' || kk === 'quantity_out' || kk === 'running_balance')
        cells.push(
          <td
            key={`tf-p-${i}`}
            colSpan={span}
            className={`${textAlign} px-3 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 ${baseTd}`}
          >
            {i === 0 && hasQtyAfter ? (lang === 'ar' ? 'الإجمالي' : 'Total') : ''}
          </td>,
        )
        i = j
      }
    }

    return (
      <tfoot>
        <tr>{cells}</tr>
      </tfoot>
    )
  }, [visibleColumnKeys, movements, fmtQty, textAlign, lang])

  useEffect(() => {
    setPage(1)
  }, [costCenterId, createdByUserId, warehouseId, branchId, periodPreset, dateFrom, dateTo])

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

  function handlePrintTable() {
    if (!data || visibleColumnKeys.length === 0) return
    const movements: MovementRow[] = data.movements ?? []
    const headers = visibleColumnKeys.map((k) => columnLabels[k])
    const rowsHtml = movements.map((m) => {
      const cells = visibleColumnKeys.map((k) => {
        if (k === 'date') return `<td>${escHtml(formatDisplayDate(m.date))}</td>`
        if (k === 'voucher') return `<td>${escHtml(ledgerVoucherTypeFromMovement(m, inv))}</td>`
        if (k === 'voucher_number') return `<td>${escHtml(ledgerVoucherNumberFromMovement(m))}</td>`
        if (k === 'quantity_in') return `<td class="num">${m.quantity_in ? escHtml(fmtQty(m.quantity_in)) : '—'}</td>`
        if (k === 'quantity_out') return `<td class="num">${m.quantity_out ? escHtml(fmtQty(m.quantity_out)) : '—'}</td>`
        if (k === 'running_balance') return `<td class="num">${escHtml(fmtQty(m.balance_after))}</td>`
        if (k === 'created_by') return `<td>${escHtml(m.created_by_name ?? '—')}</td>`
        if (k === 'actions') return '<td></td>'
        return '<td>—</td>'
      })
      return `<tr>${cells.join('')}</tr>`
    }).join('')
    const headerCells = headers.map((h) => `<th>${escHtml(h)}</th>`).join('')
    const title = t.inventory.itemLedgerTitle
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
<!DOCTYPE html><html dir="${isRtl ? 'rtl' : 'ltr'}"><head>
<meta charset="utf-8"><title>${escHtml(title)}</title>
<style>body{font-family:Arial,sans-serif;padding:24px;} table{width:100%;border-collapse:collapse;} th,td{border:1px solid #ddd;padding:8px;} th{background:#f1f5f9;} td.num{text-align:end;}</style>
</head><body><h2>${escHtml(title)}</h2><table><thead><tr>${headerCells}</tr></thead><tbody>${rowsHtml}</tbody></table></body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => {
      win.print()
      win.close()
    }, 300)
  }

  function handleExportExcel() {
    if (!data || !data.movements?.length || visibleColumnKeys.length === 0) return
    const headers = visibleColumnKeys.map((k) => columnLabels[k])
    const lines = [headers.join(',')]
    for (const m of data.movements) {
      const cells = visibleColumnKeys.map((k) => {
        if (k === 'date') return formatDisplayDate(m.date)
        if (k === 'voucher') return ledgerVoucherTypeFromMovement(m, inv)
        if (k === 'voucher_number') {
          const num = ledgerVoucherNumberFromMovement(m)
          return num === '—' ? '' : num
        }
        if (k === 'quantity_in') return m.quantity_in ? String(m.quantity_in) : ''
        if (k === 'quantity_out') return m.quantity_out ? String(m.quantity_out) : ''
        if (k === 'running_balance') return String(m.balance_after)
        if (k === 'created_by') return m.created_by_name ?? ''
        if (k === 'actions') return ''
        return ''
      })
      lines.push(cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    }
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `item-ledger-${itemId}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (error || (!isLoading && !data)) {
    return (
      <div className="p-6">
        <p className="text-red-600">{t.msg?.errorOccurred ?? 'حدث خطأ'}</p>
        <Link to="/items" className="inline-flex items-center gap-2 mt-2 text-primary-600 hover:text-primary-500">
          <ArrowRight size={18} className={isRtl ? 'rotate-180' : ''} />
          {t.back}
        </Link>
      </div>
    )
  }

  return (
    <div className="px-0 pt-3 pb-6 space-y-4 w-full min-w-0 max-w-full">
      <div className="flex items-center flex-wrap gap-2 border-b border-slate-200 pb-2">
        <div className="flex items-center gap-2 shrink-0">
          <Link to="/items" className="text-slate-600 hover:text-slate-900 p-0.5 -m-0.5">
            <ArrowRight size={18} className={isRtl ? 'rotate-180' : ''} />
          </Link>
          <h1 className="text-base font-semibold text-slate-900 leading-tight">{t.inventory.itemLedgerTitle}</h1>
        </div>
        <div className="flex-1 flex justify-center min-w-0">
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <span className="text-sm text-slate-600 shrink-0">{labelPeriod}</span>
            <select
              value={periodPreset}
              onChange={(e) => applyPeriodPreset((e.target.value as ReportPeriodKey | 'custom') || 'all')}
              className="h-9 border border-slate-300 rounded-lg px-3 text-sm min-w-[140px] max-w-[220px] bg-white shrink-0"
              title={labelPeriod}
            >
              {periodOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{lang === 'ar' ? opt.labelAr : opt.labelEn}</option>
              ))}
            </select>
            {showCustomDateFields && (
              <>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-slate-600 whitespace-nowrap">{labelFrom}</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="h-9 border border-slate-300 rounded-lg px-3 text-sm bg-white w-[140px] min-w-0"
                    title={labelFrom}
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-slate-600 whitespace-nowrap">{labelTo}</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="h-9 border border-slate-300 rounded-lg px-3 text-sm bg-white w-[140px] min-w-0"
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
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 border border-slate-300 text-slate-600 hover:bg-slate-50"
            title={lang === 'ar' ? 'تخصيص الأعمدة' : 'Customize columns'}
          >
            <Columns3 size={15} />
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={!data || movements.length === 0}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
            title={lang === 'ar' ? 'تصدير Excel' : 'Export Excel'}
          >
            <FileSpreadsheet size={15} />
          </button>
          <button
            type="button"
            onClick={handlePrintTable}
            disabled={!data}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-50"
            title={lang === 'ar' ? 'تصدير PDF' : 'Export PDF'}
          >
            <FileText size={15} />
          </button>
          <button
            type="button"
            onClick={handlePrintTable}
            disabled={!data}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            title={lang === 'ar' ? 'طباعة' : 'Print'}
          >
            <Printer size={15} />
          </button>
          {showColumnsMenu && (
            <div className="absolute top-full end-0 z-50 mt-2 w-64 rounded-lg border border-slate-200 bg-white shadow-lg py-2 text-sm">
              <div className="px-3 pb-2 text-xs font-semibold text-slate-500 border-b border-slate-100">
                {lang === 'ar' ? 'إظهار/إخفاء الأعمدة' : 'Show / hide columns'}
              </div>
              {LEDGER_COLUMN_KEYS.map((key) => (
                <label key={key} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={visibleColumns[key]}
                    onChange={() =>
                      setVisibleColumns((prev) => {
                        const next = { ...prev, [key]: !prev[key] }
                        if (!LEDGER_COLUMN_KEYS.some((k) => next[k])) return prev
                        return next
                      })
                    }
                    className="rounded border-slate-300"
                  />
                  <span>{columnLabels[key]}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* فلاتر — نفس تنسيق خلايا الفلاتر في أرصدة العملاء */}
      <div
        className="no-print bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex flex-wrap items-stretch gap-3"
        aria-label={lang === 'ar' ? 'تصفية الحركات' : 'Movement filters'}
      >
        <div className="min-w-[180px] flex-1 basis-[180px] max-w-[280px] flex">
          <select
            id="item-ledger-branch"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="w-full h-9 box-border border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-0 text-sm leading-none bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none"
            aria-label={labelBranch}
            title={labelBranch}
          >
            <option value="">{labelBranch}</option>
            {branches.filter((b) => b.is_active).map((b) => (
              <option key={b.id} value={String(b.id)}>{b.code ? `${b.code} - ` : ''}{b.name}</option>
            ))}
          </select>
        </div>
        <div className="min-w-[180px] flex-1 basis-[180px] max-w-[280px] flex">
          <select
            id="item-ledger-warehouse"
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            className="w-full h-9 box-border border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-0 text-sm leading-none bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none"
            aria-label={labelWarehouse}
            title={labelWarehouse}
          >
            <option value="">{labelWarehouse}</option>
            {warehouses.filter((w) => w.is_active).map((w) => (
              <option key={w.id} value={String(w.id)}>{w.name}</option>
            ))}
          </select>
        </div>
        <div className="min-w-[180px] flex-1 basis-[180px] max-w-[280px] flex">
          <select
            id="item-ledger-cost-center"
            value={costCenterId}
            onChange={(e) => setCostCenterId(e.target.value)}
            className="w-full h-9 box-border border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-0 text-sm leading-none bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none"
            aria-label={labelCostCenter}
            title={labelCostCenter}
          >
            <option value="">{labelCostCenter}</option>
            {costCenters.filter((c) => c.is_active).map((c) => (
              <option key={c.id} value={String(c.id)}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="min-w-[180px] flex-1 basis-[180px] max-w-[280px] flex">
          <select
            id="item-ledger-user"
            value={createdByUserId}
            onChange={(e) => setCreatedByUserId(e.target.value)}
            className="w-full h-9 box-border border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-0 text-sm leading-none bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none"
            aria-label={labelUser}
            title={labelUser}
          >
            <option value="">{labelUser}</option>
            {tenantUsers.map((u) => (
              <option key={u.id} value={String(u.id)}>{u.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center shrink-0">
          <PageSizeSelect
            value={pageSize}
            onChange={(n) => {
              setPageSize(n)
              setPage(1)
            }}
            showLabel={false}
            ariaLabel={lang === 'ar' ? 'عدد السجلات في الصفحة' : 'Rows per page'}
            className="!text-sm"
          />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col min-h-0">
        {isLoading ? (
          <div className="flex justify-center items-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : (
          <div className="overflow-auto max-h-[calc(100vh-20rem)] w-full min-w-0">
            <table className="w-full table-auto text-xs">
              <thead className="sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm">
                <tr className="text-slate-500">
                  {visibleColumnKeys.map((k) => {
                    const base = `${textAlign} px-3 py-3 font-normal text-[11px] uppercase tracking-wider`
                    if (k === 'date') return <th key={k} className={`${base} w-24`}>{columnLabels[k]}</th>
                    if (k === 'voucher') return <th key={k} className={`${base} min-w-[120px]`}>{columnLabels[k]}</th>
                    if (k === 'voucher_number') return <th key={k} className={`${base} min-w-[120px]`}>{columnLabels[k]}</th>
                    if (k === 'quantity_in' || k === 'quantity_out' || k === 'running_balance') {
                      return <th key={k} className={`${textAlign} px-3 py-3 font-normal text-[11px] uppercase tracking-wider w-28 tabular-nums`}>{columnLabels[k]}</th>
                    }
                    if (k === 'created_by') return <th key={k} className={`${base} min-w-[100px]`}>{columnLabels[k]}</th>
                    if (k === 'actions') {
                      return <th key={k} className={`${textAlign} px-3 py-3 font-normal text-[11px] uppercase tracking-wider min-w-[90px]`}>{columnLabels[k]}</th>
                    }
                    return <th key={k} className={base}>{columnLabels[k]}</th>
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {movements.length === 0 ? (
                  <tr>
                    <td colSpan={Math.max(1, visibleColumnKeys.length)} className="text-center py-10 text-slate-400">
                      {t.inventory.noMovements}
                    </td>
                  </tr>
                ) : pagedRows.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-100/80 transition-colors">
                    {visibleColumnKeys.map((k) => {
                      if (k === 'date') {
                        return <td key={k} className="px-3 py-3.5 text-slate-500 text-xs">{formatDisplayDate(m.date)}</td>
                      }
                      if (k === 'voucher') {
                        return (
                          <td key={k} className="px-3 py-3.5 text-slate-600 text-xs">
                            {ledgerVoucherTypeFromMovement(m, inv)}
                          </td>
                        )
                      }
                      if (k === 'voucher_number') {
                        return (
                          <td key={k} className="px-3 py-3.5 font-normal text-slate-800 font-mono text-[11px]">
                            {ledgerVoucherNumberFromMovement(m)}
                          </td>
                        )
                      }
                      if (k === 'quantity_in') {
                        return (
                          <td key={k} className="px-3 py-3.5 font-normal text-emerald-600 tabular-nums text-xs">
                            {m.quantity_in ? fmtQty(m.quantity_in) : '—'}
                          </td>
                        )
                      }
                      if (k === 'quantity_out') {
                        return (
                          <td key={k} className="px-3 py-3.5 font-normal text-red-600 tabular-nums text-xs">
                            {m.quantity_out ? fmtQty(m.quantity_out) : '—'}
                          </td>
                        )
                      }
                      if (k === 'running_balance') {
                        return (
                          <td key={k} className="px-3 py-3.5 font-normal text-slate-800 tabular-nums text-xs">
                            {fmtQty(m.balance_after)}
                          </td>
                        )
                      }
                      if (k === 'created_by') {
                        return <td key={k} className="px-3 py-3.5 text-slate-500 text-xs">{m.created_by_name ?? '—'}</td>
                      }
                      if (k === 'actions') {
                        const canPreview = ledgerCanOpenPreview(m)
                        return (
                          <td key={k} className="px-3 py-3.5 overflow-visible align-middle">
                            <div className="flex flex-wrap items-center gap-2">
                              {canPreview && (
                                <button
                                  type="button"
                                  onClick={() => setPreviewMovement(m)}
                                  className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-500 text-xs"
                                  title={t.inventory.viewSource}
                                >
                                  <Eye size={14} /> {t.inventory.viewSource}
                                </button>
                              )}
                            </div>
                          </td>
                        )
                      }
                      return <td key={k} className="px-3 py-3.5" />
                    })}
                  </tr>
                ))}
              </tbody>
              {!isLoading && movements.length > 0 && ledgerTfoot}
            </table>
          </div>
        )}
        {!isLoading && totalFiltered > 0 && (
          <ReportFooter
            totalCount={totalFiltered}
            currentPage={page}
            lastPage={lastPage}
            from={totalFiltered === 0 ? 0 : (page - 1) * pageSize + 1}
            to={totalFiltered === 0 ? 0 : Math.min(page * pageSize, totalFiltered)}
            onPageChange={setPage}
            lang={lang === 'ar' ? 'ar' : 'en'}
            isRtl={isRtl}
            alwaysShowPaginationBar
            showRecordSummary={totalFiltered > 0}
            recordLabel={lang === 'ar' ? 'حركة' : 'movement'}
            totalsInBar
          />
        )}
      </div>

      {previewMovement && (
        <ItemLedgerDocumentPreviewModal
          movement={previewMovement}
          ledgerItemId={itemId}
          tenantId={tenantId}
          onClose={() => setPreviewMovement(null)}
        />
      )}
    </div>
  )
}
