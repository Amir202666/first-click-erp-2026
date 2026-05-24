import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchTaxDeclaration, fetchSettings, fetchBranches, fetchCostCenters } from '../../api/tenant'
import type { TaxDeclarationReport } from '../../api/tenant'
import type { Branch } from '../../types'
import { getDefaultDateRange, getReportPeriodRange, type ReportPeriodKey } from '../../utils/date'
import { formatAmount } from '../../utils/currency'
import { Printer, FileText, FileSpreadsheet } from 'lucide-react'

export default function TaxDeclarationReport() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const defaultRange = getDefaultDateRange()

  const [periodPreset, setPeriodPreset] = useState<ReportPeriodKey | 'custom'>('all')
  const [dateFrom, setDateFrom] = useState(defaultRange.dateFrom ?? '')
  const [dateTo, setDateTo] = useState(defaultRange.dateTo ?? '')
  const [branchId, setBranchId] = useState<number | ''>('')
  const [costCenterId, setCostCenterId] = useState<number | ''>('')

  const { data: settings } = useQuery({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const decimals = Number((settings as Record<string, unknown>)?.doc_amount_decimals ?? 2)
  const fmt = (n: number) => formatAmount(n, { decimal_places: decimals }, locale)

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId, { status: 'active' }),
    enabled: !!tenantId,
  })

  const { data: costCenters = [] } = useQuery<{ id: number; name: string; code?: string }[]>({
    queryKey: ['costCenters', tenantId, 'tax-declaration'],
    queryFn: () => fetchCostCenters(tenantId, { active_only: '1' }),
    enabled: !!tenantId,
  })

  const params = {
    from_date: dateFrom,
    to_date: dateTo,
    ...(branchId ? { branch_id: branchId } : {}),
    ...(costCenterId ? { cost_center_id: costCenterId } : {}),
  }
  const { data, isLoading } = useQuery<TaxDeclarationReport>({
    queryKey: ['tax-declaration', tenantId, params],
    queryFn: () => fetchTaxDeclaration(tenantId, params),
    enabled: !!tenantId && !!dateFrom && !!dateTo,
  })

  const reportTitle = lang === 'ar' ? 'تقرير الإقرار الضريبي' : 'Tax Declaration Report'
  const companyLogo = (settings as Record<string, unknown>)?.company_logo as string | undefined

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
      setDateFrom(range.from_date)
      setDateTo(range.to_date)
    }
  }

  function onDateFromChange(value: string) {
    setDateFrom(value)
  }

  function onDateToChange(value: string) {
    setDateTo(value)
  }

  const showCustomDateFields = periodPreset === 'custom'
  const labelFrom = lang === 'ar' ? 'من تاريخ' : 'From date'
  const labelTo = lang === 'ar' ? 'إلى تاريخ' : 'To date'
  const labelPeriod = lang === 'ar' ? 'الفترة' : 'Period'

  const filterNativeClass =
    'w-full min-w-0 max-w-full h-10 box-border border border-slate-300 rounded-lg py-0 text-sm leading-10 bg-white focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none ps-3 pe-10'
  const filterRowClass = 'flex flex-wrap items-end gap-3'
  /** عرض ثابت 13rem لكل من الفرع ومركز التكلفة (مطابق لـ Tailwind w-52) */
  const filterCellBranchCostCenter = 'min-w-0 shrink-0 w-52 max-w-52'

  function handlePrint() {
    if (!data) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <!DOCTYPE html><html dir="${isRtl ? 'rtl' : 'ltr'}"><head>
        <meta charset="utf-8"><title>${reportTitle}</title>
        <style>
          body{font-family:Arial,sans-serif;padding:24px;max-width:800px;margin:0 auto;}
          table{width:100%;border-collapse:collapse;margin-top:16px;}
          th,td{border:1px solid #ddd;padding:10px;}
          th{background:#f1f5f9;text-align:right;}
          .num{text-align:right;font-variant-numeric:tabular-nums;}
          .footer{font-weight:400;border-top:2px solid #334155;background:#f0f0f0;}
        </style>
      </head><body>
        ${companyLogo ? `<div style="margin-bottom:16px;"><img src="${companyLogo}" alt="Logo" style="max-height:48px;" /></div>` : ''}
        <h2 style="margin-bottom:8px;">${reportTitle}</h2>
        <p style="color:#64748b;font-size:0.9rem;">${t.payments.dateFrom ?? 'من تاريخ'}: ${dateFrom} — ${t.payments.dateTo ?? 'إلى تاريخ'}: ${dateTo}</p>
        <table>
          <thead><tr><th>${lang === 'ar' ? 'البند' : 'Item'}</th><th class="num">${lang === 'ar' ? 'المبلغ' : 'Amount'}</th></tr></thead>
          <tbody>
            <tr><td>${lang === 'ar' ? 'إجمالي المبيعات الخاضعة للضريبة' : 'Total Taxable Sales'}</td><td class="num">${fmt(data.taxable_sales)}</td></tr>
            <tr><td>${lang === 'ar' ? 'إجمالي المشتريات الخاضعة للضريبة' : 'Total Taxable Purchases'}</td><td class="num">${fmt(data.taxable_purchases)}</td></tr>
            <tr><td>${lang === 'ar' ? 'ضريبة المبيعات' : 'Sales Tax'}</td><td class="num">${fmt(data.sales_tax)}</td></tr>
            <tr><td>${lang === 'ar' ? 'ضريبة المشتريات' : 'Purchase Tax'}</td><td class="num">${fmt(data.purchase_tax)}</td></tr>
          </tbody>
          <tfoot>
            <tr class="footer"><td>${lang === 'ar' ? 'صافي الضريبة المستحقة' : 'Net Tax Due'}</td><td class="num">${fmt(data.net_tax_due)}</td></tr>
          </tfoot>
        </table>
      </body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 300)
  }

  function csvCell(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
      return `"${value.replace(/"/g, '""')}"`
    }
    return value
  }

  function handleExportExcel() {
    if (!data) return
    const itemCol = lang === 'ar' ? 'البند' : 'Item'
    const amountCol = lang === 'ar' ? 'المبلغ' : 'Amount'
    const row = (label: string, amount: string) => `${csvCell(label)},${csvCell(amount)}`
    const lines = [
      `${csvCell(itemCol)},${csvCell(amountCol)}`,
      row(lang === 'ar' ? 'إجمالي المبيعات الخاضعة للضريبة' : 'Total Taxable Sales', fmt(data.taxable_sales)),
      row(lang === 'ar' ? 'إجمالي المشتريات الخاضعة للضريبة' : 'Total Taxable Purchases', fmt(data.taxable_purchases)),
      row(lang === 'ar' ? 'ضريبة المبيعات' : 'Sales Tax', fmt(data.sales_tax)),
      row(lang === 'ar' ? 'ضريبة المشتريات' : 'Purchase Tax', fmt(data.purchase_tax)),
      '',
      row(lang === 'ar' ? 'صافي الضريبة المستحقة' : 'Net Tax Due', fmt(data.net_tax_due)),
    ]
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tax-declaration-${dateFrom}-${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const textAlign = isRtl ? 'text-right' : 'text-left'

  return (
    <div className="px-0 py-3 space-y-3 w-full min-w-0 max-w-full">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-1.5">
        <h1 className="text-base font-semibold text-slate-900 truncate shrink-0 leading-tight">{reportTitle}</h1>
        <div className="flex-1 flex justify-center min-w-0">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-600 shrink-0">{labelPeriod}</span>
              <select
                value={periodPreset}
                onChange={(e) => applyPeriodPreset((e.target.value as ReportPeriodKey | 'custom') || 'all')}
                className="h-10 box-border border border-slate-300 rounded-lg py-0 ps-3 pe-10 text-sm leading-10 min-w-[140px] max-w-[200px] bg-white shrink-0 focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none"
                style={{ textAlign: isRtl ? 'right' : 'left' }}
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
                    value={dateFrom}
                    onChange={(e) => onDateFromChange(e.target.value)}
                    className="h-10 box-border border border-slate-300 rounded-lg px-2 py-0 text-sm w-[140px] min-w-[140px] bg-white leading-normal focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none"
                    title={labelFrom}
                  />
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-sm text-slate-600 whitespace-nowrap">{labelTo}</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => onDateToChange(e.target.value)}
                    className="h-10 box-border border border-slate-300 rounded-lg px-2 py-0 text-sm w-[140px] min-w-[140px] bg-white leading-normal focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none"
                    title={labelTo}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="relative z-[120] flex flex-wrap items-center gap-1 no-print shrink-0">
          <button
            type="button"
            onClick={handlePrint}
            disabled={!data}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#F0F2F5] border border-[#D9DCE0] text-[#344054] hover:bg-[#E4E7EB] disabled:opacity-50 no-print"
            title={t.payments.printReport}
          >
            <Printer size={15} />
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={!data}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#344054] text-white hover:bg-[#2d3846] disabled:opacity-50 no-print"
            title={t.payments.exportPdf}
          >
            <FileText size={15} />
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={!data}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 no-print"
            title={t.payments.exportExcel}
          >
            <FileSpreadsheet size={15} />
          </button>
        </div>
      </div>

      <div className={`bg-white rounded-xl border border-slate-200 p-4 ${filterRowClass}`}>
        <div className={filterCellBranchCostCenter}>
          <select
            value={branchId === '' ? '' : String(branchId)}
            onChange={(e) => setBranchId(e.target.value ? +e.target.value : '')}
            className={filterNativeClass}
            style={{ textAlign: isRtl ? 'right' : 'left' }}
            aria-label={lang === 'ar' ? 'الفرع' : 'Branch'}
          >
            <option value="">{lang === 'ar' ? 'كل الفروع' : 'All branches'}</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} — {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className={filterCellBranchCostCenter}>
          <select
            value={costCenterId === '' ? '' : String(costCenterId)}
            onChange={(e) => setCostCenterId(e.target.value ? +e.target.value : '')}
            className={filterNativeClass}
            style={{ textAlign: isRtl ? 'right' : 'left' }}
            aria-label={t.journal.costCenter ?? 'مركز التكلفة'}
          >
            <option value="">{lang === 'ar' ? 'كل مراكز التكلفة' : 'All cost centers'}</option>
            {costCenters.map((cc) => (
              <option key={cc.id} value={cc.id}>
                {cc.code ? `${cc.code} - ${cc.name}` : cc.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center items-center h-48">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-500 border-t-transparent" />
          </div>
        ) : data ? (
          <div className="p-6">
            {data.company?.tax_registration_number && (
              <p className="text-sm text-slate-600 mb-4">
                {t.accounts?.taxNumber ?? 'الرقم الضريبي'}: {data.company.tax_registration_number}
              </p>
            )}
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <th className={`${textAlign} px-4 py-3 font-medium`}>{lang === 'ar' ? 'البند' : 'Item'}</th>
                  <th className="text-right px-4 py-3 font-medium">{lang === 'ar' ? 'المبلغ' : 'Amount'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                <tr><td className="px-4 py-3 text-slate-700">{lang === 'ar' ? 'إجمالي المبيعات الخاضعة للضريبة' : 'Total Taxable Sales'}</td><td className="px-4 py-3 text-right font-medium tabular-nums">{fmt(data.taxable_sales)}</td></tr>
                <tr><td className="px-4 py-3 text-slate-700">{lang === 'ar' ? 'إجمالي المشتريات الخاضعة للضريبة' : 'Total Taxable Purchases'}</td><td className="px-4 py-3 text-right font-medium tabular-nums">{fmt(data.taxable_purchases)}</td></tr>
                <tr><td className="px-4 py-3 text-slate-700">{lang === 'ar' ? 'ضريبة المبيعات' : 'Sales Tax'}</td><td className="px-4 py-3 text-right font-medium tabular-nums">{fmt(data.sales_tax)}</td></tr>
                <tr><td className="px-4 py-3 text-slate-700">{lang === 'ar' ? 'ضريبة المشتريات' : 'Purchase Tax'}</td><td className="px-4 py-3 text-right font-medium tabular-nums">{fmt(data.purchase_tax)}</td></tr>
              </tbody>
              <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                <tr className="font-bold text-slate-900">
                  <td className={`px-4 py-3 ${textAlign}`}>{lang === 'ar' ? 'صافي الضريبة المستحقة' : 'Net Tax Due'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(data.net_tax_due)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center text-slate-500">
            {dateFrom && dateTo ? (lang === 'ar' ? 'اختر الفترة ثم ستظهر النتائج' : 'Select date range to load data') : (lang === 'ar' ? 'حدد نطاق التاريخ' : 'Set date range')}
          </div>
        )}
      </div>
    </div>
  )
}
