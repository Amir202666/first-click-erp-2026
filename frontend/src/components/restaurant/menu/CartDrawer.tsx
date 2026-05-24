import { ShoppingCart, X } from 'lucide-react'
import type { CartItem as CartItemType, Lang, MenuCurrencyInfo, MenuItem } from '../../../types/menu'
import { cn } from '../../../lib/cn'
import { formatMenuPrice } from '../../../utils/currency'
import CartItem from './CartItem'

interface CartDrawerProps {
  variant: 'desktop' | 'mobile'
  open: boolean
  onClose: () => void
  cartItems: CartItemType[]
  menuItems: MenuItem[]
  lang: Lang
  currency: MenuCurrencyInfo
  primaryColor: string
  serviceChargePercent: number
  orderNote: string
  onOrderNoteChange: (note: string) => void
  subtotal: number
  serviceCharge: number
  total: number
  onAddItem: (itemId: number) => void
  onRemoveItem: (itemId: number) => void
  onSubmit: () => void
  isSubmitting: boolean
  submitError?: string | null
}

export default function CartDrawer({
  variant,
  open,
  onClose,
  cartItems,
  menuItems,
  lang,
  currency,
  primaryColor,
  serviceChargePercent,
  orderNote,
  onOrderNoteChange,
  subtotal,
  serviceCharge,
  total,
  onAddItem,
  onRemoveItem,
  onSubmit,
  isSubmitting,
  submitError,
}: CartDrawerProps) {
  const isAr = lang === 'ar'
  const isEmpty = cartItems.length === 0
  const isMobile = variant === 'mobile'

  const content = (
    <>
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <h2 className="text-base text-neutral-900">
          {isAr ? 'سلة الطلب' : 'Your order'}
        </h2>
        {isMobile ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-app p-1 text-neutral-500 hover:bg-neutral-100"
            aria-label={isAr ? 'إغلاق' : 'Close'}
          >
            <X className="h-5 w-5" />
          </button>
        ) : null}
      </div>

      <div className={cn('overflow-y-auto px-4', isEmpty ? 'flex flex-1 flex-col' : 'flex-1')}>
        {isEmpty ? (
          <div className="flex flex-1 flex-col items-center justify-center py-10 text-neutral-400">
            <ShoppingCart className="mb-3 h-8 w-8 opacity-40" strokeWidth={1.5} />
            <p className="text-sm text-neutral-500">{isAr ? 'السلة فارغة' : 'Cart is empty'}</p>
            <p className="mt-1 text-xs text-neutral-300">
              {isAr ? 'أضف أصنافاً من المنيو' : 'Add items from the menu'}
            </p>
          </div>
        ) : (
          cartItems.map((ci) => {
            const item = menuItems.find((m) => m.id === ci.item_id)
            if (!item) return null
            return (
              <CartItem
                key={ci.item_id}
                item={item}
                quantity={ci.quantity}
                lang={lang}
                currency={currency}
                primaryColor={primaryColor}
                onAdd={() => onAddItem(ci.item_id)}
                onRemove={() => onRemoveItem(ci.item_id)}
              />
            )
          })
        )}
      </div>

      {!isEmpty ? (
        <div className="border-t border-neutral-200 px-4 py-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-600">
              {isAr ? 'ملاحظة للمطبخ' : 'Note for kitchen'}
            </span>
            <textarea
              value={orderNote}
              onChange={(e) => onOrderNoteChange(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-app border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
              placeholder={isAr ? 'مثال: بدون بصل' : 'e.g. no onions'}
            />
          </label>

          <div className="space-y-1 text-sm">
            <div className="flex justify-between gap-2 text-neutral-600">
              <span>{isAr ? 'المجموع' : 'Subtotal'}</span>
              <span dir="ltr" className="shrink-0 whitespace-nowrap">{formatMenuPrice(subtotal, currency)}</span>
            </div>
            <div className="flex justify-between gap-2 text-neutral-600">
              <span>
                {isAr ? `رسوم الخدمة (${serviceChargePercent}%)` : `Service (${serviceChargePercent}%)`}
              </span>
              <span dir="ltr" className="shrink-0 whitespace-nowrap">{formatMenuPrice(serviceCharge, currency)}</span>
            </div>
            <div className="flex justify-between gap-2 pt-1 text-base text-neutral-900">
              <span>{isAr ? 'الإجمالي' : 'Total'}</span>
              <span dir="ltr" className="shrink-0 whitespace-nowrap">{formatMenuPrice(total, currency)}</span>
            </div>
          </div>

          {submitError ? (
            <p className="text-sm text-danger-600">{submitError}</p>
          ) : null}

          <button
            type="button"
            onClick={onSubmit}
            disabled={isSubmitting || isEmpty}
            className={cn(
              'w-full rounded-app py-3 text-sm text-white transition',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
            style={{ backgroundColor: primaryColor }}
          >
            {isSubmitting
              ? (isAr ? 'جاري الإرسال...' : 'Sending...')
              : (isAr ? 'إرسال الطلب' : 'Place order')}
          </button>
        </div>
      ) : null}
    </>
  )

  if (variant === 'desktop') {
    return (
      <aside className="cart-panel flex h-full w-full flex-col bg-white">
        {content}
      </aside>
    )
  }

  if (!open) return null

  return (
  <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/40 sm:hidden"
        onClick={onClose}
        aria-label={isAr ? 'إغلاق السلة' : 'Close cart'}
      />
      <aside
        className={cn(
          'cart-sheet fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-2xl bg-white shadow-2xl sm:hidden',
          'animate-in slide-in-from-bottom duration-300',
        )}
      >
        <div className="mx-auto my-2 h-1 w-10 rounded-full bg-neutral-300" />
        {content}
      </aside>
    </>
  )
}
