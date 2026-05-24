import { useMemo } from 'react'
import type { PrintDocumentType } from '../../../types/printTemplate'
import { VARIABLES_BY_DOC_TYPE } from '../../../utils/printUtils'
import type { CanvasElement } from '../../../utils/printDesignerTypes'
import { createCanvasId } from '../../../utils/printDesignerTypes'
import type { PaletteElementType } from '../../../utils/printDesignerPalette'

const ELEMENTS: { type: PaletteElementType; labelAr: string; labelEn: string; icon: string }[] = [
  { type: 'text', labelAr: 'نص حر', labelEn: 'Text', icon: 'T' },
  { type: 'image', labelAr: 'صورة/شعار', labelEn: 'Image', icon: '🖼' },
  { type: 'table', labelAr: 'جدول أصناف', labelEn: 'Items table', icon: '⊞' },
  { type: 'totals_table', labelAr: 'جدول الإجماليات', labelEn: 'Totals table', icon: '∑' },
  { type: 'divider', labelAr: 'فاصل', labelEn: 'Divider', icon: '—' },
  { type: 'qr', labelAr: 'QR Code', labelEn: 'QR', icon: '▦' },
  { type: 'barcode', labelAr: 'باركود', labelEn: 'Barcode', icon: '▌▌' },
  { type: 'box', labelAr: 'مستطيل', labelEn: 'Box', icon: '□' },
]

type Props = {
  isRtl: boolean
  langAr: boolean
  documentType: PrintDocumentType
  elements: CanvasElement[]
  selectedIds: Set<string>
  onSelect: (id: string, additive?: boolean) => void
  onSelectAll: () => void
  onClearSelection: () => void
  onRemove: (id: string) => void
  onUpdateElements: (next: CanvasElement[]) => void
  onAddVariable: (code: string, label: string) => void
  onAddElement: (type: PaletteElementType) => void
}

export function cloneCanvasElement(el: CanvasElement): CanvasElement {
  const id = createCanvasId()
  const copy = { ...el, id } as CanvasElement
  if (copy.layout) {
    copy.layout = { ...copy.layout, xMm: copy.layout.xMm + 4, yMm: copy.layout.yMm + 4 }
  }
  return copy
}

function layerLabel(el: CanvasElement): string {
  if ('label' in el && el.label) return el.label
  if (el.type === 'variable' && 'var' in el) return el.var
  return el.type
}

