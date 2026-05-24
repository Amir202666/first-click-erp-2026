import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'

export interface CommandAction {
  id: string
  label: string
  labelEn?: string
  keywords?: string[]
  run: () => void
}

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  actions: CommandAction[]
  lang: 'ar' | 'en'
}

export default function CommandPalette({ open, onClose, actions, lang }: CommandPaletteProps) {
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = actions.filter((a) => {
    const term = q.trim().toLowerCase()
    if (!term) return true
    const label = (lang === 'ar' ? a.label : a.labelEn || a.label).toLowerCase()
    const kw = (a.keywords || []).join(' ').toLowerCase()
    return label.includes(term) || kw.includes(term)
  })

  useEffect(() => {
    if (open) {
      setQ('')
      setSelected(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    setSelected((i) => (i >= filtered.length ? Math.max(0, filtered.length - 1) : i))
  }, [filtered.length])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((i) => (i + 1) % filtered.length)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((i) => (i - 1 + filtered.length) % filtered.length)
      return
    }
    if (e.key === 'Enter' && filtered[selected]) {
      e.preventDefault()
      filtered[selected].run()
      onClose()
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/40"
      onClick={onClose}
      role="dialog"
      aria-label="Command palette"
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-600">
          <Search className="w-5 h-5 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={lang === 'ar' ? 'ابحث... مثل: عرض مبيعات أمس' : 'Search... e.g. show yesterday sales'}
            className="flex-1 bg-transparent border-0 outline-none text-slate-900 dark:text-slate-100 placeholder-slate-400"
          />
          <kbd className="hidden sm:inline text-xs text-slate-400 border border-slate-300 dark:border-slate-500 rounded px-2 py-0.5">Esc</kbd>
        </div>
        <ul className="max-h-72 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <li className="px-4 py-3 text-slate-500 text-sm">{lang === 'ar' ? 'لا توجد نتائج' : 'No results'}</li>
          ) : (
            filtered.map((action, i) => (
              <li key={action.id}>
                <button
                  type="button"
                  onClick={() => {
                    action.run()
                    onClose()
                  }}
                  onMouseEnter={() => setSelected(i)}
                  className={`w-full text-right px-4 py-2.5 text-sm flex items-center gap-2 ${
                    i === selected
                      ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-200'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                  }`}
                >
                  {lang === 'ar' ? action.label : (action.labelEn || action.label)}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}
