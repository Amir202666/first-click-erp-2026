import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download, FileText, X } from 'lucide-react'
import { fetchPosXReport } from '../../api/tenant'
import type { PosShiftInfo, PosXReport, PosZReport } from '../../types'
import { formatAmount } from '../../utils/currency'
import {
  computeCloseShiftBreakdown,
  openCloseShiftPrintWindow,
  resolveShiftInvoiceLogo,
  safeLogoUrlForPrint,
} from '../../utils/posShiftReport'
import type { ToastType } from '../ui/Toast'

export type PosShiftReportModalsProps = {
  tenantId: number
  branchId: number | null
  currentShift: PosShiftInfo | null
  settings?: Record<string, unknown>
  amountDecimals: number
  locale: string
  lang: string
  isRtl: boolean
  companyName?: string
  currentUserName?: string
  cancelLabel?: string
  showXReport: boolean
  onCloseXReport: () => void
  xReportData: PosXReport | null
  showCloseShift: boolean
  onCloseCloseShift: () => void
  closingCash: string
  onClosingCashChange: (value: string) => void
  onConfirmCloseShift: () => void
  closeShiftPending: boolean
  showZReportPrint: boolean
  onCloseZReport: () => void
  lastZReport: PosZReport | null
  lastShiftInfo: { branchName?: string; userName?: string }
  onToast?: (message: string, type: ToastType) => void
}

