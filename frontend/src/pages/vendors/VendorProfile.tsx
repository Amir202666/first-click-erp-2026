import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchVendor } from '../../api/tenant'
import type { Vendor } from '../../types'
import { getReportPeriodRange } from '../../utils/date'
import { FileText } from 'lucide-react'

export default function VendorProfile() {
  const { currentTenant } = useAuth()
  const { lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const { id } = useParams()
  const vendorId = Number(id || 0)

  const { data, isLoading } = useQuery({
    queryKey: ['vendor', tenantId, vendorId],
    queryFn: () => fetchVendor(tenantId, vendorId),
    enabled: !!tenantId && vendorId > 0,
  })

  const vendor = (data as Vendor | undefined) ?? null

  const { from_date, to_date } = useMemo(() => getReportPeriodRange('all'), [])
  const accountId = vendor?.account_id ?? vendor?.account?.id ?? null
  const statementPath =
    accountId && accountId > 0
      ? `/accounts/statement/sheet?${new URLSearchParams({
          accountId: String(accountId),
          from_date,
          to_date,
        }).toString()}`
      : null

  if (!tenantId) {
    return (
      <div className="p-6">
        <p className="text-amber-600">{lang === 'ar' ? 'يرجى اختيار الشركة أولاً.' : 'Please select a company first.'}</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="p-6 flex justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-500 border-t-transparent" />
      </div>
    )
  }

  if (!vendor) {
    return (
      <div className="p-6">
        <p className="text-slate-600">{lang === 'ar' ? 'المورد غير موجود.' : 'Vendor not found.'}</p>
      </div>
    )
  }

  const label = (ar: string, en: string) => (lang === 'ar' ? ar : en)
  const name = lang === 'ar' ? vendor.name : vendor.name_en || vendor.name

  return (
    <div className="p-6 space-y-4" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 truncate">{name}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {label('ملف المورد', 'Vendor profile')}
            {vendor.code ? (
              <span className="ms-2 font-mono text-xs text-slate-500" dir="ltr">
                {vendor.code}
              </span>
            ) : null}
          </p>
        </div>

        {statementPath ? (
          <Link
            to={statementPath}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-800 text-white px-3 py-2 text-sm hover:bg-slate-700"
            title={label('عرض كشف الحساب', 'View account statement')}
          >
            <FileText size={16} />
            {label('كشف الحساب', 'Statement')}
          </Link>
        ) : (
          <div className="text-xs text-slate-400">{label('لا يوجد حساب مرتبط', 'No linked account')}</div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">
            {label('بيانات المورد', 'Vendor details')}
          </h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-slate-500">{label('اسم الشركة', 'Company')}</dt>
              <dd className="text-slate-800 dark:text-slate-100">{vendor.company_name || '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{label('الرقم الضريبي', 'Tax #')}</dt>
              <dd className="text-slate-800 dark:text-slate-100">{vendor.tax_number || '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{label('الهاتف', 'Phone')}</dt>
              <dd className="text-slate-800 dark:text-slate-100" dir="ltr">
                {vendor.phone || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">{label('البريد الإلكتروني', 'Email')}</dt>
              <dd className="text-slate-800 dark:text-slate-100">{vendor.email || '—'}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-slate-500">{label('العنوان', 'Address')}</dt>
              <dd className="text-slate-800 dark:text-slate-100">{vendor.address || '—'}</dd>
            </div>
          </dl>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">
            {label('الحركات التاريخية', 'Historical movements')}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {statementPath
              ? label(
                  'لعرض كافة الحركات المحاسبية بالتفصيل، افتح كشف الحساب من الزر أعلاه.',
                  'To view all accounting movements, open the statement using the button above.',
                )
              : label(
                  'لا يوجد حساب مرتبط بهذا المورد لعرض الحركات المحاسبية.',
                  'This vendor has no linked account to show accounting movements.',
                )}
          </p>
        </div>
      </div>
    </div>
  )
}

