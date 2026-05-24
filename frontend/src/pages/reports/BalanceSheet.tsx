import { useState, useMemo, Fragment, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LabelList,
} from 'recharts'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchBalanceSheet, fetchBranches, fetchSettings } from '../../api/tenant'
import type { TenantSettings } from '../../types'
import { formatAmount } from '../../utils/currency'
import { formatDisplayDate } from '../../utils/date'
import {
  CheckCircle,
  AlertTriangle,
  FileText,
  FileSpreadsheet,
  Printer,
  ChevronRight,
  ChevronDown,
  TrendingUp,
  ArrowDownCircle,
  Shield,
  DollarSign,
} from 'lucide-react'

const PIE_COLORS = { assets: '#3B82F6', liabilities: '#EF4444', equity: '#10B981' }

type RatioStatus = 'good' | 'warn' | 'bad'

function ratioStatus(value: number, good: number, warn: number, higherIsBetter: boolean): RatioStatus {
  if (higherIsBetter) {
    if (value >= good) return 'good'
    if (value >= warn) return 'warn'
    return 'bad'
  }
  if (value <= good) return 'good'
  if (value <= warn) return 'warn'
  return 'bad'
}

function FinancialRatioBadge({
  labelAr,
  labelEn,
  value,
  thresholds,
  higherIsBetter,
  tooltipAr,
  tooltipEn,
  isRtl,
}: {
  labelAr: string
  labelEn: string
  value: number
  thresholds: { good: number; warn: number }
  higherIsBetter: boolean
  tooltipAr: string
  tooltipEn: string
  isRtl: boolean
}) {
  const st = ratioStatus(value, thresholds.good, thresholds.warn, higherIsBetter)
  const styles = {
    good: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    warn: 'bg-amber-50 text-amber-800 border-amber-200',
    bad: 'bg-red-50 text-red-800 border-red-200',
  }
  const icon = st === 'good' ? '✓' : st === 'warn' ? '⚠' : '✗'
  return (
    <span
      title={isRtl ? tooltipAr : tooltipEn}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium ${styles[st]}`}
    >
      <span>{isRtl ? labelAr : labelEn}</span>
      <span dir="ltr" className="tabular-nums font-semibold">
        {value.toFixed(2)}
      </span>
      <span aria-hidden>{icon}</span>
    </span>
  )
}

function WeightBar({ value, total, color }: { value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.min((Math.abs(value) / total) * 100, 100) : 0
  return (
    <div className="mt-1.5 flex items-center gap-2 min-w-0 max-w-[220px]">
      <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden min-w-[48px]">
        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span dir="ltr" className="text-[10px] tabular-nums text-slate-500 shrink-0 w-10 text-end">
        {pct.toFixed(1)}%
      </span>
    </div>
  )
}

function DeltaCells({
  current,
  prior,
  fmt,
}: {
  current: number
  prior: number | null | undefined
  fmt: (n: number) => string
}) {
  if (prior == null || !Number.isFinite(prior)) {
    return (
      <>
        <td className="py-1.5 text-right tabular-nums w-28 text-slate-400">—</td>
        <td className="py-1.5 text-right tabular-nums w-24 text-slate-400">—</td>
      </>
    )
  }
  const d = current - prior
  const pct = calcChangePercent(current, prior)
  const tone = d >= 0 ? 'text-emerald-600' : 'text-red-600'
  const sign = d >= 0 ? '+' : '−'
  return (
    <>
      <td className={`py-1.5 text-right tabular-nums w-28 font-medium ${tone}`}>
        <span dir="ltr">
          {sign}
          {fmt(Math.abs(d))}
        </span>
      </td>
      <td className={`py-1.5 text-right tabular-nums w-24 font-medium ${tone}`}>
        <span dir="ltr">{pct != null ? `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%` : '—'}</span>
      </td>
    </>
  )
}

interface BalanceSheetTreeNode {
  account_id: number
  code: string
  name: string
  amount: number
  children: BalanceSheetTreeNode[]
}

interface BalanceSheetData {
  as_of_date: string
  assets: { current: unknown[]; non_current: unknown[]; total: number }
  liabilities: { current: unknown[]; non_current: unknown[]; total: number }
  equity: { items: { account_id: number | null; code: string; name: string; amount: number }[]; total: number }
  total_assets: number
  total_liabilities_equity: number
  is_balanced: boolean
  balance_difference?: number
  net_income?: number
  ratios?: {
    current_ratio?: number
    debt_to_equity?: number
    equity_ratio?: number
  }
  tree?: {
    asset?: BalanceSheetTreeNode[]
    liability?: BalanceSheetTreeNode[]
    equity?: BalanceSheetTreeNode[]
  }
  comparative?: BalanceSheetData
}

/** تاريخ المقارنة: نفس اليوم والشهر من السنة السابقة مع معالجة أيام غير موجودة (مثل 29/2). */
function subtractOneYearYmd(ymd: string): string {
  const parts = ymd.split('-').map(Number)
  const y = parts[0]
  const m = parts[1]
  const d = parts[2]
  if (!y || !m || !d) return ''
  const t = new Date(Date.UTC(y - 1, m - 1, d))
  if (t.getUTCMonth() !== m - 1) {
    const clamp = new Date(Date.UTC(y - 1, m, 0))
    return `${clamp.getUTCFullYear()}-${String(clamp.getUTCMonth() + 1).padStart(2, '0')}-${String(clamp.getUTCDate()).padStart(2, '0')}`
  }
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`
}

type PriorLookup = { byId: Map<number, number>; byCode: Map<string, number> }

/** أرصدة السنة المقارنة: بالمعرّف الرقمي وبكود الحساب (لتفادي عدم تطابق نوع المفتاح JSON id كسلسلة). */
function buildPriorLookup(comparative: BalanceSheetData | undefined): PriorLookup {
  const byId = new Map<number, number>()
  const byCode = new Map<string, number>()
  if (!comparative?.tree) return { byId, byCode }

  const tree = comparative.tree as Record<string, BalanceSheetTreeNode[] | undefined>
  const sections: (keyof NonNullable<BalanceSheetData['tree']>)[] = ['asset', 'liability', 'equity']

  function walk(list: BalanceSheetTreeNode[] | undefined) {
    if (!list?.length) return
    for (const raw of list) {
      const n = raw as BalanceSheetTreeNode
      const id = Number(n.account_id)
      const amt = Number(n.amount)
      if (Number.isFinite(id) && id > 0) {
        byId.set(id, Number.isFinite(amt) ? amt : 0)
      }
      const code = String(n.code ?? '').trim()
      if (code) {
        byCode.set(code, Number.isFinite(amt) ? amt : 0)
      }
      if (n.children?.length) walk(n.children)
    }
  }

  for (const key of sections) {
    walk(tree[key as string] as BalanceSheetTreeNode[] | undefined)
  }
  return { byId, byCode }
}

function getPriorForNode(node: BalanceSheetTreeNode, lookup: PriorLookup): number | undefined {
  const id = Number(node.account_id)
  if (Number.isFinite(id) && id > 0 && lookup.byId.has(id)) {
    return lookup.byId.get(id)
  }
  const code = String(node.code ?? '').trim()
  if (code && lookup.byCode.has(code)) {
    return lookup.byCode.get(code)
  }
  return undefined
}

function calcChangePercent(current: number, previous: number | null | undefined): number | null {
  if (previous == null || !Number.isFinite(previous)) return null
  if (Math.abs(previous) < 1e-12) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

function TreeRows({
  nodes,
  level,
  expanded,
  onToggle,
  priorLookup,
  fmt,
  onDrillDown,
  showCompare,
  numAlign,
  thAlign,
  isRtl,
  totalLabel,
  weightTotal,
  weightColor,
}: {
  nodes: BalanceSheetTreeNode[]
  level: number
  expanded: Set<number>
  onToggle: (id: number) => void
  priorLookup: PriorLookup
  fmt: (n: number) => string
  onDrillDown: (id: number) => void
  showCompare: boolean
  numAlign: string
  thAlign: string
  isRtl: boolean
  totalLabel: string
  weightTotal: number
  weightColor: string
}) {
  const indentPx = level * 20
  const indentStyle = isRtl ? { paddingRight: indentPx } : { paddingLeft: indentPx }

  return (
    <>
      {nodes.map((node) => {
        const hasChildren = node.children && node.children.length > 0
        const isExpanded = expanded.has(node.account_id)
        const priorAmount = getPriorForNode(node, priorLookup)

        return (
          <Fragment key={node.account_id}>
            <tr className="border-b border-slate-100 hover:bg-slate-50/50">
              <td className={`py-1.5 pr-2 ${thAlign} align-middle`} style={indentStyle}>
                {hasChildren ? (
                  <button
                    type="button"
                    onClick={() => onToggle(node.account_id)}
                    className="flex items-center gap-1 text-slate-800 font-semibold hover:text-primary-600 expand-btn text-start w-full min-w-0"
                  >
                    {isExpanded ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
                    <span className="min-w-0">
                      {node.code} — {node.name}
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onDrillDown(node.account_id)}
                    className="flex items-center gap-1 text-primary-600 hover:underline font-medium text-start w-full min-w-0"
                  >
                    <span className="inline-block w-4 shrink-0" />
                    <span className="min-w-0">
                      {node.code} — {node.name}
                    </span>
                    <ChevronRight className="w-4 h-4 opacity-70 shrink-0" />
                  </button>
                )}
                <div className="no-print">
                  <WeightBar value={node.amount} total={weightTotal} color={weightColor} />
                </div>
              </td>
              <td className={`py-1.5 ${numAlign} tabular-nums w-32 font-medium`}>
                <span dir="ltr">{fmt(node.amount)}</span>
              </td>
              {showCompare && (
                <>
                  <td className={`py-1.5 ${numAlign} tabular-nums w-32 text-slate-500`}>
                    <span dir="ltr">{priorAmount != null ? fmt(priorAmount) : '—'}</span>
                  </td>
                  <DeltaCells current={node.amount} prior={priorAmount} fmt={fmt} />
                </>
              )}
            </tr>
            {hasChildren && isExpanded && (
              <TreeRows
                nodes={node.children}
                level={level + 1}
                expanded={expanded}
                onToggle={onToggle}
                priorLookup={priorLookup}
                fmt={fmt}
                onDrillDown={onDrillDown}
                showCompare={showCompare}
                numAlign={numAlign}
                thAlign={thAlign}
                isRtl={isRtl}
                totalLabel={totalLabel}
                weightTotal={weightTotal}
                weightColor={weightColor}
              />
            )}
            {hasChildren && isExpanded && (
              <tr className="border-b border-slate-200 bg-slate-50/50 subtotal-row">
                <td
                  className={`py-1 ${thAlign} text-sm font-medium text-slate-700`}
                  style={{ ...indentStyle, [isRtl ? 'paddingRight' : 'paddingLeft']: (level + 1) * 20 }}
                >
                  {node.code} — {node.name} ({totalLabel})
                </td>
                <td className={`py-1 ${numAlign} tabular-nums w-32 font-semibold`}>
                  <span dir="ltr">{fmt(node.amount)}</span>
                </td>
                {showCompare && (
                  <>
                    <td className={`py-1 ${numAlign} tabular-nums w-32 text-slate-500 font-medium`}>
                      <span dir="ltr">{priorAmount != null ? fmt(priorAmount) : '—'}</span>
                    </td>
                    <DeltaCells current={node.amount} prior={priorAmount} fmt={fmt} />
                  </>
                )}
              </tr>
            )}
          </Fragment>
        )
      })}
    </>
  )
}

function TreeSection({
  title,
  nodes,
  sectionTotal,
  priorSectionTotal,
  expanded,
  onToggle,
  priorLookup,
  fmt,
  onDrillDown,
  showCompare,
  numAlign,
  thAlign,
  isRtl,
  totalLabel,
  extraRows,
  weightTotal,
  weightColor,
}: {
  title: string
  nodes: BalanceSheetTreeNode[]
  sectionTotal: number
  priorSectionTotal?: number
  expanded: Set<number>
  onToggle: (id: number) => void
  priorLookup: PriorLookup
  fmt: (n: number) => string
  onDrillDown: (id: number) => void
  showCompare: boolean
  numAlign: string
  thAlign: string
  isRtl: boolean
  totalLabel: string
  extraRows?: ReactNode
  weightTotal: number
  weightColor: string
}) {
  const headColSpan = showCompare ? 5 : 2
  return (
    <>
      <tr className="bg-slate-100">
        <td colSpan={headColSpan} className={`py-2 px-2 font-bold text-slate-800 ${thAlign}`}>
          {title}
        </td>
      </tr>
      <TreeRows
        nodes={nodes}
        level={0}
        expanded={expanded}
        onToggle={onToggle}
        priorLookup={priorLookup}
        fmt={fmt}
        onDrillDown={onDrillDown}
        showCompare={showCompare}
        numAlign={numAlign}
        thAlign={thAlign}
        isRtl={isRtl}
        totalLabel={totalLabel}
        weightTotal={weightTotal}
        weightColor={weightColor}
      />
      {extraRows}
      <tr className="border-b-2 border-slate-800 font-bold text-slate-900 total-row">
        <td className={`py-2 px-2 ${thAlign}`}>{totalLabel}</td>
        <td className={`py-2 ${numAlign} tabular-nums w-32`}>
          <span dir="ltr">{fmt(sectionTotal)}</span>
        </td>
        {showCompare && (
          <>
            <td className={`py-2 ${numAlign} tabular-nums w-32 text-slate-600`}>
              <span dir="ltr">{priorSectionTotal != null ? fmt(priorSectionTotal) : '—'}</span>
            </td>
            <DeltaCells current={sectionTotal} prior={priorSectionTotal} fmt={fmt} />
          </>
        )}
      </tr>
    </>
  )
}

export default function BalanceSheet() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const navigate = useNavigate()
  const tenantId = currentTenant?.id ?? 0

  const today = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])

  const startOfYear = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-01-01`
  }, [])

  const [dateFrom, setDateFrom] = useState(startOfYear)
  const [dateTo, setDateTo] = useState(today)
  const asOfDate = dateTo
  const [branchId, setBranchId] = useState<string>('')
  const [compareWithPriorYear, setCompareWithPriorYear] = useState(false)

  const compareToDate = useMemo(() => {
    if (!compareWithPriorYear || !asOfDate) return ''
    return subtractOneYearYmd(asOfDate)
  }, [compareWithPriorYear, asOfDate])

  const { data: settings } = useQuery<TenantSettings>({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const { data: branchesData } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId,
  })
  const branches = branchesData ?? []

  const { data, isLoading } = useQuery<BalanceSheetData>({
    queryKey: ['balanceSheet', tenantId, dateTo, branchId, compareToDate],
    queryFn: () =>
      fetchBalanceSheet(tenantId, {
        as_of_date: asOfDate,
        ...(branchId ? { branch_id: branchId } : {}),
        ...(compareToDate ? { compare_to_date: compareToDate } : {}),
      }),
    enabled: !!tenantId && !!asOfDate,
  })

  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const fmt = (n: number) => formatAmount(n, { decimal_places: settings?.doc_amount_decimals ?? 2 }, locale)
  const numAlign = 'text-right'
  const thAlign = isRtl ? 'text-right' : 'text-left'

  const comparative = data?.comparative
  const showCompare = compareWithPriorYear && !!comparative

  const [expanded, setExpanded] = useState<Set<number>>(() => new Set())

  const priorLookup = useMemo(() => buildPriorLookup(comparative), [comparative])

  const fiscalStart = dateFrom

  const drillDown = (accountId: number) => {
    navigate(`/accounts/statement?accountId=${accountId}&from_date=${fiscalStart}&to_date=${asOfDate}`)
  }

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handlePrint = () => {
    window.print()
  }

  const exportCsv = () => {
    if (!data) return
    const rows: string[][] = []
    const addSection = (title: string, items: { code: string; name: string; amount: number }[], total: number) => {
      rows.push([title, '', ''])
      items.forEach((l) => rows.push([l.code, l.name, String(l.amount)]))
      rows.push([t.total, '', String(total)])
      rows.push([])
    }
    const flatAssets = (data.tree?.asset ? flattenTreeNodes(data.tree.asset) : []) as { code: string; name: string; amount: number }[]
    const flatLiab = (data.tree?.liability ? flattenTreeNodes(data.tree.liability) : []) as { code: string; name: string; amount: number }[]
    const flatEquity = (data.tree?.equity ? flattenTreeNodes(data.tree.equity) : []).concat(
      data.equity.items.filter((i) => i.account_id == null) as { code: string; name: string; amount: number }[]
    )
    addSection(t.reports.assets, flatAssets, data.total_assets)
    addSection(t.reports.liabilities, flatLiab, data.liabilities.total + data.equity.total)
    addSection(t.reports.equity, flatEquity, data.equity.total)
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `balance-sheet-${asOfDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function flattenTreeNodes(nodes: BalanceSheetTreeNode[]): { code: string; name: string; amount: number }[] {
    const out: { code: string; name: string; amount: number }[] = []
    for (const n of nodes) {
      out.push({ code: n.code, name: n.name, amount: n.amount })
      if (n.children?.length) out.push(...flattenTreeNodes(n.children))
    }
    return out
  }

  const treeAssets = data?.tree?.asset ?? []
  const treeLiabilities = data?.tree?.liability ?? []
  const treeEquity = data?.tree?.equity ?? []

  const pieChartData = useMemo(() => {
    if (!data) return []
    const rows = [
      { name: isRtl ? 'الأصول' : 'Assets', value: data.total_assets, fill: PIE_COLORS.assets },
      { name: isRtl ? 'الالتزامات' : 'Liabilities', value: data.liabilities.total, fill: PIE_COLORS.liabilities },
      { name: isRtl ? 'حقوق الملكية' : 'Equity', value: data.equity.total, fill: PIE_COLORS.equity },
    ]
    return rows.filter((r) => Math.abs(r.value) > 1e-9)
  }, [data, isRtl])

  const barChartData = useMemo(() => {
    if (!data) return []
    return [
      { name: isRtl ? 'الأصول' : 'Assets', value: data.total_assets, fill: PIE_COLORS.assets },
      { name: isRtl ? 'الالتزامات' : 'Liabilities', value: data.liabilities.total, fill: PIE_COLORS.liabilities },
      { name: isRtl ? 'حقوق الملكية' : 'Equity', value: data.equity.total, fill: PIE_COLORS.equity },
    ]
  }, [data, isRtl])

  const rowClass = 'h-10 rounded-lg border border-slate-300 px-3 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none min-w-0'

  const deltaHeader = isRtl ? 'التغيير' : 'Δ'
  const pctHeader = '%'

  function KpiCard({
    label,
    value,
    icon: Icon,
    accentClass,
  }: {
    label: string
    value: number
    icon: typeof TrendingUp
    accentClass: string
  }) {
    return (
      <div
        className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm border-t-4 ${accentClass} min-w-0`}
      >
        <p className="text-xs font-medium text-slate-500 mb-2">{label}</p>
        <div className="flex items-start justify-between gap-2">
          <p className="text-lg font-semibold text-slate-900 tabular-nums">
            <span dir="ltr">{fmt(value)}</span>
          </p>
          <Icon className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" strokeWidth={2} />
        </div>
      </div>
    )
  }
  return (
    <div className="p-6 space-y-6 w-full max-w-full">
      <div
        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-slate-200 pb-3"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        <h1 className="text-lg font-semibold text-slate-900 shrink-0">{t.reports.balanceSheet}</h1>

        <div className="flex flex-1 min-w-0 flex-wrap items-center justify-center gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <label className="text-sm font-medium text-slate-700 whitespace-nowrap">{t.from}</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className={rowClass}
              style={{ width: '140px' }}
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <label className="text-sm font-medium text-slate-700 whitespace-nowrap">{t.to}</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className={rowClass}
              style={{ width: '140px' }}
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <label className="text-sm font-medium text-slate-700 whitespace-nowrap">{t.reports.filterByBranch}</label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className={rowClass}
              style={{ width: '160px' }}
            >
              <option value="">{t.reports.allBranches}</option>
              {branches.map((b: { id: number; name: string }) => (
                <option key={b.id} value={String(b.id)}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer shrink-0 h-10">
            <input
              type="checkbox"
              checked={compareWithPriorYear}
              onChange={(e) => setCompareWithPriorYear(e.target.checked)}
              className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-slate-700 whitespace-nowrap">{t.reports.compareWithPriorYear}</span>
          </label>
          {!isLoading && data && data.is_balanced && (
            <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 rounded-lg px-3 h-10 text-sm font-medium shrink-0">
              <CheckCircle size={16} />
              {t.journal.balanced}
            </div>
          )}
          {!isLoading && data && !data.is_balanced && (
            <div className="flex items-center gap-2 text-amber-600 bg-amber-50 rounded-lg px-3 h-10 text-sm font-medium shrink-0">
              <AlertTriangle size={16} />
              {t.reports.balanceSheetUnbalanced}
              {data?.balance_difference != null && ` (${fmt(data.balance_difference)})`}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0 no-print">
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-[#F0F2F5] border border-[#D9DCE0] text-[#344054] hover:bg-[#E4E7EB]"
            title={t.accounts.print}
          >
            <Printer size={16} />
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-[#344054] text-white hover:bg-[#2d3846]"
            title={t.accounts.exportPdf}
          >
            <FileText size={16} />
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-500"
            title={t.accounts.exportExcel}
          >
            <FileSpreadsheet size={16} />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto w-full balance-sheet-report" id="balance-sheet-print">
        {isLoading ? (
          <div className="p-4 md:p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 no-print" dir={isRtl ? 'rtl' : 'ltr'}>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100 border border-slate-100" />
              ))}
            </div>
            <div className="hidden md:grid grid-cols-2 gap-4 no-print" dir={isRtl ? 'rtl' : 'ltr'}>
              <div className="h-[220px] animate-pulse rounded-xl bg-slate-100 border border-slate-100" />
              <div className="h-[220px] animate-pulse rounded-xl bg-slate-100 border border-slate-100" />
            </div>
            <div className="flex justify-center items-center h-32 py-6">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
            </div>
          </div>
        ) : data ? (
          <div dir={isRtl ? 'rtl' : 'ltr'} className="balance-sheet-content">
            <div className="p-4 md:p-6 space-y-4 border-b border-slate-100 no-print">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <KpiCard
                  label={isRtl ? 'إجمالي الأصول' : 'Total assets'}
                  value={data.total_assets}
                  icon={TrendingUp}
                  accentClass="border-t-blue-500"
                />
                <KpiCard
                  label={isRtl ? 'إجمالي الالتزامات' : 'Total liabilities'}
                  value={data.liabilities.total}
                  icon={ArrowDownCircle}
                  accentClass="border-t-red-500"
                />
                <KpiCard
                  label={isRtl ? 'حقوق الملكية' : 'Equity'}
                  value={data.equity.total}
                  icon={Shield}
                  accentClass="border-t-emerald-500"
                />
                <KpiCard
                  label={isRtl ? 'صافي الربح (من قائمة الدخل)' : 'Net income (P&L)'}
                  value={data.net_income ?? 0}
                  icon={DollarSign}
                  accentClass="border-t-amber-500"
                />
              </div>

              <div className="hidden md:grid grid-cols-1 lg:grid-cols-2 gap-4" dir={isRtl ? 'rtl' : 'ltr'}>
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-medium text-slate-500 mb-2 text-center">
                    {isRtl ? 'توزيع الأصول والالتزامات' : 'Assets & liabilities mix'}
                  </p>
                  <div className="relative h-[220px] w-full">
                    {pieChartData.length > 0 ? (
                      <>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                            <Pie
                              data={pieChartData}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              innerRadius={58}
                              outerRadius={78}
                              paddingAngle={2}
                            >
                              {pieChartData.map((entry, i) => (
                                <Cell key={i} fill={entry.fill} />
                              ))}
                            </Pie>
                            <Tooltip
                              formatter={(v: number | undefined) =>
                                (v ?? 0).toLocaleString(locale, { maximumFractionDigits: 3 })
                              }
                            />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                          <span className="text-xs font-semibold text-slate-600">{isRtl ? 'الميزانية' : 'Balance'}</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-slate-400">
                        {isRtl ? 'لا توجد بيانات كافية' : 'No data'}
                      </div>
                    )}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-medium text-slate-500 mb-2 text-center">
                    {isRtl ? 'مقارنة المجاميع' : 'Totals comparison'}
                  </p>
                  <div className="h-[220px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={barChartData} margin={{ top: 24, right: 8, left: 8, bottom: 8 }}>
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} />
                        <YAxis
                          tick={{ fontSize: 10, fill: '#64748b' }}
                          tickFormatter={(v) => Number(v).toLocaleString(locale, { notation: 'compact' })}
                        />
                        <Tooltip
                          formatter={(v: number | undefined) =>
                            (v ?? 0).toLocaleString(locale, { maximumFractionDigits: 3 })
                          }
                        />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                          {barChartData.map((e, i) => (
                            <Cell key={i} fill={e.fill} />
                          ))}
                          <LabelList
                            dataKey="value"
                            position="top"
                            formatter={(v: unknown) =>
                              Number(v ?? 0).toLocaleString(locale, { maximumFractionDigits: 0 })
                            }
                            className="fill-slate-600 text-[10px]"
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>

            <header className="p-6 pb-4 border-b border-slate-200 report-header">
              <h3 className="text-xl font-bold text-slate-800 text-center report-title">
                {t.reports.balanceSheet}
              </h3>
              <p className="text-sm text-slate-600 text-center mt-2">
                {t.from} {formatDisplayDate(dateFrom)} {t.to} {formatDisplayDate(data.as_of_date)}
              </p>
              {branchId && (
                <p className="text-sm text-slate-500 text-center mt-1">
                  {t.reports.filterByBranch}: {branches.find((b: { id: number }) => String(b.id) === branchId)?.name ?? branchId}
                </p>
              )}
            </header>

            <div className="p-6">
              <table className="w-full text-sm balance-sheet-table">
                <thead>
                  <tr className="border-b-2 border-slate-300 text-slate-700">
                    <th className={`py-2 px-2 font-semibold ${thAlign} min-w-[240px]`} />
                    <th className={`py-2 ${numAlign} w-32 font-semibold`}>{t.reports.currentYear}</th>
                    {showCompare && (
                      <>
                        <th className={`py-2 ${numAlign} w-32 font-semibold text-slate-600`}>{t.reports.priorYear}</th>
                        <th className={`py-2 ${numAlign} w-28 font-semibold text-slate-600`}>{deltaHeader}</th>
                        <th className={`py-2 ${numAlign} w-24 font-semibold text-slate-600`}>{pctHeader}</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  <TreeSection
                    title={t.reports.assets}
                    nodes={treeAssets}
                    sectionTotal={data.total_assets}
                    priorSectionTotal={comparative?.total_assets}
                    expanded={expanded}
                    onToggle={toggleExpand}
                    priorLookup={priorLookup}
                    fmt={fmt}
                    onDrillDown={drillDown}
                    showCompare={showCompare}
                    numAlign={numAlign}
                    thAlign={thAlign}
                    isRtl={isRtl}
                    totalLabel={t.reports.totalAssets}
                    weightTotal={data.total_assets}
                    weightColor={PIE_COLORS.assets}
                  />
                  <TreeSection
                    title={t.reports.liabilities}
                    nodes={treeLiabilities}
                    sectionTotal={data.liabilities.total}
                    priorSectionTotal={comparative?.liabilities?.total}
                    expanded={expanded}
                    onToggle={toggleExpand}
                    priorLookup={priorLookup}
                    fmt={fmt}
                    onDrillDown={drillDown}
                    showCompare={showCompare}
                    numAlign={numAlign}
                    thAlign={thAlign}
                    isRtl={isRtl}
                    totalLabel={t.reports.liabilities + ' — ' + t.total}
                    weightTotal={data.liabilities.total}
                    weightColor={PIE_COLORS.liabilities}
                  />
                  <TreeSection
                    title={t.reports.equity}
                    nodes={treeEquity}
                    sectionTotal={data.equity.total}
                    priorSectionTotal={comparative?.equity?.total}
                    expanded={expanded}
                    onToggle={toggleExpand}
                    priorLookup={priorLookup}
                    fmt={fmt}
                    onDrillDown={drillDown}
                    showCompare={showCompare}
                    numAlign={numAlign}
                    thAlign={thAlign}
                    isRtl={isRtl}
                    totalLabel={t.reports.equity + ' — ' + t.total}
                    weightTotal={data.equity.total}
                    weightColor={PIE_COLORS.equity}
                    extraRows={
                      data.net_income != null && data.net_income !== 0 ? (
                        <tr className="border-b border-slate-200 bg-slate-50/30">
                          <td className={`py-1.5 px-2 ${thAlign} text-slate-700`} style={isRtl ? { paddingRight: 20 } : { paddingLeft: 20 }}>
                            {t.reports.netIncomeOfPeriod}
                          </td>
                          <td className={`py-1.5 ${numAlign} tabular-nums w-32 font-medium`}>
                            <span dir="ltr">{fmt(data.net_income)}</span>
                          </td>
                          {showCompare && (
                            <>
                              <td className={`py-1.5 ${numAlign} tabular-nums w-32 text-slate-500`}>
                                <span dir="ltr">
                                  {comparative?.net_income != null ? fmt(comparative.net_income) : '—'}
                                </span>
                              </td>
                              <DeltaCells current={data.net_income} prior={comparative?.net_income} fmt={fmt} />
                            </>
                          )}
                        </tr>
                      ) : undefined
                    }
                  />
                  <tr className="border-b-2 border-slate-800 font-bold text-slate-900 bg-slate-100">
                    <td className={`py-2 px-2 ${thAlign}`}>{t.reports.totalLiabilitiesEquity}</td>
                    <td className={`py-2 ${numAlign} tabular-nums w-32`}>
                      <span dir="ltr">{fmt(data.total_liabilities_equity)}</span>
                    </td>
                    {showCompare && (
                      <>
                        <td className={`py-2 ${numAlign} tabular-nums w-32 text-slate-600`}>
                          <span dir="ltr">
                            {comparative?.total_liabilities_equity != null
                              ? fmt(comparative.total_liabilities_equity)
                              : '—'}
                          </span>
                        </td>
                        <DeltaCells
                          current={data.total_liabilities_equity}
                          prior={comparative?.total_liabilities_equity}
                          fmt={fmt}
                        />
                      </>
                    )}
                  </tr>
                </tbody>
              </table>
            </div>

            {data.ratios && Object.keys(data.ratios).length > 0 && (
              <div className="px-6 pb-6">
                <h4 className="text-lg font-bold text-slate-800 mb-3">{t.reports.financialRatios}</h4>
                <div className="flex flex-wrap gap-2">
                  {data.ratios.current_ratio != null && (
                    <FinancialRatioBadge
                      labelAr="نسبة التداول"
                      labelEn="Current ratio"
                      value={Number(data.ratios.current_ratio)}
                      thresholds={{ good: 2, warn: 1 }}
                      higherIsBetter
                      tooltipAr={t.reports.tradingRatio}
                      tooltipEn="Current assets divided by current liabilities. Higher usually means better short-term liquidity."
                      isRtl={isRtl}
                    />
                  )}
                  {data.ratios.debt_to_equity != null && (
                    <FinancialRatioBadge
                      labelAr="نسبة الدين إلى حقوق الملكية"
                      labelEn="Debt to equity"
                      value={Number(data.ratios.debt_to_equity)}
                      thresholds={{ good: 1, warn: 2 }}
                      higherIsBetter={false}
                      tooltipAr={t.reports.debtToEquity}
                      tooltipEn="Total liabilities divided by equity. Lower usually indicates less leverage risk."
                      isRtl={isRtl}
                    />
                  )}
                  {data.ratios.equity_ratio != null && (
                    <FinancialRatioBadge
                      labelAr="نسبة حقوق الملكية إلى الأصول"
                      labelEn="Equity to assets"
                      value={Number(data.ratios.equity_ratio)}
                      thresholds={{ good: 0.5, warn: 0.3 }}
                      higherIsBetter
                      tooltipAr={t.reports.equityRatio}
                      tooltipEn="Equity divided by total assets. Higher means more financing from owners vs creditors."
                      isRtl={isRtl}
                    />
                  )}
                </div>
              </div>
            )}

            <footer className="p-6 mt-6 border-t border-slate-200 report-footer">
              <div className="flex justify-center mt-8">
                <div className="text-center text-sm text-slate-600">
                  <p className="font-medium text-slate-700">{t.reports.preparedBy}</p>
                  <div className="h-10 w-48 border-b border-slate-300 mt-4 mx-auto" />
                </div>
              </div>
            </footer>
          </div>
        ) : null}
      </div>

      <style>{`
        .balance-sheet-table .subtotal-row { border-bottom: 1px solid #cbd5e1; }
        .balance-sheet-table .total-row { border-bottom: 2px solid #1e293b; }
        @media print {
          .balance-sheet-table .expand-btn, .no-print { display: none !important; }
          @page { size: A4; margin: 12mm 15mm; }
          body * { visibility: hidden; }
          #balance-sheet-print, #balance-sheet-print * { visibility: visible; }
          #balance-sheet-print {
            position: absolute; left: 0; top: 0;
            width: 100%; max-width: 210mm; min-height: 297mm;
            margin: 0; padding: 0; box-shadow: none; border: none; background: white;
          }
          .balance-sheet-content { padding: 0; }
          .report-header { break-after: avoid; }
        }
        @media screen {
          #balance-sheet-print { width: 100%; max-width: none; }
        }
      `}</style>
    </div>
  )
}
