import type { ItemFieldMapping, ItemImportRow } from '../types/itemImport'

const BOOLEAN_TRUE = ['نعم', 'yes', '1', 'true', 'صح', 'y']
const BOOLEAN_FALSE = ['لا', 'no', '0', 'false', 'خطأ', 'n']

function normHeader(s: string): string {
  return s
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/\*/g, '')
}

const HEADER_SYNONYMS: Record<string, string[]> = {
  name: ['name', 'item_name', 'اسم_الصنف', 'اسم', 'اسم الصنف'],
  name_en: ['name_en', 'english_name', 'اسم_انجليزي', 'اسم إنجليزي'],
  code: ['code', 'sku', 'item_code', 'كود', 'كود الصنف'],
  barcode: ['barcode', 'bar_code', 'الباركود', 'باركود'],
  description: ['description', 'desc', 'الوصف'],
  category_code: ['category_code', 'كود_الفئة', 'كود الفئة', 'category code'],
  category_name: ['category', 'category_name', 'اسم_الفئة', 'اسم الفئة', 'الفئة', 'فئة'],
  base_unit_symbol: ['base_unit_symbol', 'unit_symbol', 'رمز_الوحدة', 'رمز الوحدة', 'symbol'],
  base_unit_name: ['base_unit_name', 'base_unit', 'الوحدة_الأساسية', 'الوحدة الأساسية', 'وحدة_القياس', 'وحدة القياس'],
  unit_name: ['unit_name', 'unit', 'وحدة'],
  brand: ['brand', 'العلامة', 'العلامة التجارية'],
  sale_price: ['sale_price', 'selling_price', 'price', 'سعر_البيع', 'سعر البيع'],
  cost_price: ['cost_price', 'cost', 'سعر_التكلفة', 'سعر التكلفة'],
  wholesale_price: ['wholesale_price', 'wholesale', 'سعر_الجملة'],
  min_sale_price: ['min_sale_price', 'min_price', 'الحد_الأدنى'],
  tax_inclusive: ['tax_inclusive', 'شامل_الضريبة', 'شامل الضريبة', 'السعر شامل الضريبة'],
  tax_percent: ['tax_percent', 'vat_percent', 'نسبة_الضريبة', 'نسبة الضريبة'],
  track_inventory: ['track_inventory', 'track_stock', 'تتبع_المخزون'],
  opening_stock: ['opening_stock', 'initial_stock', 'stock', 'رصيد', 'رصيد_افتتاحي'],
  min_stock: ['min_stock', 'min_quantity', 'حد_أدنى'],
  max_stock: ['max_stock', 'max_quantity', 'حد_أقصى'],
  is_service: ['is_service', 'service', 'خدمة'],
  is_active: ['is_active', 'active', 'مفعّل', 'مفعل'],
  notes: ['notes', 'note', 'ملاحظات'],
}

function parseBoolean(val: string | undefined, defaultVal = false): boolean {
  if (val === undefined || val === null || String(val).trim() === '') return defaultVal
  const v = String(val).trim().toLowerCase()
  if (BOOLEAN_TRUE.includes(v)) return true
  if (BOOLEAN_FALSE.includes(v)) return false
  return defaultVal
}

function parseOptionalNumber(
  val: string | undefined,
  errors: string[],
  labelAr: string,
): number | undefined {
  if (val === undefined || val === null || String(val).trim() === '') return undefined
  const n = Number(String(val).replace(/,/g, ''))
  if (Number.isNaN(n)) {
    errors.push(`${labelAr} يجب أن يكون رقماً`)
    return undefined
  }
  if (n < 0) {
    errors.push(`${labelAr} يجب ألا يكون سالباً`)
    return undefined
  }
  return n
}

export function guessItemFieldMapping(headers: string[]): ItemFieldMapping[] {
  const used = new Set<string>()
  return headers.map((fileColumn) => {
    const n = normHeader(fileColumn)
    for (const [field, syns] of Object.entries(HEADER_SYNONYMS)) {
      if (used.has(fileColumn)) break
      const matched = syns.some((s) => {
        const syn = normHeader(s)
        return n === syn || (syn.length >= 4 && n.includes(syn))
      })
      if (matched) {
        used.add(fileColumn)
        return { fileColumn, systemField: field as ItemFieldMapping['systemField'] }
      }
    }
    return { fileColumn, systemField: null }
  })
}

