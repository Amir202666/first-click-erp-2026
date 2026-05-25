import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { ShieldAlert, Loader2 } from 'lucide-react'

export function SuperAdminGuard({ children }: { children: ReactNode }) {
  const { meData, isLoading } = useAuth()
  const isSuperAdmin =
    meData?.role_slug === 'super_admin' || meData?.permissions?.includes('*')

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    )
  }

  if (!isSuperAdmin) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

export function SuperAdminDenied() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-slate-600">
      <ShieldAlert className="h-12 w-12 text-amber-500" />
      <p className="text-lg font-medium">غير مصرح — للمشرف العام فقط</p>
    </div>
  )
}
