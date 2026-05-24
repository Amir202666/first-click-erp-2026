import { Braces, Code2, Copy, Minus, Plus } from 'lucide-react'
import { clampZoom } from '../../utils/printUtils'

export type DesignerToolbarSnippet = { label: string; snippet: string }

type Props = {
  zoom: number
  onZoomChange: (z: number) => void
  title: string
  isRtl: boolean
  labels: { zoom: string; copyHtml: string; copied: string; snippets: string }
  onCopyHtml?: () => void | Promise<void>
  copyDone?: boolean
  snippets?: DesignerToolbarSnippet[]
  onInsertSnippet?: (snippet: string) => void
}

export default function DesignerToolbar({
  zoom,
  onZoomChange,
  title,
  isRtl,
  labels,
  onCopyHtml,
  copyDone,
  snippets,
  onInsertSnippet,
}: Props) {
  return (
    <div
      className="flex flex-col gap-2 px-3 py-2 border-b border-slate-200 bg-white shrink-0"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-800 truncate max-w-[55%] flex items-center gap-1.5">
          <Code2 size={16} className="text-slate-400 shrink-0" aria-hidden />
          {title}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">{labels.zoom}</span>
          <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50">
            <button
              type="button"
              className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg"
              onClick={() => onZoomChange(clampZoom(zoom - 10))}
              aria-label="-"
            >
              <Minus size={14} />
            </button>
            <span className="px-2 text-xs tabular-nums w-10 text-center">{zoom}%</span>
            <button
              type="button"
              className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg"
              onClick={() => onZoomChange(clampZoom(zoom + 10))}
              aria-label="+"
            >
              <Plus size={14} />
            </button>
          </div>
          {onCopyHtml && (
            <button
              type="button"
              onClick={() => void onCopyHtml()}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Copy size={14} />
              {copyDone ? labels.copied : labels.copyHtml}
            </button>
          )}
        </div>
      </div>

      {snippets && snippets.length > 0 && onInsertSnippet && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2">
          <span className="text-[10px] font-medium text-slate-500 flex items-center gap-1 shrink-0">
            <Braces size={12} className="opacity-70" aria-hidden />
            {labels.snippets}
          </span>
          {snippets.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => onInsertSnippet(s.snippet)}
              className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-medium text-slate-700 hover:bg-primary-50 hover:border-primary-200"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
