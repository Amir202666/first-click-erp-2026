export interface User {
  id: number
  name: string
  email: string
}

export interface Tenant {
  id: number
  name: string
  slug: string
}

export interface Account {
  id: number
  tenant_id: number
  parent_id: number | null
  code: string
  name: string
  name_en: string | null
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'cogs' | 'expense'
  normal_balance?: 'debit' | 'credit' | null
  description: string | null
  is_system: boolean
  is_active: boolean
  level: number
  currency?: string | null
  is_postable?: boolean
  is_group?: boolean
  path?: string | null
  children?: Account[]
  balance_info?: { debit: number; credit: number; balance: number }
  /** الربط المتقدم: معرّفات الفروع المرتبطة (فارغ = كل الفروع) */
  branch_ids?: number[]
  /** الربط المتقدم: معرّفات مراكز التكلفة (فارغ = كل المراكز) */
  cost_center_ids?: number[]
  /** الربط المتقدم: معرّفات المستخدمين المسموح لهم بالقيود (فارغ = الكل) */
  user_ids?: number[]
}

export interface CustomerGroup {
  id: number
  tenant_id: number
  name: string
  name_en?: string | null
  discount_type: 'percent' | 'fixed'
  discount_value: number
  is_active: boolean
}

export interface Customer {
  id: number
  code: string | null
  name: string
  name_en: string | null
  company_name: string | null
  tax_number: string | null
  address: string | null
  country: string | null
  city: string | null
  email: string | null
  phone: string | null
  country_code: string | null
  account_id: number | null
  customer_group_id: number | null
  pricing_group_id?: number | null
  payment_terms: string | null
  credit_limit: number | null
  currency: string | null
  is_active: boolean
  notes: string | null
  account?: Account | null
  customer_group?: CustomerGroup | null
  pricingGroup?: PricingGroup | null
  /** مرتبط بفروع محددة؛ إن وُجدت القائمة يقتصر ظهور العميل على هذه الفروع. فارغ = كل الفروع. */
  branches?: { id: number; name: string; name_en: string | null }[]
}

export interface PricingGroup {
  id: number
  tenant_id: number
  name: string
  operation_type?: 'discount_percent' | 'increase_percent' | 'fixed_price'
  /** قديم للتوافق الخلفي */
  pricing_type: 'fixed' | 'percent'
  value: number
  is_active: boolean
  /** إرسالها في create/update لربط المجموعة بفروع محددة (فارغة = كل الفروع) */
  branch_ids?: number[]
  /** إرسالها في create/update لربط المجموعة بمستخدمين (tenant_users) محددين (فارغة = كل المستخدمين) */
  tenant_user_ids?: number[]
  branches?: { id: number; name: string; name_en: string | null }[]
  tenantUsers?: { id: number; tenant_id: number; user_id: number; user?: { id: number; name: string; email: string } }[]
}

export interface Vendor {
  id: number
  code: string | null
  name: string
  name_en: string | null
  company_name: string | null
  tax_number: string | null
  address: string | null
  country: string | null
  city: string | null
  email: string | null
  phone: string | null
  country_code: string | null
  account_id: number | null
  vendor_group_id?: number | null
  payment_terms: string | null
  is_active: boolean
  notes: string | null
  account?: Account | null
  vendorGroup?: { id: number; name: string; name_en: string | null; is_active: boolean } | null
  branches?: { id: number; name: string; name_en: string | null }[]
}

export interface VendorGroup {
  id: number
  tenant_id?: number
  name: string
  name_en: string | null
  is_active: boolean
}

export interface VendorPurchaseAnalysisRow {
  vendor_id: number
  vendor_name: string
  vendor_name_en: string | null
  invoice_count: number
  total_purchases: number
  total_qty: number
  discount_percent: number
  pct_of_total: number
}

export interface VendorPurchaseAnalysisResponse {
  company: { name?: string; logo?: string; address?: string } | null
  from_date: string
  to_date: string
  currency: string | null
  total_purchases: number
  donut: Array<{ vendor_id: number | null; vendor_name: string; vendor_name_en: string | null; value: number }>
  data: VendorPurchaseAnalysisRow[]
}

export type VendorAgingInvoiceDetail = {
  invoice_id: number
  number: string
  due_date: string
  balance: number
}

export interface VendorAgingRow {
  vendor_id: number
  account_code: string
  vendor_name: string
  vendor_name_en: string | null
  branch_name: string | null
  branch_name_en: string | null
  not_yet_due: number
  days_1_30: number
  days_31_60: number
  days_61_90: number
  over_90: number
  total: number
  details?: {
    not_yet_due?: VendorAgingInvoiceDetail[]
    days_1_30?: VendorAgingInvoiceDetail[]
    days_31_60?: VendorAgingInvoiceDetail[]
    days_61_90?: VendorAgingInvoiceDetail[]
    over_90?: VendorAgingInvoiceDetail[]
  }
}

export interface VendorAgingResponse {
  company: { name?: string; logo?: string; address?: string } | null
  as_of_date: string
  due_within_7_days_total: number
  data: VendorAgingRow[]
}

export interface VendorPerformanceRow {
  vendor_id: number
  vendor_name: string
  vendor_name_en: string | null
  total_purchases: number
  total_returns: number
  return_rate_percent: number
  price_changes_count: number
  score: number
  stars: number
}

export interface VendorPerformanceResponse {
  company: { name?: string; logo?: string; address?: string } | null
  from_date: string
  to_date: string
  data: VendorPerformanceRow[]
}

/** سطر BOM كما يعاد من API (عرض الصنف) */
export interface ItemBillOfMaterialLine {
  id?: number
  bill_of_material_id?: number
  component_item_id: number
  quantity: number
  unit_id?: number | null
  sort_order?: number
  unit_cost?: number | null
  line_total?: number | null
  current_stock?: number
  component_item?: Item
  unit?: ItemUnit
}

