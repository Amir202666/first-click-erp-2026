import { useState, useMemo, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchPayments, fetchSettings, fetchPaymentMethods, fetchTenantUsers, fetchBranches, fetchCostCenters } from '../../api/tenant'
import type { Payment, PaymentMethod, PaginatedResponse } from '../../types'
import { formatDisplayDate, getDefaultDateRange, getReportPeriodRange, type ReportPeriodKey } from '../../utils/date'
import { formatAmount } from '../../utils/currency'
import { sortUsersForFilter } from '../../utils/tenantUsersForFilter'
import { paymentMethodLabel } from '../../utils/paymentApiDisplay'
import { FileText, FileSpreadsheet, Printer, BookCheck, FileEdit, Columns3 } from 'lucide-react'
import PageSizeSelect from '../../components/ui/PageSizeSelect'
import ReportFooter from '../../components/ui/ReportFooter'
import { usePersistedColumnVisibility } from '../../hooks/usePersistedColumnVisibility'
import { useClientSort } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'

type PaymentsReportColumnKey = 'number' | 'date' | 'posted' | 'status' | 'amount' | 'paymentMethod' | 'recipient' | 'reference'
const PAYMENTS_REPORT_COLUMN_KEYS: PaymentsReportColumnKey[] = ['number', 'date', 'posted', 'status', 'amount', 'paymentMethod', 'recipient', 'reference']
const PAYMENTS_COLUMNS_STORAGE_KEY = 'paymentsReportVisibleColumns'

