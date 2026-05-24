import { useEffect, useMemo, useRef, useState } from 'react'
import { buildPrintTemplateFrameDocument, isCanvasPrintTemplateHtml } from '../../utils/printTemplateRender'

type Props = {
  html: string
  widthCss: string
  accentColor?: string
  className?: string
}

/** يعرض HTML القالب داخل iframe لعزل CSS التطبيق — ضروري لقوالب اللوحة position:absolute */
export default function PrintTemplateHtmlFrame({ html, widthCss, accentColor = '#4f46e5', className = '' }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [frameHeight, setFrameHeight] = useState(1123)

  const srcDoc = useMemo(() => buildPrintTemplateFrameDocument(html, accentColor), [html, accentColor])

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    const resize = () => {
      try {
        const doc = iframe.contentDocument
        if (!doc?.body) return
        const h = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight, 400)
        setFrameHeight(h + 16)
      } catch {
        setFrameHeight(isCanvasPrintTemplateHtml(html) ? 1123 : 800)
      }
    }

    iframe.addEventListener('load', resize)
    const t = window.setTimeout(resize, 120)
    return () => {
      iframe.removeEventListener('load', resize)
      window.clearTimeout(t)
    }
  }, [html, srcDoc])

  return (
    <iframe
      ref={iframeRef}
      title="invoice-print-template"
      srcDoc={srcDoc}
      className={`block w-full border-0 bg-white ${className}`.trim()}
      style={{
        width: widthCss,
        maxWidth: '100%',
        height: `${frameHeight}px`,
        minHeight: isCanvasPrintTemplateHtml(html) ? '297mm' : '200mm',
      }}
    />
  )
}
