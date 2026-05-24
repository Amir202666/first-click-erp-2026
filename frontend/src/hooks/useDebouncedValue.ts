import { useState, useEffect } from 'react'

/** يحدّث القيمة المُرجَعة بعد توقف التغييرات لمدة delay (مناسب لحقول البحث). */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(id)
  }, [value, delayMs])
  return debounced
}
