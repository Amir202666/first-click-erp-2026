import Handlebars from 'handlebars'
import type { PrintDocumentType } from '../types/printTemplate'
import { ensurePrintTemplateHandlebarsHelpers } from './printTemplateHandlebarsHelpers'
import { upgradePrintVariableExpression } from './printDesignerVariable'

const baseCompany = {
  name: 'شركة الفرسان للتجارة',
  logo: null as string | null,
  phone: '0501234567',
  email: 'info@alforsan.com',
  address: 'الرياض، حي النزهة، شارع الملك فهد',
  cr: '1010123456',
  tax_no: '300123456700003',
  /** بعض القوالب تستخدم {{company.vat}} */
  vat: '300123456700003',
}

function voucherLike(prefix: string, amount: number) {
  return {
    number: `${prefix}-2024-0042`,
    date: '2024-01-15',
    time: '10:30 ص',
    amount: amount.toFixed(3),
    notes: 'شكراً لتعاملكم معنا',
  }
}

/** سياق تجريبي عربي كامل لكل نوع مستند — يغطي متغيرات المصمم والقوالب الجاهزة. */
const baseCurrency = { currency_code: 'SAR', currency_decimal_places: 2 }

export const PRINT_TEMPLATE_MOCK_BY_TYPE: Record<PrintDocumentType, Record<string, unknown>> = {
  invoice: {
    ...baseCurrency,
    accent_color: '#4f46e5',
    company: baseCompany,
    inv: {
      number: 'INV-2024-0128',
      date: '2024-01-15',
      due_date: '2024-02-15',
      type: 'ضريبية',
      payment: 'تحويل بنكي',
      payment_method: 'تحويل بنكي',
      notes: 'شكراً لتعاملكم معنا. يُرجى الاحتفاظ بهذه الفاتورة للمراجعة.',
      cashier: 'محمد علي',
      user: 'مدير النظام',
      status: 'مُرحّل — مدفوع جزئياً',
    },
    customer: {
      name: 'مؤسسة النور التجارية',
      phone: '0112345678',
      address: 'جدة، حي الروضة، شارع التحلية',
      vat: '310987654300003',
    },
    items: [
      { name: 'جهاز حاسوب محمول Dell', qty: 2, price: 3500, vat: 1050, total: 7000 },
      { name: 'طابعة HP LaserJet', qty: 1, price: 1200, vat: 180, total: 1200 },
      { name: 'خدمة الصيانة السنوية', qty: 3, price: 500, vat: 225, total: 1500 },
      { name: 'كابلات وملحقات', qty: 5, price: 80, vat: 60, total: 400 },
    ],
    subtotal: 10100,
    vat_amount: 1515,
    discount: 500,
    additions: 200,
    total_amount: 11115,
    paid: 8000,
    balance: 3115,
    change: 0,
    total: {
      subtotal: 10100,
      discount: 500,
      tax: 1515,
      net: 11115,
      additions: 200,
      paid: 8000,
      balance: 3115,
    },
    qr_code:
      'data:image/svg+xml,' +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect fill="#f1f5f9" width="80" height="80" rx="8"/><text x="40" y="46" text-anchor="middle" font-size="11" fill="#64748b">QR</text></svg>',
      ),
  },
  receipt: {
    ...baseCurrency,
    company: {
      name: baseCompany.name,
      address: 'الرياض، حي النزهة',
      phone: baseCompany.phone,
      tax_no: baseCompany.tax_no,
    },
    inv: { number: 'REC-2024-0042', date: '2024-01-15', time: '10:30 ص' },
    customer: { name: 'أحمد محمد العتيبي', phone: '0559876543' },
    voucher: voucherLike('REC', 2012.5),
    items: [
      { name: 'خدمة استشارية', qty: 2, price: 500, total: 1000 },
      { name: 'دعم تقني', qty: 1, price: 750, total: 750 },
    ],
    total: { subtotal: 1750, discount: 0, tax: 262.5, net: 2012.5 },
    subtotal: 1750,
    vat_amount: 262.5,
    paid: 2500,
    change: 487.5,
    notes: 'شكراً لتعاملكم معنا',
  },
  payment: {
    ...baseCurrency,
    company: {
      name: baseCompany.name,
      address: 'الرياض، حي النزهة',
      phone: baseCompany.phone,
    },
    inv: { number: 'PAY-2024-0033', date: '2024-01-15', time: '11:00 ص', notes: 'تم الاستلام بالكامل' },
    voucher: voucherLike('PAY', 5000),
    customer: { name: 'خالد سعد الغامدي', phone: '0551234567' },
    recipient: { name: 'مؤسسة الإمداد', phone: '0123456789' },
    amount: 5000,
    amount_text: 'خمسة آلاف ريال سعودي لا غير',
    method: 'تحويل بنكي',
    reason: 'سداد فاتورة رقم INV-2024-0120',
    notes: 'تم الاستلام بالكامل',
    items: [{ name: 'دفعة', qty: 1, price: 5000, total: 5000 }],
    total: { subtotal: 5000, discount: 0, tax: 0, net: 5000 },
  },
  pos: {
    ...baseCurrency,
    company: { name: 'مطعم الأصالة العربية', phone: '0501234567', address: 'الرياض', tax_no: '300111111100003', cr: '—', logo: null },
    inv: { number: '0042', date: '2024-01-15', time: '08:45 م' },
    cashier: 'محمد علي',
    table: 'طاولة 5',
    items: [
      { name: 'وجبة دجاج مشوي', qty: 2, price: 35, total: 70 },
      { name: 'عصير برتقال طازج', qty: 2, price: 12, total: 24 },
      { name: 'سلطة خضراء', qty: 1, price: 18, total: 18 },
      { name: 'خبز عربي', qty: 2, price: 5, total: 10 },
    ],
    total: { subtotal: 122, discount: 0, tax: 18.3, net: 140.3 },
    subtotal: 122,
    vat_amount: 18.3,
    paid: 150,
    change: 9.7,
  },
  journal: {
    ...baseCurrency,
    company: { name: baseCompany.name, tax_no: baseCompany.tax_no },
    inv: { number: 'JRN-2024-0055', date: '2024-01-15' },
    entry: {
      number: 'JRN-2024-0055',
      date: '2024-01-15',
      description: 'قيد تسوية رواتب شهر يناير 2024',
    },
    lines: [
      { account: '5001', account_name: 'مصروف الرواتب', debit: 45000, credit: 0, notes: 'رواتب الموظفين' },
      { account: '5010', account_name: 'مصروف التأمينات', debit: 4500, credit: 0, notes: 'حصة الشركة' },
      { account: '2001', account_name: 'رواتب مستحقة', debit: 0, credit: 42750, notes: 'صافي الرواتب' },
      { account: '2010', account_name: 'تأمينات مستحقة', debit: 0, credit: 6750, notes: 'تأمينات' },
    ],
    entries: [
      { account: '5001 - مصروف الرواتب', debit: 45000, credit: 0, notes: 'رواتب الموظفين' },
      { account: '5010 - مصروف التأمينات', debit: 4500, credit: 0, notes: 'حصة الشركة' },
      { account: '2001 - رواتب مستحقة', debit: 0, credit: 42750, notes: 'صافي الرواتب' },
      { account: '2010 - تأمينات مستحقة', debit: 0, credit: 6750, notes: 'تأمينات' },
    ],
    total_debit: 49500,
    total_credit: 49500,
    notes: 'معتمد من المدير المالي',
    items: [{ name: 'قيد يومية', qty: 1, price: 49500, total: 49500 }],
    total: { subtotal: 49500, discount: 0, tax: 0, net: 49500 },
  },
  purchase: {
    ...baseCurrency,
    company: { ...baseCompany },
    inv: {
      number: 'PO-2024-0088',
      date: '2024-01-15',
      due_date: '2024-02-15',
      payment: 'آجل',
      notes: 'يُرجى التسليم خلال 3 أيام عمل',
    },
    vendor: {
      name: 'مؤسسة الأمانة للتوريدات',
      phone: '0112223344',
      address: 'الدمام، حي الشاطئ',
      vat: '310111222300003',
    },
    customer: {
      name: 'مؤسسة الأمانة للتوريدات',
      phone: '0112223344',
      address: 'الدمام، حي الشاطئ',
    },
    items: [
      { name: 'ورق A4 (500 ورقة)', qty: 50, price: 25, vat: 3.75, total: 1250 },
      { name: 'أحبار طابعة HP', qty: 10, price: 85, vat: 12.75, total: 850 },
      { name: 'مستلزمات مكتبية متنوعة', qty: 1, price: 350, vat: 52.5, total: 350 },
    ],
    total: { subtotal: 2450, discount: 0, tax: 367.5, net: 2817.5 },
  },
  inventory: {
    ...baseCurrency,
    company: { name: baseCompany.name, address: 'الرياض' },
    inv: { number: 'ADJ-2024-0012', date: '2024-01-15' },
    adj: { number: 'ADJ-2024-0012', date: '2024-01-15', reason: 'جرد دوري شهري' },
    warehouse: { name: 'المستودع الرئيسي' },
    items: [
      {
        name: 'لابتوب Dell Inspiron',
        sku: 'SKU-DELL-01',
        qty: 4,
        price: 100,
        total: 400,
        qty_before: 40,
        qty_after: 44,
        before: 40,
        after: 44,
        diff: 4,
        type: 'زيادة',
      },
      {
        name: 'طابعة HP 1020',
        sku: 'SKU-HP-02',
        qty: 1,
        price: 50,
        total: 50,
        qty_before: 12,
        qty_after: 11,
        before: 12,
        after: 11,
        diff: -1,
        type: 'نقص',
      },
      {
        name: 'شاشة Samsung 24"',
        sku: 'SKU-SAM-03',
        qty: 0,
        price: 0,
        total: 0,
        qty_before: 25,
        qty_after: 25,
        before: 25,
        after: 25,
        diff: 0,
        type: 'مطابق',
      },
      {
        name: 'لوحة مفاتيح Logitech',
        sku: 'SKU-LOG-04',
        qty: 2,
        price: 30,
        total: 60,
        qty_before: 60,
        qty_after: 58,
        before: 60,
        after: 58,
        diff: -2,
        type: 'نقص',
      },
      {
        name: 'فأرة لاسلكية',
        sku: 'SKU-MOU-05',
        qty: 2,
        price: 25,
        total: 50,
        qty_before: 55,
        qty_after: 57,
        before: 55,
        after: 57,
        diff: 2,
        type: 'زيادة',
      },
    ],
    total_increase: 6,
    total_decrease: 3,
    notes: 'تمت مراجعة الجرد وتوقيعه من قبل أمين المستودع',
    approved_by: 'محمد عبدالله',
    total: { subtotal: 560, discount: 0, tax: 0, net: 560 },
  },
}

