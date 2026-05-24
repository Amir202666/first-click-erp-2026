/**
 * بنية بيانات مصمم قوالب الفواتير — تُحوّل في النهاية إلى HTML/CSS للطباعة
 */

export type PagePreset = 'a4' | '80mm' | '57mm' | 'custom'

export interface PageSettings {
  preset: PagePreset
  widthMm: number
  heightMm: number
  marginTopMm: number
  marginRightMm: number
  marginBottomMm: number
  marginLeftMm: number
}

export interface FontSettings {
  family: string
  sizePt: number
  color: string
  bold: boolean
  italic?: boolean
  underline?: boolean
  lineHeightPt?: number
  letterSpacingPt?: number
}

/** خصائص المظهر والمحاذاة للعنصر */
export interface ElementBoxStyle {
  paddingMm?: number
  borderRadiusMm?: number
  backgroundColor?: string
  backgroundTransparent?: boolean
  borderColor?: string
  borderTransparent?: boolean
  borderWidthMm?: number
  borderStyle?: 'solid' | 'dashed' | 'none'
  textAlign?: 'left' | 'center' | 'right'
  direction?: 'ltr' | 'rtl'
  alignItems?: 'flex-start' | 'center' | 'flex-end'
  justifyContent?: 'flex-start' | 'center' | 'flex-end'
}

export type ElementType = 'variable' | 'text' | 'table' | 'image' | 'line' | 'spacer' | 'rectangle'

export interface BaseElement {
  id: string
  type: ElementType
  xMm: number
  yMm: number
  widthMm?: number
  heightMm?: number
  font?: Partial<FontSettings>
  style?: Partial<ElementBoxStyle>
  zIndex?: number
  locked?: boolean
  groupId?: string
}

export interface VariableElement extends BaseElement {
  type: 'variable'
  variableKey: string // e.g. company.name, invoice.number, qr_code
}

export interface TextElement extends BaseElement {
  type: 'text'
  content: string
}

export interface TableHeaderStyle {
  backgroundColor?: string
  color?: string
  fontSizePt?: number
  bold?: boolean
  borderColor?: string
  borderWidthMm?: number
  heightMm?: number
}

export interface TableBodyStyle {
  fontSize?: number
  stripedColor?: string
  borderColor?: string
  borderWidthMm?: number
}

export interface TableElement extends BaseElement {
  type: 'table'
  columns: { key: string; label: string; widthPercent?: number }[]
  headerStyle?: TableHeaderStyle
  bodyStyle?: TableBodyStyle
  showRowNumbers?: boolean
}

export interface ImageElement extends BaseElement {
  type: 'image'
  src: string
  alt?: string
}

export interface LineElement extends BaseElement {
  type: 'line'
  thicknessMm: number
  color: string
  horizontal: boolean
}

export interface SpacerElement extends BaseElement {
  type: 'spacer'
  heightMm: number
}

export interface RectangleElement extends BaseElement {
  type: 'rectangle'
}

export type DesignElement =
  | VariableElement
  | TextElement
  | TableElement
  | ImageElement
  | LineElement
  | SpacerElement
  | RectangleElement

export interface LogoPlaceholder {
  enabled: boolean
  url: string
  xMm: number
  yMm: number
  widthMm: number
  heightMm: number
}

export interface StampSignaturePlaceholder {
  label: string
  xMm: number
  yMm: number
  widthMm: number
  heightMm: number
}

export interface FrameSettings {
  enabled: boolean
  borderWidthMm: number
  borderColor: string
}

export interface TemplateDesignData {
  name: string
  docType: string
  page: PageSettings
  globalFont: FontSettings
  elements: DesignElement[]
  logo: LogoPlaceholder
  stamp: StampSignaturePlaceholder
  signature: StampSignaturePlaceholder
  frame: FrameSettings
}

export const PAGE_PRESETS: Record<PagePreset, { widthMm: number; heightMm: number }> = {
  a4: { widthMm: 210, heightMm: 297 },
  '80mm': { widthMm: 80, heightMm: 297 },
  '57mm': { widthMm: 57, heightMm: 297 },
  custom: { widthMm: 210, heightMm: 297 },
}

/** افتراضي: حراري 80 مم (مناسب لمعظم طابعات الفواتير الحرارية) */
export const DEFAULT_PAGE: PageSettings = {
  preset: '80mm',
  widthMm: 80,
  heightMm: 297,
  marginTopMm: 3,
  marginRightMm: 3,
  marginBottomMm: 3,
  marginLeftMm: 3,
}

