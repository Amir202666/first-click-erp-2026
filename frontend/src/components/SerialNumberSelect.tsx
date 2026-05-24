/**
 * SerialNumberSelect
 * خلية إدخال رقم تسلسلي مع قائمة منسدلة تعرض الأرقام المتاحة في المخزن وتدعم البحث.
 */
import { useRef, useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchAvailableSerials } from '../api/tenant'

interface Props {
  tenantId: number
  itemId: number
  warehouseId?: number | null
  value: string
  onChange: (val: string) => void
  placeholder?: string
  /** أرقام مختارة في أسطر أخرى لاستبعادها من القائمة */
  excludeSerials?: string[]
}

export default function SerialNumberSelect({
  tenantId,
  itemId,
  warehouseId,
  value,
  onChange,
  placeholder,
  excludeSerials = [],
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState(value)
  const [dropRect, setDropRect] = useState<{ top: number; left: number; width: number } | null>(null)

  // مزامنة حقل البحث مع القيمة الخارجية
  useEffect(() => {
    setSearch(value)
  }, [value])

  const { data: allSerials = [], isLoading } = useQuery({
    queryKey: ['available-serials', tenantId, itemId, warehouseId],
    queryFn: () => fetchAvailableSerials(tenantId, itemId, warehouseId ? { warehouse_id: warehouseId } : undefined),
    enabled: !!tenantId && !!itemId,
    staleTime: 30_000,
  })

  const filtered = allSerials.filter(
    (s) =>
      !excludeSerials.includes(s.serial_number) &&
      (search.trim() === '' || s.serial_number.toLowerCase().includes(search.trim().toLowerCase()))
  )

  const updateRect = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setDropRect({ top: r.bottom + 2, left: r.left, width: r.width })
  }, [])

  function handleFocus() {
    updateRect()
    window.addEventListener('scroll', updateRect, true)
    window.addEventListener('resize', updateRect)
    setOpen(true)
  }

  function handleBlur() {
    // تأخير لإتاحة نقر على عنصر في القائمة قبل الإغلاق
    setTimeout(() => {
      setOpen(false)
      window.removeEventListener('scroll', updateRect, true)
      window.removeEventListener('resize', updateRect)
      // إذا كتب المستخدم رقماً غير موجود في القائمة، نقبله كما هو
      onChange(search)
    }, 150)
  }

  function handleInput(v: string) {
    setSearch(v)
    onChange(v)
    updateRect()
  }

  function select(serial: string) {
    setSearch(serial)
    onChange(serial)
    setOpen(false)
  }

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        value={search}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full border border-slate-300 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-inset focus:ring-primary-500 outline-none"
      />
      {open &&
        dropRect &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[9999] bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden"
            style={{ top: dropRect.top, left: dropRect.left, width: Math.max(dropRect.width, 180), maxHeight: '14rem' }}
            onMouseDown={(e) => e.preventDefault()}
          >
            <div className="overflow-y-auto max-h-52">
              {isLoading && (
                <div className="px-3 py-2 text-xs text-slate-400 text-center">جاري التحميل…</div>
              )}
              {!isLoading && filtered.length === 0 && (
                <div className="px-3 py-2 text-xs text-slate-400 text-center">
                  {allSerials.length === 0 ? 'لا توجد أرقام تسلسلية متاحة' : 'لا توجد نتائج'}
                </div>
              )}
              {filtered.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); select(s.serial_number) }}
                  className="w-full text-right px-3 py-1.5 text-xs hover:bg-primary-50 hover:text-primary-700 transition-colors block font-mono"
                >
                  {s.serial_number}
                </button>
              ))}
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
