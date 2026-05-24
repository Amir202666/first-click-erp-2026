/** Position for payment-method dropdown (portal) — avoid clipping near viewport bottom */
export type PaymentMethodMenuRect = {
  top: number
  left: number
  width: number
  maxHeight: number
}

export function computePaymentMethodMenuRect(trigger: DOMRect): PaymentMethodMenuRect {
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
  const margin = 8
  const gap = 6
  const maxCap = 360

  const spaceBelow = Math.max(0, vh - trigger.bottom - gap - margin)
  const spaceAbove = Math.max(0, trigger.top - gap - margin)

  let top: number
  let maxHeight: number

  const preferBelow = spaceBelow >= spaceAbove

  if (preferBelow) {
    top = trigger.bottom + gap
    maxHeight = Math.min(maxCap, spaceBelow)
    if (maxHeight < 120 && spaceAbove > maxHeight) {
      maxHeight = Math.min(maxCap, spaceAbove)
      top = trigger.top - maxHeight - gap
      if (top < margin) {
        top = margin
        maxHeight = Math.min(maxCap, Math.max(0, trigger.top - margin - gap))
      }
    }
  } else {
    maxHeight = Math.min(maxCap, spaceAbove)
    top = trigger.top - maxHeight - gap
    if (top < margin) {
      top = margin
      maxHeight = Math.min(maxCap, Math.max(0, trigger.top - margin - gap))
    }
  }

  const maxAvail = Math.max(0, vh - margin - top)
  maxHeight = Math.min(maxHeight, maxCap, maxAvail)

  let left = trigger.left
  const width = trigger.width
  if (left + width > vw - margin) {
    left = Math.max(margin, vw - margin - width)
  }
  if (left < margin) {
    left = margin
  }

  return { top, left, width, maxHeight }
}
