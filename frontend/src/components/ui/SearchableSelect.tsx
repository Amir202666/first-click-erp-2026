import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, X } from 'lucide-react'

export interface SearchableSelectOption {
  value: number | string
  label: string
  /** نص إضافي يُستخدم للبحث فقط (مثل الباركود) */
  searchText?: string
  /** عند العرض: يظهر كسطر رئيسي في القائمة وعند الاختيار يظهر في الخلية فقط (بدون الكود/الباركود) */
  primaryLabel?: string
  /** سطر فرعي باهت في القائمة المنسدلة (مثل الكود والباركود) */
  secondaryLabel?: string
  /** دائرة لون صغيرة بجانب النص في القائمة (فلاتر الحالة في رأس الجدول) */
  dotClass?: string
}

interface SearchableSelectProps {
  options: SearchableSelectOption[]
  value: number | string | null
  onChange: (value: number | string | null) => void
  placeholder?: string
  /** عند عدم تمرير label لا يُعرض تسمية (مناسب لشريط الفلاتر) */
  label?: string
  required?: boolean
  className?: string
  disabled?: boolean
  textAlign?: 'left' | 'right'
  /** تفعيل التفاف النص في الخيارات لعرض أسماء طويلة (مثل أصناف/فئات) */
  wrapOptions?: boolean
  /** أقل عرض للقائمة المنسدلة (يفيد عندما يكون المشغّل ضيقاً مثل رؤوس الجدول) */
  dropdownMinWidth?: number
  /** اجعل عرض القائمة المنسدلة يطابق عرض حقل الفلتر */
  matchTriggerWidth?: boolean
  /** دمج مع أنماط حقل الإدخال الداخلية */
  inputClassName?: string
  /** تمرير إلى حقل الإدخال (إتاحة الوصول) */
  'aria-label'?: string
  /** default: حدود كاملة؛ header: مدمج بخط سفلي عند التركيز (رأس جدول) */
  variant?: 'default' | 'header'
  /** نص زر المسح في وضع header */
  clearAriaLabel?: string
  /**
   * فلتر حالة في رأس الجدول: حشو أقل، قائمة ≥150px، وعند ضيق العرض يُعرض لون الحالة فقط (دائرة)
   * مع الإبقاء على النص الكامل في التلميح و aria-label
   */
  statusHeader?: boolean
  /** محاذاة ارتفاع 35px + حلقة تركيز (رأس جدول الفواتير) */
  tableHeaderControl?: boolean
  /** stacked: التسمية فوق الحقل (افتراضي). inline: التسمية بجانب الحقل (للـ RTL تكون يمين الصندوق) */
  labelLayout?: 'stacked' | 'inline'
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = '—',
  label,
  required,
  className = '',
  disabled,
  textAlign = 'right',
  wrapOptions = false,
  dropdownMinWidth,
  matchTriggerWidth,
  inputClassName = '',
  'aria-label': ariaLabel,
  variant = 'default',
  clearAriaLabel = 'Clear',
  statusHeader = false,
  tableHeaderControl = false,
  labelLayout = 'stacked',
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [headerIconOnly, setHeaderIconOnly] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLUListElement>(null)
  const [dropdownStyle, setDropdownStyle] = useState<{
    top?: number
    bottom?: number
    left: number
    width: number
    maxHeight: number
  } | null>(null)

  const isHeader = variant === 'header'
  /** افتراضياً: طابق عرض القائمة المنسدلة مع عرض الحقل */
  const effectiveMatchTriggerWidth = matchTriggerWidth ?? true

  const safeOptions: SearchableSelectOption[] = Array.isArray(options) && options.length > 0
    ? options
    : [{ value: '', label: placeholder || '—' }]

  const selected = value != null && value !== '' ? safeOptions.find((o) => String(o.value) === String(value)) : undefined
  const displayText = selected ? (selected.primaryLabel ?? selected.label) : ''
  const hasValue = !!displayText
  const showStackedLabel = !!(label && label !== '') && labelLayout === 'stacked'
  const showInlineLabel = !!(label && label !== '') && labelLayout === 'inline'

