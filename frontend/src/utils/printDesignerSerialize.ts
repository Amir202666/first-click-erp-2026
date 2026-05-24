import type { PrintMargins, PrintOrientation, PrintPaperSize, PrintTemplate } from '../types/printTemplate'
import type { CanvasElement } from './printDesignerTypes'
import { elementStyleToCss, getElementStyle, isBlockFillElement } from './printElementStyle'
import { createCanvasId } from './printDesignerTypes'
import { stripVariableCode, upgradePrintVariableExpression } from './printDesignerVariable'
import { normalizeTableElement, renderTableHtml } from './printDesignerTable'
import { normalizeTotalsTableElement, renderTotalsTableHtml } from './printDesignerTotalsTable'
import type { CanvasTableEl, CanvasTotalsTableEl } from './printDesignerTypes'
import {
  ensureCanvasLayouts,
  hasValidCanvasLayout,
  paperContentSizeMm,
  paperOuterSizeMm,
} from './printDesignerLayout'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function wrapAbsolute(el: CanvasElement, inner: string): string {
  if (!hasValidCanvasLayout(el)) return inner
  const { xMm, yMm, wMm, hMm } = el.layout
  if (el.type === 'table') {
    return `<div class="print-canvas-table-wrap" style="position:absolute;left:${xMm}mm;top:${yMm}mm;width:${wMm}mm;height:auto;min-height:0;overflow:visible;box-sizing:border-box;">${inner}</div>`
  }
  if (el.type === 'totals_table') {
    return `<div class="print-canvas-totals-anchor" style="position:absolute;left:${xMm}mm;top:${yMm}mm;width:${wMm}mm;height:auto;min-height:0;overflow:visible;box-sizing:border-box;">${inner}</div>`
  }
  return (
    '<div style="position:absolute;left:' +
    xMm +
    'mm;top:' +
    yMm +
    'mm;width:' +
    wMm +
    'mm;min-height:' +
    hMm +
    'mm;height:auto;overflow:visible;box-sizing:border-box;">' +
    inner +
    '</div>'
  )
}

function renderElement(el: CanvasElement, pageFontFamily: string): string {
  const st = getElementStyle(el)
  const baseStyle = elementStyleToCss(
    isBlockFillElement(el) ? { ...st, alignItems: 'stretch', justifyContent: 'flex-start' } : st,
    { fontFamily: pageFontFamily },
    el.type === 'table' || el.type === 'totals_table' ? { fillHeight: false } : undefined,
  )
  switch (el.type) {
    case 'variable':
      return `<p style="${baseStyle};height:auto;overflow:visible;white-space:normal;">${upgradePrintVariableExpression(el.var)}</p>`
    case 'text':
      return `<p style="${baseStyle};height:auto;overflow:visible;white-space:pre-wrap;">${escapeHtml(el.text)}</p>`
    case 'divider':
      return '<div style="margin:0;height:100%;display:flex;align-items:center;box-sizing:border-box;"><hr style="width:100%;border:none;border-top:1px solid #e2e8f0;margin:0" /></div>'
    case 'spacer': {
      const h = Math.max(1, el.heightMm || 4)
      return `<div style="height:${h}mm" data-spacer="1"></div>`
    }
    case 'box':
      return `<div style="height:100%;min-height:${el.minHeightMm ?? 20}mm;border:1px dashed #cbd5e1;border-radius:8px;padding:6px;box-sizing:border-box;"></div>`
    case 'table':
      return renderTableHtml(normalizeTableElement(el as CanvasTableEl), pageFontFamily, baseStyle)
    case 'totals_table':
      return renderTotalsTableHtml(
        normalizeTotalsTableElement(el as CanvasTotalsTableEl),
        pageFontFamily,
        baseStyle,
      )
    case 'image':
      return `<div style="margin:0;height:100%;display:flex;align-items:center;justify-content:center;"><img alt="" src="${escapeHtml(el.src)}" style="max-width:100%;max-height:100%;object-fit:contain;" /></div>`
    case 'qr':
      return `<p style="margin:6px 0;font-size:9pt;color:#64748b;">[QR]</p>`
    case 'barcode':
      return `<p style="margin:6px 0;font-size:9pt;color:#64748b;">[Barcode]</p>`
    case 'html_embed':
      return el.html || ''
    default:
      return ''
  }
}

