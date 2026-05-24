import type { PrintDocumentType, PrintMargins, PrintOrientation, PrintPaperSize, PrintTemplate } from '../types/printTemplate'
import { paperContentSizeMm } from './printDesignerLayout'

export type PrintBlockType =
  | 'header'
  | 'info_row'
  | 'items_table'
  | 'totals'
  | 'notes'
  | 'footer'
  | 'divider'
  | 'spacer'
  | 'text'
  | 'image'
  | 'qr_code'
  | 'barcode'
  | 'signature'
  | 'two_columns'
  | 'receipt_header'
  | 'receipt_body'
  | 'signature_row'
  | 'pos_header'
  | 'pos_info'
  | 'pos_divider'
  | 'pos_items'
  | 'pos_totals'
  | 'pos_footer'
  | 'journal_info'
  | 'journal_table'
  | 'supplier_info'
  | 'inventory_info'
  | 'inventory_table'
  | 'inventory_summary'

export interface PrintBlock {
  id: string
  type: PrintBlockType
  label: string
  visible: boolean
  locked: boolean
  settings: Record<string, unknown>
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function styleColor(val: unknown, fallback: string): string {
  if (typeof val === 'string' && val.trim()) return val.trim()
  return fallback
}

function accentFromGlobal(g: Record<string, unknown>): string {
  const a = g.accent_color
  return typeof a === 'string' && a.trim() ? a.trim() : '#4f46e5'
}

export const DEFAULT_INVOICE_BLOCKS: PrintBlock[] = [
  {
    id: 'block_header',
    type: 'header',
    label: 'رأس الفاتورة',
    visible: true,
    locked: false,
    settings: {
      style: 'banner',
      showLogo: true,
      showCompanyName: true,
      showAddress: true,
      showPhone: true,
      showVat: true,
      showInvoiceNumber: true,
      showInvoiceLabel: true,
      invoiceLabel: 'فاتورة ضريبية',
      bgColor: '{{accent_color}}',
      textColor: '#ffffff',
      height: 'auto',
      padding: '20px 24px',
    },
  },
  {
    id: 'block_info',
    type: 'info_row',
    label: 'معلومات العميل والتواريخ',
    visible: true,
    locked: false,
    settings: {
      showCustomerName: true,
      showCustomerPhone: true,
      showCustomerAddress: true,
      showCustomerVat: true,
      showDate: true,
      showDueDate: true,
      showPaymentMethod: true,
      showInvoiceType: true,
      bgColor: '#f8fafc',
      borderAccent: true,
    },
  },
  {
    id: 'block_table',
    type: 'items_table',
    label: 'جدول الأصناف',
    visible: true,
    locked: false,
    settings: {
      columns: ['index', 'name', 'qty', 'price', 'vat', 'total'],
      headerBg: '{{accent_color}}',
      headerColor: '#ffffff',
      stripedRows: true,
      showBorder: false,
      fontSize: 11,
      columnLabels: {
        index: '#',
        name: 'الصنف / الخدمة',
        qty: 'الكمية',
        price: 'سعر الوحدة',
        vat: 'الضريبة',
        total: 'الإجمالي',
      },
    },
  },
  {
    id: 'block_totals',
    type: 'totals',
    label: 'الإجماليات',
    visible: true,
    locked: false,
    settings: {
      showSubtotal: true,
      showDiscount: true,
      showVat: true,
      showTotal: true,
      showPaid: false,
      showChange: false,
      totalBg: '{{accent_color}}',
      totalColor: '#ffffff',
      alignment: 'left',
      width: '280px',
      vatLabel: 'ضريبة القيمة المضافة (15%)',
    },
  },
  {
    id: 'block_notes',
    type: 'notes',
    label: 'الملاحظات',
    visible: true,
    locked: false,
    settings: {
      showNotes: true,
      showSignature: true,
      signatureLabel: 'التوقيع والختم',
      label: 'ملاحظات:',
    },
  },
  {
    id: 'block_footer',
    type: 'footer',
    label: 'تذييل الصفحة',
    visible: true,
    locked: false,
    settings: {
      showCompanyName: true,
      showPhone: true,
      showEmail: true,
      showVat: true,
      borderTop: true,
      fontSize: 10,
      color: '#9ca3af',
    },
  },
]

const DEFAULT_RECEIPT_BLOCKS: PrintBlock[] = [
  {
    id: 'block_receipt_header',
    type: 'receipt_header',
    label: 'رأس السند',
    visible: true,
    locked: false,
    settings: {
      title: 'سند قبض',
      showNumber: true,
      bgColor: '{{accent_color}}',
      textColor: '#ffffff',
    },
  },
  {
    id: 'block_receipt_body',
    type: 'receipt_body',
    label: 'تفاصيل السند',
    visible: true,
    locked: false,
    settings: {
      showCustomerName: true,
      showAmount: true,
      showAmountText: true,
      showPaymentMethod: true,
      showDate: true,
      showNotes: true,
      accentColor: '{{accent_color}}',
      customerLabel: 'المستفيد',
      amountLabel: 'المبلغ المستلم',
    },
  },
  {
    id: 'block_signature_row',
    type: 'signature_row',
    label: 'التوقيعات',
    visible: true,
    locked: false,
    settings: {
      showReceiverSignature: true,
      showPayerSignature: true,
      receiverLabel: 'المستلم',
      payerLabel: 'الدافع',
    },
  },
  {
    id: 'block_footer',
    type: 'footer',
    label: 'تذييل',
    visible: true,
    locked: false,
    settings: {
      showCompanyName: true,
      showPhone: true,
      showEmail: false,
      showVat: true,
      borderTop: true,
      fontSize: 10,
      color: '#9ca3af',
    },
  },
]

const DEFAULT_PAYMENT_BLOCKS: PrintBlock[] = [
  {
    id: 'block_receipt_header',
    type: 'receipt_header',
    label: 'رأس السند',
    visible: true,
    locked: false,
    settings: {
      title: 'سند صرف',
      showNumber: true,
      bgColor: '{{accent_color}}',
      textColor: '#ffffff',
    },
  },
  {
    id: 'block_receipt_body',
    type: 'receipt_body',
    label: 'تفاصيل السند',
    visible: true,
    locked: false,
    settings: {
      showCustomerName: true,
      showAmount: true,
      showAmountText: true,
      showPaymentMethod: true,
      showDate: true,
      showNotes: true,
      accentColor: '{{accent_color}}',
      customerLabel: 'المستفيد',
      amountLabel: 'المبلغ المصروف',
    },
  },
  {
    id: 'block_signature_row',
    type: 'signature_row',
    label: 'التوقيعات',
    visible: true,
    locked: false,
    settings: {
      showReceiverSignature: true,
      showPayerSignature: true,
      receiverLabel: 'المستلم',
      payerLabel: 'المحاسب',
    },
  },
  {
    id: 'block_footer',
    type: 'footer',
    label: 'تذييل',
    visible: true,
    locked: false,
    settings: {
      showCompanyName: true,
      showPhone: true,
      showEmail: false,
      showVat: true,
      borderTop: true,
      fontSize: 10,
      color: '#9ca3af',
    },
  },
]

const DEFAULT_POS_BLOCKS: PrintBlock[] = [
  {
    id: 'block_pos_header',
    type: 'pos_header',
    label: 'رأس الإيصال',
    visible: true,
    locked: false,
    settings: {
      showLogo: false,
      showCompanyName: true,
      showAddress: true,
      showPhone: true,
      align: 'center',
    },
  },
  {
    id: 'block_pos_info',
    type: 'pos_info',
    label: 'معلومات الفاتورة',
    visible: true,
    locked: false,
    settings: { showNumber: true, showDate: true, showCashier: true, showTable: false },
  },
  {
    id: 'block_pos_divider_1',
    type: 'pos_divider',
    label: 'فاصل',
    visible: true,
    locked: false,
    settings: { style: 'dashed' },
  },
  {
    id: 'block_pos_items',
    type: 'pos_items',
    label: 'الأصناف',
    visible: true,
    locked: false,
    settings: { showQty: true, showPrice: true, showTotal: true, fontSize: 10 },
  },
  {
    id: 'block_pos_divider_2',
    type: 'pos_divider',
    label: 'فاصل',
    visible: true,
    locked: false,
    settings: { style: 'solid' },
  },
  {
    id: 'block_pos_totals',
    type: 'pos_totals',
    label: 'الإجماليات',
    visible: true,
    locked: false,
    settings: {
      showSubtotal: true,
      showVat: true,
      showTotal: true,
      showPaid: true,
      showChange: true,
      accentColor: '{{accent_color}}',
    },
  },
  {
    id: 'block_pos_footer',
    type: 'pos_footer',
    label: 'تذييل الإيصال',
    visible: true,
    locked: false,
    settings: { message: 'شكراً لزيارتكم', showQr: true, align: 'center' },
  },
]

const DEFAULT_JOURNAL_BLOCKS: PrintBlock[] = [
  {
    id: 'block_header',
    type: 'header',
    label: 'رأس القيد',
    visible: true,
    locked: false,
    settings: {
      ...DEFAULT_INVOICE_BLOCKS[0].settings,
      invoiceLabel: 'قيد يومي',
      showInvoiceNumber: true,
    },
  },
  {
    id: 'block_journal_info',
    type: 'journal_info',
    label: 'معلومات القيد',
    visible: true,
    locked: false,
    settings: {
      showNumber: true,
      showDate: true,
      showDescription: true,
      accentColor: '{{accent_color}}',
    },
  },
  {
    id: 'block_journal_table',
    type: 'journal_table',
    label: 'جدول القيد',
    visible: true,
    locked: false,
    settings: {
      showAccount: true,
      showDebit: true,
      showCredit: true,
      showNotes: true,
      headerBg: '{{accent_color}}',
      headerColor: '#ffffff',
      showTotalsRow: true,
      stripedRows: false,
    },
  },
  {
    id: 'block_notes',
    type: 'notes',
    label: 'الملاحظات',
    visible: true,
    locked: false,
    settings: {
      showNotes: true,
      showSignature: true,
      signatureLabel: 'معتمد من',
    },
  },
  DEFAULT_INVOICE_BLOCKS[5],
]

const DEFAULT_PURCHASE_BLOCKS: PrintBlock[] = [
  {
    id: 'block_header',
    type: 'header',
    label: 'رأس الفاتورة',
    visible: true,
    locked: false,
    settings: {
      ...DEFAULT_INVOICE_BLOCKS[0].settings,
      invoiceLabel: 'فاتورة مشتريات',
    },
  },
  {
    id: 'block_supplier_info',
    type: 'supplier_info',
    label: 'بيانات المورد',
    visible: true,
    locked: false,
    settings: {
      showSupplierName: true,
      showSupplierPhone: true,
      showSupplierAddress: true,
      showSupplierVat: true,
      showDate: true,
      showDueDate: true,
      accentColor: '{{accent_color}}',
    },
  },
  DEFAULT_INVOICE_BLOCKS[2],
  {
    ...DEFAULT_INVOICE_BLOCKS[3],
    settings: {
      ...DEFAULT_INVOICE_BLOCKS[3].settings,
      showDiscount: false,
    },
  },
  {
    id: 'block_notes',
    type: 'notes',
    label: 'الملاحظات',
    visible: true,
    locked: false,
    settings: {
      showNotes: true,
      showSignature: true,
      signatureLabel: 'ختم وتوقيع المورد',
    },
  },
  DEFAULT_INVOICE_BLOCKS[5],
]

const DEFAULT_INVENTORY_BLOCKS: PrintBlock[] = [
  {
    id: 'block_header',
    type: 'header',
    label: 'رأس التقرير',
    visible: true,
    locked: false,
    settings: {
      ...DEFAULT_INVOICE_BLOCKS[0].settings,
      invoiceLabel: 'تسوية مخزنية',
      showVat: false,
    },
  },
  {
    id: 'block_inventory_info',
    type: 'inventory_info',
    label: 'معلومات التسوية',
    visible: true,
    locked: false,
    settings: {
      showNumber: true,
      showDate: true,
      showWarehouse: true,
      showReason: true,
      accentColor: '{{accent_color}}',
    },
  },
  {
    id: 'block_inventory_table',
    type: 'inventory_table',
    label: 'جدول الأصناف',
    visible: true,
    locked: false,
    settings: {
      showName: true,
      showBefore: true,
      showAfter: true,
      showDiff: true,
      showType: true,
      headerBg: '{{accent_color}}',
      headerColor: '#ffffff',
      stripedRows: true,
    },
  },
  {
    id: 'block_inventory_summary',
    type: 'inventory_summary',
    label: 'ملخص التسوية',
    visible: true,
    locked: false,
    settings: {
      showTotalIncrease: true,
      showTotalDecrease: true,
      accentColor: '{{accent_color}}',
    },
  },
  {
    id: 'block_notes',
    type: 'notes',
    label: 'الملاحظات',
    visible: true,
    locked: false,
    settings: {
      showNotes: true,
      showSignature: true,
      signatureLabel: 'أمين المستودع',
    },
  },
  {
    id: 'block_footer',
    type: 'footer',
    label: 'تذييل',
    visible: true,
    locked: false,
    settings: {
      showCompanyName: true,
      showPhone: true,
      showEmail: false,
      showVat: false,
      borderTop: true,
      fontSize: 10,
      color: '#9ca3af',
    },
  },
]

export function getDefaultBlocks(docType: PrintDocumentType): PrintBlock[] {
  const clone = (rows: PrintBlock[]) => rows.map((r) => ({ ...r, settings: { ...r.settings } }))
  switch (docType) {
    case 'invoice':
      return clone(DEFAULT_INVOICE_BLOCKS)
    case 'receipt':
      return clone(DEFAULT_RECEIPT_BLOCKS)
    case 'payment':
      return clone(DEFAULT_PAYMENT_BLOCKS)
    case 'pos':
      return clone(DEFAULT_POS_BLOCKS)
    case 'journal':
      return clone(DEFAULT_JOURNAL_BLOCKS)
    case 'purchase':
      return clone(DEFAULT_PURCHASE_BLOCKS)
    case 'inventory':
      return clone(DEFAULT_INVENTORY_BLOCKS)
    default:
      return clone(DEFAULT_INVOICE_BLOCKS)
  }
}

export const PRINT_BLOCK_LABELS: Record<PrintBlockType, { ar: string; en: string }> = {
  header: { ar: 'رأس', en: 'Header' },
  info_row: { ar: 'معلومات وتواريخ', en: 'Info row' },
  items_table: { ar: 'جدول أصناف', en: 'Line items' },
  totals: { ar: 'إجماليات', en: 'Totals' },
  notes: { ar: 'ملاحظات', en: 'Notes' },
  footer: { ar: 'تذييل', en: 'Footer' },
  divider: { ar: 'فاصل', en: 'Divider' },
  spacer: { ar: 'مسافة', en: 'Spacer' },
  text: { ar: 'نص', en: 'Text' },
  image: { ar: 'صورة', en: 'Image' },
  qr_code: { ar: 'QR', en: 'QR code' },
  barcode: { ar: 'باركود', en: 'Barcode' },
  signature: { ar: 'توقيع', en: 'Signature' },
  two_columns: { ar: 'عمودان', en: 'Two columns' },
  receipt_header: { ar: 'رأس السند', en: 'Voucher header' },
  receipt_body: { ar: 'تفاصيل السند', en: 'Voucher body' },
  signature_row: { ar: 'التوقيعات', en: 'Signatures' },
  pos_header: { ar: 'رأس إيصال', en: 'POS header' },
  pos_info: { ar: 'معلومات POS', en: 'POS info' },
  pos_divider: { ar: 'فاصل', en: 'Divider' },
  pos_items: { ar: 'أصناف POS', en: 'POS items' },
  pos_totals: { ar: 'إجماليات POS', en: 'POS totals' },
  pos_footer: { ar: 'تذييل POS', en: 'POS footer' },
  journal_info: { ar: 'معلومات القيد', en: 'Journal info' },
  journal_table: { ar: 'جدول القيد', en: 'Journal lines' },
  supplier_info: { ar: 'بيانات المورد', en: 'Supplier info' },
  inventory_info: { ar: 'معلومات التسوية', en: 'Adjustment info' },
  inventory_table: { ar: 'جدول المخزون', en: 'Inventory table' },
  inventory_summary: { ar: 'ملخص التسوية', en: 'Adjustment summary' },
}

export function getDefaultBlockSettings(type: PrintBlockType): Record<string, unknown> {
  switch (type) {
    case 'divider':
      return { thickness: 1, color: '#e5e7eb', margin: '12px 0' }
    case 'spacer':
      return { height: '16px' }
    case 'text':
      return { content: 'نص جديد', fontSize: 11, align: 'right', color: '#111827' }
    case 'image':
      return { src: 'https://via.placeholder.com/120x60?text=Logo', align: 'center', maxWidth: '120px' }
    case 'qr_code':
      return { align: 'center', size: 80 }
    case 'barcode':
      return { align: 'center', height: 40 }
    case 'signature':
      return { label: 'التوقيع', width: '160px' }
    case 'two_columns':
      return { left: '{{customer.name}}', right: '{{inv.number}}', gap: '16px' }
    case 'header':
      return { ...DEFAULT_INVOICE_BLOCKS[0].settings }
    case 'info_row':
      return { ...DEFAULT_INVOICE_BLOCKS[1].settings }
    case 'items_table':
      return { ...DEFAULT_INVOICE_BLOCKS[2].settings }
    case 'totals':
      return { ...DEFAULT_INVOICE_BLOCKS[3].settings }
    case 'notes':
      return { ...DEFAULT_INVOICE_BLOCKS[4].settings }
    case 'footer':
      return { ...DEFAULT_INVOICE_BLOCKS[5].settings }
    case 'receipt_header':
      return { title: 'سند قبض', showNumber: true, bgColor: '{{accent_color}}', textColor: '#ffffff' }
    case 'receipt_body':
      return {
        showCustomerName: true,
        showAmount: true,
        showAmountText: true,
        showPaymentMethod: true,
        showDate: true,
        showNotes: true,
        accentColor: '{{accent_color}}',
        customerLabel: 'المستفيد',
        amountLabel: 'المبلغ المستلم',
      }
    case 'signature_row':
      return {
        showReceiverSignature: true,
        showPayerSignature: true,
        receiverLabel: 'المستلم',
        payerLabel: 'الدافع',
      }
    case 'pos_header':
      return { showLogo: false, showCompanyName: true, showAddress: true, showPhone: true, align: 'center' }
    case 'pos_info':
      return { showNumber: true, showDate: true, showCashier: true, showTable: false }
    case 'pos_divider':
      return { style: 'dashed' }
    case 'pos_items':
      return { showQty: true, showPrice: true, showTotal: true, fontSize: 10 }
    case 'pos_totals':
      return { showSubtotal: true, showVat: true, showTotal: true, showPaid: true, showChange: true, accentColor: '{{accent_color}}' }
    case 'pos_footer':
      return { message: 'شكراً لزيارتكم', showQr: true, align: 'center' }
    case 'journal_info':
      return { showNumber: true, showDate: true, showDescription: true, accentColor: '{{accent_color}}' }
    case 'journal_table':
      return {
        showAccount: true,
        showDebit: true,
        showCredit: true,
        showNotes: true,
        headerBg: '{{accent_color}}',
        headerColor: '#ffffff',
        showTotalsRow: true,
        stripedRows: false,
      }
    case 'supplier_info':
      return {
        showSupplierName: true,
        showSupplierPhone: true,
        showSupplierAddress: true,
        showSupplierVat: true,
        showDate: true,
        showDueDate: true,
        accentColor: '{{accent_color}}',
      }
    case 'inventory_info':
      return { showNumber: true, showDate: true, showWarehouse: true, showReason: true, accentColor: '{{accent_color}}' }
    case 'inventory_table':
      return {
        showName: true,
        showBefore: true,
        showAfter: true,
        showDiff: true,
        showType: true,
        headerBg: '{{accent_color}}',
        headerColor: '#ffffff',
        stripedRows: true,
      }
    case 'inventory_summary':
      return { showTotalIncrease: true, showTotalDecrease: true, accentColor: '{{accent_color}}' }
    default:
      return {}
  }
}

function bool(s: Record<string, unknown>, key: string, def = true): boolean {
  const v = s[key]
  if (typeof v === 'boolean') return v
  return def
}

function str(s: Record<string, unknown>, key: string, def: string): string {
  const v = s[key]
  return typeof v === 'string' ? v : def
}

function num(s: Record<string, unknown>, key: string, def: number): number {
  const v = s[key]
  return typeof v === 'number' && !Number.isNaN(v) ? v : def
}

export function renderPrintBlock(block: PrintBlock, globalSettings: Record<string, unknown>): string {
  if (!block.visible) return ''
  const accent = accentFromGlobal(globalSettings)
  const mTop = (globalSettings.margins as PrintMargins | undefined)?.top ?? 15
  const mRight = (globalSettings.margins as PrintMargins | undefined)?.right ?? 15
  const mLeft = (globalSettings.margins as PrintMargins | undefined)?.left ?? 15

  switch (block.type) {
    case 'header': {
      const s = block.settings
      const bg = styleColor(s.bgColor, accent)
      const pad = str(s, 'padding', '20px 24px')
      const neg = `-${mTop}mm -${mRight}mm 20px -${mLeft}mm`
      return `
        <div style="background:${bg};color:${escapeHtml(str(s, 'textColor', '#ffffff'))};padding:${pad};
          margin:${neg};
          display:flex;justify-content:space-between;align-items:center;border-radius:10px 10px 0 0;">
          <div>
            ${bool(s, 'showCompanyName', true) ? `<h1 style="margin:0;font-size:24px;font-weight:800;">{{company.name}}</h1>` : ''}
            ${bool(s, 'showAddress', true) ? `<p style="margin:4px 0 0;font-size:11px;opacity:.85;">{{company.address}}</p>` : ''}
            ${
              bool(s, 'showPhone', true)
                ? `<p style="margin:2px 0 0;font-size:11px;opacity:.85;">{{company.phone}}${
                    bool(s, 'showVat', true) ? ' · الرقم الضريبي: {{company.vat}}' : ''
                  }</p>`
                : ''
            }
          </div>
          <div style="text-align:left;">
            ${bool(s, 'showInvoiceLabel', true) ? `<p style="margin:0;font-size:12px;opacity:.8;letter-spacing:2px;">${escapeHtml(str(s, 'invoiceLabel', 'فاتورة ضريبية'))}</p>` : ''}
            ${bool(s, 'showInvoiceNumber', true) ? `<p style="margin:4px 0 0;font-size:26px;font-weight:800;">#{{inv.number}}</p>` : ''}
          </div>
        </div>`
    }

    case 'info_row': {
      const s = block.settings
      const bg = str(s, 'bgColor', '#f8fafc')
      const border = bool(s, 'borderAccent', true) ? `border-right:4px solid ${accent};` : ''
      return `
        <div style="display:flex;gap:16px;margin-bottom:20px;flex-wrap:wrap;">
          <div style="flex:1;min-width:200px;background:${escapeHtml(bg)};border-radius:10px;padding:14px;${border}">
            <p style="margin:0 0 6px;font-size:10px;color:#6b7280;font-weight:600;">العميل</p>
            ${bool(s, 'showCustomerName', true) ? `<p style="margin:0;font-size:14px;font-weight:700;">{{customer.name}}</p>` : ''}
            ${bool(s, 'showCustomerPhone', true) ? `<p style="margin:3px 0 0;font-size:11px;color:#6b7280;">{{customer.phone}}</p>` : ''}
            ${bool(s, 'showCustomerAddress', true) ? `<p style="margin:2px 0 0;font-size:11px;color:#6b7280;">{{customer.address}}</p>` : ''}
            ${bool(s, 'showCustomerVat', true) ? `<p style="margin:2px 0 0;font-size:10px;color:#9ca3af;">ر.ض: {{customer.vat}}</p>` : ''}
          </div>
          <div style="flex:1;min-width:200px;background:#f8fafc;border-radius:10px;padding:14px;">
            <p style="margin:0 0 8px;font-size:10px;color:#6b7280;font-weight:600;">تفاصيل الفاتورة</p>
            ${bool(s, 'showDate', true) ? `<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="font-size:11px;color:#6b7280;">تاريخ الإصدار</span><span style="font-size:11px;font-weight:600;">{{inv.date}}</span></div>` : ''}
            ${bool(s, 'showDueDate', true) ? `<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="font-size:11px;color:#6b7280;">تاريخ الاستحقاق</span><span style="font-size:11px;font-weight:600;">{{inv.due_date}}</span></div>` : ''}
            ${bool(s, 'showPaymentMethod', true) ? `<div style="display:flex;justify-content:space-between;"><span style="font-size:11px;color:#6b7280;">طريقة الدفع</span><span style="font-size:11px;font-weight:600;">{{inv.payment_method}}</span></div>` : ''}
          </div>
        </div>`
    }

    case 'items_table': {
      const s = block.settings
      const cols = (Array.isArray(s.columns) ? s.columns : ['index', 'name', 'qty', 'price', 'vat', 'total']) as string[]
      const labels = (typeof s.columnLabels === 'object' && s.columnLabels !== null ? s.columnLabels : {}) as Record<string, string>
      const colMap: Record<string, string> = {
        index: '#',
        name: 'البند',
        qty: 'الكمية',
        price: 'السعر',
        vat: 'الضريبة',
        total: 'الإجمالي',
      }
      const headerBg = styleColor(s.headerBg, accent)
      const headerColor = str(s, 'headerColor', '#ffffff')
      const headerCells = cols
        .map((c) => {
          const ta = c === 'total' ? 'left' : 'right'
          const lab = labels[c] ?? colMap[c] ?? c
          return `<th style="padding:10px 14px;text-align:${ta};">${escapeHtml(lab)}</th>`
        })
        .join('')
      const dataCells = cols
        .map((c) => {
          const varMap: Record<string, string> = {
            index: '{{sum @index 1}}',
            name: '{{this.name}}',
            qty: '{{this.qty}}',
            price: '{{formatNumber this.price}}',
            vat: '{{formatNumber this.vat}}',
            total: '{{formatNumber this.total}}',
          }
          const ta = c === 'total' ? 'left' : 'right'
          const inner = varMap[c] ?? '{{this.name}}'
          return `<td style="padding:10px 14px;text-align:${ta};">${inner}</td>`
        })
        .join('')
      const stripe = bool(s, 'stripedRows', true)
      const rowBg = stripe
        ? 'background:{{#if (isOdd @index)}}#f9fafb{{else}}#ffffff{{/if}};'
        : 'background:#ffffff;'
      return `
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:${num(s, 'fontSize', 11)}px;">
          <thead>
            <tr style="background:${headerBg};color:${escapeHtml(headerColor)};">${headerCells}</tr>
          </thead>
          <tbody>
            {{#each items}}
            <tr style="${rowBg}border-bottom:1px solid #e5e7eb;">
              ${dataCells}
            </tr>
            {{/each}}
          </tbody>
        </table>`
    }

    case 'totals': {
      const s = block.settings
      const w = str(s, 'width', '280px')
      const totalBg = styleColor(s.totalBg, accent)
      const totalColor = str(s, 'totalColor', '#ffffff')
      const vatLab = str(s, 'vatLabel', 'ضريبة القيمة المضافة (15%)')
      return `
        <div style="display:flex;justify-content:flex-end;margin-bottom:20px;">
          <div style="width:${escapeHtml(w)};">
            ${bool(s, 'showSubtotal', true) ? `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e5e7eb;font-size:12px;"><span style="color:#6b7280;">المجموع قبل الضريبة</span><span style="font-weight:600;">{{formatNumber subtotal}}</span></div>` : ''}
            ${bool(s, 'showDiscount', true) ? `{{#if discount}}<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e5e7eb;font-size:12px;color:#dc2626;"><span>الخصم</span><span>- {{formatNumber discount}}</span></div>{{/if}}` : ''}
            ${bool(s, 'showVat', true) ? `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e5e7eb;font-size:12px;"><span style="color:#6b7280;">${escapeHtml(vatLab)}</span><span style="font-weight:600;">{{formatNumber vat_amount}}</span></div>` : ''}
            ${bool(s, 'showTotal', true) ? `<div style="display:flex;justify-content:space-between;padding:12px 16px;background:${totalBg};color:${escapeHtml(totalColor)};border-radius:10px;margin-top:10px;"><span style="font-size:14px;font-weight:700;">الإجمالي المستحق</span><span style="font-size:16px;font-weight:800;">{{formatNumber total_amount}}</span></div>` : ''}
            ${bool(s, 'showPaid', false) ? `{{#if paid}}<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:11px;"><span style="color:#6b7280;">المدفوع</span><span>{{formatNumber paid}}</span></div>{{/if}}` : ''}
            ${bool(s, 'showChange', false) ? `{{#if change}}<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:11px;"><span style="color:#6b7280;">الباقي</span><span>{{formatNumber change}}</span></div>{{/if}}` : ''}
          </div>
        </div>`
    }

    case 'notes': {
      const s = block.settings
      const lab = str(s, 'label', 'ملاحظات:')
      const sig = str(s, 'signatureLabel', 'التوقيع والختم')
      return `
        <div style="display:flex;gap:16px;align-items:flex-start;margin-top:10px;">
          <div style="flex:1;">
            ${bool(s, 'showNotes', true) ? `{{#if inv.notes}}<p style="font-size:10px;color:#6b7280;margin:0 0 4px;font-weight:600;">${escapeHtml(lab)}</p>
            <p style="font-size:11px;color:#374151;margin:0;line-height:1.6;">{{inv.notes}}</p>{{/if}}` : ''}
          </div>
          ${
            bool(s, 'showSignature', true)
              ? `<div style="text-align:center;width:140px;">
            <div style="border-top:1px solid #d1d5db;padding-top:6px;margin-top:24px;">
              <p style="font-size:10px;color:#6b7280;margin:0;">${escapeHtml(sig)}</p>
            </div></div>`
              : ''
          }
        </div>`
    }

    case 'footer': {
      const s = block.settings
      const fs = num(s, 'fontSize', 10)
      const col = str(s, 'color', '#9ca3af')
      const parts: string[] = []
      if (bool(s, 'showCompanyName', true)) parts.push('{{company.name}}')
      if (bool(s, 'showPhone', true)) parts.push('{{company.phone}}')
      if (bool(s, 'showEmail', true)) parts.push('{{company.email}}')
      const left = parts.join(' | ')
      return `
        <div style="margin-top:24px;padding-top:12px;${bool(s, 'borderTop', true) ? 'border-top:2px solid #e5e7eb;' : ''}
          display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <p style="font-size:${fs}px;color:${escapeHtml(col)};margin:0;">${left}</p>
          ${bool(s, 'showVat', true) ? `<p style="font-size:${fs}px;color:${escapeHtml(col)};margin:0;">الرقم الضريبي: {{company.vat}}</p>` : ''}
        </div>`
    }

    case 'divider':
      return `<hr style="border:none;border-top:${num(block.settings, 'thickness', 1)}px solid ${escapeHtml(str(block.settings, 'color', '#e5e7eb'))};margin:${escapeHtml(str(block.settings, 'margin', '12px 0'))};" />`

    case 'spacer':
      return `<div style="height:${escapeHtml(str(block.settings, 'height', '16px'))}"></div>`

    case 'qr_code':
      return `<div style="text-align:${escapeHtml(str(block.settings, 'align', 'center'))};margin:12px 0;">
        <img src="{{qr_code}}" alt="" style="width:${num(block.settings, 'size', 80)}px;height:${num(block.settings, 'size', 80)}px;" />
        <p style="font-size:9px;color:#9ca3af;margin:4px 0 0;">ZATCA QR Code</p></div>`

    case 'barcode':
      return `<div style="text-align:${escapeHtml(str(block.settings, 'align', 'center'))};margin:12px 0;font-size:10px;color:#64748b;">[Barcode]</div>`

    case 'text': {
      const raw = str(block.settings, 'content', '')
      const fs = num(block.settings, 'fontSize', 11)
      const al = str(block.settings, 'align', 'right')
      const col = str(block.settings, 'color', '#111827')
      return `<div style="font-size:${fs}px;text-align:${escapeHtml(al)};color:${escapeHtml(col)};margin:8px 0;white-space:pre-wrap;">${raw}</div>`
    }

    case 'image': {
      const src = str(block.settings, 'src', '')
      const mw = str(block.settings, 'maxWidth', '120px')
      const al = str(block.settings, 'align', 'center')
      return `<div style="text-align:${escapeHtml(al)};margin:8px 0;"><img src="${escapeHtml(src)}" alt="" style="max-width:${escapeHtml(mw)};height:auto;" /></div>`
    }

    case 'signature': {
      const lab = str(block.settings, 'label', 'التوقيع')
      const w = str(block.settings, 'width', '160px')
      return `<div style="margin-top:16px;text-align:center;width:${escapeHtml(w)};margin-inline:auto;">
        <div style="border-top:1px solid #d1d5db;padding-top:6px;">
          <p style="font-size:10px;color:#6b7280;margin:0;">${escapeHtml(lab)}</p>
        </div></div>`
    }

    case 'two_columns': {
      const left = str(block.settings, 'left', '')
      const right = str(block.settings, 'right', '')
      const gap = str(block.settings, 'gap', '16px')
      return `<div style="display:flex;gap:${escapeHtml(gap)};margin:10px 0;">
        <div style="flex:1;font-size:11px;">${left}</div>
        <div style="flex:1;font-size:11px;text-align:left;">${right}</div>
      </div>`
    }

    case 'receipt_header': {
      const s = block.settings
      const bg = styleColor(s.bgColor, accent)
      const title = escapeHtml(str(s, 'title', 'سند قبض'))
      const neg = `-${mTop}mm -${mRight}mm 20px -${mLeft}mm`
      const numberRow = bool(s, 'showNumber', true)
        ? `<div style="display:flex;justify-content:space-between;background:#f8fafc;padding:12px 16px;border-radius:8px;margin-bottom:16px;">
            <div><p style="margin:0;font-size:10px;color:#6b7280;">رقم السند</p><p style="margin:3px 0 0;font-weight:700;font-size:14px;">#{{inv.number}}</p></div>
            <div style="text-align:left;"><p style="margin:0;font-size:10px;color:#6b7280;">التاريخ</p><p style="margin:3px 0 0;font-weight:700;font-size:14px;">{{inv.date}}</p></div>
          </div>`
        : ''
      return `
        <div style="background:${bg};color:${escapeHtml(str(s, 'textColor', '#ffffff'))};padding:20px;margin:${neg};text-align:center;border-radius:10px 10px 0 0;">
          <h1 style="margin:0;font-size:20px;font-weight:800;">{{company.name}}</h1>
          <p style="margin:4px 0 0;font-size:11px;opacity:.85;">{{company.address}} | {{company.phone}}</p>
          <p style="margin:8px 0 0;font-size:14px;font-weight:700;letter-spacing:2px;">${title}</p>
        </div>
        ${numberRow}`
    }


    case 'receipt_body': {
      const s = block.settings
      const ac = styleColor(s.accentColor, accent)
      const amountLabel = escapeHtml(str(s, 'amountLabel', 'المبلغ المستلم'))
      const customerLabel = escapeHtml(str(s, 'customerLabel', 'المستفيد'))
      const amountBox = bool(s, 'showAmount', true)
        ? `<div style="background:${ac};color:white;padding:20px;border-radius:12px;text-align:center;margin-bottom:20px;">
            <p style="margin:0;font-size:11px;opacity:.8;">${amountLabel}</p>
            <p style="margin:4px 0;font-size:32px;font-weight:800;">{{formatNumber total_amount}}</p>
            ${bool(s, 'showAmountText', true) ? '<p style="margin:0;font-size:11px;opacity:.8;">{{amount_text}}</p>' : ''}
          </div>`
        : ''
      const rows: string[] = []
      if (bool(s, 'showCustomerName', true)) {
        rows.push(`<div style="display:flex;justify-content:space-between;padding:10px 16px;border-bottom:1px solid #f3f4f6;">
          <span style="font-size:11px;color:#6b7280;">${customerLabel}</span>
          <span style="font-size:11px;font-weight:600;">{{customer.name}}</span></div>`)
      }
      if (bool(s, 'showPaymentMethod', true)) {
        rows.push(`<div style="display:flex;justify-content:space-between;padding:10px 16px;border-bottom:1px solid #f3f4f6;">
          <span style="font-size:11px;color:#6b7280;">طريقة الدفع</span>
          <span style="font-size:11px;font-weight:600;">{{inv.payment_method}}</span></div>`)
      }
      const detailsTable =
        rows.length > 0
          ? `<div style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:20px;">
              ${rows.join('')}
              ${bool(s, 'showNotes', true) ? `{{#if inv.notes}}<div style="display:flex;justify-content:space-between;padding:10px 16px;">
                <span style="font-size:11px;color:#6b7280;">ملاحظات</span>
                <span style="font-size:11px;font-weight:600;">{{inv.notes}}</span></div>{{/if}}` : ''}
            </div>`
          : ''
      return `${amountBox}${detailsTable}`
    }

    case 'signature_row': {
      const s = block.settings
      const receiver = escapeHtml(str(s, 'receiverLabel', 'المستلم'))
      const payer = escapeHtml(str(s, 'payerLabel', 'الدافع'))
      const manager = escapeHtml(str(s, 'managerLabel', 'المدير'))
      const cols: string[] = []
      if (bool(s, 'showReceiverSignature', true)) {
        cols.push(`<div style="text-align:center;width:45%;">
          <div style="border-top:1px solid #d1d5db;padding-top:6px;margin-top:40px;">
            <p style="font-size:10px;color:#6b7280;margin:0;">${receiver}</p>
          </div></div>`)
      }
      if (bool(s, 'showPayerSignature', true)) {
        cols.push(`<div style="text-align:center;width:45%;">
          <div style="border-top:1px solid #d1d5db;padding-top:6px;margin-top:40px;">
            <p style="font-size:10px;color:#6b7280;margin:0;">${payer}</p>
          </div></div>`)
      }
      if (bool(s, 'showManagerSignature', false)) {
        cols.push(`<div style="text-align:center;width:30%;">
          <div style="border-top:1px solid #d1d5db;padding-top:6px;margin-top:40px;">
            <p style="font-size:10px;color:#6b7280;margin:0;">${manager}</p>
          </div></div>`)
      }
      if (!cols.length) return ''
      return `<div style="display:flex;justify-content:space-between;margin-top:24px;flex-wrap:wrap;gap:12px;">${cols.join('')}</div>`
    }

    case 'pos_header': {
      const s = block.settings
      const al = escapeHtml(str(s, 'align', 'center'))
      return `<div style="text-align:${al};margin-bottom:8px;">
        ${bool(s, 'showCompanyName', true) ? '<h2 style="margin:0 0 4px;font-size:14px;font-weight:800;">{{company.name}}</h2>' : ''}
        ${bool(s, 'showAddress', true) ? '<p style="margin:0;font-size:10px;">{{company.address}}</p>' : ''}
        ${bool(s, 'showPhone', true) ? '<p style="margin:0;font-size:10px;">{{company.phone}}</p>' : ''}
      </div>`
    }

    case 'pos_info': {
      const s = block.settings
      const line1: string[] = []
      if (bool(s, 'showNumber', true)) line1.push('<span>رقم: {{inv.number}}</span>')
      if (bool(s, 'showDate', true)) line1.push('<span>{{inv.date}}</span>')
      const line2: string[] = []
      if (bool(s, 'showCashier', true)) line2.push('<span>الكاشير: {{cashier}}</span>')
      line2.push('<span>{{inv.time}}</span>')
      return `
        ${line1.length ? `<div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:4px;">${line1.join('')}</div>` : ''}
        <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:6px;flex-wrap:wrap;gap:6px;">
          ${line2.join('')}
          ${bool(s, 'showTable', false) ? '{{#if table}}<span>الطاولة: {{table}}</span>{{/if}}' : ''}
        </div>`
    }

    case 'pos_divider': {
      const divStyle = str(block.settings, 'style', 'dashed') === 'solid' ? 'solid' : 'dashed'
      const weight = divStyle === 'solid' ? '2px' : '1px'
      return `<div style="border-top:${weight} ${divStyle} #374151;margin:8px 0;"></div>`
    }

    case 'pos_items': {
      const s = block.settings
      const fs = num(s, 'fontSize', 10)
      const showQty = bool(s, 'showQty', true)
      const showTotal = bool(s, 'showTotal', true)
      const headers: string[] = ['<th style="text-align:right;padding:3px 0;">الصنف</th>']
      if (showQty) headers.push('<th style="text-align:center;padding:3px 0;">ك</th>')
      if (showTotal) headers.push('<th style="text-align:left;padding:3px 0;">المبلغ</th>')
      const cells: string[] = ['<td style="padding:2px 0;text-align:right;">{{this.name}}</td>']
      if (showQty) cells.push('<td style="padding:2px 0;text-align:center;">{{this.qty}}</td>')
      if (showTotal) cells.push('<td style="padding:2px 0;text-align:left;">{{formatNumber this.total}}</td>')
      return `
        <table style="width:100%;font-size:${fs}px;border-collapse:collapse;margin-bottom:6px;">
          <thead><tr style="border-bottom:1px solid #374151;">${headers.join('')}</tr></thead>
          <tbody>{{#each items}}<tr>${cells.join('')}</tr>{{/each}}</tbody>
        </table>`
    }

    case 'pos_totals': {
      const s = block.settings
      const rows: string[] = []
      if (bool(s, 'showSubtotal', true)) {
        rows.push(`<div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:2px;">
          <span>المجموع</span><span>{{formatNumber subtotal}}</span></div>`)
      }
      if (bool(s, 'showVat', true)) {
        rows.push(`<div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:2px;">
          <span>الضريبة 15%</span><span>{{formatNumber vat_amount}}</span></div>`)
      }
      if (bool(s, 'showTotal', true)) {
        rows.push(`<div style="display:flex;justify-content:space-between;font-size:13px;font-weight:800;margin:4px 0;">
          <span>الإجمالي</span><span>{{formatNumber total_amount}}</span></div>`)
      }
      if (bool(s, 'showPaid', true)) {
        rows.push(`<div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:2px;">
          <span>المدفوع</span><span>{{formatNumber paid}}</span></div>`)
      }
      if (bool(s, 'showChange', true)) {
        rows.push(`<div style="display:flex;justify-content:space-between;font-size:10px;">
          <span>الباقي</span><span>{{formatNumber change}}</span></div>`)
      }
      return rows.join('')
    }

    case 'pos_footer': {
      const s = block.settings
      const msg = escapeHtml(str(s, 'message', 'شكراً لزيارتكم'))
      const al = escapeHtml(str(s, 'align', 'center'))
      return `<div style="text-align:${al};margin-top:8px;">
        <p style="margin:0;font-size:11px;font-weight:600;">${msg}</p>
        <p style="margin:4px 0 0;font-size:9px;color:#6b7280;">يُرجى الاحتفاظ بالإيصال</p>
        ${bool(s, 'showQr', true) ? '<div style="margin-top:8px;"><img src="{{qr_code}}" alt="" style="width:64px;height:64px;" /></div>' : ''}
      </div>`
    }

    case 'journal_info': {
      const s = block.settings
      const ac = styleColor(s.accentColor, accent)
      const border = `border-right:3px solid ${ac};`
      return `<div style="display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap;">
        ${bool(s, 'showDate', true) ? `<div style="flex:1;min-width:120px;background:#f8fafc;border-radius:8px;padding:12px;${border}">
          <p style="margin:0 0 4px;font-size:10px;color:#6b7280;">التاريخ</p>
          <p style="margin:0;font-weight:700;">{{inv.date}}</p></div>` : ''}
        ${bool(s, 'showNumber', true) ? `<div style="flex:1;min-width:120px;background:#f8fafc;border-radius:8px;padding:12px;">
          <p style="margin:0 0 4px;font-size:10px;color:#6b7280;">رقم القيد</p>
          <p style="margin:0;font-weight:700;">#{{inv.number}}</p></div>` : ''}
        ${bool(s, 'showDescription', true) ? `<div style="flex:2;min-width:200px;background:#f8fafc;border-radius:8px;padding:12px;">
          <p style="margin:0 0 4px;font-size:10px;color:#6b7280;">البيان</p>
          <p style="margin:0;font-weight:600;">{{description}}</p></div>` : ''}
      </div>`
    }

    case 'journal_table': {
      const s = block.settings
      const headerBg = styleColor(s.headerBg, accent)
      const headerColor = str(s, 'headerColor', '#ffffff')
      const stripe = bool(s, 'stripedRows', false)
      const rowBg = stripe
        ? 'background:{{#if @odd}}#f9fafb{{else}}#ffffff{{/if}};'
        : 'background:#ffffff;'
      const headers: string[] = []
      if (bool(s, 'showAccount', true)) headers.push('<th style="padding:10px 14px;text-align:right;">الحساب</th>')
      if (bool(s, 'showDebit', true)) headers.push('<th style="padding:10px 14px;text-align:center;">مدين</th>')
      if (bool(s, 'showCredit', true)) headers.push('<th style="padding:10px 14px;text-align:center;">دائن</th>')
      if (bool(s, 'showNotes', true)) headers.push('<th style="padding:10px 14px;text-align:right;">ملاحظات</th>')
      const cells: string[] = []
      if (bool(s, 'showAccount', true)) cells.push('<td style="padding:10px 14px;">{{this.account}}</td>')
      if (bool(s, 'showDebit', true)) {
        cells.push(`<td style="padding:10px 14px;text-align:center;color:#059669;font-weight:600;">
          {{#if this.debit}}{{formatNumber this.debit}}{{/if}}</td>`)
      }
      if (bool(s, 'showCredit', true)) {
        cells.push(`<td style="padding:10px 14px;text-align:center;color:#dc2626;font-weight:600;">
          {{#if this.credit}}{{formatNumber this.credit}}{{/if}}</td>`)
      }
      if (bool(s, 'showNotes', true)) {
        cells.push('<td style="padding:10px 14px;color:#6b7280;font-size:10px;">{{this.notes}}</td>')
      }
      const totalsRow = bool(s, 'showTotalsRow', true)
        ? `<tr style="background:#f3f4f6;font-weight:700;border-top:2px solid #e5e7eb;">
            <td style="padding:10px 14px;">الإجمالي</td>
            <td style="padding:10px 14px;text-align:center;color:#059669;">{{formatNumber total_debit}}</td>
            <td style="padding:10px 14px;text-align:center;color:#dc2626;">{{formatNumber total_credit}}</td>
            <td style="padding:10px 14px;"></td>
          </tr>`
        : ''
      return `
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:11px;">
          <thead><tr style="background:${headerBg};color:${escapeHtml(headerColor)};">${headers.join('')}</tr></thead>
          <tbody>
            {{#each entries}}
            <tr style="border-bottom:1px solid #e5e7eb;${rowBg}">${cells.join('')}</tr>
            {{/each}}
            ${totalsRow}
          </tbody>
        </table>`
    }

    case 'supplier_info': {
      const s = block.settings
      const ac = styleColor(s.accentColor, accent)
      const border = `border-right:4px solid ${ac};`
      return `<div style="display:flex;gap:16px;margin-bottom:20px;flex-wrap:wrap;">
        <div style="flex:1;min-width:200px;background:#f8fafc;border-radius:10px;padding:14px;${border}">
          <p style="margin:0 0 6px;font-size:10px;color:#6b7280;font-weight:600;">بيانات المورد</p>
          ${bool(s, 'showSupplierName', true) ? '<p style="margin:0;font-size:14px;font-weight:700;">{{supplier.name}}</p>' : ''}
          ${bool(s, 'showSupplierPhone', true) ? '<p style="margin:3px 0 0;font-size:11px;color:#6b7280;">{{supplier.phone}}</p>' : ''}
          ${bool(s, 'showSupplierAddress', true) ? '<p style="margin:2px 0 0;font-size:11px;color:#6b7280;">{{supplier.address}}</p>' : ''}
          ${bool(s, 'showSupplierVat', true) ? '<p style="margin:2px 0 0;font-size:10px;color:#9ca3af;">ر.ض: {{supplier.vat}}</p>' : ''}
        </div>
        <div style="flex:1;min-width:200px;background:#f8fafc;border-radius:10px;padding:14px;">
          <p style="margin:0 0 8px;font-size:10px;color:#6b7280;font-weight:600;">تفاصيل الأمر</p>
          ${bool(s, 'showDate', true) ? `<div style="display:flex;justify-content:space-between;margin-bottom:5px;">
            <span style="font-size:11px;color:#6b7280;">التاريخ</span>
            <span style="font-size:11px;font-weight:600;">{{inv.date}}</span></div>` : ''}
          ${bool(s, 'showDueDate', true) ? `<div style="display:flex;justify-content:space-between;">
            <span style="font-size:11px;color:#6b7280;">الاستحقاق</span>
            <span style="font-size:11px;font-weight:600;">{{inv.due_date}}</span></div>` : ''}
        </div>
      </div>`
    }

    case 'inventory_info': {
      const s = block.settings
      const ac = styleColor(s.accentColor, accent)
      const border = `border-right:3px solid ${ac};`
      return `<div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
        ${bool(s, 'showDate', true) ? `<div style="flex:1;min-width:100px;background:#f8fafc;border-radius:8px;padding:12px;${border}">
          <p style="margin:0 0 3px;font-size:10px;color:#6b7280;">التاريخ</p>
          <p style="margin:0;font-weight:700;">{{adj.date}}</p></div>` : ''}
        ${bool(s, 'showWarehouse', true) ? `<div style="flex:1;min-width:100px;background:#f8fafc;border-radius:8px;padding:12px;">
          <p style="margin:0 0 3px;font-size:10px;color:#6b7280;">المستودع</p>
          <p style="margin:0;font-weight:700;">{{warehouse.name}}</p></div>` : ''}
        ${bool(s, 'showReason', true) ? `<div style="flex:2;min-width:160px;background:#f8fafc;border-radius:8px;padding:12px;">
          <p style="margin:0 0 3px;font-size:10px;color:#6b7280;">سبب التسوية</p>
          <p style="margin:0;font-weight:600;">{{reason}}</p></div>` : ''}
      </div>`
    }

    case 'inventory_table': {
      const s = block.settings
      const headerBg = styleColor(s.headerBg, accent)
      const headerColor = str(s, 'headerColor', '#ffffff')
      const stripe = bool(s, 'stripedRows', true)
      const rowBg = stripe
        ? 'background:{{#if @odd}}#f9fafb{{else}}#ffffff{{/if}};'
        : 'background:#ffffff;'
      const headers: string[] = []
      if (bool(s, 'showName', true)) headers.push('<th style="padding:10px 12px;text-align:right;">الصنف</th>')
      if (bool(s, 'showBefore', true)) headers.push('<th style="padding:10px 12px;text-align:center;">قبل</th>')
      if (bool(s, 'showAfter', true)) headers.push('<th style="padding:10px 12px;text-align:center;">بعد</th>')
      if (bool(s, 'showDiff', true)) headers.push('<th style="padding:10px 12px;text-align:center;">الفرق</th>')
      if (bool(s, 'showType', true)) headers.push('<th style="padding:10px 12px;text-align:center;">النوع</th>')
      const cells: string[] = []
      if (bool(s, 'showName', true)) cells.push('<td style="padding:9px 12px;font-weight:600;">{{this.name}}</td>')
      if (bool(s, 'showBefore', true)) cells.push('<td style="padding:9px 12px;text-align:center;">{{this.before}}</td>')
      if (bool(s, 'showAfter', true)) cells.push('<td style="padding:9px 12px;text-align:center;">{{this.after}}</td>')
      if (bool(s, 'showDiff', true)) {
        cells.push(`<td style="padding:9px 12px;text-align:center;font-weight:700;
          color:{{#if this.positive}}#059669{{else}}#dc2626{{/if}};">{{this.diff}}</td>`)
      }
      if (bool(s, 'showType', true)) {
        cells.push(`<td style="padding:9px 12px;text-align:center;">
          <span style="padding:2px 8px;border-radius:20px;font-size:10px;
            background:{{#if this.positive}}#dcfce7{{else}}#fee2e2{{/if}};
            color:{{#if this.positive}}#059669{{else}}#dc2626{{/if}};">{{this.type}}</span></td>`)
      }
      return `
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:11px;">
          <thead><tr style="background:${headerBg};color:${escapeHtml(headerColor)};">${headers.join('')}</tr></thead>
          <tbody>{{#each items}}<tr style="border-bottom:1px solid #e5e7eb;${rowBg}">${cells.join('')}</tr>{{/each}}</tbody>
        </table>`
    }

    case 'inventory_summary': {
      const s = block.settings
      const parts: string[] = []
      if (bool(s, 'showTotalIncrease', true)) {
        parts.push(`<div style="flex:1;background:#dcfce7;border-radius:8px;padding:12px;text-align:center;">
          <p style="margin:0;font-size:10px;color:#059669;">إجمالي الزيادة</p>
          <p style="margin:4px 0 0;font-size:18px;font-weight:800;color:#059669;">+{{total_increase}}</p></div>`)
      }
      if (bool(s, 'showTotalDecrease', true)) {
        parts.push(`<div style="flex:1;background:#fee2e2;border-radius:8px;padding:12px;text-align:center;">
          <p style="margin:0;font-size:10px;color:#dc2626;">إجمالي النقص</p>
          <p style="margin:4px 0 0;font-size:18px;font-weight:800;color:#dc2626;">-{{total_decrease}}</p></div>`)
      }
      if (!parts.length) return ''
      return `<div style="display:flex;gap:12px;margin-bottom:20px;">${parts.join('')}</div>`
    }
    default:
      return ''
  }
}

export function printBlocksToInnerHtml(blocks: PrintBlock[], globalSettings: Record<string, unknown>): string {
  return blocks.map((b) => renderPrintBlock(b, globalSettings)).join('\n')
}

export type WrapPrintBlocksHtmlOpts = {
  fontFamily: string
  fontSize: number
  textColor: string
  accentColor: string
  formatBold?: boolean
  formatItalic?: boolean
  formatUnderline?: boolean
  margins: PrintMargins
  paperSize: PrintPaperSize
  orientation: PrintOrientation
}

export function wrapPrintBlocksDocumentHtml(inner: string, opts: WrapPrintBlocksHtmlOpts): string {
  const { margins, fontFamily, fontSize, textColor, accentColor, formatBold, formatItalic, formatUnderline, paperSize, orientation } = opts
  const pad = `${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm`
  const { h: contentH } = paperContentSizeMm(paperSize, orientation, margins)
  let extra = ''
  if (formatBold) extra += 'font-weight:700;'
  if (formatItalic) extra += 'font-style:italic;'
  if (formatUnderline) extra += 'text-decoration:underline;'
  return `<div class="print-doc-root" dir="rtl" style="font-family:${escapeHtml(fontFamily)},Tahoma,Arial,sans-serif;font-size:${Number(fontSize) || 10}pt;color:${escapeHtml(textColor)};--accent:${escapeHtml(accentColor)};${extra}padding:${pad};box-sizing:border-box;position:relative;width:100%;min-height:${contentH}mm;line-height:1.45;">${inner}</div>`
}

export function printBlocksToDocumentHtml(blocks: PrintBlock[], globalSettings: Record<string, unknown>, opts: WrapPrintBlocksHtmlOpts): string {
  const g = { ...globalSettings, accent_color: opts.accentColor, margins: opts.margins }
  const inner = printBlocksToInnerHtml(blocks, g)
  return wrapPrintBlocksDocumentHtml(inner, opts)
}

export function isPrintBlock(x: unknown): x is PrintBlock {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.label !== 'string') return false
  if (typeof o.type !== 'string' || !o.type.trim()) return false
  if (o.settings !== undefined && (typeof o.settings !== 'object' || o.settings === null)) return false
  return true
}

export function parsePrintBlocksJson(raw: string | null | undefined): PrintBlock[] | null {
  if (!raw || typeof raw !== 'string') return null
  try {
    const v = JSON.parse(raw) as unknown
    if (!Array.isArray(v) || v.length === 0) return null
    const rows: PrintBlock[] = []
    for (const item of v) {
      if (!isPrintBlock(item)) continue
      const o = item as unknown as Record<string, unknown>
      rows.push({
        id: String(o.id),
        type: o.type as PrintBlockType,
        label: String(o.label),
        visible: typeof o.visible === 'boolean' ? o.visible : true,
        locked: typeof o.locked === 'boolean' ? o.locked : false,
        settings: typeof o.settings === 'object' && o.settings !== null ? { ...(o.settings as object) } : {},
      })
    }
    return rows.length ? rows : null
  } catch {
    return null
  }
}

export function shouldUsePrintBlockEditor(template: PrintTemplate): boolean {
  const raw = template.blocks_json
  if (typeof raw === 'string' && raw.length > 20) {
    const parsed = parsePrintBlocksJson(raw)
    if (parsed) return true
  }
  const canvasElements = template.settings?.canvas_elements
  if (Array.isArray(canvasElements) && canvasElements.length > 0) {
    const cleaned = canvasElements.filter(
      (x) => x && typeof x === 'object' && typeof (x as { id?: unknown }).id === 'string' && typeof (x as { type?: unknown }).type === 'string',
    )
    if (cleaned.length >= 2) return false
    if (cleaned.length === 1) {
      const ty = (cleaned[0] as { type?: string }).type
      return ty === 'html_embed'
    }
  }
  return true
}
