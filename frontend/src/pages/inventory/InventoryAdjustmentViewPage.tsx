import { useEffect, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchInventoryAdjustment, fetchSettings } from '../../api/tenant'
import type { InventoryAdjustment } from '../../types'
import { coerceDecimalPlaces, formatAmount } from '../../utils/currency'
import { formatDisplayDate } from '../../utils/date'
import { ArrowRight, Printer, Plus, Minus } from 'lucide-react'

export default function InventoryAdjustmentViewPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const autoPrint = searchParams.get('autoprint') === '1'
  const printedRef = useRef(false)
  const adjId = Number(id)
  const { currentTenant } = useAuth()
  const tenantId = currentTenant?.id ?? 0
  const { t, lang, isRtl } = useLanguage()
  const textAlign = isRtl ? 'text-right' : 'text-left'
  const numAlign = 'text-right'

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

  const { data: adj, isLoading } = useQuery<InventoryAdjustment>({
    queryKey: ['inventory-adjustment', tenantId, adjId],
    queryFn: () => fetchInventoryAdjustment(tenantId, adjId),
    enabled: tenantId > 0 && adjId > 0,
  })

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

  const total = useMemo(() => {
    if (!adj) return 0
    const headerAction = adj.adjustment_type === 'in' ? 'add' : 'subtract'
    return (adj.lines ?? []).reduce((s, l) => {
      const action = l.action ?? headerAction
      const sign = action === 'subtract' ? -1 : 1
      return s + sign * Math.abs(Number(l.total_cost || 0))
    }, 0)
  }, [adj])

  const handlePrint = () => window.print()

  useEffect(() => {
    if (!autoPrint || isLoading || !adj || printedRef.current) return
    printedRef.current = true
    const timer = window.setTimeout(() => window.print(), 400)
    return () => clearTimeout(timer)
  }, [autoPrint, isLoading, adj])

  return (
    <div className={`${isRtl ? 'rtl' : 'ltr'} min-h-screen bg-slate-50 print:bg-white print:min-h-0`}>
      <div className="no-print p-6 pb-4 flex items-center justify-between border-b border-slate-200 bg-white sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <Link to="/inventory/adjustments" className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900">
            <ArrowRight size={18} className={isRtl ? 'rotate-180' : ''} />
            {lang === 'ar' ? 'رجوع' : 'Back'}
          </Link>
          <div className="h-6 w-px bg-slate-200" />
          <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
        </div>
        <button
          type="button"
          onClick={handlePrint}
          className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-4 py-2 text-sm transition-colors"
        >
          <Printer size={18} />
          {t.accounts?.print ?? (lang === 'ar' ? 'طباعة' : 'Print')}
        </button>
      </div>

      <div className="p-6 md:p-10 max-w-5xl mx-auto print:max-w-none print:w-full print:p-2 print:mx-0">
        <div
          id="inventory-adjustment-print-area"
          className="inventory-adjustment-print-document bg-white rounded-xl border border-slate-200 overflow-hidden print:overflow-visible"
        >
          <div className="hidden print:block print:px-1 print:pt-1 print:pb-3 print:mb-1 print:border-b-2 print:border-black">
            <h2 className={`text-xl font-bold text-black ${textAlign}`}>{title || (lang === 'ar' ? 'تسوية جردية' : 'Inventory adjustment')}</h2>
          </div>

          <div className="inventory-adjustment-print-header p-6 border-b border-slate-200 print:border-b-2 print:border-black">
            {isLoading || !adj ? (
              <div className="text-slate-500">{lang === 'ar' ? 'جاري التحميل…' : 'Loading…'}</div>
            ) : (
              <div
                className={`grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm print:text-base print:gap-y-2.5 ${textAlign}`}
              >
                <div>
                  <span className="text-slate-500 print:text-black print:font-semibold">{lang === 'ar' ? 'الرقم' : 'No.'}:</span>{' '}
                  <span className="text-slate-900 font-mono print:text-black">{adj.number?.trim() || `#${adj.id}`}</span>
                </div>
                <div>
                  <span className="text-slate-500 print:text-black print:font-semibold">{lang === 'ar' ? 'التاريخ' : 'Date'}:</span>{' '}
                  <span className="text-slate-900 print:text-black">{formatDisplayDate(adj.date)}</span>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-slate-500 print:text-black print:font-semibold">{lang === 'ar' ? 'المخزن' : 'Warehouse'}:</span>{' '}
                  <span className="text-slate-900 print:text-black">{adj.warehouse?.name ?? '—'}</span>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-slate-500 print:text-black print:font-semibold">{lang === 'ar' ? 'البيان' : 'Notes'}:</span>{' '}
                  <span className="text-slate-900 print:text-black">{adj.notes?.trim() || '—'}</span>
                </div>
              </div>
            )}
          </div>

          {!isLoading && adj && (
            <div className="p-6 print:px-1 print:py-3">
              <div className="overflow-x-auto print:overflow-visible">
                <table className="inventory-adjustment-print-table w-full text-sm border border-slate-200">
                  <thead className="bg-slate-50 text-slate-600 print:bg-white print:text-black">
                    <tr>
                      <th className={`px-3 py-2 ${textAlign}`}>{lang === 'ar' ? 'الصنف' : 'Item'}</th>
                      <th className={`px-3 py-2 ${numAlign} w-32`}>{lang === 'ar' ? 'الكمية' : 'Qty'}</th>
                      <th className={`px-3 py-2 ${textAlign} w-32`}>{lang === 'ar' ? 'نوع الحركة' : 'Action'}</th>
                      <th className={`px-3 py-2 ${numAlign} w-32`}>{lang === 'ar' ? 'التكلفه' : 'Cost'}</th>
                      <th className={`px-3 py-2 ${numAlign} w-36`}>{lang === 'ar' ? 'الإجمالي' : 'Total'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 print:divide-y-0">
                    {(adj.lines ?? []).map((l) => (
                      <tr key={l.id}>
                        <td className={`px-3 py-2 ${textAlign}`}>{l.item?.name ?? `#${l.item_id}`}</td>
                        <td className={`px-3 py-2 tabular-nums ${numAlign}`}>{fmtQty(Number(l.quantity))}</td>
                        <td className={`px-3 py-2 text-center`}>
                          {(l.action ?? (adj.adjustment_type === 'in' ? 'add' : 'subtract')) === 'add' ? (
                            <>
                              <Plus size={16} className="inline text-emerald-600 print:hidden" />
                              <span className="hidden print:inline font-bold text-black">+</span>
                            </>
                          ) : (
                            <>
                              <Minus size={16} className="inline text-red-600 print:hidden" />
                              <span className="hidden print:inline font-bold text-black">−</span>
                            </>
                          )}
                        </td>
                        <td className={`px-3 py-2 tabular-nums ${numAlign}`}>{fmtMoney(Number(l.unit_cost))}</td>
                        <td className={`px-3 py-2 tabular-nums ${numAlign}`}>
                          {fmtMoney(
                            ((l.action ?? (adj.adjustment_type === 'in' ? 'add' : 'subtract')) === 'subtract' ? -1 : 1) *
                              Math.abs(Number(l.total_cost || 0)),
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 print:bg-white">
                      <td className={`px-3 py-2 font-semibold ${textAlign}`} colSpan={4}>
                        {lang === 'ar' ? 'الإجمالي' : 'Total'}
                      </td>
                      <td className={`px-3 py-2 font-semibold tabular-nums ${numAlign}`}>{fmtMoney(total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

