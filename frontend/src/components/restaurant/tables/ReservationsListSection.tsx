import { Check, Pencil, Phone, X } from 'lucide-react'
import type { RestaurantReservation } from '../../../types'
import { dateLabel, formatReservationTime, initials } from '../../../utils/restaurantFloorMap'

type Props = {
  reservations: RestaurantReservation[]
  lang: 'ar' | 'en'
  onEdit: (r: RestaurantReservation) => void
  onConfirm: (r: RestaurantReservation) => void
  onCancel: (r: RestaurantReservation) => void
}

const statusPill: Record<string, string> = {
  confirmed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  completed: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
}

export default function ReservationsListSection({ reservations, lang, onEdit, onConfirm, onCancel }: Props) {
  const isAr = lang === 'ar'

  if (reservations.length === 0) {
    return (
      <div className="py-12 text-center text-slate-500 dark:text-slate-400 text-sm">
        {isAr ? 'لا توجد حجوزات في هذه الفترة.' : 'No reservations in this period.'}
      </div>
    )
  }

  return (
    <>
      <div className="hidden md:block overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
            <tr>
              <th className="px-3 py-2 text-start font-medium text-slate-600 dark:text-slate-400">#</th>
              <th className="px-3 py-2 text-start font-medium text-slate-600 dark:text-slate-400">{isAr ? 'العميل' : 'Customer'}</th>
              <th className="px-3 py-2 text-start font-medium text-slate-600 dark:text-slate-400">{isAr ? 'التاريخ' : 'Date'}</th>
              <th className="px-3 py-2 text-start font-medium text-slate-600 dark:text-slate-400">{isAr ? 'الوقت' : 'Time'}</th>
              <th className="px-3 py-2 text-start font-medium text-slate-600 dark:text-slate-400">{isAr ? 'العدد' : 'Guests'}</th>
              <th className="px-3 py-2 text-start font-medium text-slate-600 dark:text-slate-400">{isAr ? 'طاولة' : 'Table'}</th>
              <th className="px-3 py-2 text-start font-medium text-slate-600 dark:text-slate-400">{isAr ? 'الحالة' : 'Status'}</th>
              <th className="px-3 py-2 text-end font-medium text-slate-600 dark:text-slate-400">{isAr ? 'إجراءات' : 'Actions'}</th>
            </tr>
          </thead>
          <tbody>
            {reservations.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                <td className="px-3 py-3 text-slate-500">{r.id}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-primary-700 text-xs font-bold">
                      {initials(r.customer_name)}
                    </span>
                    <div>
                      <div className="font-medium text-slate-900 dark:text-slate-100">{r.customer_name}</div>
                      {r.customer_phone && (
                        <div className="text-xs text-slate-500" dir="ltr">{r.customer_phone}</div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">{dateLabel(r.reservation_date, lang)}</td>
                <td className="px-3 py-3">{formatReservationTime(String(r.reservation_time).slice(0, 5))}</td>
                <td className="px-3 py-3">👥 {r.guests_count}</td>
                <td className="px-3 py-3">
                  <span className="inline-flex rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-mono text-xs">
                    {r.table?.code || r.table?.name || '—'}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusPill[r.status] ?? statusPill.pending}`}>
                    {r.status === 'confirmed' ? (isAr ? 'مؤكدة' : 'Confirmed') : r.status === 'pending' ? (isAr ? 'انتظار' : 'Pending') : r.status === 'cancelled' ? (isAr ? 'ملغية' : 'Cancelled') : isAr ? 'مكتملة' : 'Completed'}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button type="button" onClick={() => onEdit(r)} className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600" title={isAr ? 'تعديل' : 'Edit'}>
                      <Pencil size={15} />
                    </button>
                    {r.customer_phone && (
                      <a href={`tel:${r.customer_phone}`} className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600">
                        <Phone size={15} />
                      </a>
                    )}
                    {r.status === 'pending' && (
                      <button type="button" onClick={() => onConfirm(r)} className="p-1.5 rounded-md hover:bg-emerald-50 text-emerald-600">
                        <Check size={15} />
                      </button>
                    )}
                    {r.status !== 'cancelled' && r.status !== 'completed' && (
                      <button type="button" onClick={() => onCancel(r)} className="p-1.5 rounded-md hover:bg-red-50 text-red-600">
                        <X size={15} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="md:hidden space-y-3">
        {reservations.map((r) => (
          <div key={r.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700 text-xs font-bold">
                  {initials(r.customer_name)}
                </span>
                <div className="min-w-0">
                  <div className="font-semibold truncate">{r.customer_name}</div>
                  <div className="text-xs text-slate-500">
                    {dateLabel(r.reservation_date, lang)} · {formatReservationTime(String(r.reservation_time).slice(0, 5))}
                  </div>
                </div>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusPill[r.status] ?? statusPill.pending}`}>
                {r.status}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600 dark:text-slate-400">
              <span>👥 {r.guests_count}</span>
              <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1.5 rounded">{r.table?.code || '—'}</span>
            </div>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => onEdit(r)} className="flex-1 rounded-lg border border-slate-200 py-1.5 text-xs">{isAr ? 'تعديل' : 'Edit'}</button>
              {r.status !== 'cancelled' && (
                <button type="button" onClick={() => onCancel(r)} className="rounded-lg border border-red-200 text-red-600 px-3 py-1.5 text-xs">{isAr ? 'إلغاء' : 'Cancel'}</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
