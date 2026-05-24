/**
 * تحويل بيانات التصميم (TemplateDesignData) إلى HTML/CSS جاهز للطباعة
 */

import type {
  TemplateDesignData,
  DesignElement,
  VariableElement,
  TextElement,
  TableElement,
  FontSettings,
  ElementBoxStyle,
} from '../types/templateDesign'

function fontToCss(font: FontSettings): string {
  const lineHeight = font.lineHeightPt != null ? `line-height: ${font.lineHeightPt}pt;` : ''
  const letterSpacing = font.letterSpacingPt != null ? `letter-spacing: ${font.letterSpacingPt}pt;` : ''
  const italic = font.italic ? 'font-style: italic;' : ''
  const underline = font.underline ? 'text-decoration: underline;' : ''
  return `font-family: ${font.family}; font-size: ${font.sizePt}pt; color: ${font.color}; font-weight: 400; ${italic} ${underline} ${lineHeight} ${letterSpacing}`
}

function boxStyleToCss(s: Partial<ElementBoxStyle> | undefined): string {
  const st = s ?? {}
  const parts: string[] = []
  if (st.paddingMm != null) parts.push(`padding: ${st.paddingMm}mm;`)
  if (st.borderRadiusMm != null) parts.push(`border-radius: ${st.borderRadiusMm}mm;`)
  if (st.backgroundColor != null && !st.backgroundTransparent) parts.push(`background-color: ${st.backgroundColor};`)
  if (st.borderWidthMm != null && st.borderStyle && st.borderStyle !== 'none') {
    const color = st.borderTransparent ? 'transparent' : (st.borderColor ?? '#ddd')
    parts.push(`border: ${st.borderWidthMm}mm ${st.borderStyle} ${color};`)
  }
  // نفس الافتراضات المستخدمة في المصمم حتى تتطابق المحاذاة في عرض الفاتورة
  parts.push(`text-align: ${st.textAlign ?? 'right'};`)
  parts.push(`direction: ${st.direction ?? 'rtl'};`)
  parts.push(`align-items: ${st.alignItems ?? 'center'};`)
  parts.push(`justify-content: ${st.justifyContent ?? 'center'};`)
  return parts.join(' ')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** تحويل مفتاح المتغير إلى placeholder للاستبدال لاحقاً */
function variableKeyToPlaceholder(key: string): string {
  const map: Record<string, string> = {
    'company.name': '{{company.name}}',
    'company.address': '{{company.address}}',
    'company.phone': '{{company.phone}}',
    'company.email': '{{company.email}}',
    'company.tax_number': '{{company.tax_number}}',
    'invoice.number': '{{invoice.number}}',
    'invoice.date': '{{invoice.date}}',
    'invoice.due_date': '{{invoice.due_date}}',
    'invoice.type_label': '{{invoice.type_label}}',
    'invoice.notes': '{{invoice.notes}}',
    'invoice.payment_method': '{{invoice.payment_method}}',
    'customer.name': '{{customer.name}}',
    'customer.phone': '{{customer.phone}}',
    'customer.address': '{{customer.address}}',
    'customer.tax_number': '{{customer.tax_number}}',
    'subtotal': '{{subtotal}}',
    'tax_amount': '{{tax_amount}}',
    'discount_amount': '{{discount_amount}}',
    'total': '{{total}}',
    'amount_paid': '{{amount_paid}}',
    'balance': '{{balance}}',
    'total_in_words': '{{total_in_words}}',
    'qr_code': '{{qr_code}}',
    'ref_num_barcode': '{{ref_num_barcode}}',
    'ref_num_qrcode': '{{ref_num_qrcode}}',
    'warehouse.name': '{{warehouse.name}}',
    'terms': '{{terms}}',
    'current_date': '{{current_date}}',
    'page_number': '{{page_number}}',
  }
  return map[key] ?? `{{${key}}}`
}

function elementToHtml(el: DesignElement, globalFont: FontSettings): string {
  const f = el.font ? { ...globalFont, ...el.font } : globalFont
  const box = boxStyleToCss(el.style)
  const zIdx = el.zIndex != null ? `z-index: ${el.zIndex};` : ''
  const style = `position: absolute; left: ${el.xMm}mm; top: ${el.yMm}mm; ${el.widthMm != null ? `width: ${el.widthMm}mm;` : ''} ${el.heightMm != null ? `height: ${el.heightMm}mm;` : ''} ${box} ${fontToCss(f)} display: flex; flex-direction: column; box-sizing: border-box; ${zIdx}`

  switch (el.type) {
    case 'variable': {
      const v = el as VariableElement
      const placeholder = variableKeyToPlaceholder(v.variableKey)
      if (v.variableKey === 'qr_code' || v.variableKey === 'ref_num_qrcode' || v.variableKey === 'ref_num_barcode') {
        return `<div class="el-${el.id}" style="${style}"><img src="${placeholder}" alt="${v.variableKey}" style="max-width:100%;height:auto;" /></div>`
      }
      return `<div class="el-${el.id}" style="${style}">${placeholder}</div>`
    }
    case 'text': {
      const t = el as TextElement
      // السماح بالمتغيرات المُضمّنة داخل النص: {{variable.key}}
      const inlined = t.content.split(/(\{\{[^}]+\}\})/).map((part) => {
        if (/^\{\{.+\}\}$/.test(part)) return part // placeholder — لا نهرِّب
        return escapeHtml(part)
      }).join('')
      return `<div class="el-${el.id}" style="${style}">${inlined}</div>`
    }
    case 'table': {
      const tb = el as TableElement
      const w = el.widthMm ?? 180
      const hs = tb.headerStyle ?? {}
      const bs = tb.bodyStyle ?? {}
      const headerBg = hs.backgroundColor ?? '#f1f5f9'
      const headerColor = hs.color ?? '#1e293b'
      const headerBold = 'font-weight:400;'
      const headerFontSize = hs.fontSizePt ? `font-size:${hs.fontSizePt}pt;` : ''
      const headerHeight = hs.heightMm ? `height:${hs.heightMm}mm;` : ''
      const borderColor = hs.borderColor ?? bs.borderColor ?? '#ddd'
      const borderWidth = hs.borderWidthMm ?? bs.borderWidthMm ?? 0.3
      const stripedColor = bs.stripedColor ?? ''
      const stripedCss = stripedColor ? `\n.el-${el.id} tbody tr:nth-child(even) { background-color: ${stripedColor}; }` : ''
      // يُستبدل {{products}} في الطباعة بجدول الأصناف الكامل
      const cellAlign = el.style?.textAlign ?? 'right'
      return `<style>.el-${el.id} table { border-collapse:collapse; width:100%; } .el-${el.id} th { background:${headerBg}; color:${headerColor}; ${headerBold} ${headerFontSize} ${headerHeight} vertical-align:middle; padding:4px 6px; text-align:${cellAlign} !important; border:${borderWidth}mm solid ${borderColor}; } .el-${el.id} td { padding:4px 6px; text-align:${cellAlign} !important; border:${borderWidth}mm solid ${borderColor}; }${stripedCss}</style><div class="el-${el.id}" style="${style} width:${w}mm;">{{products}}</div>`
    }
    case 'image':
      return `<div class="el-${el.id}" style="${style}"><img src="${(el as any).src}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;" /></div>`
    case 'line': {
      const l = el as any
      if (l.horizontal) {
        return `<div class="el-${el.id}" style="position:absolute;left:${el.xMm}mm;top:${el.yMm}mm;width:${el.widthMm ?? 100}mm;height:${l.thicknessMm}mm;background:${l.color}; ${zIdx}"></div>`
      }
      return `<div class="el-${el.id}" style="position:absolute;left:${el.xMm}mm;top:${el.yMm}mm;width:${l.thicknessMm}mm;height:${el.heightMm ?? 50}mm;background:${l.color}; ${zIdx}"></div>`
    }
    case 'spacer':
      return `<div class="el-${el.id}" style="position:absolute;left:${el.xMm}mm;top:${el.yMm}mm;height:${(el as any).heightMm}mm; ${zIdx}"></div>`
    case 'rectangle': {
      return `<div class="el-${el.id}" style="${style}"></div>`
    }
    default:
      return ''
  }
}

