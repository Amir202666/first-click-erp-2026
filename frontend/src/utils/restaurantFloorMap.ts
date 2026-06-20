import type { RestaurantTableDisplayStatus, RestaurantTableFloor } from '../types'

export const TABLE_STATUS_CONFIG: Record<
  RestaurantTableDisplayStatus,
  { bg: string; border: string; icon: string; labelAr: string; labelEn: string }
> = {
  available: {
    bg: 'bg-emerald-100 dark:bg-emerald-900/30',
    border: 'border-emerald-400',
    icon: '🪑',
    labelAr: 'متاحة',
    labelEn: 'Available',
  },
  reserved: {
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    border: 'border-blue-400',
    icon: '📋',
    labelAr: 'محجوزة',
    labelEn: 'Reserved',
  },
  preparing: {
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    border: 'border-amber-400',
    icon: '🍽️',
    labelAr: 'قيد التحضير',
    labelEn: 'Preparing',
  },
  occupied: {
    bg: 'bg-red-100 dark:bg-red-900/30',
    border: 'border-red-400',
    icon: '👥',
    labelAr: 'مشغولة',
    labelEn: 'Occupied',
  },
  closed: {
    bg: 'bg-gray-100 dark:bg-gray-800',
    border: 'border-gray-300 dark:border-gray-600',
    icon: '🚫',
    labelAr: 'مغلقة',
    labelEn: 'Closed',
  },
}

export function formatReservationTime(time: string): string {
  if (!time) return '—'
  const [h, m] = time.split(':')
  const hour = Number(h)
  const min = m ?? '00'
  if (Number.isNaN(hour)) return time
  const suffix = hour >= 12 ? 'م' : 'ص'
  const h12 = hour % 12 || 12
  return `${h12}:${min} ${suffix}`
}

export function dateLabel(dateStr: string, lang: 'ar' | 'en'): string {
  const today = new Date()
  const d = new Date(dateStr + 'T12:00:00')
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  const fmt = (x: Date) => x.toISOString().slice(0, 10)
  if (fmt(d) === fmt(today)) return lang === 'ar' ? 'اليوم' : 'Today'
  if (fmt(d) === fmt(tomorrow)) return lang === 'ar' ? 'غداً' : 'Tomorrow'
  return d.toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-GB')
}

export function computeFloorStats(tables: RestaurantTableFloor[]) {
  const total = tables.length
  const available = tables.filter((t) => t.display_status === 'available').length
  const occupied = tables.filter((t) => t.display_status === 'occupied').length
  const reserved = tables.filter((t) => t.display_status === 'reserved').length
  return { total, available, occupied, reserved }
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}
