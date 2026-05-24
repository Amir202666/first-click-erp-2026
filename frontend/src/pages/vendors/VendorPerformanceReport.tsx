import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { useDocumentTitleContext } from '../../contexts/DocumentTitleContext'
import { fetchVendorPerformance, fetchBranches, fetchCostCenters, fetchCurrencies, fetchVendorGroups, fetchSettings } from '../../api/tenant'
import type { Branch, CostCenter, Currency, TenantSettings, VendorGroup, VendorPerformanceRow } from '../../types'
import { asArray } from '../../utils/asArray'
import { formatAmount } from '../../utils/currency'
import { getDefaultDateRange, getReportPeriodRange, type ReportPeriodKey } from '../../utils/date'
import {
  filterPeriodBarDateInputClass,
  filterPeriodBarSelectClass,
  filterReportSelectNineClass,
} from '../../utils/filterControlStyles'
import { FileSpreadsheet, Printer, FileText } from 'lucide-react'

function Stars({ n }: { n: number }) {
  const full = Math.max(0, Math.min(5, Math.round(n)))
  return (
    <div className="flex items-center gap-0.5" aria-label={`rating ${full}/5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={i < full ? 'text-amber-500' : 'text-slate-300'}>
          ★
        </span>
      ))}
    </div>
  )
}

export default function VendorPerformanceReport() {
  const { currentTenant } = useAuth()
  const { lang, isRtl } = useLanguage()
  const { setPageTitle } = useDocumentTitleContext()
  const tenantId = currentTenant?.id ?? 0

  const { data: settings } = useQuery<TenantSettings>({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const amountDecimals = typeof settings?.doc_amount_decimals === 'number' ? settings.doc_amount_decimals : 2
  const fmt = (n: number) => formatAmount(n, { decimal_places: amountDecimals }, locale)

  const defaultRange = useMemo(() => getDefaultDateRange(), [])
  const [dateFrom, setDateFrom] = useState(defaultRange.dateFrom)
  const [dateTo, setDateTo] = useState(defaultRange.dateTo)
  const [periodPreset, setPeriodPreset] = useState<ReportPeriodKey | 'custom'>('all')

  const [branchId, setBranchId] = useState<number | ''>('')
  const [costCenterId, setCostCenterId] = useState<number | ''>('')
  const [currency, setCurrency] = useState<string>('')
  const [vendorGroupId, setVendorGroupId] = useState<number | ''>('')

  useEffect(() => {
    setPageTitle(lang === 'ar' ? 'تقييم أداء الموردين' : 'Vendor performance rating')
    return () => setPageTitle(null)
  }, [lang, setPageTitle])

  function applyPeriodPreset(preset: ReportPeriodKey | 'custom') {
    setPeriodPreset(preset)
    if (preset !== 'custom') {
      const range = getReportPeriodRange(preset)
      setDateFrom(range.from_date)
      setDateTo(range.to_date)
    }
  }

  const params = useMemo(
    () => ({
      from_date: dateFrom,
      to_date: dateTo,
      ...(branchId ? { branch_id: Number(branchId) } : {}),
      ...(costCenterId ? { cost_center_id: Number(costCenterId) } : {}),
      ...(currency ? { currency } : {}),
      ...(vendorGroupId ? { vendor_group_id: Number(vendorGroupId) } : {}),
    }),
    [dateFrom, dateTo, branchId, costCenterId, currency, vendorGroupId],
  )

  const { data: branchesData } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId,
  })
  const branches: Branch[] = asArray<Branch>(branchesData)

  const { data: costCentersData } = useQuery({
    queryKey: ['cost-centers', tenantId],
    queryFn: () => fetchCostCenters(tenantId, { active_only: '1' }),
    enabled: !!tenantId,
  })
  const costCenters: CostCenter[] = Array.isArray(costCentersData) ? costCentersData : ((costCentersData as any)?.data ?? [])

  const { data: currenciesData } = useQuery<Currency[]>({
    queryKey: ['currencies', tenantId],
    queryFn: () => fetchCurrencies(tenantId),
    enabled: !!tenantId,
  })
  const currencies = currenciesData ?? []

  const { data: vendorGroups } = useQuery<VendorGroup[]>({
    queryKey: ['vendor-groups', tenantId],
    queryFn: () => fetchVendorGroups(tenantId),
    enabled: !!tenantId,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['vendorPerformance', tenantId, params],
    queryFn: () => fetchVendorPerformance(tenantId, params),
    enabled: !!tenantId,
  })

  const rows: VendorPerformanceRow[] = data?.data ?? []

  const handleExportCsv = () => {
    const headers = [
      lang === 'ar' ? 'المورد' : 'Vendor',
      lang === 'ar' ? 'إجمالي المشتريات' : 'Total purchases',
      lang === 'ar' ? 'إجمالي المرتجعات' : 'Total returns',
      lang === 'ar' ? 'نسبة المرتجعات' : 'Return rate %',
      lang === 'ar' ? 'تغييرات الأسعار' : 'Price changes',
      lang === 'ar' ? 'التقييم' : 'Score',
    ]
    const lines = [headers.join(',')]
    rows.forEach((r) => {
      const name = lang === 'ar' ? r.vendor_name : r.vendor_name_en || r.vendor_name
      lines.push([`"${name.replace(/"/g, '""')}"`, r.total_purchases, r.total_returns, r.return_rate_percent, r.price_changes_count, r.score].join(','))
    })
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vendor-performance-${dateFrom}-${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const showCustomDateFields = periodPreset === 'custom'
  const filterSelectCls = filterReportSelectNineClass

  if (!tenantId) {
    return (
      <div className="p-6">
        <p className="text-amber-600">{lang === 'ar' ? 'يرجى اختيار الشركة أولاً.' : 'Please select a company first.'}</p>
      </div>
    )
  }

  return (
    <div className="py-3 px-2 space-y-4" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="no-print flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-600 pb-2">
        <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate shrink-0 leading-tight">
          {lang === 'ar' ? 'تقييم أداء الموردين' : 'Vendor performance rating'}
        </h1>

        <div className="flex-1 flex justify-center min-w-0">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <select
              value={periodPreset}
              onChange={(e) => applyPeriodPreset((e.target.value as ReportPeriodKey | 'custom') || 'all')}
              className={filterPeriodBarSelectClass}
              title={lang === 'ar' ? 'الفترة' : 'Period'}
            >
              {([
                { value: 'all', labelAr: 'الكل', labelEn: 'All' },
                { value: 'custom', labelAr: 'تاريخ مخصص', labelEn: 'Custom Date' },
                { value: 'today', labelAr: 'اليوم', labelEn: 'Today' },
                { value: 'yesterday', labelAr: 'الأمس', labelEn: 'Yesterday' },
                { value: 'this_week', labelAr: 'هذا الأسبوع', labelEn: 'This Week' },
                { value: 'last_week', labelAr: 'الأسبوع السابق', labelEn: 'Last Week' },
                { value: 'this_month', labelAr: 'هذا الشهر', labelEn: 'This Month' },
                { value: 'last_month', labelAr: 'الشهر السابق', labelEn: 'Last Month' },
                { value: 'this_year', labelAr: 'هذه السنة', labelEn: 'This Year' },
              ] as any[]).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {lang === 'ar' ? opt.labelAr : opt.labelEn}
                </option>
              ))}
            </select>
            {showCustomDateFields && (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className={filterPeriodBarDateInputClass}
                />
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className={filterPeriodBarDateInputClass}
                />
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600"
            title={lang === 'ar' ? 'طباعة التقرير' : 'Print report'}
          >
            <Printer size={15} />
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-800 dark:bg-slate-600 text-white hover:bg-slate-700 dark:hover:bg-slate-500"
            title={lang === 'ar' ? 'تصدير PDF' : 'Export PDF'}
          >
            <FileText size={15} />
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-500"
            title={lang === 'ar' ? 'تصدير Excel' : 'Export Excel'}
          >
            <FileSpreadsheet size={15} />
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex flex-wrap items-stretch gap-3 no-print">
        <div className="min-w-[180px] flex-1 basis-[180px] max-w-[280px] flex">
          <select value={vendorGroupId === '' ? '' : String(vendorGroupId)} onChange={(e) => setVendorGroupId(e.target.value ? Number(e.target.value) : '')} className={filterSelectCls} title={lang === 'ar' ? 'فئة المورد' : 'Vendor group'}>
            <option value="">{lang === 'ar' ? 'كل فئات الموردين' : 'All vendor groups'}</option>
            {(vendorGroups ?? []).filter((g) => g.is_active).map((g) => (
              <option key={g.id} value={g.id}>
                {lang === 'ar' ? g.name : g.name_en || g.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[180px] flex-1 basis-[180px] max-w-[280px] flex">
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={filterSelectCls} title={lang === 'ar' ? 'العملة' : 'Currency'}>
            <option value="">{lang === 'ar' ? 'كل العملات' : 'All currencies'}</option>
            {currencies.filter((c) => c.is_active).map((c) => (
              <option key={c.id} value={c.code}>
                {c.code}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[180px] flex-1 basis-[180px] max-w-[280px] flex">
          <select value={branchId === '' ? '' : String(branchId)} onChange={(e) => setBranchId(e.target.value ? Number(e.target.value) : '')} className={filterSelectCls} title={lang === 'ar' ? 'الفرع' : 'Branch'}>
            <option value="">{lang === 'ar' ? 'كل الفروع' : 'All branches'}</option>
            {branches.filter((b) => b.is_active).map((b) => (
              <option key={b.id} value={b.id}>
                {lang === 'ar' ? b.name : b.name_en || b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[180px] flex-1 basis-[180px] max-w-[280px] flex">
          <select value={costCenterId === '' ? '' : String(costCenterId)} onChange={(e) => setCostCenterId(e.target.value ? Number(e.target.value) : '')} className={filterSelectCls} title={lang === 'ar' ? 'مركز التكلفة' : 'Cost center'}>
            <option value="">{lang === 'ar' ? 'كل المراكز' : 'All cost centers'}</option>
            {costCenters.filter((c) => c.is_active).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-500 border-t-transparent" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed min-w-[980px]" dir={isRtl ? 'rtl' : 'ltr'}>
              <thead className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-600 sticky top-0 z-10">
                <tr>
                  <th className={`px-4 py-2 font-medium text-slate-700 dark:text-slate-200 ${isRtl ? 'text-right' : 'text-left'}`}>{lang === 'ar' ? 'المورد' : 'Vendor'}</th>
                  <th className="px-4 py-2 font-medium text-slate-700 dark:text-slate-200 text-center">{lang === 'ar' ? 'إجمالي المشتريات' : 'Total purchases'}</th>
                  <th className="px-4 py-2 font-medium text-slate-700 dark:text-slate-200 text-center">{lang === 'ar' ? 'إجمالي المرتجعات' : 'Total returns'}</th>
                  <th className="px-4 py-2 font-medium text-slate-700 dark:text-slate-200 text-center">{lang === 'ar' ? 'نسبة المرتجعات' : 'Return rate'}</th>
                  <th className="px-4 py-2 font-medium text-slate-700 dark:text-slate-200 text-center">{lang === 'ar' ? 'تغييرات الأسعار' : 'Price changes'}</th>
                  <th className="px-4 py-2 font-medium text-slate-700 dark:text-slate-200 text-center">{lang === 'ar' ? 'التقييم' : 'Rating'}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const name = lang === 'ar' ? r.vendor_name : r.vendor_name_en || r.vendor_name
                  return (
                    <tr key={r.vendor_id} className="border-b border-slate-100 hover:bg-slate-50/50 dark:border-slate-600/50 dark:hover:bg-slate-700/30">
                      <td className={`px-4 py-2 ${isRtl ? 'text-right' : 'text-left'}`}>
                        <Link to={`/vendors/${r.vendor_id}`} className="font-medium text-primary-700 hover:underline dark:text-primary-400">
                          {name}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-center tabular-nums font-medium" dir="ltr">{fmt(r.total_purchases)}</td>
                      <td className="px-4 py-2 text-center tabular-nums" dir="ltr">{fmt(r.total_returns)}</td>
                      <td className="px-4 py-2 text-center tabular-nums" dir="ltr">{r.return_rate_percent.toFixed(2)}%</td>
                      <td className="px-4 py-2 text-center tabular-nums" dir="ltr">{r.price_changes_count}</td>
                      <td className="px-4 py-2 text-center">
                        <div className="inline-flex flex-col items-center gap-0.5">
                          <Stars n={r.stars} />
                          <span className="text-xs text-slate-500 tabular-nums" dir="ltr">
                            {r.score.toFixed(1)}/100
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {rows.length === 0 && (
              <p className="text-center text-slate-500 dark:text-slate-400 py-8">
                {lang === 'ar' ? 'لا توجد بيانات لعرضها.' : 'No data to display.'}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

