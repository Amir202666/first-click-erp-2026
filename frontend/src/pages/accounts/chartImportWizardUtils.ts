import * as XLSX from 'xlsx'

export type ChartImportFieldKey =
  | 'code'
  | 'name'
  | 'name_en'
  | 'type'
  | 'parent_code'
  | 'level'
  | 'is_postable'
  | 'description'
  | 'normal_balance'

export const CHART_IMPORT_FIELD_LIST: { key: ChartImportFieldKey; required?: boolean }[] = [
  { key: 'code', required: true },
  { key: 'name', required: true },
  { key: 'name_en' },
  { key: 'type' },
  { key: 'parent_code' },
  { key: 'level' },
  { key: 'is_postable' },
  { key: 'description' },
  { key: 'normal_balance' },
]

const VALID_TYPES = new Set(['asset', 'liability', 'equity', 'revenue', 'cogs', 'expense'])

const HEADER_SYNONYMS: Record<ChartImportFieldKey, string[]> = {
  code: ['code', 'account_code', 'رمز', 'كود', 'رمز_الحساب', 'accountcode'],
  name: ['name', 'account_name', 'اسم', 'اسم_الحساب', 'accountname'],
  name_en: ['name_en', 'nameen', 'name_english', 'الاسم_بالإنجليزي'],
  type: ['type', 'account_type', 'نوع', 'نوع_الحساب'],
  parent_code: ['parent_code', 'parentcode', 'parent', 'رمز_الأب', 'الحساب_الأب', 'كود_الأب'],
  level: ['level', 'مستوى', 'المستوى'],
  is_postable: ['is_postable', 'ispostable', 'postable', 'قابل_للترحيل'],
  description: ['description', 'desc', 'وصف', 'البيان'],
  normal_balance: ['normal_balance', 'normalbalance', 'طبيعة_الحساب'],
}

function normHeader(s: string): string {
  return s
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
}

export function guessChartImportMapping(headers: string[]): Record<ChartImportFieldKey, string> {
  const out = {} as Record<ChartImportFieldKey, string>
  for (const f of CHART_IMPORT_FIELD_LIST) {
    out[f.key] = ''
  }
  const used = new Set<string>()
  for (const field of CHART_IMPORT_FIELD_LIST) {
    const syns = HEADER_SYNONYMS[field.key]
    for (const h of headers) {
      if (!h || used.has(h)) continue
      const n = normHeader(h)
      if (syns.some((s) => n === s || n.endsWith('_' + s) || n.startsWith(s + '_'))) {
        out[field.key] = h
        used.add(h)
        break
      }
    }
  }
  return out
}

export async function parseChartImportFile(file: File): Promise<string[][]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const name = wb.SheetNames[0]
  if (!name) return []
  const sheet = wb.Sheets[name]
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' }) as string[][]
  return rows
    .map((r) => r.map((c) => String(c ?? '').trim()))
    .filter((r) => r.some((c) => c !== ''))
}

function cell(raw: Record<string, string>, mapping: Record<ChartImportFieldKey, string>, key: ChartImportFieldKey): string {
  const col = mapping[key]
  if (!col) return ''
  return String(raw[col] ?? '').trim()
}

function parseBool(s: string): boolean {
  const v = s.trim().toLowerCase()
  if (['0', 'false', 'no', 'n', 'لا'].includes(v)) return false
  return ['1', 'true', 'yes', 'y', 'نعم'].includes(v)
}

export type ChartImportPreviewRow = {
  line: number
  code: string
  name: string
  name_en: string | null
  type: string
  parent_code: string
  level: number | null
  is_postable: boolean
  description: string | null
  normal_balance: 'debit' | 'credit' | null
  status: 'ok' | 'error'
  reason: string
}

export type ChartImportCommitRow = {
  line: number
  code: string
  name: string
  name_en?: string | null
  type?: string
  parent_code?: string
  level?: number | null
  is_postable?: boolean
  description?: string | null
  normal_balance?: 'debit' | 'credit' | null
}

export type ChartImportPreviewMessages = {
  empty: string
  duplicateDb: string
  duplicateFile: (firstLine: number) => string
  selfParent: string
  parentMissing: (parentCode: string) => string
  cycle: string
}

