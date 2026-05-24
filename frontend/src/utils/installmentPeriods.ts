import type { InstallmentPeriod, TenantSettings } from '../types'

export const DEFAULT_INSTALLMENT_PERIOD_CATALOG: InstallmentPeriod[] = [
  { id: -1, code: 'monthly', months: 1, name: 'شهري', name_en: 'Monthly', enabled: true },
  { id: -3, code: 'quarterly', months: 3, name: 'ربع سنوي', name_en: 'Quarterly', enabled: true },
  { id: -6, code: 'semi_annually', months: 6, name: 'نصف سنوي', name_en: 'Semi-Annually', enabled: true },
  { id: -12, code: 'annually', months: 12, name: 'سنوي', name_en: 'Annually', enabled: true },
]

export function normalizeInstallmentEnabledMonths(raw: unknown): number[] {
  if (raw == null || raw === '') return []
  if (Array.isArray(raw)) {
    const nums = raw.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0 && n <= 120)
    return [...new Set(nums)].sort((a, b) => a - b)
  }
  if (typeof raw === 'string') {
    const t = raw.trim()
    if (t === '' || t === '[]') return []
    if (t.startsWith('[') || t.startsWith('{')) {
      try {
        const d = JSON.parse(t) as unknown
        return normalizeInstallmentEnabledMonths(d)
      } catch {
        return []
      }
    }
    if (/^\d+(?:\s*,\s*\d+)*$/.test(t)) {
      const nums = t.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0 && n <= 120)
      return [...new Set(nums)].sort((a, b) => a - b)
    }
  }
  return []
}

/**
 * دوريات الأقساط المعروضة في النماذج: كتالوج افتراضي + صفوف API مع احترام إعداد
 * `installment_enabled_period_months` عندما يكون غير فارغ.
 */
export function buildEffectiveInstallmentPeriods(
  apiPeriods: InstallmentPeriod[],
  settings: TenantSettings | undefined,
): InstallmentPeriod[] {
  const raw = (settings as TenantSettings | undefined)?.['installment_enabled_period_months']
  const allowedMonths = normalizeInstallmentEnabledMonths(raw)
  const unrestricted = allowedMonths.length === 0
  const settingsAllows = (m: number) => unrestricted || allowedMonths.includes(m)

  const byMonth = new Map<number, InstallmentPeriod>()
  for (const p of DEFAULT_INSTALLMENT_PERIOD_CATALOG) {
    byMonth.set(p.months, { ...p })
  }
  for (const r of apiPeriods) {
    const m = r.months
    const base = byMonth.get(m) ?? {
      id: r.id,
      code: r.code,
      months: m,
      name: r.name,
      name_en: r.name_en ?? null,
      enabled: true,
    }
    byMonth.set(m, {
      ...base,
      id: r.id,
      code: r.code || base.code,
      name: r.name || base.name,
      name_en: r.name_en ?? base.name_en,
    })
  }

  const merged = Array.from(byMonth.values())
    .map((p) => ({
      ...p,
      enabled: settingsAllows(p.months),
    }))
    .filter((p) => p.enabled)
    .sort((a, b) => a.months - b.months)

  return merged.length > 0
    ? merged
    : [{ id: 0, code: 'monthly', months: 1, name: 'شهري', name_en: 'Monthly', enabled: true }]
}
