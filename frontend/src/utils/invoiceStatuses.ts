import type { Invoice } from '../types'

export function invoiceDocumentStatus(
  inv: Pick<Invoice, 'document_status' | 'status' | 'journal_entry_id'>,
): string {
  if (inv.document_status) return inv.document_status
  if (inv.status === 'cancelled') return 'cancelled'
  if (inv.journal_entry_id) return 'posted'
  return 'draft'
}

export function invoicePaymentStatus(inv: Pick<Invoice, 'payment_status' | 'status'>): string {
  if (inv.payment_status) return inv.payment_status
  if (inv.status === 'cancelled' || inv.status === 'draft') return 'na'
  if (inv.status === 'paid') return 'paid'
  if (inv.status === 'partial') return 'partial'
  if (inv.status === 'overdue') return 'overdue'
  return 'unpaid'
}