export function buildChartImportPreview(
  dataRows: string[][],
  headerRow: string[],
  mapping: Record<ChartImportFieldKey, string>,
  existingCodes: Set<string>,
  messages: ChartImportPreviewMessages,
): ChartImportPreviewRow[] {
  const headers = headerRow.map((h) => String(h ?? '').trim())

  const getRawRecord = (row: string[]): Record<string, string> => {
    const rec: Record<string, string> = {}
    headers.forEach((h, i) => {
      if (h) rec[h] = String(row[i] ?? '').trim()
    })
    return rec
  }

  const codesInFile = new Set<string>()
  for (let i = 0; i < dataRows.length; i++) {
    const rec = getRawRecord(dataRows[i])
    const code = cell(rec, mapping, 'code')
    const name = cell(rec, mapping, 'name')
    if (code && name) codesInFile.add(code)
  }

  const firstLineByCode = new Map<string, number>()
  const preview: ChartImportPreviewRow[] = []

  for (let i = 0; i < dataRows.length; i++) {
    const line = i + 2
    const rec = getRawRecord(dataRows[i])
    const code = cell(rec, mapping, 'code')
    const name = cell(rec, mapping, 'name')
    const parent_code = cell(rec, mapping, 'parent_code')
    let type = cell(rec, mapping, 'type').toLowerCase()
    if (!type || !VALID_TYPES.has(type)) type = 'asset'
    const name_en_raw = cell(rec, mapping, 'name_en')
    const name_en = name_en_raw === '' ? null : name_en_raw
    const desc_raw = cell(rec, mapping, 'description')
    const description = desc_raw === '' ? null : desc_raw
    const levelStr = cell(rec, mapping, 'level')
    const level = levelStr && /^\d+$/.test(levelStr) ? Math.max(1, parseInt(levelStr, 10)) : null
    const isPostRaw = cell(rec, mapping, 'is_postable')
    const is_postable = !mapping.is_postable || isPostRaw === '' ? true : parseBool(isPostRaw)
    const nbRaw = cell(rec, mapping, 'normal_balance').toLowerCase()
    const normal_balance: 'debit' | 'credit' | null =
      nbRaw === 'debit' || nbRaw === 'credit' ? (nbRaw as 'debit' | 'credit') : null

    let status: 'ok' | 'error' = 'ok'
    let reason = ''

    if (!code || !name) {
      status = 'error'
      reason = messages.empty
    } else if (existingCodes.has(code)) {
      status = 'error'
      reason = messages.duplicateDb
    } else if (firstLineByCode.has(code)) {
      status = 'error'
      reason = messages.duplicateFile(firstLineByCode.get(code)!)
    } else if (parent_code && parent_code === code) {
      status = 'error'
      reason = messages.selfParent
    } else if (parent_code && !existingCodes.has(parent_code) && !codesInFile.has(parent_code)) {
      status = 'error'
      reason = messages.parentMissing(parent_code)
    } else {
      firstLineByCode.set(code, line)
    }

    preview.push({
      line,
      code,
      name,
      name_en,
      type,
      parent_code,
      level,
      is_postable,
      description,
      normal_balance,
      status,
      reason,
    })
  }

  const okRows = preview.filter((r) => r.status === 'ok' && r.code)
  const codeSet = new Set(okRows.map((r) => r.code))
  const indeg = new Map<string, number>()
  const adj = new Map<string, string[]>()
  okRows.forEach((r) => indeg.set(r.code, 0))
  okRows.forEach((r) => {
    const p = r.parent_code.trim()
    if (p && codeSet.has(p)) {
      indeg.set(r.code, (indeg.get(r.code) ?? 0) + 1)
      if (!adj.has(p)) adj.set(p, [])
      adj.get(p)!.push(r.code)
    }
  })
  const queue = okRows.filter((r) => (indeg.get(r.code) ?? 0) === 0).map((r) => r.code)
  const sorted: string[] = []
  while (queue.length) {
    const u = queue.shift()!
    sorted.push(u)
    for (const v of adj.get(u) ?? []) {
      indeg.set(v, (indeg.get(v) ?? 0) - 1)
      if (indeg.get(v) === 0) queue.push(v)
    }
  }
  if (sorted.length < okRows.length) {
    const inSorted = new Set(sorted)
    preview.forEach((r) => {
      if (r.status === 'ok' && r.code && !inSorted.has(r.code)) {
        r.status = 'error'
        r.reason = messages.cycle
      }
    })
  }

  return preview
}

export function previewToCommitRows(rows: ChartImportPreviewRow[]): ChartImportCommitRow[] {
  return rows
    .filter((r) => r.status === 'ok' && r.code && r.name)
    .map((r) => ({
      line: r.line,
      code: r.code,
      name: r.name,
      name_en: r.name_en,
      type: r.type,
      parent_code: r.parent_code || '',
      level: r.level,
      is_postable: r.is_postable,
      description: r.description,
      normal_balance: r.normal_balance,
    }))
}

/**
 * رابط تنزيل القالب الثابت من `public/templates/`
 * (أكثر موثوقية من توليد الملف في المتصفح عبر Blob).
 */
export function chartImportTemplateDownloadUrl(format: 'xlsx' | 'csv'): string {
  const base = import.meta.env.BASE_URL ?? '/'
  const prefix = base.endsWith('/') ? base : `${base}/`
  const ext = format === 'csv' ? 'csv' : 'xlsx'
  return `${prefix}templates/chart-of-accounts-template.${ext}`
}
