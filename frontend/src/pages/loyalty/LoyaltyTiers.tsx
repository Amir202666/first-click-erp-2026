import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { loyaltyApi } from '../../api/loyalty'

type Tier = {
  id?: number
  name: string
  icon?: string | null
  color?: string | null
  min_points: number
  max_points?: number | null
  points_multiplier: number
  extra_discount_percent: number
  sort_order?: number
}

export default function LoyaltyTiers() {
  const { currentTenant } = useAuth()
  const { lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const params = useParams()
  const programId = (() => {
    const raw = params.programId
    if (!raw) return null
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? n : null
  })()

  const [tiers, setTiers] = useState<Tier[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [form, setForm] = useState<Tier | null>(null)

  const empty: Tier = useMemo(
    () => ({
      name: '',
      icon: '',
      color: '',
      min_points: 0,
      max_points: null,
      points_multiplier: 1,
      extra_discount_percent: 0,
      sort_order: 0,
    }),
    [],
  )

  function load() {
    if (!tenantId) return
    setLoading(true)
    setErr(null)
    loyaltyApi
      .getTiers(tenantId, programId ?? undefined)
      .then((r) => setTiers((r.data.data ?? []) as Tier[]))
      .catch((e) => setErr(e?.response?.data?.message ?? (lang === 'ar' ? 'فشل التحميل' : 'Failed to load')))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, programId])

  async function save() {
    if (!tenantId || !form) return
    setSaving(true)
    setErr(null)
    try {
      await loyaltyApi.saveTier(tenantId, form, programId ?? undefined)
      setForm(null)
      load()
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? (lang === 'ar' ? 'فشل الحفظ' : 'Save failed'))
    } finally {
      setSaving(false)
    }
  }

  async function del(id: number) {
    if (!tenantId) return
    setErr(null)
    try {
      await loyaltyApi.deleteTier(tenantId, id)
      load()
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? (lang === 'ar' ? 'فشل الحذف' : 'Delete failed'))
    }
  }

  return (
    <div className="p-6 space-y-4" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-slate-900">{lang === 'ar' ? 'مستويات الولاء' : 'Loyalty tiers'}</h1>
        <button
          onClick={() => setForm({ ...empty })}
          className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium hover:bg-slate-50"
        >
          {lang === 'ar' ? 'إضافة مستوى' : 'Add tier'}
        </button>
      </div>

      {err && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{err}</div>}

      {form && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="block">
              <span className="text-xs text-slate-600">{lang === 'ar' ? 'الاسم' : 'Name'}</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full h-9 rounded-md border border-slate-300 px-3 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs text-slate-600">{lang === 'ar' ? 'أيقونة' : 'Icon'}</span>
              <input value={form.icon ?? ''} onChange={(e) => setForm({ ...form, icon: e.target.value })} className="mt-1 w-full h-9 rounded-md border border-slate-300 px-3 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs text-slate-600">{lang === 'ar' ? 'لون' : 'Color'}</span>
              <input value={form.color ?? ''} onChange={(e) => setForm({ ...form, color: e.target.value })} className="mt-1 w-full h-9 rounded-md border border-slate-300 px-3 text-sm" placeholder="#cd7f32" />
            </label>
            <label className="block">
              <span className="text-xs text-slate-600">{lang === 'ar' ? 'من نقاط' : 'Min points'}</span>
              <input type="number" value={form.min_points} onChange={(e) => setForm({ ...form, min_points: Number(e.target.value || 0) })} className="mt-1 w-full h-9 rounded-md border border-slate-300 px-3 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs text-slate-600">{lang === 'ar' ? 'إلى نقاط (فارغ = بلا حد)' : 'Max points (blank = unlimited)'}</span>
              <input type="number" value={form.max_points ?? ''} onChange={(e) => setForm({ ...form, max_points: e.target.value === '' ? null : Number(e.target.value) })} className="mt-1 w-full h-9 rounded-md border border-slate-300 px-3 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs text-slate-600">{lang === 'ar' ? 'مضاعف النقاط' : 'Points multiplier'}</span>
              <input type="number" step="0.01" value={form.points_multiplier} onChange={(e) => setForm({ ...form, points_multiplier: Number(e.target.value || 1) })} className="mt-1 w-full h-9 rounded-md border border-slate-300 px-3 text-sm" />
            </label>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => setForm(null)} className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm hover:bg-slate-50">
              {lang === 'ar' ? 'إلغاء' : 'Cancel'}
            </button>
            <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-500 disabled:opacity-50">
              {saving ? (lang === 'ar' ? '...' : '...') : (lang === 'ar' ? 'حفظ' : 'Save')}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="divide-y divide-slate-200">
          {loading ? (
            <div className="p-4 text-sm text-slate-500">…</div>
          ) : tiers.length === 0 ? (
            <div className="p-4 text-sm text-slate-500">{lang === 'ar' ? 'لا توجد مستويات' : 'No tiers'}</div>
          ) : (
            tiers.map((t) => (
              <div key={t.id} className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 truncate">
                    <span className="me-2">{t.icon}</span>
                    {t.name}
                  </div>
                  <div className="text-xs text-slate-500">
                    {lang === 'ar' ? 'من' : 'From'} {t.min_points} {lang === 'ar' ? 'إلى' : 'to'} {t.max_points ?? '∞'} | ×{t.points_multiplier}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setForm({ ...t })} className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm hover:bg-slate-50">
                    {lang === 'ar' ? 'تعديل' : 'Edit'}
                  </button>
                  {t.id != null && (
                    <button onClick={() => del(t.id!)} className="px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm hover:bg-red-100">
                      {lang === 'ar' ? 'حذف' : 'Delete'}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

