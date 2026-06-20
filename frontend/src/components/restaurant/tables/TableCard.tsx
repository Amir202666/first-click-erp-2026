import type { RestaurantTableFloor } from '../../../types'
import { TABLE_STATUS_CONFIG, formatReservationTime } from '../../../utils/restaurantFloorMap'

type Props = {
  table: RestaurantTableFloor
  lang: 'ar' | 'en'
  onClick: (table: RestaurantTableFloor) => void
}

export default function TableCard({ table, lang, onClick }: Props) {
  const cfg = TABLE_STATUS_CONFIG[table.display_status] ?? TABLE_STATUS_CONFIG.available
  const round = table.shape === 'round'

  return (
    <button
      type="button"
      onClick={() => onClick(table)}
      className={`
        relative cursor-pointer border-2 p-3 sm:p-4 min-h-[88px] sm:min-h-[96px]
        transition-all duration-200 hover:scale-[1.03] hover:shadow-lg
        ${cfg.bg} ${cfg.border}
        ${round ? 'rounded-full aspect-square max-w-[96px]' : 'rounded-xl'}
      `}
    >
      <div className="absolute top-1 end-1 text-sm" aria-hidden>
        {cfg.icon}
      </div>
      <div className="text-xl sm:text-2xl font-bold text-center text-gray-700 dark:text-gray-200">
        {table.number}
      </div>
      <div className="flex items-center justify-center gap-1 mt-1 text-xs text-gray-500 dark:text-gray-400">
        <span>👤 {table.capacity ?? '—'}</span>
      </div>
      {table.display_status === 'reserved' && table.reservation && (
        <div className="mt-2 text-[10px] sm:text-xs text-center text-blue-700 dark:text-blue-300 font-medium truncate leading-snug">
          {table.reservation.customer_name}
          <br />
          <span className="text-blue-500">{formatReservationTime(table.reservation.time)}</span>
        </div>
      )}
      {table.display_status === 'occupied' && table.occupied_since && (
        <div className="mt-1 text-[10px] sm:text-xs text-center text-red-600 dark:text-red-400">
          {lang === 'ar' ? 'منذ' : 'Since'} {table.occupied_since}
        </div>
      )}
    </button>
  )
}
