import { useState, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchPayments,
  fetchPayment,
  deletePayment,
  fetchAccounts,
  fetchBranches,
  fetchCostCenters,
  fetchPaymentMethods,
  fetchSettings,
  fetchTenantUsers,
} from '../../api/tenant'
import type { Payment, Account, Branch, CostCenter, PaymentMethod, PaginatedResponse } from '../../types'
import { formatDisplayDate, getReportPeriodRange, type ReportPeriodKey } from '../../utils/date'
import { formatAmount } from '../../utils/currency'
import { sortUsersForFilter } from '../../utils/tenantUsersForFilter'
import { Plus, X, MoreVertical, Eye, Pencil, Trash2, Printer, FileText, FileSpreadsheet, BookCheck, Columns3, Calendar, DollarSign, CreditCard, Building2, Download, CheckCircle, FileClock, Tag, Paperclip } from 'lucide-react'
import WhatsAppButton from '../../components/WhatsAppButton'
import { messageTemplateReceiptVoucher } from '../../utils/whatsapp'
import AccountSearchSelect from '../../components/AccountSearchSelect'
import { usePersistedColumnVisibility } from '../../hooks/usePersistedColumnVisibility'
import { useClientSort } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'
import ReportFooter from '../../components/ui/ReportFooter'
import { filterPageSizeSelectClass, filterSelectCompactClass } from '../../utils/filterControlStyles'

type ReceiptVoucherColumnKey =
  | 'number'
  | 'date'
  | 'branch'
  | 'amount'
  | 'paymentMethod'
  | 'reference'
  | 'notes'

const RECEIPT_VOUCHER_COLUMN_KEYS: ReceiptVoucherColumnKey[] = [
  'number',
  'date',
  'branch',
  'paymentMethod',
  'reference',
  'notes',
  'amount',
]

const RECEIPT_VOUCHERS_COLUMNS_STORAGE_KEY = 'receiptVouchersVisibleColumns'

const filterSelectCls = filterSelectCompactClass

const RECEIPT_PAGE_SIZES = [10, 25, 50, 100, 200, 500] as const

