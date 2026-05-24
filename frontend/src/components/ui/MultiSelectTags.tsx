import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, X } from 'lucide-react'

export interface MultiSelectTagsOption {
  id: number
  label: string
}

interface MultiSelectTagsProps {
  options: MultiSelectTagsOption[]
  value: number[]
  onChange: (ids: number[]) => void
  placeholder?: string
  label?: string
  disabled?: boolean
  className?: string
  /** محاذاة النص (للدعم RTL) */
  textAlign?: 'left' | 'right'
  maxHeight?: string
}

export default function MultiSelectTags({
  options,
  value,
  onChange,
  placeholder = 'اختر...',
  label,
  disabled,
  className = '',
  textAlign = 'right',
  maxHeight = '2.5rem',
}: MultiSelectTagsProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLUListElement>(null)
  const [dropdownStyle, setDropdownStyle] = useState<{ top: number; left: number; width: number } | null>(null)

  const selectedOptions = options.filter((o) => value.includes(o.id))
  const availableToAdd = options.filter(
    (o) => !value.includes(o.id) && (!query.trim() || o.label.toLowerCase().includes(query.toLowerCase()))
  )

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(target) &&
        !dropdownRef.current?.contains(target)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const updatePosition = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const pad = 8
    const vw = typeof window !== 'undefined' ? window.innerWidth : 800
    const w = Math.min(Math.max(rect.width, 160), vw - pad * 2)
    const left = Math.max(pad, Math.min(rect.left, vw - pad - w))
    setDropdownStyle({ top: rect.bottom + 4, left, width: w })
  }, [])

  useLayoutEffect(() => {
    if (!isOpen) {
      setDropdownStyle(null)
      return
    }
    updatePosition()
    const onScrollOrResize = () => updatePosition()
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [isOpen, availableToAdd.length, updatePosition])

  const remove = (id: number) => {
    onChange(value.filter((v) => v !== id))
  }

  const add = (id: number) => {
    if (!value.includes(id)) onChange([...value, id])
    setQuery('')
    setIsOpen(false)
  }

  const isRtl = textAlign === 'right'

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      {label && (
        <label className="block text-xs font-medium text-slate-600 mb-0.5">{label}</label>
      )}
      <div
        role="button"
        tabIndex={-1}
        onClick={() => { if (!disabled) inputRef.current?.focus(); setIsOpen(true) }}
        className={`min-h-[1.75rem] border border-slate-200 rounded-[8px] px-1.5 py-1 bg-white focus-within:ring-1 focus-within:ring-primary-400 focus-within:border-primary-300 cursor-text ${disabled ? 'opacity-60 bg-slate-50' : ''}`}
        style={{ maxHeight }}
      >
        <div className="flex flex-wrap gap-1 items-center overflow-y-auto" style={{ maxHeight: 'calc(100% - 2px)' }}>
          {selectedOptions.map((opt) => (
            <span
              key={opt.id}
              className="inline-flex items-center gap-0.5 rounded-[6px] bg-primary-50 text-primary-700 border border-primary-100 pl-1 pr-0.5 py-0.5 text-[10px] font-medium leading-tight"
            >
              <span className="max-w-[72px] truncate">{opt.label}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(opt.id)}
                  className="p-0.5 rounded hover:bg-primary-100 text-primary-500"
                  aria-label="إزالة"
                >
                  <X size={10} />
                </button>
              )}
            </span>
          ))}
          {!disabled && (
            <div className="relative inline-block min-w-[60px] flex-1" onClick={(e) => e.stopPropagation()}>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setIsOpen(true)
                }}
                onFocus={() => setIsOpen(true)}
                placeholder={value.length ? '' : placeholder}
                className="border-0 p-0.5 text-xs outline-none bg-transparent w-full min-w-0"
                style={{ direction: isRtl ? 'rtl' : 'ltr' }}
              />
              {isOpen &&
                dropdownStyle &&
                createPortal(
                  <ul
                    ref={dropdownRef}
                    className="fixed z-[120000] max-h-36 overflow-y-auto bg-white border border-slate-200 rounded-[8px] shadow-lg py-0.5 list-none m-0"
                    style={{
                      top: dropdownStyle.top,
                      left: dropdownStyle.left,
                      width: dropdownStyle.width,
                      minWidth: dropdownStyle.width,
                      maxWidth: dropdownStyle.width,
                    }}
                  >
                    {availableToAdd.length === 0 ? (
                      <li className="px-2 py-1.5 text-xs text-slate-400">
                        {query.trim() ? 'لا توجد نتائج' : 'تم اختيار الكل'}
                      </li>
                    ) : (
                      availableToAdd.slice(0, 50).map((opt) => (
                        <li key={opt.id}>
                          <button
                            type="button"
                            onClick={() => add(opt.id)}
                            className={`w-full ${isRtl ? 'text-right' : 'text-left'} px-2 py-1 text-xs hover:bg-primary-50 transition-colors rounded-[6px]`}
                          >
                            {opt.label}
                          </button>
                        </li>
                      ))
                    )}
                  </ul>,
                  document.body,
                )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
