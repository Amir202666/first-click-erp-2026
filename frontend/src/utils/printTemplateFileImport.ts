import type {
  PrintDocumentType,
  PrintMargins,
  PrintOrientation,
  PrintPaperSize,
} from '../types/printTemplate'
import { convertPosTemplateFileToHtml, extractPosTemplateTitle } from './posTemplateImport'

export type ImportPreviewData = {
  name: string
  document_type: PrintDocumentType
  paper_size: PrintPaperSize
  html_content: string
  settings?: Record<string, unknown>
  blocks_json?: string | null
  orientation?: PrintOrientation
  margins?: PrintMargins | null
  sections?: Record<string, boolean> | null
}

const VALID_DOC_TYPES = new Set<PrintDocumentType>([
  'invoice',
  'receipt',
  'payment',
  'journal',
  'purchase',
  'inventory',
  'pos',
])

const VALID_PAPER_SIZES = new Set<PrintPaperSize>(['A4', 'A5', 'thermal_80', 'thermal_58'])

export function normalizeDocumentType(raw: string | undefined): PrintDocumentType {
  const v = (raw ?? '').trim().toLowerCase()
  if (VALID_DOC_TYPES.has(v as PrintDocumentType)) return v as PrintDocumentType
  return 'invoice'
}

export function normalizePaperSize(raw: string | undefined): PrintPaperSize {
  const v = (raw ?? '').trim()
  const aliases: Record<string, PrintPaperSize> = {
    A4: 'A4',
    A5: 'A5',
    thermal_80: 'thermal_80',
    thermal80: 'thermal_80',
    '80mm': 'thermal_80',
    thermal_58: 'thermal_58',
    thermal58: 'thermal_58',
    '58mm': 'thermal_58',
  }
  const mapped = aliases[v] ?? aliases[v.toUpperCase()]
  if (mapped) return mapped
  if (VALID_PAPER_SIZES.has(v as PrintPaperSize)) return v as PrintPaperSize
  return 'A4'
}

function pickImportMeta(parsed: Record<string, unknown>, fileBaseName: string): Partial<ImportPreviewData> {
  const settings =
    parsed.settings && typeof parsed.settings === 'object' && !Array.isArray(parsed.settings)
      ? (parsed.settings as Record<string, unknown>)
      : {}

  const blocksRaw = parsed.blocks_json ?? parsed.blocksJson
  const blocks_json =
    typeof blocksRaw === 'string'
      ? blocksRaw
      : blocksRaw != null
        ? JSON.stringify(blocksRaw)
        : null

  const orientationRaw = (parsed.orientation ?? settings.orientation) as string | undefined
  const orientation: PrintOrientation | undefined =
    orientationRaw === 'landscape' || orientationRaw === 'portrait' ? orientationRaw : undefined

  const marginsRaw = parsed.margins
  const margins =
    marginsRaw && typeof marginsRaw === 'object' && !Array.isArray(marginsRaw)
      ? (marginsRaw as PrintMargins)
      : null

  const sectionsRaw = parsed.sections
  const sections =
    sectionsRaw && typeof sectionsRaw === 'object' && !Array.isArray(sectionsRaw)
      ? (sectionsRaw as Record<string, boolean>)
      : null

  const layoutFromParsed = (parsed.layout ?? settings.layout) as string | undefined

  return {
    name: String(parsed.name ?? parsed.title ?? fileBaseName).trim(),
    document_type: normalizeDocumentType(
      String(parsed.document_type ?? parsed.documentType ?? parsed.type ?? 'invoice'),
    ),
    paper_size: normalizePaperSize(String(parsed.paper_size ?? parsed.paperSize ?? parsed.paper ?? 'A4')),
    html_content: String(parsed.html_content ?? parsed.htmlContent ?? parsed.html ?? parsed.content ?? ''),
    settings: {
      ...settings,
      ...(layoutFromParsed ? { layout: layoutFromParsed } : {}),
    },
    blocks_json,
    orientation,
    margins,
    sections,
  }
}

