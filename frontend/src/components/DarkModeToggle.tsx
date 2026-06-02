import { Moon, Sun } from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext'
import { useDarkMode } from '../hooks/useDarkMode'

type DarkModeToggleProps = {
  /** أنماط إضافية للحاوية */
  className?: string
  /** متوافق مع شريط علوي داكن */
  variant?: 'default' | 'onDarkHeader'
}

export default function DarkModeToggle({ className = '', variant = 'default' }: DarkModeToggleProps) {
  const { isDark, toggle } = useDarkMode()
  const { lang } = useLanguage()
  const isAr = lang === 'ar'

  const tooltip = isAr
    ? isDark
      ? 'الوضع النهاري'
      : 'الوضع الليلي'
    : isDark
      ? 'Light mode'
      : 'Dark mode'

  const trackClass =
    variant === 'onDarkHeader'
      ? 'border-white/20 bg-white/10'
      : 'border-slate-200 bg-slate-100 dark:border-slate-600 dark:bg-slate-800'

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={tooltip}
      title={tooltip}
      onClick={toggle}
      className={`relative inline-flex h-7 w-[3.25rem] shrink-0 items-center rounded-full border p-0.5 transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50 ${trackClass} ${className}`}
    >
      <span
        className={`pointer-events-none absolute inset-0 flex items-center justify-between px-1.5 transition-opacity duration-300 ${
          isDark ? 'opacity-100' : 'opacity-60'
        }`}
        aria-hidden
      >
        <Sun
          size={11}
          className={`transition-all duration-300 ${isDark ? 'scale-75 opacity-40 text-amber-300' : 'scale-100 opacity-100 text-amber-500'}`}
        />
        <Moon
          size={11}
          className={`transition-all duration-300 ${isDark ? 'scale-100 opacity-100 text-slate-200' : 'scale-75 opacity-40 text-slate-400'}`}
        />
      </span>
      <span
        className={`relative z-[1] flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-md transition-all duration-300 ease-out dark:bg-slate-200 ${
          isDark ? 'start-[calc(100%-1.375rem)]' : 'start-0.5'
        }`}
        style={{ position: 'absolute', top: '2px' }}
      >
        <span
          className={`absolute transition-all duration-300 ${isDark ? 'rotate-0 scale-100 opacity-100' : 'rotate-90 scale-0 opacity-0'}`}
        >
          <Moon size={12} className="text-slate-700" />
        </span>
        <span
          className={`absolute transition-all duration-300 ${isDark ? '-rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100'}`}
        >
          <Sun size={12} className="text-amber-500" />
        </span>
      </span>
    </button>
  )
}