export default function ReceiptVouchers() {
  const [searchParams, setSearchParams] = useSearchParams()
  const invoiceIdFromUrl = searchParams.get('invoice_id')
  const viewPaymentIdFromUrl = searchParams.get('view')
  const { currentTenant, user } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const navigate = useNavigate()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const { data: settings } = useQuery({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const fmt = (n: number) => formatAmount(n, { decimal_places: settings?.doc_amount_decimals ?? 2 }, locale)

  const [openMenuId, setOpenMenuId] = useState<number | null>(null)
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null)
  const [viewPayment, setViewPayment] = useState<Payment | null>(null)
  const [attachmentPreviewOpen, setAttachmentPreviewOpen] = useState(false)
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Payment | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (menuRef.current && !menuRef.current.contains(target) && !(target as Element).closest?.('button')) {
        setOpenMenuId(null)
        setMenuAnchor(null)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  useEffect(() => {
    setAttachmentPreviewOpen(false)
    setAttachmentPreviewUrl(null)
  }, [viewPayment?.id])

  useEffect(() => {
    if (!invoiceIdFromUrl || !Number(invoiceIdFromUrl)) return
    navigate(`/payments/create-voucher?voucher_type=receipt&invoice_id=${invoiceIdFromUrl}`, { replace: true })
  }, [invoiceIdFromUrl, navigate])

  const initialAllRange = getReportPeriodRange('all')
  const [dateFrom, setDateFrom] = useState(initialAllRange.from_date)
  const [dateTo, setDateTo] = useState(initialAllRange.to_date)
  const [periodPreset, setPeriodPreset] = useState<ReportPeriodKey | 'custom'>('all')
  const [perPage, setPerPage] = useState(25)
  const [page, setPage] = useState(1)
  const [numberFilter, setNumberFilter] = useState('')
  const [paymentMethodIdFilter, setPaymentMethodIdFilter] = useState('')
  const [branchIdFilter, setBranchIdFilter] = useState('')
  const [costCenterIdFilter, setCostCenterIdFilter] = useState('')
  const [createdByFilter, setCreatedByFilter] = useState('')
  const [counterpartAccountIdFilter, setCounterpartAccountIdFilter] = useState<number | ''>('')

  const [showColumnsMenu, setShowColumnsMenu] = useState(false)
  const columnsMenuRef = useRef<HTMLDivElement>(null)
  const [visibleColumns, setVisibleColumns] = usePersistedColumnVisibility(
    RECEIPT_VOUCHERS_COLUMNS_STORAGE_KEY,
    RECEIPT_VOUCHER_COLUMN_KEYS,
  )

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (!showColumnsMenu) return
      if (!columnsMenuRef.current) return
      if (!columnsMenuRef.current.contains(e.target as Node)) setShowColumnsMenu(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [showColumnsMenu])

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

  const filterParams = useMemo(() => {
    const p: Record<string, string> = { type: 'receipt', per_page: String(perPage), page: String(page) }
    if (periodPreset !== 'all') {
      p.from_date = dateFrom
      p.to_date = dateTo
    }
    if (numberFilter.trim()) p.number = numberFilter.trim()
    if (paymentMethodIdFilter) p.payment_method_id = paymentMethodIdFilter
    if (branchIdFilter) p.branch_id = branchIdFilter
    if (costCenterIdFilter) p.cost_center_id = costCenterIdFilter
    if (createdByFilter) p.created_by = createdByFilter
    if (counterpartAccountIdFilter) p.counterpart_account_id = String(counterpartAccountIdFilter)
    return p
  }, [
    periodPreset,
    dateFrom,
    dateTo,
    numberFilter,
    paymentMethodIdFilter,
    branchIdFilter,
    costCenterIdFilter,
    createdByFilter,
    counterpartAccountIdFilter,
    perPage,
    page,
  ])

  useEffect(() => {
    setPage(1)
  }, [
    periodPreset,
    dateFrom,
    dateTo,
    numberFilter,
    paymentMethodIdFilter,
    branchIdFilter,
    costCenterIdFilter,
    createdByFilter,
    counterpartAccountIdFilter,
  ])

  const { data, isLoading } = useQuery<PaginatedResponse<Payment>>({
    queryKey: ['payments', tenantId, 'receipt', filterParams, perPage, page],
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

  // فتح نافذة معاينة السند عند وجود معامل view في الرابط
  const { data: paymentFromUrl } = useQuery<Payment>({
    queryKey: ['payment', tenantId, viewPaymentIdFromUrl],
    queryFn: () => fetchPayment(tenantId, Number(viewPaymentIdFromUrl)),
    enabled: !!tenantId && !!viewPaymentIdFromUrl && !!Number(viewPaymentIdFromUrl),
  })

  useEffect(() => {
    if (paymentFromUrl) {
      setViewPayment(paymentFromUrl)
      // إزالة معامل view من الرابط بعد فتح السند
      setSearchParams({}, { replace: true })
    }
  }, [paymentFromUrl, setSearchParams])

  const showCustomDateFields = periodPreset === 'custom'
  const labelPeriod = lang === 'ar' ? 'الفترة' : 'Period'
  const labelFrom = lang === 'ar' ? 'من تاريخ' : 'From date'
  const labelTo = lang === 'ar' ? 'إلى تاريخ' : 'To date'

  const deleteMut = useMutation({
    mutationFn: (id: number) => deletePayment(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments', tenantId] })
      setDeleteTarget(null)
    },
  })

  const { data: paymentDetail } = useQuery<Payment>({
    queryKey: ['payment', tenantId, viewPayment?.id],
    queryFn: () => fetchPayment(tenantId, viewPayment!.id),
    enabled: !!tenantId && !!viewPayment?.id,
  })

  function handlePrint(p: Payment) {
    setOpenMenuId(null)
    const content = document.createElement('div')
    content.dir = lang === 'ar' ? 'rtl' : 'ltr'
    content.innerHTML = `
      <div style="font-family: Arial; padding: 24px; max-width: 400px;">
        <h2 style="margin-bottom: 16px;">${lang === 'ar' ? 'سند قبض' : 'Receipt Voucher'}</h2>
        <p><strong>${t.payments.voucherNumber}:</strong> ${p.number}</p>
        <p><strong>${t.date}:</strong> ${formatDisplayDate(p.date as string)}</p>
        <p><strong>${t.amount}:</strong> ${fmt(p.amount)}</p>
        <p><strong>${t.payments.paymentMethod}:</strong> ${(p.paymentMethodRelation || (p as any).payment_method_relation) ? (lang === 'ar' ? (p.paymentMethodRelation?.name || (p as any).payment_method_relation?.name) : (p.paymentMethodRelation?.name_en || (p as any).payment_method_relation?.name_en || p.paymentMethodRelation?.name || (p as any).payment_method_relation?.name)) : (p.payment_method ?? '—')}</p>
        ${p.reference ? `<p><strong>${t.payments.reference}:</strong> ${p.reference}</p>` : ''}
        ${p.notes ? `<p><strong>${t.notes}:</strong> ${p.notes}</p>` : ''}
      </div>`
    const w = window.open('', '_blank')
    if (w) {
      w.document.write(content.outerHTML)
      w.document.close()
      w.focus()
      setTimeout(() => { w.print(); w.close() }, 250)
    }
  }

  const receipts = data?.data ?? []
  const textAlign = isRtl ? 'text-right' : 'text-left'

  const visibleReceiptColumnKeys = RECEIPT_VOUCHER_COLUMN_KEYS.filter((k) => visibleColumns[k])

  const totals = useMemo(() => {
    const sum = receipts.reduce((a: number, p: Payment) => a + Number(p.amount), 0)
    return { amount: sum }
  }, [receipts])

  const receiptSortColumns = useMemo(
    () => [
      { key: 'number' as ReceiptVoucherColumnKey, type: 'string' as const, getValue: (p: Payment) => p.number ?? '' },
      { key: 'date' as ReceiptVoucherColumnKey, type: 'date' as const, getValue: (p: Payment) => p.date as string },
      { key: 'branch' as ReceiptVoucherColumnKey, type: 'string' as const, getValue: (p: Payment) => p.branch?.name ?? '' },
      {
        key: 'paymentMethod' as ReceiptVoucherColumnKey,
        type: 'string' as const,
        getValue: (p: Payment) => {
          const rel = p.paymentMethodRelation || (p as { payment_method_relation?: { name?: string; name_en?: string } }).payment_method_relation
          if (rel) return lang === 'ar' ? (rel.name ?? '') : (rel.name_en || rel.name || '')
          return String(p.payment_method ?? '')
        },
      },
      { key: 'reference' as ReceiptVoucherColumnKey, type: 'string' as const, getValue: (p: Payment) => p.reference ?? '' },
      { key: 'notes' as ReceiptVoucherColumnKey, type: 'string' as const, getValue: (p: Payment) => p.notes ?? '' },
      { key: 'amount' as ReceiptVoucherColumnKey, type: 'number' as const, getValue: (p: Payment) => Number(p.amount) },
    ],
    [lang],
  )
  const { sort, toggleSort, sortedRows } = useClientSort<Payment, ReceiptVoucherColumnKey>(receipts, receiptSortColumns, { locale })

  const reportTitle = lang === 'ar' ? 'سندات القبض' : 'Receipt Vouchers'
  const buildPrintContent = () => {
    const rows = sortedRows.map((p) =>
      `<tr><td>${p.number}</td><td>${formatDisplayDate(p.date as string)}</td><td>${p.branch?.name ?? '—'}</td><td>${(p.paymentMethodRelation || (p as any).payment_method_relation) ? (lang === 'ar' ? (p.paymentMethodRelation?.name || (p as any).payment_method_relation?.name) : (p.paymentMethodRelation?.name_en || (p as any).payment_method_relation?.name_en || p.paymentMethodRelation?.name || (p as any).payment_method_relation?.name)) : (p.payment_method ?? '—')}</td><td>${p.reference ?? '—'}</td><td>${p.notes ?? '—'}</td><td class="num">${fmt(Number(p.amount))}</td></tr>`
    ).join('')
    return `
      <table>
        <thead><tr>
          <th>${t.payments.voucherNumber}</th><th>${t.date}</th><th>${t.journal.branch}</th><th>${t.payments.paymentMethod}</th><th>${t.payments.reference}</th><th>${t.notes}</th><th class="num">${t.amount}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr class="footer"><td colspan="6"><strong>${t.payments.tableFooterTotal}</strong></td><td class="num"><strong>${fmt(totals.amount)}</strong></td></tr>
        </tfoot>
      </table>`
  }
  const handlePrintReport = () => {
    const table = buildPrintContent()
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <!DOCTYPE html><html dir="${isRtl ? 'rtl' : 'ltr'}"><head>
        <meta charset="utf-8"><title>${reportTitle}</title>
        <style>body{font-family:Arial,sans-serif;padding:20px;} table{width:100%;border-collapse:collapse;} th,td{border:1px solid #ddd;padding:8px;} th{background:#f5f5f5;} .num{text-align:right;font-variant-numeric:tabular-nums;} .footer{font-weight:400;border-top:2px solid #333;background:#f0f0f0;}</style>
      </head><body><h2>${reportTitle}</h2><p>${t.payments.dateFrom}: ${dateFrom} — ${t.payments.dateTo}: ${dateTo}</p>${table}</body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 300)
  }
  const handleExportExcel = () => {
    const headers = [t.payments.voucherNumber, t.date, t.journal.branch, t.payments.paymentMethod, t.payments.reference, t.notes, t.amount]
    const lines = [headers.join(',')]
    sortedRows.forEach((p) => {
      lines.push([p.number, formatDisplayDate(p.date as string), p.branch?.name ?? '', (p.paymentMethodRelation || (p as any).payment_method_relation) ? (lang === 'ar' ? (p.paymentMethodRelation?.name || (p as any).payment_method_relation?.name) : (p.paymentMethodRelation?.name_en || (p as any).payment_method_relation?.name_en || p.paymentMethodRelation?.name || (p as any).payment_method_relation?.name)) : (p.payment_method ?? ''), p.reference ?? '', (p.notes ?? '').replace(/,/g, ' '), Number(p.amount)].join(','))
    })
    lines.push('')
    lines.push([t.payments.tableFooterTotal, '', '', '', '', '', fmt(totals.amount)].join(','))
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `receipt-vouchers-${dateFrom}-${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="px-0 pt-4 pb-6 space-y-3 bg-[#f8f9fa] w-full min-w-0 max-w-full">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-lg font-normal text-slate-800">{t.payments.receiptVouchers}</h1>
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
          <button
            onClick={() => navigate('/payments/create-voucher?voucher_type=receipt')}
            className="inline-flex h-[35px] items-center gap-2 rounded-md bg-primary-600 px-3 text-white text-xs font-medium hover:bg-primary-500"
          >
            <Plus size={14} className="shrink-0" />
            <span className="mx-1">{lang === 'ar' ? 'إضافة' : 'Add'}</span>
          </button>
          <div className="relative" ref={columnsMenuRef}>
            <button
              type="button"
              onClick={() => setShowColumnsMenu((v) => !v)}
              className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-[#F0F2F5] border border-[#D9DCE0] text-[#344054] hover:bg-[#E4E7EB]"
              title={lang === 'ar' ? 'تخصيص الأعمدة' : 'Customize columns'}
            >
              <Columns3 size={16} />
            </button>
            {showColumnsMenu && (
              <div className="absolute top-full start-0 mt-2 z-20 w-64 rounded-lg border border-slate-200 bg-white shadow-lg py-2 text-sm">
                <div className="px-3 pb-2 text-xs font-semibold text-slate-500">
                  {lang === 'ar' ? 'إظهار/إخفاء الأعمدة' : 'Show / hide columns'}
                </div>
                {RECEIPT_VOUCHER_COLUMN_KEYS.map((key) => {
                  const label =
                    key === 'number'
                      ? t.payments.voucherNumber
                      : key === 'date'
                        ? t.date
                        : key === 'branch'
                          ? t.journal.branch
                          : key === 'amount'
                            ? t.amount
                            : key === 'paymentMethod'
                              ? t.payments.paymentMethod
                              : key === 'reference'
                                ? t.payments.reference
                                : key === 'notes'
                                  ? t.notes
                                  : key
                  return (
                    <label
                      key={key}
                      className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer select-none"
                    >
                      <input
                        type="checkbox"
                        checked={visibleColumns[key]}
                        onChange={() => setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }))}
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
              placeholder={t.payments.voucherNumber}
              className="h-9 border border-slate-300 rounded-lg px-3 text-sm w-full min-w-0 bg-white"
            />
          </div>
          <div className="w-full md:w-[10.5rem] shrink-0 min-w-0">
            <select
              value={paymentMethodIdFilter}
              onChange={(e) => setPaymentMethodIdFilter(e.target.value)}
              className="h-9 border border-slate-300 rounded-lg px-3 text-sm w-full min-w-0 bg-white"
            >
              <option value="">{t.payments.paymentMethod}</option>
              {paymentMethods.map((pm) => (
                <option key={pm.id} value={pm.id}>
                  {lang === 'ar' ? pm.name : pm.name_en || pm.name}
                </option>
              ))}
            </select>
          </div>
          <div className="w-full md:w-[10.5rem] shrink-0 min-w-0">
            <select
              value={branchIdFilter}
              onChange={(e) => setBranchIdFilter(e.target.value)}
              className="h-9 border border-slate-300 rounded-lg px-3 text-sm w-full min-w-0 bg-white"
            >
              <option value="">{t.journal.branch}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {lang === 'ar' ? b.name : b.name_en || b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="w-full md:w-[10.5rem] shrink-0 min-w-0">
            <select
              value={costCenterIdFilter}
              onChange={(e) => setCostCenterIdFilter(e.target.value)}
              className="h-9 border border-slate-300 rounded-lg px-3 text-sm w-full min-w-0 bg-white"
            >
              <option value="">{t.journal.costCenter}</option>
              {costCenters.map((cc) => (
                <option key={cc.id} value={cc.id}>
                  {lang === 'ar' ? cc.name : cc.name_en || cc.name}
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
              aria-label={lang === 'ar' ? 'المستخدم' : 'User'}
              title={lang === 'ar' ? 'المستخدم' : 'User'}
            >
              <option value="">{lang === 'ar' ? 'المستخدم' : 'User'}</option>
              {tenantUsers.map((u: { id: number; name: string }) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <div className="h-9 min-w-[10.5rem] max-w-[19rem] flex-1 basis-[min(19rem,100%)]">
            <AccountSearchSelect
              value={counterpartAccountIdFilter === '' ? null : counterpartAccountIdFilter}
              accounts={allAccounts}
              onChange={(id) => setCounterpartAccountIdFilter(id ?? '')}
              placeholder={t.payments.recipient}
              className="h-full min-w-0 [&_input]:h-9 [&_input]:rounded-lg [&_input]:text-sm"
            />
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
              {RECEIPT_PAGE_SIZES.map((n) => (
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
                  {visibleColumns.number && (
                    <SortableTh
                      label={t.payments.voucherNumber}
                      sortKey="number"
                      sortState={sort}
                      onToggle={toggleSort}
                      widthClassName="w-[136px] min-w-[136px] max-w-[136px]"
                      className={`${textAlign} font-medium text-slate-700`}
                    />
                  )}
                  {visibleColumns.date && (
                    <SortableTh
                      label={t.date}
                      sortKey="date"
                      sortState={sort}
                      onToggle={toggleSort}
                      widthClassName="min-w-[6.75rem] w-[7rem]"
                      className={`${textAlign} font-medium text-slate-700`}
                    />
                  )}
                  {visibleColumns.branch && (
                    <SortableTh
                      label={t.journal.branch}
                      sortKey="branch"
                      sortState={sort}
                      onToggle={toggleSort}
                      widthClassName="min-w-[100px]"
                      className={`${textAlign} font-medium text-slate-700`}
                    />
                  )}
                  {visibleColumns.paymentMethod && (
                    <SortableTh
                      label={t.payments.paymentMethod}
                      sortKey="paymentMethod"
                      sortState={sort}
                      onToggle={toggleSort}
                      widthClassName="min-w-[8.5rem] w-[9rem]"
                      className={`${textAlign} font-medium text-slate-700`}
                    />
                  )}
                  {visibleColumns.reference && (
                    <SortableTh
                      label={t.payments.reference}
                      sortKey="reference"
                      sortState={sort}
                      onToggle={toggleSort}
                      widthClassName="min-w-[7.5rem] w-[8rem]"
                      className={`${textAlign} font-medium text-slate-700`}
                    />
                  )}
                  {visibleColumns.notes && (
                    <SortableTh
                      label={t.notes}
                      sortKey="notes"
                      sortState={sort}
                      onToggle={toggleSort}
                      widthClassName="min-w-[120px]"
                      className={`${textAlign} font-medium text-slate-700`}
                    />
                  )}
                  {visibleColumns.amount && (
                    <SortableTh
                      label={t.amount}
                      sortKey="amount"
                      sortState={sort}
                      onToggle={toggleSort}
                      widthClassName="w-28"
                      className="text-right font-medium text-slate-700 tabular-nums"
                    />
                  )}
                  <th className={`${textAlign} px-2 py-3 font-medium w-12 align-middle`} aria-hidden />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedRows.length === 0 ? (
                  <tr><td colSpan={visibleReceiptColumnKeys.length + 1} className="text-center py-10 text-slate-400">{t.payments.noReceipts}</td></tr>
                ) : (
                  sortedRows.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      {visibleColumns.number && (
                        <td className="px-2 py-2 font-mono text-xs text-primary-600 font-medium w-[136px] max-w-[136px] min-w-0 truncate" title={p.number}>
                          {p.number}
                        </td>
                      )}
                      {visibleColumns.date && (
                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{formatDisplayDate(p.date as string)}</td>
                      )}
                      {visibleColumns.branch && (
                        <td className="px-3 py-2 text-slate-600 text-xs max-w-[140px] truncate" title={p.branch?.name ?? undefined}>
                          {p.branch?.name ?? '—'}
                        </td>
                      )}
                      {visibleColumns.paymentMethod && (
                        <td className="px-3 py-2 min-w-0">
                          <span className="inline-block max-w-full truncate rounded-full px-2 py-0.5 text-[11px] font-medium leading-tight bg-slate-100 text-slate-600">
                            {(p.paymentMethodRelation || (p as any).payment_method_relation)
                              ? (lang === 'ar'
                                  ? (p.paymentMethodRelation?.name || (p as any).payment_method_relation?.name)
                                  : (p.paymentMethodRelation?.name_en || (p as any).payment_method_relation?.name_en || p.paymentMethodRelation?.name || (p as any).payment_method_relation?.name)
                                )
                              : (p.payment_method ?? '—')
                            }
                          </span>
                        </td>
                      )}
                      {visibleColumns.reference && (
                        <td className="px-3 py-2 text-slate-600 text-xs min-w-0 max-w-[12rem] truncate" title={p.reference ?? undefined}>
                          {p.reference ?? '—'}
                        </td>
                      )}
                      {visibleColumns.notes && (
                        <td className="px-3 py-2 text-slate-900 max-w-xs truncate" title={p.notes ?? undefined}>
                          {p.notes ?? '—'}
                        </td>
                      )}
                      {visibleColumns.amount && (
                        <td className="px-3 py-2 font-medium text-slate-800 tabular-nums">{fmt(p.amount)}</td>
                      )}
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
                          aria-label={t.payments.actions ?? 'إجراءات'}
                        >
                          <MoreVertical size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {sortedRows.length > 0 && (
                <tfoot>
                  <tr className="bg-gradient-to-r from-slate-100 to-slate-50 border-t-2 border-slate-400 font-bold text-slate-900 shadow-[0_-2px_4px_rgba(0,0,0,0.04)]">
                    {visibleColumns.amount ? (
                      <>
                        <td
                          colSpan={Math.max(1, visibleReceiptColumnKeys.filter((k) => k !== 'amount').length)}
                          className={`${textAlign} p-3 text-sm leading-tight`}
                        >
                          {lang === 'ar' ? 'الإجمالي' : 'Total'}
                        </td>
                        <td
                          className={`p-3 text-sm tabular-nums font-semibold leading-tight ${isRtl ? 'text-right' : 'text-center'} text-slate-900`}
                          dir="ltr"
                        >
                          {fmt(totals.amount)}
                        </td>
                        <td className="p-3" aria-hidden />
                      </>
                    ) : (
                      <>
                        <td
                          colSpan={Math.max(1, visibleReceiptColumnKeys.length)}
                          className={`${textAlign} p-3 text-sm leading-tight`}
                        >
                          {lang === 'ar' ? 'الإجمالي' : 'Total'}:{' '}
                          <span className="tabular-nums font-semibold">{fmt(totals.amount)}</span>
                        </td>
                        <td className="p-3" aria-hidden />
                      </>
                    )}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {data && (
            <ReportFooter
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
              recordLabel={lang === 'ar' ? 'سند' : 'voucher'}
              dense
            />
          )}
          </>
        )}
      </div>

      {openMenuId && menuAnchor && (() => {
        const p = receipts.find((x: Payment) => x.id === openMenuId)
        if (!p) return null
        const MENU_HEIGHT = 220
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
        const leftOrRight: React.CSSProperties = isRtl
          ? { right: Math.min(window.innerWidth - menuAnchor.right, vw - MENU_WIDTH - padX), left: 'auto' as const }
          : { left: Math.min(menuAnchor.left, vw - MENU_WIDTH - padX), right: 'auto' as const }
        const style: React.CSSProperties = {
          position: 'fixed',
          top: `${top}px`,
          ...leftOrRight,
          zIndex: 99999,
        }
        return createPortal(
          <div ref={menuRef} style={style} className="py-1 min-w-[140px] bg-white border border-slate-200 rounded-lg shadow-lg overflow-visible">
            <button type="button" onClick={() => { setViewPayment(p); setOpenMenuId(null); setMenuAnchor(null) }} className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 text-left">
              <Eye size={14} /> {t.payments.view}
            </button>
            <button type="button" onClick={() => { navigate(`/payments/create-voucher?id=${p.id}`); setOpenMenuId(null); setMenuAnchor(null) }} className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left text-slate-700 hover:bg-slate-100">
              <Pencil size={14} /> {t.payments.edit}
            </button>
            <button type="button" onClick={() => { handlePrint(p); setOpenMenuId(null); setMenuAnchor(null) }} className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 text-left">
              <Printer size={14} /> {t.payments.print}
            </button>
            {(p as Payment & { journal_entry_id?: number | null }).journal_entry_id && (
              <button type="button" onClick={() => { navigate(`/journal-entries/create?id=${(p as Payment & { journal_entry_id: number }).journal_entry_id}`); setOpenMenuId(null); setMenuAnchor(null) }} className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 text-left">
                <BookCheck size={14} /> {t.journal.viewEntry}
              </button>
            )}
            <button type="button" onClick={() => { setDeleteTarget(p); setOpenMenuId(null); setMenuAnchor(null) }} className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 text-left">
              <Trash2 size={14} /> {t.payments.delete}
            </button>
          </div>,
          document.body
        )
      })()}

      {/* عرض السند - واجهة عصرية */}
      {viewPayment && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewPayment(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            
            {/* Header - عنوان وأزرار */}
            <div className="relative px-6 py-4 border-b border-slate-200 bg-white">
              {/* Badge الحالة */}
              {paymentDetail ? (
                <div className="absolute top-4 left-4">
                  {(paymentDetail as Payment & { journal_entry_id?: number }).journal_entry_id ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/20 text-white backdrop-blur-sm border border-white/30">
                      <CheckCircle size={14} />
                      {t.payments.posted ?? 'مرحّل'}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/90 text-white backdrop-blur-sm">
                      <FileClock size={14} />
                      {t.payments.statusDraft ?? 'مسودة'}
                    </span>
                  )}
                </div>
              ) : null}
              
              {/* العنوان */}
              <div className="text-center">
                <h2 className="text-xl font-semibold text-slate-900 mb-1">
                  {t.payments.view ?? 'معاينة سند القبض'}
                </h2>
                <p className="text-slate-500 text-sm font-medium">
                  {viewPayment.number}
                </p>
                {paymentDetail?.attachment_url && (
                  <div className="mt-2 flex items-center justify-center">
                    <button
                      type="button"
                      onClick={() => {
                        setAttachmentPreviewUrl(paymentDetail.attachment_url as string)
                        setAttachmentPreviewOpen(true)
                      }}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 transition-colors text-slate-700"
                      title={lang === 'ar' ? 'عرض المرفق' : 'View attachment'}
                    >
                      <Paperclip size={18} className="text-primary-600" />
                      {lang === 'ar' ? 'عرض' : 'View'}
                    </button>
                  </div>
                )}
              </div>

              {/* زر الإغلاق */}
              <button 
                onClick={() => setViewPayment(null)} 
                className="absolute top-3 right-3 p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* المحتوى */}
            <div className="flex-1 overflow-y-auto p-6">
              {paymentDetail ? (
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
                    <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl p-4 border border-emerald-200">
                      <div className="flex items-center gap-2 text-emerald-700 mb-2">
                        <DollarSign size={16} />
                        <span className="text-xs font-medium uppercase">{t.amount}</span>
                      </div>
                      <p className="text-emerald-900 font-bold text-lg">
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
                      {/* حساب البنك/الصندوق */}
                      <div className="px-4 py-3 hover:bg-slate-50 transition-colors">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <p className="text-xs text-slate-500 mb-1">
                              {t.payments.cashBankAccountDebit ?? 'حساب البنك/الصندوق (مدين)'}
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
                              {t.payments.counterpartCredit ?? 'الحساب المقابل (دائن)'}
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
                    </div>
                  </div>

                  {/* معلومات إضافية */}
                  {(paymentDetail.reference || paymentDetail.notes || paymentDetail.costCenter || (paymentDetail as Payment & { attachment_url?: string }).attachment_url) && (
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

                      {/* المرفق */}
                      {(paymentDetail as Payment & { attachment_url?: string }).attachment_url && (
                        <div className="flex items-start gap-3">
                          <Download size={16} className="text-slate-400 mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-slate-500 mb-1">{t.payments.attachment}</p>
                            <button
                              type="button"
                              onClick={() => {
                                setAttachmentPreviewUrl((paymentDetail as Payment & { attachment_url?: string }).attachment_url as string)
                                setAttachmentPreviewOpen(true)
                              }}
                              className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors"
                            >
                              <Paperclip size={16} className="text-blue-500" />
                              <span>{t.viewAttachment}</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                </div>
              ) : null}
            </div>

            {/* Footer - أزرار الإجراءات */}
            <div className="border-t border-slate-200 bg-slate-50 px-6 py-4">
              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={() => setViewPayment(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  {t.close ?? 'إغلاق'}
                </button>
                
                <div className="flex items-center gap-2">
                  {/* إرسال عبر واتساب */}
                  <WhatsAppButton
                    phone={paymentDetail?.customer?.phone ?? null}
                    message={paymentDetail ? messageTemplateReceiptVoucher(
                      {
                        customerName: paymentDetail.customer?.name ?? paymentDetail.counterpartAccount?.name ?? '—',
                        amountReceived: fmt(paymentDetail.amount),
                        reference: paymentDetail.reference ?? undefined,
                        voucherNumber: paymentDetail.number,
                        lang: lang === 'ar' ? 'ar' : 'en',
                      },
                      (settings as Record<string, unknown>)?.whatsapp_receipt_message_ar as string | undefined,
                      (settings as Record<string, unknown>)?.whatsapp_receipt_message_en as string | undefined
                    ) : ''}
                    defaultCountryCode={(settings as Record<string, unknown>)?.whatsapp_default_country_code as string | undefined}
                    label={lang === 'ar' ? 'إرسال عبر واتساب' : 'Send via WhatsApp'}
                    className="text-sm py-2 px-4"
                    iconSize={16}
                  />
                  {/* زر القيد المحاسبي */}
                  {(paymentDetail as Payment & { journal_entry_id?: number } | undefined)?.journal_entry_id && (
                    <button
                      onClick={() => {
                        const jid = (paymentDetail as Payment & { journal_entry_id: number }).journal_entry_id
                        navigate(`/journal-entries/create?id=${jid}`)
                        setViewPayment(null)
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                    >
                      <BookCheck size={16} />
                      {t.journal.viewEntry ?? 'القيد المحاسبي'}
                    </button>
                  )}
                  
                  {/* زر الطباعة */}
                  <button
                    onClick={() => {
                      handlePrint(viewPayment)
                      setViewPayment(null)
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
                  >
                    <Printer size={16} />
                    {t.payments.print ?? 'طباعة'}
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* معاينة المرفق (بدون تحميل مباشر) */}
      {attachmentPreviewOpen && attachmentPreviewUrl && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4 no-print"
          onMouseDown={() => setAttachmentPreviewOpen(false)}
        >
          <div
            className="relative w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50">
              <div className="font-semibold text-slate-900">{lang === 'ar' ? 'معاينة المرفق' : 'Attachment Preview'}</div>
              <button
                type="button"
                onClick={() => setAttachmentPreviewOpen(false)}
                className="rounded-lg px-2 py-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                aria-label={lang === 'ar' ? 'إغلاق' : 'Close'}
                title={lang === 'ar' ? 'إغلاق' : 'Close'}
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-4 bg-white max-h-[calc(90vh-56px)] overflow-auto">
              {attachmentPreviewUrl && /\.pdf(\?|#|$)/i.test(attachmentPreviewUrl) ? (
                <iframe
                  src={attachmentPreviewUrl}
                  title="attachment-preview"
                  className="w-full h-[70vh] rounded-lg border border-slate-200"
                />
              ) : (
                <img
                  src={attachmentPreviewUrl}
                  alt="attachment"
                  className="max-w-full mx-auto rounded-lg border border-slate-200"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* تأكيد الحذف */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setDeleteTarget(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">{t.msg.confirmDeleteTitle}</h3>
            <p className="text-slate-600 text-sm mb-4">{t.payments.confirmDeleteVoucher}</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm border border-slate-300 rounded-lg">{t.cancel}</button>
              <button onClick={() => deleteMut.mutate(deleteTarget.id)} disabled={deleteMut.isPending} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg disabled:opacity-50">{deleteMut.isPending ? t.deleting : t.delete}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
