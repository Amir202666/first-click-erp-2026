import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import HrPageShell from './HrPageShell'
import { listAttendance, listEmployees, upsertAttendance } from '../../api/hr'
import { Plus } from 'lucide-react'

export default function AttendancePage() {
  const { currentTenant } = useAuth()
  const { t, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const qc = useQueryClient()

  const [from, setFrom] = useState(() => new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().slice(0, 10))
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [employeeId, setEmployeeId] = useState<number | ''>('')

  const { data: employeesData } = useQuery({
    queryKey: ['hr', 'employees', tenantId, 'mini'],
    queryFn: () => listEmployees({ tenant_id: tenantId, paginate: '0', per_page: 1000, status: 'active' }),
    enabled: !!tenantId,
  })
  const employees: any[] = Array.isArray(employeesData) ? employeesData : employeesData?.data ?? []

  const params = useMemo(() => {
    const p: any = { tenant_id: tenantId, paginate: '1', per_page: 30, from, to }
    if (employeeId) p.employee_id = employeeId
    return p
  }, [tenantId, from, to, employeeId])

  const { data, isLoading } = useQuery({
    queryKey: ['hr', 'attendance', tenantId, params],
    queryFn: () => listAttendance(params),
    enabled: !!tenantId,
  })

  const rows: any[] = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : []

  const upsertMut = useMutation({
    mutationFn: (payload: any) => upsertAttendance({ tenant_id: tenantId, ...payload }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'attendance', tenantId] }),
  })

  return (
    <HrPageShell
      title={t.hr?.attendanceTitle ?? (isRtl ? 'الحضور والانصراف' : 'Attendance')}
      subtitle={t.hr?.attendanceSubtitle ?? (isRtl ? 'تسجيل دخول/خروج يومي وربط الأجهزة (لاحقاً).' : 'Daily check-in/out; device integration (later).')}
    >
      <div className="card-app">
        <div className="card-padding">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
            <div>
              <label className="text-xs text-slate-500">{t.from}</label>
              <input type="date" className="input-app mt-1" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-500">{t.to}</label>
              <input type="date" className="input-app mt-1" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="lg:col-span-2">
              <label className="text-xs text-slate-500">{t.hr?.employee ?? (isRtl ? 'الموظف' : 'Employee')}</label>
              <select className="input-app mt-1" value={employeeId} onChange={(e) => setEmployeeId(e.target.value ? +e.target.value : '')}>
                <option value="">{t.all}</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.code} — {e.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end justify-end">
              <button
                className="btn btn-md btn-primary"
                onClick={() => {
                  const emp = employeeId || (employees[0]?.id ?? null)
                  if (!emp) return
                  upsertMut.mutate({
                    employee_id: emp,
                    work_date: to,
                    check_in: `${to}T09:00:00`,
                    check_out: `${to}T17:00:00`,
                    source: 'manual',
                  })
                }}
                disabled={upsertMut.isPending}
                title={isRtl ? 'تسجيل حضور يدوي (قالب سريع)' : 'Quick manual attendance'}
              >
                <Plus size={18} />
                {isRtl ? 'إضافة سجل' : 'Add'}
              </button>
            </div>
          </div>
        </div>

        <div className="table-responsive-wrap">
          <table className="table-zebra w-full">
            <thead>
              <tr>
                <th className={isRtl ? 'text-right' : 'text-left'} style={{ width: 140 }}>
                  {t.date}
                </th>
                <th className={isRtl ? 'text-right' : 'text-left'}>{t.hr?.employee ?? (isRtl ? 'الموظف' : 'Employee')}</th>
                <th className="text-center" style={{ width: 170 }}>
                  {isRtl ? 'الدخول' : 'Check-in'}
                </th>
                <th className="text-center" style={{ width: 170 }}>
                  {isRtl ? 'الخروج' : 'Check-out'}
                </th>
                <th className="text-center" style={{ width: 120 }}>
                  {isRtl ? 'المصدر' : 'Source'}
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
                  <td className="tabular-nums">{r.work_date}</td>
                  <td className="cell-ellipsis">
                    {r.employee?.code} — {r.employee?.name}
                  </td>
                  <td className="text-center tabular-nums">{r.check_in ? String(r.check_in).slice(11, 16) : '—'}</td>
                  <td className="text-center tabular-nums">{r.check_out ? String(r.check_out).slice(11, 16) : '—'}</td>
                  <td className="text-center">{r.source === 'device' ? (isRtl ? 'جهاز' : 'Device') : (isRtl ? 'يدوي' : 'Manual')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </HrPageShell>
  )
}

