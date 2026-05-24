import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { Search, X, Loader2 } from 'lucide-react'
import { searchCustomersParty, searchVendorsParty } from '../../api/tenant'
import type { Customer, Vendor } from '../../types'
import { useLanguage } from '../../contexts/LanguageContext'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'

type PartyMode = 'customers' | 'vendors' | 'both'

type PartyRow = {
  kind: 'customer' | 'vendor'
  id: number
  name: string
  name_en: string | null
  company_name: string | null
  code: string | null
  phone: string | null
  country_code: string | null
}

const SEARCH_DEBOUNCE_MS = 500
function toRow(c: Customer): PartyRow {
  return {
    kind: 'customer',
    id: c.id,
    name: c.name,
    name_en: c.name_en,
    company_name: c.company_name,
    code: c.code,
    phone: c.phone,
    country_code: c.country_code,
  }
}

function vendorToRow(v: Vendor): PartyRow {
  return {
    kind: 'vendor',
    id: v.id,
    name: v.name,
    name_en: v.name_en,
    company_name: v.company_name,
    code: v.code,
    phone: v.phone,
    country_code: v.country_code,
  }
}

function phoneDisplay(p: PartyRow): string {
  const cc = p.country_code?.trim()
  const ph = p.phone?.trim()
  if (cc && ph) return `${cc} ${ph}`
  return ph || ''
}

type Props = {
  value: string
  onChange: (v: string) => void
  placeholder: string
  'aria-label': string
  isRtl: boolean
  title?: string
  clearAriaLabel?: string
  tenantId: number
  partyMode: PartyMode
  /** جاري جلب قائمة الفواتير بعد ثبات فلتر العميل (debounce) */
  listFetching?: boolean
}

/**
 * بحث عميل/مورد في رأس جدول الفواتير:
 * — طلب سيرفر بعد 500ms من توقف الكتابة؛ لا قائمة عند حقل فارغ
 * — لا اختيار تلقائي؛ Enter يطبّق فقط على الصف المحدد بالأسهم أو بالنقر
 */
