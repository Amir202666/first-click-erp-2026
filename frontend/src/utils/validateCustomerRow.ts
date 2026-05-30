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
  opening_balance_date: [
    'opening_balance_date',
    'opening balance date',
    'balance_date',
    'تاريخ_الرصيد_الافتتاحي',
    'تاريخ الرصيد الافتتاحي',
  ],
  opening_balance: [
    'opening_balance',
    'opening balance',
    'الرصيد_الافتتاحي',
    'الرصيد الافتتاحي',
  ],
  notes: ['notes', 'note', 'remarks', 'ملاحظات'],
}

function headerMatchScore(headerNorm: string, synonym: string): number {
  const syn = normHeader(synonym)
  if (!syn) return 0
  if (headerNorm === syn) return 100
  if (headerNorm.startsWith(`${syn}_`) || headerNorm.endsWith(`_${syn}`)) return 80
  if (headerNorm.includes(syn)) return syn.length >= 6 ? 40 : 0
  return 0
}

const FIELD_MATCH_ORDER = Object.keys(HEADER_SYNONYMS)

export function guessCustomerFieldMapping(headers: string[]): FieldMapping[] {
  const columnToField = new Map<string, FieldMapping['systemField']>()

  for (const field of FIELD_MATCH_ORDER) {
    const syns = HEADER_SYNONYMS[field]
    let bestColumn: string | null = null
    let bestScore = 0

    for (const fileColumn of headers) {
      if (columnToField.has(fileColumn)) continue
      const n = normHeader(fileColumn)
      for (const syn of syns) {
        const score = headerMatchScore(n, syn)
        if (score > bestScore) {
          bestScore = score
          bestColumn = fileColumn
        }
      }
    }

    if (bestColumn && bestScore > 0) {
      columnToField.set(bestColumn, field as FieldMapping['systemField'])
    }
  }

  return headers.map((fileColumn) => ({
    fileColumn,
    systemField: columnToField.get(fileColumn) ?? null,
  }))
}

export function validateCustomerRow(
  row: Record<string, string>,
  mapping: FieldMapping[],
): { data: CustomerImportRow; errors: string[] } {
  const data: Partial<CustomerImportRow> = {}
  const errors: string[] = []

  const DATE_LIKE = /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/

  mapping.forEach(({ fileColumn, systemField }) => {
    if (!systemField) return
    const raw = row[fileColumn]
    if (raw === undefined || raw === null) return
    const value = String(raw).trim()
    if (value === '') return

    if (systemField === 'opening_balance' || systemField === 'opening_balance_date') {
      if (DATE_LIKE.test(value)) {
        if (!data.opening_balance_date) data.opening_balance_date = value.slice(0, 10)
      } else if (systemField === 'opening_balance' || data.opening_balance === undefined) {
        const num = Number(value.replace(/,/g, ''))
        if (!Number.isNaN(num)) data.opening_balance = num
      }
      return
    }

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
    const raw = String(data.opening_balance).trim()
    const num = Number(raw.replace(/,/g, ''))
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
