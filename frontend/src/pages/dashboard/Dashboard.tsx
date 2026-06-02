import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchDashboard, fetchBranches, fetchInvoices, fetchPayments, fetchExpiryStockAlerts } from '../../api/tenant'
import type { DashboardData, Invoice, Branch, Payment } from '../../types'
import { formatDisplayDate, getDashboardDateRange } from '../../utils/date'
import { formatAmount } from '../../utils/currency'
import { asArray } from '../../utils/asArray'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import {
  AreaChart,
  Area,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
  XAxis,
  YAxis,
  LabelList,
} from 'recharts'
import { useTheme } from '../../contexts/ThemeContext'
import { getChartTheme } from '../../utils/chartTheme'
import CommandPalette from '../../components/dashboard/CommandPalette'
import TablePageSkeleton from '../../components/ui/TablePageSkeleton'
import {
  Eye,
  EyeOff,
  Command,
  Clock,
  CheckCircle2,
  FileText,
  AlertTriangle,
  LayoutGrid,
  Calendar,
  Package,
  BarChart3,
  TrendingUp,
  Building2,
  Users,
  ShoppingBag,
  Banknote,
  Receipt,
  CalendarClock,
} from 'lucide-react'

const EXPIRY_DASHBOARD_DAYS = 90

const PERIODS = ['day', 'week', 'month', 'year', 'custom'] as const
type PeriodKey = (typeof PERIODS)[number]

