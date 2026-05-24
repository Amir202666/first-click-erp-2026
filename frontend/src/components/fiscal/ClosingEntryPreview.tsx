import type { ClosingPreviewResponse } from '../../api/fiscalYear'

type Props = {
  preview: ClosingPreviewResponse
  labels: {
    title: string
    subtitle: string
    account: string
    memo: string
    debit: string
    credit: string
    total: string
    dash: string
    totalsHint: string
    transferLineBadge: string
  }
}

export default function ClosingEntryPreview({ preview, labels }: Props) {
  const sumD = preview.lines.reduce((s, l) => s + l.debit, 0)
  const sumC = preview.lines.reduce((s, l) => s + l.credit, 0)

  return (
    <div className="rounded-2xl p-5 shadow-sm border border-slate-100 bg-white mb-5">
      <p className="text-sm font-bold text-slate-800 mb-1">{labels.title}</p>
      <p className="text-xs text-slate-500 mb-1">{labels.subtitle}</p>
      <p className="text-xs text-slate-400 mb-4">{labels.totalsHint}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[480px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="p-2 font-semibold text-slate-500 text-start">{labels.account}</th>
              <th className="p-2 font-semibold text-slate-500 text-start">{labels.memo}</th>
              <th className="p-2 font-semibold text-slate-500 text-end">{labels.debit}</th>
              <th className="p-2 font-semibold text-slate-500 text-end">{labels.credit}</th>
            </tr>
          </thead>
          <tbody>
            {preview.lines.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-4 text-center text-slate-400">
                  —
                </td>
              </tr>
            ) : (
              preview.lines.map((line, i) => {
                const isRe = Boolean(line.is_retained_earnings_line)
                return (
                  <tr
                    key={`${line.account_id}-${i}`}
                    className={`border-b border-slate-50 hover:bg-slate-50/80 ${isRe ? 'bg-indigo-50/90' : ''}`}
                  >
                    <td className={`p-2 ${isRe ? 'text-indigo-900 font-bold' : 'text-slate-800'}`}>
                      {line.account_code} — {line.account_name}
                      {isRe && (
                        <span className="mr-2 text-[9px] px-1.5 py-0.5 bg-indigo-100 text-indigo-800 rounded-full font-semibold">
                          {labels.transferLineBadge}
                        </span>
                      )}
                    </td>
                    <td className={`p-2 ${isRe ? 'text-indigo-800' : 'text-slate-500'}`}>{line.description}</td>
                    <td className="p-2 text-end font-semibold text-primary-700">
                      {line.debit > 0 ? line.debit.toFixed(3) : labels.dash}
                    </td>
                    <td className="p-2 text-end font-semibold text-emerald-700">
                      {line.credit > 0 ? line.credit.toFixed(3) : labels.dash}
                    </td>
                  </tr>
                )
              })
            )}
            <tr className="bg-slate-50 font-bold">
              <td colSpan={2} className="p-2">
                {labels.total}
              </td>
              <td className="p-2 text-end text-primary-800">{sumD.toFixed(3)}</td>
              <td className="p-2 text-end text-emerald-800">{sumC.toFixed(3)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
