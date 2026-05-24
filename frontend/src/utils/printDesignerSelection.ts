import type { CanvasElement, CanvasElementLayout } from './printDesignerTypes'

/** تحديد عناصر المحرر — Ctrl/Shift + نقر للإضافة أو الإزالة */
export function toggleInSelection(prev: Set<string>, id: string): Set<string> {
  const next = new Set(prev)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

export function selectOnly(id: string): Set<string> {
  return new Set([id])
}

export function selectAllIds(ids: string[]): Set<string> {
  return new Set(ids)
}

export function isAdditiveSelect(e: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }): boolean {
  return !!(e.shiftKey || e.ctrlKey || e.metaKey)
}

export function layoutIntersectsRect(
  layout: CanvasElementLayout,
  rect: { x1: number; y1: number; x2: number; y2: number },
): boolean {
  const ex2 = layout.xMm + layout.wMm
  const ey2 = layout.yMm + layout.hMm
  return !(rect.x2 < layout.xMm || rect.x1 > ex2 || rect.y2 < layout.yMm || rect.y1 > ey2)
}

export function elementIdsInMarqueeRect(elements: CanvasElement[], rectMm: { x1: number; y1: number; x2: number; y2: number }): string[] {
  return elements
    .filter((el) => el.visible !== false && el.layout && layoutIntersectsRect(el.layout, rectMm))
    .map((el) => el.id)
}
