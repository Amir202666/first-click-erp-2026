import type { PrintDocumentType, PrintPaperSize } from '../types/printTemplate'
import { normalizePaperSize } from './printTemplateFileImport'

export interface OpenInvoicePrintOptions {
  /** نوع مستند القالب: pos | invoice | purchase | ... */
  documentType?: PrintDocumentType
  /** قالب محدد — يتجاوز الافتراضي لنوع المستند */
  templateId?: number
  /** تفضيل حجم الورق عند اختيار القالب (مثلاً thermal_80) */
  paperSize?: PrintPaperSize
  /** فتح مع طباعة تلقائية (افتراضي: true) */
  autoPrint?: boolean
}

/** خيارات طباعة فواتير نقطة البيع من إعدادات POS */
export function posPrintOptionsFromSettings(
  settings: Record<string, unknown> | undefined | null,
): OpenInvoicePrintOptions {
  const mode = String(settings?.pos_print_mode ?? 'thermal_80').trim().toLowerCase()
  const paperSize: PrintPaperSize =
    mode === 'a4' ? 'A4' : normalizePaperSize(mode === 'thermal_80' ? 'thermal_80' : mode)
  return {
    documentType: 'pos',
    paperSize,
    autoPrint: true,
  }
}

export function buildInvoiceViewPrintUrl(
  invoiceId: number,
  opts?: OpenInvoicePrintOptions,
): string {
  const params = new URLSearchParams()
  if (opts?.autoPrint !== false) params.set('autoprint', '1')
  if (opts?.documentType) params.set('doc_type', opts.documentType)
  if (opts?.templateId != null && opts.templateId > 0) {
    params.set('template_id', String(opts.templateId))
  }
  if (opts?.paperSize) params.set('paper_size', opts.paperSize)
  const qs = params.toString()
  return `/invoices/view/${invoiceId}${qs ? `?${qs}` : ''}`
}

/** فتح صفحة عرض الفاتورة في تبويب جديد مع طباعة تلقائية بعد التحميل */
export function openInvoiceViewForPrint(
  invoiceId: number | string,
  opts?: OpenInvoicePrintOptions,
): void {
  if (typeof window === 'undefined') return
  const id = Number(invoiceId)
  if (!Number.isFinite(id) || id <= 0) return
  window.open(buildInvoiceViewPrintUrl(id, opts), '_blank', 'noopener,noreferrer')
}

/** @deprecated استخدم openInvoiceViewForPrint */
export async function openInvoicePrintDialog(
  tenantId: number,
  invoiceId: number,
  opts?: OpenInvoicePrintOptions,
): Promise<void> {
  void tenantId
  openInvoiceViewForPrint(invoiceId, opts)
}
