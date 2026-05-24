/**
 * Dual-Language Data: returns the display name according to UI language with fallback.
 * - Arabic (ar): use name (name_ar).
 * - English (en): use name_en if present, else name (name_ar) to avoid empty labels.
 */
export type Lang = 'ar' | 'en'

export interface LocalizedNameEntity {
  name?: string
  name_en?: string | null
}

/**
 * Get display name for an entity that has name (Arabic) and optional name_en (English).
 * Used across items, accounts, customers, branches, etc.
 */
export function getLocalizedName(
  entity: LocalizedNameEntity | null | undefined,
  lang: Lang,
  nameKey: string = 'name',
  nameEnKey: string = 'name_en'
): string {
  if (!entity) return ''
  const rec = entity as Record<string, unknown>
  const nameAr = rec[nameKey]
  const nameEn = rec[nameEnKey]
  const strAr = nameAr != null ? String(nameAr).trim() : ''
  const strEn = nameEn != null ? String(nameEn).trim() : ''
  if (lang === 'en' && strEn) return strEn
  return strAr || strEn || ''
}
