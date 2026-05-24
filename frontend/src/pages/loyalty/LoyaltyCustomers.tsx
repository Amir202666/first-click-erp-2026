import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Eye, Gift, MoreVertical } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { loyaltyApi } from '../../api/loyalty'
import { formatDisplayDate } from '../../utils/date'

interface LoyaltyTierRow {
  id: number
  name: string
  icon: string
  color: string
  min_points: number
  max_points: number | null
  loyalty_program_id?: number
}

interface CustomerRow {
  id: number
  name: string
  code: string
  loyalty_points_balance: number
  loyalty_points_total_earned: number
  loyalty_points_total_redeemed: number
  loyalty_tier?: LoyaltyTierRow | null
  last_activity?: string | null
  loyalty_balances?: Record<
    string,
    {
      balance?: number
      total_earned?: number
      total_redeemed?: number
      tier_id?: number | null
    }
  >
}

interface DisplayCustomer extends CustomerRow {
  display_balance: number
  display_earned: number
  display_redeemed: number
  display_tier: LoyaltyTierRow | null
}

interface Stats {
  total_customers: number
  total_earned: number
  total_redeemed: number
  total_balance: number
  tiers: { name: string; icon: string; color: string; count: number; percent: number }[]
}

const TIER_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  برونزي: { bg: '#fdf8f3', text: '#92400e', border: '#e8d5c0' },
  فضي: { bg: '#f8f9fa', text: '#4b5563', border: '#e5e7eb' },
  ذهبي: { bg: '#fffbeb', text: '#92400e', border: '#fde68a' },
  بلاتيني: { bg: '#f5f3ff', text: '#5b21b6', border: '#ddd6fe' },
}

const AVATAR_COLORS = [
  'linear-gradient(135deg,#8b5cf6,#7c3aed)',
  'linear-gradient(135deg,#10b981,#059669)',
  'linear-gradient(135deg,#f59e0b,#d97706)',
  'linear-gradient(135deg,#3b82f6,#2563eb)',
  'linear-gradient(135deg,#f43f5e,#e11d48)',
  'linear-gradient(135deg,#06b6d4,#0891b2)',
]

function toDisplayCustomer(
  c: CustomerRow,
  programId: string,
  tierById: Map<number, LoyaltyTierRow>,
  opts?: { useAggregateRedeemedFallback?: boolean }
): DisplayCustomer {
  if (!programId) {
    return {
      ...c,
      display_balance: Number(c.loyalty_points_balance ?? 0),
      display_earned: Number(c.loyalty_points_total_earned ?? 0),
      display_redeemed: Number(c.loyalty_points_total_redeemed ?? 0),
      display_tier: c.loyalty_tier ?? null,
    }
  }
  const b = c.loyalty_balances?.[programId]
  if (!b) {
    const aggRedeemed = Number(c.loyalty_points_total_redeemed ?? 0)
    return {
      ...c,
      display_balance: 0,
      display_earned: 0,
      display_redeemed: opts?.useAggregateRedeemedFallback && aggRedeemed > 0.0005 ? aggRedeemed : 0,
      display_tier: null,
    }
  }
  const tid = b.tier_id
  const tier = tid != null ? tierById.get(tid) ?? null : null
  let displayRedeemed = Number(b.total_redeemed ?? 0)
  if (
    opts?.useAggregateRedeemedFallback &&
    displayRedeemed <= 0.0005 &&
    Number(c.loyalty_points_total_redeemed ?? 0) > 0.0005
  ) {
    displayRedeemed = Number(c.loyalty_points_total_redeemed ?? 0)
  }
  return {
    ...c,
    display_balance: Number(b.balance ?? 0),
    display_earned: Number(b.total_earned ?? 0),
    display_redeemed: displayRedeemed,
    display_tier: tier,
  }
}

