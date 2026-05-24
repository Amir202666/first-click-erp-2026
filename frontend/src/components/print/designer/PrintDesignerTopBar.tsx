import {
  ArrowLeft,
  ArrowRight,
  Clipboard,
  Copy,
  Eye,
  Redo2,
  Save,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import type { PrintDocumentType } from '../../../types/printTemplate'

export type PresetOption = { id: string; label: string }

type Props = {
  isRtl: boolean
  templateName: string
  onNameChange: (v: string) => void
  nameReadOnly?: boolean
  documentType?: PrintDocumentType
  documentTypeOptions?: { value: PrintDocumentType; label: string }[]
  onDocumentTypeChange?: (t: PrintDocumentType) => void
  documentTypeLocked?: boolean
  presets: PresetOption[]
  presetId: string
  onPresetChange: (id: string) => void
  zoom: number
  onZoomChange: (z: number) => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  onCopy: () => void
  onPaste: () => void
  onPreview: () => void
  canSaveChanges?: boolean
  onSaveChanges?: () => void
  onSaveAs: () => void
  savingChanges?: boolean
  savingAs?: boolean
  saveDisabled?: boolean
  onBack: () => void
  labels: {
    back: string
    presetsPlaceholder: string
    preview: string
    saveChanges: string
    savingChanges: string
    saveAs: string
    savingAs: string
  }
}

export default function PrintDesignerTopBar({
  isRtl,
  templateName,
  onNameChange,
  nameReadOnly,
  documentType,
  documentTypeOptions,
  onDocumentTypeChange,
  documentTypeLocked,
  presets,
  presetId,
  onPresetChange,
  zoom,
  onZoomChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onCopy,
  onPaste,
  onPreview,
  canSaveChanges = false,
  onSaveChanges,
  onSaveAs,
  savingChanges = false,
  savingAs = false,
  saveDisabled,
  onBack,
  labels,
}: Props) {
  const busy = savingChanges || savingAs
  return (
    <div
      className="h-14 bg-white border-b border-gray-200 flex items-center px-3 sm:px-4 gap-2 flex-shrink-0 flex-wrap"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1 basis-[200px]">
        <button
          type="button"
          onClick={onBack}
          className="p-2 hover:bg-gray-100 rounded-lg text-gray-600 shrink-0"
          aria-label={labels.back}
        >
          {isRtl ? <ArrowRight size={18} /> : <ArrowLeft size={18} />}
        </button>
        <input
          type="text"
          value={templateName}
          onChange={(e) => onNameChange(e.target.value)}
          disabled={nameReadOnly}
          className="text-sm font-semibold text-gray-800 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-teal-500 outline-none px-1 min-w-[120px] flex-1 max-w-md disabled:opacity-60"
          placeholder="قالب جديد"
        />
        {documentType != null && documentTypeOptions && documentTypeOptions.length > 0 && onDocumentTypeChange && (
          <select
            value={documentType}
            onChange={(e) => onDocumentTypeChange(e.target.value as PrintDocumentType)}
            disabled={documentTypeLocked}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600 max-w-[160px] shrink-0 disabled:opacity-60"
          >
            {documentTypeOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap justify-center flex-1 min-w-0">
        <select
          value={presetId}
          onChange={(e) => onPresetChange(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600 max-w-[200px]"
        >
          <option value="">{labels.presetsPlaceholder}</option>
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>

        <div className="w-px h-5 bg-gray-200 mx-0.5 hidden sm:block" />

        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          className="p-1.5 hover:bg-gray-100 rounded text-gray-500 disabled:opacity-30"
          title="Undo"
        >
          <Undo2 size={15} />
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          className="p-1.5 hover:bg-gray-100 rounded text-gray-500 disabled:opacity-30"
          title="Redo"
        >
          <Redo2 size={15} />
        </button>

        <div className="w-px h-5 bg-gray-200 mx-0.5 hidden sm:block" />

        <button type="button" onClick={onCopy} className="p-1.5 hover:bg-gray-100 rounded text-gray-500" title="Copy">
          <Copy size={15} />
        </button>
        <button type="button" onClick={onPaste} className="p-1.5 hover:bg-gray-100 rounded text-gray-500" title="Paste">
          <Clipboard size={15} />
        </button>

        <div className="w-px h-5 bg-gray-200 mx-0.5 hidden sm:block" />

        <button
          type="button"
          onClick={() => onZoomChange(Math.max(25, zoom - 10))}
          className="p-1.5 hover:bg-gray-100 rounded text-gray-500"
        >
          <ZoomOut size={15} />
        </button>
        <span className="text-xs text-gray-600 min-w-[40px] text-center tabular-nums">{zoom}%</span>
        <button
          type="button"
          onClick={() => onZoomChange(Math.min(200, zoom + 10))}
          className="p-1.5 hover:bg-gray-100 rounded text-gray-500"
        >
          <ZoomIn size={15} />
        </button>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onPreview}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50"
        >
          <Eye size={14} /> {labels.preview}
        </button>
        {canSaveChanges && onSaveChanges && (
          <button
            type="button"
            onClick={onSaveChanges}
            disabled={busy || saveDisabled}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white rounded-lg text-xs font-bold disabled:opacity-50"
            title={labels.saveChanges}
          >
            <Save size={14} />
            {savingChanges ? labels.savingChanges : labels.saveChanges}
          </button>
        )}
        <button
          type="button"
          onClick={onSaveAs}
          disabled={busy || saveDisabled}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 ${
            canSaveChanges
              ? 'border border-teal-200 text-teal-700 hover:bg-teal-50'
              : 'bg-teal-500 hover:bg-teal-600 text-white font-bold'
          }`}
          title={labels.saveAs}
        >
          <Save size={14} className={canSaveChanges ? 'opacity-80' : undefined} />
          {savingAs ? labels.savingAs : labels.saveAs}
        </button>
      </div>
    </div>
  )
}