export default function PaymentsReport() {
  const { currentTenant, user } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const defaultRange = getDefaultDateRange()

  const { data: settings } = useQuery({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const fmt = (n: number) => formatAmount(n, { decimal_places: settings?.doc_amount_decimals ?? 2 }, locale)

  const [periodPreset, setPeriodPreset] = useState<ReportPeriodKey | 'custom'>('all')
  const [dateFrom, setDateFrom] = useState(defaultRange.dateFrom ?? '')
  const [dateTo, setDateTo] = useState(defaultRange.dateTo ?? '')
  const [statusFilter, setStatusFilter] = useState('')
  const [paymentMethodIdFilter, setPaymentMethodIdFilter] = useState('')
  const [branchIdFilter, setBranchIdFilter] = useState('')
  const [costCenterIdFilter, setCostCenterIdFilter] = useState('')
  const [createdByFilter, setCreatedByFilter] = useState('')
  const [numberFilter, setNumberFilter] = useState('')
  const [perPage, setPerPage] = useState(25)
  const [page, setPage] = useState(1)
  const [visibleColumns, setVisibleColumns] = usePersistedColumnVisibility(
    PAYMENTS_COLUMNS_STORAGE_KEY,
    PAYMENTS_REPORT_COLUMN_KEYS,
  )
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

  const columnLabels: Record<PaymentsReportColumnKey, string> = {
    number: t.payments.voucherNumber,
    date: t.date,
    posted: t.payments.posted ?? 'مرحّل',
    status: t.status,
    amount: t.amount,
    paymentMethod: t.payments.paymentMethod,
    recipient: t.payments.recipient ?? 'المستلم',
    reference: t.payments.reference,
  }
  const visibleColumnKeys = PAYMENTS_REPORT_COLUMN_KEYS.filter((k) => visibleColumns[k])
  const noDataColSpan = Math.max(visibleColumnKeys.length, 1)

  /**
   * ارتفاع موحّد h-10 لكل الفلاتر؛ leading-10 + py-0 يتجنّب قص النص (لا نجمع h-9 مع py-2).
   */
  const filterNativeClass =
    'w-full min-w-0 max-w-full h-10 box-border border border-slate-300 rounded-lg py-0 text-sm leading-10 bg-white focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none ps-3 pe-10'
  const filterInputClass =
    'w-full min-w-0 h-10 box-border border border-slate-300 rounded-lg py-0 px-2.5 text-sm leading-10 bg-white focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none'
  const filterRowClass = 'flex flex-wrap items-end gap-3'
  const filterCellNarrowNumber = 'w-36 shrink-0 min-w-0 max-w-36'
  const filterCellNarrowStatus = 'w-44 shrink-0 min-w-0 max-w-44'
  const filterCellNarrowPayment = 'w-44 shrink-0 min-w-0 max-w-44'
  const filterCellGrow = 'min-w-0 flex-1 basis-[min(100%,11.5rem)]'
  const filterCellEmployee = 'w-44 shrink-0 min-w-0 max-w-44'
  const filterCellPageSize = 'min-w-0 w-full shrink-0 basis-[min(100%,220px)] max-w-[240px]'

  const filterParams = useMemo(() => {
    const p: Record<string, string> = { type: 'payment', from_date: dateFrom, to_date: dateTo, per_page: String(perPage), page: String(page) }
    if (statusFilter) p.status = statusFilter === 'approved' ? 'approved,posted' : statusFilter
    if (paymentMethodIdFilter) p.payment_method_id = paymentMethodIdFilter
    if (branchIdFilter) p.branch_id = branchIdFilter
    if (costCenterIdFilter) p.cost_center_id = costCenterIdFilter
    if (createdByFilter) p.created_by = createdByFilter
    if (numberFilter.trim()) p.number = numberFilter.trim()
    return p
  }, [dateFrom, dateTo, statusFilter, paymentMethodIdFilter, branchIdFilter, costCenterIdFilter, createdByFilter, numberFilter, perPage, page])

  const { data, isLoading } = useQuery<PaginatedResponse<Payment>>({
    queryKey: ['payments', tenantId, 'payments-report', filterParams, perPage],
    queryFn: () => fetchPayments(tenantId, filterParams),
    enabled: !!tenantId,
  })

  const { data: paymentMethods = [] } = useQuery<PaymentMethod[]>({
    queryKey: ['payment-methods', tenantId],
    queryFn: () => fetchPaymentMethods(tenantId, { status: 'active' }),
    enabled: !!tenantId,
  })

  const { data: branches = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId,
  })

  const { data: costCenters = [] } = useQuery<{ id: number; name: string; code?: string }[]>({
    queryKey: ['costCenters', tenantId],
    queryFn: () => fetchCostCenters(tenantId, { active_only: '1' }),
    enabled: !!tenantId,
  })

  const { data: tenantUsersResp } = useQuery({
    queryKey: ['tenant-users', tenantId],
    queryFn: () => fetchTenantUsers(tenantId),
    enabled: !!tenantId,
  })
  const tenantUsers = useMemo(() => {
    let list = (tenantUsersResp?.data ?? []) as { id: number; name: string; email?: string; pivot?: { role?: string; role_name?: string } }[]
    if (user) {
      const hasCurrent = list.some((u) => u.id === user.id)
      if (!hasCurrent) list = [{ id: user.id, name: user.name, email: user.email }, ...list]
    }
    return sortUsersForFilter(list)
  }, [tenantUsersResp?.data, user])

  const payments = data?.data ?? []
  const sortColumns = useMemo(
    () => [
      { key: 'number' as const, type: 'string' as const, getValue: (p: Payment) => p.number ?? '' },
      { key: 'date' as const, type: 'date' as const, getValue: (p: Payment) => p.date as string },
      {
        key: 'posted' as const,
        type: 'number' as const,
        getValue: (p: Payment) => ((p as Payment & { journal_entry_id?: number }).journal_entry_id ? 1 : 0),
      },
      { key: 'status' as const, type: 'string' as const, getValue: (p: Payment) => (p.status === 'posted' ? 'approved' : p.status) ?? '' },
      { key: 'amount' as const, type: 'number' as const, getValue: (p: Payment) => Number(p.amount ?? 0) },
      { key: 'paymentMethod' as const, type: 'string' as const, getValue: (p: Payment) => paymentMethodLabel(p, lang) ?? '' },
      { key: 'recipient' as const, type: 'string' as const, getValue: (p: Payment) => p.counterpartAccount?.name ?? '' },
      { key: 'reference' as const, type: 'string' as const, getValue: (p: Payment) => p.reference ?? '' },
    ],
    [lang],
  )
  const { sort, toggleSort, sortedRows } = useClientSort<Payment, PaymentsReportColumnKey>(payments, sortColumns, { locale })
  const total = data?.total ?? payments.length
  const currentPage = data?.current_page ?? page
  const lastPage = data?.last_page ?? 1
  const from = total === 0 ? 0 : (currentPage - 1) * perPage + 1
  const to = Math.min(currentPage * perPage, total)
  const textAlign = isRtl ? 'text-right' : 'text-left'

  const totals = useMemo(() => {
    const sum = payments.reduce((a, p) => a + Number(p.amount), 0)
    return { amount: sum, count: payments.length }
  }, [payments])

  const reportTitle = lang === 'ar' ? 'تقرير المدفوعات' : 'Payments Report'
  const companyLogo = (settings as Record<string, unknown>)?.company_logo as string | undefined

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
    setPage(1)
  }

  function onPaymentDateFromChange(value: string) {
    setDateFrom(value)
    setPage(1)
  }

  function onPaymentDateToChange(value: string) {
    setDateTo(value)
    setPage(1)
  }

  const showCustomDateFields = periodPreset === 'custom'
  const labelFrom = lang === 'ar' ? 'من تاريخ' : 'From date'
  const labelTo = lang === 'ar' ? 'إلى تاريخ' : 'To date'
  const labelPeriod = lang === 'ar' ? 'الفترة' : 'Period'

  function buildPrintContent() {
    const keys = visibleColumnKeys
    if (keys.length === 0) {
      return `<p>${lang === 'ar' ? 'لا أعمدة معروضة' : 'No columns visible'}</p>`
    }
    const headerCells = keys.map((k) => `<th>${columnLabels[k]}</th>`).join('')
    const rows = sortedRows.map((p) => {
      const isPosted = !!(p as Payment & { journal_entry_id?: number }).journal_entry_id
      const payStatus = (p.status === 'posted' ? 'approved' : p.status) || 'approved'
      const statusText = payStatus === 'draft' ? (t.payments.statusDraft ?? 'مسودة') : payStatus === 'cancelled' ? (t.payments.statusCancelled ?? 'ملغي') : (t.payments.statusApproved ?? 'معتمد')
      const cells: string[] = []
      keys.forEach((k) => {
        if (k === 'number') cells.push(`<td>${p.number}</td>`)
        else if (k === 'date') cells.push(`<td>${formatDisplayDate(p.date as string)}</td>`)
        else if (k === 'posted') cells.push(`<td>${isPosted ? (lang === 'ar' ? 'نعم' : 'Yes') : (lang === 'ar' ? 'لا' : 'No')}</td>`)
        else if (k === 'status') cells.push(`<td>${statusText}</td>`)
        else if (k === 'amount') cells.push(`<td class="num">${fmt(Number(p.amount))}</td>`)
        else if (k === 'paymentMethod') cells.push(`<td>${paymentMethodLabel(p, lang)}</td>`)
        else if (k === 'recipient') cells.push(`<td>${p.counterpartAccount?.name ?? '—'}</td>`)
        else if (k === 'reference') cells.push(`<td>${p.reference ?? '—'}</td>`)
      })
      return `<tr>${cells.join('')}</tr>`
    }).join('')
    const amountIdx = keys.indexOf('amount')
    const leftSpan = amountIdx >= 0 ? amountIdx : keys.length
    const rightSpan = amountIdx >= 0 ? keys.length - amountIdx - 1 : 0
    let footerRows: string
    if (amountIdx >= 0) {
      footerRows = `<tr class="footer"><td colspan="${leftSpan}"><strong>${t.payments.totalAmount} / ${t.payments.reportTotal ?? 'إجمالي التقرير'}</strong></td><td class="num"><strong>${fmt(totals.amount)}</strong></td>${rightSpan > 0 ? `<td colspan="${rightSpan}"></td>` : ''}</tr>
        <tr class="footer"><td colspan="${leftSpan}"><strong>${t.payments.totalCount}</strong></td><td><strong>${totals.count}</strong></td>${rightSpan > 0 ? `<td colspan="${rightSpan}"></td>` : ''}</tr>`
    } else {
      footerRows = `<tr class="footer"><td colspan="${keys.length}"><strong>${t.payments.reportTotal ?? 'إجمالي التقرير'}</strong>: ${t.payments.totalCount} <strong>${totals.count}</strong> — ${t.payments.totalAmount} <strong>${fmt(totals.amount)}</strong></td></tr>`
    }
    return `
      <table class="report-table">
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${rows}</tbody>
        <tfoot>${footerRows}</tfoot>
      </table>
      <div class="report-summary" style="margin-top:16px;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
        <p style="margin:0;font-weight:400;">${t.payments.reportTotal ?? 'إجمالي التقرير'}</p>
        <p style="margin:4px 0 0 0;">${t.payments.totalCount}: <strong>${totals.count}</strong> — ${t.payments.totalAmount}: <strong>${fmt(totals.amount)}</strong></p>
      </div>`
  }

  function handlePrintReport() {
    const table = buildPrintContent()
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <!DOCTYPE html><html dir="${isRtl ? 'rtl' : 'ltr'}"><head>
        <meta charset="utf-8"><title>${reportTitle}</title>
        <style>
          body{font-family:Arial,sans-serif;padding:24px;max-width:100%;}
          .report-table{width:100%;border-collapse:collapse;margin-top:12px;}
          .report-table th,.report-table td{border:1px solid #ddd;padding:8px;}
          .report-table th{background:#f1f5f9;}
          .num{text-align:right;font-variant-numeric:tabular-nums;}
          .footer{font-weight:400;border-top:2px solid #334155;background:#f0f0f0;}
          .report-summary{page-break-inside:avoid;}
        </style>
      </head><body>
        ${companyLogo ? `<div style="margin-bottom:16px;"><img src="${companyLogo}" alt="Logo" style="max-height:48px;object-fit:contain;" /></div>` : ''}
        <h2 style="margin-bottom:8px;">${reportTitle}</h2>
        <p style="color:#64748b;font-size:0.9rem;">${t.payments.dateFrom ?? 'من تاريخ'}: ${dateFrom} — ${t.payments.dateTo ?? 'إلى تاريخ'}: ${dateTo}</p>
        ${table}
      </body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 300)
  }

  function handleExportExcel() {
    const postedLabel = t.payments.posted ?? 'مرحّل'
    const recipientLabel = t.payments.recipient ?? 'المستلم'
    const headers = [t.payments.voucherNumber, t.date, postedLabel, t.status, t.amount, t.payments.paymentMethod, recipientLabel, t.payments.reference]
    const lines = [headers.join(',')]
    sortedRows.forEach((p) => {
      const isPosted = !!(p as Payment & { journal_entry_id?: number }).journal_entry_id
      const payStatus = (p.status === 'posted' ? 'approved' : p.status) || 'approved'
      const statusText = payStatus === 'draft' ? (t.payments.statusDraft ?? 'مسودة') : payStatus === 'cancelled' ? (t.payments.statusCancelled ?? 'ملغي') : (t.payments.statusApproved ?? 'معتمد')
      const pmLabel = paymentMethodLabel(p, lang)
      lines.push([p.number, formatDisplayDate(p.date as string), isPosted ? (lang === 'ar' ? 'نعم' : 'Yes') : (lang === 'ar' ? 'لا' : 'No'), statusText, Number(p.amount), pmLabel === '—' ? '' : pmLabel, p.counterpartAccount?.name ?? '', p.reference ?? ''].join(','))
    })
    lines.push('')
    lines.push([t.payments.reportTotal ?? 'إجمالي التقرير', '', '', '', fmt(totals.amount), '', '', ''].join(','))
    lines.push([t.payments.totalCount, '', '', '', String(totals.count), '', '', ''].join(','))
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `payments-report-${dateFrom}-${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="px-0 py-3 space-y-3 w-full min-w-0 max-w-full">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-1.5">
        <h1 className="text-base font-semibold text-slate-900 truncate shrink-0 leading-tight">{reportTitle}</h1>
        <div className="flex-1 flex justify-center min-w-0">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-600 shrink-0">{labelPeriod}</span>
              <select
                value={periodPreset}
                onChange={(e) => applyPeriodPreset((e.target.value as ReportPeriodKey | 'custom') || 'all')}
                className="h-10 box-border border border-slate-300 rounded-lg py-0 ps-3 pe-10 text-sm leading-10 min-w-[140px] max-w-[200px] bg-white shrink-0 focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none"
                style={{ textAlign: isRtl ? 'right' : 'left' }}
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
              <div className="flex flex-wrap items-center gap-2 justify-center">
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-sm text-slate-600 whitespace-nowrap">{labelFrom}</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => onPaymentDateFromChange(e.target.value)}
                    className="h-10 box-border border border-slate-300 rounded-lg px-2 py-0 text-sm w-[140px] min-w-[140px] bg-white leading-normal focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none"
                    title={labelFrom}
                  />
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-sm text-slate-600 whitespace-nowrap">{labelTo}</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => onPaymentDateToChange(e.target.value)}
                    className="h-10 box-border border border-slate-300 rounded-lg px-2 py-0 text-sm w-[140px] min-w-[140px] bg-white leading-normal focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none"
                    title={labelTo}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
        <div dir="ltr" className="relative z-[120] flex flex-wrap items-center gap-1.5 no-print shrink-0">
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-500 no-print"
            title={t.payments.exportExcel}
          >
            <FileSpreadsheet size={15} />
          </button>
          <button
            type="button"
            onClick={handlePrintReport}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#344054] text-white hover:bg-[#2d3846] no-print"
            title={t.payments.exportPdf}
          >
            <FileText size={15} />
          </button>
          <button
            type="button"
            onClick={handlePrintReport}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#F0F2F5] border border-[#D9DCE0] text-[#344054] hover:bg-[#E4E7EB] no-print"
            title={t.payments.printReport}
          >
            <Printer size={15} />
          </button>
          <div className="relative" ref={columnsMenuRef}>
            <button
              type="button"
              onClick={() => setShowColumnsMenu((v) => !v)}
              aria-expanded={showColumnsMenu}
              aria-haspopup="true"
              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#D9DCE0] bg-[#F0F2F5] text-[#344054] shadow-sm transition-colors hover:bg-[#E4E7EB] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 ${showColumnsMenu ? 'bg-[#E4E7EB] ring-1 ring-slate-300/80' : ''}`}
              title={lang === 'ar' ? 'تخصيص الأعمدة' : 'Customize columns'}
            >
              <Columns3 size={16} strokeWidth={2} aria-hidden />
            </button>
            {showColumnsMenu && (
              <div className="absolute top-full end-0 mt-1 z-50 min-w-[200px] bg-white border border-slate-200 rounded-lg shadow-lg py-2 max-h-72 overflow-y-auto">
                <p className="px-3 py-1.5 text-xs font-semibold text-slate-500 border-b border-slate-100 mb-1">
                  {lang === 'ar' ? 'إظهار الأعمدة' : 'Show columns'}
                </p>
                {PAYMENTS_REPORT_COLUMN_KEYS.map((key) => (
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
        </div>
      </div>

      <div className={`bg-white rounded-xl border border-slate-200 p-4 ${filterRowClass}`}>
        <div className={filterCellNarrowNumber}>
          <input
            type="text"
            value={numberFilter}
            onChange={(e) => {
              setNumberFilter(e.target.value)
              setPage(1)
            }}
            placeholder={t.payments.voucherNumber}
            className={filterInputClass}
            style={{ textAlign: isRtl ? 'right' : 'left' }}
            title={t.payments.voucherNumber}
            aria-label={t.payments.voucherNumber}
          />
        </div>
        <div className={filterCellNarrowStatus}>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              setPage(1)
            }}
            className={filterNativeClass}
            style={{ textAlign: isRtl ? 'right' : 'left' }}
            aria-label={t.status}
          >
            <option value="">{t.status}</option>
            <option value="draft">{t.payments.statusDraft ?? 'مسودة'}</option>
            <option value="approved">{t.payments.statusApproved ?? 'معتمد'}</option>
            <option value="cancelled">{t.payments.statusCancelled ?? 'ملغي'}</option>
          </select>
        </div>
        <div className={filterCellNarrowPayment}>
          <select
            value={paymentMethodIdFilter}
            onChange={(e) => {
              setPaymentMethodIdFilter(e.target.value)
              setPage(1)
            }}
            className={filterNativeClass}
            style={{ textAlign: isRtl ? 'right' : 'left' }}
            aria-label={t.payments.paymentMethod}
          >
            <option value="">{t.payments.paymentMethod}</option>
            {paymentMethods.map((pm) => (
              <option key={pm.id} value={pm.id}>
                {lang === 'ar' ? pm.name : pm.name_en || pm.name}
              </option>
            ))}
          </select>
        </div>
        <div className={filterCellGrow}>
          <select
            value={branchIdFilter}
            onChange={(e) => {
              setBranchIdFilter(e.target.value)
              setPage(1)
            }}
            className={filterNativeClass}
            style={{ textAlign: isRtl ? 'right' : 'left' }}
            aria-label={t.journal.branch}
          >
            <option value="">{t.journal.branch}</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className={filterCellGrow}>
          <select
            value={costCenterIdFilter}
            onChange={(e) => {
              setCostCenterIdFilter(e.target.value)
              setPage(1)
            }}
            className={filterNativeClass}
            style={{ textAlign: isRtl ? 'right' : 'left' }}
            aria-label={t.journal.costCenter ?? 'مركز التكلفة'}
          >
            <option value="">{t.journal.costCenter ?? 'مركز التكلفة'}</option>
            {costCenters.map((cc) => (
              <option key={cc.id} value={cc.id}>
                {(cc as { code?: string }).code ? `${(cc as { code?: string }).code} - ${cc.name}` : cc.name}
              </option>
            ))}
          </select>
        </div>
        <div className={filterCellEmployee}>
          <select
            value={createdByFilter}
            onChange={(e) => {
              setCreatedByFilter(e.target.value)
              setPage(1)
            }}
            className={filterNativeClass}
            style={{ textAlign: isRtl ? 'right' : 'left' }}
            aria-label={t.payments.employeeFilter ?? 'الموظف'}
          >
            <option value="">{t.payments.employeeFilter ?? 'الموظف'}</option>
            {tenantUsers.map((u: { id: number; name: string }) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div className={filterCellPageSize}>
          <PageSizeSelect
            value={perPage}
            onChange={(val) => {
              setPerPage(val)
              setPage(1)
            }}
            showLabel={false}
            ariaLabel={lang === 'ar' ? 'عدد السجلات' : 'Records per page'}
            className="w-full min-w-0"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center items-center h-48">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-500 border-t-transparent" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  {visibleColumns.number && <SortableTh label={t.payments.voucherNumber} sortKey="number" sortState={sort} onToggle={toggleSort} className={`${textAlign} p-0 font-medium`} />}
                  {visibleColumns.date && <SortableTh label={t.date} sortKey="date" sortState={sort} onToggle={toggleSort} className={`${textAlign} p-0 font-medium`} />}
                  {visibleColumns.posted && <SortableTh label={t.payments.posted ?? 'مرحّل'} sortKey="posted" sortState={sort} onToggle={toggleSort} className={`${textAlign} p-0 font-medium w-16`} />}
                  {visibleColumns.status && <SortableTh label={t.status} sortKey="status" sortState={sort} onToggle={toggleSort} className={`${textAlign} p-0 font-medium`} />}
                  {visibleColumns.amount && <SortableTh label={t.amount} sortKey="amount" sortState={sort} onToggle={toggleSort} className={`${textAlign} p-0 font-medium`} />}
                  {visibleColumns.paymentMethod && <SortableTh label={t.payments.paymentMethod} sortKey="paymentMethod" sortState={sort} onToggle={toggleSort} className={`${textAlign} p-0 font-medium`} />}
                  {visibleColumns.recipient && <SortableTh label={t.payments.recipient ?? 'المستلم'} sortKey="recipient" sortState={sort} onToggle={toggleSort} className={`${textAlign} p-0 font-medium`} />}
                  {visibleColumns.reference && <SortableTh label={t.payments.reference} sortKey="reference" sortState={sort} onToggle={toggleSort} className={`${textAlign} p-0 font-medium`} />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {payments.length === 0 ? (
                  <tr><td colSpan={noDataColSpan} className="text-center py-12 text-slate-400">{t.payments.noPaymentVouchers}</td></tr>
                ) : (
                  sortedRows.map((p) => {
                    const isPosted = !!(p as Payment & { journal_entry_id?: number }).journal_entry_id
                    const payStatus = (p.status === 'posted' ? 'approved' : p.status) || 'approved'
                    const statusLabel = payStatus === 'draft' ? (t.payments.statusDraft ?? 'مسودة') : payStatus === 'cancelled' ? (t.payments.statusCancelled ?? 'ملغي') : (t.payments.statusApproved ?? 'معتمد')
                    const statusClass = payStatus === 'draft' ? 'bg-amber-100 text-amber-700' : payStatus === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                    const linkTo = p.invoice_id ? `/invoices/view/${p.invoice_id}` : (p as Payment & { journal_entry_id?: number }).journal_entry_id ? `/journal-entries/create?id=${(p as Payment & { journal_entry_id?: number }).journal_entry_id}` : null
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                        {visibleColumns.number && (
                          <td className="px-4 py-3 font-mono text-xs">
                            {linkTo ? <Link to={linkTo} className="text-primary-600 hover:underline font-medium">{p.number}</Link> : <span className="text-slate-600">{p.number}</span>}
                          </td>
                        )}
                        {visibleColumns.date && <td className="px-4 py-3 text-slate-700">{formatDisplayDate(p.date as string)}</td>}
                        {visibleColumns.posted && (
                          <td className="px-4 py-3 text-center" title={isPosted ? (t.payments.posted ?? 'قيد مرحل') : (t.payments.notPosted ?? 'مسودة')}>
                            {isPosted ? <BookCheck size={18} className="text-emerald-600 inline" /> : <FileEdit size={18} className="text-amber-500 inline" />}
                          </td>
                        )}
                        {visibleColumns.status && (
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusClass}`}>{statusLabel}</span>
                          </td>
                        )}
                        {visibleColumns.amount && <td className="px-4 py-3 font-semibold text-slate-900 tabular-nums">{fmt(p.amount)}</td>}
                        {visibleColumns.paymentMethod && (
                          <td className="px-4 py-3">
                            <span className="rounded-full px-2 py-0.5 text-xs bg-slate-100 text-slate-600">
                              {paymentMethodLabel(p, lang)}
                            </span>
                          </td>
                        )}
                        {visibleColumns.recipient && <td className="px-4 py-3 text-slate-600">{p.counterpartAccount?.name ?? '—'}</td>}
                        {visibleColumns.reference && <td className="px-4 py-3 text-slate-500 text-xs">{p.reference ?? '—'}</td>}
                      </tr>
                    )
                  })
                )}
              </tbody>
              {!isLoading && payments.length > 0 && (
                <tfoot>
                  <tr className="bg-gradient-to-r from-slate-100 to-slate-50 border-t-2 border-slate-400 font-bold text-slate-900 shadow-[0_-2px_4px_rgba(0,0,0,0.04)]">
                    {(() => {
                      const keys = visibleColumnKeys
                      const idxAmount = keys.indexOf('amount')
                      if (idxAmount < 0) {
                        return (
                          <td colSpan={noDataColSpan} className={`${textAlign} p-3 text-sm leading-tight`}>
                            <span className="me-2">{lang === 'ar' ? 'الإجمالي' : 'Total'}:</span>
                            <span className="tabular-nums font-semibold" dir="ltr">
                              {fmt(totals.amount)}
                            </span>
                            <span className="mx-2 opacity-60">·</span>
                            <span>{t.payments.totalCount}:</span>{' '}
                            <span className="tabular-nums font-semibold">{totals.count}</span>
                          </td>
                        )
                      }
                      const afterCount = keys.length - idxAmount - 1
                      return (
                        <>
                          <td colSpan={idxAmount} className={`${textAlign} p-3 text-sm leading-tight`}>
                            {lang === 'ar' ? 'الإجمالي' : 'Total'}
                          </td>
                          <td
                            className={`p-3 text-sm tabular-nums font-semibold leading-tight ${isRtl ? 'text-right' : 'text-center'}`}
                            dir="ltr"
                          >
                            {fmt(totals.amount)}
                          </td>
                          {afterCount > 0 ? (
                            <td
                              colSpan={afterCount}
                              className={`p-3 text-sm font-semibold leading-tight ${isRtl ? 'text-right' : 'text-center'} tabular-nums`}
                            >
                              {t.payments.totalCount}: {totals.count}
                            </td>
                          ) : (
                            <td
                              className={`p-3 text-sm font-semibold leading-tight ${isRtl ? 'text-right' : 'text-center'} tabular-nums`}
                            >
                              {t.payments.totalCount}: {totals.count}
                            </td>
                          )}
                        </>
                      )
                    })()}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
        <ReportFooter
          totalCount={total}
          currentPage={currentPage}
          lastPage={lastPage}
          from={from}
          to={to}
          onPageChange={setPage}
          lang={lang as 'ar' | 'en'}
          isRtl={isRtl}
          alwaysShowPaginationBar
          showRecordSummary={total > 0}
          recordLabel={lang === 'ar' ? 'سند' : 'voucher'}
          dense
        />
      </div>
    </div>
  )
}
