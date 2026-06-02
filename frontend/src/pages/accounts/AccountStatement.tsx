import { useState, useMemo, useRef, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchAccountTree, fetchSettings, fetchTrialBalance, fetchBranches, fetchCostCenters } from '../../api/tenant'
import type { Account, TenantSettings, Branch, CostCenter } from '../../types'
import { getReportPeriodRange, type ReportPeriodKey } from '../../utils/date'
import { formatAmount } from '../../utils/currency'
import { Search } from 'lucide-react'
import { useClientSort } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'

function flattenAccounts(
  accounts: Account[],
  result: { id: number; code: string; name: string; name_en: string | null; type: string; is_postable?: boolean; has_children?: boolean }[] = [],
): { id: number; code: string; name: string; name_en: string | null; type: string; is_postable?: boolean; has_children?: boolean }[] {
  for (const acc of accounts) {
    result.push({
      id: acc.id,
      code: acc.code,
      name: acc.name,
      name_en: acc.name_en ?? null,
      type: acc.type,
      is_postable: acc.is_postable,
      has_children: !!(acc.children?.length),
    })
    if (acc.children?.length) flattenAccounts(acc.children, result)
  }
  return result
}

function accountsByIdFromTree(accounts: Account[]): Map<number, Account> {
  const m = new Map<number, Account>()
  const walk = (a: Account) => {
    m.set(a.id, a)
    a.children?.forEach(walk)
  }
  accounts.forEach(walk)
  return m
}

interface TrialBalanceOverviewRow {
  account_id: number
  closing_debit: number
  closing_credit: number
}

function formatLinkedNames(
  ids: number[] | undefined | null,
  list: { id: number; name: string; name_en: string | null }[],
  lang: 'ar' | 'en',
  allLabel: string,
): string {
  if (!ids || ids.length === 0) return allLabel
  const sep = lang === 'ar' ? '، ' : ', '
  return ids
    .map((id) => {
      const x = list.find((b) => b.id === id)
      if (!x) return String(id)
      return lang === 'ar' ? (x.name || x.name_en || '') : (x.name_en || x.name || '')
    })
    .filter(Boolean)
    .join(sep)
}

export function buildAccountStatementSheetUrl(accountId: number, from: string, to: string): string {
  const qs = new URLSearchParams({
    accountId: String(accountId),
    from_date: from,
    to_date: to,
  })
  return `/accounts/statement/sheet?${qs.toString()}`
}

const TABLE_PAGE_SIZES = [10, 25, 50, 100, 500] as const

/** مفاتيح أنواع الحساب في شجرة الحسابات (للتصفية) */
const ACCOUNT_TYPE_FILTER_KEYS = ['asset', 'liability', 'equity', 'revenue', 'cogs', 'expense'] as const

