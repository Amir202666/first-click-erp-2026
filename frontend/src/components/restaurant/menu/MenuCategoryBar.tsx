import { useEffect, useRef } from 'react'
import type { Lang, MenuCategory } from '../../../types/menu'
import { cn } from '../../../lib/cn'

interface MenuCategoryBarProps {
  categories: MenuCategory[]
  activeCategoryId: number | null
  lang: Lang
  primaryColor: string
  onActiveChange: (categoryId: number) => void
}

export default function MenuCategoryBar({
  categories,
  activeCategoryId,
  lang,
  primaryColor,
  onActiveChange,
}: MenuCategoryBarProps) {
  const isAr = lang === 'ar'
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (activeCategoryId == null || !scrollRef.current) return
    const btn = scrollRef.current.querySelector(`[data-cat-btn="${activeCategoryId}"]`)
    if (btn instanceof HTMLElement) {
      btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    }
  }, [activeCategoryId])

  const sorted = [...categories].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <div className="sticky top-0 z-20 border-b border-neutral-200 bg-white/95 backdrop-blur-sm shadow-sm">
      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto px-4 py-3 scrollbar-hide"
        style={{ scrollbarWidth: 'none' }}
      >
        {sorted.map((cat) => {
          const label = isAr ? cat.name : (cat.name_en || cat.name)
          const isActive = activeCategoryId === cat.id
          return (
            <button
              key={cat.id}
              type="button"
              data-cat-btn={cat.id}
              onClick={() => onActiveChange(cat.id)}
              className={cn(
                'inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-sm transition',
                isActive
                  ? 'text-white shadow-sm'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200',
              )}
              style={isActive ? { backgroundColor: primaryColor } : undefined}
            >
              {cat.image_url ? (
                <img src={cat.image_url} alt="" className="h-7 w-7 rounded-full object-cover ring-1 ring-white/30" />
              ) : cat.icon ? (
                <span className="text-base leading-none">{cat.icon.startsWith('ti-') ? '•' : cat.icon}</span>
              ) : null}
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
