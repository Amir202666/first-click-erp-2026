import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchFiscalYears, closeFiscalYear, setFiscalYearLock } from '../../api/tenant'
import { formatDisplayDate } from '../../utils/date'
import type { FiscalYear } from '../../types'
import { CalendarClock, Lock, LockOpen, ExternalLink } from 'lucide-react'
import Toast, { type ToastType } from '../../components/ui/Toast'

function inventorySnapshotLineCount(snapshot: unknown): number {
  if (Array.isArray(snapshot)) return snapshot.length
  if (snapshot && typeof snapshot === 'object' && 'data' in snapshot && Array.isArray((snapshot as { data: unknown }).data)) {
    return (snapshot as { data: unknown[] }).data.length
  }
  return 0
}

export default function FiscalYearList({
  embedded = false,
  onOpenWizard,
}: {
  embedded?: boolean
  onOpenWizard?: () => void
} = {}) {
  const { currentTenant, can } = useAuth()
  const { t, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()

  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [closeTarget, setCloseTarget] = useState<FiscalYear | null>(null)
  const [archiveInventory, setArchiveInventory] = useState(true)
  const [lockTarget, setLockTarget] = useState<{ row: FiscalYear; locked: boolean } | null>(null)

  const canClose = can('fiscal_years.close')
  const canLock = can('fiscal_years.lock')

  const { data: rows = [], isLoading, isError, error } = useQuery({
    queryKey: ['fiscalYears', tenantId],
    queryFn: () => fetchFiscalYears(tenantId),
    enabled: !!tenantId,
  })

  const closeMutation = useMutation({
    mutationFn: () => {
      if (!closeTarget) throw new Error('no target')
      return closeFiscalYear(tenantId, closeTarget.id, { archive_inventory: archiveInventory })
    },
    onSuccess: (res) => {
      setCloseTarget(null)
      queryClient.invalidateQueries({ queryKey: ['fiscalYears', tenantId] })
      const invN = inventorySnapshotLineCount(res.inventory_snapshot)
      const extra =
        archiveInventory && invN > 0
          ? ` — ${t.fiscalYear.snapshotSavedSummary.replace('{n}', String(invN))}`
          : ''
      setToast({ message: (res.message ?? '') + extra, type: 'success' })
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        t.fiscalYear.errorClose
      setToast({ message: String(msg), type: 'error' })
    },
  })

  const lockMutation = useMutation({
    mutationFn: () => {
      if (!lockTarget) throw new Error('no target')
      return setFiscalYearLock(tenantId, lockTarget.row.id, lockTarget.locked)
    },
    onSuccess: (res) => {
      setLockTarget(null)
      queryClient.invalidateQueries({ queryKey: ['fiscalYears', tenantId] })
      setToast({ message: res.message, type: 'success' })
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        t.fiscalYear.errorLock
      setToast({ message: String(msg), type: 'error' })
    },
  })

  if (!tenantId) {
    return <p className="p-6 text-slate-600">{t.loading}</p>
  }

  return (
    <div
      className={`px-0 py-4 space-y-4 w-full min-w-0 max-w-full ${isRtl ? 'text-right' : 'text-left'}`}
    >
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex flex-wrap items-start gap-3 justify-between">
        <div className="min-w-0 flex-1">
          {!embedded && (
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2 flex-wrap">
              <CalendarClock className="w-7 h-7 text-primary-600 shrink-0" />
              {t.fiscalYear.title}
            </h1>
          )}
          {embedded && (
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2 flex-wrap">
              <CalendarClock className="w-5 h-5 text-primary-600 shrink-0" />
              {t.fiscalYear.title}
            </h2>
          )}
          <p className={`${embedded ? 'mt-1' : 'mt-2'} text-sm text-slate-600 leading-relaxed`}>{t.fiscalYear.intro}</p>
          {canClose && (
            <p className="mt-3">
              {embedded && onOpenWizard ? (
                <button
                  type="button"
                  onClick={onOpenWizard}
                  className="text-sm font-medium text-primary-700 hover:text-primary-800 hover:underline inline-flex items-center gap-1"
                >
                  <ExternalLink className="w-4 h-4 shrink-0" />
                  {t.fiscalYear.wizardLink}
                </button>
              ) : (
                <Link
                  to="/settings/accounting?tab=fiscal_close&view=wizard"
                  className="text-sm font-medium text-primary-700 hover:text-primary-800 hover:underline inline-flex items-center gap-1"
                >
                  <ExternalLink className="w-4 h-4 shrink-0" />
                  {t.fiscalYear.wizardLink}
                </Link>
              )}
            </p>
          )}
        </div>
      </div>

      {isLoading && <p className="text-slate-500">{t.loading}</p>}
      {isError && (
        <p className="text-red-600 text-sm">
          {t.fiscalYear.errorLoad}
          {error instanceof Error ? `: ${error.message}` : ''}
        </p>
      )}

      {!isLoading && !isError && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm w-full min-w-0">
          <table className="w-full min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className={`px-3 py-2 font-semibold text-slate-700 ${isRtl ? 'text-right' : 'text-left'}`}>
                  {t.fiscalYear.year}
                </th>
                <th className={`px-3 py-2 font-semibold text-slate-700 ${isRtl ? 'text-right' : 'text-left'}`}>
                  {t.fiscalYear.period}
                </th>
                <th className={`px-3 py-2 font-semibold text-slate-700 ${isRtl ? 'text-right' : 'text-left'}`}>
                  {t.fiscalYear.closed}
                </th>
                <th className={`px-3 py-2 font-semibold text-slate-700 ${isRtl ? 'text-right' : 'text-left'}`}>
                  {t.fiscalYear.closingEntry}
                </th>
                <th className={`px-3 py-2 font-semibold text-slate-700 ${isRtl ? 'text-right' : 'text-left'}`}>
                  {t.fiscalYear.locked}
                </th>
                <th className={`px-3 py-2 font-semibold text-slate-700 ${isRtl ? 'text-right' : 'text-left'}`}>
                  {t.actions}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                    {t.noData}
                  </td>
                </tr>
              ) : (
                rows.map((fy) => {
                  const je = fy.closing_journal_entry
                  const invLines = inventorySnapshotLineCount(fy.inventory_snapshot)
                  return (
                    <tr key={fy.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                      <td className="px-3 py-2.5 font-medium tabular-nums">{fy.year}</td>
                      <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">
                        {formatDisplayDate(fy.start_date)} — {formatDisplayDate(fy.end_date)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${
                            fy.is_closed ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'
                          }`}
                        >
                          {fy.is_closed ? t.fiscalYear.closed : t.fiscalYear.open}
                        </span>
                        {fy.is_closed && fy.closed_at && (
                          <div className="text-xs text-slate-500 mt-1">
                            {t.fiscalYear.closedAt}: {formatDisplayDate(fy.closed_at)}
                          </div>
                        )}
                        {fy.inventory_carried_forward && invLines > 0 && (
                          <div className="text-xs text-slate-500 mt-1">
                            {t.fiscalYear.snapshotRows}: {invLines}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {je?.id ? (
                          <Link
                            to={`/journal-entries/edit/${je.id}`}
                            className="inline-flex items-center gap-1 text-primary-600 hover:underline"
                          >
                            {je.number}
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Link>
                        ) : fy.is_closed ? (
                          <span className="text-slate-400">{t.fiscalYear.noClosingEntry}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${
                            fy.is_locked ? 'bg-red-50 text-red-800' : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {fy.is_locked ? t.fiscalYear.locked : t.fiscalYear.unlocked}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className={`flex flex-wrap gap-2 ${isRtl ? 'justify-end' : 'justify-start'}`}>
                          {canClose && !fy.is_closed && (
                            <button
                              type="button"
                              onClick={() => {
                                setArchiveInventory(true)
                                setCloseTarget(fy)
                              }}
                              className="rounded-lg border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-800 hover:bg-primary-100"
                            >
                              {t.fiscalYear.closeYear}
                            </button>
                          )}
                          {canLock && (
                            <button
                              type="button"
                              onClick={() =>
                                setLockTarget({ row: fy, locked: !fy.is_locked })
                              }
                              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium ${
                                fy.is_locked
                                  ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                  : 'border-red-200 bg-red-50 text-red-800 hover:bg-red-100'
                              }`}
                            >
                              {fy.is_locked ? <LockOpen className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                              {fy.is_locked ? t.fiscalYear.unlockYear : t.fiscalYear.lockYear}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {closeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="max-w-md w-full rounded-xl bg-white p-5 shadow-xl space-y-4">
            <h2 className="text-lg font-semibold text-slate-800">{t.fiscalYear.closeYear}</h2>
            <p className="text-sm text-slate-600">{t.fiscalYear.confirmClose}</p>
            <p className="text-sm font-medium text-slate-800 tabular-nums">
              {closeTarget.year} ({formatDisplayDate(closeTarget.start_date)} —{' '}
              {formatDisplayDate(closeTarget.end_date)})
            </p>
            <label className="flex items-start gap-2 cursor-pointer text-sm text-slate-700">
              <input
                type="checkbox"
                className="mt-1 rounded border-slate-300"
                checked={archiveInventory}
                onChange={(e) => setArchiveInventory(e.target.checked)}
              />
              <span>{t.fiscalYear.archiveInventory}</span>
            </label>
            <div className={`flex gap-2 pt-2 ${isRtl ? 'flex-row-reverse' : ''}`}>
              <button
                type="button"
                className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => setCloseTarget(null)}
                disabled={closeMutation.isPending}
              >
                {t.cancel}
              </button>
              <button
                type="button"
                className="flex-1 rounded-lg bg-primary-600 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                onClick={() => closeMutation.mutate()}
                disabled={closeMutation.isPending}
              >
                {closeMutation.isPending ? t.saving : t.confirm}
              </button>
            </div>
          </div>
        </div>
      )}

      {lockTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="max-w-md w-full rounded-xl bg-white p-5 shadow-xl space-y-4">
            <h2 className="text-lg font-semibold text-slate-800">
              {lockTarget.locked ? t.fiscalYear.lockYear : t.fiscalYear.unlockYear}
            </h2>
            <p className="text-sm text-slate-600">
              {lockTarget.locked ? t.fiscalYear.confirmLock : t.fiscalYear.confirmUnlock}
            </p>
            <p className="text-sm font-medium text-slate-800 tabular-nums">
              {lockTarget.row.year} ({formatDisplayDate(lockTarget.row.start_date)} —{' '}
              {formatDisplayDate(lockTarget.row.end_date)})
            </p>
            <div className={`flex gap-2 pt-2 ${isRtl ? 'flex-row-reverse' : ''}`}>
              <button
                type="button"
                className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => setLockTarget(null)}
                disabled={lockMutation.isPending}
              >
                {t.cancel}
              </button>
              <button
                type="button"
                className="flex-1 rounded-lg bg-primary-600 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                onClick={() => lockMutation.mutate()}
                disabled={lockMutation.isPending}
              >
                {lockMutation.isPending ? t.saving : t.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
