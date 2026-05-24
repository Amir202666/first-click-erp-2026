import { useRef, useCallback } from 'react'

/** ضغط مطوّل للمس (بديل النقر بالزر الأيمن على الشاشات اللمسية). */
export function useLongPress(onLongPress: () => void, ms = 600) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const start = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      onLongPress()
    }, ms)
  }, [onLongPress, ms])

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  return {
    onTouchStart: start,
    onTouchEnd: cancel,
    onTouchCancel: cancel,
  }
}
