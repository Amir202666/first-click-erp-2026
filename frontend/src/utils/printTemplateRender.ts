import type {
  PrintDocumentType,
  PrintMargins,
  PrintOrientation,
  PrintPaperSize,
  PrintTemplate,
} from '../types/printTemplate'
import {
  PRINT_TEMPLATE_CANVAS_FRAME_CSS,
  PRINT_TEMPLATE_FRAME_PRINT_CSS,
} from './printTemplatePrintCss'
import { paperContentSizeMm, paperOuterSizeMm } from './printDesignerLayout'
import { printTemplatePageSizeCss } from './printTemplateInvoiceContext'
import { loadCanvasFromTemplate, serializeCanvasToHtml } from './printDesignerSerialize'
import type { CanvasElement } from './printDesignerTypes'
import { renderPrintTemplatePreview } from './printTemplatePreviewMock'

/** هل HTML فيه هيكل كافٍ للعرض (أقل صرامة من التحقق النصي) */
export function hasRenderablePrintHtml(html: string | null | undefined): boolean {
  const trimmed = (html ?? '').trim()
  if (!trimmed) return false
  return trimmed.length > 50 && trimmed.includes('<')
}

/** هل HTML المُصَرَّف يحتوي نصاً فعلياً (وليس هيكلاً فارغاً) */
export function hasSubstantivePrintHtml(html: string | null | undefined): boolean {
  const trimmed = (html ?? '').trim()
  if (!trimmed) return false
  if (hasRenderablePrintHtml(trimmed)) {
    const raw = trimmed.replace(/<style[\s\S]*?<\/style>/gi, '').trim()
    const text = raw
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&#\d+;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (text.length >= 8) return true
    if (trimmed.length > 200 && /print-doc-(abs-)?root|invoice-custom-template|<table/i.test(trimmed)) {
      return true
    }
  }
  return false
}

export function isCanvasPrintTemplateHtml(html: string | null | undefined): boolean {
  return /print-doc-abs-root/i.test(html ?? '')
}

function isCanvasElement(x: unknown): x is CanvasElement {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return typeof o.id === 'string' && typeof o.type === 'string'
}

/**
 * يفضّل إعادة توليد HTML من canvas_elements المحفوظة (أحدث قواعد العرض)
 * وإلا يستخدم html_content من قاعدة البيانات.
 */
export function resolvePrintTemplateHtmlSource(template: PrintTemplate): string {
  const stored = (template.html_content ?? '').trim()
  const settings = template.settings ?? {}
  const raw = settings.canvas_elements
  if (!Array.isArray(raw) || raw.length === 0) return stored

  const elements = loadCanvasFromTemplate(template)
  if (elements.length === 0) return stored
  if (elements.length === 1 && elements[0].type === 'html_embed') {
    const h = typeof elements[0].html === 'string' ? elements[0].html.trim() : ''
    if (h) return h
    return stored
  }

  const margins = template.margins ?? { top: 10, right: 10, bottom: 10, left: 10 }
  const cleaned = raw.filter(isCanvasElement) as CanvasElement[]
  if (cleaned.length === 0) return stored

  try {
    return serializeCanvasToHtml(elements, {
      fontFamily: typeof settings.font_family === 'string' ? settings.font_family : 'Segoe UI',
      fontSize: typeof settings.font_size === 'number' ? settings.font_size : 10,
      accentColor: typeof settings.accent_color === 'string' ? settings.accent_color : '#4f46e5',
      textColor: typeof settings.text_color === 'string' ? settings.text_color : '#0f172a',
      formatBold: !!settings.format_bold,
      formatItalic: !!settings.format_italic,
      formatUnderline: !!settings.format_underline,
      paperSize: template.paper_size,
      orientation: template.orientation,
      margins,
    })
  } catch {
    return stored
  }
}

/** إصلاح خفيف لقوالب اللوحة عند الطباعة (iframe / نافذة جديدة) */
export function fixCanvasPrintHtmlForScreen(html: string): string {
  if (!isCanvasPrintTemplateHtml(html)) return html
  let out = html
  out = out.replace(
    /position\s*:\s*absolute;([^"]*?)height\s*:\s*[\d.]+mm;([^"]*?)overflow\s*:\s*hidden/gi,
    'position:absolute;$1height:auto;min-height:0;$2overflow:visible',
  )
  out = out.replace(
    /(class="print-canvas-table-wrap"[^>]*style="[^"]*?)height\s*:\s*[\d.]+mm/gi,
    '$1height:auto',
  )
  out = out.replace(
    /(class="print-canvas-table-wrap"[^>]*style="[^"]*?)min-height\s*:\s*[\d.]+mm/gi,
    '$1min-height:0',
  )
  out = out.replace(/overflow\s*:\s*hidden/gi, 'overflow:visible')
  out = out.replace(/height\s*:\s*100%/gi, 'height:auto')
  out = out.replace(/margin\s*:\s*0\s+0\s+16px\s+0/gi, 'margin:0')
  out = out.replace(/margin-bottom\s*:\s*16px/gi, 'margin-bottom:0')
  out = out.replace(
    /(class="print-doc-abs-root"[^>]*style="[^"]*?)min-height\s*:\s*[\d.]+mm/gi,
    '$1min-height:0',
  )
  out = out.replace(/min-height\s*:\s*297mm/gi, 'min-height:auto')
  out = out.replace(/min-height\s*:\s*280mm/gi, 'min-height:auto')
  out = out.replace(/height\s*:\s*297mm/gi, 'height:auto')
  out = out.replace(/white-space\s*:\s*nowrap/gi, 'white-space:normal')
  out = out.replace(/text-overflow\s*:\s*ellipsis/gi, '')
  return stripForcedPageHeightsFromHtml(out)
}

