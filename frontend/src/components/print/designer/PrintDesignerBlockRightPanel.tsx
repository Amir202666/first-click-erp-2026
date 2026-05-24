import { useState } from 'react'
import type { PrintDocumentType } from '../../../types/printTemplate'
import type { PrintBlock, PrintBlockType } from '../../../utils/printTemplateBlocks'
import { PRINT_BLOCK_LABELS } from '../../../utils/printTemplateBlocks'

const COMMON_PALETTE: PrintBlockType[] = [
  'divider',
  'spacer',
  'text',
  'image',
  'qr_code',
  'barcode',
  'signature',
  'two_columns',
]

export function getPaletteForDocType(docType: PrintDocumentType): PrintBlockType[] {
  switch (docType) {
    case 'receipt':
    case 'payment':
      return [
        'receipt_header',
        'receipt_body',
        'signature_row',
        'footer',
        ...COMMON_PALETTE,
      ]
    case 'pos':
      return [
        'pos_header',
        'pos_info',
        'pos_divider',
        'pos_items',
        'pos_totals',
        'pos_footer',
        'header',
        'items_table',
        'totals',
        ...COMMON_PALETTE,
      ]
    case 'journal':
      return [
        'header',
        'journal_info',
        'journal_table',
        'notes',
        'footer',
        ...COMMON_PALETTE,
      ]
    case 'purchase':
      return [
        'header',
        'supplier_info',
        'items_table',
        'totals',
        'notes',
        'footer',
        ...COMMON_PALETTE,
      ]
    case 'inventory':
      return [
        'header',
        'inventory_info',
        'inventory_table',
        'inventory_summary',
        'notes',
        'footer',
        ...COMMON_PALETTE,
      ]
    case 'invoice':
    default:
      return [
        'header',
        'info_row',
        'items_table',
        'totals',
        'notes',
        'footer',
        ...COMMON_PALETTE,
      ]
  }
}

export function newPrintBlockId(): string {
  return `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

type Props = {
  isRtl: boolean
  langAr: boolean
  documentType: PrintDocumentType
  blocks: PrintBlock[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onAddBlock: (type: PrintBlockType) => void
  onDeleteBlock: (id: string) => void
  onToggleVisibility: (id: string) => void
  onReorder: (next: PrintBlock[]) => void
}

export default function PrintDesignerBlockRightPanel({
  isRtl,
  langAr: L,
  documentType,
  blocks,
  selectedId,
  onSelect,
  onAddBlock,
  onDeleteBlock,
  onToggleVisibility,
  onReorder,
}: Props) {
  const [tab, setTab] = useState<'elements' | 'layers'>('elements')
  const [dragId, setDragId] = useState<string | null>(null)

  const onLayerDragStart = (id: string) => (e: React.DragEvent) => {
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }

  const onLayerDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const onLayerDrop = (targetId: string) => (e: React.DragEvent) => {
    e.preventDefault()
    const fromId = dragId || e.dataTransfer.getData('text/plain')
    setDragId(null)
    if (!fromId || fromId === targetId) return
    const from = blocks.findIndex((b) => b.id === fromId)
    const to = blocks.findIndex((b) => b.id === targetId)
    if (from < 0 || to < 0) return
    const copy = [...blocks]
    const [row] = copy.splice(from, 1)
    copy.splice(to, 0, row)
    onReorder(copy)
  }

  return (
    <div className="w-72 bg-white border-r border-gray-200 flex flex-col flex-shrink-0 min-h-0" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="flex border-b border-gray-200 shrink-0">
        {(
          [
            ['elements', L ? 'العناصر' : 'Elements'],
            ['layers', L ? 'الطبقات' : 'Layers'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex-1 py-3 text-xs font-medium transition-colors ${
              tab === key ? 'text-teal-600 border-b-2 border-teal-500' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 min-h-0">
        {tab === 'elements' ? (
          <>
            <p className="text-[10px] text-gray-400 mb-2 font-semibold uppercase tracking-wide">
              {L ? 'كتل التصميم' : 'Design blocks'}
            </p>
            <div className="grid grid-cols-2 gap-2 mb-2">
              {getPaletteForDocType(documentType).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onAddBlock(t)}
                  className="flex flex-col items-center gap-1 p-3 border border-gray-200 rounded-xl cursor-pointer hover:border-teal-400 hover:bg-teal-50 transition-all text-center"
                >
                  <span className="text-[10px] text-gray-700 font-medium leading-tight">
                    {L ? PRINT_BLOCK_LABELS[t].ar : PRINT_BLOCK_LABELS[t].en}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-400">{L ? `نوع المستند: ${documentType}` : `Document: ${documentType}`}</p>
          </>
        ) : (
          <div className="space-y-1">
            {blocks.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-8">{L ? 'لا توجد طبقات' : 'No layers'}</p>
            ) : (
              blocks.map((el) => (
                <div
                  key={el.id}
                  role="button"
                  tabIndex={0}
                  draggable
                  onDragStart={onLayerDragStart(el.id)}
                  onDragOver={onLayerDragOver}
                  onDrop={onLayerDrop(el.id)}
                  onClick={() => onSelect(el.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') onSelect(el.id)
                  }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                    selectedId === el.id ? 'bg-teal-50 border border-teal-200' : 'hover:bg-gray-50 border border-transparent'
                  }`}
                >
                  <span className="text-gray-400 shrink-0 cursor-grab" title={L ? 'اسحب لإعادة الترتيب' : 'Drag to reorder'}>
                    ⠿
                  </span>
                  <span className={`text-xs flex-1 truncate ${el.visible ? 'text-gray-700' : 'text-gray-400 line-through'}`}>
                    {el.label}
                  </span>
                  <button
                    type="button"
                    title={L ? 'إظهار/إخفاء' : 'Toggle visibility'}
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleVisibility(el.id)
                    }}
                    className="text-gray-400 hover:text-teal-600 text-xs p-1"
                  >
                    {el.visible ? '👁' : '○'}
                  </button>
                  <button
                    type="button"
                    title={L ? 'حذف' : 'Delete'}
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteBlock(el.id)
                    }}
                    className="text-gray-300 hover:text-red-400 text-xs p-1"
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
