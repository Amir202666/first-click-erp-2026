import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { loyaltyApi } from '../../api/loyalty'
import { useAuth } from '../../contexts/AuthContext'

interface LoyaltyProgram {
  id?: number
  name: string
  code: string
  icon: string
  color: string
  description: string
  is_active: boolean
  points_per_currency: number
  point_value: number
  min_redeem_points: number
  max_redeem_percent: number
  points_expiry_days: number
  apply_on_invoices: boolean
  apply_on_pos: boolean
  apply_on_restaurant: boolean
  apply_on_delivery: boolean
}

const EMPTY_PROGRAM: LoyaltyProgram = {
  name: '',
  code: '',
  icon: '⭐',
  color: '#f59e0b',
  description: '',
  is_active: true,
  points_per_currency: 1,
  point_value: 0.01,
  min_redeem_points: 100,
  max_redeem_percent: 20,
  points_expiry_days: 365,
  apply_on_invoices: true,
  apply_on_pos: true,
  apply_on_restaurant: false,
  apply_on_delivery: false,
}

const ICONS = ['⭐', '🏆', '💎', '🥇', '🎯', '🎁', '👑', '🌟', '💫', '🔥']
const COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#f43f5e', '#06b6d4', '#14b8a6', '#f97316']

export default function LoyaltySettings() {
  const navigate = useNavigate()
  const { currentTenant } = useAuth()
  const tenantId = currentTenant?.id ?? 0

  const [programs, setPrograms] = useState<LoyaltyProgram[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<LoyaltyProgram | null>(null)
  const [form, setForm] = useState<LoyaltyProgram>(EMPTY_PROGRAM)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const MODULE_CHECKS = useMemo(
    () => [
      { key: 'apply_on_invoices', label: 'فواتير المبيعات', icon: '🧾' },
      { key: 'apply_on_pos', label: 'نقطة البيع', icon: '🖥️' },
      { key: 'apply_on_restaurant', label: 'مبيعات المطعم', icon: '🍽️' },
      { key: 'apply_on_delivery', label: 'التوصيل', icon: '🚚' },
    ],
    [],
  )

  const load = () => {
    if (!tenantId) return
    setLoading(true)
    setErr(null)
    loyaltyApi
      .listPrograms(tenantId)
      .then((r) => setPrograms(((r as any)?.data?.data ?? []) as LoyaltyProgram[]))
      .catch((e: any) => setErr(e?.response?.data?.message ?? 'فشل التحميل'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId])

  const openAdd = () => {
    setEditing(null)
    setForm(EMPTY_PROGRAM)
    setShowForm(true)
  }

  const openEdit = (p: LoyaltyProgram) => {
    setEditing(p)
    setForm({ ...p })
    setShowForm(true)
  }

  const setField = <K extends keyof LoyaltyProgram>(key: K, val: LoyaltyProgram[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }))

  const handleSave = async () => {
    if (!tenantId) return
    if (!form.name || !form.code) {
      window.alert('اسم البرنامج والكود مطلوبان')
      return
    }
    setSaving(true)
    setErr(null)
    try {
      const payload = {
        ...form,
        code: String(form.code).toUpperCase().replace(/\s/g, ''),
      }
      if (editing?.id) {
        await loyaltyApi.updateProgram(tenantId, editing.id, payload)
      } else {
        await loyaltyApi.createProgram(tenantId, payload)
      }
      setShowForm(false)
      load()
    } catch (e: any) {
      window.alert(e?.response?.data?.message ?? 'حدث خطأ')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!tenantId) return
    if (!window.confirm('هل أنت متأكد من حذف هذا البرنامج؟')) return
    setDeleting(id)
    setErr(null)
    try {
      await loyaltyApi.deleteProgram(tenantId, id)
      load()
    } catch (e: any) {
      window.alert(e?.response?.data?.message ?? 'لا يمكن الحذف')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="w-full p-6" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white text-lg">
            ⭐
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">برامج الولاء</h1>
            <p className="text-xs text-gray-400">{programs.length} برنامج مُعرَّف</p>
          </div>
        </div>
        <button
          onClick={openAdd}
          disabled={!tenantId}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-l from-amber-500 to-amber-600 text-white rounded-xl text-sm font-bold shadow-lg hover:-translate-y-0.5 transition-all disabled:opacity-60"
        >
          + إضافة برنامج جديد
        </button>
      </div>

      {err && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 mb-4">{err}</div>}

      {loading ? (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">…</div>
      ) : programs.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-gray-100">
          <div className="text-5xl mb-3">⭐</div>
          <p className="text-gray-500 font-medium mb-2">لا توجد برامج ولاء بعد</p>
          <p className="text-xs text-gray-400 mb-4">أنشئ برنامجك الأول لبدء منح النقاط للعملاء</p>
          <button onClick={openAdd} className="px-5 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-bold">
            + إنشاء برنامج الولاء الأول
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {programs.map((program) => (
            <div key={program.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4" style={{ borderRight: `4px solid ${program.color}` }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-2xl" style={{ background: program.color + '20' }}>
                    {program.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-gray-900">{program.name}</p>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-mono">{program.code}</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                          program.is_active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-400'
                        }`}
                      >
                        {program.is_active ? '● مفعّل' : '○ معطّل'}
                      </span>
                    </div>
                    {program.description ? <p className="text-xs text-gray-400 mt-0.5">{program.description}</p> : null}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => navigate(`/loyalty/programs/${program.id}/tiers`)}
                    className="px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-xs font-semibold hover:bg-amber-100 transition-colors"
                  >
                    🏆 المستويات
                  </button>
                  <button
                    onClick={() => openEdit(program)}
                    className="px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-xs font-semibold hover:bg-blue-100 transition-colors"
                  >
                    ✏️ تعديل
                  </button>
                  <button
                    onClick={() => program.id && handleDelete(program.id)}
                    disabled={deleting === program.id}
                    className="px-3 py-1.5 bg-red-50 border border-red-200 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-100 transition-colors disabled:opacity-50"
                  >
                    {deleting === program.id ? '...' : '🗑 حذف'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-0 border-t border-gray-100">
                {[
                  { label: 'نقطة / KWD', value: program.points_per_currency },
                  { label: 'قيمة النقطة', value: `${program.point_value} KWD` },
                  { label: 'أقصى خصم', value: `${program.max_redeem_percent}%` },
                  { label: 'صلاحية النقاط', value: program.points_expiry_days === 0 ? 'لا تنتهي' : `${program.points_expiry_days} يوم` },
                ].map((stat, i) => (
                  <div key={i} className={`px-4 py-3 text-center ${i < 3 ? 'border-l border-gray-100' : ''}`}>
                    <p className="text-[10px] text-gray-400 mb-0.5">{stat.label}</p>
                    <p className="text-sm font-bold text-gray-800">{stat.value}</p>
                  </div>
                ))}
              </div>

              <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50 flex gap-2 flex-wrap">
                {MODULE_CHECKS.map((m) => (
                  <span
                    key={m.key}
                    className={`text-[11px] px-2.5 py-1 rounded-full font-medium transition-all ${
                      (program as any)[m.key] ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-gray-100 text-gray-300'
                    }`}
                  >
                    {m.icon} {m.label}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm ? (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <h2 className="text-base font-bold text-gray-900">{editing ? `تعديل: ${editing.name}` : 'إضافة برنامج ولاء جديد'}</h2>
              <button
                onClick={() => setShowForm(false)}
                className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">هوية البرنامج</p>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">
                      اسم البرنامج <span className="text-red-500">*</span>
                    </label>
                    <input
                      value={form.name}
                      onChange={(e) => setField('name', e.target.value)}
                      placeholder="مثال: نقاط VIP"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">
                      كود البرنامج <span className="text-red-500">*</span>
                    </label>
                    <input
                      value={form.code}
                      onChange={(e) => setField('code', e.target.value.toUpperCase().replace(/\s/g, ''))}
                      placeholder="مثال: VIP"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">وصف (اختياري)</label>
                  <input
                    value={form.description}
                    onChange={(e) => setField('description', e.target.value)}
                    placeholder="وصف مختصر للبرنامج..."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-amber-400 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-2">الأيقونة</label>
                    <div className="flex flex-wrap gap-2">
                      {ICONS.map((icon) => (
                        <button
                          type="button"
                          key={icon}
                          onClick={() => setField('icon', icon)}
                          className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-all ${
                            form.icon === icon ? 'ring-2 ring-amber-500 bg-amber-50' : 'bg-gray-50 hover:bg-gray-100'
                          }`}
                        >
                          {icon}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-2">اللون</label>
                    <div className="flex flex-wrap gap-2">
                      {COLORS.map((color) => (
                        <button
                          type="button"
                          key={color}
                          onClick={() => setField('color', color)}
                          className={`w-9 h-9 rounded-xl transition-all ${form.color === color ? 'ring-2 ring-offset-1 ring-gray-500 scale-110' : ''}`}
                          style={{ background: color }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">قواعد النقاط</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">
                      نقطة لكل (KWD) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      min="0.001"
                      value={form.points_per_currency}
                      onChange={(e) => setField('points_per_currency', parseFloat(e.target.value))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-amber-400 focus:outline-none"
                    />
                    <p className="text-[10px] text-gray-400 mt-1">مثال: 1 = نقطة واحدة لكل دينار</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">
                      قيمة النقطة (KWD) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      min="0.001"
                      value={form.point_value}
                      onChange={(e) => setField('point_value', parseFloat(e.target.value))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-amber-400 focus:outline-none"
                    />
                    <p className="text-[10px] text-gray-400 mt-1">مثال: 0.01 = النقطة = فلس واحد</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">الحد الأدنى للاسترداد (نقطة)</label>
                    <input
                      type="number"
                      min="1"
                      value={form.min_redeem_points}
                      onChange={(e) => setField('min_redeem_points', parseInt(e.target.value))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">أقصى خصم بالنقاط %</label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={form.max_redeem_percent}
                      onChange={(e) => setField('max_redeem_percent', parseInt(e.target.value))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 block mb-1">انتهاء الصلاحية (أيام) — 0 = لا تنتهي</label>
                    <input
                      type="number"
                      min="0"
                      value={form.points_expiry_days}
                      onChange={(e) => setField('points_expiry_days', parseInt(e.target.value))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
                  💡 مثال: عميل يشتري بـ 50 KWD → يكسب {(50 * form.points_per_currency).toFixed(0)} نقطة → تساوي{' '}
                  {(50 * form.points_per_currency * form.point_value).toFixed(3)} KWD عند الاسترداد
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">تطبيق البرنامج على</p>
                <div className="grid grid-cols-2 gap-2">
                  {MODULE_CHECKS.map((m) => (
                    <label
                      key={m.key}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 cursor-pointer transition-all ${
                        (form as any)[m.key] ? 'border-amber-400 bg-amber-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={Boolean((form as any)[m.key])}
                        onChange={(e) => setField(m.key as any, e.target.checked)}
                        className="w-4 h-4 accent-amber-500"
                      />
                      <span className="text-sm">{m.icon}</span>
                      <span className="text-sm font-medium text-gray-700">{m.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl border border-gray-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setField('is_active', e.target.checked)}
                  className="w-4 h-4 accent-emerald-500"
                />
                <div>
                  <p className="text-sm font-semibold text-gray-800">تفعيل البرنامج</p>
                  <p className="text-xs text-gray-400">عند التعطيل لن يظهر البرنامج في الفواتير والكاشير</p>
                </div>
              </label>
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                إلغاء
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 bg-gradient-to-l from-amber-500 to-amber-600 text-white rounded-xl text-sm font-bold disabled:opacity-60 shadow-lg"
              >
                {saving ? '⏳ جاري الحفظ...' : editing ? '✓ حفظ التعديلات' : '✓ إنشاء البرنامج'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

