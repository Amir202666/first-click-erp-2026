import { useState, useCallback, useEffect, useId, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchSettings, updateSettings, fetchWarehouses, fetchAccounts } from '../../api/tenant'
import type { TenantSettings, Warehouse, Account } from '../../types'
import { Save, Loader2 } from 'lucide-react'
import Toast, { type ToastType } from '../../components/ui/Toast'
import AccountSearchSelect from '../../components/AccountSearchSelect'

/** نفس ارتفاع حقل AccountSearchSelect (h-10) */
const MFG_CONTROL_HEIGHT =
  'h-10 min-h-[2.5rem] box-border rounded-lg border border-slate-300 bg-white py-0 pe-2 ps-3 text-sm leading-10 text-slate-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:ring-offset-0 disabled:opacity-60'

type MfgForm = {
  manufacturing_method: string
  allow_manufacturing_with_raw_shortage: boolean
  manufacturing_default_raw_warehouse_id: string
  manufacturing_default_finished_warehouse_id: string
  manufacturing_wip_account_id: number | null
}

export default function SettingsManufacturing() {
  const { currentTenant } = useAuth()
  const { isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()
  const autoRadioId = useId()
  const manualRadioId = useId()
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [form, setForm] = useState<MfgForm>({
    manufacturing_method: 'auto_on_sale',
    allow_manufacturing_with_raw_shortage: false,
    manufacturing_default_raw_warehouse_id: '',
    manufacturing_default_finished_warehouse_id: '',
    manufacturing_wip_account_id: null,
  })

  const { data: settings, isLoading } = useQuery<TenantSettings>({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })

  const { data: warehousesRes, isLoading: whLoading } = useQuery({
    queryKey: ['warehouses', tenantId, 'settings-mfg'],
    queryFn: () => fetchWarehouses(tenantId, { per_page: '500' }),
    enabled: !!tenantId,
  })

  const { data: accounts = [], isLoading: accountsLoading } = useQuery<Account[]>({
    queryKey: ['accounts', tenantId, 'settings-mfg'],
    queryFn: () => fetchAccounts(tenantId, { postable_only: '1', active_only: '1' }),
    enabled: !!tenantId,
  })

  const warehouses: Warehouse[] = warehousesRes?.data ?? []

  const warehouseOptions = useMemo(() => {
    return [...warehouses].filter((w) => w.is_active !== false).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'ar'))
  }, [warehouses])

  const showToast = useCallback((message: string, type: ToastType) => setToast({ message, type }), [])

  const updateMut = useMutation({
    mutationFn: (data: Partial<TenantSettings>) => updateSettings(tenantId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      showToast('تم الحفظ بنجاح', 'success')
    },
    onError: (err: unknown) => {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : undefined
      showToast(msg ?? 'فشل التحديث', 'error')
    },
  })

  useEffect(() => {
    if (!settings) return
    const m = settings.manufacturing_method
    const raw = settings.manufacturing_default_raw_warehouse_id
    const fin = settings.manufacturing_default_finished_warehouse_id
    const wip = settings.manufacturing_wip_account_id
    setForm({
      manufacturing_method:
        m === 'manual_orders' ? 'manual_orders' : 'auto_on_sale',
      allow_manufacturing_with_raw_shortage:
        settings.allow_manufacturing_with_raw_shortage === true || settings.allow_manufacturing_with_raw_shortage === '1',
      manufacturing_default_raw_warehouse_id:
        raw != null && raw !== '' ? String(raw) : '',
      manufacturing_default_finished_warehouse_id:
        fin != null && fin !== '' ? String(fin) : '',
      manufacturing_wip_account_id:
        wip != null && wip !== '' ? Number(wip) : null,
    })
  }, [settings])

  const isAutoOnSale = form.manufacturing_method === 'auto_on_sale'

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!tenantId) {
      showToast('يجب اختيار الشركة أولاً', 'error')
      return
    }
    if (isAutoOnSale) {
      if (!form.manufacturing_default_raw_warehouse_id || !form.manufacturing_default_finished_warehouse_id) {
        showToast('عند «آلي عند البيع» يجب اختيار مخزن المواد الخام ومخزن المنتج النهائي.', 'error')
        return
      }
      if (form.manufacturing_wip_account_id == null || form.manufacturing_wip_account_id < 1) {
        showToast('عند «آلي عند البيع» يجب اختيار حساب التصنيع الوسيط (WIP).', 'error')
        return
      }
    }
    updateMut.mutate({
      manufacturing_method: form.manufacturing_method,
      allow_manufacturing_with_raw_shortage: !!form.allow_manufacturing_with_raw_shortage,
      manufacturing_default_raw_warehouse_id: form.manufacturing_default_raw_warehouse_id
        ? Number(form.manufacturing_default_raw_warehouse_id)
        : null,
      manufacturing_default_finished_warehouse_id: form.manufacturing_default_finished_warehouse_id
        ? Number(form.manufacturing_default_finished_warehouse_id)
        : null,
      manufacturing_wip_account_id: form.manufacturing_wip_account_id ?? null,
    })
  }

  const dir = isRtl ? 'rtl' : 'ltr'
  const align = isRtl ? 'text-right' : 'text-left'
  const rawShortageOn = !!form.allow_manufacturing_with_raw_shortage
  const selectBusy = whLoading || accountsLoading

  return (
    <div className="p-6 space-y-6" dir={dir}>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className={align}>
        <h1 className="text-2xl font-bold text-slate-900">إعدادات التصنيع</h1>
      </div>

      {!tenantId && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          يرجى اختيار الشركة من أعلى الصفحة قبل تعديل الإعدادات.
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-10 w-10 animate-spin text-primary-600" />
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="p-6 sm:p-8">
            {/* مجموعة: طريقة العمل */}
            <div className="border-b border-slate-100">
              <h2 className={`pb-4 text-sm font-semibold text-slate-900 ${align}`}>طريقة العمل</h2>

              <div
                className="flex flex-wrap items-center gap-x-10 gap-y-3 pb-3"
                role="radiogroup"
                aria-label="طريقة التصنيع"
              >
                <label className="flex cursor-pointer items-center gap-2 rounded-lg py-2 transition-colors hover:bg-slate-50/90 has-[:focus-visible]:bg-slate-50">
                  <input
                    id={autoRadioId}
                    type="radio"
                    name="manufacturing_method"
                    value="auto_on_sale"
                    checked={form.manufacturing_method === 'auto_on_sale'}
                    onChange={() => setForm((f) => ({ ...f, manufacturing_method: 'auto_on_sale' }))}
                    className="h-4 w-4 shrink-0 border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm font-medium text-slate-900">آلي عند البيع</span>
                </label>

                <label className="flex cursor-pointer items-center gap-2 rounded-lg py-2 transition-colors hover:bg-slate-50/90 has-[:focus-visible]:bg-slate-50">
                  <input
                    id={manualRadioId}
                    type="radio"
                    name="manufacturing_method"
                    value="manual_orders"
                    checked={form.manufacturing_method === 'manual_orders'}
                    onChange={() => setForm((f) => ({ ...f, manufacturing_method: 'manual_orders' }))}
                    className="h-4 w-4 shrink-0 border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm font-medium text-slate-900">يدوي عبر أوامر التصنيع</span>
                </label>
              </div>
            </div>

            {/* الربط المخزني + الربط المحاسبي — صف واحد على الشاشات الواسعة */}
            <div className="mt-8 border-t border-slate-100 pt-8">
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-10 lg:items-start">
                <div className="min-w-0">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className={`min-w-0 ${align}`}>
                      <label htmlFor="mfg-raw-wh" className={`mb-2 block text-sm font-medium text-slate-800 ${align}`}>
                        مخزن المواد الخام الافتراضي
                        {isAutoOnSale && <span className="text-red-600">*</span>}
                      </label>
                      <select
                        id="mfg-raw-wh"
                        value={form.manufacturing_default_raw_warehouse_id}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, manufacturing_default_raw_warehouse_id: e.target.value }))
                        }
                        disabled={selectBusy || !tenantId}
                        className={`w-full ${MFG_CONTROL_HEIGHT}`}
                      >
                        <option value="">{selectBusy ? 'جاري التحميل…' : 'اختر المخزن'}</option>
                        {warehouseOptions.map((w) => (
                          <option key={w.id} value={String(w.id)}>
                            {w.code ? `${w.code} — ` : ''}{w.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className={`min-w-0 ${align}`}>
                      <label htmlFor="mfg-fin-wh" className={`mb-2 block text-sm font-medium text-slate-800 ${align}`}>
                        مخزن المنتج النهائي الافتراضي
                        {isAutoOnSale && <span className="text-red-600">*</span>}
                      </label>
                      <select
                        id="mfg-fin-wh"
                        value={form.manufacturing_default_finished_warehouse_id}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, manufacturing_default_finished_warehouse_id: e.target.value }))
                        }
                        disabled={selectBusy || !tenantId}
                        className={`w-full ${MFG_CONTROL_HEIGHT}`}
                      >
                        <option value="">{selectBusy ? 'جاري التحميل…' : 'اختر المخزن'}</option>
                        {warehouseOptions.map((w) => (
                          <option key={w.id} value={String(w.id)}>
                            {w.code ? `${w.code} — ` : ''}{w.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="min-w-0">
                  <div className={`min-w-0 ${align}`}>
                    <label className={`mb-2 block text-sm font-medium text-slate-800 ${align}`}>
                      حساب وسيط التصنيع (WIP)
                      {isAutoOnSale && <span className="text-red-600">*</span>}
                    </label>
                    <AccountSearchSelect
                      value={form.manufacturing_wip_account_id}
                      accounts={accounts}
                      onChange={(id) => setForm((f) => ({ ...f, manufacturing_wip_account_id: id }))}
                      placeholder="ابحث في شجرة الحسابات…"
                      disabled={accountsLoading || !tenantId}
                      className="w-full max-w-full"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* مجموعة: إدارة المخزون */}
            <div className="mt-8 border-t border-slate-100 pt-8">
              <h2 className={`pb-4 text-sm font-semibold text-slate-900 ${align}`}>إدارة المخزون</h2>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <label
                  htmlFor="mfg-raw-shortage"
                  className={`shrink-0 text-sm font-medium text-slate-900 ${align}`}
                >
                  السماح بالتصنيع في حال نقص الخام
                </label>
                <select
                  id="mfg-raw-shortage"
                  value={rawShortageOn ? 'yes' : 'no'}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      allow_manufacturing_with_raw_shortage: e.target.value === 'yes',
                    }))
                  }
                  disabled={!tenantId}
                  aria-label="السماح بالتصنيع في حال نقص الخام"
                  className="min-w-[10rem] rounded-lg border border-slate-300 bg-white py-2 pe-2 ps-3 text-sm text-slate-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-inset focus:ring-primary-500/30 disabled:opacity-60"
                >
                  <option value="no">لا</option>
                  <option value="yes">نعم</option>
                </select>
              </div>
            </div>

            <div className="mt-8 flex justify-end border-t border-slate-100 pt-6">
              <button
                type="submit"
                disabled={updateMut.isPending || !tenantId || isLoading}
                className={`inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-500 disabled:pointer-events-none disabled:opacity-50 ${isRtl ? 'flex-row-reverse' : ''}`}
              >
                {updateMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" strokeWidth={1.75} />
                )}
                حفظ الإعدادات
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  )
}
