import { useQuery } from '@tanstack/react-query'
import {
  Check,
  Crown,
  Layers,
  Loader2,
  Package,
  Rocket,
  Sparkles,
} from 'lucide-react'
import { fetchSubscriptionPlans, type PublicSubscriptionPlan } from '../../api/subscriptionPlans'
import {
  FEATURED_PLAN_SLUG,
  formatPlanBranches,
  formatPlanPrice,
  formatPlanUsers,
  planFeatureLabels,
} from '../../utils/planDisplay'

const SLUG_ICONS: Record<string, typeof Package> = {
  basic: Package,
  advanced: Rocket,
  integrated: Layers,
  professional: Crown,
}

type Props = {
  selectedPlanId: number | ''
  onSelect: (planId: number) => void
  isAr: boolean
  /** باقات جاهزة (مثلاً من مسار إداري) — وإلا تُجلب من GET /api/subscription-plans */
  plans?: PublicSubscriptionPlan[]
  compact?: boolean
}

export default function SubscriptionPlanPicker({
  selectedPlanId,
  onSelect,
  isAr,
  plans: plansProp,
  compact = false,
}: Props) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['subscription-plans', 'public'],
    queryFn: fetchSubscriptionPlans,
    enabled: plansProp === undefined,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  })

  const plans = plansProp ?? data?.data ?? []

  if (isLoading && !plansProp) {
    return (
      <div className="flex justify-center py-12 text-slate-500">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" aria-hidden />
        <span className="sr-only">{isAr ? 'جاري التحميل' : 'Loading'}</span>
      </div>
    )
  }

  if (isError && !plans.length) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm text-red-800">
        <p>{isAr ? 'تعذر تحميل الباقات.' : 'Could not load plans.'}</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="mt-2 text-xs font-semibold text-red-900 underline"
        >
          {isAr ? 'إعادة المحاولة' : 'Retry'}
        </button>
      </div>
    )
  }

  if (!plans.length) {
    return (
      <p className="py-6 text-center text-sm text-slate-500">
        {isAr ? 'لا توجد باقات نشطة.' : 'No active plans.'}
      </p>
    )
  }

  const chooseLabel = isAr ? 'اختر هذه الباقة' : 'Choose this plan'
  const selectedLabel = isAr ? 'الباقة المختارة' : 'Selected'
  const popularLabel = isAr ? 'الأكثر طلباً' : 'Most popular'

  return (
    <div
      className={`grid gap-4 ${compact ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4'}`}
      role="radiogroup"
      aria-label={isAr ? 'اختيار باقة الاشتراك' : 'Subscription plan selection'}
    >
      {plans.map((plan) => {
        const isFeatured = plan.slug === FEATURED_PLAN_SLUG
        const isSelected = selectedPlanId === plan.id
        const Icon = SLUG_ICONS[plan.slug] ?? Sparkles
        const features = planFeatureLabels(plan.features, isAr)
        const priceLine = formatPlanPrice(
          plan.price,
          plan.currency,
          plan.billing_cycle_months,
          isAr,
        )

        return (
          <article
            key={plan.id}
            role="radio"
            aria-checked={isSelected}
            tabIndex={0}
            onClick={() => onSelect(plan.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelect(plan.id)
              }
            }}
            className={[
              'relative flex flex-col rounded-2xl border-2 bg-white p-5 shadow-sm transition-all duration-200 cursor-pointer',
              'hover:-translate-y-0.5 hover:shadow-md',
              isFeatured && !isSelected ? 'border-blue-500 ring-1 ring-blue-500/20' : 'border-slate-200',
              isSelected ? 'border-primary-600 ring-2 ring-primary-500/30 shadow-md' : '',
            ].join(' ')}
          >
            {isFeatured && (
              <span className="absolute -top-3 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 whitespace-nowrap rounded-full bg-blue-600 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow">
                {popularLabel}
              </span>
            )}

            <div className="mb-4 flex flex-col items-center text-center">
              <div
                className={[
                  'mb-3 flex h-12 w-12 items-center justify-center rounded-xl',
                  isFeatured ? 'bg-blue-50 text-blue-600' : 'bg-primary-50 text-primary-600',
                ].join(' ')}
              >
                <Icon className="h-6 w-6" aria-hidden />
              </div>
              <h3 className="text-base font-bold text-slate-900">{plan.name}</h3>
              <p className="mt-1 text-2xl font-extrabold text-slate-900">{priceLine}</p>
              {plan.description && (
                <p className="mt-2 text-xs leading-relaxed text-slate-500 line-clamp-2">{plan.description}</p>
              )}
            </div>

            <ul className="mb-4 flex-1 space-y-2 text-sm text-slate-700">
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                <span>{formatPlanUsers(plan.max_users, isAr)}</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                <span>{formatPlanBranches(plan.slug, isAr)}</span>
              </li>
              {features.map((label) => (
                <li key={label} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                  <span>{label}</span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onSelect(plan.id)
              }}
              className={[
                'w-full rounded-xl py-2.5 text-sm font-semibold transition-colors',
                isSelected
                  ? 'bg-primary-600 text-white'
                  : isFeatured
                    ? 'bg-blue-600 text-white hover:bg-blue-500'
                    : 'border border-slate-300 bg-white text-slate-800 hover:border-primary-400 hover:bg-primary-50',
              ].join(' ')}
            >
              {isSelected ? selectedLabel : chooseLabel}
            </button>
          </article>
        )
      })}
    </div>
  )
}