function mergeInlineStyle(existing: string | null, patch: Record<string, string>): string {
  const map = new Map<string, string>()
  for (const chunk of (existing ?? '').split(';')) {
    const part = chunk.trim()
    if (!part) continue
    const i = part.indexOf(':')
    if (i < 0) continue
    map.set(part.slice(0, i).trim().toLowerCase(), part.slice(i + 1).trim())
  }
  for (const [k, v] of Object.entries(patch)) map.set(k.toLowerCase(), v)
  return [...map.entries()].map(([k, v]) => `${k}:${v}`).join(';')
}

const MIN_UNWRAP_HTML_LEN = 50

function unwrapResultOrFallback(result: string | null | undefined, fallback: string): string {
  const trimmed = (result ?? '').trim()
  if (trimmed.length >= MIN_UNWRAP_HTML_LEN) return trimmed
  return fallback
}

/** إزالة min-height/height الثابتة التي تفرض صفحات إضافية */
function stripForcedPageHeightsFromHtml(html: string): string {
  return html
    .replace(/min-height\s*:\s*297mm/gi, 'min-height:auto')
    .replace(/min-height\s*:\s*280mm/gi, 'min-height:auto')
    .replace(/height\s*:\s*297mm/gi, 'height:auto')
    .replace(/min-height\s*:\s*2[0-9]{2}mm/gi, 'min-height:auto')
}

function canvasHtmlResultOrFallback(
  result: string | null | undefined,
  source: string,
  absRoot?: ParentNode | null,
): string {
  const absEl = absRoot as HTMLElement | null | undefined
  const raw = result ?? absEl?.outerHTML ?? source
  return unwrapResultOrFallback(stripForcedPageHeightsFromHtml(raw), source)
}

const TABLE_HEADER_MM = 10
const TABLE_ROW_MM = 10
const TABLE_BOTTOM_MARGIN_MM = 2
const TOTALS_GAP_BELOW_TABLE_MM = 2

function parseStyleMm(style: string, prop: 'top' | 'left'): number | null {
  const re = prop === 'top' ? /top\s*:\s*([\d.]+)\s*mm/i : /left\s*:\s*([\d.]+)\s*mm/i
  const m = re.exec(style)
  return m ? parseFloat(m[1]) : null
}

function parseStyleHeightMm(style: string): number | null {
  const m = /(?:^|;)\s*height\s*:\s*([\d.]+)\s*mm/i.exec(style)
  return m ? parseFloat(m[1]) : null
}

function findItemsTable(absRoot: ParentNode): HTMLTableElement | null {
  const wrapped = absRoot.querySelector('.print-canvas-table-wrap table')
  if (wrapped) return wrapped as HTMLTableElement
  for (const t of absRoot.querySelectorAll('table')) {
    if (t.closest('[data-canvas-totals="1"], .print-canvas-totals-table-wrap')) continue
    return t as HTMLTableElement
  }
  return null
}

const TOTALS_LABEL_RE =
  /المجموع|المجموع الفرعي|الخصم|الإضافات|الضريبة|الإجمالي|المدفوع|المتبقي|الرصيد|subtotal|discount|additions|paid|balance|vat_amount|tax_amount/i

function isTotalsLikeElement(el: HTMLElement): boolean {
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
  if (!text || text.length > 220) return false
  if (TOTALS_LABEL_RE.test(text)) return true
  if (text.length < 80 && /\d{1,6}\.\d{3}/.test(text)) return true
  return false
}

function countTableBodyRows(table: HTMLTableElement, itemsCount?: number): number {
  if (itemsCount != null && itemsCount > 0) return itemsCount
  const bodyRows = table.querySelectorAll('tbody tr').length
  if (bodyRows > 0) return bodyRows
  const allRows = table.querySelectorAll('tr').length
  return Math.max(allRows > 0 ? allRows - 1 : 0, 1)
}

function findTableWrap(absRoot: ParentNode, table: HTMLTableElement): HTMLElement | null {
  return (
    (table.closest('.print-canvas-table-wrap') as HTMLElement | null) ??
    (table.closest('div[style*="position:absolute"]') as HTMLElement | null) ??
    (table.closest('div[style*="position: absolute"]') as HTMLElement | null) ??
    (table.parentElement as HTMLElement | null)
  )
}

function collectAbsDivs(absRoot: Element, table: HTMLTableElement): HTMLElement[] {
  return [...absRoot.querySelectorAll<HTMLElement>(
    'div[style*="position:absolute"], div[style*="position: absolute"]',
  )].filter((el) => !el.contains(table))
}

function parseStyleWidthMm(style: string): number | null {
  const m = /width\s*:\s*([\d.]+)\s*mm/i.exec(style)
  return m ? parseFloat(m[1]) : null
}

function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function totalsSortOrder(label: string): number {
  const n = label.replace(/:\s*$/, '').trim()
  const order: [string[], number][] = [
    [['المجموع الفرعي', 'المجموع', 'subtotal'], 1],
    [['الخصم', 'discount'], 2],
    [['الإضافات', 'additions'], 3],
    [['الضريبة', 'vat', 'tax'], 4],
    [['الإجمالي المستحق', 'الإجمالي', 'total'], 5],
    [['المدفوع', 'paid'], 6],
    [['المتبقي', 'الرصيد', 'balance'], 7],
  ]
  for (const [keys, rank] of order) {
    if (keys.some((k) => n.includes(k))) return rank
  }
  return 50
}

function isLabelOnlyTotalsText(text: string): boolean {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!t || /^\d+\.\d{3}$/.test(t)) return false
  return TOTALS_LABEL_RE.test(t) || /:$/.test(t)
}

function isValueOnlyTotalsText(text: string): boolean {
  const t = text.replace(/\s+/g, ' ').trim()
  return /\d{1,6}\.\d{3}/.test(t) && t.length < 80
}

function extractAccentFromTable(table: HTMLTableElement): string {
  const th = table.querySelector('th')
  const fromStyle = th?.getAttribute('style')?.match(/background:\s*([^;]+)/i)?.[1]?.trim()
  if (fromStyle) return fromStyle
  const tr = table.querySelector('thead tr')
  const fromTr = tr?.getAttribute('style')?.match(/background:\s*([^;]+)/i)?.[1]?.trim()
  return fromTr || 'var(--accent,#4f46e5)'
}

