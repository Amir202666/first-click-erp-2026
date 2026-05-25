import { useState } from 'react'
import SearchableSelect from '../ui/SearchableSelect'
import type { Tenant } from '../../types/superadmin'
import { AlertTriangle } from 'lucide-react'

interface ResetSectionProps {
  tenants: Tenant[]
  isAr: boolean
  onStartReset: (tenantId: number) => void
}

export default function ResetSection({ tenants, isAr, onStartReset }: ResetSectionProps) {
  const [tenantId, setTenantId] = useState<number | null>(null)
  const options = tenants.map((t) => ({ value: t.id, label: t.name }))

  return (
    <section className="rounded-xl border border-red-200 bg-red-50/30 p-5 dark:border-red-900 dark:bg-red-950/20">
      <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-red-900 dark:text-red-100">
        <AlertTriangle className="h-5 w-5" />
        {isAr ? 'تصفير بيانات عميل' : 'Reset tenant data'}
      </h2>
      <p className="mb-4 text-sm text-red-800 dark:text-red-300">
        {isAr
          ? 'منطقة خطرة — هذه العملية لا يمكن التراجع عنها.'
          : 'Danger zone — this operation cannot be undone.'}
      </p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <SearchableSelect
            options={options}
            value={tenantId}
            onChange={(v) => setTenantId(v === null ? null : Number(v))}
            placeholder={isAr ? 'اختر عميل...' : 'Select tenant...'}
          />
        </div>
        <button
          type="button"
          disabled={!tenantId}
          onClick={() => tenantId && onStartReset(tenantId)}
          className="shrink-0 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {isAr ? 'بدء تصفير بيانات هذا العميل' : 'Start reset wizard'}
        </button>
      </div>
    </section>
  )
}