export interface ItemBillOfMaterial {
  id: number
  finished_item_id: number
  name?: string | null
  is_active?: boolean
  lines?: ItemBillOfMaterialLine[]
}

export interface Item {
  id: number
  code: string
  name: string
  name_en: string | null
  description: string | null
  unit: string
  unit_id: number | null
  brand_id: number | null
  category_id?: number | null
  type: 'inventory' | 'service' | 'manufacturing' | 'assembly'
  cost_price: number
  selling_price: number
  default_tax_percent?: number | null
  min_selling_price?: number | null
  max_selling_price?: number | null
  min_quantity: number
  current_stock?: number
  stock_value?: number
  average_cost?: number
  category?: ItemCategory
  brand?: ItemBrand
  item_unit?: ItemUnit
  inventory_account_id?: number | null
  cost_of_sales_account_id?: number | null
  sales_account_id?: number | null
  is_active: boolean
  /** افتراضياً true للمخزون — يُستبعد من توزيع التكاليف عند false */
  track_quantity?: boolean
  use_serial_number?: boolean
  barcode?: string | null
  sku?: string | null
  image?: string | null
  image_url?: string | null
  unit_options?: ItemUnitOption[]
  stock_breakdown?: { unit_id: number; unit_name: string; quantity: number }[]
  bill_of_material?: ItemBillOfMaterial | null
  bom_total_cost?: number
  /** هل الصنف له متغيرات (لون/مقاس...) */
  has_variants?: boolean
  /** قائمة المتغيرات كما تعاد من الـ API */
  variants?: ItemVariant[]
  /** اسم علاقة Laravel لجدول item_variants */
  item_variants?: ItemVariant[]
}

export interface ItemCategory {
  id: number
  code: string
  name: string
  name_en: string | null
  description: string | null
  image?: string | null
  image_url?: string | null
  parent_id: number | null
  is_active: boolean
  show_in_pos?: boolean
  show_in_restaurant_pos?: boolean
  applies_to_all_branches?: boolean
  inventory_account_id?: number | null
  cost_of_sales_account_id?: number | null
  sales_account_id?: number | null
  items_count?: number
  parent?: ItemCategory | null
  branches?: { id: number; name: string; name_en: string | null }[]
}

/** إعدادات الحسابات الافتراضية للشريك (لربط عمليات البيع/الشراء). رأس المال لا يُستخدم تلقائياً. */
export interface TenantAccountDefault {
  id?: number
  tenant_id: number
  cash_account_id: number | null
  bank_account_id: number | null
  customers_account_id: number | null
  vendors_account_id: number | null
  inventory_account_id: number | null
  inventory_adjustment_gain_account_id?: number | null
  inventory_adjustment_loss_account_id?: number | null
  sales_account_id: number | null
  sales_returns_account_id: number | null
  cogs_account_id: number | null
  purchases_account_id: number | null
  discounts_account_id: number | null
   purchase_discounts_account_id: number | null
  tax_payable_account_id: number | null
  capital_account_id: number | null
  installments_receivable_account_id?: number | null
  installments_payable_account_id?: number | null
  cash_account?: Account | null
  bank_account?: Account | null
  customers_account?: Account | null
  vendors_account?: Account | null
  inventory_account?: Account | null
  inventory_adjustment_gain_account?: Account | null
  inventory_adjustment_loss_account?: Account | null
  sales_account?: Account | null
  sales_returns_account?: Account | null
  cogs_account?: Account | null
  purchases_account?: Account | null
  discounts_account?: Account | null
  purchase_discounts_account?: Account | null
  tax_payable_account?: Account | null
  capital_account?: Account | null
  installments_receivable_account?: Account | null
  installments_payable_account?: Account | null
}

/** إعدادات الشريك (Key-Value): محاسبة، نقطة بيع، عام. */
export type TenantSettings = Record<string, string | number | boolean | string[] | null>

/** قالب طباعة مستند (فاتورة، سند، ...) */
export interface DocumentTemplate {
  id: number
  tenant_id: number
  name: string
  doc_type: string
  format: string
  is_active: boolean
  is_system?: boolean
  content: string
  meta?: Record<string, unknown> | null
  created_at?: string
  updated_at?: string
}

export interface ItemUnit {
  id: number
  name: string
  name_en: string | null
  symbol: string | null
  is_active: boolean
  items_count?: number
}

/** وحدة قياس مرتبطة بالصنف: معامل تحويل، سعر بيع/شراء، باركود */
export interface ItemUnitOption {
  id?: number
  item_id?: number
  unit_id: number
  conversion_factor: number
  is_base: boolean
  sort_order: number
  selling_price: number | null
  cost_price: number | null
  barcode: string | null
  unit?: ItemUnit
}

/** متغير صنف واحد (مثلاً: قميص - أحمر - XL) */
export interface ItemVariant {
  id: number
  item_id: number
  name: string
  sort_order?: number
  barcode?: string | null
  selling_price?: number | null
  initial_stock?: number | null
  options?: Record<string, string> | null
}

/** قالب خاصية متغير (مثل: المقاس، اللون) */
export interface ItemAttributeTemplateValue {
  id: number
  template_id: number
  value: string
}

export interface ItemAttributeTemplate {
  id: number
  name: string
  values: ItemAttributeTemplateValue[]
  uuid?: string
  created_at?: string
  updated_at?: string
}

export interface ItemBrand {
  id: number
  name: string
  name_en: string | null
  description: string | null
  is_active: boolean
  items_count?: number
}