type TotalsRowData = { label: string; value: string; order: number }

function extractTotalsRowsFromAbsDivs(absDivs: HTMLElement[]): {
  rows: TotalsRowData[]
  usedElements: HTMLElement[]
} {
  const byTop = new Map<number, HTMLElement[]>()
  for (const el of absDivs) {
    const topMm = parseStyleMm(el.getAttribute('style') ?? '', 'top')
    if (topMm == null || !isTotalsLikeElement(el)) continue
    const key = Math.round(topMm * 2) / 2
    byTop.set(key, [...(byTop.get(key) ?? []), el])
  }

  const rows: TotalsRowData[] = []
  const usedElements: HTMLElement[] = []

  for (const [, group] of [...byTop.entries()].sort((a, b) => a[0] - b[0])) {
    let label = ''
    let value = ''
    for (const el of group) {
      usedElements.push(el)
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
      if (!text) continue
      if (isLabelOnlyTotalsText(text)) {
        if (!label) label = text.replace(/:\s*$/, '').trim()
      } else if (isValueOnlyTotalsText(text)) {
        if (!value) value = text
      } else if (TOTALS_LABEL_RE.test(text) && text.length < 48) {
        if (!label) label = text.replace(/:\s*$/, '').trim()
      }
    }
    if (label && value) {
      rows.push({ label, value, order: totalsSortOrder(label) })
    }
  }

  rows.sort((a, b) => a.order - b.order)
  return { rows, usedElements }
}

function hidePrintTotalsElement(el: HTMLElement): void {
  el.setAttribute('data-print-totals-hidden', '1')
  el.setAttribute(
    'style',
    mergeInlineStyle(el.getAttribute('style'), {
      display: 'none',
      visibility: 'hidden',
      height: '0',
      overflow: 'hidden',
      opacity: '0',
      'pointer-events': 'none',
    }),
  )
}

function buildTotalsTableInnerHtml(
  rows: TotalsRowData[],
  accent: string,
  itemsTable: HTMLTableElement,
): string {
  const tdSample = itemsTable.querySelector('tbody td')
  const tdBase = tdSample?.getAttribute('style') ?? 'padding:9px 12px;font-size:11px;'
  const rowStyle =
    itemsTable.querySelector('tbody tr')?.getAttribute('style') ??
    'border-bottom:1px solid #e5e7eb;'

  const bodyRows = rows
    .map(
      (r) =>
        `<tr style="${rowStyle}"><td style="${tdBase}font-weight:600;color:#334155;">${escapeHtmlText(r.label)}</td><td style="${tdBase}text-align:left;direction:ltr;font-weight:700;color:#0f172a;">${escapeHtmlText(r.value)}</td></tr>`,
    )
    .join('')

  return `<table class="print-invoice-totals-table" style="width:100%;border-collapse:collapse;margin:0;table-layout:fixed;">
<thead><tr style="background:${accent};color:#fff;">
<th style="padding:8px 12px;text-align:right;font-weight:600;font-size:11px;">البيان</th>
<th style="padding:8px 12px;text-align:left;font-weight:600;font-size:11px;">القيمة</th>
</tr></thead>
<tbody>${bodyRows}</tbody>
</table>`
}

/**
 * جدول إجماليات بنفس عرض/نمط جدول الأصناف — مباشرة تحته (بدل مواضع absolute المتباعدة).
 */
function hasCanvasTotalsTable(root: ParentNode): boolean {
  return !!root.querySelector('[data-canvas-totals="1"], .print-canvas-totals-table')
}

/** أسفل جدول الأصناف بالمم (من أعلى absRoot) */
function measureItemsTableBottomMm(
  absRoot: HTMLElement,
  table: HTMLTableElement,
  tableWrap: HTMLElement | null,
  itemsCount: number | undefined,
  useMeasuredPosition: boolean,
): number {
  const wrapStyle = tableWrap?.getAttribute('style') ?? ''
  const tableTopMm = parseStyleMm(wrapStyle, 'top') ?? 0

  if (useMeasuredPosition && absRoot.isConnected) {
    const doc = absRoot.ownerDocument
    if (doc) {
      const rootRect = absRoot.getBoundingClientRect()
      const wrapEl = tableWrap ?? table
      const wrapRect = wrapEl.getBoundingClientRect()
      if (wrapRect.height > 0.5) {
        const mmPerPx = measureMmPerPx(doc, absRoot)
        return (wrapRect.bottom - rootRect.top) / mmPerPx + TABLE_BOTTOM_MARGIN_MM
      }
    }
  }

  const lineCount = countTableBodyRows(table, itemsCount)
  const estimatedHeight = TABLE_HEADER_MM + Math.max(lineCount, 1) * TABLE_ROW_MM
  const wrapHeightMm = parseStyleHeightMm(wrapStyle)
  const tableHeightMm = wrapHeightMm
    ? Math.min(wrapHeightMm, estimatedHeight + 6)
    : estimatedHeight

  return tableTopMm + tableHeightMm + TABLE_BOTTOM_MARGIN_MM
}

function resolveTotalsTableTopMm(
  absRoot: HTMLElement,
  table: HTMLTableElement,
  tableWrap: HTMLElement | null,
  itemsCount: number | undefined,
  useMeasuredPosition: boolean,
): { topMm: number; tableLeftMm: number; tableWidthMm: number } {
  const wrapStyle = tableWrap?.getAttribute('style') ?? ''
  const tableLeftMm = parseStyleMm(wrapStyle, 'left') ?? 0
  const tableWidthMm = parseStyleWidthMm(wrapStyle) ?? 190
  const tableBottomMm = measureItemsTableBottomMm(
    absRoot,
    table,
    tableWrap,
    itemsCount,
    useMeasuredPosition,
  )
  const topMm = tableBottomMm + TOTALS_GAP_BELOW_TABLE_MM
  return { topMm, tableLeftMm, tableWidthMm }
}

