import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchAccountDefaults, updateAccountDefaults, fetchAccounts, fetchSettings, updateSettings, fetchInstallmentPeriods } from '../../api/tenant'
import type { TenantAccountDefault, Account, TenantSettings, InstallmentPeriod } from '../../types'
import { CalendarClock, Save } from 'lucide-react'
import Toast, { type ToastType } from '../../components/ui/Toast'
import AccountSearchSelect from '../../components/AccountSearchSelect'
import { DEFAULT_MAX_INSTALLMENTS, DEFAULT_MIN_INSTALLMENT_AMOUNT } from '../../utils/installmentBusinessRules'

export default function SettingsInstallments() {
  const { currentTenant } = useAuth()
  const { t, isRtl } = useLanguage()
  const ti = ((t as any).installments ?? {}) as Record<string, string | undefined>
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [installmentsReceivableAccountId, setInstallmentsReceivableAccountId] = useState<number | null>(null)
  const [installmentsPayableAccountId, setInstallmentsPayableAccountId] = useState<number | null>(null)
  const [enabledPeriodMonths, setEnabledPeriodMonths] = useState<number[]>([])
  const [maxInstallmentsStr, setMaxInstallmentsStr] = useState(String(DEFAULT_MAX_INSTALLMENTS))
  const [minInstallmentAmountStr, setMinInstallmentAmountStr] = useState(String(DEFAULT_MIN_INSTALLMENT_AMOUNT))

  const { data: accountDefaults, isLoading } = useQuery({
    queryKey: ['account-defaults', tenantId],
    queryFn: () => fetchAccountDefaults(tenantId),
    enabled: !!tenantId,
  })

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts', tenantId],
    queryFn: () => fetchAccounts(tenantId, { active_only: '1' }),
    enabled: !!tenantId,
  })

  const { data: settings } = useQuery<TenantSettings>({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })

  const { data: periods = [] } = useQuery<InstallmentPeriod[]>({
    queryKey: ['installment-periods', tenantId],
    queryFn: () => fetchInstallmentPeriods(tenantId),
    enabled: !!tenantId,
  })

  const fallbackPeriods: InstallmentPeriod[] = [
    { id: -1, code: 'monthly', months: 1, name: 'شهري', name_en: 'Monthly', enabled: true },
    { id: -2, code: 'quarterly', months: 3, name: 'ربع سنوي', name_en: 'Quarterly', enabled: true },
    { id: -3, code: 'semi_annually', months: 6, name: 'نصف سنوي', name_en: 'Semi-Annually', enabled: true },
    { id: -4, code: 'annually', months: 12, name: 'سنوي', name_en: 'Annually', enabled: true },
  ]

  const periodRows = periods.length ? periods : fallbackPeriods

  const postableAccounts = accounts.filter((a) => a.is_postable !== false)

  const installmentsReceivableFromServer = (accountDefaults as TenantAccountDefault | undefined)?.installments_receivable_account_id
  const installmentsPayableFromServer = (accountDefaults as TenantAccountDefault | undefined)?.installments_payable_account_id
  useEffect(() => {
    if (accountDefaults == null) return
    const id = installmentsReceivableFromServer ?? null
    setInstallmentsReceivableAccountId(id != null ? Number(id) : null)
    const pid = installmentsPayableFromServer ?? null
    setInstallmentsPayableAccountId(pid != null ? Number(pid) : null)
  }, [accountDefaults, installmentsReceivableFromServer, installmentsPayableFromServer])

  useEffect(() => {
    if (!settings) return
    const raw = (settings as TenantSettings)['installment_enabled_period_months']
    const arr = Array.isArray(raw) ? raw.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0) : []
    setEnabledPeriodMonths(arr.length ? arr : []) // [] = لا تقييد (كلها)
    const s = settings as TenantSettings
    const mx = s.max_installments_count
    if (mx != null && mx !== '') {
      const n = Math.floor(Number(mx))
      setMaxInstallmentsStr(String(Number.isFinite(n) && n >= 1 ? Math.min(120, n) : DEFAULT_MAX_INSTALLMENTS))
    }
    const mn = s.min_installment_amount
    if (mn != null && mn !== '') {
      const v = Number(mn)
      setMinInstallmentAmountStr(String(Number.isFinite(v) && v >= 0 ? v : DEFAULT_MIN_INSTALLMENT_AMOUNT))
    }
  }, [settings])

  const updateMut = useMutation({
    mutationFn: (data: Partial<TenantAccountDefault>) => updateAccountDefaults(tenantId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account-defaults', tenantId] })
      setToast({ message: t.msg?.updatedSuccess ?? 'تم الحفظ بنجاح', type: 'success' })
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setToast({ message: err?.response?.data?.message ?? t.msg?.updateError ?? 'فشل التحديث', type: 'error' })
    },
  })

  const updateRulesMut = useMutation({
    mutationFn: () => {
      const mx = Math.floor(parseInt(maxInstallmentsStr, 10))
      const mn = parseFloat(minInstallmentAmountStr)
      const maxOk = Number.isFinite(mx) ? Math.min(120, Math.max(1, mx)) : DEFAULT_MAX_INSTALLMENTS
      const minOk = Number.isFinite(mn) && mn >= 0 ? mn : DEFAULT_MIN_INSTALLMENT_AMOUNT
      return updateSettings(tenantId, {
        max_installments_count: maxOk as unknown as number,
        min_installment_amount: minOk as unknown as number,
      } as Partial<TenantSettings>)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', tenantId] })
      setToast({ message: t.msg?.updatedSuccess ?? 'تم الحفظ بنجاح', type: 'success' })
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setToast({ message: err?.response?.data?.message ?? t.msg?.updateError ?? 'فشل التحديث', type: 'error' })
    },
  })

  const updatePeriodsMut = useMutation({
    mutationFn: (months: number[]) =>
      updateSettings(tenantId, {
        // TenantSettings typing is string[]-oriented for arrays; store months as strings for compatibility.
        installment_enabled_period_months: months.map(String) as unknown as string[],
      } as Partial<TenantSettings>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['installment-periods', tenantId] })
      setToast({ message: t.msg?.updatedSuccess ?? 'تم الحفظ بنجاح', type: 'success' })
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setToast({ message: err?.response?.data?.message ?? t.msg?.updateError ?? 'فشل التحديث', type: 'error' })
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateMut.mutate({
      installments_receivable_account_id: installmentsReceivableAccountId ? Number(installmentsReceivableAccountId) : null,
      installments_payable_account_id: installmentsPayableAccountId ? Number(installmentsPayableAccountId) : null,
    })
  }

  const textAlign = isRtl ? 'text-right' : 'text-left'

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 mb-6">
        <CalendarClock size={22} className="text-slate-600" />
        <h1 className="text-lg font-semibold text-slate-900">{t.nav?.settingsInstallments ?? 'إعدادات الأقساط'}</h1>
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {!tenantId ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
          {t.accountDefaults?.ensureClientSelected ?? 'يرجى اختيار الشركة من أعلى الصفحة.'}
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
        </div>
      ) : (
        <div className="space-y-4">
          <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="min-w-0">
                  <label className={`block text-sm font-medium text-slate-700 mb-2 ${textAlign}`}>
                    {t.accountDefaults?.installmentsReceivable ?? 'حساب أقساط مدينة'}
                  </label>
                  <AccountSearchSelect
                    accounts={postableAccounts}
                    value={installmentsReceivableAccountId}
                    onChange={setInstallmentsReceivableAccountId}
                    allowEmpty
                    placeholder={`— ${t.accountDefaults?.none ?? 'بدون'} —`}
                    inputClassName="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                  />
                </div>
                <div className="min-w-0">
                  <label className={`block text-sm font-medium text-slate-700 mb-2 ${textAlign}`}>
                    {t.accountDefaults?.installmentsPayable ?? (isRtl ? 'حساب أقساط دائنة' : 'Installments payable account')}
                  </label>
                  <AccountSearchSelect
                    accounts={postableAccounts}
                    value={installmentsPayableAccountId}
                    onChange={setInstallmentsPayableAccountId}
                    allowEmpty
                    placeholder={`— ${t.accountDefaults?.none ?? 'بدون'} —`}
                    inputClassName="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                  />
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 flex justify-end">
              <button type="submit" disabled={updateMut.isPending} className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50">
                <Save size={18} /> {t.save}
              </button>
            </div>
          </form>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="text-sm font-semibold text-slate-900">
                  {ti.businessRulesTitle ?? (isRtl ? 'قواعد عمل التقسيط' : 'Installment business rules')}
                </div>
                <button
                  type="button"
                  onClick={() => updateRulesMut.mutate()}
                  disabled={updateRulesMut.isPending}
                  className="shrink-0 flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50"
                >
                  <Save size={18} /> {t.save}
                </button>
              </div>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm font-medium text-slate-700 mb-1 ${textAlign}`}>
                    {ti.maxInstallmentsCountLabel ?? (isRtl ? 'أقصى عدد أقساط' : 'Max installments')}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={maxInstallmentsStr}
                    onChange={(e) => setMaxInstallmentsStr(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                  />
                  <p className="text-xs text-slate-500 mt-1">1–120</p>
                </div>
                <div>
                  <label className={`block text-sm font-medium text-slate-700 mb-1 ${textAlign}`}>
                    {ti.minInstallmentAmountLabel ?? (isRtl ? 'الحد الأدنى للمبلغ' : 'Min remaining amount')}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.001"
                    value={minInstallmentAmountStr}
                    onChange={(e) => setMinInstallmentAmountStr(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900">{ti.periodsTitle ?? (isRtl ? 'الدوريات المتاحة' : 'Available periods')}</div>
                <button
                  type="button"
                  onClick={() => updatePeriodsMut.mutate(enabledPeriodMonths)}
                  disabled={updatePeriodsMut.isPending}
                  className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50"
                >
                  <Save size={18} /> {t.save}
                </button>
              </div>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {periodRows.map((p) => {
                  const label = isRtl ? p.name : (p.name_en || p.name)
                  const isChecked = enabledPeriodMonths.length === 0 ? true : enabledPeriodMonths.includes(p.months)
                  return (
                    <label key={p.id} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          const nextChecked = e.target.checked
                          setEnabledPeriodMonths((prev) => {
                            const base = prev.length === 0 ? periodRows.map((x) => x.months) : prev
                            const set = new Set(base)
                            if (nextChecked) set.add(p.months)
                            else set.delete(p.months)
                            return Array.from(set).sort((a, b) => a - b)
                          })
                        }}
                        className="h-4 w-4"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-800 truncate">{label}</div>
                        <div className="text-xs text-slate-500">{isRtl ? `كل ${p.months} شهر` : `Every ${p.months} month(s)`}</div>
                      </div>
                    </label>
                  )
                })}
              </div>

              <p className="text-xs text-slate-500 mt-3">
                {isRtl ? 'ملاحظة: إذا تركت كل الخيارات مفعلة (بدون تقييد)، ستظهر كل الدوريات.' : 'Note: leaving it unrestricted shows all periods.'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