export interface InvoiceLine {
  id?: number
  item_id: number | null
  item_variant_id?: number | null
  unit_id?: number | null
  account_id: number | null
  description: string
  quantity: number
  unit_price: number
  discount_percent: number
  /** خصم السطر كمبلغ ثابت (يُفضّل على النسبة عند الحفظ) */
  discount_amount?: number
  tax_percent: number
  amount?: number
  tax_amount?: number
  total?: number
  /** مصاريف شراء موزّعة على السطر (بعد الحفظ من الخادم) */
  landed_cost_allocated?: number | string | null
  /** وزن/أساس توزيع اختياري عند طريقة الوزن */
  distribution_weight?: number | string | null
  item?: Item
  unit?: ItemUnit | null
  serial_numbers?: string[]
  use_serial_number?: boolean
  item_variant?: ItemVariant | null
  /** تاريخ الصلاحية المرتبط برقم الباتش (مشتريات/مبيعات عند التتبع) */
  expiry_date?: string | null
  /** رقم الباتش / التشغيلة */
  batch_number?: string | null
}

/** صف تقرير مخزون حسب الصلاحية */
export interface ExpiryStockReportRow {
  item_id: number
  item_variant_id: number | null
  warehouse_id: number | null
  branch_id: number | null
  batch_number: string | null
  expiry_date: string | null
  qty: number
  item_code: string
  item_name: string
  variant_name: string | null
  warehouse_name: string | null
  branch_name: string | null
}

/** مصروف شراء إضافي مرتبط بالفاتورة */
export interface InvoiceAdditionalExpense {
  id?: number
  invoice_id?: number
  description?: string | null
  expense_account_id?: number | null
  creditor_account_id?: number | null
  amount_net?: number | string
  tax_amount?: number | string
  total_amount?: number | string
  allocation_method?: 'quantity' | 'weight' | 'none'
  distribution_snapshot?: Record<string, number> | null
  expense_account?: Account | null
  creditor_account?: Account | null
}

export interface SalesRep {
  id: number
  tenant_id: number
  name: string
  region: string | null
  address?: string | null
  phone?: string | null
  commission_percent: number
  is_active: boolean
  branches?: Branch[]
}

export interface DeliveryDriver {
  id: number
  tenant_id: number
  /** رقم/كود السائق (يتولد تلقائياً) */
  code: string
  name: string
  phone: string | null
  national_id?: string | null
  vehicle_type: string | null
  custody_account_id: number
  is_active: boolean
  notes?: string | null
  custody_account?: Pick<Account, 'id' | 'code' | 'name' | 'name_en'> | null
  branches?: Branch[]
}

export interface DeliveryAssignment {
  id: number
  tenant_id: number
  invoice_id: number
  driver_id: number
  status: string
  custody_amount: number
  custody_transfer_journal_entry_id?: number | null
  assigned_at?: string | null
  delivered_at?: string | null
  settled_at?: string | null
  driver?: DeliveryDriver | null
  invoice?: Invoice | null
}

export interface Invoice {
  id: number
  number: string
  reference_number?: string | null
  type: 'sales' | 'purchase'
  is_return?: boolean
  parent_invoice_id?: number | null
  status: string
  document_status?: string | null
  payment_status?: string | null
  date: string
  due_date: string | null
  customer_id: number | null
  vendor_id: number | null
  sales_rep_id?: number | null
  parent_invoice?: Invoice | null
  quotation_id?: number | null
  quotation?: Quotation | null
  branch_id?: number | null
  /** وردية نقطة البيع — إن وُجدت تُعامل الفاتورة كفاتورة POS للطباعة */
  pos_shift_id?: number | null
  pos_session_id?: number | null
  /** اسم الفرع من رأس الفاتورة (يُعاد من الـ API في GET واحد) */
  branch_name?: string | null
  warehouse_id?: number | null
  cost_center_id?: number | null
  /** اسم مركز التكلفة من رأس الفاتورة */
  cost_center_name?: string | null
  payment_method_id?: number | null
  receipt_status?: string | null
  payment_timing?: string | null
  subtotal: number
  tax_amount: number
  discount_amount: number
  total: number
  amount_paid: number
  balance: number
  journal_entry_id: number | null
  manufacturing_journal_entry_id?: number | null
  /** فاتورة تضمنت تصنيعاً آلياً (BOM عند البيع) بعد الترحيل */
  auto_manufacturing_applied?: boolean
  notes: string | null
  /** رسوم توصيل/نقل (مبيعات) */
  delivery_fees?: Array<{ type?: string; label?: string; amount: number; account_id?: number | null }> | null
  delivery_fees_total?: number
  attachment?: string | null
  attachment_url?: string | null
  currency?: string | null
  lines: InvoiceLine[]
  additional_expenses?: InvoiceAdditionalExpense[]
  customer?: Customer
  vendor?: Vendor
  salesRep?: SalesRep | null
  branch?: { id: number; name: string } | null
  warehouse?: { id: number; name: string; code?: string } | null
  costCenter?: { id: number; name: string } | null
  paymentMethod?: { id: number; name: string; name_en: string | null; type?: string | null } | null
  /** نفس `paymentMethod` — يأتي من الـ API بصيغة snake_case */
  payment_method?: { id: number; name: string; name_en: string | null; type?: string | null } | null
  metadata?: Record<string, unknown> | null
  created_by?: number | null
  createdBy?: { id: number; name: string } | null
  journal_entry?: JournalEntry | null
  manufacturing_journal_entry?: JournalEntry | null
  payments?: Payment[]
  order_type?: 'dine_in' | 'takeaway' | 'delivery' | null
  table_id?: number | null
  table?: { id: number; name: string } | null
  /** معرف جدول التقسيط إن وُجد (قد يُعاد من الـ API مع أو بدون كائن installment) */
  installment_id?: number | null
  /** جدول تقسيط مرتبط بالفاتورة (يُجلب للطباعة) */
  installment?: Installment | null
  /** جاهزة لشاشة التوصيل */
  delivery_ready_at?: string | null
}

