import { api } from './client'

function tenantHeaders(tenantId: number) {
  return { headers: { 'X-Tenant-ID': tenantId.toString() } }
}

export interface Employee {
  id: number
  code: string
  name: string
  national_id?: string | null
  birth_date?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  branch_id?: number | null
  administration_id?: number | null
  department_id?: number | null
  department?: string | null
  job_title?: string | null
  hire_date?: string | null
  status: 'active' | 'on_leave' | 'resigned'
  basic_salary: string
  housing_allowance: string
  transport_allowance: string
  notes?: string | null
}

export interface EmployeeDocument {
  id: number
  type: 'passport' | 'contract' | 'residency' | 'other'
  file_url: string
  issued_at?: string | null
  expires_at?: string | null
  days_left?: number | null
  status?: 'none' | 'valid' | 'expiring' | 'expired'
  notes?: string | null
}

export async function listEmployees(params: Record<string, any>) {
  const tenantId = Number(params?.tenant_id ?? 0)
  const { tenant_id, ...rest } = params ?? {}
  const { data } = await api.get('/hr/employees', { ...tenantHeaders(tenantId), params: rest })
  return data
}

export async function getEmployee(_id: number) {
  throw new Error('getEmployee requires tenantId: use getEmployeeForTenant(tenantId, id)')
}

export async function getEmployeeForTenant(tenantId: number, id: number) {
  const { data } = await api.get(`/hr/employees/${id}`, tenantHeaders(tenantId))
  return data as Employee & { documents: EmployeeDocument[] }
}

export async function createEmployee(_payload: Partial<Employee>) {
  throw new Error('createEmployee requires tenantId: use createEmployeeForTenant(tenantId, payload)')
}

export async function createEmployeeForTenant(tenantId: number, payload: Partial<Employee>) {
  const { data } = await api.post('/hr/employees', payload, tenantHeaders(tenantId))
  return data
}

export async function updateEmployee(_id: number, _payload: Partial<Employee>) {
  throw new Error('updateEmployee requires tenantId: use updateEmployeeForTenant(tenantId, id, payload)')
}

export async function updateEmployeeForTenant(tenantId: number, id: number, payload: Partial<Employee>) {
  const { data } = await api.put(`/hr/employees/${id}`, payload, tenantHeaders(tenantId))
  return data
}

export async function deleteEmployee(_id: number) {
  throw new Error('deleteEmployee requires tenantId: use deleteEmployeeForTenant(tenantId, id)')
}

export async function deleteEmployeeForTenant(tenantId: number, id: number) {
  await api.delete(`/hr/employees/${id}`, tenantHeaders(tenantId))
}

export async function uploadEmployeeDocument(_employeeId: number, _form: FormData) {
  throw new Error('uploadEmployeeDocument requires tenantId: use uploadEmployeeDocumentForTenant(tenantId, employeeId, form)')
}

