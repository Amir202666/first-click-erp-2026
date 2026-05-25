import * as XLSX from 'xlsx'

const MAX_BYTES = 5 * 1024 * 1024

export async function parseCustomerFile(
  file: File,
): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const name = file.name.toLowerCase()
  const isExcel = name.endsWith('.xlsx') || name.endsWith('.xls')
  const isCSV = name.endsWith('.csv')

  if (!isExcel && !isCSV) {
    throw new Error('UNSUPPORTED_FORMAT')
  }

  if (file.size > MAX_BYTES) {
    throw new Error('FILE_TOO_LARGE')
  }

  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array', raw: false })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) {
    return { headers: [], rows: [] }
  }

  const sheet = wb.Sheets[sheetName]
  const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' }) as string[][]
  const cleaned = matrix
    .map((row) => row.map((cell) => String(cell ?? '').trim()))
    .filter((row) => row.some((cell) => cell !== ''))

  if (cleaned.length < 2) {
    return { headers: [], rows: [] }
  }

  const headers = cleaned[0].map((h) => h.replace(/^\uFEFF/, '').trim())
  const rows = cleaned.slice(1).map((row) => {
    const record: Record<string, string> = {}
    headers.forEach((header, index) => {
      if (header) record[header] = row[index] ?? ''
    })
    return record
  })

  return { headers, rows }
}
