/** يوحّد استجابة القائمة سواء كانت مصفوفة أو `{ data: T[] }` أو undefined. */
export function asArray<T>(v: T[] | { data?: T[] } | null | undefined): T[] {
  if (v == null) return []
  if (Array.isArray(v)) return v
  if (typeof v === 'object' && 'data' in v && Array.isArray((v as { data: T[] }).data)) {
    return (v as { data: T[] }).data
  }
  return []
}
