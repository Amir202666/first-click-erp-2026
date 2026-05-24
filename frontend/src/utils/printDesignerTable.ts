import type { CSSProperties } from 'react'
import type { CanvasElementStyle, CanvasTableColumn, CanvasTableEl } from './printDesignerTypes'
import { getElementStyle, resolveElementBorder } from './printElementStyle'

export type TableColumnCatalogEntry = {
  key: string
  labelAr: string
  labelEn: string
  field: string
  defaultAlign: 'right' | 'center' | 'left'
}

export const CANVAS_TABLE_COLUMN_CATALOG: TableColumnCatalogEntry[] = [
  { key: 'row_num', labelAr: '#', labelEn: '#', field: '{{sum @index 1}}', defaultAlign: 'center' },
  { key: 'name', labelAr: 'البند', labelEn: 'Item', field: '{{name}}', defaultAlign: 'right' },
  { key: 'sku', labelAr: 'كود الصنف', labelEn: 'SKU', field: '{{code}}', defaultAlign: 'center' },
  { key: 'qty', labelAr: 'الكمية', labelEn: 'Qty', field: '{{qty}}', defaultAlign: 'center' },
  { key: 'unit', labelAr: 'الوحدة', labelEn: 'Unit', field: '{{unit}}', defaultAlign: 'center' },
  { key: 'price', labelAr: 'السعر', labelEn: 'Price', field: '{{formatNumber price}}', defaultAlign: 'left' },
  { key: 'discount', labelAr: 'الخصم', labelEn: 'Discount', field: '{{formatNumber discount}}', defaultAlign: 'left' },
  { key: 'vat', labelAr: 'الضريبة', labelEn: 'Tax', field: '{{formatNumber vat}}', defaultAlign: 'left' },
  { key: 'total', labelAr: 'الإجمالي', labelEn: 'Total', field: '{{formatNumber total}}', defaultAlign: 'left' },
]

export const DEFAULT_CANVAS_TABLE_COLUMNS: CanvasTableColumn[] = [
  { key: 'name', label: 'البند', widthPercent: 40, align: 'right' },
  { key: 'qty', label: 'الكمية', widthPercent: 15, align: 'center' },
  { key: 'price', label: 'السعر', widthPercent: 22, align: 'left' },
  { key: 'total', label: 'الإجمالي', widthPercent: 23, align: 'left' },
]

export function catalogEntry(key: string): TableColumnCatalogEntry | undefined {
  return CANVAS_TABLE_COLUMN_CATALOG.find((c) => c.key === key)
}

export function columnField(col: CanvasTableColumn): string {
  if (col.field?.trim()) return col.field.trim()
  return catalogEntry(col.key)?.field ?? `{{${col.key}}}`
}

const MONEY_COLUMN_KEYS = new Set(['price', 'total', 'discount', 'vat'])

