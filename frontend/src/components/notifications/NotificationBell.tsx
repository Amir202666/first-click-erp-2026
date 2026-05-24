import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Bell,
  Package,
  CalendarClock,
  AlertTriangle,
  Clock,
  UtensilsCrossed,
} from 'lucide-react'
import {
  fetchNotifications,
  fetchNotificationUnreadCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  type NotificationItem,
} from '../../api/tenant'
import { useLanguage } from '../../contexts/LanguageContext'

const POLL_INTERVAL_MS = 25_000
const DROPDOWN_MAX_H = 320

function formatTime(iso: string, isRtl: boolean): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffM = Math.floor(diffMs / 60_000)
  const diffH = Math.floor(diffMs / 3600_000)
  const diffD = Math.floor(diffMs / 86400_000)
  if (diffM < 1) return isRtl ? 'الآن' : 'Now'
  if (diffM < 60) return isRtl ? `منذ ${diffM} د` : `${diffM}m ago`
  if (diffH < 24) return isRtl ? `منذ ${diffH} س` : `${diffH}h ago`
  if (diffD < 7) return isRtl ? `منذ ${diffD} يوم` : `${diffD}d ago`
  return d.toLocaleDateString(isRtl ? 'ar-SA' : 'en-US', {
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  })
}

function severityStyles(severity: NotificationItem['severity']) {
  switch (severity) {
    case 'danger':
      return 'bg-red-50 border-red-200 text-red-800'
    case 'warning':
      return 'bg-amber-50 border-amber-200 text-amber-800'
    case 'success':
      return 'bg-emerald-50 border-emerald-200 text-emerald-800'
    default:
      return 'bg-slate-50 border-slate-200 text-slate-800'
  }
}

function NotificationIcon({ type, severity }: { type: string; severity: NotificationItem['severity'] }) {
  const isDanger = severity === 'danger'
  const isSuccess = severity === 'success'
  const isWarning = severity === 'warning'
  const iconClass = isDanger ? 'text-red-600' : isSuccess ? 'text-emerald-600' : isWarning ? 'text-amber-600' : 'text-slate-600'

  if (type === 'stock_low') return <Package size={18} className={iconClass} />
  if (type === 'installment_due_today' || type === 'installment_overdue') return <CalendarClock size={18} className={iconClass} />
  if (type === 'expiry_soon') return <Clock size={18} className={iconClass} />
  if (type === 'kitchen_ready') return <UtensilsCrossed size={18} className={iconClass} />
  return <AlertTriangle size={18} className={iconClass} />
}

interface NotificationBellProps {
  tenantId: number
  isRtl: boolean
  lang: string
}

export default function NotificationBell({ tenantId, isRtl, lang }: NotificationBellProps) {
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { isRtl: ctxRtl } = useLanguage()

  const rtl = isRtl ?? ctxRtl

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notifications', 'unread-count', tenantId],
    queryFn: () => fetchNotificationUnreadCount(tenantId),
    enabled: !!tenantId,
    refetchInterval: POLL_INTERVAL_MS,
  })

  const { data: listData, isLoading } = useQuery({
    queryKey: ['notifications', 'list', tenantId, open, lang],
    queryFn: () => fetchNotifications(tenantId, { per_page: 20, page: 1 }, lang === 'ar' ? 'ar' : 'en'),
    enabled: !!tenantId && open,
  })

  const markReadMutation = useMutation({
    mutationFn: (id: number) => markNotificationAsRead(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['notifications', 'list', tenantId] })
    },
  })

  const markAllReadMutation = useMutation({
    mutationFn: () => markAllNotificationsAsRead(tenantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['notifications', 'list', tenantId] })
    },
  })

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const notifications = listData?.data ?? []
  const hasUnread = (unreadCount as number) > 0

  const handleItemClick = (n: NotificationItem) => {
    if (!n.read_at) markReadMutation.mutate(n.id)
    setOpen(false)
    if (n.link_path) {
      const path = n.link_params?.ticket_id
        ? `${n.link_path}${n.link_path.includes('?') ? '&' : '?'}ticket_id=${n.link_params.ticket_id}`
        : n.link_path
      navigate(path)
    }
  }

  return (
    <div className="relative shrink-0" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative flex items-center justify-center p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors border border-slate-200"
        title={lang === 'ar' ? 'التنبيهات' : 'Notifications'}
        aria-label={lang === 'ar' ? 'التنبيهات' : 'Notifications'}
      >
        <Bell size={18} />
        {hasUnread && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1"
            style={rtl ? { right: 'auto', left: '-2px' } : undefined}
          >
            {(unreadCount as number) > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute top-full mt-2 w-[min(100vw-2rem,380px)] bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-[100] flex flex-col"
          style={{
            [rtl ? 'right' : 'left']: 0,
            maxHeight: DROPDOWN_MAX_H,
          }}
          role="dialog"
          aria-label={lang === 'ar' ? 'قائمة الإشعارات' : 'Notifications list'}
        >
          <div className="shrink-0 px-3 py-2.5 border-b border-slate-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">
              {lang === 'ar' ? 'الإشعارات' : 'Notifications'}
            </span>
            {hasUnread && (
              <button
                type="button"
                onClick={() => markAllReadMutation.mutate()}
                className="text-xs text-primary-600 hover:underline"
              >
                {lang === 'ar' ? 'تعليم الكل كمقروء' : 'Mark all read'}
              </button>
            )}
          </div>

          <div
            className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain"
            style={{ isolation: 'isolate' }}
          >
            {isLoading ? (
              <div className="p-4 text-center text-slate-500 text-sm">
                {lang === 'ar' ? 'جاري التحميل...' : 'Loading...'}
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-4 text-center text-slate-500 text-sm">
                {lang === 'ar' ? 'لا توجد إشعارات' : 'No notifications'}
              </div>
            ) : (
              <ul className="py-1">
                {notifications.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => handleItemClick(n)}
                      className={`w-full flex items-start gap-3 px-3 py-2.5 text-start border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors ${!n.read_at ? severityStyles(n.severity) : ''}`}
                    >
                      <span className="shrink-0 mt-0.5">
                        <NotificationIcon type={n.type} severity={n.severity} />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-slate-800 truncate">{n.title}</span>
                        <span className="block text-xs text-slate-500 mt-0.5">
                          {formatTime(n.created_at, rtl)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
