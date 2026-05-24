import { useEffect, useRef, useCallback } from 'react'

const SCAN_GAP_MS = 55
const MIN_LENGTH = 4
const CLEAR_MS = 120

/**
 * قارئ الباركود يعمل كلوحة مفاتيح: أحرف سريعة ثم Enter.
 * يتجاهل الإدخال عند التركيز على حقل نصي (ما عدا عند تمرير { always: true }).
 */
export function useBarcodeScanner(
  onScan: (barcode: string) => void,
  options?: { enabled?: boolean; always?: boolean },
) {
  const enabled = options?.enabled !== false
  const always = options?.always === true
  const onScanRef = useRef(onScan)
  const bufferRef = useRef('')
  const lastTsRef = useRef(0)
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  const flushClear = useCallback(() => {
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current)
    clearTimerRef.current = setTimeout(() => {
      bufferRef.current = ''
    }, CLEAR_MS)
  }, [])

  useEffect(() => {
    if (!enabled) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (!always && t) {
        const tag = t.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable) return
      }

      const now = performance.now()
      const gap = now - lastTsRef.current
      lastTsRef.current = now

      if (gap > SCAN_GAP_MS && bufferRef.current.length > 0 && e.key.length === 1) {
        bufferRef.current = ''
      }

      if (e.key === 'Enter') {
        const code = bufferRef.current.trim()
        bufferRef.current = ''
        if (code.length >= MIN_LENGTH) {
          onScanRef.current(code)
        }
        return
      }

      if (e.key.length === 1 && !e.key.match(/[\n\r\t]/)) {
        bufferRef.current += e.key
        flushClear()
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current)
    }
  }, [enabled, always, flushClear])
}
