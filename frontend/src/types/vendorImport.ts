export interface VendorImportRow {
  name: string
  name_en?: string
  company_name?: string
  tax_number?: string
  phone?: string
  mobile?: string
  email?: string
  address?: string
  city?: string
  country?: string
  country_code?: string
  currency?: string
  payment_terms?: string
  notes?: string
  vendor_group_id?: number
}

export interface VendorImportRowParsed extends VendorImportRow {
  _rowIndex: number
  _errors: string[]
  _status: 'valid' | 'error' | 'duplicate' | 'imported'
}

export type VendorImportFieldKey = keyof VendorImportRow

export interface VendorFieldMapping {
  fileColumn: string
  systemField: VendorImportFieldKey | null
}

export interface VendorImportSettings {
  parentAccountId: number
  parentAccountName: string
  skipDuplicates: boolean
  updateExisting: boolean
}

export interface VendorImportResult {
  total: number
  imported: number
  skipped: number
  errors: number
  accounts_opened?: number
  errorRows: { row: number; name: string; reason: string }[]
}

export const VENDOR_IMPORT_FIELDS: {
  key: VendorImportFieldKey
  required?: boolean
  labelAr: string
  labelEn: string
}[] = [
  { key: 'name', required: true, labelAr: 'اسم المورد', labelEn: 'Vendor name' },
  { key: 'name_en', labelAr: 'الاسم بالإنجليزية', labelEn: 'Name (English)' },
  { key: 'company_name', labelAr: 'اسم الشركة', labelEn: 'Company name' },
  { key: 'tax_number', labelAr: 'الرقم الضريبي', labelEn: 'Tax number' },
  { key: 'phone', labelAr: 'الهاتف', labelEn: 'Phone' },
  { key: 'mobile', labelAr: 'الجوال', labelEn: 'Mobile' },
  { key: 'email', labelAr: 'البريد الإلكتروني', labelEn: 'Email' },
  { key: 'address', labelAr: 'العنوان', labelEn: 'Address' },
  { key: 'city', labelAr: 'المدينة', labelEn: 'City' },
  { key: 'country', labelAr: 'الدولة', labelEn: 'Country' },
  { key: 'country_code', labelAr: 'رمز الدولة', labelEn: 'Country code' },
  { key: 'currency', labelAr: 'العملة', labelEn: 'Currency' },
  { key: 'payment_terms', labelAr: 'شروط السداد', labelEn: 'Payment terms' },
  { key: 'notes', labelAr: 'ملاحظات', labelEn: 'Notes' },
]
