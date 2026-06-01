import { useState, useMemo, useEffect, type ReactNode } from 'react'
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
import {
  Building2,
  Pencil,
  X,
  Check,
  Loader2,
  ShieldAlert,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  Mail,
  ArrowRight,
  ArrowLeft,
  Search,
  Users,
  Banknote,
  AlertTriangle,
  TrendingUp,
  Calendar,
  CreditCard,
  Inbox,
} from 'lucide-react'
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

function companyInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return (name.trim().slice(0, 2) || '??').toUpperCase()
}

function avatarColorFromName(name: string): string {
  const palette = [
    'bg-violet-500',
    'bg-blue-500',
    'bg-emerald-500',
    'bg-amber-500',
    'bg-rose-500',
    'bg-cyan-500',
    'bg-indigo-500',
  ]
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i)) % palette.length
  return palette[h]
}

function planBadgeClass(slug: string | null | undefined): string {
  const map: Record<string, string> = {
    basic: 'bg-slate-100 text-slate-700 ring-slate-200',
    advanced: 'bg-blue-50 text-blue-800 ring-blue-200',
    integrated: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    professional: 'bg-violet-50 text-violet-800 ring-violet-200',
    medium: 'bg-slate-100 text-slate-600 ring-slate-200',
  }
  return map[slug ?? ''] ?? 'bg-slate-100 text-slate-700 ring-slate-200'
}

