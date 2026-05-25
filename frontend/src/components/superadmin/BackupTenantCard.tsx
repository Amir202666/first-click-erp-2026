import SearchableSelect from '../ui/SearchableSelect'
import type { Tenant } from '../../types/superadmin'
import { HardDrive, Loader2 } from 'lucide-react'

interface BackupTenantCardProps {
  tenants: Tenant[]
  selectedId: number | null
  onSelect: (id: number | null) => void
  onBackup: () => void
  busy: boolean
  isAr: boolean
}

export default function BackupTenantCard({
  tenants,
  selectedId,
  onSelect,
  onBackup,
  busy,
  isAr,
}: BackupTenantCardProps) {
  const options = tenants.map((t) => ({
    value: t.id,
    label: t.name,
    secondaryLabel: isAr
      ? `${t.stats.invoices_count} فاتورة · ~${t.stats.db_size_mb} MB`
      : `${t.stats.invoices_count} invoices · ~${t.stats.db_size_mb} MB`,
  }))

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1">
        <SearchableSelect
          label={isAr ? 'نسخة لعميل محدد' : 'Backup for tenant'}
          options={options}
          value={selectedId}
          onChange={(v) => onSelect(v === null ? null : Number(v))}
          placeholder={isAr ? 'بحث عن عميل...' : 'Search tenant...'}
        />
      </div>
      <button
        type="button"
        disabled={!selectedId || busy}
        onClick={onBackup}
        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />}
        {isAr ? 'نسخ' : 'Backup'}
      </button>
    </div>
  )
}
