import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchRoles, fetchPermissions, createRole, updateRole, deleteRole, fetchPricingGroups } from '../../api/tenant'
import type { Role, Permission, PricingGroup } from '../../types'
import { Plus, Pencil, Trash2, X, Search, Check, Shield, ArrowLeft } from 'lucide-react'
import Toast, { type ToastType } from '../../components/ui/Toast'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { useClientSort } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'

/** أسماء الأقسام بالعربية للعرض */
const MODULE_LABELS: Record<string, string> = {
  accounts: 'الحسابات',
  customers: 'العملاء',
  vendors: 'الموردون',
  items: 'الأصناف',
  inventory: 'المخزون',
  invoices: 'الفواتير',
  quotations: 'عروض الأسعار',
  payments: 'المدفوعات',
  journal: 'القيد اليومي',
  branches: 'الفروع',
  cost_centers: 'مراكز التكلفة',
  reports: 'التقارير',
  users: 'المستخدمون',
  roles: 'الأدوار والصلاحيات',
  settings: 'الإعدادات',
  dashboard: 'لوحة التحكم',
  pos: 'نقطة البيع',
  opening_stock: 'الرصيد الافتتاحي',
  document_templates: 'قوالب المستندات',
  audit: 'سجل التدقيق',
}

/** وصف مختصر للصلاحية (للـ tooltip) */
function getPermissionDescription(p: Permission, lang: string): string {
  const name = lang === 'ar' ? p.name_ar : (p.name_en || p.name_ar)
  const key = (p.key || '').toLowerCase()
  if (key.includes('delete') || key.includes('destroy')) return `${name} — عملية حذف`
  if (key.includes('create') || key.includes('store')) return `${name} — إضافة جديد`
  if (key.includes('update') || key.includes('edit')) return `${name} — تعديل`
  if (key.includes('view') || key.includes('show') || key.includes('index')) return `${name} — عرض وقراءة`
  return name
}

/** هل الصلاحية خطيرة (حذف) لتمييزها بالأحمر */
function isDangerPermission(p: Permission): boolean {
  const key = (p.key || '').toLowerCase()
  return key.includes('delete') || key.includes('destroy')
}

/** مفتاح تبديل (Switch) بديل عن الـ checkbox */
function Switch({
  checked,
  onChange,
  disabled,
  danger,
}: { checked: boolean; onChange: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={`
        relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent
        transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:ring-offset-2
        disabled:cursor-not-allowed disabled:opacity-50
        ${checked ? (danger ? 'bg-red-600' : 'bg-primary-600') : 'bg-slate-200'}
      `}
    >
      <span
        className={`
          pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out
          ${checked ? 'translate-x-5' : 'translate-x-1'}
        `}
      />
    </button>
  )
}

