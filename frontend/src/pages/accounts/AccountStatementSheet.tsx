import { useState, useMemo, useRef, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchAccountStatement, fetchSettings, fetchJournalEntry, fetchBranches, fetchCostCenters } from '../../api/tenant'
import type {
  AccountStatementResponse,
  AccountStatementLine as LineType,
  TenantSettings,
  JournalEntry,
  Branch,
  CostCenter,
} from '../../types'
import { formatAmount } from '../../utils/currency'
import { formatDisplayDate, getReportPeriodRange, type ReportPeriodKey } from '../../utils/date'
import { FileText, Printer, FileSpreadsheet, ChevronUp, ChevronDown, ExternalLink, X, Columns3, ArrowLeft } from 'lucide-react'
import { usePersistedColumnVisibility } from '../../hooks/usePersistedColumnVisibility'
import ReportFooter from '../../components/ui/ReportFooter'
import { filterPageSizeSelectClass, filterSelectCompactClass, filterTextInputClass } from '../../utils/filterControlStyles'

/** رموز نوع الحركة → تسميات الفلتر (Chips) (عربي) */
const OPERATION_CODE_LABELS_AR: Record<string, string> = {
  sales_invoice: 'مبيعات',
  purchase_invoice: 'مشتريات',
  receipt_voucher: 'سند قبض',
  payment_voucher: 'سند صرف',
  return_sales: 'مرتجع مبيعات',
  return_purchase: 'مرتجع مشتريات',
  manual: 'قيد يدوي',
  installment_schedule: 'جدول أقساط',
  other: 'أخرى',
}

/** Operation code → chip labels (English) */
const OPERATION_CODE_LABELS_EN: Record<string, string> = {
  sales_invoice: 'Sales',
  purchase_invoice: 'Purchases',
  receipt_voucher: 'Receipt voucher',
  payment_voucher: 'Payment voucher',
  return_sales: 'Sales return',
  return_purchase: 'Purchase return',
  manual: 'Manual entry',
  installment_schedule: 'Installment schedule',
  other: 'Other',
}

/** رموز نوع الحركة → اسم واضح في عمود "نوع العملية" (فاتورة مبيعات وليس فاتورة فقط) — عربي */
const OPERATION_TYPE_DISPLAY_AR: Record<string, string> = {
  sales_invoice: 'فاتورة مبيعات',
  purchase_invoice: 'فاتورة مشتريات',
  receipt_voucher: 'سند قبض',
  payment_voucher: 'سند صرف',
  return_sales: 'مرتجع مبيعات',
  return_purchase: 'مرتجع مشتريات',
  manual: 'قيد يدوي',
  opening: 'رصيد سابق',
  installment_schedule: 'جدول أقساط',
  other: 'أخرى',
}

/** Operation code → display name in Operation Type column — English */
const OPERATION_TYPE_DISPLAY_EN: Record<string, string> = {
  sales_invoice: 'Sales invoice',
  purchase_invoice: 'Purchase invoice',
  receipt_voucher: 'Receipt voucher',
  payment_voucher: 'Payment voucher',
  return_sales: 'Sales return',
  return_purchase: 'Purchase return',
  manual: 'Manual journal',
  opening: 'Previous balance',
  installment_schedule: 'Installment schedule',
  other: 'Other',
}

function getOperationTypeDisplay(line: LineType, lang: 'ar' | 'en'): string {
  const code = (line as LineType & { operation_code?: string }).operation_code
  const map = lang === 'ar' ? OPERATION_TYPE_DISPLAY_AR : OPERATION_TYPE_DISPLAY_EN
  if (code && map[code]) return map[code]
  return line.operation_type || '—'
}

function getStatementDescription(line: LineType, lang: 'ar' | 'en'): string {
  const desc = typeof line.description === 'string' ? line.description.trim() : ''
  if (desc) return desc
  return getOperationTypeDisplay(line, lang) || '—'
}

function getBranchDisplay(line: LineType, lang: 'ar' | 'en'): string {
  const b = line.branch_name?.trim()
  const ben = line.branch_name_en?.trim()
  if (!b && !ben) return '—'
  return lang === 'ar' ? (b || ben || '—') : (ben || b || '—')
}

function getCostCenterDisplay(line: LineType, lang: 'ar' | 'en'): string {
  const n = line.cost_center_name?.trim()
  const nen = line.cost_center_name_en?.trim()
  if (!n && !nen) return '—'
  return lang === 'ar' ? (n || nen || '—') : (nen || n || '—')
}

type AccountStatementColumnKey =
  | 'date'
  | 'voucher'
  | 'operation'
  | 'branch'
  | 'costCenter'
  | 'description'
  | 'debit'
  | 'credit'
  | 'balance'

const ACCOUNT_STATEMENT_COLUMN_KEYS: AccountStatementColumnKey[] = [
  'date',
  'voucher',
  'operation',
  'branch',
  'costCenter',
  'description',
  'debit',
  'credit',
  'balance',
]

const ACCOUNT_STATEMENT_COLUMNS_STORAGE_KEY = 'accountStatementVisibleColumns'

const filterSelectCls = filterSelectCompactClass
const filterTextCls = filterTextInputClass

function getSourceUrlFromEntry(entry: JournalEntry | null | undefined): string | null {
  if (!entry) return null

  // الأفضلية للمرجع المباشر إن وُجد (id الخاص بالفاتورة / السند)
  const refType = entry.reference_type ?? ''
  const refId = entry.reference_id ?? null
  if (refId) {
    if (refType.includes('Invoice')) {
      return `/invoices/create?id=${refId}`
    }
    if (refType.includes('Payment')) {
      // نحدد نوع السند من source.payment_type إن توفرت، وإلا من نوع القيد إن أمكن
      const paymentType = entry.source?.payment_type
        || (entry.type === 'receipt_voucher' ? 'receipt'
          : entry.type === 'payment_voucher' ? 'payment'
          : undefined)

      if (paymentType === 'receipt' || paymentType === 'payment') return `/payments/create-voucher?id=${refId}`
      return `/payments?view=${refId}`
    }
  }

  // fallback على المصدر إن لم يتوفر reference_id (حالة قديمة)
  const source = entry.source
  if (!source) return null
  if (source.type === 'invoice') return `/invoices/create?id=${source.id}`
  if (source.type === 'payment' && (source.payment_type === 'receipt' || source.payment_type === 'payment')) {
    return `/payments/create-voucher?id=${source.id}`
  }
  return `/payments?view=${source.id}`
}

const PAGE_SIZES = [10, 25, 50, 100]

const SHEET_PERIOD_OPTIONS: { value: ReportPeriodKey | 'custom'; labelAr: string; labelEn: string }[] = [
  { value: 'all', labelAr: 'الكل', labelEn: 'All' },
  { value: 'custom', labelAr: 'تاريخ مخصص', labelEn: 'Custom Date' },
  { value: 'today', labelAr: 'اليوم', labelEn: 'Today' },
  { value: 'yesterday', labelAr: 'الأمس', labelEn: 'Yesterday' },
  { value: 'this_week', labelAr: 'هذا الأسبوع', labelEn: 'This Week' },
  { value: 'last_week', labelAr: 'الأسبوع السابق', labelEn: 'Last Week' },
  { value: 'this_month', labelAr: 'هذا الشهر', labelEn: 'This Month' },
  { value: 'last_month', labelAr: 'الشهر السابق', labelEn: 'Last Month' },
  { value: 'this_quarter', labelAr: 'هذا الربع', labelEn: 'This Quarter' },
  { value: 'this_year', labelAr: 'هذه السنة', labelEn: 'This Year' },
  { value: 'from_inception', labelAr: 'منذ البداية', labelEn: 'From inception' },
]

