import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BadgePercent,
  Plus,
  Pencil,
  Trash2,
  Power,
  BarChart3,
  Tag,
  Calendar,
  Users,
  Loader2,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { promotionsApi } from '../../api/promotions'
import type { Promotion, PromotionChannel } from '../../types/promotions'
import Toast, { type ToastType } from '../../components/ui/Toast'

const TYPE_LABELS: Record<string, { ar: string; en: string }> = {
  percentage: { ar: 'نسبة مئوية', en: 'Percentage' },
  fixed: { ar: 'مبلغ ثابت', en: 'Fixed amount' },
  bogo: { ar: 'اشترِ واحصل', en: 'BOGO' },
  min_purchase: { ar: 'حد أدنى', en: 'Min purchase' },
}

const CHANNEL_LABELS: Record<PromotionChannel, { ar: string; en: string; icon: string }> = {
  invoice: { ar: 'فواتير', en: 'Invoices', icon: '🧾' },
  pos: { ar: 'POS', en: 'POS', icon: '🖥️' },
  restaurant: { ar: 'مطعم', en: 'Restaurant', icon: '🍽️' },
  delivery: { ar: 'توصيل', en: 'Delivery', icon: '🚚' },
}

function formatValue(p: Promotion, lang: string) {
  if (p.type === 'percentage' || p.type === 'min_purchase') return `${p.value}%`
  if (p.type === 'bogo') {
    return lang === 'ar'
      ? `${p.buy_quantity ?? 1}+${p.get_quantity ?? 1}`
      : `Buy ${p.buy_quantity ?? 1} get ${p.get_quantity ?? 1}`
  }
  return `${Number(p.value).toFixed(3)} KWD`
}

