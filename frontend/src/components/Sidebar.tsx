import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  Shield,
  BarChart3,
  FileText,
  Activity,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react'

export interface SidebarLink {
  path: string
  label: string
  icon: LucideIcon
}

export interface SidebarGroup {
  id: string
  label: string
  icon: LucideIcon
  children: SidebarLink[]
}

export type SidebarEntry = { type: 'link'; path: string; label: string; icon: LucideIcon } | { type: 'group'; group: SidebarGroup }

/** قائمة جانبية احترافية مع أكورديون (قائمة واحدة مفتوحة فقط) وحركات سلسة */
export default function Sidebar({
  entries,
  className = '',
  isRtl = false,
}: {
  entries: SidebarEntry[]
  className?: string
  isRtl?: boolean
}) {
  const location = useLocation()
  const [openGroupId, setOpenGroupId] = useState<string | null>(() => {
    for (const e of entries) {
      if (e.type === 'group') {
        const active = e.group.children.some((c) => location.pathname === c.path || location.pathname.startsWith(c.path + '/'))
        if (active) return e.group.id
      }
    }
    return null
  })

  const pathname = location.pathname

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/'
    return pathname === path || pathname.startsWith(path + '/')
  }

  /** داخل مجموعة: نُظلّل فقط الرابط الأكثر تحديداً (أطول مسار يطابق) */
  const getActiveChildPath = (children: SidebarLink[]): string | null => {
    const matched = children
      .filter((c) => pathname === c.path || pathname.startsWith(c.path + '/'))
      .sort((a, b) => b.path.length - a.path.length)
    return matched.length ? matched[0].path : null
  }

  const toggleGroup = (id: string) => {
    setOpenGroupId((prev) => (prev === id ? null : id))
  }

  const linkBase =
    'flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ease-out'

  const linkActiveClasses = 'bg-primary-500/15 text-primary-700 dark:text-primary-300 shadow-sm'
  const linkActiveBorder = isRtl ? 'border-r-4 border-r-primary-500' : 'border-l-4 border-l-primary-500'
  const linkInactiveClasses = 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200 border-l-4 border-r-4 border-transparent'

  return (
    <aside
      className={`flex flex-col w-64 min-h-full bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 ${isRtl ? 'border-r' : 'border-l'} shadow-sm ${className}`}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <nav className="flex-1 overflow-y-auto p-4 space-y-1">
        {entries.map((entry) => {
          if (entry.type === 'link') {
            const Icon = entry.icon
            const active = isActive(entry.path)
            return (
              <Link
                key={entry.path}
                to={entry.path}
                className={`${linkBase} ${active ? `${linkActiveClasses} ${linkActiveBorder}` : linkInactiveClasses}`}
              >
                <Icon size={20} className="shrink-0 opacity-90" />
                <span className="flex-1 text-start">{entry.label}</span>
              </Link>
            )
          }

          const { group } = entry
          const Icon = group.icon
          const expanded = openGroupId === group.id

          return (
            <div key={group.id} className="space-y-0.5">
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                className={`${linkBase} ${linkInactiveClasses}`}
              >
                <Icon size={20} className="shrink-0 opacity-90" />
                <span className="flex-1 text-start">{group.label}</span>
                <ChevronDown
                  size={18}
                  className={`shrink-0 transition-transform duration-300 ease-out ${expanded ? 'rotate-180' : ''}`}
                />
              </button>

              {/* Smooth slide down/up using grid */}
              <div
                className="grid transition-[grid-template-rows] duration-300 ease-in-out"
                style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
              >
                <div className="overflow-hidden min-h-0">
                  <div className={`pt-1 pb-2 space-y-0.5 ${isRtl ? 'pr-2 pl-4' : 'pl-2 pr-4'}`}>
                    {(() => {
                      const activeChildPath = getActiveChildPath(group.children)
                      return group.children.map((child) => {
                        const ChildIcon = child.icon
                        const active = activeChildPath === child.path
                        return (
                        <Link
                          key={child.path}
                          to={child.path}
                          className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm transition-all duration-200 ${
                            active
                              ? 'bg-primary-500/12 text-primary-600 dark:text-primary-400 font-medium'
                              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200'
                          }`}
                        >
                          <ChildIcon size={18} className="shrink-0 opacity-80" />
                          <span className="flex-1 text-start">{child.label}</span>
                        </Link>
                        )
                      })
                    })()}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </nav>
    </aside>
  )
}

/**
 * قائمة مثال لنظام إدارة المستخدمين:
 * - لوحة التحكم (رابط مباشر)
 * - إدارة المستخدمين (قائمة منسدلة: قائمة المستخدمين، مجموعات الصلاحيات)
 * - التقارير (قائمة منسدلة: تقارير الدخول، تقارير العمليات)
 * يمكنك تغيير المسارات أو النصوص حسب تطبيقك.
 */
export const userManagementSidebarEntries: SidebarEntry[] = [
  {
    type: 'link',
    path: '/',
    label: 'لوحة التحكم',
    icon: LayoutDashboard,
  },
  {
    type: 'group',
    group: {
      id: 'users',
      label: 'إدارة المستخدمين',
      icon: Users,
      children: [
        { path: '/tenant-users', label: 'قائمة المستخدمين', icon: Users },
        { path: '/roles', label: 'مجموعات الصلاحيات', icon: Shield },
      ],
    },
  },
  {
    type: 'group',
    group: {
      id: 'reports',
      label: 'التقارير',
      icon: BarChart3,
      children: [
        { path: '/audit-log', label: 'تقارير الدخول', icon: Activity },
        { path: '/reports', label: 'تقارير العمليات', icon: FileText },
      ],
    },
  },
]