export interface QuotationLine {
  id?: number
  quotation_id?: number
  item_id: number | null
  unit_id?: number | null
  description: string
  quantity: number
  unit_price: number
  discount_percent: number
  tax_percent: number
  amount?: number
  tax_amount?: number
  total?: number
  sort_order?: number
  item?: Item
  unit?: ItemUnit | null
}

export interface Quotation {
  id: number
  number: string
  reference_number?: string | null
  type: 'sales' | 'purchase'
  status: 'draft' | 'approved' | 'converted'
  date: string
  valid_until?: string | null
  customer_id: number | null
  vendor_id: number | null
  branch_id?: number | null
  cost_center_id?: number | null
  subtotal: number
  tax_amount: number
  discount_amount: number
  total: number
  currency?: string | null
  exchange_rate?: number
  notes: string | null
  created_by?: number | null
  lines: QuotationLine[]
  customer?: Customer
  vendor?: Vendor
  branch?: { id: number; name: string } | null
  costCenter?: { id: number; name: string } | null
  createdBy?: { id: number; name: string } | null
  convertedInvoice?: Invoice | null
}

/** حمولة إنشاء فاتورة من عرض سعر (للتحويل الجزئي يُعدّل المستخدم الكميات في واجهة الفاتورة) */
export interface QuotationToInvoicePayload {
  quotation_id: number
  quotation_number: string
  type: 'sales' | 'purchase'
  customer_id: number | null
  vendor_id: number | null
  branch_id: number | null
  cost_center_id: number | null
  date: string
  due_date?: string | null
  reference_number?: string | null
  notes?: string | null
  currency?: string | null
  exchange_rate?: number
  discount_amount?: number
  lines: Array<{
    item_id: number | null
    unit_id?: number | null
    description: string
    quantity: number
    unit_price: number
    discount_percent: number
    tax_percent: number
  }>
}

export interface PurchaseRequestLine {
  id?: number
  purchase_request_id?: number
  item_id: number | null
  unit_id?: number | null
  description: string
  quantity: number
  unit_price: number
  discount_percent: number
  tax_percent: number
  amount?: number
  tax_amount?: number
  total?: number
  sort_order?: number
  item?: Item
  unit?: ItemUnit | null
}

export interface PurchaseRequest {
  id: number
  number: string
  date: string
  vendor_id: number | null
  branch_id: number | null
  warehouse_id: number | null
  reference_number?: string | null
  subtotal: number
  tax_amount: number
  discount_amount: number
  total: number
  notes: string | null
  created_by?: number | null
  lines: PurchaseRequestLine[]
  vendor?: Vendor | null
  branch?: Branch | null
  warehouse?: Warehouse | null
  createdBy?: { id: number; name: string } | null
}

/** حمولة إنشاء فاتورة مشتريات من طلب شراء (مرجع = رقم الطلب) */
export interface PurchaseRequestToInvoicePayload {
  type: 'purchase'
  is_return: boolean
  vendor_id: number | null
  branch_id: number | null
  warehouse_id: number | null
  date: string
  due_date?: string | null
  reference_number?: string | null
  notes?: string | null
  discount_amount?: number
  lines: Array<{
    item_id: number | null
    unit_id?: number | null
    description: string
    quantity: number
    unit_price: number
    discount_percent: number
    tax_percent: number
  }>
}

export interface JournalEntryLine {
  id?: number
  account_id: number
  debit: number
  credit: number
  description: string | null
  cost_center_id?: number | null
  account?: Account
  cost_center?: { id: number; name: string; name_en?: string | null } | null
}

export interface JournalEntrySource {
  type: 'invoice' | 'payment'
  id: number
  number?: string
  payment_type?: string
}

export interface JournalEntry {
  id: number
  number: string
  date: string
  type: string
  description: string | null
  customer_id: number | null
  vendor_id: number | null
  total_debit: number
  total_credit: number
  /** إجمالي الفاتورة المرتبطة (لعرض القيود المشتريات بنفس إجمالي فاتورة المشتريات) */
  invoice_total?: number | null
  status: string
  branch_id?: number | null
  branch?: { id: number; name: string; name_en?: string | null } | null
  lines: JournalEntryLine[]
  reference_type?: string | null
  reference_id?: number | null
  source?: JournalEntrySource | null
  customer?: Customer | null
  vendor?: Vendor | null
  created_by?: number | null
}

/** سنة مالية — إقفال، قفل، لقطات أرصدة/مخزون */
export interface FiscalYear {
  id: number
  tenant_id: number
  year: number
  start_date: string
  end_date: string
  is_closed: boolean
  closed_at: string | null
  is_locked: boolean
  locked_at: string | null
  closing_journal_entry_id: number | null
  retained_earnings_account_id?: number | null
  opening_journal_entry_id: number | null
  closing_journal_entry?: { id: number; number: string; date: string } | null
  retained_earnings_account?: { id: number; code: string; name: string } | null
  opening_journal_entry?: { id: number; number: string; date: string } | null
  opening_balances_snapshot?: unknown
  inventory_snapshot?: unknown
  inventory_carried_forward?: boolean
  notes?: string | null
  closed_by?: number | null
  closing_summary?: {
    total_revenue?: number
    total_cogs?: number
    total_expenses?: number
    net_profit?: number
  } | null
}

export type PaymentStatus = 'draft' | 'approved' | 'posted' | 'cancelled'

