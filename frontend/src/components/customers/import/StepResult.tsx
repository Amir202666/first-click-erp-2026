import { useNavigate } from 'react-router-dom'
import { Download } from 'lucide-react'
import { downloadCustomerImportErrorReport } from '../../../api/importCustomers'
import type { ImportResult } from '../../../types/customerImport'

interface StepResultProps {
  lang: 'ar' | 'en'
  result: ImportResult
}

export default function StepResult({ lang, result }: StepResultProps) {
  const isAr = lang === 'ar'
  const navigate = useNavigate()

  return (
    <div className="space-y-6 text-center">
      <div className="text-4xl">✅</div>
      <h2 className="text-lg font-semibold text-slate-900">
        {isAr ? 'اكتمل الاستيراد' : 'Import completed'}
      </h2>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-2xl font-bold text-primary-600">{result.imported}</p>
          <p className="text-xs text-slate-500">{isAr ? 'مستورد' : 'Imported'}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-2xl font-bold text-red-600">{result.errors}</p>
          <p className="text-xs text-slate-500">{isAr ? 'خطأ' : 'Errors'}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-2xl font-bold text-amber-600">{result.skipped}</p>
          <p className="text-xs text-slate-500">{isAr ? 'متخطى' : 'Skipped'}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-2xl font-bold text-slate-700">{result.accounts_opened ?? 0}</p>
          <p className="text-xs text-slate-500">{isAr ? 'حسابات مفتوحة' : 'Accounts opened'}</p>
        </div>
      </div>

      {result.errorRows.length > 0 ? (
        <div className="rounded-lg border border-red-100 bg-red-50 p-4 text-start text-sm text-red-800">
          <p className="mb-2 font-medium">{isAr ? 'الأخطاء:' : 'Errors:'}</p>
          <ul className="list-inside list-disc space-y-1">
            {result.errorRows.slice(0, 10).map((e, i) => (
              <li key={i}>
                {isAr ? `الصف ${e.row}` : `Row ${e.row}`}: {e.name} — {e.reason}
              </li>
            ))}
          </ul>
          {result.errorRows.length > 10 ? (
            <p className="mt-2 text-xs">+{result.errorRows.length - 10} {isAr ? 'أخرى' : 'more'}</p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap justify-center gap-3">
        {result.errorRows.length > 0 ? (
          <button
            type="button"
            onClick={() => downloadCustomerImportErrorReport(result.errorRows)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50"
          >
            <Download className="h-4 w-4" />
            {isAr ? 'تصدير تقرير الأخطاء' : 'Export error report'}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => navigate('/customers')}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-500"
        >
          {isAr ? 'عرض العملاء' : 'View customers'}
        </button>
      </div>
    </div>
  )
}