const PASTEL = {
  sales: '#1e40af', // blue-800
  purchases: '#0ea5e9', // sky-500
  expenses: '#dc2626', // red-600
  profit: '#059669', // emerald-600
  bank: '#0f766e', // teal-700
  gap: '#f59e0b', // amber-500
  pie: ['#1e40af', '#0ea5e9', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444'],
}

const FinancialDonutChart: React.FC<{
  totalSales: number
  totalPurchases: number
  totalExpenses: number
  totalReturns: number
  symbol: string
  locale: string
  privacyMode: boolean
  formatMoney: (value: number) => string
  isDark: boolean
}> = ({ totalSales, totalPurchases, totalExpenses, totalReturns, symbol, locale, privacyMode, formatMoney, isDark }) => {
  const chart = getChartTheme(isDark)
  const total = (Number(totalSales) || 0) + (Number(totalPurchases) || 0) + (Number(totalExpenses) || 0) + (Number(totalReturns) || 0)

  const segments = useMemo(() => {
    const safeTotal = total > 0 ? total : 0
    const pct = (v: number) => (safeTotal > 0 ? Number(((v / safeTotal) * 100).toFixed(1)) : 0)
    return [
      { name: 'المبيعات', value: Number(totalSales) || 0, color: '#1D9E75', pct: pct(Number(totalSales) || 0) },
      { name: 'المشتريات', value: Number(totalPurchases) || 0, color: '#378ADD', pct: pct(Number(totalPurchases) || 0) },
      { name: 'المصروفات', value: Number(totalExpenses) || 0, color: '#EF9F27', pct: pct(Number(totalExpenses) || 0) },
      { name: 'المرتجعات', value: Number(totalReturns) || 0, color: '#E24B4A', pct: pct(Number(totalReturns) || 0) },
    ]
  }, [total, totalSales, totalPurchases, totalExpenses, totalReturns])

  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const active = activeIndex !== null ? segments[activeIndex] : null

  return (
    <div className="flex items-center gap-6 flex-wrap" dir="rtl">
      <div className="relative flex-shrink-0" style={{ width: 180, height: 180 }}>
        <PieChart width={180} height={180}>
          <Pie
            data={segments}
            cx={90}
            cy={90}
            innerRadius={55}
            outerRadius={82}
            dataKey="value"
            paddingAngle={2}
            onMouseEnter={(_, i) => setActiveIndex(i)}
            onMouseLeave={() => setActiveIndex(null)}
            isAnimationActive
            animationDuration={900}
            animationEasing="ease-in-out"
          >
            {segments.map((seg, i) => (
              <Cell
                key={seg.name}
                fill={seg.color}
                opacity={activeIndex === null || activeIndex === i ? 1 : 0.4}
                stroke="transparent"
              />
            ))}
          </Pie>
        </PieChart>

        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
          {active ? (
            <>
              <p className="text-[10px] font-semibold" style={{ color: active.color }}>
                {active.name}
              </p>
              <p className="text-sm font-medium mt-0.5 tabular-nums" style={{ color: chart.centerValue }}>
                {privacyMode ? '••••' : formatMoney(active.value)}
              </p>
              <p className="text-[10px]" style={{ color: chart.centerLabel }}>{active.pct.toLocaleString(locale)}%</p>
            </>
          ) : (
            <>
              <p className="text-[10px]" style={{ color: chart.centerLabel }}>الإجمالي</p>
              <p className="text-sm font-medium mt-0.5 tabular-nums" style={{ color: chart.centerValue }}>
                {privacyMode ? '••••' : formatMoney(total)}
              </p>
              <p className="text-[10px]" style={{ color: chart.centerLabel }}>{symbol}</p>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 min-w-[160px] flex flex-col gap-2.5">
        {segments.map((seg, i) => (
          <div
            key={seg.name}
            className="px-3 py-2 rounded-xl border cursor-pointer transition-colors dark:border-slate-600"
            style={{ borderColor: chart.legendBorder, background: 'transparent' }}
            onMouseEnter={(e) => {
              setActiveIndex(i)
              e.currentTarget.style.background = chart.legendHover
            }}
            onMouseLeave={(e) => {
              setActiveIndex(null)
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: seg.color }} />
                <span className="text-xs" style={{ color: chart.legendText }}>{seg.name}</span>
              </div>
              <span className="text-xs font-medium tabular-nums" style={{ color: seg.color }}>
                {privacyMode ? '••••' : formatMoney(seg.value)}
              </span>
            </div>
            <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: chart.progressTrack }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${seg.pct}%`, background: seg.color }} />
            </div>
            <p className="text-[10px] mt-1 text-left" style={{ color: chart.centerLabel }}>{seg.pct.toLocaleString(locale)}%</p>
          </div>
        ))}
      </div>
    </div>
  )
}


export default function Dashboard() {
  const { currentTenant, can } = useAuth()
  const { t, lang } = useLanguage()
  const { isDark } = useTheme()
  const chartTheme = useMemo(() => getChartTheme(isDark), [isDark])
  const navigate = useNavigate()
  const location = useLocation()
  const tenantId = currentTenant?.id ?? 0

  const [period, setPeriod] = useState<PeriodKey>('year')
  const [activeTab, setActiveTab] = useState<'general' | 'quick' | 'latest' | 'low_stock'>('general')
  const getDefaultMonth = () => {
    const n = new Date()
    return {
      from: new Date(n.getFullYear(), n.getMonth(), 1).toISOString().slice(0, 10),
      to: new Date(n.getFullYear(), n.getMonth() + 1, 0).toISOString().slice(0, 10),
    }
  }
  const [customFrom, setCustomFrom] = useState(() => getDefaultMonth().from)
  const [customTo, setCustomTo] = useState(() => getDefaultMonth().to)
  const [branchId, setBranchId] = useState<number | null>(null)
  const [privacyMode, setPrivacyMode] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [forceEmpty, setForceEmpty] = useState(() => new URLSearchParams(location.search).get('state') === 'empty')

  useEffect(() => {
    setForceEmpty(new URLSearchParams(location.search).get('state') === 'empty')
  }, [location.search])

  const params = useMemo(() => {
    if (period === 'custom' && customFrom && customTo) {
      return { period: 'custom', from_date: customFrom, to_date: customTo, branch_id: branchId }
    }
    const range = getDashboardDateRange(period as 'day' | 'week' | 'month' | 'year')
    return { period, from_date: range.from_date, to_date: range.to_date, branch_id: branchId }
  }, [period, customFrom, customTo, branchId])

  const toLocalDate = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0)
  }
  const toIsoDate = (dt: Date) => {
    const y = dt.getFullYear()
    const m = String(dt.getMonth() + 1).padStart(2, '0')
    const d = String(dt.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const addDays = (iso: string, days: number) => {
    const dt = toLocalDate(iso)
    dt.setDate(dt.getDate() + days)
    return toIsoDate(dt)
  }

  const { data: kpiData, isLoading: isLoadingKpi, error: errorKpi } = useQuery<DashboardData>({
    queryKey: ['dashboard', 'kpi', tenantId, params],
    queryFn: () => fetchDashboard(tenantId, params),
    enabled: !!tenantId && (period !== 'custom' || (!!customFrom && !!customTo)),
    refetchOnMount: 'always',
  })

  const selectedYear = useMemo(() => {
    const to = (period === 'custom' ? customTo : params.to_date) || toIsoDate(new Date())
    const y = Number(String(to).slice(0, 4))
    return Number.isFinite(y) && y > 1990 ? y : new Date().getFullYear()
  }, [period, customTo, params.to_date])

  const yearParams = useMemo(() => {
    return { period: 'custom', from_date: `${selectedYear}-01-01`, to_date: `${selectedYear}-12-31`, branch_id: branchId }
  }, [selectedYear, branchId])

  const { data: yearData } = useQuery<DashboardData>({
    queryKey: ['dashboard', 'year', tenantId, yearParams],
    queryFn: () => fetchDashboard(tenantId, yearParams),
    enabled: !!tenantId,
    refetchOnMount: 'always',
  })

  const last30Params = useMemo(() => {
    const to = (kpiData?.filter?.to_date && !forceEmpty) ? kpiData.filter.to_date : toIsoDate(new Date())
    const from = addDays(to, -29)
    return { period: 'custom', from_date: from, to_date: to, branch_id: branchId }
  }, [kpiData?.filter?.to_date, branchId, forceEmpty])

  const { data: data30, isLoading: isLoading30, error: error30 } = useQuery<DashboardData>({
    queryKey: ['dashboard', 'last30', tenantId, last30Params],
    queryFn: () => fetchDashboard(tenantId, last30Params),
    enabled: !!tenantId,
    refetchOnMount: 'always',
  })

  const { data: branchesData } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId,
  })
  const branches: Branch[] = asArray<Branch>(branchesData)

  const { data: expiryAlertsResp, isLoading: isLoadingExpiryAlerts } = useQuery({
    queryKey: ['inventory', 'expiry-alerts', 'dashboard', tenantId, EXPIRY_DASHBOARD_DAYS],
    queryFn: () => fetchExpiryStockAlerts(tenantId, { within_days: String(EXPIRY_DASHBOARD_DAYS) }),
    enabled: !!tenantId && can('inventory'),
    staleTime: 60_000,
  })
  type ExpiryDashboardRow = {
    expiry_date: string
    qty: number
    batch_number: string | null
    item_code: string
    item_name: string
    variant_name: string | null
    warehouse_name: string | null
  }
  const expiryAlertRows = (expiryAlertsResp?.data ?? []) as ExpiryDashboardRow[]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setCommandOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const locale = lang === 'ar' ? 'ar-U-nu-latn' : 'en-US'
  const dashboardCurrency = kpiData?.currency ?? data30?.currency
  const symbol = dashboardCurrency?.symbol ?? 'د.ك'
  const amountDecimals = dashboardCurrency?.decimal_places ?? 2

  // تنظيف القيمة الخام وتحويلها إلى رقم بعدد الكسور من إعدادات العملة
  const cleanNumeric = (raw: unknown): number | null => {
    let str = String(raw ?? '').trim()
    if (!str) return null
    str = str.replace(/\s+\d+$/, '').trim()
    const firstToken = str.split(/\s+/)[0]
    const numericStr = firstToken.replace(/[^\d.-]/g, '')
    if (!numericStr) return null
    const n = Number(numericStr)
    if (Number.isNaN(n)) return null
    return Number(Number(n).toFixed(amountDecimals))
  }

  // تنسيق المبالغ بعدد كسور العملة من الـ API (Currency Config)
  const fmt = (raw: unknown, blur = false): string => {
    if (privacyMode && blur) return '••••'
    const cleaned = String(raw ?? '').replace(/\s+\d+$/, '').trim()
    const n = parseFloat(cleaned)
    if (Number.isNaN(n)) return formatAmount(0, dashboardCurrency, locale)
    return formatAmount(n, dashboardCurrency, locale)
  }
  const moneyColor = (n: number) => (n > 0 ? 'text-emerald-600' : n < 0 ? 'text-red-600' : 'text-slate-700 dark:text-slate-200')

  const payrollDailyCost = kpiData?.summary?.payroll_daily_cost ?? null

  const commandActions = useMemo(
    () => [
      {
        id: 'yesterday',
        label: 'عرض مبيعات أمس',
        labelEn: "Show yesterday's sales",
        keywords: ['مبيعات', 'أمس', 'sales', 'yesterday'],
        run: () => setPeriod('day'),
      },
      {
        id: 'month',
        label: 'عرض مبيعات الشهر',
        labelEn: "Show this month's sales",
        keywords: ['شهر', 'مبيعات', 'month', 'sales'],
        run: () => setPeriod('month'),
      },
      {
        id: 'invoices',
        label: 'الذهاب إلى الفواتير',
        labelEn: 'Go to Invoices',
        keywords: ['فواتير', 'invoices'],
        run: () => navigate('/invoices'),
      },
      {
        id: 'pos',
        label: 'فتح نقطة البيع',
        labelEn: 'Open POS',
        keywords: ['نقطة بيع', 'pos'],
        run: () => navigate('/pos'),
      },
    ],
    [navigate]
  )

  const summary = forceEmpty ? undefined : kpiData?.summary

  const recentSales30 = forceEmpty ? [] : data30?.recent_sales ?? []
  const dashboardPayments = forceEmpty ? [] : data30?.recent_payments ?? []
  const lowStockItems = forceEmpty ? [] : (kpiData?.low_stock_items ?? data30?.low_stock_items ?? [])

  const isTrulyEmpty = forceEmpty || (!summary && recentSales30.length === 0)

  const kpiSales = isTrulyEmpty ? null : (summary?.total_sales ?? 0)
  const totalExpenses = isTrulyEmpty ? null : (summary?.total_expenses ?? 0)
  const totalReturns = isTrulyEmpty ? null : (summary?.total_sales_returns ?? 0)
  const purchasesSum = isTrulyEmpty ? null : (summary?.total_purchases ?? 0)

  const salesYearSeries = useMemo(() => {
    const base = forceEmpty ? [] : (yearData?.chart_data ?? [])
    return base.map((p) => ({
      period_label: p.period_label,
      sales: Number(p.sales) || 0,
    }))
  }, [yearData?.chart_data, forceEmpty])

  const salesYearHasValues = salesYearSeries.some((p) => p.sales > 0)

  const topSellingItems = useMemo(() => {
    const rows = forceEmpty ? [] : (yearData?.top_selling_items ?? [])
    const blues = ['#1e40af', '#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa']
    return rows.slice(0, 5).map((r, idx) => ({
      name: r.name,
      quantity_sold: Number((r as any).quantity_sold) || 0,
      revenue: Number(r.revenue) || 0,
      fill: blues[idx % blues.length],
    }))
  }, [yearData?.top_selling_items, forceEmpty])

  const [activeTopItem, setActiveTopItem] = useState<number | null>(null)

  useDocumentTitle(
    lang === 'ar'
      ? activeTab === 'general'
        ? 'لوحة التحكم'
        : activeTab === 'quick'
          ? 'لوحة التحكم — روابط سريعة'
          : activeTab === 'latest'
            ? 'لوحة التحكم — أحدث العمليات'
            : 'لوحة التحكم — أصناف قاربت على الانتهاء'
      : activeTab === 'general'
        ? 'Dashboard'
        : activeTab === 'quick'
          ? 'Dashboard — Quick Links'
          : activeTab === 'latest'
            ? 'Dashboard — Latest Operations'
            : 'Dashboard — Low Stock Items'
  )

  const invoiceStatusMeta = (status: string | undefined) => {
    const s = (status || '').toLowerCase()
    const statuses = t.invoices?.statuses
    if (s === 'paid') return { label: statuses?.paid ?? (lang === 'ar' ? 'مدفوعة' : 'Paid'), Icon: CheckCircle2, cls: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800' }
    if (s === 'draft') return { label: statuses?.draft ?? (lang === 'ar' ? 'مسودة' : 'Draft'), Icon: FileText, cls: 'text-slate-700 bg-slate-50 border-slate-200 dark:bg-slate-700/50 dark:border-slate-600' }
    if (s === 'overdue') return { label: statuses?.overdue ?? (lang === 'ar' ? 'متأخرة' : 'Overdue'), Icon: AlertTriangle, cls: 'text-orange-700 bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800' }
    if (s === 'posted') return { label: statuses?.posted ?? (lang === 'ar' ? 'مرحّلة' : 'Posted'), Icon: CheckCircle2, cls: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800' }
    if (s === 'partial') return { label: statuses?.partial ?? (lang === 'ar' ? 'مدفوعة جزئياً' : 'Partial'), Icon: Clock, cls: 'text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800' }
    if (s === 'sent') return { label: statuses?.sent ?? (lang === 'ar' ? 'مرسلة' : 'Sent'), Icon: FileText, cls: 'text-indigo-700 bg-indigo-50 border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-800' }
    if (s === 'cancelled') return { label: statuses?.cancelled ?? (lang === 'ar' ? 'ملغاة' : 'Cancelled'), Icon: AlertTriangle, cls: 'text-red-700 bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800' }
    return { label: statuses?.posted ?? (lang === 'ar' ? 'مفتوحة' : 'Open'), Icon: Clock, cls: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800' }
  }

  const latestOpsParams = useMemo(() => {
    const p: Record<string, string> = {
      from_date: last30Params.from_date,
      to_date: last30Params.to_date,
      per_page: '5',
    }
    if (branchId != null) p.branch_id = String(branchId)
    return p
  }, [last30Params.from_date, last30Params.to_date, branchId])

  const { data: recentPurchaseInvoicesResp } = useQuery({
    queryKey: ['dashboard', 'latest', 'purchase-invoices', tenantId, latestOpsParams],
    queryFn: ({ signal }) => fetchInvoices(tenantId, { ...latestOpsParams, type: 'purchase' }, signal),
    enabled: !!tenantId,
  })
  const recentPurchaseInvoices: Invoice[] = (recentPurchaseInvoicesResp as any)?.data ?? []

  const { data: recentReceiptVouchersResp } = useQuery({
    queryKey: ['dashboard', 'latest', 'receipt-vouchers', tenantId, latestOpsParams],
    queryFn: () => fetchPayments(tenantId, { ...latestOpsParams, type: 'receipt' }),
    enabled: !!tenantId,
  })
  const recentReceiptVouchers: Payment[] = (recentReceiptVouchersResp as any)?.data ?? []

  const { data: recentPaymentVouchersResp } = useQuery({
    queryKey: ['dashboard', 'latest', 'payment-vouchers', tenantId, latestOpsParams],
    queryFn: () => fetchPayments(tenantId, { ...latestOpsParams, type: 'payment' }),
    enabled: !!tenantId,
  })
  const recentPaymentVouchers: Payment[] = (recentPaymentVouchersResp as any)?.data ?? []

  const formatPaymentType = (type: Payment['type'] | undefined) => {
    const s = String(type ?? '').toLowerCase()
    if (lang === 'ar') {
      if (s === 'receipt') return 'سند قبض'
      if (s === 'payment') return 'سند صرف'
      if (s === 'transfer') return 'تحويل'
      if (s === 'refund') return 'مرتجع'
      return 'سند'
    }
    if (s === 'receipt') return 'Receipt'
    if (s === 'payment') return 'Payment'
    if (s === 'transfer') return 'Transfer'
    if (s === 'refund') return 'Refund'
    return 'Voucher'
  }

  // IMPORTANT: keep all hooks above this point (Rules of Hooks).
  if (!forceEmpty && (isLoadingKpi || isLoading30) && !(kpiData && data30)) {
    return (
      <div className="p-3 md:p-5 space-y-6 min-w-0 max-w-full">
        <div className="h-10 w-full max-w-md bg-slate-200 rounded-xl animate-pulse" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-28 bg-white rounded-2xl border border-slate-200 animate-pulse" />
          ))}
        </div>
        <TablePageSkeleton rows={6} />
      </div>
    )
  }

  if (!forceEmpty && (errorKpi || error30)) {
    return (
      <div className="p-6">
        <div className="bg-red-50 text-red-600 rounded-xl p-4">{t.msg.errorOccurred}</div>
      </div>
    )
  }

  const cardCls =
    'bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-[0_1px_10px_rgba(15,23,42,0.06)] hover:shadow-md transition-shadow duration-200'

  return (
    <div className="p-3 md:p-5 space-y-6 bg-transparent" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} actions={commandActions} lang={lang} />

      {/* Toolbar: filters + privacy + command */}
      <div className={`flex flex-wrap items-center gap-2 py-2 px-3 rounded-xl ${cardCls}`}>
        <span className="text-slate-600 dark:text-slate-400 font-medium text-xs sm:text-sm leading-none">{t.dashboard.filterPeriod}:</span>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as PeriodKey)}
          className="h-9 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 text-sm min-w-[160px]"
        >
          <option value="day">{t.dashboard.periodDay}</option>
          <option value="week">{t.dashboard.periodWeek}</option>
          <option value="month">{t.dashboard.periodMonth}</option>
          <option value="year">{t.dashboard.periodYear}</option>
          <option value="custom">{t.dashboard.periodCustom}</option>
        </select>
        {period === 'custom' && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="h-9 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 text-sm"
            />
            <span className="text-slate-500">–</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="h-9 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 text-sm"
            />
          </div>
        )}
        <select
          value={branchId ?? ''}
          onChange={(e) => setBranchId(e.target.value ? Number(e.target.value) : null)}
          className="h-9 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 text-sm min-w-[260px]"
        >
          <option value="">{t.dashboard.allBranches}</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {lang === 'ar' ? b.name : (b.name_en || b.name)}
            </option>
          ))}
        </select>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setCommandOpen(true)}
          className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300 text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          <Command size={16} />
          <span className="hidden sm:inline">{t.dashboard.commandPalette}</span>
        </button>
        <button
          type="button"
          onClick={() => setPrivacyMode((m) => !m)}
          className={`flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium ${
            privacyMode
              ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
          }`}
        >
          {privacyMode ? <EyeOff size={16} /> : <Eye size={16} />}
          {t.dashboard.privacyMode}
        </button>
        <button
          type="button"
          onClick={() => setForceEmpty((v) => !v)}
          className={`h-9 px-3 rounded-lg text-sm font-medium transition-colors ${
            forceEmpty
              ? 'bg-slate-900 text-white'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
          }`}
          title={lang === 'ar' ? 'معاينة حالة عدم وجود بيانات' : 'Preview empty state'}
        >
          {forceEmpty ? (lang === 'ar' ? 'عرض البيانات الفعلية' : 'Show actual data') : (lang === 'ar' ? 'معاينة الحالة الفارغة' : 'Preview empty')}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 mt-1">
        {[
          { id: 'general' as const, labelAr: 'عام', labelEn: 'General' },
          { id: 'quick' as const, labelAr: 'روابط سريعة', labelEn: 'Quick Links' },
          { id: 'latest' as const, labelAr: 'أحدث العمليات', labelEn: 'Latest Operations' },
          { id: 'low_stock' as const, labelAr: 'أصناف قاربت على الانتهاء', labelEn: 'Low Stock Items' },
        ].map((tab) => {
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                active
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white dark:bg-slate-800/50 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {lang === 'ar' ? tab.labelAr : tab.labelEn}
            </button>
          )
        })}
      </div>

      {activeTab === 'general' && (
        <>
          {/* KPI strip (4 cards) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className={`${cardCls} p-5 text-center border-r-4 border-r-emerald-500`}>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{t.dashboard.totalSales}</p>
              <div className="amount-wrapper mt-2">
                <span
                  dir="ltr"
                  className={`amount-display text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums whitespace-nowrap text-emerald-600 ${privacyMode ? 'blur-md' : ''}`}
                  title={privacyMode ? '' : `${fmt(kpiSales, false)} ${symbol}`}
                >
                  {fmt(kpiSales, true)}
                </span>
                <span className="currency-tag">{symbol}</span>
              </div>
            </div>
            <div className={`${cardCls} p-5 text-center border-r-4 border-r-blue-500`}>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{t.dashboard.totalPurchases}</p>
              <div className="amount-wrapper mt-2">
                <span
                  dir="ltr"
                  className={`amount-display text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums whitespace-nowrap text-blue-600 ${privacyMode ? 'blur-md' : ''}`}
                  title={privacyMode ? '' : `${fmt(purchasesSum, false)} ${symbol}`}
                >
                  {fmt(purchasesSum, true)}
                </span>
                <span className="currency-tag">{symbol}</span>
              </div>
            </div>
            <div className={`${cardCls} p-5 text-center border-r-4 border-r-red-400`}>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                {lang === 'ar' ? 'إجمالي المرتجعات' : 'Total Returns'}
              </p>
              <div className="amount-wrapper mt-2">
                <span
                  dir="ltr"
                  className={`amount-display text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums whitespace-nowrap text-red-500 ${privacyMode ? 'blur-md' : ''}`}
                  title={privacyMode ? '' : `${fmt(totalReturns, false)} ${symbol}`}
                >
                  {fmt(totalReturns, true)}
                </span>
                <span className="currency-tag">{symbol}</span>
              </div>
            </div>
            {/* إجمالي المصروفات (بدلاً من رصيد البنك) */}
            <div className={`${cardCls} p-5 text-center border-r-4 border-r-amber-500`}>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                {t.dashboard.totalExpenses}
              </p>
              <div className="amount-wrapper mt-2">
                <span
                  dir="ltr"
                  className={`amount-display text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums whitespace-nowrap text-amber-600 ${privacyMode ? 'blur-md' : ''}`}
                  title={privacyMode ? '' : `${fmt(totalExpenses, false)} ${symbol}`}
                >
                  {fmt(totalExpenses, true)}
                </span>
                <span className="currency-tag">{symbol}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* توزيع مالي شامل (مخطط دائري) */}
            <div className={`${cardCls} p-4 sm:p-5`}>
              <h2 className="text-base sm:text-lg font-semibold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
                <BarChart3 size={22} />
                {lang === 'ar' ? 'توزيع مالي شامل' : 'Financial distribution'}
              </h2>
              <div className="h-64">
                {((Number(kpiSales) || 0) + (Number(purchasesSum) || 0) + (Number(totalExpenses) || 0) + (Number(totalReturns) || 0)) <= 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-slate-500 dark:text-slate-400">
                    {lang === 'ar' ? 'لا توجد بيانات للعرض' : 'No data to display'}
                  </div>
                ) : (
                  <FinancialDonutChart
                    totalSales={Number(kpiSales) || 0}
                    totalPurchases={Number(purchasesSum) || 0}
                    totalExpenses={Number(totalExpenses) || 0}
                    totalReturns={Number(totalReturns) || 0}
                    symbol={symbol}
                    locale={locale}
                    privacyMode={privacyMode}
                    formatMoney={(v) => formatAmount(v, dashboardCurrency, locale)}
                    isDark={isDark}
                  />
                )}
              </div>
            </div>

            {/* منحنى أداء المبيعات الشهري */}
            <div className={`${cardCls} p-4 sm:p-5`}>
              <h2 className="text-base sm:text-lg font-semibold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
                <TrendingUp size={22} />
                {lang === 'ar' ? 'منحنى أداء المبيعات الشهري' : 'Monthly Sales Performance'}
              </h2>
              <div className="h-64 w-full min-h-[256px]">
                {salesYearSeries.length === 0 || !salesYearHasValues ? (
                  <div className="flex h-full items-center justify-center text-sm text-slate-500 dark:text-slate-400">
                    {lang === 'ar' ? 'لا توجد بيانات للعرض' : 'No data to display'}
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={256}>
                    <AreaChart data={salesYearSeries} margin={{ left: 6, right: 10, top: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartTheme.grid} />
                      <XAxis
                        dataKey="period_label"
                        tick={{ fontSize: 11, fill: chartTheme.axis }}
                        tickFormatter={(v) => {
                          const s = String(v ?? '')
                          return s.length >= 7 ? s.slice(5) : s
                        }}
                      />
                      <YAxis tick={{ fontSize: 11, fill: chartTheme.axis }} />
                      <RechartsTooltip
                        contentStyle={{
                          background: chartTheme.tooltipBg,
                          border: `1px solid ${chartTheme.tooltipBorder}`,
                          borderRadius: 8,
                          color: chartTheme.tooltipText,
                        }}
                        labelFormatter={(label) => (label == null ? '' : String(label))}
                        formatter={(value, name) =>
                          privacyMode
                            ? (['••••', name] as [string, string])
                            : ([`${fmt(value, false)} ${symbol}`, name] as [string, string])
                        }
                      />
                      <Area
                        type="monotone"
                        dataKey="sales"
                        name={lang === 'ar' ? 'المبيعات' : 'Sales'}
                        stroke={PASTEL.sales}
                        fill={PASTEL.sales}
                        fillOpacity={0.14}
                        strokeWidth={2}
                        dot={{ r: 2, strokeWidth: 1, fill: PASTEL.sales }}
                        activeDot={{ r: 4 }}
                        isAnimationActive
                        animationDuration={900}
                        animationEasing="ease-in-out"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          {/* أعلى 5 أصناف مبيعاً */}
          <div className={`${cardCls} p-4 sm:p-5`}>
            <h2 className="text-base sm:text-lg font-semibold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
              <Package size={22} />
              {lang === 'ar' ? 'أعلى 5 أصناف مبيعاً' : 'Top 5 Best Sellers'}
            </h2>
            <div className="h-80">
              {topSellingItems.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-500 dark:text-slate-400">
                  {lang === 'ar' ? 'لا توجد بيانات للعرض' : 'No data to display'}
                </div>
              ) : (
                <div className="w-full max-w-none mx-auto h-full">
                  <div className={`h-full w-full flex ${lang === 'ar' ? 'flex-row-reverse' : ''} gap-4`}>
                    <div className="w-48 shrink-0 h-full">
                      <div className="h-full flex flex-col justify-between py-10">
                        {topSellingItems.map((it, idx) => (
                          <div
                            key={`top-item-name-${it.name}-${idx}`}
                            className="text-sm font-medium text-slate-700 dark:text-slate-200 leading-snug"
                            style={{ direction: lang === 'ar' ? 'rtl' : 'ltr', textAlign: lang === 'ar' ? 'right' : 'left' }}
                          >
                            {it.name}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex-1 min-w-0 h-full min-h-[320px]">
                      <ResponsiveContainer width="100%" height={320}>
                        <BarChart
                          data={topSellingItems}
                          layout="vertical"
                          margin={{ top: 6, right: 84, bottom: 6, left: 0 }}
                          barCategoryGap={18}
                        >
                    <defs>
                      {topSellingItems.map((entry, idx) => (
                        <linearGradient key={`top-item-grad-${idx}`} id={`topItemGrad${idx}`} x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor={entry.fill} stopOpacity={1} />
                          <stop offset="100%" stopColor={entry.fill} stopOpacity={0.72} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={chartTheme.grid} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: chartTheme.axis }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={0}
                      hide
                      tick={false}
                      padding={{ top: 10, bottom: 10 }}
                    />
                    <RechartsTooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || payload.length === 0) return null
                        const p = payload[0]?.payload as any
                        const itemName = String(p?.name ?? '')
                        const qty = Number(p?.quantity_sold ?? 0)
                        const revenue = Number(p?.revenue ?? 0)
                        return (
                          <div
                            className="rounded-xl border px-3 py-2 shadow-sm backdrop-blur"
                            style={{
                              background: chartTheme.tooltipBg,
                              borderColor: chartTheme.tooltipBorder,
                              color: chartTheme.tooltipText,
                            }}
                          >
                            <div className="text-sm font-semibold">{itemName}</div>
                            <div className="mt-1 text-xs opacity-80">
                              {lang === 'ar' ? 'الكمية المباعة' : 'Qty sold'}:{' '}
                              <span className="font-semibold">{privacyMode ? '••••' : qty.toFixed(3)}</span>
                            </div>
                            <div className="text-xs opacity-80">
                              {lang === 'ar' ? 'إجمالي الإيراد' : 'Total revenue'}:{' '}
                              <span className="font-semibold">{privacyMode ? '••••' : `${fmt(revenue, false)} ${symbol}`}</span>
                            </div>
                          </div>
                        )
                      }}
                    />
                    <Bar
                      dataKey="revenue"
                      name={lang === 'ar' ? 'الإيراد' : 'Revenue'}
                      radius={[0, 20, 20, 0]}
                      onMouseLeave={() => setActiveTopItem(null)}
                      onMouseEnter={(_, idx) => setActiveTopItem(idx)}
                      isAnimationActive
                      animationDuration={900}
                      animationEasing="ease-in-out"
                      background={{ fill: '#f1f5f9', radius: 20 }}
                    >
                      {topSellingItems.map((entry, idx) => (
                        <Cell
                          key={`top-item-bar-${entry.name}-${idx}`}
                          fill={`url(#topItemGrad${idx})`}
                          opacity={activeTopItem === null || activeTopItem === idx ? 1 : 0.78}
                        />
                      ))}
                      <LabelList
                        dataKey="revenue"
                        position="right"
                        offset={10}
                        formatter={(v: unknown) => (privacyMode ? '••••' : `${fmt(v, false)} ${symbol}`)}
                        className="fill-slate-700 dark:fill-slate-200 text-xs font-semibold"
                      />
                    </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {activeTab === 'quick' && (
        <div className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-[0_1px_10px_rgba(15,23,42,0.06)] hover:shadow-md transition-shadow duration-200 p-4 sm:p-5">
          <h2 className="text-base sm:text-lg font-semibold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
            <LayoutGrid size={22} />
            {lang === 'ar' ? 'روابط سريعة' : 'Quick Links'}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 lg:gap-5">
            {[
              { path: '/reports/item-sales', labelAr: 'المبيعات اليومية', labelEn: 'Daily Sales', icon: Calendar, bg: 'bg-emerald-500' },
              { path: '/reports/item-sales', labelAr: 'تقرير عن الأصناف', labelEn: 'Item Sales Report', icon: Package, bg: 'bg-blue-500' },
              { path: '/inventory/low-stock', labelAr: 'تنبيه لكميات الأصناف القليلة', labelEn: 'Low Stock Alert', icon: AlertTriangle, bg: 'bg-red-500' },
              { path: '/inventory/low-stock', labelAr: 'تنبيه النواقص', labelEn: 'Shortage Alert', icon: BarChart3, bg: 'bg-red-600' },
              { path: '/reports/best-selling', labelAr: 'الأفضل مبيعاً', labelEn: 'Best Selling', icon: TrendingUp, bg: 'bg-blue-600' },
              { path: '/inventory-report', labelAr: 'تقرير المخزون بالفرع', labelEn: 'Inventory by Branch', icon: Building2, bg: 'bg-sky-500' },
              { path: '/vendors/balances', labelAr: 'تقرير الموردين', labelEn: 'Vendors Report', icon: Users, bg: 'bg-red-500' },
              { path: '/customers/balances', labelAr: 'تقرير العملاء', labelEn: 'Customers Report', icon: Users, bg: 'bg-amber-500' },
              { path: '/reports/item-purchases', labelAr: 'تقرير المشتريات', labelEn: 'Purchases Report', icon: ShoppingBag, bg: 'bg-sky-400' },
              {
                path: '/reports/monthly-purchases-analysis',
                labelAr: 'تحليل المشتريات الشهرية',
                labelEn: 'Monthly purchase analysis',
                icon: ShoppingBag,
                bg: 'bg-sky-600',
              },
              { path: '/reports/payments', labelAr: 'تقرير المدفوعات', labelEn: 'Payments Report', icon: Banknote, bg: 'bg-amber-400' },
              { path: '/reports/item-sales', labelAr: 'تقرير المبيعات', labelEn: 'Sales Report', icon: Receipt, bg: 'bg-emerald-600' },
              { path: '/reports/item-sales', labelAr: 'المبيعات الشهرية', labelEn: 'Monthly Sales', icon: Calendar, bg: 'bg-emerald-500' },
            ].map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={`${item.path}-${item.labelAr}`}
                  to={item.path}
                  className={`${item.bg} rounded-2xl px-4 py-4 sm:px-5 sm:py-5 flex flex-col items-center justify-center gap-2.5 text-white min-h-[112px] sm:min-h-[136px] shadow-sm hover:shadow-md hover:scale-[1.04] hover:brightness-105 transition-transform transition-shadow duration-150 ease-out`}
                >
                  <Icon size={40} className="shrink-0" />
                  <span className="text-sm sm:text-base font-semibold text-center leading-snug">
                    {lang === 'ar' ? item.labelAr : item.labelEn}
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {activeTab === 'latest' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Latest 5 Sales */}
          <div className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-[0_1px_10px_rgba(15,23,42,0.06)] hover:shadow-md transition-shadow duration-200 p-4 overflow-auto">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {lang === 'ar' ? 'أحدث 5 فواتير مبيعات' : 'Latest 5 Sales Invoices'}
              </h2>
              <button type="button" onClick={() => navigate('/invoices/sales')} className="text-sm font-medium text-primary-600 hover:underline">
                {lang === 'ar' ? 'عرض الكل' : 'View all'}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-0">
                <thead>
                  <tr className="text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                    <th className="text-right py-2">{t.invoices.invoiceNumber}</th>
                    <th className="text-right py-2">{t.date}</th>
                    <th className="text-right py-2">{lang === 'ar' ? 'العميل' : 'Customer'}</th>
                    <th className="text-right py-2">{t.amount}</th>
                    <th className="text-right py-2">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {recentSales30.slice(0, 5).map((inv: Invoice) => {
                    const meta = invoiceStatusMeta(inv.status)
                    const name = inv.customer?.name || inv.customer?.name_en || '—'
                    return (
                      <tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                        <td className="py-2 font-mono text-slate-900 dark:text-slate-100 whitespace-nowrap">{inv.number}</td>
                        <td className="py-2 text-slate-700 dark:text-slate-200 whitespace-nowrap">{formatDisplayDate(inv.date)}</td>
                        <td className="py-2 text-slate-700 dark:text-slate-200">{name}</td>
                        <td className="py-2">
                          <div className={`amount-wrapper justify-end ${privacyMode ? 'blur-sm' : ''}`}>
                            <span dir="ltr" className="amount-display font-semibold tabular-nums whitespace-nowrap">
                              {fmt(inv.total, true)}
                            </span>
                            <span className="currency-tag">{symbol}</span>
                          </div>
                        </td>
                        <td className="py-2">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${meta.cls}`}>
                            <meta.Icon size={14} />
                            {meta.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                  {recentSales30.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-400">
                        {t.noData}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Latest 5 Purchases */}
          <div className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-[0_1px_10px_rgba(15,23,42,0.06)] hover:shadow-md transition-shadow duration-200 p-4 overflow-auto">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {lang === 'ar' ? 'أحدث 5 فواتير مشتريات' : 'Latest 5 Purchase Invoices'}
              </h2>
              <button type="button" onClick={() => navigate('/invoices/purchases')} className="text-sm font-medium text-primary-600 hover:underline">
                {lang === 'ar' ? 'عرض الكل' : 'View all'}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-0">
                <thead>
                  <tr className="text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                    <th className="text-right py-2">{t.invoices.invoiceNumber}</th>
                    <th className="text-right py-2">{t.date}</th>
                    <th className="text-right py-2">{lang === 'ar' ? 'المورد' : 'Vendor'}</th>
                    <th className="text-right py-2">{t.amount}</th>
                    <th className="text-right py-2">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {recentPurchaseInvoices.slice(0, 5).map((inv: Invoice) => {
                    const meta = invoiceStatusMeta(inv.status)
                    const name = inv.vendor?.name || inv.vendor?.name_en || '—'
                    return (
                      <tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                        <td className="py-2 font-mono text-slate-900 dark:text-slate-100 whitespace-nowrap">{inv.number}</td>
                        <td className="py-2 text-slate-700 dark:text-slate-200 whitespace-nowrap">{formatDisplayDate(inv.date)}</td>
                        <td className="py-2 text-slate-700 dark:text-slate-200">{name}</td>
                        <td className="py-2">
                          <div className={`amount-wrapper justify-end ${privacyMode ? 'blur-sm' : ''}`}>
                            <span dir="ltr" className="amount-display font-semibold tabular-nums whitespace-nowrap">
                              {fmt(inv.total, true)}
                            </span>
                            <span className="currency-tag">{symbol}</span>
                          </div>
                        </td>
                        <td className="py-2">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${meta.cls}`}>
                            <meta.Icon size={14} />
                            {meta.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                  {recentPurchaseInvoices.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-400">
                        {t.noData}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Latest 5 Receipt Vouchers */}
          <div className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-[0_1px_10px_rgba(15,23,42,0.06)] hover:shadow-md transition-shadow duration-200 p-4 overflow-auto">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {lang === 'ar' ? 'أحدث 5 سندات قبض' : 'Latest 5 Receipt Vouchers'}
              </h2>
              <button type="button" onClick={() => navigate('/receipt-vouchers')} className="text-sm font-medium text-primary-600 hover:underline">
                {lang === 'ar' ? 'عرض الكل' : 'View all'}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-0">
                <thead>
                  <tr className="text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                    <th className="text-right py-2">{lang === 'ar' ? 'الرقم' : 'Number'}</th>
                    <th className="text-right py-2">{t.date}</th>
                    <th className="text-right py-2">{lang === 'ar' ? 'الطرف' : 'Party'}</th>
                    <th className="text-right py-2">{t.amount}</th>
                    <th className="text-right py-2">{lang === 'ar' ? 'النوع' : 'Type'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {recentReceiptVouchers.slice(0, 5).map((p: Payment) => {
                    const party = p.customer?.name || p.vendor?.name || p.customer?.name_en || p.vendor?.name_en || '—'
                    return (
                      <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                        <td className="py-2 font-mono text-slate-900 dark:text-slate-100 whitespace-nowrap">{p.number}</td>
                        <td className="py-2 text-slate-700 dark:text-slate-200 whitespace-nowrap">{formatDisplayDate(p.date)}</td>
                        <td className="py-2 text-slate-700 dark:text-slate-200">{party}</td>
                        <td className="py-2">
                          <div className={`amount-wrapper justify-end ${privacyMode ? 'blur-sm' : ''}`}>
                            <span dir="ltr" className="amount-display font-semibold tabular-nums whitespace-nowrap">
                              {fmt(p.amount, true)}
                            </span>
                            <span className="currency-tag">{symbol}</span>
                          </div>
                        </td>
                        <td className="py-2 text-slate-700 dark:text-slate-200">{formatPaymentType(p.type)}</td>
                      </tr>
                    )
                  })}
                  {recentReceiptVouchers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-400">
                        {t.noData}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Latest 5 Payment Vouchers */}
          <div className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-[0_1px_10px_rgba(15,23,42,0.06)] hover:shadow-md transition-shadow duration-200 p-4 overflow-auto">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {lang === 'ar' ? 'أحدث 5 سندات صرف' : 'Latest 5 Payment Vouchers'}
              </h2>
              <button type="button" onClick={() => navigate('/payment-vouchers')} className="text-sm font-medium text-primary-600 hover:underline">
                {lang === 'ar' ? 'عرض الكل' : 'View all'}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-0">
                <thead>
                  <tr className="text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                    <th className="text-right py-2">{lang === 'ar' ? 'الرقم' : 'Number'}</th>
                    <th className="text-right py-2">{t.date}</th>
                    <th className="text-right py-2">{lang === 'ar' ? 'الطرف' : 'Party'}</th>
                    <th className="text-right py-2">{t.amount}</th>
                    <th className="text-right py-2">{lang === 'ar' ? 'النوع' : 'Type'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {recentPaymentVouchers.slice(0, 5).map((p: Payment) => {
                    const party = p.customer?.name || p.vendor?.name || p.customer?.name_en || p.vendor?.name_en || '—'
                    return (
                      <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                        <td className="py-2 font-mono text-slate-900 dark:text-slate-100 whitespace-nowrap">{p.number}</td>
                        <td className="py-2 text-slate-700 dark:text-slate-200 whitespace-nowrap">{formatDisplayDate(p.date)}</td>
                        <td className="py-2 text-slate-700 dark:text-slate-200">{party}</td>
                        <td className="py-2">
                          <div className={`amount-wrapper justify-end ${privacyMode ? 'blur-sm' : ''}`}>
                            <span dir="ltr" className="amount-display font-semibold tabular-nums whitespace-nowrap">
                              {fmt(p.amount, true)}
                            </span>
                            <span className="currency-tag">{symbol}</span>
                          </div>
                        </td>
                        <td className="py-2 text-slate-700 dark:text-slate-200">{formatPaymentType(p.type)}</td>
                      </tr>
                    )
                  })}
                  {recentPaymentVouchers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-400">
                        {t.noData}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'low_stock' && (
        <div className={`${cardCls} p-4 sm:p-5`}>
          <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <AlertTriangle size={22} className="text-amber-600 shrink-0" />
                {lang === 'ar' ? 'أصناف قاربت على الانتهاء' : 'Low Stock Items'}
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                {lang === 'ar'
                  ? 'الأصناف التي وصلت أو قاربت حد إعادة الطلب (الحد الأدنى).'
                  : 'Items that reached or are near the reorder point (minimum quantity).'}
              </p>
            </div>
            <Link to="/inventory/low-stock" className="text-sm font-semibold text-primary-600 hover:text-primary-700 whitespace-nowrap">
              {lang === 'ar' ? 'فتح تقرير النواقص' : 'Open low stock report'}
            </Link>
          </div>

          {lowStockItems.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">{t.noData}</div>
          ) : (
            <div className="overflow-x-auto -mx-1 px-1">
              {/* Mobile view (no horizontal scroll) */}
              <div className="sm:hidden space-y-2">
                {lowStockItems.map((row) => {
                  const stock = Number((row as any).current_stock ?? 0) || 0
                  const minQ = Number((row as any).min_quantity ?? 0) || 0
                  let rawName = String((row as any).name ?? '')
                  let rawCode = String((row as any).code ?? '').trim()
                  const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

                  // بعض مصادر البيانات قد ترسل الاسم داخل حقل code وتترك name فارغاً.
                  if (rawName.trim() === '' && rawCode !== '' && /\s/.test(rawCode)) {
                    rawName = rawCode
                    rawCode = ''
                  }

                  const pickEmbeddedCode = (name: string): { code: string; name: string } => {
                    const n = name.trim()
                    if (!n) return { code: '', name: '' }
                    const tokens = n.split(/\s+/).filter(Boolean)
                    const codeLike = (tok: string) =>
                      /^[A-Z]{2,}\d+[A-Z0-9]*$/.test(tok) || /^\d+(?:-\d+)+$/.test(tok) || /^[A-Z0-9]{3,}$/.test(tok)
                    const endTok = tokens[tokens.length - 1] || ''
                    if (codeLike(endTok)) return { code: endTok, name: tokens.slice(0, -1).join(' ').trim() }
                    const startTok = tokens[0] || ''
                    if (codeLike(startTok)) return { code: startTok, name: tokens.slice(1).join(' ').trim() }
                    return { code: '', name: n }
                  }

                  const embedded = rawCode ? { code: rawCode, name: rawName.trim() } : pickEmbeddedCode(rawName)
                  const code = embedded.code
                  const nameClean = (() => {
                    const base = embedded.name.trim()
                    if (!code) return base
                    const c = escapeRegExp(code)
                    return base
                      .replace(new RegExp(`^\\s*${c}\\s*[-–—:]*\\s*`, 'i'), '')
                      .replace(new RegExp(`\\s*[-–—:]*\\s*${c}\\s*$`, 'i'), '')
                      .trim()
                  })()

                  const diff = stock - minQ
                  const diffCls = diff <= 0 ? 'text-red-600' : 'text-slate-700 dark:text-slate-200'

                  return (
                    <div key={row.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono" dir="ltr">
                            {lang === 'ar' ? 'كود الصنف' : 'Item code'}: {code || '—'}
                          </div>
                          <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100" title={rawName}>
                            {lang === 'ar' ? 'اسم الصنف' : 'Item name'}: {nameClean || '—'}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                        <div className="rounded-lg bg-slate-50 dark:bg-slate-700/40 p-2">
                          <div className="text-slate-500 dark:text-slate-400">{lang === 'ar' ? 'المتاح' : 'In stock'}</div>
                          <div className="mt-0.5 font-semibold tabular-nums" dir="ltr">
                            {stock.toFixed(3)}
                          </div>
                        </div>
                        <div className="rounded-lg bg-slate-50 dark:bg-slate-700/40 p-2">
                          <div className="text-slate-500 dark:text-slate-400">{lang === 'ar' ? 'الحد الأدنى' : 'Min'}</div>
                          <div className="mt-0.5 font-semibold tabular-nums" dir="ltr">
                            {minQ.toFixed(3)}
                          </div>
                        </div>
                        <div className="rounded-lg bg-slate-50 dark:bg-slate-700/40 p-2">
                          <div className="text-slate-500 dark:text-slate-400">{lang === 'ar' ? 'الفرق' : 'Diff'}</div>
                          <div className={`mt-0.5 font-semibold tabular-nums ${diffCls}`} dir="ltr">
                            {diff.toFixed(3)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Desktop / tablet view */}
              <table dir="ltr" className="hidden sm:table w-full min-w-[760px] table-fixed text-sm border-collapse">
                <colgroup>
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '44%' }} />
                  <col style={{ width: '16%' }} />
                </colgroup>
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400">
                    <th className="py-2 pe-3 font-medium whitespace-nowrap text-center">{lang === 'ar' ? 'الفرق' : 'Difference'}</th>
                    <th className="py-2 pe-3 font-medium whitespace-nowrap text-center">{lang === 'ar' ? 'الحد الأدنى' : 'Min limit'}</th>
                    <th className="py-2 pe-3 font-medium whitespace-nowrap text-center">{lang === 'ar' ? 'المتاح' : 'Available'}</th>
                    <th className="py-2 pe-3 font-medium text-right">{lang === 'ar' ? 'اسم الصنف' : 'Item name'}</th>
                    <th className="py-2 pe-3 font-medium text-right">{lang === 'ar' ? 'كود الصنف' : 'Item code'}</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStockItems.map((row) => {
                    const stock = Number((row as any).current_stock ?? 0) || 0
                    const minQ = Number((row as any).min_quantity ?? 0) || 0
                    let rawName = String((row as any).name ?? '')
                    let rawCode = String((row as any).code ?? '').trim()
                    const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

                    // بعض مصادر البيانات قد ترسل الاسم داخل حقل code وتترك name فارغاً.
                    if (rawName.trim() === '' && rawCode !== '' && /\s/.test(rawCode)) {
                      rawName = rawCode
                      rawCode = ''
                    }

                    // استخراج الكود إن كان ضمن الاسم (مثل SAM001 آخر الاسم) مع إبقاء الاسم نظيفاً.
                    const pickEmbeddedCode = (name: string): { code: string; name: string } => {
                      const n = name.trim()
                      if (!n) return { code: '', name: '' }

                      const tokens = n.split(/\s+/).filter(Boolean)
                      const codeLike = (tok: string) =>
                        /^[A-Z]{2,}\d+[A-Z0-9]*$/.test(tok) || /^\d+(?:-\d+)+$/.test(tok) || /^[A-Z0-9]{3,}$/.test(tok)

                      const endTok = tokens[tokens.length - 1] || ''
                      if (codeLike(endTok)) {
                        return { code: endTok, name: tokens.slice(0, -1).join(' ').trim() }
                      }

                      const startTok = tokens[0] || ''
                      if (codeLike(startTok)) {
                        return { code: startTok, name: tokens.slice(1).join(' ').trim() }
                      }

                      return { code: '', name: n }
                    }

                    const embedded = rawCode ? { code: rawCode, name: rawName.trim() } : pickEmbeddedCode(rawName)
                    const code = embedded.code
                    const nameClean = (() => {
                      const base = embedded.name.trim()
                      if (!code) return base
                      const c = escapeRegExp(code)
                      // Remove code from start OR end (handles "CODE - Name" and "Name CODE")
                      return base
                        .replace(new RegExp(`^\\s*${c}\\s*[-–—:]*\\s*`, 'i'), '')
                        .replace(new RegExp(`\\s*[-–—:]*\\s*${c}\\s*$`, 'i'), '')
                        .trim()
                    })()

                    // الفرق = المتاح - الحد الأدنى (قيم سالبة تعني نقص → تُعرض بالأحمر)
                    const diff = stock - minQ
                    return (
                      <tr key={row.id} className="border-b border-slate-100 dark:border-slate-700/80 last:border-0">
                        <td
                          className={`py-2 pe-3 text-center tabular-nums whitespace-nowrap ${
                            diff <= 0 ? 'text-red-600' : 'text-slate-700 dark:text-slate-200'
                          }`}
                          dir="ltr"
                        >
                          {diff.toFixed(3)}
                        </td>
                        <td className="py-2 pe-3 text-center tabular-nums whitespace-nowrap" dir="ltr">
                          {minQ.toFixed(3)}
                        </td>
                        <td className="py-2 pe-3 text-center tabular-nums whitespace-nowrap" dir="ltr">
                          {stock.toFixed(3)}
                        </td>
                        <td className="py-2 pe-3 whitespace-normal break-words text-right">
                          <span className="font-medium text-slate-800 dark:text-slate-200" title={rawName}>
                            {nameClean || '—'}
                          </span>
                        </td>
                        <td className="py-2 pe-3 font-mono text-xs whitespace-nowrap text-right" dir="ltr">
                          {code || '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
