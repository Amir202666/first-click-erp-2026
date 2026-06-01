import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchAdminPlans, createAdminPlan, updateAdminPlan, type AdminPlanRow } from '../../api/admin'
import { CreditCard, Pencil, Plus, X, Check, Loader2, ShieldAlert } from 'lucide-react'
import { useClientSort, type SortColumn } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'

type PageNode = { id: string; labelAr: string; labelEn: string }

const PAGE_GROUPS: { key: string; labelAr: string; labelEn: string; pages: PageNode[] }[] = [
  {
    key: 'accounting',
    labelAr: 'المحاسبة العامة',
    labelEn: 'General Accounting',
    pages: [
      { id: 'accounts', labelAr: 'دليل الحسابات', labelEn: 'Chart of accounts' },
      { id: 'journal-entries', labelAr: 'القيود اليومية', labelEn: 'Journal entries' },
      { id: 'receipt-vouchers', labelAr: 'سندات القبض', labelEn: 'Receipt vouchers' },
      { id: 'payment-vouchers', labelAr: 'سندات الصرف', labelEn: 'Payment vouchers' },
      { id: 'cost-centers', labelAr: 'مراكز التكلفة', labelEn: 'Cost centers' },
      { id: 'payment-methods', labelAr: 'طرق الدفع', labelEn: 'Payment methods' },
      { id: 'currencies', labelAr: 'العملات', labelEn: 'Currencies' },
      { id: 'branches', labelAr: 'الفروع', labelEn: 'Branches' },
      { id: 'settings-accounting', labelAr: 'الإعدادات المحاسبية', labelEn: 'Accounting settings' },
    ],
  },
  {
    key: 'sales',
    labelAr: 'المبيعات',
    labelEn: 'Sales',
    pages: [
      { id: 'customers', labelAr: 'العملاء', labelEn: 'Customers' },
      { id: 'customer-balances', labelAr: 'أرصدة العملاء', labelEn: 'Customer balances' },
      { id: 'customer-aging', labelAr: 'أعمار ديون العملاء', labelEn: 'Customer aging' },
      { id: 'customer-analysis', labelAr: 'تقييم وتحليل العملاء', labelEn: 'Customer evaluation & analysis' },
      { id: 'invoices-sales', labelAr: 'فواتير المبيعات', labelEn: 'Sales invoices' },
      { id: 'invoices-pos', labelAr: 'فواتير نقطة البيع', labelEn: 'POS invoices' },
      { id: 'quotations', labelAr: 'عروض الأسعار', labelEn: 'Quotations' },
      { id: 'reports-item-sales', labelAr: 'تقرير مبيعات الأصناف', labelEn: 'Item sales report' },
      { id: 'reports-best-selling', labelAr: 'الأكثر مبيعاً', labelEn: 'Best selling' },
    ],
  },
  {
    key: 'purchases',
    labelAr: 'المشتريات',
    labelEn: 'Purchases',
    pages: [
      { id: 'vendors', labelAr: 'الموردون', labelEn: 'Vendors' },
      { id: 'vendor-balances', labelAr: 'أرصدة الموردين', labelEn: 'Vendor balances' },
      { id: 'purchase-requests', labelAr: 'طلبات الشراء', labelEn: 'Purchase requests' },
      { id: 'invoices-purchases', labelAr: 'فواتير المشتريات', labelEn: 'Purchase invoices' },
      { id: 'reports-item-purchases', labelAr: 'تقرير مشتريات الأصناف', labelEn: 'Item purchases report' },
    ],
  },
  {
    key: 'inventory',
    labelAr: 'المخزون',
    labelEn: 'Inventory',
    pages: [
      { id: 'items', labelAr: 'الأصناف', labelEn: 'Items' },
      { id: 'item-units', labelAr: 'وحدات القياس', labelEn: 'Item units' },
      { id: 'item-categories', labelAr: 'فئات الأصناف', labelEn: 'Item categories' },
      { id: 'item-brands', labelAr: 'العلامات التجارية', labelEn: 'Item brands' },
      { id: 'warehouses', labelAr: 'المخازن', labelEn: 'Warehouses' },
      { id: 'inventory-transfers', labelAr: 'تحويلات المخزون', labelEn: 'Inventory transfers' },
      { id: 'stock-movements', labelAr: 'حركة المخزون', labelEn: 'Stock movements' },
      { id: 'opening-stock', labelAr: 'رصيد أول المدة', labelEn: 'Opening stock' },
      { id: 'inventory-low-stock', labelAr: 'تنبيهات النواقص', labelEn: 'Low stock alerts' },
      { id: 'inventory-report', labelAr: 'تقرير الجرد', labelEn: 'Inventory report' },
      { id: 'reports-serial-numbers-inventory', labelAr: 'جرد الأرقام التسلسلية', labelEn: 'Serial numbers inventory' },
    ],
  },
  {
    key: 'pos',
    labelAr: 'نقطة البيع (POS)',
    labelEn: 'Point of Sale (POS)',
    pages: [
      { id: 'pos-screen', labelAr: 'شاشة نقطة البيع', labelEn: 'POS screen' },
      { id: 'pos-invoices', labelAr: 'تقارير فواتير نقطة البيع', labelEn: 'POS invoices list' },
    ],
  },
  {
    key: 'manufacturing',
    labelAr: 'التصنيع',
    labelEn: 'Manufacturing',
    pages: [
      { id: 'manufacturing', labelAr: 'قائمة المواد (BOM) وأوامر الإنتاج', labelEn: 'BOM & Production orders' },
    ],
  },
  {
    key: 'reports',
    labelAr: 'التقارير المالية',
    labelEn: 'Financial Reports',
    pages: [
      { id: 'reports-trial-balance', labelAr: 'ميزان المراجعة', labelEn: 'Trial balance' },
      { id: 'reports-income-statement', labelAr: 'قائمة الدخل', labelEn: 'Income statement' },
      { id: 'reports-balance-sheet', labelAr: 'الميزانية العمومية', labelEn: 'Balance sheet' },
      { id: 'reports-expenses', labelAr: 'تقرير المصاريف', labelEn: 'Expenses report' },
      { id: 'reports-tax-declaration', labelAr: 'التقارير الضريبية', labelEn: 'Tax declaration' },
      { id: 'reports-account-statement', labelAr: 'كشف حساب', labelEn: 'Account statement' },
      { id: 'reports-customer-balances', labelAr: 'أرصدة العملاء', labelEn: 'Customer balances' },
      { id: 'reports-vendor-balances', labelAr: 'أرصدة الموردين', labelEn: 'Vendor balances' },
      { id: 'reports-customer-aging', labelAr: 'أعمار الديون', labelEn: 'Customer aging' },
      { id: 'reports-customer-analysis', labelAr: 'تقييم العملاء', labelEn: 'Customer analysis' },
      { id: 'reports-account-last-movements', labelAr: 'آخر حركات الحساب', labelEn: 'Account last movements' },
    ],
  },
]