/** يثبّت جدول الإجماليات المُعرَّف في القالب أسفل جدول الأصناف */
function positionCanvasTotalsTablesInRoot(
  absRoot: HTMLElement,
  itemsCount?: number,
  useMeasuredPosition = false,
): boolean {
  const itemsTable = findItemsTable(absRoot)
  if (!itemsTable) return false

  const table = itemsTable
  const tableWrap = findTableWrap(absRoot, table)
  const anchors = [...absRoot.querySelectorAll<HTMLElement>('.print-canvas-totals-anchor')]
  if (anchors.length === 0) return false

  const { topMm, tableLeftMm, tableWidthMm } = resolveTotalsTableTopMm(
    absRoot,
    table,
    tableWrap,
    itemsCount,
    useMeasuredPosition,
  )

  let positioned = 0
  for (const anchor of anchors) {
    const inner = anchor.querySelector('[data-canvas-totals="1"]')
    const anchorAttr =
      inner?.getAttribute('data-anchor-below-items') ?? anchor.getAttribute('data-anchor-below-items')
    if (anchorAttr === '0') continue
    anchor.setAttribute(
      'style',
      mergeInlineStyle(anchor.getAttribute('style'), {
        position: 'absolute',
        left: `${tableLeftMm}mm`,
        top: `${topMm}mm`,
        width: `${tableWidthMm}mm`,
        height: 'auto',
        'box-sizing': 'border-box',
      }),
    )
    positioned++
  }

  if (positioned > 0) {
    shrinkAbsRootMinHeight(absRoot, topMm + 36)
  }
  return positioned > 0
}

function shrinkAbsRootMinHeight(absRoot: HTMLElement, neededMm: number): void {
  const target = Math.min(Math.max(Math.ceil(neededMm + 2), 40), 297)
  absRoot.setAttribute(
    'style',
    mergeInlineStyle(absRoot.getAttribute('style'), { 'min-height': `${target}mm`, height: 'auto' }),
  )
}

function positionCanvasTotalsTablesInHtml(html: string, itemsCount?: number): string {
  const source = (html ?? '').trim()
  if (!source || !isCanvasPrintTemplateHtml(source)) return source
  if (typeof DOMParser === 'undefined') return source
  try {
    const doc = new DOMParser().parseFromString(source, 'text/html')
    const absRoot = doc.querySelector('.print-doc-abs-root') as HTMLElement | null
    if (!absRoot) return source
    positionCanvasTotalsTablesInRoot(absRoot, itemsCount, false)
    const docRoot = doc.querySelector('.print-doc-root')
    return canvasHtmlResultOrFallback(docRoot?.outerHTML ?? null, source, absRoot)
  } catch {
    return source
  }
}

function injectTotalsTableBelowItemsInRoot(
  absRoot: HTMLElement,
  table: HTMLTableElement,
  itemsCount?: number,
  useMeasuredPosition = false,
): boolean {
  if (hasCanvasTotalsTable(absRoot)) return false
  if (absRoot.querySelector('.print-invoice-totals-wrap')) return true

  const tableWrap = findTableWrap(absRoot, table)
  const absDivs = collectAbsDivs(absRoot, table)
  const { rows: totalsRows, usedElements } = extractTotalsRowsFromAbsDivs(absDivs)
  if (totalsRows.length === 0) return false

  const wrapStyle = tableWrap?.getAttribute('style') ?? ''
  const { topMm, tableLeftMm, tableWidthMm } = resolveTotalsTableTopMm(
    absRoot,
    table,
    tableWrap,
    itemsCount,
    useMeasuredPosition,
  )

  const accent = extractAccentFromTable(table)
  const doc = absRoot.ownerDocument ?? table.ownerDocument
  if (!doc) return false

  const totalsWrap = doc.createElement('div')
  totalsWrap.className = 'print-invoice-totals-wrap'
  totalsWrap.setAttribute(
    'style',
    `position:absolute;left:${tableLeftMm}mm;top:${topMm}mm;width:${tableWidthMm}mm;box-sizing:border-box;z-index:5;`,
  )
  totalsWrap.innerHTML = buildTotalsTableInnerHtml(totalsRows, accent, table)

  for (const el of usedElements) hidePrintTotalsElement(el)
  for (const el of absDivs) {
    if (el.hasAttribute('data-print-totals-hidden')) continue
    if (isTotalsLikeElement(el)) hidePrintTotalsElement(el)
  }

  absRoot.appendChild(totalsWrap)

  shrinkAbsRootMinHeight(absRoot, topMm + 8 + totalsRows.length * 9 + 12)
  return true
}

function injectTotalsTableBelowItems(html: string, itemsCount?: number): string {
  const source = (html ?? '').trim()
  if (!source || !isCanvasPrintTemplateHtml(source)) return source
  if (typeof DOMParser === 'undefined') return source

  try {
    const doc = new DOMParser().parseFromString(source, 'text/html')
    const absRoot = doc.querySelector('.print-doc-abs-root') as HTMLElement | null
    if (!absRoot) return source
    const table = findItemsTable(absRoot)
    if (!table) return source
    if (!injectTotalsTableBelowItemsInRoot(absRoot, table, itemsCount, false)) return source
    const docRoot = doc.querySelector('.print-doc-root')
    return canvasHtmlResultOrFallback(docRoot?.outerHTML ?? null, source, absRoot)
  } catch {
    return source
  }
}

/** تحويل 1mm إلى بكسل داخل مستند الطباعة (بعد التخطيط) */
function measureMmPerPx(doc: Document, host: HTMLElement): number {
  const probe = doc.createElement('div')
  probe.style.cssText = 'position:absolute;left:-9999px;top:0;width:100mm;height:1mm;visibility:hidden;pointer-events:none;'
  host.appendChild(probe)
  const px = probe.getBoundingClientRect().width
  probe.remove()
  return px > 0 ? px / 100 : 3.78
}

