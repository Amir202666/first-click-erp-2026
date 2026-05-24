import type { Lang, PublicRestaurantInfo } from '../../../types/menu'
import { cn } from '../../../lib/cn'

interface MenuHeaderProps {
  restaurant: PublicRestaurantInfo
  tableNumber: number
  lang: Lang
  onLangChange: (lang: Lang) => void
}

export default function MenuHeader({ restaurant, tableNumber, lang, onLangChange }: MenuHeaderProps) {
  const isAr = lang === 'ar'
  const name = isAr ? restaurant.name : (restaurant.name_en || restaurant.name)
  const primaryColor = restaurant.primary_color || '#10b981'

  return (
    <header
      className="relative overflow-hidden text-white shadow-md"
      style={{ backgroundColor: primaryColor }}
    >
      {restaurant.cover_url ? (
        <div
          aria-hidden
          className="absolute inset-0 bg-cover bg-center opacity-20"
          style={{ backgroundImage: `url(${restaurant.cover_url})` }}
        />
      ) : null}
      <div className="relative px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {restaurant.logo_url ? (
              <img
                src={restaurant.logo_url}
                alt={name}
                className="h-12 w-12 shrink-0 rounded-app border-2 border-white/30 object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-app bg-white/20 text-2xl">
                🍽️
              </div>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-lg text-white sm:text-xl">{name}</h1>
              <p className="text-sm text-white/85">
                {isAr ? `طاولة ${tableNumber}` : `Table ${tableNumber}`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onLangChange(isAr ? 'en' : 'ar')}
            className={cn(
              'shrink-0 rounded-app border border-white/40 bg-white/15 px-3 py-1.5 text-sm text-white',
              'transition hover:bg-white/25 active:scale-95',
            )}
            aria-label={isAr ? 'Switch to English' : 'التبديل للعربية'}
          >
            {isAr ? 'EN' : 'عربي'}
          </button>
        </div>
      </div>
    </header>
  )
}
