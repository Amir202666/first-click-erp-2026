/** قيم افتراضية عند غياب الإعداد في tenant_settings */
export const DEFAULT_MAX_INSTALLMENTS = 120
export const DEFAULT_MIN_INSTALLMENT_AMOUNT = 0

export function parseMaxInstallmentsCount(settings: unknown): number {
  const v = Number((settings as Record<string, unknown> | null | undefined)?.max_installments_count)
  if (!Number.isFinite(v) || v < 1) return DEFAULT_MAX_INSTALLMENTS
  return Math.min(120, Math.max(1, Math.floor(v)))
}

/** ٠ = لا يوجد حد أدنى (لا يمنع التقسيط) */
export function parseMinInstallmentAmount(settings: unknown): number {
  const v = Number((settings as Record<string, unknown> | null | undefined)?.min_installment_amount)
  if (!Number.isFinite(v) || v < 0) return DEFAULT_MIN_INSTALLMENT_AMOUNT
  return v
}
