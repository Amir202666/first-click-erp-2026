import { useState, useCallback, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchSettings, updateSettings, uploadCompanyLogo } from '../../api/tenant'
import type { TenantSettings } from '../../types'
import { Building2, Save, ImagePlus, Loader2 } from 'lucide-react'
import Toast, { type ToastType } from '../../components/ui/Toast'
import {
  UI_FONT_SCALE_MIN,
  UI_FONT_SCALE_MAX,
  UI_FONT_SCALE_DEFAULT,
  clampUiFontScale,
} from '../../constants/uiFontScale'
import { applyUiFontScaleIfChanged, cacheUiFontScale } from '../../utils/uiFontScaleStorage'

const KEYS = [
  'company_name',
  'company_phone',
  'company_address',
  'company_logo',
  'commercial_registration',
  'tax_number',
  'notification_email_enabled',
  'notification_sms_enabled',
  'theme',
  'backup_retention_days',
  /** نسبة مئوية؛ 100 = الحجم الافتراضي للمتصفح */
  'ui_font_scale_percent',
] as const

export default function SettingsGeneral() {
  const { currentTenant } = useAuth()
  const { t, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [form, setForm] = useState<Record<string, string | number | boolean>>({})

  const { data: settings, isLoading } = useQuery<TenantSettings>({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })

  const showToast = useCallback((message: string, type: ToastType) => setToast({ message, type }), [])

  const updateMut = useMutation({
    mutationFn: (data: Partial<TenantSettings>) => updateSettings(tenantId, data),
    onSuccess: (_data, variables) => {
      if (tenantId && variables.ui_font_scale_percent != null) {
        const pct = clampUiFontScale(Number(variables.ui_font_scale_percent))
        cacheUiFontScale(tenantId, pct)
        applyUiFontScaleIfChanged(pct)
      }
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      showToast(t.msg?.updatedSuccess ?? 'تم الحفظ بنجاح', 'success')
    },
    onError: (err: any) => showToast(err?.response?.data?.message ?? t.msg?.updateError ?? 'فشل التحديث', 'error'),
  })

  const logoFileRef = useRef<HTMLInputElement>(null)
  const uploadLogoMut = useMutation({
    mutationFn: (file: File) => uploadCompanyLogo(tenantId, file),
    onSuccess: (data) => {
      handleChange('company_logo', data.url)
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      showToast('تم رفع الشعار وتعيينه كافتراضي', 'success')
    },
    onError: (err: any) => showToast(err?.response?.data?.message ?? 'فشل رفع الشعار', 'error'),
  })

  useEffect(() => {
    if (!settings) return
    const next: Record<string, string | number | boolean> = {}
    KEYS.forEach((key) => {
      const val = settings[key]
      if (val === undefined || val === null) {
        if (key === 'theme') next[key] = 'system'
        else if (key === 'backup_retention_days') next[key] = 30
        else if (key === 'ui_font_scale_percent') next[key] = UI_FONT_SCALE_DEFAULT
        else if (typeof val === 'boolean') next[key] = false
        else next[key] = ''
      } else {
        next[key] = val as string | number | boolean
      }
    })
    setForm(next)
    if (tenantId) {
      const scale = next.ui_font_scale_percent
      if (scale != null && scale !== '') {
        cacheUiFontScale(tenantId, clampUiFontScale(Number(scale)))
      }
    }
  }, [settings, tenantId])

  const handleChange = (key: string, value: string | number | boolean) => {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!tenantId) {
      showToast('يجب اختيار الشركة أولاً', 'error')
      return
    }
    const payload: Partial<TenantSettings> = {}
    KEYS.forEach((key) => {
      const v = form[key]
      if (v !== undefined) {
        if (key === 'ui_font_scale_percent') {
          payload[key] = clampUiFontScale(Number(v))
        } else {
          payload[key] = v as string | number | boolean
        }
      }
    })
    updateMut.mutate(payload)
  }

  const textAlign = isRtl ? 'text-right' : 'text-left'

  return (
    <div className="p-6 space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
          <Building2 size={20} className="text-primary-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">الإعدادات العامة</h1>
        </div>
      </div>

      {!tenantId && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          يرجى اختيار الشركة من أعلى الصفحة قبل تعديل الإعدادات.
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={`block text-sm font-medium text-slate-700 mb-1 ${textAlign}`}>اسم الشركة</label>
                <input
                  type="text"
                  value={String(form.company_name ?? '')}
                  onChange={(e) => handleChange('company_name', e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                />
              </div>
              <div>
                <label className={`block text-sm font-medium text-slate-700 mb-1 ${textAlign}`}>رقم هاتف الشركة</label>
                <input
                  type="text"
                  value={String(form.company_phone ?? '')}
                  onChange={(e) => handleChange('company_phone', e.target.value)}
                  placeholder="مثال: 0112345678"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                />
              </div>
              <div className="sm:col-span-2">
                <label className={`block text-sm font-medium text-slate-700 mb-1 ${textAlign}`}>عنوان الشركة</label>
                <input
                  type="text"
                  value={String(form.company_address ?? '')}
                  onChange={(e) => handleChange('company_address', e.target.value)}
                  placeholder="العنوان الكامل للشركة"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                />
              </div>
              <div>
                <label className={`block text-sm font-medium text-slate-700 mb-1 ${textAlign}`}>السجل التجاري</label>
                <input
                  type="text"
                  value={String(form.commercial_registration ?? '')}
                  onChange={(e) => handleChange('commercial_registration', e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                />
              </div>
              <div>
                <label className={`block text-sm font-medium text-slate-700 mb-1 ${textAlign}`}>الرقم الضريبي</label>
                <input
                  type="text"
                  value={String(form.tax_number ?? '')}
                  onChange={(e) => handleChange('tax_number', e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                />
              </div>
              <div>
                <label className={`block text-sm font-medium text-slate-700 mb-1 ${textAlign}`}>المظهر</label>
                <select
                  value={String(form.theme ?? 'system')}
                  onChange={(e) => handleChange('theme', e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                >
                  <option value="light">فاتح</option>
                  <option value="dark">داكن</option>
                  <option value="system">حسب النظام</option>
                </select>
              </div>
              <div>
                <label className={`block text-sm font-medium text-slate-700 mb-1 ${textAlign}`}>الاحتفاظ بنسخ احتياطية (يوم)</label>
                <input
                  type="number"
                  min={1}
                  value={Number(form.backup_retention_days ?? 30)}
                  onChange={(e) => handleChange('backup_retention_days', Number(e.target.value) || 30)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                />
              </div>
              <div>
                <label className={`block text-sm font-medium text-slate-700 mb-1 ${textAlign}`}>
                  مقياس حجم خط الواجهة (%)
                </label>
                <input
                  type="number"
                  min={UI_FONT_SCALE_MIN}
                  max={UI_FONT_SCALE_MAX}
                  step={1}
                  value={Number(form.ui_font_scale_percent ?? UI_FONT_SCALE_DEFAULT)}
                  onChange={(e) => {
                    const n = e.target.valueAsNumber
                    if (!Number.isNaN(n)) handleChange('ui_font_scale_percent', n)
                  }}
                  onBlur={() =>
                    handleChange(
                      'ui_font_scale_percent',
                      clampUiFontScale(Number(form.ui_font_scale_percent ?? UI_FONT_SCALE_DEFAULT)),
                    )
                  }
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-6 pt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!form.notification_email_enabled}
                  onChange={(e) => handleChange('notification_email_enabled', e.target.checked)}
                  className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-slate-700">تفعيل إشعارات البريد الإلكتروني</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!form.notification_sms_enabled}
                  onChange={(e) => handleChange('notification_sms_enabled', e.target.checked)}
                  className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-slate-700">تفعيل إشعارات SMS</span>
              </label>
            </div>

            <div className="mt-6 border-t border-slate-100 pt-4">
              <label className={`block text-sm font-medium text-slate-700 mb-2 ${textAlign}`}>شعار الشركة (افتراضي)</label>
              <div className="flex flex-wrap items-start gap-4">
                <div className="flex flex-col items-center gap-2">
                  {form.company_logo ? (
                    <img
                      src={String(form.company_logo)}
                      alt="شعار الشركة"
                      className="h-20 w-20 object-contain rounded-lg border border-slate-200 bg-slate-50"
                    />
                  ) : (
                    <div className="h-20 w-20 rounded-lg border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-slate-400 text-xs">
                      لا يوجد شعار
                    </div>
                  )}
                  <input
                    ref={logoFileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        uploadLogoMut.mutate(file)
                        e.target.value = ''
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => logoFileRef.current?.click()}
                    disabled={uploadLogoMut.isPending}
                    className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 border border-primary-200 rounded-lg px-3 py-2 bg-primary-50/50"
                  >
                    {uploadLogoMut.isPending ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
                    {uploadLogoMut.isPending ? 'جاري الرفع...' : 'رفع شعار وتعيينه كافتراضي'}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="p-4 border-t border-slate-200 flex justify-end">
            <button type="submit" disabled={updateMut.isPending} className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50">
              <Save size={18} /> حفظ
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
