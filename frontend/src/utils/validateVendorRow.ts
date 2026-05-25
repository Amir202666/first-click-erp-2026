import type { VendorFieldMapping, VendorImportRow } from '../types/vendorImport'

function normHeader(s: string): string {
  return s
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/\*/g, '')
}

const HEADER_SYNONYMS: Record<string, string[]> = {
  name: ['name', 'vendor_name', 'اسم_المورد', 'اسم', 'vendorname', 'اسم المورد'],
  name_en: ['name_en', 'english_name', 'الاسم_بالإنجليزية', 'name english'],
  company_name: ['company', 'company_name', 'اسم_الشركة', 'اسم الشركة'],
  tax_number: ['tax', 'tax_number', 'vat', 'vat_no', 'الرقم_الضريبي', 'الرقم الضريبي'],
  phone: ['phone', 'tel', 'telephone', 'الهاتف', 'هاتف'],
  mobile: ['mobile', 'cell', 'الجوال', 'جوال'],
  email: ['email', 'e_mail', 'mail', 'البريد', 'البريد_الإلكتروني'],
  address: ['address', 'العنوان'],
  city: ['city', 'المدينة'],
  country: ['country', 'الدولة'],
  country_code: ['country_code', 'dial_code', 'رمز_الدولة', 'كود الدولة'],
  currency: ['currency', 'العملة'],
  payment_terms: ['payment_terms', 'terms', 'days', 'شروط_السداد', 'أيام_السداد'],
  notes: ['notes', 'note', 'remarks', 'ملاحظات'],
}

export function guessVendorFieldMapping(headers: string[]): VendorFieldMapping[] {
  const used = new Set<string>()
  return headers.map((fileColumn) => {
    const n = normHeader(fileColumn)
    for (const [field, syns] of Object.entries(HEADER_SYNONYMS)) {
      if (used.has(fileColumn)) break
      if (syns.some((s) => n === normHeader(s) || n.includes(normHeader(s)))) {
        used.add(fileColumn)
        return { fileColumn, systemField: field as VendorFieldMapping['systemField'] }
      }
    }
    return { fileColumn, systemField: null }
  })
}

export function validateVendorRow(
  row: Record<string, string>,
  mapping: VendorFieldMapping[],
): { data: VendorImportRow; errors: string[] } {
  const data: Partial<VendorImportRow> = {}
  const errors: string[] = []

  mapping.forEach(({ fileColumn, systemField }) => {
    if (!systemField) return
    const raw = row[fileColumn]
    if (raw === undefined || raw === null) return
    const value = String(raw).trim()
    if (value === '') return
    ;(data as Record<string, unknown>)[systemField] = value
  })

  if (!data.name?.trim()) {
    errors.push('اسم المورد مطلوب')
  } else {
    data.name = data.name.trim()
  }

  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.push('البريد الإلكتروني غير صحيح')
  }

  if (data.mobile && !data.phone) {
    data.phone = data.mobile
  }

  return { data: data as VendorImportRow, errors }
}

export function applyVendorMappingToRows(
  rows: Record<string, string>[],
  mapping: VendorFieldMapping[],
): { data: VendorImportRow; errors: string[]; rowIndex: number }[] {
  return rows.map((row, index) => {
    const { data, errors } = validateVendorRow(row, mapping)
    return { data, errors, rowIndex: index + 2 }
  })
}
