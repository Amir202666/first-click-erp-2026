import type { PrintDocumentType } from '../../types/printTemplate'
import type { PrintTemplate } from '../../types/printTemplate'
import { TEMPLATE_THUMB_COLORS } from '../../utils/printUtils'

type Props = {
  documentType: PrintDocumentType
  templates: PrintTemplate[]
  selectedId: number | null
  loading: boolean
  onSelect: (id: number) => void
  onNew: () => void
  labels: { newTemplate: string; empty: string; loading: string }
}

export default function TemplateList({
  documentType,
  templates,
  selectedId,
  loading,
  onSelect,
  onNew,
  labels,
}: Props) {
  const accent = TEMPLATE_THUMB_COLORS[documentType] ?? '#6366f1'

  return (
    <div className="flex flex-col h-full min-h-0 border-e border-slate-200 bg-white rounded-s-xl overflow-hidden w-full max-w-[220px] shrink-0">
      <div className="p-2 border-b border-slate-100 text-xs font-semibold text-slate-600 truncate" style={{ borderInlineEndColor: accent }}>
        {labels.loading && loading ? labels.loading : `${templates.length}`}
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.id)}
            className={`w-full text-right rounded-lg px-2 py-2 text-xs border transition-colors ${
              selectedId === t.id ? 'border-primary-500 bg-primary-50 text-primary-900' : 'border-slate-100 bg-slate-50 hover:bg-slate-100 text-slate-800'
            }`}
          >
            <div className="font-medium truncate">{t.name}</div>
            <div className="text-[10px] text-slate-500 mt-0.5 flex items-center justify-between gap-1">
              <span>{t.paper_size}</span>
              {t.is_default && (
                <span className="shrink-0 rounded px-1 py-0.5 text-[9px] text-white" style={{ background: accent }}>
                  ★
                </span>
              )}
            </div>
          </button>
        ))}
        {!loading && templates.length === 0 && (
          <p className="text-[11px] text-slate-400 px-1 py-2 text-center">{labels.empty}</p>
        )}
      </div>
      <div className="p-2 border-t border-slate-100">
        <button
          type="button"
          onClick={onNew}
          className="w-full py-2 rounded-lg text-xs font-semibold text-white shadow-sm"
          style={{ background: accent }}
        >
          + {labels.newTemplate}
        </button>
      </div>
    </div>
  )
}
