/** Position for payment-method dropdown (portal) — viewport-fixed, anchored to trigger */
export type PaymentMethodMenuRect = {
  left: number
  width: number
  maxHeight: number
  /** فتح للأسفل من الزر */
  top?: number
  /** فتح للأعلى من الزر — يُستخدم bottom بدل top لتثبيت الحافة السفلية للقائمة عند الزر */
  bottom?: number
}

function clampLeft(triggerLeft: number, width: number, vw: number, margin: number): number {
  let left = triggerLeft
  if (left + width > vw - margin) {
    left = Math.max(margin, vw - margin - width)
  }
  if (left < margin) {
    left = margin
  }
  return left
}

export function computePaymentMethodMenuRect(trigger: DOMRect): PaymentMethodMenuRect {
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
  const margin = 8
  const gap = 4
  const maxCap = 320
  const minHeight = 80
  const width = Math.max(trigger.width, 200)

  const spaceAbove = Math.max(0, trigger.top - gap - margin)
  const maxHeight = Math.min(maxCap, Math.max(minHeight, spaceAbove))

  return {
    left: clampLeft(trigger.left, width, vw, margin),
    width,
    maxHeight,
    bottom: vh - trigger.top + gap,
  }
}
