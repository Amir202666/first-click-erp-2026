import { useEffect, useMemo, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchTransfer, fetchSettings } from '../../api/tenant'
import type { TransferHeader } from '../../types'
import { formatDisplayDate } from '../../utils/date'
import { formatAmount } from '../../utils/currency'
import { Printer } from 'lucide-react'

const statusLabelsAr: Record<string, string> = {
  draft: 'مسودة',
  in_transit: 'قيد النقل',
  received: 'مستلم',
}

export default function TransferPrint() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const autoPrint = searchParams.get('autoprint') === '1'
  const printedRef = useRef(false)

  const { currentTenant } = useAuth()
  const { lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const textAlign = isRtl ? 'text-right' : 'text-left'

  const { data: transfer, isLoading } = useQuery({
    queryKey: ['transfer', tenantId, id],
    queryFn: () => fetchTransfer(tenantId, Number(id)),
    enabled: !!tenantId && !!id,
  })
  const { data: settings } = useQuery({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })

  const companyName = (settings as Record<string, unknown>)?.company_name ?? currentTenant?.name ?? '—'
  const companyLogo = (settings as Record<string, unknown>)?.company_logo

  const locale = 'ar-u-nu-latn'
  const fmt = (n: number) => formatAmount(n, { decimal_places: 2 }, locale)

  const linesTotal = useMemo(() => {
    if (!transfer?.lines?.length) return 0
    return transfer.lines.reduce((s, l) => s + Number(l.total_cost ?? 0), 0)
  }, [transfer])

  useEffect(() => {
    if (!autoPrint || isLoading || !transfer || printedRef.current) return
    printedRef.current = true
    const t = window.setTimeout(() => {
      window.print()
    }, 350)
    return () => clearTimeout(t)
  }, [autoPrint, isLoading, transfer])

  const handlePrint = () => window.print()

  const t = transfer as TransferHeader & {
    branch?: { name?: string } | null
    cost_center?: { name?: string } | null
  }

  if (isLoading || !transfer) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="min-h-screen w-full bg-slate-100 print:bg-white print:min-h-0" dir="rtl">
      <div className="mx-auto w-full max-w-[1200px] px-3 py-4 print:max-w-none print:px-0 print:py-0">
        <div className="no-print mb-4 flex justify-end gap-2 print:hidden">
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-500"
          >
            <Printer size={18} />
            {lang === 'ar' ? 'طباعة إذن التحويل' : 'Print transfer'}
          </button>
        </div>

        <div
          id="transfer-print-area"
          className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm print:rounded-none print:border-0 print:shadow-none"
        >
          <div className="border-b border-slate-200 px-4 py-4 print:px-2 print:py-3 sm:px-6 sm:py-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className={`flex-1 ${textAlign}`}>
                {companyLogo != null && companyLogo !== '' ? (
                  <div className="mb-2">
                    <img src={String(companyLogo)} alt="" className="h-12 max-w-[200px] object-contain sm:h-14" />
                  </div>
                ) : null}
                <h1 className="text-lg font-bold text-slate-900 sm:text-xl">{String(companyName)}</h1>
                <h2 className="mt-2 text-base font-semibold text-slate-800 sm:text-lg">
                  {lang === 'ar' ? 'إذن تحويل مخزون' : 'Stock transfer voucher'}
                </h2>
              </div>
              <div className={`rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 print:bg-transparent sm:min-w-[200px] ${textAlign}`}>
                <p className="font-mono font-semibold text-slate-900">{transfer.number}</p>
                <p className="mt-1">{formatDisplayDate(transfer.date)}</p>
                <p className="mt-1 text-xs text-slate-600">
                  {lang === 'ar' ? 'الحالة:' : 'Status:'}{' '}
                  {statusLabelsAr[transfer.status] ?? transfer.status}
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 text-sm text-slate-700 sm:grid-cols-2 print:grid-cols-2">
              <div className={`rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 print:border-slate-200 print:bg-white ${textAlign}`}>
                <span className="text-xs font-medium text-slate-500">{lang === 'ar' ? 'من مخزن' : 'From'}</span>
                <p className="mt-0.5 font-medium text-slate-900">{transfer.from_warehouse?.name ?? '—'}</p>
              </div>
              <div className={`rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 print:border-slate-200 print:bg-white ${textAlign}`}>
                <span className="text-xs font-medium text-slate-500">{lang === 'ar' ? 'إلى مخزن' : 'To'}</span>
                <p className="mt-0.5 font-medium text-slate-900">{transfer.to_warehouse?.name ?? '—'}</p>
              </div>
              {t.branch?.name && (
                <div className={`rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 print:border-slate-200 print:bg-white ${textAlign}`}>
                  <span className="text-xs font-medium text-slate-500">{lang === 'ar' ? 'الفرع' : 'Branch'}</span>
                  <p className="mt-0.5 font-medium text-slate-900">{t.branch.name}</p>
                </div>
              )}
              {t.cost_center?.name && (
                <div className={`rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 print:border-slate-200 print:bg-white ${textAlign}`}>
                  <span className="text-xs font-medium text-slate-500">{lang === 'ar' ? 'مركز التكلفة' : 'Cost center'}</span>
                  <p className="mt-0.5 font-medium text-slate-900">{t.cost_center.name}</p>
                </div>
              )}
            </div>
          </div>

          <div className="px-2 py-3 sm:px-4 sm:py-4 print:px-2 print:py-2">
            <div className="w-full overflow-x-auto print:overflow-visible">
              <table className="w-full min-w-full table-fixed border-collapse border border-slate-300 text-sm print:text-[11px]">
                <colgroup>
                  <col className="w-[40px]" />
                  <col />
                  <col className="w-[22%]" />
                  <col className="w-[18%]" />
                  <col className="w-[18%]" />
                </colgroup>
                <thead>
                  <tr className="bg-slate-100 text-slate-800 print:bg-slate-100">
                    <th className={`border border-slate-300 px-2 py-2 font-semibold ${textAlign}`}>#</th>
                    <th className={`border border-slate-300 px-2 py-2 font-semibold ${textAlign}`}>
                      {lang === 'ar' ? 'الصنف' : 'Item'}
                    </th>
                    <th className={`border border-slate-300 px-2 py-2 font-semibold ${textAlign}`}>
                      {lang === 'ar' ? 'الكمية' : 'Qty'}
                    </th>
                    <th className={`border border-slate-300 px-2 py-2 font-semibold ${textAlign}`}>
                      {lang === 'ar' ? 'تكلفة الوحدة' : 'Unit cost'}
                    </th>
                    <th className={`border border-slate-300 px-2 py-2 font-semibold ${textAlign}`}>
                      {lang === 'ar' ? 'الإجمالي' : 'Total'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(transfer.lines ?? []).map((line, idx) => (
                    <tr key={line.id} className="break-inside-avoid">
                      <td className="border border-slate-300 px-2 py-1.5 tabular-nums text-slate-700">{idx + 1}</td>
                      <td className="border border-slate-300 px-2 py-1.5 text-slate-900">
                        <span className="font-medium">{line.item?.name ?? line.item_id}</span>
                        {line.item?.code ? <span className="text-xs text-slate-500"> ({line.item.code})</span> : null}
                      </td>
                      <td className={`border border-slate-300 px-2 py-1.5 tabular-nums text-slate-800 ${textAlign}`}>
                        {Number(line.quantity).toLocaleString(locale)}
                      </td>
                      <td className={`border border-slate-300 px-2 py-1.5 tabular-nums text-slate-800 ${textAlign}`}>
                        {fmt(Number(line.unit_cost))}
                      </td>
                      <td className={`border border-slate-300 px-2 py-1.5 font-medium tabular-nums text-slate-900 ${textAlign}`}>
                        {fmt(Number(line.total_cost))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 font-semibold print:bg-slate-50">
                    <td colSpan={4} className={`border border-slate-300 px-2 py-2 ${textAlign}`}>
                      {lang === 'ar' ? 'إجمالي التكلفة' : 'Total cost'}
                    </td>
                    <td className={`border border-slate-300 px-2 py-2 tabular-nums ${textAlign}`}>{fmt(linesTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {transfer.notes && (
              <p className={`mt-4 text-sm text-slate-600 ${textAlign}`}>
                {lang === 'ar' ? 'ملاحظات:' : 'Notes:'} {transfer.notes}
              </p>
            )}

            <div className="mt-8 grid grid-cols-1 gap-6 border-t border-slate-200 pt-6 print:mt-6 sm:grid-cols-3 print:grid-cols-3">
              {[
                { key: 'from', ar: 'المُسلّم', en: 'Issued by' },
                { key: 'driver', ar: 'السائق', en: 'Driver' },
                { key: 'to', ar: 'المستلم', en: 'Received by' },
              ].map((sig) => (
                <div key={sig.key} className="text-center">
                  <p className="mb-8 text-xs text-slate-500">{lang === 'ar' ? sig.ar : sig.en}</p>
                  <p className="border-t-2 border-slate-400 pt-2 text-sm text-slate-700">________________</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @page {
          size: A4;
          margin: 10mm 12mm;
        }
        @media print {
          .no-print { display: none !important; }
          html, body {
            width: 100% !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          body * {
            visibility: hidden;
          }
          #transfer-print-area,
          #transfer-print-area * {
            visibility: visible;
          }
          #transfer-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
        }
      `}</style>
    </div>
  )
}