export async function uploadEmployeeDocumentForTenant(tenantId: number, employeeId: number, form: FormData) {
  const { data } = await api.post(`/hr/employees/${employeeId}/documents`, form, {
    headers: { ...tenantHeaders(tenantId).headers, 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function deleteEmployeeDocument(_employeeId: number, _docId: number) {
  throw new Error('deleteEmployeeDocument requires tenantId: use deleteEmployeeDocumentForTenant(tenantId, employeeId, docId)')
}

export async function deleteEmployeeDocumentForTenant(tenantId: number, employeeId: number, docId: number) {
  await api.delete(`/hr/employees/${employeeId}/documents/${docId}`, tenantHeaders(tenantId))
}

export async function listAttendance(params: Record<string, any>) {
  const tenantId = Number(params?.tenant_id ?? 0)
  const { tenant_id, ...rest } = params ?? {}
  const { data } = await api.get('/hr/attendance', { ...tenantHeaders(tenantId), params: rest })
  return data
}

export async function upsertAttendance(payload: any) {
  const tenantId = Number(payload?.tenant_id ?? 0)
  const { tenant_id, ...rest } = payload ?? {}
  const { data } = await api.post('/hr/attendance', rest, tenantHeaders(tenantId))
  return data
}

export async function listPayrollRuns(params: Record<string, any>) {
  const tenantId = Number(params?.tenant_id ?? 0)
  const { tenant_id, ...rest } = params ?? {}
  const { data } = await api.get('/hr/payroll', { ...tenantHeaders(tenantId), params: rest })
  return data
}

export async function generatePayroll(_payload: { year: number; month: number; branch_id?: number | null }) {
  throw new Error('generatePayroll requires tenantId: use generatePayrollForTenant(tenantId, payload)')
}

export async function generatePayrollForTenant(tenantId: number, payload: { year: number; month: number; branch_id?: number | null }) {
  const { data } = await api.post('/hr/payroll/generate', payload, tenantHeaders(tenantId))
  return data
}

export async function getPayrollRun(_id: number) {
  throw new Error('getPayrollRun requires tenantId: use getPayrollRunForTenant(tenantId, id)')
}

export async function getPayrollRunForTenant(tenantId: number, id: number) {
  const { data } = await api.get(`/hr/payroll/${id}`, tenantHeaders(tenantId))
  return data
}

export async function approvePayrollRun(
  _id: number,
  _payload: { salary_expense_account_id: number; salary_payable_account_id: number; bank_account_id?: number | null }
) {
  throw new Error('approvePayrollRun requires tenantId: use approvePayrollRunForTenant(tenantId, id, payload)')
}

export async function approvePayrollRunForTenant(
  tenantId: number,
  id: number,
  payload: { salary_expense_account_id: number; salary_payable_account_id: number; bank_account_id?: number | null }
) {
  const { data } = await api.post(`/hr/payroll/${id}/approve`, payload, tenantHeaders(tenantId))
  return data
}

export async function listHrRequests(params: Record<string, any>) {
  const tenantId = Number(params?.tenant_id ?? 0)
  const { tenant_id, ...rest } = params ?? {}
  const { data } = await api.get('/hr/requests', { ...tenantHeaders(tenantId), params: rest })
  return data
}

export async function createHrRequest(payload: any) {
  const tenantId = Number(payload?.tenant_id ?? 0)
  const { tenant_id, ...rest } = payload ?? {}
  const { data } = await api.post('/hr/requests', rest, tenantHeaders(tenantId))
  return data
}

export async function approveHrRequest(_id: number) {
  throw new Error('approveHrRequest requires tenantId: use approveHrRequestForTenant(tenantId, id)')
}

export async function approveHrRequestForTenant(tenantId: number, id: number) {
  const { data } = await api.post(`/hr/requests/${id}/approve`, null, tenantHeaders(tenantId))
  return data
}

export async function rejectHrRequest(_id: number, _payload: { reason?: string }) {
  throw new Error('rejectHrRequest requires tenantId: use rejectHrRequestForTenant(tenantId, id, payload)')
}

export async function rejectHrRequestForTenant(tenantId: number, id: number, payload: { reason?: string }) {
  const { data } = await api.post(`/hr/requests/${id}/reject`, payload, tenantHeaders(tenantId))
  return data
}

export async function listAdministrations(params: Record<string, any>) {
  const tenantId = Number(params?.tenant_id ?? 0)
  const { tenant_id, ...rest } = params ?? {}
  const { data } = await api.get('/hr/administrations', { ...tenantHeaders(tenantId), params: rest })
  return data
}

export async function createAdministration(payload: any) {
  const tenantId = Number(payload?.tenant_id ?? 0)
  const { tenant_id, ...rest } = payload ?? {}
  const { data } = await api.post('/hr/administrations', rest, tenantHeaders(tenantId))
  return data
}

export async function updateAdministration(id: number, payload: any) {
  const tenantId = Number(payload?.tenant_id ?? 0)
  const { tenant_id, ...rest } = payload ?? {}
  const { data } = await api.put(`/hr/administrations/${id}`, rest, tenantHeaders(tenantId))
  return data
}

export async function deleteAdministration(_id: number) {
  throw new Error('deleteAdministration requires tenantId: use deleteAdministrationForTenant(tenantId, id)')
}

export async function deleteAdministrationForTenant(tenantId: number, id: number) {
  await api.delete(`/hr/administrations/${id}`, tenantHeaders(tenantId))
}

export async function listDepartments(params: Record<string, any>) {
  const tenantId = Number(params?.tenant_id ?? 0)
  const { tenant_id, ...rest } = params ?? {}
  const { data } = await api.get('/hr/departments', { ...tenantHeaders(tenantId), params: rest })
  return data
}

export async function createDepartment(payload: any) {
  const tenantId = Number(payload?.tenant_id ?? 0)
  const { tenant_id, ...rest } = payload ?? {}
  const { data } = await api.post('/hr/departments', rest, tenantHeaders(tenantId))
  return data
}

export async function updateDepartment(id: number, payload: any) {
  const tenantId = Number(payload?.tenant_id ?? 0)
  const { tenant_id, ...rest } = payload ?? {}
  const { data } = await api.put(`/hr/departments/${id}`, rest, tenantHeaders(tenantId))
  return data
}

export async function deleteDepartment(_id: number) {
  throw new Error('deleteDepartment requires tenantId: use deleteDepartmentForTenant(tenantId, id)')
}

export async function deleteDepartmentForTenant(tenantId: number, id: number) {
  await api.delete(`/hr/departments/${id}`, tenantHeaders(tenantId))
}

// ─── HR Job Titles ────────────────────────────────────────────────────────────

export async function listJobTitles(params: Record<string, any>) {
  const tenantId = Number(params?.tenant_id ?? 0)
  const { tenant_id, ...rest } = params ?? {}
  const { data } = await api.get('/hr/job-titles', { ...tenantHeaders(tenantId), params: rest })
  return data
}

export async function createJobTitle(payload: any) {
  const tenantId = Number(payload?.tenant_id ?? 0)
  const { tenant_id, ...rest } = payload ?? {}
  const { data } = await api.post('/hr/job-titles', rest, tenantHeaders(tenantId))
  return data
}

export async function updateJobTitle(id: number, payload: any) {
  const tenantId = Number(payload?.tenant_id ?? 0)
  const { tenant_id, ...rest } = payload ?? {}
  const { data } = await api.put(`/hr/job-titles/${id}`, rest, tenantHeaders(tenantId))
  return data
}

export async function deleteJobTitleForTenant(tenantId: number, id: number) {
  await api.delete(`/hr/job-titles/${id}`, tenantHeaders(tenantId))
}

// ─── HR Leave Types ───────────────────────────────────────────────────────────

export async function listLeaveTypes(params: Record<string, any>) {
  const tenantId = Number(params?.tenant_id ?? 0)
  const { tenant_id, ...rest } = params ?? {}
  const { data } = await api.get('/hr/leave-types', { ...tenantHeaders(tenantId), params: rest })
  return data
}

export async function createLeaveType(payload: any) {
  const tenantId = Number(payload?.tenant_id ?? 0)
  const { tenant_id, ...rest } = payload ?? {}
  const { data } = await api.post('/hr/leave-types', rest, tenantHeaders(tenantId))
  return data
}

export async function updateLeaveType(id: number, payload: any) {
  const tenantId = Number(payload?.tenant_id ?? 0)
  const { tenant_id, ...rest } = payload ?? {}
  const { data } = await api.put(`/hr/leave-types/${id}`, rest, tenantHeaders(tenantId))
  return data
}

export async function deleteLeaveTypeForTenant(tenantId: number, id: number) {
  await api.delete(`/hr/leave-types/${id}`, tenantHeaders(tenantId))
}

// ─── HR Allowances ────────────────────────────────────────────────────────────

export async function listAllowances(params: Record<string, any>) {
  const tenantId = Number(params?.tenant_id ?? 0)
  const { tenant_id, ...rest } = params ?? {}
  const { data } = await api.get('/hr/allowances', { ...tenantHeaders(tenantId), params: rest })
  return data
}

export async function createAllowance(payload: any) {
  const tenantId = Number(payload?.tenant_id ?? 0)
  const { tenant_id, ...rest } = payload ?? {}
  const { data } = await api.post('/hr/allowances', rest, tenantHeaders(tenantId))
  return data
}

export async function updateAllowance(id: number, payload: any) {
  const tenantId = Number(payload?.tenant_id ?? 0)
  const { tenant_id, ...rest } = payload ?? {}
  const { data } = await api.put(`/hr/allowances/${id}`, rest, tenantHeaders(tenantId))
  return data
}

export async function deleteAllowanceForTenant(tenantId: number, id: number) {
  await api.delete(`/hr/allowances/${id}`, tenantHeaders(tenantId))
}

// ─── HR Deductions ────────────────────────────────────────────────────────────

export async function listDeductions(params: Record<string, any>) {
  const tenantId = Number(params?.tenant_id ?? 0)
  const { tenant_id, ...rest } = params ?? {}
  const { data } = await api.get('/hr/deductions', { ...tenantHeaders(tenantId), params: rest })
  return data
}

export async function createDeduction(payload: any) {
  const tenantId = Number(payload?.tenant_id ?? 0)
  const { tenant_id, ...rest } = payload ?? {}
  const { data } = await api.post('/hr/deductions', rest, tenantHeaders(tenantId))
  return data
}

export async function updateDeduction(id: number, payload: any) {
  const tenantId = Number(payload?.tenant_id ?? 0)
  const { tenant_id, ...rest } = payload ?? {}
  const { data } = await api.put(`/hr/deductions/${id}`, rest, tenantHeaders(tenantId))
  return data
}

export async function deleteDeductionForTenant(tenantId: number, id: number) {
  await api.delete(`/hr/deductions/${id}`, tenantHeaders(tenantId))
}

export async function getEmployeeCompensationForTenant(tenantId: number, employeeId: number) {
  const { data } = await api.get(`/hr/employees/${employeeId}/compensation`, tenantHeaders(tenantId))
  return data
}

export async function getHrSettings() {
  throw new Error('getHrSettings requires tenantId: use getHrSettingsForTenant(tenantId)')
}

export async function getHrSettingsForTenant(tenantId: number) {
  const { data } = await api.get('/hr/settings', tenantHeaders(tenantId))
  return data
}

export async function updateHrSettings(payload: any) {
  const tenantId = Number(payload?.tenant_id ?? 0)
  const { tenant_id, ...rest } = payload ?? {}
  const { data } = await api.put('/hr/settings', rest, tenantHeaders(tenantId))
  return data
}

