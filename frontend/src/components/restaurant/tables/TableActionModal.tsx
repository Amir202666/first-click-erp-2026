import { useNavigate } from 'react-router-dom'
import { Phone, X } from 'lucide-react'
import type { RestaurantTableFloor } from '../../../types'
import { TABLE_STATUS_CONFIG } from '../../../utils/restaurantFloorMap'

type Props = {
  table: RestaurantTableFloor
  lang: 'ar' | 'en'
  onClose: () => void
  onStatusChange: (status: string) => void
  onCancelReservation: (reservationId: number) => void
  onSeatReservation: (reservationId: number) => void
  onEditTable: (table: RestaurantTableFloor) => void
  loading?: boolean
}

export default function TableActionModal({
  table,
  lang,
  onClose,
  onStatusChange,
  onCancelReservation,
  onSeatReservation,
  onEditTable,
  loading,
}: Props) {
  const navigate = useNavigate()
  const isAr = lang === 'ar'
  const status = table.display_status
  const cfg = TABLE_STATUS_CONFIG[status]

  const btn = 'w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50'
  const primary = `${btn} bg-primary-600 text-white hover:bg-primary-500`
  const outline = `${btn} border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800`
  const danger = `${btn} border border-red-200 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
        dir={isAr ? 'rtl' : 'ltr'}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {isAr ? 'طاولة' : 'Table'} {table.number}
            </h3>
            <p className="text-sm text-slate-500">
              {cfg.icon} {isAr ? cfg.labelAr : cfg.labelEn}
              {table.section ? ` · ${table.section}` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-2">
          {status === 'available' && (
            <>
              <button type="button" className={primary} disabled={loading} onClick={() => onStatusChange('reserved')}>
                + {isAr ? 'حجز جديد' : 'New reservation'}
              </button>
              <button type="button" className={outline} disabled={loading} onClick={() => onEditTable(table)}>
                ✏️ {isAr ? 'تعديل الطاولة' : 'Edit table'}
              </button>
              <button type="button" className={danger} disabled={loading} onClick={() => onStatusChange('closed')}>
                🚫 {isAr ? 'إغلاق الطاولة' : 'Close table'}
              </button>
            </>
          )}
          {status === 'reserved' && table.reservation && (
            <>
              <button type="button" className={primary} disabled={loading} onClick={() => onSeatReservation(table.reservation!.id)}>
                ✅ {isAr ? 'تحويل لمشغولة' : 'Mark occupied'}
              </button>
              <a
                href={`tel:${table.reservation.customer_phone ?? ''}`}
                className={`${outline} flex items-center justify-center gap-2`}
              >
                <Phone size={16} /> {isAr ? 'الاتصال بالعميل' : 'Call customer'}
              </a>
              <button type="button" className={danger} disabled={loading} onClick={() => onCancelReservation(table.reservation!.id)}>
                ❌ {isAr ? 'إلغاء الحجز' : 'Cancel reservation'}
              </button>
            </>
          )}
          {status === 'occupied' && (
            <>
              <button
                type="button"
                className={primary}
                onClick={() => navigate(`/restaurant/pos?table=${table.id}`)}
              >
                🧾 {isAr ? 'فتح الطلب' : 'Open order'}
              </button>
              <button type="button" className={outline} disabled={loading} onClick={() => onStatusChange('available')}>
                💳 {isAr ? 'إتمام وتحرير الطاولة' : 'Complete & free table'}
              </button>
            </>
          )}
          {(status === 'preparing' || status === 'closed') && (
            <button type="button" className={primary} disabled={loading} onClick={() => onStatusChange('available')}>
              ✅ {isAr ? 'فتح الطاولة' : 'Open table'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
