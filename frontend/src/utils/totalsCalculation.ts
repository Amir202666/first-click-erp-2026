/**
 * مصدر واحد لمنطق الضريبة والإجماليات:
 * الضريبة 15% تُحسب على الوعاء الضريبي (المجموع − الخصم) فقط، وليس على المجموع الأصلي.
 * يُستخدم في: الفواتير (إنشاء/تعديل)، طلبات الشراء، نقطة البيع، والمرتجعات (عبر إنشاء فاتورة مرتجع).
 */

export const TAX_RATE_DEFAULT = 0.15

export type DiscountType = 'percentage' | 'amount'

/** نتيجة المعالجة (قيم منسقة إلى 3 منازل) */
export interface ProcessInvoiceTotalsResult {
  subtotal: string
  discount: string
  taxable: string
  tax: string
  total: string
}

export interface TotalsResult {
  subtotal: number
  discountAmount: number
  taxableAmount: number
  taxValue: number
  grandTotal: number
}

/**
 * دالة المعالجة الضريبية والحسابية النهائية — الإصلاح الجذري.
 * تضمن تحديث كافة الأرقام فور كتابة أي رقم في خانة الخصم، مع تحويل آمن للمدخلات.
 */
export function processInvoiceTotals(
  subtotal: number | string,
  discountInput: number | string,
  discountType: DiscountType,
  taxRate: number = 0.15
): ProcessInvoiceTotalsResult {
  // 1. تحويل المدخلات لأرقام لضمان عدم حدوث أخطاء نصية
  const rawSubtotal = parseFloat(String(subtotal)) || 0
  const rawDiscount = parseFloat(String(discountInput)) || 0

  // 2. حساب قيمة الخصم الحقيقية (نسبة أو مبلغ)
  const discountAmount =
    discountType === 'percentage'
      ? rawSubtotal * (rawDiscount / 100)
      : rawDiscount

  // 3. حساب الوعاء الضريبي (صافي المبلغ الذي ستُحسب عليه الضريبة)
  const taxableAmount = Math.max(0, rawSubtotal - discountAmount)

  // 4. حساب قيمة الضريبة بناءً على الوعاء بعد الخصم
  const taxValue = taxableAmount * taxRate

  // 5. الصافي النهائي
  const finalTotal = taxableAmount + taxValue

  return {
    subtotal: rawSubtotal.toFixed(3),
    discount: discountAmount.toFixed(3),
    taxable: taxableAmount.toFixed(3),
    tax: taxValue.toFixed(3),
    total: finalTotal.toFixed(3),
  }
}

/**
 * يطبق نفس منطق processInvoiceTotals على أرقام مضمونة (للاستخدام الداخلي).
 */
export function calculateInvoice(
  subtotal: number,
  discountVal: number,
  discountType: DiscountType,
  taxRate: number = 0.15
): ProcessInvoiceTotalsResult {
  return processInvoiceTotals(subtotal, discountVal, discountType, taxRate)
}

/**
 * نفس منطق calculateInvoice مع إرجاع أرقام للاستخدام في الـ payload والعرض مع formatAmount.
 */
export function updateInvoiceTotals(
  subtotal: number,
  discountValue: number,
  discountType: DiscountType,
  taxRate: number = TAX_RATE_DEFAULT
): TotalsResult {
  const r = calculateInvoice(subtotal, discountValue, discountType, taxRate)
  return {
    subtotal: Number(r.subtotal),
    discountAmount: Number(r.discount),
    taxableAmount: Number(r.taxable),
    taxValue: Number(r.tax),
    grandTotal: Number(r.total),
  }
}

/**
 * حساب الإجماليات من مصفوفة بنود + خصم — يستخدم calculateInvoice داخلياً.
 */
export function calculateTotals(
  items: { quantity: number; price?: number; unit_price?: number }[],
  discountValue: number,
  discountType: DiscountType,
  taxRate: number = TAX_RATE_DEFAULT
): TotalsResult {
  const priceKey = (i: { price?: number; unit_price?: number }) =>
    typeof (i as { price?: number }).price === 'number' ? (i as { price: number }).price : (i as { unit_price: number }).unit_price
  const subtotal = items.reduce((acc, item) => acc + item.quantity * (priceKey(item) || 0), 0)
  const r = calculateInvoice(subtotal, discountValue, discountType, taxRate)
  return {
    subtotal: Number(r.subtotal),
    discountAmount: Number(r.discount),
    taxableAmount: Number(r.taxable),
    taxValue: Number(r.tax),
    grandTotal: Number(r.total),
  }
}

/**
 * نفس منطق calculateInvoice عندما يكون إجمالي الخصم معروفاً (فواتير: خصم بنود + خصم مجموعة).
 * استدعاء: calculateInvoice(subtotal, totalDiscountAmount, 'amount')
 */
export function calculateTotalsFromAmounts(
  subtotal: number,
  totalDiscountAmount: number,
  taxRate: number = TAX_RATE_DEFAULT
): TotalsResult {
  const discountVal = Math.min(totalDiscountAmount, subtotal)
  const r = calculateInvoice(subtotal, discountVal, 'amount', taxRate)
  return {
    subtotal: Number(r.subtotal),
    discountAmount: Number(r.discount),
    taxableAmount: Number(r.taxable),
    taxValue: Number(r.tax),
    grandTotal: Number(r.total),
  }
}
