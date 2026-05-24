import { api } from './client'
import type { MenuCategory, MenuItem } from '../types/menu'

function tenantHeaders(tenantId: number) {
  return { headers: { 'X-Tenant-ID': tenantId.toString() } }
}

export interface MenuAdminSettings {
  primary_color: string
  service_charge_percent: number
  cover_url?: string | null
  is_published: boolean
}

export interface MenuAdminRestaurant {
  name: string
  name_en?: string | null
  slug: string
  logo_url?: string | null
  currency: string
  currency_symbol?: string | null
  currency_decimal_places?: number
}

export interface MenuAdminData {
  restaurant: MenuAdminRestaurant
  settings: MenuAdminSettings
  categories: MenuCategory[]
  items: MenuItem[]
}

export async function fetchRestaurantMenuAdmin(tenantId: number): Promise<MenuAdminData> {
  const { data } = await api.get<MenuAdminData>('/restaurant/menu', tenantHeaders(tenantId))
  return data
}

export async function updateRestaurantMenuSettings(
  tenantId: number,
  payload: Partial<MenuAdminSettings>,
): Promise<void> {
  await api.put('/restaurant/menu/settings', payload, tenantHeaders(tenantId))
}

export async function uploadRestaurantMenuCover(tenantId: number, file: File): Promise<string> {
  const form = new FormData()
  form.append('cover', file)
  const { data } = await api.post<{ cover_url: string }>(
    '/restaurant/menu/cover',
    form,
    { ...tenantHeaders(tenantId), headers: { ...tenantHeaders(tenantId).headers, 'Content-Type': 'multipart/form-data' } },
  )
  return data.cover_url
}

export type MenuCategoryPayload = Partial<MenuCategory> & {
  id?: number
  imageFile?: File | null
}

export async function saveRestaurantMenuCategory(
  tenantId: number,
  payload: MenuCategoryPayload,
): Promise<MenuCategory> {
  const form = new FormData()
  if (payload.name) form.append('name', payload.name)
  if (payload.name_en != null) form.append('name_en', payload.name_en)
  if (payload.icon != null) form.append('icon', payload.icon)
  if (payload.sort_order != null) form.append('sort_order', String(payload.sort_order))
  if (payload.imageFile) form.append('image', payload.imageFile)

  const multipartHeaders = {
    ...tenantHeaders(tenantId),
    headers: { ...tenantHeaders(tenantId).headers, 'Content-Type': 'multipart/form-data' },
  }

  if (payload.id) {
    const { data } = await api.post<MenuCategory>(
      `/restaurant/menu/categories/${payload.id}`,
      form,
      multipartHeaders,
    )
    return data
  }

  const { data } = await api.post<MenuCategory>(
    '/restaurant/menu/categories',
    form,
    multipartHeaders,
  )
  return data
}

export async function deleteRestaurantMenuCategory(tenantId: number, id: number): Promise<void> {
  await api.delete(`/restaurant/menu/categories/${id}`, tenantHeaders(tenantId))
}

export type MenuItemPayload = Partial<MenuItem> & {
  id?: number
  item_id?: number | null
  sort_order?: number
  imageFile?: File | null
}

export async function saveRestaurantMenuItem(
  tenantId: number,
  payload: MenuItemPayload,
): Promise<MenuItem> {
  const form = new FormData()
  if (payload.category_id != null) form.append('category_id', String(payload.category_id))
  if (payload.item_id != null) form.append('item_id', String(payload.item_id))
  if (payload.name) form.append('name', payload.name)
  if (payload.name_en != null) form.append('name_en', payload.name_en)
  if (payload.description != null) form.append('description', payload.description)
  if (payload.description_en != null) form.append('description_en', payload.description_en)
  if (payload.price != null) form.append('price', String(payload.price))
  if (payload.original_price != null) form.append('original_price', String(payload.original_price))
  if (payload.emoji != null) form.append('emoji', payload.emoji)
  form.append('is_available', payload.is_available === false ? '0' : '1')
  if (payload.sort_order != null) form.append('sort_order', String(payload.sort_order))
  if (payload.imageFile) form.append('image', payload.imageFile)

  if (payload.id) {
    const { data } = await api.post<MenuItem>(
      `/restaurant/menu/items/${payload.id}`,
      form,
      { ...tenantHeaders(tenantId), headers: { ...tenantHeaders(tenantId).headers, 'Content-Type': 'multipart/form-data' } },
    )
    return data
  }

  const { data } = await api.post<MenuItem>(
    '/restaurant/menu/items',
    form,
    { ...tenantHeaders(tenantId), headers: { ...tenantHeaders(tenantId).headers, 'Content-Type': 'multipart/form-data' } },
  )
  return data
}

export async function deleteRestaurantMenuItem(tenantId: number, id: number): Promise<void> {
  await api.delete(`/restaurant/menu/items/${id}`, tenantHeaders(tenantId))
}
