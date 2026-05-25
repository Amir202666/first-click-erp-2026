import type { CustomerImportRow, FieldMapping } from '../types/customerImport'

function normHeader(s: string): string {
  return s
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/\*/g, '')
}

const HEADER_SYNONYMS: Record<string, string[]> = {
  name: ['name', 'customer_name', 'اسم_العميل', 'اسم', 'customername', 'اسم العميل'],
  company_name: ['company', 'company_name', 'اسم_الشركة', 'اسم الشركة'],
  tax_number: ['tax', 'tax_number', 'vat', 'vat_no', 'الرقم_الضريبي', 'الرقم الضريبي'],
  phone: ['phone', 'tel', 'telephone', 'الهاتف', 'هاتف'],
  mobile: ['mobile', 'cell', 'الجوال', 'جوال'],
  email: ['email', 'e_mail', 'mail', 'البريد', 'البريد_الإلكتروني'],
  address: ['address', 'العنوان'],
  city: ['city', 'المدينة'],
  country: ['country', 'الدولة', 'country_code'],
  currency: ['currency', 'العملة'],
  credit_limit: ['credit_limit', 'credit', 'حد_الائتمان'],
  payment_terms: ['payment_terms', 'terms', 'days', 'أيام_السداد'],
  opening_balance: ['opening_balance', 'balance', 'opening', 'الرصيد', 'الرصيد_الافتتاحي'],
  opening_balance_date: ['opening_balance_date', 'balance_date', 'opening_date', 'تاريخ_الرصيد'],
  notes: ['notes', 'note', 'remarks', 'ملاحظات'],
}

export function guessCustomerFieldMapping(headers: string[]): FieldMapping[] {
  const used = new Set<string>()
  return headers.map((fileColumn) => {
    const n = normHeader(fileColumn)
    for (const [field, syns] of Object.entries(HEADER_SYNONYMS)) {
      if (used.has(fileColumn)) break
      if (syns.some((s) => n === normHeader(s) || n.includes(normHeader(s)))) {
        used.add(fileColumn)
        return { fileColumn, systemField: field as FieldMapping['systemField'] }
      }
    }
    return { fileColumn, systemField: null }
  })
}

export function validateCustomerRow(
  row: Record<string, string>,
  mapping: FieldMapping[],
): { data: CustomerImportRow; errors: string[] } {
  const data: Partial<CustomerImportRow> = {}
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
    errors.push('اسم العميل مطلوب')
  } else {
    data.name = data.name.trim()
  }

  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.push('البريد الإلكتروني غير صحيح')
  }

  if (data.credit_limit !== undefined) {
    const num = Number(data.credit_limit)
    if (Number.isNaN(num) || num < 0) {
      errors.push('حد الائتمان يجب أن يكون رقماً')
    } else {
      data.credit_limit = num
    }
  }

  if (data.payment_terms !== undefined) {
    const num = Number(data.payment_terms)
    if (Number.isNaN(num) || num < 0) {
      errors.push('أيام السداد يجب أن تكون رقماً')
    } else {
      data.payment_terms = num
    }
  }

  if (data.opening_balance !== undefined) {
    const num = Number(String(data.opening_balance).replace(/,/g, ''))
    if (Number.isNaN(num)) {
      errors.push('الرصيد الافتتاحي يجب أن يكون رقماً')
    } else {
      data.opening_balance = num
    }
  }

  if (data.mobile && !data.phone) {
    data.phone = data.mobile
  }

  return { data: data as CustomerImportRow, errors }
}

export function applyMappingToRows(
  rows: Record<string, string>[],
  mapping: FieldMapping[],
): { data: CustomerImportRow; errors: string[]; rowIndex: number }[] {
  return rows.map((row, index) => {
    const { data, errors } = validateCustomerRow(row, mapping)
    return { data, errors, rowIndex: index + 2 }
  })
}
