import Handlebars from 'handlebars'
import type { PrintMargins, PrintOrientation, PrintPaperSize, PrintDocumentType } from '../../../types/printTemplate'
import { paperOuterSizeMm } from '../../../utils/printDesignerLayout'
import type { PrintBlock } from '../../../utils/printTemplateBlocks'
import { renderPrintBlock } from '../../../utils/printTemplateBlocks'
import { PRINT_TEMPLATE_MOCK_BY_TYPE } from '../../../utils/printTemplatePreviewMock'
import { ensurePrintTemplateHandlebarsHelpers } from '../../../utils/printTemplateHandlebarsHelpers'

type Props = {
  isRtl: boolean
  langAr: boolean
  paperSize: PrintPaperSize
  orientation: PrintOrientation
  margins: PrintMargins
  zoom: number
  showGrid: boolean
  documentType: PrintDocumentType
  blocks: PrintBlock[]
  globalSettings: Record<string, unknown>
  accentColor: string
  fontFamily: string
  fontSize: number
  textColor: string
  selectedId: string | null
  onSelect: (id: string | null) => void
  onReorder: (next: PrintBlock[]) => void
  onDeselect?: () => void
}

function compileBlockPreview(
  block: PrintBlock,
  globalSettings: Record<string, unknown>,
  accentColor: string,
  docType: PrintDocumentType,
): string {
  ensurePrintTemplateHandlebarsHelpers()
  const g = { ...globalSettings, accent_color: accentColor, margins: globalSettings.margins }
  const inner = renderPrintBlock(block, g)
  if (!inner.trim()) return ''
  try {
    const tpl = Handlebars.compile(inner, { strict: false, noEscape: false })
    const ctx = PRINT_TEMPLATE_MOCK_BY_TYPE[docType] ?? PRINT_TEMPLATE_MOCK_BY_TYPE.invoice
    const out = tpl(ctx)
    return typeof out === 'string' ? out : String(out)
  } catch {
    return inner
  }
}

function moveBlock(blocks: PrintBlock[], id: string, dir: -1 | 1): PrintBlock[] {
  const i = blocks.findIndex((b) => b.id === id)
  if (i < 0) return blocks
  const j = i + dir
  if (j < 0 || j >= blocks.length) return blocks
  const copy = [...blocks]
  const t = copy[i]
  copy[i] = copy[j]
  copy[j] = t
  return copy
}

export default function PrintBlockEditorCanvas({
  isRtl,
  langAr: L,
  paperSize,
  orientation,
  margins,
  zoom,
  showGrid,
  documentType,
  blocks,
  globalSettings,
  accentColor,
  fontFamily,
  fontSize,
  textColor,
  selectedId,
  onSelect,
  onReorder,
  onDeselect,
}: Props) {
  const isThermal = paperSize === 'thermal_80' || paperSize === 'thermal_58'
  const outer = paperOuterSizeMm(paperSize, orientation)
  const paperW = `${outer.w}mm`
  const paperH = isThermal ? 'auto' : `${outer.h}mm`

  return (
    <div
      className="flex-1 bg-gray-200 overflow-auto flex items-start justify-center p-6 min-h-0 min-w-0"
      dir={isRtl ? 'rtl' : 'ltr'}
      onMouseDown={(e) => {
        if (onDeselect && e.target === e.currentTarget) onDeselect()
      }}
      style={{
        backgroundImage: showGrid ? 'radial-gradient(circle, #94a3b8 1px, transparent 1px)' : undefined,
        backgroundSize: '20px 20px',
      }}
    >
      <div
        className="bg-white shadow-2xl relative text-left"
        style={{
          width: paperW,
          minHeight: paperH,
          transform: `scale(${zoom / 100})`,
          transformOrigin: 'top center',
          padding: `${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm`,
          fontFamily: `${fontFamily}, Tahoma, Arial, sans-serif`,
          fontSize: `${fontSize}pt`,
          color: textColor,
        }}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && onDeselect) onDeselect()
        }}
      >
        {blocks.map((block) => {
          if (!block.visible) return null
          const previewHtml = compileBlockPreview(block, globalSettings, accentColor, documentType)
          if (!previewHtml.trim()) return null
          const selected = selectedId === block.id
          return (
            <div
              key={block.id}
              role="presentation"
              className={`relative cursor-pointer transition-all group mb-1 rounded ${
                selected ? 'ring-2 ring-teal-500 ring-offset-1' : 'hover:ring-1 hover:ring-teal-300 hover:ring-offset-1'
              }`}
              onClick={(e) => {
                e.stopPropagation()
                onSelect(block.id)
              }}
            >
              <div
                className={`absolute -top-7 ${isRtl ? 'left-0' : 'right-0'} flex items-center gap-1 bg-teal-600 text-white px-2 py-0.5 rounded-t-md z-10 transition-opacity ${
                  selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}
              >
                <span className="text-[10px] font-medium truncate max-w-[120px]">{block.label}</span>
                <div className={`flex gap-0.5 ${isRtl ? 'mr-2' : 'ml-2'}`}>
                  <button
                    type="button"
                    title={L ? 'أعلى' : 'Up'}
                    onClick={(e) => {
                      e.stopPropagation()
                      onReorder(moveBlock(blocks, block.id, -1))
                    }}
                    className="w-5 h-5 flex items-center justify-center hover:bg-teal-500 rounded text-xs"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    title={L ? 'أسفل' : 'Down'}
                    onClick={(e) => {
                      e.stopPropagation()
                      onReorder(moveBlock(blocks, block.id, 1))
                    }}
                    className="w-5 h-5 flex items-center justify-center hover:bg-teal-500 rounded text-xs"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    title={L ? 'إخفاء' : 'Hide'}
                    onClick={(e) => {
                      e.stopPropagation()
                      onReorder(blocks.map((b) => (b.id === block.id ? { ...b, visible: false } : b)))
                    }}
                    className="w-5 h-5 flex items-center justify-center hover:bg-teal-500 rounded text-xs"
                  >
                    👁
                  </button>
                </div>
              </div>
              <div className="overflow-hidden rounded" dir="rtl" dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
