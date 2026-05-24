import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Upload, X, FileSpreadsheet, ChevronRight, ChevronLeft, CheckCircle2, AlertCircle, Download } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'
import { getModalContainer } from '../../utils/modalContainer'
import { importChartOfAccountsWizard } from '../../api/tenant'
import {
  CHART_IMPORT_FIELD_LIST,
  type ChartImportFieldKey,
  type ChartImportPreviewRow,
  buildChartImportPreview,
  guessChartImportMapping,
  parseChartImportFile,
  previewToCommitRows,
  chartImportTemplateDownloadUrl,
} from './chartImportWizardUtils'

type Step = 1 | 2 | 3 | 4

type Props = {
  open: boolean
  onClose: () => void
  tenantId: number
  existingCodes: Set<string>
  onImported: () => void
}

type WizardResult = {
  inserted: number
  failed: { line: number; code: string; reason: string }[]
}

export default function ChartOfAccountsImportWizard({ open, onClose, tenantId, existingCodes, onImported }: Props) {
  const { t, isRtl } = useLanguage()
  const w = t.accounts as typeof t.accounts & Record<string, string>
  const [step, setStep] = useState<Step>(1)
  const [fileKind, setFileKind] = useState<'csv' | 'excel'>('excel')
  const [matrix, setMatrix] = useState<string[][] | null>(null)
  const [fileLabel, setFileLabel] = useState('')
  const [mapping, setMapping] = useState<Record<ChartImportFieldKey, string>>(() => {
    const m = {} as Record<ChartImportFieldKey, string>
    CHART_IMPORT_FIELD_LIST.forEach((f) => {
      m[f.key] = ''
    })
    return m
  })
  const [dragOver, setDragOver] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<WizardResult | null>(null)
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const reset = useCallback(() => {
    setStep(1)
    setFileKind('excel')
    setMatrix(null)
    setFileLabel('')
    const m = {} as Record<ChartImportFieldKey, string>
    CHART_IMPORT_FIELD_LIST.forEach((f) => {
      m[f.key] = ''
    })
    setMapping(m)
    setCommitting(false)
    setProgress(0)
    setResult(null)
    setDragOver(false)
  }, [])

  useEffect(() => {
    if (!open) reset()
  }, [open, reset])

  const headerRow = matrix?.[0] ?? []
  const dataRows = matrix && matrix.length > 1 ? matrix.slice(1) : []

  const columnOptions = useMemo(() => {
    const opts = headerRow.map((h) => String(h ?? '').trim()).filter(Boolean)
    return opts
  }, [headerRow])

  const previewMessages = useMemo(
    () => ({
      empty: w.importWizardReasonEmpty ?? '',
      duplicateDb: w.importWizardReasonDupDb ?? '',
      duplicateFile: (line: number) =>
        (w.importWizardReasonDupFile ?? '').replace('{line}', String(line)),
      selfParent: w.importWizardReasonSelfParent ?? '',
      parentMissing: (code: string) =>
        (w.importWizardReasonParentMissing ?? '').replace('{code}', code),
      cycle: w.importWizardReasonCycle ?? '',
    }),
    [w],
  )

  const previewRows = useMemo(() => {
    if (!matrix || matrix.length < 2) return []
    return buildChartImportPreview(dataRows, headerRow, mapping, existingCodes, previewMessages)
  }, [matrix, dataRows, headerRow, mapping, existingCodes, previewMessages])

  const validCount = previewRows.filter((r) => r.status === 'ok').length
  const invalidCount = previewRows.length - validCount

  const loadFile = async (file: File) => {
    setFileLabel(file.name)
    const rows = await parseChartImportFile(file)
    if (rows.length < 2) {
      setMatrix(null)
      return
    }
    setMatrix(rows)
    const headers = rows[0].map((c) => String(c ?? '').trim())
    setMapping(guessChartImportMapping(headers))
    setStep(2)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) void loadFile(f)
  }

  const clearProgressTimer = () => {
    if (progressTimer.current) {
      clearInterval(progressTimer.current)
      progressTimer.current = null
    }
  }

  const runCommit = async () => {
    const payload = previewToCommitRows(previewRows)
    if (payload.length === 0) return
    setCommitting(true)
    setProgress(4)
    clearProgressTimer()
    progressTimer.current = setInterval(() => {
      setProgress((p) => (p >= 88 ? 88 : p + 6))
    }, 160)
    try {
      const res = await importChartOfAccountsWizard(tenantId, payload)
      setProgress(100)
      setResult({
        inserted: res.inserted ?? res.success_count ?? 0,
        failed: res.failed ?? res.failures ?? [],
      })
      onImported()
      setStep(4)
    } catch {
      setResult({
        inserted: 0,
        failed: [{ line: 0, code: '', reason: t.msg?.addError ?? 'Error' }],
      })
      setStep(4)
    } finally {
      clearProgressTimer()
      setCommitting(false)
    }
  }

  if (!open) return null

  const fieldLabel = (key: ChartImportFieldKey): string => {
    const map: Record<ChartImportFieldKey, string> = {
      code: t.accounts.accountCode,
      name: t.accounts.accountName,
      name_en: t.nameEn,
      type: t.accounts.accountType,
      parent_code: w.importWizardParentCode ?? t.accounts.parentAccount,
      level: t.accounts.level,
      is_postable: t.accounts.isPostable,
      description: t.description,
      normal_balance: t.accounts.normalBalance,
    }
    return map[key]
  }

  const overlay = (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-3 sm:p-6 pointer-events-auto"
      role="presentation"
      onClick={() => !committing && onClose()}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="coa-import-title"
      >
        <div className={`flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 ${isRtl ? 'flex-row-reverse' : ''}`}>
          <div>
            <h2 id="coa-import-title" className="text-lg font-semibold text-slate-900">
              {w.importWizardTitle ?? t.accounts.importChart}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {w.importWizardSubtitle ?? ''}
            </p>
          </div>
          <button
            type="button"
            disabled={committing}
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-40"
            aria-label={t.close}
          >
            <X size={22} />
          </button>
        </div>

        <div className={`px-5 py-3 bg-slate-50 border-b border-slate-100 flex gap-2 ${isRtl ? 'flex-row-reverse' : ''}`}>
          {([1, 2, 3, 4] as const).map((s) => (
            <div
              key={s}
              className={`flex-1 h-1.5 rounded-full transition-colors ${step >= s ? 'bg-primary-600' : 'bg-slate-200'}`}
            />
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5">
          {step === 1 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-sm font-medium text-slate-800 mb-1">
                  {w.importWizardTemplateSection ?? ''}
                </p>
                <p className="text-xs text-slate-600 mb-3 leading-relaxed">
                  {w.importWizardTemplateHint ?? ''}
                </p>
                <div className={`flex flex-wrap gap-2 ${isRtl ? 'flex-row-reverse' : ''}`}>
                  <a
                    href={chartImportTemplateDownloadUrl('xlsx')}
                    download="chart-of-accounts-template.xlsx"
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-800 hover:bg-slate-50 no-underline"
                  >
                    <Download size={16} className="text-slate-600 shrink-0" aria-hidden />
                    {w.importWizardDownloadTemplateXlsx ?? 'Excel'}
                  </a>
                  <a
                    href={chartImportTemplateDownloadUrl('csv')}
                    download="chart-of-accounts-template.csv"
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-800 hover:bg-slate-50 no-underline"
                  >
                    <Download size={16} className="text-slate-600 shrink-0" aria-hidden />
                    {w.importWizardDownloadTemplateCsv ?? 'CSV'}
                  </a>
                </div>
              </div>
              <div className={`flex gap-4 ${isRtl ? 'flex-row-reverse' : ''}`}>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="radio" checked={fileKind === 'excel'} onChange={() => setFileKind('excel')} />
                  {w.importWizardKindExcel ?? 'Excel'}
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="radio" checked={fileKind === 'csv'} onChange={() => setFileKind('csv')} />
                  {w.importWizardKindCsv ?? 'CSV'}
                </label>
              </div>
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
                  dragOver ? 'border-primary-500 bg-primary-50/50' : 'border-slate-200 bg-slate-50/80'
                }`}
              >
                <Upload className="mx-auto text-slate-400 mb-3" size={40} />
                <p className="text-slate-700 font-medium mb-1">{w.importWizardDropHint ?? ''}</p>
                <p className="text-xs text-slate-500 mb-4">{w.importWizardFileTypesHint ?? ''}</p>
                <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 text-white text-sm cursor-pointer hover:bg-primary-500">
                  <FileSpreadsheet size={18} />
                  {w.importWizardChooseFile ?? t.choose}
                  <input
                    type="file"
                    className="hidden"
                    accept={fileKind === 'csv' ? '.csv,.txt' : '.xlsx,.xls'}
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      e.target.value = ''
                      if (f) void loadFile(f)
                    }}
                  />
                </label>
                {fileLabel ? <p className="text-xs text-slate-600 mt-3">{fileLabel}</p> : null}
              </div>
            </div>
          )}

          {step === 2 && matrix && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">{w.importWizardMapIntro ?? ''}</p>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-700">
                    <tr>
                      <th className={`px-3 py-2 font-medium ${isRtl ? 'text-right' : 'text-left'}`}>
                        {w.importWizardSystemField ?? ''}
                      </th>
                      <th className={`px-3 py-2 font-medium ${isRtl ? 'text-right' : 'text-left'}`}>
                        {w.importWizardFileColumn ?? ''}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {CHART_IMPORT_FIELD_LIST.map(({ key, required }) => (
                      <tr key={key} className="border-t border-slate-100">
                        <td className={`px-3 py-2 text-slate-800 ${isRtl ? 'text-right' : 'text-left'}`}>
                          {fieldLabel(key)}
                          {required ? <span className="text-red-500"> *</span> : null}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            className="input-app w-full max-w-xs h-9 text-sm"
                            value={mapping[key]}
                            onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value }))}
                          >
                            <option value="">{w.importWizardSkipColumn ?? '—'}</option>
                            {columnOptions.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {step === 3 && matrix && (
            <div className="space-y-3">
              <div className={`flex flex-wrap gap-3 text-sm ${isRtl ? 'flex-row-reverse' : ''}`}>
                <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 text-emerald-800 px-2.5 py-1 border border-emerald-100">
                  <CheckCircle2 size={16} />
                  {w.importWizardValidCount ?? ''}: {validCount}
                </span>
                <span className="inline-flex items-center gap-1 rounded-lg bg-rose-50 text-rose-800 px-2.5 py-1 border border-rose-100">
                  <AlertCircle size={16} />
                  {w.importWizardInvalidCount ?? ''}: {invalidCount}
                </span>
              </div>
              <p className="text-xs text-slate-500">{w.importWizardOnlyValidHint ?? ''}</p>
              <div className="rounded-xl border border-slate-200 overflow-auto max-h-[48vh]">
                <table className="w-full text-xs min-w-[640px]">
                  <thead className="bg-slate-50 sticky top-0 z-[1]">
                    <tr className="text-slate-700">
                      <th className="px-2 py-2 font-medium whitespace-nowrap">{w.importWizardLine ?? '#'}</th>
                      <th className="px-2 py-2 font-medium whitespace-nowrap">{t.accounts.accountCode}</th>
                      <th className="px-2 py-2 font-medium whitespace-nowrap">{t.accounts.accountName}</th>
                      <th className="px-2 py-2 font-medium whitespace-nowrap">{w.importWizardParentCode ?? ''}</th>
                      <th className="px-2 py-2 font-medium whitespace-nowrap">{t.accounts.accountType}</th>
                      <th className="px-2 py-2 font-medium whitespace-nowrap">{t.status}</th>
                      <th className={`px-2 py-2 font-medium whitespace-nowrap ${isRtl ? 'text-right' : 'text-left'}`}>
                        {w.importWizardReason ?? ''}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r: ChartImportPreviewRow) => (
                      <tr key={r.line} className="border-t border-slate-100 hover:bg-slate-50/80">
                        <td className="px-2 py-1.5 text-slate-600">{r.line}</td>
                        <td className="px-2 py-1.5 font-mono text-slate-800">{r.code}</td>
                        <td className="px-2 py-1.5 text-slate-800">{r.name}</td>
                        <td className="px-2 py-1.5 font-mono text-slate-600">{r.parent_code}</td>
                        <td className="px-2 py-1.5">{r.type}</td>
                        <td className="px-2 py-1.5">
                          {r.status === 'ok' ? (
                            <span className="text-emerald-700">{w.importWizardStatusOk ?? ''}</span>
                          ) : (
                            <span className="text-rose-700">{w.importWizardStatusErr ?? ''}</span>
                          )}
                        </td>
                        <td className={`px-2 py-1.5 text-rose-700 max-w-[220px] ${isRtl ? 'text-right' : 'text-left'}`}>
                          {r.reason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {committing && (
                <div className="space-y-2 pt-2">
                  <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className="h-full bg-primary-600 transition-all duration-200"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-600 text-center">{w.importWizardProgress ?? ''}</p>
                </div>
              )}
            </div>
          )}

          {step === 4 && result && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
                <p className="text-lg font-semibold text-slate-900">
                  {(w.importWizardInserted ?? '').replace('{count}', String(result.inserted))}
                </p>
                <p className="text-sm text-slate-600 mt-1">
                  {(w.importWizardServerFailed ?? '').replace('{count}', String(result.failed.length))}
                </p>
              </div>
              {result.failed.length > 0 && (
                <div className="rounded-xl border border-rose-100 overflow-hidden max-h-56 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-rose-50">
                      <tr>
                        <th className="px-2 py-2 text-start">{w.importWizardLine ?? '#'}</th>
                        <th className="px-2 py-2 text-start">{t.code}</th>
                        <th className="px-2 py-2 text-start">{w.importWizardReason ?? ''}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.failed.map((f, i) => (
                        <tr key={i} className="border-t border-rose-100">
                          <td className="px-2 py-1.5">{f.line}</td>
                          <td className="px-2 py-1.5 font-mono">{f.code}</td>
                          <td className="px-2 py-1.5 text-rose-800">{f.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <div className={`px-5 py-4 border-t border-slate-100 flex flex-wrap gap-2 ${isRtl ? 'flex-row-reverse justify-between' : 'justify-between'}`}>
          <div>
            {step > 1 && step < 4 && (
              <button
                type="button"
                disabled={committing}
                onClick={() => setStep((s) => (s > 1 ? ((s - 1) as Step) : s))}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {isRtl ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                {w.importWizardBack ?? t.back}
              </button>
            )}
          </div>
          <div className={`flex gap-2 ${isRtl ? 'flex-row-reverse' : ''}`}>
            {step === 2 && (
              <button
                type="button"
                disabled={!mapping.code || !mapping.name}
                onClick={() => setStep(3)}
                className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm hover:bg-primary-500 disabled:opacity-50"
              >
                {w.importWizardNext ?? 'Next'}
              </button>
            )}
            {step === 3 && (
              <button
                type="button"
                disabled={committing || validCount === 0}
                onClick={() => void runCommit()}
                className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm hover:bg-primary-500 disabled:opacity-50"
              >
                {w.importWizardStartImport ?? t.confirm}
              </button>
            )}
            {step === 4 && (
              <button
                type="button"
                onClick={() => {
                  reset()
                  onClose()
                }}
                className="px-4 py-2 rounded-lg bg-slate-800 text-white text-sm hover:bg-slate-700"
              >
                {t.close}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(overlay, getModalContainer())
}