export interface Payment {
  id: number
  number: string
  type: 'receipt' | 'payment' | 'transfer' | 'refund'
  date: string
  amount: number
  currency?: string | null
  payment_method: string | null
  reference: string | null
  customer_id: number | null
  vendor_id: number | null
  sales_rep_id?: number | null
  branch_id?: number | null
  cost_center_id?: number | null
  cash_bank_account_id?: number | null
  counterpart_account_id?: number | null
  notes: string | null
  attachment?: string | null
  attachment_url?: string | null
  status?: PaymentStatus | string
  payment_method_id?: number | null
  customer?: Customer
  vendor?: Vendor
  salesRep?: SalesRep | null
  paymentMethodRelation?: { id: number; name: string; name_en: string | null; type: string; linked_account_id?: number | null; linkedAccount?: Account | null } | null
  payment_method_relation?: { id: number; name: string; name_en: string | null; type: string; linked_account_id?: number | null; linkedAccount?: Account | null; linked_account?: Account | null } | null
  branch?: { id: number; name: string } | null
  costCenter?: { id: number; name: string } | null
  cashBankAccount?: Account | null
  counterpartAccount?: Account | null
  cash_bank_account?: Account | null
  counterpart_account?: Account | null
  journalEntry?: JournalEntry | null
  journal_entry?: JournalEntry | null
  invoice_id?: number | null
  invoice?: { id: number; number: string; status?: string } | null
  journal_entry_id?: number | null
  /** معرّف فقط، أو كائن المستخدم عند eager load (يستبدل العدد في JSON من Laravel) */
  created_by?: number | { id: number; name: string } | null
  createdBy?: { id: number; name: string } | null
}

export interface InventoryMovement {
  id: number
  date: string
  type: 'in' | 'out' | 'adjustment' | 'transfer'
  quantity: number
  unit_cost: number
  total_cost: number
  balance_after?: number
  notes: string | null
  reference_type: string | null
  reference_id: number | null
  created_by: string | null
  created_at: string
  item?: Item
}

export interface InventoryAdjustmentLine {
  id: number
  inventory_adjustment_id: number
  item_id: number
  quantity: number
  display_quantity?: number | null
  unit_id?: number | null
  conversion_factor?: number | null
  unit_cost: number
  total_cost: number
  action?: 'add' | 'subtract' | null
  item?: Item | null
}

export interface InventoryAdjustment {
  id: number
  number?: string | null
  adjustment_type: 'in' | 'out'
  warehouse_id: number | null
  target_account_id?: number | null
  branch_id?: number | null
  cost_center_id?: number | null
  date: string
  notes?: string | null
  status?: string
  journal_entry_id?: number | null
  attachment?: string | null
  attachment_url?: string | null
  lines?: InventoryAdjustmentLine[]
  warehouse?: { id: number; name: string; code?: string } | null
  targetAccount?: { id: number; code: string; name: string; name_en?: string | null } | null
  createdBy?: { id: number; name: string } | null
  /** مفاتيح Laravel JSON (snake_case) عند تحميل العلاقات */
  target_account?: { id: number; code: string; name: string; name_en?: string | null } | null
  /** قد يكون معرفًا فقط أو كائن المستخدم عند eager load */
  created_by?: number | { id: number; name: string } | null
}

export interface InventoryReportItem {
  id: number
  code: string
  name: string
  unit: string
  category: string | null
  category_id?: number | null
  brand_id?: number | null
  opening_balance?: number | null
  incoming?: number | null
  outgoing?: number | null
  current_stock: number
  stock_breakdown?: { unit_id: number; unit_name: string; quantity: number }[]
  cost_price: number
  selling_price: number
  average_cost: number
  average_selling: number
  stock_value: number
  min_quantity: number
  is_low_stock: boolean
}

export interface InventoryReport {
  items: InventoryReportItem[]
  summary: {
    total_items: number
    total_stock_value: number
    low_stock_count: number
    /** أصناف أُخفيت لأنها لا تربط وحدة العرض المختارة (وضع hide) */
    items_omitted_without_unit?: number
    display_unit_id?: number | null
    display_unit_label?: string | null
    unit_no_match_mode?: 'hide' | 'show_zero' | null
  }
}

/** صف تقرير جرد المتغيرات (من inventory_movements.item_variant_id) */
export interface VariantInventoryRow {
  id: number
  item_id: number
  item_code: string
  item_name: string
  item_unit: string
  variant_name: string
  options: Record<string, string>
  options_display: string
  barcode: string | null
  sku: string | null
  current_stock: number
  average_cost: number
  stock_value: number
}

export interface VariantInventoryReportResponse {
  data: VariantInventoryRow[]
  meta: { current_page: number; last_page: number; per_page: number; total: number }
  summary: { total_stock_value: number; total_quantity: number }
}

export interface DashboardChartPoint {
  period_label: string
  sales: number
  purchases: number
  expenses: number
}

export interface DashboardTopSellingItem {
  item_id: number
  name: string
  quantity_sold: number
  revenue: number
}

export interface DashboardData {
  currency: { code: string; symbol: string; decimal_places?: number }
  filter: { period: string; from_date: string; to_date: string }
  summary: {
    total_sales: number
    total_purchases: number
    total_expenses: number
    total_sales_returns?: number
    sales_count?: number
    purchases_count?: number
    total_receivable: number
    total_payable: number
    overdue_invoices: number
    customers_count: number
    vendors_count: number
    items_count: number
    net_profit?: number
    bank_balance?: number
    /** إجمالي تكلفة الرواتب للفترة (من مسيرات الرواتب المعتمدة) */
    payroll_total_gross?: number
    /** متوسط تكلفة الرواتب اليومية (إجمالي الرواتب ÷ عدد أيام الفترة) */
    payroll_daily_cost?: number
  }
  chart_data: DashboardChartPoint[]
  top_selling_items?: DashboardTopSellingItem[]
  recent_sales: Invoice[]
  recent_payments: Payment[]
  low_stock_items: { id: number; name: string; code: string; current_stock: number; min_quantity: number }[]
  pulse?: {
    net_profit: number
    cash_flow_sparkline: { date: string; value: number }[]
  }
  notifications?: {
    due_purchase_invoices: { id: number; number: string; due_date: string; balance: number }[]
    due_purchase_count: number
    low_stock_count: number
  }
  pos_peak_hours?: { hour: number; count: number; total: number }[]
  expense_breakdown?: {
    account_id: number
    account_name: string
    amount: number
    journal_entry_ids: number[]
  }[]
  gap_analysis?: { expected_sales: number; bank_deposits: number; gap: number }
  predictive?: { next_month_sales_forecast: number; cash_burn_rate_per_day: number }
}

