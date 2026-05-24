import type { Payment } from '../types'

export function paymentMethodRelationOf(p: Payment) {
  return p.paymentMethodRelation ?? p.payment_method_relation ?? null
}

/** يدعم مفاتيح Laravel JSON: payment_method_relation و payment_method النصي القديم */
export function paymentMethodLabel(p: Payment, lang: string): string {
  const rel = paymentMethodRelationOf(p)
  if (rel) return lang === 'ar' ? rel.name : (rel.name_en || rel.name)
  const legacy = p.payment_method?.trim()
  return legacy || '—'
}

/** Laravel يضع المستخدم تحت created_by (كائن) عند eager load، أو createdBy إن وُجد */
export function createdByDisplayName(p: Payment, missing: string): string {
  if (p.createdBy?.name) return p.createdBy.name
  const cb = p.created_by
  if (cb && typeof cb === 'object' && typeof (cb as { name?: string }).name === 'string')
    return (cb as { name: string }).name
  return missing
}