function fixFlowTotalsBelowTable(doc: Document, table: HTMLTableElement): boolean {
  const tableRect = table.getBoundingClientRect()
  if (tableRect.height < 1) return false

  const host = (table.closest('.print-doc-root, .invoice-custom-template') as HTMLElement | null) ?? doc.body
  const hostRect = host.getBoundingClientRect()
  const mmPerPx = measureMmPerPx(doc, host)
  const targetTopPx = tableRect.bottom - hostRect.top + (TOTALS_GAP_BELOW_TABLE_MM + TABLE_BOTTOM_MARGIN_MM) * mmPerPx

  const candidates = [
    ...host.querySelectorAll<HTMLElement>('.totals-wrapper, .totals-container, .summary-container'),
    ...Array.from(host.children).filter(
      (el): el is HTMLElement =>
        el instanceof HTMLElement &&
        el !== table &&
        !el.contains(table) &&
        isTotalsLikeElement(el),
    ),
  ]

  let minTopPx = Infinity
  for (const el of candidates) {
    const topPx = el.getBoundingClientRect().top - hostRect.top
    if (topPx < tableRect.top - hostRect.top) continue
    minTopPx = Math.min(minTopPx, topPx)
  }

  if (!Number.isFinite(minTopPx) || minTopPx >= targetTopPx - 1) return false

  const shiftPx = targetTopPx - minTopPx
  for (const el of candidates) {
    const topPx = el.getBoundingClientRect().top - hostRect.top
    if (topPx < minTopPx - 2) continue
    const cur = parseFloat((doc.defaultView?.getComputedStyle(el).marginTop ?? '0').replace('px', '')) || 0
    el.style.marginTop = `${cur + shiftPx}px`
    el.style.position = 'relative'
    el.style.zIndex = '2'
  }
  return true
}

/**
 * بعد رسم الصفحة: جدول إجماليات ملاصق لجدول الأصناف (قياس الارتفاع الفعلي).
 */
export function adjustTotalsPositionInDocument(doc: Document, itemsCount?: number): boolean {
  const absRoot = doc.querySelector('.print-doc-abs-root') as HTMLElement | null
  if (!absRoot) {
    const table = doc.querySelector('table')
    return table ? fixFlowTotalsBelowTable(doc, table) : false
  }

  const table = findItemsTable(absRoot)
  if (!table) return false
  if (table.getBoundingClientRect().height < 1) return false

  const tableWrap = findTableWrap(absRoot, table)
  if (tableWrap) {
    tableWrap.setAttribute(
      'style',
      mergeInlineStyle(tableWrap.getAttribute('style'), {
        height: 'auto',
        'min-height': '0',
        overflow: 'visible',
      }),
    )
  }

  if (positionCanvasTotalsTablesInRoot(absRoot, itemsCount, true)) return true
  if (!hasCanvasTotalsTable(absRoot) && injectTotalsTableBelowItemsInRoot(absRoot, table, itemsCount, true)) {
    return true
  }

  return false
}

/** انتظار تحميل الخطوط واستقرار التخطيط قبل قياس الطباعة */
export function waitForPrintLayout(doc: Document): Promise<void> {
  const fontsReady = doc.fonts?.ready ?? Promise.resolve()
  return fontsReady.then(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      }),
  )
}

export type PrintTemplatePageLayout = {
  margins: PrintMargins
  paperSize: PrintPaperSize
  orientation: PrintOrientation
}

export function normalizePrintMargins(m: PrintMargins | null | undefined): PrintMargins {
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : Number(v) || 0)
  if (!m) return { top: 0, right: 0, bottom: 0, left: 0 }
  return { top: n(m.top), right: n(m.right), bottom: n(m.bottom), left: n(m.left) }
}

function parsePaddingMarginsFromStyle(style: string): PrintMargins | null {
  const m = /padding\s*:\s*([\d.]+)mm(?:\s+([\d.]+)mm)?(?:\s+([\d.]+)mm)?(?:\s+([\d.]+)mm)?/i.exec(style)
  if (!m) return null
  const top = parseFloat(m[1])
  const right = m[2] != null ? parseFloat(m[2]) : top
  const bottom = m[3] != null ? parseFloat(m[3]) : top
  const left = m[4] != null ? parseFloat(m[4]) : right
  if (![top, right, bottom, left].every((x) => Number.isFinite(x))) return null
  return { top, right, bottom, left }
}

function inferCanvasContentWidthMm(absRoot: Element): number {
  let maxRight = 0
  const absEls = absRoot.querySelectorAll<HTMLElement>(
    'div[style*="position:absolute"], div[style*="position: absolute"]',
  )
  for (const el of absEls) {
    const s = el.getAttribute('style') ?? ''
    const left = parseStyleMm(s, 'left') ?? 0
    const w = parseStyleWidthMm(s) ?? 0
    maxRight = Math.max(maxRight, left + w)
  }
  return maxRight > 40 ? maxRight : 0
}