export interface PaymentMethod {
  id: number
  name: string
  name_en: string | null
  type: 'cash' | 'bank' | 'credit' | 'other'
  linked_account_id: number | null
  linked_account?: Account | null
  users?: { id: number; name: string }[]
  /** معرّفات المستخدمين المرتبطين (إرسال للـ API عند الحفظ) */
  user_ids?: number[]
  is_active: boolean
}

export interface Currency {
  id: number
  code: string
  name: string
  name_en: string | null
  symbol: string | null
  decimal_places: number
  exchange_rate: number
  is_default: boolean
  is_active: boolean
  /** Set when rates are fetched / updated (API `rate_date`). */
  rate_date?: string | null
}

export interface Warehouse {
  id: number
  tenant_id: number
  name: string
  name_en?: string | null
  code: string
  address?: string | null
  phone?: string | null
  is_active: boolean
  branch_id?: number | null
  applies_to_all_branches?: boolean
  user_id?: number | null
  responsible_employee_id?: number | null
  branch?: Branch | null
  branches?: Branch[]
  user?: { id: number; name: string } | null
  responsible_employee?: { id: number; code: string; name: string } | null
}

export interface TransferLine {
  id: number
  transfer_header_id: number
  item_id: number
  quantity: number
  unit_cost: number
  total_cost: number
  item?: Item
}

export interface TransferHeader {
  id: number
  tenant_id: number
  number: string
  from_warehouse_id: number
  to_warehouse_id: number
  branch_id?: number | null
  cost_center_id?: number | null
  status: 'draft' | 'in_transit' | 'received'
  date: string
  notes?: string | null
  created_by?: number | null
  from_warehouse?: Warehouse
  to_warehouse?: Warehouse
  branch?: Branch | null
  cost_center?: CostCenter | null
  lines?: TransferLine[]
  createdByUser?: { id: number; name: string }
}

export interface Branch {
  id: number
  name: string
  name_en: string | null
  code: string
  address: string | null
  phone: string | null
  manager_name: string | null
  is_active: boolean
}

// ──── Installments ────
export interface InstallmentLine {
  id?: number
  installment_id?: number
  sequence: number
  due_date: string
  amount: number
  paid_amount?: number
  status?: 'pending' | 'partial' | 'paid' | 'overdue'
  remaining?: number
  paid_at?: string | null
  payment_id?: number | null
  payment?: { id: number; number: string; type?: string } | null
}

export interface Installment {
  id: number
  tenant_id: number
  number: string
  invoice_id?: number | null
  customer_id?: number | null
  vendor_id?: number | null
  account_id?: number | null
  total_amount: number
  currency: string | null
  start_date: string
  frequency_months: number
  status: 'draft' | 'approved'
  journal_entry_id: number | null
  approved_at: string | null
  branch_id: number | null
  cost_center_id?: number | null
  created_by: number | null
  notes: string | null
  customer?: Customer | null
  vendor?: Vendor | null
  invoice?: Invoice | null
  account?: Account | null
  lines?: InstallmentLine[]
  branch?: Branch | null
  cost_center?: CostCenter | null
  journalEntry?: { id: number; number?: string } | null
  journal_entry?: { id: number; number?: string } | null
  total_paid?: number
  total_remaining?: number
}

export interface InstallmentPeriod {
  id: number
  code: string
  months: number
  name: string
  name_en: string | null
  enabled: boolean
}

export interface CostCenter {
  id: number
  code: string
  name: string
  name_en: string | null
  description: string | null
  parent_id: number | null
  is_active: boolean
  parent?: CostCenter | null
  children?: CostCenter[]
}

export interface OpeningStockItem {
  id?: number
  item_id: number
  quantity: number
  unit_cost: number
  total_cost: number
  cost_center_id?: number | null
  item?: Item
  cost_center?: CostCenter | null
}

export interface OpeningStockHeader {
  id: number
  tenant_id: number
  branch_id: number
  warehouse_id?: number | null
  date: string
  reference_number: string | null
  notes: string | null
  status: 'draft' | 'approved'
  journal_entry_id: number | null
  created_by: number | null
  approved_by: number | null
  approved_at: string | null
  branch?: Branch
  warehouse?: Warehouse | null
  createdBy?: { id: number; name: string }
  approvedBy?: { id: number; name: string }
  journal_entry?: JournalEntry | null
  items: OpeningStockItem[]
}

// ──── Manufacturing (BOM & Production Orders) ────
export interface BillOfMaterialLine {
  id?: number
  bill_of_material_id?: number
  component_item_id: number
  quantity: number
  unit_id?: number | null
  unit_cost?: number | null
  /** متوفر عند تمرير warehouse_id لـ BOM (مخزن سحب الخام) */
  current_stock?: number | null
  sort_order?: number
  componentItem?: Item
  /** كما في استجابة Laravel JSON */
  component_item?: Item
  unit?: ItemUnit | null
  line_total?: number
}

export interface BillOfMaterial {
  id: number
  tenant_id: number
  finished_item_id: number
  name: string | null
  is_active: boolean
  finishedItem?: Item
  lines: BillOfMaterialLine[]
  total_cost?: number
}

export interface ProductionOrderMaterial {
  id: number
  production_order_id: number
  item_id: number
  quantity_required: number
  quantity_consumed: number
  unit_cost: number
  total_cost: number
  item?: Item
}

export interface ProductionOrderExpense {
  id: number
  production_order_id: number
  expense_account_id: number
  description: string | null
  amount: number
  sort_order?: number
  journal_entry_id?: number | null
  expense_account?: Account
  expenseAccount?: Account
  journal_entry?: { id: number; number?: string } | null
  journalEntry?: { id: number; number?: string } | null
}

