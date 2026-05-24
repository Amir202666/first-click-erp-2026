/** مشترك بين كارت الصنف (/items/:id/ledger) وصفحة حركة الصنف (/items/movements) */

export interface MovementRow {
  id: number
  date: string
  type: string
  quantity: number
  quantity_in: number
  quantity_out: number
  unit_cost: number
  total_cost: number
  balance_before: number
  balance_after: number
  notes: string | null
  reference_type?: string | null
  reference_id?: number | null
  source: {
    url: string
    label: string
    view_url?: string
    edit_url?: string
    print_url?: string
    voucher_kind?: string
    voucher_number?: string | null
  }
  created_by_name: string | null
  /** من الخادم: تاريخ ووقت تسجيل الحركة */
  created_at?: string | null
}

export interface ItemLedgerResponse {
  item: {
    id: number
    code: string
    name: string
    unit: string
    current_stock: number
    average_cost: number
    average_selling: number
  }
  movements: MovementRow[]
}

export type InventoryTranslations = {
  voucherKindPurchaseInvoice?: string
  voucherKindSalesInvoice?: string
  voucherKindPurchaseReturn?: string
  voucherKindSalesReturn?: string
  voucherKindOpeningStock?: string
  voucherKindStockTransfer?: string
  voucherKindProductionOrder?: string
  voucherKindManualAdjustment?: string
  voucherKindInventoryAdjustment?: string
  voucherKindInvoice?: string
  voucherKindOther?: string
}

export function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function normalizeLedgerPath(raw: string | undefined | null): string | null {
  const s = String(raw ?? '').trim()
  if (!s || s === '#') return null
  if (s.startsWith('http://') || s.startsWith('https://')) return s
  return s.startsWith('/') ? s : `/${s}`
}

export function ledgerCanOpenPreview(m: MovementRow): boolean {
  if (
    normalizeLedgerPath(m.source?.print_url) ||
    normalizeLedgerPath(m.source?.view_url) ||
    normalizeLedgerPath(m.source?.url)
  ) {
    return true
  }
  const id = m.reference_id
  const n = typeof id === 'number' ? id : Number(id)
  return Number.isFinite(n) && n > 0
}

export function voucherKindLabel(kind: string | undefined, inv: InventoryTranslations): string {
  switch (kind) {
    case 'purchase_invoice':
      return inv.voucherKindPurchaseInvoice ?? 'Purchase invoice'
    case 'sales_invoice':
      return inv.voucherKindSalesInvoice ?? 'Sales invoice'
    case 'purchase_return':
      return inv.voucherKindPurchaseReturn ?? 'Purchase return'
    case 'sales_return':
      return inv.voucherKindSalesReturn ?? 'Sales return'
    case 'opening_stock':
      return inv.voucherKindOpeningStock ?? 'Opening stock'
    case 'stock_transfer':
      return inv.voucherKindStockTransfer ?? 'Stock transfer'
    case 'production_order':
      return inv.voucherKindProductionOrder ?? 'Production order'
    case 'manual_adjustment':
      return inv.voucherKindManualAdjustment ?? 'Manual adjustment'
    case 'inventory_adjustment':
      return inv.voucherKindInventoryAdjustment ?? 'Inventory adjustment'
    case 'invoice':
      return inv.voucherKindInvoice ?? 'Invoice'
    default:
      return inv.voucherKindOther ?? '—'
  }
}

export function ledgerVoucherTypeFromMovement(m: MovementRow, inv: InventoryTranslations): string {
  const k = m.source?.voucher_kind
  if (k && k !== 'other') return voucherKindLabel(k, inv)
  const lb = m.source?.label?.trim()
  if (lb) {
    const i = lb.indexOf(' رقم:')
    if (i > 0) return lb.slice(0, i).trim()
  }
  return voucherKindLabel(undefined, inv)
}

export function ledgerVoucherNumberFromMovement(m: MovementRow): string {
  if (m.source?.voucher_number) return m.source.voucher_number
  const lb = m.source?.label ?? ''
  const mAr = /رقم:\s*(.+)$/.exec(lb)
  if (mAr) return mAr[1].trim()
  return '—'
}

/** للانتقال إلى مصدر الحركة */
export function movementSourceNavigatePath(m: MovementRow): string | null {
  return (
    normalizeLedgerPath(m.source?.view_url) ||
    normalizeLedgerPath(m.source?.url) ||
    normalizeLedgerPath(m.source?.edit_url) ||
    null
  )
}