export default function RoleList() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()
  const [showNameForm, setShowNameForm] = useState(false)
  const [editingName, setEditingName] = useState<Role | null>(null)
  const [permissionsViewRole, setPermissionsViewRole] = useState<Role | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [form, setForm] = useState({ name: '', description: '', permission_ids: [] as number[], pricing_group_ids: [] as number[] })
  const [permissionSearch, setPermissionSearch] = useState('')
  const [selectedModuleKey, setSelectedModuleKey] = useState<string | null>(null)
  const permissionsSyncedRef = useRef<number | null>(null)

  const { data: rolesRes, isLoading } = useQuery({
    queryKey: ['roles', tenantId],
    queryFn: () => fetchRoles(tenantId),
    enabled: !!tenantId,
  })
  const { data: permsRes } = useQuery({
    queryKey: ['permissions', tenantId],
    queryFn: () => fetchPermissions(tenantId),
    enabled: !!tenantId && (showNameForm || !!editingName || !!permissionsViewRole),
  })
  const { data: pricingGroups = [] } = useQuery<PricingGroup[]>({
    queryKey: ['pricing-groups', tenantId, 'roles'],
    queryFn: () => fetchPricingGroups(tenantId),
    enabled: !!tenantId && (showNameForm || !!editingName || !!permissionsViewRole),
  })
  const roles: Role[] = rolesRes?.data ?? []
  type RoleSortKey = 'name' | 'permCount'
  const roleSortColumns = useMemo(
    () => [
      { key: 'name' as RoleSortKey, type: 'string' as const, getValue: (r: Role) => r.name ?? '' },
      {
        key: 'permCount' as RoleSortKey,
        type: 'number' as const,
        getValue: (r: Role) => (r.permissions?.includes('*') ? 1_000_000 : r.permissions?.length ?? 0),
      },
    ],
    [],
  )
  const { sort, toggleSort, sortedRows } = useClientSort<Role, RoleSortKey>(roles, roleSortColumns, {
    locale: lang === 'ar' ? 'ar' : 'en',
  })
  const permissions: Permission[] = permsRes?.data ?? []
  const byModule = (permsRes?.by_module ?? {}) as Record<string, Permission[]>
  const moduleKeys = Object.keys(byModule)
  const activeModuleKey = selectedModuleKey && byModule[selectedModuleKey] ? selectedModuleKey : (moduleKeys[0] ?? null)

  useEffect(() => {
    if (!permissionsViewRole || !permissions.length) return
    if (permissionsSyncedRef.current === permissionsViewRole.id) return
    permissionsSyncedRef.current = permissionsViewRole.id
    const permIds = permissions.filter((p) => permissionsViewRole.permissions?.includes(p.key)).map((p) => p.id)
    setForm((f) => ({
      ...f,
      permission_ids: permIds,
      pricing_group_ids: Array.isArray(permissionsViewRole.pricing_group_ids) ? permissionsViewRole.pricing_group_ids : [],
    }))
  }, [permissionsViewRole?.id, permissions])

  useEffect(() => {
    if (!permissionsViewRole) permissionsSyncedRef.current = null
  }, [permissionsViewRole])

  const createMut = useMutation({
    mutationFn: (payload: { name: string; description?: string }) =>
      createRole(tenantId, { ...payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      setShowNameForm(false)
      setForm({ name: '', description: '', permission_ids: [], pricing_group_ids: [] })
      setToast({ message: t.msg.addedSuccess, type: 'success' })
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setToast({ message: err?.response?.data?.message ?? t.msg.addError, type: 'error' })
    },
  })
  const updateMut = useMutation({
    mutationFn: ({ id, data: d }: { id: number; data: { name?: string; description?: string; permission_ids?: number[]; pricing_group_ids?: number[] } }) =>
      updateRole(tenantId, id, d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      setEditingName(null)
      if (permissionsViewRole) {
        setPermissionsViewRole(null)
      }
      setToast({ message: t.msg.updatedSuccess, type: 'success' })
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setToast({ message: err?.response?.data?.message ?? t.msg.updateError, type: 'error' })
    },
  })
  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteRole(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      setDeleteTarget(null)
      setToast({ message: t.msg.deletedSuccess, type: 'success' })
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setDeleteTarget(null)
      setToast({ message: err?.response?.data?.message ?? t.msg.deleteError, type: 'error' })
    },
  })

  function openNameEdit(r: Role) {
    setEditingName(r)
    setForm({ name: r.name, description: r.description ?? '', permission_ids: [], pricing_group_ids: Array.isArray(r.pricing_group_ids) ? r.pricing_group_ids : [] })
    setShowNameForm(true)
  }

  function openPermissionsView(r: Role) {
    const permIds = permissions.length ? permissions.filter((p) => r.permissions?.includes(p.key)).map((p) => p.id) : []
    setForm((f) => ({
      ...f,
      name: r.name,
      description: r.description ?? '',
      permission_ids: permIds,
      pricing_group_ids: Array.isArray(r.pricing_group_ids) ? r.pricing_group_ids : [],
    }))
    setPermissionsViewRole(r)
    setSelectedModuleKey(moduleKeys[0] ?? null)
    setPermissionSearch('')
  }

  function handleNameSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (editingName) {
      updateMut.mutate({ id: editingName.id, data: { name: form.name, description: form.description || undefined } })
    } else {
      createMut.mutate({ name: form.name, description: form.description || undefined })
    }
  }

  function handlePermissionsSave() {
    if (!permissionsViewRole) return
    updateMut.mutate({ id: permissionsViewRole.id, data: { permission_ids: form.permission_ids, pricing_group_ids: form.pricing_group_ids } })
  }

  function togglePricingGroup(id: number) {
    setForm((f) => ({
      ...f,
      pricing_group_ids: f.pricing_group_ids.includes(id) ? f.pricing_group_ids.filter((x) => x !== id) : [...f.pricing_group_ids, id],
    }))
  }

  function togglePermission(permId: number) {
    setForm((f) => ({
      ...f,
      permission_ids: f.permission_ids.includes(permId) ? f.permission_ids.filter((i) => i !== permId) : [...f.permission_ids, permId],
    }))
  }

  function setModulePermissions(moduleKey: string, selected: boolean) {
    const perms = byModule[moduleKey] as Permission[] | undefined
    if (!perms?.length) return
    const ids = perms.map((p) => p.id)
    setForm((f) => {
      let next = f.permission_ids.filter((id) => !ids.includes(id))
      if (selected) next = [...next, ...ids]
      return { ...f, permission_ids: next }
    })
  }

  function isModuleFullySelected(moduleKey: string): boolean {
    const perms = byModule[moduleKey] as Permission[] | undefined
    if (!perms?.length) return false
    return perms.every((p) => form.permission_ids.includes(p.id))
  }

  const searchLower = permissionSearch.trim().toLowerCase()
  const byModuleFiltered = useMemo(() => {
    if (!searchLower) return byModule
    const out: Record<string, Permission[]> = {}
    for (const [moduleKey, perms] of Object.entries(byModule)) {
      const list = (perms as Permission[]).filter(
        (p) =>
          (p.name_ar || '').toLowerCase().includes(searchLower) ||
          (p.name_en || '').toLowerCase().includes(searchLower) ||
          (p.key || '').toLowerCase().includes(searchLower),
      )
      if (list.length) out[moduleKey] = list
    }
    return out
  }, [byModule, searchLower])

  const textAlign = isRtl ? 'text-right' : 'text-left'

  if (!tenantId) {
    return (
      <div className="p-6">
        <p className="text-amber-600">{t.accountDefaults?.ensureClientSelected ?? 'يرجى اختيار الشركة أولاً'}</p>
      </div>
    )
  }

  return (
    <div className="page-bg flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-neutral-900">{(t as { userManagement?: { rolesTitle?: string } }).userManagement?.rolesTitle ?? 'الأدوار والصلاحيات'}</h1>
        <button
          type="button"
          onClick={() => {
            setShowNameForm(true)
            setEditingName(null)
            setForm({ name: '', description: '', permission_ids: [], pricing_group_ids: [] })
          }}
          className="btn btn-md btn-primary"
        >
          <Plus size={18} />
          {(t as { userManagement?: { addRole?: string } }).userManagement?.addRole ?? 'إنشاء دور'}
        </button>
      </div>

      <div className="card-app overflow-hidden">
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-500 border-t-transparent" />
        </div>
      ) : (
        <div className="overflow-x-auto">
            <table className="table-zebra w-full text-sm min-w-[400px] table-fixed">
              <thead>
                <tr>
                  <SortableTh
                    label={(t as { userManagement?: { roleName?: string } }).userManagement?.roleName ?? 'اسم الدور'}
                    sortKey="name"
                    sortState={sort}
                    onToggle={toggleSort}
                    className={`${textAlign} p-0 font-bold`}
                  />
                  <SortableTh
                    label={(t as { userManagement?: { permissions?: string } }).userManagement?.permissions ?? 'الصلاحيات'}
                    sortKey="permCount"
                    sortState={sort}
                    onToggle={toggleSort}
                    className={`${textAlign} p-0 font-bold`}
                  />
                  <th className={`${textAlign} font-bold w-28 px-3 py-2`}>{t.actions}</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-center py-12 text-neutral-500">
                      {(t as { userManagement?: { noRoles?: string } }).userManagement?.noRoles ?? 'لا توجد أدوار'}
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <span className="font-medium text-neutral-900">{r.name}</span>
                        {r.is_system && (
                          <span className="ml-2 text-xs text-neutral-500">
                            ({(t as { userManagement?: { systemRole?: string } }).userManagement?.systemRole ?? 'افتراضي'})
                          </span>
                        )}
                      </td>
                      <td className="text-neutral-600 text-xs">
                        {r.permissions?.length ? (r.permissions.includes('*') ? 'الكل' : r.permissions.length + ' صلاحية') : '—'}
                      </td>
                      <td>
                        {!r.is_system && (
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => openNameEdit(r)} className="btn btn-sm btn-secondary p-2" title={t.edit}>
                              <Pencil size={16} />
                            </button>
                            <button type="button" onClick={() => openPermissionsView(r)} className="btn btn-sm btn-primary p-2" title="الصلاحيات">
                              <Shield size={16} />
                            </button>
                            <button type="button" onClick={() => setDeleteTarget(r)} className="btn btn-sm btn-danger p-2" title={t.delete}>
                              <Trash2 size={16} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
      )}
      </div>

      {/* نافذة إضافة/تعديل اسم الدور فقط */}
      {(showNameForm || editingName) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 sm:p-6">
          <div className="card-app shadow-xl max-w-md w-full modal-content-padding max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">
                {editingName
                  ? ((t as { userManagement?: { editRole?: string } }).userManagement?.editRole ?? 'تعديل الدور')
                  : ((t as { userManagement?: { addRole?: string } }).userManagement?.addRole ?? 'إنشاء دور')}
              </h2>
              <button type="button" onClick={() => { setShowNameForm(false); setEditingName(null); }} className="p-2 rounded-app hover:bg-secondary-100 text-slate-600">
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-slate-500 mb-4">يرجى تعبئة الحقول أدناه. الحقول ذات * إلزامية.</p>
            <form onSubmit={handleNameSubmit} className="space-y-4">
              <div>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  className="input-app"
                  placeholder={((t as { userManagement?: { roleName?: string } }).userManagement?.roleName ?? 'اسم الدور') + ' *'}
                />
              </div>
              <div>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="input-app"
                  placeholder={t.description}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" disabled={createMut.isPending || updateMut.isPending} className="btn-primary flex-1">
                  {t.save}
                </button>
                <button type="button" onClick={() => { setShowNameForm(false); setEditingName(null); }} className="btn-secondary">
                  {t.cancel}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* صفحة الصلاحيات: شبكة بطاقات (Grid Cards) حسب الموديولات */}
      {permissionsViewRole && (
        <div
          className={`fixed inset-0 z-50 flex bg-black/50 ${isRtl ? 'lg:right-[16rem] lg:left-0' : 'lg:left-[16rem] lg:right-0'}`}
        >
          <div className="bg-white shadow-xl flex flex-col rounded-none w-full h-full min-w-0 min-h-0">
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-200 flex-shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => { setPermissionsViewRole(null); setSelectedModuleKey(null); }}
                  className="p-2 rounded-app hover:bg-secondary-100 text-slate-600 flex-shrink-0"
                  title={t.cancel}
                >
                  <ArrowLeft size={20} />
                </button>
                <h2 className="text-lg font-semibold text-slate-900 truncate">
                  {(t as { userManagement?: { permissions?: string } }).userManagement?.permissions ?? 'الصلاحيات'} — {permissionsViewRole.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={handlePermissionsSave}
                disabled={updateMut.isPending}
                className="btn btn-md btn-primary flex-shrink-0"
              >
                {t.save}
              </button>
            </div>

            <main className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
              <div className="relative mb-4 max-w-md">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 pointer-events-none" />
                <input
                  type="text"
                  value={permissionSearch}
                  onChange={(e) => setPermissionSearch(e.target.value)}
                  placeholder="بحث عن صلاحية..."
                  className="input-app w-full ps-10 pe-4"
                />
              </div>

              {/* مجموعات التسعير المتاحة للتبديل داخل الفاتورة */}
              <div className="card-app mb-4">
                <div className="card-padding border-b border-neutral-200 bg-neutral-50 flex items-center gap-2">
                  <Shield size={16} className="text-slate-600" />
                  <span className="font-semibold text-slate-800">
                    {lang === 'ar' ? 'مجموعات التسعير المتاحة' : 'Available pricing groups'}
                  </span>
                </div>
                <div className="card-padding">
                  <p className="text-xs text-slate-500 mb-3">
                    {lang === 'ar'
                      ? 'تحدد هذه القائمة مجموعات التسعير التي يستطيع المستخدمون بهذا الدور التبديل بينها يدويًا داخل شاشة الفاتورة (إذا كانت لديهم صلاحية التبديل).'
                      : 'This controls which pricing groups users with this role can switch to manually on the invoice screen (if they have switching permission).'}
                  </p>
                  {(pricingGroups as PricingGroup[]).length === 0 ? (
                    <p className="text-sm text-slate-500">—</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {(pricingGroups as PricingGroup[])
                        .filter((g) => g.is_active)
                        .map((g) => {
                          const checked = form.pricing_group_ids.includes(g.id)
                          return (
                            <label
                              key={g.id}
                              className={`flex items-center gap-2 rounded-app border px-3 py-2 cursor-pointer ${
                                checked ? 'bg-primary-50/60 border-primary-200' : 'bg-white border-neutral-200 hover:border-neutral-300'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => togglePricingGroup(g.id)}
                                className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                              />
                              <span className="text-sm text-slate-700 min-w-0 truncate">{g.name}</span>
                            </label>
                          )
                        })}
                    </div>
                  )}
                </div>
              </div>

              {/* شبكة بطاقات: كل موديول في بطاقة */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {moduleKeys.map((moduleKey) => {
                  const moduleLabel = MODULE_LABELS[moduleKey] ?? moduleKey
                  const perms = (searchLower ? (byModuleFiltered[moduleKey] as Permission[] | undefined) : (byModule[moduleKey] as Permission[] | undefined)) ?? []
                  const allSelected = isModuleFullySelected(moduleKey)
                  return (
                    <div key={moduleKey} className="card-app flex flex-col min-h-0">
                      <div className="card-padding border-b border-neutral-200 bg-neutral-50 flex items-center justify-between flex-wrap gap-2 flex-shrink-0">
                        <span className="font-semibold text-slate-800">{moduleLabel}</span>
                        <button
                          type="button"
                          onClick={() => setModulePermissions(moduleKey, !allSelected)}
                          className="btn btn-sm btn-primary"
                        >
                          <Check size={14} />
                          {allSelected ? 'إلغاء' : 'تحديد الكل'}
                        </button>
                      </div>
                      <div className="p-4 flex flex-col gap-2 overflow-y-auto min-h-0 flex-1 max-h-64 sm:max-h-72">
                        {perms.length === 0 ? (
                          <p className="text-sm text-slate-500 py-2">—</p>
                        ) : (
                          perms.map((p) => {
                            const checked = form.permission_ids.includes(p.id)
                            const danger = isDangerPermission(p)
                            return (
                              <label
                                key={p.id}
                                className={`
                                  flex items-center gap-3 p-2 rounded-app cursor-pointer border transition-colors
                                  ${checked ? (danger ? 'bg-danger-50 border-danger-200' : 'bg-primary-50/50 border-primary-200') : 'bg-neutral-50 border-neutral-200 hover:border-neutral-300'}
                                `}
                                title={getPermissionDescription(p, lang)}
                              >
                                <Switch
                                  checked={checked}
                                  onChange={() => togglePermission(p.id)}
                                  danger={danger}
                                />
                                <span className={`text-sm flex-1 min-w-0 ${danger ? 'text-danger-600 font-bold' : 'text-neutral-700'}`}>
                                  {lang === 'ar' ? p.name_ar : (p.name_en || p.name_ar)}
                                </span>
                              </label>
                            )
                          })
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </main>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={t.delete}
          message={(t as { userManagement?: { confirmDeleteRole?: string } }).userManagement?.confirmDeleteRole ?? 'حذف هذا الدور؟'}
          onConfirm={() => {
            if (deleteTarget) {
              deleteMut.mutate(deleteTarget.id)
              setDeleteTarget(null)
            }
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