export type PrintTemplatePreviewResult =
  | { ok: true; html: string }
  | { ok: false; html: string; error: string }

function collapseFixedHeightTableWrappers(html: string): string {
  return html.replace(/height:\s*(\d+(?:\.\d+)?)mm/gi, (match, _num, offset) => {
    const before = html.slice(Math.max(0, offset - 300), offset)
    const after = html.slice(offset, offset + 1200)
    if (/position:\s*absolute/i.test(before) && /<table/i.test(after)) {
      return 'height:auto;min-height:0'
    }
    return match
  })
}

function stripEmptyRowsAfterEach(html: string): string {
  let out = html
  out = out.replace(/\{\{\/each\}\}\s*<tr[^>]*>[\s\S]*?<\/tr>/gi, '{{/each}}')
  out = out.replace(/<tr[^>]*>\s*<\/tr>/gi, '')
  out = out.replace(/<tr[^>]*>\s*(?:<td[^>]*>\s*<\/td>\s*)+<\/tr>/gi, '')
  return out
}

/** إزالة صف عيّنة/معاينة ثابت قبل حلقة الأصناف في قوالب قديمة */
function stripPlaceholderRowBeforeEach(html: string): string {
  return html.replace(
    /<tbody([^>]*)>\s*<tr[^>]*>[\s\S]*?\{\{[^}]+\}\}[\s\S]*?<\/tr>\s*(\{\{#each\s+items\}\})/gi,
    '<tbody$1>$2',
  )
}

/** إزالة ارتفاع ثابت من غلافات position:absolute التي تحتوي جدولاً */
function patchAbsoluteTableWrappers(html: string): string {
  return html.replace(/<div\b([^>]*?)style="([^"]*)"([^>]*)>/gi, (full, pre, style, post, offset) => {
    if (!/position\s*:\s*absolute/i.test(style)) return full
    const after = html.slice(offset + full.length, offset + full.length + 3000)
    if (!/<table\b/i.test(after)) return full
    let s = style
    const next = s
      .replace(/height\s*:\s*[\d.]+mm/gi, 'height:auto')
      .replace(/min-height\s*:\s*[\d.]+mm/gi, 'min-height:0')
      .replace(/max-height\s*:\s*[^;]+/gi, 'max-height:none')
      .replace(/overflow\s*:\s*hidden/gi, 'overflow:visible')
    if (next === s) return full
    return `<div${pre}style="${next}"${post}>`
  })
}

