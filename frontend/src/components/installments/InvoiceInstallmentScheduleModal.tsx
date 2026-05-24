import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchAccounts, fetchInstallmentPeriods, fetchSettings, fetchAccountDefaults } from '../../api/tenant'
import type { CreateInstallmentFromInvoicePayload } from '../../api/tenant'
import { useLanguage } from '../../contexts/LanguageContext'
import type { InstallmentPeriod, TenantAccountDefault, TenantSettings } from '../../types'
import AccountSearchSelect from '../AccountSearchSelect'
import { parseMaxInstallmentsCount, parseMinInstallmentAmount } from '../../utils/installmentBusinessRules'
import { buildEffectiveInstallmentPeriods } from '../../utils/installmentPeriods'

type Props = {
  open: boolean
  onClose: () => void
  tenantId: number
  invoiceType: 'sales' | 'purchase'
  defaultBranchId?: number | null
  balanceAmount: number
  initialDraft?: CreateInstallmentFromInvoicePayload | null
  onDraftCommit: (draft: CreateInstallmentFromInvoicePayload) => void | Promise<void>
}

export default function InvoiceInstallmentScheduleModal({
  open,
  onClose,
  tenantId,
  invoiceType,
  defaultBranchId,
  balanceAmount,
  initialDraft,
  onDraftCommit,
}: Props) {
  const { t, lang } = useLanguage()
  const ti = ((t as any).installments ?? {}) as Record<string, string | undefined>
  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts', tenantId, 'postable'],
    queryFn: () => fetchAccounts(tenantId, { active_only: '1' }),
    enabled: open && tenantId > 0 && invoiceType === 'purchase',
  })
  const { data: accountDefaults } = useQuery<TenantAccountDefault>({
    queryKey: ['account-defaults', tenantId],
    queryFn: () => fetchAccountDefaults(tenantId),
    enabled: open && tenantId > 0 && invoiceType === 'purchase',
  })
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [numInstallments, setNumInstallments] = useState('6')
  const [periodMonths, setPeriodMonths] = useState('1')
  const [accountId, setAccountId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [committing, setCommitting] = useState(false)
  const [countClampHint, setCountClampHint] = useState<string | null>(null)

  const { data: settings } = useQuery<TenantSettings>({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: open && tenantId > 0,
    staleTime: 60_000,
  })

  const { data: apiPeriods = [] } = useQuery<InstallmentPeriod[]>({
    queryKey: ['installment-periods', tenantId, 'merged-v2'],
    queryFn: () => fetchInstallmentPeriods(tenantId),
    enabled: open && tenantId > 0,
    staleTime: 60_000,
  })

  const maxInstallmentsAllowed = useMemo(() => parseMaxInstallmentsCount(settings), [settings])
  const minInstallmentAmountRule = useMemo(() => parseMinInstallmentAmount(settings), [settings])

  const effectivePeriods = useMemo(
    () => buildEffectiveInstallmentPeriods(apiPeriods, settings as TenantSettings | undefined),
    [apiPeriods, settings],
  )

  const periodMonthsNum = Math.max(1, parseInt(periodMonths, 10) || 1)
  const resolvedPeriodMonths = effectivePeriods.some((p) => p.months === periodMonthsNum)
    ? periodMonthsNum
    : (effectivePeriods[0]?.months ?? 1)

  useEffect(() => {
    if (!open) {
      setError(null)
      setCommitting(false)
      setCountClampHint(null)
      return
    }
    const maxC = parseMaxInstallmentsCount(settings)
    const d = initialDraft
    if (d) {
      setStartDate(d.start_date)
      setNumInstallments(String(Math.min(maxC, Math.max(1, d.num_installments))))
      setPeriodMonths(String(d.period_months ?? 1))
      setAccountId(d.account_id ?? null)
    } else {
      setStartDate(new Date().toISOString().slice(0, 10))
      setNumInstallments(String(Math.min(6, maxC)))
      setPeriodMonths('1')
      if (invoiceType === 'purchase') {
        const pid = accountDefaults?.installments_payable_account_id
        setAccountId(pid != null && Number(pid) > 0 ? Number(pid) : null)
      } else {
        setAccountId(null)
      }
    }
  }, [
    open,
    settings,
    invoiceType,
    accountDefaults?.installments_payable_account_id,
    initialDraft?.start_date,
    initialDraft?.num_installments,
    initialDraft?.period_months,
    initialDraft?.account_id,
  ])

  const installmentsCountParsed = useMemo(() => {
    const n = parseInt(numInstallments.trim(), 10)
    return Number.isFinite(n) ? n : NaN
  }, [numInstallments])

  const numInstallmentsError = useMemo(() => {
    if (numInstallments.trim() === '') {
      return ti.numInstallmentsRequired ?? (lang === 'ar' ? 'أدخل عدداً صحيحاً لعدد الأقساط (١ أو أكثر).' : 'Enter a valid installment count (1 or more).')
    }
    if (!Number.isFinite(installmentsCountParsed) || installmentsCountParsed < 1) {
      return ti.numInstallmentsRequired ?? (lang === 'ar' ? 'أدخل عدداً صحيحاً لعدد الأقساط (١ أو أكثر).' : 'Enter a valid installment count (1 or more).')
    }
    if (installmentsCountParsed > maxInstallmentsAllowed) {
      return ti.numInstallmentsOverMax ?? (lang === 'ar' ? 'عدد الأقساط يتجاوز الحد الأقصى المسموح.' : 'Installment count exceeds the allowed maximum.')
    }
    return null
  }, [numInstallments, installmentsCountParsed, maxInstallmentsAllowed, lang, ti])

  const balanceBelowMin = useMemo(
    () => minInstallmentAmountRule > 0 && balanceAmount + 1e-9 < minInstallmentAmountRule,
    [balanceAmount, minInstallmentAmountRule],
  )

  const showCountClampHint = (maxC: number) => {
    const template = ti.numInstallmentsMaxHint ?? (lang === 'ar' ? 'أقصى عدد مسموح به هو {max}.' : 'Maximum allowed is {max}.')
    setCountClampHint(template.replace('{max}', String(maxC)))
    window.setTimeout(() => setCountClampHint(null), 4000)
  }

  const onCountInputChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '')
    if (digits === '') {
      setNumInstallments('')
      return
    }
    let n = parseInt(digits, 10)
    if (!Number.isFinite(n)) return
    const maxC = maxInstallmentsAllowed
    if (n > maxC) {
      n = maxC
      showCountClampHint(maxC)
    }
    setNumInstallments(String(Math.max(1, n)))
  }

  const bumpInstallmentCount = (delta: number) => {
    const maxC = maxInstallmentsAllowed
    const cur = parseInt(numInstallments, 10)
    const base = Number.isFinite(cur) && numInstallments.trim() !== '' ? cur : 1
    const rawNext = base + delta
    if (rawNext > maxC) {
      showCountClampHint(maxC)
    }
    const next = Math.min(maxC, Math.max(1, rawNext))
    setNumInstallments(String(next))
  }

  if (!open) return null

  const purchaseNeedsAccount = invoiceType === 'purchase' && !accountId
  const periodInvalid = resolvedPeriodMonths < 1
  const canConfirmDraft =
    !balanceBelowMin && !numInstallmentsError && !purchaseNeedsAccount && !periodInvalid && Number.isFinite(installmentsCountParsed) && installmentsCountParsed >= 1

  const handleConfirmDraft = async () => {
    if (!canConfirmDraft) return
    setError(null)
    setCommitting(true)
    try {
      const draft: CreateInstallmentFromInvoicePayload = {
        start_date: startDate,
        num_installments: installmentsCountParsed,
        period_months: resolvedPeriodMonths,
        branch_id: defaultBranchId ?? null,
        account_id: invoiceType === 'purchase' ? accountId : undefined,
      }
      await onDraftCommit(draft)
      onClose()
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e as Error)?.message ??
        (lang === 'ar' ? 'تعذر حفظ مسودة الجدول.' : 'Could not save the installment draft.')
      setError(msg)
    } finally {
      setCommitting(false)
    }
  }

  const countInputClass =
    'min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm text-center tabular-nums shadow-sm ' +
    (numInstallmentsError ? 'border-red-400 bg-red-50/40 focus:ring-2 focus:ring-inset focus:ring-red-400' : 'border-slate-300 bg-white focus:ring-2 focus:ring-inset focus:ring-primary-500')

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="installment-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl ring-1 ring-slate-900/5"
        onClick={(e) => e.stopPropagation()}
        dir={lang === 'ar' ? 'rtl' : 'ltr'}
      >
        <div className="border-b border-slate-100 px-5 py-4 bg-slate-50/80 rounded-t-2xl">
          <h2 id="installment-modal-title" className="text-base font-semibold text-slate-900">
            {ti.invoiceScheduleTitle ?? (lang === 'ar' ? 'تقسيط المبلغ المتبقي' : 'Split remaining balance')}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {ti.invoiceScheduleHint ??
              (lang === 'ar'
                ? `المبلغ المراد تقسيطه: ${balanceAmount.toFixed(3)} — تُحفظ المسودة مع الفاتورة عند الضغط على «حفظ الفاتورة» فقط.`
                : `Amount to schedule: ${balanceAmount.toFixed(3)}. The draft is stored with the invoice only when you click Save.`)}
          </p>
        </div>
        <div className="space-y-4 px-5 py-4">
          {error && <p className="text-sm text-red-600">{error}</p>}
          {balanceBelowMin && (
            <p className="text-sm text-red-600 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              {ti.balanceBelowMinInModal ??
                (lang === 'ar'
                  ? `المبلغ المتبقي (${balanceAmount.toFixed(3)}) أقل من الحد الأدنى (${minInstallmentAmountRule.toFixed(3)}) للتقسيط.`
                  : `Remaining (${balanceAmount.toFixed(3)}) is below the minimum (${minInstallmentAmountRule.toFixed(3)}) for installments.`)}
            </p>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              {ti.startDate ?? 'Start date'}
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              {ti.period ?? (lang === 'ar' ? 'دورية السداد' : 'Payment period')}
            </label>
            <select
              value={String(resolvedPeriodMonths)}
              onChange={(e) => setPeriodMonths(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
            >
              {effectivePeriods.map((p) => (
                <option key={`${p.code}-${p.months}-${p.id}`} value={String(p.months)}>
                  {lang === 'ar' ? `${p.name} (كل ${p.months} شهر)` : `${p.name_en || p.name} (every ${p.months} month(s))`}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              {ti.numInstallments ?? (lang === 'ar' ? 'عدد الأقساط' : 'Installments count')}
              <span className="text-slate-400 font-normal ms-1">
                ({lang === 'ar' ? 'الحد' : 'max'} {maxInstallmentsAllowed})
              </span>
            </label>
            <div className="flex items-stretch gap-2">
              <button
                type="button"
                aria-label={lang === 'ar' ? 'نقصان' : 'Decrease'}
                disabled={!Number.isFinite(installmentsCountParsed) || installmentsCountParsed <= 1}
                onClick={() => bumpInstallmentCount(-1)}
                className="shrink-0 w-10 rounded-lg border border-slate-300 bg-slate-50 text-lg font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                −
              </button>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={maxInstallmentsAllowed}
                step={1}
                value={numInstallments}
                onChange={(e) => onCountInputChange(e.target.value)}
                title={countClampHint ?? undefined}
                className={countInputClass}
              />
              <button
                type="button"
                aria-label={lang === 'ar' ? 'زيادة' : 'Increase'}
                disabled={installmentsCountParsed >= maxInstallmentsAllowed}
                onClick={() => bumpInstallmentCount(1)}
                className="shrink-0 w-10 rounded-lg border border-slate-300 bg-slate-50 text-lg font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                +
              </button>
            </div>
            {countClampHint && <p className="text-xs text-amber-700 mt-1">{countClampHint}</p>}
            {numInstallmentsError && <p className="text-xs text-red-600 mt-1">{numInstallmentsError}</p>}
          </div>
          {invoiceType === 'purchase' && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                {ti.installmentLiabilityAccount ?? (lang === 'ar' ? 'حساب التزام الأقساط (دائن)' : 'Installment liability account')}
              </label>
              <AccountSearchSelect
                accounts={accounts}
                value={accountId}
                onChange={setAccountId}
                placeholder={lang === 'ar' ? 'اختر الحساب' : 'Select account'}
                inputClassName={
                  'w-full border rounded-lg px-3 py-2 text-sm outline-none ' +
                  (purchaseNeedsAccount ? 'border-red-400 bg-red-50/40 focus:ring-2 focus:ring-inset focus:ring-red-400' : 'border-slate-300 focus:ring-2 focus:ring-inset focus:ring-primary-500')
                }
              />
              {purchaseNeedsAccount && (
                <p className="text-xs text-red-600 mt-1">
                  {lang === 'ar' ? 'يرجى اختيار حساب التزام الأقساط.' : 'Please select the installment liability account.'}
                </p>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-5 py-3 rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            {t.cancel}
          </button>
          <button
            type="button"
            disabled={committing || !canConfirmDraft}
            onClick={() => void handleConfirmDraft()}
            title={!canConfirmDraft && !committing ? (numInstallmentsError ?? (balanceBelowMin ? ti.balanceBelowMinInModal : '')) : undefined}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-500 disabled:opacity-50"
          >
            {committing
              ? t.loading
              : ti.confirmDraftSchedule ?? (lang === 'ar' ? 'تأكيد المسودة' : 'Confirm draft')}
          </button>
        </div>
      </div>
    </div>
  )
}
