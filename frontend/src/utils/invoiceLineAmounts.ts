/** إجمالي السطر قبل الخصم (كمية × سعر الوحدة) */
export function invoiceLineGross(qty: number, unitPrice: number): number {
  const q = Number(qty)
  const p = Number(unitPrice)
  if (!Number.isFinite(q) || !Number.isFinite(p) || q <= 0 || p < 0) return 0
  return Math.round(q * p * 1000) / 1000
}

/**
 * مبلغ خصم السطر الثابت من الـ API: يعتمد discount_amount؛ وإن وُجدت نسبة فقط (بيانات قديمة) يُشتق المكافئ من الإجمالي قبل الخصم.
 */
export function invoiceLineDiscountAmountFromApi(l: {
  quantity?: number | string | null
  unit_price?: number | string | null
  discount_percent?: number | string | null
  discount_amount?: number | string | null
}): number {
  const gross = invoiceLineGross(Number(l.quantity ?? 0), Number(l.unit_price ?? 0))
  const amt = Number(l.discount_amount ?? 0)
  if (amt > 0.000001) {
    return Math.min(Math.max(0, amt), gross)
  }
  const pct = Number(l.discount_percent ?? 0)
  if (pct > 0.0001 && gross > 0.000001) {
    const derived = gross * (Math.min(100, Math.max(0, pct)) / 100)
    return Math.min(gross, Math.round(derived * 1000) / 1000)
  }
  return 0
}

/** صافي السطر قبل الضريبة بعد خصم مبلغ ثابت (لا يتجاوز الإجمالي قبل الخصم) */
export function invoiceLineNetBeforeTax(gross: number, discountAmount: number): number {
  const g = Math.max(0, gross)
  const d = Math.min(Math.max(0, Number(discountAmount) || 0), g)
  return Math.max(0, Math.round((g - d) * 1000) / 1000)
}
