import * as XLSX from 'xlsx'
import { api } from './client'
import type { ItemImportResult, ItemImportRow, ItemImportSettings } from '../types/itemImport'

function tenantHeaders(tenantId: number) {
  return { headers: { 'X-Tenant-ID': tenantId.toString() } }
}

export async function importItemsBatch(
  tenantId: number,
  payload: {
    items: ItemImportRow[]
    settings: ItemImportSettings
  },
): Promise<ItemImportResult> {
  const { data } = await api.post<ItemImportResult>(
    '/items/import',
    {
      items: payload.items,
      settings: {
        skip_duplicates: payload.settings.skipDuplicates,
        update_existing: payload.settings.updateExisting,
        create_categories: payload.settings.createCategories,
        create_units: payload.settings.createUnits,
      },
    },
    tenantHeaders(tenantId),
  )
  return data
}

export function downloadItemImportErrorReport(errors: ItemImportResult['errorRows']) {
  const rows = errors.map((e) => ({
    'رقم الصف': e.row,
    'اسم الصنف': e.name,
    'سبب الخطأ': e.reason,
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'أخطاء الاستيراد')
  XLSX.writeFile(wb, 'تقرير-أخطاء-استيراد-الأصناف.xlsx')
}
