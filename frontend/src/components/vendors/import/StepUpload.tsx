import { useRef, useState } from 'react'
import { Download, FileSpreadsheet, Upload } from 'lucide-react'
import { downloadVendorTemplate } from '../../../utils/generateVendorTemplate'
import { parseCustomerFile } from '../../../utils/parseCustomerFile'

interface StepUploadProps {
  lang: 'ar' | 'en'
  file: File | null
  rowCount: number
  previewRows: Record<string, string>[]
  onFileLoaded: (file: File, headers: string[], rows: Record<string, string>[]) => void
  onError: (message: string) => void
}

export default function StepUpload({
  lang,
  file,
  rowCount,
  previewRows,
  onFileLoaded,
  onError,
}: StepUploadProps) {
  const isAr = lang === 'ar'
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleFile = async (f: File) => {
    setLoading(true)
    try {
      const { headers, rows } = await parseCustomerFile(f)
      if (headers.length === 0 || rows.length === 0) {
        onError(isAr ? 'الملف فارغ أو بدون بيانات' : 'File is empty or has no data rows')
        return
      }
      if (rows.length > 1000) {
        onError(isAr ? 'الحد الأقصى 1000 مورد — قسّم الملف' : 'Maximum 1000 rows — split the file')
        return
      }
      onFileLoaded(f, headers, rows)
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (msg === 'UNSUPPORTED_FORMAT') {
        onError(isAr ? 'صيغة غير مدعومة — Excel أو CSV فقط' : 'Unsupported format — Excel or CSV only')
      } else if (msg === 'FILE_TOO_LARGE') {
        onError(isAr ? 'حجم الملف أكبر من 5MB' : 'File exceeds 5MB limit')
      } else {
        onError(isAr ? 'تعذّر قراءة الملف' : 'Could not read file')
      }
    } finally {
      setLoading(false)
    }
  }

  const previewHeaders = previewRows.length > 0 ? Object.keys(previewRows[0]) : []

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => downloadVendorTemplate()}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
      >
        <Download className="h-4 w-4" />
        {isAr ? 'تحميل ملف النموذج Excel' : 'Download Excel template'}
      </button>

      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const f = e.dataTransfer.files?.[0]
          if (f) void handleFile(f)
        }}
        className={`flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 transition ${
          dragOver ? 'border-primary-500 bg-primary-50' : 'border-slate-200 bg-slate-50'
        }`}
      >
        <Upload className="mb-2 h-10 w-10 text-slate-400" />
        <p className="text-sm text-slate-700">
          {loading
            ? (isAr ? 'جاري القراءة...' : 'Reading...')
            : (isAr ? 'اسحب الملف هنا أو اضغط للرفع' : 'Drag file here or click to upload')}
        </p>
        <p className="mt-1 text-xs text-slate-500">Excel (.xlsx) · CSV (.csv) · max 5MB</p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleFile(f)
          }}
        />
      </div>

      {file ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2 text-sm text-slate-700">
            <FileSpreadsheet className="h-4 w-4 text-primary-600" />
            <span>{file.name}</span>
            <span className="text-slate-500">({rowCount} {isAr ? 'صف' : 'rows'})</span>
          </div>
          {previewRows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-600">
                    {previewHeaders.slice(0, 6).map((h) => (
                      <th key={h} className="px-2 py-1 text-start">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.slice(0, 3).map((row, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      {previewHeaders.slice(0, 6).map((h) => (
                        <td key={h} className="px-2 py-1">{row[h] || '—'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
