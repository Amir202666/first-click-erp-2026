export interface CustomerImportRow {
  name: string
  company_name?: string
  tax_number?: string
  phone?: string
  mobile?: string
  email?: string
  address?: string
  city?: string
  country?: string
  currency?: string
  credit_limit?: number
  payment_terms?: number
  opening_balance?: number
  opening_balance_date?: string
  notes?: string
  customer_group_id?: number
}

export interface CustomerImportRowParsed extends CustomerImportRow {
  _rowIndex: number
  _errors: string[]
  _status: 'valid' | 'error' | 'duplicate' | 'imported'
}

export type CustomerImportFieldKey = keyof CustomerImportRow

export interface FieldMapping {
  fileColumn: string
  systemField: CustomerImportFieldKey | null
}

export interface ImportSettings {
  parentAccountId: number
  parentAccountName: string
  skipDuplicates: boolean
  updateExisting: boolean
  importOpeningBalance: boolean
}

export interface ImportResult {
  total: number
  imported: number
  skipped: number
  errors: number
  accounts_opened?: number
  errorRows: { row: number; name: string; reason: string }[]
}

export const CUSTOMER_IMPORT_FIELDS: {
  key: CustomerImportFieldKey
  required?: boolean
  labelAr: string
  labelEn: string
}[] = [
  { key: 'name', required: true, labelAr: 'اسم العميل', labelEn: 'Customer name' },
  { key: 'company_name', labelAr: 'اسم الشركة', labelEn: 'Company name' },
  { key: 'tax_number', labelAr: 'الرقم الضريبي', labelEn: 'Tax number' },
  { key: 'phone', labelAr: 'الهاتف', labelEn: 'Phone' },
  { key: 'mobile', labelAr: 'الجوال', labelEn: 'Mobile' },
  { key: 'email', labelAr: 'البريد الإلكتروني', labelEn: 'Email' },
  { key: 'address', labelAr: 'العنوان', labelEn: 'Address' },
  { key: 'city', labelAr: 'المدينة', labelEn: 'City' },
  { key: 'country', labelAr: 'الدولة', labelEn: 'Country' },
  { key: 'currency', labelAr: 'العملة', labelEn: 'Currency' },
  { key: 'credit_limit', labelAr: 'حد الائتمان', labelEn: 'Credit limit' },
  { key: 'payment_terms', labelAr: 'أيام السداد', labelEn: 'Payment terms' },
  { key: 'opening_balance', labelAr: 'الرصيد الافتتاحي', labelEn: 'Opening balance' },
  { key: 'opening_balance_date', labelAr: 'تاريخ الرصيد الافتتاحي', labelEn: 'Opening balance date' },
  { key: 'notes', labelAr: 'ملاحظات', labelEn: 'Notes' },
]