export interface ProductionOrder {
  id: number
  tenant_id: number
  number: string
  order_date: string
  finished_item_id: number
  quantity: number
  bill_of_material_id: number
  status: 'draft' | 'approved' | 'completed'
  raw_warehouse_id: number | null
  finished_warehouse_id: number | null
  branch_id: number | null
  cost_center_id: number | null
  created_by?: number | null
  total_cost: number
  overhead_cost?: number | null
  /** كميات مخصصة لسطور BOM: [{ bom_line_id, qty_display }] بوحدة السطر في قائمة المواد */
  line_overrides?: { bom_line_id: number; qty_display: number }[] | null
  approved_at: string | null
  approved_by: number | null
  notes: string | null
  /** من الـ API (Laravel يرسل العلاقات بصيغة snake_case) */
  finished_item?: Item
  finishedItem?: Item
  bill_of_material?: BillOfMaterial
  billOfMaterial?: BillOfMaterial
  rawWarehouse?: Warehouse | null
  finishedWarehouse?: Warehouse | null
  branch?: Branch | null
  materials?: ProductionOrderMaterial[]
  expenses?: ProductionOrderExpense[]
  createdByUser?: { id: number; name: string } | null
  approvedByUser?: { id: number; name: string } | null
}

export interface PaginatedResponse<T> {
  data: T[]
  current_page: number
  last_page: number
  per_page: number
  total: number
}

export interface AccountStatementLine {
  date: string
  reference_number: string
  operation_type: string
  operation_code?: string
  description: string | null
  debit: number
  credit: number
  running_balance: number
  journal_entry_id?: number | null
  reference_type?: string | null
  reference_id?: number | null
  branch_id?: number | null
  cost_center_id?: number | null
  branch_name?: string | null
  branch_name_en?: string | null
  cost_center_name?: string | null
  cost_center_name_en?: string | null
}

export interface AccountStatementResponse {
  company: {
    name: string
    logo: string | null
    address: string | null
    phone: string | null
    email: string | null
    tax_registration_number: string | null
  } | null
  statement_number: string
  issue_date: string
  account: {
    id: number
    code: string
    name: string
    name_en: string | null
    account_holder?: string
    phone?: string | null
    address?: string | null
    tax_number?: string | null
  }
  period: { from: string; to: string }
  opening_balance: number
  /** تاريخ «حتى» للرصيد السابق (اليوم السابق لبداية الفترة) */
  opening_balance_as_of?: string | null
  /** يُستخدم مع إعدادات الفترة في الواجهة */
  show_previous_balance?: boolean
  lines: AccountStatementLine[]
  total_debit: number
  total_credit: number
  closing_balance: number
  balance_type: 'debit' | 'credit'
  /** إن وُجد: الحساب مرتبط بعميل — يمكن إظهار خيار «تضمين الأقساط» في كشف الحساب */
  linked_customer_id?: number | null
  /** false عندما يُستثنَت حركات التصنيف للأقساط وقيود الفواتير المرتبطة بجدول أقساط معتمد */
  installment_lines_included?: boolean
}

export interface CustomerBalanceRow {
  customer_id: number
  account_id: number
  account_code: string
  customer_name: string
  customer_name_en: string | null
  total_debit: number
  total_credit: number
  balance: number
  last_transaction_date: string | null
  credit_limit: number | null
}

export interface CustomerBalancesResponse {
  company: {
    name: string
    logo: string | null
    address: string | null
    phone: string | null
    email: string | null
  } | null
  as_of_date: string
  data: CustomerBalanceRow[]
}

export type CustomerAgingBucketDetailKey =
  | 'not_yet_due'
  | 'days_1_30'
  | 'days_31_60'
  | 'days_61_90'
  | 'over_90'

export interface CustomerAgingInvoiceDetail {
  invoice_id: number
  number: string
  due_date: string
  balance: number
}

export interface CustomerAgingRow {
  customer_id: number
  account_code: string
  customer_name: string
  customer_name_en: string | null
  branch_name: string | null
  branch_name_en: string | null
  sales_rep_name: string | null
  not_yet_due: number
  days_1_30: number
  days_31_60: number
  days_61_90: number
  over_90: number
  total: number
  /** فواتير مكونة لكل خانة (للتفاصيل عند النقر) */
  details?: Record<CustomerAgingBucketDetailKey, CustomerAgingInvoiceDetail[]>
}

export interface CustomerAgingResponse {
  company: { name?: string; logo?: string; address?: string } | null
  as_of_date: string
  data: CustomerAgingRow[]
}

export type CustomerSalesTier = 'none' | 'acceptable' | 'good' | 'very_good' | 'premium'

export type CustomerAnalysisSortBasis =
  | 'total_sales'
  | 'invoice_count'
  | 'total_qty'
  | 'total_profit'

export interface CustomerAnalysisRow {
  customer_id: number
  account_code: string
  customer_name: string
  customer_name_en: string | null
  invoice_count: number
  total_sales: number
  total_qty: number
  total_profit: number
  pct_of_company: number
  sales_tier: CustomerSalesTier
}

export interface CustomerAnalysisResponse {
  company: { name?: string; logo?: string; address?: string } | null
  from_date: string
  to_date: string
  company_total_sales: number
  sort_basis: CustomerAnalysisSortBasis
  data: CustomerAnalysisRow[]
}

export interface AccountLastMovementLine {
  date: string
  reference_number: string
  operation_type: string
  description: string
  debit: number
  credit: number
}

export interface VendorBalanceRow {
  vendor_id: number
  account_id: number
  account_code: string
  vendor_name: string
  vendor_name_en: string | null
  total_debit: number
  total_credit: number
  balance: number
  last_transaction_date: string | null
}

export interface VendorBalancesResponse {
  company: {
    name: string
    logo: string | null
    address: string | null
    phone: string | null
    email: string | null
  } | null
  as_of_date: string
  data: VendorBalanceRow[]
}

