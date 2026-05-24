import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchBranches } from '../../api/tenant'
import {
  createEmployeeForTenant,
  deleteEmployeeDocumentForTenant,
  getEmployeeForTenant,
  getEmployeeCompensationForTenant,
  listAdministrations,
  listDepartments,
  updateEmployeeForTenant,
  uploadEmployeeDocumentForTenant,
} from '../../api/hr'
import type { Branch } from '../../types'
import HrPageShell from './HrPageShell'
import { ArrowLeft, Upload, Trash2, Save } from 'lucide-react'

type TabKey = 'personal' | 'job' | 'documents' | 'payroll'

export default function EmployeeProfilePage() {
  const { id } = useParams()
  const isNew = id === 'new'
  const employeeId = isNew ? null : Number(id)
  const { currentTenant } = useAuth()
  const { t, isRtl, lang } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const qc = useQueryClient()
  const navigate = useNavigate()

  const [tab, setTab] = useState<TabKey>('personal')

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
    queryFn: () => listDepartments({ tenant_id: tenantId, paginate: '0', per_page: 2000, status: 'active' }),
    enabled: !!tenantId,
  })
  const departmentsAll: any[] = Array.isArray(departmentsData) ? departmentsData : departmentsData?.data ?? []

  const { data, isLoading } = useQuery({
    queryKey: ['hr', 'employee', tenantId, employeeId],
    queryFn: () => getEmployeeForTenant(tenantId, employeeId!),
    enabled: !!tenantId && !!employeeId,
  })

  const { data: compData } = useQuery({
    queryKey: ['hr', 'employee-comp', tenantId, employeeId],
    queryFn: () => getEmployeeCompensationForTenant(tenantId, employeeId!),
    enabled: !!tenantId && !!employeeId,
  })

  const initial = useMemo(() => {
    if (data) return data
    return {
      name: '',
      national_id: '',
      birth_date: '',
      phone: '',
      email: '',
      address: '',
      branch_id: null as number | null,
      department: '',
      job_title: '',
      hire_date: '',
      status: 'active' as 'active' | 'on_leave' | 'resigned',
      basic_salary: '0',
      housing_allowance: '0',
      transport_allowance: '0',
      notes: '',
      documents: [] as any[],
    }
  }, [data])

  const [form, setForm] = useState<any>(initial)
  // keep in sync when data loads
  useEffect(() => {
    if (data) setForm(data)
  }, [data])

  const departments = useMemo(() => {
    const adminId = Number(form?.administration_id ?? 0)
    if (!adminId) return departmentsAll
    return departmentsAll.filter((d) => Number(d.administration_id ?? 0) === adminId)
  }, [departmentsAll, form?.administration_id])

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload: any = {
        name: form.name,
        national_id: form.national_id || null,
        birth_date: form.birth_date || null,
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
        branch_id: form.branch_id || null,
        administration_id: form.administration_id || null,
        department_id: form.department_id || null,
        department: form.department || null,
        job_title: form.job_title || null,
        hire_date: form.hire_date || null,
        status: form.status,
        basic_salary: Number(form.basic_salary || 0),
        housing_allowance: Number(form.housing_allowance || 0),
        transport_allowance: Number(form.transport_allowance || 0),
        notes: form.notes || null,
      }
      if (isNew) return createEmployeeForTenant(tenantId, payload)
      return updateEmployeeForTenant(tenantId, employeeId!, payload)
    },
    onSuccess: async (saved: any) => {
      await qc.invalidateQueries({ queryKey: ['hr', 'employees', tenantId] })
      if (isNew) navigate(`/hr/employees/${saved.id}`, { replace: true })
      else await qc.invalidateQueries({ queryKey: ['hr', 'employee', tenantId, employeeId] })
    },
  })

  const uploadMut = useMutation({
    mutationFn: async (args: { type: string; file: File; issued_at?: string; expires_at?: string }) => {
      const fd = new FormData()
      fd.append('type', args.type)
      fd.append('file', args.file)
      if (args.issued_at) fd.append('issued_at', args.issued_at)
      if (args.expires_at) fd.append('expires_at', args.expires_at)
      return uploadEmployeeDocumentForTenant(tenantId, employeeId!, fd)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'employee', tenantId, employeeId] }),
  })

  const delDocMut = useMutation({
    mutationFn: (docId: number) => deleteEmployeeDocumentForTenant(tenantId, employeeId!, docId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'employee', tenantId, employeeId] }),
  })

  const tabBtn = (key: TabKey, label: string) => (
    <button
      type="button"
      onClick={() => setTab(key)}
      className={`px-4 py-2 rounded-app text-sm border transition-colors ${
        tab === key ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
      }`}
    >
      {label}
    </button>
  )

  const docStatusBadge = (d: any) => {
    const st = d.status
    if (st === 'expired') return <span className="px-2 py-1 rounded-app text-xs bg-danger-50 text-danger-600">منتهي</span>
    if (st === 'expiring') return <span className="px-2 py-1 rounded-app text-xs bg-amber-50 text-amber-700">قارب على الانتهاء</span>
    if (st === 'valid') return <span className="px-2 py-1 rounded-app text-xs bg-emerald-50 text-emerald-700">ساري</span>
    return <span className="px-2 py-1 rounded-app text-xs bg-slate-100 text-slate-600">—</span>
  }

  return (
    <HrPageShell
      title={isNew ? (t.hr?.newEmployee ?? (isRtl ? 'إضافة موظف' : 'New Employee')) : (t.hr?.employeeProfile ?? (isRtl ? 'بطاقة الموظف' : 'Employee Profile'))}
      subtitle={isNew ? (isRtl ? 'أدخل بيانات الموظف ثم احفظ.' : 'Fill employee data then save.') : (form?.code ? `${form.code} — ${form.name}` : form?.name)}
      actions={
        <>
          <button
            className="btn btn-md btn-primary"
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending || !tenantId || !String(form?.name ?? '').trim()}
          >
            <Save size={18} />
            {saveMut.isPending ? t.saving : t.save}
          </button>
          <Link className="btn btn-md btn-secondary" to="/hr/employees">
            <ArrowLeft size={18} className={isRtl ? 'rotate-180' : ''} />
            {t.back}
          </Link>
        </>
      }
    >
      {!isNew && isLoading && <div className="text-slate-500">{t.loading}</div>}
      {saveMut.isError && (
        <div className="bg-danger-50 border border-danger-200 rounded-app p-3 text-sm text-danger-600">
          {isRtl ? 'تعذر الحفظ. تأكد من إدخال البيانات بشكل صحيح.' : 'Save failed. Please check your inputs.'}
        </div>
      )}

      <div className="card-app">
        <div className="card-padding flex flex-wrap gap-2">
          {tabBtn('personal', t.hr?.tabPersonal ?? (isRtl ? 'البيانات الشخصية' : 'Personal'))}
          {tabBtn('job', t.hr?.tabJob ?? (isRtl ? 'البيانات الوظيفية' : 'Job'))}
          {tabBtn('documents', t.hr?.tabDocuments ?? (isRtl ? 'المستندات' : 'Documents'))}
          {tabBtn('payroll', t.hr?.tabPayroll ?? (isRtl ? 'الرواتب والبدلات' : 'Payroll'))}
        </div>
      </div>

      {tab === 'personal' && (
        <div className="card-app">
          <div className="card-padding">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500">{t.name}</label>
                <input className="input-app mt-1" value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-slate-500">{t.hr?.nationalId ?? (isRtl ? 'رقم الهوية' : 'National ID')}</label>
                <input className="input-app mt-1" value={form.national_id ?? ''} onChange={(e) => setForm({ ...form, national_id: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-slate-500">{t.hr?.birthDate ?? (isRtl ? 'تاريخ الميلاد' : 'Birth date')}</label>
                <input type="date" className="input-app mt-1" value={form.birth_date ?? ''} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-slate-500">{lang === 'ar' ? 'معلومات الاتصال' : 'Contact'}</label>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 mt-1">
                  <input className="input-app" placeholder={isRtl ? 'الهاتف' : 'Phone'} value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  <input className="input-app" placeholder={isRtl ? 'البريد الإلكتروني' : 'Email'} value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
              </div>
              <div className="lg:col-span-2">
                <label className="text-xs text-slate-500">{lang === 'ar' ? 'العنوان' : 'Address'}</label>
                <input className="input-app mt-1" value={form.address ?? ''} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'job' && (
        <div className="card-app">
          <div className="card-padding">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500">{t.hr?.branch ?? (isRtl ? 'الفرع' : 'Branch')}</label>
                <select className="input-app mt-1" value={form.branch_id ?? ''} onChange={(e) => setForm({ ...form, branch_id: e.target.value ? +e.target.value : null })}>
                  <option value="">{t.hr?.selectBranch ?? (isRtl ? 'اختر الفرع' : 'Select branch')}</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code} - {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500">{isRtl ? 'الإدارة' : 'Administration'}</label>
                <select
                  className="input-app mt-1"
                  value={form.administration_id ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      administration_id: e.target.value ? +e.target.value : null,
                      department_id: null,
                    })
                  }
                >
                  <option value="">{isRtl ? 'اختر الإدارة' : 'Select administration'}</option>
                  {administrations.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} - {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500">{t.hr?.department ?? (isRtl ? 'القسم' : 'Department')}</label>
                <select
                  className="input-app mt-1"
                  value={form.department_id ?? ''}
                  onChange={(e) => setForm({ ...form, department_id: e.target.value ? +e.target.value : null })}
                >
                  <option value="">{isRtl ? 'اختر القسم' : 'Select department'}</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.code} - {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500">{t.hr?.jobTitle ?? (isRtl ? 'المسمى الوظيفي' : 'Job title')}</label>
                <input className="input-app mt-1" value={form.job_title ?? ''} onChange={(e) => setForm({ ...form, job_title: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-slate-500">{t.hr?.hireDate ?? (isRtl ? 'تاريخ التعيين' : 'Hire date')}</label>
                <input type="date" className="input-app mt-1" value={form.hire_date ?? ''} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-slate-500">{t.status}</label>
                <select className="input-app mt-1" value={form.status ?? 'active'} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="active">{isRtl ? 'على رأس العمل' : 'Active'}</option>
                  <option value="on_leave">{isRtl ? 'إجازة' : 'On leave'}</option>
                  <option value="resigned">{isRtl ? 'مستقيل' : 'Resigned'}</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'documents' && (
        <div className="card-app">
          <div className="card-padding">
            {isNew ? (
              <div className="text-slate-500 text-sm">{isRtl ? 'احفظ الموظف أولاً ثم ارفع المستندات.' : 'Save employee first to upload documents.'}</div>
            ) : (
              <DocumentUploader
                onUpload={(args) => uploadMut.mutate(args)}
                loading={uploadMut.isPending}
                isRtl={isRtl}
              />
            )}
          </div>

          <div className="table-responsive-wrap">
            <table className="table-zebra w-full">
              <thead>
                <tr>
                  <th className={isRtl ? 'text-right' : 'text-left'} style={{ width: 160 }}>
                    {t.type}
                  </th>
                  <th className={isRtl ? 'text-right' : 'text-left'}>الملف</th>
                  <th className="text-center" style={{ width: 160 }}>
                    {isRtl ? 'الانتهاء' : 'Expiry'}
                  </th>
                  <th className="text-center" style={{ width: 160 }}>
                    {isRtl ? 'الحالة' : 'Status'}
                  </th>
                  <th className="text-center" style={{ width: 140 }}>
                    {t.actions}
                  </th>
                </tr>
              </thead>
              <tbody>
                {(form.documents ?? []).length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-slate-500">
                      {t.noData}
                    </td>
                  </tr>
                )}
                {(form.documents ?? []).map((d: any) => (
                  <tr key={d.id}>
                    <td className="cell-ellipsis">{documentTypeLabel(d.type, isRtl)}</td>
                    <td className="cell-ellipsis">
                      <a href={d.file_url} target="_blank" rel="noreferrer" className="text-primary-600 hover:underline">
                        {isRtl ? 'فتح' : 'Open'}
                      </a>
                    </td>
                    <td className="text-center tabular-nums">{d.expires_at ?? '—'}</td>
                    <td className="text-center">{docStatusBadge(d)}</td>
                    <td className="text-center">
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => {
                          if (confirm(isRtl ? 'حذف المستند؟' : 'Delete document?')) delDocMut.mutate(d.id)
                        }}
                        disabled={delDocMut.isPending || isNew}
                      >
                        <Trash2 size={16} />
                        {t.delete}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'payroll' && (
        <div className="space-y-4">
          <div className="card-app">
            <div className="card-padding">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-slate-500">{t.hr?.basicSalary ?? (isRtl ? 'الراتب الأساسي' : 'Basic salary')}</label>
                  <input dir="ltr" className="input-app mt-1 text-left" value={form.basic_salary ?? '0'} onChange={(e) => setForm({ ...form, basic_salary: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-slate-500">{t.hr?.housingAllowance ?? (isRtl ? 'بدل السكن' : 'Housing allowance')}</label>
                  <input dir="ltr" className="input-app mt-1 text-left" value={form.housing_allowance ?? '0'} onChange={(e) => setForm({ ...form, housing_allowance: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-slate-500">{t.hr?.transportAllowance ?? (isRtl ? 'بدل الانتقال' : 'Transport allowance')}</label>
                  <input dir="ltr" className="input-app mt-1 text-left" value={form.transport_allowance ?? '0'} onChange={(e) => setForm({ ...form, transport_allowance: e.target.value })} />
                </div>
              </div>
            </div>
          </div>

          {!isNew && (
            <div className="card-app">
              <div className="card-padding space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
                  <div className="bg-slate-50 border border-slate-200 rounded-app p-3">
                    <div className="text-xs text-slate-500">{isRtl ? 'الإجمالي الأساسي' : 'Base gross'}</div>
                    <div className="font-bold tabular-nums">{compData?.base_gross ?? 0}</div>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-200 rounded-app p-3">
                    <div className="text-xs text-emerald-700">{isRtl ? 'إجمالي البدلات' : 'Allowances total'}</div>
                    <div className="font-bold tabular-nums text-emerald-800">{compData?.allowances_total ?? 0}</div>
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded-app p-3">
                    <div className="text-xs text-red-700">{isRtl ? 'إجمالي الاستقطاعات' : 'Deductions total'}</div>
                    <div className="font-bold tabular-nums text-red-800">{compData?.deductions_total ?? 0}</div>
                  </div>
                  <div className="bg-primary-50 border border-slate-200 rounded-app p-3">
                    <div className="text-xs text-slate-700">{isRtl ? 'صافي المستحقات' : 'Net compensation'}</div>
                    <div className="font-bold tabular-nums">{compData?.net_compensation ?? 0}</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div>
                    <div className="font-bold mb-2">{isRtl ? 'البدلات' : 'Allowances'}</div>
                    <div className="table-responsive-wrap">
                      <table className="table-zebra w-full text-sm">
                        <thead>
                          <tr>
                            <th className={isRtl ? 'text-right' : 'text-left'}>{t.name}</th>
                            <th className="text-left" style={{ width: 140 }}>
                              {isRtl ? 'القيمة' : 'Amount'}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {Array.isArray(compData?.allowances) && compData.allowances.length > 0 ? (
                            compData.allowances.map((a: any) => (
                              <tr key={a.id}>
                                <td className="cell-ellipsis">{a.name}</td>
                                <td className="tabular-nums text-left">{a.amount}</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={2} className="text-center text-slate-500">
                                {t.noData}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <div className="font-bold mb-2">{isRtl ? 'الاستقطاعات' : 'Deductions'}</div>
                    <div className="table-responsive-wrap">
                      <table className="table-zebra w-full text-sm">
                        <thead>
                          <tr>
                            <th className={isRtl ? 'text-right' : 'text-left'}>{t.name}</th>
                            <th className="text-left" style={{ width: 140 }}>
                              {isRtl ? 'القيمة' : 'Amount'}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {Array.isArray(compData?.deductions) && compData.deductions.length > 0 ? (
                            compData.deductions.map((d: any) => (
                              <tr key={d.id}>
                                <td className="cell-ellipsis">{d.name}</td>
                                <td className="tabular-nums text-left">{d.amount}</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={2} className="text-center text-slate-500">
                                {t.noData}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </HrPageShell>
  )
}

function documentTypeLabel(type: string, isRtl: boolean) {
  const mapAr: Record<string, string> = { passport: 'جواز السفر', contract: 'العقد', residency: 'الإقامة', other: 'أخرى' }
  const mapEn: Record<string, string> = { passport: 'Passport', contract: 'Contract', residency: 'Residency', other: 'Other' }
  return (isRtl ? mapAr : mapEn)[type] ?? type
}

function DocumentUploader({
  onUpload,
  loading,
  isRtl,
}: {
  onUpload: (args: { type: string; file: File; issued_at?: string; expires_at?: string }) => void
  loading: boolean
  isRtl: boolean
}) {
  const [type, setType] = useState('passport')
  const [issuedAt, setIssuedAt] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [file, setFile] = useState<File | null>(null)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-6 gap-3 items-end">
      <div className="lg:col-span-2">
        <label className="text-xs text-slate-500">{isRtl ? 'نوع المستند' : 'Document type'}</label>
        <select className="input-app mt-1" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="passport">{isRtl ? 'جواز السفر' : 'Passport'}</option>
          <option value="contract">{isRtl ? 'العقد' : 'Contract'}</option>
          <option value="residency">{isRtl ? 'الإقامة' : 'Residency'}</option>
          <option value="other">{isRtl ? 'أخرى' : 'Other'}</option>
        </select>
      </div>
      <div>
        <label className="text-xs text-slate-500">{isRtl ? 'تاريخ الإصدار' : 'Issued at'}</label>
        <input type="date" className="input-app mt-1" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
      </div>
      <div>
        <label className="text-xs text-slate-500">{isRtl ? 'تاريخ الانتهاء' : 'Expires at'}</label>
        <input type="date" className="input-app mt-1" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
      </div>
      <div className="lg:col-span-2">
        <label className="text-xs text-slate-500">{isRtl ? 'الملف' : 'File'}</label>
        <input
          type="file"
          className="input-app mt-1"
          accept=".jpg,.jpeg,.png,.webp,.gif,.pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>
      <div className="lg:col-span-6 flex justify-end">
        <button
          type="button"
          className="btn btn-md btn-primary"
          disabled={!file || loading}
          onClick={() => {
            if (!file) return
            onUpload({ type, file, issued_at: issuedAt || undefined, expires_at: expiresAt || undefined })
            setFile(null)
          }}
        >
          <Upload size={18} />
          {loading ? (isRtl ? 'جارٍ الرفع...' : 'Uploading...') : (isRtl ? 'رفع المستند' : 'Upload')}
        </button>
      </div>
    </div>
  )
}

