import {
  fetchDefaultPrintTemplate,
  fetchPrintTemplate,
  fetchPrintTemplates,
} from '../api/printTemplates'
import type { PrintDocumentType, PrintPaperSize, PrintTemplate } from '../types/printTemplate'
import { normalizeDocumentType, normalizePaperSize } from './printTemplateFileImport'

export interface ResolvePrintTemplateOptions {
  /** إن وُجد يُستخدم مباشرة (يتجاوز document_type و paper_size) */
  templateId?: number
  documentType?: PrintDocumentType
  paperSize?: PrintPaperSize
}

function pickTemplateForTypeAndPaper(
  templates: PrintTemplate[],
  documentType: PrintDocumentType,
  paperSize?: PrintPaperSize,
): PrintTemplate | null {
  const ofType = templates.filter((t) => t.document_type === documentType)
  if (!ofType.length) return null

  if (paperSize) {
    const defaultMatching = ofType.find((t) => t.is_default && t.paper_size === paperSize)
    if (defaultMatching) return defaultMatching
    const anyMatching = ofType.find((t) => t.paper_size === paperSize)
    if (anyMatching) return anyMatching
  }

  const defaultAny = ofType.find((t) => t.is_default)
  if (defaultAny) return defaultAny

  return [...ofType].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)[0] ?? null
}

/**
 * يختار قالب الطباعة:
 * 1) templateId إن وُجد
 * 2) افتراضي لنوع المستند (مع تفضيل paperSize إن وُجد)
 * 3) أول قالب من نفس النوع (عبر API أو القائمة)
 */
export async function resolvePrintTemplate(
  tenantId: number,
  opts: ResolvePrintTemplateOptions,
): Promise<PrintTemplate | null> {
  if (!tenantId) return null

  const templateId = opts.templateId != null ? Number(opts.templateId) : NaN
  if (Number.isFinite(templateId) && templateId > 0) {
    try {
      return await fetchPrintTemplate(tenantId, templateId)
    } catch {
      /* fall through to document type */
    }
  }

  const documentType = opts.documentType ? normalizeDocumentType(opts.documentType) : undefined
  if (!documentType) return null

  const paperSize = opts.paperSize ? normalizePaperSize(opts.paperSize) : undefined

  if (paperSize) {
    const list = await fetchPrintTemplates(tenantId, documentType)
    const picked = pickTemplateForTypeAndPaper(list.data ?? [], documentType, paperSize)
    if (picked) return picked
  }

  return fetchDefaultPrintTemplate(tenantId, documentType)
}

export function parsePrintTemplateQueryParams(searchParams: URLSearchParams): {
  documentType?: PrintDocumentType
  templateId?: number
  paperSize?: PrintPaperSize
} {
  const docRaw =
    searchParams.get('doc_type') ??
    searchParams.get('document_type') ??
    searchParams.get('documentType') ??
    undefined
  const tplRaw =
    searchParams.get('template_id') ?? searchParams.get('templateId') ?? undefined
  const paperRaw =
    searchParams.get('paper_size') ?? searchParams.get('paperSize') ?? undefined

  const templateId = tplRaw != null ? Number(tplRaw) : NaN

  return {
    documentType: docRaw ? normalizeDocumentType(docRaw) : undefined,
    templateId: Number.isFinite(templateId) && templateId > 0 ? templateId : undefined,
    paperSize: paperRaw ? normalizePaperSize(paperRaw) : undefined,
  }
}
