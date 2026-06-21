import { useState, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchSettings,
  updateSettings,
  fetchCustomers,
  fetchBranches,
  fetchWarehouses,
} from '../../api/tenant'
import { defaultRestaurantPosDisplayForm } from '../restaurant/restaurantPosSettings'
import { cacheSettings } from '../../utils/settingsStorage'
import type { TenantSettings } from '../../types'
import { Utensils, Save, Settings2, Layers, Package } from 'lucide-react'
import Toast, { type ToastType } from '../../components/ui/Toast'
import SearchableSelect, { type SearchableSelectOption } from '../../components/ui/SearchableSelect'

type RestaurantPosTab = 'general' | 'defaults' | 'display'

const GENERAL_KEYS = [
  'rpos_require_open_shift',
  'rpos_allow_negative_sale',
  'rpos_auto_print_on_checkout',
  'rpos_kitchen_notes_enabled',
  'rpos_split_payment_enabled',
  'rpos_show_kitchen_link',
  'rpos_default_order_type',
] as const

const DEFAULT_KEYS = [
  'rpos_default_branch_id',
  'rpos_default_warehouse_id',
  'rpos_default_customer_id',
] as const

const USE_DEFAULT_KEYS = [
  'rpos_use_default_branch',
  'rpos_use_default_warehouse',
  'rpos_use_default_customer',
] as const

const DISPLAY_KEYS = [
  'rpos_item_icon_width',
  'rpos_item_icon_height',
  'rpos_category_icon_width',
  'rpos_category_icon_height',
] as const

const DISPLAY_DEFAULTS = defaultRestaurantPosDisplayForm()

const ORDER_TYPE_OPTIONS: { value: string; labelAr: string; labelEn: string }[] = [
  { value: 'dine_in', labelAr: 'محلي (طاولات)', labelEn: 'Dine-in' },
  { value: 'takeaway', labelAr: 'سفري', labelEn: 'Takeaway' },
  { value: 'delivery', labelAr: 'توصيل', labelEn: 'Delivery' },
]

const YES_NO_OPTIONS = [
  { value: '1', labelAr: 'نعم', labelEn: 'Yes' },
  { value: '0', labelAr: 'لا', labelEn: 'No' },
] as const

const GENERAL_BOOL_SETTINGS: { key: (typeof GENERAL_KEYS)[number]; labelAr: string; labelEn: string }[] = [
  { key: 'rpos_require_open_shift', labelAr: 'إلزام فتح وردية قبل البيع', labelEn: 'Require open shift before sales' },
  { key: 'rpos_allow_negative_sale', labelAr: 'السماح بالبيع بالسالب', labelEn: 'Allow negative stock sales' },
  { key: 'rpos_auto_print_on_checkout', labelAr: 'طباعة الفاتورة تلقائياً بعد التحصيل', labelEn: 'Auto-print invoice after checkout' },
  { key: 'rpos_kitchen_notes_enabled', labelAr: 'تفعيل ملاحظات المطبخ على الأصناف', labelEn: 'Enable kitchen notes on items' },
  { key: 'rpos_split_payment_enabled', labelAr: 'السماح بتقسيم الدفع على أكثر من طريقة', labelEn: 'Allow split payment methods' },
  { key: 'rpos_show_kitchen_link', labelAr: 'إظهار زر الدخول إلى شاشة المطبخ', labelEn: 'Show kitchen display button' },
]

const TABS: { id: RestaurantPosTab; labelAr: string; labelEn: string; icon: React.ElementType }[] = [
  { id: 'general', labelAr: 'عام', labelEn: 'General', icon: Settings2 },
  { id: 'defaults', labelAr: 'الافتراضيات', labelEn: 'Defaults', icon: Layers },
  { id: 'display', labelAr: 'العرض', labelEn: 'Display', icon: Package },
]

