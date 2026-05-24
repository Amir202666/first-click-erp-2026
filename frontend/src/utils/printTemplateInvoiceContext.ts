import type { Currency, Invoice } from '../types'
import type { PrintDocumentType } from '../types/printTemplate'
import { coerceDecimalPlaces } from './currency'
import { invoiceDocumentStatus, invoicePaymentStatus } from './invoiceStatuses'
import { getLocalizedName } from './localizedName'

const DOC_STATUS_LABELS: Record<string, { ar: string; en: string }> = {
  draft: { ar: 'مسودة', en: 'Draft' },
  posted: { ar: 'مُرحّل', en: 'Posted' },
  cancelled: { ar: 'ملغاة', en: 'Cancelled' },
}

const PAY_STATUS_LABELS: Record<string, { ar: string; en: string }> = {
  na: { ar: 'غير منطبق', en: 'N/A' },
  unpaid: { ar: 'غير مدفوع', en: 'Unpaid' },
  partial: { ar: 'مدفوع جزئياً', en: 'Partially paid' },
  paid: { ar: 'مدفوع', en: 'Paid' },
  deferred: { ar: 'آجل', en: 'Deferred' },
  overdue: { ar: 'متأخر', en: 'Overdue' },
}

function invoiceAdditionsTotal(invoice: Invoice): number {
  const deliveryFromTotal = Number(invoice.delivery_fees_total ?? 0)
  const deliveryFromLines = (invoice.delivery_fees ?? []).reduce((s, f) => s + Number(f.amount ?? 0), 0)
  const delivery = deliveryFromTotal > 0 ? deliveryFromTotal : deliveryFromLines
  const expenses = (invoice.additional_expenses ?? []).reduce(
    (s, e) => s + Number(e.total_amount ?? e.amount_net ?? 0),
    0,
  )
  return delivery + expenses
}

function resolveCashierName(invoice: Invoice): string {
  const meta = invoice.metadata as Record<string, unknown> | null | undefined
  if (meta) {
    if (typeof meta.cashier === 'string' && meta.cashier.trim()) return meta.cashier.trim()
    if (typeof meta.cashier_name === 'string' && meta.cashier_name.trim()) return meta.cashier_name.trim()
  }
  return invoice.createdBy?.name?.trim() ?? ''
}

function resolveUserName(invoice: Invoice): string {
  return invoice.createdBy?.name?.trim() ?? ''
}

function invoiceStatusText(invoice: Invoice, lang: 'ar' | 'en'): string {
  const docKey = invoiceDocumentStatus(invoice)
  const payKey = invoicePaymentStatus(invoice)
  const L = lang === 'ar' ? 'ar' : 'en'
  const doc = DOC_STATUS_LABELS[docKey]?.[L] ?? docKey
  const pay = PAY_STATUS_LABELS[payKey]?.[L] ?? payKey
  return `${doc} — ${pay}`
}

const CURRENCY_SYMBOL_BY_CODE: Record<string, string> = {
  SAR: 'ر.س',
  KWD: 'د.ك',
  AED: 'د.إ',
  QAR: 'ر.ق',
  BHD: 'د.ب',
  OMR: 'ر.ع',
  EGP: 'ج.م',
  USD: '$',
  EUR: '€',
}

export function resolvePrintCurrencyLabel(
  code: string | null | undefined,
  currencies?: Array<Pick<Currency, 'code' | 'symbol' | 'decimal_places' | 'is_default'>>,
): string {
  const normalized = (code ?? '').trim().toUpperCase()
  if (!normalized) return 'ر.س'
  const fromList = currencies?.find((c) => (c.code ?? '').toUpperCase() === normalized)
  const sym = typeof fromList?.symbol === 'string' ? fromList.symbol.trim() : ''
  if (sym && !/^\d+$/.test(sym)) return sym
  return CURRENCY_SYMBOL_BY_CODE[normalized] ?? normalized
}

export type BuildInvoicePrintTemplateContextInput = {
  invoice: Invoice
  companyName: string
  companyAddress: string
  companyPhone: string
  companyEmail: string
  taxNumber: string
  companyLogo?: string | null
  currencies?: Array<Pick<Currency, 'code' | 'symbol' | 'decimal_places' | 'is_default'>>
  lang: 'ar' | 'en'
  formatDate: (date: string) => string
}

