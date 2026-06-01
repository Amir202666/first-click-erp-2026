import { CANONICAL_PLAN_FEATURES, expandPlanFeatures, PLAN_ALL_FEATURES } from './planFeatures'

/** الباقة المميزة في الواجهة */
export const FEATURED_PLAN_SLUG = 'integrated'

/** حدود الفروع للعرض فقط (لا يوجد عمود max_branches في قاعدة البيانات بعد) */
export const PLAN_BRANCH_LIMITS: Record<string, number | null> = {
  basic: 1,
  advanced: 3,
  integrated: null,
  professional: null,
}

const FEATURE_LABELS: Record<string, { ar: string; en: string }> = {
  accounting: { ar: 'المحاسبة والتقارير', en: 'Accounting & reports' },
  sales: { ar: 'المبيعات والفواتير', en: 'Sales & invoicing' },
  purchases: { ar: 'المشتريات', en: 'Purchases' },
  inventory: { ar: 'المخزون والمستودعات', en: 'Inventory & warehouses' },
  pos: { ar: 'نقطة البيع (POS)', en: 'Point of sale (POS)' },
  manufacturing: { ar: 'التصنيع وقوائم المواد', en: 'Manufacturing & BOM' },
  hr: { ar: 'الموارد البشرية', en: 'Human resources' },
  sales_reps: { ar: 'مناديب المبيعات', en: 'Sales representatives' },
  all_features: { ar: 'جميع مميزات النظام', en: 'All system features' },
}

export function planFeatureLabels(features: string[] | undefined | null, isAr: boolean): string[] {
  if (features?.includes(PLAN_ALL_FEATURES)) {
    return [isAr ? FEATURE_LABELS.all_features.ar : FEATURE_LABELS.all_features.en]
  }
  const expanded = expandPlanFeatures(features)
  const keys = expanded.length ? expanded : [...CANONICAL_PLAN_FEATURES]
  return keys.map((k) => {
    const L = FEATURE_LABELS[k]
    return L ? (isAr ? L.ar : L.en) : k
  })
}

export function formatPlanUsers(maxUsers: number | null | undefined, isAr: boolean): string {
  if (maxUsers == null) return isAr ? 'مستخدمون غير محدود' : 'Unlimited users'
  return isAr ? `حتى ${maxUsers} مستخدمين` : `Up to ${maxUsers} users`
}

export function formatPlanBranches(slug: string, isAr: boolean): string {
  const limit = PLAN_BRANCH_LIMITS[slug]
  if (limit == null) return isAr ? 'فروع غير محدودة' : 'Unlimited branches'
  if (limit === 1) return isAr ? 'فرع واحد' : '1 branch'
  return isAr ? `حتى ${limit} فروع` : `Up to ${limit} branches`
}

export function formatPlanPrice(price: number, currency: string, billingMonths: number, isAr: boolean): string {
  const cur = currency || 'SAR'
  const amount = Number.isInteger(price) ? String(price) : price.toFixed(0)
  const per =
    billingMonths <= 1
      ? isAr
        ? '/شهر'
        : '/mo'
      : isAr
        ? ` /${billingMonths} أشهر`
        : ` /${billingMonths} mo`
  return `${amount} ${cur}${per}`
}
