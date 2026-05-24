import type { Lang, MenuCategory, MenuCurrencyInfo, MenuItem } from '../../../types/menu'
import MenuItemCard from './MenuItemCard'

interface MenuItemsGridProps {
  categories: MenuCategory[]
  items: MenuItem[]
  activeCategoryId: number | null
  lang: Lang
  currency: MenuCurrencyInfo
  primaryColor: string
  getItemQuantity: (itemId: number) => number
  onAddItem: (itemId: number) => void
  onRemoveItem: (itemId: number) => void
}

export default function MenuItemsGrid({
  categories,
  items,
  activeCategoryId,
  lang,
  currency,
  primaryColor,
  getItemQuantity,
  onAddItem,
  onRemoveItem,
}: MenuItemsGridProps) {
  const isAr = lang === 'ar'
  const sortedCategories = [...categories].sort((a, b) => a.sort_order - b.sort_order)
  const activeCategory =
    sortedCategories.find((c) => c.id === activeCategoryId) ?? sortedCategories[0] ?? null

  if (!activeCategory) {
    return (
      <div className="px-4 py-12 text-center text-sm text-neutral-500">
        {isAr ? 'لا توجد أقسام في المنيو' : 'No menu categories'}
      </div>
    )
  }

  const categoryItems = items.filter((i) => i.category_id === activeCategory.id)
  const categoryName = isAr ? activeCategory.name : (activeCategory.name_en || activeCategory.name)

  return (
    <div className="px-3 py-3 sm:px-4">
      <div className="flex items-center gap-2 px-1 py-2">
        {activeCategory.image_url ? (
          <img src={activeCategory.image_url} alt="" className="h-8 w-8 rounded-full object-cover" />
        ) : activeCategory.icon ? (
          <span className="text-lg">{activeCategory.icon}</span>
        ) : null}
        <h2 className="text-sm text-neutral-700">{categoryName}</h2>
      </div>

      {categoryItems.length === 0 ? (
        <div className="rounded-app border border-dashed border-neutral-200 bg-white px-4 py-12 text-center text-sm text-neutral-500">
          {isAr ? 'لا توجد أصناف في هذا القسم' : 'No items in this category'}
        </div>
      ) : (
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))' }}
        >
          {categoryItems.map((item) => (
            <MenuItemCard
              key={item.id}
              item={item}
              lang={lang}
              currency={currency}
              quantity={getItemQuantity(item.id)}
              primaryColor={primaryColor}
              onAdd={() => onAddItem(item.id)}
              onRemove={() => onRemoveItem(item.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
