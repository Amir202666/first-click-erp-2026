import { api } from './client'
import type { BackupJob, ResetJob, ResetModule, Tenant } from '../types/superadmin'

const BASE = '/admin'

export const superadminApi = {
  getTenants: (): Promise<Tenant[]> =>
    api.get<Tenant[]>(`${BASE}/tenants`).then((r) => r.data),

  backupFull: (): Promise<BackupJob> =>
    api.post<BackupJob>(`${BASE}/backup/full`).then((r) => r.data),

  backupTenant: (tenantId: number): Promise<BackupJob> =>
    api.post<BackupJob>(`${BASE}/backup/tenant/${tenantId}`).then((r) => r.data),

  getBackupStatus: (jobId: string): Promise<BackupJob> =>
    api.get<BackupJob>(`${BASE}/backup/status/${jobId}`).then((r) => r.data),

  listBackups: (): Promise<BackupJob[]> =>
    api.get<BackupJob[]>(`${BASE}/backup/list`).then((r) => r.data),

  downloadBackup: async (jobId: string, fileName?: string): Promise<void> => {
    const res = await api.get(`${BASE}/backup/download/${jobId}`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName ?? `backup_${jobId}.sql.gz`
    a.click()
    URL.revokeObjectURL(url)
  },

  deleteBackup: (jobId: string): Promise<void> =>
    api.delete(`${BASE}/backup/${jobId}`).then(() => undefined),

  previewReset: (tenantId: number, modules: ResetModule[]): Promise<Record<string, number>> =>
    api.post<Record<string, number>>(`${BASE}/reset/preview`, { tenant_id: tenantId, modules }).then((r) => r.data),

  executeReset: (
    tenantId: number,
    modules: ResetModule[],
    confirmationToken: string,
  ): Promise<ResetJob> =>
    api
      .post<ResetJob>(`${BASE}/reset/execute`, {
        tenant_id: tenantId,
        modules,
        confirmation_token: confirmationToken,
      })
      .then((r) => r.data),

  getResetLog: (): Promise<ResetJob[]> =>
    api.get<ResetJob[]>(`${BASE}/reset/log`).then((r) => r.data),
}

export function buildResetConfirmationToken(tenantId: number): string {
  return btoa(`${tenantId}_reset`)
}