export function serializeCanvasToHtml(
  elements: CanvasElement[],
  opts: {
    fontFamily: string
    fontSize: number
    accentColor: string
    textColor?: string
    formatBold?: boolean
    formatItalic?: boolean
    formatUnderline?: boolean
    paperSize: PrintPaperSize
    orientation: PrintOrientation
    margins: PrintMargins
  },
): string {
  const margins = opts.margins
  const rows = ensureCanvasLayouts(elements, opts.paperSize, opts.orientation, margins)
  const { w: cw, h: ch } = paperContentSizeMm(opts.paperSize, opts.orientation, margins)
  let bottomMm = ch
  for (const el of rows) {
    if (hasValidCanvasLayout(el)) bottomMm = Math.max(bottomMm, el.layout.yMm + el.layout.hMm)
  }
  const inner = rows.map((el) => wrapAbsolute(el, renderElement(el, opts.fontFamily))).join('\n')
  let extra = ''
  if (opts.formatBold) extra += 'font-weight:700;'
  if (opts.formatItalic) extra += 'font-style:italic;'
  if (opts.formatUnderline) extra += 'text-decoration:underline;'
  const { w: pageW } = paperOuterSizeMm(opts.paperSize, opts.orientation)
  const pad = `${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm`
  return `<div class="print-doc-root" style="font-family:${escapeHtml(opts.fontFamily)};font-size:${Number(opts.fontSize) || 10}pt;color:${escapeHtml(opts.textColor ?? '#0f172a')};--accent:${escapeHtml(opts.accentColor)};${extra}width:100%;max-width:${pageW}mm;margin:0;padding:${pad};box-sizing:border-box;position:relative;"><div class="print-doc-abs-root" style="position:relative;width:100%;max-width:100%;margin:0;min-height:0;height:auto">${inner}</div></div>`
}

function isCanvasElement(x: unknown): x is CanvasElement {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return typeof o.id === 'string' && typeof o.type === 'string'
}

export function loadCanvasFromTemplate(template: PrintTemplate): CanvasElement[] {
  const raw = template.settings?.canvas_elements
  const htmlFromTemplate = template.html_content?.trim() ?? ''

  if (Array.isArray(raw) && raw.length > 0) {
    const cleaned = raw.filter(isCanvasElement) as CanvasElement[]
    if (cleaned.length > 0) {
      const merged = cleaned.map((el) => {
        if (el.type === 'html_embed') {
          const h = typeof el.html === 'string' ? el.html.trim() : ''
          if (!h && htmlFromTemplate) {
            return { ...el, html: htmlFromTemplate }
          }
        }
        if (el.type === 'table') return normalizeTableElement(el as CanvasTableEl)
        if (el.type === 'totals_table') return normalizeTotalsTableElement(el as CanvasTotalsTableEl)
        if (el.type === 'variable') {
          return { ...el, var: upgradePrintVariableExpression(el.var) }
        }
        return el
      })
      const onlyEmptyHtmlBlock =
        merged.length === 1 &&
        merged[0].type === 'html_embed' &&
        !(typeof merged[0].html === 'string' && merged[0].html.trim())
      if (!onlyEmptyHtmlBlock) {
        const m = template.margins ?? { top: 10, right: 10, bottom: 10, left: 10 }
        return ensureCanvasLayouts(merged, template.paper_size, template.orientation, m)
      }
    }
  }

  if (htmlFromTemplate) {
    return [{ id: createCanvasId(), type: 'html_embed', label: 'HTML', html: htmlFromTemplate }]
  }
  return []
}

export type PrintDesignerPreset = { id: string; label: string; build: () => CanvasElement[] }

function L(xMm: number, yMm: number, wMm: number, hMm: number) {
  return { xMm, yMm, wMm, hMm }
}

