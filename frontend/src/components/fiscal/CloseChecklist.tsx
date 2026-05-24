import type { PreCloseChecksResponse } from '../../api/fiscalYear'

type Props = {
  checks: PreCloseChecksResponse
  labels: {
    journalTitle: string
    invoicesTitle: string
    draftLabel: string
    trialLabel: string
    pendingInvLabel: string
    overdueLabel: string
    okClean: string
    needsReview: string
    noDrafts: string
    draftsCount: string
    balanced: string
    diffPrefix: string
    noneOk: string
    countWarning: string
  }
}

export default function CloseChecklist({ checks, labels }: Props) {
  const journalOk = checks.journal_entries.is_ok && checks.trial_balance.is_balanced
  const invOk = checks.invoices.is_ok && checks.installments.is_ok

  const sections = [
    {
      title: labels.journalTitle,
      ok: journalOk,
      items: [
        {
          label: labels.draftLabel,
          value:
            checks.journal_entries.draft_count === 0
              ? labels.noDrafts
              : labels.draftsCount.replace('{n}', String(checks.journal_entries.draft_count)),
          ok: checks.journal_entries.is_ok,
        },
        {
          label: labels.trialLabel,
          value: checks.trial_balance.is_balanced
            ? labels.balanced
            : `${labels.diffPrefix} ${checks.trial_balance.difference}`,
          ok: checks.trial_balance.is_balanced,
        },
      ],
    },
    {
      title: labels.invoicesTitle,
      ok: invOk,
      items: [
        {
          label: labels.pendingInvLabel,
          value:
            checks.invoices.pending_count === 0
              ? labels.noneOk
              : labels.countWarning.replace('{n}', String(checks.invoices.pending_count)),
          ok: checks.invoices.is_ok,
        },
        {
          label: labels.overdueLabel,
          value:
            checks.installments.overdue_count === 0
              ? labels.noneOk
              : labels.countWarning.replace('{n}', String(checks.installments.overdue_count)),
          ok: checks.installments.is_ok,
        },
      ],
    },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
      {sections.map((section) => (
        <div
          key={section.title}
          className={`rounded-xl p-4 border-2 shadow-sm bg-white ${
            section.ok ? 'border-emerald-200' : 'border-amber-200'
          }`}
        >
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-bold text-slate-800">{section.title}</span>
            <span
              className={`text-xs font-semibold ${section.ok ? 'text-emerald-600' : 'text-amber-600'}`}
            >
              {section.ok ? labels.okClean : labels.needsReview}
            </span>
          </div>
          {section.items.map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0 gap-2"
            >
              <span className="text-xs text-slate-600">{item.label}</span>
              <span className={`text-xs font-semibold shrink-0 ${item.ok ? 'text-emerald-600' : 'text-amber-600'}`}>
                {item.value}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
