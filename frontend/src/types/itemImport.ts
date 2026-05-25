export interface ItemImportRow {
  name: string
  name_en?: string
  code?: string
  barcode?: string
  description?: string
  category_code?: string
  category_name?: string
  base_unit_name?: string
  base_unit_symbol?: string
  /** @deprecated use base_unit_name */
  unit_name?: string
  brand?: string
  sale_price: number
  cost_price?: number
  min_sale_price?: number
  wholesale_price?: number
  tax_percent?: number
  tax_inclusive?: boolean
  track_inventory?: boolean
  opening_stock?: number
  min_stock?: number
  max_stock?: number
  is_active?: boolean
  is_service?: boolean
  notes?: string
}

export interface ItemImportRowParsed extends ItemImportRow {
  _rowIndex: number
  _errors: string[]
  _status: 'valid' | 'error' | 'duplicate'
}

export type ItemImportFieldKey = keyof ItemImportRow

export interface ItemFieldMapping {
  fileColumn: string
  systemField: ItemImportFieldKey | null
}

export interface ItemImportSettings {
  skipDuplicates: boolean
  updateExisting: boolean
  createCategories: boolean
  createUnits: boolean
}

export interface ItemImportResult {
  total: number
  imported: number
  updated: number
  skipped: number
  errors: number
  categories_created?: number
  units_created?: number
  errorRows: { row: number; name: string; reason: string }[]
}

export const ITEM_IMPORT_FIELDS: {
  key: ItemImportFieldKey
  required?: boolean
  labelAr: string
  labelEn: string
}[] = [
  { key: 'name', required: true, labelAr: 'اسم الصنف', labelEn: 'Item name' },
  { key: 'name_en', labelAr: 'اسم الصنف (إنجليزي)', labelEn: 'Name (English)' },
  { key: 'code', labelAr: 'كود الصنف', labelEn: 'Item code' },
  { key: 'barcode', labelAr: 'الباركود', labelEn: 'Barcode' },
  { key: 'description', labelAr: 'الوصف', labelEn: 'Description' },
  { key: 'category_code', labelAr: 'كود الفئة', labelEn: 'Category code' },
  { key: 'category_name', labelAr: 'اسم الفئة', labelEn: 'Category name' },
  { key: 'base_unit_symbol', labelAr: 'رمز الوحدة', labelEn: 'Unit symbol' },
  { key: 'base_unit_name', labelAr: 'الوحدة الأساسية', labelEn: 'Base unit' },
  { key: 'brand', labelAr: 'العلامة التجارية', labelEn: 'Brand' },
  { key: 'sale_price', required: true, labelAr: 'سعر البيع', labelEn: 'Sale price' },
  { key: 'cost_price', labelAr: 'سعر التكلفة', labelEn: 'Cost price' },
  { key: 'wholesale_price', labelAr: 'سعر الجملة', labelEn: 'Wholesale price' },
  { key: 'min_sale_price', labelAr: 'الحد الأدنى للسعر', labelEn: 'Min sale price' },
  { key: 'tax_percent', labelAr: 'نسبة الضريبة %', labelEn: 'Tax %' },
  { key: 'tax_inclusive', labelAr: 'شامل الضريبة', labelEn: 'Tax inclusive' },
  { key: 'track_inventory', labelAr: 'تتبع المخزون', labelEn: 'Track inventory' },
  { key: 'opening_stock', labelAr: 'رصيد المخزون الافتتاحي', labelEn: 'Opening stock' },
  { key: 'min_stock', labelAr: 'الحد الأدنى للمخزون', labelEn: 'Min stock' },
  { key: 'max_stock', labelAr: 'الحد الأقصى للمخزون', labelEn: 'Max stock' },
  { key: 'is_service', labelAr: 'خدمة', labelEn: 'Service' },
  { key: 'is_active', labelAr: 'مفعّل', labelEn: 'Active' },
  { key: 'notes', labelAr: 'ملاحظات', labelEn: 'Notes' },
]
