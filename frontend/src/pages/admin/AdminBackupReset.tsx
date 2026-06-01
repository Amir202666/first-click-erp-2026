import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { superadminApi } from '../../api/superadmin'
import { SuperAdminDenied } from '../../components/superadmin/SuperAdminGuard'
import BackupSection from '../../components/superadmin/BackupSection'
import ResetSection from '../../components/superadmin/ResetSection'
import ResetWizard from '../../components/superadmin/ResetWizard'
import { RESET_MODULE_LABELS, type ResetJob } from '../../types/superadmin'
import { formatDisplayDate } from '../../utils/date'
import { formatTimeAgo } from '../../utils/timeAgo'
import { Loader2, Shield } from 'lucide-react'

function moduleSummary(modules: string[], isAr: boolean): string {
  if (modules.includes('all')) return isAr ? 'كل شيء' : 'All'
  return modules
    .map((m) => {
      const key = m as keyof typeof RESET_MODULE_LABELS
      if (RESET_MODULE_LABELS[key]) return isAr ? RESET_MODULE_LABELS[key].ar.split(' ')[0] : key
      return m
    })
    .join('+')
}

export default function AdminBackupReset() {
  const { isPlatformSuperAdmin: isSuperAdmin } = useAuth()
  const { lang } = useLanguage()
  const isAr = lang === 'ar'
  const queryClient = useQueryClient()

  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardTenantId, setWizardTenantId] = useState<number | null>(null)

  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ['admin', 'tenants'],
    queryFn: () => superadminApi.getTenants(),
    enabled: !!isSuperAdmin,
  })

  const { data: resetLog = [] } = useQuery({
    queryKey: ['reset-log'],
    queryFn: () => superadminApi.getResetLog(),
    enabled: !!isSuperAdmin,
  })

  if (!isSuperAdmin) return <SuperAdminDenied />

  const totalDeleted = (job: ResetJob) =>
    Object.values(job.deleted_counts ?? {}).reduce((a, b) => a + (b ?? 0), 0)

  return (
    <div className="min-w-0 max-w-full space-y-6 p-6">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 pb-4 dark:border-slate-700">
        <Shield className="h-8 w-8 text-indigo-600" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {isAr ? 'لوحة الإدارة العليا' : 'Super admin panel'}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {isAr ? 'النسخ الاحتياطي وإدارة البيانات' : 'Backups & tenant data management'}
          </p>
        </div>
        <span className="ms-auto rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200">
          Super Admin
        </span>
      </header>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : (
        <>
          <BackupSection tenants={tenants} isAr={isAr} />
          <ResetSection
            tenants={tenants}
            isAr={isAr}
            onStartReset={(id) => {
              setWizardTenantId(id)
              setWizardOpen(true)
            }}
          />
        </>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h2 className="mb-4 text-lg font-semibold">
          {isAr ? 'سجل عمليات التصفير' : 'Reset history'}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b text-start text-slate-500">
                <th className="px-2 py-2">{isAr ? 'التاريخ' : 'Date'}</th>
                <th className="px-2 py-2">{isAr ? 'العميل' : 'Tenant'}</th>
                <th className="px-2 py-2">{isAr ? 'الوحدات' : 'Modules'}</th>
                <th className="px-2 py-2">{isAr ? 'المحذوف' : 'Deleted'}</th>
                <th className="px-2 py-2">{isAr ? 'منفّذ' : 'By'}</th>
              </tr>
            </thead>
            <tbody>
              {resetLog.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-500">
                    {isAr ? 'لا توجد عمليات بعد.' : 'No resets yet.'}
                  </td>
                </tr>
              ) : (
                resetLog.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-2 py-2">
                      {formatDisplayDate(row.completed_at ?? row.started_at)}
                      <span className="block text-xs text-slate-400">
                        {formatTimeAgo(row.completed_at ?? row.started_at, isAr)}
                      </span>
                    </td>
                    <td className="px-2 py-2 font-medium">{row.tenant_name}</td>
                    <td className="px-2 py-2">{moduleSummary(row.modules ?? [], isAr)}</td>
                    <td className="px-2 py-2 font-mono">
                      {totalDeleted(row).toLocaleString(isAr ? 'ar-EG' : 'en-US')}
                    </td>
                    <td className="px-2 py-2">{row.confirmed_by}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ResetWizard
        open={wizardOpen}
        tenants={tenants}
        initialTenantId={wizardTenantId}
        isAr={isAr}
        onClose={() => setWizardOpen(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['reset-log'] })
        }}
      />
    </div>
  )
}
