import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import HrPageShell from './HrPageShell'
import { approveHrRequestForTenant, createHrRequest, listEmployees, listHrRequests, rejectHrRequestForTenant } from '../../api/hr'
import { Check, Plus, X } from 'lucide-react'

export default function RequestsPage() {
  const { currentTenant } = useAuth()
  const { t, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const qc = useQueryClient()

  const [type, setType] = useState<'all' | 'leave' | 'loan' | 'advance' | 'custody'>('all')
  const [status, setStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [employeeId, setEmployeeId] = useState<number | ''>('')

  const { data: employeesData } = useQuery({
    queryKey: ['hr', 'employees', tenantId, 'mini'],
    queryFn: () => listEmployees({ tenant_id: tenantId, paginate: '0', per_page: 1000, status: 'active' }),
    enabled: !!tenantId,
  })
  const employees: any[] = Array.isArray(employeesData) ? employeesData : employeesData?.data ?? []

  const params = useMemo(() => {
    const p: any = { tenant_id: tenantId, paginate: '1', per_page: 20 }
    if (type !== 'all') p.type = type
    if (status !== 'all') p.status = status
    if (employeeId) p.employee_id = employeeId
    return p
  }, [tenantId, type, status, employeeId])

  const { data, isLoading } = useQuery({
    queryKey: ['hr', 'requests', tenantId, params],
    queryFn: () => listHrRequests(params),
    enabled: !!tenantId,
  })
  const rows: any[] = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : []

  const [createOpen, setCreateOpen] = useState(false)

  const createMut = useMutation({
    mutationFn: (payload: any) => createHrRequest({ tenant_id: tenantId, ...payload }),
    onSuccess: async () => {
      setCreateOpen(false)
      await qc.invalidateQueries({ queryKey: ['hr', 'requests', tenantId] })
    },
  })

  const approveMut = useMutation({
    mutationFn: (id: number) => approveHrRequestForTenant(tenantId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'requests', tenantId] }),
  })

  const rejectMut = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) => rejectHrRequestForTenant(tenantId, id, { reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'requests', tenantId] }),
  })

  return (
    <HrPageShell
      title={t.hr?.requestsTitle ?? (isRtl ? 'طلبات الإجازات والسلف' : 'Requests & Loans')}
      actions={
        <button className="btn btn-md btn-primary" onClick={() => setCreateOpen(true)}>
          <Plus size={18} />
          {t.add}
        </button>
      }
    >
      <div className="card-app">
        <div className="card-padding">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-slate-500">{isRtl ? 'النوع' : 'Type'}</label>
              <select className="input-app" value={type} onChange={(e) => setType(e.target.value as any)}>
                <option value="all">{isRtl ? 'النوع: الكل' : 'Type: All'}</option>
                <option value="leave">{isRtl ? 'إجازة' : 'Leave'}</option>
                <option value="loan">{isRtl ? 'قرض' : 'Loan'}</option>
                <option value="advance">{isRtl ? 'سلفة' : 'Advance'}</option>
                <option value="custody">{isRtl ? 'عهدة' : 'Custody'}</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500">{isRtl ? 'الحالة' : 'Status'}</label>
              <select className="input-app" value={status} onChange={(e) => setStatus(e.target.value as any)}>
                <option value="all">{isRtl ? 'الحالة: الكل' : 'Status: All'}</option>
                <option value="pending">{isRtl ? 'معلق' : 'Pending'}</option>
                <option value="approved">{isRtl ? 'مقبول' : 'Approved'}</option>
                <option value="rejected">{isRtl ? 'مرفوض' : 'Rejected'}</option>
              </select>
            </div>
            <div className="lg:col-span-2">
              <label className="text-xs text-slate-500">{isRtl ? 'الموظف' : 'Employee'}</label>
              <select className="input-app" value={employeeId} onChange={(e) => setEmployeeId(e.target.value ? +e.target.value : '')}>
                <option value="">{isRtl ? 'الموظف: الكل' : 'Employee: All'}</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.code} — {e.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="table-responsive-wrap">
          <table className="table-zebra w-full">
            <thead>
              <tr>
                <th className={isRtl ? 'text-right' : 'text-left'} style={{ width: 160 }}>
                  {t.code}
                </th>
                <th className={isRtl ? 'text-right' : 'text-left'}>{isRtl ? 'الموظف' : 'Employee'}</th>
                <th className="text-center" style={{ width: 160 }}>
                  {t.type}
                </th>
                <th className="text-center" style={{ width: 160 }}>
                  {t.status}
                </th>
                <th className="text-center" style={{ width: 220 }}>
                  {t.actions}
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={5} className="text-center text-slate-500">
                    {t.loading}
                  </td>
                </tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-slate-500">
                    {t.noData}
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="tabular-nums">{r.number}</td>
                  <td className="cell-ellipsis">
                    {r.employee?.code} — {r.employee?.name}
                  </td>
                  <td className="text-center">{typeLabel(r.type, isRtl)}</td>
                  <td className="text-center">{statusLabel(r.status, isRtl)}</td>
                  <td className="text-center">
                    <div className="inline-flex items-center gap-2">
                      <button
                        className="btn btn-sm btn-success"
                        disabled={r.status !== 'pending' || approveMut.isPending}
                        onClick={() => approveMut.mutate(r.id)}
                      >
                        <Check size={16} />
                        {isRtl ? 'قبول' : 'Approve'}
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        disabled={r.status !== 'pending' || rejectMut.isPending}
                        onClick={() => {
                          const reason = prompt(isRtl ? 'سبب الرفض (اختياري)' : 'Rejection reason (optional)')
                          rejectMut.mutate({ id: r.id, reason: reason ?? undefined })
                        }}
                      >
                        <X size={16} />
                        {isRtl ? 'رفض' : 'Reject'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {createOpen && (
        <CreateRequestModal
          isRtl={isRtl}
          employees={employees}
          onClose={() => setCreateOpen(false)}
          onSubmit={(payload) => createMut.mutate(payload)}
          loading={createMut.isPending}
        />
      )}
    </HrPageShell>
  )
}

