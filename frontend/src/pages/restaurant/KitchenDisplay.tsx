import { useEffect, useState } from 'react'
import { Printer, Volume2, VolumeX } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  elapsedMinutes,
  formatElapsedMmSs,
  useKitchenOrders,
  type KitchenFilter,
} from '../../hooks/useKitchenOrders'
import type { KitchenOrder, OrderStatus } from '../../api/kitchen'

const STATUS_BADGE: Record<OrderStatus, { className: string; labelAr: string; labelEn: string }> = {
  new: { className: 'bg-emerald-100 text-emerald-800', labelAr: 'جديد', labelEn: 'New' },
  cooking: { className: 'bg-amber-100 text-amber-800', labelAr: 'يُحضَّر', labelEn: 'Cooking' },
  ready: { className: 'bg-blue-100 text-blue-800', labelAr: 'جاهز', labelEn: 'Ready' },
  delivered: { className: 'bg-slate-100 text-slate-600', labelAr: 'تم التسليم', labelEn: 'Delivered' },
}

function cardBorderClass(status: OrderStatus, urgent: boolean): string {
  if (status === 'delivered') return 'border-slate-300 opacity-90'
  if (status === 'ready') return 'border-blue-500'
  if (urgent) return 'border-red-500'
  if (status === 'new') return 'border-emerald-500'
  if (status === 'cooking') return 'border-amber-500'
  return 'border-slate-200'
}

function timerBoxClass(status: OrderStatus, minutes: number): string {
  if (status === 'delivered') return 'bg-slate-400 text-white'
  if (status === 'ready') return 'bg-blue-600 text-white'
  if (minutes >= 15) return 'bg-red-600 text-white'
  if (minutes >= 8) return 'bg-amber-600 text-white'
  return 'bg-emerald-600 text-white'
}

function printKitchenTicket(order: KitchenOrder, lang: 'ar' | 'en') {
  const isAr = lang === 'ar'
  const itemsHtml = order.items
    .map(
      (it) =>
        `<tr><td style="padding:6px 8px;font-size:16px;font-weight:700">${it.quantity}× ${it.name}</td></tr>` +
        (it.notes ? `<tr><td style="padding:0 8px 6px;font-size:12px;color:#666">${it.notes}</td></tr>` : ''),
    )
    .join('')
  const html = `<!DOCTYPE html><html dir="${isAr ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"/><title>Kitchen #${order.number}</title>
<style>body{font-family:Tahoma,Arial,sans-serif;margin:16px;} table{width:100%;border-collapse:collapse;} h1{font-size:18px;margin:0 0 8px;}</style></head><body>
<h1>${isAr ? 'تذكرة مطبخ' : 'Kitchen ticket'} #${order.number}</h1>
<p><strong>${isAr ? 'الطاولة' : 'Table'}:</strong> ${order.table_name || '—'}${order.section_name ? ` (${order.section_name})` : ''}</p>
<table border="1" cellpadding="0">${itemsHtml}</table>
<script>window.onload=function(){window.print();}</script></body></html>`
  const w = window.open('', '_blank', 'width=400,height=600')
  if (!w) return
  w.document.write(html)
  w.document.close()
}

