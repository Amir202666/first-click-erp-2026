import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import SearchableSelect from '../../ui/SearchableSelect'
import { fetchAccounts } from '../../../api/tenant'
import type { ImportSettings } from '../../../types/customerImport'

interface StepSelectAccountProps {
  lang: 'ar' | 'en'
  tenantId: number
  settings: ImportSettings
  onChange: (settings: ImportSettings) => void
}

export default function StepSelectAccount({ lang, tenantId, settings, onChange }: StepSelectAccountProps) {
  const isAr = lang === 'ar'

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts', tenantId, 'import-parent'],
    queryFn: () => fetchAccounts(tenantId, { active_only: '1' }),
    enabled: tenantId > 0,
  })

  const parentOptions = useMemo(() => {
    return [...accounts]
      .sort((a, b) => {
        const na = Number.parseInt(a.code, 10)
        const nb = Number.parseInt(b.code, 10)
        if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb
        return a.code.localeCompare(b.code, undefined, { numeric: true })
      })
      .map((a) => ({
        value: a.id,
        label: `${a.code} — ${isAr ? a.name : (a.name_en || a.name)}`,
        searchText: `${a.code} ${a.name} ${a.name_en ?? ''}`,
      }))
  }, [accounts, isAr])

  const selectedLabel = parentOptions.find((o) => o.value === settings.parentAccountId)?.label ?? settings.parentAccountName

  return (
    <div className="space-y-5">
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">
          {isAr ? 'الحساب الأب في دليل الحسابات' : 'Parent account in chart of accounts'}
          <span className="text-danger-600"> *</span>
        </label>
        <SearchableSelect
          options={parentOptions}
          value={settings.parentAccountId || null}
          onChange={(v) => {
            const id = typeof v === 'number' ? v : Number(v)
            const opt = parentOptions.find((o) => o.value === id)
            onChange({
              ...settings,
              parentAccountId: id,
              parentAccountName: opt?.label ?? '',
            })
          }}
          placeholder={isAr ? 'ابحث برقم أو اسم الحساب...' : 'Search account code or name...'}
        />
        {selectedLabel ? (
          <p className="mt-2 text-xs text-slate-500">
            {isAr
              ? `سيُنشأ تحت «${selectedLabel}» حساب فرعي لكل عميل جديد`
              : `A sub-account will be created under «${selectedLabel}» for each new customer`}
          </p>
        ) : null}
      </div>

      <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={settings.importOpeningBalance}
            onChange={(e) => onChange({ ...settings, importOpeningBalance: e.target.checked })}
          />
          {isAr ? 'استيراد الرصيد الافتتاحي' : 'Import opening balances'}
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={settings.updateExisting}
            onChange={(e) => onChange({
              ...settings,
              updateExisting: e.target.checked,
              skipDuplicates: e.target.checked ? false : settings.skipDuplicates,
            })}
          />
          {isAr ? 'تحديث العملاء الموجودين (بنفس الاسم)' : 'Update existing customers (same name)'}
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={settings.skipDuplicates}
            disabled={settings.updateExisting}
            onChange={(e) => onChange({ ...settings, skipDuplicates: e.target.checked })}
          />
          {isAr ? 'تخطي المكررين' : 'Skip duplicates'}
        </label>
      </div>
    </div>
  )
}
