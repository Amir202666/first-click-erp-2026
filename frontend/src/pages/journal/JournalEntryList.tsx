import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchJournalEntries, fetchJournalEntry, deleteJournalEntry, unpostJournalEntry, voidJournalEntry, fetchSettings, fetchBranches, fetchAccounts, fetchCostCenters } from '../../api/tenant'
import { getReportPeriodRange, formatDisplayDate, type ReportPeriodKey } from '../../utils/date'
import { formatAmount } from '../../utils/currency'
import type { Account, CostCenter, JournalEntry, PaginatedResponse } from '../../types'
import { Plus, ChevronDown, ChevronLeft, Eye, Pencil, Trash2, Printer, ExternalLink, X, Undo2, FileText, FileSpreadsheet, Columns3, MoreVertical } from 'lucide-react'
import Toast, { type ToastType } from '../../components/ui/Toast'
import AccountSearchSelect from '../../components/AccountSearchSelect'
import ReportFooter from '../../components/ui/ReportFooter'
import { usePersistedColumnVisibility } from '../../hooks/usePersistedColumnVisibility'
import { useClientSort } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'
import {
  filterBarOverflowClass,
  filterPageSizeSelectClass,
  filterSelectCompactClass,
  filterTextInputClass,
} from '../../utils/filterControlStyles'

const PAGE_SIZES = [10, 25, 50, 100]

const JOURNAL_LIST_COLUMNS_STORAGE = 'journalEntryListVisibleColumns'
const JOURNAL_LIST_COLUMN_KEYS = [
  'number',
  'date',
  'type',
  'branch',
  'costCenter',
  'description',
  'debit',
  'credit',
  'status',
  'actions',
] as const
type JournalListColumnKey = (typeof JOURNAL_LIST_COLUMN_KEYS)[number]

function journalEntryBranchLabel(
  entry: JournalEntry,
  getDisplayName: (x: { name: string; name_en?: string | null }) => string,
): string {
  const b = entry.branch
  if (!b || (!b.name && !b.name_en)) return '—'
  return getDisplayName({ name: b.name ?? '', name_en: b.name_en ?? null })
}

function journalEntryCostCentersLabel(
  entry: JournalEntry,
  getDisplayName: (x: { name: string; name_en?: string | null }) => string,
  sep: string,
): string {
  const byId = new Map<number, { name: string; name_en: string | null }>()
  for (const line of entry.lines ?? []) {
    const cc = line.cost_center
    if (cc?.id != null && !byId.has(cc.id)) {
      byId.set(cc.id, { name: cc.name, name_en: cc.name_en ?? null })
    }
  }
  if (byId.size === 0) return '—'
  return [...byId.values()].map((x) => getDisplayName(x)).join(sep)
}

const statusStyles: Record<string, string> = {
  draft: 'bg-gray-50 text-gray-600 border border-gray-200',
  posted: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  void: 'bg-red-50 text-red-600 border border-red-200',
}

const filterSelectCls = filterSelectCompactClass
const filterTextCls = filterTextInputClass

