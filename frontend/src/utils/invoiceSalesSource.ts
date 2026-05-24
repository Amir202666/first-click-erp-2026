import type { Invoice } from '../types'
import { isPosInvoice } from './printTemplateInvoiceContext'

export type SalesInvoiceSource = 'regular' | 'pos' | 'restaurant'

export function isRestaurantInvoice(
  inv: Invoice | null | undefined,
): boolean {
  if (!inv) return false
  const anyInv = inv as Invoice & { is_restaurant?: boolean | number }
  if (anyInv.is_restaurant === true || anyInv.is_restaurant === 1) return true
  if (inv.table_id != null && Number(inv.table_id) > 0) return true
  return inv.order_type === 'dine_in'
}

/** مصدر فاتورة المبيعات: عادي / نقطة بيع / مطعم */
export function salesInvoiceSource(inv: Invoice): SalesInvoiceSource {
  if (isRestaurantInvoice(inv)) return 'restaurant'
  if (isPosInvoice(inv)) return 'pos'
  const legacy = inv as Invoice & { is_pos?: boolean | number }
  if (legacy.is_pos === true || legacy.is_pos === 1) return 'pos'
  return 'regular'
}
