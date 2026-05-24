import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchBranches } from '../../api/tenant'
import { deleteEmployeeForTenant, listAdministrations, listDepartments, listEmployees } from '../../api/hr'
import HrPageShell from './HrPageShell'
import { Plus, Trash2, Eye } from 'lucide-react'
import type { Branch } from '../../types'
import { useClientSort, type SortColumn } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'

export default function EmployeeListPage() {
  const { currentTenant } = useAuth()
  const { t, isRtl, lang } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const qc = useQueryClient()

  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'all' | 'active' | 'on_leave' | 'resigned'>('all')
  const [branchId, setBranchId] = useState<number | ''>('')
  const [administrationId, setAdministrationId] = useState<number | ''>('')
  const [departmentId, setDepartmentId] = useState<number | ''>('')

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId, { status: 'active' }),
    enabled: !!tenantId,
  })

  const { data: administrationsData } = useQuery({
    queryKey: ['hr', 'administrations', tenantId, 'mini'],
    queryFn: () => listAdministrations({ tenant_id: tenantId, paginate: '0', per_page: 1000, status: 'active' }),
    enabled: !!tenantId,
  })
  const administrations: any[] = Array.isArray(administrationsData) ? administrationsData : administrationsData?.data ?? []

  const { data: departmentsData } = useQuery({
    queryKey: ['hr', 'departments', tenantId, 'mini'],
    queryFn: () => listDepartments({ tenant_id: tenantId, paginate: '0', per_page: 1000, status: 'active' }),
    enabled: !!tenantId,
  })
  const departmentsAll: any[] = Array.isArray(departmentsData) ? departmentsData : departmentsData?.data ?? []
  const departments = useMemo(() => {
    if (!administrationId) return departmentsAll
    return departmentsAll.filter((d) => Number(d.administration_id ?? '') === Number(administrationId))
  }, [departmentsAll, administrationId])

  const params = useMemo(() => {
    const p: Record<string, any> = { tenant_id: tenantId, paginate: '1', per_page: 20 }
    if (q.trim()) p.q = q.trim()
    if (status !== 'all') p.status = status
    if (branchId) p.branch_id = branchId
    if (administrationId) p.administration_id = administrationId
    if (departmentId) p.department_id = departmentId
    return p
  }, [tenantId, q, status, branchId, administrationId, departmentId])

  const { data, isLoading } = useQuery({
    queryKey: ['hr', 'employees', tenantId, params],
    queryFn: () => listEmployees(params),
    enabled: !!tenantId,
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteEmployeeForTenant(tenantId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'employees', tenantId] }),
  })

  const rows: any[] = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : []

  type EmpSortKey = 'code' | 'name' | 'department' | 'job_title' | 'status'
  const empSortColumns = useMemo((): SortColumn<any, EmpSortKey>[] => {
    return [
      { key: 'code', type: 'string', getValue: (r) => String(r.code ?? '') },
      { key: 'name', type: 'string', getValue: (r) => String(r.name ?? '') },
      { key: 'department', type: 'string', getValue: (r) => String(r.departmentRef?.name ?? r.department ?? '') },
      { key: 'job_title', type: 'string', getValue: (r) => String(r.job_title ?? '') },
      { key: 'status', type: 'string', getValue: (r) => String(r.status ?? '') },
    ]
  }, [])
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const { sort, toggleSort, sortedRows } = useClientSort(rows, empSortColumns, { locale })
  const thAlign = isRtl ? 'text-right' : 'text-left'

  return (
    <HrPageShell
      title={t.hr?.employeesTitle ?? (t.nav as any)?.hrEmployees ?? (isRtl ? 'الموظفون' : 'Employees')}
    >
      <div className="card-app">
        <div className="card-padding">
          <div className="grid grid-cols-12 gap-[15px]">
            {/* Row 1 */}
            <div className="col-span-12 lg:col-span-10">
              <label className="text-xs text-slate-500">{t.search}</label>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="input-app h-10 mt-1"
                placeholder={t.hr?.searchEmployeePlaceholder ?? (isRtl ? 'بحث بالاسم/الكود/الهوية...' : 'Search by name/code/national id...')}
              />
            </div>
            <div className="col-span-12 lg:col-span-2 flex items-end">
              <Link to="/hr/employees/new" className="btn btn-md btn-primary h-10 w-full justify-center">
                <Plus size={18} />
                {t.add}
              </Link>
            </div>

            {/* Row 2 */}
            <div className="col-span-12 lg:col-span-3">
              <label className="text-xs text-slate-500">{t.hr?.branch ?? (isRtl ? 'الفرع' : 'Branch')}</label>
              <select value={branchId} onChange={(e) => setBranchId(e.target.value ? +e.target.value : '')} className="input-app h-10 mt-1">
                <option value="">{t.hr?.selectBranch ?? (isRtl ? 'اختر الفرع' : 'Select branch')}</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} - {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-12 lg:col-span-3">
              <label className="text-xs text-slate-500">{isRtl ? 'الإدارة' : 'Administration'}</label>
              <select
                value={administrationId}
                onChange={(e) => {
                  const v = e.target.value ? +e.target.value : ''
                  setAdministrationId(v)
                  setDepartmentId('')
                }}
                className="input-app h-10 mt-1"
              >
                <option value="">{isRtl ? 'اختر الإدارة' : 'Select administration'}</option>
                {administrations.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} - {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-12 lg:col-span-3">
              <label className="text-xs text-slate-500">{t.hr?.department ?? (isRtl ? 'القسم' : 'Department')}</label>
              <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value ? +e.target.value : '')} className="input-app h-10 mt-1">
                <option value="">{isRtl ? 'اختر القسم' : 'Select department'}</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} - {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-12 lg:col-span-3">
              <label className="text-xs text-slate-500">{t.status}</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as any)} className="input-app h-10 mt-1">
                <option value="all">{t.all}</option>
                <option value="active">{isRtl ? 'على رأس العمل' : 'Active'}</option>
                <option value="on_leave">{isRtl ? 'إجازة' : 'On leave'}</option>
                <option value="resigned">{isRtl ? 'مستقيل' : 'Resigned'}</option>
              </select>
            </div>
          </div>
        </div>

        <div className="table-responsive-wrap">
          <table className="table-zebra w-full">
            <thead>
              <tr>
                <SortableTh label={t.code} sortKey="code" sortState={sort} onToggle={toggleSort} widthClassName="w-[140px]" className={`${thAlign} py-0 px-0 font-medium`} />
                <SortableTh label={t.name} sortKey="name" sortState={sort} onToggle={toggleSort} className={`${thAlign} py-0 px-0 font-medium`} />
                <SortableTh
                  label={t.hr?.department ?? (isRtl ? 'القسم' : 'Department')}
                  sortKey="department"
                  sortState={sort}
                  onToggle={toggleSort}
                  widthClassName="min-w-[200px]"
                  className={`${thAlign} py-0 px-0 font-medium`}
                />
                <SortableTh
                  label={t.hr?.jobTitle ?? (isRtl ? 'المسمى الوظيفي' : 'Job Title')}
                  sortKey="job_title"
                  sortState={sort}
                  onToggle={toggleSort}
                  widthClassName="min-w-[200px]"
                  className={`${thAlign} py-0 px-0 font-medium`}
                />
                <SortableTh label={t.status} sortKey="status" sortState={sort} onToggle={toggleSort} widthClassName="w-[140px]" className="text-center py-0 px-0 font-medium" />
                <th className="text-center" style={{ width: 150 }}>
                  {t.actions}
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={6} className="text-center text-slate-500">
                    {t.loading}
                  </td>
                </tr>
              )}
              {!isLoading && sortedRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-slate-500">
                    {t.noData}
                  </td>
                </tr>
              )}
              {sortedRows.map((r) => (
                <tr key={r.id}>
                  <td className="tabular-nums">{r.code}</td>
                  <td className="cell-ellipsis">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-primary-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                        {String(r.name ?? '?').trim().charAt(0).toUpperCase()}
                      </div>
                      <span className="cell-ellipsis">{r.name}</span>
                    </div>
                  </td>
                  <td className="cell-ellipsis">{r.departmentRef?.name ?? r.department ?? '—'}</td>
                  <td className="cell-ellipsis">{r.job_title ?? '—'}</td>
                  <td className="text-center">
                    {(() => {
                      const st = String(r.status ?? '')
                      if (st === 'active') {
                        return <span className="px-2 py-1 rounded-app text-xs bg-emerald-50 text-emerald-700">{isRtl ? 'على رأس العمل' : 'Active'}</span>
                      }
                      if (st === 'on_leave') {
                        return <span className="px-2 py-1 rounded-app text-xs bg-amber-50 text-amber-800">{isRtl ? 'إجازة' : 'On leave'}</span>
                      }
                      if (st === 'resigned') {
                        return <span className="px-2 py-1 rounded-app text-xs bg-slate-100 text-slate-700">{isRtl ? 'مستقيل' : 'Resigned'}</span>
                      }
                      return <span className="px-2 py-1 rounded-app text-xs bg-slate-100 text-slate-600">{st || '—'}</span>
                    })()}
                  </td>
                  <td className="text-center">
                    <div className="inline-flex items-center gap-2">
                      <Link className="btn btn-sm btn-secondary" to={`/hr/employees/${r.id}`}>
                        <Eye size={16} />
                        {isRtl ? 'عرض' : 'View'}
                      </Link>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => {
                          if (confirm(isRtl ? 'حذف الموظف؟' : 'Delete employee?')) deleteMut.mutate(r.id)
                        }}
                        disabled={deleteMut.isPending}
                      >
                        <Trash2 size={16} />
                        {t.delete}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </HrPageShell>
  )
}

