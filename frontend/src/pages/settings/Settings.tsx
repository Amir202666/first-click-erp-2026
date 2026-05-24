import { useState, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchSettings, updateSettings, fetchAccounts, fetchCurrencies } from '../../api/tenant'
import type { TenantSettings, Account, Currency } from '../../types'
import { Settings as SettingsIcon, Landmark, ShoppingCart, Building2, Save, Package } from 'lucide-react'
import Toast, { type ToastType } from '../../components/ui/Toast'

type TabId = 'accounting' | 'items_options' | 'pos' | 'general'

const ACCOUNTING_KEYS = [
  'fiscal_year_start_month',
  'default_currency_id',
  'retained_earnings_account_id',
  'currency_diff_account_id',
  'tax_account_id',
  'auto_journal_entries_enabled',
  'post_immediately',
] as const

const POS_KEYS = [
  'pos_invoice_logo',
  'pos_invoice_header',
  'pos_invoice_footer',
  'pos_print_mode',
  'pos_default_printer_enabled',
  'pos_tax_inclusive',
  'pos_rounding',
  'allow_negative_sale',
] as const

const ITEM_OPTIONS_KEYS = ['invoice_use_serial_numbers', 'invoice_expiry_dates_enabled'] as const

const GENERAL_KEYS = [
  'company_name',
  'commercial_registration',
  'tax_number',
  'notification_email_enabled',
  'notification_sms_enabled',
  'theme',
  'backup_retention_days',
] as const

const FISCAL_MONTHS = [
  { value: 1, label: 'يناير' }, { value: 2, label: 'فبراير' }, { value: 3, label: 'مارس' },
  { value: 4, label: 'أبريل' }, { value: 5, label: 'مايو' }, { value: 6, label: 'يونيو' },
  { value: 7, label: 'يوليو' }, { value: 8, label: 'أغسطس' }, { value: 9, label: 'سبتمبر' },
  { value: 10, label: 'أكتوبر' }, { value: 11, label: 'نوفمبر' }, { value: 12, label: 'ديسمبر' },
]

