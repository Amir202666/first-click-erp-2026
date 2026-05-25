import * as XLSX from 'xlsx'
import { api } from './client'
import type { CustomerImportRow, ImportResult } from '../types/customerImport'

function tenantHeaders(tenantId: number) {
  return { headers: { 'X-Tenant-ID': tenantId.toString() } }
}

export async function importCustomersBatch(
  tenantId: number,
  payload: {
    customers: CustomerImportRow[]
    parent_account_id: number
    skip_duplicates: boolean
    update_existing: boolean
    import_opening_balance: boolean
  },
): Promise<ImportResult> {
  const { data } = await api.post<ImportResult>('/customers/import', payload, tenantHeaders(tenantId))
  return data
}

export function downloadCustomerImportErrorReport(errors: ImportResult['errorRows']) {
  const rows = errors.map((e) => ({
    'رقم الصف': e.row,
    'اسم العميل': e.name,
    'سبب الخطأ': e.reason,
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'أخطاء الاستيراد')
  XLSX.writeFile(wb, 'تقرير-أخطاء-الاستيراد.xlsx')
}
