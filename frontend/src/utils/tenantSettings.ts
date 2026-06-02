/**
 * قراءة إعدادات الشركة (tenant settings) بشكل متسق مع الـ API:
 * القيم المحفوظة كـ '0' / '1' أو boolean.
 */

export function isTenantSettingEnabled(
  value: unknown,
  defaultWhenMissing = false,
): boolean {
  if (value === undefined || value === null) {
    return defaultWhenMissing
  }
  if (value === false || value === 0 || value === '0' || value === 'false' || value === 'no') {
    return false
  }
  return value === true || value === 1 || value === '1' || value === 'true' || value === 'yes'
}

/** نسبة ضريبة القيمة المضافة الافتراضية من الإعدادات (يدعم 0%) */
export function parseDefaultVatRate(settings: Record<string, unknown> | null | undefined): number {
  const raw = settings?.default_vat_rate
  if (raw === undefined || raw === null || raw === '') {
    return 15
  }
  const n = Number(raw)
  return Number.isFinite(n) ? n : 15
}

export function isInvoiceExpiryDatesEnabled(settings: Record<string, unknown> | null | undefined): boolean {
  return isTenantSettingEnabled(settings?.invoice_expiry_dates_enabled, false)
}

export function isInvoiceVariantsSalesEnabled(settings: Record<string, unknown> | null | undefined): boolean {
  return isTenantSettingEnabled(settings?.invoice_variants_sales_enabled, false)
}

export function isInvoiceVariantsPurchasesEnabled(settings: Record<string, unknown> | null | undefined): boolean {
  return isTenantSettingEnabled(settings?.invoice_variants_purchases_enabled, false)
}
