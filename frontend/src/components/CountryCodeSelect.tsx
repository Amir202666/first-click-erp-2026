import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import type { CountryOption } from '../data/countryCodes'

interface CountryCodeSelectProps {
  value: string
  options: CountryOption[]
  onChange: (code: string) => void
  lang: 'ar' | 'en'
  title?: string
  className?: string
}

export default function CountryCodeSelect({ value, options, onChange, lang, title, className = '' }: CountryCodeSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.code === value) ?? options[0]
  const displayLabel = selected ? `+${selected.code} ${lang === 'ar' ? selected.name_ar : selected.name_en}` : ''

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={title}
        className="w-full min-w-[7.5rem] flex items-center justify-between gap-1 border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white hover:border-slate-400 focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors"
        dir="ltr"
      >
        <span className="truncate">{displayLabel}</span>
        <ChevronDown size={16} className={`shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          className="absolute top-full left-0 right-0 mt-1 z-[100] bg-white border border-slate-200 rounded-lg shadow-lg max-h-[220px] overflow-y-auto"
          role="listbox"
        >
          {options.map((opt) => (
            <button
              key={opt.code}
              type="button"
              role="option"
              aria-selected={opt.code === value}
              onClick={() => {
                onChange(opt.code)
                setOpen(false)
              }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 focus:bg-slate-50 outline-none ${opt.code === value ? 'bg-primary-50 text-primary-700 font-medium' : 'text-slate-700'}`}
              dir="ltr"
            >
              +{opt.code} {lang === 'ar' ? opt.name_ar : opt.name_en}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
