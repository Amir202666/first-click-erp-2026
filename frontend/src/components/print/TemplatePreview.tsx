import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import type { PrintDocumentType, PrintMargins, PrintOrientation, PrintPaperSize } from '../../types/printTemplate'
import { clampZoom, paperPreviewAspect } from '../../utils/printUtils'
import { renderPrintTemplatePreview } from '../../utils/printTemplatePreviewMock'

type Props = {
  documentType: PrintDocumentType
  paperSize: PrintPaperSize
  orientation: PrintOrientation
  margins: PrintMargins
  htmlContent: string
  zoom: number
  accentColor?: string
  isRtl?: boolean
  /** حجم خط المعاينة (نقاط تقريبية) — يُستمد من إعدادات القالب */
  previewFontSize?: number
  previewFontFamily?: string
}

export default function TemplatePreview({
  documentType,
  paperSize,
  orientation,
  margins,
  htmlContent,
  zoom,
  accentColor = '#6366f1',
  isRtl = true,
  previewFontSize = 10,
  previewFontFamily = 'Segoe UI, Tahoma, Arial, sans-serif',
}: Props) {
  const z = clampZoom(zoom)
  const aspect = useMemo(() => paperPreviewAspect(paperSize), [paperSize])
  const swap = orientation === 'landscape' && paperSize !== 'thermal_80' && paperSize !== 'thermal_58'
  const baseW = swap ? aspect.h : aspect.w
  const baseH = swap ? aspect.w : aspect.h
  const scale = z / 100
  const isThermal = paperSize === 'thermal_80' || paperSize === 'thermal_58'

  const rendered = useMemo(
    () => renderPrintTemplatePreview(htmlContent, documentType),
    [htmlContent, documentType],
  )

  /** عرض «الورقة» بالبكسل مع الحفاظ على نسبة أبعاد المقاس المختار داخل المساحة المتاحة */
  const paperFrameStyle = useMemo((): CSSProperties => {
    if (isThermal) {
      return {
        aspectRatio: `${baseW} / ${baseH}`,
        width: 'min(220px, 100%)',
        maxWidth: '100%',
        maxHeight: 'min(72vh, 520px)',
        height: 'auto',
        boxSizing: 'border-box',
      }
    }
    return {
      aspectRatio: `${baseW} / ${baseH}`,
      width: 'min(420px, calc(100% - 1rem))',
      maxWidth: '100%',
      maxHeight: 'min(calc(85vh - 140px), 640px)',
      height: 'auto',
      boxSizing: 'border-box',
    }
  }, [baseW, baseH, isThermal])

  const padMm = `${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm`
  const paperRatio = baseW / baseH
  const approxScaledHeightPx = useMemo(() => {
    const estW = isThermal ? 200 : 400
    return (estW / paperRatio) * scale
  }, [isThermal, paperRatio, scale])

  return (
    <div
      className="flex w-full max-w-full flex-col items-center justify-start overflow-auto rounded-xl border border-slate-200 bg-slate-100/80 p-4"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <p className="mb-2 w-full max-w-xl rounded-lg border border-slate-100 bg-white/90 px-2 py-1 text-center text-[10px] text-slate-500 shadow-sm">
        {isRtl ? 'معاينة مباشرة ببيانات تجريبية (Handlebars)' : 'Live preview with mock data (Handlebars)'}
      </p>
      <div
        className="flex w-full flex-col items-center"
        style={{
          marginBottom: `${Math.max(0, (scale - 1) * approxScaledHeightPx)}px`,
        }}
      >
        <div
          className="origin-top overflow-hidden bg-white text-slate-900 shadow-lg transition-transform duration-150 ease-out"
          style={{
            ...paperFrameStyle,
            transform: `scale(${scale})`,
            transformOrigin: 'top center',
            padding: padMm,
            borderTop: `4px solid ${accentColor}`,
            fontFamily: previewFontFamily,
            fontSize: `${previewFontSize}pt`,
            lineHeight: 1.45,
          }}
        >
          {htmlContent.trim() ? (
            <div
              className={`print-template-preview-html min-h-0 w-full min-w-0 break-words ${rendered.ok ? '' : 'opacity-90'}`}
              dangerouslySetInnerHTML={{ __html: rendered.html }}
            />
          ) : (
            <p className="py-6 text-center text-[9px] text-slate-400">{isRtl ? 'معاينة — أضف HTML' : 'Preview — add HTML'}</p>
          )}
        </div>
      </div>
    </div>
  )
}
