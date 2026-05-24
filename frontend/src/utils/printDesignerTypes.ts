/** عناصر لوحة تصميم قالب الطباعة — تُحفظ نسخة JSON في settings.canvas_elements وتُولَّد منها html_content */

/** موضع وحجم العنصر داخل منطقة المحتوى (بعد الهوامش)، بالمليمتر — أصل أعلى-يسار */
export type CanvasElementLayout = {
  xMm: number
  yMm: number
  wMm: number
  hMm: number
}

export type CanvasAlignItems = 'flex-start' | 'center' | 'flex-end' | 'stretch'
export type CanvasJustifyContent = 'flex-start' | 'center' | 'flex-end'
export type CanvasBorderStyle = 'none' | 'solid' | 'dashed'

export type CanvasElementStyle = {
  fontFamily?: string
  fontSize?: number
  fontWeight?: 'normal' | 'bold'
  fontStyle?: 'normal' | 'italic'
  textDecoration?: 'none' | 'underline'
  color?: string
  colorTransparent?: boolean
  textAlign?: 'right' | 'center' | 'left'
  direction?: 'rtl' | 'ltr'
  lineHeight?: number
  lineHeightPt?: number
  alignItems?: CanvasAlignItems
  justifyContent?: CanvasJustifyContent
  paddingPx?: number
  borderRadiusPx?: number
  backgroundColor?: string
  backgroundTransparent?: boolean
  borderColor?: string
  borderTransparent?: boolean
  borderWidthPx?: number
  borderStyle?: CanvasBorderStyle
  opacity?: number
}

export type CanvasElementBase = {
  id: string
  layout?: CanvasElementLayout
  visible?: boolean
  locked?: boolean
  style?: CanvasElementStyle
}

export type CanvasVariableEl = CanvasElementBase & {
  type: 'variable'
  label: string
  var: string
}

export type CanvasTextEl = CanvasElementBase & {
  type: 'text'
  label: string
  text: string
}

export type CanvasDividerEl = CanvasElementBase & { type: 'divider'; label?: string }

export type CanvasSpacerEl = CanvasElementBase & {
  type: 'spacer'
  label?: string
  heightMm: number
}

export type CanvasBoxEl = CanvasElementBase & {
  type: 'box'
  label?: string
  minHeightMm?: number
}

export type CanvasTableColumn = {
  key: string
  label: string
  field?: string
  widthPercent?: number
  align?: 'right' | 'center' | 'left'
}

export type CanvasTableEl = CanvasElementBase & {
  type: 'table'
  label: string
  columns?: CanvasTableColumn[]
  /** إظهار عنوان الجدول فوق الرأس */
  showTitle?: boolean
}

export type CanvasTotalsRow = {
  key: string
  label: string
  field: string
  visible?: boolean
  /** إخفاء السطر عند الطباعة إذا كانت القيمة صفراً (يتطلب متغيراً في القالب) */
  hideWhenZero?: boolean
}

/** جدول الإجماليات — يُضبط من مصمم القوالب ويُوضَع أسفل جدول الأصناف */
export type CanvasTotalsTableEl = CanvasElementBase & {
  type: 'totals_table'
  label: string
  rows?: CanvasTotalsRow[]
  labelColumnTitle?: string
  valueColumnTitle?: string
  showHeader?: boolean
  /** عند true يُثبَّت أسفل جدول الأصناف تلقائياً عند الطباعة والمعاينة */
  anchorBelowItems?: boolean
  showTitle?: boolean
}

export type CanvasImageEl = CanvasElementBase & {
  type: 'image'
  label: string
  src: string
}

export type CanvasQrEl = CanvasElementBase & { type: 'qr'; label?: string }

export type CanvasBarcodeEl = CanvasElementBase & { type: 'barcode'; label?: string }

export type CanvasHtmlEmbedEl = CanvasElementBase & {
  type: 'html_embed'
  label?: string
  html: string
}

export type CanvasElement =
  | CanvasVariableEl
  | CanvasTextEl
  | CanvasDividerEl
  | CanvasSpacerEl
  | CanvasBoxEl
  | CanvasTableEl
  | CanvasTotalsTableEl
  | CanvasImageEl
  | CanvasQrEl
  | CanvasBarcodeEl
  | CanvasHtmlEmbedEl

export function createCanvasId(): string {
  return `ce-${Math.random().toString(36).slice(2, 10)}`
}
