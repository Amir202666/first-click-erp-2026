import { useNavigate, useLocation } from 'react-router-dom'
import { useLanguage } from '../../contexts/LanguageContext'
import { ChevronDown } from 'lucide-react'

export default function Reports() {
  const { t, isRtl } = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()

  const reports = [
    { title: t.reports.trialBalance, path: '/reports/trial-balance' },
    { title: t.reports.receiptsReport, path: '/reports/receipts' },
    { title: t.reports.paymentsReport, path: '/reports/payments' },
    { title: t.reports.expensesReport, path: '/reports/expenses' },
    { title: t.reports.taxDeclaration ?? 'الإقرار الضريبي', path: '/reports/tax-declaration' },
    { title: t.reports.incomeStatement, path: '/reports/income-statement' },
    { title: t.reports.balanceSheet, path: '/reports/balance-sheet' },
  ]

  const currentPath = location.pathname
  const currentReport = reports.find((r) => r.path === currentPath)
  const selectValue = currentReport?.path ?? ''

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const path = e.target.value
    if (path) navigate(path)
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">{t.reports.title}</h1>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-slate-700" htmlFor="reports-select">
          {t.reports.title}
        </label>
        <div className="relative min-w-[280px]">
          <select
            id="reports-select"
            value={selectValue}
            onChange={handleChange}
            className={`w-full h-10 rounded-lg border border-slate-300 bg-white text-slate-900 text-sm font-medium focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none appearance-none cursor-pointer ${isRtl ? 'pr-4 pl-10' : 'pl-4 pr-10'}`}
          >
            <option value="">— {t.reports.title} —</option>
            {reports.map((r) => (
              <option key={r.path} value={r.path}>
                {r.title}
              </option>
            ))}
          </select>
          <ChevronDown className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none ${isRtl ? 'left-3' : 'right-3'}`} />
        </div>
      </div>

      {!selectValue && (
        <p className="text-sm text-slate-500">{t.reports.selectReportHint}</p>
      )}
    </div>
  )
}
