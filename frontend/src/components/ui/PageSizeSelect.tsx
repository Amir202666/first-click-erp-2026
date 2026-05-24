import React from 'react'

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200, 500]

interface PageSizeSelectProps {
  value: number
  onChange: (value: number) => void
  className?: string
  /** إظهار نص «عدد السجلات» بجانب القائمة */
  showLabel?: boolean
  /** وصف للقائمة عند إخفاء التسمية (إمكانية الوصول) */
  ariaLabel?: string
  /** خيار أول غير قابل للاختيار (مثل عنوان الفلتر في القائمة) */
  leadingHeaderLabel?: string
  /** استبدال أنماط عنصر select (وضع الفلاتر بدون تسمية) */
  selectClassName?: string
}

export default function PageSizeSelect({
  value,
  onChange,
  className = '',
  showLabel = true,
  ariaLabel,
  leadingHeaderLabel,
  selectClassName,
}: PageSizeSelectProps) {
  const noLabelSelectClass =
    selectClassName ??
    'h-10 box-border min-w-[72px] border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 px-2 text-xs leading-10 py-0 text-slate-900 dark:text-slate-100 outline-none transition-shadow focus:border-primary-500 focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:ring-offset-0'

  return (
    <div className={`flex items-center gap-1 text-xs text-slate-600 ${className}`}>
      {showLabel && <span className="whitespace-nowrap">عدد السجلات</span>}
      <select
        className={
          showLabel
            ? 'h-10 box-border border border-slate-300 rounded-md bg-white px-2 text-xs leading-10 py-0 outline-none transition-shadow focus:border-primary-500 focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:ring-offset-0'
            : noLabelSelectClass
        }
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={!showLabel ? (ariaLabel ?? 'عدد السجلات') : undefined}
      >
        {leadingHeaderLabel ? (
          <option value="" disabled>
            {leadingHeaderLabel}
          </option>
        ) : null}
        {PAGE_SIZE_OPTIONS.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>
    </div>
  )
}

