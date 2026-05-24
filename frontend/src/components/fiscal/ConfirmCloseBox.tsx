import type { FiscalYear } from '../../types'

type Props = {
  fiscalYear: FiscalYear
  confirmation: string
  onConfirmationChange: (v: string) => void
  confirmedChecks: boolean[]
  onToggleCheck: (index: number, checked: boolean) => void
  labels: {
    title: string
    checks: string[]
    hint: string
    placeholder: string
  }
}

export default function ConfirmCloseBox({
  fiscalYear,
  confirmation,
  onConfirmationChange,
  confirmedChecks,
  onToggleCheck,
  labels,
}: Props) {
  const expectedPhrase = `إقفال ${fiscalYear.year}`

  return (
    <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-5 mb-5">
      <p className="text-sm font-bold text-red-900 mb-4 flex items-center gap-2">{labels.title}</p>
      <div className="space-y-2 mb-4">
        {labels.checks.map((label, i) => (
          <label key={i} className="flex items-start gap-3 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmedChecks[i] ?? false}
              onChange={(e) => onToggleCheck(i, e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
      <div>
        <p className="text-xs text-slate-600 mb-1">
          {labels.hint.replace('{phrase}', expectedPhrase)}
        </p>
        <input
          type="text"
          value={confirmation}
          onChange={(e) => onConfirmationChange(e.target.value)}
          placeholder={labels.placeholder.replace('{year}', String(fiscalYear.year))}
          dir="rtl"
          className="w-full border-2 border-red-200 rounded-xl px-4 py-2.5 text-sm focus:border-red-400 outline-none bg-white text-slate-900"
        />
      </div>
    </div>
  )
}
