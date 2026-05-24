import type { PaymentMethod } from '../types'

/** طريقة دفع تُعامل كـ «أقساط» ويشترط وجود مسودة جدول أقساط قبل حفظ الفاتورة. */
export function paymentMethodRequiresInstallmentPlan(pm: PaymentMethod | null | undefined): boolean {
  if (!pm) return false
  const blob = `${pm.name} ${pm.name_en ?? ''}`.toLowerCase()
  return (
    blob.includes('قسط') ||
    blob.includes('اقساط') ||
    blob.includes('أقساط') ||
    blob.includes('installment') ||
    blob.includes('installments')
  )
}
