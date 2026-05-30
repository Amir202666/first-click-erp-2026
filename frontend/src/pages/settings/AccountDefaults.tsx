import { useState, useCallback, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchAccountDefaults, updateAccountDefaults, fetchAccounts } from '../../api/tenant'
import type { TenantAccountDefault, Account } from '../../types'
import { Landmark, Save } from 'lucide-react'
import Toast, { type ToastType } from '../../components/ui/Toast'
import SearchableSelect from '../../components/ui/SearchableSelect'
import { buildDefaultAccountSelectOptions } from '../../utils/defaultAccountSelectOptions'

const KEY_LABELS: Record<string, string> = {
  cash_account_id: 'cash',
  bank_account_id: 'bank',
  customers_account_id: 'customers',
  vendors_account_id: 'vendors',
  inventory_account_id: 'inventory',
  sales_account_id: 'sales',
  sales_returns_account_id: 'salesReturns',
  cogs_account_id: 'cogs',
  purchases_account_id: 'purchases',
  discounts_account_id: 'discounts',
  purchase_discounts_account_id: 'purchaseDiscounts',
  tax_payable_account_id: 'taxPayable',
  capital_account_id: 'capital',
}
const KEYS = Object.keys(KEY_LABELS) as (keyof TenantAccountDefault)[]

export default function AccountDefaults() {
  const { currentTenant } = useAuth()
  const { t, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})

  const { data: defaults, isLoading } = useQuery<TenantAccountDefault>({
    queryKey: ['account-defaults', tenantId],
    queryFn: () => fetchAccountDefaults(tenantId),
    enabled: !!tenantId,
  })

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts', tenantId, 'defaults-settings'],
    queryFn: () => fetchAccounts(tenantId, { include_groups: '1', active_only: '1' }),
    enabled: !!tenantId,
  })

  const accountOptions = useMemo(() => buildDefaultAccountSelectOptions(accounts), [accounts])

  const showToast = useCallback((message: string, type: ToastType) => setToast({ message, type }), [])

  const updateMut = useMutation({
    mutationFn: (data: Partial<TenantAccountDefault>) => updateAccountDefaults(tenantId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account-defaults'] })
      showToast(t.msg.updatedSuccess, 'success')
    },
    onError: (err: any) => showToast(err?.response?.data?.message ?? t.msg.updateError, 'error'),
  })

  useEffect(() => {
    if (!defaults) return
    const next: Record<string, string> = {}
    KEYS.forEach((key) => {
      const val = (defaults as any)[key]
      next[key] = val != null ? String(val) : ''
    })
    setForm(next)
  }, [defaults])

  const handleChange = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!tenantId) {
      showToast((t as any).accountDefaults?.selectClientFirst ?? 'يجب اختيار العميل/الشركة من القائمة أولاً ثم احفظ.', 'error')
      return
    }
    const payload: Record<string, number | null> = {}
    KEYS.forEach((key) => {
      const v = form[key]
      payload[key] = v ? Number(v) : null
    })
    updateMut.mutate(payload as Partial<TenantAccountDefault>)
  }

  const textAlign = isRtl ? 'right' : 'left'

  return (
    <div className="p-6 space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
          <Landmark size={20} className="text-primary-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{(t as any).accountDefaults?.title ?? 'الحسابات الأساسية'}</h1>
          <p className="text-sm text-slate-500">{(t as any).accountDefaults?.subtitle ?? 'ربط الحسابات الافتراضية لعمليات البيع والشراء. رأس المال لا يُستخدم تلقائياً.'}</p>
        </div>
      </div>

      {!tenantId && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          {(t as any).accountDefaults?.ensureClientSelected ?? 'تأكد من اختيار الشركة/العميل من أعلى الصفحة قبل تعيين الحسابات وحفظها.'}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" /></div>
      ) : (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-visible">
          <div className="p-4 border-b border-slate-200 bg-slate-50">
            <p className="text-sm text-slate-600">{(t as any).accountDefaults?.requiredHint ?? 'يجب تحديد جميع الحسابات المطلوبة قبل ترحيل فواتير البيع أو الشراء.'}</p>
          </div>
          <div className="p-6 pb-28 grid gap-5 sm:grid-cols-2">
            {KEYS.map((key) => {
              const labelKey = KEY_LABELS[key]
              const label = (t as any).accountDefaults?.[labelKey] ?? key
              return (
                <SearchableSelect
                  key={key}
                  label={
                    label +
                    (key === 'capital_account_id'
                      ? ` (${(t as any).accountDefaults?.capitalNotUsed ?? 'لا يُستخدم تلقائياً'})`
                      : '')
                  }
                  options={accountOptions}
                  value={form[key] ? Number(form[key]) : null}
                  onChange={(v) => handleChange(key, v != null && v !== '' ? String(v) : '')}
                  placeholder="—"
                  textAlign={isRtl ? 'right' : 'left'}
                  wrapOptions
                  dropdownMinWidth={320}
                />
              )
            })}
          </div>
          <div className="p-4 border-t border-slate-200 flex justify-end">
            <button type="submit" disabled={updateMut.isPending}
              className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50 transition-colors">
              <Save size={18} /> {updateMut.isPending ? t.saving : t.save}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