function typeLabel(type: string, isRtl: boolean) {
  const ar: any = { leave: 'إجازة', loan: 'قرض', advance: 'سلفة', custody: 'عهدة' }
  const en: any = { leave: 'Leave', loan: 'Loan', advance: 'Advance', custody: 'Custody' }
  return (isRtl ? ar : en)[type] ?? type
}

function statusLabel(status: string, isRtl: boolean) {
  const ar: any = { pending: 'معلق', approved: 'مقبول', rejected: 'مرفوض' }
  const en: any = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' }
  return (isRtl ? ar : en)[status] ?? status
}

function CreateRequestModal({
  isRtl,
  employees,
  onClose,
  onSubmit,
  loading,
}: {
  isRtl: boolean
  employees: any[]
  onClose: () => void
  onSubmit: (payload: any) => void
  loading: boolean
}) {
  const [employeeId, setEmployeeId] = useState<number | ''>('')
  const [type, setType] = useState<'leave' | 'loan' | 'advance' | 'custody'>('leave')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [amount, setAmount] = useState('')
  const [installmentsCount, setInstallmentsCount] = useState('12')
  const [reason, setReason] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="bg-white rounded-app border border-slate-200 shadow-xl w-full max-w-2xl">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="font-bold">{isRtl ? 'طلب جديد' : 'New request'}</div>
          <button className="text-slate-500 hover:text-slate-700" onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500">{isRtl ? 'الموظف' : 'Employee'}</label>
              <select className="input-app mt-1" value={employeeId} onChange={(e) => setEmployeeId(e.target.value ? +e.target.value : '')}>
                <option value="">{isRtl ? 'اختر الموظف' : 'Select employee'}</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.code} — {e.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500">{isRtl ? 'النوع' : 'Type'}</label>
              <select className="input-app mt-1" value={type} onChange={(e) => setType(e.target.value as any)}>
                <option value="leave">{isRtl ? 'إجازة' : 'Leave'}</option>
                <option value="loan">{isRtl ? 'قرض' : 'Loan'}</option>
                <option value="advance">{isRtl ? 'سلفة' : 'Advance'}</option>
                <option value="custody">{isRtl ? 'عهدة' : 'Custody'}</option>
              </select>
            </div>
          </div>

          {type === 'leave' ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500">{isRtl ? 'من' : 'From'}</label>
                <input type="date" className="input-app mt-1" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-slate-500">{isRtl ? 'إلى' : 'To'}</label>
                <input type="date" className="input-app mt-1" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500">{isRtl ? 'المبلغ' : 'Amount'}</label>
                <input dir="ltr" className="input-app mt-1 text-left" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              {type === 'loan' && (
                <div>
                  <label className="text-xs text-slate-500">{isRtl ? 'عدد الأقساط' : 'Installments'}</label>
                  <input dir="ltr" className="input-app mt-1 text-left" value={installmentsCount} onChange={(e) => setInstallmentsCount(e.target.value)} />
                </div>
              )}
            </div>
          )}

          <div>
            <label className="text-xs text-slate-500">{isRtl ? 'السبب/الملاحظات' : 'Reason/Notes'}</label>
            <input className="input-app mt-1" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <div className="px-4 py-3 border-t border-slate-200 flex justify-end gap-2">
          <button className="btn btn-md btn-secondary" onClick={onClose}>
            {isRtl ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            className="btn btn-md btn-primary"
            disabled={!employeeId || loading || (type === 'leave' && (!fromDate || !toDate)) || (type !== 'leave' && !amount)}
            onClick={() => {
              onSubmit({
                employee_id: employeeId,
                type,
                requested_at: new Date().toISOString().slice(0, 10),
                from_date: type === 'leave' ? fromDate : null,
                to_date: type === 'leave' ? toDate : null,
                amount: type === 'leave' ? null : Number(amount),
                installments_count: type === 'loan' ? Number(installmentsCount || 1) : null,
                reason: reason || null,
              })
            }}
          >
            {loading ? (isRtl ? 'جارٍ الحفظ...' : 'Saving...') : (isRtl ? 'حفظ' : 'Save')}
          </button>
        </div>
      </div>
    </div>
  )
}