export default function PosShiftReportModals({
  tenantId,
  branchId,
  currentShift,
  settings,
  amountDecimals,
  locale,
  lang,
  isRtl,
  companyName,
  currentUserName,
  cancelLabel = 'Cancel',
  showXReport,
  onCloseXReport,
  xReportData,
  showCloseShift,
  onCloseCloseShift,
  closingCash,
  onClosingCashChange,
  onConfirmCloseShift,
  closeShiftPending,
  showZReportPrint,
  onCloseZReport,
  lastZReport,
  lastShiftInfo,
  onToast,
}: PosShiftReportModalsProps) {
  const [closeShiftSummary, setCloseShiftSummary] = useState<PosXReport | null>(null)
  const [closeShiftSummaryLoadError, setCloseShiftSummaryLoadError] = useState(false)
  const [closeShiftPdfExporting, setCloseShiftPdfExporting] = useState(false)
  const closeShiftReportExportRef = useRef<HTMLDivElement>(null)
  const zReportPrintRef = useRef<HTMLDivElement>(null)

  const fmt = useCallback(
    (n: number) => formatAmount(n, { decimal_places: amountDecimals }, locale),
    [amountDecimals, locale],
  )

  const closeShiftBreakdown = useMemo(
    () => (closeShiftSummary ? computeCloseShiftBreakdown(closeShiftSummary) : null),
    [closeShiftSummary],
  )

  const invoiceLogo = resolveShiftInvoiceLogo(settings)

  useEffect(() => {
    if (!showCloseShift || !branchId || !tenantId) return
    setCloseShiftSummary(null)
    setCloseShiftSummaryLoadError(false)
    fetchPosXReport(tenantId, branchId)
      .then((r) => {
        if (r.report) setCloseShiftSummary(r.report)
        else setCloseShiftSummaryLoadError(true)
      })
      .catch(() => setCloseShiftSummaryLoadError(true))
  }, [showCloseShift, branchId, tenantId])

  const retryLoadCloseShiftSummary = () => {
    if (!branchId || !tenantId) return
    setCloseShiftSummaryLoadError(false)
    setCloseShiftSummary(null)
    fetchPosXReport(tenantId, branchId)
      .then((r) => {
        if (r.report) {
          setCloseShiftSummary(r.report)
          setCloseShiftSummaryLoadError(false)
        } else setCloseShiftSummaryLoadError(true)
      })
      .catch(() => setCloseShiftSummaryLoadError(true))
  }

  const printCloseShiftCashCountReport = () => {
    if (!closeShiftSummary || !closeShiftBreakdown || !currentShift) return
    const ok = openCloseShiftPrintWindow({
      closeShiftSummary,
      closeShiftBreakdown,
      currentShift,
      companyName,
      managerName: currentUserName,
      invoiceLogo,
      lang,
      amountDecimals,
      locale,
    })
    if (!ok) {
      onToast?.(lang === 'ar' ? 'تعذر فتح نافذة الطباعة' : 'Could not open print window', 'error')
    }
  }

  const exportCloseShiftReportPdf = async () => {
    const el = closeShiftReportExportRef.current
    if (!el) {
      onToast?.(lang === 'ar' ? 'لا يوجد تقرير للتصدير بعد التحميل.' : 'No report to export yet.', 'error')
      return
    }
    setCloseShiftPdfExporting(true)
    try {
      const html2canvas = (await import('html2canvas')).default
      const { jsPDF } = await import('jspdf')
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#ffffff',
      })
      const imgData = canvas.toDataURL('image/png', 1.0)
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const imgW = pageW
      const imgH = (canvas.height * imgW) / canvas.width
      let heightLeft = imgH
      let y = 0
      pdf.addImage(imgData, 'PNG', 0, y, imgW, imgH, undefined, 'FAST')
      heightLeft -= pageH
      while (heightLeft > 0) {
        y = heightLeft - imgH
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, y, imgW, imgH, undefined, 'FAST')
        heightLeft -= pageH
      }
      const d = new Date().toISOString().slice(0, 10)
      const fname =
        lang === 'ar' ? `جرد-صندوق-فرع-${branchId}-${d}.pdf` : `cash-count-branch-${branchId}-${d}.pdf`
      pdf.save(fname)
      onToast?.(lang === 'ar' ? 'تم تصدير PDF بنجاح' : 'PDF exported successfully', 'success')
    } catch {
      onToast?.(lang === 'ar' ? 'تعذر تصدير PDF. حاول مجدداً.' : 'PDF export failed. Try again.', 'error')
    } finally {
      setCloseShiftPdfExporting(false)
    }
  }

  const invalidClose =
    closeShiftSummary &&
    (closeShiftSummary.total_sales ?? 0) < 0.001 &&
    (((closeShiftSummary.by_payment_method ?? []).reduce((s, m) => s + (m.amount ?? 0), 0) >= 0.001) ||
      (closeShiftSummary.invoices_count ?? 0) > 0)

  const variance =
    closeShiftSummary && closingCash !== ''
      ? (parseFloat(closingCash) || 0) - closeShiftSummary.expected_cash
      : null

  return (
    <>
      {showXReport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-auto">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white">
              <h3 className="text-lg font-semibold">
                {lang === 'ar' ? 'تقرير X (لحظة الحالية)' : 'X Report (current)'}
              </h3>
              <button type="button" onClick={onCloseXReport} className="p-2 rounded-lg hover:bg-slate-100">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {xReportData ? (
                <>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-slate-600">{lang === 'ar' ? 'عدد الفواتير' : 'Invoices count'}</span>
                    <span className="font-mono text-right">{xReportData.invoices_count}</span>
                    <span className="text-slate-600">{lang === 'ar' ? 'إجمالي المبيعات' : 'Total sales'}</span>
                    <span className="font-mono text-right font-semibold">{fmt(xReportData.total_sales ?? 0)}</span>
                    <span className="text-slate-600">{lang === 'ar' ? 'رصيد افتتاحي' : 'Opening cash'}</span>
                    <span className="font-mono text-right">{fmt(xReportData.opening_cash ?? 0)}</span>
                    <span className="text-slate-600">{lang === 'ar' ? 'نقداً مستلم' : 'Cash received'}</span>
                    <span className="font-mono text-right">{fmt(xReportData.cash_received ?? 0)}</span>
                    {typeof xReportData.total_expenses === 'number' ? (
                      <>
                        <span className="text-slate-600">{lang === 'ar' ? 'إجمالي المصروفات' : 'Total expenses'}</span>
                        <span className="font-mono text-right text-red-600">- {fmt(xReportData.total_expenses)}</span>
                        <span className="text-slate-600">
                          {lang === 'ar' ? 'المتوقع في الصندوق (بعد المصروفات)' : 'Expected cash (after expenses)'}
                        </span>
                        <span className="font-mono text-right font-semibold">
                          {fmt(Math.max(0, (xReportData.expected_cash ?? 0) - xReportData.total_expenses))}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-slate-600">{lang === 'ar' ? 'المتوقع في الصندوق' : 'Expected cash'}</span>
                        <span className="font-mono text-right">{fmt(xReportData.expected_cash ?? 0)}</span>
                      </>
                    )}
                  </div>
                  {xReportData.by_payment_method?.length > 0 && (
                    <div className="pt-2 border-t border-slate-200">
                      <h4 className="text-sm font-medium text-slate-700 mb-2">
                        {lang === 'ar' ? 'حسب طريقة الدفع' : 'By payment method'}
                      </h4>
                      <ul className="space-y-1 text-sm">
                        {xReportData.by_payment_method.map((pm) => (
                          <li key={pm.payment_method_id} className="flex justify-between">
                            <span>{pm.name}</span>
                            <span>
                              {fmt(pm.amount ?? 0)} ({pm.count})
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-slate-500 text-sm">
                  {lang === 'ar' ? 'لا توجد وردية مفتوحة أو لا توجد بيانات.' : 'No open shift or no data.'}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {showCloseShift && currentShift && branchId && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 py-4 px-4">
          <div className="mx-auto w-full max-w-2xl bg-white rounded-2xl shadow-xl my-2 sm:my-4">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-xl font-semibold text-slate-900">
                {lang === 'ar' ? 'جرد الصندوق — إغلاق الوردية' : 'Cash Count — Close Shift'}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={printCloseShiftCashCountReport}
                  disabled={!closeShiftSummary}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium disabled:opacity-50"
                >
                  <FileText size={18} />
                  {lang === 'ar' ? 'طباعة التقرير' : 'Print Report'}
                </button>
                <button
                  type="button"
                  onClick={() => void exportCloseShiftReportPdf()}
                  disabled={!closeShiftSummary || closeShiftPdfExporting}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary-50 hover:bg-primary-100 text-primary-800 border border-primary-200 text-sm font-medium disabled:opacity-50"
                >
                  <Download size={18} />
                  {closeShiftPdfExporting
                    ? lang === 'ar'
                      ? 'جاري التصدير...'
                      : 'Exporting...'
                    : lang === 'ar'
                      ? 'تصدير PDF'
                      : 'Export PDF'}
                </button>
                <button type="button" onClick={onCloseCloseShift} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700">
                  <X size={22} />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-5">
              {!closeShiftSummary && !closeShiftSummaryLoadError && (
                <div className="flex items-center justify-center py-8 text-slate-500">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mr-2" />
                  {lang === 'ar' ? 'جاري تحميل ملخص الوردية...' : 'Loading shift summary...'}
                </div>
              )}
              {closeShiftSummaryLoadError && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800 text-sm flex items-center justify-between gap-2">
                  <span>{lang === 'ar' ? 'تعذر تحميل ملخص الوردية.' : 'Could not load shift summary.'}</span>
                  <button
                    type="button"
                    onClick={retryLoadCloseShiftSummary}
                    className="px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 font-medium"
                  >
                    {lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}
                  </button>
                </div>
              )}
              {closeShiftSummary && closeShiftBreakdown && currentShift && (() => {
                const logoSrc = safeLogoUrlForPrint(invoiceLogo)
                const openedStrUi =
                  (closeShiftSummary.opened_at ?? currentShift.opened_at)
                    ? new Date(closeShiftSummary.opened_at ?? currentShift.opened_at).toLocaleString(
                        lang === 'ar' ? 'ar-SA' : 'en-GB',
                        { hour12: true },
                      )
                    : '—'
                const {
                  cashSales,
                  cardSales,
                  bankSales,
                  otherSales,
                  returns,
                  discount,
                  totalCashSalesNet,
                  creditSales,
                  totalSales,
                  expenses,
                  netCash,
                } = closeShiftBreakdown
                return (
                  <div ref={closeShiftReportExportRef} className="space-y-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-3">
                      {logoSrc ? (
                        <div className="flex justify-center">
                          <img src={logoSrc} alt="" className="max-h-[72px] max-w-[240px] object-contain" />
                        </div>
                      ) : null}
                      <h4 className="text-center text-base font-bold text-slate-900">
                        {lang === 'ar' ? 'تقرير مطابقة وجرد وردية مبيعات' : 'Sales shift reconciliation & cash count report'}
                      </h4>
                      {companyName ? <p className="text-center text-xs text-slate-500">{companyName}</p> : null}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                          <div className="text-slate-500">{lang === 'ar' ? 'اسم الكاشير (فاتح الوردية)' : 'Cashier (opened shift)'}</div>
                          <div className="font-semibold text-slate-800">{currentShift.user?.name ?? '—'}</div>
                        </div>
                        <div>
                          <div className="text-slate-500">{lang === 'ar' ? 'اسم المدير / المُغلق' : 'Manager / closing user'}</div>
                          <div className="font-semibold text-slate-800">{currentUserName ?? '—'}</div>
                        </div>
                        <div>
                          <div className="text-slate-500">{lang === 'ar' ? 'تاريخ ووقت فتح الوردية' : 'Shift opened at'}</div>
                          <div className="font-semibold text-slate-800">{openedStrUi}</div>
                        </div>
                        <div>
                          <div className="text-slate-500">{lang === 'ar' ? 'تاريخ ووقت إغلاق الوردية' : 'Shift closed at'}</div>
                          <div className="font-semibold text-slate-800">
                            {lang === 'ar'
                              ? 'لم يُسجَّل بعد — الوردية مفتوحة (يُثبَّت عند «إغلاق الوردية»)'
                              : 'Not recorded yet — shift open (on «Close shift»)'}
                          </div>
                        </div>
                        <div className="sm:col-span-2">
                          <div className="text-slate-500">{lang === 'ar' ? 'الفرع' : 'Branch'}</div>
                          <div className="font-semibold text-slate-800">{currentShift.branch?.name ?? currentShift.branch?.code ?? '—'}</div>
                        </div>
                        <div>
                          <div className="text-slate-500">{lang === 'ar' ? 'عدد الفواتير / الطلبات' : 'Invoices / orders count'}</div>
                          <div className="font-semibold text-slate-800 tabular-nums">{closeShiftSummary.invoices_count ?? 0}</div>
                        </div>
                        {(closeShiftSummary.returns_count ?? 0) > 0 ? (
                          <div>
                            <div className="text-slate-500">{lang === 'ar' ? 'عدد المرتجعات' : 'Returns count'}</div>
                            <div className="font-semibold text-slate-800 tabular-nums">{closeShiftSummary.returns_count}</div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-100 text-slate-600">
                              <th className={`py-2.5 px-4 font-semibold ${isRtl ? 'text-right' : 'text-left'}`}>
                                {lang === 'ar' ? 'البند' : 'Item'}
                              </th>
                              <th className="py-2.5 px-4 font-semibold text-right">{lang === 'ar' ? 'المبلغ' : 'Amount'}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            <tr>
                              <td colSpan={2} className="py-2 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                {lang === 'ar' ? 'ملخص الوردية' : 'Shift summary'}
                              </td>
                            </tr>
                            <tr className="hover:bg-slate-50/50">
                              <td className="py-2 px-4 pl-6 text-slate-700">{lang === 'ar' ? 'عدد الفواتير / الطلبات' : 'Invoices / orders count'}</td>
                              <td className="py-2 px-4 text-right font-mono tabular-nums font-semibold">{closeShiftSummary.invoices_count ?? 0}</td>
                            </tr>
                            {(closeShiftSummary.returns_count ?? 0) > 0 ? (
                              <tr className="hover:bg-slate-50/50">
                                <td className="py-2 px-4 pl-6 text-slate-700">{lang === 'ar' ? 'عدد المرتجعات' : 'Returns count'}</td>
                                <td className="py-2 px-4 text-right font-mono tabular-nums">{closeShiftSummary.returns_count}</td>
                              </tr>
                            ) : null}
                            {closeShiftSummary.items_sold_count != null && closeShiftSummary.items_sold_count > 0 ? (
                              <tr className="hover:bg-slate-50/50">
                                <td className="py-2 px-4 pl-6 text-slate-700">{lang === 'ar' ? 'الأصناف المباعة' : 'Items sold'}</td>
                                <td className="py-2 px-4 text-right font-mono tabular-nums">{closeShiftSummary.items_sold_count}</td>
                              </tr>
                            ) : null}
                            <tr>
                              <td colSpan={2} className="py-2 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                {lang === 'ar' ? 'المبيعات حسب طريقة الدفع' : 'Sales by payment method'}
                              </td>
                            </tr>
                            <tr className="hover:bg-slate-50/50">
                              <td className="py-2 px-4 pl-6 text-slate-700">{lang === 'ar' ? 'مبيعات نقداً' : 'Cash sales'}</td>
                              <td className="py-2 px-4 text-right font-mono tabular-nums">{fmt(cashSales)}</td>
                            </tr>
                            <tr className="hover:bg-slate-50/50">
                              <td className="py-2 px-4 pl-6 text-slate-700">{lang === 'ar' ? 'مبيعات فيزا / بطاقة' : 'Card / Visa sales'}</td>
                              <td className="py-2 px-4 text-right font-mono tabular-nums">{fmt(cardSales)}</td>
                            </tr>
                            <tr className="hover:bg-slate-50/50">
                              <td className="py-2 px-4 pl-6 text-slate-700">{lang === 'ar' ? 'تحويلات بنكية' : 'Bank transfers'}</td>
                              <td className="py-2 px-4 text-right font-mono tabular-nums">{fmt(bankSales)}</td>
                            </tr>
                            <tr className="hover:bg-slate-50/50">
                              <td className="py-2 px-4 pl-6 text-slate-700">{lang === 'ar' ? 'أخرى' : 'Other'}</td>
                              <td className="py-2 px-4 text-right font-mono tabular-nums">{fmt(otherSales)}</td>
                            </tr>
                            <tr className="hover:bg-slate-50/50">
                              <td className="py-2 px-4 pl-6 text-slate-600">{lang === 'ar' ? '− مرتجعات' : '− Returns'}</td>
                              <td className="py-2 px-4 text-right font-mono tabular-nums text-red-600">- {fmt(returns)}</td>
                            </tr>
                            <tr className="hover:bg-slate-50/50">
                              <td className="py-2 px-4 pl-6 text-slate-600">{lang === 'ar' ? '− خصم' : '− Discount'}</td>
                              <td className="py-2 px-4 text-right font-mono tabular-nums text-red-600">- {fmt(discount)}</td>
                            </tr>
                            <tr className="bg-slate-100">
                              <td className="py-2.5 px-4 font-semibold text-slate-800">{lang === 'ar' ? 'إجمالي المبيعات النقدية' : 'Total cash sales'}</td>
                              <td className="py-2.5 px-4 text-right font-mono font-semibold tabular-nums">{fmt(totalCashSalesNet)}</td>
                            </tr>
                            <tr className="hover:bg-slate-50/50">
                              <td className="py-2 px-4 text-slate-700">{lang === 'ar' ? 'مبيعات بالآجل' : 'Credit sales'}</td>
                              <td className="py-2 px-4 text-right font-mono tabular-nums">{fmt(creditSales)}</td>
                            </tr>
                            <tr className="bg-slate-100">
                              <td className="py-2.5 px-4 font-semibold text-slate-800">{lang === 'ar' ? 'إجمالي المبيعات' : 'Total sales'}</td>
                              <td className="py-2.5 px-4 text-right font-mono font-semibold tabular-nums">{fmt(totalSales)}</td>
                            </tr>
                            <tr className="hover:bg-slate-50/50">
                              <td className="py-2 px-4 text-slate-700">{lang === 'ar' ? 'المصروفات' : 'Expenses'}</td>
                              <td className="py-2 px-4 text-right font-mono tabular-nums text-red-600">- {fmt(expenses)}</td>
                            </tr>
                            <tr className="bg-primary-50">
                              <td className="py-3 px-4 font-bold text-slate-900">{lang === 'ar' ? 'صافي النقدية' : 'Net cash'}</td>
                              <td className="py-3 px-4 text-right font-mono font-bold tabular-nums text-primary-700">{fmt(netCash)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2 text-xs text-slate-600">
                      <div>
                        <div className="mb-1 font-medium">{lang === 'ar' ? 'توقيع الكاشير' : 'Cashier signature'}</div>
                        <div className="border-b border-slate-400 min-h-[36px]" />
                      </div>
                      <div>
                        <div className="mb-1 font-medium">{lang === 'ar' ? 'توقيع المشرف' : 'Supervisor signature'}</div>
                        <div className="border-b border-slate-400 min-h-[36px]" />
                      </div>
                    </div>
                  </div>
                )
              })()}
              {invalidClose ? (
                <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-4 text-amber-800 text-sm font-medium">
                  {lang === 'ar'
                    ? 'لا يمكن إغلاق الوردية: إجمالي المبيعات يظهر صفراً مع وجود حركات بيع. يرجى مراجعة الفواتير والمرتجعات قبل الترحيل.'
                    : 'Cannot close shift: total sales is zero but there are sales movements. Please review invoices and returns before posting.'}
                </div>
              ) : null}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  {lang === 'ar' ? 'المبلغ الفعلي في الصندوق' : 'Actual cash in till'}
                </label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={closingCash}
                  onChange={(e) => onClosingCashChange(e.target.value)}
                  placeholder="0.00"
                  className="w-full max-w-xs border border-slate-300 rounded-lg px-4 py-3 text-base font-mono tabular-nums focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              {variance != null && closeShiftSummary && (
                <div
                  className={`rounded-xl border-2 p-4 ${
                    variance < 0 ? 'bg-red-50 border-red-200' : variance > 0 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'
                  }`}
                >
                  <span className="text-sm font-medium text-slate-700">
                    {lang === 'ar' ? 'الفرق (فعلي − متوقع):' : 'Variance (actual − expected):'}
                  </span>
                  <span
                    className={`block font-mono text-xl font-bold mt-1 ${
                      variance < 0 ? 'text-red-700' : variance > 0 ? 'text-amber-700' : 'text-green-700'
                    }`}
                  >
                    {variance < 0
                      ? lang === 'ar'
                        ? 'عجز'
                        : 'Shortage'
                      : variance > 0
                        ? lang === 'ar'
                          ? 'زيادة'
                          : 'Surplus'
                        : lang === 'ar'
                          ? 'متطابق'
                          : 'Match'}{' '}
                    {fmt(Math.abs(variance))}
                  </span>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (invalidClose) {
                      onToast?.(
                        lang === 'ar'
                          ? 'لا يمكن إغلاق الوردية: إجمالي المبيعات صفر مع وجود حركات بيع. راجع الفواتير والمرتجعات.'
                          : 'Cannot close shift: total sales is zero with sales movements.',
                        'error',
                      )
                      return
                    }
                    onConfirmCloseShift()
                  }}
                  disabled={!!(closeShiftPending || invalidClose)}
                  className="flex-1 py-3.5 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-500 disabled:opacity-50 transition-colors"
                >
                  {closeShiftPending
                    ? lang === 'ar'
                      ? 'جاري الإغلاق...'
                      : 'Closing...'
                    : lang === 'ar'
                      ? 'إغلاق الوردية'
                      : 'Close Shift'}
                </button>
                <button
                  type="button"
                  onClick={onCloseCloseShift}
                  className="px-6 py-3.5 border border-slate-300 rounded-xl font-medium text-slate-700 hover:bg-slate-50"
                >
                  {cancelLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showZReportPrint && lastZReport && (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/50 py-4 px-4">
          <div className="mx-auto w-full max-w-md bg-white rounded-xl shadow-xl my-2 sm:my-4">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold">{lang === 'ar' ? 'تقرير Z' : 'Z Report'}</h3>
              <div className="flex gap-2">
                <button type="button" onClick={() => window.print()} className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-sm font-medium">
                  {lang === 'ar' ? 'طباعة' : 'Print'}
                </button>
                <button type="button" onClick={onCloseZReport} className="p-2 rounded-lg hover:bg-slate-100">
                  <X size={20} />
                </button>
              </div>
            </div>
            <div ref={zReportPrintRef} className="p-4 print:p-2 print:max-w-[80mm] print:text-xs print:mx-auto font-mono">
              {(() => {
                const zLogo = safeLogoUrlForPrint(invoiceLogo)
                return (
                  <div className="border-b border-dashed border-slate-300 pb-3 mb-3 space-y-2">
                    {zLogo ? (
                      <div className="flex justify-center">
                        <img src={zLogo} alt="" className="max-h-16 max-w-[200px] object-contain mx-auto" />
                      </div>
                    ) : null}
                    <div className="text-center font-bold text-sm leading-snug">
                      {lang === 'ar' ? 'تقرير مطابقة وجرد وردية مبيعات' : 'Sales shift reconciliation & cash count report'}
                    </div>
                    <div className="text-center text-xs font-semibold text-slate-600">
                      {lang === 'ar' ? '(تقرير Z — إغلاق نهائي)' : '(Z report — final close)'}
                    </div>
                    {companyName ? <div className="text-center text-slate-500 text-xs">{companyName}</div> : null}
                    <div className="grid grid-cols-1 gap-1.5 text-[11px] pt-1 font-sans">
                      <div className="flex justify-between gap-2 border-b border-slate-100 pb-1">
                        <span className="text-slate-500 shrink-0">{lang === 'ar' ? 'اسم الكاشير (فاتح الوردية)' : 'Cashier (opened)'}</span>
                        <span className="font-medium text-slate-800 text-end">{lastShiftInfo.userName ?? '—'}</span>
                      </div>
                      <div className="flex justify-between gap-2 border-b border-slate-100 pb-1">
                        <span className="text-slate-500 shrink-0">{lang === 'ar' ? 'اسم المدير / المُغلق' : 'Manager / closed by'}</span>
                        <span className="font-medium text-slate-800 text-end">{currentUserName ?? '—'}</span>
                      </div>
                      <div className="flex justify-between gap-2 border-b border-slate-100 pb-1">
                        <span className="text-slate-500 shrink-0">{lang === 'ar' ? 'فتح الوردية' : 'Opened'}</span>
                        <span className="text-slate-800 text-end">
                          {new Date(lastZReport.opened_at).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-GB', { hour12: true })}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2 border-b border-slate-100 pb-1">
                        <span className="text-slate-500 shrink-0">{lang === 'ar' ? 'إغلاق الوردية' : 'Closed'}</span>
                        <span className="text-slate-800 text-end">
                          {new Date(lastZReport.closed_at).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-GB', { hour12: true })}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-500 shrink-0">{lang === 'ar' ? 'الفرع' : 'Branch'}</span>
                        <span className="font-medium text-slate-800 text-end">{lastShiftInfo.branchName ?? '—'}</span>
                      </div>
                    </div>
                  </div>
                )
              })()}
              <div className="border-t border-dashed border-slate-300 mt-3 pt-3 space-y-1">
                <div className="flex justify-between font-medium">
                  <span>{lang === 'ar' ? 'عدد الفواتير / الطلبات' : 'Invoices / orders'}</span>
                  <span>{lastZReport.invoices_count}</span>
                </div>
                <div className="flex justify-between">
                  <span>{lang === 'ar' ? 'الأصناف المباعة' : 'Items sold'}</span>
                  <span>{lastZReport.items_sold_count ?? '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span>{lang === 'ar' ? 'المرتجعات' : 'Returns'}</span>
                  <span>{lastZReport.returns_count ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>{lang === 'ar' ? 'إجمالي المبيعات' : 'Total Sales'}</span>
                  <span>{fmt(lastZReport.total_sales ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>{lang === 'ar' ? 'المرتجعات' : 'Returns'}</span>
                  <span>- {fmt(lastZReport.total_returns ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>{lang === 'ar' ? 'الضريبة (15%)' : 'Tax (15%)'}</span>
                  <span>{fmt(lastZReport.total_tax ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>{lang === 'ar' ? 'المصروفات' : 'Expenses'}</span>
                  <span>- {fmt(lastZReport.total_expenses ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>{lang === 'ar' ? 'الرصيد الافتتاحي' : 'Opening'}</span>
                  <span>{fmt(lastZReport.opening_cash ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>{lang === 'ar' ? 'المتوقع' : 'Expected'}</span>
                  <span>{fmt(lastZReport.expected_cash ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>{lang === 'ar' ? 'الفعلي' : 'Actual'}</span>
                  <span>{fmt(lastZReport.closing_cash ?? 0)}</span>
                </div>
                <div
                  className={`flex justify-between font-bold ${
                    lastZReport.difference < 0 ? 'text-red-600' : lastZReport.difference > 0 ? 'text-amber-600' : 'text-green-600'
                  }`}
                >
                  <span>{lang === 'ar' ? 'الفرق' : 'Variance'}</span>
                  <span>
                    {lastZReport.difference < 0
                      ? lang === 'ar'
                        ? 'عجز'
                        : 'Shortage'
                      : lastZReport.difference > 0
                        ? lang === 'ar'
                          ? 'زيادة'
                          : 'Surplus'
                        : '0'}{' '}
                    {fmt(Math.abs(lastZReport.difference))}
                  </span>
                </div>
              </div>
              <div className="border-t border-dashed border-slate-300 mt-4 pt-4 space-y-4">
                <div>
                  <div className="text-xs text-slate-500 mb-1">{lang === 'ar' ? 'توقيع الكاشير' : 'Cashier signature'}</div>
                  <div className="border-b border-slate-400 h-8 w-full" />
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">{lang === 'ar' ? 'توقيع المشرف' : 'Supervisor signature'}</div>
                  <div className="border-b border-slate-400 h-8 w-full" />
                </div>
              </div>
              <div className="text-center text-xs text-slate-400 mt-4">
                {new Date(lastZReport.generated_at).toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