/** قالب فاتورة احترافي بمواضع حرة — مثل محرر القوالب المرجعي */
export function buildProInvoiceCanvas(): CanvasElement[] {
  const id = createCanvasId
  return [
    { id: id(), type: 'variable', label: 'اسم الشركة', var: '{{company.name}}', layout: L(0, 2, 95, 8), visible: true },
    { id: id(), type: 'variable', label: 'الرقم الضريبي', var: '{{company.tax_no}}', layout: L(0, 11, 95, 6), visible: true },
    { id: id(), type: 'variable', label: 'عنوان الشركة', var: '{{company.address}}', layout: L(0, 18, 95, 6), visible: true },
    { id: id(), type: 'image', label: 'شعار', src: '{{company.logo}}', layout: L(155, 2, 35, 22), visible: true },
    { id: id(), type: 'text', label: 'رقم المرجع', text: 'رقم المرجع:', layout: L(108, 4, 28, 5), visible: true },
    { id: id(), type: 'variable', label: 'رقم الفاتورة', var: '{{inv.number}}', layout: L(136, 4, 54, 6), visible: true },
    { id: id(), type: 'text', label: 'تاريخ الإصدار', text: 'تاريخ الإصدار:', layout: L(108, 12, 32, 5), visible: true },
    { id: id(), type: 'variable', label: 'التاريخ', var: '{{inv.date}}', layout: L(136, 12, 54, 6), visible: true },
    { id: id(), type: 'text', label: 'حالة الدفع', text: 'حالة الدفع:', layout: L(108, 20, 28, 5), visible: true },
    { id: id(), type: 'variable', label: 'طريقة الدفع', var: '{{inv.payment_method}}', layout: L(136, 20, 54, 6), visible: true },
    { id: id(), type: 'text', label: 'اسم العميل', text: 'اسم العميل:', layout: L(0, 32, 28, 5), visible: true },
    { id: id(), type: 'variable', label: 'العميل', var: '{{customer.name}}', layout: L(28, 32, 80, 6), visible: true },
    { id: id(), type: 'text', label: 'هاتف العميل', text: 'هاتف العميل:', layout: L(0, 40, 28, 5), visible: true },
    { id: id(), type: 'variable', label: 'هاتف', var: '{{customer.phone}}', layout: L(28, 40, 80, 6), visible: true },
    {
      id: id(),
      type: 'table',
      label: 'جدول الأصناف',
      layout: L(0, 52, 190, 28),
      visible: true,
      columns: [
        { key: 'name', label: 'البند', widthPercent: 40, align: 'right' },
        { key: 'qty', label: 'الكمية', widthPercent: 15, align: 'center' },
        { key: 'price', label: 'السعر', widthPercent: 22, align: 'left' },
        { key: 'total', label: 'الإجمالي', widthPercent: 23, align: 'left' },
      ],
      showTitle: true,
    },
    {
      id: id(),
      type: 'totals_table',
      label: 'جدول الإجماليات',
      layout: L(0, 132, 190, 36),
      visible: true,
      anchorBelowItems: true,
      showHeader: true,
    },
    { id: id(), type: 'qr', label: 'QR', layout: L(0, 165, 28, 28), visible: true },
    { id: id(), type: 'variable', label: 'ملاحظات', var: '{{inv.notes}}', layout: L(32, 168, 155, 12), visible: true },
  ]
}

export function getPrintDesignerPresets(): PrintDesignerPreset[] {
  return [
    {
      id: 'empty',
      label: '— فارغ —',
      build: () => [],
    },
    {
      id: 'classic_invoice',
      label: 'فاتورة احترافية',
      build: buildProInvoiceCanvas,
    },
    {
      id: 'modern_invoice',
      label: 'فاتورة عصرية',
      build: () => [
        {
          id: createCanvasId(),
          type: 'box',
          minHeightMm: 28,
        },
        { id: createCanvasId(), type: 'text', label: 'عنوان', text: 'فاتورة' },
        { id: createCanvasId(), type: 'variable', label: 'الشركة', var: '{{company.name}}' },
        { id: createCanvasId(), type: 'divider' },
        { id: createCanvasId(), type: 'variable', label: 'رقم', var: '{{inv.number}}' },
        { id: createCanvasId(), type: 'variable', label: 'تاريخ', var: '{{inv.date}}' },
        { id: createCanvasId(), type: 'variable', label: 'عميل', var: '{{customer.name}}' },
        { id: createCanvasId(), type: 'table', label: 'أصناف' },
        { id: createCanvasId(), type: 'variable', label: 'صافي', var: '{{total.net}}' },
      ],
    },
    {
      id: 'thermal_pos',
      label: 'إيصال حراري',
      build: () => [
        { id: createCanvasId(), type: 'variable', label: 'شركة', var: '{{company.name}}' },
        { id: createCanvasId(), type: 'divider' },
        { id: createCanvasId(), type: 'variable', label: 'رقم', var: '{{inv.number}}' },
        { id: createCanvasId(), type: 'variable', label: 'تاريخ', var: '{{inv.date}}' },
        { id: createCanvasId(), type: 'table', label: 'سطور' },
        { id: createCanvasId(), type: 'variable', label: 'الإجمالي', var: '{{total.net}}' },
      ],
    },
  ]
}
