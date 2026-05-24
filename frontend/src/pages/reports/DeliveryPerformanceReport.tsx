import { useCallback, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchBranches, fetchCurrencies, fetchDeliveryPerformanceReport, fetchDeliveryDrivers, fetchSettings } from '../../api/tenant'
import type { Branch, Currency, PaginatedResponse, DeliveryDriver, TenantSettings } from '../../types'
import { BarChart3 } from 'lucide-react'
import { ReportToolbarIconGroup } from '../../components/reports/ReportToolbarIconGroup'
import { getReportPeriodRange, type ReportPeriodKey } from '../../utils/date'
import { filterPageSizeSelectClass, filterSelectCompactClass } from '../../utils/filterControlStyles'
import { formatAmountWithSymbol } from '../../utils/currency'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from 'recharts'

type DriverPerformanceRow = {
  driver_id: number
  driver_name: string | null
  trip_count: number
  avg_delivery_minutes: number | null
  total_collected: number
}

export default function DeliveryPerformanceReport() {
  const { currentTenant } = useAuth()
  const { t, lang } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const initialAllRange = getReportPeriodRange('all')
  const [from, setFrom] = useState(initialAllRange.from_date)
  const [to, setTo] = useState(initialAllRange.to_date)
  const [periodPreset, setPeriodPreset] = useState<ReportPeriodKey | 'custom'>('all')
  const [driverId, setDriverId] = useState<string>('')
  const [branchId, setBranchId] = useState<string>('')
  const [pageSize, setPageSize] = useState<number>(25)

  const periodOptions: { value: ReportPeriodKey | 'custom'; labelAr: string; labelEn: string }[] = [
    { value: 'all', labelAr: 'الكل', labelEn: 'All' },
    { value: 'custom', labelAr: 'تاريخ مخصص', labelEn: 'Custom Date' },
    { value: 'today', labelAr: 'اليوم', labelEn: 'Today' },
    { value: 'yesterday', labelAr: 'الأمس', labelEn: 'Yesterday' },
    { value: 'this_week', labelAr: 'هذا الأسبوع', labelEn: 'This Week' },
    { value: 'last_week', labelAr: 'الأسبوع السابق', labelEn: 'Last Week' },
    { value: 'this_month', labelAr: 'هذا الشهر', labelEn: 'This Month' },
    { value: 'last_month', labelAr: 'الشهر السابق', labelEn: 'Last Month' },
    { value: 'this_year', labelAr: 'هذه السنة', labelEn: 'This Year' },
  ]

  function applyPeriodPreset(preset: ReportPeriodKey | 'custom') {
    setPeriodPreset(preset)
    if (preset !== 'custom') {
      const range = getReportPeriodRange(preset)
      setFrom(range.from_date)
      setTo(range.to_date)
    }
  }

  const driversRes = useQuery({
    queryKey: ['delivery-drivers', tenantId, 'report'],
    queryFn: () => fetchDeliveryDrivers(tenantId, { per_page: '200' }),
    enabled: !!tenantId,
  })
  const drivers = (driversRes.data as PaginatedResponse<DeliveryDriver> | undefined)?.data ?? []

  const branchesRes = useQuery({
    queryKey: ['branches', tenantId, 'delivery-performance'],
    queryFn: () => fetchBranches(tenantId, { status: 'active' }),
    enabled: !!tenantId,
  })
  const branches: Branch[] = branchesRes.data ?? []

  const { data: settings } = useQuery({
    queryKey: ['settings', tenantId, 'delivery-performance'],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const { data: currencies = [] } = useQuery<Currency[]>({
    queryKey: ['currencies', tenantId, 'delivery-performance'],
    queryFn: () => fetchCurrencies(tenantId),
    enabled: !!tenantId,
  })

  const reportRes = useQuery({
    queryKey: ['delivery-performance', tenantId, from, to, driverId, branchId],
    queryFn: () =>
      fetchDeliveryPerformanceReport(tenantId, {
        from_date: from,
        to_date: to,
        ...(driverId && driverId !== '__all__' ? { driver_id: driverId } : {}),
        ...(branchId && branchId !== '__all__' ? { branch_id: branchId } : {}),
      }),
    enabled: !!tenantId,
  })

  const rows: DriverPerformanceRow[] = (reportRes.data?.rows ?? []) as DriverPerformanceRow[]
  const visibleRows = rows.slice(0, Math.max(1, pageSize))
  const filtersJustifyClass = lang === 'ar' ? 'justify-start' : 'justify-end'

  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'

  const systemCurrency = useMemo(() => {
    const s = settings as TenantSettings | undefined
    const byCode = (code?: string | null) => (code ? currencies.find((c) => c.code === code) ?? null : null)

    const docCode = typeof s?.doc_default_currency_code === 'string' ? s.doc_default_currency_code : null
    const fromDoc = byCode(docCode)
    if (fromDoc) return fromDoc

    const defaultIdRaw = s?.default_currency_id
    const defaultId =
      typeof defaultIdRaw === 'number'
        ? defaultIdRaw
        : typeof defaultIdRaw === 'string' && defaultIdRaw.trim() !== ''
          ? Number(defaultIdRaw)
          : null
    if (defaultId != null && Number.isFinite(defaultId)) {
      const fromId = currencies.find((c) => c.id === defaultId) ?? null
      if (fromId) return fromId
    }

    return currencies.find((c) => c.is_default) ?? null
  }, [settings, currencies])

  const fmtMoney = (n: number) => {
    const base = formatAmountWithSymbol(n, systemCurrency, locale)
    const sym = typeof systemCurrency?.symbol === 'string' ? systemCurrency.symbol.trim() : ''
    const code = typeof systemCurrency?.code === 'string' ? systemCurrency.code.trim() : ''

    // إذا كان الرمز غامضًا (حرف واحد مثل «د») وأكواد ISO متاحة، نُظهر الكود أيضًا لتوضيح العملة الافتراضية.
    if (code && sym.length === 1 && sym !== code) {
      return `${base} ${code}`
    }

    if (!sym) {
      return code ? `${base} ${code}` : base
    }

    return base
  }

  const minutesAr = (n: number) => `${n.toFixed(1)} د`

  const kpis = useMemo(() => {
    const totalTrips = rows.reduce((sum, r) => sum + Number(r.trip_count ?? 0), 0)
    const deliveredSamples = rows
      .map((r) => r.avg_delivery_minutes)
      .filter((x): x is number => x != null && Number.isFinite(x))
    const avgMinutes = deliveredSamples.length
      ? deliveredSamples.reduce((a, b) => a + b, 0) / deliveredSamples.length
      : null
    const totalCollected = rows.reduce((sum, r) => sum + Number(r.total_collected ?? 0), 0)
    const topDriver = rows.length ? (rows[0].driver_name ?? `سائق ${rows[0].driver_id}`) : '—'

    // تقدير "عهدة غير مسوّاة" لعدم توفر حالة التسوية في هذا التقرير:
    // نعدّ السائقين الذين لديهم تحصيل > 0 لكن بدون زمن توصيل مسجّل (avg null) كمؤشر بحاجة مراجعة.
    const pendingCustodyCount = rows.filter((r) => Number(r.total_collected ?? 0) > 0 && r.avg_delivery_minutes == null).length

    const avgColor =
      avgMinutes == null ? 'text-slate-400'
        : avgMinutes < 20 ? 'text-emerald-700'
          : avgMinutes <= 30 ? 'text-amber-700'
            : 'text-red-700'
    const pendingColor = pendingCustodyCount === 0 ? 'text-slate-500' : (pendingCustodyCount <= 2 ? 'text-amber-700' : 'text-red-700')

    return {
      totalTrips,
      avgMinutes,
      totalCollected,
      topDriver,
      pendingCustodyCount,
      avgColor,
      pendingColor,
    }
  }, [rows])

  const maxTrips = useMemo(() => Math.max(1, ...rows.map((r) => Number(r.trip_count ?? 0))), [rows])

  const timeBuckets = useMemo(() => {
    const buckets = [
      { label: 'أقل من 10 د', min: 0, max: 10, color: '#185FA5' },
      { label: '10-15 د', min: 10, max: 15, color: '#185FA5' },
      { label: '15-20 د', min: 15, max: 20, color: '#185FA5' },
      { label: '20-25 د', min: 20, max: 25, color: '#BA7517' },
      { label: '25-30 د', min: 25, max: 30, color: '#E24B4A' },
      { label: 'أكثر من 30 د', min: 30, max: Infinity, color: '#E24B4A' },
    ]

    const chartData = buckets.map((b) => ({
      name: b.label,
      count: rows.filter((r) => r.avg_delivery_minutes !== null && r.avg_delivery_minutes >= b.min && r.avg_delivery_minutes < b.max).length,
      color: b.color,
    }))

    return chartData
  }, [rows])

  const driverChartData = useMemo(() => {
    return [...rows]
      .sort((a, b) => Number(b.trip_count ?? 0) - Number(a.trip_count ?? 0))
      .map((r) => ({
        name: r.driver_name ?? `سائق ${r.driver_id}`,
        trips: Number(r.trip_count ?? 0),
        collected: Number(r.total_collected ?? 0),
      }))
  }, [rows])

  const statusTextAr = (avgMinutes: number | null) => {
    if (avgMinutes == null) return '—'
    if (avgMinutes < 15) return 'ممتاز'
    if (avgMinutes <= 25) return 'جيد'
    return 'يحتاج متابعة'
  }

  const getStatusBadge = (avgMinutes: number | null) => {
    if (avgMinutes == null) return <span className="text-xs text-slate-400">—</span>
    if (avgMinutes < 15) return <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">ممتاز</span>
    if (avgMinutes <= 25) return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">جيد</span>
    return <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800">يحتاج متابعة</span>
  }

  const reportTitle = t.delivery?.performanceTitle ?? 'تقرير أداء التوصيل'
  const exportDisabled = reportRes.isLoading || rows.length === 0

  const handleExportCsv = useCallback(() => {
    const sep = ','
    const headers = ['السائق', 'الرحلات', 'متوسط الوقت (د)', 'التحصيل', 'الحالة']
    const lines = rows.map((r) => {
      const name = (r.driver_name ?? `سائق ${r.driver_id}`).replace(/"/g, '""')
      const trips = String(r.trip_count ?? 0)
      const avg = r.avg_delivery_minutes == null ? '' : String(Number(r.avg_delivery_minutes).toFixed(2))
      const coll = String(r.total_collected ?? 0)
      const st = statusTextAr(r.avg_delivery_minutes)
      return [`"${name}"`, trips, avg, coll, `"${st}"`].join(sep)
    })
    const csv = '\ufeff' + [headers.join(sep), ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `delivery-performance-${from}-${to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [rows, from, to])

  const handlePrint = useCallback(() => {
    const dir = 'rtl'
    const fmtMin = (n: number) => `${n.toFixed(1)} د`
    const periodLine = `${from} — ${to}`
    const kpiRows = `
      <tr><td>إجمالي الرحلات</td><td class="num">${new Intl.NumberFormat('ar-SA').format(kpis.totalTrips)}</td></tr>
      <tr><td>متوسط وقت التوصيل</td><td class="num">${kpis.avgMinutes == null ? '—' : fmtMin(kpis.avgMinutes)}</td></tr>
      <tr><td>إجمالي التحصيل</td><td class="num">${fmtMoney(kpis.totalCollected)}</td></tr>
      <tr><td>أعلى سائق</td><td>${kpis.topDriver}</td></tr>
      <tr><td>عهدة غير مسوّاة</td><td class="num">${new Intl.NumberFormat('ar-SA').format(kpis.pendingCustodyCount)}</td></tr>`
    const tableRows = rows
      .map((r) => {
        const name = (r.driver_name ?? `سائق ${r.driver_id}`).replace(/</g, '&lt;')
        const trips = new Intl.NumberFormat('ar-SA').format(Number(r.trip_count ?? 0))
        const avg = r.avg_delivery_minutes == null ? '—' : fmtMin(Number(r.avg_delivery_minutes))
        const coll = fmtMoney(Number(r.total_collected ?? 0))
        const st = statusTextAr(r.avg_delivery_minutes)
        return `<tr><td>${name}</td><td class="num">${trips}</td><td class="num">${avg}</td><td class="num">${coll}</td><td>${st}</td></tr>`
      })
      .join('')
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html dir="${dir}"><head><meta charset="utf-8"/><title>${reportTitle}</title>
      <style>
        body{font-family:system-ui,sans-serif;padding:1rem;font-size:14px}
        h1{font-size:1.1rem;margin:0 0 .5rem}
        .muted{color:#64748b;font-size:12px;margin-bottom:1rem}
        .kpis{width:100%;border-collapse:collapse;margin-bottom:1.25rem;max-width:32rem}
        .kpis td,.kpis th{border:1px solid #e2e8f0;padding:6px 8px}
        .kpis th{background:#f8fafc;text-align:right}
        table.data{width:100%;border-collapse:collapse}
        table.data th,table.data td{border:1px solid #ccc;padding:6px 8px}
        table.data th{background:#f5f5f5;text-align:right}
        .num{text-align:left;direction:ltr;unicode-bidi:plaintext}
      </style></head><body>
      <h1>${reportTitle}</h1>
      <p class="muted">${periodLine}</p>
      <table class="kpis"><tbody>${kpiRows}</tbody></table>
      <table class="data"><thead><tr><th>السائق</th><th>الرحلات</th><th>متوسط الوقت</th><th>التحصيل</th><th>الحالة</th></tr></thead><tbody>${tableRows}</tbody></table>
      </body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => {
      win.print()
      win.close()
    }, 250)
  }, [rows, from, to, reportTitle, kpis, fmtMoney])

  const showCustomDateFields = periodPreset === 'custom'
  const labelPeriod = lang === 'ar' ? 'الفترة' : 'Period'
  const labelFrom = lang === 'ar' ? 'من تاريخ' : 'From date'
  const labelTo = lang === 'ar' ? 'إلى تاريخ' : 'To date'
  const journalPeriodSelectClass = 'h-9 border border-slate-300 rounded-lg px-3 text-sm bg-white min-w-[150px]'
  const journalDateInputClass = 'h-9 border border-slate-300 rounded-lg px-3 text-sm bg-white w-[140px]'

  return (
    <div className="p-3 md:p-4 space-y-3 w-full min-w-0 max-w-full" dir="rtl">
      {/* الشريط العلوي — نفس هيكل «مبيعات المطعم»: عنوان · فترة في الوسط · أزرار موحّدة */}
      <div className="flex flex-wrap items-center gap-4 py-1">
        <div className="flex items-center gap-2 min-w-0">
          <BarChart3 className="w-7 h-7 text-primary-600 shrink-0" aria-hidden />
          <h1 className="text-xl font-semibold text-slate-900 truncate">{reportTitle}</h1>
        </div>
        <div className="flex-1 flex justify-center flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-600 shrink-0">{labelPeriod}</span>
            <select
              value={periodPreset}
              onChange={(e) => applyPeriodPreset((e.target.value as ReportPeriodKey | 'custom') || 'all')}
              className={`${journalPeriodSelectClass} focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none`}
              title={labelPeriod}
            >
              {periodOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {lang === 'ar' ? opt.labelAr : opt.labelEn}
                </option>
              ))}
            </select>
          </div>
          {showCustomDateFields && (
            <>
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-slate-600 whitespace-nowrap">{labelFrom}</span>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className={`${journalDateInputClass} focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none`}
                  title={labelFrom}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-slate-600 whitespace-nowrap">{labelTo}</span>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className={`${journalDateInputClass} focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none`}
                  title={labelTo}
                />
              </div>
            </>
          )}
        </div>
        <ReportToolbarIconGroup
          disabled={exportDisabled}
          onExportExcel={handleExportCsv}
          onPrint={handlePrint}
          onExportPdf={handlePrint}
        />
      </div>

      {/* Filters */}
      <div className={`bg-white rounded-xl shadow-sm border border-slate-200 py-2 px-3`}>
        <div className={`flex flex-wrap gap-2 items-center ${filtersJustifyClass}`}>
          <div className="min-w-[12rem] w-[15rem]">
            <select
              className={filterSelectCompactClass}
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              aria-label="السائق"
              title="السائق"
            >
              <option value="">السائق</option>
              <option value="__all__">الكل</option>
              {drivers.map((d) => (
                <option key={d.id} value={String(d.id)}>{d.name}</option>
              ))}
            </select>
          </div>

          <div className="min-w-[12rem] w-[15rem]">
            <select
              className={filterSelectCompactClass}
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              aria-label="الفرع"
              title="الفرع"
            >
              <option value="">الفرع</option>
              <option value="__all__">الكل</option>
              {branches.map((b) => (
                <option key={b.id} value={String(b.id)}>{lang === 'ar' ? b.name : (b.name_en || b.name)}</option>
              ))}
            </select>
          </div>

          <div className="w-14 shrink-0 flex items-center">
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              title="عدد السجلات"
              className={filterPageSizeSelectClass}
              aria-label="عدد السجلات"
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Loading / Empty */}
      {reportRes.isLoading ? (
        <div className="text-center py-8 text-slate-400">جاري التحميل...</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-10 text-slate-400">لا توجد بيانات للفترة المحددة</div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
              <p className="text-xs text-slate-500 mb-1">إجمالي الرحلات</p>
              <p className="text-2xl font-medium text-slate-900">{new Intl.NumberFormat('ar-SA').format(kpis.totalTrips)}</p>
            </div>

            <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
              <p className="text-xs text-slate-500 mb-1">متوسط وقت التوصيل</p>
              <p className="text-2xl font-medium text-slate-900">{kpis.avgMinutes == null ? '—' : minutesAr(kpis.avgMinutes)}</p>
              {kpis.avgMinutes == null ? (
                <p className={`text-xs mt-1 ${kpis.avgColor}`}>لا توجد بيانات كافية لحساب المتوسط</p>
              ) : kpis.avgMinutes >= 20 ? (
                <p className={`text-xs mt-1 ${kpis.avgColor}`}>{kpis.avgMinutes <= 30 ? 'متوسط' : 'مرتفع'}</p>
              ) : null}
            </div>

            <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
              <p className="text-xs text-slate-500 mb-1">إجمالي التحصيل</p>
              <p className="text-2xl font-medium text-slate-900">{fmtMoney(kpis.totalCollected)}</p>
            </div>

            <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
              <p className="text-xs text-slate-500 mb-1">أعلى سائق</p>
              <p className="text-2xl font-medium text-slate-900 truncate">{kpis.topDriver}</p>
            </div>

            <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
              <p className="text-xs text-slate-500 mb-1">عهدة غير مسوّاة</p>
              <p className="text-2xl font-medium text-slate-900">{new Intl.NumberFormat('ar-SA').format(kpis.pendingCustodyCount)}</p>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="bg-white border border-slate-100 rounded-xl p-3">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">توزيع أوقات التوصيل</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={timeBuckets} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#888780' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#888780' }} allowDecimals={false} />
                  <Tooltip
                    formatter={(value: number | undefined) => [`${new Intl.NumberFormat('ar-SA').format(Number(value ?? 0))} سائق`, 'العدد']}
                    contentStyle={{ fontSize: 12, direction: 'rtl' }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {timeBuckets.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white border border-slate-100 rounded-xl p-3">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">مقارنة الرحلات بين السائقين</p>
              <ResponsiveContainer width="100%" height={Math.max(160, driverChartData.length * 40)}>
                <BarChart data={driverChartData} layout="vertical" margin={{ top: 5, right: 30, left: 80, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#888780' }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#444441' }} width={75} />
                  <Tooltip
                    formatter={(value: number | undefined) => [`${new Intl.NumberFormat('ar-SA').format(Number(value ?? 0))} رحلة`, 'الرحلات']}
                    contentStyle={{ fontSize: 12, direction: 'rtl' }}
                  />
                  <Bar dataKey="trips" fill="#185FA5" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Drivers table */}
          <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-100">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">تفاصيل أداء السائقين</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-slate-600">
                    <th className="text-start p-3">السائق</th>
                    <th className="text-end p-3">الرحلات</th>
                    <th className="text-end p-3">متوسط الوقت</th>
                    <th className="text-end p-3">التحصيل</th>
                    <th className="text-center p-3">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((r) => {
                    const pct = Math.max(0, Math.min(100, (Number(r.trip_count ?? 0) / maxTrips) * 100))
                    return (
                      <tr key={r.driver_id} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="p-3">
                          <div className="min-w-[220px]">
                            <div className="text-slate-900 font-medium">{r.driver_name ?? `سائق ${r.driver_id}`}</div>
                            <div className="w-full h-1.5 bg-slate-200 rounded-full mt-2">
                              <div
                                className="h-1.5 rounded-full"
                                style={{ width: `${pct}%`, backgroundColor: '#185FA5' }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="p-3 text-end tabular-nums">{new Intl.NumberFormat('ar-SA').format(Number(r.trip_count ?? 0))}</td>
                        <td className="p-3 text-end tabular-nums">
                          {r.avg_delivery_minutes == null ? '—' : minutesAr(Number(r.avg_delivery_minutes))}
                        </td>
                        <td className="p-3 text-end tabular-nums font-mono">{fmtMoney(Number(r.total_collected ?? 0))}</td>
                        <td className="p-3 text-center">{getStatusBadge(r.avg_delivery_minutes)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer note */}
          <p className="text-xs text-slate-400 text-center pt-0.5">
            {t.delivery?.performanceFootnote ?? 'الرحلات = إسناد تمت تسويته بالكامل · زمن التوصيل عند تسجيل التسليم · التحصيل من سندات القبض على حساب العهدة'}
          </p>
        </>
      )}
    </div>
  )
}
