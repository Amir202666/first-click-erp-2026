import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  Eye,
  Loader2,
  Percent,
  DollarSign,
  Gift,
  TrendingUp,
  Receipt,
  Tablet,
  UtensilsCrossed,
  Truck,
  Save,
  X,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { promotionsApi } from '../../api/promotions'
import { fetchItemCategories, fetchItemsForFilter } from '../../api/tenant'
import { loyaltyApi } from '../../api/loyalty'
import type { Promotion, PromotionChannel, PromotionType } from '../../types/promotions'
import Toast, { type ToastType } from '../../components/ui/Toast'

type TabId = 'basics' | 'conditions' | 'limits' | 'schedule' | 'performance'
type AppliesTo = 'all' | 'items' | 'categories'

const PREVIEW_AMOUNT = 1000

const DISCOUNT_TYPES: {
  id: PromotionType
  icon: typeof Percent
  iconBg: string
  iconColor: string
  ar: string
  en: string
  descAr: string
  descEn: string
}[] = [
  {
    id: 'percentage',
    icon: Percent,
    iconBg: '#ede9fe',
    iconColor: '#4f46e5',
    ar: 'نسبة %',
    en: 'Percentage',
    descAr: 'خصم من الإجمالي',
    descEn: 'Discount from total',
  },
  {
    id: 'fixed',
    icon: DollarSign,
    iconBg: '#fef3c7',
    iconColor: '#b45309',
    ar: 'مبلغ ثابت',
    en: 'Fixed amount',
    descAr: 'خصم مبلغ محدد',
    descEn: 'Fixed discount',
  },
  {
    id: 'bogo',
    icon: Gift,
    iconBg: '#ecfdf5',
    iconColor: '#059669',
    ar: 'BOGO',
    en: 'BOGO',
    descAr: 'اشترِ X واحصل على Y',
    descEn: 'Buy X get Y',
  },
  {
    id: 'min_purchase',
    icon: TrendingUp,
    iconBg: '#fef2f2',
    iconColor: '#dc2626',
    ar: 'حد أدنى',
    en: 'Minimum spend',
    descAr: 'خصم عند تجاوز مبلغ',
    descEn: 'Discount above amount',
  },
]

const CHANNEL_DEFS: { id: PromotionChannel; labelAr: string; labelEn: string; icon: typeof Receipt }[] = [
  { id: 'invoice', labelAr: 'فاتورة مبيعات', labelEn: 'Sales invoice', icon: Receipt },
  { id: 'pos', labelAr: 'POS كاشير', labelEn: 'POS cashier', icon: Tablet },
  { id: 'restaurant', labelAr: 'مطعم', labelEn: 'Restaurant', icon: UtensilsCrossed },
  { id: 'delivery', labelAr: 'توصيل', labelEn: 'Delivery', icon: Truck },
]

/** 0=السبت … 6=الجمعة (Carbon: 0=أحد … 6=سبت) */
const DAY_CHIPS: { dow: number; ar: string; en: string }[] = [
  { dow: 6, ar: 'السبت', en: 'Sat' },
  { dow: 0, ar: 'الأحد', en: 'Sun' },
  { dow: 1, ar: 'الاثنين', en: 'Mon' },
  { dow: 2, ar: 'الثلاثاء', en: 'Tue' },
  { dow: 3, ar: 'الأربعاء', en: 'Wed' },
  { dow: 4, ar: 'الخميس', en: 'Thu' },
  { dow: 5, ar: 'الجمعة', en: 'Fri' },
]

const ALL_DAYS = DAY_CHIPS.map((d) => d.dow)

const emptyForm: Partial<Promotion> = {
  name: '',
  code: '',
  description: '',
  type: 'percentage',
  value: 0,
  min_purchase_amount: 0,
  max_discount_amount: null,
  buy_quantity: 2,
  get_quantity: 1,
  get_discount_percent: 100,
  channels: ['invoice', 'pos'],
  customer_tiers: [],
  customer_ids: [],
  item_ids: [],
  category_ids: [],
  max_uses: null,
  max_uses_per_day: null,
  max_uses_per_customer: null,
  start_date: '',
  end_date: '',
  active_from: '',
  active_to: '',
  active_days: [...ALL_DAYS],
  status: 'active',
  is_combinable: false,
  priority: 0,
}

function inputCls() {
  return 'mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-indigo-500/40 outline-none'
}

function sectionCard(title: string, children: React.ReactNode, hint?: string) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        {hint ? <p className="text-xs text-slate-500 mt-0.5">{hint}</p> : null}
      </div>
      {children}
    </div>
  )
}

