import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import {
  fiscalYearApi,
  type ClosingPreviewResponse,
  type EquityAccountOption,
  type PreCloseChecksResponse,
} from '../api/fiscalYear'
import type { FiscalYear } from '../types'
import CloseChecklist from '../components/fiscal/CloseChecklist'
import ClosingEntryPreview from '../components/fiscal/ClosingEntryPreview'
import ConfirmCloseBox from '../components/fiscal/ConfirmCloseBox'
import RetainedEarningsAccountPicker from '../components/fiscal/RetainedEarningsAccountPicker'
import { formatDisplayDate } from '../utils/date'

const STEP_ICONS = ['📊', '⚖️', '📄', '📝', '🔒', '🆕']

export default function FiscalYearClose({
  embedded = false,
  onBackToList,
}: {
  embedded?: boolean
  onBackToList?: () => void
} = {}) {
  const { currentTenant, can } = useAuth()
  const { t, isRtl } = useLanguage()
  const navigate = useNavigate()
  const fc = t.fiscalYearClose
  const tenantId = currentTenant?.id ?? 0

  const [fiscalYear, setFiscalYear] = useState<FiscalYear | null>(null)
  const [checks, setChecks] = useState<PreCloseChecksResponse | null>(null)
  const [preview, setPreview] = useState<ClosingPreviewResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [checksLoading, setChecksLoading] = useState(false)
  const [listLoading, setListLoading] = useState(true)
  const [confirmation, setConfirmation] = useState('')
  const [confirmedChecks, setConfirmedChecks] = useState([false, false, false, false, false])
  const [equityAccounts, setEquityAccounts] = useState<EquityAccountOption[]>([])
  const [loadingEquityAccounts, setLoadingEquityAccounts] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState<EquityAccountOption | null>(null)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [archiveInventory, setArchiveInventory] = useState(true)

  const canClosePerm = can('fiscal_years.close')

  useEffect(() => {
    if (!tenantId || !canClosePerm) return
    let cancelled = false
    setListLoading(true)
    fiscalYearApi
      .list(tenantId)
      .then((data) => {
        if (cancelled) return
        const list = Array.isArray(data) ? data : []
        const open = list.find((y) => !y.is_closed) ?? null
        setFiscalYear(open)
      })
      .catch(() => {
        if (!cancelled) setError(fc.errorGeneric)
      })
      .finally(() => {
        if (!cancelled) setListLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tenantId, canClosePerm, fc.errorGeneric])

  useEffect(() => {
    if (!tenantId || !canClosePerm) return
    let cancelled = false
    setLoadingEquityAccounts(true)
    fiscalYearApi
      .equityAccounts(tenantId)
      .then((list) => {
        if (!cancelled) setEquityAccounts(list)
      })
      .catch(() => {
        if (!cancelled) setEquityAccounts([])
      })
      .finally(() => {
        if (!cancelled) setLoadingEquityAccounts(false)
      })
    return () => {
      cancelled = true
    }
  }, [tenantId, canClosePerm])

  useEffect(() => {
    if (!tenantId || !fiscalYear || !selectedAccount) {
      setPreview(null)
      return
    }
    let cancelled = false
    setError('')
    fiscalYearApi
      .previewClosingEntry(tenantId, fiscalYear.id, selectedAccount.id)
      .then((p) => {
        if (!cancelled) setPreview(p)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setPreview(null)
        const msg =
          (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fc.errorGeneric
        setError(String(msg))
      })
    return () => {
      cancelled = true
    }
  }, [tenantId, fiscalYear, selectedAccount, fc.errorGeneric])

  const runChecks = useCallback(async () => {
    if (!fiscalYear || !tenantId) return
    setChecksLoading(true)
    setError('')
    try {
      const c = await fiscalYearApi.preCloseChecks(tenantId, fiscalYear.id)
      setChecks(c)
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        fc.errorGeneric
      setError(String(msg))
      setChecks(null)
    } finally {
      setChecksLoading(false)
    }
  }, [fiscalYear, tenantId, fc.errorGeneric])

  const expectedConfirmation = fiscalYear ? `إقفال ${fiscalYear.year}` : ''

  const handleClose = async () => {
    if (!fiscalYear || !tenantId || !selectedAccount) return
    setLoading(true)
    setError('')
    try {
      await fiscalYearApi.closeWizard(tenantId, fiscalYear.id, {
        retained_earnings_account_id: selectedAccount.id,
        confirmation: confirmation.trim(),
        confirmed_checks: confirmedChecks,
        archive_inventory: archiveInventory,
      })
      setSuccess(true)
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        fc.errorGeneric
      setError(String(msg))
    } finally {
      setLoading(false)
    }
  }

  const canClose =
    checks?.can_close === true &&
    selectedAccount !== null &&
    confirmedChecks.every(Boolean) &&
    confirmation.trim() === expectedConfirmation

  const activeStep = useMemo(() => {
    if (!checks) return 1
    if (!checks.journal_entries.is_ok) return 1
    if (!checks.trial_balance.is_balanced) return 2
    if (!checks.invoices.is_ok || !checks.installments.is_ok) return 3
    if (!selectedAccount || !preview) return 4
    if (!confirmedChecks.every(Boolean)) return 4
    if (confirmation.trim() !== expectedConfirmation) return 5
    return 6
  }, [checks, preview, selectedAccount, confirmedChecks, confirmation, expectedConfirmation])

  const checklistLabels = useMemo(
    () => ({
      journalTitle: fc.journalTitle,
      invoicesTitle: fc.invoicesTitle,
      draftLabel: fc.draftLabel,
      trialLabel: fc.trialLabel,
      pendingInvLabel: fc.pendingInvLabel,
      overdueLabel: fc.overdueLabel,
      okClean: fc.okClean,
      needsReview: fc.needsReview,
      noDrafts: fc.noDrafts,
      draftsCount: fc.draftsCount,
      balanced: fc.balanced,
      diffPrefix: fc.diffPrefix,
      noneOk: fc.noneOk,
      countWarning: fc.countWarning,
    }),
    [fc],
  )

  const previewLabels = useMemo(
    () => ({
      title: fc.previewTitle,
      subtitle:
        selectedAccount && preview
          ? fc.previewSubtitleToAccount.replace('{name}', selectedAccount.name)
          : fc.previewSubtitle,
      account: fc.colAccount,
      memo: fc.colMemo,
      debit: fc.colDebit,
      credit: fc.colCredit,
      total: fc.colTotal,
      dash: fc.dash,
      totalsHint: fc.previewTotals,
      transferLineBadge: fc.transferLineBadge,
    }),
    [fc, selectedAccount, preview],
  )

  const retainedPickerLabels = useMemo(
    () => ({
      sectionTitle: fc.retainedPickerSectionTitle,
      requiredBadge: fc.retainedPickerRequired,
      help: fc.retainedPickerHelp,
      searchLabel: fc.retainedPickerSearchLabel,
      placeholder: fc.retainedPickerPlaceholder,
      loading: fc.retainedPickerLoading,
      noResults: fc.retainedPickerNoResults,
      change: fc.retainedPickerChange,
      colRevenue: fc.retainedPickerColRevenue,
      colCosts: fc.retainedPickerColCosts,
      colNet: fc.retainedPickerColNet,
      selectedCreditHint: fc.retainedPickerCreditHint,
      selectedDebitHint: fc.retainedPickerDebitHint,
    }),
    [fc],
  )

  const confirmLabels = useMemo(
    () => ({
      title: fc.confirmTitle,
      checks: fc.confirmChecks,
      hint: fc.confirmHint,
      placeholder: fc.confirmPlaceholder,
    }),
    [fc],
  )

  const steps = useMemo(
    () => [
      { id: 1, label: fc.stepReviewJe },
      { id: 2, label: fc.stepTrial },
      { id: 3, label: fc.stepInvoices },
      { id: 4, label: fc.stepEntry },
      { id: 5, label: fc.stepConfirm },
      { id: 6, label: fc.stepNewYear },
    ],
    [fc],
  )

  if (!tenantId) {
    return <p className="p-6 text-slate-600">{t.loading}</p>
  }

  if (!canClosePerm) {
    return (
      <div
        className={`px-0 py-4 w-full min-w-0 max-w-full text-slate-700 ${isRtl ? 'text-right' : 'text-left'}`}
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        <p className="text-sm">{fc.noClosePermission}</p>
        <Link
          to="/settings/accounting?tab=fiscal_close&view=list"
          className="text-primary-600 text-sm mt-2 inline-block"
          onClick={embedded && onBackToList ? (e) => { e.preventDefault(); onBackToList() } : undefined}
        >
          ← {t.fiscalYear.title}
        </Link>
      </div>
    )
  }

  if (success) {
    return (
      <div
        className={`w-full min-w-0 max-w-full flex justify-center px-4 py-8 ${isRtl ? 'text-right' : 'text-left'}`}
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        <div className="w-full max-w-lg text-center p-8 bg-white rounded-2xl shadow-lg border border-slate-100">
          <div className="text-5xl mb-4" aria-hidden>
            ✓
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">{fc.successTitle}</h2>
          <p className="text-slate-600 text-sm mb-6">{fc.successBody}</p>
          <div className="flex flex-wrap gap-3 justify-center">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="px-5 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700"
            >
              {fc.goDashboard}
            </button>
            <Link
              to="/settings/accounting?tab=fiscal_close&view=list"
              className="px-5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center"
              onClick={embedded && onBackToList ? (e) => { e.preventDefault(); onBackToList() } : undefined}
            >
              {fc.goList}
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`px-0 py-4 space-y-4 w-full min-w-0 max-w-full ${isRtl ? 'text-right' : 'text-left'}`}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <h1 className="text-xl font-bold text-slate-900">{fc.pageTitle}</h1>
          {fiscalYear && (
            <span className="text-sm px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-semibold tabular-nums whitespace-normal">
              {fiscalYear.year} — {formatDisplayDate(fiscalYear.start_date)} → {formatDisplayDate(fiscalYear.end_date)}
            </span>
          )}
        </div>
        <div className="text-xs text-slate-500">
          {fc.today}: {new Date().toLocaleDateString(isRtl ? 'ar-KW' : 'en-GB')}
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        {embedded && onBackToList ? (
          <button type="button" onClick={onBackToList} className="text-sm text-primary-600 hover:underline">
            ← {t.fiscalYear.title}
          </button>
        ) : (
          <Link to="/settings/accounting?tab=fiscal_close&view=list" className="text-sm text-primary-600 hover:underline">
            ← {t.fiscalYear.title}
          </Link>
        )}
      </div>

      {listLoading && <p className="text-slate-500 text-sm">{t.loading}</p>}

      {!listLoading && !fiscalYear && (
        <p className="text-amber-800 text-sm bg-amber-50 border border-amber-200 rounded-xl p-4">{fc.noOpenYear}</p>
      )}

      {!listLoading && fiscalYear && (
        <>
          <div className="flex gap-3 p-4 bg-amber-50 border-2 border-amber-200 rounded-2xl mb-6">
            <span className="text-2xl shrink-0" aria-hidden>
              ⚠️
            </span>
            <div>
              <p className="font-bold text-amber-900 mb-1">{fc.warningTitle}</p>
              <p className="text-sm text-amber-900/90 leading-relaxed">{fc.warningBody}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 mb-5">
            <p className="text-sm font-bold text-slate-700 mb-4">{fc.stepsTitle}</p>
            <div className="flex items-start gap-0 overflow-x-auto pb-1">
              {steps.map((step, idx) => {
                const isDone = step.id < activeStep && checks !== null
                const isActive = step.id === activeStep
                const isWarning =
                  step.id === 3 &&
                  checks &&
                  (!checks.invoices.is_ok || !checks.installments.is_ok)
                return (
                  <React.Fragment key={step.id}>
                    {idx > 0 && (
                      <div
                        className={`flex-1 min-w-[12px] h-0.5 mt-4 ${isDone ? 'bg-emerald-500' : 'bg-slate-200'}`}
                      />
                    )}
                    <div className="flex flex-col items-center shrink-0 max-w-[72px]">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all
                          ${
                            isDone
                              ? 'bg-emerald-500 border-emerald-500 text-white'
                              : isWarning
                                ? 'bg-amber-100 border-amber-400 text-amber-800'
                                : isActive
                                  ? 'bg-primary-600 border-primary-600 text-white ring-4 ring-primary-100'
                                  : 'bg-slate-50 border-slate-200 text-slate-400'
                          }`}
                      >
                        {isDone ? '✓' : STEP_ICONS[idx] ?? step.id}
                      </div>
                      <p
                        className={`text-[10px] font-semibold mt-1.5 text-center leading-tight px-0.5
                          ${isDone ? 'text-emerald-600' : isActive ? 'text-primary-600' : 'text-slate-400'}`}
                      >
                        {step.label}
                      </p>
                    </div>
                  </React.Fragment>
                )
              })}
            </div>
          </div>

          {checks && <CloseChecklist checks={checks} labels={checklistLabels} />}

          {checks && (
            <RetainedEarningsAccountPicker
              accounts={equityAccounts}
              loadingAccounts={loadingEquityAccounts}
              selected={selectedAccount}
              onSelect={setSelectedAccount}
              preview={preview}
              labels={retainedPickerLabels}
              isRtl={isRtl}
            />
          )}

          {preview && <ClosingEntryPreview preview={preview} labels={previewLabels} />}

          {checks && fiscalYear && (
            <ConfirmCloseBox
              fiscalYear={fiscalYear}
              confirmation={confirmation}
              onConfirmationChange={setConfirmation}
              confirmedChecks={confirmedChecks}
              onToggleCheck={(i, checked) => {
                const next = [...confirmedChecks]
                next[i] = checked
                setConfirmedChecks(next)
              }}
              labels={confirmLabels}
            />
          )}

          {checks && (
            <label className="flex items-start gap-2 mb-4 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 rounded border-slate-300 text-primary-600"
                checked={archiveInventory}
                onChange={(e) => setArchiveInventory(e.target.checked)}
              />
              <span>{fc.archiveInventory}</span>
            </label>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800">{error}</div>
          )}

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="text-xs text-slate-500">{fc.footerAudit}</p>
              {checks && !selectedAccount && (
                <p className="text-xs text-amber-700 flex items-center gap-1">{fc.selectRetainedFirst}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-700 hover:bg-slate-50"
              >
                {fc.cancel}
              </button>
              <button
                type="button"
                onClick={() => void runChecks()}
                disabled={checksLoading || !fiscalYear}
                className="px-4 py-2 bg-primary-50 text-primary-800 border border-primary-200 rounded-xl text-sm font-semibold hover:bg-primary-100 disabled:opacity-50"
              >
                {checksLoading ? fc.checksRunning : fc.runChecks}
              </button>
              <button
                type="button"
                onClick={() => void handleClose()}
                disabled={!canClose || loading || !fiscalYear}
                className="px-5 py-2 bg-primary-600 text-white rounded-xl text-sm font-bold shadow-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary-700"
              >
                {loading ? fc.closing : fc.closeButton}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
