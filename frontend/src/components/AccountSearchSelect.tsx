import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useLanguage } from '../contexts/LanguageContext'
import type { Account } from '../types'

interface AccountSearchSelectProps {
  value: number | null
  accounts: Account[]
  onChange: (accountId: number | null) => void
  placeholder?: string
  className?: string
  /** تنسيق حقل الإدخال (مثلاً ليتوافق مع جداول الفواتير) */
  inputClassName?: string
  /** إظهار سطر «—» لإلغاء الاختيار */
  allowEmpty?: boolean
  disabled?: boolean
}

export default function AccountSearchSelect({
  value,
  accounts,
  onChange,
  placeholder,
  className = '',
  inputClassName,
  allowEmpty = false,
  disabled,
}: AccountSearchSelectProps) {
  const { getDisplayName, lang } = useLanguage()
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLUListElement>(null)
  const [dropdownStyle, setDropdownStyle] = useState<{
    top: number
    left: number
    width: number
    maxHeight: number
  } | null>(null)

  const selected = accounts.find((a) => a.id === value)
  const displayText = selected ? `${selected.code} - ${getDisplayName(selected)}` : ''

  const postableAccounts = accounts.filter((a) => a.is_postable !== false && a.is_postable !== null && !(a.children?.length))

  const filtered = query.trim()
    ? postableAccounts.filter(
        (a) =>
          a.code?.toLowerCase().includes(query.toLowerCase()) ||
          (a.name?.toLowerCase().includes(query.toLowerCase())) ||
          (a.name_en?.toLowerCase().includes(query.toLowerCase()))
      )
    : postableAccounts

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      const inWrapper = wrapperRef.current?.contains(target)
      const inDropdown = dropdownRef.current?.contains(target)
      if (!inWrapper && !inDropdown) setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!isOpen || !inputRef.current) {
      setDropdownStyle(null)
      return
    }
    const updatePosition = () => {
      if (!inputRef.current) return
      const rect = inputRef.current.getBoundingClientRect()
      const gap = 6
      // قائمة ثابتة للأسفل من الحقل؛ الارتفاع لا يتجاوز المساحة المتاحة أسفل الشاشة (مع تمرير داخلي)
      const rawSpace = window.innerHeight - rect.bottom - gap - 12
      const maxHeight = Math.min(280, Math.max(80, rawSpace))
      setDropdownStyle({
        top: rect.bottom + gap,
        left: rect.left,
        width: Math.max(rect.width, 280),
        maxHeight,
      })
    }
    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [isOpen, filtered.length])

  const defaultInputClass =
    'w-full min-w-0 h-10 box-border border border-slate-300 rounded-lg py-0 px-2.5 text-sm leading-10 outline-none transition-shadow focus:border-primary-500 focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:ring-offset-0'

  const dropdownList = isOpen && dropdownStyle && (
    <ul
      ref={dropdownRef}
      className="fixed z-[9999] overflow-y-auto overflow-x-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-xl dark:border-neutral-600 dark:bg-neutral-900"
      style={{
        top: dropdownStyle.top,
        left: dropdownStyle.left,
        width: dropdownStyle.width,
        minWidth: 280,
        maxHeight: dropdownStyle.maxHeight,
      }}
    >
      {allowEmpty && (
        <li
          onClick={() => {
            onChange(null)
            setQuery('')
            setIsOpen(false)
          }}
          className="cursor-pointer border-b border-slate-100 px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
        >
          —
        </li>
      )}
      {filtered.length === 0 ? (
        allowEmpty && !query.trim() ? null : (
          <li className="px-3 py-2 text-sm text-slate-500 dark:text-neutral-400">
            {query.trim()
              ? (lang === 'ar' ? 'لا نتائج للبحث' : 'No matching accounts')
              : (placeholder ?? '—')}
          </li>
        )
      ) : (
        filtered.map((acc) => (
          <li
            key={acc.id}
            onClick={() => {
              onChange(acc.id)
              setQuery('')
              setIsOpen(false)
            }}
            className="flex cursor-pointer items-start gap-2 border-b border-slate-100 px-3 py-2 text-sm last:border-0 hover:bg-primary-50 dark:border-neutral-700 dark:hover:bg-neutral-800/80"
            title={`${acc.code} - ${getDisplayName(acc)}`}
          >
            <span className="shrink-0 pt-0.5 font-mono text-slate-600 dark:text-neutral-400">{acc.code}</span>
            <span className="min-w-0 break-words text-slate-800 dark:text-neutral-100" dir="auto" style={{ wordBreak: 'break-word' }}>
              {getDisplayName(acc)}
            </span>
          </li>
        ))
      )}
    </ul>
  )

  return (
    <div ref={wrapperRef} className={`relative min-w-0 ${className}`}>
      <input
        ref={inputRef}
        type="text"
        value={isOpen ? query : displayText}
        onChange={(e) => {
          setQuery(e.target.value)
          if (!isOpen) setIsOpen(true)
        }}
        onFocus={() => {
          setIsOpen(true)
          if (!selected) setQuery('')
          else setQuery(displayText)
        }}
        placeholder={placeholder}
        disabled={disabled}
        className={inputClassName ?? defaultInputClass}
      />
      {typeof document !== 'undefined' && dropdownList && createPortal(dropdownList, document.body)}
    </div>
  )
}