export default function AdminPlans() {
  const { isPlatformSuperAdmin: isSuperAdmin } = useAuth()
  const { lang } = useLanguage()
  const queryClient = useQueryClient()
  const isAr = lang === 'ar'
  const [showForm, setShowForm] = useState(false)
  const [editingPlan, setEditingPlan] = useState<AdminPlanRow | null>(null)
  const [form, setForm] = useState({
    name: '',
    duration_days: '' as number | '',
    billing_cycle_months: 12,
    features: [] as string[], // مصفوفة page_id المختارة
    description: '',
  })

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'plans'],
    queryFn: () => fetchAdminPlans(),
    enabled: !!isSuperAdmin,
  })

  const createMut = useMutation({
    mutationFn: createAdminPlan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'plans'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'subscription-plans'] })
      setShowForm(false)
      setForm({ name: '', duration_days: '', billing_cycle_months: 12, features: [], description: '' })
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof updateAdminPlan>[1] }) => updateAdminPlan(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'plans'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'subscription-plans'] })
      setEditingPlan(null)
    },
  })

  const openEdit = (plan: AdminPlanRow) => {
    setEditingPlan(plan)
    setForm({
      name: plan.name,
      duration_days: plan.duration_days || '',
      billing_cycle_months: plan.billing_cycle_months || 12,
      features: plan.features ?? [],
      description: plan.description ?? '',
    })
  }

  const togglePage = (pageId: string) => {
    setForm((f) => ({
      ...f,
      features: f.features.includes(pageId)
        ? f.features.filter((x) => x !== pageId)
        : [...f.features, pageId],
    }))
  }

  const getGroupState = (group: (typeof PAGE_GROUPS)[number]) => {
    const ids = group.pages.map((p) => p.id)
    const selectedCount = ids.filter((id) => form.features.includes(id)).length
    const all = selectedCount === ids.length && ids.length > 0
    const some = selectedCount > 0 && selectedCount < ids.length
    return { all, some, ids }
  }

  const toggleGroup = (group: (typeof PAGE_GROUPS)[number]) => {
    const { all, ids } = getGroupState(group)
    setForm((f) => {
      if (all) {
        // إلغاء جميع الصفحات في هذا القسم فقط
        return { ...f, features: f.features.filter((id) => !ids.includes(id)) }
      }
      // إضافة جميع الصفحات في هذا القسم (مع الاحتفاظ بالصفحات الأخرى من أقسام أخرى)
      const merged = new Set([...f.features, ...ids])
      return { ...f, features: Array.from(merged) }
    })
  }

  const handleSave = () => {
    if (editingPlan) {
      updateMut.mutate({
        id: editingPlan.id,
        data: {
          name: form.name,
          duration_days: form.duration_days || undefined,
          billing_cycle_months: form.billing_cycle_months,
          features: form.features,
          description: form.description || undefined,
        },
      })
    } else {
      createMut.mutate({
        name: form.name,
        duration_days: form.duration_days || undefined,
        billing_cycle_months: form.billing_cycle_months,
        features: form.features,
        description: form.description || undefined,
      })
    }
  }

  const title = isAr ? 'إدارة الباقات' : 'Manage Plans'
  const addPlanLabel = isAr ? 'إضافة باقة' : 'Add plan'
  const colName = isAr ? 'الاسم' : 'Name'
  const colDuration = isAr ? 'المدة (يوم)' : 'Duration (days)'
  const colFeatures = isAr ? 'الميزات' : 'Features'
  const colActions = isAr ? 'إجراءات' : 'Actions'

  const plansRaw = data?.data ?? []
  type PlanSortKey = 'name' | 'duration_days' | 'features_count' | 'description'
  const planSortColumns = useMemo((): SortColumn<AdminPlanRow, PlanSortKey>[] => {
    return [
      { key: 'name', type: 'string', getValue: (p) => p.name ?? '' },
      { key: 'duration_days', type: 'number', getValue: (p) => Number(p.duration_days ?? 0) },
      { key: 'features_count', type: 'number', getValue: (p) => p.features?.length ?? 0 },
      { key: 'description', type: 'string', getValue: (p) => p.description ?? '' },
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
          <h1 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary-600" />
            {title}
          </h1>
          <button
            type="button"
            onClick={() => {
              setEditingPlan(null)
              setForm({ name: '', duration_days: '', billing_cycle_months: 12, features: [], description: '' })
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
                  <SortableTh label={colDuration} sortKey="duration_days" sortState={sort} onToggle={toggleSort} className="text-start py-0 px-0 font-medium text-slate-700" />
                  <SortableTh label={colFeatures} sortKey="features_count" sortState={sort} onToggle={toggleSort} className="text-start py-0 px-0 font-medium text-slate-700" />
                  <th className="text-start py-2.5 px-3 font-medium text-slate-700 w-24">{colActions}</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-slate-500">
                      <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-primary-500" />
                      {isAr ? 'جاري التحميل...' : 'Loading...'}
                    </td>
                  </tr>
                ) : sortedPlans.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-slate-500">{isAr ? 'لا توجد باقات' : 'No plans'}</td>
                  </tr>
                ) : (
                  sortedPlans.map((plan) => (
                    <tr key={plan.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                      <td className="py-2.5 px-3 text-slate-800 font-medium">{plan.name}</td>
                      <td className="py-2.5 px-3 text-slate-700">{plan.duration_days}</td>
                      <td className="py-2.5 px-3 text-slate-700">
                        {(plan.features ?? []).length ? (plan.features ?? []).join(', ') : '—'}
                      </td>
                      <td className="py-2.5 px-3">
                        <button
                          type="button"
                          onClick={() => { setShowForm(true); openEdit(plan) }}
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

      {/* Add/Edit modal */}
      {(showForm || editingPlan) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => !createMut.isPending && !updateMut.isPending && (setShowForm(false), setEditingPlan(null))}>
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 w-full max-w-md p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-800">{editingPlan ? (isAr ? 'تعديل الباقة' : 'Edit plan') : addPlanLabel}</h3>
              <button type="button" onClick={() => !createMut.isPending && !updateMut.isPending && (setShowForm(false), setEditingPlan(null))} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{isAr ? 'اسم الباقة' : 'Plan name'}</label>
                <input
                  type="text"
                  className="w-full h-10 border border-slate-300 rounded-lg px-3 text-sm"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={isAr ? 'مثال: أساسي، متقدم' : 'e.g. Basic, Advanced'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{isAr ? 'المدة بالأيام' : 'Duration (days)'}</label>
                <input
                  type="number"
                  min={1}
                  className="w-full h-10 border border-slate-300 rounded-lg px-3 text-sm"
                  value={form.duration_days === '' ? '' : form.duration_days}
                  onChange={(e) => setForm((f) => ({ ...f, duration_days: e.target.value === '' ? '' : parseInt(e.target.value, 10) || 0 }))}
                  placeholder="365"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {isAr ? 'الميزات والصفحات المتاحة' : 'Available features & pages'}
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {PAGE_GROUPS.map((group) => {
                    const { all, some, ids } = getGroupState(group)
                    const pages = group.pages
                    return (
                      <div key={group.key} className="border border-slate-200 rounded-lg p-3 bg-slate-50/40">
                        <label className="flex items-center gap-2 cursor-pointer mb-2">
                          <input
                            type="checkbox"
                            checked={all}
                            onChange={() => toggleGroup(group)}
                            className={`rounded border-slate-300 text-primary-600 ${
                              some && !all ? 'outline outline-[3px] outline-primary-300/60' : ''
                            }`}
                          />
                          <span className="text-sm font-medium text-slate-800">
                            {isAr ? group.labelAr : group.labelEn}
                          </span>
                        </label>
                        <div className="space-y-1 ps-5">
                          {pages.map((page) => (
                            <label
                              key={page.id}
                              className="flex items-center gap-2 cursor-pointer text-xs text-slate-700"
                            >
                              <input
                                type="checkbox"
                                checked={form.features.includes(page.id)}
                                onChange={() => togglePage(page.id)}
                                className="rounded border-slate-300 text-primary-600"
                              />
                              <span>{isAr ? page.labelAr : page.labelEn}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{isAr ? 'الوصف (اختياري)' : 'Description (optional)'}</label>
                <textarea
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm min-h-[80px]"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder={isAr ? 'وصف الباقة' : 'Plan description'}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button type="button" onClick={() => !createMut.isPending && !updateMut.isPending && (setShowForm(false), setEditingPlan(null))} className="h-10 px-4 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-medium">
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={(createMut.isPending || updateMut.isPending) || !form.name.trim()}
                className="h-10 px-4 rounded-lg bg-primary-600 text-white text-sm font-medium flex items-center gap-2 disabled:opacity-50"
              >
                {(createMut.isPending || updateMut.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {isAr ? 'حفظ' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
