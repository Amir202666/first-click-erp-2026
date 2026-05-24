import { Link } from 'react-router-dom'
import { useLanguage } from '../contexts/LanguageContext'
import { Home, AlertCircle, FileText } from 'lucide-react'

/**
 * صفحة 404 للطرق غير المعرّفة.
 * تمنع ظهور صفحة فارغة مع روابط واضحة للعودة (الرئيسية، فواتير المبيعات، فواتير المشتريات).
 */
export default function NotFoundPage() {
  const { t, lang, isRtl } = useLanguage()
  const message = t?.msg?.notFound ?? 'الصفحة المطلوبة غير موجودة.'
  const goHome = t?.msg?.goHome ?? 'العودة للرئيسية'
  const salesInvoices = lang === 'ar' ? 'فواتير المبيعات' : 'Sales Invoices'
  const purchaseInvoices = lang === 'ar' ? 'فواتير المشتريات' : 'Purchase Invoices'

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="flex items-center gap-3 text-slate-500 mb-4">
        <AlertCircle className="w-12 h-12" />
        <span className="text-6xl font-bold text-slate-400">404</span>
      </div>
      <p className="text-lg text-center text-slate-600 mb-8 max-w-md">
        {message}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors font-medium"
        >
          <Home className="w-4 h-4" />
          {goHome}
        </Link>
        <Link
          to="/invoices/sales"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors font-medium"
        >
          <FileText className="w-4 h-4" />
          {salesInvoices}
        </Link>
        <Link
          to="/invoices/purchases"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors font-medium"
        >
          <FileText className="w-4 h-4" />
          {purchaseInvoices}
        </Link>
      </div>
    </div>
  )
}
