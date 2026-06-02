import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchAdminLoginPageSettings,
  updateAdminLoginPageSettings,
  type LoginPageAdminSettings,
} from '../../api/loginPage'
import {
  ShieldAlert,
  LogIn,
  Loader2,
  Check,
  ExternalLink,
  Plus,
  Trash2,
  Phone,
  Mail,
  Globe,
  MessageCircle,
} from 'lucide-react'

const emptyForm = (): LoginPageAdminSettings => ({
  headline_ar: '',
  headline_en: '',
  tagline_ar: '',
  tagline_en: '',
  subtitle_ar: '',
  subtitle_en: '',
  features_ar: ['', '', ''],
  features_en: ['', '', ''],
  contact_title_ar: '',
  contact_title_en: '',
  phone: '',
  phone_display: '',
  whatsapp: '',
  email: '',
  website: '',
  show_brand_panel: true,
  show_contact_section: true,
  show_demo_hint: true,
  show_forgot_password_link: true,
  copyright_ar: '',
  copyright_en: '',
  app_version: '',
})

function normalizeFeatures(arr: string[] | undefined, min = 3): string[] {
  const base = [...(arr ?? [])]
  while (base.length < min) base.push('')
  return base
}

export default function AdminLoginPage() {
  const { isPlatformSuperAdmin: isSuperAdmin } = useAuth()
  const { lang } = useLanguage()
  const isAr = lang === 'ar'
  const queryClient = useQueryClient()
  const [form, setForm] = useState<LoginPageAdminSettings>(emptyForm)
  const [savedMsg, setSavedMsg] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'login-page'],
    queryFn: fetchAdminLoginPageSettings,
    enabled: !!isSuperAdmin,
  })

  useEffect(() => {
    if (data?.data) {
      const d = data.data
      setForm({
        ...d,
        features_ar: normalizeFeatures(d.features_ar),
        features_en: normalizeFeatures(d.features_en),
      })
    }
  }, [data])

  const saveMut = useMutation({
    mutationFn: updateAdminLoginPageSettings,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'login-page'] })
      queryClient.invalidateQueries({ queryKey: ['login-page', 'public'] })
      setForm({
        ...res.data,
        features_ar: normalizeFeatures(res.data.features_ar),
        features_en: normalizeFeatures(res.data.features_en),
      })
      setSavedMsg(isAr ? 'تم الحفظ — حدّث صفحة الدخول لمعاينة التغييرات' : 'Saved — refresh login page to preview')
      setTimeout(() => setSavedMsg(''), 4000)
    },
  })

  const setFeature = (key: 'features_ar' | 'features_en', index: number, value: string) => {
    setForm((f) => {
      const list = [...f[key]]
      list[index] = value
      return { ...f, [key]: list }
    })
  }

  const addFeature = (key: 'features_ar' | 'features_en') => {
    setForm((f) => ({ ...f, [key]: [...f[key], ''] }))
  }

  const removeFeature = (key: 'features_ar' | 'features_en', index: number) => {
    setForm((f) => {
      const list = f[key].filter((_, i) => i !== index)
      return { ...f, [key]: normalizeFeatures(list, 1) }
    })
  }

  const inputClass =
    'w-full h-10 border border-slate-300 rounded-lg px-3 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none'
  const labelClass = 'block text-xs font-medium text-slate-700 mb-1'

  if (!isSuperAdmin) {
    return (
      <div className="p-4 max-w-2xl mx-auto">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 flex items-start gap-3">
          <ShieldAlert className="w-8 h-8 text-amber-600 shrink-0" />
          <div>
            <h2 className="font-semibold text-amber-900">{isAr ? 'غير مصرح' : 'Not authorized'}</h2>
            <p className="text-sm text-amber-800 mt-1">
              {isAr ? 'هذه الصفحة لمالك النظام فقط.' : 'Super administrator only.'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="px-0 py-3 md:py-4 space-y-5 w-full min-w-0 max-w-full" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-100 text-teal-700">
              <LogIn className="w-5 h-5" />
            </span>
            {isAr ? 'صفحة تسجيل الدخول' : 'Login page'}
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-xl">
            {isAr
              ? 'تحكم في النصوص، التواصل، المميزات، وعناصر العرض على شاشة الدخول العامة.'
              : 'Manage texts, contact info, features, and visibility on the public login screen.'}
          </p>
        </div>
        <a
          href="/login"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 shadow-sm"
        >
          <ExternalLink className="w-4 h-4" />
          {isAr ? 'معاينة الصفحة' : 'Preview page'}
        </a>
      </div>

      {savedMsg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{savedMsg}</div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-9 h-9 animate-spin text-teal-600" />
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const payload = {
              ...form,
              features_ar: form.features_ar.map((s) => s.trim()).filter(Boolean),
              features_en: form.features_en.map((s) => s.trim()).filter(Boolean),
            }
            saveMut.mutate(payload)
          }}
          className="space-y-5"
        >
          <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
            <h2 className="text-sm font-bold text-slate-800 mb-4">{isAr ? 'العناوين والنصوص' : 'Headlines & copy'}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>{isAr ? 'العنوان الرئيسي (عربي)' : 'Headline (Arabic)'}</label>
                <input className={inputClass} value={form.headline_ar} onChange={(e) => setForm((f) => ({ ...f, headline_ar: e.target.value }))} />
              </div>
              <div>
                <label className={labelClass}>{isAr ? 'العنوان الرئيسي (إنجليزي)' : 'Headline (English)'}</label>
                <input className={inputClass} value={form.headline_en} onChange={(e) => setForm((f) => ({ ...f, headline_en: e.target.value }))} dir="ltr" />
              </div>
              <div>
                <label className={labelClass}>{isAr ? 'الشعار الفرعي (عربي)' : 'Tagline (Arabic)'}</label>
                <input className={inputClass} value={form.tagline_ar} onChange={(e) => setForm((f) => ({ ...f, tagline_ar: e.target.value }))} />
              </div>
              <div>
                <label className={labelClass}>{isAr ? 'الشعار الفرعي (إنجليزي)' : 'Tagline (English)'}</label>
                <input className={inputClass} value={form.tagline_en} onChange={(e) => setForm((f) => ({ ...f, tagline_en: e.target.value }))} dir="ltr" />
              </div>
              <div>
                <label className={labelClass}>{isAr ? 'وصف النموذج (عربي)' : 'Form subtitle (Arabic)'}</label>
                <input className={inputClass} value={form.subtitle_ar} onChange={(e) => setForm((f) => ({ ...f, subtitle_ar: e.target.value }))} />
              </div>
              <div>
                <label className={labelClass}>{isAr ? 'وصف النموذج (إنجليزي)' : 'Form subtitle (English)'}</label>
                <input className={inputClass} value={form.subtitle_en} onChange={(e) => setForm((f) => ({ ...f, subtitle_en: e.target.value }))} dir="ltr" />
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
            <h2 className="text-sm font-bold text-slate-800 mb-4">{isAr ? 'المميزات (لوحة العلامة)' : 'Features (brand panel)'}</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {(['features_ar', 'features_en'] as const).map((key) => (
                <div key={key}>
                  <p className="text-xs font-semibold text-slate-600 mb-2">
                    {key === 'features_ar' ? (isAr ? 'عربي' : 'Arabic') : isAr ? 'إنجليزي' : 'English'}
                  </p>
                  <div className="space-y-2">
                    {form[key].map((feat, idx) => (
                      <div key={idx} className="flex gap-2">
                        <input
                          className={inputClass}
                          value={feat}
                          onChange={(e) => setFeature(key, idx, e.target.value)}
                          dir={key === 'features_en' ? 'ltr' : undefined}
                        />
                        {form[key].length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeFeature(key, idx)}
                            className="shrink-0 p-2 text-red-500 hover:bg-red-50 rounded-lg"
                            title={isAr ? 'حذف' : 'Remove'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                    {form[key].length < 8 && (
                      <button
                        type="button"
                        onClick={() => addFeature(key)}
                        className="text-xs font-medium text-teal-700 hover:text-teal-800 flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        {isAr ? 'إضافة سطر' : 'Add line'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
            <h2 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Phone className="w-4 h-4 text-teal-600" />
              {isAr ? 'بيانات التواصل' : 'Contact information'}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>{isAr ? 'عنوان قسم التواصل (عربي)' : 'Contact section title (AR)'}</label>
                <input className={inputClass} value={form.contact_title_ar} onChange={(e) => setForm((f) => ({ ...f, contact_title_ar: e.target.value }))} />
              </div>
              <div>
                <label className={labelClass}>{isAr ? 'عنوان قسم التواصل (إنجليزي)' : 'Contact section title (EN)'}</label>
                <input className={inputClass} value={form.contact_title_en} onChange={(e) => setForm((f) => ({ ...f, contact_title_en: e.target.value }))} dir="ltr" />
              </div>
              <div>
                <label className={labelClass}>{isAr ? 'الهاتف (للربط tel:)' : 'Phone (tel: link)'}</label>
                <input className={inputClass} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} dir="ltr" />
              </div>
              <div>
                <label className={labelClass}>{isAr ? 'عرض الهاتف' : 'Phone display'}</label>
                <input className={inputClass} value={form.phone_display} onChange={(e) => setForm((f) => ({ ...f, phone_display: e.target.value }))} dir="ltr" />
              </div>
              <div>
                <label className={labelClass}>WhatsApp</label>
                <input className={inputClass} value={form.whatsapp} onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))} dir="ltr" />
              </div>
              <div>
                <label className={labelClass}>{isAr ? 'البريد الإلكتروني' : 'Email'}</label>
                <input className={inputClass} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} dir="ltr" />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>{isAr ? 'الموقع' : 'Website'}</label>
                <input className={inputClass} value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} dir="ltr" placeholder="firstclickerp.top" />
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
            <h2 className="text-sm font-bold text-slate-800 mb-4">{isAr ? 'خيارات العرض' : 'Display options'}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { key: 'show_brand_panel' as const, ar: 'إظهار اللوحة الجانبية (العلامة والمميزات)', en: 'Show brand panel' },
                { key: 'show_contact_section' as const, ar: 'إظهار قسم التواصل', en: 'Show contact section' },
                { key: 'show_demo_hint' as const, ar: 'إظهار تلميح الحساب التجريبي', en: 'Show demo account hint' },
                { key: 'show_forgot_password_link' as const, ar: 'رابط نسيت كلمة المرور', en: 'Forgot password link' },
              ].map((opt) => (
                <label key={opt.key} className="flex items-center gap-2 cursor-pointer rounded-lg border border-slate-100 p-3 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={form[opt.key]}
                    onChange={(e) => setForm((f) => ({ ...f, [opt.key]: e.target.checked }))}
                    className="rounded border-slate-300 text-teal-600"
                  />
                  <span className="text-sm text-slate-700">{isAr ? opt.ar : opt.en}</span>
                </label>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div>
                <label className={labelClass}>{isAr ? 'حقوق النشر (عربي)' : 'Copyright (AR)'}</label>
                <input className={inputClass} value={form.copyright_ar} onChange={(e) => setForm((f) => ({ ...f, copyright_ar: e.target.value }))} />
              </div>
              <div>
                <label className={labelClass}>{isAr ? 'حقوق النشر (إنجليزي)' : 'Copyright (EN)'}</label>
                <input className={inputClass} value={form.copyright_en} onChange={(e) => setForm((f) => ({ ...f, copyright_en: e.target.value }))} dir="ltr" />
              </div>
              <div>
                <label className={labelClass}>{isAr ? 'رقم الإصدار' : 'App version'}</label>
                <input className={inputClass} value={form.app_version} onChange={(e) => setForm((f) => ({ ...f, app_version: e.target.value }))} dir="ltr" />
              </div>
            </div>
          </section>

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="submit"
              disabled={saveMut.isPending}
              className="inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-500 disabled:opacity-50"
            >
              {saveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {isAr ? 'حفظ الإعدادات' : 'Save settings'}
            </button>
          </div>
        </form>
      )}

      {/* معاينة مصغرة */}
      {!isLoading && (
        <section className="rounded-xl border border-dashed border-teal-300 bg-teal-50/40 p-4">
          <h3 className="text-xs font-bold text-teal-800 mb-3">{isAr ? 'معاينة سريعة (عربي)' : 'Quick preview (Arabic)'}</h3>
          <div className="grid lg:grid-cols-2 gap-4 text-sm">
            <div className="rounded-lg bg-gradient-to-br from-teal-900 to-slate-900 p-4 text-white">
              <p className="font-bold">{form.headline_ar}</p>
              <p className="text-xs text-teal-100/90 mt-1">{form.tagline_ar}</p>
              <ul className="mt-3 flex flex-row flex-wrap gap-x-3 gap-y-1 text-xs">
                {form.features_ar.filter(Boolean).map((f) => (
                  <li key={f} className="whitespace-nowrap">
                    ✓ {f}
                  </li>
                ))}
              </ul>
              {form.show_contact_section && (
                <div className="mt-4 pt-3 border-t border-white/20 text-xs space-y-1">
                  <p className="font-semibold">{form.contact_title_ar}</p>
                  <p className="flex items-center gap-1"><Phone className="w-3 h-3" /> {form.phone_display}</p>
                  <p className="flex items-center gap-1"><MessageCircle className="w-3 h-3" /> WhatsApp</p>
                  <p className="flex items-center gap-1"><Mail className="w-3 h-3" /> {form.email}</p>
                  <p className="flex items-center gap-1"><Globe className="w-3 h-3" /> {form.website}</p>
                </div>
              )}
            </div>
            <div className="rounded-lg bg-white border border-slate-200 p-4">
              <p className="font-bold text-slate-900">{isAr ? 'تسجيل الدخول' : 'Login'}</p>
              <p className="text-xs text-slate-500">{form.subtitle_ar}</p>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
