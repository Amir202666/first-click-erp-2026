import { useState, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchInvoice, fetchSettings, createInvoice } from '../../api/tenant'
import type { Invoice, InvoiceLine, TenantSettings } from '../../types'
import { ArrowRight, RotateCcw, FileText, Loader2 } from 'lucide-react'
import { formatDisplayDate } from '../../utils/date'
import { formatAmount } from '../../utils/currency'
import { invoiceLineDiscountAmountFromApi } from '../../utils/invoiceLineAmounts'
import { toLocalDateString } from '../../utils/date'
import Toast, { type ToastType } from '../../components/ui/Toast'

type LineWithReturn = InvoiceLine & { return_qty: number }

export default function InvoiceReturnPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { currentTenant } = useAuth()
  const { t, lang, isRtl, getDisplayName } = useLanguage()
  const queryClient = useQueryClient()
  const tenantId = currentTenant?.id ?? 0

  const [returnQuantities, setReturnQuantities] = useState<Record<string, string>>({})
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)

  const { data: settings } = useQuery<TenantSettings>({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const fmt = (n: number) => formatAmount(n, { decimal_places: settings?.doc_amount_decimals ?? 2 }, locale)
  const textAlign = isRtl ? 'text-right' : 'text-left'

  const { data: invoice, isLoading, error } = useQuery<Invoice>({
    queryKey: ['invoice', tenantId, id],
    queryFn: () => fetchInvoice(tenantId, Number(id)),
    enabled: !!tenantId && !!id,
  })

  const createReturnMut = useMutation({
    mutationFn: (payload: Record<string, unknown>) => createInvoice(tenantId, payload),
    onSuccess: (data) => {
      const inv = 'invoice' in data && data.invoice ? data.invoice : (data as unknown as Invoice)
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setToast({ message: t.invoices?.returnSuccess ?? 'تم إنشاء فاتورة المرتجع بنجاح.', type: 'success' })
      setTimeout(() => navigate(`/invoices/view/${inv.id}`), 1500)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? (t.msg?.errorOccurred ?? 'حدث خطأ')
      setToast({ message: msg, type: 'error' })
    },
  })

  const listPath = invoice?.type === 'purchase' ? '/invoices/purchases' : '/invoices/sales'
  const returnsPath = invoice?.type === 'purchase' ? '/invoices/purchase-returns' : '/invoices/sales-returns'

  const linesWithReturn: LineWithReturn[] = useMemo(() => {
    if (!invoice?.lines?.length) return []
    return invoice.lines.map((line, idx) => {
      const key = `line-${idx}`
      const raw = returnQuantities[key] ?? ''
      const num = parseFloat(raw)
      const return_qty = Number.isNaN(num) || num < 0 ? 0 : Math.min(num, Number(line.quantity))
      return { ...line, return_qty }
    })
  }, [invoice?.lines, returnQuantities])

  const totalReturn = useMemo(() => {
    return linesWithReturn.reduce((sum, line) => {
      const orig = Number(line.quantity)
      if (orig <= 0 || line.return_qty <= 0) return sum
      const lineTotal = Number(line.total ?? 0)
      return sum + (line.return_qty / orig) * lineTotal
    }, 0)
  }, [linesWithReturn])

  const hasAnyReturn = linesWithReturn.some((l) => l.return_qty > 0)
  const invalidReturn = linesWithReturn.some((line, idx) => {
    const key = `line-${idx}`
    const raw = returnQuantities[key] ?? ''
    const num = parseFloat(raw)
    return raw !== '' && (Number.isNaN(num) || num < 0 || num > Number(line.quantity))
  })

  const setReturnQty = (lineKey: string, value: string) => {
    setReturnQuantities((prev) => ({ ...prev, [lineKey]: value }))
  }

  const handleCreateReturn = () => {
    if (!invoice || !hasAnyReturn || invalidReturn) return
    const lines = linesWithReturn
      .filter((l) => l.return_qty > 0)
      .map((l) => {
        const origQ = Number(l.quantity)
        const fullDisc = invoiceLineDiscountAmountFromApi(l)
        const discReturn = origQ > 0 ? (l.return_qty / origQ) * fullDisc : 0
        return {
          item_id: l.item_id,
          unit_id: l.unit_id ?? undefined,
          account_id: l.account_id ?? null,
          description: l.description || (l.item?.name ?? ''),
          quantity: l.return_qty,
          unit_price: Number(l.unit_price),
          discount_percent: 0,
          discount_amount: Math.round(Math.max(0, discReturn) * 1000) / 1000,
          tax_percent: Number(l.tax_percent) || 0,
        }
      })
    const today = toLocalDateString(new Date())
    const payload = {
      type: invoice.type,
      is_return: true,
      parent_invoice_id: invoice.id,
      date: today,
      due_date: today,
      customer_id: invoice.customer_id ?? null,
      vendor_id: invoice.vendor_id ?? null,
      branch_id: invoice.branch_id ?? null,
      warehouse_id: invoice.warehouse_id ?? null,
      cost_center_id: invoice.cost_center_id ?? null,
      payment_timing: invoice.payment_timing ?? 'deferred',
      discount_amount: 0,
      amount_paid: 0,
      lines,
    }
    createReturnMut.mutate(payload)
  }

  if (isLoading || !invoice) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-600 border-t-transparent" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 max-w-lg mx-auto text-center">
        <p className="text-red-600 font-medium">{t.msg?.errorOccurred ?? 'حدث خطأ'}</p>
        <Link to={listPath} className="inline-flex items-center gap-2 mt-4 text-primary-600 hover:text-primary-500">
          <ArrowRight size={18} className={isRtl ? 'rotate-180' : ''} />
          {t.back}
        </Link>
      </div>
    )
  }

  const cannotReturn = invoice.status === 'draft' || invoice.status === 'cancelled' || invoice.is_return
  if (cannotReturn) {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800 text-sm">
          {lang === 'ar'
            ? 'لا يمكن إنشاء مرتجع من هذه الفاتورة (مسودة أو ملغاة أو مرتجع).'
            : 'Cannot create a return from this invoice (draft, cancelled, or already a return).'}
        </div>
        <Link to={listPath} className="inline-flex items-center gap-2 mt-4 text-primary-600 hover:text-primary-500 text-sm font-medium">
          <ArrowRight size={18} className={isRtl ? 'rotate-180' : ''} />
          {t.back}
        </Link>
      </div>
    )
  }

  const partyName = invoice.type === 'sales' ? getDisplayName(invoice.customer) : getDisplayName(invoice.vendor)
  const typeLabel = invoice.type === 'sales' ? t.invoices.sales : t.invoices.purchase

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto" dir={isRtl ? 'rtl' : 'ltr'}>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <Link
        to={listPath}
        className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-4 text-sm font-medium"
      >
        <ArrowRight size={18} className={isRtl ? 'rotate-180' : ''} />
        {t.back}
      </Link>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* ترويسة مدمجة: رقم الفاتورة والعميل */}
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/80 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <FileText size={20} className="text-primary-600 shrink-0" />
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                {t.invoices.returnSourceInvoice ?? 'الفاتورة الأصلية'}
              </span>
            </div>
            <span className="font-mono font-bold text-primary-600 text-lg">#{invoice.number}</span>
            <span className="text-slate-400">|</span>
            <span className="text-slate-700 font-medium">
              {invoice.type === 'sales' ? (lang === 'ar' ? 'العميل' : 'Customer') : lang === 'ar' ? 'المورد' : 'Vendor'}: {partyName ?? '—'}
            </span>
          </div>
          <div className="text-sm text-slate-500">
            {formatDisplayDate(invoice.date)} · {typeLabel}
          </div>
        </div>

        {/* جدول البنود مع عمود الكمية المرتجعة */}
        <div className="p-4">
          <h2 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <RotateCcw size={16} />
            {t.invoices.returnInvoiceSubtitle}
          </h2>
          <p className="text-xs text-slate-500 mb-3">{t.invoices.returnQuantityHint}</p>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className={`${textAlign}`}>
                  <th className="px-3 py-2 font-semibold text-slate-700 w-8">#</th>
                  <th className="px-3 py-2 font-semibold text-slate-700 min-w-[140px]">{lang === 'ar' ? 'الصنف' : 'Item'}</th>
                  <th className="px-3 py-2 font-semibold text-slate-700 w-20">{lang === 'ar' ? 'الوحدة' : 'Unit'}</th>
                  <th className="px-3 py-2 font-semibold text-slate-700 w-24 text-end">{lang === 'ar' ? 'الكمية الأصلية' : 'Original qty'}</th>
                  <th className="px-3 py-2 font-semibold text-slate-700 w-24 text-end">{lang === 'ar' ? 'سعر الوحدة' : 'Unit price'}</th>
                  <th className="px-3 py-2 font-semibold text-slate-700 w-32">{t.invoices.returnQuantityColumn}</th>
                  <th className="px-3 py-2 font-semibold text-slate-700 w-28 text-end">{t.total}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {linesWithReturn.map((line, idx) => {
                  const lineKey = `line-${idx}`
                  const raw = returnQuantities[lineKey] ?? ''
                  const origQty = Number(line.quantity)
                  const lineTotal =
                    origQty > 0 && line.return_qty > 0 ? (line.return_qty / origQty) * Number(line.total ?? 0) : 0
                  const isInvalid = raw !== '' && (parseFloat(raw) > origQty || parseFloat(raw) < 0)
                  const itemName = line.item?.name ?? line.description ?? '—'
                  const unitName = line.unit?.name ?? (line.item?.item_unit?.name ?? '—')
                  return (
                    <tr key={lineKey} className="hover:bg-slate-50/50">
                      <td className="px-3 py-2 text-slate-500">{idx + 1}</td>
                      <td className="px-3 py-2 font-medium text-slate-800">{itemName}</td>
                      <td className="px-3 py-2 text-slate-600">{unitName}</td>
                      <td className="px-3 py-2 text-end tabular-nums text-slate-700">{origQty}</td>
                      <td className="px-3 py-2 text-end tabular-nums text-slate-700">{fmt(Number(line.unit_price ?? 0))}</td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          max={origQty}
                          step="0.0001"
                          value={raw}
                          onChange={(e) => setReturnQty(lineKey, e.target.value)}
                          className={`w-full max-w-[120px] border rounded-lg px-2 py-1.5 text-sm text-end tabular-nums focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none ${
                            isInvalid ? 'border-red-400 bg-red-50' : 'border-slate-300'
                          }`}
                          placeholder="0"
                        />
                        {isInvalid && (
                          <p className="text-[10px] text-red-600 mt-0.5">
                            {lang === 'ar' ? `الحد الأقصى ${origQty}` : `Max ${origQty}`}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-end tabular-nums font-medium text-slate-800">{line.return_qty > 0 ? fmt(lineTotal) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {hasAnyReturn && (
            <div className="mt-4 space-y-1">
              <div className={`flex justify-end ${isRtl ? 'flex-row-reverse' : ''}`}>
                <div className="rounded-lg bg-primary-50 border border-primary-200 px-4 py-2">
                  <span className="text-xs font-medium text-primary-700">{t.invoices.returnTotal}: </span>
                  <span className="font-bold text-primary-800 tabular-nums">{fmt(totalReturn)}</span>
                  <span className="text-xs text-primary-600 ml-1">({lang === 'ar' ? 'قبل الضريبة' : 'before tax'})</span>
                </div>
              </div>
              <p className="text-xs text-slate-500 text-center">{t.invoices.returnTaxHint}</p>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to={listPath}
              className="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-300 rounded-xl text-slate-700 hover:bg-slate-50 font-medium"
            >
              <ArrowRight size={18} className={isRtl ? 'rotate-180' : ''} />
              {t.cancel}
            </Link>
            <button
              type="button"
              onClick={handleCreateReturn}
              disabled={createReturnMut.isPending || !hasAnyReturn || invalidReturn}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-500 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createReturnMut.isPending ? <Loader2 size={18} className="animate-spin" /> : <RotateCcw size={18} />}
              {t.invoices.createReturn}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
