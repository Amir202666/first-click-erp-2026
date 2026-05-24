import { Minus, Plus } from 'lucide-react'
import type { Lang, MenuCurrencyInfo, MenuItem } from '../../../types/menu'
import { cn } from '../../../lib/cn'
import { formatMenuPrice } from '../../../utils/currency'

interface MenuItemCardProps {
  item: MenuItem
  lang: Lang
  currency: MenuCurrencyInfo
  quantity: number
  primaryColor: string
  onAdd: () => void
  onRemove: () => void
}

export default function MenuItemCard({
  item,
  lang,
  currency,
  quantity,
  primaryColor,
  onAdd,
  onRemove,
}: MenuItemCardProps) {
  const isAr = lang === 'ar'
  const name = isAr ? item.name : (item.name_en || item.name)
  const description = isAr ? item.description : (item.description_en || item.description)
  const price = Number(item.price)
  const originalPrice = item.original_price != null ? Number(item.original_price) : null
  const hasDiscount = originalPrice != null && originalPrice > price
  const discountPercent = hasDiscount
    ? Math.round((1 - price / originalPrice) * 100)
    : null
  const hasImage = Boolean(item.image_url)

  return (
    <article
      className={cn(
        'flex flex-col overflow-hidden rounded-xl border border-neutral-100 bg-white shadow-sm',
        !item.is_available && 'opacity-60',
      )}
    >
      <div className="relative flex h-28 items-center justify-center bg-neutral-50">
        {hasImage ? (
          <img
            src={item.image_url}
            alt={name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <span className="text-4xl leading-none" aria-hidden>
            {item.emoji || '🍽️'}
          </span>
        )}

        {discountPercent != null && discountPercent > 0 && item.is_available ? (
          <span className="absolute top-2 end-2 rounded-full bg-red-500 px-2 py-0.5 text-[10px] text-white">
            -{discountPercent}%
          </span>
        ) : null}

        {!item.is_available ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <span className="rounded-full bg-white/90 px-3 py-1 text-xs text-neutral-700">
              {isAr ? 'نفذ' : 'Sold out'}
            </span>
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-2.5">
        <h3 className="line-clamp-2 text-sm leading-tight text-neutral-900">{name}</h3>
        {description ? (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-neutral-500">{description}</p>
        ) : null}

        <div className="mt-2.5 flex items-center justify-between gap-2">
          <div className="min-w-0 shrink">
            {hasDiscount && originalPrice != null ? (
              <span dir="ltr" className="block text-xs text-neutral-400 line-through">
                {formatMenuPrice(originalPrice, currency)}
              </span>
            ) : null}
            <span
              dir="ltr"
              className="block whitespace-nowrap text-sm text-neutral-900"
              style={{ color: primaryColor }}
            >
              {formatMenuPrice(price, currency)}
            </span>
          </div>

          {quantity > 0 ? (
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={onRemove}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-100 text-neutral-700"
                aria-label={isAr ? 'تقليل' : 'Decrease'}
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-4 text-center text-sm text-neutral-900">{quantity}</span>
              <button
                type="button"
                onClick={onAdd}
                disabled={!item.is_available}
                className="flex h-7 w-7 items-center justify-center rounded-full text-white disabled:opacity-40"
                style={{ backgroundColor: primaryColor }}
                aria-label={isAr ? 'زيادة' : 'Increase'}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onAdd}
              disabled={!item.is_available}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg text-white disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: primaryColor }}
              aria-label={isAr ? 'إضافة' : 'Add'}
            >
              +
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
