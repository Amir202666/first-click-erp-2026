import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarClock, Lock } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'
import FiscalYearList from '../../pages/fiscal-years/FiscalYearList'
import FiscalYearClose from '../../pages/FiscalYearClose'

type FiscalView = 'list' | 'wizard'

function viewFromParam(v: string | null): FiscalView {
  return v === 'wizard' ? 'wizard' : 'list'
}

export default function AccountingFiscalCloseTab() {
  const { t } = useLanguage()
  const [searchParams, setSearchParams] = useSearchParams()
  const [view, setView] = useState<FiscalView>(() => viewFromParam(searchParams.get('view')))

  useEffect(() => {
    setView(viewFromParam(searchParams.get('view')))
  }, [searchParams])

  const switchView = (next: FiscalView) => {
    setView(next)
    setSearchParams({ tab: 'fiscal_close', view: next })
  }

  const listLabel = t.nav.fiscalYears
  const wizardLabel = t.nav.fiscalYearCloseWizard

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-1">
        <button
          type="button"
          onClick={() => switchView('list')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            view === 'list'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <CalendarClock size={16} />
          {listLabel}
        </button>
        <button
          type="button"
          onClick={() => switchView('wizard')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            view === 'wizard'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Lock size={16} />
          {wizardLabel}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 md:p-6">
        {view === 'list' ? (
          <FiscalYearList embedded onOpenWizard={() => switchView('wizard')} />
        ) : (
          <FiscalYearClose embedded onBackToList={() => switchView('list')} />
        )}
      </div>
    </div>
  )
}
