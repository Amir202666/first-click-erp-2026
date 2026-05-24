/** تحويل بين مم (محرر الطباعة) وبيكسل (عرض اللوحة ~96dpi) */
export const MM_TO_PX = 3.7795275591
export const PX_TO_MM = 1 / MM_TO_PX

export function mmToPx(mm: number): number {
  return Math.round(mm * MM_TO_PX)
}

export function pxToMm(px: number): number {
  return Math.round(px * PX_TO_MM * 10) / 10
}
