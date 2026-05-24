import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { usePublicMenu } from '../../hooks/usePublicMenu'
import { useCart } from '../../hooks/useCart'
import { useOrder } from '../../hooks/useOrder'
import type { Lang } from '../../types/menu'
import { menuCurrencyFromRestaurant } from '../../types/menu'
import MenuHeader from '../../components/restaurant/menu/MenuHeader'
import MenuCategoryBar from '../../components/restaurant/menu/MenuCategoryBar'
import MenuItemsGrid from '../../components/restaurant/menu/MenuItemsGrid'
import CartDrawer from '../../components/restaurant/menu/CartDrawer'
import MenuFloatingCart from '../../components/restaurant/menu/MenuFloatingCart'
import OrderSuccessScreen from '../../components/restaurant/menu/OrderSuccessScreen'

export default function MenuPublic() {
  const { slug } = useParams<{ slug: string }>()
  const [searchParams] = useSearchParams()
  const tableNumber = Number(searchParams.get('table') ?? 1)

  const [lang, setLang] = useState<Lang>('ar')
  const [activeCat, setActiveCat] = useState<number | null>(null)
  const [orderSuccess, setOrderSuccess] = useState<{ orderNumber: string; minutes: number } | null>(null)
  const [orderNote, setOrderNote] = useState('')
  const [cartOpen, setCartOpen] = useState(false)

  const { data: menu, isLoading, isError, error } = usePublicMenu(slug)

  const serviceChargePercent = menu?.restaurant.service_charge_percent ?? 10
  const cart = useCart(serviceChargePercent)

  const orderMutation = useOrder(slug, {
    onSuccess: (data) => {
      setOrderSuccess({ orderNumber: data.order_number, minutes: data.estimated_minutes })
      cart.clearCart()
      setOrderNote('')
      setCartOpen(false)
    },
  })

  const menuItems = menu?.items ?? []
  const categories = menu?.categories ?? []
  const primaryColor = menu?.restaurant.primary_color ?? '#10b981'
  const currency = useMemo(
    () => (menu?.restaurant ? menuCurrencyFromRestaurant(menu.restaurant) : { code: 'SAR', symbol: 'ر.س', decimal_places: 2 }),
    [menu?.restaurant],
  )

  const { subtotal, serviceCharge, total } = useMemo(
    () => cart.calculateTotals(menuItems),
    [cart, menuItems],
  )

  useEffect(() => {
    if (categories.length > 0 && activeCat == null) {
      const sorted = [...categories].sort((a, b) => a.sort_order - b.sort_order)
      setActiveCat(sorted[0].id)
    }
  }, [categories, activeCat])

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  }, [lang])

  useEffect(() => {
    if (menu?.restaurant.name) {
      document.title = menu.restaurant.name
    }
  }, [menu?.restaurant.name])

  const handleCategoryChange = useCallback((categoryId: number) => {
    setActiveCat(categoryId)
  }, [])

  const handleSubmitOrder = useCallback(() => {
    if (!slug || cart.cartItems.length === 0) return
    orderMutation.mutate({
      tenant_slug: slug,
      table_number: tableNumber,
      items: cart.cartItems,
      notes: orderNote.trim() || undefined,
      lang,
    })
  }, [slug, cart.cartItems, tableNumber, orderNote, lang, orderMutation])

  const submitError = orderMutation.isError
    ? ((orderMutation.error as { response?: { data?: { message?: string } } })?.response?.data?.message
      ?? (lang === 'ar' ? 'تعذّر إرسال الطلب. حاول مرة أخرى.' : 'Could not place order. Please try again.'))
    : null

  const cartDrawerProps = {
    cartItems: cart.cartItems,
    menuItems,
    lang,
    currency,
    primaryColor,
    serviceChargePercent,
    orderNote,
    onOrderNoteChange: setOrderNote,
    subtotal,
    serviceCharge,
    total,
    onAddItem: cart.addItem,
    onRemoveItem: cart.removeItem,
    onSubmit: handleSubmitOrder,
    isSubmitting: orderMutation.isPending,
    submitError,
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-600" />
      </div>
    )
  }

  if (isError || !menu) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-6 text-center">
        <p className="text-lg text-neutral-800">
          {lang === 'ar' ? 'تعذّر تحميل المنيو' : 'Could not load menu'}
        </p>
        <p className="mt-2 text-sm text-neutral-500">
          {(error as Error)?.message ?? ''}
        </p>
      </div>
    )
  }

  if (orderSuccess) {
    return (
      <OrderSuccessScreen
        lang={lang}
        orderNumber={orderSuccess.orderNumber}
        estimatedMinutes={orderSuccess.minutes}
        primaryColor={primaryColor}
        onNewOrder={() => setOrderSuccess(null)}
      />
    )
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <MenuHeader
        restaurant={menu.restaurant}
        tableNumber={tableNumber}
        lang={lang}
        onLangChange={setLang}
      />

      <MenuCategoryBar
        categories={categories}
        activeCategoryId={activeCat}
        lang={lang}
        primaryColor={primaryColor}
        onActiveChange={handleCategoryChange}
      />

      <div className="mx-auto flex w-full max-w-6xl">
        <main className="min-w-0 flex-1 pb-28 sm:pb-4">
          <MenuItemsGrid
            categories={categories}
            items={menuItems}
            activeCategoryId={activeCat}
            lang={lang}
            currency={currency}
            primaryColor={primaryColor}
            getItemQuantity={cart.getItemQuantity}
            onAddItem={cart.addItem}
            onRemoveItem={cart.removeItem}
          />
        </main>

        <aside className="cart-panel hidden w-64 shrink-0 border-s border-neutral-200 bg-white sm:sticky sm:top-0 sm:block sm:h-[calc(100vh-8rem)] sm:self-start">
          <CartDrawer variant="desktop" open onClose={() => {}} {...cartDrawerProps} />
        </aside>
      </div>

      <MenuFloatingCart
        lang={lang}
        totalItems={cart.totalItems}
        total={total}
        currency={currency}
        primaryColor={primaryColor}
        onClick={() => setCartOpen(true)}
      />

      <CartDrawer
        variant="mobile"
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        {...cartDrawerProps}
      />
    </div>
  )
}
