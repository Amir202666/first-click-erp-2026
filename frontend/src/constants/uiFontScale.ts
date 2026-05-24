/** مقياس خط الواجهة (نسبة مئوية من حجم خط الجذر في المتصفح) */
export const UI_FONT_SCALE_MIN = 75
export const UI_FONT_SCALE_MAX = 130
export const UI_FONT_SCALE_DEFAULT = 100

export function clampUiFontScale(n: number): number {
  if (!Number.isFinite(n)) return UI_FONT_SCALE_DEFAULT
  return Math.min(UI_FONT_SCALE_MAX, Math.max(UI_FONT_SCALE_MIN, Math.round(n)))
}
