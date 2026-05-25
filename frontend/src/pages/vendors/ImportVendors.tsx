import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, FileInput } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchAccountDefaults, fetchVendors } from '../../api/tenant'
import { importVendorsBatch } from '../../api/importVendors'
import ImportProgressBar from '../../components/vendors/import/ImportProgressBar'
import StepUpload from '../../components/vendors/import/StepUpload'
import StepMapFields, { isNameFieldMapped } from '../../components/vendors/import/StepMapFields'
import StepSelectAccount from '../../components/vendors/import/StepSelectAccount'
import StepPreview, { countValidPreviewRows } from '../../components/vendors/import/StepPreview'
import StepResult from '../../components/vendors/import/StepResult'
import type {
  VendorImportRowParsed,
  VendorFieldMapping,
  VendorImportResult,
  VendorImportSettings,
} from '../../types/vendorImport'
import { guessVendorFieldMapping, applyVendorMappingToRows } from '../../utils/validateVendorRow'

export default function ImportVendors() {
  const { currentTenant } = useAuth()
  const { lang, isRtl } = useLanguage()
  const isAr = lang === 'ar'
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()

  const [step, setStep] = useState(1)
  const [file, setFile] = useState<File | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([])
  const [mapping, setMapping] = useState<VendorFieldMapping[]>([])
  const [settings, setSettings] = useState<VendorImportSettings>({
    parentAccountId: 0,
    parentAccountName: '',
    skipDuplicates: true,
    updateExisting: false,
  })
  const [uploadError, setUploadError] = useState('')
  const [result, setResult] = useState<VendorImportResult | null>(null)

  const { data: existingVendors } = useQuery({
    queryKey: ['vendors', tenantId, 'import-names'],
    queryFn: () => fetchVendors(tenantId, { per_page: '2000' }),
    enabled: tenantId > 0,
  })

  useQuery({
    queryKey: ['account-defaults', tenantId],
    queryFn: async () => {
      const defaults = await fetchAccountDefaults(tenantId)
      if (defaults.vendors_account_id && !settings.parentAccountId) {
        setSettings((s) => ({
          ...s,
          parentAccountId: defaults.vendors_account_id!,
        }))
      }
      return defaults
    },
    enabled: tenantId > 0,
  })

  const existingNames = useMemo(() => {
    const set = new Set<string>()
    existingVendors?.data?.forEach((v) => {
      if (v.name) set.add(v.name.trim().toLowerCase())
    })
    return set
  }, [existingVendors])

  const previewRows: VendorImportRowParsed[] = useMemo(() => {
    const parsed = applyVendorMappingToRows(rawRows, mapping)
    const seenInFile = new Map<string, number>()

    return parsed.map(({ data, errors, rowIndex }) => {
      const nameKey = data.name?.trim().toLowerCase() ?? ''
      let status: VendorImportRowParsed['_status'] = 'valid'
      const rowErrors = [...errors]

      if (rowErrors.length > 0) {
        status = 'error'
      } else if (nameKey && existingNames.has(nameKey)) {
        status = settings.updateExisting ? 'valid' : 'duplicate'
      } else if (nameKey) {
        const firstLine = seenInFile.get(nameKey)
        if (firstLine != null) {
          status = 'duplicate'
          rowErrors.push(isAr ? `مكرر في الملف (الصف ${firstLine})` : `Duplicate in file (row ${firstLine})`)
        } else {
          seenInFile.set(nameKey, rowIndex)
        }
      }

      return {
        ...data,
        _rowIndex: rowIndex,
        _errors: rowErrors,
        _status: status,
      }
    })
  }, [rawRows, mapping, existingNames, settings.updateExisting, isAr])

  const importMut = useMutation({
    mutationFn: () => {
      const vendors = previewRows
        .filter((r) => r._status === 'valid')
        .map(({ _rowIndex, _errors, _status, ...row }) => row)

      return importVendorsBatch(tenantId, {
        vendors,
        parent_account_id: settings.parentAccountId,
        skip_duplicates: settings.skipDuplicates,
        update_existing: settings.updateExisting,
      })
    },
    onSuccess: (data) => {
      setResult(data)
      setStep(5)
      queryClient.invalidateQueries({ queryKey: ['vendors', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['accounts', tenantId] })
    },
  })

  const canNext = () => {
    if (step === 1) return file && rawRows.length > 0
    if (step === 2) return isNameFieldMapped(mapping)
    if (step === 3) return settings.parentAccountId > 0
    if (step === 4) return countValidPreviewRows(previewRows) > 0
    return false
  }

  const handleFileLoaded = (f: File, hdrs: string[], rows: Record<string, string>[]) => {
    setFile(f)
    setHeaders(hdrs)
    setRawRows(rows)
    setMapping(guessVendorFieldMapping(hdrs))
    setUploadError('')
  }

  return (
    <div className="min-w-0 max-w-full space-y-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {isAr ? 'استيراد الموردين' : 'Import vendors'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {isAr ? 'رفع ملف Excel أو CSV وإنشاء حسابات فرعية تلقائياً' : 'Upload Excel/CSV and auto-create sub-accounts'}
          </p>
        </div>
        <Link to="/vendors" className="text-sm text-primary-600 hover:underline">
          {isAr ? '← العودة للموردين' : '← Back to vendors'}
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
          <StepMapFields
            lang={lang}
            mapping={mapping}
            onChange={setMapping}
          />
        ) : null}

        {step === 3 ? (
          <StepSelectAccount
            lang={lang}
            tenantId={tenantId}
            settings={settings}
            onChange={setSettings}
          />
        ) : null}

        {step === 4 ? <StepPreview lang={lang} rows={previewRows} /> : null}

        {step === 5 && result ? <StepResult lang={lang} result={result} /> : null}

        {step < 5 ? (
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

            {step === 4 ? (
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
