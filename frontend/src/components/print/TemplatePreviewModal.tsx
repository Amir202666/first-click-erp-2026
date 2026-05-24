import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { ChevronLeft, ChevronRight, FileDown, Monitor, Printer, Smartphone, X, Pencil } from 'lucide-react'
import type { PrintDocumentType, PrintMargins, PrintOrientation, PrintPaperSize, PrintTemplate } from '../../types/printTemplate'
import { paperOuterSizeMm } from '../../utils/printDesignerLayout'
import { DOC_TYPE_LABELS } from '../../utils/printUtils'
import { renderPrintTemplatePreview } from '../../utils/printTemplatePreviewMock'
import {
  PRINT_TEMPLATE_PRINT_MEDIA_CSS,
  PRINT_TEMPLATE_TABLE_PRINT_CSS,
  PRINT_TEMPLATE_TABLE_PROFESSIONAL_CSS,
} from '../../utils/printTemplatePrintCss'

export type TemplatePreviewModalTemplate = {
  id: number
  name: string
  document_type: PrintDocumentType
  paper_size: PrintPaperSize
  orientation: PrintOrientation
  margins: PrintMargins
  html_content: string
  settings?: Record<string, unknown> | null
}

export function toPrintPreviewModel(t: PrintTemplate): TemplatePreviewModalTemplate {
  return {
    id: t.id,
    name: t.name,
    document_type: t.document_type,
    paper_size: t.paper_size,
    orientation: t.orientation,
    margins: t.margins ?? { top: 10, right: 10, bottom: 10, left: 10 },
    html_content: t.html_content ?? '',
    settings: t.settings,
  }
}

function printPageSizeCss(m: TemplatePreviewModalTemplate): string {
  const { paper_size, orientation } = m
  if (paper_size === 'thermal_80') return '80mm auto'
  if (paper_size === 'thermal_58') return '58mm auto'
  if (paper_size === 'A5') return orientation === 'landscape' ? 'A5 landscape' : 'A5 portrait'
  return orientation === 'landscape' ? 'A4 landscape' : 'A4 portrait'
}

type Props = {
  open: boolean
  onClose: () => void
  template: TemplatePreviewModalTemplate
  allTemplates?: PrintTemplate[]
  isRtl?: boolean
  langAr?: boolean
  onEditTemplate?: (id: number) => void
}

