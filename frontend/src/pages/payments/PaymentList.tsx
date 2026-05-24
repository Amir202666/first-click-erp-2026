import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchPayments, fetchPayment, fetchSettings, fetchPaymentMethods, fetchAccounts, fetchTenantUsers } from '../../api/tenant'
import type { Payment, Account, PaymentMethod, PaginatedResponse } from '../../types'
import { formatDisplayDate, toLocalDateString } from '../../utils/date'
import { formatAmount } from '../../utils/currency'
import { sortUsersForFilter } from '../../utils/tenantUsersForFilter'
import { FileText, FileSpreadsheet, Printer, BookCheck, FileEdit, X, Calendar, DollarSign, CreditCard, Building2, Download, CheckCircle, FileClock, ExternalLink, Tag } from 'lucide-react'
import AccountSearchSelect from '../../components/AccountSearchSelect'
import { useClientSort } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'

const typeStyles: Record<string, string> = {
  receipt: 'bg-emerald-100 text-emerald-700',
  payment: 'bg-blue-100 text-blue-700',
  transfer: 'bg-purple-100 text-purple-700',
  refund: 'bg-amber-100 text-amber-700',
}

function startOfYear(): string {
  const d = new Date()
  return `${d.getFullYear()}-01-01`
}

export default function PaymentList() {
  const { currentTenant, user } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const [searchParams, setSearchParams] = useSearchParams()
  const invoiceIdFilter = searchParams.get('invoice_id') ?? ''
  const viewPaymentIdFromUrl = searchParams.get('view')

  const { data: settings } = useQuery({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const fmt = (n: number) => formatAmount(n, { decimal_places: settings?.doc_amount_decimals ?? 2 }, locale)

  const typeLabels: Record<string, string> = {
    receipt: t.payments.types.receipt,
    payment: t.payments.types.payment,
    transfer: t.payments.types.transfer,
    refund: t.payments.types.refund,
  }

  const [viewPayment, setViewPayment] = useState<Payment | null>(null)
  const [dateFrom, setDateFrom] = useState(() => startOfYear())
  const [dateTo, setDateTo] = useState(() => toLocalDateString(new Date()))
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [paymentMethodIdFilter, setPaymentMethodIdFilter] = useState('')
  const [counterpartAccountIdFilter, setCounterpartAccountIdFilter] = useState<number | ''>('')
  const [cashBankAccountIdFilter, setCashBankAccountIdFilter] = useState<number | ''>('')
  const [createdByFilter, setCreatedByFilter] = useState('')
  const [numberFilter, setNumberFilter] = useState('')

  const filterParams = useMemo(() => {
    const p: Record<string, string> = { from_date: dateFrom, to_date: dateTo, per_page: '9999' }
    if (typeFilter) p.type = typeFilter
    if (statusFilter) p.status = statusFilter === 'approved' ? 'approved,posted' : statusFilter
    if (paymentMethodIdFilter) p.payment_method_id = paymentMethodIdFilter
    if (counterpartAccountIdFilter) p.counterpart_account_id = String(counterpartAccountIdFilter)
    if (cashBankAccountIdFilter) p.cash_bank_account_id = String(cashBankAccountIdFilter)
    if (createdByFilter) p.created_by = createdByFilter
    if (numberFilter.trim()) p.number = numberFilter.trim()
    if (invoiceIdFilter) p.invoice_id = invoiceIdFilter
    return p
  }, [dateFrom, dateTo, typeFilter, statusFilter, paymentMethodIdFilter, counterpartAccountIdFilter, cashBankAccountIdFilter, createdByFilter, numberFilter, invoiceIdFilter])

  const { data, isLoading } = useQuery<PaginatedResponse<Payment>>({
    queryKey: ['payments', tenantId, filterParams],
    queryFn: () => fetchPayments(tenantId, filterParams),
    enabled: !!tenantId,
  })

  const { data: allAccounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts', tenantId, 'postable'],
    queryFn: () => fetchAccounts(tenantId, { postable_only: '1', active_only: '1' }),
    enabled: !!tenantId,
  })

  const { data: cashBankAccounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts', tenantId, 'cash_bank'],
    queryFn: () => fetchAccounts(tenantId, { cash_bank_only: '1', active_only: '1' }),
    enabled: !!tenantId,
  })

  const { data: paymentMethods = [] } = useQuery<PaymentMethod[]>({
    queryKey: ['payment-methods', tenantId],
    queryFn: () => fetchPaymentMethods(tenantId, { status: 'active' }),
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

  // فتح نافذة معاينة السند عند وجود معامل view في الرابط
  const { data: paymentFromUrl } = useQuery({
    queryKey: ['payment', tenantId, viewPaymentIdFromUrl],
    queryFn: () => fetchPayment(tenantId, Number(viewPaymentIdFromUrl)),
    enabled: !!tenantId && !!viewPaymentIdFromUrl && !!Number(viewPaymentIdFromUrl),
  })

  const { data: paymentDetail } = useQuery({
    queryKey: ['payment', tenantId, viewPayment?.id],
    queryFn: () => fetchPayment(tenantId, viewPayment!.id),
    enabled: !!tenantId && !!viewPayment?.id,
  })

  useEffect(() => {
    if (paymentFromUrl) {
      setViewPayment(paymentFromUrl as Payment)
      // إزالة معامل view من الرابط بعد فتح السند
      setSearchParams({}, { replace: true })
    }
  }, [paymentFromUrl, setSearchParams])

  const payments = data?.data ?? []
  const textAlign = isRtl ? 'text-right' : 'text-left'

  const { sort, toggleSort, sortedRows: sortedPayments } = useClientSort(payments, [
    { key: 'number', type: 'string', getValue: (p: Payment) => p.number ?? '' },
    { key: 'date', type: 'date', getValue: (p: Payment) => p.date },
    { key: 'posted', type: 'number', getValue: (p: Payment) => ((p as Payment & { journal_entry_id?: number }).journal_entry_id ? 1 : 0) },
    { key: 'type', type: 'string', getValue: (p: Payment) => typeLabels[p.type] ?? p.type },
    {
      key: 'status',
      type: 'string',
      getValue: (p: Payment) => {
        const payStatus = (p.status === 'posted' ? 'approved' : p.status) || 'approved'
        return payStatus === 'draft'
          ? (t.payments.statusDraft ?? 'مسودة')
          : payStatus === 'cancelled'
            ? (t.payments.statusCancelled ?? 'ملغي')
            : (t.payments.statusApproved ?? 'معتمد')
      },
    },
    { key: 'branch', type: 'string', getValue: (p: Payment) => p.branch?.name ?? '' },
    { key: 'amount', type: 'number', getValue: (p: Payment) => Number(p.amount) || 0 },
    {
      key: 'paymentMethod',
      type: 'string',
      getValue: (p: Payment) => {
        const rel = p.paymentMethodRelation || (p as any).payment_method_relation
        return rel ? (lang === 'ar' ? (rel.name ?? '') : (rel.name_en ?? rel.name ?? '')) : ''
      },
    },
    { key: 'party', type: 'string', getValue: (p: Payment) => p.customer?.name ?? p.vendor?.name ?? '' },
    { key: 'reference', type: 'string', getValue: (p: Payment) => p.reference ?? '' },
    { key: 'employee', type: 'string', getValue: (p: Payment) => ((p as any).createdBy?.name ?? '') },
  ], { locale })

  const totals = useMemo(() => {
    const sum = payments.reduce((a, p) => a + Number(p.amount), 0)
    return { amount: sum, count: payments.length }
  }, [payments])

  const reportTitle = lang === 'ar' ? 'تقرير المدفوعات' : 'Payments Report'
  const companyLogo = (settings as Record<string, unknown>)?.company_logo as string | undefined

  function buildPrintContent() {
    const postedLabel = t.payments.posted ?? 'مرحّل'
    const rows = payments.map((p) => {
      const isPosted = !!(p as Payment & { journal_entry_id?: number }).journal_entry_id
      const payStatus = (p.status === 'posted' ? 'approved' : p.status) || 'approved'
      const statusText = payStatus === 'draft' ? (t.payments.statusDraft ?? 'مسودة') : payStatus === 'cancelled' ? (t.payments.statusCancelled ?? 'ملغي') : (t.payments.statusApproved ?? 'معتمد')
      const typeText = typeLabels[p.type] ?? p.type
      const empName = (p as Payment & { createdBy?: { name: string } }).createdBy?.name ?? '—'
      return `<tr><td>${p.number}</td><td>${formatDisplayDate(p.date as string)}</td><td>${typeText}</td><td>${isPosted ? (lang === 'ar' ? 'نعم' : 'Yes') : (lang === 'ar' ? 'لا' : 'No')}</td><td>${statusText}</td><td>${p.branch?.name ?? '—'}</td><td class="num">${fmt(Number(p.amount))}</td><td>${(p.paymentMethodRelation || (p as any).payment_method_relation) ? (lang === 'ar' ? (p.paymentMethodRelation?.name || (p as any).payment_method_relation?.name) : (p.paymentMethodRelation?.name_en || (p as any).payment_method_relation?.name_en || p.paymentMethodRelation?.name || (p as any).payment_method_relation?.name)) : '—'}</td><td>${p.customer?.name ?? p.vendor?.name ?? '—'}</td><td>${p.reference ?? '—'}</td><td>${empName}</td></tr>`
    }).join('')
    return `
      <table class="report-table">
        <thead><tr>
          <th>${t.payments.voucherNumber}</th><th>${t.date}</th><th>${t.type}</th><th>${postedLabel}</th><th>${t.status}</th><th>${t.journal.branch}</th><th class="num">${t.amount}</th><th>${t.payments.paymentMethod}</th><th>${t.journal.customerOrVendor}</th><th>${t.payments.reference}</th><th>${t.payments.employeeFilter ?? 'الموظف'}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr class="footer"><td colspan="6"><strong>${t.payments.totalAmount} / ${t.payments.reportTotal ?? 'إجمالي التقرير'}</strong></td><td class="num"><strong>${fmt(totals.amount)}</strong></td><td colspan="4"></td></tr>
          <tr class="footer"><td colspan="6"><strong>${t.payments.totalCount}</strong></td><td><strong>${totals.count}</strong></td><td colspan="4"></td></tr>
        </tfoot>
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
        <p style="color:#64748b;font-size:0.9rem;">${t.payments.dateFrom ?? 'من تاريخ'}: ${dateFrom} — ${t.payments.dateTo ?? 'إلى تاريخ'}: ${dateTo}${typeFilter ? ` | ${t.type}: ${typeLabels[typeFilter] ?? typeFilter}` : ''}</p>
        ${table}
      </body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 300)
  }

  function handleExportExcel() {
    const postedLabel = t.payments.posted ?? 'مرحّل'
    const headers = [t.payments.voucherNumber, t.date, t.type, postedLabel, t.status, t.journal.branch, t.amount, t.payments.paymentMethod, t.journal.customerOrVendor, t.payments.reference, t.payments.employeeFilter ?? 'الموظف']
    const lines = [headers.join(',')]
    payments.forEach((p) => {
      const isPosted = !!(p as Payment & { journal_entry_id?: number }).journal_entry_id
      const payStatus = (p.status === 'posted' ? 'approved' : p.status) || 'approved'
      const statusText = payStatus === 'draft' ? (t.payments.statusDraft ?? 'مسودة') : payStatus === 'cancelled' ? (t.payments.statusCancelled ?? 'ملغي') : (t.payments.statusApproved ?? 'معتمد')
      const empName = (p as Payment & { createdBy?: { name: string } }).createdBy?.name ?? ''
      lines.push([p.number, formatDisplayDate(p.date as string), typeLabels[p.type] ?? p.type, isPosted ? (lang === 'ar' ? 'نعم' : 'Yes') : (lang === 'ar' ? 'لا' : 'No'), statusText, p.branch?.name ?? '', Number(p.amount), (p.paymentMethodRelation || (p as any).payment_method_relation) ? (lang === 'ar' ? (p.paymentMethodRelation?.name || (p as any).payment_method_relation?.name) : (p.paymentMethodRelation?.name_en || (p as any).payment_method_relation?.name_en || p.paymentMethodRelation?.name || (p as any).payment_method_relation?.name)) : '', p.customer?.name ?? p.vendor?.name ?? '', p.reference ?? '', empName].join(','))
    })
    lines.push('')
    lines.push([t.payments.reportTotal ?? 'إجمالي التقرير', '', '', '', '', '', fmt(totals.amount), '', '', '', ''].join(','))
    lines.push([t.payments.totalCount, '', '', '', '', '', String(totals.count), '', '', '', ''].join(','))
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `payments-report-${dateFrom}-${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-6 space-y-6">
      {/* شريط علوي موحّد: عنوان + أزرار تصدير/طباعة أيقونية */}
      <div className="flex items-center justify-between flex-wrap gap-3 border-b border-slate-200 pb-2">
        <h1 className="text-lg font-semibold text-slate-900">{t.payments.title}</h1>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handlePrintReport}
            className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-[#F0F2F5] border border-[#D9DCE0] text-[#344054] hover:bg-[#E4E7EB]"
            title={t.payments.printReport}
          >
            <Printer size={16} />
          </button>
          <button
            type="button"
            onClick={handlePrintReport}
            className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-[#344054] text-white hover:bg-[#2d3846]"
            title={t.payments.exportPdf}
          >
            <FileText size={16} />
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-500"
            title={t.payments.exportExcel}
          >
            <FileSpreadsheet size={16} />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-[140px]" />
          <span className="text-slate-500">—</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-[140px]" />
          <input type="text" value={numberFilter} onChange={(e) => setNumberFilter(e.target.value)} placeholder={t.payments.voucherNumber} className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-[140px]" />
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm min-w-[120px]">
            <option value="">{t.invoices.allTypes}</option>
            <option value="receipt">{t.payments.types.receipt}</option>
            <option value="payment">{t.payments.types.payment}</option>
            <option value="transfer">{t.payments.types.transfer}</option>
            <option value="refund">{t.payments.types.refund}</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm min-w-[120px]">
            <option value="">— {t.status} —</option>
            <option value="draft">{t.payments.statusDraft ?? 'مسودة'}</option>
            <option value="approved">{t.payments.statusApproved ?? 'معتمد'}</option>
            <option value="cancelled">{t.payments.statusCancelled ?? 'ملغي'}</option>
          </select>
          <select value={paymentMethodIdFilter} onChange={(e) => setPaymentMethodIdFilter(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm min-w-[140px]">
            <option value="">— {t.payments.paymentMethod} —</option>
            {paymentMethods.map((pm) => <option key={pm.id} value={pm.id}>{lang === 'ar' ? pm.name : (pm.name_en || pm.name)}</option>)}
          </select>
          <div className="min-w-[180px]">
            <AccountSearchSelect value={counterpartAccountIdFilter === '' ? null : counterpartAccountIdFilter} accounts={allAccounts} onChange={(id) => setCounterpartAccountIdFilter(id ?? '')} placeholder={t.payments.recipient} />
          </div>
          <div className="min-w-[180px]">
            <AccountSearchSelect value={cashBankAccountIdFilter === '' ? null : cashBankAccountIdFilter} accounts={cashBankAccounts.length ? cashBankAccounts : allAccounts} onChange={(id) => setCashBankAccountIdFilter(id ?? '')} placeholder={t.payments.cashBankAccountFilter ?? 'حساب الصندوق/البنك'} />
          </div>
          <select value={createdByFilter} onChange={(e) => setCreatedByFilter(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm min-w-[140px]">
            <option value="">— {t.payments.employeeFilter ?? 'الموظف'} —</option>
            {tenantUsers.map((u: { id: number; name: string }) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
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
                  <SortableTh label={t.payments.voucherNumber} sortKey="number" sortState={sort} onToggle={toggleSort} widthClassName="w-40" className={`${textAlign} font-medium text-slate-700 dark:text-slate-200`} />
                  <SortableTh label={t.date} sortKey="date" sortState={sort} onToggle={toggleSort} widthClassName="w-28" className={`${textAlign} font-medium text-slate-700 dark:text-slate-200`} />
                  <SortableTh label={t.payments.posted ?? 'مرحّل'} sortKey="posted" sortState={sort} onToggle={toggleSort} widthClassName="w-20" className={`text-center font-medium text-slate-700 dark:text-slate-200`} />
                  <SortableTh label={t.type} sortKey="type" sortState={sort} onToggle={toggleSort} widthClassName="w-32" className={`${textAlign} font-medium text-slate-700 dark:text-slate-200`} />
                  <SortableTh label={t.status} sortKey="status" sortState={sort} onToggle={toggleSort} widthClassName="w-32" className={`${textAlign} font-medium text-slate-700 dark:text-slate-200`} />
                  <SortableTh label={t.journal.branch} sortKey="branch" sortState={sort} onToggle={toggleSort} widthClassName="w-40" className={`${textAlign} font-medium text-slate-700 dark:text-slate-200`} />
                  <SortableTh label={t.amount} sortKey="amount" sortState={sort} onToggle={toggleSort} widthClassName="w-32" className={`text-right font-medium text-slate-700 dark:text-slate-200 tabular-nums`} />
                  <SortableTh label={t.payments.paymentMethod} sortKey="paymentMethod" sortState={sort} onToggle={toggleSort} widthClassName="w-44" className={`${textAlign} font-medium text-slate-700 dark:text-slate-200`} />
                  <SortableTh label={t.journal.customerOrVendor} sortKey="party" sortState={sort} onToggle={toggleSort} widthClassName="w-44" className={`${textAlign} font-medium text-slate-700 dark:text-slate-200`} />
                  <SortableTh label={t.payments.reference} sortKey="reference" sortState={sort} onToggle={toggleSort} widthClassName="w-44" className={`${textAlign} font-medium text-slate-700 dark:text-slate-200`} />
                  <SortableTh label={t.payments.employeeFilter ?? 'الموظف'} sortKey="employee" sortState={sort} onToggle={toggleSort} widthClassName="w-44" className={`${textAlign} font-medium text-slate-700 dark:text-slate-200`} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sortedPayments.length === 0 ? (
                  <tr><td colSpan={11} className="text-center py-12 text-slate-400">{t.payments.noPayments}</td></tr>
                ) : (
                  sortedPayments.map((p) => {
                    const isPosted = !!(p as Payment & { journal_entry_id?: number }).journal_entry_id
                    const payStatus = (p.status === 'posted' ? 'approved' : p.status) || 'approved'
                    const statusLabel = payStatus === 'draft' ? (t.payments.statusDraft ?? 'مسودة') : payStatus === 'cancelled' ? (t.payments.statusCancelled ?? 'ملغي') : (t.payments.statusApproved ?? 'معتمد')
                    const statusClass = payStatus === 'draft' ? 'bg-amber-100 text-amber-700' : payStatus === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                    const linkTo = p.invoice_id ? `/invoices/view/${p.invoice_id}` : (p as Payment & { journal_entry_id?: number }).journal_entry_id ? `/journal-entries/create?id=${(p as Payment & { journal_entry_id?: number }).journal_entry_id}` : null
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs">
                          {linkTo ? <Link to={linkTo} className="text-emerald-600 hover:text-emerald-700 hover:underline font-medium transition-colors duration-150">{p.number}</Link> : <span className="text-slate-600">{p.number}</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{formatDisplayDate(p.date as string)}</td>
                        <td className="px-4 py-3 text-center" title={isPosted ? (t.payments.posted ?? 'قيد مرحل') : (t.payments.notPosted ?? 'مسودة')}>
                          {isPosted ? <BookCheck size={18} className="text-emerald-600 inline" /> : <FileEdit size={18} className="text-amber-500 inline" />}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-3 py-1 text-xs font-medium ${typeStyles[p.type] ?? 'bg-slate-100 text-slate-600'}`}>{typeLabels[p.type] ?? p.type}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusClass}`}>{statusLabel}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{p.branch?.name ?? '—'}</td>
                        <td className="px-4 py-3 font-semibold text-slate-900 tabular-nums">{fmt(p.amount)}</td>
                        <td className="px-4 py-3">
                          <span className="rounded-full px-2 py-0.5 text-xs bg-slate-100 text-slate-600">
                            {(p.paymentMethodRelation || (p as any).payment_method_relation)
                              ? (lang === 'ar' 
                                  ? (p.paymentMethodRelation?.name || (p as any).payment_method_relation?.name)
                                  : (p.paymentMethodRelation?.name_en || (p as any).payment_method_relation?.name_en || p.paymentMethodRelation?.name || (p as any).payment_method_relation?.name)
                                )
                              : '—'
                            }
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{p.customer?.name ?? p.vendor?.name ?? '—'}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{p.reference ?? '—'}</td>
                        <td className="px-4 py-3 text-slate-600 text-xs">{(p as Payment & { createdBy?: { name: string } }).createdBy?.name ?? '—'}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
              {payments.length > 0 && (
                <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                  <tr className="font-semibold text-slate-800">
                    <td colSpan={6} className={`px-4 py-3 ${textAlign}`}>{t.payments.totalAmount} / {t.payments.reportTotal ?? 'إجمالي التقرير'}</td>
                    <td className="px-4 py-3 text-slate-900">{fmt(totals.amount)}</td>
                    <td colSpan={4} className="px-4 py-3"></td>
                  </tr>
                  <tr className="font-semibold text-slate-700">
                    <td colSpan={6} className={`px-4 py-2 ${textAlign}`}>{t.payments.totalCount}</td>
                    <td className="px-4 py-2">{totals.count}</td>
                    <td colSpan={4} className="px-4 py-2"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {/* عرض السند - واجهة عصرية */}
      {viewPayment && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewPayment(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            
            {/* Header - عنوان وأزرار */}
            <div className={`relative bg-gradient-to-r px-6 py-5 ${
              viewPayment.type === 'receipt' ? 'from-emerald-600 to-emerald-500' :
              viewPayment.type === 'payment' ? 'from-blue-600 to-blue-500' :
              viewPayment.type === 'transfer' ? 'from-purple-600 to-purple-500' :
              'from-amber-600 to-amber-500'
            }`}>
              {/* Badge الحالة */}
              {paymentDetail && (
                <div className="absolute top-4 left-4">
                  {(paymentDetail as Payment & { journal_entry_id?: number }).journal_entry_id ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/20 text-white backdrop-blur-sm border border-white/30">
                      <CheckCircle size={14} />
                      {t.payments.posted ?? 'مرحّل'}
                    </span>
                  ) : paymentDetail.status === 'cancelled' ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-500/90 text-white backdrop-blur-sm">
                      <X size={14} />
                      {t.payments.statusCancelled ?? 'ملغي'}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/90 text-white backdrop-blur-sm">
                      <FileClock size={14} />
                      {t.payments.statusDraft ?? 'مسودة'}
                    </span>
                  )}
                </div>
              )}
              
              {/* العنوان */}
              <div className="text-center">
                <h2 className="text-2xl font-bold text-white mb-1">
                  {t.payments.view ?? 'معاينة سند'}
                </h2>
                <p className={`text-sm font-medium ${
                  viewPayment.type === 'receipt' ? 'text-emerald-50' :
                  viewPayment.type === 'payment' ? 'text-blue-50' :
                  viewPayment.type === 'transfer' ? 'text-purple-50' :
                  'text-amber-50'
                }`}>
                  {viewPayment.number}
                </p>
              </div>

              {/* زر الإغلاق */}
              <button 
                onClick={() => setViewPayment(null)} 
                className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/20 text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* المحتوى */}
            <div className="flex-1 overflow-y-auto p-6">
              {paymentDetail && (
                <div className="space-y-6">
                  
                  {/* بطاقات المعلومات الأساسية - Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    
                    {/* التاريخ */}
                    <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-4 border border-slate-200">
                      <div className="flex items-center gap-2 text-slate-600 mb-2">
                        <Calendar size={16} />
                        <span className="text-xs font-medium uppercase">{t.date}</span>
                      </div>
                      <p className="text-slate-900 font-semibold">
                        {formatDisplayDate(paymentDetail.date as string)}
                      </p>
                    </div>

                    {/* المبلغ */}
                    <div className={`bg-gradient-to-br rounded-xl p-4 border ${
                      viewPayment.type === 'receipt' ? 'from-emerald-50 to-emerald-100 border-emerald-200' :
                      viewPayment.type === 'payment' ? 'from-red-50 to-red-100 border-red-200' :
                      'from-purple-50 to-purple-100 border-purple-200'
                    }`}>
                      <div className={`flex items-center gap-2 mb-2 ${
                        viewPayment.type === 'receipt' ? 'text-emerald-700' :
                        viewPayment.type === 'payment' ? 'text-red-700' :
                        'text-purple-700'
                      }`}>
                        <DollarSign size={16} />
                        <span className="text-xs font-medium uppercase">{t.amount}</span>
                      </div>
                      <p className={`font-bold text-lg ${
                        viewPayment.type === 'receipt' ? 'text-emerald-900' :
                        viewPayment.type === 'payment' ? 'text-red-900' :
                        'text-purple-900'
                      }`}>
                        {fmt(paymentDetail.amount)}
                      </p>
                    </div>

                    {/* طريقة الدفع */}
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
                      <div className="flex items-center gap-2 text-blue-700 mb-2">
                        <CreditCard size={16} />
                        <span className="text-xs font-medium uppercase">{t.payments.paymentMethod}</span>
                      </div>
                      <p className="text-blue-900 font-semibold text-sm">
                        {(paymentDetail.paymentMethodRelation || (paymentDetail as any).payment_method_relation)
                          ? (lang === 'ar' 
                              ? (paymentDetail.paymentMethodRelation?.name || (paymentDetail as any).payment_method_relation?.name)
                              : (paymentDetail.paymentMethodRelation?.name_en || (paymentDetail as any).payment_method_relation?.name_en || paymentDetail.paymentMethodRelation?.name || (paymentDetail as any).payment_method_relation?.name)
                            )
                          : '—'
                        }
                      </p>
                    </div>

                    {/* الفرع */}
                    {paymentDetail.branch && (
                      <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4 border border-purple-200">
                        <div className="flex items-center gap-2 text-purple-700 mb-2">
                          <Building2 size={16} />
                          <span className="text-xs font-medium uppercase">{t.journal.branch}</span>
                        </div>
                        <p className="text-purple-900 font-semibold text-sm">
                          {paymentDetail.branch.name}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* الحسابات - جدول أنيق */}
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                      <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
                        {t.nav.accounts}
                      </h3>
                    </div>
                    
                    <div className="divide-y divide-slate-100">
                      {viewPayment.type === 'receipt' ? (
                        <>
                          {/* حساب البنك/الصندوق */}
                          <div className="px-4 py-3 hover:bg-slate-50 transition-colors">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <p className="text-xs text-slate-500 mb-1">
                                  {t.payments.cashBankAccount ?? 'حساب البنك/الصندوق'}
                                </p>
                                <p className="text-slate-900 font-medium">
                                  {paymentDetail.cashBankAccount 
                                    ? `${paymentDetail.cashBankAccount.code} - ${paymentDetail.cashBankAccount.name}`
                                    : '—'
                                  }
                                </p>
                              </div>
                              <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-semibold rounded">
                                {t.journal.debit ?? 'مدين'}
                              </span>
                            </div>
                          </div>

                          {/* الحساب المقابل */}
                          <div className="px-4 py-3 hover:bg-slate-50 transition-colors">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <p className="text-xs text-slate-500 mb-1">
                                  {t.payments.counterpartAccount ?? 'الحساب المقابل'}
                                </p>
                                <p className="text-slate-900 font-medium">
                                  {paymentDetail.counterpartAccount 
                                    ? `${paymentDetail.counterpartAccount.code} - ${paymentDetail.counterpartAccount.name}`
                                    : '—'
                                  }
                                </p>
                              </div>
                              <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-semibold rounded">
                                {t.journal.credit ?? 'دائن'}
                              </span>
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          {/* الحساب المقابل */}
                          <div className="px-4 py-3 hover:bg-slate-50 transition-colors">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <p className="text-xs text-slate-500 mb-1">
                                  {t.payments.counterpartAccount ?? 'الحساب المقابل'}
                                </p>
                                <p className="text-slate-900 font-medium">
                                  {paymentDetail.counterpartAccount 
                                    ? `${paymentDetail.counterpartAccount.code} - ${paymentDetail.counterpartAccount.name}`
                                    : '—'
                                  }
                                </p>
                              </div>
                              <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-semibold rounded">
                                {t.journal.debit ?? 'مدين'}
                              </span>
                            </div>
                          </div>

                          {/* حساب البنك/الصندوق */}
                          <div className="px-4 py-3 hover:bg-slate-50 transition-colors">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <p className="text-xs text-slate-500 mb-1">
                                  {t.payments.cashBankAccount ?? 'حساب البنك/الصندوق'}
                                </p>
                                <p className="text-slate-900 font-medium">
                                  {paymentDetail.cashBankAccount 
                                    ? `${paymentDetail.cashBankAccount.code} - ${paymentDetail.cashBankAccount.name}`
                                    : '—'
                                  }
                                </p>
                              </div>
                              <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-semibold rounded">
                                {t.journal.credit ?? 'دائن'}
                              </span>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* معلومات إضافية */}
                  {(paymentDetail.reference || paymentDetail.notes || paymentDetail.costCenter) && (
                    <div className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-200">
                      <h3 className="text-sm font-semibold text-slate-700 mb-3">
                        {t.additionalInfo ?? 'معلومات إضافية'}
                      </h3>
                      
                      {paymentDetail.reference && (
                        <div className="flex items-start gap-3">
                          <Tag size={16} className="text-slate-400 mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-slate-500">{t.payments.reference}</p>
                            <p className="text-slate-900 font-medium">{paymentDetail.reference}</p>
                          </div>
                        </div>
                      )}

                      {paymentDetail.costCenter && (
                        <div className="flex items-start gap-3">
                          <Building2 size={16} className="text-slate-400 mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-slate-500">{t.journal.costCenter}</p>
                            <p className="text-slate-900 font-medium">{paymentDetail.costCenter.name}</p>
                          </div>
                        </div>
                      )}

                      {paymentDetail.notes && (
                        <div className="flex items-start gap-3">
                          <FileText size={16} className="text-slate-400 mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-slate-500">{t.notes}</p>
                            <p className="text-slate-700">{paymentDetail.notes}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                </div>
              )}
            </div>

            {/* Footer - أزرار الإجراءات */}
            <div className="border-t border-slate-200 bg-slate-50 px-6 py-4">
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setViewPayment(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  {t.close ?? 'إغلاق'}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}
