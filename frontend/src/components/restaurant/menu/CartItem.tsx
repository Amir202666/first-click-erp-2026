import { Minus, Plus } from 'lucide-react'
import type { Lang, MenuCurrencyInfo, MenuItem } from '../../../types/menu'
import { formatMenuPrice } from '../../../utils/currency'

interface CartItemProps {
  item: MenuItem
  quantity: number
  lang: Lang
  currency: MenuCurrencyInfo
  primaryColor: string
  onAdd: () => void
  onRemove: () => void
}

export default function CartItem({
  item,
  quantity,
  lang,
  currency,
  primaryColor,
  onAdd,
  onRemove,
}: CartItemProps) {
  const isAr = lang === 'ar'
  const name = isAr ? item.name : (item.name_en || item.name)

  return (
    <div className="flex items-center gap-3 border-b border-neutral-100 py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-neutral-900">{name}</p>
        <p dir="ltr" className="text-xs text-neutral-500">
          {formatMenuPrice(item.price, currency)}
        </p>
      </div>

      <div className="flex items-center gap-1 rounded-app border border-neutral-200 bg-neutral-50">
        <button
          type="button"
          onClick={onRemove}
          className="flex h-7 w-7 items-center justify-center text-neutral-700 hover:bg-neutral-200"
          aria-label={isAr ? 'تقليل' : 'Decrease'}
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="min-w-[1.25rem] text-center text-sm">{quantity}</span>
        <button
          type="button"
          onClick={onAdd}
          className="flex h-7 w-7 items-center justify-center text-white"
          style={{ backgroundColor: primaryColor }}
          aria-label={isAr ? 'زيادة' : 'Increase'}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <p dir="ltr" className="w-20 shrink-0 whitespace-nowrap text-end text-sm text-neutral-900">
        {formatMenuPrice(Number(item.price) * quantity, currency)}
      </p>
    </div>
  )
}
