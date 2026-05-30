import { clampUiFontScale, UI_FONT_SCALE_DEFAULT } from '../constants/uiFontScale'

const TENANT_KEY_PREFIX = 'fc_ui_font_scale_t'

export function fontScaleStorageKey(tenantId: number): string {
  return `${TENANT_KEY_PREFIX}${tenantId}`
}

export function readCachedUiFontScale(tenantId?: number): number {
  if (!tenantId) return UI_FONT_SCALE_DEFAULT
  try {
    const raw = localStorage.getItem(fontScaleStorageKey(tenantId))
    if (raw != null) {
      const n = Number(raw)
      if (Number.isFinite(n)) return clampUiFontScale(n)
    }
  } catch {
    /* ignore */
  }
  return UI_FONT_SCALE_DEFAULT
}

export function cacheUiFontScale(tenantId: number, pct: number): void {
  try {
    localStorage.setItem(fontScaleStorageKey(tenantId), String(clampUiFontScale(pct)))
  } catch {
    /* ignore */
  }
}

export function readAppliedUiFontScalePercent(): number {
  if (typeof document === 'undefined') return UI_FONT_SCALE_DEFAULT
  const raw = document.documentElement.style.getPropertyValue('--ui-font-scale').trim()
    || getComputedStyle(document.documentElement).getPropertyValue('--ui-font-scale').trim()
  const scale = parseFloat(raw)
  if (!Number.isFinite(scale) || scale <= 0) return UI_FONT_SCALE_DEFAULT
  return clampUiFontScale(Math.round(scale * 100))
}

/** يطبّق المقياس عبر متغير CSS ثابت — لا يغيّر font-size على html مباشرة (يقلّل CLS) */
export function applyUiFontScale(pct: number): void {
  if (typeof document === 'undefined') return
  const scale = clampUiFontScale(pct) / 100
  document.documentElement.style.setProperty('--ui-font-scale', String(scale))
}

/** يطبّق فقط عند تغيّر القيمة الفعلية — يمنع إعادة التدفق عند كل تنقل */
export function applyUiFontScaleIfChanged(pct: number): boolean {
  const next = clampUiFontScale(pct)
  if (readAppliedUiFontScalePercent() === next) return false
  applyUiFontScale(next)
  return true
}

export function initUiFontScaleFromStorage(): void {
  try {
    const tenantRaw = localStorage.getItem('currentTenantId')
    const tenantId = tenantRaw ? Number(tenantRaw) : undefined
    applyUiFontScale(readCachedUiFontScale(Number.isFinite(tenantId) ? tenantId : undefined))
  } catch {
    applyUiFontScale(UI_FONT_SCALE_DEFAULT)
  }
}
