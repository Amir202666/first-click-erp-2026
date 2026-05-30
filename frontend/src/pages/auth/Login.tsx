import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { Globe } from 'lucide-react'

const BRAND_TAGLINE =
  (lang: string) =>
    lang === 'ar'
      ? 'برنامج محاسبي | ذكاء محلي | انتشار عالمي'
      : 'ACCOUNTING SOFTWARE | LOCAL INTELLIGENCE | GLOBAL REACH'

export default function Login() {
  const [company, setCompany] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const { t, lang, toggleLang, isRtl } = useLanguage()
  const navigate = useNavigate()

  useEffect(() => {
    document.title = `${t.login} | FIRST CLICK ERP`
    return () => {
      document.title = 'FIRST CLICK ERP'
    }
  }, [t.login])

  /** لون الخلفية على html وbody و#root حتى لا يظهر شريط بلون قديم أو يغطي #root اللون */
  useEffect(() => {
    const html = document.documentElement
    const root = document.getElementById('root')
    const prevHtml = html.style.backgroundColor
    const prevBody = document.body.style.backgroundColor
    const prevRoot = root?.style.backgroundColor ?? ''
    const canvas = 'var(--color-login-canvas)'
    html.style.backgroundColor = canvas
    document.body.style.backgroundColor = canvas
    if (root) root.style.backgroundColor = canvas
    return () => {
      html.style.backgroundColor = prevHtml
      document.body.style.backgroundColor = prevBody
      if (root) root.style.backgroundColor = prevRoot
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(company, username, password)
      navigate('/')
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: { status?: number; data?: { message?: string; errors?: Record<string, string[]> } }
        message?: string
      }
      const res = axiosErr.response?.data
      const status = axiosErr.response?.status
      let msg =
        res?.errors?.company?.[0] ??
        res?.errors?.username?.[0] ??
        res?.message ??
        t.loginFailed
      if (status === 429) {
        msg = lang === 'ar'
          ? 'محاولات كثيرة — انتظر دقيقة ثم حاول مرة أخرى'
          : 'Too many attempts — wait a minute and try again'
      } else if (status && status >= 500) {
        msg = lang === 'ar'
          ? 'خطأ في الخادم — تأكد أن MySQL شغّال (XAMPP) ثم نفّذ: cd backend && php artisan config:clear && php artisan local:setup'
          : 'Server error — ensure MySQL is running (XAMPP), then: php artisan config:clear && php artisan local:setup'
      } else if (!axiosErr.response) {
        msg = lang === 'ar'
          ? 'فشل الاتصال بالخادم — تأكد أن الموقع يعمل'
          : 'Cannot reach server — check site is online'
      }
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const tagline = BRAND_TAGLINE(lang)

  const pageBg = 'login-page-bg'

  return (
    <div
      className={`grid min-h-dvh grid-cols-1 ${pageBg} lg:h-dvh lg:max-h-dvh lg:min-h-0 lg:grid-cols-2 lg:overflow-hidden`}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* ثابت أعلى يمين الشاشة (يمين بصري) — لا يتبع عمود النموذج في RTL */}
      <button
        type="button"
        onClick={toggleLang}
        className="fixed right-4 top-4 z-50 flex items-center gap-2 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-sm text-slate-700 shadow-sm backdrop-blur-sm transition-colors hover:bg-slate-50 sm:right-6 sm:top-5"
      >
        <Globe size={18} />
        <span>{lang === 'ar' ? 'English' : 'عربي'}</span>
      </button>

      {/* نصف الدخول — يُعرض أولاً في RTL فيصبح يمين الشاشة؛ في LTR يسار ثم الهوية يمين */}
      <main className={`relative flex min-h-[56vh] flex-col items-center justify-center ${pageBg} px-4 pb-12 pt-20 sm:px-8 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:py-12 lg:pt-16`}>
        <div
          className="pointer-events-none absolute bottom-10 end-10 text-slate-300"
          aria-hidden
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 1l1.8 6.2L20 9l-5.2 3.4L17 19l-5-3.1L7 19l2.2-6.6L4 9l6.2-1.8L12 1z" />
          </svg>
        </div>

        <div className="relative z-10 w-full max-w-md">
          <div className="rounded-3xl border border-slate-200/90 bg-white p-8 shadow-md shadow-slate-200/60 md:p-10">
            <div className="mb-8 text-center">
              <h1 className="text-lg font-semibold text-slate-900 md:text-xl">{t.integratedAccountingSystem}</h1>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
              )}
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">{t.loginCompanyName}</label>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none transition-shadow focus:border-cyan-500 focus:ring-2 focus:ring-inset focus:ring-cyan-500/25"
                  placeholder={lang === 'ar' ? 'أدخل معرف الشركة المختصر' : 'Company ID (e.g. first-company)'}
                  required
                  autoComplete="organization"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">{t.loginUsername}</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none transition-shadow focus:border-cyan-500 focus:ring-2 focus:ring-inset focus:ring-cyan-500/25"
                  placeholder={lang === 'ar' ? 'البريد الإلكتروني' : 'Email'}
                  required
                  autoComplete="username"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">{t.password}</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none transition-shadow focus:border-cyan-500 focus:ring-2 focus:ring-inset focus:ring-cyan-500/25"
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="mt-2 w-full rounded-xl bg-cyan-500 py-3.5 text-sm font-semibold text-white shadow-lg shadow-cyan-900/30 transition-colors hover:bg-cyan-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-cyan-300/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? t.loggingIn : t.login}
              </button>
              <p className="pt-1 text-center text-[11px] leading-relaxed text-slate-500">
                {t.loginDemoHint ??
                  'المالك: المعرف = firstclick-erp، المستخدم = firstclick-erp، كلمة المرور = FirstClickERP'}
              </p>
            </form>
          </div>
        </div>
      </main>

      {/* نصف الهوية — خلفية مطابقة تماماً بدون طبقة ضوضاء */}
      <aside className={`relative flex min-h-[44vh] flex-col overflow-hidden ${pageBg} px-[4vw] py-10 sm:px-10 lg:h-full lg:min-h-0 lg:py-12`}>
        <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center">
          <div className="aspect-square w-[min(64%,21rem)] max-h-[min(54dvh,23rem)] shrink-0 overflow-hidden rounded-[2rem] bg-white shadow-[0_12px_40px_-8px_rgba(15,23,42,0.12)] ring-1 ring-slate-200/80">
            <img
              src="/brand/first-click-erp-logo.svg"
              alt={lang === 'ar' ? 'FIRST CLICK ERP' : 'FIRST CLICK ERP'}
              className="h-full w-full object-contain object-center p-[7%]"
              decoding="async"
              fetchPriority="high"
            />
          </div>
        </div>
        <p className="relative z-10 shrink-0 px-3 pb-8 pt-2 text-center text-sm font-medium leading-relaxed text-slate-600 md:text-base">
          {tagline}
        </p>
      </aside>
    </div>
  )
}