export function validateItemRow(
  row: Record<string, string>,
  mapping: ItemFieldMapping[],
): { data: ItemImportRow; errors: string[] } {
  const raw: Partial<Record<ItemFieldMapping['systemField'] & string, string>> = {}
  mapping.forEach(({ fileColumn, systemField }) => {
    if (!systemField) return
    const v = row[fileColumn]
    if (v !== undefined && v !== null) raw[systemField] = String(v).trim()
  })

  const errors: string[] = []

  if (!raw.name?.trim()) {
    errors.push('اسم الصنف مطلوب')
  }

  const salePrice = raw.sale_price ? Number(String(raw.sale_price).replace(/,/g, '')) : NaN
  if (!raw.sale_price) {
    errors.push('سعر البيع مطلوب')
  } else if (Number.isNaN(salePrice) || salePrice < 0) {
    errors.push('سعر البيع يجب أن يكون رقماً موجباً')
  }

  const numericOptional: { key: keyof ItemImportRow; label: string }[] = [
    { key: 'cost_price', label: 'سعر التكلفة' },
    { key: 'min_sale_price', label: 'الحد الأدنى للسعر' },
    { key: 'wholesale_price', label: 'سعر الجملة' },
    { key: 'tax_percent', label: 'نسبة الضريبة' },
    { key: 'opening_stock', label: 'رصيد المخزون' },
    { key: 'min_stock', label: 'الحد الأدنى للمخزون' },
    { key: 'max_stock', label: 'الحد الأقصى للمخزون' },
  ]

  const parsedNumbers: Partial<Record<keyof ItemImportRow, number | undefined>> = {}
  numericOptional.forEach(({ key, label }) => {
    parsedNumbers[key] = parseOptionalNumber(raw[key], errors, label)
  })

  const isService = parseBoolean(raw.is_service)
  const data: ItemImportRow = {
    name: raw.name?.trim() ?? '',
    name_en: raw.name_en || undefined,
    code: raw.code || undefined,
    barcode: raw.barcode || undefined,
    description: raw.description || undefined,
    category_code: raw.category_code || undefined,
    category_name: raw.category_name || undefined,
    base_unit_name: raw.base_unit_name || raw.unit_name || undefined,
    base_unit_symbol: raw.base_unit_symbol || undefined,
    unit_name: raw.base_unit_name || raw.unit_name || undefined,
    brand: raw.brand || undefined,
    sale_price: Number.isNaN(salePrice) ? 0 : salePrice,
    cost_price: parsedNumbers.cost_price,
    min_sale_price: parsedNumbers.min_sale_price,
    wholesale_price: parsedNumbers.wholesale_price,
    tax_percent: parsedNumbers.tax_percent,
    tax_inclusive: parseBoolean(raw.tax_inclusive),
    track_inventory: parseBoolean(raw.track_inventory, !isService),
    opening_stock: parsedNumbers.opening_stock,
    min_stock: parsedNumbers.min_stock,
    max_stock: parsedNumbers.max_stock,
    is_service: isService,
    is_active: parseBoolean(raw.is_active, true),
    notes: raw.notes || undefined,
  }

  return { data, errors }
}

export function applyItemMappingToRows(
  rows: Record<string, string>[],
  mapping: ItemFieldMapping[],
): { data: ItemImportRow; errors: string[]; rowIndex: number }[] {
  return rows.map((row, index) => {
    const { data, errors } = validateItemRow(row, mapping)
    return { data, errors, rowIndex: index + 2 }
  })
}

export function isNameFieldMapped(mapping: ItemFieldMapping[]): boolean {
  return mapping.some((m) => m.systemField === 'name')
}

export function isSalePriceMapped(mapping: ItemFieldMapping[]): boolean {
  return mapping.some((m) => m.systemField === 'sale_price')
}
