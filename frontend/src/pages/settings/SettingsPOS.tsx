import { useState, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchSettings, updateSettings, fetchCustomers, fetchTenantUsers, fetchItemCategories, fetchBranches, fetchWarehouses } from '../../api/tenant'
import type { TenantSettings } from '../../types'
import { ShoppingCart, Save, Settings2, Layers, Package } from 'lucide-react'
import Toast, { type ToastType } from '../../components/ui/Toast'
import SearchableSelect, { type SearchableSelectOption } from '../../components/ui/SearchableSelect'

type PosTab = 'general' | 'defaultItems' | 'items'

const KEYS = [
  'pos_show_sales_operation_type',
  'pos_allow_credit_sales',
  'pos_allow_select_sales_rep',
  'pos_allow_select_invoice_status',
  'pos_invoice_logo',
  'pos_invoice_header',
  'pos_invoice_footer',
  'pos_print_mode',
  'pos_default_printer_enabled',
  'pos_tax_inclusive',
  'pos_rounding',
  'allow_negative_sale',
] as const

const DEFAULT_ITEMS_KEYS = [
  'pos_default_customer_id',
  'pos_default_cashier_id',
  'pos_default_category_id',
  'pos_default_branch_id',
  'pos_default_warehouse_id',
] as const
const USE_IN_POS_KEYS = [
  'pos_use_default_customer',
  'pos_use_default_cashier',
  'pos_use_default_category',
  'pos_use_default_branch',
  'pos_use_default_warehouse',
] as const
const ITEMS_TAB_KEYS = ['pos_item_icon_size'] as const
const ITEM_ICON_SIZE_OPTIONS: { value: string; labelAr: string; labelEn: string }[] = [
  { value: 'small', labelAr: 'أصغر', labelEn: 'Small' },
  { value: 'medium', labelAr: 'متوسط', labelEn: 'Medium' },
  { value: 'large', labelAr: 'أكبر', labelEn: 'Large' },
]

const TABS: { id: PosTab; label: string; icon: React.ElementType }[] = [
  { id: 'general', label: 'عام', icon: Settings2 },
  { id: 'defaultItems', label: 'العناصر الافتراضية', icon: Layers },
  { id: 'items', label: 'الأصناف', icon: Package },
]

