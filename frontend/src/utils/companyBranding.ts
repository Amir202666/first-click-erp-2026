import type { Tenant } from '../types'

type SettingsLike = Record<string, unknown> | null | undefined

/**
 * اسم الشركة من الإعدادات العامة (company_name) ثم اسم المستأجر.
 */
export function getCompanyName(
  settings: SettingsLike,
  tenant?: Pick<Tenant, 'name'> | null,
): string {
  const fromSettings = settings?.company_name
  if (typeof fromSettings === 'string' && fromSettings.trim() !== '') {
    return fromSettings.trim()
  }
  return tenant?.name?.trim() ?? ''
}

export function getCompanyLogoUrl(settings: SettingsLike): string | undefined {
  const logo = settings?.company_logo
  if (typeof logo === 'string' && logo.trim() !== '') {
    return logo.trim()
  }
  return undefined
}
