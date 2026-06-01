/** يطابق backend/app/Support/PlanFeatureResolver.php */
export const PLAN_ALL_FEATURES = 'all_features'

export const CANONICAL_PLAN_FEATURES = [
  'accounting',
  'sales',
  'purchases',
  'inventory',
  'pos',
  'manufacturing',
  'sales_reps',
  'hr',
] as const

const LEGACY_MAP: Record<string, string[]> = {
  chart_of_accounts: ['accounting'],
  basic_reports: ['accounting'],
  reports: ['accounting'],
  custom_reports: ['accounting'],
  multi_currency: ['accounting'],
  invoices: ['sales', 'purchases'],
  pos_integration: ['pos'],
  payroll: ['hr'],
}

export function expandPlanFeatures(raw: string[] | undefined | null): string[] {
  if (!raw?.length) return []
  if (raw.includes(PLAN_ALL_FEATURES)) {
    return [...CANONICAL_PLAN_FEATURES]
  }
  const out: string[] = []
  for (const feature of raw) {
    if ((CANONICAL_PLAN_FEATURES as readonly string[]).includes(feature)) {
      out.push(feature)
      continue
    }
    const mapped = LEGACY_MAP[feature]
    if (mapped) out.push(...mapped)
  }
  return [...new Set(out)]
}

export function planAllowsFeature(expanded: string[], required: string): boolean {
  if (!expanded.length) return true
  return expanded.includes(required)
}

export function planAllowsAny(expanded: string[], required: string[]): boolean {
  if (!expanded.length) return true
  return required.some((f) => expanded.includes(f))
}
