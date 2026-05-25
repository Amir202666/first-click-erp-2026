import * as XLSX from 'xlsx'
import { api } from './client'
import type { VendorImportResult, VendorImportRow } from '../types/vendorImport'

function tenantHeaders(tenantId: number) {
  return { headers: { 'X-Tenant-ID': tenantId.toString() } }
}

export async function importVendorsBatch(
  tenantId: number,
  payload: {
    vendors: VendorImportRow[]
    parent_account_id: number
    skip_duplicates: boolean
    update_existing: boolean
  },
): Promise<VendorImportResult> {
  const { data } = await api.post<VendorImportResult>('/vendors/import', payload, tenantHeaders(tenantId))
  return data
}

export function downloadVendorImportErrorReport(errors: VendorImportResult['errorRows']) {
  const rows = errors.map((e) => ({
    'رقم الصف': e.row,
    'اسم المورد': e.name,
    'سبب الخطأ': e.reason,
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'أخطاء الاستيراد')
  XLSX.writeFile(wb, 'تقرير-أخطاء-استيراد-الموردين.xlsx')
}
