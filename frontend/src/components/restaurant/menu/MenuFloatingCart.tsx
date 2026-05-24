import type { Lang, MenuCurrencyInfo } from '../../../types/menu'
import { formatMenuPrice } from '../../../utils/currency'

interface MenuFloatingCartProps {
  lang: Lang
  totalItems: number
  total: number
  currency: MenuCurrencyInfo
  primaryColor: string
  onClick: () => void
}

export default function MenuFloatingCart({
  lang,
  totalItems,
  total,
  currency,
  primaryColor,
  onClick,
}: MenuFloatingCartProps) {
  const isAr = lang === 'ar'
  if (totalItems <= 0) return null

  return (
    <div className="cart-fab fixed inset-x-4 bottom-4 z-30 sm:hidden">
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center justify-between rounded-2xl px-5 py-3.5 text-sm text-white shadow-lg"
        style={{ backgroundColor: primaryColor }}
      >
        <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-sm">{totalItems}</span>
        <span>{isAr ? 'عرض السلة' : 'View cart'}</span>
        <span dir="ltr" className="text-sm opacity-90">
          {formatMenuPrice(total, currency)}
        </span>
      </button>
    </div>
  )
}