export async function parseImportTemplateFile(file: File): Promise<ImportPreviewData> {
  const text = await file.text()
  const fileName = file.name.toLowerCase()
  const baseName = file.name.replace(/\.[^.]+$/, '')

  let partial: Partial<ImportPreviewData> | null = null

  if (fileName.endsWith('.json')) {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new Error('ملف JSON غير صالح')
    }

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>
      if (obj.html_content || obj.htmlContent || obj.html || obj.content) {
        partial = pickImportMeta(obj, baseName)
      } else {
        partial = {
          name: String(obj.name ?? baseName).trim(),
          document_type: normalizeDocumentType(String(obj.document_type ?? 'invoice')),
          paper_size: normalizePaperSize(String(obj.paper_size ?? 'A4')),
          html_content: JSON.stringify(obj, null, 2),
          settings: (obj.settings as Record<string, unknown>) ?? {},
        }
      }
    } else {
      throw new Error('ملف JSON غير صالح')
    }
  } else if (fileName.endsWith('.html') || fileName.endsWith('.htm')) {
    const nameMatch = text.match(/<title[^>]*>(.*?)<\/title>/i)
    const extractedName = nameMatch?.[1]?.trim() || baseName
    let htmlContent = text
    const bodyMatch = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
    if (bodyMatch) htmlContent = bodyMatch[1].trim()

    partial = {
      name: extractedName,
      document_type: 'invoice',
      paper_size: 'A4',
      html_content: htmlContent,
      settings: { layout: 'imported' },
    }
  } else if (fileName.endsWith('.xml')) {
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(text, 'text/xml')
    const getName = (tag: string) => xmlDoc.querySelector(tag)?.textContent?.trim() ?? ''

    partial = {
      name: getName('name') || getName('title') || baseName,
      document_type: normalizeDocumentType(getName('document_type') || getName('type') || 'invoice'),
      paper_size: normalizePaperSize(getName('paper_size') || getName('paper') || 'A4'),
      html_content: getName('html_content') || getName('html') || getName('content') || text,
      settings: { layout: 'imported' },
    }
  } else if (fileName.endsWith('.file')) {
    const converted = convertPosTemplateFileToHtml(text)

    if (converted && converted.length > 200) {
      partial = {
        name: extractPosTemplateTitle(text, baseName),
        document_type: 'pos',
        paper_size: 'thermal_80',
        html_content: converted,
        settings: {
          layout: 'imported',
          accent_color: '#0891b2',
          font: 'Cairo',
          original_format: 'pos_php_serialized',
        },
      }
    } else {
      let parsedAsJson = false
      try {
        const parsed = JSON.parse(text) as Record<string, unknown>
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          parsedAsJson = true
          const mergedSettings: Record<string, unknown> = {
            ...(parsed.settings && typeof parsed.settings === 'object' && !Array.isArray(parsed.settings)
              ? (parsed.settings as Record<string, unknown>)
              : {}),
            ...(parsed.config && typeof parsed.config === 'object' && !Array.isArray(parsed.config)
              ? (parsed.config as Record<string, unknown>)
              : {}),
          }
          const obj: Record<string, unknown> = { ...parsed, settings: mergedSettings }
          if (obj.html_content || obj.htmlContent || obj.html || obj.content) {
            partial = pickImportMeta(obj, baseName)
          } else {
            parsedAsJson = false
          }
        }
      } catch {
        parsedAsJson = false
      }

      if (!parsedAsJson || !partial?.html_content?.trim()) {
        const bodyMatch = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
        const htmlContent = bodyMatch ? bodyMatch[1].trim() : text.trim()
        const nameMatch = text.match(/<title[^>]*>(.*?)<\/title>/i)
        const extractedName = nameMatch?.[1]?.trim() || baseName

        partial = {
          name: extractedName,
          document_type: 'invoice',
          paper_size: 'A4',
          html_content: htmlContent,
          settings: { layout: 'imported' },
        }
      }
    }
  } else if (fileName.endsWith('.txt')) {
    partial = {
      name: baseName,
      document_type: 'invoice',
      paper_size: 'A4',
      html_content: text,
      settings: { layout: 'imported' },
    }
  } else {
    const bodyMatch = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
    const htmlContent = bodyMatch ? bodyMatch[1].trim() : text.trim()

    partial = {
      name: file.name,
      document_type: 'invoice',
      paper_size: 'A4',
      html_content: htmlContent,
      settings: { layout: 'imported' },
    }
  }

  if (!partial?.html_content?.trim()) {
    if (fileName.endsWith('.file')) {
      throw new Error('تعذر تحويل ملف القالب. تأكد أنه ملف قالب POS صحيح (Base64 + PHP Serialized).')
    }
    throw new Error('لم يتم العثور على محتوى في الملف')
  }

  return {
    name: partial.name?.trim() || baseName,
    document_type: partial.document_type ?? 'invoice',
    paper_size: partial.paper_size ?? 'A4',
    html_content: partial.html_content.trim(),
    settings: { layout: 'imported', ...(partial.settings ?? {}) },
    blocks_json: partial.blocks_json ?? null,
    orientation: partial.orientation,
    margins: partial.margins ?? null,
    sections: partial.sections ?? null,
  }
}
