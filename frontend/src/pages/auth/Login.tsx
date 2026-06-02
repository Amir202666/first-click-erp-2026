import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { checkBackendHealth } from '../../api/client'
import { fetchLoginPagePublic, type LoginPagePublic } from '../../api/loginPage'
import { useTheme } from '../../contexts/ThemeContext'
import DarkModeToggle from '../../components/DarkModeToggle'
import {
  Eye,
  EyeOff,
  Globe,
  Building2,
  User,
  Lock,
  Phone,
  Mail,
  Check,
  Loader2,
  Copy,
  MessageCircle,
} from 'lucide-react'

const FALLBACK_PAGE = (lang: string): LoginPagePublic => ({
  headline: lang === 'ar' ? 'نظام المحاسبة المتكامل' : 'Integrated Accounting System',
  tagline:
    lang === 'ar'
      ? 'برنامج محاسبي | ذكاء محلي | انتشار عالمي'
      : 'ACCOUNTING SOFTWARE | LOCAL INTELLIGENCE | GLOBAL REACH',
  subtitle: lang === 'ar' ? 'أدخل بيانات حسابك للمتابعة' : 'Enter your account details to continue',
  features:
    lang === 'ar'
      ? ['إدارة مالية متكاملة', 'نقاط بيع متعددة', 'تقارير ذكية فورية']
      : ['Integrated financial management', 'Multi POS', 'Instant smart reports'],
  contact_title: lang === 'ar' ? 'تواصل معنا' : 'Contact us',
  phone: '+966500000000',
  phone_display: '+966 50 000 0000',
  whatsapp: '+966500000000',
  email: 'support@firstclickerp.top',
  website: 'firstclickerp.top',
  show_brand_panel: true,
  show_contact_section: true,
  show_demo_hint: true,
  show_forgot_password_link: true,
  copyright: 'First Click ERP',
  app_version: '1.0.0',
})

const LOGIN_CREDENTIALS = {
  company: 'first-company',
  username: 'firstclick-erp',
  password: 'FirstClickERP',
} as const

const DEMO_LINE = `${LOGIN_CREDENTIALS.company} | ${LOGIN_CREDENTIALS.username} | ${LOGIN_CREDENTIALS.password}`

const inputBase =
  'w-full rounded-xl border bg-white py-3 text-sm text-slate-900 placeholder-slate-400 outline-none transition-all ps-11 pe-4'
const inputFocus = 'focus:border-teal-500 focus:ring-2 focus:ring-inset focus:ring-teal-500/20'
const inputError = 'border-red-400 focus:border-red-500 focus:ring-red-500/20'

