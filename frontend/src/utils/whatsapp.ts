/**
 * إرسال المستندات عبر واتساب — رابط مباشر (WhatsApp URL Scheme)
 * https://wa.me/<phone>?text=<encoded_text>
 * القوالب قابلة للضبط من إعدادات الرسائل (الإعدادات → إعدادات الرسائل).
 */

const DEFAULT_COUNTRY_CODE = '965' // الكويت — يُستبدل بإعداد whatsapp_default_country_code إن وُجد

/** استبدال المتغيرات في النص: {{name}} → value */
export function fillPlaceholders(template: string, data: Record<string, string | undefined>): string {
  let out = template
  for (const [key, value] of Object.entries(data)) {
    const placeholder = '{{' + key + '}}'
    out = out.split(placeholder).join(value ?? '')
  }
  return out
}

/** أكواد دول شائعة (بداية الرقم بعد إزالة غير الأرقام) */
const COUNTRY_CODE_PREFIXES = ['965', '966', '968', '971', '973', '974', '962', '963', '964', '20', '212', '213', '216', '218', '249']

/**
 * التحقق من أن رقم الهاتف يبدأ بكود دولة (لإجبار المستخدم على إدخال كود الدولة عند إضافة عميل/مورد).
 * إذا كان الحقل فارغاً يُعتبر صالحاً.
 */
export function phoneHasCountryCode(phone: string | null | undefined): boolean {
  if (!phone || typeof phone !== 'string') return true
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 0) return true
  return digits.length >= 10 && COUNTRY_CODE_PREFIXES.some((code) => digits.startsWith(code))
}

/**
 * تطبيع رقم الهاتف: إزالة المسافات والشرطات، وإضافة كود الدولة إن لم يكن موجوداً.
 * يُفترض أن الأرقام المحلية تبدأ بـ 5 أو 6 (كويت) أو بدون صفر في البداية.
 */
export function normalizePhone(phone: string | null | undefined, defaultCountryCode: string = DEFAULT_COUNTRY_CODE): string {
  if (!phone || typeof phone !== 'string') return ''
  let digits = phone.replace(/\D/g, '')
  if (digits.length === 0) return ''
  // إزالة صفر البداية إن وُجد (مثل 05xx → 5xx)
  if (digits.startsWith('0')) digits = digits.slice(1)
  // إذا الرقم قصير (مثلاً 8 أرقام) أو يبدأ بـ 5 أو 6 بدون كود دولة، نضيف الكود
  const hasCountryCode = digits.length >= 10 && (digits.startsWith('965') || digits.startsWith('966') || digits.startsWith('20') || digits.startsWith('962') || digits.startsWith('973') || digits.startsWith('974') || digits.startsWith('968'))
  if (!hasCountryCode && digits.length <= 9) {
    digits = defaultCountryCode + digits
  }
  return digits
}

/**
 * توليد رابط واتساب: wa.me/<phone>?text=<encoded_text>
 * النص يُرمّز بـ encodeURIComponent لضمان عمل العربية والرموز.
 */
export function buildWaLink(phone: string | null | undefined, text: string, defaultCountryCode?: string): string {
  const normalized = normalizePhone(phone, defaultCountryCode)
  const base = 'https://wa.me/'
  if (!normalized) return base // يفتح واتساب بدون رقم — المستخدم يختار جهة الاتصال
  const encoded = text ? '?text=' + encodeURIComponent(text) : ''
  return base + normalized + encoded
}

/**
 * فتح الرابط في علامة تبويب جديدة
 */
export function openWhatsApp(phone: string | null | undefined, text: string, defaultCountryCode?: string): void {
  const url = buildWaLink(phone, text, defaultCountryCode)
  window.open(url, '_blank', 'noopener,noreferrer')
}

// ──── قوالب الرسائل (من بيانات النظام) ────

export interface InvoiceTemplateData {
  customerName: string
  invoiceNumber: string
  total: string
  pdfOrViewUrl?: string
  lang?: 'ar' | 'en'
}

/** القالب الافتراضي للفاتورة (عربي) */
export const DEFAULT_TEMPLATE_INVOICE_AR =
  'السلام عليكم {{customerName}}،\n\nالفاتورة رقم: {{invoiceNumber}}\nالإجمالي: {{total}}\n\nرابط المعاينة/التحميل: {{pdfOrViewUrl}}'