export default function PrintDesignerRightPanel({
  isRtl,
  langAr: L,
  documentType,
  elements,
  selectedIds,
  onSelect,
  onSelectAll,
  onClearSelection,
  onRemove,
  onUpdateElements,
  onAddVariable,
  onAddElement,
}: Props) {
  const groups = VARIABLES_BY_DOC_TYPE[documentType] ?? VARIABLES_BY_DOC_TYPE.invoice ?? []
  const allSelected = elements.length > 0 && elements.every((e) => selectedIds.has(e.id))

  const updateEl = (id: string, patch: Partial<CanvasElement>) => {
    onUpdateElements(elements.map((e) => (e.id === id ? ({ ...e, ...patch } as CanvasElement) : e)))
  }

  const sortedLayers = useMemo(() => [...elements].reverse(), [elements])

  return (
    <div className="w-80 bg-white border-r border-gray-200 flex flex-col flex-shrink-0 min-h-0 shadow-sm" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="border-b border-gray-200 shrink-0">
        <div className="px-3 py-2.5 bg-slate-50 border-b border-gray-100 flex items-center justify-between gap-2">
          <h3 className="text-xs font-bold text-gray-800">{L ? 'عناصر القالب' : 'Template elements'}</h3>
          <label className="flex items-center gap-1.5 text-[10px] text-gray-500 cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(e) => (e.target.checked ? onSelectAll() : onClearSelection())}
              className="rounded border-gray-300 accent-teal-600"
            />
            {L ? 'تحديد الكل' : 'Select all'}
          </label>
        </div>
        <div className="max-h-[38vh] overflow-y-auto p-2 space-y-0.5">
          {sortedLayers.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">{L ? 'أضف عناصر من المتغيرات أدناه' : 'Add elements from variables below'}</p>
          ) : (
            sortedLayers.map((el) => {
              const vis = el.visible !== false
              const locked = !!el.locked
              return (
                <div
                  key={el.id}
                  className={`flex items-center gap-1 px-2 py-1.5 rounded-lg border transition-colors ${
                    selectedIds.has(el.id) ? 'bg-teal-50 border-teal-200' : 'border-transparent hover:bg-gray-50'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => updateEl(el.id, { visible: !vis })}
                    className={`w-7 h-7 flex items-center justify-center rounded text-sm ${vis ? 'text-gray-600' : 'text-gray-300'}`}
                  >
                    {vis ? '👁' : '👁‍🗨'}
                  </button>
                  <button
                    type="button"
                    onClick={() => updateEl(el.id, { locked: !locked })}
                    className={`w-7 h-7 flex items-center justify-center rounded text-sm ${locked ? 'text-amber-600' : 'text-gray-400'}`}
                  >
                    {locked ? '🔒' : '🔓'}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => onSelect(el.id, e.shiftKey || e.ctrlKey || e.metaKey)}
                    className="flex-1 text-xs text-gray-800 truncate text-start min-w-0 py-1"
                  >
                    {layerLabel(el)}
                  </button>
                  <button type="button" onClick={() => onRemove(el.id)} className="w-7 h-7 flex items-center justify-center rounded text-red-400 hover:bg-red-50 text-sm">
                    ✕
                  </button>
                </div>
              )
            })
          )}
        </div>
      </div>

      <div className="px-3 py-2 border-b border-gray-100 shrink-0">
        <p className="text-[10px] text-gray-400 mb-1.5 font-semibold">{L ? 'إضافة عنصر' : 'Add element'}</p>
        <div className="flex flex-wrap gap-1">
          {ELEMENTS.map((el) => (
            <button
              key={el.type}
              type="button"
              onClick={() => onAddElement(el.type)}
              className="px-2 py-1 text-[10px] border border-gray-200 rounded-lg hover:border-teal-400 hover:bg-teal-50"
            >
              {el.icon} {L ? el.labelAr : el.labelEn}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        <div className="px-3 py-2 bg-slate-50 border-b border-gray-100 shrink-0">
          <h3 className="text-xs font-bold text-gray-800">{L ? 'المتغيرات' : 'Variables'}</h3>
          <p className="text-[10px] text-gray-400 mt-0.5">{L ? 'انقر + لإضافة الحقل على الصفحة' : 'Click + to add field to page'}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 min-h-0">
          {groups.map((g) => (
            <div key={g.title} className="mb-3">
              <p className="text-[10px] font-bold text-gray-500 mb-1 px-1">{g.title}</p>
              <div className="space-y-0.5">
                {g.items.map((v) => (
                  <div
                    key={v.code}
                    className="flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-gray-50 group border border-transparent hover:border-gray-100"
                  >
                    <button
                      type="button"
                      onClick={() => onAddVariable(v.code, v.label)}
                      className="w-7 h-7 shrink-0 flex items-center justify-center rounded-md bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 shadow-sm"
                    >
                      +
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium text-gray-700 truncate">{v.label}</p>
                      <p className="text-[9px] text-gray-400 truncate font-mono" dir="ltr">
                        {v.code}
                      </p>
                    </div>
                    <span
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('variable', v.code)
                        e.dataTransfer.setData('label', v.label)
                        e.dataTransfer.effectAllowed = 'copy'
                      }}
                      className="opacity-0 group-hover:opacity-100 text-[9px] text-teal-600 cursor-grab px-1"
                    >
                      ⠿
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