function ToggleSwitch({
  checked,
  onChange,
  label,
  desc,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  desc: string
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-slate-100 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800">{label}</p>
        <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${
          checked ? 'bg-indigo-600' : 'bg-slate-200'
        }`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'start-0.5 translate-x-5 rtl:-translate-x-5' : 'start-0.5'
          }`}
        />
      </button>
    </div>
  )
}

function validateForm(form: Partial<Promotion>, lang: string): string[] {
  const errors: string[] = []
  const ar = lang === 'ar'

  if (!form.name?.trim()) errors.push(ar ? 'اسم العرض مطلوب' : 'Offer name is required')

  if (form.type === 'percentage' && (!form.value || form.value <= 0)) {
    errors.push(ar ? 'النسبة يجب أن تكون أكبر من صفر' : 'Percentage must be > 0')
  }
  if (form.type === 'fixed' && (!form.value || form.value <= 0)) {
    errors.push(ar ? 'مبلغ الخصم مطلوب' : 'Fixed amount is required')
  }
  if (form.type === 'min_purchase' && (!form.value || form.value <= 0)) {
    errors.push(ar ? 'نسبة الخصم عند التجاوز مطلوبة' : 'Threshold discount percent is required')
  }
  if (form.start_date && form.end_date && form.start_date > form.end_date) {
    errors.push(ar ? 'تاريخ البداية يجب أن يكون قبل تاريخ النهاية' : 'Start date must be before end date')
  }
  if (!form.channels?.length) {
    errors.push(ar ? 'اختر قناة واحدة على الأقل' : 'Select at least one channel')
  }

  return errors
}

