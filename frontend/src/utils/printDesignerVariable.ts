import type { CanvasElement, CanvasElementLayout, CanvasElementStyle, CanvasTextEl, CanvasVariableEl } from './printDesignerTypes'
import { createCanvasId } from './printDesignerTypes'
import { clampLayoutToContent, nextStackLayoutMm } from './printDesignerLayout'

/** استخراج كود Handlebars فقط من نص قديم مدمج */
export function stripVariableCode(raw: string): string {
  const trimmed = (raw ?? '').trim()
  const match = trimmed.match(/\{\{[\s\S]+?\}\}/)
  return match?.[0] ?? trimmed
}

const TOTAL_PATH_TO_AMOUNT: Record<string, string> = {
  'total.subtotal': 'subtotal',
  'total.discount': 'discount',
  'total.additions': 'additions',
  'total.tax': 'vat_amount',
  'total.net': 'total_amount',
  'total.paid': 'paid',
  'total.balance': 'balance',
}

const AMOUNT_ROOT_KEYS = new Set([
  'subtotal',
  'discount',
  'additions',
  'vat_amount',
  'total_amount',
  'paid',
  'balance',
  'change',
  'price',
  'total',
  'vat',
])

/** يحوّل متغير مبلغ إلى {{formatNumber ...}} بدون رمز عملة */
export function upgradePrintVariableExpression(raw: string): string {
  let code = stripVariableCode(raw).replace(/\s+/g, ' ').trim()
  if (!code) return code

  code = code.replace(/\{\{formatMoney\s+/g, '{{formatNumber ')
  code = code.replace(/\{\{formatNumber ([^}]+)\}\}\s*(?:ر\.س|\{\{currency\}\})/g, '{{formatNumber $1}}')
  code = code.replace(/\s*\{\{currency\}\}/g, '')

  const inner = code.replace(/^\{\{|\}\}$/g, '').trim()
  if (!inner) return code

  if (inner.startsWith('formatNumber ') || inner.startsWith('formatMoney ')) {
    const arg = inner.replace(/^format(?:Number|Money)\s+/, '').trim()
    if (TOTAL_PATH_TO_AMOUNT[arg]) return `{{formatNumber ${TOTAL_PATH_TO_AMOUNT[arg]}}}`
    if (AMOUNT_ROOT_KEYS.has(arg)) return `{{formatNumber ${arg}}}`
    return code.replace(/\{\{formatMoney\s+/g, '{{formatNumber ')
  }

  if (TOTAL_PATH_TO_AMOUNT[inner]) {
    return `{{formatNumber ${TOTAL_PATH_TO_AMOUNT[inner]}}}`
  }

  const path = inner.startsWith('this.') ? inner.slice(5) : inner
  if (AMOUNT_ROOT_KEYS.has(path)) {
    return `{{formatNumber ${path}}}`
  }

  return code
}

function pairRowLayouts(
  contentW: number,
  contentH: number,
  rowY: number,
  rowH: number,
): { labelLayout: CanvasElementLayout; valueLayout: CanvasElementLayout } {
  const gap = 2
  const pad = 2
  const usable = Math.max(40, contentW - pad * 2 - gap)
  const labelW = Math.min(88, usable * 0.48)
  const valueW = Math.min(88, usable * 0.48)
  const valueX = pad
  const labelX = Math.max(pad + valueW + gap, contentW - pad - labelW)
  const valueLayout = clampLayoutToContent({ xMm: valueX, yMm: rowY, wMm: valueW, hMm: rowH }, contentW, contentH)
  const labelLayout = clampLayoutToContent({ xMm: labelX, yMm: rowY, wMm: labelW, hMm: rowH }, contentW, contentH)
  return { labelLayout, valueLayout }
}

const labelBoxStyle: CanvasElementStyle = {
  textAlign: 'right',
  direction: 'rtl',
  fontSize: 11,
  fontWeight: 'normal',
  alignItems: 'center',
  justifyContent: 'flex-end',
  paddingPx: 4,
  borderWidthPx: 1,
  borderStyle: 'solid',
  borderColor: '#cbd5e1',
  backgroundColor: '#ffffff',
}

const valueBoxStyle: CanvasElementStyle = {
  textAlign: 'left',
  direction: 'ltr',
  fontSize: 10,
  alignItems: 'center',
  justifyContent: 'flex-start',
  paddingPx: 4,
  borderWidthPx: 1,
  borderStyle: 'solid',
  borderColor: '#cbd5e1',
  backgroundColor: '#f8fafc',
}

export type LabelValuePair = {
  labelEl: CanvasTextEl
  valueEl: CanvasVariableEl
}

/** عنصران منفصلان: مربع عنوان (يمين) + مربع قيمة/متغير (يسار) — مثل القالب المرجعي */
export function createLabelValuePair(
  label: string,
  code: string,
  contentW: number,
  contentH: number,
  existingElements: CanvasElement[],
  dropMm?: { xMm: number; yMm: number } | null,
): LabelValuePair {
  const varCode = stripVariableCode(code)
  const lab = label.trim() || varCode
  const rowH = 10

  let rowY: number
  let labelLayout: CanvasElementLayout
  let valueLayout: CanvasElementLayout

  if (dropMm) {
    rowY = Math.max(0, dropMm.yMm - rowH / 2)
    const pair = pairRowLayouts(contentW, contentH, rowY, rowH)
    const totalW = pair.valueLayout.wMm + 2 + pair.labelLayout.wMm
    const shift = dropMm.xMm - totalW / 2 - pair.valueLayout.xMm
    valueLayout = clampLayoutToContent(
      { ...pair.valueLayout, xMm: pair.valueLayout.xMm + shift, yMm: rowY },
      contentW,
      contentH,
    )
    labelLayout = clampLayoutToContent(
      { ...pair.labelLayout, xMm: pair.labelLayout.xMm + shift, yMm: rowY },
      contentW,
      contentH,
    )
  } else {
    const stack = nextStackLayoutMm(existingElements, { type: 'text', id: '_', label: '', text: '' }, contentW, contentH)
    rowY = stack.yMm
    const pair = pairRowLayouts(contentW, contentH, rowY, rowH)
    labelLayout = pair.labelLayout
    valueLayout = pair.valueLayout
  }

  return {
    labelEl: {
      id: createCanvasId(),
      type: 'text',
      label: `${lab} · عنوان`,
      text: lab,
      visible: true,
      layout: labelLayout,
      style: { ...labelBoxStyle },
    },
    valueEl: {
      id: createCanvasId(),
      type: 'variable',
      label: lab,
      var: varCode,
      visible: true,
      layout: valueLayout,
      style: { ...valueBoxStyle },
    },
  }
}
