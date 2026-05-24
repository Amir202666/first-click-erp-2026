import { useState, useRef, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchBranches, fetchCustomers, fetchCostCenters, fetchInvoiceProfits, type InvoiceProfitRow, type InvoiceProfitsResponse, fetchTenantUsers } from '../../api/tenant'
import type { Branch, CostCenter, Customer, TenantUserItem } from '../../types'
import { formatAmount } from '../../utils/currency'
import { asArray } from '../../utils/asArray'
import { getReportPeriodRange, type ReportPeriodKey } from '../../utils/date'
import { Columns3, FileSpreadsheet, FileText, Printer } from 'lucide-react'
import Toast from '../../components/ui/Toast'
import { usePersistedColumnVisibility } from '../../hooks/usePersistedColumnVisibility'
import { useClientSort } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'
import { filterPageSizeSelectClass } from '../../utils/filterControlStyles'

type InvoiceProfitsColumnKey = 'number' | 'customer' | 'date' | 'branch' | 'sales_net' | 'cost' | 'profit' | 'margin'
const INVOICE_PROFITS_COLUMN_KEYS: InvoiceProfitsColumnKey[] = ['number', 'customer', 'date', 'branch', 'sales_net', 'cost', 'profit', 'margin']
const INVOICE_PROFITS_COLUMNS_STORAGE_KEY = 'invoiceProfitsReportVisibleColumns'

const INVOICE_PROFITS_ROW_LIMITS = [50, 100, 200, 500] as const

type SalesSourceFilter = '' | 'regular' | 'pos' | 'restaurant'

const initialProfitPeriodRange = getReportPeriodRange('all')

const periodOptions: { value: ReportPeriodKey | 'custom'; labelAr: string; labelEn: string }[] = [
  { value: 'all', labelAr: 'الكل', labelEn: 'All' },
  { value: 'today', labelAr: 'اليوم', labelEn: 'Today' },
  { value: 'yesterday', labelAr: 'الأمس', labelEn: 'Yesterday' },
  { value: 'this_week', labelAr: 'هذا الأسبوع', labelEn: 'This Week' },
  { value: 'last_week', labelAr: 'الأسبوع السابق', labelEn: 'Last Week' },
  { value: 'this_month', labelAr: 'هذا الشهر', labelEn: 'This Month' },
  { value: 'last_month', labelAr: 'الشهر السابق', labelEn: 'Last Month' },
  { value: 'this_year', labelAr: 'هذه السنة', labelEn: 'This Year' },
  { value: 'custom', labelAr: 'تاريخ مخصص', labelEn: 'Custom Date' },
]

