import { Link } from 'react-router-dom'
import { useLanguage } from '../contexts/LanguageContext'
import Sidebar, { userManagementSidebarEntries } from '../components/Sidebar'
import { LayoutDashboard } from 'lucide-react'

/**
 * صفحة تجريبية لعرض الشريط الجانبي الاحترافي.
 * للوصول: /sidebar-demo
 * الروابط في الشريط تؤدي لصفحات التطبيق الفعلية.
 */
export default function SidebarDemoPage() {
  const { isRtl } = useLanguage()

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      <Sidebar entries={userManagementSidebarEntries} isRtl={isRtl} />
      <main className="flex-1 overflow-auto p-8">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary-100 dark:bg-primary-900/30">
              <LayoutDashboard size={28} className="text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-200">
                عرض تجريبي للشريط الجانبي
              </h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
                Sidebar Demo — Modern UI with accordion & animations
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-4">
            <h2 className="font-semibold text-slate-800 dark:text-slate-200">الخصائص المطبقة</h2>
            <ul className="list-disc list-inside text-slate-600 dark:text-slate-400 space-y-2 text-sm">
              <li>تصميم عصري مع أيقونات ومسافات مريحة وتأثيرات hover</li>
              <li>أكورديون: فتح قائمة يغلق الأخرى تلقائياً</li>
              <li>انتقال سلس (slide down/up) عند فتح وإغلاق القوائم</li>
              <li>تمييز العنصر النشط بلون وشريط جانبي</li>
              <li>سهم بجانب القوائم المنسدلة يدور عند الفتح والإغلاق</li>
            </ul>
            <p className="text-slate-500 dark:text-slate-400 text-sm pt-2">
              استخدم القائمة على اليسار للتنقل. الروابط تؤدي إلى صفحات التطبيق (لوحة التحكم، المستخدمين، الصلاحيات، التقارير).
            </p>
            <Link
              to="/"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-medium hover:bg-primary-500 transition-colors"
            >
              <LayoutDashboard size={18} />
              العودة للوحة التحكم الرئيسية
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
