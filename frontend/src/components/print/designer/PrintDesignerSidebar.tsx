import type { PrintDocumentType, PrintMargins, PrintOrientation, PrintPaperSize } from '../../../types/printTemplate'
import type { CanvasElement, CanvasElementLayout, CanvasElementStyle } from '../../../utils/printDesignerTypes'
import PrintDesignerLeftPanel from './PrintDesignerLeftPanel'
import PrintDesignerPropertiesPanel from './PrintDesignerPropertiesPanel'

type Props = {
  isRtl: boolean
  langAr: boolean
  selectedElements: CanvasElement[]
  contentMaxW: number
  contentMaxH: number
  onUpdateElement: (el: CanvasElement) => void
  onPatchSelectedStyle: (patch: Partial<CanvasElementStyle>) => void
  onPatchSelected: (patch: Partial<CanvasElement>) => void
  onPatchSelectedLayout: (patch: Partial<CanvasElementLayout>) => void
  onDeleteSelected: () => void
  onDeselect: () => void
  onNudgeSelected: (dx: number, dy: number) => void
  onOpenTableColumns?: (id: string) => void
  onOpenTotalsRows?: (id: string) => void
  documentType: PrintDocumentType
  readOnlyMeta?: boolean
  paperSize: PrintPaperSize
  onPaperSizeChange: (v: PrintPaperSize) => void
  orientation: PrintOrientation
  onOrientationChange: (v: PrintOrientation) => void
  margins: PrintMargins
  onMarginsChange: (m: PrintMargins) => void
  sections: Record<string, boolean>
  onSectionsChange: (s: Record<string, boolean>) => void
  settings: Record<string, unknown>
  onSettingsChange: (s: Record<string, unknown>) => void
  showGrid: boolean
  onShowGridChange: (v: boolean) => void
  showRuler: boolean
  onShowRulerChange: (v: boolean) => void
}

export default function PrintDesignerSidebar({
  selectedElements,
  contentMaxW,
  contentMaxH,
  onUpdateElement,
  onPatchSelectedStyle,
  onPatchSelected,
  onPatchSelectedLayout,
  onDeleteSelected,
  onDeselect,
  onNudgeSelected,
  onOpenTableColumns,
  onOpenTotalsRows,
  ...pageProps
}: Props) {
  if (selectedElements.length > 0) {
    return (
      <PrintDesignerPropertiesPanel
        isRtl={pageProps.isRtl}
        langAr={pageProps.langAr}
        elements={selectedElements}
        contentMaxW={contentMaxW}
        contentMaxH={contentMaxH}
        onUpdateElement={onUpdateElement}
        onPatchStyle={onPatchSelectedStyle}
        onPatchElements={onPatchSelected}
        onPatchLayout={onPatchSelectedLayout}
        onNudge={onNudgeSelected}
        onDelete={onDeleteSelected}
        onDeselect={onDeselect}
        onOpenTableColumns={onOpenTableColumns}
        onOpenTotalsRows={onOpenTotalsRows}
      />
    )
  }

  return <PrintDesignerLeftPanel {...pageProps} />
}
