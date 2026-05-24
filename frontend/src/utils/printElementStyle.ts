import type { CSSProperties } from 'react'
import type { CanvasElement, CanvasElementStyle } from './printDesignerTypes'

export type { CanvasElementStyle }

export const DEFAULT_ELEMENT_STYLE: CanvasElementStyle = {
  fontSize: 10,
  fontWeight: 'normal',
  fontStyle: 'normal',
  textDecoration: 'none',
  color: '#0f172a',
  textAlign: 'right',
  direction: 'rtl',
  lineHeight: 1.35,
  alignItems: 'center',
  justifyContent: 'center',
  paddingPx: 0,
  borderRadiusPx: 0,
  borderWidthPx: 0,
  borderStyle: 'none',
  borderColor: '#334155',
}

const DEFAULT_BORDER_COLOR = '#334155'

export type ResolvedElementBorder = {
  css: string
  color: string
  widthPx: number
  line: 'solid' | 'dashed'
}

/** يطبّق لون/نمط افتراضي عند تفعيل عرض الحدود دون لون محفوظ */
function normalizeBorderStyle(style: CanvasElementStyle): CanvasElementStyle {
  const widthPx = style.borderWidthPx ?? 0
  if (widthPx <= 0 || style.borderTransparent) return style
  const line = style.borderStyle === 'dashed' ? 'dashed' : 'solid'
  return {
    ...style,
    borderColor: style.borderColor?.trim() || DEFAULT_BORDER_COLOR,
    borderStyle: line,
  }
}

export function resolveElementBorder(style: CanvasElementStyle): ResolvedElementBorder | null {
  const normalized = normalizeBorderStyle(style)
  const widthPx = normalized.borderWidthPx ?? 0
  if (widthPx <= 0 || normalized.borderTransparent || normalized.borderStyle === 'none') return null
  const color = normalized.borderColor?.trim() || DEFAULT_BORDER_COLOR
  const line: 'solid' | 'dashed' = normalized.borderStyle === 'dashed' ? 'dashed' : 'solid'
  return { css: `${widthPx}px ${line} ${color}`, color, widthPx, line }
}

export function getElementStyle(el: CanvasElement): CanvasElementStyle {
  return normalizeBorderStyle({ ...DEFAULT_ELEMENT_STYLE, ...el.style })
}

export function patchElementStyle(el: CanvasElement, patch: Partial<CanvasElementStyle>): CanvasElement {
  return { ...el, style: normalizeBorderStyle({ ...getElementStyle(el), ...patch }) } as CanvasElement
}

export function elementStyleToCss(
  style: CanvasElementStyle,
  inherit?: { fontFamily?: string },
  opts?: { fillHeight?: boolean },
): string {
  const parts: string[] = ['margin:0', 'box-sizing:border-box', 'width:100%']
  if (opts?.fillHeight !== false) parts.push('height:100%')
  if (style.fontFamily || inherit?.fontFamily) parts.push(`font-family:${style.fontFamily || inherit?.fontFamily}`)
  if (style.fontSize) parts.push(`font-size:${style.fontSize}pt`)
  if (style.fontWeight === 'bold') parts.push('font-weight:700')
  if (style.fontStyle === 'italic') parts.push('font-style:italic')
  if (style.textDecoration === 'underline') parts.push('text-decoration:underline')
  if (!style.colorTransparent && style.color) parts.push(`color:${style.color}`)
  if (style.textAlign) parts.push(`text-align:${style.textAlign}`)
  if (style.direction) parts.push(`direction:${style.direction}`)
  if (style.lineHeightPt) parts.push(`line-height:${style.lineHeightPt}pt`)
  else if (style.lineHeight) parts.push(`line-height:${style.lineHeight}`)
  if (!style.backgroundTransparent && style.backgroundColor) parts.push(`background-color:${style.backgroundColor}`)
  const border = resolveElementBorder(style)
  if (border) parts.push(`border:${border.css}`)
  if (style.borderRadiusPx) parts.push(`border-radius:${style.borderRadiusPx}px`)
  if (style.paddingPx) parts.push(`padding:${style.paddingPx}px`)
  if (style.alignItems || style.justifyContent) {
    parts.push('display:flex', 'flex-direction:column')
    parts.push(`align-items:${style.alignItems ?? 'stretch'}`)
    parts.push(`justify-content:${style.justifyContent ?? 'flex-start'}`)
  }
  if (style.opacity !== undefined) parts.push(`opacity:${style.opacity}`)
  return parts.join(';')
}

export function isTextLikeElement(el: CanvasElement): boolean {
  return el.type === 'text' || el.type === 'variable'
}

/** عناصر تملأ صندوق الموضع بالكامل (جدول، صورة، …) */
export function isBlockFillElement(el: CanvasElement): boolean {
  return (
    el.type === 'table' ||
    el.type === 'totals_table' ||
    el.type === 'box' ||
    el.type === 'image' ||
    el.type === 'divider' ||
    el.type === 'spacer' ||
    el.type === 'qr' ||
    el.type === 'barcode' ||
    el.type === 'html_embed'
  )
}

export function elementStyleToReact(
  style: CanvasElementStyle,
  pageFontFamily: string,
  el?: CanvasElement,
): CSSProperties {
  const blockFill = el ? isBlockFillElement(el) : false
  const resolvedBorder = resolveElementBorder(style)

  const isTable = el?.type === 'table' || el?.type === 'totals_table'

  return {
    margin: 0,
    boxSizing: 'border-box',
    width: '100%',
    height: isTable ? 'auto' : '100%',
    overflow: isTable ? 'visible' : 'auto',
    display: 'flex',
    flexDirection: 'column',
    alignItems: blockFill ? 'stretch' : (style.alignItems ?? 'center'),
    justifyContent: blockFill ? 'flex-start' : (style.justifyContent ?? 'center'),
    fontFamily: style.fontFamily || pageFontFamily,
    fontSize: style.fontSize ? `${style.fontSize}pt` : undefined,
    fontWeight: style.fontWeight === 'bold' ? 700 : undefined,
    fontStyle: style.fontStyle === 'italic' ? 'italic' : undefined,
    textDecoration: style.textDecoration === 'underline' ? 'underline' : undefined,
    color: style.colorTransparent ? 'transparent' : style.color,
    textAlign: style.textAlign,
    direction: style.direction,
    lineHeight: style.lineHeightPt ? `${style.lineHeightPt}pt` : style.lineHeight,
    backgroundColor: style.backgroundTransparent ? 'transparent' : style.backgroundColor,
    border: resolvedBorder?.css,
    borderRadius: style.borderRadiusPx ? `${style.borderRadiusPx}px` : undefined,
    padding: style.paddingPx ? `${style.paddingPx}px` : undefined,
  }
}
