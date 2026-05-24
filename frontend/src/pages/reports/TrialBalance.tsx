import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchTrialBalance, fetchBranches, fetchCostCenters, fetchSettings } from '../../api/tenant'
import type { TenantSettings } from '../../types'
import { formatAmount } from '../../utils/currency'
import { getDefaultDateRange } from '../../utils/date'
import { formatDisplayDate } from '../../utils/date'
import { AlertTriangle, Printer, FileText, FileSpreadsheet, Columns3 } from 'lucide-react'
import { usePersistedColumnVisibility } from '../../hooks/usePersistedColumnVisibility'
import { useClientSort } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'

type TrialBalanceColumnKey = 'code' | 'name' | 'opening_debit' | 'opening_credit' | 'period_debit' | 'period_credit' | 'closing_debit' | 'closing_credit'
const TRIAL_BALANCE_COLUMN_KEYS: TrialBalanceColumnKey[] = ['code', 'name', 'opening_debit', 'opening_credit', 'period_debit', 'period_credit', 'closing_debit', 'closing_credit']
const TRIAL_BALANCE_COLUMNS_STORAGE_KEY = 'trialBalanceVisibleColumns'

interface TrialBalanceRow {
  account_id: number
  parent_id?: number | null
  code: string
  name: string
  type?: string
  level?: number
  opening_debit: number
  opening_credit: number
  period_debit: number
  period_credit: number
  closing_debit: number
  closing_credit: number
}

interface TrialBalanceTotals {
  opening_debit: number
  opening_credit: number
  period_debit: number
  period_credit: number
  closing_debit: number
  closing_credit: number
}

interface TrialBalanceData {
  company?: {
    name: string
    logo: string | null
    address: string | null
    phone: string | null
    email: string | null
    tax_registration_number: string | null
  } | null
  issue_date?: string
  from_date?: string | null
  to_date?: string | null
  display_level?: number
  accounts: TrialBalanceRow[]
  totals: TrialBalanceTotals
  is_balanced_opening?: boolean
  is_balanced_period?: boolean
  is_balanced_closing?: boolean
  draft_entries_count?: number
}