/**
 * توليد HTML كامل من التصميم + CSS الصفحة
 */
export function templateDesignToHtml(data: TemplateDesignData): string {
  const { page, globalFont, elements, logo, frame } = data
  const contentWidth = page.widthMm - page.marginLeftMm - page.marginRightMm
  const contentHeight = page.heightMm - page.marginTopMm - page.marginBottomMm

  const defaultLineHeight = globalFont.lineHeightPt != null ? `${globalFont.lineHeightPt}pt` : '1.2'
  const css = `
.invoice-page { 
  width: ${page.widthMm}mm; 
  min-height: ${page.heightMm}mm; 
  padding: ${page.marginTopMm}mm ${page.marginRightMm}mm ${page.marginBottomMm}mm ${page.marginLeftMm}mm; 
  box-sizing: border-box;
  font-family: ${globalFont.family};
  font-size: ${globalFont.sizePt}pt;
  line-height: ${defaultLineHeight};
  color: ${globalFont.color};
  direction: rtl;
  position: relative;
  ${frame.enabled ? `border: ${frame.borderWidthMm}mm solid ${frame.borderColor};` : ''}
}
.invoice-content { position: relative; width: ${contentWidth}mm; min-height: ${contentHeight}mm; }
@media print { .invoice-page { box-shadow: none; margin: 0; } }
`

  const parts: string[] = []

  if (logo.enabled) {
    const src = logo.url && logo.url !== '' ? logo.url : '{{logo}}'
    parts.push(`<div class="template-logo" style="position:absolute;left:${logo.xMm}mm;top:${logo.yMm}mm;width:${logo.widthMm}mm;height:${logo.heightMm}mm;"><img src="${src}" alt="شعار" style="max-width:100%;max-height:100%;object-fit:contain;" /></div>`)
  }

  elements.forEach((el) => {
    const html = elementToHtml(el, globalFont)
    if (html) parts.push(html)
  })

  return `<style>${css}</style><div class="invoice-page"><div class="invoice-content">${parts.join('')}</div></div>`
}

/**
 * توليد صفوف جدول المنتجات حسب أعمدة القالب (للاستبدال في الطباعة)
 */
export function getProductsTableRowTemplate(columns: { key: string; label: string }[]): string {
  const placeholders: Record<string, string> = {
    description: '{{item.description}}',
    quantity: '{{item.quantity}}',
    unit_price: '{{item.unit_price}}',
    discount: '{{item.discount}}',
    tax: '{{item.tax}}',
    total: '{{item.total}}',
  }
  const tds = columns.map((c) => `<td style="padding:6px;text-align:right;border:1px solid #ddd;">${placeholders[c.key] ?? ''}</td>`).join('')
  return `<tr>${tds}</tr>`
}
