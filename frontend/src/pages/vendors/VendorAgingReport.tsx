import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { useDocumentTitleContext } from '../../contexts/DocumentTitleContext'
import { fetchVendorAging, fetchBranches, fetchCostCenters, fetchCurrencies, fetchVendorGroups, fetchSettings } from '../../api/tenant'
import type { Branch, CostCenter, Currency, TenantSettings, VendorAgingRow, VendorAgingInvoiceDetail, VendorGroup } from '../../types'
import { asArray } from '../../utils/asArray'
import { formatAmount } from '../../utils/currency'
import { getDefaultDateRange, getReportPeriodRange, type ReportPeriodKey } from '../../utils/date'
import { Columns3, FileSpreadsheet, FileText, Printer, X } from 'lucide-react'
import { usePersistedColumnVisibility } from '../../hooks/usePersistedColumnVisibility'
import { useClientSort } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'
import PageSizeSelect from '../../components/ui/PageSizeSelect'
import ReportFooter from '../../components/ui/ReportFooter'
import {
  filterPeriodBarDateInputClass,
  filterPeriodBarSelectClass,
  filterReportSelectNineClass,
} from '../../utils/filterControlStyles'

const AGING_COLUMN_KEYS = [
  'account',
  'vendor',
  'branch',
  'not_yet_due',
  'days_1_30',
  'days_31_60',
  'days_61_90',
  'over_90',
  'total',
] as const
type AgingColumnKey = (typeof AGING_COLUMN_KEYS)[number]

const AGING_COLUMNS_STORAGE = 'vendor-aging-column-visibility'
const TEXT_COL_KEYS: AgingColumnKey[] = ['account', 'vendor', 'branch']
const TEXT_KEY_SET = new Set<AgingColumnKey>(TEXT_COL_KEYS)

const DETAIL_BUCKET_KEYS: Array<'not_yet_due' | 'days_1_30' | 'days_31_60' | 'days_61_90' | 'over_90'> = [
  'not_yet_due',
  'days_1_30',
  'days_31_60',
  'days_61_90',
  'over_90',
]

function detailLinesForCell(row: VendorAgingRow, key: AgingColumnKey): VendorAgingInvoiceDetail[] {
  if (!row.details) return []
  if (key === 'total') return DETAIL_BUCKET_KEYS.flatMap((k) => row.details?.[k] ?? [])
  if (DETAIL_BUCKET_KEYS.includes(key as any)) return (row.details as any)[key] ?? []
  return []
}

