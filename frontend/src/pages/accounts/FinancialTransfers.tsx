import { useState, useMemo, useRef, useEffect, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchPayments,
  fetchSettings,
  deletePayment,
  fetchAccounts,
  fetchBranches,
  fetchCostCenters,
  fetchTenantUsers,
} from '../../api/tenant'
import type { Account, Branch, CostCenter, JournalEntryLine, Payment, PaginatedResponse, TenantSettings } from '../../types'

function transferAccountLabel(
  acc: Account | null | undefined,
  getDisplayName: (a: Account) => string,
): string | null {
  if (!acc) return null
  const code = acc.code ?? ''
  return `${code} — ${getDisplayName(acc)}`
}

/** يدعم camelCase و snake_case من الـ API، ويستخرج من سطور القيد إن غابت العلاقات */
function getTransferFromToLabels(
  p: Payment,
  getDisplayName: (a: Account) => string,
): { from: string | null; to: string | null } {
  const fromAcc = p.cashBankAccount ?? p.cash_bank_account
  const toAcc = p.counterpartAccount ?? p.counterpart_account
  let from = transferAccountLabel(fromAcc, getDisplayName)
  let to = transferAccountLabel(toAcc, getDisplayName)
  if (from && to) return { from, to }

  const je = p.journalEntry ?? p.journal_entry
  const lines = je?.lines as JournalEntryLine[] | undefined
  if (!Array.isArray(lines)) return { from, to }

  for (const line of lines) {
    const acc = line.account
    if (!acc) continue
    const debit = Number(line.debit) || 0
    const credit = Number(line.credit) || 0
    if (credit > 0 && !from) from = transferAccountLabel(acc, getDisplayName)
    if (debit > 0 && !to) to = transferAccountLabel(acc, getDisplayName)
  }
  return { from, to }
}
import { formatAmount } from '../../utils/currency'
import { formatDisplayDate, getReportPeriodRange, type ReportPeriodKey } from '../../utils/date'
import { splitVoucherNotesFromAutoSummary } from '../../utils/voucherNotes'
import { ArrowLeftRight, FileText, FileSpreadsheet, Printer, MoreVertical, Pencil, Trash2 } from 'lucide-react'
import AccountSearchSelect from '../../components/AccountSearchSelect'
import ReportFooter from '../../components/ui/ReportFooter'
import { useClientSort } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'
import { sortUsersForFilter } from '../../utils/tenantUsersForFilter'
import { filterPageSizeSelectClass, filterSelectCompactClass } from '../../utils/filterControlStyles'

const filterSelectCls = filterSelectCompactClass

const TRANSFER_PAGE_SIZES = [10, 25, 50, 100, 200, 500] as const