export default function Login() {
  const [company, setCompany] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const { login } = useAuth()
  const { t, lang, toggleLang, isRtl } = useLanguage()
  const navigate = useNavigate()
  const { isDark } = useTheme()
  const isAr = lang === 'ar'
  const hasError = !!error

  const { data: pageQuery } = useQuery({
    queryKey: ['login-page', 'public', lang],
    queryFn: () => fetchLoginPagePublic(lang),
    staleTime: 0,
    refetchOnMount: 'always',
  })
  const page = pageQuery?.data ?? FALLBACK_PAGE(lang)
  const showBrandPanel = page.show_brand_panel

  useEffect(() => {
    document.title = `${t.login} | FIRST CLICK ERP`
    return () => {
      document.title = 'FIRST CLICK ERP'
    }
  }, [t.login])

  useEffect(() => {
    const html = document.documentElement
    const root = document.getElementById('root')
    const prevHtml = html.style.backgroundColor
    const prevBody = document.body.style.backgroundColor
    const prevRoot = root?.style.backgroundColor ?? ''
    const bg = isDark ? '#0f172a' : '#f8fafc'
    html.style.backgroundColor = bg
    document.body.style.backgroundColor = bg
    if (root) root.style.backgroundColor = bg
    return () => {
      html.style.backgroundColor = prevHtml
      document.body.style.backgroundColor = prevBody
      if (root) root.style.backgroundColor = prevRoot
    }
  }, [isDark])

  async function retryApiCheck() {
    setError('')
    const ok = await checkBackendHealth()
    if (!ok) {
      setError(
        isAr
          ? 'الخادم لا يستجيب — افتح /api/health في تبويب جديد. إن ظهر {"ok":true} امسح كاش المتصفح ثم أعد التحميل.'
          : 'Server not responding — open /api/health in a new tab. If it shows {"ok":true}, clear cache and reload.'
      )
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await doLogin(company, username, password)
  }

  async function doLogin(companyValue: string, usernameValue: string, passwordValue: string) {
    setError('')
    setLoading(true)
    try {
      await login(companyValue.trim(), usernameValue.trim(), passwordValue.trim())
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
        msg = isAr ? 'محاولات كثيرة — انتظر دقيقة ثم حاول مرة أخرى' : 'Too many attempts — wait a minute'
      } else if (status && status >= 500) {
        msg = isAr
          ? 'خطأ في الخادم — تأكد أن MySQL شغّال ثم php artisan config:clear && php artisan local:setup'
          : 'Server error — ensure MySQL is running, then php artisan config:clear && php artisan local:setup'
      } else if (!axiosErr.response) {
        msg = isAr
          ? 'فشل الاتصال بالخادم — على السيرفر: bash deploy/fix-nginx-socket.sh'
          : 'Cannot reach server — run: bash deploy/fix-nginx-socket.sh on the VPS'
      }
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  async function copyDemoCredentials() {
    try {
      await navigator.clipboard.writeText(DEMO_LINE)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  const waDigits = page.whatsapp.replace(/\D/g, '')

  return (
    <div
      className={`min-h-dvh grid grid-cols-1 ${showBrandPanel ? 'lg:grid-cols-[2fr_3fr] lg:h-dvh lg:max-h-dvh' : ''}`}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div className="fixed top-4 end-4 z-50 flex items-center gap-2">
        <DarkModeToggle />
        <button
          type="button"
          onClick={toggleLang}
          className="flex items-center gap-2 rounded-lg border border-slate-200/80 bg-white/95 px-3 py-2 text-sm text-slate-700 shadow-md backdrop-blur-sm transition-colors hover:bg-white dark:border-slate-600 dark:bg-slate-800/95 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <Globe size={18} />
          <span>{isAr ? 'English' : 'عربي'}</span>
        </button>
      </div>

      {/* نموذج الدخول — 40% (يمين في RTL) */}
      <main className="relative flex min-h-dvh flex-col justify-center bg-slate-50 px-5 py-16 text-slate-900 transition-colors duration-300 dark:bg-slate-900 dark:text-slate-100 sm:px-10 lg:min-h-0 lg:overflow-y-auto lg:px-12 lg:py-10">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 flex flex-col items-center text-center lg:items-start lg:text-start">
            <img
              src="/brand/first-click-erp-logo.svg"
              alt="FIRST CLICK ERP"
              className="mb-4 h-14 w-14 object-contain lg:hidden"
              decoding="async"
            />
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t.login}</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{page.subtitle}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
            {error && (
              <div
                className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 space-y-2"
                role="alert"
              >
                <p>{error}</p>
                <button
                  type="button"
                  onClick={() => void retryApiCheck()}
                  className="text-xs font-semibold text-red-900 underline hover:no-underline"
                >
                  {isAr ? 'إعادة فحص الاتصال' : 'Retry connection check'}
                </button>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">{t.loginCompanyName}</label>
              <div className="relative">
                <Building2
                  className="pointer-events-none absolute top-1/2 -translate-y-1/2 start-3.5 h-[18px] w-[18px] text-teal-600"
                  aria-hidden
                />
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className={`${inputBase} ${hasError ? inputError : 'border-slate-300'} ${inputFocus}`}
                  placeholder="first-company"
                  required
                  autoComplete="off"
                  spellCheck={false}
                  dir="ltr"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">{t.loginUsername}</label>
              <div className="relative">
                <User
                  className="pointer-events-none absolute top-1/2 -translate-y-1/2 start-3.5 h-[18px] w-[18px] text-teal-600"
                  aria-hidden
                />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={`${inputBase} ${hasError ? inputError : 'border-slate-300'} ${inputFocus}`}
                  placeholder="firstclick-erp"
                  required
                  autoComplete="off"
                  spellCheck={false}
                  dir="ltr"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">{t.password}</label>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute top-1/2 -translate-y-1/2 start-3.5 h-[18px] w-[18px] text-teal-600"
                  aria-hidden
                />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputBase} pe-11 ${hasError ? inputError : 'border-slate-300'} ${inputFocus}`}
                  placeholder="FirstClickERP"
                  required
                  autoComplete="new-password"
                  spellCheck={false}
                  dir="ltr"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 end-2 flex items-center rounded-lg px-2 text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-teal-500 py-3.5 text-sm font-bold text-white shadow-lg shadow-teal-900/25 transition-all hover:from-teal-500 hover:to-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  {t.loggingIn}
                </>
              ) : (
                t.login
              )}
            </button>

            {page.show_forgot_password_link && (
              <p className="text-center text-sm">
                <a
                  href={`mailto:${page.email}?subject=${encodeURIComponent(isAr ? 'استعادة كلمة المرور' : 'Password reset')}`}
                  className="font-medium text-teal-700 hover:text-teal-800 hover:underline"
                >
                  {isAr ? 'هل نسيت كلمة المرور؟' : 'Forgot your password?'}
                </a>
              </p>
            )}

            {page.show_demo_hint && (
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-600 dark:bg-slate-800">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-700">
                    {isAr ? 'حساب تجريبي' : 'Demo account'}
                  </p>
                  <button
                    type="button"
                    onClick={() => void copyDemoCredentials()}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
                    title={isAr ? 'نسخ' : 'Copy'}
                  >
                    <Copy className="h-3 w-3" />
                    {copied ? (isAr ? 'تم' : 'OK') : isAr ? 'نسخ' : 'Copy'}
                  </button>
                </div>
                <p className="mt-1 font-mono text-[10px] text-slate-500 break-all" dir="ltr">
                  {DEMO_LINE}
                </p>
                {import.meta.env.DEV && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        void doLogin(
                          LOGIN_CREDENTIALS.company,
                          LOGIN_CREDENTIALS.username,
                          LOGIN_CREDENTIALS.password
                        )
                      }
                      disabled={loading}
                      className="rounded-lg border border-emerald-400 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                    >
                      {isAr ? 'دخول مباشر' : 'Quick login'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setError('')
                        setCompany(LOGIN_CREDENTIALS.company)
                        setUsername(LOGIN_CREDENTIALS.username)
                        setPassword(LOGIN_CREDENTIALS.password)
                        setShowPassword(true)
                      }}
                      className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-[10px] font-medium text-amber-900 hover:bg-amber-100"
                    >
                      {isAr ? 'ملء البيانات' : 'Fill credentials'}
                    </button>
                  </div>
                )}
            </div>
            )}

            <footer className="pt-4 text-center text-[11px] text-slate-400 lg:text-start">
              <p>© {new Date().getFullYear()} {page.copyright}</p>
              <p className="mt-0.5" dir="ltr">
                v{page.app_version}
              </p>
            </footer>
          </form>
        </div>
      </main>

      {showBrandPanel && (
      <aside className="relative hidden min-h-0 flex-col bg-gradient-to-br from-teal-900 via-teal-800 to-slate-900 text-white lg:flex lg:h-full lg:overflow-x-hidden lg:overflow-y-auto">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          aria-hidden
          style={{
            backgroundImage: `radial-gradient(circle at 20% 30%, white 1px, transparent 1px),
              radial-gradient(circle at 80% 70%, white 1px, transparent 1px)`,
            backgroundSize: '48px 48px',
          }}
        />
        <div
          className="pointer-events-none absolute top-12 end-4 h-48 w-48 rounded-full bg-teal-400/20 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute bottom-12 start-4 h-48 w-48 rounded-full bg-cyan-400/15 blur-3xl"
          aria-hidden
        />

        <div className="relative z-10 flex h-full min-h-0 flex-col justify-between px-10 pb-8 pt-14 xl:px-14">
          <section className="flex flex-col items-center text-center">
            <div className="mb-6 rounded-3xl bg-white/95 p-6 shadow-2xl shadow-black/20 ring-1 ring-white/20">
              <img
                src="/brand/first-click-erp-logo.svg"
                alt="FIRST CLICK ERP"
                className="mx-auto h-28 w-28 object-contain sm:h-32 sm:w-32"
                decoding="async"
                fetchPriority="high"
              />
            </div>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{page.headline}</h2>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-teal-100/90">{page.tagline}</p>
            <ul
              className={`mt-10 w-full max-w-md gap-x-4 gap-y-3 px-2 sm:mt-12 sm:gap-x-6 sm:max-w-lg ${
                page.features.length <= 2
                  ? 'flex flex-row flex-wrap justify-center gap-x-6'
                  : page.features.length === 3
                    ? 'grid grid-cols-3'
                    : 'grid grid-cols-4'
              }`}
            >
              {page.features.map((item, idx) => (
                <li key={`${idx}-${item}`} className="flex flex-col items-center gap-1.5 px-0.5 text-white/95">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-500/40 text-teal-100">
                    <Check className="h-4 w-4" strokeWidth={3} />
                  </span>
                  <span className="w-full text-center text-[10px] leading-tight sm:text-xs">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {page.show_contact_section && (
          <div className="shrink-0 border-t border-white/15 pt-6">
            <h3 className="mb-4 text-sm font-bold text-teal-100">{page.contact_title}</h3>
            <ul className="space-y-3 text-sm">
              {page.phone && (
              <li>
                <a
                  href={`tel:${page.phone}`}
                  className="flex items-center gap-3 text-white/90 transition-colors hover:text-white"
                  dir="ltr"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-500/30 text-teal-200">
                    <Phone className="h-4 w-4" />
                  </span>
                  <span>{page.phone_display}</span>
                </a>
              </li>
              )}
              {page.whatsapp && (
              <li>
                <a
                  href={`https://wa.me/${waDigits}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 text-white/90 transition-colors hover:text-white"
                  dir="ltr"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-500/30 text-teal-200">
                    <MessageCircle className="h-4 w-4" />
                  </span>
                  <span>WhatsApp · {page.phone_display}</span>
                </a>
              </li>
              )}
              {page.email && (
              <li>
                <a
                  href={`mailto:${page.email}`}
                  className="flex items-center gap-3 text-white/90 transition-colors hover:text-white"
                  dir="ltr"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-500/30 text-teal-200">
                    <Mail className="h-4 w-4" />
                  </span>
                  <span>{page.email}</span>
                </a>
              </li>
              )}
              {page.website && (
              <li>
                <a
                  href={`https://${page.website.replace(/^https?:\/\//, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 text-white/90 transition-colors hover:text-white"
                  dir="ltr"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-500/30 text-teal-200">
                    <Globe className="h-4 w-4" />
                  </span>
                  <span>{page.website}</span>
                </a>
              </li>
              )}
            </ul>
          </div>
          )}
        </div>
      </aside>
      )}
    </div>
  )
}