/** ترقية HTML محفوظ: إزالة صفوف فارغة وتنسيق المبالغ بدون رمز عملة */
export function upgradePrintTemplateHtml(html: string): string {
  let out = html
  out = stripPlaceholderRowBeforeEach(out)
  out = stripEmptyRowsAfterEach(out)
  out = patchAbsoluteTableWrappers(out)
  out = collapseFixedHeightTableWrappers(out)
  out = out.replace(
    /position:absolute;((?:left|top|width):[^;]+;)+height:\d+(?:\.\d+)?mm;overflow:hidden;box-sizing:border-box/gi,
    (m) =>
      m
        .replace(/height:\d+(?:\.\d+)?mm/i, 'height:auto;min-height:0')
        .replace(/overflow:hidden/i, 'overflow:visible'),
  )
  out = out.replace(/height:100%;overflow:auto/gi, 'height:auto;overflow:visible')
  if (/print-doc-abs-root/i.test(out)) {
    out = out.replace(/overflow\s*:\s*hidden/gi, 'overflow:visible')
    out = out.replace(/height\s*:\s*100%/gi, 'height:auto')
    out = out.replace(/white-space\s*:\s*nowrap/gi, 'white-space:normal')
    out = out.replace(/text-overflow\s*:\s*ellipsis/gi, '')
  }
  for (const [from, to] of Object.entries({
    'total.subtotal': 'subtotal',
    'total.discount': 'discount',
    'total.additions': 'additions',
    'total.tax': 'vat_amount',
    'total.net': 'total_amount',
    'total.paid': 'paid',
    'total.balance': 'balance',
  })) {
    const escaped = from.replace('.', '\\.')
    out = out.replace(new RegExp(`\\{\\{${escaped}\\}\\}`, 'g'), `{{formatNumber ${to}}}`)
  }
  out = out.replace(/\{\{[#/]?[^}]+\}\}/g, (tag) => {
    if (/^\{\{[#/]/.test(tag)) return tag
    return upgradePrintVariableExpression(tag)
  })
  return out
}

function tdInnerText(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim()
}

/** إزالة صفوف جدول فارغة بعد التصيير */
export function cleanupRenderedPrintHtml(html: string): string {
  let out = stripEmptyRowsAfterEach(html)
  out = out.replace(/<tbody([^>]*)>([\s\S]*?)<\/tbody>/gi, (_tb, attrs, inner) => {
    const cleaned = inner.replace(/<tr[^>]*>[\s\S]*?<\/tr>/gi, (row: string) => {
      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      if (cells.length === 0) return row
      const allBlank = cells.every((c) => {
        const t = tdInnerText(c[1])
        return t === '' || t === '—' || t === '-'
      })
      return allBlank ? '' : row
    })
    return `<tbody${attrs}>${cleaned}</tbody>`
  })
  return out
}

function filterNonemptyPrintItems(ctx: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(ctx.items)) return ctx
  const items = ctx.items.filter((item) => {
    if (!item || typeof item !== 'object') return false
    const o = item as Record<string, unknown>
    const name = String(o.name ?? '').trim()
    const nameOk = name.length > 0 && name !== '—' && name !== '-'
    const qty = Number(o.qty ?? o.quantity ?? 0)
    return nameOk || (Number.isFinite(qty) && qty !== 0)
  })
  return { ...ctx, items }
}

export type RenderPrintTemplatePreviewOptions = {
  /** عند false لا يُدمَج سياق تجريبي — للفواتير الحقيقية */
  useMockFallback?: boolean
}

export function renderPrintTemplatePreview(
  html: string,
  docType: PrintDocumentType,
  customData?: Record<string, unknown> | null,
  options?: RenderPrintTemplatePreviewOptions,
): PrintTemplatePreviewResult {
  ensurePrintTemplateHandlebarsHelpers()
  const src = upgradePrintTemplateHtml((html ?? '').trim())
  if (!src) {
    return { ok: true, html: '' }
  }
  try {
    const template = Handlebars.compile(src, { strict: false, noEscape: false })
    const useMock = options?.useMockFallback !== false
    const base = PRINT_TEMPLATE_MOCK_BY_TYPE[docType] ?? PRINT_TEMPLATE_MOCK_BY_TYPE.invoice
    const merged =
      !useMock && customData && Object.keys(customData).length > 0
        ? customData
        : customData && Object.keys(customData).length > 0
          ? { ...base, ...customData }
          : { ...base }
    const ctx = filterNonemptyPrintItems(merged as Record<string, unknown>)
    const raw = template(ctx)
    const out = cleanupRenderedPrintHtml(typeof raw === 'string' ? raw : String(raw))
    return { ok: true, html: out }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      html: `<div dir="rtl" style="padding:8px;font-size:11px;color:#b91c1c;background:#fef2f2;border-radius:8px;">خطأ في القالب: ${escapeAttr(
        msg,
      )}</div>`,
      error: msg,
    }
  }
}

function escapeAttr(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
}