function StatusBadge({ status, isAr }: { status: string; isAr: boolean }) {
  const labels: Record<string, string> = {
    active: isAr ? 'نشط' : 'Active',
    expired: isAr ? 'منتهي' : 'Expired',
    trial: isAr ? 'تجريبي' : 'Trial',
    suspended: isAr ? 'معلق' : 'Suspended',
    cancelled: isAr ? 'ملغى' : 'Cancelled',
  }
  const colors: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
    expired: 'bg-red-100 text-red-800 ring-red-200',
    trial: 'bg-amber-100 text-amber-900 ring-amber-200',
    suspended: 'bg-amber-100 text-amber-900 ring-amber-200',
    cancelled: 'bg-slate-100 text-slate-600 ring-slate-200',
  }
  const c = colors[status] ?? 'bg-slate-100 text-slate-700 ring-slate-200'
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${c}`}>
      {labels[status] ?? status}
    </span>
  )
}

function isExpirySoonOrPast(endsAt: string | null | undefined): 'past' | 'soon' | 'ok' {
  if (!endsAt) return 'ok'
  const end = new Date(endsAt)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  end.setHours(0, 0, 0, 0)
  if (end < now) return 'past'
  const days = (end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  if (days <= 30) return 'soon'
  return 'ok'
}

type MetricCardProps = {
  label: string
  value: ReactNode
  icon: ReactNode
  borderAccent: string
  iconWrap: string
  subtleBg?: string
}

function MetricCard({ label, value, icon, borderAccent, iconWrap, subtleBg = '' }: MetricCardProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${subtleBg}`}
    >
      <div className={`absolute top-0 bottom-0 w-1 start-0 ${borderAccent}`} aria-hidden />
      <div className="flex items-start justify-between gap-3 ps-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-slate-500 mb-1 leading-snug">{label}</p>
          <div className="text-2xl font-bold text-slate-900 tabular-nums tracking-tight">{value}</div>
        </div>
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconWrap}`}>{icon}</div>
      </div>
    </div>
  )
}

function ActionIconBtn({
  onClick,
  disabled,
  title,
  className,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  title: string
  className: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-2 rounded-lg transition-all duration-150 disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
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

  const openAddCompany = () => {
    setCreateTenantError('')
    setAddCompanyStep('plan')
    setNewCompany((c) => ({ ...c, subscription_plan_id: '' }))
    setShowAddCompany(true)
  }

  const filterSelectClass =
    'h-10 appearance-none rounded-lg border border-slate-200 bg-white ps-3 pe-8 text-sm text-slate-800 shadow-sm transition-colors hover:border-slate-300 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 min-w-[130px]'

  return (
    <div className="p-3 md:p-5 max-w-[98%] mx-auto space-y-5" dir={isAr ? 'rtl' : 'ltr'}>
      {/* Page header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-primary-600">
              <CreditCard className="w-5 h-5" />
            </span>
            {title}
          </h1>
          <p className="text-sm text-slate-500 mt-1 ps-12 sm:ps-0">
            {isAr ? 'متابعة الشركات والاشتراكات والتحصيل' : 'Monitor companies, plans, and billing'}
          </p>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          label={cardActive}
          value={summary.active_count ?? 0}
          borderAccent="bg-emerald-500"
          iconWrap="bg-emerald-100 text-emerald-600"
          subtleBg="bg-emerald-50/30"
          icon={<Users className="w-5 h-5" />}
        />
        <MetricCard
          label={cardExpected}
          value={formatAmount(summary.expected_collection_this_month ?? 0, { decimal_places: 2 }, locale)}
          borderAccent="bg-blue-500"
          iconWrap="bg-blue-100 text-blue-600"
          subtleBg="bg-blue-50/30"
          icon={<Banknote className="w-5 h-5" />}
        />
        <MetricCard
          label={cardDelinquent}
          value={<span className="text-red-600">{summary.delinquent_count ?? 0}</span>}
          borderAccent="bg-red-500"
          iconWrap="bg-red-100 text-red-600"
          subtleBg="bg-red-50/30"
          icon={<AlertTriangle className="w-5 h-5" />}
        />
        <MetricCard
          label={cardNewToday}
          value={<span className="text-violet-700">{summary.new_today_count ?? 0}</span>}
          borderAccent="bg-violet-500"
          iconWrap="bg-violet-100 text-violet-600"
          subtleBg="bg-violet-50/30"
          icon={<TrendingUp className="w-5 h-5" />}
        />
      </div>

      {/* Filters bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 flex-1">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search
                className="absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none start-3"
                aria-hidden
              />
              <input
                type="text"
                placeholder={searchPlaceholder}
                value={searchCode}
                onChange={(e) => {
                  setSearchCode(e.target.value)
                  setPage(1)
                }}
                className="w-full h-10 rounded-lg border border-slate-200 bg-slate-50/80 ps-10 pe-3 text-sm text-slate-800 placeholder:text-slate-400 transition-colors focus:bg-white focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                dir="ltr"
              />
            </div>
            <select
              className={filterSelectClass}
              value={planFilter}
              onChange={(e) => {
                setPlanFilter(e.target.value ? Number(e.target.value) : '')
                setPage(1)
              }}
              aria-label={filterPlanLabel}
            >
              <option value="">
                {filterPlanLabel}: {isAr ? 'الكل' : 'All'}
              </option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              className={filterSelectClass}
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as '' | 'active' | 'expired' | 'trial')
                setPage(1)
              }}
              aria-label={filterStatusLabel}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value || 'all'} value={opt.value}>
                  {filterStatusLabel}: {isAr ? opt.labelAr : opt.labelEn}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-2 justify-between sm:justify-end">
            <PageSizeSelect value={perPage} onChange={(v) => { setPerPage(v); setPage(1) }} />
            <button
              type="button"
              onClick={openAddCompany}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-teal-600 text-white text-sm font-semibold shadow-sm shadow-teal-900/15 hover:bg-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/40 transition-colors"
            >
              <Plus className="w-4 h-4" />
              {addCompanyLabel}
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[calc(100vh-22rem)]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm border-b border-slate-200 shadow-sm">
              <tr>
                <SortableTh label={colCompany} sortKey="name" sortState={sort} onToggle={toggleSort} className="text-start py-3 px-3 font-semibold text-slate-700" />
                <SortableTh label={colEmail} sortKey="email" sortState={sort} onToggle={toggleSort} className="text-start py-3 px-3 font-semibold text-slate-700" />
                <SortableTh label={colPlan} sortKey="plan_name" sortState={sort} onToggle={toggleSort} className="text-start py-3 px-3 font-semibold text-slate-700" />
                <SortableTh label={colTotalSales} sortKey="total_sales" sortState={sort} onToggle={toggleSort} className="text-start py-3 px-3 font-semibold text-slate-700 hidden lg:table-cell" />
                <SortableTh label={colLastSeen} sortKey="last_seen_at" sortState={sort} onToggle={toggleSort} className="text-start py-3 px-3 font-semibold text-slate-700 hidden md:table-cell" />
                <SortableTh label={colEndsAt} sortKey="subscription_ends_at" sortState={sort} onToggle={toggleSort} className="text-start py-3 px-3 font-semibold text-slate-700" />
                <SortableTh label={colStatus} sortKey="subscription_status" sortState={sort} onToggle={toggleSort} className="text-start py-3 px-3 font-semibold text-slate-700" />
                <th className="text-start py-3 px-3 font-semibold text-slate-700 w-40">{colActions}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-500">
                    <Loader2 className="w-9 h-9 animate-spin mx-auto mb-3 text-teal-600" />
                    {isAr ? 'جاري التحميل...' : 'Loading...'}
                  </td>
                </tr>
              ) : sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-0">
                    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 mb-4">
                        <Inbox className="w-10 h-10" />
                      </div>
                      <h3 className="text-base font-semibold text-slate-800 mb-1">
                        {isAr ? 'لا توجد اشتراكات' : 'No subscriptions yet'}
                      </h3>
                      <p className="text-sm text-slate-500 max-w-sm mb-6">
                        {isAr
                          ? 'ابدأ بإضافة شركة جديدة وربطها بباقة اشتراك.'
                          : 'Get started by adding a new company and assigning a plan.'}
                      </p>
                      <button
                        type="button"
                        onClick={openAddCompany}
                        className="inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-500 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        {addCompanyLabel}
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                sortedRows.map((row) => {
                  const expiryState = isExpirySoonOrPast(row.subscription_ends_at)
                  const email = row.company_email ?? row.manager_username ?? ''
                  return (
                    <tr
                      key={row.id}
                      className={`border-b border-slate-100 transition-colors hover:bg-slate-50/80 ${
                        !row.is_active ? 'opacity-75 bg-slate-50/40' : ''
                      }`}
                    >
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-3 min-w-[180px]">
                          <div
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm ${avatarColorFromName(row.name)}`}
                          >
                            {companyInitials(row.name)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 truncate">
                              {row.name}
                              {!row.is_active && (
                                <span className="ms-1.5 text-[10px] font-normal text-amber-700">
                                  ({isAr ? 'معطّل' : 'Off'})
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-slate-500 font-mono truncate" dir="ltr">
                              {row.slug}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        {email ? (
                          <a
                            href={String(email).includes('@') ? `mailto:${email}` : undefined}
                            className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-teal-700 transition-colors max-w-[200px]"
                            dir="ltr"
                          >
                            <Mail className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                            <span className="truncate">{email}</span>
                          </a>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${planBadgeClass(row.plan_slug)}`}
                        >
                          {row.plan_name || '—'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-700 tabular-nums hidden lg:table-cell">
                        {row.total_sales != null ? formatAmount(row.total_sales, { decimal_places: 2 }, locale) : '—'}
                      </td>
                      <td className="py-3 px-3 text-slate-600 text-xs hidden md:table-cell">
                        {row.last_seen_at ? formatDisplayDate(row.last_seen_at) : '—'}
                      </td>
                      <td className="py-3 px-3">
                        {row.subscription_ends_at ? (
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-medium ${
                              expiryState === 'past' || expiryState === 'soon'
                                ? 'text-red-600'
                                : 'text-slate-700'
                            }`}
                          >
                            <Calendar className="w-3.5 h-3.5 shrink-0 opacity-70" />
                            {formatDisplayDate(row.subscription_ends_at)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <StatusBadge status={row.subscription_status} isAr={isAr} />
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-0.5">
                          <ActionIconBtn
                            onClick={() => openEdit(row)}
                            title={isAr ? 'تعديل' : 'Edit'}
                            className="text-slate-600 hover:bg-primary-50 hover:text-primary-600"
                          >
                            <Pencil className="w-4 h-4" />
                          </ActionIconBtn>
                          <ActionIconBtn
                            onClick={() => handlePaymentReminder(row)}
                            title={paymentReminderLabel}
                            className="text-slate-600 hover:bg-blue-50 hover:text-blue-600"
                          >
                            <Mail className="w-4 h-4" />
                          </ActionIconBtn>
                          <ActionIconBtn
                            onClick={() => handleQuickRenew(row)}
                            disabled={updateMut.isPending}
                            title={quickRenewLabel}
                            className="text-teal-600 hover:bg-teal-50"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </ActionIconBtn>
                          <ActionIconBtn
                            onClick={() => toggleActiveMut.mutate(row.id)}
                            disabled={toggleActiveMut.isPending}
                            title={row.is_active ? disableLabel : enableLabel}
                            className={
                              row.is_active
                                ? 'text-amber-600 hover:bg-amber-50'
                                : 'text-emerald-600 hover:bg-emerald-50'
                            }
                          >
                            {row.is_active ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                          </ActionIconBtn>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {lastPage > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-2 py-3 px-4 border-t border-slate-200 bg-slate-50/80">
            <span className="text-xs font-medium text-slate-600">
              {isAr ? `الإجمالي: ${total}` : `Total: ${total}`}
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
              >
                {isAr ? 'السابق' : 'Previous'}
              </button>
              <span className="h-8 px-3 flex items-center text-sm font-medium text-slate-600 tabular-nums">
                {page} / {lastPage}
              </span>
              <button
                type="button"
                disabled={page >= lastPage}
                onClick={() => setPage((p) => p + 1)}
                className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
              >
                {isAr ? 'التالي' : 'Next'}
              </button>
            </div>
          </div>
        )}
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