export default function InvoicePartyHeaderSearch({
  value,
  onChange,
  placeholder,
  'aria-label': ariaLabel,
  isRtl,
  title,
  clearAriaLabel = 'Clear',
  tenantId,
  partyMode,
  listFetching = false,
}: Props) {
  const { lang, getDisplayName } = useLanguage()
  const trimmed = value.trim()
  const hasTyped = trimmed.length > 0
  const debouncedSearch = useDebouncedValue(trimmed, SEARCH_DEBOUNCE_MS)
  const waitingDebounce = hasTyped && trimmed !== debouncedSearch

  /** −1 = لا صف محدد؛ يمنع اختياراً تلقائياً عند فتح القائمة */
  const [highlight, setHighlight] = useState(-1)
  const [inputFocused, setInputFocused] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null)

  const customersEnabled =
    !!tenantId && (partyMode === 'customers' || partyMode === 'both') && debouncedSearch.length > 0
  const vendorsEnabled =
    !!tenantId && (partyMode === 'vendors' || partyMode === 'both') && debouncedSearch.length > 0

  const customersQ = useQuery({
    queryKey: ['invoice-party-search', 'post', tenantId, partyMode, debouncedSearch],
    queryFn: ({ signal }) => searchCustomersParty(tenantId, debouncedSearch, signal),
    enabled: customersEnabled,
    staleTime: 0,
  })

  const vendorsQ = useQuery({
    queryKey: ['invoice-party-search', 'vendors', 'post', tenantId, partyMode, debouncedSearch],
    queryFn: ({ signal }) => searchVendorsParty(tenantId, debouncedSearch, signal),
    enabled: vendorsEnabled,
    staleTime: 0,
  })

  const filtered = useMemo(() => {
    const rows: PartyRow[] = []
    if (partyMode === 'customers' || partyMode === 'both') {
      for (const c of customersQ.data?.data ?? []) rows.push(toRow(c))
    }
    if (partyMode === 'vendors' || partyMode === 'both') {
      for (const v of vendorsQ.data?.data ?? []) rows.push(vendorToRow(v))
    }
    rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    return rows
  }, [partyMode, customersQ.data?.data, vendorsQ.data?.data])

  const suggestionsFetching =
    (customersEnabled && customersQ.isFetching) || (vendorsEnabled && vendorsQ.isFetching)

  const partySearchError =
    (customersEnabled && customersQ.isError) || (vendorsEnabled && vendorsQ.isError)

  const showFloatingList = inputFocused && hasTyped
  const fieldBusy = waitingDebounce || suggestionsFetching
  const fieldSpinner = listFetching || (hasTyped && fieldBusy)

  /** أثناء الطلب لا نعرض نتائج قديمة من استعلام سابق */
  const showDropdownLoading =
    !!tenantId &&
    (waitingDebounce || (hasTyped && debouncedSearch.length > 0 && suggestionsFetching))

  const inputEndPad = hasTyped ? (fieldSpinner ? 'pe-[4.25rem]' : 'pe-7') : fieldSpinner ? 'pe-9' : 'pe-1'

  const updateMenuPosition = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const pad = 8
    const vw = typeof window !== 'undefined' ? window.innerWidth : 800
    const w = Math.min(Math.max(rect.width, 240), vw - pad * 2)
    let left = Math.max(pad, Math.min(rect.left, vw - pad - w))
    setMenuPos({ top: rect.bottom + 6, left, width: w })
  }, [])

  useLayoutEffect(() => {
    if (!showFloatingList) {
      setMenuPos(null)
      return
    }
    updateMenuPosition()
    const onWin = () => updateMenuPosition()
    window.addEventListener('scroll', onWin, true)
    window.addEventListener('resize', onWin)
    return () => {
      window.removeEventListener('scroll', onWin, true)
      window.removeEventListener('resize', onWin)
    }
  }, [showFloatingList, updateMenuPosition, filtered.length, debouncedSearch, waitingDebounce])

  useEffect(() => {
    setHighlight(-1)
  }, [debouncedSearch, filtered.length, waitingDebounce])

  useEffect(() => {
    if (!showFloatingList || highlight < 0 || !listRef.current) return
    const el = listRef.current.querySelector(`[data-suggest-idx="${highlight}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlight, showFloatingList])

  const blurCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (blurCloseTimer.current) clearTimeout(blurCloseTimer.current)
    }
  }, [])

  useEffect(() => {
    if (!inputFocused) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (wrapperRef.current?.contains(t)) return
      if (listRef.current?.contains(t)) return
      inputRef.current?.blur()
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [inputFocused])

  const pickParty = useCallback(
    (p: PartyRow) => {
      onChange(p.name)
      setHighlight(-1)
      inputRef.current?.blur()
    },
    [onChange],
  )

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (showFloatingList) {
        e.preventDefault()
        e.stopPropagation()
        setHighlight(-1)
        inputRef.current?.blur()
      }
      return
    }

    if (!showFloatingList) {
      if (e.key === 'ArrowDown' && hasTyped && !waitingDebounce) {
        e.preventDefault()
        setHighlight((h) => (filtered.length === 0 ? -1 : h < 0 ? 0 : h))
      }
      return
    }

    if (waitingDebounce) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (filtered.length === 0) return
      setHighlight((i) => (i < 0 ? 0 : Math.min(i + 1, filtered.length - 1)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (filtered.length === 0) return
      setHighlight((i) => (i <= 0 ? -1 : i - 1))
    } else if (e.key === 'Enter') {
      if (highlight >= 0 && filtered[highlight]) {
        e.preventDefault()
        pickParty(filtered[highlight])
      }
    }
  }

  const kindLabel =
    partyMode === 'both'
      ? (k: 'customer' | 'vendor') =>
          k === 'customer'
            ? lang === 'ar'
              ? 'عميل'
              : 'Customer'
            : lang === 'ar'
              ? 'مورد'
              : 'Vendor'
      : () => ''

  const dropdown =
    showFloatingList &&
    menuPos &&
    typeof document !== 'undefined' &&
    createPortal(
      <ul
        ref={listRef}
        role="listbox"
        onMouseDown={(e) => e.preventDefault()}
        className="fixed z-[120000] max-h-64 overflow-y-auto rounded-xl border border-slate-200/95 bg-white py-1.5 shadow-xl ring-1 ring-slate-200/80"
        style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width, minWidth: menuPos.width }}
      >
        {!tenantId ? (
          <li className="px-3 py-2 text-xs text-amber-700">
            {lang === 'ar' ? 'اختر الشركة من أعلى الصفحة أولاً لتفعيل البحث عن العملاء.' : 'Select a company first to search customers.'}
          </li>
        ) : partySearchError ? (
          <li className="px-3 py-2 text-xs text-red-600">
            {lang === 'ar'
              ? 'تعذّر الاتصال بالخادم. تحقق من تشغيل الـ API ثم أعد تحميل الصفحة (Ctrl+Shift+R).'
              : 'Could not reach the server. Ensure the API is running and hard-refresh (Ctrl+Shift+R).'}
          </li>
        ) : showDropdownLoading ? (
          <li className="flex items-center gap-2 px-3 py-2.5 text-xs text-slate-600" aria-live="polite">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary-600" strokeWidth={2} aria-hidden />
            <span>{lang === 'ar' ? 'جاري البحث…' : 'Searching…'}</span>
          </li>
        ) : filtered.length === 0 ? (
          <li className="px-3 py-2 text-xs text-slate-500">
            {lang === 'ar' ? 'لا توجد نتائج' : 'No matches'}
          </li>
        ) : (
          filtered.map((p, idx) => {
            const label = getDisplayName({ name: p.name, name_en: p.name_en })
            const phone = phoneDisplay(p)
            const secondary = [p.company_name, phone].filter(Boolean).join(' · ')
            return (
              <li
                key={`${p.kind}-${p.id}`}
                id={`party-suggest-${idx}`}
                data-suggest-idx={idx}
                role="option"
                aria-selected={highlight === idx}
                className={`cursor-pointer px-3 py-2 text-sm transition-colors ${
                  highlight === idx ? 'bg-primary-50 text-slate-900' : 'text-slate-800 hover:bg-slate-50'
                }`}
                onMouseEnter={() => setHighlight(idx)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  pickParty(p)
                }}
              >
                <div className="flex flex-col gap-0.5" dir={isRtl ? 'rtl' : 'ltr'}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium leading-snug">{label}</span>
                    {partyMode === 'both' ? (
                      <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                        {kindLabel(p.kind)}
                      </span>
                    ) : null}
                  </div>
                  {secondary ? (
                    <span className="text-xs leading-snug text-slate-500 break-words">{secondary}</span>
                  ) : null}
                </div>
              </li>
            )
          })
        )}
      </ul>,
      document.body,
    )

  return (
    <div
      className="relative w-full min-w-0 rounded-md border border-[#eeeeee] bg-white transition-[border-color,box-shadow] focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500/25"
      ref={wrapperRef}
    >
      <Search
        className="pointer-events-none absolute top-1/2 z-[1] -translate-y-1/2 start-2 h-3.5 w-3.5 text-slate-400 opacity-60"
        strokeWidth={2}
        aria-hidden
      />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          if (blurCloseTimer.current) {
            clearTimeout(blurCloseTimer.current)
            blurCloseTimer.current = null
          }
          setInputFocused(true)
        }}
        onBlur={() => {
          if (blurCloseTimer.current) clearTimeout(blurCloseTimer.current)
          blurCloseTimer.current = window.setTimeout(() => {
            setInputFocused(false)
            blurCloseTimer.current = null
          }, 200)
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        dir={isRtl ? 'rtl' : 'ltr'}
        style={{ textAlign: isRtl ? 'right' : 'left' }}
        autoComplete="off"
        aria-label={ariaLabel}
        aria-busy={fieldSpinner}
        aria-expanded={showFloatingList}
        aria-haspopup="listbox"
        aria-activedescendant={highlight >= 0 ? `party-suggest-${highlight}` : undefined}
        title={title ?? ariaLabel}
        className={`relative z-[1] h-8 w-full min-w-0 box-border rounded-md border-0 bg-transparent py-0 text-[13px] leading-snug text-slate-800 outline-none ring-0 focus:ring-0 placeholder:text-slate-500 ps-8 ${inputEndPad}`}
      />
      {(hasTyped || fieldSpinner) && (
        <div
          className={`absolute top-1/2 z-[2] flex -translate-y-1/2 items-center gap-1 ${hasTyped ? 'end-1' : 'end-2'}`}
        >
          {fieldSpinner ? (
            <span
              className="pointer-events-none flex items-center text-primary-600"
              title={lang === 'ar' ? 'جاري البحث…' : 'Searching…'}
              aria-hidden
            >
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
            </span>
          ) : null}
          {hasTyped ? (
            <button
              type="button"
              className="rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-200/80 hover:text-slate-700"
              aria-label={clearAriaLabel}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation()
                onChange('')
                setHighlight(-1)
                requestAnimationFrame(() => inputRef.current?.focus())
              }}
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          ) : null}
        </div>
      )}
      {dropdown}
    </div>
  )
}
