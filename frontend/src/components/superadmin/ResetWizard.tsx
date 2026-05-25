import { useEffect, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { buildResetConfirmationToken, superadminApi } from '../../api/superadmin'
import {
  RESET_MODULE_LABELS,
  type ResetModule,
  type Tenant,
} from '../../types/superadmin'
import SearchableSelect from '../ui/SearchableSelect'
import DangerConfirmDialog from './DangerConfirmDialog'
import { ChevronLeft, ChevronRight, HardDrive, Loader2 } from 'lucide-react'

const MODULE_KEYS = Object.keys(RESET_MODULE_LABELS) as Exclude<ResetModule, 'all'>[]

interface ResetWizardProps {
  open: boolean
  tenants: Tenant[]
  initialTenantId?: number | null
  isAr: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function ResetWizard({
  open,
  tenants,
  initialTenantId,
  isAr,
  onClose,
  onSuccess,
}: ResetWizardProps) {
  const [step, setStep] = useState(1)
  const [tenantId, setTenantId] = useState<number | null>(initialTenantId ?? null)
  const [modules, setModules] = useState<ResetModule[]>([])
  const [allChecked, setAllChecked] = useState(false)
  const [preview, setPreview] = useState<Record<string, number> | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)

  const tenant = tenants.find((t) => t.id === tenantId) ?? null

  useEffect(() => {
    if (open) {
      setStep(1)
      setTenantId(initialTenantId ?? null)
      setModules([])
      setAllChecked(false)
      setPreview(null)
      setShowConfirm(false)
    }
  }, [open, initialTenantId])

  const modulesForApi: ResetModule[] = allChecked
    ? ['all']
    : (modules.filter((m) => m !== 'all') as ResetModule[])

  const previewMutation = useMutation({
    mutationFn: () => superadminApi.previewReset(tenantId!, modulesForApi),
    onSuccess: (data) => {
      setPreview(data)
      setStep(2)
    },
  })

  const backupMutation = useMutation({
    mutationFn: () => superadminApi.backupTenant(tenantId!),
  })

  const executeMutation = useMutation({
    mutationFn: () =>
      superadminApi.executeReset(tenantId!, modulesForApi, buildResetConfirmationToken(tenantId!)),
    onSuccess: () => {
      setShowConfirm(false)
      onSuccess()
      onClose()
    },
  })

  const totalPreview = useMemo(
    () => (preview ? Object.values(preview).reduce((a, b) => a + b, 0) : 0),
    [preview],
  )

  const toggleModule = (key: Exclude<ResetModule, 'all'>) => {
    setAllChecked(false)
    setModules((prev) =>
      prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key],
    )
  }

  const toggleAll = (checked: boolean) => {
    setAllChecked(checked)
    if (checked) {
      setModules(['all', ...MODULE_KEYS])
    } else {
      setModules([])
    }
  }

  const canNextStep1 = tenantId && modulesForApi.length > 0

  if (!open) return null

  const tenantOptions = tenants.map((t) => ({ value: t.id, label: t.name }))

  return (
    <>
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
        <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-red-100 bg-red-50 px-5 py-4 dark:border-red-900 dark:bg-red-950/30">
            <h2 className="text-lg font-semibold text-red-900 dark:text-red-100">
              {isAr ? 'تصفير بيانات عميل' : 'Reset tenant data'}
            </h2>
            <p className="text-sm text-red-700 dark:text-red-300">
              {isAr ? `الخطوة ${step} من 3` : `Step ${step} of 3`}
            </p>
          </div>

          {step === 1 && (
            <div className="space-y-4 p-5">
              <SearchableSelect
                label={isAr ? 'العميل' : 'Tenant'}
                options={tenantOptions}
                value={tenantId}
                onChange={(v) => setTenantId(v === null ? null : Number(v))}
                placeholder={isAr ? 'اختر عميل...' : 'Select tenant...'}
              />

              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {isAr ? 'ماذا تريد حذفه؟' : 'What to delete?'}
              </p>

              <div className="space-y-2">
                {MODULE_KEYS.map((key) => {
                  const meta = RESET_MODULE_LABELS[key]
                  return (
                    <label
                      key={key}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                    >
                      <input
                        type="checkbox"
                        checked={allChecked || modules.includes(key)}
                        disabled={allChecked}
                        onChange={() => toggleModule(key)}
                      />
                      <span>
                        {meta.icon} {isAr ? meta.ar : meta.en}
                      </span>
                    </label>
                  )
                })}
                <hr className="border-slate-200 dark:border-slate-700" />
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-red-100 bg-red-50/50 px-3 py-2 dark:border-red-900 dark:bg-red-950/20">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={(e) => toggleAll(e.target.checked)}
                  />
                  <span>{isAr ? '💣 حذف كل شيء (إعادة للصفر)' : '💣 Delete everything'}</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border px-4 py-2 text-sm dark:border-slate-600"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="button"
                  disabled={!canNextStep1 || previewMutation.isPending}
                  onClick={() => previewMutation.mutate()}
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-4 py-2 text-sm text-white disabled:opacity-50"
                >
                  {previewMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isAr ? 'التالي' : 'Next'}
                  {isAr ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
              </div>
            </div>
          )}

          {step === 2 && tenant && preview && (
            <div className="space-y-4 p-5">
              <p className="text-sm text-slate-600">
                {isAr ? 'العميل:' : 'Tenant:'}{' '}
                <strong>{tenant.name}</strong>
              </p>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                {isAr ? 'سيتم حذف البيانات التالية نهائياً:' : 'The following will be permanently deleted:'}
              </p>
              <ul className="space-y-1 text-sm">
                {MODULE_KEYS.filter((k) => modulesForApi.includes(k) || allChecked).map((key) => {
                  const meta = RESET_MODULE_LABELS[key]
                  const count = preview[key] ?? 0
                  if (!allChecked && !modules.includes(key)) return null
                  return (
                    <li key={key} className="flex justify-between gap-4">
                      <span>
                        {meta.icon} {isAr ? meta.ar : meta.en}
                      </span>
                      <span className="font-mono">{count.toLocaleString(isAr ? 'ar-EG' : 'en-US')}</span>
                    </li>
                  )
                })}
              </ul>
              <p className="border-t pt-2 text-sm font-semibold">
                {isAr ? 'إجمالي السجلات' : 'Total records'}:{' '}
                {totalPreview.toLocaleString(isAr ? 'ar-EG' : 'en-US')}
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {isAr
                  ? 'هذه العملية لا يمكن التراجع عنها. يُنصح بأخذ نسخة احتياطية أولاً.'
                  : 'This cannot be undone. Take a backup first.'}
              </p>
              <button
                type="button"
                disabled={backupMutation.isPending}
                onClick={() => backupMutation.mutate()}
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30"
              >
                {backupMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <HardDrive className="h-4 w-4" />
                )}
                {isAr ? 'أخذ نسخة احتياطية أولاً' : 'Backup first'}
              </button>
              <div className="flex justify-between gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="inline-flex items-center gap-1 rounded-lg border px-4 py-2 text-sm dark:border-slate-600"
                >
                  {isAr ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                  {isAr ? 'السابق' : 'Back'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStep(3)
                    setShowConfirm(true)
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-4 py-2 text-sm text-white"
                >
                  {isAr ? 'التالي' : 'Next'}
                  {isAr ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <DangerConfirmDialog
        open={showConfirm && step === 3 && !!tenant}
        tenantName={tenant?.name ?? ''}
        totalRecords={totalPreview}
        isAr={isAr}
        loading={executeMutation.isPending}
        onCancel={() => {
          setShowConfirm(false)
          setStep(2)
        }}
        onConfirm={() => executeMutation.mutate()}
      />
    </>
  )
}
