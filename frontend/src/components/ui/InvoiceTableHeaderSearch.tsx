import { Search, X } from 'lucide-react'

type Props = {
  value: string
  onChange: (v: string) => void
  placeholder: string
  'aria-label': string
  isRtl: boolean
  title?: string
  clearAriaLabel?: string
}

/** حقل بحث مدمج تحت عنوان العمود: إطار #eee، تركيز بلون الهوية، نفس عرض العمود */
export default function InvoiceTableHeaderSearch({
  value,
  onChange,
  placeholder,
  'aria-label': ariaLabel,
  isRtl,
  title,
  clearAriaLabel = 'Clear',
}: Props) {
  const hasVal = value.trim().length > 0
  return (
    <div className="relative w-full min-w-0 rounded-md border border-[#eeeeee] bg-white transition-[border-color,box-shadow] focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500/25">
      <Search
        className="pointer-events-none absolute top-1/2 z-[1] -translate-y-1/2 start-2 h-3.5 w-3.5 text-slate-400 opacity-60"
        strokeWidth={2}
        aria-hidden
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        dir={isRtl ? 'rtl' : 'ltr'}
        style={{ textAlign: isRtl ? 'right' : 'left' }}
        autoComplete="off"
        aria-label={ariaLabel}
        title={title ?? ariaLabel}
        className={`relative z-[1] h-8 w-full min-w-0 box-border rounded-md border-0 bg-transparent py-0 text-[13px] leading-snug text-slate-800 outline-none ring-0 focus:ring-0 placeholder:text-slate-500 ${
          isRtl ? `ps-8 ${hasVal ? 'pe-7' : 'pe-2'}` : `ps-8 ${hasVal ? 'pe-7' : 'pe-2'}`
        }`}
      />
      {hasVal ? (
        <button
          type="button"
          className="absolute top-1/2 z-[2] -translate-y-1/2 end-0.5 rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-200/80 hover:text-slate-700"
          aria-label={clearAriaLabel}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation()
            onChange('')
          }}
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      ) : null}
    </div>
  )
}
