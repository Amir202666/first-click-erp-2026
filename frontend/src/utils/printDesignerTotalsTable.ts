import type { CSSProperties } from 'react'
import type { CanvasElementStyle, CanvasTotalsRow, CanvasTotalsTableEl } from './printDesignerTypes'
import { getElementStyle, resolveElementBorder } from './printElementStyle'

export const DEFAULT_TOTALS_TABLE_ROWS: CanvasTotalsRow[] = [
  { key: 'subtotal', label: 'المجموع', field: '{{formatNumber subtotal}}', visible: true },
  { key: 'discount', label: 'الخصم', field: '{{formatNumber discount}}', visible: true },
  { key: 'additions', label: 'الإضافات', field: '{{formatNumber additions}}', visible: true },
  { key: 'vat', label: 'الضريبة', field: '{{formatNumber vat_amount}}', visible: true },
  { key: 'paid', label: 'المدفوع', field: '{{formatNumber paid}}', visible: true },
  { key: 'balance', label: 'المتبقي / الرصيد', field: '{{formatNumber balance}}', visible: true },
]

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function tableCellTypographyCss(style: CanvasElementStyle): string {
  const parts: string[] = ['box-sizing:border-box']
  if (style.fontSize) parts.push(`font-size:${style.fontSize}pt`)
  if (style.fontWeight === 'bold') parts.push('font-weight:700')
  if (!style.colorTransparent && style.color) parts.push(`color:${style.color}`)
  if (style.paddingPx) parts.push(`padding:${style.paddingPx}px`)
  return parts.join(';')
}

function tableCellBorderCss(style: CanvasElementStyle): string {
  const border = resolveElementBorder(style)
  if (!border) return ''
  return `border:1px ${border.line} ${border.color}`
}

export function normalizeTotalsTableElement(
  el: CanvasTotalsTableEl,
): CanvasTotalsTableEl & { rows: CanvasTotalsRow[] } {
  const rows =
    el.rows?.length && el.rows.length > 0
      ? el.rows.map((r) => ({
          key: r.key,
          label: r.label,
          field: r.field,
          visible: r.visible !== false,
          hideWhenZero: !!r.hideWhenZero,
        }))
      : DEFAULT_TOTALS_TABLE_ROWS.map((r) => ({ ...r }))

  return {
    ...el,
    rows,
    labelColumnTitle: el.labelColumnTitle ?? 'البيان',
    valueColumnTitle: el.valueColumnTitle ?? 'القيمة',
    showHeader: el.showHeader !== false,
    anchorBelowItems: el.anchorBelowItems !== false,
    showTitle: el.showTitle === true,
  }
}

export function renderTotalsTableHtml(
  el: CanvasTotalsTableEl,
  pageFontFamily: string,
  baseWrapperStyle: string,
  accentFallback = 'var(--accent,#4f46e5)',
): string {
  const table = normalizeTotalsTableElement(el)
  const st = getElementStyle(table)
  const hdr = st.backgroundColor || accentFallback
  const visibleRows = table.rows.filter((r) => r.visible !== false)
  const cellTypo = tableCellTypographyCss(st)
  const cellBorder = tableCellBorderCss(st)
  const rowLine = cellBorder ? '' : 'border-bottom:1px solid #e5e7eb;'

  const thLabel = escapeHtml(table.labelColumnTitle ?? 'البيان')
  const thValue = escapeHtml(table.valueColumnTitle ?? 'القيمة')

  const bodyRows = visibleRows
    .map((r) => {
      const field = (r.field ?? '').trim() || `{{formatNumber ${r.key}}}`
      const rowHtml = `<tr style="${rowLine}"><td style="${cellTypo};font-weight:600;color:#334155;text-align:right;vertical-align:middle;${cellBorder}">${escapeHtml(r.label)}</td><td style="${cellTypo};text-align:left;direction:ltr;font-weight:700;color:#0f172a;vertical-align:middle;${cellBorder}">${field}</td></tr>`
      if (!r.hideWhenZero) return rowHtml
      const path = field.replace(/\{\{formatNumber\s+|\{\{|\}\}/g, '').trim().split(/\s/)[0] || r.key
      return `{{#if ${path}}}${rowHtml}{{/if}}`
    })
    .join('')

  const titleBlock =
    table.showTitle && table.label
      ? `<div style="font-size:10pt;font-weight:600;color:#fff;padding:4px 8px;background:${hdr};width:100%;${cellTypo}">${escapeHtml(table.label)}</div>`
      : ''

  const headerBlock = table.showHeader
    ? `<thead><tr style="background:${hdr};color:#fff;"><th style="${cellTypo};text-align:right;font-weight:600;${cellBorder}">${thLabel}</th><th style="${cellTypo};text-align:left;font-weight:600;${cellBorder}">${thValue}</th></tr></thead>`
    : ''

  return `<div style="${baseWrapperStyle}"><div class="print-canvas-totals-table-wrap" data-canvas-totals="1" data-anchor-below-items="${table.anchorBelowItems ? '1' : '0'}" style="width:100%;display:flex;flex-direction:column;align-items:stretch;box-sizing:border-box;overflow:visible;font-family:${pageFontFamily}">${titleBlock}<table class="print-invoice-totals-table print-canvas-totals-table" style="width:100%;border-collapse:collapse;margin:0;table-layout:fixed;${cellTypo}">${headerBlock}<tbody>${bodyRows}</tbody></table></div></div>`
}

export function renderTotalsTablePreview(
  el: CanvasTotalsTableEl,
  accentColor: string,
  pageFontFamily: string,
): {
  headerBg: string
  rows: CanvasTotalsRow[]
  labelColumnTitle: string
  valueColumnTitle: string
  showHeader: boolean
  cellStyle: CSSProperties
  thStyle: CSSProperties
  tdLabelStyle: CSSProperties
  tdValueStyle: CSSProperties
  rowBorderStyle: CSSProperties | undefined
} {
  const table = normalizeTotalsTableElement(el)
  const st = getElementStyle(table)
  const hdr = st.backgroundColor || accentColor
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
    padding: st.paddingPx ? `${st.paddingPx}px` : '8px 12px',
  }

  return {
    headerBg: hdr,
    rows: table.rows.filter((r) => r.visible !== false),
    labelColumnTitle: table.labelColumnTitle ?? 'البيان',
    valueColumnTitle: table.valueColumnTitle ?? 'القيمة',
    showHeader: table.showHeader !== false,
    cellStyle,
    thStyle: { ...cellStyle, ...cellBorderStyle, backgroundColor: hdr, color: '#fff', fontWeight: 600 },
    tdLabelStyle: { ...cellStyle, ...cellBorderStyle, fontWeight: 600, color: '#334155', textAlign: 'right' },
    tdValueStyle: {
      ...cellStyle,
      ...cellBorderStyle,
      fontWeight: 700,
      color: '#0f172a',
      textAlign: 'left',
      direction: 'ltr',
    },
    rowBorderStyle,
  }
}