export default function TrialBalance() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const { data: settings } = useQuery<TenantSettings>({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const fmt = (n: number) => formatAmount(n, { decimal_places: settings?.doc_amount_decimals ?? 2 }, locale)
  const thAlign = isRtl ? 'text-right' : 'text-left'
  const numAlign = 'text-right'

  /**
   * فلاتر شبيهة بفواتير المبيعات، بدون ارتفاع ثابت h-9 — الـ select الأصلي يقص النص عمودياً
   * عند الجمع بين h-9 و py-2 في وضع RTL (Chrome/Windows). ps/pe لمساحة سهم القائمة.
   */
  const filterNativeClass =
    'w-full min-w-0 max-w-full border border-slate-300 rounded-lg py-1.5 text-sm leading-snug bg-white box-border focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none ps-3 pe-10'
  const filterGridClass =
    'grid w-full gap-2 items-end [grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))]'
  const filterCellClass = 'min-w-0 w-full'

  const defaultRange = getDefaultDateRange()
  const [dateFrom, setDateFrom] = useState(defaultRange.dateFrom)
  const [dateTo, setDateTo] = useState(defaultRange.dateTo)
  const [branchId, setBranchId] = useState<string>('')
  const [costCenterId, setCostCenterId] = useState<string>('')
  const [includeZeroBalance, setIncludeZeroBalance] = useState(false)
  const [displayLevel, setDisplayLevel] = useState(5)
  const [mainAccountsOnly, setMainAccountsOnly] = useState(false)
  const [visibleColumns, setVisibleColumns] = usePersistedColumnVisibility(
    TRIAL_BALANCE_COLUMNS_STORAGE_KEY,
    TRIAL_BALANCE_COLUMN_KEYS,
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

  const columnLabels: Record<TrialBalanceColumnKey, string> = {
    code: t.accounts.accountCode,
    name: t.accounts.accountName,
    opening_debit: t.reports.openingDebit,
    opening_credit: t.reports.openingCredit,
    period_debit: t.reports.periodDebit,
    period_credit: t.reports.periodCredit,
    closing_debit: t.reports.closingDebit,
    closing_credit: t.reports.closingCredit,
  }
  const visibleColumnKeys = TRIAL_BALANCE_COLUMN_KEYS.filter((k) => visibleColumns[k])
  const noDataColSpan = Math.max(visibleColumnKeys.length, 1)

  const params: Record<string, string> = {}
  if (dateFrom) params.from_date = dateFrom
  if (dateTo) params.to_date = dateTo
  if (branchId) params.branch_id = branchId
  if (costCenterId) params.cost_center_id = costCenterId
  if (includeZeroBalance) params.include_zero_balance = '1'
  params.display_level = String(displayLevel)
  if (mainAccountsOnly) params.main_accounts_only = '1'

  const { data: branchesData } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId,
  })
  const { data: costCentersData } = useQuery({
    queryKey: ['costCenters', tenantId],
    queryFn: () => fetchCostCenters(tenantId),
    enabled: !!tenantId,
  })
  const branches = branchesData ?? []
  const costCenters = costCentersData ?? []

  const { data, isLoading } = useQuery<TrialBalanceData>({
    queryKey: ['trialBalance', tenantId, dateFrom, dateTo, branchId, costCenterId, includeZeroBalance, displayLevel, mainAccountsOnly],
    queryFn: () => fetchTrialBalance(tenantId, Object.keys(params).length ? params : undefined),
    enabled: !!tenantId,
  })

  const rows = data?.accounts ?? []
  const { sort, toggleSort, sortedRows } = useClientSort(rows, [
    { key: 'code', type: 'string', getValue: (r: TrialBalanceRow) => r.code },
    { key: 'name', type: 'string', getValue: (r: TrialBalanceRow) => r.name },
    { key: 'opening_debit', type: 'number', getValue: (r: TrialBalanceRow) => r.opening_debit },
    { key: 'opening_credit', type: 'number', getValue: (r: TrialBalanceRow) => r.opening_credit },
    { key: 'period_debit', type: 'number', getValue: (r: TrialBalanceRow) => r.period_debit },
    { key: 'period_credit', type: 'number', getValue: (r: TrialBalanceRow) => r.period_credit },
    { key: 'closing_debit', type: 'number', getValue: (r: TrialBalanceRow) => r.closing_debit },
    { key: 'closing_credit', type: 'number', getValue: (r: TrialBalanceRow) => r.closing_credit },
  ], { locale })
  const totals = data?.totals ?? {
    opening_debit: 0, opening_credit: 0, period_debit: 0, period_credit: 0, closing_debit: 0, closing_credit: 0,
  }
  const balOpen = data?.is_balanced_opening ?? true
  const balPeriod = data?.is_balanced_period ?? true
  const balClose = data?.is_balanced_closing ?? true
  const anyImbalance = !balOpen || !balPeriod || !balClose

  function handlePrint() {
    window.print()
  }

  function exportExcel() {
    if (!data) return
    const headers = [
      t.accounts.accountCode,
      t.accounts.accountName,
      t.reports.openingDebit,
      t.reports.openingCredit,
      t.reports.periodDebit,
      t.reports.periodCredit,
      t.reports.closingDebit,
      t.reports.closingCredit,
    ]
    const rowsExport = rows.map((r) => [
      r.code,
      r.name,
      r.opening_debit,
      r.opening_credit,
      r.period_debit,
      r.period_credit,
      r.closing_debit,
      r.closing_credit,
    ])
    const csv = [
      headers.join(','),
      ...rowsExport.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')),
      '',
      [t.total, '', totals.opening_debit, totals.opening_credit, totals.period_debit, totals.period_credit, totals.closing_debit, totals.closing_credit].join(','),
    ].join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `trial-balance-${dateFrom}-${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-6 space-y-3 w-full max-w-full">
      <div className="flex items-center w-full border-b border-slate-200 py-1.5">
        <h1 className="text-sm font-semibold text-slate-900 shrink-0 order-first">{t.reports.trialBalance}</h1>
        <div className="flex-[0.3] min-w-0" />
        <div className="flex items-center gap-2 shrink-0 px-3">
          <div className="flex items-center gap-1.5">
            <label className="text-xs font-medium text-slate-700 whitespace-nowrap">{t.from}</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border border-slate-300 rounded-md px-2 py-1.5 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none h-8"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs font-medium text-slate-700 whitespace-nowrap">{t.to}</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border border-slate-300 rounded-md px-2 py-1.5 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none h-8"
            />
          </div>
        </div>
        <div className="flex-1 min-w-0 flex justify-end items-center gap-1 no-print">
          <div className="relative" ref={columnsMenuRef}>
            <button
              type="button"
              onClick={() => setShowColumnsMenu((v) => !v)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#F0F2F5] border border-[#D9DCE0] text-[#344054] hover:bg-[#E4E7EB]"
              title={lang === 'ar' ? 'تخصيص الأعمدة' : 'Customize columns'}
            >
              <Columns3 size={14} />
            </button>
            {showColumnsMenu && (
              <div className="absolute top-full end-0 mt-1 z-50 min-w-[200px] bg-white border border-slate-200 rounded-lg shadow-lg py-2 max-h-72 overflow-y-auto">
                <p className="px-3 py-1.5 text-xs font-semibold text-slate-500 border-b border-slate-100 mb-1">
                  {lang === 'ar' ? 'إظهار الأعمدة' : 'Show columns'}
                </p>
                {TRIAL_BALANCE_COLUMN_KEYS.map((key) => (
                  <label key={key} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={visibleColumns[key]}
                      onChange={(e) => setVisibleColumns((prev) => ({ ...prev, [key]: e.target.checked }))}
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
            onClick={exportExcel}
            disabled={isLoading || !data}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
            title={t.accounts.exportExcel}
          >
            <FileSpreadsheet size={14} />
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={isLoading || !data}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#344054] text-white hover:bg-[#2d3846] disabled:opacity-50"
            title={t.accounts.exportPdf}
          >
            <FileText size={14} />
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={isLoading || !data}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#F0F2F5] border border-[#D9DCE0] text-[#344054] hover:bg-[#E4E7EB] disabled:opacity-50"
            title={t.accounts.print}
          >
            <Printer size={14} />
          </button>
        </div>
      </div>

      <div className={`bg-white rounded-xl border border-slate-200 p-3 w-full ${filterGridClass}`}>
        <div className={filterCellClass}>
          <select
            value={displayLevel}
            onChange={(e) => setDisplayLevel(Number(e.target.value))}
            className={filterNativeClass}
            style={{ textAlign: isRtl ? 'right' : 'left' }}
            aria-label={lang === 'ar' ? 'مستوى العرض' : 'Display level'}
          >
            <option value={5}>{lang === 'ar' ? 'اختر المستوى' : 'Select level'}</option>
            {[1, 2, 3, 4].map((lev) => (
              <option key={lev} value={lev}>
                {lev}
              </option>
            ))}
          </select>
        </div>
        <div className={filterCellClass}>
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className={filterNativeClass}
            style={{ textAlign: isRtl ? 'right' : 'left' }}
            aria-label={lang === 'ar' ? 'الفرع' : 'Branch'}
          >
            <option value="">{lang === 'ar' ? 'اختر الفرع' : 'Select branch'}</option>
            {branches.map((b: { id: number; name: string }) => (
              <option key={b.id} value={String(b.id)}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className={filterCellClass}>
          <select
            value={costCenterId}
            onChange={(e) => setCostCenterId(e.target.value)}
            className={filterNativeClass}
            style={{ textAlign: isRtl ? 'right' : 'left' }}
            aria-label={lang === 'ar' ? 'مركز التكلفة' : 'Cost center'}
          >
            <option value="">{lang === 'ar' ? 'اختر مركز التكلفة' : 'Select cost center'}</option>
            {costCenters.map((c: { id: number; name: string }) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {!isLoading && data && (data.draft_entries_count ?? 0) > 0 && (
          <div className={`${filterCellClass} col-span-full flex items-center gap-2 text-blue-700 bg-blue-50 rounded-lg px-3 py-1.5 text-sm font-medium`}>
            <AlertTriangle size={16} />
            {t.reports.draftEntriesHint?.replace('{count}', String(data.draft_entries_count))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto w-full trial-balance-report" id="trial-balance-print">
        {isLoading ? (
          <div className="flex justify-center items-center h-40">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
          </div>
        ) : data ? (
          <div dir={isRtl ? 'rtl' : 'ltr'} className="trial-balance-content">
            <header className="p-4 pb-2 border-b border-slate-200 report-header">
              <h3 className="text-xl font-bold text-slate-800 text-center report-title">
                {t.reports.trialBalance}
              </h3>
              <p className="text-sm text-slate-600 text-center mt-1">
                {t.reports.periodFromTo} {data.from_date ? formatDisplayDate(data.from_date) : '—'} {t.to} {data.to_date ? formatDisplayDate(data.to_date) : '—'}
              </p>
              <p className="text-sm text-slate-500 text-center mt-0.5">
                {t.reports.displayLevel}: {data.display_level ?? 5} · {t.reports.issueDate}: {data.issue_date ? formatDisplayDate(data.issue_date) : '—'}
              </p>
              {(branchId || costCenterId) && (
                <p className="text-sm text-slate-500 text-center mt-0.5">
                  {branchId && <span>{t.reports.filterByBranch}: {branches.find((b: { id: number }) => String(b.id) === branchId)?.name ?? branchId}</span>}
                  {branchId && costCenterId && ' · '}
                  {costCenterId && <span>{t.reports.filterByCostCenter}: {costCenters.find((c: { id: number }) => String(c.id) === costCenterId)?.name ?? costCenterId}</span>}
                </p>
              )}
            </header>

            <div className="overflow-x-auto min-w-[800px]">
              <table className="w-full text-sm trial-balance-table table-fixed">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold">
                    {visibleColumns.code && (
                      <SortableTh
                        label={t.accounts.accountCode}
                        sortKey="code"
                        sortState={sort}
                        onToggle={toggleSort}
                        widthClassName="w-28 border border-slate-300"
                        className={`${thAlign} font-bold text-slate-800`}
                      />
                    )}
                    {visibleColumns.name && (
                      <SortableTh
                        label={t.accounts.accountName}
                        sortKey="name"
                        sortState={sort}
                        onToggle={toggleSort}
                        widthClassName="w-[28rem] border border-slate-300"
                        className={`${thAlign} font-bold text-slate-800`}
                      />
                    )}
                    {visibleColumns.opening_debit && (
                      <SortableTh
                        label={t.reports.openingDebit}
                        sortKey="opening_debit"
                        sortState={sort}
                        onToggle={toggleSort}
                        widthClassName="w-32 border border-slate-300"
                        className={`${numAlign} font-bold text-slate-800 tabular-nums`}
                      />
                    )}
                    {visibleColumns.opening_credit && (
                      <SortableTh
                        label={t.reports.openingCredit}
                        sortKey="opening_credit"
                        sortState={sort}
                        onToggle={toggleSort}
                        widthClassName="w-32 border border-slate-300"
                        className={`${numAlign} font-bold text-slate-800 tabular-nums`}
                      />
                    )}
                    {visibleColumns.period_debit && (
                      <SortableTh
                        label={t.reports.periodDebit}
                        sortKey="period_debit"
                        sortState={sort}
                        onToggle={toggleSort}
                        widthClassName="w-32 border border-slate-300"
                        className={`${numAlign} font-bold text-slate-800 tabular-nums`}
                      />
                    )}
                    {visibleColumns.period_credit && (
                      <SortableTh
                        label={t.reports.periodCredit}
                        sortKey="period_credit"
                        sortState={sort}
                        onToggle={toggleSort}
                        widthClassName="w-32 border border-slate-300"
                        className={`${numAlign} font-bold text-slate-800 tabular-nums`}
                      />
                    )}
                    {visibleColumns.closing_debit && (
                      <SortableTh
                        label={t.reports.closingDebit}
                        sortKey="closing_debit"
                        sortState={sort}
                        onToggle={toggleSort}
                        widthClassName="w-32 border border-slate-300"
                        className={`${numAlign} font-bold text-slate-800 tabular-nums`}
                      />
                    )}
                    {visibleColumns.closing_credit && (
                      <SortableTh
                        label={t.reports.closingCredit}
                        sortKey="closing_credit"
                        sortState={sort}
                        onToggle={toggleSort}
                        widthClassName="w-32 border border-slate-300"
                        className={`${numAlign} font-bold text-slate-800 tabular-nums`}
                      />
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {sortedRows.length === 0 ? (
                    <tr>
                      <td colSpan={noDataColSpan} className="text-center py-8 text-slate-400 border border-slate-200">
                        {t.noData}
                      </td>
                    </tr>
                  ) : (
                    sortedRows.map((row) => {
                      const level = row.level ?? 0
                      const indentPx = level * 18
                      const indentStyle = isRtl ? { paddingRight: indentPx } : { paddingLeft: indentPx }
                      const isMain = level <= 1
                      return (
                        <tr key={row.account_id} className={`hover:bg-slate-50/50 ${isMain ? 'font-bold bg-slate-50/70' : ''}`}>
                          {visibleColumns.code && <td className="px-3 py-2 font-mono text-slate-800 border-b border-slate-200" style={indentStyle}>{row.code}</td>}
                          {visibleColumns.name && <td className={`px-3 py-2 text-slate-900 border-b border-slate-200 ${thAlign}`} style={indentStyle}>{row.name}</td>}
                          {visibleColumns.opening_debit && <td className={`px-3 py-2 ${numAlign} text-slate-800 border-b border-slate-200 tabular-nums`}>{row.opening_debit > 0 ? fmt(row.opening_debit) : ''}</td>}
                          {visibleColumns.opening_credit && <td className={`px-3 py-2 ${numAlign} text-slate-800 border-b border-slate-200 tabular-nums`}>{row.opening_credit > 0 ? fmt(row.opening_credit) : ''}</td>}
                          {visibleColumns.period_debit && <td className={`px-3 py-2 ${numAlign} text-slate-800 border-b border-slate-200 tabular-nums`}>{row.period_debit > 0 ? fmt(row.period_debit) : ''}</td>}
                          {visibleColumns.period_credit && <td className={`px-3 py-2 ${numAlign} text-slate-800 border-b border-slate-200 tabular-nums`}>{row.period_credit > 0 ? fmt(row.period_credit) : ''}</td>}
                          {visibleColumns.closing_debit && <td className={`px-3 py-2 ${numAlign} text-slate-800 border-b border-slate-200 tabular-nums`}>{row.closing_debit > 0 ? fmt(row.closing_debit) : ''}</td>}
                          {visibleColumns.closing_credit && <td className={`px-3 py-2 ${numAlign} text-slate-800 border-b border-slate-200 tabular-nums`}>{row.closing_credit > 0 ? fmt(row.closing_credit) : ''}</td>}
                        </tr>
                      )
                    })
                  )}
                </tbody>
                {rows.length > 0 && (
                  <tfoot className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
                    <tr>
                      <td colSpan={visibleColumnKeys.filter((k) => k === 'code' || k === 'name').length || 1} className={`px-3 py-3 ${thAlign} border border-slate-300`}>{t.total}</td>
                      {visibleColumns.opening_debit && <td className={`px-3 py-3 ${numAlign} border border-slate-300 tabular-nums`}>{fmt(totals.opening_debit)}</td>}
                      {visibleColumns.opening_credit && <td className={`px-3 py-3 ${numAlign} border border-slate-300 tabular-nums`}>{fmt(totals.opening_credit)}</td>}
                      {visibleColumns.period_debit && <td className={`px-3 py-3 ${numAlign} border border-slate-300 tabular-nums`}>{fmt(totals.period_debit)}</td>}
                      {visibleColumns.period_credit && <td className={`px-3 py-3 ${numAlign} border border-slate-300 tabular-nums`}>{fmt(totals.period_credit)}</td>}
                      {visibleColumns.closing_debit && <td className={`px-3 py-3 ${numAlign} border border-slate-300 tabular-nums`}>{fmt(totals.closing_debit)}</td>}
                      {visibleColumns.closing_credit && <td className={`px-3 py-3 ${numAlign} border border-slate-300 tabular-nums`}>{fmt(totals.closing_credit)}</td>}
                    </tr>
                    {anyImbalance && (
                      <tr className="bg-amber-50 font-semibold text-amber-800 border-t border-amber-200">
                        <td colSpan={noDataColSpan} className="px-3 py-2 text-center">
                          {t.reports.imbalanceWarning}
                          {!balOpen && ` (${t.reports.openingBalance})`}
                          {!balPeriod && ` (${t.reports.periodMovement})`}
                          {!balClose && ` (${t.reports.closingBalance})`}
                        </td>
                      </tr>
                    )}
                  </tfoot>
                )}
              </table>
            </div>

            <footer className="p-6 mt-6 border-t border-slate-200 report-footer">
              <div className="flex justify-center mt-8">
                <div className="text-center text-sm text-slate-600">
                  <p className="font-medium text-slate-700">{t.reports.preparedBy}</p>
                  <div className="h-10 w-48 border-b border-slate-300 mt-4 mx-auto" />
                </div>
              </div>
            </footer>
          </div>
        ) : null}
      </div>

      <style>{`
        .trial-balance-table th, .trial-balance-table td { font-variant-numeric: tabular-nums; }
        @media print {
          @page { size: A4; margin: 12mm 15mm; }
          body * { visibility: hidden; }
          #trial-balance-print, #trial-balance-print * { visibility: visible; }
          #trial-balance-print {
            position: absolute; left: 0; top: 0;
            width: 100%; max-width: 210mm; min-height: 297mm;
            margin: 0; padding: 0; box-shadow: none; border: none; background: white;
          }
          .trial-balance-content { padding: 0; }
          .report-header { break-after: avoid; }
          .trial-balance-table { break-inside: auto; }
          .trial-balance-table tr { break-inside: avoid; }
          .no-print { display: none !important; }
        }
        @media screen {
          #trial-balance-print { width: 100%; max-width: none; }
        }
      `}</style>
    </div>
  )
}