export default function InvoiceProfitsReport() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'

  const [periodPreset, setPeriodPreset] = useState<ReportPeriodKey | 'custom'>('all')
  const [filters, setFilters] = useState<{
    from_date: string
    to_date: string
    number: string
    sales_source: SalesSourceFilter
    branch_id: string
    customer_id: string
    cost_center_id: string
    created_by: string
    /** أقصى عدد صفوف في الجدول (يُرسل للـ API دائماً) */
    row_limit: string
  }>({
    from_date: initialProfitPeriodRange.from_date,
    to_date: initialProfitPeriodRange.to_date,
    number: '',
    sales_source: '',
    branch_id: '',
    customer_id: '',
    cost_center_id: '',
    created_by: '',
    row_limit: '50',
  })
  const [visibleColumns, setVisibleColumns] = usePersistedColumnVisibility(
    INVOICE_PROFITS_COLUMNS_STORAGE_KEY,
    INVOICE_PROFITS_COLUMN_KEYS,
  )
  const [showColumnsMenu, setShowColumnsMenu] = useState(false)
  const columnsMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (columnsMenuRef.current && !columnsMenuRef.current.contains(e.target as Node)) setShowColumnsMenu(false)
    }
    if (showColumnsMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showColumnsMenu])

  function applyPeriodPreset(preset: ReportPeriodKey | 'custom') {
    setPeriodPreset(preset)
    if (preset !== 'custom') {
      const range = getReportPeriodRange(preset)
      setFilters((f) => ({ ...f, from_date: range.from_date, to_date: range.to_date }))
    }
  }

  const showCustomDateFields = periodPreset === 'custom'
  const labelFrom = lang === 'ar' ? 'من تاريخ' : 'From date'
  const labelTo = lang === 'ar' ? 'إلى تاريخ' : 'To date'
  const labelPeriod = lang === 'ar' ? 'الفترة' : 'Period'

  const { data: branchesData } = useQuery({
    queryKey: ['branches', tenantId, 'invoice-profits'],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId,
  })
  const branches: Branch[] = asArray<Branch>(branchesData)

  const { data: customersData } = useQuery<{ data: Customer[] }>({
    queryKey: ['customers', tenantId, 'invoice-profits'],
    queryFn: () => fetchCustomers(tenantId, { per_page: '500' }),
    enabled: !!tenantId,
  })
  const customers: Customer[] = customersData?.data ?? []

  const { data: usersData } = useQuery<{ data: TenantUserItem[] }>({
    queryKey: ['tenant-users', tenantId, 'invoice-profits'],
    queryFn: () => fetchTenantUsers(tenantId),
    enabled: !!tenantId,
  })
  const users: TenantUserItem[] = usersData?.data ?? []

  const { data: costCentersData } = useQuery({
    queryKey: ['cost-centers', tenantId, 'invoice-profits'],
    queryFn: () => fetchCostCenters(tenantId),
    enabled: !!tenantId,
  })
  const costCenters: CostCenter[] = asArray<CostCenter>(costCentersData)

  const { data, isLoading, error } = useQuery<InvoiceProfitsResponse>({
    queryKey: ['invoice-profits', tenantId, filters],
    queryFn: () => {
      const params: Record<string, string> = {
        from_date: filters.from_date,
        to_date: filters.to_date,
      }
      const num = filters.number.trim()
      if (num) params.number = num
      if (filters.sales_source) params.sales_source = filters.sales_source
      if (filters.branch_id) params.branch_id = filters.branch_id
      if (filters.customer_id) params.customer_id = filters.customer_id
      if (filters.cost_center_id) params.cost_center_id = filters.cost_center_id
      if (filters.created_by) params.created_by = filters.created_by
      params.limit = filters.row_limit
      return fetchInvoiceProfits(tenantId, params)
    },
    enabled: !!tenantId,
  })

  const rows = data?.rows ?? []
  const totals = data?.totals ?? { sales_net: 0, cost: 0, profit: 0, margin: 0 }
  const totalMatching = data?.total_matching
  const limitApplied = data?.limit
  const fmt = (n: number) => formatAmount(n, { decimal_places: 2 }, locale)
  const visibleColumnKeys = INVOICE_PROFITS_COLUMN_KEYS.filter((k) => visibleColumns[k])
  const columnLabels: Record<InvoiceProfitsColumnKey, string> = {
    number: lang === 'ar' ? 'رقم الفاتورة' : 'Invoice number',
    customer: lang === 'ar' ? 'العميل' : 'Customer',
    date: lang === 'ar' ? 'التاريخ' : 'Date',
    branch: lang === 'ar' ? 'الفرع' : 'Branch',
    sales_net: lang === 'ar' ? 'إجمالي البيع' : 'Sales total',
    cost: lang === 'ar' ? 'إجمالي التكلفة' : 'Cost',
    profit: lang === 'ar' ? 'الربح' : 'Profit',
    margin: lang === 'ar' ? 'نسبة الربح' : 'Profit %',
  }

  const textAlign = isRtl ? 'text-right' : 'text-left'
  const invoiceProfitsSortColumns = useMemo(
    () => [
      { key: 'number' as const, type: 'string' as const, getValue: (r: InvoiceProfitRow) => r.number ?? '' },
      { key: 'customer' as const, type: 'string' as const, getValue: (r: InvoiceProfitRow) => r.customer ?? '' },
      { key: 'date' as const, type: 'date' as const, getValue: (r: InvoiceProfitRow) => r.date },
      { key: 'branch' as const, type: 'string' as const, getValue: (r: InvoiceProfitRow) => r.branch_name ?? '' },
      { key: 'sales_net' as const, type: 'number' as const, getValue: (r: InvoiceProfitRow) => r.sales_net },
      { key: 'cost' as const, type: 'number' as const, getValue: (r: InvoiceProfitRow) => r.cost },
      { key: 'profit' as const, type: 'number' as const, getValue: (r: InvoiceProfitRow) => r.profit },
      { key: 'margin' as const, type: 'number' as const, getValue: (r: InvoiceProfitRow) => r.margin },
    ],
    [],
  )
  const { sort, toggleSort, sortedRows } = useClientSort<InvoiceProfitRow, InvoiceProfitsColumnKey>(
    rows,
    invoiceProfitsSortColumns,
    { locale },
  )

  const handlePrint = () => {
    window.print()
  }

  const handleExportExcel = () => {
    if (!sortedRows.length) return
    const headers = ['رقم الفاتورة', 'العميل', 'التاريخ', 'الفرع', 'إجمالي البيع', 'إجمالي التكلفة', 'الربح', 'نسبة الربح']
    const csvRows = sortedRows.map((r) => [
      r.number,
      r.customer ?? '',
      r.date,
      r.branch_name ?? '',
      r.sales_net,
      r.cost,
      r.profit,
      `${r.margin.toFixed(2)}%`,
    ])
    const csv = [headers.join(','), ...csvRows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `invoice-profits-${filters.from_date}-${filters.to_date}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="px-0 py-3 space-y-3 w-full min-w-0 max-w-full">
      {error && <Toast message={t.msg?.errorOccurred ?? 'حدث خطأ'} type="error" onClose={() => { }} />}

      {/* الشريط العلوي: نفس تباعد فواتير المبيعات */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-1.5">
        <h1 className="text-base font-semibold text-slate-900 truncate shrink-0 leading-tight">
          {(t.nav as any)?.invoiceProfitsReport ?? 'تقرير أرباح الفواتير'}
        </h1>
        <div className="flex-1 flex justify-center min-w-0">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-600 shrink-0">{labelPeriod}</span>
              <select
                value={periodPreset}
                onChange={(e) => applyPeriodPreset((e.target.value as ReportPeriodKey | 'custom') || 'all')}
                className="border border-slate-300 rounded-lg px-2.5 h-8 text-sm min-w-[140px] max-w-[200px] box-border bg-white shrink-0 leading-normal focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
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
              <div className="flex flex-wrap items-center gap-2 justify-center">
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-sm text-slate-600 whitespace-nowrap">{labelFrom}</span>
                  <input
                    type="date"
                    value={filters.from_date}
                    onChange={(e) => setFilters((f) => ({ ...f, from_date: e.target.value }))}
                    className="border border-slate-300 rounded-lg px-2 h-8 text-sm w-[140px] min-w-[140px] box-border bg-white leading-normal focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                    title={labelFrom}
                  />
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-sm text-slate-600 whitespace-nowrap">{labelTo}</span>
                  <input
                    type="date"
                    value={filters.to_date}
                    onChange={(e) => setFilters((f) => ({ ...f, to_date: e.target.value }))}
                    className="border border-slate-300 rounded-lg px-2 h-8 text-sm w-[140px] min-w-[140px] box-border bg-white leading-normal focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                    title={labelTo}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="relative flex flex-wrap items-center gap-1 no-print shrink-0" ref={columnsMenuRef}>
          <button
            type="button"
            onClick={() => setShowColumnsMenu((v) => !v)}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#D9DCE0] bg-[#F0F2F5] text-[#344054] shadow-sm transition-colors hover:bg-[#E4E7EB]"
            title={lang === 'ar' ? 'تخصيص الأعمدة' : 'Customize columns'}
          >
            <Columns3 size={16} strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={!data || rows.length === 0}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
            title={lang === 'ar' ? 'تصدير Excel' : 'Export Excel'}
          >
            <FileSpreadsheet size={15} />
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={!data}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#344054] text-white hover:bg-[#2d3846] disabled:opacity-50"
            title={lang === 'ar' ? 'تصدير PDF' : 'Export PDF'}
          >
            <FileText size={15} />
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={!data}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#F0F2F5] border border-[#D9DCE0] text-[#344054] hover:bg-[#E4E7EB] disabled:opacity-50"
            title={lang === 'ar' ? 'طباعة' : 'Print'}
          >
            <Printer size={15} />
          </button>
          {showColumnsMenu && (
            <div className="absolute top-full end-0 mt-2 z-50 w-64 rounded-lg border border-slate-200 bg-white shadow-lg py-2 text-sm">
              <div className="px-3 pb-2 text-xs font-semibold text-slate-500 border-b border-slate-100">
                {lang === 'ar' ? 'إظهار/إخفاء الأعمدة' : 'Show / hide columns'}
              </div>
              {INVOICE_PROFITS_COLUMN_KEYS.map((key) => (
                <label key={key} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={visibleColumns[key]}
                    onChange={() => setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }))}
                    className="rounded border-slate-300"
                  />
                  <span>{columnLabels[key]}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* الإحصائيات */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <StatCard title={lang === 'ar' ? 'إجمالي المبيعات' : 'Total Sales'} value={fmt(totals.sales_net)} />
        <StatCard title={lang === 'ar' ? 'إجمالي التكلفة' : 'Total Cost'} value={fmt(totals.cost)} />
        <StatCard title={lang === 'ar' ? 'صافي الربح' : 'Net Profit'} value={fmt(totals.profit)} positive={totals.profit >= 0} />
        <StatCard title={lang === 'ar' ? 'معدل الربحية' : 'Profit Margin'} value={`${totals.margin.toFixed(2)} %`} />
      </div>

      {/* الفلاتر: نفس تخطيط القيود اليومية — المجموعة + عدد السجلات بجانبها */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 py-2.5 px-3 no-print">
        <div className="flex flex-nowrap items-center justify-between gap-3 w-full min-w-0 overflow-x-auto">
          <div className="flex flex-nowrap items-center gap-3 min-w-0 flex-1">
            <div className="shrink-0 w-[118px] max-w-[150px]">
              <input
                type="text"
                value={filters.number}
                onChange={(e) => setFilters((f) => ({ ...f, number: e.target.value }))}
                placeholder={lang === 'ar' ? 'رقم الفاتورة' : 'Invoice number'}
                className="w-full h-8 border border-slate-300 rounded-lg px-2 text-sm box-border bg-white leading-normal placeholder:text-slate-500"
                title={lang === 'ar' ? 'البحث برقم الفاتورة' : 'Search by invoice number'}
              />
            </div>
            <div className="flex-1 min-w-[160px] max-w-[240px]">
              <select
                value={filters.sales_source}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, sales_source: (e.target.value || '') as SalesSourceFilter }))
                }
                className="w-full h-8 border border-slate-300 rounded-lg px-2.5 text-sm box-border bg-white leading-normal"
                title={lang === 'ar' ? 'نوع المبيعات' : 'Sales type'}
              >
                <option value="">{lang === 'ar' ? 'نوع المبيعات' : 'Sales type'}</option>
                <option value="regular">{lang === 'ar' ? 'مبيعات' : 'Sales'}</option>
                <option value="pos">{lang === 'ar' ? 'نقاط بيع (POS)' : 'POS'}</option>
                <option value="restaurant">{lang === 'ar' ? 'مطعم' : 'Restaurant'}</option>
              </select>
            </div>
            <div className="flex-1 min-w-[180px]">
              <select
                value={filters.branch_id}
                onChange={(e) => setFilters((f) => ({ ...f, branch_id: e.target.value }))}
                className="w-full h-8 border border-slate-300 rounded-lg px-2.5 text-sm box-border bg-white leading-normal"
              >
                <option value="">{lang === 'ar' ? 'الفرع' : 'Branch'}</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[220px]">
              <select
                value={filters.customer_id}
                onChange={(e) => setFilters((f) => ({ ...f, customer_id: e.target.value }))}
                className="w-full h-8 border border-slate-300 rounded-lg px-2.5 text-sm box-border bg-white leading-normal"
              >
                <option value="">{lang === 'ar' ? 'العميل' : 'Customer'}</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[180px]">
              <select
                value={filters.cost_center_id}
                onChange={(e) => setFilters((f) => ({ ...f, cost_center_id: e.target.value }))}
                className="w-full h-8 border border-slate-300 rounded-lg px-2.5 text-sm box-border bg-white leading-normal"
                title={lang === 'ar' ? 'مركز التكلفة' : 'Cost center'}
              >
                <option value="">{lang === 'ar' ? 'مركز التكلفة' : 'Cost center'}</option>
                {costCenters.map((cc) => (
                  <option key={cc.id} value={cc.id}>
                    {lang === 'ar' ? cc.name : (cc.name_en || cc.name)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <select
                value={filters.created_by}
                onChange={(e) => setFilters((f) => ({ ...f, created_by: e.target.value }))}
                className="w-full h-8 border border-slate-300 rounded-lg px-2.5 text-sm box-border bg-white leading-normal"
              >
                <option value="">{(t.invoices as any)?.filterUserAll ?? (lang === 'ar' ? 'المستخدم' : 'User')}</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="w-14 shrink-0 flex items-center self-stretch">
            <select
              value={filters.row_limit}
              onChange={(e) => setFilters((f) => ({ ...f, row_limit: e.target.value }))}
              title={lang === 'ar' ? 'عدد السجلات في الصفحة' : 'Rows per page'}
              className={filterPageSizeSelectClass}
              aria-label={lang === 'ar' ? 'عدد السجلات في الصفحة' : 'Rows per page'}
            >
              {INVOICE_PROFITS_ROW_LIMITS.map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* الجدول */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            {typeof totalMatching === 'number' && limitApplied != null && sortedRows.length < totalMatching && (
              <div className={`px-3 py-1.5 text-xs text-slate-500 border-b border-slate-100 ${textAlign}`}>
                {lang === 'ar'
                  ? `عرض ${sortedRows.length} من ${totalMatching} فاتورة مطابقة`
                  : `Showing ${sortedRows.length} of ${totalMatching} matching invoices`}
              </div>
            )}
            <table className="w-full text-sm min-w-[600px] table-fixed">
              <thead>
                <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  {visibleColumnKeys.map((key) => {
                    const numeric = key === 'sales_net' || key === 'cost' || key === 'profit' || key === 'margin'
                    return (
                      <SortableTh
                        key={key}
                        label={columnLabels[key]}
                        sortKey={key}
                        sortState={sort}
                        onToggle={toggleSort}
                        widthClassName={numeric ? 'min-w-[96px]' : 'min-w-[100px]'}
                        className={`p-0 font-medium ${numeric ? 'text-right' : textAlign}`}
                      />
                    )
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumnKeys.length} className="text-center py-6 text-slate-400">
                      {lang === 'ar' ? 'لا توجد بيانات' : 'No data'}
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/60">
                      {visibleColumnKeys.map((key) => {
                        if (key === 'number') return <td key={key} className="px-4 py-2"><span className="text-primary-600 font-medium">{r.number}</span></td>
                        if (key === 'customer') return <td key={key} className="px-4 py-2 text-slate-800">{r.customer ?? '—'}</td>
                        if (key === 'date') return <td key={key} className="px-4 py-2 text-slate-600">{r.date}</td>
                        if (key === 'branch') return <td key={key} className="px-4 py-2 text-slate-600">{r.branch_name ?? '—'}</td>
                        if (key === 'sales_net') return <td key={key} className="px-4 py-2 text-right tabular-nums">{fmt(r.sales_net)}</td>
                        if (key === 'cost') return <td key={key} className="px-4 py-2 text-right tabular-nums">{fmt(r.cost)}</td>
                        if (key === 'profit') return <td key={key} className={`px-4 py-2 text-right tabular-nums ${r.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(r.profit)}</td>
                        if (key === 'margin') return <td key={key} className="px-4 py-2 text-right tabular-nums">{r.margin.toFixed(2)} %</td>
                        return null
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ title, value, positive = true }: { title: string; value: string; positive?: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3 flex flex-col items-center justify-center text-center gap-2">
      <span className="text-xs text-slate-500 leading-snug">{title}</span>
      <span className={`text-lg font-bold tabular-nums leading-tight ${positive ? 'text-emerald-700' : 'text-red-600'}`}>{value}</span>
    </div>
  )
}

