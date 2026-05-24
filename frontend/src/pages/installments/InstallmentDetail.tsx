import { Fragment, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchInstallment } from '../../api/tenant'
import type { Installment, InstallmentLine } from '../../types'
import { formatDisplayDate, toLocalDateString } from '../../utils/date'
import { formatAmount } from '../../utils/currency'
import { Printer, Pencil } from 'lucide-react'

function ymdOnly(raw: string | undefined | null): string {
  if (!raw) return ''
  const m = String(raw).match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : ''
}

function lineRemaining(line: InstallmentLine): number {
  const amt = Number(line.amount) || 0
  const paid = Number(line.paid_amount) || 0
  return Math.max(0, amt - paid)
}

function normalizeNoteText(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/** يخفي ملاحظة مكررة تلقائياً مثل «من فاتورة Sal-0003» عندما يكون مصدر الفاتورة معروضاً أصلاً في رأس الصفحة */
function isRedundantInvoiceSourceNote(
  note: string | null | undefined,
  invoiceId: number | null | undefined,
  invoiceNumber: string | null | undefined,
): boolean {
  const raw = normalizeNoteText(note ?? '')
  if (!raw) return false
  const num = (invoiceNumber ?? '').trim()
  const expected =
    num ||
    (invoiceId != null && Number.isFinite(Number(invoiceId)) ? `#${invoiceId}` : '')
  if (!expected) return false

  const arFrom = new RegExp(`^من\\s*فاتورة\\s*:?\\s*${escapeRegExp(expected)}\\s*$`, 'i')
  const arNo = new RegExp(`^رقم\\s*الفاتورة\\s*:?\\s*${escapeRegExp(expected)}\\s*$`, 'i')
  const en = new RegExp(`^from\\s*invoice\\s*:?\\s*${escapeRegExp(expected)}\\s*$`, 'i')
  const enNo = new RegExp(`^invoice\\s*(number|no\\.?)\\s*:?\\s*${escapeRegExp(expected)}\\s*$`, 'i')
  return arFrom.test(raw) || arNo.test(raw) || en.test(raw) || enNo.test(raw)
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export default function InstallmentDetail() {
  const { id } = useParams<{ id: string }>()
  const installmentId = id && /^\d+$/.test(id) ? parseInt(id, 10) : 0
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const navigate = useNavigate()
  const tenantId = currentTenant?.id ?? 0
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const fmt = (n: number) => formatAmount(n, { decimal_places: 3 }, locale)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['installment', tenantId, installmentId],
    queryFn: () => fetchInstallment(tenantId, installmentId),
    enabled: !!tenantId && installmentId > 0,
  })

  const inst = data as Installment | undefined

  const lines = useMemo(() => {
    const raw = inst?.lines
    if (!Array.isArray(raw)) return []
    return [...raw].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
  }, [inst?.lines])

  const totals = useMemo(() => {
    if (!inst) return { total: 0, paid: 0, remaining: 0 }
    const total = Number(inst.total_amount) || 0
    const paid =
      inst.total_paid != null
        ? Number(inst.total_paid)
        : lines.reduce((s, l) => s + (Number(l.paid_amount) || 0), 0)
    const remaining = inst.total_remaining != null ? Number(inst.total_remaining) : Math.max(0, total - paid)
    return { total, paid, remaining }
  }, [inst, lines])

  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'pending' | 'late'>('all')

  const scheduleUi = useMemo(() => {
    const today = toLocalDateString(new Date())
    const totalFromLines = lines.reduce((s, i) => s + (Number(i.amount) || 0), 0)
    const instTotal = Number(inst?.total_amount) || 0
    const totalAmount = totalFromLines > 0.0005 ? totalFromLines : instTotal
    const paidFromLines = lines.reduce((s, i) => s + (Number(i.paid_amount) ?? 0), 0)
    const paidAmount =
      lines.length > 0
        ? paidFromLines
        : inst?.total_paid != null
          ? Number(inst.total_paid)
          : totals.paid
    const remainingAmount =
      lines.length > 0
        ? Math.max(0, totalAmount - paidAmount)
        : inst?.total_remaining != null
          ? Number(inst.total_remaining)
          : Math.max(0, totalAmount - paidAmount)
    const paidCount = lines.filter((l) => lineRemaining(l) <= 0.0005).length
    const lateCount = lines.filter((l) => {
      if (lineRemaining(l) <= 0.0005) return false
      const d = ymdOnly(l.due_date)
      return !!d && d < today
    }).length
    const pendingCount = lines.filter((l) => {
      if (lineRemaining(l) <= 0.0005) return false
      const d = ymdOnly(l.due_date)
      return !d || d >= today
    }).length
    const nextLine = lines.find((l) => lineRemaining(l) > 0.0005)
    const dueY = nextLine ? ymdOnly(nextLine.due_date) : ''
    const daysUntilNext =
      dueY !== ''
        ? Math.ceil((new Date(`${dueY}T12:00:00`).getTime() - Date.now()) / 86400000)
        : null
    const firstUnpaidIdx = lines.findIndex((l) => lineRemaining(l) > 0.0005)
    const firstDue = lines[0]?.due_date ?? inst?.start_date ?? ''
    const lastDue = lines.length > 0 ? lines[lines.length - 1]!.due_date : ''
    return {
      totalAmount,
      paidAmount,
      remainingAmount,
      paidCount,
      lateCount,
      pendingCount,
      nextLine,
      daysUntilNext,
      firstUnpaidIdx,
      firstDue,
      lastDue,
      today,
    }
  }, [inst, lines, totals.paid])

  const filteredLines = useMemo(() => {
    const today = toLocalDateString(new Date())
    if (statusFilter === 'all') return lines
    if (statusFilter === 'paid') return lines.filter((l) => lineRemaining(l) <= 0.0005)
    if (statusFilter === 'late')
      return lines.filter((l) => {
        if (lineRemaining(l) <= 0.0005) return false
        const d = ymdOnly(l.due_date)
        return !!d && d < today
      })
    return lines.filter((l) => {
      if (lineRemaining(l) <= 0.0005) return false
      const d = ymdOnly(l.due_date)
      return !d || d >= today
    })
  }, [lines, statusFilter])

  const isVendor = !!(inst?.vendor_id && !inst?.customer_id)
  const partyName = isVendor ? inst?.vendor?.name ?? '—' : inst?.customer?.name ?? '—'

  const scheduleJe = inst?.journal_entry ?? inst?.journalEntry

  const statusLabel =
    inst?.status === 'approved' ? (t.installments?.approved ?? 'معتمد') : (t.installments?.draft ?? 'مسودة')

  const handlePrint = () => window.print()

  const collectPath = (line: InstallmentLine) => {
    if (!inst?.id || !line.id) return '#'
    const vt = isVendor ? 'payment' : 'receipt'
    return `/payments/create-voucher?voucher_type=${vt}&installment_id=${inst.id}&installment_line_id=${line.id}`
  }

  const paymentJournal = (line: InstallmentLine) => {
    const p = line.payment as
      | (typeof line.payment & {
          journal_entry?: { id: number; number?: string }
          journalEntry?: { id: number; number?: string }
        })
      | null
      | undefined
    return p?.journal_entry ?? p?.journalEntry
  }

  if (!tenantId || installmentId <= 0) {
    return (
      <div className="p-6 text-slate-600" dir={isRtl ? 'rtl' : 'ltr'}>
        {lang === 'ar' ? 'معرّف غير صالح' : 'Invalid id'}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="p-8 text-center text-slate-500" dir={isRtl ? 'rtl' : 'ltr'}>
        {t.loading}
      </div>
    )
  }

  if (isError || !inst) {
    return (
      <div className="p-6 text-red-600" dir={isRtl ? 'rtl' : 'ltr'}>
        {t.noData ?? (lang === 'ar' ? 'تعذر تحميل الجدول' : 'Could not load schedule')}
      </div>
    )
  }

  return (
    <div
      className="min-h-0 w-full max-w-full space-y-3 bg-slate-50/80 px-4 pb-4 pt-3 sm:px-5 sm:pb-5 sm:pt-3.5"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div className="hidden print:block print-only-header border-b border-slate-300 pb-3 text-center text-slate-900">
        <div className="text-lg font-bold">{currentTenant?.name ?? ''}</div>
        <div className="text-sm font-semibold">
          {t.installments?.printScheduleDocumentTitle ?? (lang === 'ar' ? 'جدول سداد الأقساط' : 'Installment payment schedule')}
        </div>
        <div className="mt-1 text-sm">
          {inst.number} — {partyName}
        </div>
      </div>

      <div
        className="no-print mb-4 flex flex-wrap items-center justify-between gap-3"
        dir="rtl"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600"
          >
            ← {t.back ?? 'رجوع'}
          </button>
          <div className="min-w-0">
            <h1 className="text-lg font-medium text-gray-900">
              {t.installments?.detailTitle ?? 'تفاصيل جدول الأقساط'}
            </h1>
            <p className="mt-0.5 text-xs text-gray-400">
              {inst.number}
              {inst.invoice_id
                ? ` · فاتورة ${inst.invoice?.number?.trim() || `#${inst.invoice_id}`}`
                : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            🖨 {t.installments?.printPaymentSchedule ?? 'طباعة جدول السداد'}
          </button>
          {scheduleUi.nextLine && inst.status === 'approved' && (
            <Link
              to={collectPath(scheduleUi.nextLine)}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700"
            >
              💰 تحصيل دفعة
            </Link>
          )}
          {inst.status === 'draft' && (
            <Link
              to={`/installments/${inst.id}/edit`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-2.5 py-1 text-sm text-white hover:bg-primary-500"
            >
              <Pencil size={16} />
              {t.edit}
            </Link>
          )}
        </div>
      </div>

      <div
        className="no-print mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-gray-100 bg-white px-4 py-3"
        dir="rtl"
      >
        {(
          [
            { label: isVendor ? (t.installments?.vendorLabel ?? 'المورد') : (t.installments?.customer ?? 'العميل'), value: partyName },
            { label: t.nav?.branches ?? 'الفرع', value: inst.branch?.name ?? '—' },
            {
              label: t.invoices?.invoiceNumber ?? 'رقم الفاتورة',
              value: inst.invoice_id
                ? inst.invoice?.number?.trim() || `#${inst.invoice_id}`
                : '—',
              isLink: !!inst.invoice_id,
              href: inst.invoice_id ? `/invoices/view/${inst.invoice_id}` : undefined,
            },
            {
              label: 'تاريخ البدء',
              value: scheduleUi.firstDue ? formatDisplayDate(scheduleUi.firstDue) : formatDisplayDate(inst.start_date),
            },
            {
              label: 'آخر قسط',
              value: scheduleUi.lastDue ? formatDisplayDate(scheduleUi.lastDue) : '—',
            },
          ] as const
        ).map((item, idx) => (
          <Fragment key={item.label}>
            {idx > 0 && <div className="hidden h-7 w-px bg-gray-100 sm:block" />}
            <div className="min-w-0">
              <p className="text-[10px] text-gray-400">{item.label}</p>
              {'isLink' in item && item.isLink && item.href ? (
                <Link to={item.href} className="text-sm font-medium text-blue-600 hover:underline">
                  {item.value} ↗
                </Link>
              ) : (
                <p className="text-sm font-medium text-gray-900">{item.value}</p>
              )}
            </div>
          </Fragment>
        ))}
        <div className="mr-auto">
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              inst.status === 'approved' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
            }`}
          >
            {inst.status === 'approved' ? 'معتمد ✓' : statusLabel}
          </span>
        </div>
      </div>

      {scheduleJe?.id ? (
        <div className="no-print mb-3 text-xs" dir="rtl">
          <Link
            to={`/journal-entries/edit/${scheduleJe.id}`}
            className="font-medium text-blue-600 hover:underline"
          >
            {t.installments?.scheduleJournalLink ?? 'قيد اعتماد الجدول'} ({scheduleJe.number ?? scheduleJe.id}) ↗
          </Link>
        </div>
      ) : null}

      {(() => {
        const {
          totalAmount,
          paidAmount,
          remainingAmount,
          paidCount,
          lateCount,
          pendingCount,
          nextLine,
          daysUntilNext,
          firstUnpaidIdx,
        } = scheduleUi
        const kpis = [
          {
            label: 'الإجمالي',
            value: `${totalAmount.toFixed(3)} KWD`,
            sub:
              lines.length > 0
                ? `${lines.length} أقساط · ${(totalAmount / lines.length).toFixed(3)} KWD / قسط`
                : '—',
            color: 'text-gray-900',
            progress: null as null | { percent: number; color: string },
          },
          {
            label: 'المسدَّد',
            value: `${paidAmount.toFixed(3)} KWD`,
            sub: `${paidCount} قسط مدفوع (${totalAmount > 0 ? ((paidAmount / totalAmount) * 100).toFixed(0) : 0}%)`,
            color: 'text-green-600',
            progress: {
              percent: totalAmount > 0 ? (paidAmount / totalAmount) * 100 : 0,
              color: 'bg-green-500',
            },
          },
          {
            label: 'المتبقي',
            value: `${remainingAmount.toFixed(3)} KWD`,
            sub: `${lines.length - paidCount} أقساط متبقية`,
            color: 'text-blue-600',
            progress: {
              percent: totalAmount > 0 ? (remainingAmount / totalAmount) * 100 : 0,
              color: 'bg-blue-500',
            },
          },
          {
            label: 'القسط القادم',
            value: nextLine ? `${(Number(nextLine.amount) || 0).toFixed(3)} KWD` : '—',
            sub:
              daysUntilNext !== null
                ? daysUntilNext < 0
                  ? `متأخر ${Math.abs(daysUntilNext)} يوم`
                  : `بعد ${daysUntilNext} يوم`
                : 'مكتمل',
            color:
              daysUntilNext !== null && daysUntilNext < 0 ? 'text-red-600' : 'text-amber-600',
            progress: null as null | { percent: number; color: string },
          },
        ]
        return (
          <div className="no-print mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" dir="rtl">
            {kpis.map((kpi) => (
              <div key={kpi.label} className="rounded-xl border border-gray-100 bg-white p-3">
                <p className="mb-1.5 text-[11px] text-gray-400">{kpi.label}</p>
                <p className={`text-xl font-medium tabular-nums ${kpi.color}`}>{kpi.value}</p>
                <p className="mt-1 text-[10px] text-gray-400">{kpi.sub}</p>
                {kpi.progress ? (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full rounded-full ${kpi.progress.color}`}
                      style={{ width: `${Math.min(kpi.progress.percent, 100)}%` }}
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )
      })()}

      <div className="no-print mb-4 rounded-xl border border-gray-100 bg-white p-4" dir="rtl">
        <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-gray-400">مسار الأقساط</p>
        <div className="flex items-center gap-0 overflow-x-auto pb-2">
          {lines.map((instLine, idx) => {
            const isPaid = lineRemaining(instLine) <= 0.0005
            const segmentGreen = idx > 0 && lineRemaining(lines[idx - 1]!) <= 0.0005
            const isNext =
              !isPaid && lines.slice(0, idx).every((l) => lineRemaining(l) <= 0.0005)
            const due = ymdOnly(instLine.due_date)
            const isLate = !isPaid && !!due && due < scheduleUi.today
            return (
              <Fragment key={instLine.id ?? instLine.sequence}>
                {idx > 0 && (
                  <div
                    className={`h-0.5 min-w-[16px] flex-1 ${segmentGreen ? 'bg-green-500' : 'bg-gray-200'}`}
                  />
                )}
                <div className="flex shrink-0 flex-col items-center">
                  <div
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-medium ${
                      isPaid
                        ? 'bg-green-600 text-white'
                        : isLate
                          ? 'bg-red-500 text-white'
                          : isNext
                            ? 'bg-blue-600 text-white ring-4 ring-blue-100'
                            : 'border border-gray-200 bg-gray-100 text-gray-400'
                    }`}
                  >
                    {isPaid ? '✓' : instLine.sequence}
                  </div>
                  <p className="mt-1 text-center text-[9px] text-gray-400">
                    {due
                      ? new Date(`${due}T12:00:00`).toLocaleDateString('ar', { month: 'short' })
                      : '—'}
                  </p>
                  <p className="text-[9px] text-gray-300">{(Number(instLine.amount) || 0).toFixed(0)}</p>
                </div>
              </Fragment>
            )
          })}
        </div>
      </div>

      {inst.notes && !isRedundantInvoiceSourceNote(inst.notes, inst.invoice_id ?? null, inst.invoice?.number ?? null) ? (
        <p className="no-print mb-4 text-sm text-slate-600" dir="rtl">
          {inst.notes}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white" dir="rtl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
          <p className="text-sm font-medium text-gray-900">
            {t.installments?.linesTableTitle ?? 'جدول الأقساط'}
          </p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { key: 'all' as const, label: `الكل (${lines.length})`, warn: false },
                { key: 'paid' as const, label: `مدفوع (${scheduleUi.paidCount})`, warn: false },
                { key: 'pending' as const, label: `معلق (${scheduleUi.pendingCount})`, warn: false },
                { key: 'late' as const, label: `متأخر (${scheduleUi.lateCount})`, warn: scheduleUi.lateCount > 0 },
              ] as const
            ).map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setStatusFilter(f.key)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  statusFilter === f.key
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : f.warn
                      ? 'border-red-200 text-red-600 hover:bg-red-50'
                      : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm text-gray-800">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-right text-[10px] font-medium text-gray-400">
                  {t.installments?.lineStatusCol ?? 'الحالة'}
                </th>
                <th className="px-4 py-2 text-right text-[10px] font-medium text-gray-400">
                  {t.installments?.sequence ?? 'م'}
                </th>
                <th className="px-4 py-2 text-right text-[10px] font-medium text-gray-400">
                  {t.installments?.dueDate ?? 'تاريخ الاستحقاق'}
                </th>
                <th className="px-4 py-2 text-right text-[10px] font-medium text-gray-400">
                  {t.installments?.totalAmount ?? 'المبلغ الإجمالي'}
                </th>
                <th className="px-4 py-2 text-right text-[10px] font-medium text-gray-400">
                  {t.installments?.paidAmount ?? 'المسدَّد'}
                </th>
                <th className="px-4 py-2 text-right text-[10px] font-medium text-gray-400">
                  {t.installments?.remaining ?? 'المتبقي'}
                </th>
                <th className="px-4 py-2 text-right text-[10px] font-medium text-gray-400">
                  {t.installments?.lineJournalCol ?? 'قيد التحصيل'}
                </th>
                <th className="no-print w-24 px-4 py-2 text-right text-[10px] font-medium text-gray-400">
                  {t.actions}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredLines.map((line) => {
                const rem = lineRemaining(line)
                const paidAmt = Number(line.paid_amount) ?? 0
                const pj = paymentJournal(line)
                const canCollect = inst.status === 'approved' && rem > 0.0005 && line.id
                const lineIdx = lines.findIndex((l) => l.sequence === line.sequence)
                const isPaid = rem <= 0.0005
                const isNext =
                  !isPaid && lineIdx === scheduleUi.firstUnpaidIdx && scheduleUi.firstUnpaidIdx >= 0
                const dueY = ymdOnly(line.due_date)
                const isLate = !isPaid && !!dueY && dueY < scheduleUi.today
                const daysLate =
                  isLate && dueY
                    ? Math.ceil((Date.now() - new Date(`${dueY}T12:00:00`).getTime()) / 86400000)
                    : null
                const daysUntil =
                  isNext && dueY && !isLate
                    ? Math.ceil(
                        (new Date(`${dueY}T12:00:00`).getTime() - Date.now()) / 86400000,
                      )
                    : null

                return (
                  <tr
                    key={line.id ?? line.sequence}
                    className={`border-b border-gray-50 transition-colors hover:bg-gray-50 ${
                      isNext ? 'bg-blue-50/30' : ''
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap items-center gap-1">
                        {isPaid ? (
                          <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] text-green-700">
                            ✓ مدفوع
                          </span>
                        ) : null}
                        {!isPaid && isNext ? (
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] text-blue-700">
                            ⏰ القادم
                          </span>
                        ) : null}
                        {!isPaid && isLate ? (
                          <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] text-red-700">
                            ⚠ متأخر
                          </span>
                        ) : null}
                        {!isPaid && !isNext && !isLate ? (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">
                            ⏳ معلق
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-center text-xs text-gray-400">{line.sequence}</td>
                    <td className="px-4 py-2.5">
                      <div className={isLate ? 'text-red-600' : ''}>{formatDisplayDate(line.due_date)}</div>
                      {daysLate != null ? (
                        <div className="text-[10px] text-red-500">متأخر {daysLate} يوم</div>
                      ) : null}
                      {isNext && daysLate == null && daysUntil != null ? (
                        <div className="text-[10px] text-blue-500">بعد {daysUntil} يوم</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 font-medium tabular-nums">
                      {(Number(line.amount) || 0).toFixed(3)}
                    </td>
                    <td
                      className={`px-4 py-2.5 font-medium tabular-nums ${
                        paidAmt > 0 ? 'text-green-600' : 'text-gray-300'
                      }`}
                    >
                      {paidAmt.toFixed(3)}
                    </td>
                    <td
                      className={`px-4 py-2.5 font-medium tabular-nums ${
                        rem > 0 ? 'text-blue-600' : 'text-gray-300'
                      }`}
                    >
                      {rem.toFixed(3)}
                    </td>
                    <td className="px-4 py-2.5">
                      {pj?.id ? (
                        <Link
                          to={`/journal-entries/edit/${pj.id}`}
                          className="no-print text-xs text-blue-600 hover:underline"
                        >
                          {pj.number ?? `#${pj.id}`} ↗
                        </Link>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="no-print px-4 py-2.5">
                      {isPaid ? (
                        <span className="text-xs text-green-600">تم ✓</span>
                      ) : canCollect ? (
                        <Link
                          to={collectPath(line)}
                          className="inline-flex whitespace-nowrap rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                        >
                          {t.installments?.collect ?? 'تحصيل'}
                        </Link>
                      ) : inst.status !== 'approved' && rem > 0 ? (
                        <span
                          className="text-xs text-gray-400"
                          title={
                            t.installments?.collectRequiresApproval ??
                            (lang === 'ar' ? 'اعتمد الجدول أولاً لتفعيل التحصيل' : 'Approve the schedule first')
                          }
                        >
                          —
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
              <tr className="border-t border-gray-200 bg-gray-50 font-medium">
                <td colSpan={3} className="px-4 py-2.5 text-xs text-gray-500">
                  الإجمالي
                </td>
                <td className="px-4 py-2.5 tabular-nums">{scheduleUi.totalAmount.toFixed(3)}</td>
                <td className="px-4 py-2.5 text-green-600 tabular-nums">
                  {scheduleUi.paidAmount.toFixed(3)}
                </td>
                <td className="px-4 py-2.5 text-blue-600 tabular-nums">
                  {scheduleUi.remainingAmount.toFixed(3)}
                </td>
                <td colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