/** القالب الافتراضي للفاتورة (إنجليزي) */
export const DEFAULT_TEMPLATE_INVOICE_EN =
  'Hello {{customerName}},\n\nInvoice #{{invoiceNumber}}\nTotal: {{total}}\n\nView/Download: {{pdfOrViewUrl}}'

export function messageTemplateInvoice(
  data: InvoiceTemplateData,
  customTemplateAr?: string | null,
  customTemplateEn?: string | null
): string {
  const { customerName, invoiceNumber, total, pdfOrViewUrl, lang = 'ar' } = data
  const template = lang === 'ar'
    ? (customTemplateAr && customTemplateAr.trim() ? customTemplateAr.trim() : DEFAULT_TEMPLATE_INVOICE_AR)
    : (customTemplateEn && customTemplateEn.trim() ? customTemplateEn.trim() : DEFAULT_TEMPLATE_INVOICE_EN)
  return fillPlaceholders(template, {
    customerName,
    invoiceNumber,
    total,
    pdfOrViewUrl: pdfOrViewUrl ?? '',
  })
}

export interface InstallmentTemplateData {
  customerName: string
  installmentAmount: string
  dueDate: string
  scheduleNumber?: string
  lang?: 'ar' | 'en'
}

/** القالب الافتراضي للأقساط (عربي) */
export const DEFAULT_TEMPLATE_INSTALLMENT_AR =
  'السلام عليكم {{customerName}}،\n\nقيمة القسط: {{installmentAmount}}\nتاريخ الاستحقاق: {{dueDate}}\nجدول رقم: {{scheduleNumber}}'
/** القالب الافتراضي للأقساط (إنجليزي) */
export const DEFAULT_TEMPLATE_INSTALLMENT_EN =
  'Hello {{customerName}},\n\nInstallment amount: {{installmentAmount}}\nDue date: {{dueDate}}\nSchedule: {{scheduleNumber}}'

export function messageTemplateInstallment(
  data: InstallmentTemplateData,
  customTemplateAr?: string | null,
  customTemplateEn?: string | null
): string {
  const { customerName, installmentAmount, dueDate, scheduleNumber = '', lang = 'ar' } = data
  const template = lang === 'ar'
    ? (customTemplateAr && customTemplateAr.trim() ? customTemplateAr.trim() : DEFAULT_TEMPLATE_INSTALLMENT_AR)
    : (customTemplateEn && customTemplateEn.trim() ? customTemplateEn.trim() : DEFAULT_TEMPLATE_INSTALLMENT_EN)
  return fillPlaceholders(template, {
    customerName,
    installmentAmount,
    dueDate,
    scheduleNumber,
  })
}

export interface ReceiptVoucherTemplateData {
  customerName: string
  amountReceived: string
  reference?: string
  voucherNumber?: string
  lang?: 'ar' | 'en'
}

/** القالب الافتراضي لسند القبض (عربي) */
export const DEFAULT_TEMPLATE_RECEIPT_AR =
  'السلام عليكم {{customerName}}،\n\nسند قبض – المبلغ المستلم: {{amountReceived}}\nرقم السند: {{voucherNumber}}\nالبيان: {{reference}}'
/** القالب الافتراضي لسند القبض (إنجليزي) */
export const DEFAULT_TEMPLATE_RECEIPT_EN =
  'Hello {{customerName}},\n\nReceipt voucher – Amount received: {{amountReceived}}\nVoucher no.: {{voucherNumber}}\nReference: {{reference}}'

export function messageTemplateReceiptVoucher(
  data: ReceiptVoucherTemplateData,
  customTemplateAr?: string | null,
  customTemplateEn?: string | null
): string {
  const { customerName, amountReceived, reference = '', voucherNumber = '', lang = 'ar' } = data
  const template = lang === 'ar'
    ? (customTemplateAr && customTemplateAr.trim() ? customTemplateAr.trim() : DEFAULT_TEMPLATE_RECEIPT_AR)
    : (customTemplateEn && customTemplateEn.trim() ? customTemplateEn.trim() : DEFAULT_TEMPLATE_RECEIPT_EN)
  return fillPlaceholders(template, {
    customerName,
    amountReceived,
    reference,
    voucherNumber,
  })
}