/** تطبيق هوامش القالب وتوسيع العناصر لعرض منطقة المحتوى */
export function applyPrintTemplatePageLayout(html: string, layout: PrintTemplatePageLayout): string {
  const source = (html ?? '').trim()
  if (!source || !isCanvasPrintTemplateHtml(source)) return source
  if (typeof DOMParser === 'undefined') return source

  const margins = normalizePrintMargins(layout.margins)
  const { w: pageW } = paperOuterSizeMm(layout.paperSize, layout.orientation)
  const { w: contentW } = paperContentSizeMm(layout.paperSize, layout.orientation, margins)

  try {
    const doc = new DOMParser().parseFromString(source, 'text/html')
    const docRoot = doc.querySelector('.print-doc-root') as HTMLElement | null
    const absRoot = doc.querySelector('.print-doc-abs-root') as HTMLElement | null
    if (!docRoot || !absRoot) return source

    const oldPad = parsePaddingMarginsFromStyle(docRoot.getAttribute('style') ?? '')
    const oldContentW =
      inferCanvasContentWidthMm(absRoot) ||
      (oldPad
        ? paperContentSizeMm(layout.paperSize, layout.orientation, oldPad).w
        : paperContentSizeMm(layout.paperSize, layout.orientation, {
            top: 10,
            right: 10,
            bottom: 10,
            left: 10,
          }).w)
    const scale = oldContentW > 0 ? contentW / oldContentW : 1

    docRoot.setAttribute(
      'style',
      mergeInlineStyle(docRoot.getAttribute('style'), {
        width: '100%',
        'max-width': `${pageW}mm`,
        margin: '0 auto',
        padding: `${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm`,
        'box-sizing': 'border-box',
        position: 'relative',
      }),
    )
    absRoot.setAttribute(
      'style',
      mergeInlineStyle(absRoot.getAttribute('style'), {
        width: '100%',
        'max-width': '100%',
        margin: '0',
        position: 'relative',
        overflow: 'visible',
      }),
    )

    const fullBleed =
      margins.top === 0 && margins.right === 0 && margins.bottom === 0 && margins.left === 0

    absRoot.querySelectorAll<HTMLElement>(
      '.print-canvas-table-wrap, .print-canvas-totals-anchor, .print-invoice-totals-wrap',
    ).forEach((el) => {
      el.setAttribute(
        'style',
        mergeInlineStyle(el.getAttribute('style'), {
          left: '0',
          width: '100%',
          'max-width': '100%',
          height: 'auto',
          'min-height': '0',
        }),
      )
    })

    if (Math.abs(scale - 1) > 0.02 && !fullBleed) {
      const absEls = absRoot.querySelectorAll<HTMLElement>(
        'div[style*="position:absolute"], div[style*="position: absolute"]',
      )
      absEls.forEach((el) => {
        if (
          el.classList.contains('print-canvas-table-wrap') ||
          el.classList.contains('print-canvas-totals-anchor') ||
          el.classList.contains('print-invoice-totals-wrap')
        ) {
          return
        }
        const s = el.getAttribute('style') ?? ''
        const left = parseStyleMm(s, 'left')
        const width = parseStyleWidthMm(s)
        const patch: Record<string, string> = {}
        if (left != null) patch.left = `${left * scale}mm`
        if (width != null) patch.width = `${width * scale}mm`
        if (Object.keys(patch).length) el.setAttribute('style', mergeInlineStyle(s, patch))
      })
    }

    return canvasHtmlResultOrFallback(docRoot.outerHTML, source, absRoot)
  } catch {
    return source
  }
}

/** يقلّص min-height الزائد على اللوحة لتجنب صفحة ثانية فارغة */
function trimAbsRootMinHeightInHtml(html: string): string {
  const source = (html ?? '').trim()
  if (!source || !isCanvasPrintTemplateHtml(source)) return source
  if (typeof DOMParser === 'undefined') return source
  try {
    const doc = new DOMParser().parseFromString(source, 'text/html')
    const absRoot = doc.querySelector('.print-doc-abs-root') as HTMLElement | null
    if (!absRoot) return source

    let maxBottom = 0
    const absEls = absRoot.querySelectorAll<HTMLElement>(
      'div[style*="position:absolute"], div[style*="position: absolute"], .print-canvas-table-wrap, .print-canvas-totals-anchor, .print-invoice-totals-wrap',
    )
    for (const el of absEls) {
      const s = el.getAttribute('style') ?? ''
      const top = parseStyleMm(s, 'top') ?? 0
      const h = parseStyleHeightMm(s) ?? 12
      maxBottom = Math.max(maxBottom, top + h)
    }
    const totalsWrap = absRoot.querySelector('.print-invoice-totals-wrap') as HTMLElement | null
    if (totalsWrap) {
      const s = totalsWrap.getAttribute('style') ?? ''
      const top = parseStyleMm(s, 'top') ?? 0
      maxBottom = Math.max(maxBottom, top + 45)
    }

    if (maxBottom > 0) {
      shrinkAbsRootMinHeight(absRoot, maxBottom + 6)
    } else {
      absRoot.setAttribute(
        'style',
        mergeInlineStyle(absRoot.getAttribute('style'), { 'min-height': '0', height: 'auto' }),
      )
    }

    const docRoot = doc.querySelector('.print-doc-root')
    return canvasHtmlResultOrFallback(docRoot?.outerHTML ?? null, source, absRoot)
  } catch {
    return source
  }
}

const DEFAULT_PRINT_PAGE_LAYOUT: PrintTemplatePageLayout = {
  margins: { top: 0, right: 0, bottom: 0, left: 0 },
  paperSize: 'A4',
  orientation: 'portrait',
}

/** يطبّق التخطيط مباشرة على مستند الطباعة بعد الرسم */
export function normalizePrintDocumentLayoutInDocument(
  doc: Document,
  pageLayout?: PrintTemplatePageLayout,
): void {
  const layout = pageLayout ?? DEFAULT_PRINT_PAGE_LAYOUT
  const margins = normalizePrintMargins(layout.margins)
  const { w: pageW } = paperOuterSizeMm(layout.paperSize, layout.orientation)

  const docRoot = doc.querySelector('.print-doc-root') as HTMLElement | null
  const absRoot = doc.querySelector('.print-doc-abs-root') as HTMLElement | null
  if (!docRoot || !absRoot) return

  doc.documentElement.style.margin = '0'
  doc.documentElement.style.padding = '0'
  doc.body.style.margin = '0'
  doc.body.style.padding = '0'
  doc.body.style.width = '100%'
  doc.body.style.maxWidth = `${pageW}mm`
  doc.body.style.overflow = 'hidden'

  docRoot.style.width = '100%'
  docRoot.style.maxWidth = `${pageW}mm`
  docRoot.style.margin = '0 auto'
  docRoot.style.padding = `${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm`
  docRoot.style.boxSizing = 'border-box'

  absRoot.style.width = '100%'
  absRoot.style.minHeight = '0'
  absRoot.style.height = 'auto'

  let maxBottom = 0
  const blocks = absRoot.querySelectorAll<HTMLElement>(
    '.print-canvas-table-wrap, .print-canvas-totals-anchor, .print-invoice-totals-wrap, div[style*="position:absolute"], div[style*="position: absolute"]',
  )
  blocks.forEach((el) => {
    if (el.classList.contains('print-canvas-table-wrap') || el.classList.contains('print-canvas-totals-anchor') || el.classList.contains('print-invoice-totals-wrap')) {
      el.style.left = '0'
      el.style.width = '100%'
      el.style.maxWidth = '100%'
      el.style.height = 'auto'
      el.style.minHeight = '0'
    }
    const rect = el.getBoundingClientRect()
    const rootRect = absRoot.getBoundingClientRect()
    if (rect.height > 0) {
      maxBottom = Math.max(maxBottom, rect.bottom - rootRect.top)
    }
  })

  const mmPerPx = measureMmPerPx(doc, absRoot)
  if (maxBottom > 0) {
    absRoot.style.minHeight = `${maxBottom / mmPerPx + 2}mm`
  } else {
    absRoot.style.minHeight = '0'
  }
}

