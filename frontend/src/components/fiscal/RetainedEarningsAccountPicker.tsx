import { useEffect, useMemo, useRef, useState } from 'react'

export interface EquityAccountOption {
  id: number
  code: string
  name: string
  type: string
  name_en?: string | null
}

type Labels = {
  sectionTitle: string
  requiredBadge: string
  help: string
  searchLabel: string
  placeholder: string
  loading: string
  noResults: string
  change: string
  colRevenue: string
  colCosts: string
  colNet: string
  selectedCreditHint: string
  selectedDebitHint: string
}

type Props = {
  accounts: EquityAccountOption[]
  loadingAccounts: boolean
  selected: EquityAccountOption | null
  onSelect: (acc: EquityAccountOption | null) => void
  preview: { net_profit: number; is_profit: boolean; total_revenue: number; total_cogs: number; total_expenses: number } | null
  labels: Labels
  isRtl: boolean
}

export default function RetainedEarningsAccountPicker({
  accounts,
  loadingAccounts,
  selected,
  onSelect,
  preview,
  labels,
  isRtl,
}: Props) {
  const [accountSearch, setAccountSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = useMemo(() => {
    const q = accountSearch.trim().toLowerCase()
    if (!q) return accounts
    return accounts.filter((a) => {
      const hay = `${a.name} ${a.name_en ?? ''} ${a.code}`.toLowerCase()
      return hay.includes(q) || a.code.includes(accountSearch.trim())
    })
  }, [accounts, accountSearch])

  const netAbs = preview ? Math.abs(preview.net_profit) : 0

  return (
    <div
      className="rounded-2xl p-5 shadow-sm border-2 border-indigo-100 bg-white mb-5"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <h3 className="text-sm font-bold text-slate-900 flex flex-wrap items-center gap-2 mb-1">
        <span aria-hidden>🏦</span>
        {labels.sectionTitle}
        <span className="text-red-500">*</span>
        <span className="text-[10px] px-2 py-0.5 bg-red-50 text-red-600 border border-red-200 rounded-full font-medium">
          {labels.requiredBadge}
        </span>
      </h3>
      <p className="text-xs text-slate-500 mb-4">{labels.help}</p>

      {preview && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
          <div>
            <p className="text-[10px] text-slate-500 font-semibold mb-0.5">{labels.colRevenue}</p>
            <p className="text-sm font-bold text-primary-700 tabular-nums">{preview.total_revenue.toFixed(3)}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 font-semibold mb-0.5">{labels.colCosts}</p>
            <p className="text-sm font-bold text-red-600 tabular-nums">
              {(preview.total_cogs + preview.total_expenses).toFixed(3)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 font-semibold mb-0.5">{labels.colNet}</p>
            <p className={`text-sm font-bold tabular-nums ${preview.is_profit ? 'text-emerald-700' : 'text-red-700'}`}>
              {preview.net_profit.toFixed(3)}
            </p>
          </div>
        </div>
      )}

      {selected ? (
        <div className="flex items-center gap-3 p-3 bg-indigo-50 border-2 border-indigo-200 rounded-xl">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white text-lg shrink-0" aria-hidden>
            🏦
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-500 font-mono">{selected.code}</span>
              <span className="text-sm font-bold text-slate-900">{selected.name}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">{selected.type}</span>
            </div>
            {preview && (
              <p className="text-xs text-indigo-700 mt-0.5">
                {preview.is_profit
                  ? labels.selectedCreditHint.replace('{n}', netAbs.toFixed(3))
                  : labels.selectedDebitHint.replace('{n}', netAbs.toFixed(3))}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              onSelect(null)
              setAccountSearch('')
            }}
            className="text-xs text-indigo-700 hover:text-indigo-900 font-semibold px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors shrink-0"
          >
            {labels.change}
          </button>
        </div>
      ) : (
        <div ref={wrapRef} className="relative account-picker-wrap">
          <label className="text-xs font-semibold text-slate-600 block mb-1.5">
            {labels.searchLabel} <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={accountSearch}
              onChange={(e) => {
                setAccountSearch(e.target.value)
                setShowDropdown(true)
              }}
              onFocus={() => setShowDropdown(true)}
              placeholder={labels.placeholder}
              disabled={loadingAccounts}
              className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:border-indigo-400 focus:outline-none bg-slate-50 focus:bg-white transition-colors"
              dir={isRtl ? 'rtl' : 'ltr'}
            />
          </div>

          {showDropdown && (
            <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
              {loadingAccounts ? (
                <div className="text-center py-4 text-xs text-slate-400">{labels.loading}</div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-4 text-xs text-slate-400">{labels.noResults}</div>
              ) : (
                filtered.map((acc) => (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => {
                      onSelect(acc)
                      setShowDropdown(false)
                      setAccountSearch('')
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-indigo-50 transition-colors border-b border-slate-50 last:border-0 ${
                      isRtl ? 'text-right' : 'text-left'
                    }`}
                  >
                    <div className="flex flex-col items-start min-w-0">
                      <span className="text-xs text-slate-500 font-mono">{acc.code}</span>
                      <span className="text-sm font-medium text-slate-900 truncate w-full">{acc.name}</span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 shrink-0">
                      {acc.type}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
