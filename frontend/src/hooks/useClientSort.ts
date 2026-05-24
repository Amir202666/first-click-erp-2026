import { useMemo, useState, useCallback } from 'react'

export type SortDirection = 'asc' | 'desc'

export type SortType = 'string' | 'number' | 'date'

export type SortState<K extends string> = {
  key: K
  direction: SortDirection
} | null

export type SortColumn<T, K extends string> = {
  key: K
  type: SortType
  /** Return the raw value used for sorting (string/number/date-like). */
  getValue: (row: T) => unknown
}

function toNumber(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v).trim()
  if (!s) return null
  const n = Number(s.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

function toDateMs(v: unknown): number | null {
  if (v == null) return null
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.getTime() : null
  const s = String(v).trim()
  if (!s) return null
  const ms = Date.parse(s)
  return Number.isFinite(ms) ? ms : null
}

export function useClientSort<T, K extends string>(
  rows: T[],
  columns: SortColumn<T, K>[],
  opts?: { locale?: string }
) {
  const [sort, setSort] = useState<SortState<K>>(null)
  const locale = opts?.locale ?? undefined
  const collator = useMemo(
    () => new Intl.Collator(locale, { numeric: true, sensitivity: 'base' }),
    [locale]
  )

  const toggleSort = useCallback((key: K) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, direction: 'asc' }
      if (prev.direction === 'asc') return { key, direction: 'desc' }
      return null
    })
  }, [])

  const sortedRows = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort.key)
    if (!col) return rows
    const dir = sort.direction === 'asc' ? 1 : -1

    const decorated = rows.map((row, idx) => ({ row, idx }))
    decorated.sort((a, b) => {
      const av = col.getValue(a.row)
      const bv = col.getValue(b.row)

      // Nulls always last
      if (av == null && bv == null) return a.idx - b.idx
      if (av == null) return 1
      if (bv == null) return -1

      let cmp = 0
      if (col.type === 'number') {
        const an = toNumber(av)
        const bn = toNumber(bv)
        if (an == null && bn == null) cmp = 0
        else if (an == null) cmp = 1
        else if (bn == null) cmp = -1
        else cmp = an - bn
      } else if (col.type === 'date') {
        const ad = toDateMs(av)
        const bd = toDateMs(bv)
        if (ad == null && bd == null) cmp = 0
        else if (ad == null) cmp = 1
        else if (bd == null) cmp = -1
        else cmp = ad - bd
      } else {
        cmp = collator.compare(String(av), String(bv))
      }

      if (cmp === 0) return a.idx - b.idx
      return cmp * dir
    })

    return decorated.map((d) => d.row)
  }, [rows, sort, columns, collator])

  return { sort, setSort, toggleSort, sortedRows }
}

