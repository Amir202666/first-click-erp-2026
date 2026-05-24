import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchTenantUsers,
  createTenantUser,
  updateTenantUser,
  deleteTenantUser,
  fetchRoles,
  fetchBranches,
  fetchWarehouses,
} from '../../api/tenant'
import type { TenantUserItem, Role, Branch, Warehouse } from '../../types'
import { Plus, Pencil, UserMinus, X } from 'lucide-react'
import Toast, { type ToastType } from '../../components/ui/Toast'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { asArray } from '../../utils/asArray'
import { useClientSort } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'

export default function TenantUserList() {
  const { currentTenant } = useAuth()
  const { t, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<TenantUserItem | null>(null)
  const [removeTarget, setRemoveTarget] = useState<TenantUserItem | null>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    username: '',
    password: '',
    role_id: '' as string,
    is_active: true,
    default_branch_id: '' as string,
    default_warehouse_id: '' as string,
    restrict_to_branch_warehouse: false,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['tenant-users', tenantId],
    queryFn: () => fetchTenantUsers(tenantId),
    enabled: !!tenantId,
  })
  const { data: rolesData } = useQuery({
    queryKey: ['roles', tenantId],
    queryFn: () => fetchRoles(tenantId),
    enabled: !!tenantId && (showForm || !!editing),
  })
  const { data: branchesData } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId && (showForm || !!editing),
  })
  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses', tenantId],
    queryFn: () => fetchWarehouses(tenantId, { per_page: '500' }),
    enabled: !!tenantId && (showForm || !!editing),
  })
  const roles: Role[] = rolesData?.data ?? []
  const branches: Branch[] = asArray<Branch>(branchesData)
  const warehouses: Warehouse[] = asArray<Warehouse>(warehousesData)
  const users: TenantUserItem[] = data?.data ?? []
  const { sort, toggleSort, sortedRows } = useClientSort(users, [
    { key: 'name', type: 'string', getValue: (u: TenantUserItem) => u.name ?? '' },
    { key: 'email', type: 'string', getValue: (u: TenantUserItem) => u.email ?? '' },
    { key: 'role', type: 'string', getValue: (u: TenantUserItem) => u.pivot.role_name ?? '' },
    { key: 'active', type: 'number', getValue: (u: TenantUserItem) => (u.pivot.is_active ? 1 : 0) },
  ])

  const createMut = useMutation({
    mutationFn: (payload: {
      name: string
      username: string
      password: string
      email?: string
      phone?: string
      role_id?: number
      is_active?: boolean
      default_branch_id?: number | null
      default_warehouse_id?: number | null
      restrict_to_branch_warehouse?: boolean
    }) => createTenantUser(tenantId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-users'] })
      setShowForm(false)
      resetForm()
      setToast({ message: t.msg.addedSuccess, type: 'success' })
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setToast({ message: err?.response?.data?.message ?? t.msg.addError, type: 'error' })
    },
  })
  const updateMut = useMutation({
    mutationFn: ({ userId, data: d }: { userId: number; data: { name?: string; email?: string; phone?: string; username?: string; password?: string; role_id?: number; is_active?: boolean; default_branch_id?: number | null; default_warehouse_id?: number | null; restrict_to_branch_warehouse?: boolean } }) =>
      updateTenantUser(tenantId, userId, d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-users'] })
      setEditing(null)
      setToast({ message: t.msg.updatedSuccess, type: 'success' })
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setToast({ message: err?.response?.data?.message ?? t.msg.updateError, type: 'error' })
    },
  })
  const deleteMut = useMutation({
    mutationFn: (userId: number) => deleteTenantUser(tenantId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-users'] })
      setRemoveTarget(null)
      setToast({ message: t.msg.deletedSuccess, type: 'success' })
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setRemoveTarget(null)
      setToast({ message: err?.response?.data?.message ?? t.msg.deleteError, type: 'error' })
    },
  })

  function resetForm() {
    setForm({ name: '', email: '', phone: '', username: '', password: '', role_id: '', is_active: true, default_branch_id: '', default_warehouse_id: '', restrict_to_branch_warehouse: false })
  }

  function openEdit(u: TenantUserItem) {
    setEditing(u)
    setForm({
      name: u.name,
      email: u.email,
      phone: u.phone ?? '',
      username: u.username ?? '',
      password: '',
      role_id: u.pivot.role_id ? String(u.pivot.role_id) : '',
      is_active: u.pivot.is_active,
      default_branch_id: u.pivot.default_branch_id ? String(u.pivot.default_branch_id) : '',
      default_warehouse_id: u.pivot.default_warehouse_id ? String(u.pivot.default_warehouse_id) : '',
      restrict_to_branch_warehouse: u.pivot.restrict_to_branch_warehouse ?? false,
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const pwd = form.password ?? ''
    if (!editing || pwd) {
      const validPwd = /^(?=.*[A-Za-z])(?=.*\d).+$/.test(pwd)
      if (!validPwd) {
        setToast({ message: (t as any)?.msg?.invalidPassword ?? 'كلمة المرور يجب أن تحتوي على حروف وأرقام', type: 'error' })
        return
      }
    }
    const branchId = form.default_branch_id ? parseInt(form.default_branch_id) : null
    const warehouseId = form.default_warehouse_id ? parseInt(form.default_warehouse_id) : null
    if (editing) {
      updateMut.mutate({
        userId: editing.id,
        data: {
          name: form.name || undefined,
          email: form.email || undefined,
          phone: form.phone || undefined,
          username: form.username || undefined,
          password: form.password || undefined,
          role_id: form.role_id ? parseInt(form.role_id) : undefined,
          is_active: form.is_active,
          default_branch_id: branchId,
          default_warehouse_id: warehouseId,
          restrict_to_branch_warehouse: form.restrict_to_branch_warehouse,
        },
      })
    } else {
      createMut.mutate({
        name: form.name,
        username: form.username,
        password: form.password,
        email: form.email || undefined,
        phone: form.phone || undefined,
        role_id: form.role_id ? parseInt(form.role_id) : undefined,
        is_active: form.is_active,
        default_branch_id: branchId ?? undefined,
        default_warehouse_id: warehouseId ?? undefined,
        restrict_to_branch_warehouse: form.restrict_to_branch_warehouse,
      })
    }
  }

  const textAlign = isRtl ? 'text-right' : 'text-left'
  const inputClass = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none'

  if (!tenantId) {
    return (
      <div className="p-6">
        <p className="text-amber-600">{t.accountDefaults?.ensureClientSelected ?? 'يرجى اختيار الشركة أولاً'}</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">{(t as { userManagement?: { usersTitle?: string } }).userManagement?.usersTitle ?? 'مستخدمي الشركة'}</h1>
        <button
          type="button"
          onClick={() => { setShowForm(true); setEditing(null); resetForm(); }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 text-sm font-medium"
        >
          <Plus size={18} />
          {(t as { userManagement?: { addUser?: string } }).userManagement?.addUser ?? 'إضافة مستخدم'}
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-500 border-t-transparent" /></div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="bg-slate-50 text-slate-600">
                  <SortableTh label={(t as { userManagement?: { userName?: string } }).userManagement?.userName ?? 'الاسم'} sortKey="name" sortState={sort} onToggle={toggleSort} widthClassName="w-[18rem]" className={`${textAlign} font-medium text-slate-700 dark:text-slate-200`} />
                  <SortableTh label={(t as { userManagement?: { email?: string } }).userManagement?.email ?? 'البريد'} sortKey="email" sortState={sort} onToggle={toggleSort} widthClassName="w-[18rem]" className={`${textAlign} font-medium text-slate-700 dark:text-slate-200`} />
                  <SortableTh label={(t as { userManagement?: { role?: string } }).userManagement?.role ?? 'الدور'} sortKey="role" sortState={sort} onToggle={toggleSort} widthClassName="w-44" className={`${textAlign} font-medium text-slate-700 dark:text-slate-200`} />
                  <SortableTh label={(t as { userManagement?: { isActive?: string } }).userManagement?.isActive ?? 'نشط'} sortKey="active" sortState={sort} onToggle={toggleSort} widthClassName="w-28" className={`${textAlign} font-medium text-slate-700 dark:text-slate-200`} />
                  <th className={`${textAlign} px-4 py-3 font-medium w-24`}>{t.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sortedRows.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-12 text-slate-400">{(t as { userManagement?: { noUsers?: string } }).userManagement?.noUsers ?? 'لا يوجد مستخدمون'}</td></tr>
                ) : (
                  sortedRows.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">{u.name}</td>
                      <td className="px-4 py-3 text-slate-600">{u.email}</td>
                      <td className="px-4 py-3">{u.pivot.role_name}</td>
                      <td className="px-4 py-3">{u.pivot.is_active ? t.active : t.inactive}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => openEdit(u)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600" title={t.edit}>
                            <Pencil size={16} />
                          </button>
                          <button type="button" onClick={() => setRemoveTarget(u)} className="p-2 rounded-lg hover:bg-red-50 text-red-600" title={t.delete}>
                            <UserMinus size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(showForm || editing) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold">{editing ? ((t as { userManagement?: { editUser?: string } }).userManagement?.editUser ?? 'تعديل المستخدم') : ((t as { userManagement?: { addUser?: string } }).userManagement?.addUser ?? 'إضافة مستخدم')}</h2>
              <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} className="p-2 rounded-lg hover:bg-slate-100"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div className="grid md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder={((t as { userManagement?: { userName?: string } }).userManagement?.userName ?? 'الاسم')} required />
                </div>
                <div>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} placeholder={((t as { userManagement?: { email?: string } }).userManagement?.email ?? 'البريد (اختياري)')} />
                </div>
                <div>
                  <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputClass} placeholder={(t as any)?.userManagement?.phone ?? 'رقم الهاتف (اختياري)'} />
                </div>
                <div>
                  <input type="text" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className={inputClass} placeholder={(t as any)?.userManagement?.username ?? 'اسم المستخدم'} required />
                </div>
                <div>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder={(t.password ?? 'كلمة المرور') + (editing ? ' (اتركها فارغة لعدم التغيير)' : ' (حروف وأرقام)')}
                    className={inputClass}
                    minLength={8}
                    required={!editing}
                  />
                </div>
              </div>
              <div>
                <select value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })} className={inputClass}>
                  <option value="">— {((t as { userManagement?: { role?: string } }).userManagement?.role ?? 'الدور')} —</option>
                  {roles.filter((r) => r.tenant_id === tenantId || r.tenant_id === null).map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <select value={form.default_branch_id} onChange={(e) => setForm({ ...form, default_branch_id: e.target.value })} className={inputClass}>
                  <option value="">— {((t as { journal?: { branch?: string } }).journal?.branch ?? 'الفرع الافتراضي')} —</option>
                  {branches.filter((b) => b.is_active).map((b) => (
                    <option key={b.id} value={b.id}>{b.code} - {b.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <select value={form.default_warehouse_id} onChange={(e) => setForm({ ...form, default_warehouse_id: e.target.value })} className={inputClass}>
                  <option value="">— {((t as { invoices?: { warehouse?: string } }).invoices?.warehouse ?? 'المخزن المسموح')} —</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.code ? `${w.code} - ` : ''}{w.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="restrict_branch_warehouse" checked={form.restrict_to_branch_warehouse} onChange={(e) => setForm({ ...form, restrict_to_branch_warehouse: e.target.checked })} className="rounded" />
                <label htmlFor="restrict_branch_warehouse">تقييد الوصول لفرع/مخزن المستخدم فقط (تقارير ونقطة بيع)</label>
              </div>
              {editing && (
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="is_active" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="rounded" />
                  <label htmlFor="is_active">{(t as { userManagement?: { isActive?: string } }).userManagement?.isActive ?? 'نشط'}</label>
                </div>
              )}
              {!editing && (
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="is_active_new" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="rounded" />
                  <label htmlFor="is_active_new">{(t as { userManagement?: { isActive?: string } }).userManagement?.isActive ?? 'نشط'}</label>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <button type="submit" disabled={createMut.isPending || updateMut.isPending} className="flex-1 bg-primary-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-primary-500 disabled:opacity-50">
                  {createMut.isPending || updateMut.isPending ? t.saving : t.save}
                </button>
                <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} className="px-4 py-2 border border-slate-300 rounded-lg text-sm">{t.cancel}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {removeTarget && (
        <ConfirmDialog
          title={t.delete}
          message={(t as { userManagement?: { confirmRemoveUser?: string } }).userManagement?.confirmRemoveUser ?? 'إلغاء ربط هذا المستخدم بالشركة؟'}
          onConfirm={() => { deleteMut.mutate(removeTarget.id); setRemoveTarget(null); }}
          onCancel={() => setRemoveTarget(null)}
        />
      )}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