function upgradeMoneyColumnField(col: CanvasTableColumn): CanvasTableColumn {
  if (!MONEY_COLUMN_KEYS.has(col.key)) return col
  const raw = col.field?.trim().replace(/\s+/g, ' ')
  if (!raw) return col
  const inner = raw
    .replace(/\{\{format(?:Number|Money)\s+/g, '')
    .replace(/\{\{currency\}\}/g, '')
    .replace(/\s*ر\.س/g, '')
    .replace(/\{\{|\}\}/g, '')
    .trim()
  const path = inner.startsWith('this.') ? inner.slice(5) : inner || col.key
  if (raw.includes('formatNumber') && !raw.includes('currency') && !raw.includes('ر.س')) {
    return { ...col, field: raw.replace(/\{\{formatMoney/g, '{{formatNumber') }
  }
  return { ...col, field: `{{formatNumber ${path}}}` }
}

export function normalizeTableElement(el: CanvasTableEl): CanvasTableEl & { columns: CanvasTableColumn[] } {
  const cols: CanvasTableColumn[] = el.columns?.length ? el.columns : DEFAULT_CANVAS_TABLE_COLUMNS
  return {
    ...el,
    columns: cols.map((c) => {
      const aligned = {
        ...c,
        align: c.align ?? catalogEntry(c.key)?.defaultAlign ?? 'right',
      }
      return upgradeMoneyColumnField(aligned)
    }),
    showTitle: el.showTitle !== false,
  }
}

function columnWidths(columns: CanvasTableColumn[]): number[] {
  const raw = columns.map((c) => Math.max(5, c.widthPercent ?? Math.floor(100 / columns.length)))
  const sum = raw.reduce((a, b) => a + b, 0) || 1
  return raw.map((w) => Math.round((w / sum) * 100))
}

function tableCellTypographyCss(style: CanvasElementStyle): string {
  const parts: string[] = ['box-sizing:border-box']
  if (style.fontSize) parts.push(`font-size:${style.fontSize}pt`)
  if (style.fontWeight === 'bold') parts.push('font-weight:700')
  if (style.fontStyle === 'italic') parts.push('font-style:italic')
  if (style.textDecoration === 'underline') parts.push('text-decoration:underline')
  if (!style.colorTransparent && style.color) parts.push(`color:${style.color}`)
  if (style.lineHeightPt) parts.push(`line-height:${style.lineHeightPt}pt`)
  else if (style.lineHeight) parts.push(`line-height:${style.lineHeight}`)
  if (style.paddingPx) parts.push(`padding:${style.paddingPx}px`)
  return parts.join(';')
}

function tableCellBorderCss(style: CanvasElementStyle): string {
  const border = resolveElementBorder(style)
  if (!border) return ''
  return `border:1px ${border.line} ${border.color}`
}

function thCss(style: CanvasElementStyle, hdr: string, align: string, widthPct: number): string {
  const cellBorder = tableCellBorderCss(style)
  return `${tableCellTypographyCss(style)};background:${hdr};color:#fff;text-align:${align};width:${widthPct}%;vertical-align:middle;font-weight:600${cellBorder ? `;${cellBorder}` : ''}`
}

function tdCss(style: CanvasElementStyle, align: string, widthPct: number): string {
  const cellBorder = tableCellBorderCss(style)
  return `${tableCellTypographyCss(style)};text-align:${align};width:${widthPct}%;vertical-align:middle;color:${style.colorTransparent ? 'inherit' : style.color ?? '#334155'}${cellBorder ? `;${cellBorder}` : ''}`
}

export function renderTableHtml(el: CanvasTableEl, pageFontFamily: string, baseWrapperStyle: string): string {
  const table = normalizeTableElement(el)
  const st = getElementStyle(table)
  const hdr = st.backgroundColor || 'var(--accent,#059669)'
  const cols = table.columns
  const widths = columnWidths(cols)
  const cellTypo = tableCellTypographyCss(st)

  const ths = cols
    .map((c, i) => {
      const align = c.align ?? 'right'
      return `<th style="${thCss(st, hdr, align, widths[i])}">${escapeHtml(c.label)}</th>`
    })
    .join('')

  const outerBorder = resolveElementBorder(st)
  const rowLine = outerBorder ? `border-bottom:1px ${outerBorder.line} ${outerBorder.color}` : 'border-bottom:1px solid #f1f5f9'

  const tds = cols
    .map((c, i) => {
      const align = c.align ?? 'right'
      return `<td style="${tdCss(st, align, widths[i])}">${columnField(c)}</td>`
    })
    .join('')

  const titleBlock =
    table.showTitle && table.label
      ? `<div style="font-size:10pt;font-weight:600;color:#fff;padding:4px 8px;background:${hdr};width:100%;${cellTypo}">${escapeHtml(table.label)}</div>`
      : ''

  const tableBorderStyle = outerBorder ? `border:${outerBorder.css};` : ''
  return `<div style="${baseWrapperStyle}"><div style="width:100%;display:flex;flex-direction:column;align-items:stretch;box-sizing:border-box;overflow:visible;font-family:${pageFontFamily}">${titleBlock}<table style="width:100%;border-collapse:collapse;margin:0;table-layout:fixed;height:auto;min-height:0;${tableBorderStyle}${cellTypo}"><thead><tr style="background:${hdr};color:#fff;">${ths}</tr></thead><tbody>{{#each items}}<tr style="${rowLine};">${tds}</tr>{{/each}}</tbody></table></div></div>`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function renderTablePreview(
  el: CanvasTableEl,
  accentColor: string,
  pageFontFamily: string,
): {
  headerBg: string
  columns: CanvasTableColumn[]
  widths: number[]
  cellStyle: CSSProperties
  thStyle: (col: CanvasTableColumn, i: number) => CSSProperties
  tdStyle: (col: CanvasTableColumn, i: number) => CSSProperties
  outerBorder: ReturnType<typeof resolveElementBorder>
  rowBorderStyle: CSSProperties | undefined
} {
  const table = normalizeTableElement(el)
  const st = getElementStyle(table)
  const hdr = st.backgroundColor || accentColor
  const cols = table.columns
  const widths = columnWidths(cols)
  const outerBorder = resolveElementBorder(st)
  const cellBorderStyle: CSSProperties = outerBorder
    ? { border: `1px ${outerBorder.line} ${outerBorder.color}` }
    : {}
  const rowBorderStyle: CSSProperties | undefined = outerBorder
    ? { borderBottom: `1px ${outerBorder.line} ${outerBorder.color}` }
    : undefined

  const cellStyle: CSSProperties = {
    fontFamily: st.fontFamily || pageFontFamily,
    fontSize: st.fontSize ? `${st.fontSize}pt` : undefined,
    fontWeight: st.fontWeight === 'bold' ? 700 : undefined,
    fontStyle: st.fontStyle === 'italic' ? 'italic' : undefined,
    textDecoration: st.textDecoration === 'underline' ? 'underline' : undefined,
    lineHeight: st.lineHeightPt ? `${st.lineHeightPt}pt` : st.lineHeight,
    padding: st.paddingPx ? `${st.paddingPx}px` : undefined,
  }

  const thStyle = (col: CanvasTableColumn, i: number): CSSProperties => ({
    ...cellStyle,
    ...cellBorderStyle,
    width: `${widths[i]}%`,
    textAlign: col.align ?? 'right',
    color: '#fff',
    fontWeight: 600,
  })

  const tdStyle = (col: CanvasTableColumn, i: number): CSSProperties => ({
    ...cellStyle,
    width: `${widths[i]}%`,
    textAlign: col.align ?? 'right',
    color: st.colorTransparent ? undefined : st.color,
    ...cellBorderStyle,
    ...(MONEY_COLUMN_KEYS.has(col.key) ? { whiteSpace: 'nowrap' as const } : {}),
  })

  return { headerBg: hdr, columns: cols, widths, cellStyle, thStyle, tdStyle, outerBorder, rowBorderStyle }
}

export function createColumnFromCatalog(key: string, langAr: boolean): CanvasTableColumn | null {
  const entry = catalogEntry(key)
  if (!entry) return null
  return {
    key: entry.key,
    label: langAr ? entry.labelAr : entry.labelEn,
    field: entry.field,
    align: entry.defaultAlign,
    widthPercent: Math.floor(100 / 4),
  }
}