export default function PromotionForm() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const { currentTenant } = useAuth()
  const { lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const ar = lang === 'ar'

  const [form, setForm] = useState<Partial<Promotion>>(emptyForm)
  const [activeTab, setActiveTab] = useState<TabId>('basics')
  const [appliesTo, setAppliesTo] = useState<AppliesTo>('all')
  const [bogoFreeItemId, setBogoFreeItemId] = useState<number | null>(null)
  const [itemSearch, setItemSearch] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(isEdit)
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [stats, setStats] = useState<{
    usage_count?: number
    total_discount_given?: number
    current_uses?: number
  }>({})

  useEffect(() => {
    if (!isEdit || !tenantId || !id) return
    setLoading(true)
    promotionsApi
      .get(tenantId, Number(id))
      .then((r) => {
        const p = r.data.data
        const itemIds = p.item_ids ?? []
        const catIds = p.category_ids ?? []
        setForm({
          ...p,
          start_date: p.start_date?.slice(0, 10) ?? '',
          end_date: p.end_date?.slice(0, 10) ?? '',
          active_from: p.active_from?.slice(0, 5) ?? '',
          active_to: p.active_to?.slice(0, 5) ?? '',
          customer_tiers: p.customer_tiers ?? [],
          customer_ids: p.customer_ids ?? [],
          item_ids: itemIds,
          category_ids: catIds,
          active_days:
            p.active_days && p.active_days.length > 0 ? p.active_days : [...ALL_DAYS],
        })
        if (catIds.length > 0) setAppliesTo('categories')
        else if (itemIds.length > 0) setAppliesTo('items')
        else setAppliesTo('all')
        if (p.type === 'bogo' && itemIds[0]) setBogoFreeItemId(itemIds[0])
        setStats({
          usage_count: (p as Promotion & { usage_count?: number }).usage_count,
          total_discount_given: (p as Promotion & { total_discount_given?: number }).total_discount_given,
          current_uses: p.current_uses,
        })
      })
      .catch(() => setToast({ message: ar ? 'فشل التحميل' : 'Load failed', type: 'error' }))
      .finally(() => setLoading(false))
  }, [id, isEdit, tenantId, ar])

  const { data: items = [] } = useQuery({
    queryKey: ['items-filter', tenantId, 'promo-form'],
    queryFn: () => fetchItemsForFilter(tenantId, { per_page: '500' }),
    enabled: !!tenantId,
    select: (res: unknown) => {
      const r = res as { data?: { id: number; name: string }[] }
      return (Array.isArray(res) ? res : r?.data ?? []) as { id: number; name: string }[]
    },
  })

  const { data: categories = [] } = useQuery({
    queryKey: ['item-categories', tenantId, 'promo-form'],
    queryFn: () => fetchItemCategories(tenantId),
    enabled: !!tenantId,
    select: (res: unknown) => {
      const r = res as { data?: { id: number; name: string }[] }
      return (Array.isArray(res) ? res : r?.data ?? []) as { id: number; name: string }[]
    },
  })

  const { data: tiers = [] } = useQuery({
    queryKey: ['loyalty-tiers', tenantId, 'promo-form'],
    queryFn: () => loyaltyApi.getTiers(tenantId).then((r) => r.data.data ?? []),
    enabled: !!tenantId,
  })

  const { data: reportData } = useQuery({
    queryKey: ['promotions-report', tenantId, id, 'form-stats'],
    queryFn: () => promotionsApi.report(tenantId),
    enabled: !!tenantId && isEdit && activeTab === 'performance',
  })

  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase()
    if (!q) return items
    return items.filter((it) => it.name.toLowerCase().includes(q))
  }, [items, itemSearch])

  const discountPreview = useMemo(() => {
    const amount = PREVIEW_AMOUNT
    const type = form.type ?? 'percentage'
    const value = Number(form.value) || 0
    const maxD = form.max_discount_amount != null ? Number(form.max_discount_amount) : null
    const minP = Number(form.min_purchase_amount) || 0

    let discount = 0
    if (type === 'percentage') {
      discount = amount * (value / 100)
      if (maxD != null) discount = Math.min(discount, maxD)
    } else if (type === 'fixed') {
      discount = Math.min(value, amount)
    } else if (type === 'min_purchase') {
      if (amount >= minP) discount = amount * (value / 100)
      if (maxD != null) discount = Math.min(discount, maxD)
    } else if (type === 'bogo') {
      discount = Math.round(amount * 0.1 * 1000) / 1000
    }
    discount = Math.round(discount * 1000) / 1000
    return { discount, final: Math.max(0, amount - discount) }
  }, [form.type, form.value, form.max_discount_amount, form.min_purchase_amount])

  const limitsCount = [
    form.max_uses,
    form.max_uses_per_day,
    form.max_uses_per_customer,
  ].filter((v) => v != null).length

  const performanceUsages = useMemo(() => {
    if (!id || !reportData?.data?.data) return []
    const pid = Number(id)
    return reportData.data.data.filter(
      (u) => u.promotion_id === pid || u.promotion?.id === pid,
    )
  }, [reportData, id])

  const last7DaysChart = useMemo(() => {
    const days: { label: string; count: number; discount: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      const label = d.toLocaleDateString(ar ? 'ar-KW' : 'en', { weekday: 'short', day: 'numeric' })
      const dayRows = performanceUsages.filter((u) => u.used_at?.slice(0, 10) === key)
      days.push({
        label,
        count: dayRows.length,
        discount: dayRows.reduce((s, u) => s + Number(u.discount_amount), 0),
      })
    }
    const maxCount = Math.max(1, ...days.map((d) => d.count))
    return { days, maxCount }
  }, [performanceUsages, ar])

  function patch<K extends keyof Promotion>(key: K, value: Promotion[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function toggleChannel(ch: PromotionChannel) {
    const cur = form.channels ?? []
    patch(
      'channels',
      cur.includes(ch) ? (cur.filter((c) => c !== ch) as PromotionChannel[]) : [...cur, ch],
    )
  }

  function toggleTier(name: string) {
    const cur = form.customer_tiers ?? []
    patch(
      'customer_tiers',
      cur.includes(name) ? cur.filter((t) => t !== name) : [...cur, name],
    )
  }

  function toggleDay(dow: number) {
    const cur = form.active_days ?? []
    const next = cur.includes(dow) ? cur.filter((d) => d !== dow) : [...cur, dow]
    patch('active_days', next.length > 0 ? next : [])
  }

  function changeAppliesTo(mode: AppliesTo) {
    setAppliesTo(mode)
    if (mode === 'all') {
      patch('item_ids', [])
      patch('category_ids', [])
    } else if (mode === 'items') {
      patch('category_ids', [])
    } else {
      patch('item_ids', [])
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errors = validateForm(form, lang)
    setValidationErrors(errors)
    if (errors.length > 0) {
      setToast({ message: errors[0], type: 'error' })
      return
    }
    if (!tenantId || !form.name?.trim()) return

    setSaving(true)
    let itemIds = form.item_ids ?? []
    if (form.type === 'bogo' && bogoFreeItemId) {
      itemIds = [bogoFreeItemId, ...itemIds.filter((x) => x !== bogoFreeItemId)]
    }

    const payload = {
      ...form,
      item_ids: itemIds,
      code: form.code?.trim() || null,
      description: form.description?.trim() || null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      active_from: form.active_from || null,
      active_to: form.active_to || null,
      active_days:
        form.active_days && form.active_days.length > 0 ? form.active_days : null,
      max_discount_amount: form.max_discount_amount || null,
      max_uses: form.max_uses || null,
      max_uses_per_day: form.max_uses_per_day || null,
      max_uses_per_customer: form.max_uses_per_customer || null,
      status: form.status === 'draft' ? 'draft' : form.status,
    }

    try {
      if (isEdit && id) {
        await promotionsApi.update(tenantId, Number(id), payload)
      } else {
        await promotionsApi.create(tenantId, payload)
      }
      navigate('/promotions')
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (ar ? 'فشل الحفظ' : 'Save failed')
      setToast({ message: msg, type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const tabs: { id: TabId; label: string; badge?: number; editOnly?: boolean }[] = [
    { id: 'basics', label: ar ? 'التفاصيل الأساسية' : 'Basics' },
    { id: 'conditions', label: ar ? 'الشروط' : 'Conditions' },
    { id: 'limits', label: ar ? 'القيود' : 'Limits', badge: limitsCount || undefined },
    { id: 'schedule', label: ar ? 'الجدول الزمني' : 'Schedule' },
    ...(isEdit ? [{ id: 'performance' as TabId, label: ar ? 'الأداء' : 'Performance', editOnly: true }] : []),
  ]

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    )
  }

  return (
    <div className="w-full pt-2 px-4 pb-6 sm:px-5" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <button
          type="button"
          onClick={() => navigate('/promotions')}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowRight className={`w-4 h-4 ${isRtl ? '' : 'rotate-180'}`} />
          {ar ? 'العودة للقائمة' : 'Back'}
        </button>
        <h1 className="text-lg font-semibold text-slate-800 order-first sm:order-none w-full sm:w-auto text-center sm:text-start">
          {isEdit ? (ar ? 'تعديل العرض' : 'Edit offer') : ar ? 'عرض جديد' : 'New offer'}
        </h1>
        <div className="flex gap-2 ms-auto">
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50"
          >
            <Eye className="w-4 h-4" />
            {ar ? 'معاينة' : 'Preview'}
          </button>
          <button
            type="submit"
            form="promo-form"
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? '...' : ar ? 'حفظ العرض' : 'Save offer'}
          </button>
        </div>
      </div>

      {validationErrors.length > 0 && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <ul className="list-disc list-inside space-y-0.5">
            {validationErrors.map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      <form id="promo-form" onSubmit={handleSubmit} className="space-y-5">
        {/* نوع الخصم — دائماً فوق التبويبات */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">
            {ar ? 'نوع الخصم' : 'Discount type'}
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {DISCOUNT_TYPES.map((t) => {
              const Icon = t.icon
              const selected = form.type === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => patch('type', t.id)}
                  className={`flex items-start gap-3 p-4 rounded-xl border-2 text-start transition-all ${
                    selected
                      ? 'border-indigo-600 bg-indigo-50/80'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: t.iconBg, color: t.iconColor }}
                  >
                    <Icon className="w-5 h-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-bold text-base text-slate-800">
                      {ar ? t.ar : t.en}
                    </span>
                    <span className="block text-xs font-semibold text-slate-500 mt-1">
                      {ar ? t.descAr : t.descEn}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-slate-200 flex flex-wrap gap-0.5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
              {tab.badge != null && tab.badge > 0 ? (
                <span className="tab-badge min-w-[1.25rem] h-5 px-1.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center">
                  {tab.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Tab panels */}
        <div className="min-h-[320px]">
          {activeTab === 'basics' && (
            <div className="space-y-5">
              {sectionCard(
                ar ? 'البيانات الأساسية' : 'Basic information',
                <>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <label className="block sm:col-span-1">
                      <span className="text-xs text-slate-500">{ar ? 'الاسم *' : 'Name *'}</span>
                      <input
                        required
                        value={form.name ?? ''}
                        onChange={(e) => patch('name', e.target.value)}
                        className={inputCls()}
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs text-slate-500">{ar ? 'الكود' : 'Code'}</span>
                      <input
                        value={form.code ?? ''}
                        onChange={(e) => patch('code', e.target.value)}
                        className={inputCls()}
                        placeholder={ar ? 'اختياري — للكاشير أو الفاتورة' : 'Optional — POS / invoice'}
                      />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="text-xs text-slate-500">{ar ? 'الوصف' : 'Description'}</span>
                      <textarea
                        value={form.description ?? ''}
                        onChange={(e) => patch('description', e.target.value)}
                        rows={3}
                        className={inputCls()}
                      />
                    </label>
                  </div>
                </>,
              )}

              {sectionCard(
                ar ? 'قيمة الخصم' : 'Discount value',
                <>
                  {(form.type === 'percentage' || form.type === 'min_purchase') && (
                    <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-4 py-3 text-sm text-indigo-900">
                      {ar ? 'معاينة على' : 'Preview on'}{' '}
                      <span className="font-bold tabular-nums" dir="ltr">
                        {PREVIEW_AMOUNT} KWD
                      </span>
                      : {ar ? 'خصم' : 'discount'}{' '}
                      <span className="font-bold tabular-nums" dir="ltr">
                        {discountPreview.discount.toFixed(3)} KWD
                      </span>
                      {' — '}
                      {ar ? 'الإجمالي بعد الخصم:' : 'Total after discount:'}{' '}
                      <span className="font-bold tabular-nums" dir="ltr">
                        {discountPreview.final.toFixed(3)} KWD
                      </span>
                    </div>
                  )}

                  {form.type === 'percentage' && (
                    <div className="grid sm:grid-cols-3 gap-4">
                      <label className="block">
                        <span className="text-xs text-slate-500">{ar ? 'النسبة % *' : 'Percent % *'}</span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={form.value ?? 0}
                          onChange={(e) => patch('value', parseFloat(e.target.value) || 0)}
                          className={inputCls()}
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs text-slate-500">
                          {ar ? 'أقصى خصم (اختياري)' : 'Max discount (optional)'}
                        </span>
                        <input
                          type="number"
                          min={0}
                          step="0.001"
                          value={form.max_discount_amount ?? ''}
                          onChange={(e) =>
                            patch(
                              'max_discount_amount',
                              e.target.value ? parseFloat(e.target.value) : null,
                            )
                          }
                          className={inputCls()}
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs text-slate-500">
                          {ar ? 'حد أدنى للشراء' : 'Min purchase'}
                        </span>
                        <input
                          type="number"
                          min={0}
                          step="0.001"
                          value={form.min_purchase_amount ?? 0}
                          onChange={(e) =>
                            patch('min_purchase_amount', parseFloat(e.target.value) || 0)
                          }
                          className={inputCls()}
                        />
                      </label>
                    </div>
                  )}

                  {form.type === 'fixed' && (
                    <div className="grid sm:grid-cols-2 gap-4">
                      <label className="block">
                        <span className="text-xs text-slate-500">
                          {ar ? 'مبلغ الخصم *' : 'Discount amount *'}
                        </span>
                        <input
                          type="number"
                          min={0}
                          step="0.001"
                          value={form.value ?? 0}
                          onChange={(e) => patch('value', parseFloat(e.target.value) || 0)}
                          className={inputCls()}
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs text-slate-500">
                          {ar ? 'حد أدنى للشراء' : 'Min purchase'}
                        </span>
                        <input
                          type="number"
                          min={0}
                          step="0.001"
                          value={form.min_purchase_amount ?? 0}
                          onChange={(e) =>
                            patch('min_purchase_amount', parseFloat(e.target.value) || 0)
                          }
                          className={inputCls()}
                        />
                      </label>
                    </div>
                  )}

                  {form.type === 'bogo' && (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <label className="block">
                        <span className="text-xs text-slate-500">{ar ? 'اشترِ كمية *' : 'Buy qty *'}</span>
                        <input
                          type="number"
                          min={1}
                          value={form.buy_quantity ?? 2}
                          onChange={(e) => patch('buy_quantity', parseInt(e.target.value, 10) || 1)}
                          className={inputCls()}
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs text-slate-500">{ar ? 'احصل على *' : 'Get qty *'}</span>
                        <input
                          type="number"
                          min={1}
                          value={form.get_quantity ?? 1}
                          onChange={(e) => patch('get_quantity', parseInt(e.target.value, 10) || 1)}
                          className={inputCls()}
                        />
                      </label>
                      <label className="block sm:col-span-2">
                        <span className="text-xs text-slate-500">
                          {ar ? 'الصنف المجاني (اختياري)' : 'Free item (optional)'}
                        </span>
                        <input
                          type="search"
                          value={itemSearch}
                          onChange={(e) => setItemSearch(e.target.value)}
                          placeholder={ar ? 'بحث عن صنف...' : 'Search item...'}
                          className={inputCls()}
                        />
                        <select
                          value={bogoFreeItemId ?? ''}
                          onChange={(e) =>
                            setBogoFreeItemId(e.target.value ? parseInt(e.target.value, 10) : null)
                          }
                          className={`${inputCls()} mt-2`}
                        >
                          <option value="">{ar ? '— بدون تحديد —' : '— None —'}</option>
                          {filteredItems.map((it) => (
                            <option key={it.id} value={it.id}>
                              {it.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-xs text-slate-500">
                          % {ar ? 'خصم القطعة المجانية' : 'off free item'}
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={form.get_discount_percent ?? 100}
                          onChange={(e) =>
                            patch('get_discount_percent', parseFloat(e.target.value) || 100)
                          }
                          className={inputCls()}
                        />
                      </label>
                    </div>
                  )}

                  {form.type === 'min_purchase' && (
                    <div className="grid sm:grid-cols-2 gap-4">
                      <label className="block">
                        <span className="text-xs text-slate-500">
                          {ar ? 'الحد الأدنى للشراء *' : 'Min purchase threshold *'}
                        </span>
                        <input
                          type="number"
                          min={0}
                          step="0.001"
                          value={form.min_purchase_amount ?? 0}
                          onChange={(e) =>
                            patch('min_purchase_amount', parseFloat(e.target.value) || 0)
                          }
                          className={inputCls()}
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs text-slate-500">
                          {ar ? 'نسبة الخصم عند التجاوز *' : 'Discount % when exceeded *'}
                        </span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={form.value ?? 0}
                          onChange={(e) => patch('value', parseFloat(e.target.value) || 0)}
                          className={inputCls()}
                        />
                      </label>
                      <label className="block sm:col-span-2">
                        <span className="text-xs text-slate-500">
                          {ar ? 'أقصى خصم (اختياري)' : 'Max discount (optional)'}
                        </span>
                        <input
                          type="number"
                          min={0}
                          step="0.001"
                          value={form.max_discount_amount ?? ''}
                          onChange={(e) =>
                            patch(
                              'max_discount_amount',
                              e.target.value ? parseFloat(e.target.value) : null,
                            )
                          }
                          className={inputCls()}
                        />
                      </label>
                    </div>
                  )}
                </>,
              )}
            </div>
          )}

          {activeTab === 'conditions' && (
            <div className="space-y-5">
              {sectionCard(
                ar ? 'القنوات' : 'Channels',
                <div className="flex flex-wrap gap-2">
                  {CHANNEL_DEFS.map((ch) => {
                    const Icon = ch.icon
                    const on = (form.channels ?? []).includes(ch.id)
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => toggleChannel(ch.id)}
                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                          on
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {ar ? ch.labelAr : ch.labelEn}
                      </button>
                    )
                  })}
                </div>,
              )}

              {sectionCard(
                ar ? 'مستويات الولاء' : 'Loyalty tiers',
                <>
                  <div className="flex flex-wrap gap-2">
                    {(tiers as { name: string }[]).map((t) => (
                      <button
                        key={t.name}
                        type="button"
                        onClick={() => toggleTier(t.name)}
                        className={`px-4 py-2 rounded-full text-sm font-medium border ${
                          (form.customer_tiers ?? []).includes(t.name)
                            ? 'bg-amber-100 border-amber-400 text-amber-900'
                            : 'border-slate-200 text-slate-600'
                        }`}
                      >
                        {t.name}
                      </button>
                    ))}
                    {(tiers as unknown[]).length === 0 && (
                      <p className="text-sm text-slate-400">
                        {ar ? 'لا توجد مستويات ولاء مُعرَّفة' : 'No loyalty tiers defined'}
                      </p>
                    )}
                  </div>
                </>,
                ar ? 'فارغ = ينطبق على جميع المستويات' : 'Empty = all tiers',
              )}

              {sectionCard(
                ar ? 'تطبيق الخصم على' : 'Applies to',
                <>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {(
                      [
                        ['all', ar ? 'كل الأصناف' : 'All items'],
                        ['items', ar ? 'أصناف محددة' : 'Specific items'],
                        ['categories', ar ? 'فئات محددة' : 'Categories'],
                      ] as const
                    ).map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => changeAppliesTo(mode)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium border ${
                          appliesTo === mode
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'border-slate-200'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {appliesTo === 'items' && (
                    <>
                      <input
                        type="search"
                        value={itemSearch}
                        onChange={(e) => setItemSearch(e.target.value)}
                        placeholder={ar ? 'بحث عن صنف...' : 'Search items...'}
                        className={inputCls()}
                      />
                      <select
                        multiple
                        value={(form.item_ids ?? []).map(String)}
                        onChange={(e) =>
                          patch(
                            'item_ids',
                            Array.from(e.target.selectedOptions).map((o) =>
                              parseInt(o.value, 10),
                            ),
                          )
                        }
                        className={`${inputCls()} h-40`}
                      >
                        {filteredItems.map((it) => (
                          <option key={it.id} value={it.id}>
                            {it.name}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                  {appliesTo === 'categories' && (
                    <select
                      multiple
                      value={(form.category_ids ?? []).map(String)}
                      onChange={(e) =>
                        patch(
                          'category_ids',
                          Array.from(e.target.selectedOptions).map((o) => parseInt(o.value, 10)),
                        )
                      }
                      className={`${inputCls()} h-40`}
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                </>,
              )}
            </div>
          )}

          {activeTab === 'limits' && (
            <div className="space-y-5">
              {sectionCard(
                ar ? 'حدود الاستخدام' : 'Usage limits',
                <div className="grid sm:grid-cols-3 gap-4">
                  {(
                    [
                      ['max_uses', ar ? 'إجمالي الاستخدام' : 'Total uses'],
                      ['max_uses_per_day', ar ? 'يومياً' : 'Per day'],
                      ['max_uses_per_customer', ar ? 'لكل عميل' : 'Per customer'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="block">
                      <span className="text-xs text-slate-500">{label}</span>
                      <input
                        type="number"
                        min={1}
                        value={(form as Record<string, unknown>)[key] ?? ''}
                        onChange={(e) =>
                          patch(
                            key as keyof Promotion,
                            e.target.value ? parseInt(e.target.value, 10) : null,
                          )
                        }
                        className={inputCls()}
                      />
                    </label>
                  ))}
                </div>,
                ar ? 'اترك الحقل فارغاً لعدم التحديد' : 'Leave blank for unlimited',
              )}

              {sectionCard(
                ar ? 'خيارات إضافية' : 'Additional options',
                <>
                  <ToggleSwitch
                    checked={form.is_combinable ?? false}
                    onChange={(v) => patch('is_combinable', v)}
                    label={ar ? 'قابل للجمع مع عروض أخرى' : 'Combinable with other offers'}
                    desc={
                      ar
                        ? 'يُطبق مع خصومات أخرى في نفس الفاتورة'
                        : 'Stacks with other discounts on the same invoice'
                    }
                  />
                </>,
              )}
            </div>
          )}

          {activeTab === 'schedule' && (
            <div className="space-y-5">
              {sectionCard(
                ar ? 'الفترة الزمنية' : 'Time period',
                <div className="grid sm:grid-cols-2 gap-4">
                  <label className="block">
                    <span className="text-xs text-slate-500">{ar ? 'من تاريخ' : 'Start date'}</span>
                    <input
                      type="date"
                      value={form.start_date ?? ''}
                      onChange={(e) => patch('start_date', e.target.value)}
                      className={inputCls()}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-slate-500">{ar ? 'إلى تاريخ' : 'End date'}</span>
                    <input
                      type="date"
                      value={form.end_date ?? ''}
                      onChange={(e) => patch('end_date', e.target.value)}
                      className={inputCls()}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-slate-500">{ar ? 'من الساعة' : 'From time'}</span>
                    <input
                      type="time"
                      value={form.active_from ?? ''}
                      onChange={(e) => patch('active_from', e.target.value)}
                      className={inputCls()}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-slate-500">{ar ? 'إلى الساعة' : 'To time'}</span>
                    <input
                      type="time"
                      value={form.active_to ?? ''}
                      onChange={(e) => patch('active_to', e.target.value)}
                      className={inputCls()}
                    />
                  </label>
                </div>,
                ar ? 'اترك الحقول فارغة لعدم تقييد العرض بتاريخ أو وقت' : 'Leave blank for no date/time limit',
              )}

              {sectionCard(
                ar ? 'أيام التطبيق' : 'Active days',
                <div className="flex flex-wrap gap-2">
                  {DAY_CHIPS.map((d) => {
                    const on = (form.active_days ?? ALL_DAYS).includes(d.dow)
                    return (
                      <button
                        key={d.dow}
                        type="button"
                        onClick={() => toggleDay(d.dow)}
                        className={`px-4 py-2 rounded-full text-sm font-medium border ${
                          on
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'border-slate-200 text-slate-500'
                        }`}
                      >
                        {ar ? d.ar : d.en}
                      </button>
                    )
                  })}
                </div>,
                ar ? 'الكل مفعّل افتراضياً — أوقف يوماً لاستثنائه' : 'All days enabled by default',
              )}

              {sectionCard(
                ar ? 'الحالة والأولوية' : 'Status & priority',
                <>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <label className="block">
                      <span className="text-xs text-slate-500">{ar ? 'الحالة' : 'Status'}</span>
                      <select
                        value={form.status ?? 'active'}
                        onChange={(e) => patch('status', e.target.value as Promotion['status'])}
                        className={inputCls()}
                      >
                        <option value="active">{ar ? 'نشط' : 'Active'}</option>
                        <option value="inactive">{ar ? 'موقوف' : 'Inactive'}</option>
                        <option value="draft">{ar ? 'مسودة / مجدول' : 'Draft / scheduled'}</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs text-slate-500">{ar ? 'الأولوية' : 'Priority'}</span>
                      <input
                        type="number"
                        min={0}
                        value={form.priority ?? 0}
                        onChange={(e) => patch('priority', parseInt(e.target.value, 10) || 0)}
                        className={inputCls()}
                      />
                      <p className="text-[10px] text-slate-400 mt-1">
                        {ar
                          ? 'رقم أعلى = أولوية أعلى عند التعارض بين عروض'
                          : 'Higher number = higher priority when offers conflict'}
                      </p>
                    </label>
                  </div>
                </>,
              )}
            </div>
          )}

          {activeTab === 'performance' && isEdit && (
            <div className="space-y-5">
              <div className="grid sm:grid-cols-3 gap-4">
                {[
                  {
                    label: ar ? 'مرات الاستخدام' : 'Times used',
                    value: stats.current_uses ?? stats.usage_count ?? performanceUsages.length,
                  },
                  {
                    label: ar ? 'إجمالي الخصم' : 'Total discount',
                    value: `${(
                      stats.total_discount_given ??
                      performanceUsages.reduce((s, u) => s + Number(u.discount_amount), 0)
                    ).toFixed(3)} KWD`,
                  },
                  {
                    label: ar ? 'عملاء استفادوا' : 'Customers benefited',
                    value: new Set(
                      performanceUsages.map((u) => u.customer?.id).filter(Boolean),
                    ).size,
                  },
                ].map((kpi) => (
                  <div
                    key={kpi.label}
                    className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <p className="text-xs text-slate-500">{kpi.label}</p>
                    <p className="text-2xl font-bold text-slate-800 mt-1 tabular-nums">{kpi.value}</p>
                  </div>
                ))}
              </div>

              {sectionCard(
                ar ? 'آخر 7 أيام' : 'Last 7 days',
                <>
                  <div className="flex items-end gap-2 h-32">
                    {last7DaysChart.days.map((d) => (
                      <div key={d.label} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                        <div
                          className="w-full bg-indigo-500 rounded-t-md min-h-[4px] transition-all"
                          style={{
                            height: `${Math.max(8, (d.count / last7DaysChart.maxCount) * 100)}%`,
                          }}
                          title={`${d.count} — ${d.discount.toFixed(3)} KWD`}
                        />
                        <span className="text-[9px] text-slate-500 truncate w-full text-center">
                          {d.label}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-slate-400 text-center">
                    {ar ? 'عدد مرات استخدام العرض يومياً' : 'Daily usage count'}
                  </p>
                </>,
              )}
            </div>
          )}
        </div>
      </form>

      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" dir={isRtl ? 'rtl' : 'ltr'}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-800">{ar ? 'معاينة العرض' : 'Offer preview'}</h3>
              <button type="button" onClick={() => setShowPreview(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">{ar ? 'الاسم' : 'Name'}</dt>
                <dd className="font-medium">{form.name || '—'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">{ar ? 'النوع' : 'Type'}</dt>
                <dd>{form.type}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">{ar ? 'القنوات' : 'Channels'}</dt>
                <dd>{(form.channels ?? []).join(', ') || '—'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">{ar ? 'الخصم (معاينة)' : 'Discount (preview)'}</dt>
                <dd className="font-bold text-indigo-600 tabular-nums" dir="ltr">
                  {discountPreview.discount.toFixed(3)} KWD
                </dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={() => setShowPreview(false)}
              className="mt-6 w-full py-2 rounded-lg bg-slate-100 text-sm font-medium"
            >
              {ar ? 'إغلاق' : 'Close'}
            </button>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