function OrderCard({
  order,
  lang,
  isRtl,
  getItemDone,
  toggleItem,
  advanceStatus,
  statusPending,
  tick,
}: {
  order: KitchenOrder
  lang: 'ar' | 'en'
  isRtl: boolean
  getItemDone: (order: KitchenOrder, itemId: number, serverDone: boolean) => boolean
  toggleItem: (order: KitchenOrder, itemId: number, currentDone: boolean) => void
  advanceStatus: (order: KitchenOrder) => void
  statusPending: boolean
  tick: number
}) {
  void tick
  const isDelivered = order.status === 'delivered'
  const mins = elapsedMinutes(order.created_at)
  const urgent = mins >= 15 && order.status !== 'ready' && !isDelivered
  const badge = STATUS_BADGE[order.status]
  const elapsed = formatElapsedMmSs(order.created_at)

  const actionLabel =
    order.status === 'new'
      ? lang === 'ar'
        ? 'بدء التحضير'
        : 'Start cooking'
      : order.status === 'cooking'
        ? lang === 'ar'
          ? 'جاهز'
          : 'Ready'
        : lang === 'ar'
          ? 'تسليم'
          : 'Serve'

  const actionBtnClass =
    order.status === 'new'
      ? 'bg-emerald-600 hover:bg-emerald-700 border-emerald-600'
      : order.status === 'cooking'
        ? 'bg-amber-600 hover:bg-amber-700 border-amber-600'
        : 'bg-blue-600 hover:bg-blue-700 border-blue-600'

  return (
    <article
      className={`flex flex-col rounded-xl border-2 overflow-hidden min-h-[260px] bg-white shadow-sm ${cardBorderClass(order.status, urgent)} ${urgent ? 'kds-urgent-pulse' : ''}`}
    >
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
        <div className="text-base font-bold text-slate-900 leading-snug">
          {order.table_name || (lang === 'ar' ? 'بدون طاولة' : 'No table')}
          <span className="text-slate-400 font-normal mx-1.5">#{order.number}</span>
        </div>
        <div
          className={`shrink-0 px-3 py-1.5 rounded-lg font-mono text-lg font-bold tabular-nums min-w-[72px] text-center ${timerBoxClass(order.status, mins)}`}
          dir="ltr"
        >
          {elapsed}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 px-4 pb-3">
        <span className="text-sm text-slate-500">{order.section_name || '—'}</span>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-md ${badge.className}`}>
          {lang === 'ar' ? badge.labelAr : badge.labelEn}
        </span>
      </div>

      <ul className="flex-1 px-3 pb-3 space-y-2 overflow-y-auto max-h-[200px]">
        {order.items.map((item) => {
          const done = getItemDone(order, item.id, item.is_done)
          return (
            <li
              key={item.id}
              className={`grid items-center gap-2 py-1 ${
                isRtl ? 'grid-cols-[1.75rem_1fr_2rem]' : 'grid-cols-[2rem_1fr_1.75rem]'
              }`}
            >
              {isRtl ? (
                <>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={done}
                    onClick={() => toggleItem(order, item.id, done)}
                    className={`h-7 w-7 rounded-md border-2 flex items-center justify-center transition-colors justify-self-end ${
                      done
                        ? 'bg-emerald-500 border-emerald-500'
                        : 'bg-white border-slate-300 hover:border-slate-400'
                    }`}
                  >
                    {done ? (
                      <svg viewBox="0 0 12 12" className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M2 6l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : null}
                  </button>
                  <span
                    className={`text-sm font-medium text-slate-800 truncate ${done ? 'line-through text-slate-400' : ''}`}
                  >
                    {item.name}
                    {item.notes ? (
                      <span className="block text-xs text-amber-700 font-normal truncate">{item.notes}</span>
                    ) : null}
                  </span>
                  <span
                    className={`text-sm font-bold tabular-nums text-center ${done ? 'text-slate-400' : 'text-slate-700'}`}
                    dir="ltr"
                  >
                    {item.quantity}
                  </span>
                </>
              ) : (
                <>
                  <span
                    className={`text-sm font-bold tabular-nums text-center ${done ? 'text-slate-400' : 'text-slate-700'}`}
                    dir="ltr"
                  >
                    {item.quantity}
                  </span>
                  <span
                    className={`text-sm font-medium text-slate-800 truncate ${done ? 'line-through text-slate-400' : ''}`}
                  >
                    {item.name}
                    {item.notes ? (
                      <span className="block text-xs text-amber-700 font-normal truncate">{item.notes}</span>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={done}
                    onClick={() => toggleItem(order, item.id, done)}
                    className={`h-7 w-7 rounded-md border-2 flex items-center justify-center transition-colors ${
                      done
                        ? 'bg-emerald-500 border-emerald-500'
                        : 'bg-white border-slate-300 hover:border-slate-400'
                    }`}
                  >
                    {done ? (
                      <svg viewBox="0 0 12 12" className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M2 6l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : null}
                  </button>
                </>
              )}
            </li>
          )
        })}
      </ul>

      <footer className="px-3 pb-3 pt-1 flex gap-2 border-t border-slate-100">
        {!isDelivered ? (
          <button
            type="button"
            onClick={() => advanceStatus(order)}
            disabled={statusPending}
            className={`flex-1 py-3 rounded-lg font-bold text-sm text-white border disabled:opacity-50 transition-colors ${actionBtnClass}`}
          >
            {actionLabel}
          </button>
        ) : (
          <div className="flex-1 py-3 rounded-lg text-center text-sm font-medium text-slate-500 bg-slate-50 border border-slate-200">
            {lang === 'ar' ? 'منتهٍ' : 'Completed'}
          </div>
        )}
        <button
          type="button"
          onClick={() => printKitchenTicket(order, lang)}
          className="shrink-0 px-3 py-3 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          title={lang === 'ar' ? 'طباعة' : 'Print'}
        >
          <Printer size={18} />
        </button>
      </footer>
    </article>
  )
}

const FILTER_PILL: Record<KitchenFilter, { active: string; idle: string }> = {
  all: { active: 'bg-slate-200 text-slate-900 border-slate-400', idle: 'border-slate-200 text-slate-600 hover:bg-slate-50' },
  new: { active: 'bg-emerald-100 text-emerald-800 border-emerald-400 ring-2 ring-emerald-200', idle: 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100' },
  cooking: { active: 'bg-amber-100 text-amber-800 border-amber-400 ring-2 ring-amber-200', idle: 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100' },
  ready: { active: 'bg-blue-100 text-blue-800 border-blue-400 ring-2 ring-blue-200', idle: 'bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100' },
  urgent: { active: 'bg-red-100 text-red-800 border-red-400 ring-2 ring-red-200', idle: 'bg-red-50 text-red-700 border-red-300 hover:bg-red-100' },
  with_completed: {
    active: 'bg-violet-100 text-violet-800 border-violet-400 ring-2 ring-violet-200',
    idle: 'bg-violet-50 text-violet-700 border-violet-300 hover:bg-violet-100',
  },
}

export default function KitchenDisplay() {
  const { lang, isRtl } = useLanguage()
  const {
    orders,
    isLoading,
    filter,
    setFilter,
    soundEnabled,
    toggleSound,
    stats,
    advanceStatus,
    toggleItem,
    getItemDone,
    statusPending,
  } = useKitchenOrders()

  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const isAr = lang === 'ar'

  const statKeys: KitchenFilter[] = ['new', 'cooking', 'ready']

  return (
    <div className="space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
      <style>{`
        @keyframes kds-border-blink {
          0%, 100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.25); }
          50% { box-shadow: 0 0 12px 2px rgba(220, 38, 38, 0.45); }
        }
        .kds-urgent-pulse {
          animation: kds-border-blink 1.2s ease-in-out infinite;
        }
      `}</style>

      <header className="relative flex flex-wrap items-start justify-between gap-4 min-h-[72px]">
        <h1 className="text-2xl font-bold text-slate-900 shrink-0">
          {isAr ? 'شاشة المطبخ' : 'Kitchen display'}
        </h1>

        <div className="flex-1 flex items-center justify-center gap-2 flex-nowrap min-w-0 overflow-x-auto">
          {statKeys.map((key) => {
            const pill = FILTER_PILL[key]
            const active = filter === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(active ? 'all' : key)}
                className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold border-2 transition-all whitespace-nowrap ${active ? pill.active : pill.idle}`}
              >
                {isAr
                  ? key === 'new'
                    ? 'جديد'
                    : key === 'cooking'
                      ? 'يُحضَّر'
                      : 'جاهز'
                  : key === 'new'
                    ? 'New'
                    : key === 'cooking'
                      ? 'Cooking'
                      : 'Ready'}{' '}
                {key === 'new' ? stats.new : key === 'cooking' ? stats.cooking : stats.ready}
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => setFilter(filter === 'with_completed' ? 'all' : 'with_completed')}
            className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold border-2 transition-all whitespace-nowrap ${
              filter === 'with_completed' ? FILTER_PILL.with_completed.active : FILTER_PILL.with_completed.idle
            }`}
          >
            {isAr ? 'الجميع' : 'All orders'}
            {stats.delivered > 0 ? ` (${stats.delivered})` : ''}
          </button>
          <button
            type="button"
            onClick={() => setFilter(filter === 'urgent' ? 'all' : 'urgent')}
            className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold border-2 transition-all whitespace-nowrap ${
              filter === 'urgent' ? FILTER_PILL.urgent.active : FILTER_PILL.urgent.idle
            }`}
          >
            {isAr ? 'عاجل' : 'Urgent'}
            {stats.urgent > 0 ? ` (${stats.urgent})` : ''}
          </button>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              filter === 'all' ? FILTER_PILL.all.active : FILTER_PILL.all.idle
            }`}
          >
            {isAr ? 'الكل' : 'All'}
          </button>
          <button
            type="button"
            onClick={toggleSound}
            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
            title={isAr ? 'تنبيه صوتي' : 'Sound'}
          >
            {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
        </div>
      </header>

      {isLoading ? (
        <div className="flex justify-center py-24">
          <div className="h-10 w-10 rounded-full border-2 border-slate-200 border-t-slate-600 animate-spin" />
        </div>
      ) : orders.length === 0 ? (
        <p className="text-center text-slate-500 py-20 text-lg">
          {filter === 'with_completed'
            ? isAr
              ? 'لا توجد طلبات'
              : 'No orders'
            : isAr
              ? 'لا توجد طلبات نشطة'
              : 'No active orders'}
        </p>
      ) : (
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}
        >
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              lang={isAr ? 'ar' : 'en'}
              isRtl={isRtl}
              getItemDone={getItemDone}
              toggleItem={toggleItem}
              advanceStatus={advanceStatus}
              statusPending={statusPending}
              tick={tick}
            />
          ))}
        </div>
      )}
    </div>
  )
}
