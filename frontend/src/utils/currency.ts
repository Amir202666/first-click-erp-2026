import type { Currency } from '../types'

export function coerceDecimalPlaces(v: unknown, fallback = 2): number {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return Math.min(20, Math.max(0, Math.round(v)))
  }
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    if (Number.isFinite(n)) return Math.min(20, Math.max(0, Math.round(n)))
  }
  return fallback
}

/**
 * تنسيق مبلغ حسب عملة (عدد الكسور العشرية من إعدادات العملة).
 * يُستخدم في الفواتير والتقارير وعرض المبالغ في الواجهة.
 */
export function formatAmount(
  amount: number,
  currency?: Currency | { decimal_places?: unknown; symbol?: string | null } | null,
  locale?: string
): string {
  const num = Number(amount)
  const safeAmount = Number.isFinite(num) ? num : 0
  const rawDecimals =
    currency && typeof currency === 'object' && currency !== null && 'decimal_places' in currency
      ? coerceDecimalPlaces((currency as { decimal_places?: unknown }).decimal_places)
      : 2
  const decimals = Number.isFinite(rawDecimals) && rawDecimals >= 0 && rawDecimals <= 20
    ? Math.round(rawDecimals)
    : 2
  const loc = locale ?? (typeof navigator !== 'undefined' ? navigator.language : 'en-US')
  return safeAmount.toLocaleString(loc, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/**
 * تنسيق مبلغ مع رمز العملة إن وُجد.
 */
export function formatAmountWithSymbol(
  amount: number,
  currency?: Currency | { decimal_places?: number; symbol?: string | null } | null,
  locale?: string
): string {
  const formatted = formatAmount(amount, currency, locale)
  const raw = currency && (currency as Currency).symbol
  const trimmed = typeof raw === 'string' ? raw.trim() : ''
  const symbol = trimmed !== '' && !/^\d+$/.test(trimmed) ? trimmed : null
  if (symbol) {
    return `${formatted} ${symbol}`
  }
  return formatted
}

export type MenuPriceCurrency =
  | string
  | { code?: string; symbol?: string | null; decimal_places?: number }

/** تنسيق سعر المنيو — يستخدم عملة النظام الافتراضية (رمز + عدد الكسور) */
export function formatMenuPrice(amount: unknown, currency: MenuPriceCurrency = 'SAR', locale?: string): string {
  const num = Number(amount)
  const safe = Number.isFinite(num) ? num : 0
  const info = typeof currency === 'string'
    ? { code: currency.trim() || 'SAR', symbol: null, decimal_places: 2 }
    : {
        code: (currency.code ?? 'SAR').trim() || 'SAR',
        symbol: currency.symbol ?? null,
        decimal_places: currency.decimal_places ?? 2,
      }
  const symbol = (typeof info.symbol === 'string' && info.symbol.trim() !== '')
    ? info.symbol.trim()
    : info.code
  return formatAmountWithSymbol(safe, { symbol, decimal_places: info.decimal_places }, locale)
}