export default function FinancialTransfers() {
  const { currentTenant, user } = useAuth()
  const { t, lang, isRtl, getDisplayName } = useLanguage()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const tenantId = currentTenant?.id ?? 0

  const [openMenuId, setOpenMenuId] = useState<number | null>(null)
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Payment | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        !(target as Element).closest?.('button')
      ) {
        setOpenMenuId(null)
        setMenuAnchor(null)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  const { data: settings } = useQuery<TenantSettings>({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const amountDecimals = Math.min(20, Math.max(0, Math.floor(Number(settings?.doc_amount_decimals ?? 2))))
  const fmt = (n: number) => formatAmount(n, { decimal_places: amountDecimals }, locale)

  const initialAllRange = getReportPeriodRange('all')
  const [dateFrom, setDateFrom] = useState(initialAllRange.from_date)
  const [dateTo, setDateTo] = useState(initialAllRange.to_date)
  const [periodPreset, setPeriodPreset] = useState<ReportPeriodKey | 'custom'>('all')
  const [perPage, setPerPage] = useState(25)
  const [page, setPage] = useState(1)
  const [numberFilter, setNumberFilter] = useState('')
  const [branchIdFilter, setBranchIdFilter] = useState('')
  const [costCenterIdFilter, setCostCenterIdFilter] = useState('')
  const [createdByFilter, setCreatedByFilter] = useState('')
  const [counterpartAccountIdFilter, setCounterpartAccountIdFilter] = useState<number | ''>('')

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
      setDateFrom(range.from_date)
      setDateTo(range.to_date)
    }
  }

  const showCustomDateFields = periodPreset === 'custom'

  const filterParams = useMemo(() => {
    const p: Record<string, string> = {
      type: 'transfer',
      per_page: String(perPage),
      page: String(page),
    }
    if (periodPreset !== 'all') {
      p.from_date = dateFrom
      p.to_date = dateTo
    }
    if (numberFilter.trim()) p.number = numberFilter.trim()
    if (counterpartAccountIdFilter) p.counterpart_account_id = String(counterpartAccountIdFilter)
    if (branchIdFilter) p.branch_id = branchIdFilter
    if (costCenterIdFilter) p.cost_center_id = costCenterIdFilter
    if (createdByFilter) p.created_by = createdByFilter
    return p
  }, [
    periodPreset,
    dateFrom,
    dateTo,
    perPage,
    page,
    numberFilter,
    counterpartAccountIdFilter,
    branchIdFilter,
    costCenterIdFilter,
    createdByFilter,
  ])

  useEffect(() => {
    setPage(1)
  }, [
    periodPreset,
    dateFrom,
    dateTo,
    numberFilter,
    counterpartAccountIdFilter,
    branchIdFilter,
    costCenterIdFilter,
    createdByFilter,
  ])

  const { data: transfersData, isLoading } = useQuery<PaginatedResponse<Payment>>({
    queryKey: ['payments', tenantId, 'financial-transfers', filterParams],
    queryFn: () => fetchPayments(tenantId, filterParams),
    enabled: !!tenantId,
  })

  const { data: allAccounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts', tenantId, 'postable'],
    queryFn: () => fetchAccounts(tenantId, { postable_only: '1', active_only: '1' }),
    enabled: !!tenantId,
  })

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId, { status: 'active' }),
    enabled: !!tenantId,
  })

  const { data: costCenters = [] } = useQuery<CostCenter[]>({
    queryKey: ['cost-centers', tenantId],
    queryFn: () => fetchCostCenters(tenantId, { active_only: '1' }),
    enabled: !!tenantId,
  })

  const { data: tenantUsersResp } = useQuery({
    queryKey: ['tenant-users', tenantId],
    queryFn: () => fetchTenantUsers(tenantId),
    enabled: !!tenantId,
  })
  const tenantUsers = useMemo(() => {
    let list = (tenantUsersResp?.data ?? []) as {
      id: number
      name: string
      email?: string
      pivot?: { role?: string; role_name?: string }
    }[]
    if (user) {
      const hasCurrent = list.some((u) => u.id === user.id)
      if (!hasCurrent) list = [{ id: user.id, name: user.name, email: user.email }, ...list]
    }
    return sortUsersForFilter(list)
  }, [tenantUsersResp?.data, user])

  const transfers = transfersData?.data ?? []

  type SortKey = 'number' | 'date' | 'from' | 'to' | 'notes' | 'amount'
  const sortColumns = useMemo(
    () => [
      { key: 'number' as const, type: 'string' as const, getValue: (p: Payment) => p.number ?? '' },
      { key: 'date' as const, type: 'date' as const, getValue: (p: Payment) => p.date as string },
      {
        key: 'from' as const,
        type: 'string' as const,
        getValue: (p: Payment) => getTransferFromToLabels(p, getDisplayName).from ?? '',
      },
      {
        key: 'to' as const,
        type: 'string' as const,
        getValue: (p: Payment) => getTransferFromToLabels(p, getDisplayName).to ?? '',
      },
      {
        key: 'notes' as const,
        type: 'string' as const,
        getValue: (p: Payment) => splitVoucherNotesFromAutoSummary(p.notes ?? '').userNotes ?? '',
      },
      { key: 'amount' as const, type: 'number' as const, getValue: (p: Payment) => Number(p.amount ?? 0) },
    ],
    [getDisplayName],
  )
  const { sort, toggleSort, sortedRows } = useClientSort<Payment, SortKey>(transfers, sortColumns, { locale })

  const totals = useMemo(() => {
    const sum = transfers.reduce((a, p) => a + Number(p.amount ?? 0), 0)
    return { amount: sum }
  }, [transfers])

  const deleteMut = useMutation({
    mutationFn: (id: number) => deletePayment(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments', tenantId] })
      setDeleteTarget(null)
    },
  })

  const textAlign = isRtl ? 'text-right' : 'text-left'

  const companyLogo = (settings as Record<string, unknown> | undefined)?.company_logo as string | undefined
  const reportTitle = lang === 'ar' ? 'تحويلات مالية' : 'Financial Transfers'

  function buildPrintContent() {
    const headers = [
      t.payments?.voucherNumber ?? (lang === 'ar' ? 'رقم السند' : 'Voucher #'),
      t.date,
      lang === 'ar' ? 'من' : 'From',
      lang === 'ar' ? 'إلى' : 'To',
      t.notes,
      t.amount,
    ]

    const bodyRows = sortedRows
      .map((p) => {
        const { from, to } = getTransferFromToLabels(p, getDisplayName)
        const fromLabel = from ?? '—'
        const toLabel = to ?? '—'
        const rawNote = splitVoucherNotesFromAutoSummary(p.notes ?? '').userNotes ?? ''
        const noteText = rawNote.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        return `<tr>
  <td>${p.number}</td>
  <td>${formatDisplayDate(p.date as string)}</td>
  <td>${fromLabel}</td>
  <td>${toLabel}</td>
  <td>${noteText}</td>
  <td class="num">${fmt(p.amount)}</td>
</tr>`
      })
      .join('')

    const totalLabel = lang === 'ar' ? 'الإجمالي' : 'Total'
    return `
      <table class="report-table">
        <thead>
          <tr>
            ${headers.map((h) => `<th>${h}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${bodyRows}
        </tbody>
        <tfoot>
          <tr class="footer"><td colspan="5"><strong>${totalLabel}</strong></td><td class="num"><strong>${fmt(totals.amount)}</strong></td></tr>
        </tfoot>
      </table>`
  }

  function handlePrintReport() {
    const table = buildPrintContent()
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!DOCTYPE html>
<html dir="${isRtl ? 'rtl' : 'ltr'}">
  <head>
    <meta charset="utf-8" />
    <title>${reportTitle}</title>
    <style>
      body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; }
      .report-table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
      .report-table th, .report-table td { border: 1px solid #e2e8f0; padding: 6px 8px; }
      .report-table th { background:#f8fafc; color:#334155; text-align: ${isRtl ? 'right' : 'left'}; }
      .num { text-align: right; font-variant-numeric: tabular-nums; }
    </style>
  </head>
  <body>
    ${companyLogo ? `<div style="margin-bottom:16px;"><img src="${companyLogo}" style="max-height:48px;object-fit:contain;" /></div>` : ''}
    <h2 style="margin:0 0 8px;">${reportTitle}</h2>
    <p style="margin:0 0 8px;color:#64748b;font-size:13px;">
      ${
        periodPreset === 'all'
          ? (lang === 'ar' ? 'الفترة: الكل' : 'Period: All')
          : `${t.payments?.dateFrom ?? (lang === 'ar' ? 'من تاريخ' : 'From date')}: ${dateFrom} — ${t.payments?.dateTo ?? (lang === 'ar' ? 'إلى تاريخ' : 'To date')}: ${dateTo}`
      }
    </p>
    ${table}
  </body>
</html>`)
    win.document.close()
    win.focus()
    setTimeout(() => {
      win.print()
      win.close()
    }, 300)
  }

  function handleExportExcel() {
    const headers = [
      t.payments?.voucherNumber ?? (lang === 'ar' ? 'رقم السند' : 'Voucher #'),
      t.date,
      lang === 'ar' ? 'من' : 'From',
      lang === 'ar' ? 'إلى' : 'To',
      t.notes,
      t.amount,
    ]
    const lines: string[] = []
    lines.push(headers.join(','))
    sortedRows.forEach((p) => {
      const { from, to } = getTransferFromToLabels(p, getDisplayName)
      const fromLabel = from ?? ''
      const toLabel = to ?? ''
      const noteText = (splitVoucherNotesFromAutoSummary(p.notes ?? '').userNotes ?? '').replace(/,/g, ' ')
      lines.push(
        [
          p.number,
          formatDisplayDate(p.date as string),
          fromLabel,
          toLabel,
          noteText,
          String(p.amount),
        ].join(','),
      )
    })
    lines.push('')
    lines.push(
      [
        lang === 'ar' ? 'الإجمالي' : 'Total',
        '',
        '',
        '',
        '',
        fmt(totals.amount),
      ].join(','),
    )
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `financial-transfers-${dateFrom}-${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handlePrintTransfer(p: Payment) {
    setOpenMenuId(null)
    setMenuAnchor(null)
    const { from, to } = getTransferFromToLabels(p, getDisplayName)
    const fromLabel = from ?? '—'
    const toLabel = to ?? '—'
    const title = lang === 'ar' ? 'سند تحويل مالي' : 'Financial Transfer'
    const fromHdr = lang === 'ar' ? 'من' : 'From'
    const toHdr = lang === 'ar' ? 'إلى' : 'To'
    const displayNotes = splitVoucherNotesFromAutoSummary(p.notes ?? '').userNotes
    const content = document.createElement('div')
    content.dir = lang === 'ar' ? 'rtl' : 'ltr'
    content.innerHTML = `
      <div style="font-family: Arial; padding: 24px; max-width: 420px;">
        <h2 style="margin-bottom: 16px;">${title}</h2>
        <p><strong>${t.payments?.voucherNumber ?? (lang === 'ar' ? 'رقم السند' : 'Voucher #')}:</strong> ${p.number}</p>
        <p><strong>${t.date}:</strong> ${formatDisplayDate(p.date as string)}</p>
        <p><strong>${t.amount}:</strong> ${fmt(p.amount)}</p>
        <p><strong>${fromHdr}:</strong> ${fromLabel}</p>
        <p><strong>${toHdr}:</strong> ${toLabel}</p>
        ${displayNotes ? `<p><strong>${t.notes}:</strong> ${displayNotes}</p>` : ''}
      </div>`
    const w = window.open('', '_blank')
    if (w) {
      w.document.write(content.outerHTML)
      w.document.close()
      w.focus()
      setTimeout(() => {
        w.print()
        w.close()
      }, 250)
    }
  }

  const labelActions = t.payments?.actions ?? (lang === 'ar' ? 'الإجراءات' : 'Actions')
  const labelFrom = t.payments?.dateFrom ?? (lang === 'ar' ? 'من تاريخ' : 'From date')
  const labelTo = t.payments?.dateTo ?? (lang === 'ar' ? 'إلى تاريخ' : 'To date')
  const labelPeriod = lang === 'ar' ? 'الفترة' : 'Period'
  const voucherNumLabel = t.payments?.voucherNumber ?? (lang === 'ar' ? 'رقم السند' : 'Voucher #')
  const labelUser = lang === 'ar' ? 'المستخدم' : 'User'

  return (
    <div className="px-0 pt-4 pb-6 space-y-3 bg-[#f8f9fa] min-h-screen w-full min-w-0 max-w-full">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <ArrowLeftRight className="text-primary-600 shrink-0" size={20} />
          <h1 className="text-lg font-normal text-slate-800">
            {t.nav?.financialTransfers ?? (lang === 'ar' ? 'تحويلات مالية' : 'Financial Transfers')}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-600 shrink-0">{labelPeriod}</span>
            <select
              value={periodPreset}
              onChange={(e) => applyPeriodPreset((e.target.value as ReportPeriodKey | 'custom') || 'all')}
              className="h-9 border border-slate-300 rounded-lg px-3 text-sm min-w-[150px] bg-white"
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
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-9 border border-slate-300 rounded-lg px-3 text-sm bg-white w-[140px]"
                  title={labelFrom}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-slate-600 whitespace-nowrap">{labelTo}</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-9 border border-slate-300 rounded-lg px-3 text-sm bg-white w-[140px]"
                  title={labelTo}
                />
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            to="/payments/create-voucher?voucher_type=transfer"
            className="inline-flex h-[35px] items-center gap-2 rounded-md bg-primary-600 px-3 text-white text-xs font-medium hover:bg-primary-500"
          >
            <ArrowLeftRight size={14} className="shrink-0" />
            <span className="mx-1">{lang === 'ar' ? 'إضافة' : 'Add'}</span>
          </Link>
          <button
            type="button"
            onClick={handlePrintReport}
            className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-[#F0F2F5] border border-[#D9DCE0] text-[#344054] hover:bg-[#E4E7EB]"
            title={t.payments?.printReport ?? (lang === 'ar' ? 'طباعة التقرير' : 'Print report')}
          >
            <Printer size={16} />
          </button>
          <button
            type="button"
            onClick={handlePrintReport}
            className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-[#344054] text-white hover:bg-[#2d3846]"
            title={t.payments?.exportPdf ?? (lang === 'ar' ? 'تصدير PDF' : 'Export PDF')}
          >
            <FileText size={16} />
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-500"
            title={t.payments?.exportExcel ?? (lang === 'ar' ? 'تصدير Excel' : 'Export Excel')}
          >
            <FileSpreadsheet size={16} />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 pt-3 px-3 pb-2">
        <div className="flex flex-wrap items-end gap-3 w-full">
          <div className="w-[10.5rem] shrink-0 min-w-0">
            <input
              type="text"
              value={numberFilter}
              onChange={(e) => setNumberFilter(e.target.value)}
              placeholder={voucherNumLabel}
              className="h-9 border border-slate-300 rounded-lg px-3 text-sm w-full min-w-0 bg-white"
            />
          </div>
          <div className="h-9 min-w-[10.5rem] max-w-[22rem] flex-1 basis-[min(22rem,100%)]">
            <AccountSearchSelect
              value={counterpartAccountIdFilter === '' ? null : counterpartAccountIdFilter}
              accounts={allAccounts}
              onChange={(id) => setCounterpartAccountIdFilter(id ?? '')}
              placeholder={lang === 'ar' ? 'حساب (من / إلى)' : 'Account (from / to)'}
              className="h-full w-full min-w-0 [&_input]:h-9 [&_input]:rounded-lg [&_input]:text-sm"
            />
          </div>
          <div className="w-full md:w-[10.5rem] shrink-0 min-w-0">
            <select
              value={branchIdFilter}
              onChange={(e) => setBranchIdFilter(e.target.value)}
              className="h-9 border border-slate-300 rounded-lg px-3 text-sm w-full min-w-0 bg-white"
              title={t.journal.branch}
            >
              <option value="">{t.journal.branch}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {lang === 'ar' ? b.name : (b.name_en || b.name)}
                </option>
              ))}
            </select>
          </div>
          <div className="w-full md:w-[10.5rem] shrink-0 min-w-0">
            <select
              value={costCenterIdFilter}
              onChange={(e) => setCostCenterIdFilter(e.target.value)}
              className="h-9 border border-slate-300 rounded-lg px-3 text-sm w-full min-w-0 bg-white"
              title={t.journal.costCenter}
            >
              <option value="">{t.journal.costCenter}</option>
              {costCenters.map((cc) => (
                <option key={cc.id} value={cc.id}>
                  {lang === 'ar' ? cc.name : (cc.name_en || cc.name)}
                </option>
              ))}
            </select>
          </div>
          <div className="w-full md:w-[10.5rem] shrink-0 min-w-0">
            <select
              value={createdByFilter}
              onChange={(e) => setCreatedByFilter(e.target.value)}
              className="h-9 border border-slate-300 rounded-lg px-3 text-sm w-full min-w-0 bg-white"
              style={{ textAlign: isRtl ? 'right' : 'left' }}
              title={labelUser}
              aria-label={labelUser}
            >
              <option value="">{labelUser}</option>
              {tenantUsers.map((u: { id: number; name: string }) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <div className="w-14 shrink-0 flex items-center self-stretch">
            <select
              value={perPage}
              onChange={(e) => {
                setPerPage(Number(e.target.value))
                setPage(1)
              }}
              title={lang === 'ar' ? 'عدد السجلات في الصفحة' : 'Rows per page'}
              className={filterPageSizeSelectClass}
              aria-label={lang === 'ar' ? 'عدد السجلات في الصفحة' : 'Rows per page'}
            >
              {TRANSFER_PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : (
          <>
            <div className="overflow-auto max-h-[calc(100vh-20rem)] w-full min-w-0">
              <table className="w-full min-w-[56rem] table-auto text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 shadow-sm [&_th_button]:py-3">
                  <tr className="text-slate-600">
                    <SortableTh
                      label={voucherNumLabel}
                      sortKey="number"
                      sortState={sort}
                      onToggle={toggleSort}
                      widthClassName="w-[136px] min-w-[136px] max-w-[136px]"
                      className={`${textAlign} font-medium text-slate-700`}
                    />
                    <SortableTh
                      label={t.date}
                      sortKey="date"
                      sortState={sort}
                      onToggle={toggleSort}
                      widthClassName="min-w-[6.75rem] w-[7rem]"
                      className={`${textAlign} font-medium text-slate-700`}
                    />
                    <SortableTh
                      label={lang === 'ar' ? 'من' : 'From'}
                      sortKey="from"
                      sortState={sort}
                      onToggle={toggleSort}
                      widthClassName="min-w-[8rem] max-w-[14rem]"
                      className={`${textAlign} font-medium text-slate-700`}
                    />
                    <SortableTh
                      label={lang === 'ar' ? 'إلى' : 'To'}
                      sortKey="to"
                      sortState={sort}
                      onToggle={toggleSort}
                      widthClassName="min-w-[8rem] max-w-[14rem]"
                      className={`${textAlign} font-medium text-slate-700`}
                    />
                    <SortableTh
                      label={t.notes}
                      sortKey="notes"
                      sortState={sort}
                      onToggle={toggleSort}
                      widthClassName="min-w-[120px]"
                      className={`${textAlign} font-medium text-slate-700`}
                    />
                    <SortableTh
                      label={t.amount}
                      sortKey="amount"
                      sortState={sort}
                      onToggle={toggleSort}
                      widthClassName="w-28"
                      className="text-right font-medium text-slate-700 tabular-nums"
                    />
                    <th className={`${textAlign} px-2 py-3 font-medium w-12 align-middle`} aria-hidden />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-10 text-center text-slate-400">
                        {lang === 'ar' ? 'لا توجد تحويلات في الفترة المحددة.' : 'No transfers in the selected period.'}
                      </td>
                    </tr>
                  ) : (
                    sortedRows.map((p: Payment) => {
                      const labels = getTransferFromToLabels(p, getDisplayName)
                      const userNotes = splitVoucherNotesFromAutoSummary(p.notes ?? '').userNotes
                      return (
                        <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-2 py-2 font-mono text-xs text-primary-600 font-medium w-[136px] max-w-[136px] min-w-0 truncate" title={p.number}>
                            {p.number}
                          </td>
                          <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{formatDisplayDate(p.date as string)}</td>
                          <td className="px-3 py-2 text-slate-600 text-xs min-w-0 max-w-[14rem] truncate" title={labels.from ?? undefined}>
                            {labels.from ?? '—'}
                          </td>
                          <td className="px-3 py-2 text-slate-600 text-xs min-w-0 max-w-[14rem] truncate" title={labels.to ?? undefined}>
                            {labels.to ?? '—'}
                          </td>
                          <td className="px-3 py-2 text-slate-900 max-w-xs truncate" title={userNotes || undefined}>
                            {userNotes || '—'}
                          </td>
                          <td className="px-3 py-2 font-medium text-slate-800 tabular-nums">{fmt(p.amount)}</td>
                          <td className="px-2 py-2 w-12 overflow-visible align-middle">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (openMenuId === p.id) {
                                  setOpenMenuId(null)
                                  setMenuAnchor(null)
                                } else {
                                  setMenuAnchor((e.currentTarget as HTMLButtonElement).getBoundingClientRect())
                                  setOpenMenuId(p.id)
                                }
                              }}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                              aria-label={labelActions}
                            >
                              <MoreVertical size={16} />
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
                {sortedRows.length > 0 && (
                  <tfoot>
                    <tr className="bg-gradient-to-r from-slate-100 to-slate-50 border-t-2 border-slate-400 font-bold text-slate-900 shadow-[0_-2px_4px_rgba(0,0,0,0.04)]">
                      <td colSpan={5} className={`${textAlign} p-3 text-sm leading-tight`}>
                        {lang === 'ar' ? 'الإجمالي' : 'Total'}
                      </td>
                      <td
                        className={`p-3 text-sm tabular-nums font-semibold leading-tight text-slate-900 dir-ltr ${isRtl ? 'text-right' : 'text-center'}`}
                      >
                        {fmt(totals.amount)}
                      </td>
                      <td className="p-3" aria-hidden />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {transfersData && (
              <ReportFooter
                totalCount={transfersData.total}
                currentPage={transfersData.current_page}
                lastPage={transfersData.last_page}
                from={transfersData.total === 0 ? 0 : (transfersData.current_page - 1) * transfersData.per_page + 1}
                to={transfersData.total === 0 ? 0 : Math.min(transfersData.current_page * transfersData.per_page, transfersData.total)}
                onPageChange={setPage}
                lang={lang}
                isRtl={isRtl}
                alwaysShowPaginationBar
                showRecordSummary={transfersData.total > 0}
                recordLabel={lang === 'ar' ? 'سند' : 'voucher'}
                dense
              />
            )}
          </>
        )}
      </div>

      {openMenuId && menuAnchor && (() => {
        const p = sortedRows.find((x) => x.id === openMenuId) ?? transfers.find((x) => x.id === openMenuId)
        if (!p) return null
        const MENU_HEIGHT = 160
        const PAD = 8
        const gap = 4
        const vh = window.innerHeight
        const spaceBelow = vh - menuAnchor.bottom - gap
        const spaceAbove = menuAnchor.top - gap
        let top: number
        if (spaceBelow >= MENU_HEIGHT) {
          top = menuAnchor.bottom + gap
        } else if (spaceAbove >= MENU_HEIGHT) {
          top = menuAnchor.top - gap - MENU_HEIGHT
        } else {
          top = Math.max(PAD, Math.min(menuAnchor.bottom + gap, vh - MENU_HEIGHT - PAD))
        }
        const MENU_WIDTH = 160
        const vw = window.innerWidth
        const padX = 8
        const leftOrRight: CSSProperties = isRtl
          ? { right: Math.min(window.innerWidth - menuAnchor.right, vw - MENU_WIDTH - padX), left: 'auto' as const }
          : { left: Math.min(menuAnchor.left, vw - MENU_WIDTH - padX), right: 'auto' as const }
        const style: CSSProperties = {
          position: 'fixed',
          top: `${top}px`,
          ...leftOrRight,
          zIndex: 99999,
        }
        return createPortal(
          <div
            ref={menuRef}
            style={style}
            className="py-1 min-w-[140px] bg-white border border-slate-200 rounded-lg shadow-lg overflow-visible"
          >
            <button
              type="button"
              onClick={() => {
                navigate(`/payments/create-voucher?id=${p.id}`)
                setOpenMenuId(null)
                setMenuAnchor(null)
              }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 text-left"
            >
              <Pencil size={14} /> {t.payments?.edit ?? (lang === 'ar' ? 'تعديل' : 'Edit')}
            </button>
            <button
              type="button"
              onClick={() => {
                handlePrintTransfer(p)
                setOpenMenuId(null)
                setMenuAnchor(null)
              }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 text-left"
            >
              <Printer size={14} /> {t.payments?.print ?? (lang === 'ar' ? 'طباعة' : 'Print')}
            </button>
            <button
              type="button"
              onClick={() => {
                setDeleteTarget(p)
                setOpenMenuId(null)
                setMenuAnchor(null)
              }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 text-left"
            >
              <Trash2 size={14} /> {t.payments?.delete ?? (lang === 'ar' ? 'حذف' : 'Delete')}
            </button>
          </div>,
          document.body,
        )
      })()}

      {deleteTarget && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-900 mb-2">{t.msg.confirmDeleteTitle}</h3>
            <p className="text-slate-600 text-sm mb-4">{t.payments.confirmDeleteVoucher}</p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm border border-slate-300 rounded-lg"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={() => deleteMut.mutate(deleteTarget.id)}
                disabled={deleteMut.isPending}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg disabled:opacity-50"
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