export default function SettingsPOS() {
  const { currentTenant } = useAuth()
  const { t, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<PosTab>('general')
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      showToast(t.msg?.updatedSuccess ?? 'تم الحفظ بنجاح', 'success')
    },
    onError: (err: any) => showToast(err?.response?.data?.message ?? t.msg?.updateError ?? 'فشل التحديث', 'error'),
  })

  useEffect(() => {
    if (!settings) return
    const next: Record<string, string | number | boolean> = {}
    KEYS.forEach((key) => {
      const val = settings[key]
      if (val === undefined || val === null) {
        if (key === 'pos_print_mode') next[key] = 'thermal_80'
        else if (key === 'pos_rounding') next[key] = 'none'
        else if (key === 'pos_show_sales_operation_type' || key === 'pos_allow_credit_sales' || key === 'pos_allow_select_invoice_status') next[key] = true
        else if (key === 'pos_allow_select_sales_rep') next[key] = false
        else if (typeof val === 'boolean') next[key] = false
        else next[key] = ''
      } else {
        next[key] = val as string | number | boolean
      }
    })
    DEFAULT_ITEMS_KEYS.forEach((key) => {
      const val = settings[key]
      next[key] = val !== undefined && val !== null ? (typeof val === 'number' ? val : Number(val)) : ''
    })
    USE_IN_POS_KEYS.forEach((key) => {
      const val = settings[key]
      next[key] = val === true || val === '1'
    })
    ITEMS_TAB_KEYS.forEach((key) => {
      const val = settings[key]
      next[key] = val !== undefined && val !== null ? String(val) : 'medium'
    })
    setForm(next)
  }, [settings])

  const { data: customersData } = useQuery({
    queryKey: ['customers', tenantId, 'pos-defaults'],
    queryFn: () => fetchCustomers(tenantId, { per_page: '500' }),
    enabled: !!tenantId && activeTab === 'defaultItems',
  })
  const { data: tenantUsersData } = useQuery({
    queryKey: ['tenant-users', tenantId],
    queryFn: () => fetchTenantUsers(tenantId),
    enabled: !!tenantId && activeTab === 'defaultItems',
  })
  const { data: categories = [] } = useQuery({
    queryKey: ['item-categories', tenantId],
    queryFn: () => fetchItemCategories(tenantId),
    enabled: !!tenantId && activeTab === 'defaultItems',
  })
  const { data: branchesData = [] } = useQuery({
    queryKey: ['branches', tenantId, 'pos-defaults'],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId && activeTab === 'defaultItems',
    staleTime: 60_000,
  })
  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses', tenantId, 'pos-defaults'],
    queryFn: () => fetchWarehouses(tenantId, { per_page: '500' }),
    enabled: !!tenantId && activeTab === 'defaultItems',
    staleTime: 60_000,
  })
  const customers = customersData?.data ?? []
  const tenantUsers = tenantUsersData?.data ?? []
  const customerOptions: SearchableSelectOption[] = customers.map((c) => ({ value: c.id, label: c.name }))
  const cashierOptions: SearchableSelectOption[] = tenantUsers.map((u) => ({ value: u.id, label: u.name }))
  const categoryOptions: SearchableSelectOption[] = categories.map((c) => ({ value: c.id, label: c.name }))
  const branchOptions: SearchableSelectOption[] = (branchesData ?? []).map((b: any) => ({ value: b.id, label: b.name }))
  const warehouses = (warehousesData as any)?.data ?? warehousesData ?? []
  const warehouseOptions: SearchableSelectOption[] = (warehouses ?? []).map((w: any) => ({ value: w.id, label: w.name }))

  const handleChange = (key: string, value: string | number | boolean) => {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!tenantId) {
      showToast('يجب اختيار الشركة أولاً', 'error')
      return
    }
    const payload: Partial<TenantSettings> = {}
    KEYS.forEach((key) => {
      const v = form[key]
      if (v !== undefined) payload[key] = v as string | number | boolean
    })
    updateMut.mutate(payload)
  }

  const handleDefaultItemsChange = (key: string, value: number | string | null) => {
    if (value === null || value === '') {
      setForm((f) => ({ ...f, [key]: '' }))
      return
    }
    const n = typeof value === 'number' ? value : Number(value)
    setForm((f) => ({ ...f, [key]: Number.isFinite(n) ? n : '' }))
  }

  const handleDefaultItemsSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!tenantId) {
      showToast('يجب اختيار الشركة أولاً', 'error')
      return
    }
    const payload: Partial<TenantSettings> = {}
    DEFAULT_ITEMS_KEYS.forEach((key) => {
      const v = form[key]
      payload[key] = v === '' || v === undefined ? (null as unknown as number) : Number(v)
    })
    USE_IN_POS_KEYS.forEach((key) => {
      payload[key] = !!form[key]
    })
    updateMut.mutate(payload)
  }

  const textAlign = isRtl ? 'text-right' : 'text-left'
  const selectTextAlign = isRtl ? 'right' : 'left'

  return (
    <div className="p-6 space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
          <ShoppingCart size={20} className="text-primary-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">إعدادات نقطة البيع</h1>
        </div>
      </div>
      <div className="flex gap-2 border-b border-slate-200">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === id ? 'border-primary-600 text-primary-600' : 'border-transparent text-slate-600 hover:text-slate-900'}`}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </div>

      {!tenantId && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          يرجى اختيار الشركة من أعلى الصفحة قبل تعديل الإعدادات.
        </div>
      )}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
        </div>
      ) : activeTab === 'defaultItems' ? (
        <form onSubmit={handleDefaultItemsSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 space-y-4">
            <h2 className="text-lg font-semibold text-slate-800 border-b border-slate-100 pb-2">العناصر الافتراضية</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <SearchableSelect
                  label="العميل الافتراضي"
                  required
                  options={customerOptions}
                  value={form.pos_default_customer_id === '' || form.pos_default_customer_id == null ? null : Number(form.pos_default_customer_id)}
                  onChange={(v) => handleDefaultItemsChange('pos_default_customer_id', v)}
                  placeholder="اختر العميل"
                  textAlign={selectTextAlign}
                  labelLayout="inline"
                />
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!form.pos_use_default_customer} onChange={(e) => handleChange('pos_use_default_customer', e.target.checked)} className="rounded border-slate-300 text-primary-600 focus:ring-primary-500" />
                  <span className="text-sm text-slate-700">تطبيق في نقطة البيع والتقارير</span>
                </label>
              </div>
              <div className="space-y-2">
                <SearchableSelect
                  label="الكاشير الافتراضي"
                  required
                  options={cashierOptions}
                  value={form.pos_default_cashier_id === '' || form.pos_default_cashier_id === undefined ? null : Number(form.pos_default_cashier_id)}
                  onChange={(v) => handleDefaultItemsChange('pos_default_cashier_id', v)}
                  placeholder="اختر الكاشير"
                  textAlign={selectTextAlign}
                  labelLayout="inline"
                />
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!form.pos_use_default_cashier} onChange={(e) => handleChange('pos_use_default_cashier', e.target.checked)} className="rounded border-slate-300 text-primary-600 focus:ring-primary-500" />
                  <span className="text-sm text-slate-700">تطبيق في نقطة البيع والتقارير</span>
                </label>
              </div>
              <div className="space-y-2">
                <SearchableSelect
                  label="الفئة الافتراضية"
                  required
                  options={categoryOptions}
                  value={form.pos_default_category_id === '' || form.pos_default_category_id === undefined ? null : Number(form.pos_default_category_id)}
                  onChange={(v) => handleDefaultItemsChange('pos_default_category_id', v)}
                  placeholder="اختر الفئة"
                  textAlign={selectTextAlign}
                  labelLayout="inline"
                />
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!form.pos_use_default_category} onChange={(e) => handleChange('pos_use_default_category', e.target.checked)} className="rounded border-slate-300 text-primary-600 focus:ring-primary-500" />
                  <span className="text-sm text-slate-700">تطبيق في نقطة البيع والتقارير</span>
                </label>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <SearchableSelect
                  label="الفرع الافتراضي"
                  required={false}
                  options={branchOptions}
                  value={form.pos_default_branch_id === '' || form.pos_default_branch_id === undefined ? null : Number(form.pos_default_branch_id)}
                  onChange={(v) => handleDefaultItemsChange('pos_default_branch_id', v)}
                  placeholder="اختر الفرع"
                  textAlign={selectTextAlign}
                  labelLayout="inline"
                />
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!form.pos_use_default_branch} onChange={(e) => handleChange('pos_use_default_branch', e.target.checked)} className="rounded border-slate-300 text-primary-600 focus:ring-primary-500" />
                  <span className="text-sm text-slate-700">تطبيق في نقطة البيع والتقارير</span>
                </label>
              </div>

              <div className="space-y-2">
                <SearchableSelect
                  label="المخزن الافتراضي"
                  required={false}
                  options={warehouseOptions}
                  value={form.pos_default_warehouse_id === '' || form.pos_default_warehouse_id === undefined ? null : Number(form.pos_default_warehouse_id)}
                  onChange={(v) => handleDefaultItemsChange('pos_default_warehouse_id', v)}
                  placeholder="اختر المخزن"
                  textAlign={selectTextAlign}
                  labelLayout="inline"
                />
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!form.pos_use_default_warehouse} onChange={(e) => handleChange('pos_use_default_warehouse', e.target.checked)} className="rounded border-slate-300 text-primary-600 focus:ring-primary-500" />
                  <span className="text-sm text-slate-700">تطبيق في نقطة البيع والتقارير</span>
                </label>
              </div>
              <div className="hidden sm:block" aria-hidden />
            </div>
          </div>
          <div className="p-4 border-t border-slate-200 flex justify-end">
            <button type="submit" disabled={updateMut.isPending} className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50">
              <Save size={18} /> حفظ
            </button>
          </div>
        </form>
      ) : activeTab === 'items' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!tenantId) {
              showToast('يجب اختيار الشركة أولاً', 'error')
              return
            }
            updateMut.mutate({ pos_item_icon_size: String(form.pos_item_icon_size ?? 'medium') })
          }}
          className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden"
        >
          <div className="p-6 space-y-4">
            <h2 className="text-lg font-semibold text-slate-800 border-b border-slate-100 pb-2">الأصناف والفئات في شاشة نقطة البيع</h2>
            <div className="max-w-xs">
              <label className={`block text-sm font-medium text-slate-700 mb-1 ${textAlign}`}>
                حجم أيقونات الأصناف والفئات
              </label>
              <select
                value={String(form.pos_item_icon_size ?? 'medium')}
                onChange={(e) => handleChange('pos_item_icon_size', e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
              >
                {ITEM_ICON_SIZE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {isRtl ? opt.labelAr : opt.labelEn}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="p-4 border-t border-slate-200 flex justify-end">
            <button type="submit" disabled={updateMut.isPending} className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50">
              <Save size={18} /> حفظ
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 space-y-4">
            <h2 className="text-lg font-semibold text-slate-800 border-b border-slate-100 pb-2">خيارات نقطة البيع</h2>
            <div className="flex flex-wrap gap-x-3 gap-y-4 lg:flex-nowrap lg:items-start lg:overflow-x-auto lg:pb-1">
              <div className="w-full min-w-0 max-w-full sm:max-w-[calc(50%-0.375rem)] lg:max-w-[14rem] lg:w-[14rem] shrink-0">
                <label className={`block text-xs font-medium text-slate-700 mb-1 leading-snug ${textAlign}`}>إظهار نوع عملية البيع <span className="text-red-500">*</span></label>
                <select value={form.pos_show_sales_operation_type ? '1' : '0'} onChange={(e) => handleChange('pos_show_sales_operation_type', e.target.value === '1')} className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none">
                  <option value="1">نعم</option>
                  <option value="0">لا</option>
                </select>
              </div>
              <div className="w-full min-w-0 max-w-full sm:max-w-[calc(50%-0.375rem)] lg:max-w-[14rem] lg:w-[14rem] shrink-0">
                <label className={`block text-xs font-medium text-slate-700 mb-1 leading-snug ${textAlign}`}>السماح بالآجل في نقاط البيع <span className="text-red-500">*</span></label>
                <select value={form.pos_allow_credit_sales ? '1' : '0'} onChange={(e) => handleChange('pos_allow_credit_sales', e.target.value === '1')} className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none">
                  <option value="1">نعم</option>
                  <option value="0">لا</option>
                </select>
              </div>
              <div className="w-full min-w-0 max-w-full sm:max-w-[calc(50%-0.375rem)] lg:max-w-[14rem] lg:w-[14rem] shrink-0">
                <label className={`block text-xs font-medium text-slate-700 mb-1 leading-snug ${textAlign}`}>السماح باختيار مندوب المبيعات <span className="text-red-500">*</span></label>
                <select value={form.pos_allow_select_sales_rep ? '1' : '0'} onChange={(e) => handleChange('pos_allow_select_sales_rep', e.target.value === '1')} className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none">
                  <option value="1">نعم</option>
                  <option value="0">لا</option>
                </select>
              </div>
              <div className="w-full min-w-0 max-w-full sm:max-w-[calc(50%-0.375rem)] lg:max-w-[14rem] lg:w-[14rem] shrink-0">
                <label className={`block text-xs font-medium text-slate-700 mb-1 leading-snug ${textAlign}`}>السماح باختيار حالة الفاتورة <span className="text-red-500">*</span></label>
                <select value={form.pos_allow_select_invoice_status ? '1' : '0'} onChange={(e) => handleChange('pos_allow_select_invoice_status', e.target.value === '1')} className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none">
                  <option value="1">نعم</option>
                  <option value="0">لا</option>
                </select>
              </div>
              <div className="w-full min-w-0 max-w-full sm:max-w-[calc(50%-0.375rem)] lg:max-w-[14rem] lg:w-[14rem] shrink-0">
                <label className={`block text-xs font-medium text-slate-700 mb-1 leading-snug ${textAlign}`}>السماح بالبيع بالسالب</label>
                <select
                  value={form.allow_negative_sale ? '1' : '0'}
                  onChange={(e) => handleChange('allow_negative_sale', e.target.value === '1')}
                  className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                >
                  <option value="1">نعم</option>
                  <option value="0">لا</option>
                </select>
              </div>
            </div>
            <h2 className="text-lg font-semibold text-slate-800 border-b border-slate-100 pb-2 pt-4">الفاتورة والطباعة والضرائب</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={`block text-sm font-medium text-slate-700 mb-1 ${textAlign}`}>رابط الشعار (للفاتورة)</label>
                <input type="text" value={String(form.pos_invoice_logo ?? '')} onChange={(e) => handleChange('pos_invoice_logo', e.target.value)} placeholder="https://..." className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none" />
              </div>
              <div className="sm:col-span-2">
                <label className={`block text-sm font-medium text-slate-700 mb-1 ${textAlign}`}>ترويسة الفاتورة</label>
                <textarea value={String(form.pos_invoice_header ?? '')} onChange={(e) => handleChange('pos_invoice_header', e.target.value)} rows={2} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none" />
              </div>
              <div className="sm:col-span-2">
                <label className={`block text-sm font-medium text-slate-700 mb-1 ${textAlign}`}>الرسالة الختامية (تذييل الفاتورة)</label>
                <textarea value={String(form.pos_invoice_footer ?? '')} onChange={(e) => handleChange('pos_invoice_footer', e.target.value)} rows={2} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none" />
              </div>
              <div>
                <label className={`block text-sm font-medium text-slate-700 mb-1 ${textAlign}`}>وضع الطباعة</label>
                <select value={String(form.pos_print_mode ?? 'thermal_80')} onChange={(e) => handleChange('pos_print_mode', e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none">
                  <option value="thermal_80">حرارية 80mm</option>
                  <option value="a4">A4</option>
                </select>
              </div>
              <div>
                <label className={`block text-sm font-medium text-slate-700 mb-1 ${textAlign}`}>نظام التقريب</label>
                <select value={String(form.pos_rounding ?? 'none')} onChange={(e) => handleChange('pos_rounding', e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none">
                  <option value="none">بدون تقريب</option>
                  <option value="nearest">الأقرب</option>
                  <option value="floor">تقريب لأسفل</option>
                  <option value="ceil">تقريب لأعلى</option>
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-6 pt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={!!form.pos_default_printer_enabled} onChange={(e) => handleChange('pos_default_printer_enabled', e.target.checked)} className="rounded border-slate-300 text-primary-600 focus:ring-primary-500" />
                <span className="text-sm text-slate-700">تفعيل الطابعة الافتراضية</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={!!form.pos_tax_inclusive} onChange={(e) => handleChange('pos_tax_inclusive', e.target.checked)} className="rounded border-slate-300 text-primary-600 focus:ring-primary-500" />
                <span className="text-sm text-slate-700">الأسعار شاملة الضريبة</span>
              </label>
            </div>
          </div>
          <div className="p-4 border-t border-slate-200 flex justify-end">
            <button type="submit" disabled={updateMut.isPending} className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50">
              <Save size={18} /> حفظ
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
