import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, FileInput } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchItems } from '../../api/tenant'
import { importItemsBatch } from '../../api/importItems'
import ImportProgressBar from '../../components/items/import/ImportProgressBar'
import StepUpload from '../../components/items/import/StepUpload'
import StepMapFields, { isItemMappingValid } from '../../components/items/import/StepMapFields'
import StepPreview, { countValidPreviewRows } from '../../components/items/import/StepPreview'
import StepResult from '../../components/items/import/StepResult'
import type {
  ItemFieldMapping,
  ItemImportResult,
  ItemImportRowParsed,
  ItemImportSettings,
} from '../../types/itemImport'
import { applyItemMappingToRows, guessItemFieldMapping } from '../../utils/validateItemRow'

export default function ImportItems() {
  const { currentTenant } = useAuth()
  const { lang, isRtl } = useLanguage()
  const isAr = lang === 'ar'
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()

  const [step, setStep] = useState(1)
  const [file, setFile] = useState<File | null>(null)
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([])
  const [mapping, setMapping] = useState<ItemFieldMapping[]>([])
  const [settings, setSettings] = useState<ItemImportSettings>({
    skipDuplicates: true,
    updateExisting: false,
    createCategories: true,
    createUnits: true,
  })
  const [uploadError, setUploadError] = useState('')
  const [result, setResult] = useState<ItemImportResult | null>(null)

  const { data: existingItems } = useQuery({
    queryKey: ['items', tenantId, 'import-codes'],
    queryFn: () => fetchItems(tenantId, { per_page: '2000' }),
    enabled: tenantId > 0,
  })

  const existingCodes = useMemo(() => {
    const set = new Set<string>()
    existingItems?.data?.forEach((item) => {
      if (item.code?.trim()) set.add(item.code.trim().toLowerCase())
    })
    return set
  }, [existingItems])

  const previewRows: ItemImportRowParsed[] = useMemo(() => {
    const parsed = applyItemMappingToRows(rawRows, mapping)
    const seenInFile = new Map<string, number>()

    return parsed.map(({ data, errors, rowIndex }) => {
      const codeKey = data.code?.trim().toLowerCase() ?? ''
      let status: ItemImportRowParsed['_status'] = 'valid'
      const rowErrors = [...errors]

      if (rowErrors.length > 0) {
        status = 'error'
      } else if (codeKey && existingCodes.has(codeKey)) {
        status = settings.updateExisting ? 'valid' : 'duplicate'
      } else if (codeKey) {
        const firstLine = seenInFile.get(codeKey)
        if (firstLine != null) {
          status = 'duplicate'
          rowErrors.push(isAr ? `مكرر في الملف (الصف ${firstLine})` : `Duplicate in file (row ${firstLine})`)
        } else {
          seenInFile.set(codeKey, rowIndex)
        }
      }

      return {
        ...data,
        _rowIndex: rowIndex,
        _errors: rowErrors,
        _status: status,
      }
    })
  }, [rawRows, mapping, existingCodes, settings.updateExisting, isAr])

  const importMut = useMutation({
    mutationFn: () => {
      const items = previewRows
        .filter((r) => r._status === 'valid')
        .map(({ _rowIndex, _errors, _status, ...row }) => row)

      return importItemsBatch(tenantId, { items, settings })
    },
    onSuccess: (data) => {
      setResult(data)
      setStep(4)
      queryClient.invalidateQueries({ queryKey: ['items', tenantId] })
    },
  })

  const canNext = () => {
    if (step === 1) return file && rawRows.length > 0
    if (step === 2) return isItemMappingValid(mapping)
    if (step === 3) return countValidPreviewRows(previewRows) > 0
    return false
  }

  const handleFileLoaded = (f: File, hdrs: string[], rows: Record<string, string>[]) => {
    setFile(f)
    setRawRows(rows)
    setMapping(guessItemFieldMapping(hdrs))
    setUploadError('')
  }

  return (
    <div className="min-w-0 max-w-full space-y-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {isAr ? 'استيراد الأصناف' : 'Import items'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {isAr ? 'رفع ملف Excel أو CSV لإضافة أصناف دفعة واحدة' : 'Upload Excel/CSV to bulk-import items'}
          </p>
        </div>
        <Link to="/items" className="text-sm text-primary-600 hover:underline">
          {isAr ? '← العودة للأصناف' : '← Back to items'}
        </Link>
      </div>

      <ImportProgressBar step={step} lang={lang} />

      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
        {uploadError ? (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{uploadError}</p>
        ) : null}

        {step === 1 ? (
          <StepUpload
            lang={lang}
            file={file}
            rowCount={rawRows.length}
            previewRows={rawRows.slice(0, 3)}
            onFileLoaded={handleFileLoaded}
            onError={setUploadError}
          />
        ) : null}

        {step === 2 ? (
          <StepMapFields lang={lang} mapping={mapping} onChange={setMapping} />
        ) : null}

        {step === 3 ? (
          <StepPreview
            lang={lang}
            rows={previewRows}
            settings={settings}
            onSettingsChange={setSettings}
          />
        ) : null}

        {step === 4 && result ? <StepResult lang={lang} result={result} /> : null}

        {step < 4 ? (
          <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
            <button
              type="button"
              disabled={step === 1}
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-4 py-2 text-sm disabled:opacity-40"
            >
              {isRtl ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              {isAr ? 'السابق' : 'Back'}
            </button>

            {step === 3 ? (
              <button
                type="button"
                disabled={!canNext() || importMut.isPending}
                onClick={() => importMut.mutate()}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                <FileInput className="h-4 w-4" />
                {importMut.isPending
                  ? (isAr ? 'جاري الاستيراد...' : 'Importing...')
                  : (isAr ? 'بدء الاستيراد' : 'Start import')}
              </button>
            ) : (
              <button
                type="button"
                disabled={!canNext()}
                onClick={() => setStep((s) => s + 1)}
                className="inline-flex items-center gap-1 rounded-lg bg-primary-600 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {isAr ? 'التالي' : 'Next'}
                {isRtl ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