export default function JournalEntryList() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl, getDisplayName } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const { data: settings } = useQuery({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const fmt = (n: number) => formatAmount(n, { decimal_places: settings?.doc_amount_decimals ?? 2 }, locale)

  const statusLabels: Record<string, string> = {
    draft: t.journal.draft,
    posted: t.journal.posted,
    void: t.journal.void,
  }

  const typeLabels: Record<string, string> = {
    manual: t.journal.types.manual,
    sales: t.journal.types.sales,
    purchase: t.journal.types.purchase,
    expense: t.journal.types.expense,
    payment: t.journal.types.payment,
    transfer: t.journal.types.transfer,
    adjustment: t.journal.types.adjustment,
    opening: t.journal.types.opening,
    closing: t.journal.types.closing,
  }

  const initialAllRange = getReportPeriodRange('all')
  const [fromDate, setFromDate] = useState(initialAllRange.from_date)
  const [toDate, setToDate] = useState(initialAllRange.to_date)
  const [periodPreset, setPeriodPreset] = useState<ReportPeriodKey | 'custom'>('all')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [branchFilter, setBranchFilter] = useState('')
  const [costCenterFilter, setCostCenterFilter] = useState('')
  const [accountFilter, setAccountFilter] = useState('')
  const [descriptionSearch, setDescriptionSearch] = useState('')
  const [pageSize, setPageSize] = useState(25)
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [showColumnsMenu, setShowColumnsMenu] = useState(false)
  const columnsMenuRef = useRef<HTMLDivElement>(null)
  const [visibleColumns, setVisibleColumns] = usePersistedColumnVisibility<JournalListColumnKey>(
    JOURNAL_LIST_COLUMNS_STORAGE,
    JOURNAL_LIST_COLUMN_KEYS,
  )

  const tableColSpan = useMemo(() => {
    const n = JOURNAL_LIST_COLUMN_KEYS.filter((k) => visibleColumns[k]).length
    return 1 + n
  }, [visibleColumns])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (columnsMenuRef.current && !columnsMenuRef.current.contains(e.target as Node)) {
        setShowColumnsMenu(false)
      }
    }
    if (showColumnsMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showColumnsMenu])

  function toggleJournalColumn(key: JournalListColumnKey) {
    setVisibleColumns((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      const count = JOURNAL_LIST_COLUMN_KEYS.filter((k) => next[k]).length
      if (count === 0) return prev
      return next
    })
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
      setFromDate(range.from_date)
      setToDate(range.to_date)
    }
  }

  const { data: branchesData } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId,
  })
  const { data: accountsData } = useQuery({
    queryKey: ['accounts', tenantId],
    queryFn: () => fetchAccounts(tenantId, { per_page: '500', active_only: '1' }),
    enabled: !!tenantId,
  })
  const { data: costCentersData } = useQuery({
    queryKey: ['costCenters', tenantId],
    queryFn: () => fetchCostCenters(tenantId),
    enabled: !!tenantId,
  })
  const branches = branchesData ?? []
  const accounts: Account[] = accountsData ?? []
  const costCenters: CostCenter[] = costCentersData ?? []
  const [viewEntryId, setViewEntryId] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<JournalEntry | null>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const queryClient = useQueryClient()

  const params: Record<string, string> = { per_page: String(pageSize), page: String(page) }
  /* «الكل» = بدون فلتر تاريخ (كل القيود)؛ غير ذلك نرسل من/إلى */
  if (periodPreset !== 'all') {
    if (fromDate) params.from_date = fromDate
    if (toDate) params.to_date = toDate
  }
  if (typeFilter) params.type = typeFilter
  if (statusFilter) params.status = statusFilter
  if (branchFilter) params.branch_id = branchFilter
  if (costCenterFilter) params.cost_center_id = costCenterFilter
  if (accountFilter) params.account_id = accountFilter
  if (descriptionSearch.trim()) params.description = descriptionSearch.trim()

  const { data, isLoading } = useQuery<PaginatedResponse<JournalEntry>>({
    queryKey: ['journalEntries', tenantId, params, pageSize],
    queryFn: () => fetchJournalEntries(tenantId, params),
    enabled: !!tenantId,
  })

  const entries = data?.data ?? []

  const { sort, toggleSort, sortedRows: sortedEntries } = useClientSort(entries, [
    { key: 'number', type: 'string', getValue: (e: JournalEntry) => e.number ?? '' },
    { key: 'date', type: 'date', getValue: (e: JournalEntry) => e.date },
    { key: 'type', type: 'string', getValue: (e: JournalEntry) => typeLabels[String(e.type ?? '')] ?? String(e.type ?? '') },
    { key: 'branch', type: 'string', getValue: (e: JournalEntry) => journalEntryBranchLabel(e, getDisplayName) },
    { key: 'costCenter', type: 'string', getValue: (e: JournalEntry) => journalEntryCostCentersLabel(e, getDisplayName, lang === 'ar' ? '، ' : ', ') },
    { key: 'description', type: 'string', getValue: (e: JournalEntry) => e.description ?? '' },
    { key: 'debit', type: 'number', getValue: (e: JournalEntry) => e.total_debit ?? (e as any).totalDebit ?? 0 },
    { key: 'credit', type: 'number', getValue: (e: JournalEntry) => e.total_credit ?? (e as any).totalCredit ?? 0 },
    { key: 'status', type: 'string', getValue: (e: JournalEntry) => statusLabels[String(e.status ?? '')] ?? String(e.status ?? '') },
  ], { locale })

  const { data: viewEntry, isLoading: loadingView } = useQuery({
    queryKey: ['journalEntry', tenantId, viewEntryId],
    queryFn: () => fetchJournalEntry(tenantId, viewEntryId!),
    enabled: !!tenantId && !!viewEntryId,
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteJournalEntry(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journalEntries', tenantId] })
      setDeleteTarget(null)
    },
  })

  const unpostMut = useMutation<JournalEntry, Error, { id: number; hasReference: boolean }>({
    mutationFn: ({ id, hasReference }) =>
      hasReference ? voidJournalEntry(tenantId, id) : unpostJournalEntry(tenantId, id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['journalEntries', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      const msg = typeof data === 'object' && data && 'message' in data && typeof (data as { message?: unknown }).message === 'string'
        ? (data as { message: string }).message
        : t.journal.unpostThenEditHint
      setToast({ message: msg, type: 'success' })
    },
    onError: (err: any) => {
      setToast({ message: err?.response?.data?.message ?? t.msg.errorOccurred, type: 'error' })
    },
  })

  function toggleExpand(id: number) {
    setExpandedId(prev => prev === id ? null : id)
  }

  const textAlign = isRtl ? 'text-right' : 'text-left'

  const totalDebit = entries.reduce((sum, e) => sum + Number(e.total_debit ?? 0), 0)
  const totalCredit = entries.reduce((sum, e) => sum + Number(e.total_credit ?? 0), 0)

  function handlePrint() {
    window.print()
  }

  function handleExportExcel() {
    const sep = lang === 'ar' ? '، ' : ', '
    const headers = [
      t.journal.entryNumber,
      t.date,
      t.type,
      t.journal.branch,
      t.nav.costCenters,
      t.description,
      t.journal.debit,
      t.journal.credit,
      t.status,
    ]
    const rows = entries.map((e) => [
      e.number,
      formatDisplayDate(e.date as string),
      typeLabels[e.type] ?? e.type,
      journalEntryBranchLabel(e, getDisplayName),
      journalEntryCostCentersLabel(e, getDisplayName, sep),
      e.description ?? '',
      e.total_debit ?? 0,
      e.total_credit ?? 0,
      statusLabels[e.status] ?? e.status,
    ])
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `journal-entries-${fromDate || 'from'}-${toDate || 'to'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleExportPdf() {
    window.print()
  }

  const printDate = new Date().toLocaleDateString(locale === 'ar-u-nu-latn' ? 'ar-EG' : 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const periodLabel = [fromDate, toDate].filter(Boolean).length ? `${fromDate || '—'} ${t.to || 'إلى'} ${toDate || '—'}` : (t.all || 'الكل')
  const showCustomDateFields = periodPreset === 'custom'
  const labelPeriod = lang === 'ar' ? 'الفترة' : 'Period'
  const labelFrom = lang === 'ar' ? 'من تاريخ' : 'From date'
  const labelTo = lang === 'ar' ? 'إلى تاريخ' : 'To date'

  return (
    <div className="px-0 py-4 space-y-4 w-full min-w-0 max-w-full">
      <div className="flex flex-wrap items-center justify-between gap-4 no-print">
        <h1 className="text-2xl font-bold text-slate-900">{t.journal.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-600 shrink-0">{labelPeriod}</span>
            <select
              value={periodPreset}
              onChange={(e) => applyPeriodPreset((e.target.value as ReportPeriodKey | 'custom') || 'all')}
              className="h-9 border border-slate-300 rounded-lg px-3 text-sm bg-white min-w-[150px]"
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
            <>
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-slate-600 whitespace-nowrap">{labelFrom}</span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={e => setFromDate(e.target.value)}
                  className="h-9 border border-slate-300 rounded-lg px-3 text-sm bg-white w-[140px]"
                  title={labelFrom}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-slate-600 whitespace-nowrap">{labelTo}</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={e => setToDate(e.target.value)}
                  className="h-9 border border-slate-300 rounded-lg px-3 text-sm bg-white w-[140px]"
                  title={labelTo}
                />
              </div>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            to="/journal-entries/create"
            className="flex items-center gap-2 bg-gradient-to-l from-emerald-500 to-emerald-600 text-white rounded-lg px-4 py-2 text-sm shadow-[0_2px_8px_rgba(16,185,129,0.35)] hover:shadow-[0_4px_12px_rgba(16,185,129,0.45)] hover:from-emerald-600 hover:to-emerald-700 transition-all duration-200 font-medium"
          >
            <Plus size={18} />
            {t.journal.createEntry}
          </Link>
          <div className="relative" ref={columnsMenuRef}>
            <button
              type="button"
              onClick={() => setShowColumnsMenu((v) => !v)}
              className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-lg bg-white border border-gray-200 text-slate-600 hover:bg-gray-50 hover:border-gray-300 transition-colors duration-150"
              title={lang === 'ar' ? 'تخصيص الأعمدة' : 'Customize columns'}
            >
              <Columns3 size={16} />
            </button>
            {showColumnsMenu && (
              <div className="absolute top-full end-0 mt-2 z-30 w-56 rounded-lg border border-slate-200 bg-white shadow-lg py-2 text-sm">
                <div className="px-3 pb-2 text-xs font-semibold text-slate-500">
                  {lang === 'ar' ? 'إظهار/إخفاء الأعمدة' : 'Show / hide columns'}
                </div>
                {JOURNAL_LIST_COLUMN_KEYS.map((key) => {
                  const label =
                    key === 'number'
                      ? t.journal.entryNumber
                      : key === 'date'
                        ? t.date
                        : key === 'type'
                          ? t.type
                          : key === 'branch'
                            ? t.journal.branch
                            : key === 'costCenter'
                              ? t.nav.costCenters
                              : key === 'description'
                                ? t.description
                                : key === 'debit'
                                  ? t.journal.debit
                                  : key === 'credit'
                                    ? t.journal.credit
                                    : key === 'status'
                                      ? t.status
                                      : t.actions
                  return (
                    <label
                      key={key}
                      className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer select-none"
                    >
                      <input
                        type="checkbox"
                        checked={visibleColumns[key]}
                        onChange={() => toggleJournalColumn(key)}
                        className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-slate-700 text-xs">{label}</span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-[#F0F2F5] border border-[#D9DCE0] text-[#344054] hover:bg-[#E4E7EB]"
            title={t.journal.print}
          >
            <Printer size={16} />
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-[#344054] text-white hover:bg-[#2d3846]"
            title="PDF"
          >
            <FileText size={16} />
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-500"
            title="Excel"
          >
            <FileSpreadsheet size={16} />
          </button>
        </div>
      </div>

      {/* الفلاتر ظاهرة دائماً */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 py-2.5 px-3 no-print">
          <div className={`flex flex-nowrap items-center justify-between gap-3 ${filterBarOverflowClass}`}>
          <div className="flex flex-nowrap items-center gap-3 min-w-0 flex-1">
          <div className="w-[7rem] min-w-[6rem] max-w-[7.5rem] shrink-0">
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              aria-label={t.type}
              title={t.type}
              className={filterSelectCls}
            >
              <option value="">{t.type}</option>
              {Object.entries(typeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="w-[6rem] min-w-[5rem] max-w-[6.5rem] shrink-0">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              aria-label={t.status}
              title={t.status}
              className={filterSelectCls}
            >
              <option value="">{t.status}</option>
              {Object.entries(statusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="min-w-[10rem] w-48">
            <select
              value={branchFilter}
              onChange={(e) => {
                setBranchFilter(e.target.value)
                setPage(1)
              }}
              aria-label={t.journal.branch}
              title={t.journal.branch}
              className={filterSelectCls}
            >
              <option value="">{t.journal.branch}</option>
              {branches.map((b: { id: number; name: string }) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[10rem] w-48">
            <select
              value={costCenterFilter}
              onChange={(e) => {
                setCostCenterFilter(e.target.value)
                setPage(1)
              }}
              aria-label={t.nav.costCenters}
              title={t.nav.costCenters}
              className={filterSelectCls}
            >
              <option value="">{t.nav.costCenters}</option>
              {costCenters.map((cc) => (
                <option key={cc.id} value={String(cc.id)}>
                  {getDisplayName({ name: cc.name, name_en: cc.name_en ?? null })}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[9rem] max-w-[14rem] w-[12rem] shrink-0">
            <div className="h-8 min-w-0">
              <AccountSearchSelect
                value={accountFilter === '' ? null : Number(accountFilter)}
                accounts={accounts}
                onChange={(id) => setAccountFilter(id == null ? '' : String(id))}
                placeholder={
                  lang === 'ar'
                    ? `${t.journal.account} — بحث بالكود أو الاسم...`
                    : `${t.journal.account} — search by code or name...`
                }
                className="h-full min-w-0 overflow-visible"
                inputClassName={filterSelectCls}
              />
            </div>
          </div>
          <div className="flex-1 basis-0 min-w-[15rem] max-w-[26rem]">
            <input
              type="text"
              value={descriptionSearch}
              onChange={e => setDescriptionSearch(e.target.value)}
              placeholder={lang === 'ar' ? 'بحث في الوصف أو البيان...' : 'Search in description...'}
              aria-label={t.description}
              className={filterTextCls}
              dir={isRtl ? 'rtl' : 'ltr'}
            />
          </div>
          </div>
          <div className="w-14 shrink-0 flex items-center">
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value))
                setPage(1)
              }}
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

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 no-print">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : (
          <div className="overflow-x-auto w-full min-w-0">
            <table className="w-full table-fixed text-xs" dir={isRtl ? 'rtl' : 'ltr'}>
              <thead>
                <tr className="bg-slate-50 text-slate-600">
                  <th className={`${textAlign} px-3 py-2 font-medium w-10`}></th>
                  {visibleColumns.number && (
                    <SortableTh
                      label={t.journal.entryNumber}
                      sortKey="number"
                      sortState={sort}
                      onToggle={toggleSort}
                      widthClassName="w-40"
                      className={`${textAlign} font-medium text-slate-700 dark:text-slate-200`}
                    />
                  )}
                  {visibleColumns.date && (
                    <SortableTh
                      label={t.date}
                      sortKey="date"
                      sortState={sort}
                      onToggle={toggleSort}
                      widthClassName="w-28"
                      className={`${textAlign} font-medium text-slate-700 dark:text-slate-200`}
                    />
                  )}
                  {visibleColumns.type && (
                    <SortableTh
                      label={t.type}
                      sortKey="type"
                      sortState={sort}
                      onToggle={toggleSort}
                      widthClassName="w-28"
                      className={`${textAlign} font-medium text-slate-700 dark:text-slate-200`}
                    />
                  )}
                  {visibleColumns.branch && (
                    <SortableTh
                      label={t.journal.branch}
                      sortKey="branch"
                      sortState={sort}
                      onToggle={toggleSort}
                      widthClassName="w-36"
                      className={`${textAlign} font-medium text-slate-700 dark:text-slate-200`}
                    />
                  )}
                  {visibleColumns.costCenter && (
                    <SortableTh
                      label={t.nav.costCenters}
                      sortKey="costCenter"
                      sortState={sort}
                      onToggle={toggleSort}
                      widthClassName="w-40"
                      className={`${textAlign} font-medium text-slate-700 dark:text-slate-200`}
                    />
                  )}
                  {visibleColumns.description && (
                    <SortableTh
                      label={t.description}
                      sortKey="description"
                      sortState={sort}
                      onToggle={toggleSort}
                      widthClassName="w-[28rem]"
                      className={`${textAlign} font-medium text-slate-700 dark:text-slate-200`}
                    />
                  )}
                  {visibleColumns.debit && (
                    <SortableTh
                      label={t.journal.debit}
                      sortKey="debit"
                      sortState={sort}
                      onToggle={toggleSort}
                      widthClassName="w-28"
                      headerLayout="clusterEnd"
                      className="text-end font-medium text-slate-700 dark:text-slate-200 tabular-nums"
                    />
                  )}
                  {visibleColumns.credit && (
                    <SortableTh
                      label={t.journal.credit}
                      sortKey="credit"
                      sortState={sort}
                      onToggle={toggleSort}
                      widthClassName="w-28"
                      headerLayout="clusterEnd"
                      className="text-end font-medium text-slate-700 dark:text-slate-200 tabular-nums"
                    />
                  )}
                  {visibleColumns.status && (
                    <SortableTh
                      label={t.status}
                      sortKey="status"
                      sortState={sort}
                      onToggle={toggleSort}
                      widthClassName="w-28"
                      headerLayout="clusterCenter"
                      className="text-center font-medium text-slate-700 dark:text-slate-200"
                    />
                  )}
                  {visibleColumns.actions && (
                    <th className={`${textAlign} px-2 py-2 font-medium w-12`}>{t.actions}</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedEntries.length === 0 ? (
                  <tr>
                    <td colSpan={tableColSpan} className="text-center py-8 text-slate-400">
                      {t.journal.noEntries}
                    </td>
                  </tr>
                ) : (
                  sortedEntries.map((entry) => {
                    const isExpanded = expandedId === entry.id
                    return (
                      <EntryRow
                        key={entry.id}
                        entry={entry}
                        isExpanded={isExpanded}
                        onToggle={() => toggleExpand(entry.id)}
                        onView={(e) => { e.stopPropagation(); setViewEntryId(entry.id) }}
                        onEdit={(e) => { e.stopPropagation() }}
                        onDelete={(e) => { e.stopPropagation(); setDeleteTarget(entry) }}
                        onUnpost={(e) => { e.stopPropagation(); unpostMut.mutate({ id: entry.id, hasReference: !!(entry.reference_type || entry.reference_id) }) }}
                        isUnposting={unpostMut.isPending && unpostMut.variables?.id === entry.id}
                        fmt={fmt}
                        typeLabels={typeLabels}
                        statusLabels={statusLabels}
                        textAlign={textAlign}
                        t={t}
                        visibleColumns={visibleColumns}
                        tableColSpan={tableColSpan}
                        getDisplayName={getDisplayName}
                        lang={lang}
                      />
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data && (
        <ReportFooter
          totals={[
            { label: lang === 'ar' ? 'إجمالي المدين' : 'Total Debit', value: fmt(totalDebit), color: 'red' },
            { label: lang === 'ar' ? 'إجمالي الدائن' : 'Total Credit', value: fmt(totalCredit), color: 'emerald' },
          ]}
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
          recordLabel={lang === 'ar' ? 'قيد' : 'entry'}
          totalsInBar
        />
      )}

      {/* منطقة الطباعة فقط: ترويسة + جدول + تذييل */}
      <div id="journal-entries-print" className="hidden print:block" dir={isRtl ? 'rtl' : 'ltr'}>
        <div className="journal-print-header">
          {(() => {
            const s = settings as Record<string, unknown> | null | undefined
            const logo = s?.company_logo
            if (logo == null || logo === '') return null
            return (
              <div className="mb-3">
                <img src={String(logo)} alt="" className="h-14 object-contain" />
              </div>
            )
          })()}
          <h2 className="text-xl font-bold text-slate-900 mb-1">{String((settings as Record<string, unknown> | null | undefined)?.company_name ?? currentTenant?.name ?? '—')}</h2>
          <h3 className="text-lg font-semibold text-slate-800 mt-4 mb-1">{t.journal.title}</h3>
          <p className="text-sm text-slate-600">{lang === 'ar' ? 'الفترة' : 'Period'}: {periodLabel}</p>
        </div>
        <div className="journal-print-table-wrap">
          <table className="journal-print-table w-full text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-medium">
                <th className={`${textAlign} px-3 py-2 border-b border-slate-200`}>{t.journal.entryNumber}</th>
                <th className={`${textAlign} px-3 py-2 border-b border-slate-200`}>{t.date}</th>
                <th className={`${textAlign} px-3 py-2 border-b border-slate-200`}>{t.type}</th>
                <th className={`${textAlign} px-3 py-2 border-b border-slate-200`}>{t.journal.branch}</th>
                <th className={`${textAlign} px-3 py-2 border-b border-slate-200`}>{t.nav.costCenters}</th>
                <th className={`${textAlign} px-3 py-2 border-b border-slate-200`}>{t.description}</th>
                <th className="text-end px-3 py-2 border-b border-slate-200 w-28">{t.journal.debit}</th>
                <th className="text-end px-3 py-2 border-b border-slate-200 w-28">{t.journal.credit}</th>
                <th className={`${textAlign} px-3 py-2 border-b border-slate-200`}>{t.status}</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-6 text-slate-500">{t.journal.noEntries}</td></tr>
              ) : (
                entries.map((entry) => {
                  const printSep = lang === 'ar' ? '، ' : ', '
                  return (
                  <tr key={entry.id} className="border-b border-slate-100">
                    <td className={`px-3 py-2 font-mono text-slate-800`}>{entry.number}</td>
                    <td className={`px-3 py-2 text-slate-700`}>{formatDisplayDate(entry.date as string)}</td>
                    <td className={`px-3 py-2 text-slate-700`}>{typeLabels[entry.type] ?? entry.type}</td>
                    <td className={`px-3 py-2 text-slate-700`}>{journalEntryBranchLabel(entry, getDisplayName)}</td>
                    <td className={`px-3 py-2 text-slate-700`}>{journalEntryCostCentersLabel(entry, getDisplayName, printSep)}</td>
                    <td className={`px-3 py-2 text-slate-700`}>{entry.description ?? '—'}</td>
                    <td className="text-end px-3 py-2 font-medium text-red-600 tabular-nums">{fmt(Number(entry.total_debit ?? 0))}</td>
                    <td className="text-end px-3 py-2 font-medium text-emerald-600 tabular-nums">{fmt(Number(entry.total_credit ?? 0))}</td>
                    <td className={`px-3 py-2 text-slate-700`}>{statusLabels[entry.status] ?? entry.status}</td>
                  </tr>
                  )
                })
              )}
            </tbody>
            {entries.length > 0 && (
              <tfoot>
                <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold text-slate-900">
                  <td className={`px-3 py-2 ${textAlign}`} colSpan={6}>{t.total}</td>
                  <td className="text-end px-3 py-2 text-red-600 tabular-nums">{fmt(totalDebit)}</td>
                  <td className="text-end px-3 py-2 text-emerald-600 tabular-nums">{fmt(totalCredit)}</td>
                  <td className="px-3 py-2"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <div className="journal-print-footer">
          <span>{lang === 'ar' ? 'تاريخ الطباعة' : 'Print Date'}: {printDate}</span>
          <span>{lang === 'ar' ? 'صفحة' : 'Page'} <span className="journal-page-num"></span></span>
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #journal-entries-print, #journal-entries-print * { visibility: visible; }
          #journal-entries-print {
            display: block !important;
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            max-width: 100%;
            margin: 0;
            padding: 0;
            background: white;
            box-shadow: none;
            border: none;
          }
          .journal-print-header {
            padding: 12px 0 16px;
            border-bottom: 1px solid #e2e8f0;
          }
          .journal-print-table-wrap {
            padding: 16px 0;
            overflow: visible;
            width: 100%;
          }
          .journal-print-table {
            width: 100%;
            min-width: 100%;
            border-collapse: collapse;
            font-size: 11px;
            table-layout: fixed;
          }
          .journal-print-table th,
          .journal-print-table td {
            padding: 8px 6px;
            border: 1px solid #e2e8f0;
          }
          .journal-print-table .tabular-nums { font-variant-numeric: tabular-nums; }
          .journal-print-footer {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            padding: 8px 0;
            font-size: 10px;
            color: #64748b;
            border-top: 1px solid #e2e8f0;
            background: white;
            display: flex;
            justify-content: space-between;
          }
          .journal-page-num::after { content: counter(page); }
          .no-print, .no-print * { display: none !important; visibility: hidden !important; }
          @page { size: A4 portrait; margin: 10mm 10mm 22mm; }
        }
        @media screen {
          #journal-entries-print { display: none !important; }
        }
      `}</style>

      {/* View modal */}
      {viewEntryId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setViewEntryId(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">{t.journal.viewEntry} — {viewEntry?.number}</h3>
              <div className="flex items-center gap-2">
                {viewEntry?.source && (
                  <Link
                    to={getSourceUrl(viewEntry.source)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-gradient-to-l from-emerald-500 to-emerald-600 text-white shadow-[0_2px_8px_rgba(16,185,129,0.35)] hover:shadow-[0_4px_12px_rgba(16,185,129,0.45)] hover:from-emerald-600 hover:to-emerald-700 transition-all duration-200"
                  >
                    <ExternalLink size={16} />
                    {t.journal.goToSource}
                  </Link>
                )}
                <button type="button" onClick={() => window.print()} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm border border-gray-200 text-slate-700 hover:bg-gray-50 hover:border-gray-300 transition-colors duration-150">
                  <Printer size={16} />
                  {t.journal.print}
                </button>
                <button onClick={() => setViewEntryId(null)} className="p-2 text-slate-400 hover:text-slate-600"><X size={20} /></button>
              </div>
            </div>
            <div className="p-4 overflow-auto flex-1" id="journal-entry-print">
              {loadingView ? (
                <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" /></div>
              ) : viewEntry ? (
                <div className="text-sm">
                  <div className="grid grid-cols-2 gap-2 mb-4 text-slate-600">
                    <span>{t.date}:</span><span>{formatDisplayDate(viewEntry.date as string)}</span>
                    <span>{t.type}:</span><span>{typeLabels[viewEntry.type] ?? viewEntry.type}</span>
                    <span>{t.status}:</span><span>{statusLabels[viewEntry.status] ?? viewEntry.status}</span>
                  </div>
                  {viewEntry.description && <p className="mb-3 text-slate-700">{viewEntry.description}</p>}
                  <table className="w-full text-xs border border-slate-200">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className={`${textAlign} px-2 py-2 font-medium`}>{t.accounts.accountCode}</th>
                        <th className={`${textAlign} px-2 py-2 font-medium`}>{t.accounts.accountName}</th>
                        <th className={`${textAlign} px-2 py-2 font-medium`}>{t.journal.debit}</th>
                        <th className={`${textAlign} px-2 py-2 font-medium`}>{t.journal.credit}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {viewEntry.lines?.map((line, idx) => (
                        <tr key={line.id ?? idx}>
                          <td className="px-2 py-2 font-mono">{line.account?.code ?? '—'}</td>
                          <td className="px-2 py-2">{line.account?.name ?? '—'}</td>
                          <td className="px-2 py-2">{line.debit > 0 ? fmt(line.debit) : ''}</td>
                          <td className="px-2 py-2">{line.credit > 0 ? fmt(line.credit) : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-300 font-bold">
                        <td colSpan={2} className="px-2 py-2">{t.total}</td>
                        <td className="px-2 py-2">{fmt(viewEntry.total_debit)}</td>
                        <td className="px-2 py-2">{fmt(viewEntry.total_credit)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setDeleteTarget(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">{t.msg.confirmDeleteTitle}</h3>
            <p className="text-slate-600 text-sm mb-3">{t.journal.confirmDeleteEntry}</p>
            {deleteTarget.source?.type === 'invoice' && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 mb-4">
                <p>{t.journal.deleteEntryLinkedWarning}</p>
                <Link
                  to={getSourceUrl(deleteTarget.source)}
                  className="inline-block mt-2 text-primary-600 hover:text-primary-700 font-medium"
                  onClick={(e) => e.stopPropagation()}
                >
                  {t.journal.goToSource} →
                </Link>
              </div>
            )}
            {deleteMut.isError && (
              <p className="text-red-600 text-sm mb-4">{(deleteMut.error as any)?.response?.data?.message ?? t.msg.deleteError}</p>
            )}
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">{t.cancel}</button>
              <button
                onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
                disabled={deleteMut.isPending}
                className="bg-red-600 hover:bg-red-500 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50"
              >
                {deleteMut.isPending ? t.deleting : t.delete}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  )
}

function getSourceUrl(source: { type: string; id: number; payment_type?: string }): string {
  if (source.type === 'invoice') return `/invoices/create?id=${source.id}`
  if (source.type === 'payment' && source.payment_type === 'receipt') return `/payments/create-voucher?id=${source.id}`
  if (source.type === 'payment' && source.payment_type === 'payment') return `/payments/create-voucher?id=${source.id}`
  // transfer/refund/unknown payment types
  if (source.type === 'payment') return `/payments?view=${source.id}`
  // fallback for any future source types
  return `/journal-entries/create?id=${source.id}`
}

function EntryRow({ entry, isExpanded, onToggle, onView, onEdit, onDelete, onUnpost, isUnposting, fmt, typeLabels, statusLabels, textAlign, t, visibleColumns, tableColSpan, getDisplayName, lang }: {
  entry: JournalEntry
  isExpanded: boolean
  onToggle: () => void
  onView: (e: React.MouseEvent) => void
  onEdit: (e: React.MouseEvent) => void
  onDelete: (e: React.MouseEvent) => void
  onUnpost: (e: React.MouseEvent) => void
  isUnposting?: boolean
  fmt: (n: number) => string
  typeLabels: Record<string, string>
  statusLabels: Record<string, string>
  textAlign: string
  t: any
  visibleColumns: Record<JournalListColumnKey, boolean>
  tableColSpan: number
  getDisplayName: (x: { name: string; name_en?: string | null }) => string
  lang: 'ar' | 'en'
}) {
  const [actionsOpen, setActionsOpen] = useState(false)
  const actionsMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!actionsOpen) return
    const close = (e: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) setActionsOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [actionsOpen])

  const canEditDraft = entry.status === 'draft' && !entry.reference_type
  const isPaymentJournal = !!(entry.reference_type && String(entry.reference_type).endsWith('Payment'))
  const canDelete = !isPaymentJournal && entry.status === 'draft' && !entry.reference_type
  const canUnpost = entry.status === 'posted'
  const deleteBlockedTitle = isPaymentJournal
    ? (t.journal.deletePaymentJournalForbidden ?? '')
    : canDelete
      ? ''
      : t.journal.cannotDeletePosted
  const hasSource = entry.source && entry.source.type && entry.source.id
  const showEditLink = hasSource || canEditDraft
  return (
    <>
      <tr className="hover:bg-slate-50 cursor-pointer" onClick={onToggle}>
        <td className="px-3 py-2">
          <button className="text-slate-400 hover:text-slate-600">
            {isExpanded ? <ChevronDown size={14} /> : <ChevronLeft size={14} />}
          </button>
        </td>
        {visibleColumns.number && (
          <td className={`px-3 py-2 font-mono text-xs text-emerald-600 hover:text-emerald-700 font-medium transition-colors duration-150 ${textAlign}`}>{entry.number}</td>
        )}
        {visibleColumns.date && (
          <td className={`px-3 py-2 text-slate-600 ${textAlign}`}>{formatDisplayDate(entry.date as string)}</td>
        )}
        {visibleColumns.type && (
          <td className={`px-3 py-2 ${textAlign}`}>
            <span className="bg-slate-100 text-slate-600 rounded px-1.5 py-0.5 text-[11px] leading-tight">
              {typeLabels[entry.type] ?? entry.type}
            </span>
          </td>
        )}
        {visibleColumns.branch && (
          <td
            className={`px-3 py-2 text-slate-600 text-xs max-w-[140px] truncate ${textAlign}`}
            title={journalEntryBranchLabel(entry, getDisplayName)}
          >
            {journalEntryBranchLabel(entry, getDisplayName)}
          </td>
        )}
        {visibleColumns.costCenter && (
          <td
            className={`px-3 py-2 text-slate-600 text-xs max-w-[200px] truncate ${textAlign}`}
            title={journalEntryCostCentersLabel(entry, getDisplayName, lang === 'ar' ? '، ' : ', ')}
          >
            {journalEntryCostCentersLabel(entry, getDisplayName, lang === 'ar' ? '، ' : ', ')}
          </td>
        )}
        {visibleColumns.description && (
          <td className={`px-3 py-2 text-slate-900 max-w-xs truncate ${textAlign}`}>{entry.description ?? '—'}</td>
        )}
        {visibleColumns.debit && (
          <td className="px-3 py-2 font-medium text-slate-800 text-end tabular-nums" dir="ltr">
            {fmt(entry.total_debit)}
          </td>
        )}
        {visibleColumns.credit && (
          <td className="px-3 py-2 font-medium text-slate-800 text-end tabular-nums" dir="ltr">
            {fmt(entry.total_credit)}
          </td>
        )}
        {visibleColumns.status && (
          <td className="px-3 py-2 text-center">
            <span className={`inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-[11px] font-medium leading-tight ${statusStyles[entry.status] ?? 'bg-gray-100 text-gray-500 border border-gray-200'}`}>
              {statusLabels[entry.status] ?? entry.status}
            </span>
          </td>
        )}
        {visibleColumns.actions && (
          <td className="px-2 py-2 w-12" onClick={(e) => e.stopPropagation()}>
            <div className="relative flex justify-center" ref={actionsMenuRef}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setActionsOpen((o) => !o)
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                title={t.actions}
                aria-expanded={actionsOpen}
                aria-haspopup="menu"
              >
                <MoreVertical size={16} />
              </button>
              {actionsOpen && (
                <div
                  className="absolute top-full end-0 z-[100] mt-1 min-w-[11.5rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
                  dir={lang === 'ar' ? 'rtl' : 'ltr'}
                  role="menu"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    onClick={(e) => {
                      setActionsOpen(false)
                      onView(e)
                    }}
                  >
                    <Eye size={14} className="shrink-0 text-slate-500" />
                    <span>{t.journal.view}</span>
                  </button>
                  {canUnpost && (
                    <button
                      type="button"
                      role="menuitem"
                      disabled={isUnposting}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                      onClick={(e) => {
                        setActionsOpen(false)
                        onUnpost(e)
                      }}
                    >
                      {isUnposting ? (
                        <span className="inline-block h-3.5 w-3.5 shrink-0 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Undo2 size={14} className="shrink-0 text-amber-600" />
                      )}
                      <span>{t.journal.unpost}</span>
                    </button>
                  )}
                  {showEditLink ? (
                    <Link
                      to={hasSource ? getSourceUrl(entry.source!) : `/journal-entries/create?id=${entry.id}`}
                      role="menuitem"
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                      onClick={(e) => {
                        e.stopPropagation()
                        setActionsOpen(false)
                      }}
                    >
                      <Pencil size={14} className="shrink-0 text-slate-500" />
                      <span>{hasSource ? t.journal.goToSource : t.journal.edit}</span>
                    </Link>
                  ) : (
                    <div className="flex cursor-not-allowed items-center gap-2 px-3 py-2 text-sm text-slate-400" title={t.journal.cannotEditPosted}>
                      <Pencil size={14} className="shrink-0" />
                      <span>{t.journal.edit}</span>
                    </div>
                  )}
                  {canDelete ? (
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                      onClick={(e) => {
                        setActionsOpen(false)
                        onDelete(e)
                      }}
                    >
                      <Trash2 size={14} className="shrink-0" />
                      <span>{t.journal.delete}</span>
                    </button>
                  ) : (
                    <div className="flex cursor-not-allowed items-center gap-2 px-3 py-2 text-sm text-slate-400" title={deleteBlockedTitle}>
                      <Trash2 size={14} className="shrink-0" />
                      <span>{t.journal.delete}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </td>
        )}
      </tr>
      {isExpanded && entry.lines && (
        <tr>
          <td colSpan={tableColSpan} className="bg-slate-50 px-0 py-0">
            <div className="px-5 py-2">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500">
                    <th className={`${textAlign} pb-2 font-medium`}>{t.accounts.accountCode}</th>
                    <th className={`${textAlign} pb-2 font-medium`}>{t.accounts.accountName}</th>
                    <th className={`${textAlign} pb-2 font-medium`}>{t.description}</th>
                    <th className={`${textAlign} pb-2 font-medium w-28`}>{t.journal.debit}</th>
                    <th className={`${textAlign} pb-2 font-medium w-28`}>{t.journal.credit}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {entry.lines.map((line, idx) => (
                    <tr key={line.id ?? idx}>
                      <td className="py-1.5 font-mono text-slate-500">{line.account?.code ?? '—'}</td>
                      <td className="py-1.5 text-slate-800 font-medium">{line.account?.name ?? '—'}</td>
                      <td className="py-1.5 text-slate-500">{line.description ?? ''}</td>
                      <td className="py-1.5 text-slate-800">{line.debit > 0 ? fmt(line.debit) : ''}</td>
                      <td className="py-1.5 text-slate-800">{line.credit > 0 ? fmt(line.credit) : ''}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300 font-bold text-slate-900">
                    <td colSpan={3} className="py-1.5">{t.total}</td>
                    <td className="py-1.5">{fmt(entry.total_debit)}</td>
                    <td className="py-1.5">{fmt(entry.total_credit)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