/** بيانات Handlebars لفاتورة حقيقية — متوافقة مع قوالب الطباعة الجديدة. */
export function buildInvoicePrintTemplateContext(
  input: BuildInvoicePrintTemplateContextInput,
): Record<string, unknown> {
  const { invoice, companyName, companyAddress, companyPhone, companyEmail, taxNumber, companyLogo, currencies, lang, formatDate } =
    input

  const party =
    invoice.type === 'sales'
      ? invoice.customer
      : invoice.type === 'purchase'
        ? invoice.vendor
        : null

  const partyName = party ? getLocalizedName(party, lang) : ''
  const partyPhone = (party as { phone?: string } | null)?.phone ?? ''
  const partyAddress = (party as { address?: string } | null)?.address ?? ''
  const partyVat = (party as { tax_number?: string } | null)?.tax_number ?? ''

  const subtotal = Number(invoice.subtotal ?? 0)
  const discount = Number(invoice.discount_amount ?? 0)
  const vatAmount = Number(invoice.tax_amount ?? 0)
  const total = Number(invoice.total ?? 0)
  const paid = Number(invoice.amount_paid ?? 0)
  const balance = Number(invoice.balance ?? 0)
  const change = Math.max(0, paid - total)
  const additions = invoiceAdditionsTotal(invoice)

  const items = (invoice.lines ?? [])
    .filter((line) => {
      const qty = Number(line.quantity ?? 0)
      const name = line.item ? getLocalizedName(line.item, lang) : (line.description ?? '').trim()
      const nameOk = name.length > 0 && name !== '—' && name !== '-'
      return nameOk || qty !== 0
    })
    .map((line) => {
    const qty = Number(line.quantity ?? 0)
    const price = Number(line.unit_price ?? 0)
    const lineTotal = Number(line.total ?? 0)
    const discPct = Number(line.discount_percent ?? 0)
    const taxPct = Number(line.tax_percent ?? 0)
    const base = qty * price * (1 - discPct / 100)
    const vat = taxPct > 0 ? base * (taxPct / 100) : 0
    return {
      name: line.item ? getLocalizedName(line.item, lang) : (line.description ?? '—'),
      code: (line.item as { code?: string } | undefined)?.code ?? '',
      qty,
      unit: (line.unit as { name?: string } | undefined)?.name ?? '',
      price,
      discount: Number(line.discount_percent ?? 0),
      vat,
      total: lineTotal,
    }
  })

  const company = {
    name: companyName,
    address: companyAddress,
    phone: companyPhone,
    email: companyEmail,
    tax_no: taxNumber,
    vat: taxNumber,
    logo: companyLogo ?? null,
  }

  const inv = {
    number: String(invoice.number ?? ''),
    date: formatDate(invoice.date),
    due_date: invoice.due_date ? formatDate(invoice.due_date) : '',
    payment: invoice.payment_timing ?? '',
    payment_method: invoice.payment_timing ?? '',
    notes: invoice.notes ?? '',
    cashier: resolveCashierName(invoice),
    user: resolveUserName(invoice),
    status: invoiceStatusText(invoice, lang),
  }

  const customer =
    invoice.type === 'sales'
      ? { name: partyName, phone: partyPhone, address: partyAddress, vat: partyVat }
      : { name: '', phone: '', address: '', vat: '' }

  const supplier =
    invoice.type === 'purchase'
      ? { name: partyName, phone: partyPhone, address: partyAddress, vat: partyVat }
      : { name: '', phone: '', address: '', vat: '' }

  const totalNum = total
  const currencyCode = (invoice.currency ?? '').trim().toUpperCase()
  const currencyModel =
    currencies?.find((c) => (c.code ?? '').toUpperCase() === currencyCode.toUpperCase()) ??
    currencies?.find((c) => c.is_default) ??
    currencies?.[0]
  const currency_decimal_places = coerceDecimalPlaces(currencyModel?.decimal_places, 2)

  return {
    company,
    inv,
    customer,
    supplier,
    vendor: supplier,
    items,
    currency_code: currencyCode,
    currency_decimal_places,
    subtotal,
    discount,
    vat_amount: vatAmount,
    total_amount: totalNum,
    paid,
    change,
    balance,
    additions,
    cashier: inv.cashier,
    /** كائن للمصمم الجديد ({{total.net}}) — formatNumber يدعم أيضاً استخراج net */
    total: {
      subtotal,
      discount,
      tax: vatAmount,
      net: totalNum,
      paid,
      balance,
      additions,
    },
  }
}

export function invoicePrintDocumentType(invoiceType: string | undefined): PrintDocumentType {
  return invoiceType === 'purchase' ? 'purchase' : 'invoice'
}

/** فاتورة صادرة من كاشير POS (وردية أو جلسة نقطة بيع) — ليست مطعم */
export function isPosInvoice(invoice: {
  pos_shift_id?: number | null
  pos_session_id?: number | null
  table_id?: number | null
  order_type?: string | null
  metadata?: Record<string, unknown> | null
} | null | undefined): boolean {
  if (!invoice) return false
  if (invoice.table_id != null && Number(invoice.table_id) > 0) return false
  if (invoice.order_type === 'dine_in') return false
  if (invoice.pos_shift_id != null && Number(invoice.pos_shift_id) > 0) return true
  if (invoice.pos_session_id != null && Number(invoice.pos_session_id) > 0) return true
  if (invoice.metadata && (invoice.metadata as { source?: string }).source === 'pos') return true
  return false
}

/** نوع قالب الطباعة المناسب للفاتورة */
export function resolveInvoicePrintDocumentType(
  invoice: { type?: string; pos_shift_id?: number | null; pos_session_id?: number | null; metadata?: Record<string, unknown> | null } | null | undefined,
  override?: PrintDocumentType,
): PrintDocumentType {
  if (override) return override
  if (isPosInvoice(invoice)) return 'pos'
  return invoicePrintDocumentType(invoice?.type)
}

export function printTemplatePageSizeCss(paper: string, orientation: string): string {
  if (paper === 'thermal_80') return '80mm auto'
  if (paper === 'thermal_58') return '58mm auto'
  if (paper === 'A5') return orientation === 'landscape' ? 'A5 landscape' : 'A5 portrait'
  return orientation === 'landscape' ? 'A4 landscape' : 'A4 portrait'
}
