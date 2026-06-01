import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchAdminSubscriptions,
  fetchAdminSubscriptionPlans,
  updateAdminSubscription,
  createAdminTenant,
  toggleAdminTenantActive,
  type AdminSubscriptionRow,
  type SubscriptionPlanOption,
} from '../../api/admin'
import PageSizeSelect from '../../components/ui/PageSizeSelect'
import { Building2, Pencil, X, Check, Loader2, ShieldAlert, Plus, Power, PowerOff, RefreshCw, Mail, ArrowRight, ArrowLeft } from 'lucide-react'
import SubscriptionPlanPicker from '../../components/subscription/SubscriptionPlanPicker'
import { formatDisplayDate } from '../../utils/date'
import { formatAmount } from '../../utils/currency'
import { useClientSort, type SortColumn } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'

const STATUS_OPTIONS: { value: '' | 'active' | 'expired' | 'trial'; labelAr: string; labelEn: string }[] = [
  { value: '', labelAr: 'الكل', labelEn: 'All' },
  { value: 'active', labelAr: 'نشط', labelEn: 'Active' },
  { value: 'expired', labelAr: 'منتهي', labelEn: 'Expired' },
  { value: 'trial', labelAr: 'تجريبي', labelEn: 'Trial' },
]

function StatusBadge({ status, isAr }: { status: string; isAr: boolean }) {
  const labels: Record<string, string> = {
    active: isAr ? 'نشط' : 'Active',
    expired: isAr ? 'منتهي' : 'Expired',
    trial: isAr ? 'تجريبي' : 'Trial',
  }
  const colors: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-800',
    expired: 'bg-red-100 text-red-800',
    trial: 'bg-amber-100 text-amber-800',
  }
  const c = colors[status] ?? 'bg-slate-100 text-slate-700'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${c}`}>
      {labels[status] ?? status}
    </span>
  )
}

export default function AdminSubscriptions() {
  const { isPlatformSuperAdmin: isSuperAdmin } = useAuth()
  const { lang } = useLanguage()
  const queryClient = useQueryClient()
  const isAr = lang === 'ar'
  const [statusFilter, setStatusFilter] = useState<'' | 'active' | 'expired' | 'trial'>('')
  const [planFilter, setPlanFilter] = useState<number | ''>('')
  const [searchCode, setSearchCode] = useState('')
  const [perPage, setPerPage] = useState(25)
  const [page, setPage] = useState(1)
  const [editingRow, setEditingRow] = useState<AdminSubscriptionRow | null>(null)
  const [editForm, setEditForm] = useState({
    name: '',
    company_slug: '',
    manager_username: '',
    manager_name: '',
    subscription_plan_id: '' as number | '',
    subscription_starts_at: '',
    subscription_ends_at: '',
  })
  const [showAddCompany, setShowAddCompany] = useState(false)
  const [addCompanyStep, setAddCompanyStep] = useState<'plan' | 'details'>('plan')
  const [createTenantError, setCreateTenantError] = useState('')
  const [newCompany, setNewCompany] = useState({
    name: '',
    company_slug: '',
    manager_username: '',
    manager_password: '',
    manager_name: '',
    subscription_plan_id: '' as number | '',
    subscription_starts_at: new Date().toISOString().slice(0, 10),
  })

  const params = useMemo(
    () => ({
      status: statusFilter || undefined,
      plan_id: planFilter || undefined,
      search: searchCode.trim() || undefined,
      per_page: perPage,
      page,
    }),
    [statusFilter, planFilter, searchCode, perPage, page]
  )

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'subscriptions', params],
    queryFn: () => fetchAdminSubscriptions(params),
    enabled: !!isSuperAdmin,
  })

  const { data: plansData } = useQuery({
    queryKey: ['admin', 'subscription-plans'],
    queryFn: () => fetchAdminSubscriptionPlans(),
    enabled: !!isSuperAdmin,
  })
  const plans: SubscriptionPlanOption[] = plansData?.data ?? []

  useEffect(() => {
    if (showAddCompany && addCompanyStep === 'plan') {
      void queryClient.refetchQueries({ queryKey: ['subscription-plans', 'public'] })
    }
  }, [showAddCompany, addCompanyStep, queryClient])

  const updateMut = useMutation({
    mutationFn: ({ tenantId, payload }: { tenantId: number; payload: Parameters<typeof updateAdminSubscription>[1] }) =>
      updateAdminSubscription(tenantId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'subscriptions'] })
      setEditingRow(null)
    },
  })

  const createTenantMut = useMutation({
    mutationFn: createAdminTenant,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'subscriptions'] })
      setShowAddCompany(false)
      setAddCompanyStep('plan')
      setCreateTenantError('')
      setNewCompany({
        name: '',
        company_slug: '',
        manager_username: '',
        manager_password: '',
        manager_name: '',
        subscription_plan_id: '',
        subscription_starts_at: new Date().toISOString().slice(0, 10),
      })
    },
    onError: (err: unknown) => {
      const res = (err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response?.data
      const msg = res?.message ?? res?.errors?.company_slug?.[0] ?? res?.errors?.manager_username?.[0] ?? (isAr ? 'حدث خطأ' : 'An error occurred')
      setCreateTenantError(msg)
    },
  })

  const toggleActiveMut = useMutation({
    mutationFn: toggleAdminTenantActive,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'subscriptions'] })
    },
  })

  const openEdit = (row: AdminSubscriptionRow) => {
    setEditingRow(row)
    setEditForm({
      name: row.name,
      company_slug: row.slug ?? '',
      manager_username: row.manager_username ?? '',
      manager_name: row.manager_name ?? '',
      subscription_plan_id: row.subscription_plan_id ?? '',
      subscription_starts_at: row.subscription_starts_at ?? new Date().toISOString().slice(0, 10),
      subscription_ends_at: row.subscription_ends_at ?? new Date().toISOString().slice(0, 10),
    })
  }

  const handleSaveEdit = () => {
    if (!editingRow) return
    const payload = {
      company_slug: editForm.company_slug.trim() || undefined,
      manager_name: editForm.manager_name.trim() || undefined,
      subscription_plan_id: editForm.subscription_plan_id ? Number(editForm.subscription_plan_id) : undefined,
      subscription_starts_at: editForm.subscription_starts_at || undefined,
      subscription_ends_at: editForm.subscription_ends_at,
    }
    updateMut.mutate({ tenantId: editingRow.id, payload })
  }

  const title = isAr ? 'إدارة الاشتراكات' : 'Subscription Management'
  const locale = isAr ? 'ar-u-nu-latn' : 'en-US'
  const colCompany = isAr ? 'الشركة' : 'Company'
  const colCode = isAr ? 'كود الشركة' : 'Company code'
  const colEmail = isAr ? 'البريد الإلكتروني' : 'Email'
  const colPlan = isAr ? 'نوع الباقة' : 'Plan'
  const colTotalSales = isAr ? "إجمالي مبيعات الشركة (للمراقبة)" : 'Total sales (monitoring)'
  const colLastSeen = isAr ? 'تاريخ آخر ظهور' : 'Last seen'
  const colEndsAt = isAr ? 'تاريخ الانتهاء' : 'Ends at'
  const colStatus = isAr ? 'الحالة' : 'Status'
  const colActions = isAr ? 'إجراءات' : 'Actions'
  const filterStatusLabel = isAr ? 'حالة الاشتراك' : 'Status'
  const filterPlanLabel = isAr ? 'الباقة' : 'Plan'
  const searchPlaceholder = isAr ? 'بحث بكود الشركة أو الاسم...' : 'Search by company code or name...'
  const addCompanyLabel = isAr ? 'إضافة شركة جديدة' : 'Add new company'
  const quickRenewLabel = isAr ? 'تجديد سريع' : 'Quick renew'
  const paymentReminderLabel = isAr ? 'إرسال تنبيه بالدفع' : 'Send payment reminder'
  const cardActive = isAr ? 'إجمالي الاشتراكات النشطة' : 'Total active subscriptions'
  const cardExpected = isAr ? 'قيمة التحصيل المتوقعة هذا الشهر' : 'Expected collection this month'
  const cardDelinquent = isAr ? 'الشركات المتعثرة' : 'Delinquent companies'
  const cardNewToday = isAr ? 'المشتركون الجدد اليوم' : 'New subscribers today'
  const editTitle = isAr ? 'تعديل الاشتراك' : 'Edit subscription'
  const saveLabel = isAr ? 'حفظ' : 'Save'
  const cancelLabel = isAr ? 'إلغاء' : 'Cancel'
  const disableLabel = isAr ? 'تعطيل' : 'Disable'
  const enableLabel = isAr ? 'تفعيل' : 'Enable'

  const rows = data?.data ?? []

  type SubSortKey =
    | 'name'
    | 'slug'
    | 'email'
    | 'plan_name'
    | 'total_sales'
    | 'last_seen_at'
    | 'subscription_ends_at'
    | 'subscription_status'
  const subSortColumns = useMemo((): SortColumn<AdminSubscriptionRow, SubSortKey>[] => {
    return [
      { key: 'name', type: 'string', getValue: (r) => r.name ?? '' },
      { key: 'slug', type: 'string', getValue: (r) => r.slug ?? '' },
      { key: 'email', type: 'string', getValue: (r) => r.company_email ?? r.manager_username ?? '' },
      { key: 'plan_name', type: 'string', getValue: (r) => r.plan_name ?? '' },
      { key: 'total_sales', type: 'number', getValue: (r) => (r.total_sales == null ? 0 : Number(r.total_sales)) },
      { key: 'last_seen_at', type: 'date', getValue: (r) => r.last_seen_at ?? '' },
      { key: 'subscription_ends_at', type: 'date', getValue: (r) => r.subscription_ends_at ?? '' },
      { key: 'subscription_status', type: 'string', getValue: (r) => r.subscription_status ?? '' },
    ]
  }, [])
  const { sort, toggleSort, sortedRows } = useClientSort<AdminSubscriptionRow, SubSortKey>(rows, subSortColumns, {
    locale,
  })

  if (!isSuperAdmin) {
    return (
      <div className="p-4 max-w-2xl mx-auto">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 flex items-start gap-3">
          <ShieldAlert className="w-8 h-8 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h2 className="font-semibold text-amber-900 mb-1">{isAr ? 'غير مصرح' : 'Not authorized'}</h2>
            <p className="text-sm text-amber-800">
              {isAr ? 'هذه الصفحة للمشرف العام فقط.' : 'This page is for super administrator only.'}
            </p>
          </div>
        </div>
      </div>
    )
  }
  const total = data?.total ?? 0
  const lastPage = data?.last_page ?? 1
  const summary = data?.summary ?? {}

  const handleQuickRenew = (row: AdminSubscriptionRow) => {
    const currentEnd = row.subscription_ends_at ? new Date(row.subscription_ends_at) : new Date()
    const nextEnd = new Date(currentEnd)
    nextEnd.setFullYear(nextEnd.getFullYear() + 1)
    const endsAt = nextEnd.toISOString().slice(0, 10)
    const startsAt = row.subscription_starts_at || new Date().toISOString().slice(0, 10)
    updateMut.mutate({
      tenantId: row.id,
      payload: { subscription_ends_at: endsAt, subscription_starts_at: startsAt },
    })
  }

  const handlePaymentReminder = (row: AdminSubscriptionRow) => {
    const email = row.company_email ?? row.manager_username ?? ''
    if (email && String(email).includes('@')) {
      window.location.href = `mailto:${email}?subject=${encodeURIComponent(isAr ? 'تذكير بدفع الاشتراك' : 'Subscription payment reminder')}`
    }
  }

  return (
    <div className="p-3 md:p-4 max-w-[98%] mx-auto" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary-600" />
              {title}
            </h1>
            <button
              type="button"
              onClick={() => {
                setCreateTenantError('')
                setAddCompanyStep('plan')
                setNewCompany((c) => ({ ...c, subscription_plan_id: '' }))
                setShowAddCompany(true)
              }}
              className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700"
            >
              <Plus className="w-4 h-4" />
              {addCompanyLabel}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchCode}
              onChange={(e) => { setSearchCode(e.target.value); setPage(1) }}
              className="h-10 border border-slate-300 rounded-lg bg-white px-3 text-sm focus:ring-1 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none min-w-[180px]"
              dir="ltr"
            />
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-600 whitespace-nowrap">{filterStatusLabel}</label>
              <select
                className="h-10 border border-slate-300 rounded-lg bg-white px-3 text-sm focus:ring-1 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none min-w-[120px]"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as '' | 'active' | 'expired' | 'trial')
                  setPage(1)
                }}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value || 'all'} value={opt.value}>
                    {isAr ? opt.labelAr : opt.labelEn}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-600 whitespace-nowrap">{filterPlanLabel}</label>
              <select
                className="h-10 border border-slate-300 rounded-lg bg-white px-3 text-sm focus:ring-1 focus:ring-inset focus:ring-primary-500 outline-none min-w-[120px]"
                value={planFilter}
                onChange={(e) => { setPlanFilter(e.target.value ? Number(e.target.value) : ''); setPage(1) }}
              >
                <option value="">{isAr ? 'الكل' : 'All'}</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <PageSizeSelect value={perPage} onChange={(v) => { setPerPage(v); setPage(1) }} />
          </div>
        </div>

        {/* Analytics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs text-slate-500 mb-1">{cardActive}</p>
            <p className="text-xl font-bold text-slate-900">{summary.active_count ?? 0}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs text-slate-500 mb-1">{cardExpected}</p>
            <p className="text-xl font-bold text-slate-900">{formatAmount(summary.expected_collection_this_month ?? 0, { decimal_places: 2 }, locale)}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs text-slate-500 mb-1">{cardDelinquent}</p>
            <p className="text-xl font-bold text-red-600">{summary.delinquent_count ?? 0}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs text-slate-500 mb-1">{cardNewToday}</p>
            <p className="text-xl font-bold text-emerald-600">{summary.new_today_count ?? 0}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <SortableTh label={colCompany} sortKey="name" sortState={sort} onToggle={toggleSort} className="text-start py-0 px-0 font-medium text-slate-700" />
                  <SortableTh label={colCode} sortKey="slug" sortState={sort} onToggle={toggleSort} className="text-start py-0 px-0 font-medium text-slate-700" />
                  <SortableTh label={colEmail} sortKey="email" sortState={sort} onToggle={toggleSort} className="text-start py-0 px-0 font-medium text-slate-700" />
                  <SortableTh label={colPlan} sortKey="plan_name" sortState={sort} onToggle={toggleSort} className="text-start py-0 px-0 font-medium text-slate-700" />
                  <SortableTh label={colTotalSales} sortKey="total_sales" sortState={sort} onToggle={toggleSort} className="text-start py-0 px-0 font-medium text-slate-700" />
                  <SortableTh label={colLastSeen} sortKey="last_seen_at" sortState={sort} onToggle={toggleSort} className="text-start py-0 px-0 font-medium text-slate-700" />
                  <SortableTh label={colEndsAt} sortKey="subscription_ends_at" sortState={sort} onToggle={toggleSort} className="text-start py-0 px-0 font-medium text-slate-700" />
                  <SortableTh label={colStatus} sortKey="subscription_status" sortState={sort} onToggle={toggleSort} className="text-start py-0 px-0 font-medium text-slate-700" />
                  <th className="text-start py-2.5 px-3 font-medium text-slate-700 w-36">{colActions}</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-500">
                      <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-primary-500" />
                      {isAr ? 'جاري التحميل...' : 'Loading...'}
                    </td>
                  </tr>
                ) : sortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-500">
                      {isAr ? 'لا توجد بيانات' : 'No data'}
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((row) => (
                    <tr key={row.id} className={`border-b border-slate-100 hover:bg-slate-50/50 ${!row.is_active ? 'opacity-70 bg-slate-50/50' : ''}`}>
                      <td className="py-2.5 px-3 text-slate-800 font-medium">
                        {row.name}
                        {!row.is_active && (
                          <span className="mr-2 text-xs text-amber-700 font-normal">({isAr ? 'معطّل' : 'Disabled'})</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 font-mono text-xs">{row.slug}</td>
                      <td className="py-2.5 px-3 text-slate-700 text-xs">{row.company_email ?? row.manager_username ?? '—'}</td>
                      <td className="py-2.5 px-3 text-slate-700">{row.plan_name}</td>
                      <td className="py-2.5 px-3 text-slate-700 tabular-nums">{row.total_sales != null ? formatAmount(row.total_sales, { decimal_places: 2 }, locale) : '—'}</td>
                      <td className="py-2.5 px-3 text-slate-700">{row.last_seen_at ? formatDisplayDate(row.last_seen_at) : '—'}</td>
                      <td className="py-2.5 px-3 text-slate-700">
                        {row.subscription_ends_at ? formatDisplayDate(row.subscription_ends_at) : '—'}
                      </td>
                      <td className="py-2.5 px-3">
                        <StatusBadge status={row.subscription_status} isAr={isAr} />
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1 flex-wrap">
                          <button
                            type="button"
                            onClick={() => handleQuickRenew(row)}
                            disabled={updateMut.isPending}
                            className="p-1.5 rounded-lg text-primary-600 hover:bg-primary-50 transition-colors"
                            title={quickRenewLabel}
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePaymentReminder(row)}
                            className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
                            title={paymentReminderLabel}
                          >
                            <Mail className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleActiveMut.mutate(row.id)}
                            disabled={toggleActiveMut.isPending}
                            className={`p-1.5 rounded-lg transition-colors ${row.is_active ? 'text-amber-600 hover:bg-amber-50' : 'text-emerald-600 hover:bg-emerald-50'}`}
                            title={row.is_active ? disableLabel : enableLabel}
                          >
                            {row.is_active ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => openEdit(row)}
                            className="p-1.5 rounded-lg text-slate-600 hover:bg-primary-50 hover:text-primary-600 transition-colors"
                            title={isAr ? 'تعديل' : 'Edit'}
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {lastPage > 1 && (
            <div className="flex items-center justify-between py-2 px-3 border-t border-slate-200 bg-slate-50/50">
              <span className="text-xs text-slate-600">
                {isAr ? `الإجمالي: ${total}` : `Total: ${total}`}
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="h-8 px-2 rounded border border-slate-300 bg-white text-sm disabled:opacity-50"
                >
                  {isAr ? 'السابق' : 'Previous'}
                </button>
                <span className="h-8 px-2 flex items-center text-sm text-slate-600">
                  {page} / {lastPage}
                </span>
                <button
                  type="button"
                  disabled={page >= lastPage}
                  onClick={() => setPage((p) => p + 1)}
                  className="h-8 px-2 rounded border border-slate-300 bg-white text-sm disabled:opacity-50"
                >
                  {isAr ? 'التالي' : 'Next'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add company modal — خطوة الباقات ثم بيانات الشركة */}
      {showAddCompany && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40"
          onClick={() => !createTenantMut.isPending && setShowAddCompany(false)}
        >
          <div
            className={`bg-white rounded-xl shadow-lg border border-slate-200 w-full p-4 sm:p-5 max-h-[94vh] overflow-y-auto ${
              addCompanyStep === 'plan' ? 'max-w-6xl' : 'max-w-md'
            }`}
            onClick={(e) => e.stopPropagation()}
            dir={isAr ? 'rtl' : 'ltr'}
          >
            <div className="flex items-center justify-between mb-3 gap-2">
              <div>
                <h3 className="text-base font-semibold text-slate-800">{addCompanyLabel}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {addCompanyStep === 'plan'
                    ? isAr
                      ? 'الخطوة 1 من 2 — اختر الباقة المناسبة'
                      : 'Step 1 of 2 — Choose a plan'
                    : isAr
                      ? 'الخطوة 2 من 2 — بيانات الشركة والمدير'
                      : 'Step 2 of 2 — Company & manager details'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => !createTenantMut.isPending && setShowAddCompany(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {createTenantError && addCompanyStep === 'details' && (
              <div className="mb-3 p-2 rounded-lg bg-red-50 text-red-700 text-xs">{createTenantError}</div>
            )}

            {addCompanyStep === 'plan' ? (
              <>
                <SubscriptionPlanPicker
                  selectedPlanId={newCompany.subscription_plan_id}
                  onSelect={(id) => setNewCompany((c) => ({ ...c, subscription_plan_id: id }))}
                  isAr={isAr}
                />
                <div className="flex justify-end gap-2 mt-5 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => !createTenantMut.isPending && setShowAddCompany(false)}
                    className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-medium"
                  >
                    {cancelLabel}
                  </button>
                  <button
                    type="button"
                    disabled={!newCompany.subscription_plan_id}
                    onClick={() => setAddCompanyStep('details')}
                    className="h-9 px-4 rounded-lg bg-primary-600 text-white text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                  >
                    {isAr ? 'التالي' : 'Next'}
                    {isAr ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                  </button>
                </div>
              </>
            ) : (
              <>
                {newCompany.subscription_plan_id && (
                  <button
                    type="button"
                    onClick={() => setAddCompanyStep('plan')}
                    className="mb-3 text-xs font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1"
                  >
                    {isAr ? <ArrowRight className="w-3.5 h-3.5" /> : <ArrowLeft className="w-3.5 h-3.5" />}
                    {isAr ? 'تغيير الباقة' : 'Change plan'}
                  </button>
                )}
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-0.5">{isAr ? 'اسم الشركة' : 'Company name'}</label>
                    <input
                      type="text"
                      className="w-full h-9 border border-slate-300 rounded-lg px-2.5 text-sm"
                      value={newCompany.name}
                      onChange={(e) => setNewCompany((c) => ({ ...c, name: e.target.value }))}
                      placeholder={isAr ? 'اسم الشركة' : 'Company name'}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-0.5">{isAr ? 'معرف الشركة المختصر' : 'Company ID (slug)'}</label>
                    <input
                      type="text"
                      className="w-full h-9 border border-slate-300 rounded-lg px-2.5 text-sm font-mono"
                      value={newCompany.company_slug}
                      onChange={(e) => setNewCompany((c) => ({ ...c, company_slug: e.target.value.replace(/[^a-zA-Z0-9_-]/g, '') }))}
                      placeholder={isAr ? 'مثال: my-company' : 'e.g. my-company'}
                      dir="ltr"
                    />
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {isAr ? 'أحرف إنجليزية، أرقام، شرطة فقط. يُستخدم في تسجيل الدخول.' : 'Letters, numbers, hyphen only. Used for login.'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-0.5">{isAr ? 'اسم مستخدم المدير' : 'Manager username'}</label>
                    <input
                      type="text"
                      className="w-full h-9 border border-slate-300 rounded-lg px-2.5 text-sm"
                      value={newCompany.manager_username}
                      onChange={(e) => setNewCompany((c) => ({ ...c, manager_username: e.target.value }))}
                      placeholder={isAr ? 'مثال: amir2026 أو admin@company.com' : 'e.g. amir2026 or admin@company.com'}
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-0.5">{isAr ? 'كلمة مرور المدير' : 'Manager password'}</label>
                    <input
                      type="password"
                      className="w-full h-9 border border-slate-300 rounded-lg px-2.5 text-sm"
                      value={newCompany.manager_password}
                      onChange={(e) => setNewCompany((c) => ({ ...c, manager_password: e.target.value }))}
                      placeholder="••••••••"
                      minLength={8}
                    />
                    <p className="text-[10px] text-slate-500 mt-0.5">{isAr ? '8 أحرف على الأقل' : 'At least 8 characters'}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-0.5">{isAr ? 'اسم المدير (اختياري)' : 'Manager name (opt.)'}</label>
                    <input
                      type="text"
                      className="w-full h-9 border border-slate-300 rounded-lg px-2.5 text-sm"
                      value={newCompany.manager_name}
                      onChange={(e) => setNewCompany((c) => ({ ...c, manager_name: e.target.value }))}
                      placeholder="—"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-0.5">{isAr ? 'بدء الاشتراك' : 'Start date'}</label>
                    <input
                      type="date"
                      className="w-full h-9 border border-slate-300 rounded-lg px-2.5 text-sm"
                      value={newCompany.subscription_starts_at}
                      onChange={(e) => setNewCompany((c) => ({ ...c, subscription_starts_at: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="flex justify-between gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => setAddCompanyStep('plan')}
                    className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-medium"
                  >
                    {isAr ? 'رجوع' : 'Back'}
                  </button>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => !createTenantMut.isPending && setShowAddCompany(false)}
                      className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-medium"
                    >
                      {cancelLabel}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          !newCompany.name.trim() ||
                          !newCompany.company_slug.trim() ||
                          !newCompany.manager_username.trim() ||
                          !newCompany.manager_password ||
                          newCompany.manager_password.length < 8 ||
                          !newCompany.subscription_plan_id
                        )
                          return
                        createTenantMut.mutate({
                          name: newCompany.name.trim(),
                          company_slug: newCompany.company_slug.trim().toLowerCase(),
                          manager_username: newCompany.manager_username.trim(),
                          manager_password: newCompany.manager_password,
                          manager_name: newCompany.manager_name.trim() || undefined,
                          subscription_plan_id: Number(newCompany.subscription_plan_id),
                          subscription_starts_at: newCompany.subscription_starts_at,
                        })
                      }}
                      disabled={
                        createTenantMut.isPending ||
                        !newCompany.name.trim() ||
                        !newCompany.company_slug.trim() ||
                        !newCompany.manager_username.trim() ||
                        !newCompany.manager_password ||
                        newCompany.manager_password.length < 8 ||
                        !newCompany.subscription_plan_id
                      }
                      className="h-9 px-3 rounded-lg bg-primary-600 text-white text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                    >
                      {createTenantMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      {saveLabel}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Edit modal — بطاقة كاملة مثل الإضافة، مع تعطيل اسم الشركة واسم المستخدم وكلمة المرور */}
      {editingRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => !updateMut.isPending && setEditingRow(null)}>
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 w-full max-w-md p-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-slate-800">{editTitle}: {editingRow.name}</h3>
              <button type="button" onClick={() => !updateMut.isPending && setEditingRow(null)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-0.5">{isAr ? 'اسم الشركة' : 'Company name'}</label>
                <input type="text" className="w-full h-9 border border-slate-200 rounded-lg px-2.5 text-sm bg-slate-50 text-slate-600" value={editForm.name} readOnly disabled />
                <p className="text-[10px] text-slate-500 mt-0.5">{isAr ? 'لا يمكن تعديله' : 'Not editable'}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-0.5">{isAr ? 'معرف الشركة المختصر' : 'Company ID (slug)'}</label>
                <input
                  type="text"
                  className="w-full h-9 border border-slate-300 rounded-lg px-2.5 text-sm font-mono"
                  value={editForm.company_slug}
                  onChange={(e) => setEditForm((f) => ({ ...f, company_slug: e.target.value.replace(/[^a-zA-Z0-9_-]/g, '') }))}
                  placeholder={isAr ? 'مثال: my-company' : 'e.g. my-company'}
                  dir="ltr"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-0.5">{isAr ? 'اسم مستخدم المدير' : 'Manager username'}</label>
                <input type="text" className="w-full h-9 border border-slate-200 rounded-lg px-2.5 text-sm bg-slate-50 text-slate-600" value={editForm.manager_username} readOnly disabled dir="ltr" />
                <p className="text-[10px] text-slate-500 mt-0.5">{isAr ? 'لا يمكن تعديله' : 'Not editable'}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-0.5">{isAr ? 'كلمة مرور المدير' : 'Manager password'}</label>
                <input type="password" className="w-full h-9 border border-slate-200 rounded-lg px-2.5 text-sm bg-slate-50 text-slate-500" value="••••••••" readOnly disabled />
                <p className="text-[10px] text-slate-500 mt-0.5">{isAr ? 'لا يمكن تعديلها' : 'Not editable'}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-0.5">{isAr ? 'اسم المدير (اختياري)' : 'Manager name (opt.)'}</label>
                <input
                  type="text"
                  className="w-full h-9 border border-slate-300 rounded-lg px-2.5 text-sm"
                  value={editForm.manager_name}
                  onChange={(e) => setEditForm((f) => ({ ...f, manager_name: e.target.value }))}
                  placeholder="—"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-0.5">{isAr ? 'الباقة' : 'Plan'}</label>
                  <select
                    className="w-full h-9 border border-slate-300 rounded-lg px-2.5 text-sm bg-white"
                    value={editForm.subscription_plan_id}
                    onChange={(e) => setEditForm((f) => ({ ...f, subscription_plan_id: e.target.value ? Number(e.target.value) : '' }))}
                  >
                    <option value="">—</option>
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-0.5">{isAr ? 'بدء الاشتراك' : 'Start date'}</label>
                  <input
                    type="date"
                    className="w-full h-9 border border-slate-300 rounded-lg px-2.5 text-sm"
                    value={editForm.subscription_starts_at}
                    onChange={(e) => setEditForm((f) => ({ ...f, subscription_starts_at: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-0.5">{isAr ? 'تاريخ الانتهاء' : 'End date'}</label>
                <input
                  type="date"
                  className="w-full h-9 border border-slate-300 rounded-lg px-2.5 text-sm"
                  value={editForm.subscription_ends_at}
                  onChange={(e) => setEditForm((f) => ({ ...f, subscription_ends_at: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" onClick={() => !updateMut.isPending && setEditingRow(null)} className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-medium">
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={updateMut.isPending || !editForm.subscription_ends_at}
                className="h-9 px-3 rounded-lg bg-primary-600 text-white text-sm font-medium flex items-center gap-2 disabled:opacity-50"
              >
                {updateMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {saveLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