export default function TemplatePreviewModal({
  open,
  onClose,
  template: initialTemplate,
  allTemplates = [],
  isRtl = true,
  langAr = true,
  onEditTemplate,
}: Props) {
  const L = langAr
  const [zoom, setZoom] = useState(65)
  const [deviceMode, setDeviceMode] = useState<'desktop' | 'mobile'>('desktop')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [pdfBusy, setPdfBusy] = useState(false)
  const paperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    if (initialTemplate.id === 0) {
      setCurrentIndex(-1)
      return
    }
    const i = allTemplates.findIndex((t) => t.id === initialTemplate.id)
    setCurrentIndex(i >= 0 ? i : 0)
    setZoom(65)
    setDeviceMode('desktop')
  }, [open, initialTemplate.id, allTemplates])

  const current = useMemo((): TemplatePreviewModalTemplate => {
    if (initialTemplate.id === 0) return initialTemplate
    if (!allTemplates.length) return initialTemplate
    if (currentIndex < 0 || currentIndex >= allTemplates.length) return initialTemplate
    return toPrintPreviewModel(allTemplates[currentIndex])
  }, [allTemplates, currentIndex, initialTemplate])

  const previewExtra = useMemo(() => {
    const accent =
      (typeof current.settings?.accent_color === 'string' && current.settings.accent_color) ||
      (current.document_type === 'invoice' ? '#4f46e5' : '#059669')
    return { accent_color: accent }
  }, [current.document_type, current.settings?.accent_color])

  const rendered = useMemo(
    () => renderPrintTemplatePreview(current.html_content ?? '', current.document_type, previewExtra),
    [current.html_content, current.document_type, previewExtra],
  )

  const isThermal = current.paper_size === 'thermal_80' || current.paper_size === 'thermal_58'
  const outerMm = useMemo(() => paperOuterSizeMm(current.paper_size, current.orientation), [current.paper_size, current.orientation])

  const paperBoxStyle = useMemo((): CSSProperties => {
    const pad = `${current.margins.top}mm ${current.margins.right}mm ${current.margins.bottom}mm ${current.margins.left}mm`
    const fontFamily =
      (typeof current.settings?.font_family === 'string' && current.settings.font_family) ||
      (typeof current.settings?.font === 'string' && current.settings.font) ||
      'Cairo, Tahoma, sans-serif'
    const fontSize = typeof current.settings?.font_size === 'number' ? current.settings.font_size : 10
    const accent =
      (typeof current.settings?.accent_color === 'string' && current.settings.accent_color) || '#059669'

    if (isThermal) {
      const w = current.paper_size === 'thermal_80' ? '80mm' : '58mm'
      return {
        width: w,
        minHeight: 'auto',
        overflow: 'visible',
        padding: pad,
        fontFamily,
        fontSize: `${fontSize}pt`,
        lineHeight: 1.45,
        boxSizing: 'border-box',
        background: '#fff',
        borderRadius: 4,
        boxShadow: '0 25px 50px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.06)',
        borderTop: `4px solid ${accent}`,
        ['--accent' as string]: accent,
      }
    }

    if (deviceMode === 'mobile') {
      return {
        width: '375px',
        minHeight: '640px',
        maxWidth: '100%',
        overflow: 'visible',
        padding: pad,
        fontFamily,
        fontSize: `${fontSize}pt`,
        lineHeight: 1.45,
        boxSizing: 'border-box',
        background: '#fff',
        borderRadius: 12,
        boxShadow: '0 25px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)',
        borderTop: `4px solid ${accent}`,
        ['--accent' as string]: accent,
      }
    }

    return {
      width: `${outerMm.w}mm`,
      minHeight: `${outerMm.h}mm`,
      overflow: 'visible',
      padding: pad,
      fontFamily,
      fontSize: `${fontSize}pt`,
      lineHeight: 1.45,
      boxSizing: 'border-box',
      background: '#fff',
      borderRadius: 2,
      boxShadow: '0 25px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)',
      borderTop: `4px solid ${accent}`,
      ['--accent' as string]: accent,
    }
  }, [current, deviceMode, isThermal, outerMm.h, outerMm.w])

  const [scaledBox, setScaledBox] = useState({ w: 400, h: 600 })

  useLayoutEffect(() => {
    if (!open) return
    const el = paperRef.current
    if (!el) return
    const z = zoom / 100
    const measure = () => {
      const p = paperRef.current
      if (!p) return
      setScaledBox({
        w: Math.max(32, Math.ceil(p.offsetWidth * z)),
        h: Math.max(32, Math.ceil(p.offsetHeight * z)),
      })
    }
    measure()
    const raf = requestAnimationFrame(() => measure())
    const ro = new ResizeObserver(() => measure())
    ro.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [open, zoom, rendered.ok, rendered.html, paperBoxStyle, deviceMode, current.paper_size, current.orientation, current.html_content])

  const fitToScreen = useCallback(() => {
    if (typeof window === 'undefined') return
    if (isThermal) {
      setZoom(100)
      return
    }
    const MM_TO_PX = 3.7795275591
    const paperHeightPx = deviceMode === 'mobile' ? 640 : outerMm.h * MM_TO_PX
    const canvasHeight = window.innerHeight - 180
    const fit = Math.floor((canvasHeight / paperHeightPx) * 100)
    setZoom(Math.min(100, Math.max(40, fit)))
  }, [deviceMode, isThermal, outerMm.h])

  const docTypeLabel = L ? DOC_TYPE_LABELS[current.document_type].ar : DOC_TYPE_LABELS[current.document_type].en

  const handlePrint = useCallback(() => {
    const html = rendered.ok ? rendered.html : ''
    const title = escapeHtml(current.name || 'Print')
    const page = printPageSizeCss(current)
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&family=Tajawal:wght@400;500;700&display=swap" rel="stylesheet"/>
<style>
  body{margin:0;padding:0;font-family:Cairo,Tajawal,Tahoma,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  @page{size:${page};margin:0;}
  ${PRINT_TEMPLATE_TABLE_PROFESSIONAL_CSS}
  ${PRINT_TEMPLATE_TABLE_PRINT_CSS}
  ${PRINT_TEMPLATE_PRINT_MEDIA_CSS}
</style>
</head>
<body>${html}</body>
</html>`)
    w.document.close()
    w.focus()
    requestAnimationFrame(() => {
      w.print()
      w.close()
    })
  }, [current, rendered])

  const handleExportPdf = useCallback(async () => {
    const el = paperRef.current
    if (!el) return
    setPdfBusy(true)
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
      const fmt = isThermal ? [current.paper_size === 'thermal_80' ? 80 : 58, 297] as [number, number] : 'a4'
      const pdf = new jsPDF({
        orientation: current.orientation === 'landscape' && !isThermal ? 'l' : 'p',
        unit: 'mm',
        format: isThermal ? fmt : 'a4',
        compress: true,
      })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const imgW = pageW
      const imgH = (canvas.height * imgW) / canvas.width
      let heightLeft = imgH
      let y = 0
      pdf.addImage(imgData, 'PNG', 0, y, imgW, imgH, undefined, 'FAST')
      heightLeft -= pageH
      while (heightLeft > 1) {
        y = heightLeft - imgH
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, y, imgW, imgH, undefined, 'FAST')
        heightLeft -= pageH
      }
      const safe = (current.name || 'template').replace(/[^\w\u0600-\u06FF-]+/g, '_').slice(0, 80)
      pdf.save(`${safe}.pdf`)
    } catch {
      // eslint-disable-next-line no-console
      console.error('PDF export failed')
    } finally {
      setPdfBusy(false)
    }
  }, [current.name, current.orientation, current.paper_size, isThermal])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null

  const fontLabel =
    (typeof current.settings?.font_family === 'string' && current.settings.font_family) ||
    (typeof current.settings?.font === 'string' && current.settings.font) ||
    'Cairo'
  const fontSizeVal = typeof current.settings?.font_size === 'number' ? current.settings.font_size : 10
  const accent =
    (typeof current.settings?.accent_color === 'string' && current.settings.accent_color) || '#059669'

  const nav = allTemplates.length > 1 && initialTemplate.id !== 0

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" dir={isRtl ? 'rtl' : 'ltr'}>
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-default"
        aria-label={L ? 'إغلاق' : 'Close'}
        onClick={onClose}
      />

      <div
        className="relative flex flex-col overflow-hidden rounded-2xl border border-gray-800 bg-gray-950 shadow-2xl"
        style={{ width: 'min(92vw, 1200px)', height: 'min(94vh, 900px)' }}
        role="dialog"
        aria-modal
        aria-labelledby="template-preview-modal-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-b border-gray-800 bg-gray-900 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
              aria-label={L ? 'إغلاق' : 'Close'}
            >
              <X size={18} />
            </button>
            <div className="min-w-0">
              <p id="template-preview-modal-title" className="truncate text-sm font-semibold text-white">
                {current.name}
              </p>
              <p className="text-[11px] text-gray-500">
                {docTypeLabel} · {current.paper_size} · {L ? 'بيانات تجريبية' : 'Mock data'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            {!isThermal && (
              <div className="flex rounded-lg bg-gray-800 p-0.5">
                <button
                  type="button"
                  onClick={() => setDeviceMode('desktop')}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all ${
                    deviceMode === 'desktop' ? 'bg-white text-gray-900' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Monitor size={14} /> A4
                </button>
                <button
                  type="button"
                  onClick={() => setDeviceMode('mobile')}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all ${
                    deviceMode === 'mobile' ? 'bg-white text-gray-900' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Smartphone size={14} /> {L ? 'موبايل' : 'Mobile'}
                </button>
              </div>
            )}

            <div className="flex items-center gap-0.5 rounded-lg bg-gray-800 px-1.5 py-1">
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded text-sm text-gray-400 hover:bg-gray-700 hover:text-white"
                onClick={() => setZoom((z) => Math.max(40, z - 10))}
              >
                −
              </button>
              <span className="min-w-[42px] text-center text-xs text-gray-300">{zoom}%</span>
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded text-sm text-gray-400 hover:bg-gray-700 hover:text-white"
                onClick={() => setZoom((z) => Math.min(160, z + 10))}
              >
                +
              </button>
            </div>
            <button
              type="button"
              className="text-xs text-gray-500 hover:text-gray-300"
              onClick={() => setZoom(65)}
            >
              {L ? 'إعادة ضبط' : 'Reset'}
            </button>
            {!isThermal && (
              <button
                type="button"
                className="text-xs text-gray-400 hover:text-white px-2 py-1 hover:bg-gray-700 rounded transition-colors"
                onClick={fitToScreen}
                title={L ? 'ملاءمة الشاشة' : 'Fit to screen'}
              >
                ⊡ {L ? 'ملاءمة' : 'Fit'}
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {nav && (
              <div className="flex items-center gap-1 rounded-lg bg-gray-800 px-2 py-1">
                <button
                  type="button"
                  disabled={currentIndex <= 0}
                  className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-gray-700 hover:text-white disabled:opacity-30"
                  onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                  aria-label={L ? 'القالب السابق' : 'Previous template'}
                >
                  <ChevronRight size={18} className={isRtl ? '' : 'rotate-180'} />
                </button>
                <span className="text-xs text-gray-400">
                  {currentIndex + 1}/{allTemplates.length}
                </span>
                <button
                  type="button"
                  disabled={currentIndex >= allTemplates.length - 1}
                  className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-gray-700 hover:text-white disabled:opacity-30"
                  onClick={() => setCurrentIndex((i) => Math.min(allTemplates.length - 1, i + 1))}
                  aria-label={L ? 'القالب التالي' : 'Next template'}
                >
                  <ChevronLeft size={18} className={isRtl ? '' : 'rotate-180'} />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 rounded-lg bg-gray-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-600"
            >
              <Printer size={14} /> {L ? 'طباعة' : 'Print'}
            </button>
            <button
              type="button"
              disabled={pdfBusy}
              onClick={() => void handleExportPdf()}
              className="flex items-center gap-1.5 rounded-lg bg-gray-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-600 disabled:opacity-50"
            >
              <FileDown size={14} /> {pdfBusy ? '…' : L ? 'PDF' : 'PDF'}
            </button>
            {onEditTemplate && current.id > 0 && (
              <button
                type="button"
                onClick={() => onEditTemplate(current.id)}
                className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-teal-500"
              >
                <Pencil size={14} /> {L ? 'تحرير القالب' : 'Edit template'}
              </button>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 divide-x divide-gray-800 overflow-hidden">
          {/* Sidebar */}
          <aside className="w-52 flex-shrink-0 overflow-y-auto bg-gray-900 p-3 sm:w-56">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              {L ? 'معلومات القالب' : 'Template info'}
            </p>
            <dl className="space-y-2 text-[11px]">
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">{L ? 'الاسم' : 'Name'}</dt>
                <dd className="max-w-[120px] truncate text-end font-medium text-gray-300">{current.name}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">{L ? 'النوع' : 'Type'}</dt>
                <dd className="text-end font-medium text-gray-300">{docTypeLabel}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">{L ? 'الورق' : 'Paper'}</dt>
                <dd className="text-end font-medium text-gray-300">{current.paper_size}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">{L ? 'الاتجاه' : 'Orientation'}</dt>
                <dd className="text-end font-medium text-gray-300">
                  {current.orientation === 'landscape' ? (L ? 'أفقي' : 'Landscape') : L ? 'عمودي' : 'Portrait'}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">{L ? 'الخط' : 'Font'}</dt>
                <dd className="text-end font-medium text-gray-300">{fontLabel}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">{L ? 'حجم الخط' : 'Size'}</dt>
                <dd className="text-end font-medium text-gray-300">{fontSizeVal}pt</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-gray-500">{L ? 'التمييز' : 'Accent'}</dt>
                <dd className="flex items-center gap-1.5">
                  <span className="h-4 w-4 rounded-full border border-gray-700" style={{ background: accent }} />
                  <span className="font-mono text-[10px] text-gray-400">{accent}</span>
                </dd>
              </div>
            </dl>

            <div className="my-3 border-t border-gray-800" />

            <div className="rounded-xl border border-amber-700/40 bg-amber-900/25 p-2.5">
              <p className="mb-1 text-[10px] font-semibold text-amber-400">⚠ {L ? 'بيانات تجريبية' : 'Mock data'}</p>
              <p className="text-[10px] leading-relaxed text-amber-200/80">
                {L
                  ? 'المعاينة تستخدم بيانات وهمية. البيانات الحقيقية تظهر عند الطباعة من النظام.'
                  : 'Preview uses sample data. Real data appears when printing from the app.'}
              </p>
            </div>

            {nav && (
              <>
                <div className="my-3 border-t border-gray-800" />
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  {L ? 'قوالب أخرى' : 'Other templates'}
                </p>
                <ul className="max-h-40 space-y-1 overflow-y-auto">
                  {allTemplates.map((t, i) => {
                    const ac = (t.settings?.accent_color as string) || '#6366f1'
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => setCurrentIndex(i)}
                          className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-[11px] transition-colors ${
                            i === currentIndex
                              ? 'border border-teal-700/50 bg-teal-900/40 text-teal-200'
                              : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                          }`}
                        >
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: ac }} />
                          <span className="truncate">{t.name}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </aside>

          {/* Canvas */}
          <div
            className="flex min-w-0 flex-1 items-start justify-center overflow-auto bg-gray-800/95 p-4 sm:p-6"
            style={{
              backgroundImage: 'radial-gradient(circle, #4b5563 1px, transparent 1px)',
              backgroundSize: '22px 22px',
            }}
          >
            <div
              className="flex-shrink-0"
              style={{
                width: scaledBox.w,
                height: scaledBox.h,
                position: 'relative',
              }}
            >
              <div
                ref={paperRef}
                className="print-template-preview-html text-slate-900"
                style={{
                  ...paperBoxStyle,
                  position: 'absolute',
                  top: 0,
                  ...(isRtl ? { right: 0, left: 'auto' } : { left: 0, right: 'auto' }),
                  transform: `scale(${zoom / 100})`,
                  transformOrigin: isRtl ? 'top right' : 'top left',
                  overflow: 'visible',
                }}
                dangerouslySetInnerHTML={{
                  __html: rendered.ok
                    ? rendered.html
                    : `<p style="padding:24px;color:#94a3b8">${L ? 'لا يوجد محتوى' : 'No content'}</p>`,
                }}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-t border-gray-800 bg-gray-900 px-4 py-2">
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500">
            <span>
              {isThermal ? current.paper_size : `${outerMm.w}×${outerMm.h} mm`}
            </span>
            <span>· {zoom}%</span>
            <span>· {L ? 'جاهز للطباعة' : 'Print ready'}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 transition-colors hover:border-gray-600 hover:text-white"
          >
            {L ? 'إغلاق' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  )
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
}
