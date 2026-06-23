import type { LucideIcon } from 'lucide-react'
import {
  Landmark,
  Wallet,
  Scale,
  HandCoins,
  PieChart,
  Users,
  TrendingUp,
  CircleDollarSign,
  Package,
  Boxes,
  Receipt,
  CreditCard,
} from 'lucide-react'

export type AccountTypeKey = 'asset' | 'liability' | 'equity' | 'revenue' | 'cogs' | 'expense'

export type AccountTypeVisual = {
  badge: string
  iconBg: string
  iconColor: string
  expandBtn: string
  groupIcon: LucideIcon
  leafIcon: LucideIcon
}

/** ألوان وأيقونات دليل الحسابات — متناسقة مع أنواع الحسابات المحاسبية */
export const accountTypeVisuals: Record<string, AccountTypeVisual> = {
  asset: {
    badge: 'bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-200/70',
    iconBg: 'bg-gradient-to-br from-sky-100 to-sky-50 ring-1 ring-sky-200/60',
    iconColor: 'text-sky-700',
    expandBtn: 'hover:bg-sky-50 hover:text-sky-700 hover:ring-sky-200',
    groupIcon: Landmark,
    leafIcon: Wallet,
  },
  liability: {
    badge: 'bg-rose-50 text-rose-800 ring-1 ring-inset ring-rose-200/70',
    iconBg: 'bg-gradient-to-br from-rose-100 to-rose-50 ring-1 ring-rose-200/60',
    iconColor: 'text-rose-700',
    expandBtn: 'hover:bg-rose-50 hover:text-rose-700 hover:ring-rose-200',
    groupIcon: Scale,
    leafIcon: HandCoins,
  },
  equity: {
    badge: 'bg-violet-50 text-violet-800 ring-1 ring-inset ring-violet-200/70',
    iconBg: 'bg-gradient-to-br from-violet-100 to-violet-50 ring-1 ring-violet-200/60',
    iconColor: 'text-violet-700',
    expandBtn: 'hover:bg-violet-50 hover:text-violet-700 hover:ring-violet-200',
    groupIcon: PieChart,
    leafIcon: Users,
  },
  revenue: {
    badge: 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200/70',
    iconBg: 'bg-gradient-to-br from-emerald-100 to-emerald-50 ring-1 ring-emerald-200/60',
    iconColor: 'text-emerald-700',
    expandBtn: 'hover:bg-emerald-50 hover:text-emerald-700 hover:ring-emerald-200',
    groupIcon: TrendingUp,
    leafIcon: CircleDollarSign,
  },
  cogs: {
    badge: 'bg-orange-50 text-orange-800 ring-1 ring-inset ring-orange-200/70',
    iconBg: 'bg-gradient-to-br from-orange-100 to-orange-50 ring-1 ring-orange-200/60',
    iconColor: 'text-orange-700',
    expandBtn: 'hover:bg-orange-50 hover:text-orange-700 hover:ring-orange-200',
    groupIcon: Package,
    leafIcon: Boxes,
  },
  expense: {
    badge: 'bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-200/70',
    iconBg: 'bg-gradient-to-br from-amber-100 to-amber-50 ring-1 ring-amber-200/60',
    iconColor: 'text-amber-800',
    expandBtn: 'hover:bg-amber-50 hover:text-amber-800 hover:ring-amber-200',
    groupIcon: Receipt,
    leafIcon: CreditCard,
  },
}

export const contraRevenueBadge =
  'bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-300/80'

const defaultVisual = accountTypeVisuals.asset

export function getAccountTypeVisual(type: string): AccountTypeVisual {
  return accountTypeVisuals[type] ?? defaultVisual
}

export function accountTypeBadgeClass(type: string, isContraRevenue = false): string {
  if (isContraRevenue) return contraRevenueBadge
  return getAccountTypeVisual(type).badge
}

export function AccountTypeIcon({
  type,
  hasChildren,
  size = 'md',
}: {
  type: string
  hasChildren: boolean
  size?: 'sm' | 'md' | 'lg'
}) {
  const visual = getAccountTypeVisual(type)
  const Icon = hasChildren ? visual.groupIcon : visual.leafIcon
  const box =
    size === 'lg' ? 'w-9 h-9' : size === 'sm' ? 'w-7 h-7' : 'w-8 h-8'
  const iconSize = size === 'lg' ? 18 : size === 'sm' ? 14 : 16

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-lg shadow-sm ${box} ${visual.iconBg}`}
      aria-hidden
    >
      <Icon size={iconSize} className={visual.iconColor} strokeWidth={2.25} />
    </span>
  )
}
