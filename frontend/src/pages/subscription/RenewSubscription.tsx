import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { AlertCircle, LogOut } from 'lucide-react'

export default function RenewSubscription() {
  const { logout, currentTenant } = useAuth()
  const { lang } = useLanguage()
  const isAr = lang === 'ar'

  const title = isAr ? 'انتهى اشتراكك' : 'Subscription Expired'
  const message = isAr
    ? 'انتهى الاشتراك لهذه الشركة. يرجى التواصل مع الإدارة لتجديد الاشتراك ومتابعة استخدام النظام.'
    : 'Subscription has expired for this company. Please contact the administrator to renew and continue using the system.'
  const companyName = currentTenant?.name ?? ''
  const logoutLabel = isAr ? 'تسجيل الخروج' : 'Log out'

  return (
    <div className="min-h-screen bg-[#f9f9f9] flex flex-col items-center justify-center p-4" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="max-w-md w-full bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mb-6">
          <AlertCircle className="w-8 h-8 text-amber-600" />
        </div>
        <h1 className="text-xl font-semibold text-slate-800 mb-2">{title}</h1>
        {companyName && (
          <p className="text-slate-600 text-sm mb-4 font-medium">{companyName}</p>
        )}
        <p className="text-slate-600 text-sm leading-relaxed mb-8">{message}</p>
        <button
          type="button"
          onClick={() => logout()}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-sm font-medium transition-colors"
        >
          <LogOut className="w-4 h-4" />
          {logoutLabel}
        </button>
      </div>
    </div>
  )
}
