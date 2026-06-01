import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchAdminPlans, createAdminPlan, updateAdminPlan, type AdminPlanRow } from '../../api/admin'
import { CreditCard, Pencil, Plus, X, Check, Loader2, ShieldAlert } from 'lucide-react'
import { useClientSort, type SortColumn } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'
import { PLAN_ALL_FEATURES } from '../../utils/planFeatures'
import {
  formatPlanPrice,
  PLAN_CURRENCY_OPTIONS,
  PLAN_MODULE_OPTIONS,
} from '../../utils/planDisplay'

const emptyForm = () => ({
  name: '',
  price: '' as number | '',
  currency: 'SAR',
  max_users: '' as number | '',
  duration_days: '' as number | '',
  billing_cycle_months: 1,
  features: [] as string[],
  description: '',
  is_active: true,
  sort_order: '' as number | '',
})

export default function AdminPlans() {
  const { isPlatformSuperAdmin: isSuperAdmin } = useAuth()
  const { lang } = useLanguage()
  const queryClient = useQueryClient()
  const isAr = lang === 'ar'
  const [showForm, setShowForm] = useState(false)
  const [editingPlan, setEditingPlan] = useState<AdminPlanRow | null>(null)
  const [form, setForm] = useState(emptyForm)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'plans'],
    queryFn: () => fetchAdminPlans(),
    enabled: !!isSuperAdmin,
  })

  const invalidatePlans = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin', 'plans'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'subscription-plans'] }),
      queryClient.refetchQueries({ queryKey: ['subscription-plans', 'public'] }),
    ])
  }

  const createMut = useMutation({
    mutationFn: createAdminPlan,
    onSuccess: async () => {
      await invalidatePlans()
      setShowForm(false)
      setForm(emptyForm())
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof updateAdminPlan>[1] }) => updateAdminPlan(id, data),
    onSuccess: async () => {
      await invalidatePlans()
      setEditingPlan(null)
      setShowForm(false)
      setForm(emptyForm())
    },
  })

  const openEdit = (plan: AdminPlanRow) => {
    setEditingPlan(plan)
    setForm({
      name: plan.name,
      price: plan.price ?? '',
      currency: plan.currency || 'SAR',
      max_users: plan.max_users ?? '',
      duration_days: plan.duration_days || '',
      billing_cycle_months: plan.billing_cycle_months || 1,
      features: plan.features ?? [],
      description: plan.description ?? '',
      is_active: plan.is_active,
      sort_order: plan.sort_order ?? '',
    })
  }

  const hasAllFeatures = form.features.includes(PLAN_ALL_FEATURES)

  const toggleModule = (moduleId: string) => {
    setForm((f) => {
      if (moduleId === PLAN_ALL_FEATURES) {
        return { ...f, features: f.features.includes(PLAN_ALL_FEATURES) ? [] : [PLAN_ALL_FEATURES] }
      }
      const withoutAll = f.features.filter((x) => x !== PLAN_ALL_FEATURES)
      const next = withoutAll.includes(moduleId)
        ? withoutAll.filter((x) => x !== moduleId)
        : [...withoutAll, moduleId]
      return { ...f, features: next }
    })
  }

  const buildPayload = () => ({
    name: form.name.trim(),
    price: form.price === '' ? 0 : Number(form.price),
    currency: form.currency,
    max_users: form.max_users === '' ? null : Number(form.max_users),
    duration_days: form.duration_days === '' ? undefined : Number(form.duration_days),
    billing_cycle_months: form.billing_cycle_months,
    features: form.features,
    description: form.description.trim() || undefined,
    is_active: form.is_active,
    sort_order: form.sort_order === '' ? undefined : Number(form.sort_order),
  })

  const handleSave = () => {
    const payload = buildPayload()
    if (editingPlan) {
      updateMut.mutate({ id: editingPlan.id, data: payload })
    } else {
      createMut.mutate(payload)
    }
  }

  const title = isAr ? 'إدارة الباقات' : 'Manage Plans'
  const addPlanLabel = isAr ? 'إضافة باقة' : 'Add plan'
  const colName = isAr ? 'الاسم' : 'Name'
  const colPrice = isAr ? 'السعر' : 'Price'
  const colUsers = isAr ? 'المستخدمون' : 'Users'
  const colFeatures = isAr ? 'الميزات' : 'Features'
  const colActive = isAr ? 'نشطة' : 'Active'
  const colActions = isAr ? 'إجراءات' : 'Actions'

  const plansRaw = data?.data ?? []
  type PlanSortKey = 'name' | 'price' | 'sort_order' | 'features_count'
  const planSortColumns = useMemo((): SortColumn<AdminPlanRow, PlanSortKey>[] => {
    return [
      { key: 'name', type: 'string', getValue: (p) => p.name ?? '' },
      { key: 'price', type: 'number', getValue: (p) => Number(p.price ?? 0) },
      { key: 'sort_order', type: 'number', getValue: (p) => Number(p.sort_order ?? 0) },
      { key: 'features_count', type: 'number', getValue: (p) => p.features?.length ?? 0 },
    ]
  }, [])
  const planLocale = isAr ? 'ar-u-nu-latn' : 'en-US'
  const { sort, toggleSort, sortedRows: sortedPlans } = useClientSort(plansRaw, planSortColumns, { locale: planLocale })

  if (!isSuperAdmin) {
    return (
      <div className="p-4 max-w-2xl mx-auto">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 flex items-start gap-3">
          <ShieldAlert className="w-8 h-8 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h2 className="font-semibold text-amber-900 mb-1">{isAr ? 'غير مصرح' : 'Not authorized'}</h2>
            <p className="text-sm text-amber-800">{isAr ? 'هذه الصفحة للمشرف العام فقط.' : 'This page is for super administrator only.'}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-3 md:p-4 max-w-[98%] mx-auto" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-primary-600" />
              {title}
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              {isAr
                ? 'عدّل السعر والعملة والوصف والميزات — تظهر التغييرات فوراً في بطاقات اختيار الباقة.'
                : 'Edit price, currency, description, and features — changes appear in plan selection cards immediately.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditingPlan(null)
              setForm(emptyForm())
              setShowForm(true)
            }}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700"
          >
            <Plus className="w-4 h-4" />
            {addPlanLabel}
          </button>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <SortableTh label={colName} sortKey="name" sortState={sort} onToggle={toggleSort} className="text-start py-0 px-0 font-medium text-slate-700" />
                  <SortableTh label={colPrice} sortKey="price" sortState={sort} onToggle={toggleSort} className="text-start py-0 px-0 font-medium text-slate-700" />
                  <th className="text-start py-2.5 px-3 font-medium text-slate-700">{colUsers}</th>
                  <SortableTh label={colFeatures} sortKey="features_count" sortState={sort} onToggle={toggleSort} className="text-start py-0 px-0 font-medium text-slate-700" />
                  <th className="text-start py-2.5 px-3 font-medium text-slate-700">{colActive}</th>
                  <th className="text-start py-2.5 px-3 font-medium text-slate-700 w-24">{colActions}</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-500">
                      <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-primary-500" />
                      {isAr ? 'جاري التحميل...' : 'Loading...'}
                    </td>
                  </tr>
                ) : sortedPlans.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-500">{isAr ? 'لا توجد باقات' : 'No plans'}</td>
                  </tr>
                ) : (
                  sortedPlans.map((plan) => (
                    <tr key={plan.id} className={`border-b border-slate-100 hover:bg-slate-50/50 ${!plan.is_active ? 'opacity-60' : ''}`}>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-slate-800">{plan.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono" dir="ltr">{plan.slug}</div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                        {formatPlanPrice(plan.price, plan.currency, plan.billing_cycle_months, isAr)}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">
                        {plan.max_users == null ? (isAr ? '∞' : '∞') : plan.max_users}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 max-w-[200px] truncate" title={(plan.features ?? []).join(', ')}>
                        {(plan.features ?? []).includes(PLAN_ALL_FEATURES)
                          ? isAr
                            ? 'كل الميزات'
                            : 'All features'
                          : (plan.features ?? []).join(', ') || '—'}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                            plan.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {plan.is_active ? (isAr ? 'نعم' : 'Yes') : isAr ? 'لا' : 'No'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <button
                          type="button"
                          onClick={() => {
                            setShowForm(true)
                            openEdit(plan)
                          }}
                          className="p-1.5 rounded-lg text-slate-600 hover:bg-primary-50 hover:text-primary-600"
                          title={isAr ? 'تعديل' : 'Edit'}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {(showForm || editingPlan) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={() => !createMut.isPending && !updateMut.isPending && (setShowForm(false), setEditingPlan(null))}
        >
          <div
            className="bg-white rounded-xl shadow-lg border border-slate-200 w-full max-w-2xl p-5 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-800">
                {editingPlan ? (isAr ? 'تعديل الباقة' : 'Edit plan') : addPlanLabel}
              </h3>
              <button
                type="button"
                onClick={() => !createMut.isPending && !updateMut.isPending && (setShowForm(false), setEditingPlan(null))}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">{isAr ? 'اسم الباقة' : 'Plan name'}</label>
                  <input
                    type="text"
                    className="w-full h-10 border border-slate-300 rounded-lg px-3 text-sm"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                {editingPlan && (
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">{isAr ? 'المعرّف (slug)' : 'Slug'}</label>
                    <input
                      type="text"
                      readOnly
                      className="w-full h-10 border border-slate-200 rounded-lg px-3 text-sm bg-slate-50 font-mono text-slate-500"
                      value={editingPlan.slug}
                      dir="ltr"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{isAr ? 'السعر' : 'Price'}</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    className="w-full h-10 border border-slate-300 rounded-lg px-3 text-sm"
                    value={form.price === '' ? '' : form.price}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, price: e.target.value === '' ? '' : parseFloat(e.target.value) || 0 }))
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{isAr ? 'العملة' : 'Currency'}</label>
                  <select
                    className="w-full h-10 border border-slate-300 rounded-lg px-3 text-sm bg-white"
                    value={form.currency}
                    onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                  >
                    {PLAN_CURRENCY_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {isAr ? 'دورة الفوترة (أشهر)' : 'Billing cycle (months)'}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    className="w-full h-10 border border-slate-300 rounded-lg px-3 text-sm"
                    value={form.billing_cycle_months}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, billing_cycle_months: parseInt(e.target.value, 10) || 1 }))
                    }
                  />
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {isAr ? '1 = شهري، 12 = سنوي' : '1 = monthly, 12 = yearly'}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {isAr ? 'أقصى عدد مستخدمين' : 'Max users'}
                  </label>
                  <input
                    type="number"
                    min={1}
                    className="w-full h-10 border border-slate-300 rounded-lg px-3 text-sm"
                    value={form.max_users === '' ? '' : form.max_users}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        max_users: e.target.value === '' ? '' : parseInt(e.target.value, 10) || 1,
                      }))
                    }
                    placeholder={isAr ? 'فارغ = غير محدود' : 'Empty = unlimited'}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{isAr ? 'ترتيب العرض' : 'Sort order'}</label>
                  <input
                    type="number"
                    min={0}
                    className="w-full h-10 border border-slate-300 rounded-lg px-3 text-sm"
                    value={form.sort_order === '' ? '' : form.sort_order}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        sort_order: e.target.value === '' ? '' : parseInt(e.target.value, 10) || 0,
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {isAr ? 'مدة الاشتراك (أيام)' : 'Subscription duration (days)'}
                  </label>
                  <input
                    type="number"
                    min={1}
                    className="w-full h-10 border border-slate-300 rounded-lg px-3 text-sm"
                    value={form.duration_days === '' ? '' : form.duration_days}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        duration_days: e.target.value === '' ? '' : parseInt(e.target.value, 10) || 0,
                      }))
                    }
                    placeholder={isAr ? 'اختياري — يُحسب من الأشهر إن تُرك فارغاً' : 'Optional — derived from months if empty'}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{isAr ? 'الوصف' : 'Description'}</label>
                <textarea
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm min-h-[72px]"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder={isAr ? 'يظهر تحت السعر في بطاقة الباقة' : 'Shown under price on the plan card'}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  {isAr ? 'ميزات الباقة' : 'Plan features'}
                </label>
                <label className="flex items-center gap-2 cursor-pointer mb-3 p-3 rounded-lg border border-primary-200 bg-primary-50/50">
                  <input
                    type="checkbox"
                    checked={hasAllFeatures}
                    onChange={() => toggleModule(PLAN_ALL_FEATURES)}
                    className="rounded border-slate-300 text-primary-600"
                  />
                  <span className="text-sm font-semibold text-primary-900">
                    {isAr ? 'جميع مميزات النظام (all_features)' : 'All system features (all_features)'}
                  </span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {PLAN_MODULE_OPTIONS.map((mod) => (
                    <label
                      key={mod.id}
                      className={`flex items-center gap-2 cursor-pointer rounded-lg border px-3 py-2 text-sm ${
                        hasAllFeatures ? 'opacity-40 pointer-events-none' : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={hasAllFeatures}
                        checked={form.features.includes(mod.id)}
                        onChange={() => toggleModule(mod.id)}
                        className="rounded border-slate-300 text-primary-600"
                      />
                      <span>{isAr ? mod.labelAr : mod.labelEn}</span>
                    </label>
                  ))}
                </div>
              </div>

              {editingPlan && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                    className="rounded border-slate-300 text-primary-600"
                  />
                  <span className="text-sm text-slate-700">{isAr ? 'باقة نشطة (تظهر عند التسجيل)' : 'Active (visible when signing up)'}</span>
                </label>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={() => !createMut.isPending && !updateMut.isPending && (setShowForm(false), setEditingPlan(null))}
                className="h-10 px-4 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-medium"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={(createMut.isPending || updateMut.isPending) || !form.name.trim()}
                className="h-10 px-4 rounded-lg bg-primary-600 text-white text-sm font-medium flex items-center gap-2 disabled:opacity-50"
              >
                {(createMut.isPending || updateMut.isPending) ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                {isAr ? 'حفظ' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
