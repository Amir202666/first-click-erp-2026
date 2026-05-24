import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../../contexts/LanguageContext'
import { deleteInventoryAdjustment, fetchInventoryAdjustment, fetchSettings } from '../../api/tenant'
import type { InventoryAdjustment } from '../../types'
import { formatDisplayDate } from '../../utils/date'
import { coerceDecimalPlaces, formatAmount } from '../../utils/currency'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { Printer, Pencil, Trash2, X, Paperclip, FileText, Loader2, Plus, Minus } from 'lucide-react'

interface Props {
  tenantId: number
  adjustmentId: number
  onClose: () => void
}

export default function InventoryAdjustmentPreviewModal({ tenantId, adjustmentId, onClose }: Props) {
  const { t, lang, isRtl } = useLanguage()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const textAlign = isRtl ? 'text-right' : 'text-left'
  const numAlign = 'text-right'

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const { data: settings } = useQuery({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: tenantId > 0,
  })
  const amountDecimals = coerceDecimalPlaces(settings?.doc_amount_decimals, 2)
  const qtyDecimals = coerceDecimalPlaces(settings?.doc_quantity_decimals, 2)
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const fmtMoney = (n: number) => formatAmount(n, { decimal_places: amountDecimals }, locale)
  const fmtQty = (n: number) =>
    Number(n).toLocaleString(locale, { minimumFractionDigits: qtyDecimals, maximumFractionDigits: qtyDecimals })

  const adjQ = useQuery<InventoryAdjustment>({
    queryKey: ['inventory-adjustment', tenantId, adjustmentId],
    queryFn: () => fetchInventoryAdjustment(tenantId, adjustmentId),
    enabled: tenantId > 0 && adjustmentId > 0,
  })

  const total = useMemo(() => {
    const lines = adjQ.data?.lines ?? []
    const headerAction = adjQ.data?.adjustment_type === 'in' ? 'add' : 'subtract'
    return lines.reduce((s, l) => {
      const action = l.action ?? headerAction
      const sign = action === 'subtract' ? -1 : 1
      return s + sign * Math.abs(Number(l.total_cost || 0))
    }, 0)
  }, [adjQ.data])

  const delMut = useMutation({
    mutationFn: () => deleteInventoryAdjustment(tenantId, adjustmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-adjustments', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['inventory-movements', tenantId] })
      onClose()
    },
    onError: (e: unknown) => {
      const ax = e as { response?: { data?: { message?: string } } }
      setActionError(ax?.response?.data?.message ?? (lang === 'ar' ? 'تعذر حذف التسوية' : 'Could not delete adjustment'))
    },
  })

  function handlePrint() {
    setActionError(null)
    const url = `/inventory/adjustments/view/${adjustmentId}`
    const w = window.open(url, '_blank', 'noopener,noreferrer')
    if (w) {
      w.onload = () => {
        try {
          w.focus()
          w.print()
        } catch {
          /* ignore */
        }
      }
    }
  }

  const adj = adjQ.data
  const title = useMemo(() => {
    if (!adj) return ''
    const actions = (adj.lines ?? []).map((l) => l.action ?? (adj.adjustment_type === 'in' ? 'add' : 'subtract'))
    const hasAdd = actions.includes('add')
    const hasSubtract = actions.includes('subtract')
    if (hasAdd && hasSubtract) {
      return lang === 'ar' ? 'تسوية جردية (إضافة/خصم)' : 'Inventory adjustment (Add/Subtract)'
    }
    return adj.adjustment_type === 'out'
      ? lang === 'ar'
        ? 'تسوية جردية (نقص)'
        : 'Inventory adjustment (Out)'
      : lang === 'ar'
        ? 'تسوية جردية (زيادة)'
        : 'Inventory adjustment (In)'
  }, [adj, lang])

  return (
    <>
      <div className="no-print fixed inset-0 z-[140] flex items-center justify-center p-2 sm:p-4" role="dialog" aria-modal="true">
        <button type="button" className="absolute inset-0 z-0 bg-slate-900/55 cursor-default" aria-label={lang === 'ar' ? 'إغلاق' : 'Close'} onClick={onClose} />
        <div className={`relative z-[141] flex flex-col w-full max-w-4xl max-h-[92vh] rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden ${isRtl ? 'rtl' : 'ltr'}`}>
          <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-3 py-2 flex flex-wrap items-center gap-2 justify-between">
            <div className={`flex flex-wrap items-center gap-2 ${isRtl ? 'flex-row-reverse' : ''}`}>
              <button type="button" onClick={handlePrint} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100">
                <Printer size={14} />
                {t.accounts?.print ?? (lang === 'ar' ? 'طباعة' : 'Print')}
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose()
                  navigate(`/inventory/adjustments/edit/${adjustmentId}`)
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-medium text-primary-900 hover:bg-primary-100"
              >
                <Pencil size={14} />
                {t.edit}
              </button>
              <button
                type="button"
                onClick={() => {
                  setActionError(null)
                  setDeleteOpen(true)
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-900 hover:bg-red-100"
              >
                <Trash2 size={14} />
                {t.delete}
              </button>
            </div>
            <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-200" aria-label={lang === 'ar' ? 'إغلاق' : 'Close'}>
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            </div>

            {adjQ.isLoading && (
              <div className="flex items-center justify-center gap-2 py-10 text-slate-500">
                <Loader2 className="animate-spin" size={22} />
                <span className="text-sm">{lang === 'ar' ? 'جاري التحميل…' : 'Loading…'}</span>
              </div>
            )}

            {adjQ.error && !adjQ.isLoading && (
              <p className="text-sm text-red-600">{lang === 'ar' ? 'تعذر تحميل تفاصيل التسوية.' : 'Could not load adjustment details.'}</p>
            )}

            {adj && !adjQ.isLoading && !adjQ.error && (
              <>
                <div className={`rounded-xl border border-slate-200 bg-slate-50/80 p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm ${textAlign}`}>
                  <div>
                    <span className="text-slate-500">{lang === 'ar' ? 'التاريخ' : 'Date'}:</span> <span className="text-slate-900">{formatDisplayDate(adj.date)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">{lang === 'ar' ? 'المخزن' : 'Warehouse'}:</span> <span className="text-slate-900">{adj.warehouse?.name ?? '—'}</span>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-slate-500">{lang === 'ar' ? 'البيان' : 'Notes'}:</span> <span className="text-slate-900">{adj.notes?.trim() || '—'}</span>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-100 text-slate-600">
                      <tr>
                        <th className={`px-2 py-2 ${textAlign}`}>{lang === 'ar' ? 'الصنف' : 'Item'}</th>
                        <th className={`px-2 py-2 ${numAlign} w-28`}>{lang === 'ar' ? 'الكمية' : 'Qty'}</th>
                        <th className={`px-2 py-2 text-center ${textAlign}`}>{lang === 'ar' ? 'نوع الحركة' : 'Action'}</th>
                        <th className={`px-2 py-2 ${numAlign} w-28`}>{lang === 'ar' ? 'التكلفه' : 'Cost'}</th>
                        <th className={`px-2 py-2 ${numAlign} w-32`}>{lang === 'ar' ? 'الإجمالي' : 'Total'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(adj.lines ?? []).map((l) => (
                        <tr key={l.id}>
                          <td className={`px-2 py-2 ${textAlign}`}>{l.item?.name ?? `#${l.item_id}`}</td>
                          <td className={`px-2 py-2 tabular-nums ${numAlign}`}>{fmtQty(Number(l.quantity))}</td>
                          <td className={`px-2 py-2 text-center`}>
                            {(l.action ?? (adj.adjustment_type === 'in' ? 'add' : 'subtract')) === 'add' ? (
                              <Plus size={16} className="inline text-emerald-600" />
                            ) : (
                              <Minus size={16} className="inline text-red-600" />
                            )}
                          </td>
                          <td className={`px-2 py-2 tabular-nums ${numAlign}`}>{fmtMoney(Number(l.unit_cost))}</td>
                          <td className={`px-2 py-2 tabular-nums ${numAlign}`}>
                            {fmtMoney(
                              ((l.action ?? (adj.adjustment_type === 'in' ? 'add' : 'subtract')) === 'subtract' ? -1 : 1) *
                                Math.abs(Number(l.total_cost || 0)),
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50">
                        <td className={`px-2 py-2 font-semibold ${textAlign}`} colSpan={4}>
                          {lang === 'ar' ? 'الإجمالي' : 'Total'}
                        </td>
                        <td className={`px-2 py-2 font-semibold tabular-nums ${numAlign}`}>{fmtMoney(total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {adj.attachment_url && (
                  <div className={`rounded-lg border border-amber-200 bg-amber-50/60 p-3 ${textAlign}`}>
                    <div className="text-xs font-semibold text-amber-900 mb-2 flex items-center gap-2">
                      <Paperclip size={14} />
                      {lang === 'ar' ? 'مرفقات' : 'Attachments'}
                    </div>
                    <a href={adj.attachment_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-primary-700 hover:underline break-all">
                      <FileText size={14} />
                      {lang === 'ar' ? 'فتح المرفق' : 'Open attachment'}
                    </a>
                  </div>
                )}

                {actionError && <p className="text-xs text-red-600">{actionError}</p>}
              </>
            )}
          </div>
        </div>
      </div>

      {deleteOpen && (
        <ConfirmDialog
          overlayZClass="z-[150]"
          variant="danger"
          title={lang === 'ar' ? 'تأكيد الحذف' : 'Confirm delete'}
          message={lang === 'ar' ? 'سيتم حذف تسوية الجرد نهائياً مع عكس أثرها. المتابعة؟' : 'This adjustment will be permanently deleted. Continue?'}
          confirmLabel={t.delete}
          isLoading={delMut.isPending}
          onCancel={() => setDeleteOpen(false)}
          onConfirm={() => delMut.mutate()}
        />
      )}
    </>
  )
}

