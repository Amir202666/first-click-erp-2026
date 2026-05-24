import { useParams, Link, useNavigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchQuotation, convertQuotationToInvoice, fetchSettings } from '../../api/tenant'
import type { Quotation } from '../../types'
import { formatAmount } from '../../utils/currency'
import { formatDisplayDate } from '../../utils/date'
import { ArrowRight, FileText, Copy, Printer } from 'lucide-react'

export default function QuotationViewPage() {
  const { id } = useParams<{ id: string }>()
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const textAlign = isRtl ? 'text-right' : 'text-left'

  const { data: settings } = useQuery({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const qtyDecimals = Number(settings?.doc_quantity_decimals ?? 2)
  const fmtQty = (n: number) => Number(n).toLocaleString(locale, { minimumFractionDigits: qtyDecimals, maximumFractionDigits: qtyDecimals })
  const fmt = (n: number) => formatAmount(n, { decimal_places: Number(settings?.doc_amount_decimals ?? 2) }, locale)
  const fmtMoney = (n: number | null | undefined) => fmt(Number(n ?? 0))

  const { data: quotation, isLoading, error } = useQuery<Quotation>({
    queryKey: ['quotation', tenantId, id],
    queryFn: () => fetchQuotation(tenantId, Number(id)),
    enabled: !!tenantId && !!id,
  })

  // Auto print after navigating from "Save & Print"
  useEffect(() => {
    const shouldPrint = !!(location.state as { autoPrint?: boolean } | null)?.autoPrint
    if (!shouldPrint) return
    if (isLoading || !quotation) return
    const tmr = window.setTimeout(() => window.print(), 250)
    return () => window.clearTimeout(tmr)
  }, [location.state, isLoading, quotation])

  const convertMut = useMutation({
    mutationFn: (target: 'sales' | 'purchase') => convertQuotationToInvoice(tenantId, Number(id), target),
    onSuccess: (res, target) => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] })
      queryClient.invalidateQueries({ queryKey: ['quotation', tenantId, id] })
      navigate(`/invoices/create?type=${target}`, { state: { fromQuotation: res.invoice_payload } })
    },
  })

  if (isLoading || !quotation) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-600 border-t-transparent" />
      </div>
    )
  }
  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-600">{(error as Error)?.message ?? 'حدث خطأ'}</p>
        <Link to="/invoices/quotations" className="text-primary-600 mt-2 inline-block">{t.back}</Link>
      </div>
    )
  }

  const statusLabel = quotation.status === 'draft' ? 'مسودة' : quotation.status === 'approved' ? 'معتمد' : 'تم التحويل'
  const canConvert = quotation.status !== 'converted'

  return (
    <div className="px-0 py-3 space-y-3 w-full min-w-0 max-w-full">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-1.5">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/invoices/quotations" className="text-slate-600 hover:text-slate-900 flex items-center gap-1 shrink-0">
            <ArrowRight size={20} className={isRtl ? 'rotate-180' : ''} />
            {t.back}
          </Link>
          <h1 className="text-base font-semibold text-slate-900 truncate leading-tight min-w-0">
            {t.nav?.quotations ?? 'عروض الأسعار'} — {quotation.number}
          </h1>
          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
              quotation.status === 'converted'
                ? 'bg-slate-200 text-slate-700'
                : quotation.status === 'approved'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-amber-100 text-amber-700'
            }`}
          >
            {statusLabel}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 no-print">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-8 px-3 items-center gap-2 rounded-lg bg-[#F0F2F5] border border-[#D9DCE0] text-[#344054] hover:bg-[#E4E7EB] text-sm font-medium"
            title={t.accounts?.print ?? 'طباعة'}
          >
            <Printer size={15} />
            {t.accounts?.print ?? 'طباعة'}
          </button>
          <Link
            to="/invoices/quotations/create"
            state={{ copyFromQuotationId: quotation.id }}
            className="inline-flex h-8 px-3 items-center gap-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium"
          >
            <Copy size={16} />
            {lang === 'ar' ? 'تكرار' : 'Copy'}
          </Link>
        </div>

        {canConvert && (
          <button
            type="button"
            onClick={() => convertMut.mutate(quotation.customer_id ? 'sales' : 'purchase')}
            disabled={convertMut.isPending}
            className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            <FileText size={18} />
            {convertMut.isPending ? 'جاري التحويل...' : (t.invoices?.convertToInvoice ?? 'تحويل إلى فاتورة')}
          </button>
        )}
        {quotation.convertedInvoice && (
          <Link
            to={`/invoices/view/${quotation.convertedInvoice.id}`}
            className="flex items-center gap-2 text-primary-600 hover:text-primary-500 text-sm font-medium"
          >
            <FileText size={16} />
            {t.invoices?.viewPrint ?? 'عرض الفاتورة'}
          </Link>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 text-sm">
          <div>
            <span className="text-slate-500">{t.date}</span>
            <p className="font-medium">{formatDisplayDate(quotation.date)}</p>
          </div>
          <div>
            <span className="text-slate-500">{lang === 'ar' ? 'صالح حتى' : 'Valid until'}</span>
            <p className="font-medium">{quotation.valid_until ? formatDisplayDate(quotation.valid_until) : '—'}</p>
          </div>
          <div className="col-span-2 md:col-span-1">
            <span className="text-slate-500">{quotation.type === 'sales' ? (t.invoices?.customer ?? 'العميل') : (t.invoices?.vendor ?? 'المورد')}</span>
            <p className="font-medium truncate">{quotation.type === 'sales' ? (quotation.customer?.name ?? '—') : (quotation.vendor?.name ?? '—')}</p>
          </div>
          <div>
            <span className="text-slate-500">{t.invoices?.branch ?? 'الفرع'}</span>
            <p className="font-medium">{quotation.branch?.name ?? '—'}</p>
          </div>
          <div>
            <span className="text-slate-500">{t.invoices?.costCenter ?? 'مركز التكلفة'}</span>
            <p className="font-medium">{quotation.costCenter?.name ?? '—'}</p>
          </div>
          <div>
            <span className="text-slate-500">{t.invoices?.referenceNumber ?? 'المرجع'}</span>
            <p className="font-medium">{quotation.reference_number ?? '—'}</p>
          </div>
          <div>
            <span className="text-slate-500">{lang === 'ar' ? 'المستخدم' : 'User'}</span>
            <p className="font-medium">{quotation.createdBy?.name ?? '—'}</p>
          </div>
        </div>

        <table className="w-full text-sm min-w-[860px]">
          <thead>
            <tr className="bg-slate-50 text-slate-600">
              <th className={`${textAlign} px-4 py-2 font-medium`}>{t.invoices?.item ?? 'الصنف'}</th>
              <th className={`${textAlign} px-4 py-2 font-medium w-36`}>{t.invoices?.unit ?? 'الوحدة'}</th>
              <th className={`${textAlign} px-4 py-2 font-medium w-28`}>{t.invoices?.quantity ?? 'الكمية'}</th>
              <th className={`${textAlign} px-4 py-2 font-medium w-32`}>{t.invoices?.unitPrice ?? 'س.الوحدة'}</th>
              <th className={`${textAlign} px-4 py-2 font-medium w-24`}>% {t.invoices?.discount ?? 'خصم'}</th>
              <th className={`${textAlign} px-4 py-2 font-medium w-24`}>% {t.invoices?.tax ?? 'ضريبة'}</th>
              <th className={`${textAlign} px-4 py-2 font-medium w-32`}>{lang === 'ar' ? 'إجمالي السطر' : 'Line total'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {quotation.lines?.map((line, idx) => (
              <tr key={line.id ?? idx}>
                <td className="px-4 py-2 text-slate-900">
                  <div className="font-medium">{line.item?.name ?? line.description ?? '—'}</div>
                  {line.item?.code ? <div className="text-xs text-slate-500">{line.item.code}</div> : null}
                </td>
                <td className="px-4 py-2 text-slate-700">{line.unit?.name ?? line.item?.item_unit?.name ?? line.item?.unit ?? '—'}</td>
                <td className="px-4 py-2 text-slate-700 tabular-nums">{fmtQty(line.quantity)}</td>
                <td className="px-4 py-2 text-slate-700 tabular-nums">{fmtMoney(line.unit_price)}</td>
                <td className="px-4 py-2 text-slate-700 tabular-nums">{Number(line.discount_percent ?? 0).toLocaleString(locale)}</td>
                <td className="px-4 py-2 text-slate-700 tabular-nums">{Number(line.tax_percent ?? 0).toLocaleString(locale)}</td>
                <td className="px-4 py-2 font-semibold tabular-nums">{fmtMoney(line.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="p-4 border-t border-slate-200 bg-slate-50/40">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className={`${textAlign}`}>
              <div className="text-slate-500">{lang === 'ar' ? 'الإجمالي قبل الضريبة' : 'Subtotal'}</div>
              <div className="font-bold text-slate-900 tabular-nums">{fmtMoney(quotation.subtotal)}</div>
            </div>
            <div className={`${textAlign}`}>
              <div className="text-slate-500">{lang === 'ar' ? 'الخصم' : 'Discount'}</div>
              <div className="font-bold text-slate-900 tabular-nums">{fmtMoney(quotation.discount_amount)}</div>
            </div>
            <div className={`${textAlign}`}>
              <div className="text-slate-500">{lang === 'ar' ? 'الضريبة' : 'Tax'}</div>
              <div className="font-bold text-slate-900 tabular-nums">{fmtMoney(quotation.tax_amount)}</div>
            </div>
            <div className={`${textAlign}`}>
              <div className="text-slate-500">{t.total}</div>
              <div className="font-extrabold text-slate-900 tabular-nums">{fmtMoney(quotation.total)}</div>
            </div>
          </div>
        </div>
      </div>
      {quotation.notes && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-sm text-slate-500 mb-1">{t.notes}</p>
          <p className="text-sm text-slate-800">{quotation.notes}</p>
        </div>
      )}
    </div>
  )
}