function getNextTierInfo(
  earned: number,
  tier: LoyaltyTierRow | null,
  tiersSorted: LoyaltyTierRow[]
): { progress: number; remaining: number; label: 'next' | 'cap' } | null {
  if (!tier) return null
  if (tier.max_points === null) return null

  const idx = tiersSorted.findIndex((x) => x.id === tier.id)
  const next = idx >= 0 && idx < tiersSorted.length - 1 ? tiersSorted[idx + 1] : null

  if (next) {
    const span = next.min_points - tier.min_points
    const progress = span > 0 ? Math.min(100, Math.round(((earned - tier.min_points) / span) * 100)) : 0
    const remaining = Math.max(0, Math.ceil(next.min_points - earned))
    return { progress, remaining, label: 'next' }
  }

  const cap = tier.max_points
  const span = cap - tier.min_points
  const progress = span > 0 ? Math.min(100, Math.round(((earned - tier.min_points) / span) * 100)) : 100
  const remaining = Math.max(0, Math.ceil(cap - earned))
  return { progress, remaining, label: 'cap' }
}

async function fetchAllCustomers(tenantId: number): Promise<CustomerRow[]> {
  let page = 1
  const all: CustomerRow[] = []
  let lastPage = 1
  do {
    const r = await loyaltyApi.getCustomers(tenantId, { page, per_page: 200 })
    const body = r.data as {
      data?: CustomerRow[]
      last_page?: number
    }
    all.push(...(body.data ?? []))
    lastPage = body.last_page ?? 1
    page++
  } while (page <= lastPage)
  return all
}

