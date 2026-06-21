import type { TenantSettings } from '../../types'

export function restaurantSettingEnabled(v: unknown): boolean {
  return v === true || v === 1 || v === '1' || v === 'true' || v === 'yes'
}

export function restaurantSettingId(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

export type RestaurantPosDefaults = {
  orderType: 'dine_in' | 'takeaway' | 'delivery' | null
  branchId: number | null
  warehouseId: number | null
  customerId: number | null
}

export type RestaurantPosDisplay = {
  itemCardWidth: number
  itemImageHeight: number
  categoryButtonWidth: number
  categoryIconHeight: number
}

const LEGACY_ICON_SIZE_MAP: Record<string, RestaurantPosDisplay> = {
  small: { itemCardWidth: 100, itemImageHeight: 56, categoryButtonWidth: 80, categoryIconHeight: 56 },
  medium: { itemCardWidth: 120, itemImageHeight: 72, categoryButtonWidth: 100, categoryIconHeight: 72 },
  large: { itemCardWidth: 150, itemImageHeight: 96, categoryButtonWidth: 120, categoryIconHeight: 88 },
}

const DEFAULT_RPOS_DISPLAY: RestaurantPosDisplay = LEGACY_ICON_SIZE_MAP.medium

function clampDim(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

export function readRestaurantPosDisplay(settings: TenantSettings | undefined): RestaurantPosDisplay {
  const s = (settings ?? {}) as Record<string, unknown>
  const legacyKey = typeof s.rpos_item_icon_size === 'string' ? s.rpos_item_icon_size : null
  const legacy = legacyKey && LEGACY_ICON_SIZE_MAP[legacyKey] ? LEGACY_ICON_SIZE_MAP[legacyKey] : DEFAULT_RPOS_DISPLAY

  return {
    itemCardWidth: clampDim(s.rpos_item_icon_width, 60, 280, legacy.itemCardWidth),
    itemImageHeight: clampDim(s.rpos_item_icon_height, 32, 200, legacy.itemImageHeight),
    categoryButtonWidth: clampDim(s.rpos_category_icon_width, 48, 240, legacy.categoryButtonWidth),
    categoryIconHeight: clampDim(s.rpos_category_icon_height, 32, 200, legacy.categoryIconHeight),
  }
}

export function defaultRestaurantPosDisplayForm(): RestaurantPosDisplay {
  return { ...DEFAULT_RPOS_DISPLAY }
}

export function readRestaurantPosDefaults(settings: TenantSettings | undefined): RestaurantPosDefaults {
  const s = (settings ?? {}) as Record<string, unknown>
  const ot = s.rpos_default_order_type
  const orderType =
    ot === 'dine_in' || ot === 'takeaway' || ot === 'delivery' ? ot : null

  return {
    orderType,
    branchId: restaurantSettingEnabled(s.rpos_use_default_branch)
      ? restaurantSettingId(s.rpos_default_branch_id)
      : null,
    warehouseId: restaurantSettingEnabled(s.rpos_use_default_warehouse)
      ? restaurantSettingId(s.rpos_default_warehouse_id)
      : null,
    customerId: restaurantSettingEnabled(s.rpos_use_default_customer)
      ? restaurantSettingId(s.rpos_default_customer_id)
      : null,
  }
}
