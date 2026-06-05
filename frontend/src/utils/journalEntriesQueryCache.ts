import type { QueryClient } from '@tanstack/react-query'
import type { JournalEntry, PaginatedResponse } from '../types'

/** تحديث قيد واحد في كل نسخ القائمة المخبّأة (كل الفلاتر/الصفحات) */
export function patchJournalEntryInListCaches(
  queryClient: QueryClient,
  tenantId: number,
  entryId: number,
  patch: Partial<JournalEntry>,
) {
  queryClient.setQueriesData<PaginatedResponse<JournalEntry>>(
    { queryKey: ['journalEntries', tenantId] },
    (old) => {
      if (!old?.data?.length) return old
      const idx = old.data.findIndex((e) => e.id === entryId)
      if (idx < 0) return old
      const next = [...old.data]
      next[idx] = { ...next[idx], ...patch }
      return { ...old, data: next }
    },
  )
}

export async function refetchJournalEntryLists(queryClient: QueryClient, tenantId: number) {
  await queryClient.refetchQueries({ queryKey: ['journalEntries', tenantId] })
}

export function extractJournalEntryFromApiResponse(res: unknown): JournalEntry | null {
  if (!res || typeof res !== 'object') return null
  if ('entry' in res && res.entry && typeof res.entry === 'object') {
    return res.entry as JournalEntry
  }
  if ('id' in res && 'status' in res) {
    return res as JournalEntry
  }
  return null
}