function detectStatementSheetPeriod(from: string, to: string): ReportPeriodKey | 'custom' {
  if (!from || !to) return 'custom'
  const keys: ReportPeriodKey[] = [
    'all',
    'from_inception',
    'today',
    'yesterday',
    'this_week',
    'last_week',
    'this_month',
    'last_month',
    'this_quarter',
    'this_year',
  ]
  for (const k of keys) {
    const r = getReportPeriodRange(k)
    if (r.from_date === from && r.to_date === to) return k
  }
  return 'custom'
}

function isFromInceptionPeriod(fromDate: string): boolean {
  return fromDate === '1970-01-01'
}

function isOpeningStatementLine(line: LineType): boolean {
  return (line as LineType & { operation_code?: string }).operation_code === 'opening'
}

function shouldShowPreviousBalanceRow(
  fetched: AccountStatementResponse,
): boolean {
  if (isFromInceptionPeriod(fetched.period.from)) return false
  if (fetched.show_previous_balance === false) return false
  return fetched.opening_balance !== 0
}

function formatDateEnglish(s: string): string {
  if (!s) return '—'
  const d = new Date(s)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function apiErrorMessage(err: unknown, fallback: string): string {
  const ax = err as {
    response?: { data?: { message?: string; errors?: Record<string, string[] | string> } }
    message?: string
  }
  const m = ax?.response?.data?.message
  if (typeof m === 'string' && m.trim()) return m.trim()
  const errors = ax?.response?.data?.errors
  if (errors && typeof errors === 'object') {
    for (const v of Object.values(errors)) {
      if (Array.isArray(v)) {
        const first = v.find((x) => typeof x === 'string' && x.trim())
        if (first) return first.trim()
      } else if (typeof v === 'string' && v.trim()) {
        return v.trim()
      }
    }
  }
  if (typeof ax?.message === 'string' && ax.message.trim()) return ax.message.trim()
  return fallback
}

export default function AccountStatementSheet() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { currentTenant } = useAuth()
  const { t, lang, isRtl, getDisplayName } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'

  const accountIdParam = useMemo((): number | null => {
    const n = Number(searchParams.get('accountId') || '')
    return Number.isInteger(n) && n > 0 ? n : null
  }, [searchParams])

  /** كشف أقساط مدينة: حركات حساب الأقساط المرتبطة بعميل محدد (عبر customer_id على القيد) */
  const journalCustomerIdParam = useMemo((): number | null => {
    const n = Number(searchParams.get('journal_customer_id') || '')
    return Number.isInteger(n) && n > 0 ? n : null
  }, [searchParams])

  /** افتراضياً مفعّل؛ `include_installments=0` في الرابط = إخفاء أثر الأقساط (ديون عادية فقط) */
  const includeInstallments = useMemo(
    () => searchParams.get('include_installments') !== '0',
    [searchParams],
  )

  const dateFromParam = searchParams.get('from_date') || ''
  const dateToParam = searchParams.get('to_date') || ''

  const [editFrom, setEditFrom] = useState(dateFromParam)
  const [editTo, setEditTo] = useState(dateToParam)
  const [periodPreset, setPeriodPreset] = useState<ReportPeriodKey | 'custom'>(() =>
    detectStatementSheetPeriod(dateFromParam, dateToParam),
  )

  useEffect(() => {
    setEditFrom(dateFromParam)
    setEditTo(dateToParam)
    setPeriodPreset(detectStatementSheetPeriod(dateFromParam, dateToParam))
  }, [dateFromParam, dateToParam])

  const { data: settings } = useQuery<TenantSettings>({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })

  const { data: branchesList = [] } = useQuery<Branch[]>({
    queryKey: ['branches', tenantId, 'accountStatementSheet'],
    queryFn: () => fetchBranches(tenantId, { status: 'active' }),
    enabled: !!tenantId,
  })

  const { data: costCentersList = [] } = useQuery<CostCenter[]>({
    queryKey: ['costCenters', tenantId, 'accountStatementSheet'],
    queryFn: () => fetchCostCenters(tenantId, { active_only: '1' }),
    enabled: !!tenantId,
  })
  const decimals = Number(settings?.doc_amount_decimals) || 2
  const formatNum = (n: number, loc?: string) => formatAmount(Math.abs(n), { decimal_places: decimals }, loc ?? locale)

  const [movementTypeFilter, setMovementTypeFilter] = useState<string[]>([])
  const [branchFilter, setBranchFilter] = useState<string>('')
  const [costCenterFilter, setCostCenterFilter] = useState<string>('')
  const [tableSearch, setTableSearch] = useState('')
  const [sortBy, setSortBy] = useState<'date' | 'debit' | 'credit'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  function applySheetPeriodPreset(preset: ReportPeriodKey | 'custom') {
    setPeriodPreset(preset)
    if (preset === 'custom') return
    const range = getReportPeriodRange(preset)
    setEditFrom(range.from_date)
    setEditTo(range.to_date)
    if (!accountIdParam) return
    setSearchParams({
      accountId: String(accountIdParam),
      from_date: range.from_date,
      to_date: range.to_date,
      ...(journalCustomerIdParam ? { journal_customer_id: String(journalCustomerIdParam) } : {}),
      ...(includeInstallments ? {} : { include_installments: '0' }),
    })
    setPage(1)
  }

  const [fetched, setFetched] = useState<AccountStatementResponse | null>(null)
  const [statementLoading, setStatementLoading] = useState(false)
  const [statementError, setStatementError] = useState<string | null>(null)
  const [viewEntryId, setViewEntryId] = useState<number | null>(null)

  const [visibleColumns, setVisibleColumns] = usePersistedColumnVisibility(
    ACCOUNT_STATEMENT_COLUMNS_STORAGE_KEY,
    ACCOUNT_STATEMENT_COLUMN_KEYS,
  )
  const [showColumnsMenu, setShowColumnsMenu] = useState(false)
  const columnsMenuRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    if (!accountIdParam || !dateFromParam || !dateToParam) {
      setFetched(null)
      setStatementError(null)
      setStatementLoading(false)
      return
    }
    if (!tenantId) {
      setFetched(null)
      setStatementError(null)
      return
    }
    let cancelled = false
    setStatementLoading(true)
    setStatementError(null)
    fetchAccountStatement(tenantId, {
      account_id: accountIdParam,
      from_date: dateFromParam,
      to_date: dateToParam,
      ...(journalCustomerIdParam ? { journal_customer_id: journalCustomerIdParam } : {}),
      ...(!includeInstallments ? { include_installments: false } : {}),
    })
      .then((data) => {
        if (!cancelled) setFetched(data)
      })
      .catch((err) => {
        if (!cancelled) {
          setFetched(null)
          setStatementError(
            apiErrorMessage(
              err,
              lang === 'ar' ? 'تعذر تحميل كشف الحساب.' : 'Could not load account statement.',
            ),
          )
        }
      })
      .finally(() => {
        if (!cancelled) setStatementLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tenantId, accountIdParam, dateFromParam, dateToParam, journalCustomerIdParam, includeInstallments, lang])

  /** وضع «تاريخ مخصص»: تحديث الرابط تلقائياً عند تغيير من/إلى (بدون زر تحديث) */
  useEffect(() => {
    if (periodPreset !== 'custom') return
    if (!accountIdParam || !editFrom || !editTo) return
    if (editFrom === dateFromParam && editTo === dateToParam) return
    setSearchParams({
      accountId: String(accountIdParam),
      from_date: editFrom,
      to_date: editTo,
      ...(journalCustomerIdParam ? { journal_customer_id: String(journalCustomerIdParam) } : {}),
      ...(includeInstallments ? {} : { include_installments: '0' }),
    })
    setPage(1)
  }, [periodPreset, accountIdParam, editFrom, editTo, dateFromParam, dateToParam, journalCustomerIdParam, includeInstallments, setSearchParams])

  const showCustomDateFields = periodPreset === 'custom'
  const labelPeriod = lang === 'ar' ? 'الفترة' : 'Period'
  const labelFrom = lang === 'ar' ? 'من تاريخ' : 'From date'
  const labelTo = lang === 'ar' ? 'إلى تاريخ' : 'To date'
  const periodSelectCls = 'h-9 border border-slate-300 rounded-lg px-3 text-sm min-w-[150px] bg-white shrink-0 outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500'
  const dateInputCls = 'h-9 border border-slate-300 rounded-lg px-3 text-sm bg-white w-[140px] box-border outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500'
  const textAlign = isRtl ? 'text-right' : 'text-left'
  const alignNum = 'text-right'

  const columnLabels = useMemo((): Record<AccountStatementColumnKey, string> => ({
    date: t.accounts.date,
    voucher: lang === 'ar' ? 'السند' : 'Voucher',
    operation: t.accounts.operationType,
    branch: t.nav.branches,
    costCenter: t.nav.costCenters,
    description: t.accounts.statementDescription ?? 'البيان',
    debit: t.accounts.debit,
    credit: t.accounts.credit,
    balance: t.accounts.statementBalance ?? 'الرصيد',
  }), [t, lang])

  const visibleColumnKeys = useMemo(
    () => ACCOUNT_STATEMENT_COLUMN_KEYS.filter((k) => visibleColumns[k]),
    [visibleColumns],
  )

  const totalVisibleColumns = visibleColumnKeys.length
  const closingLabelColSpan = Math.max(1, totalVisibleColumns - (visibleColumns.balance ? 1 : 0))

  const { data: viewEntry, isLoading: loadingEntry } = useQuery<JournalEntry>({
    queryKey: ['journalEntry-from-statement', tenantId, viewEntryId],
    queryFn: () => fetchJournalEntry(tenantId, viewEntryId ?? 0),
    enabled: !!tenantId && !!viewEntryId,
  })

  const showPreviousBalanceRow = useMemo(
    () => (fetched ? shouldShowPreviousBalanceRow(fetched) : false),
    [fetched],
  )

  const allLines = useMemo(() => {
    if (!fetched) return []
    const asOf = fetched.opening_balance_as_of
    const asOfDisplay = asOf ? formatDisplayDate(asOf) : '—'
    const prevDesc =
      lang === 'ar'
        ? `${t.accounts.previousBalanceUntil} ${asOfDisplay}`
        : `${t.accounts.previousBalanceUntil} ${asOfDisplay}`

    const openingLine: LineType | null = showPreviousBalanceRow
      ? {
          date: fetched.period.from,
          reference_number: '—',
          operation_type: t.accounts.previousBalance,
          operation_code: 'opening',
          description: prevDesc,
          debit: fetched.opening_balance >= 0 ? fetched.opening_balance : 0,
          credit: fetched.opening_balance < 0 ? Math.abs(fetched.opening_balance) : 0,
          running_balance: fetched.opening_balance,
          branch_id: null,
          cost_center_id: null,
        }
      : null
    return openingLine ? [openingLine, ...fetched.lines] : fetched.lines
  }, [fetched, showPreviousBalanceRow, t.accounts.previousBalance, t.accounts.previousBalanceUntil, lang])

  const filteredByMovement = useMemo(() => {
    if (movementTypeFilter.length === 0) return allLines
    const opening = allLines.find(isOpeningStatementLine)
    const rest = allLines.filter(
      (l) =>
        !isOpeningStatementLine(l) &&
        (l as LineType & { operation_code?: string }).operation_code &&
        movementTypeFilter.includes((l as LineType & { operation_code?: string }).operation_code!),
    )
    return opening ? [opening, ...rest] : rest
  }, [allLines, movementTypeFilter])

  const filteredByBranchAndCostCenter = useMemo(() => {
    if (!branchFilter && !costCenterFilter) return filteredByMovement
    const bid = branchFilter ? Number(branchFilter) : null
    const ccid = costCenterFilter ? Number(costCenterFilter) : null
    const opening = filteredByMovement.find(isOpeningStatementLine)
    const rest = filteredByMovement.filter((l) => {
      if (isOpeningStatementLine(l)) return false
      const lb = l.branch_id ?? null
      const lc = l.cost_center_id ?? null
      if (bid !== null && lb !== bid) return false
      if (ccid !== null && lc !== ccid) return false
      return true
    })
    return opening ? [opening, ...rest] : rest
  }, [filteredByMovement, branchFilter, costCenterFilter])

  const filteredBySearch = useMemo(() => {
    const base = filteredByBranchAndCostCenter
    const opening = base.find(isOpeningStatementLine)
    const restBase = base.filter((l) => !isOpeningStatementLine(l))
    if (!tableSearch.trim()) return opening ? [opening, ...restBase] : restBase
    const q = tableSearch.trim().toLowerCase()
    const rest = restBase.filter(
      (l) =>
        (l.reference_number || '').toLowerCase().includes(q) ||
        (l.operation_type || '').toLowerCase().includes(q) ||
        getStatementDescription(l, lang).toLowerCase().includes(q) ||
        getBranchDisplay(l, lang).toLowerCase().includes(q) ||
        getCostCenterDisplay(l, lang).toLowerCase().includes(q),
    )
    return opening ? [opening, ...rest] : rest
  }, [filteredByBranchAndCostCenter, tableSearch, lang])

  const sortedLines = useMemo(() => {
    const opening = filteredBySearch.find(isOpeningStatementLine)
    const rest = filteredBySearch.filter((l) => !isOpeningStatementLine(l))
    rest.sort((a, b) => {
      let cmp = 0
      if (sortBy === 'date') {
        cmp = (a.date || '').localeCompare(b.date || '')
      } else if (sortBy === 'debit') {
        cmp = (a.debit || 0) - (b.debit || 0)
      } else {
        cmp = (a.credit || 0) - (b.credit || 0)
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return opening ? [opening, ...rest] : rest
  }, [filteredBySearch, sortBy, sortDir])

  const totalFiltered = sortedLines.length
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize))
  const paginatedLines = useMemo(() => {
    const start = (page - 1) * pageSize
    return sortedLines.slice(start, start + pageSize)
  }, [sortedLines, page, pageSize])

  /** مجموع أعمدة المدين/الدائن لكل الصفوف المعروضة (بما فيها الرصيد السابق) */
  const displayedDebitCreditTotals = useMemo(() => {
    let debit = 0
    let credit = 0
    for (const line of sortedLines) {
      debit += Number(line.debit) || 0
      credit += Number(line.credit) || 0
    }
    return { debit, credit }
  }, [sortedLines])

  function toggleSort(field: 'date' | 'debit' | 'credit') {
    if (sortBy === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortBy(field)
      setSortDir('asc')
    }
  }

  function toggleMovementFilter(code: string) {
    setMovementTypeFilter((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    )
    setPage(1)
  }

  function handlePrint() {
    window.print()
  }

  function exportCSV() {
    if (!fetched) return
    const linesExport = sortedLines
    const headers = visibleColumnKeys.map((k) => columnLabels[k])
    const rows = linesExport.map((l) =>
      visibleColumnKeys.map((k) => {
        switch (k) {
          case 'date':
            return l.date
          case 'voucher':
            return l.reference_number
          case 'operation':
            return getOperationTypeDisplay(l, lang)
          case 'branch':
            return getBranchDisplay(l, lang)
          case 'costCenter':
            return getCostCenterDisplay(l, lang)
          case 'description':
            return getStatementDescription(l, lang)
          case 'debit':
            return l.debit
          case 'credit':
            return l.credit
          case 'balance':
            return l.running_balance
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
    a.download = `account-statement-${fetched.account.code}-${dateFromParam}-${dateToParam}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportExcel() {
    exportCSV() // نفس البيانات بصيغة CSV يفتحها Excel
  }

  function renderStatementHeaderCell(k: AccountStatementColumnKey) {
    const label = columnLabels[k]
    if (k === 'date') {
      return (
        <th key={k} className={`${textAlign} w-28 py-2.5 px-3 font-medium text-neutral-700 cursor-pointer hover:opacity-90`} onClick={() => toggleSort('date')}>
          <span className="inline-flex items-center gap-0.5">
            {label}
            {sortBy === 'date' && (sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
          </span>
        </th>
      )
    }
    if (k === 'debit') {
      return (
        <th key={k} className="text-center w-28 py-2.5 px-3 font-medium text-neutral-700 cursor-pointer hover:opacity-90" onClick={() => toggleSort('debit')}>
          <span className="inline-flex items-center justify-center gap-0.5 w-full">
            {label}
            {sortBy === 'debit' && (sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
          </span>
        </th>
      )
    }
    if (k === 'credit') {
      return (
        <th key={k} className="text-center w-28 py-2.5 px-3 font-medium text-neutral-700 cursor-pointer hover:opacity-90" onClick={() => toggleSort('credit')}>
          <span className="inline-flex items-center justify-center gap-0.5 w-full">
            {label}
            {sortBy === 'credit' && (sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
          </span>
        </th>
      )
    }
    if (k === 'balance') {
      return <th key={k} className="text-center w-28 py-2.5 px-3 font-medium text-neutral-700">{label}</th>
    }
    return <th key={k} className={`${textAlign} py-2.5 px-3 font-medium text-neutral-700`}>{label}</th>
  }

  const periodTotalsLabelKeys = useMemo(
    () => visibleColumnKeys.filter((k) => k !== 'debit' && k !== 'credit' && k !== 'balance'),
    [visibleColumnKeys],
  )

  function renderPeriodTotalsFooterCell(k: AccountStatementColumnKey) {
    const numCellClass = 'p-3 text-sm tabular-nums font-semibold leading-tight text-center'
    if (k === 'debit') {
      return (
        <td key={k} className={`${numCellClass} text-red-600`} dir="ltr">
          {formatNum(displayedDebitCreditTotals.debit)}
        </td>
      )
    }
    if (k === 'credit') {
      return (
        <td key={k} className={`${numCellClass} text-emerald-600`} dir="ltr">
          {formatNum(displayedDebitCreditTotals.credit)}
        </td>
      )
    }
    if (k === 'balance') {
      return (
        <td key={k} className={`${numCellClass} text-slate-400`} dir="ltr">
          —
        </td>
      )
    }
    if (k === periodTotalsLabelKeys[0]) {
      return (
        <td
          key={k}
          colSpan={Math.max(1, periodTotalsLabelKeys.length)}
          className={`${textAlign} p-3 text-sm leading-tight`}
        >
          {lang === 'ar' ? 'إجماليات الفترة' : 'Period totals'}
        </td>
      )
    }
    if (periodTotalsLabelKeys.includes(k)) {
      return null
    }
    return null
  }

  function renderStatementCell(line: LineType, k: AccountStatementColumnKey, jeId: number | null | undefined) {
    const numClass = 'text-center py-2.5 px-3 font-medium align-middle tabular-nums'
    switch (k) {
      case 'date':
        return <td key={k} className={`${textAlign} py-2.5 px-3 align-middle`}>{formatDateEnglish(line.date)}</td>
      case 'voucher':
        return (
          <td key={k} className={`font-mono text-xs ${textAlign} py-2.5 px-3 align-middle`}>
            {jeId ? (
              <button
                type="button"
                onClick={() => setViewEntryId(jeId)}
                className="text-primary-600 hover:underline inline-flex items-center gap-0.5"
              >
                {line.reference_number || '—'}
                <ExternalLink size={12} />
              </button>
            ) : (
              line.reference_number || '—'
            )}
          </td>
        )
      case 'operation':
        return <td key={k} className={`${textAlign} py-2.5 px-3 align-middle`}>{getOperationTypeDisplay(line, lang)}</td>
      case 'branch':
        return (
          <td key={k} className={`${textAlign} py-2.5 px-3 align-middle max-w-[200px] truncate`} title={getBranchDisplay(line, lang)}>
            {getBranchDisplay(line, lang)}
          </td>
        )
      case 'costCenter':
        return (
          <td key={k} className={`${textAlign} py-2.5 px-3 align-middle max-w-[200px] truncate`} title={getCostCenterDisplay(line, lang)}>
            {getCostCenterDisplay(line, lang)}
          </td>
        )
      case 'description':
        return (
          <td key={k} className={`${textAlign} py-2.5 px-3 align-middle`}>
            <span
              className="inline-block max-w-[280px] whitespace-nowrap overflow-hidden text-ellipsis align-middle"
              title={getStatementDescription(line, lang)}
            >
              {getStatementDescription(line, lang)}
            </span>
          </td>
        )
      case 'debit':
        return <td key={k} className={`${numClass} text-[#dc2626]`}>{line.debit > 0 ? formatNum(line.debit) : ''}</td>
      case 'credit':
        return <td key={k} className={`${numClass} text-[#059669]`}>{line.credit > 0 ? formatNum(line.credit) : ''}</td>
      case 'balance':
        return <td key={k} className={`${numClass} text-neutral-900`}>{formatNum(line.running_balance)}</td>
      default:
        return null
    }
  }

  function renderOpeningStatementRow(line: LineType, rowKey: string | number) {
    const balance = line.running_balance
    const balancePositive = balance >= 0
    const balanceClass = balancePositive
      ? 'text-red-700 dark:text-red-400'
      : 'text-emerald-700 dark:text-emerald-400'

    return (
      <tr
        key={rowKey}
        className="bg-amber-50 dark:bg-amber-900/20 border-b-2 border-amber-300 dark:border-amber-700"
      >
        {visibleColumnKeys.map((k) => {
          if (k === 'date') {
            return (
              <td key={k} className={`${textAlign} py-3 px-3 align-middle`}>
                <span className="text-sm font-bold text-amber-800 dark:text-amber-300">
                  {formatDateEnglish(line.date)}
                </span>
              </td>
            )
          }
          if (k === 'voucher') {
            return (
              <td key={k} className={`font-mono text-xs ${textAlign} py-3 px-3 text-neutral-400`}>
                —
              </td>
            )
          }
          if (k === 'operation') {
            return (
              <td key={k} className={`${textAlign} py-3 px-3 align-middle`}>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700">
                  ◈ {t.accounts.previousBalanceBadge}
                </span>
              </td>
            )
          }
          if (k === 'branch' || k === 'costCenter') {
            return (
              <td key={k} className={`${textAlign} py-3 px-3 text-neutral-400`}>
                —
              </td>
            )
          }
          if (k === 'description') {
            return (
              <td key={k} className={`${textAlign} py-3 px-3 align-middle`}>
                <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                  {getStatementDescription(line, lang)}
                </span>
              </td>
            )
          }
          if (k === 'debit') {
            return (
              <td key={k} className="text-center py-3 px-3 font-semibold text-red-600 dark:text-red-400 tabular-nums">
                {line.debit > 0 ? formatNum(line.debit) : '—'}
              </td>
            )
          }
          if (k === 'credit') {
            return (
              <td key={k} className="text-center py-3 px-3 font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {line.credit > 0 ? formatNum(line.credit) : '—'}
              </td>
            )
          }
          if (k === 'balance') {
            return (
              <td key={k} className={`text-center py-3 px-3 font-bold tabular-nums ${balanceClass}`}>
                {formatNum(balance)}
                <span className="text-xs font-normal opacity-80 ms-1">
                  ({balancePositive ? t.accounts.balanceDebit : t.accounts.balanceCredit})
                </span>
              </td>
            )
          }
          return null
        })}
      </tr>
    )
  }

  function renderPrintOpeningRow(line: LineType) {
    return (
      <tr className="bg-amber-50 border-b-2 border-amber-300 print:bg-amber-50">
        {visibleColumnKeys.map((k) => {
          if (k === 'date') {
            return (
              <td key={k} className="px-3 py-2 font-bold text-amber-900">
                {formatDateEnglish(line.date)}
              </td>
            )
          }
          if (k === 'voucher') {
            return <td key={k} className="px-3 py-2 text-slate-500">—</td>
          }
          if (k === 'operation' || k === 'description') {
            const label =
              k === 'operation'
                ? `◈ ${t.accounts.previousBalanceBadge}`
                : getStatementDescription(line, lang)
            return (
              <td key={k} className="px-3 py-2 font-semibold text-amber-900">
                {label}
              </td>
            )
          }
          if (k === 'branch' || k === 'costCenter') {
            return <td key={k} className="px-3 py-2 text-slate-500">—</td>
          }
          if (k === 'debit') {
            return (
              <td key={k} className={`${alignNum} px-3 py-2 font-medium text-red-600`}>
                {line.debit > 0 ? formatNum(line.debit) : ''}
              </td>
            )
          }
          if (k === 'credit') {
            return (
              <td key={k} className={`${alignNum} px-3 py-2 font-medium text-emerald-600`}>
                {line.credit > 0 ? formatNum(line.credit) : ''}
              </td>
            )
          }
          if (k === 'balance') {
            return (
              <td key={k} className={`${alignNum} px-3 py-2 font-bold text-slate-900`}>
                {formatNum(line.running_balance)}
              </td>
            )
          }
          return null
        })}
      </tr>
    )
  }

  function renderPrintCell(line: LineType, k: AccountStatementColumnKey) {
    switch (k) {
      case 'date':
        return <td key={k} className="px-3 py-2 text-slate-700">{formatDateEnglish(line.date)}</td>
      case 'voucher':
        return <td key={k} className="px-3 py-2 text-slate-700 font-mono text-xs">{line.reference_number}</td>
      case 'operation':
        return <td key={k} className="px-3 py-2 text-slate-700">{getOperationTypeDisplay(line, lang)}</td>
      case 'branch':
        return <td key={k} className="px-3 py-2 text-slate-700">{getBranchDisplay(line, lang)}</td>
      case 'costCenter':
        return <td key={k} className="px-3 py-2 text-slate-700">{getCostCenterDisplay(line, lang)}</td>
      case 'description':
        return <td key={k} className="px-3 py-2 text-slate-700">{getStatementDescription(line, lang)}</td>
      case 'debit':
        return <td key={k} className={`${alignNum} px-3 py-2 text-red-600`}>{line.debit > 0 ? formatNum(line.debit) : ''}</td>
      case 'credit':
        return <td key={k} className={`${alignNum} px-3 py-2 text-emerald-600`}>{line.credit > 0 ? formatNum(line.credit) : ''}</td>
      case 'balance':
        return <td key={k} className={`${alignNum} px-3 py-2 font-medium text-slate-800`}>{formatNum(line.running_balance)}</td>
      default:
        return null
    }
  }

  function renderPrintHeaderCell(k: AccountStatementColumnKey) {
    const label = columnLabels[k]
    if (k === 'debit' || k === 'credit' || k === 'balance') {
      return <th key={k} className={`${alignNum} px-3 py-2.5 border-b border-slate-200 w-28`}>{label}</th>
    }
    return <th key={k} className={`${textAlign} px-3 py-2.5 border-b border-slate-200`}>{label}</th>
  }

  const containerWidthClass = 'w-full max-w-full'

  const paramsValid = !!accountIdParam && !!dateFromParam && !!dateToParam

  return (
    <div className="page-bg flex flex-col w-full max-w-full min-h-0">
      <header className="bg-white border-b border-neutral-200 shrink-0 no-print">
        <div className="px-1.5 sm:px-2 py-2">
          <div
            className={`grid w-full grid-cols-1 items-center gap-y-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-x-2 sm:gap-y-0 ${containerWidthClass}`}
          >
            <div className="min-w-0 sm:justify-self-start flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => navigate('/accounts')}
                className="inline-flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-900 w-fit"
              >
                <ArrowLeft className={isRtl ? 'size-4 rotate-180' : 'size-4'} aria-hidden />
                {lang === 'ar' ? 'العودة لدليل الحسابات' : 'Back to chart of accounts'}
              </button>
              {fetched ? (
                <p className="text-sm font-semibold text-neutral-800 truncate">
                  {t.accounts.accountStatementTitle} — <span className="font-mono text-xs text-neutral-500">{fetched.account.code}</span>{' '}
                  {getDisplayName(fetched.account)}
                </p>
              ) : (
                <p className="text-sm text-neutral-600">{t.accounts.accountStatementTitle}</p>
              )}
            </div>
            <div className="flex max-w-full flex-wrap items-center justify-center justify-self-center gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-slate-600 shrink-0">{labelPeriod}</span>
                <select
                  value={periodPreset}
                  onChange={(e) => applySheetPeriodPreset((e.target.value as ReportPeriodKey | 'custom') || 'all')}
                  className={periodSelectCls}
                  title={labelPeriod}
                  aria-label={labelPeriod}
                >
                  {SHEET_PERIOD_OPTIONS.map((opt) => (
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
                      value={editFrom}
                      onChange={(e) => setEditFrom(e.target.value)}
                      className={dateInputCls}
                      title={labelFrom}
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-slate-600 whitespace-nowrap">{labelTo}</span>
                    <input
                      type="date"
                      value={editTo}
                      onChange={(e) => setEditTo(e.target.value)}
                      className={dateInputCls}
                      title={labelTo}
                    />
                  </div>
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-1.5 sm:justify-self-end">
              <div className="relative flex-shrink-0" ref={columnsMenuRef}>
                <button
                  type="button"
                  onClick={() => setShowColumnsMenu((v) => !v)}
                  className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-[#F0F2F5] border border-[#D9DCE0] text-[#344054] hover:bg-[#E4E7EB]"
                  title={lang === 'ar' ? 'تخصيص الأعمدة' : 'Customize columns'}
                >
                  <Columns3 size={16} />
                </button>
                {showColumnsMenu && (
                  <div className="absolute top-full end-0 mt-1 z-50 min-w-[220px] bg-white border border-slate-200 rounded-lg shadow-lg py-2 max-h-72 overflow-y-auto">
                    <p className="px-3 py-1.5 text-xs font-semibold text-slate-500 border-b border-slate-100 mb-1">
                      {lang === 'ar' ? 'إظهار الأعمدة' : 'Show columns'}
                    </p>
                    {ACCOUNT_STATEMENT_COLUMN_KEYS.map((key) => (
                      <label key={key} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={visibleColumns[key]}
                          onChange={(e) => {
                            const next = e.target.checked
                            const visibleCount = ACCOUNT_STATEMENT_COLUMN_KEYS.filter((x) => visibleColumns[x]).length
                            if (!next && visibleCount <= 1) return
                            setVisibleColumns((prev) => ({ ...prev, [key]: next }))
                          }}
                          className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                        />
                        <span className="text-slate-700 text-xs">{columnLabels[key]}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-[#F0F2F5] border border-[#D9DCE0] text-[#344054] hover:bg-[#E4E7EB]"
                title={t.accounts.print}
              >
                <Printer size={16} />
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-[#344054] text-white hover:bg-[#2d3846]"
                title={t.accounts.exportPdf}
              >
                <FileText size={16} />
              </button>
              <button
                type="button"
                onClick={exportExcel}
                className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-500"
                title={t.accounts.exportExcel}
              >
                <FileSpreadsheet size={16} />
              </button>
            </div>
          </div>

        </div>
      </header>

      <main className="flex-1 min-w-0 w-full overflow-auto">
        <div className={`px-1 sm:px-2 py-2 ${containerWidthClass}`}>
      {!paramsValid ? (
        <div className="py-12 text-center text-neutral-500 text-sm border border-dashed border-neutral-200 rounded-[8px] bg-neutral-50/50">
          {lang === 'ar'
            ? 'رابط غير صالح. افتح الكشف من قائمة الحسابات أو تأكد من وجود accountId ومن تاريخ وإلى تاريخ في الرابط.'
            : 'Invalid link. Open the statement from the accounts list (accountId, from_date, to_date required).'}
        </div>
      ) : !tenantId || (statementLoading && !fetched) ? (
        <div className="flex items-center justify-center py-24">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
        </div>
      ) : fetched ? (
        <>
          {/* ─── جدول البيانات ─── */}
          <div className="border-t border-neutral-100 pt-2 no-print">
          <div className="bg-white rounded-[8px] border border-neutral-200 overflow-hidden flex flex-col min-h-0 shadow-sm">
            <div className="border-b border-slate-200 bg-white px-2 sm:px-3 py-2 flex-shrink-0 no-print">
              <div className="flex flex-nowrap items-center justify-between gap-3 w-full min-w-0 overflow-x-auto">
                <div className="flex flex-nowrap items-center gap-3 min-w-0 flex-1">
                  <div className="flex-1 basis-0 min-w-[12rem] max-w-[26rem]">
                    <input
                      type="text"
                      value={tableSearch}
                      onChange={(e) => {
                        setTableSearch(e.target.value)
                        setPage(1)
                      }}
                      placeholder={lang === 'ar' ? 'بحث في الجدول...' : 'Search in table...'}
                      aria-label={lang === 'ar' ? 'بحث في الجدول' : 'Search in table'}
                      className={filterTextCls}
                      dir={isRtl ? 'rtl' : 'ltr'}
                    />
                  </div>
                  <div className="min-w-[10rem] w-48 shrink-0">
                    <select
                      value={movementTypeFilter[0] ?? ''}
                      onChange={(e) => {
                        const value = e.target.value
                        setMovementTypeFilter(value ? [value] : [])
                        setPage(1)
                      }}
                      aria-label={t.accounts.operationType}
                      title={t.accounts.operationType}
                      className={filterSelectCls}
                    >
                      <option value="">{t.accounts.operationType}</option>
                      {Object.entries(lang === 'ar' ? OPERATION_CODE_LABELS_AR : OPERATION_CODE_LABELS_EN).map(([code, label]) => (
                        <option key={code} value={code}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {fetched?.linked_customer_id != null && fetched.linked_customer_id > 0 && !journalCustomerIdParam && (
                    <label className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm text-slate-700 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={includeInstallments}
                        onChange={(e) => {
                          const next = e.target.checked
                          setSearchParams((prev) => {
                            const n = new URLSearchParams(prev)
                            if (next) n.delete('include_installments')
                            else n.set('include_installments', '0')
                            return n
                          })
                          setPage(1)
                        }}
                        className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span title={t.accounts.includeInstallmentsHint}>{t.accounts.includeInstallments}</span>
                    </label>
                  )}
                  <div className="min-w-[11.5rem] w-52 shrink-0">
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
                      {branchesList.map((b) => (
                        <option key={b.id} value={String(b.id)}>
                          {getDisplayName(b)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="min-w-[11.5rem] w-52 shrink-0">
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
                      {costCentersList.map((cc) => (
                        <option key={cc.id} value={String(cc.id)}>
                          {getDisplayName(cc)}
                        </option>
                      ))}
                    </select>
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

            <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0 relative">
              <table className="table-zebra w-full text-sm min-w-[880px]">
                <thead className="sticky top-0 z-10 bg-white border-b border-neutral-200 shadow-[0_1px_0_0_var(--color-neutral-200)]">
                  <tr>
                    {visibleColumnKeys.map((k) => renderStatementHeaderCell(k))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedLines.map((line, idx) => {
                    if (isOpeningStatementLine(line)) {
                      return renderOpeningStatementRow(line, `opening-${idx}`)
                    }
                    const jeId = (line as LineType & { journal_entry_id?: number | null }).journal_entry_id
                    return (
                      <tr key={idx} className="border-b border-neutral-100">
                        {visibleColumnKeys.map((k) => renderStatementCell(line, k, jeId ?? null))}
                      </tr>
                    )
                  })}
                </tbody>
                {(visibleColumns.debit || visibleColumns.credit) && (
                  <tfoot>
                    <tr className="bg-gradient-to-r from-slate-100 to-slate-50 border-t-2 border-slate-400 font-bold text-slate-900 shadow-[0_-2px_4px_rgba(0,0,0,0.04)]">
                      {visibleColumnKeys.map((k) => renderPeriodTotalsFooterCell(k))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <ReportFooter
              totalCount={totalFiltered}
              currentPage={page}
              lastPage={totalPages}
              from={totalFiltered === 0 ? 0 : (page - 1) * pageSize + 1}
              to={totalFiltered === 0 ? 0 : Math.min(page * pageSize, totalFiltered)}
              onPageChange={setPage}
              lang={lang}
              isRtl={isRtl}
              alwaysShowPaginationBar
              showRecordSummary={totalFiltered > 0}
              recordLabel={lang === 'ar' ? 'حركة' : 'line'}
              dense
            />
          </div>
          </div>

          {/* ─── منطقة الطباعة (مخفية على الشاشة العادية عند عدم الطباعة) ─── */}
          <div id="account-statement-print" className="bg-white rounded-xl border border-slate-200 overflow-hidden statement-document mt-6 print:block hidden print:visible" dir={isRtl ? 'rtl' : 'ltr'}>
            <div className="p-6 border-b border-slate-200">
              {fetched.company?.logo && (
                <div className="mb-3">
                  <img src={fetched.company.logo} alt="" className="h-14 object-contain" />
                </div>
              )}
              <h2 className="text-xl font-bold text-slate-900 mb-1">{fetched.company?.name ?? currentTenant?.name ?? '—'}</h2>
              <div className="text-sm text-slate-600 space-y-0.5">
                {fetched.company?.address && <p>{fetched.company.address}</p>}
                {fetched.company?.phone && <p>{t.accounts.phone}: {fetched.company.phone}</p>}
                {fetched.company?.email && <p>{fetched.company.email}</p>}
                {fetched.company?.tax_registration_number && <p>{t.accounts.taxNumber}: {fetched.company.tax_registration_number}</p>}
              </div>
              <h3 className="text-lg font-semibold text-slate-800 mt-6 text-center">{t.accounts.accountStatementTitle}</h3>
              <p className="text-sm text-slate-600 text-center mt-1">
                {t.accounts.statementNumber}: {fetched.statement_number} — {t.accounts.issueDate}: {formatDateEnglish(fetched.issue_date)}
              </p>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 space-y-1">
              <p className="font-medium text-slate-800"><span className="text-slate-500">{t.accounts.accountName}:</span> {getDisplayName(fetched.account)}</p>
              <p className="text-sm text-slate-600"><span className="text-slate-500">{t.accounts.accountNumber}:</span> {fetched.account.code}</p>
              {fetched.account.phone && <p className="text-sm text-slate-600"><span className="text-slate-500">{t.accounts.phone}:</span> {fetched.account.phone}</p>}
              {fetched.account.address && <p className="text-sm text-slate-600"><span className="text-slate-500">{t.accounts.address}:</span> {fetched.account.address}</p>}
              {fetched.account.tax_number && <p className="text-sm text-slate-600"><span className="text-slate-500">{t.accounts.taxNumber}:</span> {fetched.account.tax_number}</p>}
              <p className="text-sm text-slate-600 mt-2">{t.accounts.periodFromTo}: {formatDateEnglish(fetched.period.from)} — {formatDateEnglish(fetched.period.to)}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm statement-table">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-medium">
                    {visibleColumnKeys.map((k) => renderPrintHeaderCell(k))}
                  </tr>
                </thead>
                <tbody>
                  {allLines.map((line, idx) =>
                    isOpeningStatementLine(line) ? (
                      renderPrintOpeningRow(line)
                    ) : (
                      <tr key={idx} className="border-b border-slate-100">
                        {visibleColumnKeys.map((k) => renderPrintCell(line, k))}
                      </tr>
                    ),
                  )}
                </tbody>
                <tfoot>
                  {(visibleColumns.debit || visibleColumns.credit) && (
                    <tr className="bg-slate-100 font-semibold text-slate-900">
                      {visibleColumnKeys.map((k) => {
                        if (k === 'debit') {
                          return (
                            <td key={k} className={`${alignNum} px-3 py-3 border-t-2 border-slate-300 text-red-600`}>
                              {formatNum(displayedDebitCreditTotals.debit)}
                            </td>
                          )
                        }
                        if (k === 'credit') {
                          return (
                            <td key={k} className={`${alignNum} px-3 py-3 border-t-2 border-slate-300 text-emerald-600`}>
                              {formatNum(displayedDebitCreditTotals.credit)}
                            </td>
                          )
                        }
                        if (k === 'balance') {
                          return (
                            <td key={k} className={`${alignNum} px-3 py-3 border-t-2 border-slate-300 text-slate-400`}>
                              —
                            </td>
                          )
                        }
                        if (k === periodTotalsLabelKeys[0]) {
                          return (
                            <td
                              key={k}
                              colSpan={Math.max(1, periodTotalsLabelKeys.length)}
                              className={`${textAlign} px-3 py-3 border-t-2 border-slate-300`}
                            >
                              {lang === 'ar' ? 'إجماليات الفترة' : 'Period totals'}
                            </td>
                          )
                        }
                        if (periodTotalsLabelKeys.includes(k)) return null
                        return null
                      })}
                    </tr>
                  )}
                  <tr className="bg-primary-50 font-semibold text-slate-900">
                    {visibleColumns.balance ? (
                      <>
                        <td className="px-3 py-2 border-t border-slate-200" colSpan={closingLabelColSpan}>
                          {t.accounts.closingBalance} / {t.accounts.balanceState}
                        </td>
                        <td className={`${alignNum} px-3 py-2 border-t border-slate-200`}>
                          {formatNum(fetched.closing_balance)} ({fetched.balance_type === 'debit' ? t.accounts.balanceDebit : t.accounts.balanceCredit})
                        </td>
                      </>
                    ) : (
                      <td className="px-3 py-2 border-t border-slate-200" colSpan={Math.max(1, totalVisibleColumns)}>
                        {t.accounts.closingBalance} / {t.accounts.balanceState}: {formatNum(fetched.closing_balance)} (
                        {fetched.balance_type === 'debit' ? t.accounts.balanceDebit : t.accounts.balanceCredit})
                      </td>
                    )}
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="p-6 mt-6">
              <div className="flex items-end justify-center gap-32 mt-12 pt-8 text-sm text-slate-600">
                <div className="text-center">
                  <p className="font-medium text-slate-700">{t.accounts.signature}</p>
                </div>
                <div className="text-center">
                  <p className="font-medium text-slate-700">{t.accounts.stamp}</p>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="py-12 text-center text-neutral-500 text-sm border border-dashed border-neutral-200 rounded-[8px] bg-neutral-50/50 space-y-3">
          <p>{statementError ?? (lang === 'ar' ? 'تعذر تحميل كشف الحساب.' : 'Could not load account statement.')}</p>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            onClick={() => {
              if (!tenantId || !accountIdParam || !dateFromParam || !dateToParam) return
              setStatementLoading(true)
              setStatementError(null)
              fetchAccountStatement(tenantId, {
                account_id: accountIdParam,
                from_date: dateFromParam,
                to_date: dateToParam,
                ...(journalCustomerIdParam ? { journal_customer_id: journalCustomerIdParam } : {}),
                ...(!includeInstallments ? { include_installments: false } : {}),
              })
                .then(setFetched)
                .catch((err) => {
                  setFetched(null)
                  setStatementError(
                    apiErrorMessage(
                      err,
                      lang === 'ar' ? 'تعذر تحميل كشف الحساب.' : 'Could not load account statement.',
                    ),
                  )
                })
                .finally(() => setStatementLoading(false))
            }}
          >
            {lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}
          </button>
        </div>
      )}

        </div>
      </main>

      {/* نافذة عرض قيد اليومية المرتبط بسطر كشف الحساب */}
      {viewEntryId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setViewEntryId(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">
                {t.journal.viewEntry} — {viewEntry?.number ?? ''}
              </h3>
              <div className="flex items-center gap-2 no-print-entry">
                {viewEntry && getSourceUrlFromEntry(viewEntry) && (
                  <button
                    type="button"
                    onClick={() => {
                      const url = getSourceUrlFromEntry(viewEntry)
                      if (!url) return
                      window.open(url, '_blank', 'noopener,noreferrer')
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-primary-200 text-primary-700 bg-primary-50 hover:bg-primary-100"
                  >
                    <ExternalLink size={16} />
                    {t.journal.goToSource ?? 'فتح السند الأصلي'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (!viewEntry) return
                    const title = `${t.journal.viewEntry} - ${viewEntry.number}`
                    const docTitle = `${title}`
                    const logo = (settings as any)?.company_logo as string | undefined
                    const companyName = (settings as any)?.company_name || currentTenant?.name || ''
                    const rows = (viewEntry.lines || [])
                      .map((ln) => {
                        const isDebit = ln.debit > 0
                        const bg = isDebit ? ' style="background-color:#ecfdf3;"' : ''
                        const debit = ln.debit > 0 ? formatNum(ln.debit, 'en-US') : ''
                        const credit = ln.credit > 0 ? formatNum(ln.credit, 'en-US') : ''
                        return `<tr${bg}>
  <td style="padding:6px 8px;border:1px solid #e2e8f0;font-family:monospace;">${ln.account?.code ?? '—'}</td>
  <td style="padding:6px 8px;border:1px solid #e2e8f0;">${ln.account?.name ?? '—'}</td>
  <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:right;">${debit}</td>
  <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:right;">${credit}</td>
</tr>`
                      })
                      .join('')
                    const totalDebit = formatNum(viewEntry.total_debit, 'en-US')
                    const totalCredit = formatNum(viewEntry.total_credit, 'en-US')
                    const w = window.open('', '_blank', 'noopener,noreferrer')
                    if (!w) return
                    w.document.write(`<!DOCTYPE html>
<html dir="${isRtl ? 'rtl' : 'ltr'}">
  <head>
    <meta charset="utf-8" />
    <title>${docTitle}</title>
    <style>
      body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 20px; color: #0f172a; }
      .header { border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 16px; }
      .header h1 { margin: 0 0 4px; font-size: 20px; }
      .meta { font-size: 13px; color: #475569; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 12px; }
      th { background:#f8fafc; color:#334155; font-weight:400; padding:6px 8px; border:1px solid #e2e8f0; text-align:${isRtl ? 'right' : 'left'}; }
      tfoot td { font-weight:400; background:#f8fafc; }
    </style>
  </head>
  <body>
    <div class="header">
      ${logo ? `<img src="${logo}" alt="" style="height:40px;object-fit:contain;margin-bottom:8px;" />` : ''}
      <h1>${companyName || ''}</h1>
      <div class="meta">
        <div>${t.journal.entryNumber ?? 'رقم القيد'}: ${viewEntry.number}</div>
        <div>${t.date}: ${formatDateEnglish(viewEntry.date as string)}</div>
        <div>${t.type}: ${viewEntry.type}</div>
      </div>
    </div>
    ${viewEntry.description ? `<p style="font-size:13px;color:#475569;margin:0 0 8px;">${viewEntry.description}</p>` : ''}
    <table>
      <thead>
        <tr>
          <th>${t.accounts.accountCode}</th>
          <th>${t.accounts.accountName}</th>
          <th style="text-align:right;">${t.journal.debit}</th>
          <th style="text-align:right;">${t.journal.credit}</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="2" style="padding:6px 8px;border:1px solid #e2e8f0;">${t.total}</td>
          <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:right;">${totalDebit}</td>
          <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:right;">${totalCredit}</td>
        </tr>
      </tfoot>
    </table>
  </body>
</html>`)
                    w.document.close()
                    w.focus()
                    setTimeout(() => { w.print(); w.close() }, 300)
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  <Printer size={16} />
                  {t.journal.print}
                </button>
                <button onClick={() => setViewEntryId(null)} className="p-2 text-slate-400 hover:text-slate-600">
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="p-4 overflow-auto flex-1">
              {loadingEntry ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
                </div>
              ) : viewEntry ? (
                <div className="text-sm">
                  <div className="grid grid-cols-2 gap-2 mb-4 text-slate-600">
                    <span>{t.date}:</span><span>{formatDateEnglish(viewEntry.date as string)}</span>
                    <span>{t.type}:</span><span>{viewEntry.type}</span>
                    <span>{t.status}:</span><span>{viewEntry.status}</span>
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
                      {viewEntry.lines?.map((line, idx) => {
                        const isDebit = line.debit > 0
                        return (
                          <tr key={line.id ?? idx} className={isDebit ? 'bg-emerald-50/60' : ''}>
                            <td className="px-2 py-2 font-mono">{line.account?.code ?? '—'}</td>
                            <td className="px-2 py-2">{line.account?.name ?? '—'}</td>
                            <td className="px-2 py-2">{line.debit > 0 ? formatNum(line.debit) : ''}</td>
                            <td className="px-2 py-2">{line.credit > 0 ? formatNum(line.credit) : ''}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-300 font-bold">
                        <td colSpan={2} className="px-2 py-2">{t.total}</td>
                        <td className="px-2 py-2">{viewEntry ? formatNum(viewEntry.total_debit) : ''}</td>
                        <td className="px-2 py-2">{viewEntry ? formatNum(viewEntry.total_credit) : ''}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          @page { size: A4; margin: 15mm; }
          body * { visibility: hidden; }
          #account-statement-print, #account-statement-print * { visibility: visible; }
          #account-statement-print { position: absolute; left: 0; top: 0; width: 100%; max-width: 210mm; margin: 0; padding: 0; box-shadow: none; border: none; background: white; }
          .no-print { display: none !important; }
          .statement-document { break-inside: avoid; page-break-inside: avoid; }
          .statement-table { font-size: 10px; }
        }
        @media screen {
          #account-statement-print { width: 100%; max-width: none; }
        }
      `}</style>
    </div>
  )
}