export default function PromotionsList() {
  const { currentTenant } = useAuth()
  const { lang, isRtl } = useLanguage()
  const navigate = useNavigate()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()
  const [filterStatus, setFilterStatus] = useState('all')
  const [deleteTarget, setDeleteTarget] = useState<Promotion | null>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['promotions', tenantId, filterStatus],
    queryFn: () => promotionsApi.list(tenantId, filterStatus !== 'all' ? { status: filterStatus } : undefined),
    enabled: !!tenantId,
  })

  const promos: Promotion[] = data?.data?.data ?? []
  const summary = data?.data?.summary

  const filtered = useMemo(() => {
    if (filterStatus === 'all') return promos
    return promos.filter((p) => p.status === filterStatus)
  }, [promos, filterStatus])

  const toggleMut = useMutation({
    mutationFn: (id: number) => promotionsApi.toggle(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promotions', tenantId] })
      setToast({ message: lang === 'ar' ? 'تم تحديث الحالة' : 'Status updated', type: 'success' })
    },
    onError: (e: any) =>
      setToast({ message: e?.response?.data?.message ?? 'Error', type: 'error' }),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => promotionsApi.delete(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promotions', tenantId] })
      setDeleteTarget(null)
      setToast({ message: lang === 'ar' ? 'تم الحذف' : 'Deleted', type: 'success' })
    },
    onError: (e: any) =>
      setToast({ message: e?.response?.data?.message ?? 'Error', type: 'error' }),
  })

  const tabs = [
    { id: 'all', ar: 'الكل', en: 'All' },
    { id: 'active', ar: 'نشطة', en: 'Active' },
    { id: 'inactive', ar: 'متوقفة', en: 'Inactive' },
    { id: 'draft', ar: 'مسودة', en: 'Draft' },
  ]

  return (
    <div className="w-full pt-2 px-4 pb-4 sm:pt-3 sm:px-5 sm:pb-5" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Tag className="w-7 h-7 text-rose-500" />
            {lang === 'ar' ? 'العروض والتخفيضات' : 'Promotions & Discounts'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {lang === 'ar'
              ? 'إدارة العروض التلقائية لفواتير المبيعات ونقاط البيع والمطعم والتوصيل'
              : 'Manage automatic offers for invoices, POS, restaurant, and delivery'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/promotions/report"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <BarChart3 className="w-4 h-4" />
            {lang === 'ar' ? 'التقرير' : 'Report'}
          </Link>
          <button
            type="button"
            onClick={() => navigate('/promotions/new')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700"
          >
            <Plus className="w-4 h-4" />
            {lang === 'ar' ? 'عرض جديد' : 'New promotion'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          {
            label: lang === 'ar' ? 'عروض نشطة' : 'Active promos',
            value: summary?.active_count ?? 0,
            color: 'emerald',
          },
          {
            label: lang === 'ar' ? 'إجمالي الخصم' : 'Total discount',
            value: `${(summary?.total_discount ?? 0).toFixed(3)} KWD`,
            color: 'rose',
          },
          {
            label: lang === 'ar' ? 'فواتير استفادت' : 'Invoices used',
            value: summary?.invoices_count ?? 0,
            color: 'blue',
          },
          {
            label: lang === 'ar' ? 'عروض قادمة' : 'Upcoming',
            value: summary?.upcoming_count ?? 0,
            color: 'amber',
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className={`rounded-2xl border bg-white p-4 shadow-sm border-${kpi.color}-100`}
          >
            <p className="text-xs text-slate-500 font-medium">{kpi.label}</p>
            <p className="text-2xl font-bold text-slate-800 mt-1 tabular-nums">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilterStatus(tab.id)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              filterStatus === tab.id
                ? 'bg-rose-600 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {lang === 'ar' ? tab.ar : tab.en}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="w-full text-center py-20 rounded-2xl border border-dashed border-slate-200 bg-slate-50/80">
          <BadgePercent className="w-14 h-14 mx-auto text-slate-300 mb-4" />
          <p className="text-slate-600 font-medium">{lang === 'ar' ? 'لا توجد عروض' : 'No promotions yet'}</p>
          <p className="text-sm text-slate-400 mt-1 mb-5">
            {lang === 'ar' ? 'أنشئ أول عرض تلقائي للمبيعات أو نقطة البيع' : 'Create your first automatic offer'}
          </p>
          <button
            type="button"
            onClick={() => navigate('/promotions/new')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700"
          >
            <Plus className="w-4 h-4" />
            {lang === 'ar' ? 'عرض جديد' : 'New promotion'}
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((p) => (
            <div
              key={p.id}
              className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden hover:shadow-md transition-shadow"
            >
              <div className="p-4 border-b border-slate-100 bg-gradient-to-l from-rose-50/80 to-white">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                        {lang === 'ar' ? TYPE_LABELS[p.type]?.ar : TYPE_LABELS[p.type]?.en}
                      </span>
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          p.status === 'active'
                            ? 'bg-emerald-100 text-emerald-700'
                            : p.status === 'draft'
                              ? 'bg-slate-100 text-slate-600'
                              : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {p.status}
                      </span>
                    </div>
                    <h3 className="font-bold text-slate-800 truncate">{p.name}</h3>
                    {p.description && (
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">{p.description}</p>
                    )}
                  </div>
                  <div className="text-end shrink-0">
                    <p className="text-2xl font-extrabold text-rose-600 tabular-nums" dir="ltr">
                      {formatValue(p, lang)}
                    </p>
                    {p.code && (
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">{p.code}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-4 space-y-3 text-xs text-slate-600">
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>
                      {p.start_date ?? '—'} → {p.end_date ?? '∞'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    <span>
                      {p.current_uses}
                      {p.max_uses != null ? ` / ${p.max_uses}` : ''}{' '}
                      {lang === 'ar' ? 'استخدام' : 'uses'}
                    </span>
                  </div>
                </div>
                <p>
                  {lang === 'ar' ? 'خصم مُعطى:' : 'Discount given:'}{' '}
                  <span className="font-semibold text-rose-600 tabular-nums" dir="ltr">
                    {(p.total_discount_given ?? 0).toFixed(3)} KWD
                  </span>
                </p>
                <div className="flex flex-wrap gap-1">
                  {(p.channels ?? []).map((ch) => (
                    <span
                      key={ch}
                      className="px-2 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium"
                    >
                      {CHANNEL_LABELS[ch as PromotionChannel]?.icon}{' '}
                      {lang === 'ar'
                        ? CHANNEL_LABELS[ch as PromotionChannel]?.ar
                        : CHANNEL_LABELS[ch as PromotionChannel]?.en}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex border-t border-slate-100 divide-x divide-slate-100 rtl:divide-x-reverse">
                <button
                  type="button"
                  onClick={() => navigate(`/promotions/${p.id}/edit`)}
                  className="flex-1 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 flex items-center justify-center gap-1"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  {lang === 'ar' ? 'تعديل' : 'Edit'}
                </button>
                <button
                  type="button"
                  onClick={() => toggleMut.mutate(p.id)}
                  className="flex-1 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 flex items-center justify-center gap-1"
                >
                  <Power className="w-3.5 h-3.5" />
                  {p.status === 'active'
                    ? lang === 'ar'
                      ? 'إيقاف'
                      : 'Pause'
                    : lang === 'ar'
                      ? 'تفعيل'
                      : 'Activate'}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(p)}
                  className="flex-1 py-2.5 text-xs font-medium text-red-600 hover:bg-red-50 flex items-center justify-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {lang === 'ar' ? 'حذف' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
            <h3 className="font-bold text-slate-800 mb-2">
              {lang === 'ar' ? 'حذف العرض؟' : 'Delete promotion?'}
            </h3>
            <p className="text-sm text-slate-500 mb-4">{deleteTarget.name}</p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-lg border text-sm"
              >
                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => deleteMut.mutate(deleteTarget.id)}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium"
              >
                {lang === 'ar' ? 'حذف' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
