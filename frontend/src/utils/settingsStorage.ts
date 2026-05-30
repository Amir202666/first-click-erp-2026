import type { TenantSettings } from '../types'

const SETTINGS_KEY_PREFIX = 'fc_settings_t'

function storageKey(tenantId: number): string {
  return `${SETTINGS_KEY_PREFIX}${tenantId}`
}

export function readCachedSettings(tenantId: number): TenantSettings | undefined {
  if (!tenantId) return undefined
  try {
    const raw = localStorage.getItem(storageKey(tenantId))
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as TenantSettings
    return parsed && typeof parsed === 'object' ? parsed : undefined
  } catch {
    return undefined
  }
}

export function cacheSettings(tenantId: number, settings: TenantSettings): void {
  if (!tenantId) return
  try {
    localStorage.setItem(storageKey(tenantId), JSON.stringify(settings))
  } catch {
    /* ignore */
  }
}