export default function VendorAgingReport() {
  const { currentTenant } = useAuth()
  const { lang, isRtl } = useLanguage()
  const { setPageTitle } = useDocumentTitleContext()
  const tenantId = currentTenant?.id ?? 0

  const { data: settings } = useQuery<TenantSettings>({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const amountDecimals = typeof settings?.doc_amount_decimals === 'number' ? settings.doc_amount_decimals : 2
  const fmt = (n: number) => formatAmount(n, { decimal_places: amountDecimals }, locale)

  const defaultRange = useMemo(() => getDefaultDateRange(), [])
  const [dateFrom, setDateFrom] = useState(defaultRange.dateFrom)
  const [dateTo, setDateTo] = useState(defaultRange.dateTo)
  const [periodPreset, setPeriodPreset] = useState<ReportPeriodKey | 'custom'>('all')
  const asOfDate = dateTo || new Date().toISOString().slice(0, 10)

  const [branchId, setBranchId] = useState<number | ''>('')
  const [costCenterId, setCostCenterId] = useState<number | ''>('')
  const [currency, setCurrency] = useState<string>('')
  const [vendorGroupId, setVendorGroupId] = useState<number | ''>('')

  const [perPage, setPerPage] = useState(25)
  const [page, setPage] = useState(1)

  const [showColumnsMenu, setShowColumnsMenu] = useState(false)
  const columnsMenuRef = useRef<HTMLDivElement>(null)
  const [agingModal, setAgingModal] = useState<{ title: string; lines: VendorAgingInvoiceDetail[] } | null>(null)
  const [visibleColumns, setVisibleColumns] = usePersistedColumnVisibility<AgingColumnKey>(
    AGING_COLUMNS_STORAGE,
    AGING_COLUMN_KEYS,
  )

  useEffect(() => {
    setPageTitle(lang === 'ar' ? 'أعمار ديون الموردين' : 'Accounts payable aging')
    return () => setPageTitle(null)
  }, [lang, setPageTitle])

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
    if (!agingModal) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAgingModal(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [agingModal])

  function applyPeriodPreset(preset: ReportPeriodKey | 'custom') {
    setPeriodPreset(preset)
    if (preset !== 'custom') {
      const range = getReportPeriodRange(preset)
      setDateFrom(range.from_date)
      setDateTo(range.to_date)
    }
  }

  const params = useMemo(
    () => ({
      as_of_date: asOfDate,
      invoice_date_from: dateFrom,
      invoice_date_to: dateTo,
      ...(branchId ? { branch_id: Number(branchId) } : {}),
      ...(costCenterId ? { cost_center_id: Number(costCenterId) } : {}),
      ...(currency ? { currency } : {}),
      ...(vendorGroupId ? { vendor_group_id: Number(vendorGroupId) } : {}),
    }),
    [asOfDate, dateFrom, dateTo, branchId, costCenterId, currency, vendorGroupId],
  )

  useEffect(() => {
    setPage(1)
  }, [asOfDate, dateFrom, dateTo, branchId, costCenterId, currency, vendorGroupId])

  const { data: branchesData } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId,
  })
  const branches: Branch[] = asArray<Branch>(branchesData)

  const { data: costCentersData } = useQuery({
    queryKey: ['cost-centers', tenantId],
    queryFn: () => fetchCostCenters(tenantId, { active_only: '1' }),
    enabled: !!tenantId,
  })
  const costCenters: CostCenter[] = Array.isArray(costCentersData) ? costCentersData : ((costCentersData as any)?.data ?? [])

  const { data: currenciesData } = useQuery<Currency[]>({
    queryKey: ['currencies', tenantId],
    queryFn: () => fetchCurrencies(tenantId),
    enabled: !!tenantId,
  })
  const currencies = currenciesData ?? []

  const { data: vendorGroups } = useQuery<VendorGroup[]>({
    queryKey: ['vendor-groups', tenantId],
    queryFn: () => fetchVendorGroups(tenantId),
    enabled: !!tenantId,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['vendorAging', tenantId, params],
    queryFn: () => fetchVendorAging(tenantId, params),
    enabled: !!tenantId,
  })

  const rows: VendorAgingRow[] = data?.data ?? []

  const sortColumns = useMemo(
    () =>
      AGING_COLUMN_KEYS.map((key) => ({
        key,
        type: (TEXT_KEY_SET.has(key) ? 'string' : 'number') as 'string' | 'number',
        getValue: (r: VendorAgingRow) => agingCellRaw(r, key),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang],
  )
  const { sort, toggleSort, sortedRows } = useClientSort<VendorAgingRow, AgingColumnKey>(rows, sortColumns, { locale })

  const visibleColumnOrder = useMemo(() => AGING_COLUMN_KEYS.filter((k) => visibleColumns[k]), [visibleColumns])

  const lastPage = Math.max(1, Math.ceil(sortedRows.length / perPage) || 1)
  const effectivePage = Math.min(Math.max(1, page), lastPage)
  useEffect(() => {
    setPage((p) => (p > lastPage ? lastPage : p))
  }, [lastPage])

  const pagedRows = useMemo(() => {
    const start = (effectivePage - 1) * perPage
    return sortedRows.slice(start, start + perPage)
  }, [sortedRows, effectivePage, perPage])

  const totals = useMemo(() => {
    const t = { not_yet_due: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, over_90: 0, total: 0 }
    rows.forEach((r) => {
      t.not_yet_due += r.not_yet_due
      t.days_1_30 += r.days_1_30
      t.days_31_60 += r.days_31_60
      t.days_61_90 += r.days_61_90
      t.over_90 += r.over_90
      t.total += r.total
    })
    return t
  }, [rows])

  function toggleAgingColumn(key: AgingColumnKey) {
    setVisibleColumns((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      const count = AGING_COLUMN_KEYS.filter((k) => next[k]).length
      if (count === 0) return prev
      if (!TEXT_COL_KEYS.some((k) => next[k])) return prev
      return next
    })
  }

  function agingColumnLabel(key: AgingColumnKey): string {
    switch (key) {
      case 'account':
        return lang === 'ar' ? 'رقم الحساب' : 'Account'
      case 'vendor':
        return lang === 'ar' ? 'اسم المورد' : 'Vendor'
      case 'branch':
        return lang === 'ar' ? 'الفرع' : 'Branch'
      case 'not_yet_due':
        return lang === 'ar' ? 'غير مستحق بعد' : 'Not yet due'
      case 'days_1_30':
        return lang === 'ar' ? 'من 1 إلى 30 يوم' : '1-30 days'
      case 'days_31_60':
        return lang === 'ar' ? 'من 31 إلى 60 يوم' : '31-60 days'
      case 'days_61_90':
        return lang === 'ar' ? 'من 61 إلى 90 يوم' : '61-90 days'
      case 'over_90':
        return lang === 'ar' ? 'أكثر من 90 يوم' : 'Over 90 days'
      case 'total':
        return lang === 'ar' ? 'الإجمالي' : 'Total'
    }
  }

  function agingCellRaw(r: VendorAgingRow, key: AgingColumnKey): string | number {
    const name = lang === 'ar' ? r.vendor_name : r.vendor_name_en || r.vendor_name
    const branch = lang === 'ar' ? r.branch_name : r.branch_name_en || r.branch_name
    switch (key) {
      case 'account':
        return r.account_code
      case 'vendor':
        return name ?? ''
      case 'branch':
        return branch ?? ''
      case 'not_yet_due':
        return r.not_yet_due
      case 'days_1_30':
        return r.days_1_30
      case 'days_31_60':
        return r.days_31_60
      case 'days_61_90':
        return r.days_61_90
      case 'over_90':
        return r.over_90
      case 'total':
        return r.total
    }
  }

  function agingTotalForKey(key: AgingColumnKey): number {
    switch (key) {
      case 'not_yet_due':
        return totals.not_yet_due
      case 'days_1_30':
        return totals.days_1_30
      case 'days_31_60':
        return totals.days_31_60
      case 'days_61_90':
        return totals.days_61_90
      case 'over_90':
        return totals.over_90
      case 'total':
        return totals.total
      default:
        return 0
    }
  }

  const handleExportExcel = () => {
    const keys = visibleColumnOrder
    const headers = keys.map((k) => agingColumnLabel(k))
    const lines = [headers.join(',')]
    sortedRows.forEach((r) => {
      const cells = keys.map((key) => {
        const v = agingCellRaw(r, key)
        return typeof v === 'number' ? String(v) : String(v)
      })
      lines.push(cells.join(','))
    })
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vendor-aging-${dateFrom}-${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handlePrint = () => window.print()

  if (!tenantId) {
    return (
      <div className="p-6">
        <p className="text-amber-600">{lang === 'ar' ? 'يرجى اختيار الشركة أولاً.' : 'Please select a company first.'}</p>
      </div>
    )
  }

  const textAlign = isRtl ? 'text-right' : 'text-left'
  const numAlign = 'text-center tabular-nums'
  const filterSelectCls = filterReportSelectNineClass
  const showCustomDateFields = periodPreset === 'custom'

  const textColsVisible = TEXT_COL_KEYS.filter((k) => visibleColumns[k]).length
  const labelFooterColSpan = Math.max(1, textColsVisible)
  const numericColsVisible = AGING_COLUMN_KEYS.filter((k) => visibleColumns[k] && !TEXT_KEY_SET.has(k))

  return (
    <div className="py-3 px-2 space-y-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2">
        <div className="no-print flex flex-wrap items-center justify-between gap-2 gap-y-1.5 min-h-0 py-0.5">
          <h1 className="text-base font-semibold leading-tight text-slate-900 dark:text-slate-100 shrink-0">
            {lang === 'ar' ? 'أعمار ديون الموردين' : 'Accounts payable aging'}
          </h1>

          <div className="flex flex-1 justify-center items-center min-w-0">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-slate-600 dark:text-slate-400 shrink-0">{lang === 'ar' ? 'الفترة' : 'Period'}</span>
                <select
                  value={periodPreset}
                  onChange={(e) => applyPeriodPreset((e.target.value as ReportPeriodKey | 'custom') || 'all')}
                  className={filterPeriodBarSelectClass}
                >
                  {([
                    { value: 'all', labelAr: 'الكل', labelEn: 'All' },
                    { value: 'custom', labelAr: 'تاريخ مخصص', labelEn: 'Custom Date' },
                    { value: 'today', labelAr: 'اليوم', labelEn: 'Today' },
                    { value: 'yesterday', labelAr: 'الأمس', labelEn: 'Yesterday' },
                    { value: 'this_week', labelAr: 'هذا الأسبوع', labelEn: 'This Week' },
                    { value: 'last_week', labelAr: 'الأسبوع السابق', labelEn: 'Last Week' },
                    { value: 'this_month', labelAr: 'هذا الشهر', labelEn: 'This Month' },
                    { value: 'last_month', labelAr: 'الشهر السابق', labelEn: 'Last Month' },
                    { value: 'this_year', labelAr: 'هذه السنة', labelEn: 'This Year' },
                  ] as any[]).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {lang === 'ar' ? opt.labelAr : opt.labelEn}
                    </option>
                  ))}
                </select>
              </div>
              {showCustomDateFields && (
                <div className="flex flex-wrap items-center gap-2 justify-center">
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">{lang === 'ar' ? 'من تاريخ' : 'From'}</span>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className={filterPeriodBarDateInputClass}
                    />
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">{lang === 'ar' ? 'إلى تاريخ' : 'To'}</span>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className={filterPeriodBarDateInputClass}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="relative flex items-center gap-1 shrink-0" ref={columnsMenuRef}>
            <button
              type="button"
              onClick={() => setShowColumnsMenu((v) => !v)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600"
              title={lang === 'ar' ? 'تخصيص الأعمدة' : 'Customize columns'}
            >
              <Columns3 size={15} />
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={isLoading}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
              title={lang === 'ar' ? 'تصدير Excel' : 'Export Excel'}
            >
              <FileSpreadsheet size={15} />
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={isLoading}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-800 dark:bg-slate-600 text-white hover:bg-slate-700 dark:hover:bg-slate-500 disabled:opacity-50"
              title={lang === 'ar' ? 'تصدير PDF' : 'Export PDF'}
            >
              <FileText size={15} />
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={isLoading}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 disabled:opacity-50"
              title={lang === 'ar' ? 'طباعة التقرير' : 'Print report'}
            >
              <Printer size={15} />
            </button>
            {showColumnsMenu && (
              <div className={`absolute top-full z-50 mt-2 w-64 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 py-2 shadow-lg text-sm ${isRtl ? 'right-0' : 'left-0'}`}>
                <div className="px-3 pb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {lang === 'ar' ? 'إظهار/إخفاء الأعمدة' : 'Show / hide columns'}
                </div>
                {AGING_COLUMN_KEYS.map((key) => (
                  <label key={key} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800">
                    <input
                      type="checkbox"
                      checked={visibleColumns[key]}
                      onChange={() => toggleAgingColumn(key)}
                      className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-200">{agingColumnLabel(key)}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex flex-wrap items-stretch gap-3 no-print">
        <div className="min-w-[180px] flex-1 basis-[180px] max-w-[280px] flex">
          <select
            value={vendorGroupId === '' ? '' : String(vendorGroupId)}
            onChange={(e) => setVendorGroupId(e.target.value ? Number(e.target.value) : '')}
            className={filterSelectCls}
            title={lang === 'ar' ? 'فئة المورد' : 'Vendor group'}
          >
            <option value="">{lang === 'ar' ? 'كل فئات الموردين' : 'All vendor groups'}</option>
            {(vendorGroups ?? []).filter((g) => g.is_active).map((g) => (
              <option key={g.id} value={g.id}>
                {lang === 'ar' ? g.name : g.name_en || g.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[180px] flex-1 basis-[180px] max-w-[280px] flex">
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={filterSelectCls} title={lang === 'ar' ? 'العملة' : 'Currency'}>
            <option value="">{lang === 'ar' ? 'كل العملات' : 'All currencies'}</option>
            {currencies.filter((c) => c.is_active).map((c) => (
              <option key={c.id} value={c.code}>
                {c.code}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[180px] flex-1 basis-[180px] max-w-[280px] flex">
          <select value={branchId === '' ? '' : String(branchId)} onChange={(e) => setBranchId(e.target.value ? Number(e.target.value) : '')} className={filterSelectCls} title={lang === 'ar' ? 'الفرع' : 'Branch'}>
            <option value="">{lang === 'ar' ? 'كل الفروع' : 'All branches'}</option>
            {branches.filter((b) => b.is_active).map((b) => (
              <option key={b.id} value={b.id}>
                {lang === 'ar' ? b.name : b.name_en || b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[180px] flex-1 basis-[180px] max-w-[280px] flex">
          <select value={costCenterId === '' ? '' : String(costCenterId)} onChange={(e) => setCostCenterId(e.target.value ? Number(e.target.value) : '')} className={filterSelectCls} title={lang === 'ar' ? 'مركز التكلفة' : 'Cost center'}>
            <option value="">{lang === 'ar' ? 'كل المراكز' : 'All cost centers'}</option>
            {costCenters.filter((c) => c.is_active).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[120px] flex-1 basis-[120px] max-w-[200px] flex items-center">
          <PageSizeSelect
            value={perPage}
            onChange={(v) => {
              setPerPage(v)
              setPage(1)
            }}
            showLabel={false}
            ariaLabel={lang === 'ar' ? 'عدد السجلات' : 'Records per page'}
            className="w-full min-w-0"
          />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col min-h-0">
        <div className="overflow-x-auto flex-1 min-h-0">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-500 border-t-transparent" />
            </div>
          ) : (
            <table className="w-full text-sm table-fixed" dir={isRtl ? 'rtl' : 'ltr'}>
              <thead className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-600 sticky top-0 z-10">
                <tr>
                  {AGING_COLUMN_KEYS.filter((k) => visibleColumns[k]).map((key) => (
                    <SortableTh
                      key={key}
                      label={agingColumnLabel(key)}
                      sortKey={key}
                      sortState={sort}
                      onToggle={toggleSort}
                      className={`font-medium text-slate-700 dark:text-slate-200 ${TEXT_KEY_SET.has(key) ? textAlign : 'text-center'}`}
                      headerLayout={TEXT_KEY_SET.has(key) ? 'spread' : 'clusterCenter'}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((r) => (
                  <tr key={r.vendor_id} className="border-b border-slate-100 hover:bg-slate-50/50 dark:border-slate-600/50 dark:hover:bg-slate-700/30">
                    {AGING_COLUMN_KEYS.filter((k) => visibleColumns[k]).map((key) => {
                      const raw = agingCellRaw(r, key)
                      const isNum = typeof raw === 'number'
                      const isAccount = key === 'account'
                      const lines = isNum ? detailLinesForCell(r, key) : []
                      const clickable = isNum && raw > 0 && lines.length > 0
                      const vendorLabel = lang === 'ar' ? r.vendor_name : r.vendor_name_en || r.vendor_name

                      if (key === 'vendor') {
                        return (
                          <td key={key} className={`px-4 py-2 ${textAlign}`}>
                            <Link to={`/vendors/${r.vendor_id}`} className="font-medium text-primary-700 hover:underline dark:text-primary-400">
                              {vendorLabel}
                            </Link>
                          </td>
                        )
                      }

                      return (
                        <td
                          key={key}
                          className={`px-4 py-2 ${TEXT_KEY_SET.has(key) ? textAlign : numAlign} ${key === 'total' ? 'font-medium' : ''} ${clickable ? 'cursor-pointer hover:brightness-[0.98] dark:hover:brightness-110' : ''}`}
                          dir={isNum || isAccount ? 'ltr' : undefined}
                          onClick={
                            clickable
                              ? () =>
                                  setAgingModal({
                                    title: `${vendorLabel} — ${agingColumnLabel(key)}`,
                                    lines,
                                  })
                              : undefined
                          }
                          onKeyDown={
                            clickable
                              ? (e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    setAgingModal({
                                      title: `${vendorLabel} — ${agingColumnLabel(key)}`,
                                      lines,
                                    })
                                  }
                                }
                              : undefined
                          }
                          role={clickable ? 'button' : undefined}
                          tabIndex={clickable ? 0 : undefined}
                          title={clickable ? (lang === 'ar' ? 'انقر لعرض الفواتير' : 'Click to view invoices') : undefined}
                        >
                          {isNum ? <span dir="ltr">{fmt(raw)}</span> : String(raw)}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
              {!isLoading && sortedRows.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-100 dark:bg-slate-700 border-t-2 border-slate-300 dark:border-slate-600 font-bold text-slate-800 dark:text-slate-200">
                    <td className={`px-4 py-2 ${textAlign}`} colSpan={labelFooterColSpan}>
                      {lang === 'ar' ? 'الإجمالي' : 'Total'}
                    </td>
                    {numericColsVisible.map((key) => (
                      <td key={key} className={`px-4 py-2 ${numAlign}`} dir="ltr">
                        {fmt(agingTotalForKey(key))}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>
        {!isLoading && data != null && (
          <ReportFooter
            totalCount={sortedRows.length}
            currentPage={effectivePage}
            lastPage={lastPage}
            from={sortedRows.length === 0 ? 0 : (effectivePage - 1) * perPage + 1}
            to={sortedRows.length === 0 ? 0 : Math.min(effectivePage * perPage, sortedRows.length)}
            onPageChange={setPage}
            lang={lang === 'ar' ? 'ar' : 'en'}
            isRtl={isRtl}
            alwaysShowPaginationBar
            showRecordSummary={sortedRows.length > 0}
            recordLabel={lang === 'ar' ? 'مورد' : 'vendor'}
            dense
          />
        )}
      </div>

      {!isLoading && rows.length === 0 && (
        <p className="text-center text-slate-500 dark:text-slate-400 py-8">{lang === 'ar' ? 'لا توجد بيانات لعرضها.' : 'No data to display.'}</p>
      )}

      {agingModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => setAgingModal(null)} role="presentation">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-600 max-w-lg w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-600 shrink-0">
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{lang === 'ar' ? 'تفاصيل الفواتير' : 'Invoice breakdown'}</p>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{agingModal.title}</h2>
              </div>
              <button type="button" onClick={() => setAgingModal(null)} className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={lang === 'ar' ? 'إغلاق' : 'Close'}>
                <X size={18} />
              </button>
            </div>
            <div className="overflow-auto flex-1 min-h-0 px-4 py-3">
              <table className="w-full text-sm border-collapse" dir={isRtl ? 'rtl' : 'ltr'}>
                <thead>
                  <tr className={`border-b border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 ${textAlign}`}>
                    <th className="py-2 pe-2 font-medium">{lang === 'ar' ? 'رقم الفاتورة' : 'Invoice #'}</th>
                    <th className="py-2 pe-2 font-medium">{lang === 'ar' ? 'تاريخ الاستحقاق' : 'Due date'}</th>
                    <th className={`py-2 font-medium ${numAlign}`}>{lang === 'ar' ? 'المبلغ' : 'Amount'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {agingModal.lines.map((line) => (
                    <tr key={line.invoice_id}>
                      <td className="py-2 pe-2 font-mono text-slate-800 dark:text-slate-200" dir="ltr">
                        {line.number || '—'}
                      </td>
                      <td className="py-2 pe-2 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {new Date(line.due_date + 'T12:00:00').toLocaleDateString(locale)}
                      </td>
                      <td className={`py-2 ${numAlign} text-slate-800 dark:text-slate-200`} dir="ltr">
                        {fmt(line.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

