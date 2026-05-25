import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, BarChart3, Loader2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { promotionsApi } from '../../api/promotions'

export default function PromotionReport() {
  const { currentTenant } = useAuth()
  const { lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['promotions-report', tenantId, from, to],
    queryFn: () => promotionsApi.report(tenantId, { from: from || undefined, to: to || undefined }),
    enabled: !!tenantId,
  })

  const usages = data?.data?.data ?? []
  const byPromo = data?.data?.by_promotion ?? []
  const totals = data?.data?.totals

  return (
    <div className="w-full pt-2 px-4 pb-4 sm:pt-3 sm:px-5 sm:pb-5" dir={isRtl ? 'rtl' : 'ltr'}>
      <Link
        to="/promotions"
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-1.5"
      >
        <ArrowRight className={`w-4 h-4 ${isRtl ? '' : 'rotate-180'}`} />
        {lang === 'ar' ? 'العودة للعروض' : 'Back to promotions'}
      </Link>

      <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2 mb-4">
        <BarChart3 className="w-7 h-7 text-rose-500" />
        {lang === 'ar' ? 'تقرير العروض' : 'Promotions report'}
      </h1>

      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <div className="rounded-2xl border bg-white p-4">
          <p className="text-xs text-slate-500">{lang === 'ar' ? 'مرات الاستخدام' : 'Total uses'}</p>
          <p className="text-2xl font-bold tabular-nums">{totals?.uses ?? 0}</p>
        </div>
        <div className="rounded-2xl border bg-white p-4">
          <p className="text-xs text-slate-500">{lang === 'ar' ? 'إجمالي الخصم' : 'Total discount'}</p>
          <p className="text-2xl font-bold text-rose-600 tabular-nums" dir="ltr">
            {(totals?.discount ?? 0).toFixed(3)} KWD
          </p>
        </div>
      </div>

      {byPromo.length > 0 && (
        <div className="rounded-2xl border bg-white overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-start p-3">{lang === 'ar' ? 'العرض' : 'Promotion'}</th>
                <th className="text-end p-3">{lang === 'ar' ? 'الاستخدام' : 'Uses'}</th>
                <th className="text-end p-3">{lang === 'ar' ? 'الخصم' : 'Discount'}</th>
              </tr>
            </thead>
            <tbody>
              {byPromo.map((row) => (
                <tr key={row.promotion_id} className="border-t border-slate-100">
                  <td className="p-3 font-medium">{row.promotion_name}</td>
                  <td className="p-3 text-end tabular-nums">{row.uses}</td>
                  <td className="p-3 text-end text-rose-600 tabular-nums" dir="ltr">
                    {row.discount.toFixed(3)} KWD
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="rounded-2xl border bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-start p-3">{lang === 'ar' ? 'التاريخ' : 'Date'}</th>
                <th className="text-start p-3">{lang === 'ar' ? 'العرض' : 'Promotion'}</th>
                <th className="text-start p-3">{lang === 'ar' ? 'العميل' : 'Customer'}</th>
                <th className="text-start p-3">{lang === 'ar' ? 'القناة' : 'Channel'}</th>
                <th className="text-end p-3">{lang === 'ar' ? 'الخصم' : 'Discount'}</th>
              </tr>
            </thead>
            <tbody>
              {usages.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400">
                    {lang === 'ar' ? 'لا توجد بيانات' : 'No data'}
                  </td>
                </tr>
              ) : (
                usages.map((u) => (
                  <tr key={u.id} className="border-t border-slate-100">
                    <td className="p-3 text-xs" dir="ltr">
                      {u.used_at?.slice(0, 16).replace('T', ' ')}
                    </td>
                    <td className="p-3">{u.promotion?.name ?? '—'}</td>
                    <td className="p-3">{u.customer?.name ?? '—'}</td>
                    <td className="p-3">{u.channel}</td>
                    <td className="p-3 text-end text-rose-600 tabular-nums" dir="ltr">
                      {Number(u.discount_amount).toFixed(3)} KWD
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
