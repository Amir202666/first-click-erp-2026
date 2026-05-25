import { cn } from '../../../lib/cn'

const STEPS = [
  { id: 1, ar: 'رفع الملف', en: 'Upload' },
  { id: 2, ar: 'ربط الأعمدة', en: 'Map fields' },
  { id: 3, ar: 'مراجعة', en: 'Preview' },
  { id: 4, ar: 'النتيجة', en: 'Result' },
] as const

interface ImportProgressBarProps {
  step: number
  lang: 'ar' | 'en'
}

export default function ImportProgressBar({ step, lang }: ImportProgressBarProps) {
  const isAr = lang === 'ar'

  return (
    <div className="flex flex-wrap items-center gap-2">
      {STEPS.map((s, index) => {
        const active = step === s.id
        const done = step > s.id
        return (
          <div key={s.id} className="flex items-center gap-2">
            <div
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium',
                done && 'bg-primary-600 text-white',
                active && 'bg-primary-600 text-white ring-2 ring-primary-200',
                !done && !active && 'bg-neutral-100 text-neutral-500',
              )}
            >
              {done ? '✓' : s.id}
            </div>
            <span className={cn('text-xs sm:text-sm', active ? 'text-neutral-900' : 'text-neutral-500')}>
              {isAr ? s.ar : s.en}
            </span>
            {index < STEPS.length - 1 ? (
              <span className="mx-1 hidden text-neutral-300 sm:inline">—</span>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