export default function Settings() {
  const { currentTenant } = useAuth()
  const { t, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<TabId>('accounting')
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [form, setForm] = useState<Record<string, string | number | boolean>>({})

  const { data: settings, isLoading } = useQuery<TenantSettings>({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts', tenantId, 'postable'],
    queryFn: () => fetchAccounts(tenantId, { postable_only: '1', active_only: '1' }),
    enabled: !!tenantId,
  })

  const { data: currencies = [] } = useQuery<Currency[]>({
    queryKey: ['currencies', tenantId],
    queryFn: () => fetchCurrencies(tenantId),
    enabled: !!tenantId,
  })

  const showToast = useCallback((message: string, type: ToastType) => setToast({ message, type }), [])

  const updateMut = useMutation({
    mutationFn: (data: Partial<TenantSettings>) => updateSettings(tenantId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      showToast(t.msg?.updatedSuccess ?? 'تم الحفظ بنجاح', 'success')
    },
    onError: (err: any) => showToast(err?.response?.data?.message ?? t.msg?.updateError ?? 'فشل التحديث', 'error'),
  })

  useEffect(() => {
    if (!settings) return
    const next: Record<string, string | number | boolean> = {}
    const allKeys = [...ACCOUNTING_KEYS, ...ITEM_OPTIONS_KEYS, ...POS_KEYS, ...GENERAL_KEYS]
    allKeys.forEach((key) => {
      const val = settings[key]
      if (val === undefined || val === null) {
        if (key === 'fiscal_year_start_month') next[key] = 1
        else if (key === 'invoice_use_serial_numbers') next[key] = false
        else if (key === 'invoice_expiry_dates_enabled') next[key] = true
        else if (key === 'pos_print_mode') next[key] = 'thermal_80'
        else if (key === 'pos_rounding') next[key] = 'none'
        else if (key === 'theme') next[key] = 'system'
        else if (key === 'backup_retention_days') next[key] = 30
        else if (typeof val === 'boolean') next[key] = false
        else next[key] = ''
      } else {
        next[key] = val as string | number | boolean
      }
    })
    setForm(next)
  }, [settings])

  const handleChange = (key: string, value: string | number | boolean) => {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const handleSubmit = (e: React.FormEvent, keys: readonly string[]) => {
    e.preventDefault()
    if (!tenantId) {
      showToast('يجب اختيار الشركة أولاً', 'error')
      return
    }
    const payload: Partial<TenantSettings> = {}
    keys.forEach((key) => {
      const v = form[key]
      if (v !== undefined) payload[key] = v as string | number | boolean
    })
    updateMut.mutate(payload)
  }

  const textAlign = isRtl ? 'text-right' : 'text-left'
  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: 'accounting', label: 'إعدادات النظام المحاسبي', icon: Landmark },
    { id: 'items_options', label: 'خيارات الأصناف', icon: Package },
    { id: 'pos', label: 'إعدادات نقطة البيع', icon: ShoppingCart },
    { id: 'general', label: 'الإعدادات العامة', icon: Building2 },
  ]

  return (
    <div className="p-6 space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
          <SettingsIcon size={20} className="text-primary-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">الإعدادات</h1>
          <p className="text-sm text-slate-500">إعدادات المحاسبة، نقطة البيع، والملف العام للشركة</p>
        </div>
      </div>

      {!tenantId && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          يرجى اختيار الشركة من أعلى الصفحة قبل تعديل الإعدادات.
        </div>
      )}

      <div className="flex gap-2 border-b border-slate-200 overflow-x-auto">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              activeTab === id
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {activeTab === 'accounting' && (
            <form onSubmit={(e) => handleSubmit(e, ACCOUNTING_KEYS as unknown as string[])} className="p-6 space-y-4">
              <h2 className="text-lg font-semibold text-slate-800 border-b border-slate-100 pb-2">السنة المالية والحسابات الافتراضية</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={`block text-sm font-medium text-slate-700 mb-1 ${textAlign}`}>بداية السنة المالية (الشهر)</label>
                  <select
                    value={Number(form.fiscal_year_start_month) || 1}
                    onChange={(e) => handleChange('fiscal_year_start_month', Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                  >
                    {FISCAL_MONTHS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={`block text-sm font-medium text-slate-700 mb-1 ${textAlign}`}>العملة الافتراضية</label>
                  <select
                    value={
                      form.default_currency_id != null && typeof form.default_currency_id !== 'boolean'
                        ? String(form.default_currency_id)
                        : ''
                    }
                    onChange={(e) => handleChange('default_currency_id', e.target.value ? Number(e.target.value) : '')}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                  >
                    <option value="">—</option>
                    {currencies.map((c) => (
                      <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={`block text-sm font-medium text-slate-700 mb-1 ${textAlign}`}>حساب الأرباح المبقاة</label>
                  <select
                    value={
                      form.retained_earnings_account_id != null && typeof form.retained_earnings_account_id !== 'boolean'
                        ? String(form.retained_earnings_account_id)
                        : ''
                    }
                    onChange={(e) => handleChange('retained_earnings_account_id', e.target.value ? Number(e.target.value) : '')}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                  >
                    <option value="">—</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={`block text-sm font-medium text-slate-700 mb-1 ${textAlign}`}>حساب فروق العملة</label>
                  <select
                    value={
                      form.currency_diff_account_id != null && typeof form.currency_diff_account_id !== 'boolean'
                        ? String(form.currency_diff_account_id)
                        : ''
                    }
                    onChange={(e) => handleChange('currency_diff_account_id', e.target.value ? Number(e.target.value) : '')}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                  >
                    <option value="">—</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={`block text-sm font-medium text-slate-700 mb-1 ${textAlign}`}>حساب الضرائب (افتراضي)</label>
                  <select
                    value={
                      form.tax_account_id != null && typeof form.tax_account_id !== 'boolean'
                        ? String(form.tax_account_id)
                        : ''
                    }
                    onChange={(e) => handleChange('tax_account_id', e.target.value ? Number(e.target.value) : '')}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                  >
                    <option value="">—</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!form.auto_journal_entries_enabled}
                    onChange={(e) => handleChange('auto_journal_entries_enabled', e.target.checked)}
                    className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-slate-700">تفعيل القيود التلقائية</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!form.post_immediately}
                    onChange={(e) => handleChange('post_immediately', e.target.checked)}
                    className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-slate-700">الترحيل الفوري</span>
                </label>
              </div>
              <div className="pt-4 border-t border-slate-200 flex justify-end">
                <button type="submit" disabled={updateMut.isPending} className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50">
                  <Save size={18} /> حفظ
                </button>
              </div>
            </form>
          )}

          {activeTab === 'items_options' && (
            <form onSubmit={(e) => handleSubmit(e, ITEM_OPTIONS_KEYS as unknown as string[])} className="p-6 space-y-4">
              <h2 className="text-lg font-semibold text-slate-800 border-b border-slate-100 pb-2">استخدام الأرقام التسلسلية في الفواتير</h2>
              <p className="text-sm text-slate-600">
                عند تفعيل هذا الخيار، تظهر خانة إدخال الأرقام التسلسلية على مستوى كل سطر في الفواتير. إذا كان الصنف مفعّلاً له «يستخدم رقم تسلسلي» في بطاقة الصنف، يجب إدخال عدد من الأرقام مساوٍ للكمية ولا يمكن إضافة السطر دون إكمالها.
              </p>
              <div className="flex flex-wrap gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!form.invoice_use_serial_numbers}
                    onChange={(e) => handleChange('invoice_use_serial_numbers', e.target.checked)}
                    className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-slate-700">استخدام السيرال نمبر في الفواتير (إظهار خانة الأرقام التسلسلية على مستوى السطر)</span>
                </label>
              </div>
              <h2 className="text-lg font-semibold text-slate-800 border-b border-slate-100 pb-2 pt-4">تفعيل تاريخ الصلاحية في الفواتير</h2>
              <p className="text-sm text-slate-600">
                عند التعطيل لا تُعرض خانات الصلاحية والباتش في فواتير المبيعات والمشتريات، ولا تُحفظ مع الفاتورة.
              </p>
              <div className="flex flex-wrap gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.invoice_expiry_dates_enabled !== false && form.invoice_expiry_dates_enabled !== '0'}
                    onChange={(e) => handleChange('invoice_expiry_dates_enabled', e.target.checked)}
                    className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-slate-700">تفعيل تاريخ الصلاحية في الفواتير</span>
                </label>
              </div>
              <div className="pt-4 border-t border-slate-200 flex justify-end">
                <button type="submit" disabled={updateMut.isPending} className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50">
                  <Save size={18} /> حفظ
                </button>
              </div>
            </form>
          )}

          {activeTab === 'pos' && (
            <form onSubmit={(e) => handleSubmit(e, POS_KEYS as unknown as string[])} className="p-6 space-y-4">
              <h2 className="text-lg font-semibold text-slate-800 border-b border-slate-100 pb-2">الفاتورة والطباعة والضرائب</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={`block text-sm font-medium text-slate-700 mb-1 ${textAlign}`}>رابط الشعار (للفاتورة)</label>
                  <input
                    type="text"
                    value={String(form.pos_invoice_logo ?? '')}
                    onChange={(e) => handleChange('pos_invoice_logo', e.target.value)}
                    placeholder="https://..."
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={`block text-sm font-medium text-slate-700 mb-1 ${textAlign}`}>ترويسة الفاتورة</label>
                  <textarea
                    value={String(form.pos_invoice_header ?? '')}
                    onChange={(e) => handleChange('pos_invoice_header', e.target.value)}
                    rows={2}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={`block text-sm font-medium text-slate-700 mb-1 ${textAlign}`}>الرسالة الختامية (تذييل الفاتورة)</label>
                  <textarea
                    value={String(form.pos_invoice_footer ?? '')}
                    onChange={(e) => handleChange('pos_invoice_footer', e.target.value)}
                    rows={2}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium text-slate-700 mb-1 ${textAlign}`}>وضع الطباعة</label>
                  <select
                    value={String(form.pos_print_mode ?? 'thermal_80')}
                    onChange={(e) => handleChange('pos_print_mode', e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                  >
                    <option value="thermal_80">حرارية 80mm</option>
                    <option value="a4">A4</option>
                  </select>
                </div>
                <div>
                  <label className={`block text-sm font-medium text-slate-700 mb-1 ${textAlign}`}>نظام التقريب</label>
                  <select
                    value={String(form.pos_rounding ?? 'none')}
                    onChange={(e) => handleChange('pos_rounding', e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                  >
                    <option value="none">بدون تقريب</option>
                    <option value="nearest">الأقرب</option>
                    <option value="floor">تقريب لأسفل</option>
                    <option value="ceil">تقريب لأعلى</option>
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!form.pos_default_printer_enabled}
                    onChange={(e) => handleChange('pos_default_printer_enabled', e.target.checked)}
                    className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-slate-700">تفعيل الطابعة الافتراضية</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!form.pos_tax_inclusive}
                    onChange={(e) => handleChange('pos_tax_inclusive', e.target.checked)}
                    className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-slate-700">الأسعار شاملة الضريبة</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!form.allow_negative_sale}
                    onChange={(e) => handleChange('allow_negative_sale', e.target.checked)}
                    className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-slate-700">السماح بالبيع بالسالب (صنف غير موجود بالمخزن)</span>
                </label>
              </div>
              <div className="pt-4 border-t border-slate-200 flex justify-end">
                <button type="submit" disabled={updateMut.isPending} className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50">
                  <Save size={18} /> حفظ
                </button>
              </div>
            </form>
          )}

          {activeTab === 'general' && (
            <form onSubmit={(e) => handleSubmit(e, GENERAL_KEYS as unknown as string[])} className="p-6 space-y-4">
              <h2 className="text-lg font-semibold text-slate-800 border-b border-slate-100 pb-2">الملف الشخصي للشركة والإشعارات والمظهر</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={`block text-sm font-medium text-slate-700 mb-1 ${textAlign}`}>اسم الشركة</label>
                  <input
                    type="text"
                    value={String(form.company_name ?? '')}
                    onChange={(e) => handleChange('company_name', e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium text-slate-700 mb-1 ${textAlign}`}>السجل التجاري</label>
                  <input
                    type="text"
                    value={String(form.commercial_registration ?? '')}
                    onChange={(e) => handleChange('commercial_registration', e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium text-slate-700 mb-1 ${textAlign}`}>الرقم الضريبي</label>
                  <input
                    type="text"
                    value={String(form.tax_number ?? '')}
                    onChange={(e) => handleChange('tax_number', e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium text-slate-700 mb-1 ${textAlign}`}>المظهر</label>
                  <select
                    value={String(form.theme ?? 'system')}
                    onChange={(e) => handleChange('theme', e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                  >
                    <option value="light">فاتح</option>
                    <option value="dark">داكن</option>
                    <option value="system">حسب النظام</option>
                  </select>
                </div>
                <div>
                  <label className={`block text-sm font-medium text-slate-700 mb-1 ${textAlign}`}>الاحتفاظ بنسخ احتياطية (يوم)</label>
                  <input
                    type="number"
                    min={1}
                    value={Number(form.backup_retention_days ?? 30)}
                    onChange={(e) => handleChange('backup_retention_days', Number(e.target.value) || 30)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!form.notification_email_enabled}
                    onChange={(e) => handleChange('notification_email_enabled', e.target.checked)}
                    className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-slate-700">تفعيل إشعارات البريد الإلكتروني</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!form.notification_sms_enabled}
                    onChange={(e) => handleChange('notification_sms_enabled', e.target.checked)}
                    className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-slate-700">تفعيل إشعارات SMS</span>
                </label>
              </div>
              <p className="text-sm text-slate-500">
                إدارة النسخ الاحتياطي وسجلات الدخول متوفرة من قسم المستخدمين وسجل التدقيق.
              </p>
              <div className="pt-4 border-t border-slate-200 flex justify-end">
                <button type="submit" disabled={updateMut.isPending} className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50">
                  <Save size={18} /> حفظ
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
