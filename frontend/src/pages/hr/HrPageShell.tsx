import type { ReactNode } from 'react'
import { useLanguage } from '../../contexts/LanguageContext'

export default function HrPageShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
}) {
  const { isRtl } = useLanguage()
  return (
    <div className="page-bg">
      <div className="w-full max-w-full mx-auto space-y-3" dir={isRtl ? 'rtl' : 'ltr'}>
        <div className="flex items-start justify-between gap-4 pt-1">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-slate-900 truncate">{title}</h1>
            {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
        </div>
        {children}
      </div>
    </div>
  )
}

