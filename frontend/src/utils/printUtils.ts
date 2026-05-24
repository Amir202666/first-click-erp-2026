import type { PrintDocumentType, PrintPaperSize } from '../types/printTemplate'

export const DOC_TYPE_LABELS: Record<PrintDocumentType, { ar: string; en: string }> = {
  invoice: { ar: 'فاتورة مبيعات', en: 'Sales invoice' },
  pos: { ar: 'إيصال POS', en: 'POS receipt' },
  receipt: { ar: 'سند قبض', en: 'Receipt voucher' },
  payment: { ar: 'سند صرف', en: 'Payment voucher' },
  journal: { ar: 'قيد يومية', en: 'Journal entry' },
  purchase: { ar: 'فاتورة مشتريات', en: 'Purchase invoice' },
  inventory: { ar: 'تسوية مخزنية', en: 'Inventory adjustment' },
}

export const DOC_TYPE_ORDER: PrintDocumentType[] = [
  'invoice',
  'pos',
  'receipt',
  'payment',
  'journal',
  'purchase',
  'inventory',
]

export const TEMPLATE_THUMB_COLORS: Record<PrintDocumentType, string> = {
  invoice: '#6366f1',
  pos: '#0891b2',
  receipt: '#059669',
  payment: '#dc2626',
  journal: '#8b5cf6',
  purchase: '#f59e0b',
  inventory: '#6b7280',
}

export function paperPreviewAspect(paper: PrintPaperSize): { w: number; h: number } {
  if (paper === 'thermal_80') return { w: 80, h: 200 }
  if (paper === 'thermal_58') return { w: 58, h: 200 }
  if (paper === 'A5') return { w: 148, h: 210 }
  return { w: 210, h: 297 }
}

export function clampZoom(z: number): number {
  return Math.min(160, Math.max(40, Math.round(z)))
}

export type VariableGroup = { title: string; items: { label: string; code: string }[] }

export const VARIABLES_BY_DOC_TYPE: Partial<Record<PrintDocumentType, VariableGroup[]>> = {
  invoice: [
    {
      title: 'الشركة',
      items: [
        { label: 'اسم الشركة', code: '{{company.name}}' },
        { label: 'عنوان الشركة', code: '{{company.address}}' },
        { label: 'هاتف الشركة', code: '{{company.phone}}' },
        { label: 'الرقم الضريبي', code: '{{company.tax_no}}' },
        { label: 'شعار الشركة', code: '{{company.logo}}' },
      ],
    },
    {
      title: 'الفاتورة',
      items: [
        { label: 'رقم الفاتورة', code: '{{inv.number}}' },
        { label: 'تاريخ الفاتورة', code: '{{inv.date}}' },
        { label: 'تاريخ الاستحقاق', code: '{{inv.due_date}}' },
        { label: 'طريقة الدفع', code: '{{inv.payment}}' },
        { label: 'ملاحظات', code: '{{inv.notes}}' },
        { label: 'الكاشير', code: '{{inv.cashier}}' },
        { label: 'المستخدم', code: '{{inv.user}}' },
        { label: 'حالة الفاتورة', code: '{{inv.status}}' },
      ],
    },
    {
      title: 'العميل',
      items: [
        { label: 'اسم العميل', code: '{{customer.name}}' },
        { label: 'هاتف العميل', code: '{{customer.phone}}' },
        { label: 'عنوان العميل', code: '{{customer.address}}' },
      ],
    },
    {
      title: 'الإجماليات',
      items: [
        { label: 'المجموع الفرعي', code: '{{formatNumber subtotal}}' },
        { label: 'المجموع', code: '{{formatNumber subtotal}}' },
        { label: 'الخصم', code: '{{formatNumber discount}}' },
        { label: 'الضريبة', code: '{{formatNumber vat_amount}}' },
        { label: 'الإضافات', code: '{{formatNumber additions}}' },
        { label: 'الإجمالي', code: '{{formatNumber total_amount}}' },
        { label: 'المدفوع', code: '{{formatNumber paid}}' },
        { label: 'المتبقي / الرصيد', code: '{{formatNumber balance}}' },
      ],
    },
  ],
  pos: [
    {
      title: 'الإيصال',
      items: [
        { label: 'رقم الإيصال', code: '{{inv.number}}' },
        { label: 'التاريخ', code: '{{inv.date}}' },
        { label: 'الإجمالي', code: '{{formatNumber total_amount}}' },
      ],
    },
  ],
  receipt: [
    {
      title: 'السند',
      items: [
        { label: 'رقم السند', code: '{{voucher.number}}' },
        { label: 'التاريخ', code: '{{voucher.date}}' },
        { label: 'المبلغ', code: '{{voucher.amount}}' },
      ],
    },
  ],
  payment: [
    {
      title: 'السند',
      items: [
        { label: 'رقم السند', code: '{{voucher.number}}' },
        { label: 'التاريخ', code: '{{voucher.date}}' },
        { label: 'المبلغ', code: '{{voucher.amount}}' },
      ],
    },
  ],
  journal: [
    {
      title: 'القيد',
      items: [
        { label: 'رقم القيد', code: '{{entry.number}}' },
        { label: 'التاريخ', code: '{{entry.date}}' },
        { label: 'البيان', code: '{{entry.description}}' },
      ],
    },
  ],
  purchase: [
    {
      title: 'فاتورة المشتريات',
      items: [
        { label: 'رقم الفاتورة', code: '{{inv.number}}' },
        { label: 'التاريخ', code: '{{inv.date}}' },
        { label: 'تاريخ الاستحقاق', code: '{{inv.due_date}}' },
        { label: 'طريقة الدفع', code: '{{inv.payment}}' },
        { label: 'ملاحظات', code: '{{inv.notes}}' },
        { label: 'الكاشير', code: '{{inv.cashier}}' },
        { label: 'المستخدم', code: '{{inv.user}}' },
        { label: 'حالة الفاتورة', code: '{{inv.status}}' },
        { label: 'المورد', code: '{{supplier.name}}' },
      ],
    },
    {
      title: 'الإجماليات',
      items: [
        { label: 'المجموع الفرعي', code: '{{formatNumber subtotal}}' },
        { label: 'المجموع', code: '{{formatNumber subtotal}}' },
        { label: 'الخصم', code: '{{formatNumber discount}}' },
        { label: 'الضريبة', code: '{{formatNumber vat_amount}}' },
        { label: 'الإضافات', code: '{{formatNumber additions}}' },
        { label: 'الإجمالي', code: '{{formatNumber total_amount}}' },
        { label: 'المدفوع', code: '{{formatNumber paid}}' },
        { label: 'المتبقي / الرصيد', code: '{{formatNumber balance}}' },
      ],
    },
  ],
  inventory: [
    {
      title: 'التسوية',
      items: [
        { label: 'رقم المستند', code: '{{adj.number}}' },
        { label: 'التاريخ', code: '{{adj.date}}' },
        { label: 'المستودع', code: '{{warehouse.name}}' },
      ],
    },
  ],
}
