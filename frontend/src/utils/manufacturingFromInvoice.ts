import type { Invoice } from '../types'

/** هل فاتورة المبيعات مرتبطة بتصنيع آلي (قيد / لقطة / العلم) — للواجهة بعد الإنشاء أو العرض */
export function invoiceHasAutoManufacturingDoc(invoice: Invoice | undefined | null): boolean {
  if (!invoice || invoice.type !== 'sales') return false
  if (invoice.auto_manufacturing_applied === true) return true
  if (invoice.manufacturing_journal_entry_id != null && Number(invoice.manufacturing_journal_entry_id) > 0) return true
  const snap = invoice.metadata?.auto_manufacturing_order_snapshot
  return snap != null && typeof snap === 'object'
}

/**
 * معرّف المنتج التام لربط BOM بفاتورة المبيعات:
 * أولاً من لقطة الترحيل (metadata) إن وُجدت، ثم أول بند صنف تصنيعي/تجميع، ثم أول بند بصنف.
 */
export function finishedItemIdForSalesManufacturingBom(invoice: Invoice | undefined | null): number | null {
  if (!invoice?.lines?.length) return null
  const meta = invoice.metadata as Record<string, unknown> | undefined
  const snap = meta?.auto_manufacturing_order_snapshot as Record<string, unknown> | undefined
  const fromSnap = snap?.finished_item_id
  if (typeof fromSnap === 'number' && fromSnap > 0) return fromSnap
  if (typeof fromSnap === 'string' && Number(fromSnap) > 0) return Number(fromSnap)

  const lines = invoice.lines
  const mfgLine = lines.find((l) => {
    const id = l.item_id
    if (!id || Number(l.quantity) <= 0) return false
    const t = l.item?.type
    return t === 'manufacturing' || t === 'assembly'
  })
  if (mfgLine?.item_id) return mfgLine.item_id

  const anyLine = lines.find((l) => l.item_id && Number(l.quantity) > 0)
  return anyLine?.item_id ?? null
}

export function manufacturingFinishedQtyForBom(invoice: Invoice | undefined | null, finishedItemId: number | null): number {
  const lines = invoice?.lines ?? []
  if (!finishedItemId || !lines.length) return 1
  const sum = lines.filter((l) => l.item_id === finishedItemId).reduce((s, l) => s + Number(l.quantity || 0), 0)
  return sum > 0 ? sum : 1
}