export default function LoyaltyCustomers() {
  const { currentTenant } = useAuth()
  const { lang, isRtl } = useLanguage()
  const navigate = useNavigate()
  const tenantId = currentTenant?.id ?? 0

  const tr = useCallback((ar: string, en: string) => (lang === 'ar' ? ar : en), [lang])

  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [programs, setPrograms] = useState<any[]>([])
  const [programTiers, setProgramTiers] = useState<LoyaltyTierRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterProgram, setFilterProgram] = useState('')
  const [filterTier, setFilterTier] = useState('')
  const [sortBy, setSortBy] = useState('balance_desc')
  const [showManualGift, setShowManualGift] = useState(false)
  const [giftCustomer, setGiftCustomer] = useState<DisplayCustomer | null>(null)
  const [giftPoints, setGiftPoints] = useState(0)
  const [giftNote, setGiftNote] = useState('')
  const [giftSaving, setGiftSaving] = useState(false)
  const [actionsMenuForId, setActionsMenuForId] = useState<number | null>(null)
  const [actionsMenuAnchor, setActionsMenuAnchor] = useState<{
    top: number
    left: number
    right: number
  } | null>(null)

  const closeActionsMenu = useCallback(() => {
    setActionsMenuForId(null)
    setActionsMenuAnchor(null)
  }, [])

  const openActionsMenu = useCallback((e: MouseEvent<HTMLButtonElement>, customerId: number) => {
    e.stopPropagation()
    const el = e.currentTarget
    const rect = el.getBoundingClientRect()
    setActionsMenuAnchor({ top: rect.bottom, left: rect.left, right: rect.right })
    setActionsMenuForId(customerId)
  }, [])

  const tierById = useMemo(() => {
    const m = new Map<number, LoyaltyTierRow>()
    programTiers.forEach((t) => m.set(t.id, t))
    return m
  }, [programTiers])

  const tiersSorted = useMemo(
    () => [...programTiers].sort((a, b) => a.min_points - b.min_points),
    [programTiers]
  )

  const programIdForSlice = filterProgram || (programs[0]?.id != null ? String(programs[0].id) : '')

  const singleProgramId =
    programs.length === 1 && programs[0]?.id != null ? String(programs[0].id) : null
  const useAggregateRedeemedFallback = Boolean(
    singleProgramId && (filterProgram === '' || filterProgram === singleProgramId)
  )

  const pointValue = useMemo(() => {
    const pid = filterProgram || (programs[0]?.id != null ? String(programs[0].id) : '')
    const p = programs.find((x) => String(x.id) === pid) ?? programs[0]
    const v = p != null ? Number(p.point_value) : NaN
    return Number.isFinite(v) && v > 0 ? v : 0.01
  }, [programs, filterProgram])

  const activeProgramIdForApi = programIdForSlice ? parseInt(programIdForSlice, 10) : undefined

  const reload = useCallback(async () => {
    if (!tenantId) return
    const list = await fetchAllCustomers(tenantId)
    setCustomers(list)
  }, [tenantId])

  useEffect(() => {
    if (!tenantId) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setErr(null)
    Promise.all([fetchAllCustomers(tenantId), loyaltyApi.listPrograms(tenantId)])
      .then(([custList, pRes]) => {
        if (cancelled) return
        setCustomers(custList)
        const raw = pRes.data?.data ?? pRes.data ?? []
        setPrograms(Array.isArray(raw) ? raw : [])
      })
      .catch((e) => {
        if (!cancelled) setErr(e?.response?.data?.message ?? tr('فشل التحميل', 'Failed to load'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tenantId, tr])

  useEffect(() => {
    if (!tenantId || !programIdForSlice) {
      setProgramTiers([])
      return
    }
    let cancelled = false
    loyaltyApi
      .getTiers(tenantId, parseInt(programIdForSlice, 10))
      .then((r) => {
        if (cancelled) return
        const rows = (r.data?.data ?? r.data ?? []) as LoyaltyTierRow[]
        setProgramTiers(Array.isArray(rows) ? rows : [])
      })
      .catch(() => {
        if (!cancelled) setProgramTiers([])
      })
    return () => {
      cancelled = true
    }
  }, [tenantId, programIdForSlice])

  const normalized: DisplayCustomer[] = useMemo(
    () =>
      customers.map((c) =>
        toDisplayCustomer(c, filterProgram, tierById, {
          useAggregateRedeemedFallback,
        })
      ),
    [customers, filterProgram, tierById, useAggregateRedeemedFallback]
  )

  const stats: Stats = useMemo(() => {
    const list = normalized.filter(
      (c) => c.display_balance > 0 || c.display_earned > 0 || c.display_redeemed > 0 || c.display_tier
    )
    const tierMap: Record<string, { name: string; icon: string; color: string; count: number }> = {}
    list.forEach((c) => {
      const tier = c.display_tier
      if (tier) {
        if (!tierMap[tier.name]) {
          tierMap[tier.name] = { name: tier.name, icon: tier.icon, color: tier.color, count: 0 }
        }
        tierMap[tier.name].count++
      }
    })
    const total = list.length
    const tiers = Object.values(tierMap).map((t) => ({
      ...t,
      percent: total > 0 ? Math.round((t.count / total) * 100) : 0,
    }))

    return {
      total_customers: list.length,
      total_earned: list.reduce((s, c) => s + c.display_earned, 0),
      total_redeemed: list.reduce((s, c) => s + c.display_redeemed, 0),
      total_balance: list.reduce((s, c) => s + c.display_balance, 0),
      tiers,
    }
  }, [normalized])

  const filtered = useMemo(() => {
    let list = [...normalized]

    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        (c) => c.name?.toLowerCase().includes(q) || c.code?.toLowerCase().includes(q)
      )
    }
    if (filterTier) {
      list = list.filter((c) => c.display_tier?.name === filterTier)
    }

    list.sort((a, b) => {
      switch (sortBy) {
        case 'balance_desc':
          return b.display_balance - a.display_balance
        case 'balance_asc':
          return a.display_balance - b.display_balance
        case 'earned_desc':
          return b.display_earned - a.display_earned
        case 'name_asc':
          return (a.name ?? '').localeCompare(b.name ?? '', lang === 'ar' ? 'ar' : 'en')
        default:
          return 0
      }
    })

    return list
  }, [normalized, search, filterTier, sortBy, lang])

  const handleManualGift = async () => {
    if (!giftCustomer || giftPoints <= 0) return
    setGiftSaving(true)
    try {
      const notes = (giftNote.trim() || tr(`منح يدوي: ${giftPoints} نقطة`, `Manual award: ${giftPoints} pts`)).slice(
        0,
        255
      )
      await loyaltyApi.manualAdjust(tenantId, {
        customer_id: giftCustomer.id,
        points: giftPoints,
        notes,
        ...(activeProgramIdForApi != null && !Number.isNaN(activeProgramIdForApi)
          ? { program_id: activeProgramIdForApi }
          : {}),
      })
      setShowManualGift(false)
      setGiftCustomer(null)
      setGiftPoints(0)
      setGiftNote('')
      await reload()
    } catch (e: any) {
      window.alert(e.response?.data?.message ?? tr('حدث خطأ', 'Something went wrong'))
    } finally {
      setGiftSaving(false)
    }
  }

  const exportCsv = () => {
    const sep = ';'
    const headers = [
      tr('الاسم', 'Name'),
      tr('الكود', 'Code'),
      tr('المستوى', 'Tier'),
      tr('الرصيد', 'Balance'),
      tr('مكتسب', 'Earned'),
      tr('مسترد', 'Redeemed'),
      tr('آخر نشاط', 'Last activity'),
    ]
    const lines = [
      headers.join(sep),
      ...filtered.map((c) =>
        [
          `"${(c.name ?? '').replace(/"/g, '""')}"`,
          c.code ?? '',
          c.display_tier ? `${c.display_tier.icon} ${c.display_tier.name}` : '',
          String(c.display_balance),
          String(c.display_earned),
          String(c.display_redeemed),
          c.last_activity ? new Date(c.last_activity).toISOString() : '',
        ].join(sep)
      ),
    ]
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'loyalty-customers.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const KPI_CARDS = [
    {
      label: tr('إجمالي العملاء', 'Total customers'),
      value: stats.total_customers.toLocaleString(lang === 'ar' ? 'ar' : 'en'),
      color: '#f59e0b',
      sub: tr(`${stats.tiers.length} مستوى`, `${stats.tiers.length} tiers`),
    },
    {
      label: tr('نقاط مكتسبة (إجمالي)', 'Total earned pts'),
      value: stats.total_earned.toLocaleString(lang === 'ar' ? 'ar' : 'en'),
      color: '#10b981',
      sub: tr('منذ البداية', 'All time'),
    },
    {
      label: tr('نقاط مستردة', 'Redeemed pts'),
      value: stats.total_redeemed.toLocaleString(lang === 'ar' ? 'ar' : 'en'),
      color: '#3b82f6',
      sub: `= ${(stats.total_redeemed * pointValue).toFixed(3)} KWD`,
    },
    {
      label: tr('رصيد قائم', 'Outstanding balance'),
      value: stats.total_balance.toLocaleString(lang === 'ar' ? 'ar' : 'en'),
      color: '#8b5cf6',
      sub: `= ${(stats.total_balance * pointValue).toFixed(3)} KWD`,
    },
  ]

  if (!tenantId) {
    return (
      <div className="p-6 text-sm text-slate-500" dir={isRtl ? 'rtl' : 'ltr'}>
        {tr('اختر شركة', 'Select a company')}
      </div>
    )
  }

  return (
    <div className="w-full p-6" dir={isRtl ? 'rtl' : 'ltr'}>
      {err && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{err}</div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white text-base">
            ⭐
          </div>
          <div>
            <h1 className="text-base font-semibold text-slate-900 leading-tight">
              {tr('نقاط العملاء', 'Customer points')}
            </h1>
            <p className="text-sm text-slate-600">
              {stats.total_customers} {tr('عميل مسجّل', 'customers')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 h-8 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
          >
            📊 Excel
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 h-8 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
          >
            🖨 {tr('طباعة', 'Print')}
          </button>
          <button
            type="button"
            onClick={() => {
              setGiftCustomer(null)
              setShowManualGift(true)
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 hover:bg-primary-500 px-2.5 h-8 text-sm font-medium text-white transition-colors shadow-sm"
          >
            🎁 {tr('منح نقاط يدوية', 'Manual award')}
          </button>
        </div>
      </div>

      <div className="mb-5 flex w-full min-w-0 flex-nowrap items-stretch gap-2 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
        {KPI_CARDS.map((kpi) => (
          <div
            key={kpi.label}
            className="flex min-h-0 min-w-[7.5rem] flex-1 basis-0 flex-col rounded-xl border border-slate-200 bg-white px-2.5 py-2 shadow-sm"
            style={{ [isRtl ? 'borderRight' : 'borderLeft']: `3px solid ${kpi.color}` }}
          >
            <p className="mb-0.5 line-clamp-2 text-sm font-medium leading-tight text-slate-600">{kpi.label}</p>
            <p className="mb-px text-sm font-semibold tabular-nums leading-none" style={{ color: kpi.color }}>
              {kpi.value}
            </p>
            <p className="line-clamp-2 text-sm leading-tight text-slate-500">{kpi.sub}</p>
          </div>
        ))}
        {stats.tiers.length > 0 &&
          stats.tiers.map((tier) => (
            <div
              key={tier.name}
              className="flex min-h-0 min-w-[7.5rem] flex-1 basis-0 flex-col rounded-xl border border-slate-200 bg-white px-2.5 py-2 shadow-sm"
              style={{ [isRtl ? 'borderRight' : 'borderLeft']: `3px solid ${tier.color}` }}
            >
              <p className="mb-0.5 line-clamp-2 text-sm font-medium leading-tight text-slate-600">
                <span className="whitespace-nowrap">{tier.icon}</span> {tier.name}
              </p>
              <p className="mb-px text-sm font-semibold tabular-nums leading-none" style={{ color: tier.color }}>
                {tier.count}
              </p>
              <div className="min-h-0 text-sm leading-tight text-slate-500">
                <p className="line-clamp-1">{tier.percent}%</p>
                <div className="mt-0.5 h-0.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${tier.percent}%`, background: tier.color }}
                  />
                </div>
              </div>
            </div>
          ))}
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 mb-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-start">
          <div className="col-span-2 sm:col-span-1">
            <label className="text-sm font-medium text-slate-600 block mb-1">
              {tr('برنامج الولاء', 'Loyalty program')}
            </label>
            <select
              value={filterProgram}
              onChange={(e) => setFilterProgram(e.target.value)}
              className="w-full min-w-0 max-w-full min-h-[2.75rem] border border-slate-300 rounded-lg px-3 py-2.5 text-sm leading-normal bg-white box-border focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none"
            >
              <option value="">{tr('الكل (مجمّع)', 'All (aggregated)')}</option>
              {programs.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.icon ?? '⭐'} {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-600 block mb-1">
              {tr('المستوى', 'Tier')}
            </label>
            <select
              value={filterTier}
              onChange={(e) => setFilterTier(e.target.value)}
              className="w-full min-w-0 max-w-full min-h-[2.75rem] border border-slate-300 rounded-lg px-3 py-2.5 text-sm leading-normal bg-white box-border focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none"
            >
              <option value="">{tr('الكل', 'All')}</option>
              {stats.tiers.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.icon} {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-600 block mb-1">
              {tr('ترتيب حسب', 'Sort by')}
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full min-w-0 max-w-full min-h-[2.75rem] border border-slate-300 rounded-lg px-3 py-2.5 text-sm leading-normal bg-white box-border focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none"
            >
              <option value="balance_desc">{tr('الرصيد (تنازلي)', 'Balance (desc)')}</option>
              <option value="balance_asc">{tr('الرصيد (تصاعدي)', 'Balance (asc)')}</option>
              <option value="earned_desc">{tr('المكتسب (تنازلي)', 'Earned (desc)')}</option>
              <option value="name_asc">{tr('الاسم (أبجدي)', 'Name (A–Z)')}</option>
            </select>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="text-sm font-medium text-slate-600 block mb-1">
              {tr('بحث', 'Search')}
            </label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tr('🔍 ابحث بالاسم أو الكود...', '🔍 Search name or code...')}
              className="w-full min-w-0 max-w-full min-h-[2.75rem] border border-slate-300 rounded-lg px-3 py-2.5 text-sm leading-normal bg-white box-border focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <span className="text-sm text-slate-600">
            {tr('عرض', 'Showing')} {filtered.length} / {normalized.length}
          </span>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={exportCsv}
              className="w-8 h-8 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-sm text-gray-500 hover:bg-gray-50"
              title="CSV"
            >
              📊
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="w-8 h-8 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-sm text-gray-500 hover:bg-gray-50"
            >
              🖨
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-sm text-slate-500">
            ⏳ {tr('جاري التحميل...', 'Loading...')}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-sm text-slate-400">
            {tr('لا توجد نتائج', 'No results')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead className="invoice-list-thead">
                <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  {[
                    tr('العميل', 'Customer'),
                    tr('المستوى', 'Tier'),
                    tr('الرصيد الحالي', 'Balance'),
                    tr('إجمالي المكتسب', 'Earned'),
                    tr('المستردة', 'Redeemed'),
                    tr('التقدم', 'Progress'),
                    tr('آخر نشاط', 'Last activity'),
                    tr('إجراءات', 'Actions'),
                  ].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className={`align-top p-3 min-w-0 box-border whitespace-nowrap invoice-list-th-heading ${
                        isRtl ? 'text-right' : 'text-left'
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filtered.map((customer, idx) => {
                  const tier = customer.display_tier
                  const nextTier = getNextTierInfo(customer.display_earned, tier, tiersSorted)
                  const tierStyle = tier ? TIER_STYLES[tier.name] ?? TIER_STYLES['برونزي'] : null
                  const avatarBg = AVATAR_COLORS[idx % AVATAR_COLORS.length]
                  const initials = customer.name?.substring(0, 2) ?? '؟؟'
                  const cellAlign = isRtl ? 'text-right' : 'text-left'

                  return (
                    <tr key={customer.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className={`${cellAlign} p-3`}>
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[0.8125rem] font-semibold shrink-0 leading-none"
                            style={{ background: avatarBg }}
                          >
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm text-slate-800 leading-tight">{customer.name}</p>
                            <p className="text-sm text-slate-600 leading-tight">{customer.code}</p>
                          </div>
                        </div>
                      </td>
                      <td className={`${cellAlign} p-3`}>
                        {tier ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium leading-snug text-[0.8125rem]"
                            style={{
                              background: tierStyle?.bg,
                              color: tierStyle?.text,
                              border: `1px solid ${tierStyle?.border}`,
                            }}
                          >
                            {tier.icon} {tier.name}
                          </span>
                        ) : (
                          <span className="text-sm text-slate-400">—</span>
                        )}
                      </td>
                      <td className={`${cellAlign} p-3`}>
                        <p className="text-sm font-semibold text-amber-700 tabular-nums leading-tight">
                          {customer.display_balance.toLocaleString(lang === 'ar' ? 'ar' : 'en')}
                        </p>
                        <p className="text-sm text-slate-500 mt-0.5 leading-tight tabular-nums">
                          ≈ {(customer.display_balance * pointValue).toFixed(3)} KWD
                        </p>
                      </td>
                      <td className={`${cellAlign} p-3`}>
                        <p className="text-sm font-medium text-emerald-700 tabular-nums leading-tight">
                          {customer.display_earned.toLocaleString(lang === 'ar' ? 'ar' : 'en')}
                        </p>
                      </td>
                      <td className={`${cellAlign} p-3`}>
                        <p className="text-sm font-medium text-blue-700 tabular-nums leading-tight">
                          {customer.display_redeemed.toLocaleString(lang === 'ar' ? 'ar' : 'en')}
                        </p>
                      </td>
                      <td className={`${cellAlign} p-3`}>
                        {!nextTier ? (
                          <div>
                            <div className="w-24 h-1.5 rounded-full overflow-hidden bg-slate-100">
                              <div
                                className="h-full rounded-full"
                                style={{ width: '100%', background: tier?.color ?? '#f59e0b' }}
                              />
                            </div>
                            <p className="text-sm text-slate-500 mt-1 leading-tight">
                              {tr('أعلى مستوى 🏆', 'Top tier 🏆')}
                            </p>
                          </div>
                        ) : (
                          <div>
                            <div className="w-24 h-1.5 rounded-full overflow-hidden bg-slate-100">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${nextTier.progress}%`,
                                  background: tier?.color ?? '#f59e0b',
                                }}
                              />
                            </div>
                            <p className="text-sm text-slate-500 mt-1 leading-tight">
                              {nextTier.remaining.toLocaleString(lang === 'ar' ? 'ar' : 'en')}{' '}
                              {nextTier.label === 'next'
                                ? tr('للمستوى التالي', 'to next tier')
                                : tr('لحد هذا المستوى', 'within tier range')}
                            </p>
                          </div>
                        )}
                      </td>
                      <td className={`${cellAlign} p-3`}>
                        <p className="text-sm text-slate-600 leading-tight" dir="ltr">
                          {formatDisplayDate(customer.last_activity)}
                        </p>
                      </td>
                      <td className={`${cellAlign} p-3 align-top box-border`}>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => openActionsMenu(e, customer.id)}
                            className="rounded p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                            title={tr('إجراءات', 'Actions')}
                            aria-haspopup="menu"
                            aria-expanded={actionsMenuForId === customer.id}
                          >
                            <MoreVertical size={16} aria-hidden />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 border-t border-slate-200">
          <span className="text-sm font-semibold text-amber-800 leading-tight">
            {tr('إجمالي الرصيد القائم', 'Total outstanding')}:{' '}
            {stats.total_balance.toLocaleString(lang === 'ar' ? 'ar' : 'en')}{' '}
            {tr('نقطة', 'pts')}
          </span>
          <span className="text-sm text-slate-500 leading-tight">
            {tr('القيمة بالدينار حسب برنامج الولاء المحدد.', 'KWD value uses selected program point value.')}
          </span>
        </div>
      </div>

      {actionsMenuForId != null &&
        actionsMenuAnchor &&
        (() => {
          const rowCustomer = normalized.find((c) => c.id === actionsMenuForId)
          if (!rowCustomer) return null
          const menuRight =
            typeof window !== 'undefined' ? Math.max(8, window.innerWidth - actionsMenuAnchor.right) : 8
          return createPortal(
            <>
              <div className="fixed inset-0 z-[100]" aria-hidden onClick={closeActionsMenu} />
              <div
                role="menu"
                className={`fixed z-[101] min-w-[180px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg ${
                  isRtl ? 'text-right' : 'text-left'
                }`}
                style={{
                  top: actionsMenuAnchor.top + 4,
                  ...(isRtl ? { right: menuRight } : { left: actionsMenuAnchor.left }),
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  onClick={() => {
                    navigate(`/customers?search=${encodeURIComponent(rowCustomer.code ?? '')}`)
                    closeActionsMenu()
                  }}
                >
                  <Eye size={14} className="shrink-0 opacity-80" aria-hidden />
                  {tr('عرض التفاصيل', 'View')}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-amber-800 hover:bg-amber-50"
                  onClick={() => {
                    setGiftCustomer(rowCustomer)
                    setShowManualGift(true)
                    closeActionsMenu()
                  }}
                >
                  <Gift size={14} className="shrink-0 opacity-80" aria-hidden />
                  {tr('منح نقاط', 'Award points')}
                </button>
              </div>
            </>,
            document.body
          )
        })()}

      {showManualGift && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          dir={isRtl ? 'rtl' : 'ltr'}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-base font-semibold text-slate-900">
                🎁 {tr('منح نقاط يدوية', 'Manual points award')}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setShowManualGift(false)
                  setGiftCustomer(null)
                }}
                className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 text-sm"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-600 block mb-1">
                  {tr('العميل', 'Customer')}
                </label>
                <select
                  value={giftCustomer?.id ?? ''}
                  onChange={(e) => {
                    const id = parseInt(e.target.value, 10)
                    setGiftCustomer(normalized.find((c) => c.id === id) ?? null)
                  }}
                  className="w-full min-h-[2.75rem] border border-slate-300 rounded-lg px-3 py-2.5 text-sm leading-normal bg-white box-border focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none"
                >
                  <option value="">{tr('اختر العميل...', 'Choose customer...')}</option>
                  {normalized.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-600 block mb-1">
                  {tr('عدد النقاط', 'Points')}
                </label>
                <input
                  type="number"
                  min={1}
                  value={giftPoints || ''}
                  onChange={(e) => setGiftPoints(parseInt(e.target.value, 10) || 0)}
                  placeholder="0"
                  className="w-full min-h-[2.75rem] border border-slate-300 rounded-lg px-3 py-2.5 text-sm leading-normal bg-white box-border focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none text-center font-semibold tabular-nums text-amber-700"
                />
                {giftPoints > 0 && (
                  <p className="text-sm text-slate-500 text-center mt-1">
                    = {(giftPoints * pointValue).toFixed(3)} KWD
                  </p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium text-slate-600 block mb-1">
                  {tr('ملاحظة', 'Note')}
                </label>
                <input
                  value={giftNote}
                  onChange={(e) => setGiftNote(e.target.value)}
                  placeholder={tr('سبب المنح (اختياري)...', 'Reason (optional)...')}
                  className="w-full min-h-[2.75rem] border border-slate-300 rounded-lg px-3 py-2.5 text-sm leading-normal bg-white box-border focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none"
                />
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setShowManualGift(false)
                  setGiftCustomer(null)
                }}
                className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {tr('إلغاء', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={handleManualGift}
                disabled={!giftCustomer || giftPoints <= 0 || giftSaving}
                className="flex-1 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 text-sm font-medium text-white disabled:opacity-50 shadow-sm"
              >
                {giftSaving
                  ? tr('⏳ جاري المنح...', 'Saving...')
                  : `🎁 ${tr('منح', 'Award')} ${giftPoints}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
