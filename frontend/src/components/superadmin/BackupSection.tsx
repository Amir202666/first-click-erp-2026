import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { superadminApi } from '../../api/superadmin'
import type { BackupJob, Tenant } from '../../types/superadmin'
import BackupTenantCard from './BackupTenantCard'
import { formatTimeAgo } from '../../utils/timeAgo'
import { Database, Download, Loader2, Trash2 } from 'lucide-react'

interface BackupSectionProps {
  tenants: Tenant[]
  isAr: boolean
}

function pollBackup(
  jobId: string,
  onUpdate: (job: BackupJob) => void,
  onDone: () => void,
): () => void {
  const interval = setInterval(async () => {
    try {
      const job = await superadminApi.getBackupStatus(jobId)
      onUpdate(job)
      if (job.status === 'completed' || job.status === 'failed') {
        clearInterval(interval)
        onDone()
      }
    } catch {
      clearInterval(interval)
    }
  }, 3000)
  return () => clearInterval(interval)
}

export default function BackupSection({ tenants, isAr }: BackupSectionProps) {
  const queryClient = useQueryClient()
  const [currentJob, setCurrentJob] = useState<BackupJob | null>(null)
  const [tenantId, setTenantId] = useState<number | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  const { data: backups = [], isLoading: listLoading } = useQuery({
    queryKey: ['backups'],
    queryFn: () => superadminApi.listBackups(),
  })

  useEffect(() => () => cleanupRef.current?.(), [])

  const startPolling = (jobId: string) => {
    cleanupRef.current?.()
    cleanupRef.current = pollBackup(
      jobId,
      (job) => setCurrentJob(job),
      () => {
        queryClient.invalidateQueries({ queryKey: ['backups'] })
      },
    )
  }

  const fullMutation = useMutation({
    mutationFn: () => superadminApi.backupFull(),
    onSuccess: (job) => {
      setCurrentJob(job)
      startPolling(job.id)
    },
  })

  const tenantMutation = useMutation({
    mutationFn: () => superadminApi.backupTenant(tenantId!),
    onSuccess: (job) => {
      setCurrentJob(job)
      startPolling(job.id)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (jobId: string) => superadminApi.deleteBackup(jobId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['backups'] }),
  })

  const busy =
    fullMutation.isPending ||
    tenantMutation.isPending ||
    currentJob?.status === 'pending' ||
    currentJob?.status === 'running'

  const scopeLabel = (job: BackupJob) => {
    if (job.scope === 'full') return isAr ? 'كاملة' : 'Full DB'
    return isAr ? `عميل: ${job.tenant_name ?? '—'}` : `Tenant: ${job.tenant_name ?? '—'}`
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-800 dark:text-slate-100">
        <Database className="h-5 w-5" />
        {isAr ? 'النسخ الاحتياطي' : 'Backups'}
      </h2>

      <div className="space-y-4">
        <button
          type="button"
          disabled={busy}
          onClick={() => fullMutation.mutate()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 sm:w-auto"
        >
          {fullMutation.isPending || (currentJob?.scope === 'full' && busy) ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Database className="h-4 w-4" />
          )}
          {isAr ? 'نسخة كاملة لكل قاعدة البيانات' : 'Full database backup'}
        </button>

        {currentJob && (currentJob.status === 'running' || currentJob.status === 'pending') && (
          <p className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            {isAr ? 'جاري إنشاء النسخة...' : 'Backup in progress...'}
          </p>
        )}

        {currentJob?.status === 'failed' && (
          <p className="text-sm text-red-600">{currentJob.error ?? (isAr ? 'فشل النسخ' : 'Backup failed')}</p>
        )}

        {currentJob?.status === 'completed' && (
          <button
            type="button"
            onClick={() =>
              superadminApi.downloadBackup(currentJob.id, currentJob.file_name).catch(() => undefined)
            }
            className="inline-flex items-center gap-2 text-sm text-emerald-700 hover:underline"
          >
            <Download className="h-4 w-4" />
            {isAr ? 'تحميل النسخة الجديدة' : 'Download latest backup'}
          </button>
        )}

        <BackupTenantCard
          tenants={tenants}
          selectedId={tenantId}
          onSelect={setTenantId}
          onBackup={() => tenantMutation.mutate()}
          busy={tenantMutation.isPending || busy}
          isAr={isAr}
        />

        <div>
          <h3 className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-400">
            {isAr ? 'النسخ السابقة' : 'Previous backups'}
          </h3>
          {listLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          ) : backups.length === 0 ? (
            <p className="text-sm text-slate-500">{isAr ? 'لا توجد نسخ محفوظة.' : 'No backups yet.'}</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100 dark:divide-slate-800 dark:border-slate-800">
              {backups.map((job) => (
                <li
                  key={job.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-slate-800 dark:text-slate-200">
                      📁 {job.file_name ?? job.id}
                    </div>
                    <div className="text-xs text-slate-500">
                      {job.file_size_mb != null ? `${job.file_size_mb} MB` : '—'} · {scopeLabel(job)} ·{' '}
                      {formatTimeAgo(job.completed_at ?? job.started_at, isAr)}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      title={isAr ? 'تحميل' : 'Download'}
                      onClick={() => superadminApi.downloadBackup(job.id, job.file_name)}
                      className="rounded p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      title={isAr ? 'حذف' : 'Delete'}
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (window.confirm(isAr ? 'حذف هذه النسخة؟' : 'Delete this backup?')) {
                          deleteMutation.mutate(job.id)
                        }
                      }}
                      className="rounded p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}
