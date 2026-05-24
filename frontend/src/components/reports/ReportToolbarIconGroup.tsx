import { forwardRef, type ReactNode } from 'react'
import { FileText, Printer, FileSpreadsheet } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'

const btnBase = 'inline-flex h-9 w-9 items-center justify-center rounded-md disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none'

export type ReportToolbarIconGroupProps = {
  /** تعطيل أزرار التصدير/الطباعة (زر الأعمدة يبقى حسب columnsSlot) */
  disabled?: boolean
  onExportExcel: () => void
  onPrint: () => void
  /** زر PDF الداكن — كصفحة المطعم؛ الافتراضي نفس onPrint */
  onExportPdf?: () => void
  /** يُرسَل قبل زر PDF (مثلاً زر تخصيص الأعمدة + القائمة) */
  columnsSlot?: ReactNode
}

/**
 * مجموعة أيقونات موحّدة للتقارير وقوائم البيانات (نفس تنسيق «مبيعات المطعم»):
 * [أعمدة؟] · PDF · طباعة · Excel
 */
export const ReportToolbarIconGroup = forwardRef<HTMLDivElement, ReportToolbarIconGroupProps>(function ReportToolbarIconGroup(
  { disabled = false, onExportExcel, onPrint, onExportPdf, columnsSlot },
  ref,
) {
  const { t, lang } = useLanguage()
  const pdfHandler = onExportPdf ?? onPrint
  const labelPdf = lang === 'ar' ? 'تصدير PDF' : 'Export PDF'
  const labelPrint = t.accounts?.print ?? (lang === 'ar' ? 'طباعة' : 'Print')
  const labelExcel = t.exportCsv ?? (lang === 'ar' ? 'تصدير Excel' : 'Export Excel')

  return (
    <div ref={ref} className="relative flex items-center gap-1.5 no-print shrink-0">
      {columnsSlot}
      <button
        type="button"
        onClick={pdfHandler}
        disabled={disabled}
        className={`${btnBase} bg-slate-800 text-white hover:bg-slate-700`}
        title={labelPdf}
      >
        <FileText size={16} strokeWidth={2} aria-hidden />
      </button>
      <button
        type="button"
        onClick={onPrint}
        disabled={disabled}
        className={`${btnBase} bg-slate-100 border border-slate-300 text-slate-600 hover:bg-slate-50`}
        title={labelPrint}
      >
        <Printer size={16} strokeWidth={2} aria-hidden />
      </button>
      <button
        type="button"
        onClick={onExportExcel}
        disabled={disabled}
        className={`${btnBase} bg-emerald-600 text-white hover:bg-emerald-500`}
        title={labelExcel}
      >
        <FileSpreadsheet size={16} strokeWidth={2} aria-hidden />
      </button>
    </div>
  )
})
