import type { PrintMargins, PrintOrientation, PrintPaperSize } from '../types/printTemplate'
import type { CanvasElement, CanvasElementLayout } from './printDesignerTypes'

export function paperOuterSizeMm(
  paperSize: PrintPaperSize,
  orientation: PrintOrientation,
): { w: number; h: number } {
  const swap = orientation === 'landscape' && paperSize !== 'thermal_80' && paperSize !== 'thermal_58'
  let pw = 210
  let ph = 297
  if (paperSize === 'A5') {
    pw = 148
    ph = 210
  } else if (paperSize === 'thermal_80') {
    pw = 80
    ph = 400
  } else if (paperSize === 'thermal_58') {
    pw = 58
    ph = 400
  }
  return swap ? { w: ph, h: pw } : { w: pw, h: ph }
}

export function paperContentSizeMm(
  paperSize: PrintPaperSize,
  orientation: PrintOrientation,
  margins: PrintMargins,
): { w: number; h: number } {
  const { w: ow, h: oh } = paperOuterSizeMm(paperSize, orientation)
  return {
    w: Math.max(10, ow - margins.left - margins.right),
    h: Math.max(10, oh - margins.top - margins.bottom),
  }
}

export function hasValidCanvasLayout(el: CanvasElement): el is CanvasElement & { layout: CanvasElementLayout } {
  const L = el.layout
  if (!L) return false
  return [L.xMm, L.yMm, L.wMm, L.hMm].every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0)
}

export function defaultSizeMmForElement(el: CanvasElement, contentW: number): { w: number; h: number } {
  const pad = 2
  const fullW = Math.max(20, contentW - pad * 2)
  switch (el.type) {
    case 'text':
    case 'variable':
      return { w: Math.min(90, fullW), h: 12 }
    case 'divider':
      return { w: fullW, h: 6 }
    case 'spacer':
      return { w: fullW, h: Math.max(4, el.heightMm) }
    case 'box':
      return { w: Math.min(fullW, fullW * 0.96), h: Math.max(16, el.minHeightMm ?? 24) }
    case 'table':
      return { w: fullW, h: 22 }
    case 'totals_table':
      return { w: Math.min(fullW, 120), h: 28 }
    case 'image':
      return { w: Math.min(55, fullW), h: 24 }
    case 'qr':
    case 'barcode':
      return { w: 32, h: 22 }
    case 'html_embed':
      return { w: fullW, h: Math.min(200, Math.max(80, fullW * 1.15)) }
    default:
      return { w: 60, h: 12 }
  }
}

export function clampLayoutToContent(
  layout: CanvasElementLayout,
  contentW: number,
  contentH: number,
): CanvasElementLayout {
  const minW = 5
  const minH = 4
  let { xMm, yMm, wMm, hMm } = layout
  wMm = Math.max(minW, Math.min(wMm, contentW))
  hMm = Math.max(minH, Math.min(hMm, contentH))
  xMm = Math.max(0, Math.min(xMm, Math.max(0, contentW - wMm)))
  yMm = Math.max(0, Math.min(yMm, Math.max(0, contentH - hMm)))
  return { xMm, yMm, wMm, hMm }
}

/** Assign vertical stack layout to elements missing a valid layout; preserves existing stacks below max Y. */
export function ensureCanvasLayouts(
  elements: CanvasElement[],
  paperSize: PrintPaperSize,
  orientation: PrintOrientation,
  margins: PrintMargins,
): CanvasElement[] {
  const { w: cw, h: ch } = paperContentSizeMm(paperSize, orientation, margins)
  const gap = 2
  let cursorY = 2
  for (const el of elements) {
    if (hasValidCanvasLayout(el)) {
      cursorY = Math.max(cursorY, el.layout.yMm + el.layout.hMm + gap)
    }
  }
  return elements.map((el) => {
    if (hasValidCanvasLayout(el)) return el
    const { w, h } = defaultSizeMmForElement(el, cw)
    const layout = clampLayoutToContent(
      { xMm: 2, yMm: cursorY, wMm: Math.min(w, cw - 4), hMm: Math.min(h, ch) },
      cw,
      ch,
    )
    cursorY += layout.hMm + gap
    return { ...el, layout }
  })
}

export function maxLayoutBottomMm(elements: CanvasElement[]): number {
  let m = 0
  for (const el of elements) {
    if (hasValidCanvasLayout(el)) m = Math.max(m, el.layout.yMm + el.layout.hMm)
  }
  return m
}

export function nextStackLayoutMm(
  elements: CanvasElement[],
  el: CanvasElement,
  contentW: number,
  contentH: number,
): CanvasElementLayout {
  const gap = 2
  let cursorY = 2
  for (const row of elements) {
    if (hasValidCanvasLayout(row)) {
      cursorY = Math.max(cursorY, row.layout.yMm + row.layout.hMm + gap)
    }
  }
  const { w, h } = defaultSizeMmForElement(el, contentW)
  return clampLayoutToContent({ xMm: 2, yMm: cursorY, wMm: Math.min(w, contentW - 4), hMm: Math.min(h, contentH) }, contentW, contentH)
}