  const q = query.trim().toLowerCase()
  const filtered = q
    ? safeOptions.filter((o) => (o.searchText ?? o.label).toLowerCase().includes(q))
    : safeOptions

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (!wrapperRef.current?.contains(target) && !dropdownRef.current?.contains(target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useLayoutEffect(() => {
    if (!statusHeader || !isHeader) {
      setHeaderIconOnly(false)
      return
    }
    const el = containerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    /**
     * عرض أيقونة فقط يسبب “اختفاء” القيمة المختارة عند ضيق العمود.
     * نقلل العتبة كثيراً حتى يبقى النص ظاهرًا في أغلب الحالات.
     */
    const apply = (w: number) => setHeaderIconOnly(w > 0 && w < 60)
    apply(el.getBoundingClientRect().width)
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0
      apply(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [statusHeader, isHeader])

  const updatePosition = useCallback(() => {
    if (!inputRef.current) return
    const rect = inputRef.current.getBoundingClientRect()
    const pad = 8
    const gap = 4
    const vw = typeof window !== 'undefined' ? window.innerWidth : 800
    const vh = typeof window !== 'undefined' ? window.innerHeight : 600
    const defaultMaxHeight = 288
    const minDropdownHeight = 120
    const baseMin = wrapOptions ? 360 : 320
    const requested = dropdownMinWidth ?? baseMin
    const minDropWidth = isHeader ? Math.max(150, requested) : requested
    let w = effectiveMatchTriggerWidth ? rect.width : Math.max(rect.width, minDropWidth)
    w = Math.min(w, vw - pad * 2)
    const isRtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl'
    /** يبقى القائمة داخل العرض مع محاذاة أفضل لـ RTL (أعمدة يسار الجدول) */
    let left: number
    if (isRtl) {
      const idealLeft = rect.right - w
      left = Math.max(pad, Math.min(idealLeft, vw - pad - w))
    } else {
      const idealLeft = rect.left
      left = Math.max(pad, Math.min(idealLeft, vw - pad - w))
    }

    const spaceBelow = vh - rect.bottom - pad
    const spaceAbove = rect.top - pad
    /** يفتح لأعلى عند ضيق المساحة أسفل الحقل مع توفر مساحة أكبر بالأعلى */
    const openUpward = spaceBelow < defaultMaxHeight && spaceAbove > spaceBelow

    if (openUpward) {
      const maxHeight = Math.max(
        minDropdownHeight,
        Math.min(defaultMaxHeight, spaceAbove - gap),
      )
      setDropdownStyle({
        bottom: vh - rect.top + gap,
        left,
        width: w,
        maxHeight,
      })
    } else {
      const maxHeight = Math.max(
        minDropdownHeight,
        Math.min(defaultMaxHeight, spaceBelow - gap),
      )
      setDropdownStyle({
        top: rect.bottom + gap,
        left,
        width: w,
        maxHeight,
      })
    }
  }, [wrapOptions, dropdownMinWidth, isHeader, effectiveMatchTriggerWidth])

  useLayoutEffect(() => {
    if (!isOpen || !inputRef.current) {
      setDropdownStyle(null)
      return
    }
    updatePosition()
    const onScrollOrResize = updatePosition
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [isOpen, filtered.length, updatePosition])

  const menuClass =
    isHeader
      ? `fixed ${tableHeaderControl ? 'z-[120000]' : 'z-[100000]'} overflow-y-auto overflow-x-hidden bg-white rounded-xl border border-slate-200/90 shadow-[0_12px_48px_-12px_rgba(15,23,42,0.22)] py-1.5 list-none m-0`
      : 'fixed z-[99999] overflow-y-auto overflow-x-hidden bg-white border border-slate-300 rounded-lg shadow-lg py-0.5 list-none m-0'

  const dropdownList = isOpen && dropdownStyle && (
    <ul
      ref={dropdownRef}
      role="listbox"
      className={menuClass}
      style={{
        top: dropdownStyle.top,
        bottom: dropdownStyle.bottom,
        left: dropdownStyle.left,
        width: dropdownStyle.width,
        minWidth: dropdownStyle.width,
        maxWidth: dropdownStyle.width,
        maxHeight: dropdownStyle.maxHeight,
      }}
    >
      {filtered.length === 0 ? (
        <li role="option" className="px-3 py-1.5 text-sm text-slate-500 leading-snug">لا توجد نتائج</li>
      ) : (
        filtered.map((opt) => (
          <li
            key={opt.value === 0 || opt.value === '' ? 'all' : `opt-${opt.value}`}
            role="option"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onChange(opt.value)
              setQuery('')
              setIsOpen(false)
            }}
            dir={textAlign === 'right' ? 'rtl' : 'ltr'}
            className={`px-3 py-2.5 text-sm leading-snug cursor-pointer hover:bg-primary-50 active:bg-primary-100 border-b border-slate-100/80 last:border-b-0 flex items-center gap-2.5 ${
              wrapOptions ? 'whitespace-normal break-words' : ''
            }`}
          >
            {opt.dotClass ? <span className={`h-2 w-2 shrink-0 rounded-full ${opt.dotClass}`} aria-hidden /> : null}
            <span className="min-w-0 flex-1" style={{ textAlign: textAlign === 'right' ? 'right' : 'left' }}>
              {opt.primaryLabel != null ? (
                <>
                  <span className="font-medium text-slate-900">{opt.primaryLabel}</span>
                  {opt.secondaryLabel ? (
                    <div className="mt-0.5 text-xs text-slate-500">{opt.secondaryLabel}</div>
                  ) : null}
                </>
              ) : (
                opt.label
              )}
            </span>
          </li>
        ))
      )}
    </ul>
  )

  const openDropdown = () => {
    if (disabled) return
    setQuery('')
    setIsOpen(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  /** في رأس جدول الفواتير لا نستبدل النص بدائرة لون فقط — يُبقى النص ظاهراً قدر الإمكان */
  const showIconOnly =
    statusHeader && headerIconOnly && hasValue && !isOpen && !!selected?.dotClass && !tableHeaderControl
  const inputDisplayValue = isOpen ? query : showIconOnly ? '' : displayText

  /** فلتر رأس الجدول المدمج: إطار فاتح #eee + تركيز بلون الهوية (بدون زيادة ارتفاع الصف عبر القائمة — portal) */
  const headerCompactInput =
    'w-full min-w-0 max-w-full box-border h-8 rounded-md border border-[#eeeeee] bg-white text-slate-800 outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-slate-500 overflow-hidden text-ellipsis whitespace-nowrap py-0 focus:border-primary-500 focus:ring-1 focus:ring-inset focus:ring-primary-500/25 ' +
    (statusHeader ? 'text-[12px] leading-snug' : 'text-[13px] leading-snug')
  const headerUnderlineInput =
    'w-full box-border bg-transparent text-slate-800 outline-none transition-[border-color] duration-150 placeholder:text-slate-500 border-0 border-b-2 border-transparent focus:border-primary-600 rounded-none min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap ' +
    (statusHeader ? 'text-[12px] leading-tight pb-1 pt-0' : 'text-[13px] pb-1.5 pt-0.5')
  const headerInputBase =
    isHeader && tableHeaderControl ? headerCompactInput : isHeader ? headerUnderlineInput : ''
  const defaultInputBase =
    'w-full min-w-0 h-9 border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none transition-shadow focus:border-primary-500 focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:ring-offset-0 leading-normal bg-white placeholder:text-slate-500 overflow-hidden text-ellipsis'

  const chevronPad = isHeader
    ? statusHeader
      ? hasValue
        ? textAlign === 'right'
          ? tableHeaderControl
            ? 'pl-5 pr-7'
            : 'pl-6 pr-9'
          : tableHeaderControl
            ? 'pl-7 pr-5'
            : 'pl-9 pr-6'
        : textAlign === 'right'
          ? tableHeaderControl
            ? 'pl-5 pr-0.5'
            : 'pl-6 pr-1'
          : tableHeaderControl
            ? 'pl-0.5 pr-5'
            : 'pl-1 pr-6'
      : hasValue
        ? textAlign === 'right'
          ? tableHeaderControl
            ? 'pl-5 pr-8'
            : 'pl-8 pr-11'
          : tableHeaderControl
            ? 'pl-8 pr-5'
            : 'pl-11 pr-8'
        : textAlign === 'right'
          ? tableHeaderControl
            ? 'pl-5 pr-1.5'
            : 'pl-8 pr-2'
          : tableHeaderControl
            ? 'pl-1.5 pr-5'
            : 'pl-2 pr-8'
    : textAlign === 'right'
      ? 'pl-9 pr-3'
      : 'pr-9 pl-3'

  const mergedInputClass = isHeader
    ? `${headerInputBase} ${chevronPad} ${inputClassName}`.trim()
    : inputClassName
      ? `w-full box-border bg-white placeholder:text-slate-500 ${textAlign === 'right' ? 'pl-9 pr-2' : 'pr-9 pl-2'} ${inputClassName}`
      : `${defaultInputBase} ${textAlign === 'right' ? 'pl-9 pr-3' : 'pr-9 pl-3'}`

  const chevronOffset = isHeader ? (statusHeader ? (tableHeaderControl ? 5 : 6) : tableHeaderControl ? 5 : 10) : 12
  const clearOffset = statusHeader ? (tableHeaderControl ? 18 : 22) : 28
  const inputAriaLabel =
    hasValue && displayText
      ? ariaLabel
        ? `${ariaLabel}: ${displayText}`
        : displayText
      : ariaLabel

  const comboTitle = !isOpen && hasValue && displayText ? displayText : undefined

  return (
    <div
      ref={isHeader ? containerRef : undefined}
      title={comboTitle}
      className={`overflow-visible ${className} ${!disabled ? 'cursor-pointer' : ''} ${showStackedLabel ? 'min-h-[3.25rem]' : ''} ${labelLayout === 'inline' ? 'flex flex-row items-center gap-2 w-full min-w-0' : ''} ${isHeader && tableHeaderControl ? 'w-full min-w-0' : isHeader ? 'rounded-md px-0.5 -mx-0.5 focus-within:ring-2 focus-within:ring-primary-500 focus-within:ring-offset-0' : ''}`}
      onClick={openDropdown}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDropdown() } }}
      role="combobox"
      aria-expanded={isOpen}
      aria-haspopup="listbox"
    >
      {showInlineLabel ? (
        <span
          className={`shrink-0 text-xs font-medium text-slate-700 whitespace-nowrap pointer-events-none ${
            textAlign === 'right' ? 'text-right' : 'text-left'
          }`}
        >
          {label}
          {required ? <span className="text-red-500 ms-0.5">*</span> : null}
        </span>
      ) : null}
      {showStackedLabel ? (
        <div
          className={`w-full text-xs font-medium text-slate-600 mb-1.5 min-h-[1.25rem] leading-normal overflow-visible shrink-0 pointer-events-none ${
            textAlign === 'right' ? 'text-right' : 'text-left'
          }`}
        >
          <span>{label}</span>
          {required ? <span className="text-red-500 ms-0.5">*</span> : null}
        </div>
      ) : null}
      <div ref={wrapperRef} className={`relative ${labelLayout === 'inline' ? 'flex-1 min-w-0' : ''}`} onClick={(e) => e.stopPropagation()}>
        {showIconOnly && selected?.dotClass ? (
          <span
            className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center"
            aria-hidden
          >
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-slate-400/35 ${selected.dotClass}`}
            />
          </span>
        ) : null}
        <input
          ref={inputRef}
          type="text"
          value={inputDisplayValue}
          onChange={(e) => {
            setQuery(e.target.value)
            if (!isOpen) setIsOpen(true)
          }}
          onFocus={() => {
            setQuery('')
            setIsOpen(true)
          }}
          onKeyDown={(e) => {
            /** في رأس الجدول لا نختار تلقائياً عند نتيجة واحدة — يُختار بالنقر أو Enter بعد التأكيد الصريح */
            if (
              !isHeader &&
              e.key === 'Enter' &&
              query.trim() &&
              filtered.length === 1
            ) {
              e.preventDefault()
              onChange(filtered[0].value)
              setQuery('')
              setIsOpen(false)
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          aria-label={inputAriaLabel}
          dir={textAlign === 'right' ? 'rtl' : 'ltr'}
          title={!isOpen && hasValue && displayText && !showIconOnly ? displayText : undefined}
          className={isHeader ? `${mergedInputClass} relative z-[1]` : mergedInputClass}
          style={{ textAlign: textAlign === 'right' ? 'right' : 'left' }}
        />
        <span
          className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-400 ${isHeader ? `z-[2] opacity-70` : ''}`}
          style={textAlign === 'right' ? { left: chevronOffset } : { right: chevronOffset }}
          aria-hidden
        >
          <ChevronDown size={isHeader ? (statusHeader ? 15 : 16) : 18} />
        </span>
        {isHeader && hasValue && !disabled ? (
          <button
            type="button"
            className="absolute top-1/2 z-[3] -translate-y-1/2 rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-200/80 hover:text-slate-700"
            style={textAlign === 'right' ? { right: clearOffset } : { left: clearOffset }}
            title={displayText}
            aria-label={clearAriaLabel}
            onMouseDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onChange('')
              setQuery('')
              setIsOpen(false)
            }}
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        ) : null}
      </div>
      {typeof document !== 'undefined' && dropdownList && createPortal(dropdownList, document.body)}
    </div>
  )
}