export default function SettingsRestaurantPOS() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<RestaurantPosTab>('general')
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [form, setForm] = useState<Record<string, string | number | boolean>>({})

  const { data: settings, isLoading } = useQuery<TenantSettings>({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })

  const showToast = useCallback((message: string, type: ToastType) => setToast({ message, type }), [])

  const updateMut = useMutation({
    mutationFn: (data: Partial<TenantSettings>) => updateSettings(tenantId, data),
    onSuccess: (data) => {
      queryClient.setQueryData(['settings', tenantId], data)
      cacheSettings(tenantId, data)
      queryClient.invalidateQueries({ queryKey: ['settings', tenantId] })
      showToast(t.msg?.updatedSuccess ?? 'تم الحفظ بنجاح', 'success')
    },
    onError: (err: unknown) => {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined
      showToast(msg ?? t.msg?.updateError ?? 'فشل التحديث', 'error')
    },
  })

  useEffect(() => {
    if (!settings) return
    const next: Record<string, string | number | boolean> = {}

    GENERAL_KEYS.forEach((key) => {
      const val = settings[key]
      if (key === 'rpos_default_order_type') {
        next[key] = val != null && val !== '' ? String(val) : 'dine_in'
        return
      }
      if (val === undefined || val === null) {
        if (key === 'rpos_require_open_shift' || key === 'rpos_kitchen_notes_enabled' || key === 'rpos_split_payment_enabled' || key === 'rpos_auto_print_on_checkout') {
          next[key] = true
        } else {
          next[key] = false
        }
      } else {
        next[key] = val as string | number | boolean
      }
    })

    DEFAULT_KEYS.forEach((key) => {
      const val = settings[key]
      next[key] = val !== undefined && val !== null ? (typeof val === 'number' ? val : Number(val)) : ''
    })

    USE_DEFAULT_KEYS.forEach((key) => {
      next[key] = settings[key] === true || settings[key] === '1'
    })

    DISPLAY_KEYS.forEach((key) => {
      const val = settings[key]
      const fallback =
        key === 'rpos_item_icon_width'
          ? DISPLAY_DEFAULTS.itemCardWidth
          : key === 'rpos_item_icon_height'
            ? DISPLAY_DEFAULTS.itemImageHeight
            : key === 'rpos_category_icon_width'
              ? DISPLAY_DEFAULTS.categoryButtonWidth
              : DISPLAY_DEFAULTS.categoryIconHeight
      next[key] = val !== undefined && val !== null && val !== '' ? Number(val) : fallback
    })

    setForm(next)
  }, [settings])

  const { data: customersData } = useQuery({
    queryKey: ['customers', tenantId, 'rpos-defaults'],
    queryFn: () => fetchCustomers(tenantId, { per_page: '500' }),
    enabled: !!tenantId && activeTab === 'defaults',
  })
  const { data: branchesData = [] } = useQuery({
    queryKey: ['branches', tenantId, 'rpos-defaults'],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId && activeTab === 'defaults',
    staleTime: 60_000,
  })
  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses', tenantId, 'rpos-defaults'],
    queryFn: () => fetchWarehouses(tenantId, { per_page: '500' }),
    enabled: !!tenantId && activeTab === 'defaults',
    staleTime: 60_000,
  })

  const customers = customersData?.data ?? []
  const customerOptions: SearchableSelectOption[] = customers.map((c) => ({ value: c.id, label: c.name }))
  const branchOptions: SearchableSelectOption[] = (branchesData ?? []).map((b) => ({ value: b.id, label: b.name }))
  const warehousesList: { id: number; name: string }[] = Array.isArray(warehousesData)
    ? warehousesData
    : ((warehousesData as { data?: { id: number; name: string }[] } | undefined)?.data ?? [])
  const warehouseOptions: SearchableSelectOption[] = warehousesList.map((w) => ({ value: w.id, label: w.name }))

  const handleChange = (key: string, value: string | number | boolean) => {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const handleDefaultChange = (key: string, value: number | string | null) => {
    if (value === null || value === '') {
      setForm((f) => ({ ...f, [key]: '' }))
      return
    }
    const n = typeof value === 'number' ? value : Number(value)
    setForm((f) => ({ ...f, [key]: Number.isFinite(n) ? n : '' }))
  }

  const handleDisplayNumberChange = (key: string, value: string) => {
    if (value === '') {
      setForm((f) => ({ ...f, [key]: '' }))
      return
    }
    const n = Number(value)
    setForm((f) => ({ ...f, [key]: Number.isFinite(n) ? n : '' }))
  }

  const submitKeys = (keys: readonly string[]) => {
    if (!tenantId) {
      showToast(lang === 'ar' ? 'يجب اختيار الشركة أولاً' : 'Select a company first', 'error')
      return
    }
    const payload: Partial<TenantSettings> = {}
    keys.forEach((key) => {
      const v = form[key]
      if (DEFAULT_KEYS.includes(key as (typeof DEFAULT_KEYS)[number])) {
        payload[key] = v === '' || v === undefined ? (null as unknown as number) : Number(v)
      } else if (DISPLAY_KEYS.includes(key as (typeof DISPLAY_KEYS)[number])) {
        payload[key] = Number(v)
      } else if (USE_DEFAULT_KEYS.includes(key as (typeof USE_DEFAULT_KEYS)[number])) {
        payload[key] = !!v
      } else {
        payload[key] = v as string | number | boolean
      }
    })
    updateMut.mutate(payload)
  }

  const textAlign = isRtl ? 'text-right' : 'text-left'
  const selectTextAlign = isRtl ? 'right' : 'left'
  const pageTitle = t.nav?.settingsRestaurantPOS ?? (lang === 'ar' ? 'إعدادات نقطة بيع المطعم' : 'Restaurant POS Settings')

  return (
    <div className="p-6 space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
          <Utensils size={20} className="text-primary-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{pageTitle}</h1>
          <p className="text-sm text-slate-500">
            {lang === 'ar'
              ? 'سلوك نقطة بيع المطعم، الافتراضيات، وطريقة عرض الأصناف'
              : 'Restaurant POS behavior, defaults, and item display'}
          </p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-200 overflow-x-auto">
        {TABS.map(({ id, labelAr, labelEn, icon: Icon }) => (
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
            {lang === 'ar' ? labelAr : labelEn}
          </button>
        ))}
      </div>

      {!tenantId && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          {lang === 'ar' ? 'يرجى اختيار الشركة من أعلى الصفحة قبل تعديل الإعدادات.' : 'Select a company before editing settings.'}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
        </div>
      ) : activeTab === 'defaults' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submitKeys([...DEFAULT_KEYS, ...USE_DEFAULT_KEYS])
          }}
          className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden"
        >
          <div className="p-6 space-y-4">
            <h2 className="text-lg font-semibold text-slate-800 border-b border-slate-100 pb-2">
              {lang === 'ar' ? 'القيم الافتراضية عند فتح نقطة بيع المطعم' : 'Defaults when opening Restaurant POS'}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <SearchableSelect
                  label={lang === 'ar' ? 'الفرع الافتراضي' : 'Default branch'}
                  options={branchOptions}
                  value={
                    form.rpos_default_branch_id === '' || form.rpos_default_branch_id == null
                      ? null
                      : Number(form.rpos_default_branch_id)
                  }
                  onChange={(v) => handleDefaultChange('rpos_default_branch_id', v)}
                  placeholder={lang === 'ar' ? 'اختر الفرع' : 'Select branch'}
                  textAlign={selectTextAlign}
                  labelLayout="inline"
                />
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!form.rpos_use_default_branch}
                    onChange={(e) => handleChange('rpos_use_default_branch', e.target.checked)}
                    className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-slate-700">
                    {lang === 'ar' ? 'تطبيق تلقائياً عند فتح الشاشة' : 'Apply automatically on open'}
                  </span>
                </label>
              </div>
              <div className="space-y-2">
                <SearchableSelect
                  label={lang === 'ar' ? 'المخزن الافتراضي' : 'Default warehouse'}
                  options={warehouseOptions}
                  value={
                    form.rpos_default_warehouse_id === '' || form.rpos_default_warehouse_id == null
                      ? null
                      : Number(form.rpos_default_warehouse_id)
                  }
                  onChange={(v) => handleDefaultChange('rpos_default_warehouse_id', v)}
                  placeholder={lang === 'ar' ? 'اختر المخزن' : 'Select warehouse'}
                  textAlign={selectTextAlign}
                  labelLayout="inline"
                />
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!form.rpos_use_default_warehouse}
                    onChange={(e) => handleChange('rpos_use_default_warehouse', e.target.checked)}
                    className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-slate-700">
                    {lang === 'ar' ? 'تطبيق تلقائياً عند فتح الشاشة' : 'Apply automatically on open'}
                  </span>
                </label>
              </div>
              <div className="space-y-2">
                <SearchableSelect
                  label={lang === 'ar' ? 'العميل الافتراضي' : 'Default customer'}
                  options={customerOptions}
                  value={
                    form.rpos_default_customer_id === '' || form.rpos_default_customer_id == null
                      ? null
                      : Number(form.rpos_default_customer_id)
                  }
                  onChange={(v) => handleDefaultChange('rpos_default_customer_id', v)}
                  placeholder={lang === 'ar' ? 'اختر العميل' : 'Select customer'}
                  textAlign={selectTextAlign}
                  labelLayout="inline"
                />
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!form.rpos_use_default_customer}
                    onChange={(e) => handleChange('rpos_use_default_customer', e.target.checked)}
                    className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-slate-700">
                    {lang === 'ar' ? 'تطبيق تلقائياً عند فتح الشاشة' : 'Apply automatically on open'}
                  </span>
                </label>
              </div>
            </div>
          </div>
          <div className="p-4 border-t border-slate-200 flex justify-end">
            <button
              type="submit"
              disabled={updateMut.isPending}
              className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50"
            >
              <Save size={18} /> {t.save ?? 'حفظ'}
            </button>
          </div>
        </form>
      ) : activeTab === 'display' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submitKeys(DISPLAY_KEYS)
          }}
          className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden"
        >
          <div className="p-6 space-y-4">
            <h2 className="text-lg font-semibold text-slate-800 border-b border-slate-100 pb-2">
              {lang === 'ar' ? 'عرض الأصناف والفئات' : 'Items and categories display'}
            </h2>
            <div className="grid gap-6 sm:grid-cols-2 max-w-2xl">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-700">
                  {lang === 'ar' ? 'أيقونات الأصناف' : 'Item icons'}
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`block text-sm font-medium text-slate-700 mb-1 ${textAlign}`}>
                      {lang === 'ar' ? 'العرض (بكسل)' : 'Width (px)'}
                    </label>
                    <input
                      type="number"
                      min={60}
                      max={280}
                      value={Number(form.rpos_item_icon_width ?? DISPLAY_DEFAULTS.itemCardWidth)}
                      onChange={(e) => handleDisplayNumberChange('rpos_item_icon_width', e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium text-slate-700 mb-1 ${textAlign}`}>
                      {lang === 'ar' ? 'الطول (بكسل)' : 'Height (px)'}
                    </label>
                    <input
                      type="number"
                      min={32}
                      max={200}
                      value={Number(form.rpos_item_icon_height ?? DISPLAY_DEFAULTS.itemImageHeight)}
                      onChange={(e) => handleDisplayNumberChange('rpos_item_icon_height', e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-700">
                  {lang === 'ar' ? 'أيقونات التصنيفات' : 'Category icons'}
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`block text-sm font-medium text-slate-700 mb-1 ${textAlign}`}>
                      {lang === 'ar' ? 'العرض (بكسل)' : 'Width (px)'}
                    </label>
                    <input
                      type="number"
                      min={48}
                      max={240}
                      value={Number(form.rpos_category_icon_width ?? DISPLAY_DEFAULTS.categoryButtonWidth)}
                      onChange={(e) => handleDisplayNumberChange('rpos_category_icon_width', e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium text-slate-700 mb-1 ${textAlign}`}>
                      {lang === 'ar' ? 'الطول (بكسل)' : 'Height (px)'}
                    </label>
                    <input
                      type="number"
                      min={32}
                      max={200}
                      value={Number(form.rpos_category_icon_height ?? DISPLAY_DEFAULTS.categoryIconHeight)}
                      onChange={(e) => handleDisplayNumberChange('rpos_category_icon_height', e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
            <p className="text-xs text-slate-500 max-w-2xl">
              {lang === 'ar'
                ? 'أدخل القيم بالبكسل: كلما زاد الرقم كبرت الأيقونة، وكلما قلّ الرقم صغّرتها.'
                : 'Enter values in pixels: higher numbers enlarge icons, lower numbers shrink them.'}
            </p>
          </div>
          <div className="p-4 border-t border-slate-200 flex justify-end">
            <button
              type="submit"
              disabled={updateMut.isPending}
              className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50"
            >
              <Save size={18} /> {t.save ?? 'حفظ'}
            </button>
          </div>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submitKeys(GENERAL_KEYS)
          }}
          className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden"
        >
          <div className="p-6 space-y-4">
            <h2 className="text-lg font-semibold text-slate-800 border-b border-slate-100 pb-2">
              {lang === 'ar' ? 'خيارات نقطة بيع المطعم' : 'Restaurant POS options'}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-x-3 gap-y-4">
              <div className="min-w-0">
                <label className={`block text-xs font-medium text-slate-700 mb-1 leading-snug ${textAlign}`}>
                  {lang === 'ar' ? 'نوع الطلب الافتراضي' : 'Default order type'}
                </label>
                <select
                  value={String(form.rpos_default_order_type ?? 'dine_in')}
                  onChange={(e) => handleChange('rpos_default_order_type', e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                >
                  {ORDER_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {lang === 'ar' ? opt.labelAr : opt.labelEn}
                    </option>
                  ))}
                </select>
              </div>
              {GENERAL_BOOL_SETTINGS.map(({ key, labelAr, labelEn }) => (
                <div key={key} className="min-w-0">
                  <label className={`block text-xs font-medium text-slate-700 mb-1 leading-snug ${textAlign}`}>
                    {lang === 'ar' ? labelAr : labelEn}
                  </label>
                  <select
                    value={form[key] ? '1' : '0'}
                    onChange={(e) => handleChange(key, e.target.value === '1')}
                    className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                  >
                    {YES_NO_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {lang === 'ar' ? opt.labelAr : opt.labelEn}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
          <div className="p-4 border-t border-slate-200 flex justify-end">
            <button
              type="submit"
              disabled={updateMut.isPending}
              className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50"
            >
              <Save size={18} /> {t.save ?? 'حفظ'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