const STATEMENT_PERIOD_OPTIONS: { value: ReportPeriodKey | 'custom'; labelAr: string; labelEn: string }[] = [
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

export default function AccountStatement() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { currentTenant } = useAuth()
  const { t, lang, isRtl, getDisplayName } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const accountSearchRef = useRef<HTMLDivElement>(null)
  const openedSheetFromUrl = useRef(false)

  const { data: settings } = useQuery<TenantSettings>({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const decimals = Number(settings?.doc_amount_decimals) || 2
  const formatNum = (n: number, loc?: string) => formatAmount(Math.abs(n), { decimal_places: decimals }, loc ?? locale)

  const [accountId, setAccountId] = useState<number | ''>('')
  const [accountSearch, setAccountSearch] = useState('')
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false)
  const initialDefaultRange = useMemo(() => getReportPeriodRange('all'), [])
  const [periodPreset, setPeriodPreset] = useState<ReportPeriodKey | 'custom'>('all')
  const [dateFrom, setDateFrom] = useState(initialDefaultRange.from_date)
  const [dateTo, setDateTo] = useState(initialDefaultRange.to_date)
  const [tablePage, setTablePage] = useState(1)
  const [tablePageSize, setTablePageSize] = useState(25)
  const [accountTypeFilter, setAccountTypeFilter] = useState<string>('')

  const accountTypeLabels = useMemo(
    () =>
      ({
        asset: t.accounts.types.asset,
        liability: t.accounts.types.liability,
        equity: t.accounts.types.equity,
        revenue: t.accounts.types.revenue,
        cogs: t.accounts.types.cogs,
        expense: t.accounts.types.expense,
      }) satisfies Record<string, string>,
    [t.accounts.types],
  )

  function applyStatementPeriodPreset(preset: ReportPeriodKey | 'custom') {
    setPeriodPreset(preset)
    if (preset !== 'custom') {
      const range = getReportPeriodRange(preset)
      setDateFrom(range.from_date)
      setDateTo(range.to_date)
    }
  }

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accountTree', tenantId, 'active'],
    queryFn: () => fetchAccountTree(tenantId, { active_only: '1' }),
    enabled: !!tenantId,
  })

  const flatAccounts = useMemo(() => flattenAccounts(accounts), [accounts])
  const postableAccounts = useMemo(() => flatAccounts.filter((a) => !a.has_children && a.is_postable !== false), [flatAccounts])

  const postableAccountsByType = useMemo(() => {
    if (!accountTypeFilter) return postableAccounts
    return postableAccounts.filter((a) => a.type === accountTypeFilter)
  }, [postableAccounts, accountTypeFilter])

  const filteredAccounts = useMemo(() => {
    if (!accountSearch.trim()) return postableAccountsByType
    const q = accountSearch.trim().toLowerCase()
    return postableAccountsByType.filter((a) => {
      return (
        a.code.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        (a.name_en?.toLowerCase().includes(q) ?? false)
      )
    })
  }, [postableAccountsByType, accountSearch])

  const selectedAccount = useMemo(() => flatAccounts.find((a) => a.id === accountId), [flatAccounts, accountId])

  useEffect(() => {
    if (!accountTypeFilter || accountId === '') return
    const acc = flatAccounts.find((a) => a.id === accountId)
    if (acc && acc.type !== accountTypeFilter) {
      setAccountId('')
      setAccountSearch('')
    }
  }, [accountTypeFilter, accountId, flatAccounts])

  useEffect(() => {
    setTablePage(1)
  }, [accountTypeFilter])

  const trialBalanceParams = useMemo(() => {
    const p: Record<string, string> = {
      include_zero_balance: '1',
      display_level: '5',
    }
    if (dateFrom) p.from_date = dateFrom
    if (dateTo) p.to_date = dateTo
    return p
  }, [dateFrom, dateTo])

  const { data: trialBalanceOverview, isLoading: trialBalanceOverviewLoading } = useQuery({
    queryKey: ['trialBalance', 'accountStatementOverview', tenantId, dateFrom, dateTo],
    queryFn: () => fetchTrialBalance(tenantId, trialBalanceParams),
    enabled: !!tenantId && !!dateFrom && !!dateTo,
  })

  const { data: branchesList = [] } = useQuery<Branch[]>({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId,
  })

  const { data: costCentersList = [] } = useQuery<CostCenter[]>({
    queryKey: ['costCenters', tenantId],
    queryFn: () => fetchCostCenters(tenantId),
    enabled: !!tenantId,
  })

  const accountByIdMap = useMemo(() => accountsByIdFromTree(accounts), [accounts])

  const tbByAccountId = useMemo(() => {
    const m = new Map<number, TrialBalanceOverviewRow>()
    const rows = trialBalanceOverview?.accounts as Array<{
      account_id: number
      closing_debit: number
      closing_credit: number
    }> | undefined
    if (!rows) return m
    for (const r of rows) {
      if (r && typeof r.account_id === 'number') {
        m.set(r.account_id, {
          account_id: r.account_id,
          closing_debit: Number(r.closing_debit) || 0,
          closing_credit: Number(r.closing_credit) || 0,
        })
      }
    }
    return m
  }, [trialBalanceOverview])

  const accountsOverviewRows = useMemo(() => {
    return postableAccountsByType.map((a) => {
      const full = accountByIdMap.get(a.id)
      const tb = tbByAccountId.get(a.id)
      const closingDebit = tb?.closing_debit ?? 0
      const closingCredit = tb?.closing_credit ?? 0
      const balance = closingDebit - closingCredit
      const parent = full?.parent_id ? accountByIdMap.get(full.parent_id) : undefined
      return {
        id: a.id,
        code: a.code,
        name: a.name,
        name_en: a.name_en,
        type: a.type,
        parentLabel: parent ? getDisplayName(parent) : '—',
        branchLabel: formatLinkedNames(full?.branch_ids, branchesList, lang, t.accounts.allBranches),
        costCenterLabel: formatLinkedNames(full?.cost_center_ids, costCentersList, lang, t.accounts.allCostCenters),
        balance,
      }
    })
  }, [postableAccountsByType, accountByIdMap, tbByAccountId, branchesList, costCentersList, lang, t.accounts.allBranches, t.accounts.allCostCenters, getDisplayName])

  type SortKey = 'code' | 'name' | 'parent' | 'type' | 'branches' | 'costCenters' | 'balance'
  const sortColumns = useMemo(() => {
    const typeMap = t.accounts.types as Record<string, string>
    return [
      { key: 'code' as const, type: 'string' as const, getValue: (r: (typeof accountsOverviewRows)[number]) => r.code ?? '' },
      {
        key: 'name' as const,
        type: 'string' as const,
        getValue: (r: (typeof accountsOverviewRows)[number]) =>
          getDisplayName({ id: r.id, name: r.name, name_en: r.name_en } as Account),
      },
      { key: 'parent' as const, type: 'string' as const, getValue: (r: (typeof accountsOverviewRows)[number]) => r.parentLabel ?? '' },
      { key: 'type' as const, type: 'string' as const, getValue: (r: (typeof accountsOverviewRows)[number]) => typeMap[r.type] ?? r.type ?? '' },
      { key: 'branches' as const, type: 'string' as const, getValue: (r: (typeof accountsOverviewRows)[number]) => r.branchLabel ?? '' },
      { key: 'costCenters' as const, type: 'string' as const, getValue: (r: (typeof accountsOverviewRows)[number]) => r.costCenterLabel ?? '' },
      { key: 'balance' as const, type: 'number' as const, getValue: (r: (typeof accountsOverviewRows)[number]) => Number(r.balance ?? 0) },
    ]
  }, [t.accounts.types, getDisplayName, accountsOverviewRows])
  const { sort, toggleSort, sortedRows } = useClientSort<(typeof accountsOverviewRows)[number], SortKey>(accountsOverviewRows, sortColumns, { locale })

  const tableTotal = accountsOverviewRows.length
  const tableTotalPages = Math.max(1, Math.ceil(tableTotal / tablePageSize))
  const tablePageSafe = Math.min(Math.max(1, tablePage), tableTotalPages)

  useEffect(() => {
    setTablePage((p) => Math.min(p, tableTotalPages))
  }, [tableTotalPages])

  const paginatedOverviewRows = useMemo(() => {
    const start = (tablePageSafe - 1) * tablePageSize
    return sortedRows.slice(start, start + tablePageSize)
  }, [sortedRows, tablePageSafe, tablePageSize])

  const tableRangeFrom = tableTotal === 0 ? 0 : (tablePageSafe - 1) * tablePageSize + 1
  const tableRangeTo = tableTotal === 0 ? 0 : Math.min(tablePageSafe * tablePageSize, tableTotal)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (accountSearchRef.current && !accountSearchRef.current.contains(e.target as Node)) {
        setAccountDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  /** ?accountId= من دليل الحسابات: الانتقال لصفحة كشف الحساب التفصيلي في نفس التبويب */
  useEffect(() => {
    const idFromUrl = searchParams.get('accountId')
    if (!idFromUrl || openedSheetFromUrl.current || !tenantId) return
    const numId = Number(idFromUrl)
    if (!Number.isInteger(numId) || numId <= 0) return
    const found = flatAccounts.find((a) => a.id === numId)
    if (!found) return
    openedSheetFromUrl.current = true
    setAccountId(numId)
    const fromUrl = searchParams.get('from_date')
    const toUrl = searchParams.get('to_date')
    if (fromUrl && toUrl) {
      setDateFrom(fromUrl)
      setDateTo(toUrl)
      setPeriodPreset('custom')
    }
    const range = getReportPeriodRange('all')
    const from_date = fromUrl && toUrl ? fromUrl : range.from_date
    const to_date = fromUrl && toUrl ? toUrl : range.to_date
    navigate(buildAccountStatementSheetUrl(numId, from_date, to_date), { replace: true })
  }, [searchParams, flatAccounts, tenantId, navigate])

  function openStatementSheet(accountIdNum: number) {
    if (!dateFrom || !dateTo) return
    navigate(buildAccountStatementSheetUrl(accountIdNum, dateFrom, dateTo))
  }

  const canOpen = !!accountId && !!dateFrom && !!dateTo
  const textAlign = isRtl ? 'text-right' : 'text-left'
  const alignNum = 'text-right'

  const toolbarHeight = 'h-[35px]'
  const containerWidthClass = 'w-full max-w-full'
  const inputRounded = 'rounded-[8px]'
  const showCustomDateFields = periodPreset === 'custom'
  const labelPeriod = lang === 'ar' ? 'الفترة' : 'Period'
  const labelFrom = lang === 'ar' ? 'من' : 'From'
  const labelTo = lang === 'ar' ? 'إلى' : 'To'
  const labelRowsPerPage = lang === 'ar' ? 'عدد السجلات' : 'Rows per page'
  const labelAccountType = t.accounts.accountType
  const labelAllTypes = lang === 'ar' ? 'كل الأنواع' : 'All types'
  const periodSelectCls =
    'h-9 border border-slate-300 rounded-lg px-3 text-sm min-w-[150px] max-w-[220px] box-border bg-white shrink-0 leading-normal text-slate-900 outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500'
  const accountTypeSelectCls =
    'h-9 border border-slate-300 rounded-lg px-2 text-sm min-w-[112px] max-w-[168px] box-border bg-white shrink-0 leading-normal text-slate-900 outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500'
  const dateInputCls =
    'h-9 border border-slate-300 rounded-lg px-3 text-sm bg-white w-[140px] box-border text-slate-900 outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500'
  const pageSizeSelectCls =
    'h-9 min-w-[4.5rem] border border-slate-300 rounded-lg px-3 text-sm font-medium tabular-nums bg-white text-slate-900 outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500'

  return (
    <div className="page-bg flex flex-col w-full max-w-full min-h-0">
      <header className="bg-white border-b border-neutral-200 shrink-0">
        <div className="px-0 py-2">
          <div className={`flex flex-wrap items-center gap-3 ${containerWidthClass}`}>
            <div className="relative flex-shrink-0 w-full sm:max-w-[320px]" ref={accountSearchRef}>
              <div className="flex items-center gap-2">
                <div className="relative flex-1 min-w-0">
                  <div className={`absolute inset-y-0 ${isRtl ? 'right-0 pr-3' : 'left-0 pl-3'} flex items-center pointer-events-none text-neutral-500`}>
                    <Search size={14} />
                  </div>
                  <input
                    type="text"
                    value={accountDropdownOpen ? accountSearch : (selectedAccount ? `${selectedAccount.code} — ${getDisplayName(selectedAccount)}` : '')}
                    onChange={(e) => {
                      setAccountSearch(e.target.value)
                      setAccountDropdownOpen(true)
                      if (!e.target.value) setAccountId('')
                    }}
                    onFocus={() => setAccountDropdownOpen(true)}
                    placeholder=""
                    className={`input-app ${toolbarHeight} w-full text-xs ${inputRounded} ${isRtl ? 'pr-9 pl-3' : 'pl-9 pr-3'}`}
                  />
                </div>
              </div>
              {accountDropdownOpen && (
                <div className="absolute z-20 mt-1 w-full max-w-md bg-white border border-neutral-200 rounded-[8px] shadow-lg max-h-52 overflow-y-auto">
                  {filteredAccounts.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-neutral-500">{t.accounts.noResults}</div>
                  ) : (
                    filteredAccounts.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          setAccountId(a.id)
                          setAccountSearch('')
                          setAccountDropdownOpen(false)
                        }}
                        className={`w-full ${textAlign} px-3 py-2 text-sm hover:bg-neutral-50 flex items-center gap-2 transition-colors border-b border-neutral-100 last:border-0`}
                      >
                        <span className="font-mono text-xs text-neutral-500 shrink-0">{a.code}</span>
                        <span className="text-neutral-800 truncate">{getDisplayName(a)}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-slate-600 shrink-0 whitespace-nowrap">{labelAccountType}</span>
                  <select
                    value={accountTypeFilter}
                    onChange={(e) => setAccountTypeFilter(e.target.value)}
                    className={accountTypeSelectCls}
                    title={labelAccountType}
                    aria-label={labelAccountType}
                  >
                    <option value="">{labelAllTypes}</option>
                    {ACCOUNT_TYPE_FILTER_KEYS.map((key) => (
                      <option key={key} value={key}>
                        {accountTypeLabels[key]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-slate-600 shrink-0 whitespace-nowrap">{labelPeriod}</span>
                  <select
                    value={periodPreset}
                    onChange={(e) => applyStatementPeriodPreset((e.target.value as ReportPeriodKey | 'custom') || 'all')}
                    className={periodSelectCls}
                    title={labelPeriod}
                    aria-label={labelPeriod}
                  >
                    {STATEMENT_PERIOD_OPTIONS.map((opt) => (
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
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className={dateInputCls}
                        title={labelFrom}
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm text-slate-600 whitespace-nowrap">{labelTo}</span>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className={dateInputCls}
                        title={labelTo}
                      />
                    </div>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => canOpen && openStatementSheet(Number(accountId))}
                  disabled={!canOpen}
                  className={`btn btn-sm btn-primary ${toolbarHeight} px-5 sm:px-6 min-w-[9.5rem] shrink-0 text-xs ${inputRounded} disabled:opacity-50`}
                >
                  {lang === 'ar' ? 'عرض الكشف' : 'Show statement'}
                </button>
              </div>
            </div>
            <div className={`flex items-center gap-2 shrink-0 ${textAlign}`}>
              <span className="text-sm text-slate-600 whitespace-nowrap hidden xs:inline">{labelRowsPerPage}</span>
              <select
                value={tablePageSize}
                onChange={(e) => {
                  setTablePageSize(Number(e.target.value))
                  setTablePage(1)
                }}
                className={pageSizeSelectCls}
                title={labelRowsPerPage}
                aria-label={lang === 'ar' ? 'عدد السجلات المعروضة في الجدول' : 'Rows per page'}
              >
                {TABLE_PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 min-w-0 w-full overflow-auto">
        <div className={`px-0 pt-2 pb-1 ${containerWidthClass}`}>
          <div className="bg-white rounded-[8px] border border-neutral-200 shadow-sm overflow-hidden mb-1">
            <div className="overflow-x-auto">
              {trialBalanceOverviewLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
                </div>
              ) : (
                <table className="w-full text-sm min-w-[760px]">
                  <thead className="sticky top-0 z-[1] bg-slate-50 border-b border-neutral-200">
                    <tr className="text-neutral-700">
                      <SortableTh
                        label={t.accounts.accountCode}
                        sortKey="code"
                        sortState={sort}
                        onToggle={toggleSort}
                        className={`${textAlign} font-medium whitespace-nowrap`}
                      />
                      <SortableTh
                        label={t.accounts.accountName}
                        sortKey="name"
                        sortState={sort}
                        onToggle={toggleSort}
                        className={`${textAlign} font-medium`}
                      />
                      <SortableTh
                        label={t.accounts.parentAccount}
                        sortKey="parent"
                        sortState={sort}
                        onToggle={toggleSort}
                        className={`${textAlign} font-medium`}
                      />
                      <SortableTh
                        label={t.accounts.accountType}
                        sortKey="type"
                        sortState={sort}
                        onToggle={toggleSort}
                        className={`${textAlign} font-medium`}
                      />
                      <SortableTh
                        label={t.nav.branches}
                        sortKey="branches"
                        sortState={sort}
                        onToggle={toggleSort}
                        className={`${textAlign} font-medium`}
                      />
                      <SortableTh
                        label={t.nav.costCenters}
                        sortKey="costCenters"
                        sortState={sort}
                        onToggle={toggleSort}
                        className={`${textAlign} font-medium`}
                      />
                      <SortableTh
                        label={t.accounts.statementBalance ?? t.accounts.runningBalance}
                        sortKey="balance"
                        sortState={sort}
                        onToggle={toggleSort}
                        className={`${alignNum} font-medium w-32`}
                      />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {paginatedOverviewRows.map((row) => {
                      const typeMap = t.accounts.types as Record<string, string>
                      const typeLabel = typeMap[row.type] ?? row.type
                      const isSel = accountId === row.id
                      const bal = row.balance
                      const balClass = bal === 0 ? 'text-neutral-700' : bal > 0 ? 'text-[#dc2626]' : 'text-[#059669]'
                      return (
                        <tr
                          key={row.id}
                          className={`cursor-pointer transition-colors hover:bg-primary-50/40 ${isSel ? 'bg-primary-50/70' : ''}`}
                          onClick={() => {
                            setAccountId(row.id)
                            setAccountSearch('')
                            setAccountDropdownOpen(false)
                            openStatementSheet(row.id)
                          }}
                        >
                          <td className={`${textAlign} px-3 py-2 font-mono text-xs text-neutral-600`}>{row.code}</td>
                          <td className={`${textAlign} px-3 py-2 font-medium text-neutral-900`}>
                            {getDisplayName({ id: row.id, name: row.name, name_en: row.name_en } as Account)}
                          </td>
                          <td className={`${textAlign} px-3 py-2 text-neutral-700 text-xs`}>{row.parentLabel}</td>
                          <td className={`${textAlign} px-3 py-2 text-neutral-600 text-xs`}>{typeLabel}</td>
                          <td className={`${textAlign} px-3 py-2 text-neutral-600 text-xs max-w-[160px] truncate`} title={row.branchLabel}>{row.branchLabel}</td>
                          <td className={`${textAlign} px-3 py-2 text-neutral-600 text-xs max-w-[160px] truncate`} title={row.costCenterLabel}>{row.costCenterLabel}</td>
                          <td className={`${alignNum} px-3 py-2 tabular-nums font-medium ${balClass}`}>{formatNum(bal)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
            {!trialBalanceOverviewLoading && (
              <div className="px-3 py-2.5 border-t border-neutral-200 flex flex-wrap items-center justify-between gap-2 bg-slate-50/70">
                <span className="text-xs text-neutral-600 tabular-nums">
                  {lang === 'ar'
                    ? `عرض ${tableRangeFrom}–${tableRangeTo} من ${tableTotal}`
                    : `Showing ${tableRangeFrom}–${tableRangeTo} of ${tableTotal}`}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {tableTotalPages > 1 && (
                    <>
                      <span className="text-xs text-neutral-500 whitespace-nowrap">
                        {lang === 'ar'
                          ? `صفحة ${tablePageSafe} من ${tableTotalPages}`
                          : `Page ${tablePageSafe} of ${tableTotalPages}`}
                      </span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                          disabled={tablePageSafe <= 1}
                          className={`btn btn-sm btn-secondary ${toolbarHeight} px-2.5 text-xs ${inputRounded} disabled:opacity-50`}
                        >
                          {lang === 'ar' ? 'السابق' : 'Previous'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setTablePage((p) => Math.min(tableTotalPages, p + 1))}
                          disabled={tablePageSafe >= tableTotalPages}
                          className={`btn btn-sm btn-secondary ${toolbarHeight} px-2.5 text-xs ${inputRounded} disabled:opacity-50`}
                        >
                          {lang === 'ar' ? 'التالي' : 'Next'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
