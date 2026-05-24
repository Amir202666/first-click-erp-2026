import { useMemo } from 'react'
import type { PrintOrientation, PrintPaperSize } from '../../types/printTemplate'
import { paperOuterSizeMm } from '../../utils/printDesignerLayout'
import { PRINT_TEMPLATE_CANVAS_PREVIEW_CSS } from '../../utils/printTemplatePrintCss'

type Props = {
  html: string
  accentColor?: string
  paperSize?: PrintPaperSize
  orientation?: PrintOrientation
  className?: string
  style?: React.CSSProperties
}

/**
 * معاينة قالب الطباعة — نفس أسلوب TemplatePreviewModal (HTML مباشر، بدون iframe).
 */
export default function PrintTemplateHtmlView({
  html,
  accentColor = '#4f46e5',
  paperSize = 'A4',
  orientation = 'portrait',
  className = '',
  style,
}: Props) {
  const outerMm = useMemo(() => paperOuterSizeMm(paperSize, orientation), [paperSize, orientation])

  if (!html.trim()) return null

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[PrintTemplateHtmlView]', {
      htmlLen: html.length,
      preview: html.substring(0, 200),
    })
  }

  return (
    <div
      className={`print-template-html-view relative z-10 w-full overflow-x-auto ${className}`.trim()}
      style={{ background: '#fff', ...style }}
    >
      <style>{PRINT_TEMPLATE_CANVAS_PREVIEW_CSS}</style>
      <div
        className="print-template-preview-html mx-auto text-slate-900 bg-white"
        style={{
          width: `${outerMm.w}mm`,
          maxWidth: '100%',
          minHeight: `${outerMm.h}mm`,
          position: 'relative',
          overflow: 'visible',
          boxSizing: 'border-box',
          fontFamily: 'Cairo, Tajawal, Tahoma, Arial, sans-serif',
          direction: 'rtl',
          color: '#0f172a',
          lineHeight: 1.45,
          ['--accent' as string]: accentColor,
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
