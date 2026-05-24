import { useMemo } from 'react'
import type { PrintDocumentType, PrintTemplate } from '../../types/printTemplate'
import { renderPrintTemplatePreview } from '../../utils/printTemplatePreviewMock'

type Props = {
  template: PrintTemplate
  className?: string
}

function thumbScale(paperSize: string): number {
  if (paperSize === 'thermal_58') return 0.38
  if (paperSize === 'thermal_80') return 0.32
  if (paperSize === 'A5') return 0.2
  return 0.17
}

export default function TemplateThumbnailPreview({ template, className = '' }: Props) {
  const docType = template.document_type as PrintDocumentType
  const scale = thumbScale(template.paper_size ?? 'A4')

  const preview = useMemo(
    () => renderPrintTemplatePreview(template.html_content ?? '', docType),
    [template.html_content, docType],
  )

  if (!preview.html.trim()) {
    return (
      <div className={`flex items-center justify-center h-full bg-slate-50 text-slate-400 text-xs ${className}`}>
        معاينة غير متاحة
      </div>
    )
  }

  return (
    <div className={`relative h-full w-full overflow-hidden bg-white ${className}`} dir="rtl">
      <div
        className="absolute top-2 right-2 left-2 origin-top-right pointer-events-none select-none"
        style={{
          transform: `scale(${scale})`,
          width: `${100 / scale}%`,
          minHeight: `${100 / scale}%`,
        }}
        dangerouslySetInnerHTML={{ __html: preview.html }}
      />
      {!preview.ok && (
        <div className="absolute bottom-1 left-1 right-1 text-[9px] text-red-600 bg-red-50 rounded px-1 py-0.5 truncate">
          خطأ في القالب
        </div>
      )}
    </div>
  )
}
