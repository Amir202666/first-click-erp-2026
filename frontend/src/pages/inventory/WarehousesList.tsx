import { useState, useCallback, type MouseEvent, type CSSProperties } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchWarehouses,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
  fetchBranches,
  type WarehouseMutationPayload,
} from '../../api/tenant'
import { listEmployees, type Employee } from '../../api/hr'
import type { Warehouse, Branch } from '../../types'
import {
  Plus,
  Trash2,
  Warehouse as WarehouseIcon,
  MapPin,
  Building2,
  Languages,
  UserCircle,
  MoreVertical,
  Edit,
} from 'lucide-react'
import Toast, { type ToastType } from '../../components/ui/Toast'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { useClientSort } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'

export default function WarehousesList() {
  const { currentTenant } = useAuth()
  const { t, isRtl, lang, getDisplayName } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()
  const textAlign = isRtl ? 'text-right' : 'text-left'
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Warehouse | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Warehouse | null>(null)
  const [form, setForm] = useState({
    name: '',
    name_en: '',
    code: '',
    address: '',
    responsible_employee_id: '' as string,
  })
  const [appliesAllBranches, setAppliesAllBranches] = useState(true)
  const [branchIds, setBranchIds] = useState<number[]>([])
  const [touched, setTouched] = useState<{ name: boolean }>({ name: false })
  const [actionsOpenId, setActionsOpenId] = useState<number | null>(null)
  const [actionsAnchor, setActionsAnchor] = useState<{ top: number; left: number; width: number } | null>(null)

  const closeActionsMenu = useCallback(() => {
    setActionsOpenId(null)
    setActionsAnchor(null)
  }, [])

  const openActionsMenu = useCallback((e: MouseEvent, w: Warehouse) => {
    e.stopPropagation()
    const el = e.currentTarget as HTMLElement
    const rect = el.getBoundingClientRect()
    setActionsAnchor({ top: rect.bottom, left: rect.left, width: rect.width })
    setActionsOpenId(w.id)
  }, [])

  const { data, isLoading } = useQuery({
    queryKey: ['warehouses', tenantId],
    queryFn: () => fetchWarehouses(tenantId),
    enabled: !!tenantId,
  })
  const warehouses = data?.data ?? []

  const { sort, toggleSort, sortedRows } = useClientSort(warehouses, [
    { key: 'code', type: 'string', getValue: (w: Warehouse) => w.code ?? '' },
    { key: 'name', type: 'string', getValue: (w: Warehouse) => w.name ?? '' },
    { key: 'name_en', type: 'string', getValue: (w: Warehouse) => w.name_en ?? '' },
    { key: 'address', type: 'string', getValue: (w: Warehouse) => w.address ?? '' },
    { key: 'branches', type: 'string', getValue: (w: Warehouse) => formatWarehouseBranchesCell(w) },
    { key: 'responsible', type: 'string', getValue: (w: Warehouse) => w.responsible_employee?.name ?? '' },
  ], { locale: lang === 'ar' ? 'ar-u-nu-latn' : 'en-US' })

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches', tenantId, 'warehouses'],
    queryFn: () => fetchBranches(tenantId, { status: 'active' }),
    enabled: !!tenantId,
  })

  const { data: employeesRaw } = useQuery({
    queryKey: ['employees', tenantId, 'warehouses-form'],
    queryFn: () =>
      listEmployees({ tenant_id: tenantId, paginate: '0', per_page: 2000, status: 'active' }),
    enabled: !!tenantId,
  })
  const employees: Employee[] = Array.isArray(employeesRaw)
    ? employeesRaw
    : ((employeesRaw as { data?: Employee[] })?.data ?? [])

  const createMut = useMutation({
    mutationFn: (payload: WarehouseMutationPayload) => createWarehouse(tenantId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] })
      setShowForm(false)
      setForm({
        name: '',
        name_en: '',
        code: '',
        address: '',
        responsible_employee_id: '',
      })
      setAppliesAllBranches(true)
      setBranchIds([])
      setToast({ message: t.msg?.updatedSuccess ?? 'تم الحفظ', type: 'success' })
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      setToast({ message: e?.response?.data?.message ?? 'فشل', type: 'error' }),
  })
  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: WarehouseMutationPayload }) =>
      updateWarehouse(tenantId, id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] })
      setEditing(null)
      setForm({
        name: '',
        name_en: '',
        code: '',
        address: '',
        responsible_employee_id: '',
      })
      setAppliesAllBranches(true)
      setBranchIds([])
      setToast({ message: t.msg?.updatedSuccess ?? 'تم التحديث', type: 'success' })
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      setToast({ message: e?.response?.data?.message ?? 'فشل', type: 'error' }),
  })
  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteWarehouse(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] })
      setDeleteTarget(null)
      setToast({ message: t.msg?.deletedSuccess ?? 'تم الحذف', type: 'success' })
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      setToast({ message: e?.response?.data?.message ?? 'فشل', type: 'error' }),
  })

  const openEdit = (w: Warehouse) => {
    setEditing(w)
    setForm({
      name: w.name,
      name_en: w.name_en ?? '',
      code: w.code,
      address: w.address ?? '',
      responsible_employee_id: w.responsible_employee_id ? String(w.responsible_employee_id) : '',
    })
    if (w.applies_to_all_branches === true) {
      setAppliesAllBranches(true)
      setBranchIds([])
    } else if (w.applies_to_all_branches === false) {
      setAppliesAllBranches(false)
      setBranchIds(w.branches?.map((b) => b.id) ?? [])
    } else if (w.branch_id) {
      setAppliesAllBranches(false)
      setBranchIds(w.branches?.length ? w.branches.map((b) => b.id) : [w.branch_id])
    } else {
      setAppliesAllBranches(true)
      setBranchIds([])
    }
  }

  const toggleBranchPick = (id: number) => {
    setBranchIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!appliesAllBranches && branchIds.length === 0) {
      setToast({
        message: t.itemCategories?.selectBranchesRequired ?? 'يرجى اختيار فرع واحد على الأقل.',
        type: 'error',
      })
      return
    }
    const payload: WarehouseMutationPayload = {
      name: form.name,
      name_en: form.name_en.trim() ? form.name_en.trim() : null,
      address: form.address,
      applies_to_all_branches: appliesAllBranches,
      branch_ids: appliesAllBranches ? [] : branchIds,
      responsible_employee_id: form.responsible_employee_id ? Number(form.responsible_employee_id) : null,
    }
    if (editing) {
      payload.code = form.code
      updateMut.mutate({ id: editing.id, payload })
    } else {
      createMut.mutate(payload)
    }
  }

  function formatWarehouseBranchesCell(w: Warehouse): string {
    if (w.applies_to_all_branches === true) {
      return t.itemCategories?.branchesAllShort ?? (isRtl ? 'كل الفروع' : 'All branches')
    }
    if (w.branches?.length) {
      return w.branches.map((b) => getDisplayName(b)).join(isRtl ? '، ' : ', ')
    }
    return w.branch?.name ?? '—'
  }

  return (
    <div className="p-4 space-y-4">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">{t.nav?.warehouses ?? 'المخازن'}</h1>
        <button
          type="button"
          onClick={() => {
            setEditing(null)
            setForm({
              name: '',
              name_en: '',
              code: '',
              address: '',
              responsible_employee_id: '',
            })
            setAppliesAllBranches(true)
            setBranchIds([])
            setTouched({ name: false })
            setShowForm(true)
          }}
          className="btn btn-md btn-primary inline-flex items-center gap-2"
        >
          <Plus size={18} />
          {t.add ?? 'إضافة'} {t.nav?.warehouses ?? 'مخزن'}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : (
          <table className="w-full text-sm table-fixed">
            <thead>
              <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <SortableTh label={t.code ?? 'الكود'} sortKey="code" sortState={sort} onToggle={toggleSort} widthClassName="w-28" className={`${textAlign} font-medium text-slate-700 dark:text-slate-200`} />
                <SortableTh label={t.name ?? 'الاسم'} sortKey="name" sortState={sort} onToggle={toggleSort} widthClassName="w-40" className={`${textAlign} font-medium text-slate-700 dark:text-slate-200`} />
                <SortableTh label={t.nameEn ?? 'الاسم بالإنجليزية'} sortKey="name_en" sortState={sort} onToggle={toggleSort} widthClassName="w-40" className={`${textAlign} font-medium text-slate-700 dark:text-slate-200`} />
                <SortableTh label={t.address ?? 'العنوان'} sortKey="address" sortState={sort} onToggle={toggleSort} widthClassName="w-[14rem]" className={`${textAlign} font-medium text-slate-700 dark:text-slate-200`} />
                <SortableTh label={t.journal?.branch ?? 'الفرع'} sortKey="branches" sortState={sort} onToggle={toggleSort} widthClassName="w-44" className={`${textAlign} font-medium text-slate-700 dark:text-slate-200`} />
                <SortableTh label={t.warehouseForm?.responsibleEmployee ?? 'الموظف المسئول'} sortKey="responsible" sortState={sort} onToggle={toggleSort} widthClassName="w-44" className={`${textAlign} font-medium text-slate-700 dark:text-slate-200`} />
                <th className={`${textAlign} px-4 py-3 font-medium w-24`}>{t.actions ?? 'إجراءات'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400">
                    {t.nav?.warehouses ?? 'المخازن'} — {t.add ?? 'أضف مخزن'}
                  </td>
                </tr>
              ) : (
                sortedRows.map((w) => (
                  <tr key={w.id} className="hover:bg-slate-50">
                    <td className={`px-4 py-3 font-mono`}>{w.code}</td>
                    <td className={`px-4 py-3 font-medium`}>{w.name}</td>
                    <td className={`px-4 py-3 text-slate-600`}>{w.name_en?.trim() ? w.name_en : '—'}</td>
                    <td className={`px-4 py-3 text-slate-600`}>{w.address ?? '—'}</td>
                    <td className={`px-4 py-3 text-slate-600`}>{formatWarehouseBranchesCell(w)}</td>
                    <td className={`px-4 py-3 text-slate-600`}>
                      {w.responsible_employee?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 min-w-0">
                      <button
                        type="button"
                        onClick={(e) => openActionsMenu(e, w)}
                        className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-600"
                        title={t.actions ?? 'إجراءات'}
                        aria-label={t.actions ?? 'إجراءات'}
                      >
                        <MoreVertical size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {actionsOpenId !== null && actionsAnchor && (() => {
        const openWh = warehouses.find((x) => x.id === actionsOpenId)
        if (!openWh) return null
        const menuItemClass = `flex items-center gap-2 px-3 py-2 text-sm w-full ${isRtl ? 'text-right' : 'text-left'}`
        /** RTL: عمود الإجراءات غالباً أقصى اليسار — نفتح القائمة يمين الزر. LTR: نفتح يسار الزر. */
        const MENU_MIN = 180
        const pad = 8
        const vw = window.innerWidth
        const top = Math.min(actionsAnchor.top + 4, window.innerHeight - 160)
        const menuStyle: CSSProperties = isRtl
          ? {
              top,
              left: Math.max(pad, Math.min(actionsAnchor.left + actionsAnchor.width, vw - MENU_MIN - pad)),
              right: 'auto',
            }
          : (() => {
              const right = vw - actionsAnchor.left
              const menuLeft = vw - right - MENU_MIN
              if (menuLeft < pad) return { top, left: pad, right: 'auto' }
              return { top, right, left: 'auto' }
            })()
        return (
          <>
            <div className="fixed inset-0 z-[9998]" aria-hidden onClick={closeActionsMenu} />
            <div
              role="menu"
              dir={isRtl ? 'rtl' : 'ltr'}
              className="fixed z-[9999] min-w-[180px] bg-white border border-slate-200 rounded-lg shadow-lg py-1"
              style={menuStyle}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className={`${menuItemClass} text-slate-700 hover:bg-slate-50`}
                onClick={() => {
                  closeActionsMenu()
                  openEdit(openWh)
                }}
              >
                <Edit size={16} className="shrink-0" />
                {t.edit ?? 'تعديل'}
              </button>
              <button
                type="button"
                className={`${menuItemClass} text-red-600 hover:bg-red-50`}
                onClick={() => {
                  setDeleteTarget(openWh)
                  closeActionsMenu()
                }}
              >
                <Trash2 size={16} className="shrink-0" />
                {t.delete ?? 'حذف'}
              </button>
            </div>
          </>
        )
      })()}

      {deleteTarget && (
        <ConfirmDialog
          title={t.delete ?? 'حذف'}
          message={`${t.nav?.warehouses ?? 'المخزن'}: ${deleteTarget.name}`}
          confirmLabel={t.delete ?? 'حذف'}
          variant="danger"
          isLoading={deleteMut.isPending}
          onConfirm={() => deleteMut.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {(showForm || editing) && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 transition-opacity">
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 sm:p-7 transform transition-all"
            dir={isRtl ? 'rtl' : 'ltr'}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base sm:text-lg font-semibold text-slate-900 flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary-50 text-primary-600">
                  <WarehouseIcon size={18} />
                </span>
                {editing ? (t.edit ?? 'تعديل مخزن') : (t.add ?? 'إضافة مخزن')}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false)
                  setEditing(null)
                  setTouched({ name: false })
                  setAppliesAllBranches(true)
                  setBranchIds([])
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* حشوة أوضح: مسافة كافية عن الأيقونة (يمين) وسهم الـ select (يسار في RTL) */}
              {/* الاسم | الاسم بالإنجليزية */}
              <div className="min-w-0">
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  {t.name ?? 'الاسم'}
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 right-3 z-[1] flex items-center text-slate-400">
                    <Building2 size={16} />
                  </span>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    onBlur={() => setTouched((prev) => ({ ...prev, name: true }))}
                    className={`input-app w-full min-w-0 h-10 min-h-10 text-sm !py-2 !pl-3 !pr-11 ${
                      touched.name && !form.name.trim() ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : ''
                    }`}
                    required
                  />
                </div>
                {touched.name && !form.name.trim() && (
                  <p className="mt-1 text-[11px] text-red-500">
                    {isRtl ? 'الاسم مطلوب' : 'Name is required'}
                  </p>
                )}
              </div>
              <div className="min-w-0">
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  {t.nameEn ?? 'الاسم بالإنجليزية'}
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 right-3 z-[1] flex items-center text-slate-400">
                    <Languages size={16} />
                  </span>
                  <input
                    value={form.name_en}
                    onChange={(e) => setForm((f) => ({ ...f, name_en: e.target.value }))}
                    className="input-app w-full min-w-0 h-10 min-h-10 text-sm !py-2 !pl-3 !pr-11"
                    dir="ltr"
                  />
                </div>
              </div>

              {editing && (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    {t.code ?? 'الكود'}
                  </label>
                  <input
                    value={form.code}
                    readOnly
                    className="input-app w-full h-10 text-sm font-mono bg-slate-50 text-slate-600 cursor-default"
                  />
                </div>
              )}

              <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50/40 p-4">
                <div className="flex flex-col">
                  <label className="block w-full text-xs font-medium text-slate-600">
                    {t.itemCategories?.branchesScope ?? t.journal?.branch ?? 'الفروع'}
                  </label>
                  <div className={`mt-2.5 w-full flex flex-wrap gap-x-5 gap-y-2 text-sm ${isRtl ? 'justify-end' : 'justify-start'}`}>
                    <label htmlFor="warehouse-branch-all" className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        id="warehouse-branch-all"
                        type="radio"
                        name="warehouse-branch-scope"
                        checked={appliesAllBranches}
                        onChange={() => {
                          setAppliesAllBranches(true)
                          setBranchIds([])
                        }}
                        className="text-primary-600 border-slate-300 focus:ring-primary-500"
                      />
                      <span className="text-slate-700">
                        {t.itemCategories?.allBranches ?? (isRtl ? 'كل الفروع' : 'All branches')}
                      </span>
                    </label>
                    <label htmlFor="warehouse-branch-specific" className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        id="warehouse-branch-specific"
                        type="radio"
                        name="warehouse-branch-scope"
                        checked={!appliesAllBranches}
                        onChange={() => setAppliesAllBranches(false)}
                        className="text-primary-600 border-slate-300 focus:ring-primary-500"
                      />
                      <span className="text-slate-700">
                        {t.itemCategories?.specificBranches ?? (isRtl ? 'فروع محددة' : 'Specific branches')}
                      </span>
                    </label>
                  </div>
                </div>
                {!appliesAllBranches && (
                  <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                    {branches.filter((b) => b.is_active).length === 0 ? (
                      <p className="text-xs text-slate-500">
                        {lang === 'ar' ? 'لا توجد فروع نشطة.' : 'No active branches.'}
                      </p>
                    ) : (
                      branches
                        .filter((b) => b.is_active)
                        .map((b) => (
                          <label
                            key={b.id}
                            className="flex items-center gap-2 cursor-pointer text-sm text-slate-700 py-0.5"
                          >
                            <input
                              type="checkbox"
                              checked={branchIds.includes(b.id)}
                              onChange={() => toggleBranchPick(b.id)}
                              className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                            />
                            <span>
                              {b.code} — {getDisplayName(b)}
                            </span>
                          </label>
                        ))
                    )}
                  </div>
                )}
              </div>

              <div className="min-w-0 sm:col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  {t.warehouseForm?.responsibleEmployee ?? 'الموظف المسئول'}
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 right-3 z-[1] flex items-center text-slate-400">
                    <UserCircle size={16} />
                  </span>
                  <select
                    value={form.responsible_employee_id}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, responsible_employee_id: e.target.value }))
                    }
                    className={`input-app w-full min-w-0 h-10 min-h-10 text-sm !py-2 ${
                      isRtl ? '!pl-10 !pr-11' : '!pl-3 !pr-12'
                    }`}
                  >
                    <option value="">
                      {t.warehouseForm?.noResponsibleEmployee ??
                        (isRtl ? '— بدون موظف مسئول —' : '— No responsible employee —')}
                    </option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={String(emp.id)}>
                        {emp.code} — {emp.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* العنوان */}
              <div className="sm:col-span-2 min-w-0">
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  {t.address ?? 'العنوان'}
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 right-3 z-[1] flex items-center text-slate-400">
                    <MapPin size={16} />
                  </span>
                  <input
                    value={form.address}
                    onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                    className="input-app w-full min-w-0 h-10 min-h-10 text-sm !py-2 !pl-3 !pr-11"
                  />
                </div>
              </div>
              <div className="sm:col-span-2 flex gap-2 justify-end mt-3 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false)
                    setEditing(null)
                    setTouched({ name: false })
                    setAppliesAllBranches(true)
                    setBranchIds([])
                  }}
                  className="btn btn-md btn-secondary"
                >
                  {t.cancel ?? 'إلغاء'}
                </button>
                <button
                  type="submit"
                  className="btn btn-md btn-primary"
                  disabled={createMut.isPending || updateMut.isPending}
                >
                  {editing ? (t.save ?? 'حفظ') : (t.add ?? 'إضافة')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