/** تجهيز HTML للطباعة — جدول إجماليات من القالب أو تلقائي */
export function prepareHtmlForPrint(
  html: string,
  itemsCount?: number,
  pageLayout?: PrintTemplatePageLayout,
): string {
  const fixed = fixCanvasPrintHtmlForScreen(html)
  const layout = pageLayout ?? DEFAULT_PRINT_PAGE_LAYOUT
  let out = applyPrintTemplatePageLayout(fixed, layout)
  out = positionCanvasTotalsTablesInHtml(out, itemsCount)
  if (!hasCanvasTotalsTableFromHtml(out)) {
    out = injectTotalsTableBelowItems(out, itemsCount)
  }
  return stripForcedPageHeightsFromHtml(trimAbsRootMinHeightInHtml(out))
}

function hasCanvasTotalsTableFromHtml(html: string): boolean {
  return /data-canvas-totals\s*=\s*["']1["']/i.test(html) || /print-canvas-totals-table/i.test(html)
}

/**
 * تحويل مواضع اللوحة الحرة (absolute) إلى تدفق نسبي — للمعاينة والطباعة.
 */
export function unwrapCanvasForScreenPreview(html: string): string {
  const source = (html ?? '').trim()
  if (!source) return ''

  if (!isCanvasPrintTemplateHtml(source)) return source
  if (typeof DOMParser === 'undefined') {
    return unwrapResultOrFallback(fixCanvasPrintHtmlForScreen(source), source)
  }

  try {
    const doc = new DOMParser().parseFromString(source, 'text/html')
    const absRoot = doc.querySelector('.print-doc-abs-root')
    if (!absRoot) return source

    const absMinHeight = /min-height\s*:\s*([\d.]+)\s*mm/i.exec(absRoot.getAttribute('style') ?? '')?.[1]
    absRoot.setAttribute(
      'style',
      mergeInlineStyle(absRoot.getAttribute('style'), {
        position: 'relative',
        width: '100%',
        ...(absMinHeight ? { 'min-height': `${absMinHeight}mm` } : {}),
        height: 'auto',
        overflow: 'visible',
      }),
    )

    const absEls = absRoot.querySelectorAll<HTMLElement>(
      'div[style*="position:absolute"], div[style*="position: absolute"]',
    )
    absEls.forEach((el) => {
      const s = el.getAttribute('style') ?? ''
      const topM = /top\s*:\s*([\d.]+)\s*mm/i.exec(s)?.[1]
      const leftM = /left\s*:\s*([\d.]+)\s*mm/i.exec(s)?.[1]
      const widthM = /width\s*:\s*([\d.]+)\s*mm/i.exec(s)?.[1]

      const next = s
        .replace(/position\s*:\s*absolute/gi, 'position:relative')
        .replace(/top\s*:\s*[\d.]+mm/gi, '')
        .replace(/left\s*:\s*[\d.]+mm/gi, '')
        .replace(/overflow\s*:\s*hidden/gi, 'overflow:visible')
        .replace(/height\s*:\s*100%/gi, 'height:auto')

      const extra: Record<string, string> = {
        position: 'relative',
        'box-sizing': 'border-box',
        overflow: 'visible',
        height: 'auto',
      }
      if (topM) extra['margin-top'] = `${topM}mm`
      if (leftM) extra['margin-inline-start'] = `${leftM}mm`
      if (widthM) {
        extra.width = `${widthM}mm`
        extra['max-width'] = '100%'
      } else {
        extra.width = '100%'
      }

      el.setAttribute('style', mergeInlineStyle(next, extra))
    })

    const docRoot = doc.querySelector('.print-doc-root')
    const parent = absRoot.parentElement
    const extracted =
      docRoot?.outerHTML ??
      (parent?.classList.contains('print-doc-root') ? parent.outerHTML : null) ??
      absRoot.outerHTML ??
      parent?.innerHTML

    return canvasHtmlResultOrFallback(extracted, source, absRoot)
  } catch {
    return unwrapResultOrFallback(fixCanvasPrintHtmlForScreen(source), source)
  }
}

/** مستند HTML كامل لعرض القالب داخل iframe — معزول عن CSS التطبيق */
export function buildPrintTemplateFrameDocument(
  innerHtml: string,
  accentColor = '#4f46e5',
  itemsCount?: number,
  pageLayout?: PrintTemplatePageLayout,
): string {
  const body = prepareHtmlForPrint(innerHtml, itemsCount, pageLayout)
  const pageSize = pageLayout
    ? printTemplatePageSizeCss(pageLayout.paperSize, pageLayout.orientation)
    : 'A4 portrait'
  const layout = pageLayout ?? DEFAULT_PRINT_PAGE_LAYOUT
  const margins = normalizePrintMargins(layout.margins)
  const { w: pageW } = paperOuterSizeMm(layout.paperSize, layout.orientation)
  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet"/>
<style>
  @page { size: ${pageSize}; margin: 0mm !important; }
  html, body {
    margin: 0;
    padding: 0;
    height: auto;
  }
  body {
    font-family: Cairo, Tajawal, Tahoma, sans-serif;
    color: #0f172a;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    box-sizing: border-box;
  }
  *, *::before, *::after { box-sizing: border-box; }
  .print-doc-root {
    --accent: ${accentColor};
    width: 100% !important;
    max-width: ${pageW}mm !important;
    margin: 0 auto !important;
    padding: ${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm !important;
    box-sizing: border-box !important;
  }
  .print-doc-abs-root {
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 !important;
    min-height: auto !important;
    height: auto !important;
  }
  .print-canvas-table-wrap,
  .print-canvas-totals-anchor,
  .print-invoice-totals-wrap {
    left: 0 !important;
    width: 100% !important;
    max-width: 100% !important;
    height: auto !important;
    min-height: 0 !important;
  }
  ${PRINT_TEMPLATE_CANVAS_FRAME_CSS}
  ${PRINT_TEMPLATE_FRAME_PRINT_CSS}
  @media print {
    @page { size: ${pageSize}; margin: 0mm !important; }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      height: auto !important;
    }
    .print-doc-root {
      width: 100% !important;
      max-width: 100% !important;
      margin: 0 !important;
      padding: ${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm !important;
    }
    .print-canvas-table-wrap,
    .print-canvas-totals-anchor,
    .print-invoice-totals-wrap {
      left: 0 !important;
      width: 100% !important;
    }
    .print-doc-abs-root {
      min-height: auto !important;
      height: auto !important;
      page-break-after: avoid;
    }
  }
</style>
</head>
<body style="margin:0;padding:0;height:auto;">${body}</body>
</html>`
}

export type PrintInvoiceHtmlOptions = {
  /** نافذة جديدة — مناسبة لنقرة المستخدم؛ قد تُحجب بعد timeout */
  preferNewWindow?: boolean
  delayMs?: number
  closeAfterPrint?: boolean
  itemsCount?: number
  pageLayout?: PrintTemplatePageLayout
}

/**
 * طباعة HTML الفاتورة في مستند معزول (نافذة أو iframe) — يتجاوز CSS التطبيق والـ Layout.
 */
export function printInvoiceHtmlDocument(
  html: string,
  accentColor = '#4f46e5',
  options?: PrintInvoiceHtmlOptions,
): boolean {
  const trimmed = prepareHtmlForPrint(html.trim(), options?.itemsCount, options?.pageLayout)
  if (!trimmed) return false

  const doc = buildPrintTemplateFrameDocument(
    trimmed,
    accentColor,
    options?.itemsCount,
    options?.pageLayout,
  )
  const delay = options?.delayMs ?? 600
  const preferNewWindow = options?.preferNewWindow !== false

  const schedulePrint = (win: Window) => {
    const runPrint = () => {
      window.setTimeout(() => {
        void (async () => {
          try {
            await waitForPrintLayout(win.document)
            normalizePrintDocumentLayoutInDocument(win.document, options?.pageLayout)
            adjustTotalsPositionInDocument(win.document, options?.itemsCount)
            await waitForPrintLayout(win.document)
            normalizePrintDocumentLayoutInDocument(win.document, options?.pageLayout)
            adjustTotalsPositionInDocument(win.document, options?.itemsCount)
            const triggerPrint = () => {
              try {
                win.focus()
                win.print()
              } catch {
                /* ignore */
              }
            }
            if (typeof win.requestAnimationFrame === 'function') {
              win.requestAnimationFrame(() => {
                win.requestAnimationFrame(triggerPrint)
              })
            } else {
              triggerPrint()
            }
          } catch {
            /* ignore */
          }
        })()
      }, delay)
    }
    if (win.document.readyState === 'complete') {
      runPrint()
    } else {
      win.addEventListener('load', runPrint, { once: true })
    }
    if (options?.closeAfterPrint) {
      const onAfterPrint = () => {
        window.setTimeout(() => {
          try {
            win.close()
          } catch {
            /* ignore */
          }
        }, 200)
        win.removeEventListener('afterprint', onAfterPrint)
      }
      win.addEventListener('afterprint', onAfterPrint)
    }
  }

  if (preferNewWindow) {
    const w = window.open('', '_blank', 'noopener,noreferrer')
    if (w) {
      w.document.open()
      w.document.write(doc)
      w.document.close()
      schedulePrint(w)
      return true
    }
  }

  if (typeof document === 'undefined') return false

  const iframe = document.createElement('iframe')
  iframe.setAttribute('title', 'invoice-print')
  const iframePageW = options?.pageLayout
    ? paperOuterSizeMm(options.pageLayout.paperSize, options.pageLayout.orientation).w
    : 210
  iframe.style.cssText = `position:fixed;top:-9999px;left:-9999px;width:${iframePageW}mm;height:auto;border:none;background:#fff;`
  document.body.appendChild(iframe)

  const iwin = iframe.contentWindow
  if (!iwin) {
    iframe.remove()
    return false
  }

  const removeIframe = () => {
    try {
      iframe.remove()
    } catch {
      /* ignore */
    }
  }

  iwin.document.open()
  iwin.document.write(doc)
  iwin.document.close()
  schedulePrint(iwin)
  iwin.addEventListener('afterprint', removeIframe, { once: true })
  window.setTimeout(removeIframe, delay + 8000)

  return true
}

/** تصيير قالب طباعة ببيانات المستند الحقيقية فقط (بدون دمج بيانات تجريبية) */
export function renderInvoicePrintHtml(
  html: string,
  docType: PrintDocumentType,
  data: Record<string, unknown>,
): ReturnType<typeof renderPrintTemplatePreview> {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[renderInvoicePrintHtml] template length:', html?.length, 'docType:', docType, 'context keys:', Object.keys(data ?? {}))
  }
  const result = renderPrintTemplatePreview(html, docType, data, { useMockFallback: false })
  if (!result.ok) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error('[renderInvoicePrintHtml] ERROR:', result.error)
    }
    return result
  }
  if (!result.html) return result
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[renderInvoicePrintHtml] result length:', result.html.length, 'substantive:', hasSubstantivePrintHtml(result.html))
  }
  return result
}
