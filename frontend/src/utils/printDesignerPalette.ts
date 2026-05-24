import type { CanvasElement } from './printDesignerTypes'
import { createCanvasId } from './printDesignerTypes'
import { DEFAULT_CANVAS_TABLE_COLUMNS } from './printDesignerTable'
import { DEFAULT_TOTALS_TABLE_ROWS } from './printDesignerTotalsTable'

export type PaletteElementType =
  | 'text'
  | 'image'
  | 'table'
  | 'totals_table'
  | 'divider'
  | 'qr'
  | 'barcode'
  | 'box'
  | 'spacer'

export function createPaletteElement(type: PaletteElementType, langAr: boolean): CanvasElement {
  const L = (ar: string, en: string) => (langAr ? ar : en)
  const id = createCanvasId()
  switch (type) {
    case 'text':
      return { id, type: 'text', label: L('نص حر', 'Text'), text: L('نص جديد', 'New text') }
    case 'image':
      return { id, type: 'image', label: L('صورة', 'Image'), src: 'https://via.placeholder.com/120x40?text=Logo' }
    case 'table':
      return {
        id,
        type: 'table',
        label: L('جدول أصناف', 'Items table'),
        columns: DEFAULT_CANVAS_TABLE_COLUMNS.map((c) => ({ ...c })),
        showTitle: true,
      }
    case 'totals_table':
      return {
        id,
        type: 'totals_table',
        label: L('جدول الإجماليات', 'Totals table'),
        rows: DEFAULT_TOTALS_TABLE_ROWS.map((r) => ({ ...r })),
        labelColumnTitle: L('البيان', 'Description'),
        valueColumnTitle: L('القيمة', 'Value'),
        showHeader: true,
        anchorBelowItems: true,
        showTitle: false,
      }
    case 'divider':
      return { id, type: 'divider', label: L('فاصل', 'Divider') }
    case 'qr':
      return { id, type: 'qr', label: 'QR' }
    case 'barcode':
      return { id, type: 'barcode', label: L('باركود', 'Barcode') }
    case 'box':
      return { id, type: 'box', label: L('مستطيل', 'Box'), minHeightMm: 24 }
    case 'spacer':
      return { id, type: 'spacer', label: L('مسافة', 'Spacer'), heightMm: 6 }
    default:
      return { id, type: 'text', label: 'Text', text: '' }
  }
}