// ──── User Management (إدارة المستخدمين) ────
export interface TenantUserItem {
  id: number
  name: string
  email: string
  username?: string
  phone?: string | null
  tenant_id: number
  pivot: {
    id?: number
    role: string
    role_id: number | null
    role_name: string
    permissions: string[] | null
    is_active: boolean
    default_branch_id?: number | null
    default_warehouse_id?: number | null
    restrict_to_branch_warehouse?: boolean
  }
}

export interface Role {
  id: number
  tenant_id: number | null
  name: string
  slug: string
  description: string | null
  is_system: boolean
  permissions: string[]
  pricing_group_ids?: number[]
}

export interface Permission {
  id: number
  key: string
  module: string | null
  name_ar: string
  name_en: string | null
}

export interface AuditLogEntry {
  id: number
  tenant_id: number | null
  user_id: number | null
  action: string
  model_type: string | null
  model_id: number | null
  table_name: string | null
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
  user?: { id: number; name: string; email: string } | null
}

// ──── نقطة البيع (POS) ────
export interface PosItem {
  id: number
  code: string
  name: string
  name_en?: string | null
  barcode?: string | null
  sku?: string | null
  unit: string
  unit_id?: number | null
  selling_price: number
  type?: string
  track_quantity?: boolean
  min_quantity?: number | null
  current_stock?: number
  /** إجمالي كمية مباعة (فواتير مبيعات مرحّلة) — للترتيب والفئات الذكية */
  sales_count?: number
  /** صنف ظهرت عليه خصومات سطرية في مبيعات سابقة — فئة «العروض» */
  is_promo?: boolean
  image?: string | null
  image_url?: string | null
  category_id?: number | null
  category_name?: string | null
}

export interface PosShiftInfo {
  id: number
  tenant_id: number
  branch_id: number
  user_id: number
  opened_at: string
  closed_at?: string | null
  opening_cash: number
  closing_cash?: number | null
  status: string
  user?: { id: number; name: string }
  branch?: { id: number; name: string; code: string }
}

export interface PosCartLine {
  item_id: number
  item_name: string
  code: string
  quantity: number
  unit_price: number
  discount_percent: number
  tax_percent: number
  amount: number
  tax_amount: number
  total: number
  /** ملاحظة الكاشير على السطر (تُرسل كجزء من وصف البند في الفاتورة) */
  line_note?: string | null
}

export interface PosExpenseCategory {
  id: number
  name: string
  name_en?: string | null
  account_id: number
  account?: { id: number; name: string; code: string } | null
  is_active?: boolean
}

export interface PosExpenseItem {
  id: number
  name: string
  name_en?: string | null
  category_id: number
  category?: PosExpenseCategory | null
  is_active?: boolean
}

export interface PosXReport {
  generated_at: string
  shift_id: number
  opened_at: string
  invoices_count: number
  total_sales: number
  total_returns?: number
  returns_count?: number
  items_sold_count?: number
  total_tax?: number
  opening_cash: number
  cash_received: number
  expected_cash: number
  total_expenses?: number
  by_payment_method: Array<{ payment_method_id: number; name: string; type: string; amount: number; count: number }>
}

export interface PosZReport {
  generated_at: string
  shift_id: number
  opened_at: string
  closed_at: string
  invoices_count: number
  total_sales: number
  total_returns?: number
  returns_count?: number
  items_sold_count?: number
  total_tax?: number
  opening_cash: number
  closing_cash: number
  expected_cash: number
  total_expenses?: number
  difference: number
  by_payment_method: Array<{ payment_method_id: number; type: string; amount: number }>
}

/** صف تقرير ورديات نقطة البيع (قائمة) */
export interface PosShiftReportRow {
  id: number
  shift_number: string
  tenant_id: number
  branch_id: number
  user_id: number
  status: string
  opened_at: string
  closed_at?: string | null
  opening_balance: number
  closing_balance_system: number
  closing_balance_actual: number | null
  total_sales: number
  total_invoices: number
  total_returns?: number
  sales_by_payment: Record<string, number>
  by_payment_method?: Array<{ payment_method_id: number; name?: string; type: string; amount: number; count?: number }>
  difference: number | null
  /** إن وُجد: مرتبط بقيد محاسبي — لا يمكن إعادة فتح الوردية من الواجهة */
  journal_entry_id?: number | null
  cashier?: { id: number; name: string } | null
  branch?: { id: number; name: string; code?: string } | null
  totals_source?: string
}

export interface PosShiftsReportStats {
  total_shifts: number
  total_sales: number
  total_invoices: number
  avg_per_shift: number
  open_shifts: number
  shifts_with_diff: number
}

// ──── Restaurant Module ────
export interface RestaurantTable {
  id: number
  tenant_id: number
  branch_id?: number | null
  name: string
  code?: string | null
  section?: string | null
  capacity?: number | null
  status: 'available' | 'occupied' | 'cleaning'
  sort_order?: number
}

export interface RestaurantSection {
  id: number
  tenant_id: number
  branch_id?: number | null
  name: string
  name_en?: string | null
  code?: string | null
  sort_order?: number
  branch?: { id: number; name: string } | null
}

export interface KitchenTicketLine {
  id: number
  ticket_id: number
  invoice_line_id?: number | null
  item_name: string
  quantity: number
  modifiers_text?: string | null
  kitchen_note?: string | null
  is_completed?: boolean
}

export interface KitchenTicket {
  id: number
  tenant_id: number
  branch_id?: number | null
  table_id?: number | null
  invoice_id?: number | null
  status: 'pending' | 'in_progress' | 'done' | 'cancelled'
  created_at?: string
  table?: RestaurantTable | null
  invoice?: (Invoice & { created_by?: { id: number; name: string } | null }) | null
  lines?: KitchenTicketLine[]
}
