export type Lang = 'ar' | 'en'

export interface MenuCurrencyInfo {
  code: string
  symbol?: string | null
  decimal_places?: number
}

export interface PublicRestaurantInfo {
  name: string
  name_en?: string
  logo_url?: string
  cover_url?: string
  table_number?: number
  currency: string
  currency_symbol?: string | null
  currency_decimal_places?: number
  service_charge_percent: number
  primary_color: string
  slug: string
}

export function menuCurrencyFromRestaurant(restaurant: Pick<PublicRestaurantInfo, 'currency' | 'currency_symbol' | 'currency_decimal_places'>): MenuCurrencyInfo {
  return {
    code: restaurant.currency || 'SAR',
    symbol: restaurant.currency_symbol,
    decimal_places: restaurant.currency_decimal_places,
  }
}

export interface MenuCategory {
  id: number
  name: string
  name_en?: string
  icon?: string
  image_url?: string
  sort_order: number
}

export interface MenuItem {
  id: number
  category_id: number
  name: string
  name_en?: string
  description?: string
  description_en?: string
  price: number
  original_price?: number
  image_url?: string
  emoji?: string
  is_available: boolean
  allergens?: string[]
  calories?: number
}

export interface PublicMenuData {
  restaurant: PublicRestaurantInfo
  categories: MenuCategory[]
  items: MenuItem[]
}

export interface CartItem {
  item_id: number
  quantity: number
  notes?: string
}

export interface OrderPayload {
  tenant_slug: string
  table_number: number
  items: CartItem[]
  notes?: string
  lang: Lang
}

export interface OrderResponse {
  order_number: string
  estimated_minutes: number
  message: string
}