export const DEFAULT_FONT: FontSettings = {
  family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  sizePt: 10,
  color: '#333333',
  bold: false,
}

export const VARIABLE_KEYS: { key: string; label: string; group: string }[] = [
  // الشركة
  { key: 'company.name', label: 'اسم الشركة', group: 'company' },
  { key: 'company.address', label: 'عنوان الشركة', group: 'company' },
  { key: 'company.phone', label: 'هاتف الشركة', group: 'company' },
  { key: 'company.email', label: 'البريد الإلكتروني', group: 'company' },
  { key: 'company.tax_number', label: 'الرقم الضريبي', group: 'company' },
  // الفاتورة
  { key: 'invoice.number', label: 'رقم الفاتورة', group: 'invoice' },
  { key: 'invoice.date', label: 'تاريخ الفاتورة', group: 'invoice' },
  { key: 'invoice.due_date', label: 'تاريخ الاستحقاق', group: 'invoice' },
  { key: 'invoice.type_label', label: 'نوع الفاتورة', group: 'invoice' },
  { key: 'invoice.notes', label: 'ملاحظات الفاتورة', group: 'invoice' },
  { key: 'invoice.payment_method', label: 'طريقة الدفع', group: 'invoice' },
  // العميل
  { key: 'customer.name', label: 'اسم العميل', group: 'customer' },
  { key: 'customer.phone', label: 'هاتف العميل', group: 'customer' },
  { key: 'customer.address', label: 'عنوان العميل', group: 'customer' },
  { key: 'customer.tax_number', label: 'الرقم الضريبي للعميل', group: 'customer' },
  // المبالغ
  { key: 'subtotal', label: 'المجموع الفرعي', group: 'amounts' },
  { key: 'tax_amount', label: 'مبلغ الضريبة', group: 'amounts' },
  { key: 'discount_amount', label: 'مبلغ الخصم', group: 'amounts' },
  { key: 'total', label: 'الإجمالي', group: 'amounts' },
  { key: 'amount_paid', label: 'المدفوع', group: 'amounts' },
  { key: 'balance', label: 'المتبقي', group: 'amounts' },
  { key: 'total_in_words', label: 'المبلغ كتابةً', group: 'amounts' },
  // باركود و QR
  { key: 'qr_code', label: 'QR Code', group: 'codes' },
  { key: 'ref_num_barcode', label: 'باركود رقم الفاتورة', group: 'codes' },
  { key: 'ref_num_qrcode', label: 'QR رقم الفاتورة', group: 'codes' },
  // أخرى
  { key: 'warehouse.name', label: 'اسم المستودع', group: 'other' },
  { key: 'terms', label: 'الشروط والأحكام', group: 'other' },
  { key: 'current_date', label: 'التاريخ الحالي', group: 'other' },
  { key: 'page_number', label: 'رقم الصفحة', group: 'other' },
]

export const VARIABLE_GROUPS: { key: string; label: string }[] = [
  { key: 'company', label: 'الشركة' },
  { key: 'invoice', label: 'الفاتورة' },
  { key: 'customer', label: 'العميل' },
  { key: 'amounts', label: 'المبالغ' },
  { key: 'codes', label: 'الباركود و QR' },
  { key: 'other', label: 'أخرى' },
]

export const PRODUCT_TABLE_COLUMN_KEYS = [
  { key: 'row_num', label: '#' },
  { key: 'sku', label: 'كود الصنف' },
  { key: 'description', label: 'الوصف / الصنف' },
  { key: 'quantity', label: 'الكمية' },
  { key: 'unit', label: 'الوحدة' },
  { key: 'unit_price', label: 'سعر الوحدة' },
  { key: 'discount', label: 'الخصم' },
  { key: 'tax', label: 'الضريبة' },
  { key: 'total', label: 'المبلغ' },
  { key: 'serial_number', label: 'الرقم التسلسلي' },
] as const

export const FONT_FAMILIES = [
  { value: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif", label: 'Segoe UI' },
  { value: "'Arial', sans-serif", label: 'Arial' },
  { value: "'Traditional Arabic', 'Arial', sans-serif", label: 'Traditional Arabic' },
  { value: "'Cairo', 'Arial', sans-serif", label: 'Cairo' },
  { value: "'Tajawal', 'Arial', sans-serif", label: 'Tajawal' },
  { value: "'Amiri', 'Times New Roman', serif", label: 'Amiri' },
  { value: "'Courier New', Courier, monospace", label: 'Courier New' },
  { value: "'Times New Roman', Times, serif", label: 'Times New Roman' },
  { value: "'Georgia', serif", label: 'Georgia' },
] as const
