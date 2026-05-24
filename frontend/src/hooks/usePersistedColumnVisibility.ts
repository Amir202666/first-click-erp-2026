import { useState, useEffect, type Dispatch, type SetStateAction } from 'react'

function mergeColumnVisibility<K extends string>(
  keys: readonly K[],
  parsed: Record<string, unknown> | null,
): Record<K, boolean> {
  return keys.reduce((acc, k) => {
    const v = parsed?.[k]
    acc[k] = typeof v === 'boolean' ? v : true
    return acc
  }, {} as Record<K, boolean>)
}

/**
 * يحفظ إظهار/إخفاء أعمدة الجدول في localStorage ويستعيدها عند فتح الصفحة.
 * يجب أن يكون storageKey فريداً لكل شاشة.
 */
export function usePersistedColumnVisibility<K extends string>(
  storageKey: string,
  columnKeys: readonly K[],
): [Record<K, boolean>, Dispatch<SetStateAction<Record<K, boolean>>>] {
  const [visibleColumns, setVisibleColumns] = useState<Record<K, boolean>>(() => {
    try {
      if (typeof window === 'undefined') return mergeColumnVisibility(columnKeys, null)
      const raw = window.localStorage.getItem(storageKey)
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>
        return mergeColumnVisibility(columnKeys, parsed)
      }
    } catch {
      /* ignore */
    }
    return mergeColumnVisibility(columnKeys, null)
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(visibleColumns))
    } catch {
      /* ignore */
    }
  }, [storageKey, visibleColumns])

  return [visibleColumns, setVisibleColumns]
}
