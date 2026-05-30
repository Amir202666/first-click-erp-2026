import type { SearchableSelectOption } from '../components/ui/SearchableSelect'
import type { Account } from '../types'

/** خيارات dropdown الحسابات الأساسية — رقم واسم فقط (يشمل المجموعات) */
export function buildDefaultAccountSelectOptions(accounts: Account[]): SearchableSelectOption[] {
  return accounts.map((a) => ({
    value: a.id,
    label: `${a.code} — ${a.name}`,
    searchText: `${a.code} ${a.name} ${a.name_en ?? ''}`,
  }))
}
