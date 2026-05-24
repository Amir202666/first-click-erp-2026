import { useMemo, useState, useCallback, type MouseEvent, type CSSProperties } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchPricingGroups, createPricingGroup, updatePricingGroup, deletePricingGroup, fetchSettings, fetchBranches, fetchTenantUsers } from '../../api/tenant'
import type { Branch, PricingGroup, TenantSettings, TenantUserItem } from '../../types'
import { formatAmount } from '../../utils/currency'
import { Plus, Trash2, X, BadgePercent, MoreVertical, Edit } from 'lucide-react'
import Toast, { type ToastType } from '../../components/ui/Toast'
import { useClientSort } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'

const emptyForm = {
  name: '',
  operation_type: 'discount_percent' as 'discount_percent' | 'increase_percent' | 'fixed_price',
  value: 0,
  is_active: true,
  branch_ids: [] as number[],
  tenant_user_ids: [] as number[],
}

export default function PricingGroups() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()

  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<PricingGroup | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [deleteTarget, setDeleteTarget] = useState<PricingGroup | null>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [actionsOpenId, setActionsOpenId] = useState<number | null>(null)
  const [actionsAnchor, setActionsAnchor] = useState<{ top: number; left: number; width: number } | null>(null)

  function showToast(message: string, type: ToastType) {
    setToast({ message, type })
  }

  const closeActionsMenu = useCallback(() => {
    setActionsOpenId(null)
    setActionsAnchor(null)
  }, [])

  const openActionsMenu = useCallback((e: MouseEvent, g: PricingGroup) => {
    e.stopPropagation()
    const el = e.currentTarget as HTMLElement
    const rect = el.getBoundingClientRect()
    setActionsAnchor({ top: rect.bottom, left: rect.left, width: rect.width })
    setActionsOpenId(g.id)
  }, [])

  const { data: groups = [], isLoading } = useQuery<PricingGroup[]>({
    queryKey: ['pricing-groups', tenantId],
    queryFn: () => fetchPricingGroups(tenantId),
    enabled: !!tenantId,
  })

  const operationSortLabel = useCallback((g: PricingGroup) => {
    const op = g.operation_type ?? (g.pricing_type === 'fixed' ? 'fixed_price' : 'discount_percent')
    if (op === 'discount_percent') return t.pricingGroups.discountPercent
    if (op === 'increase_percent') return t.pricingGroups.increasePercent
    return t.pricingGroups.fixedPrice
  }, [t.pricingGroups.discountPercent, t.pricingGroups.fixedPrice, t.pricingGroups.increasePercent])

  const { sort, toggleSort, sortedRows } = useClientSort(groups, [
    { key: 'name', type: 'string', getValue: (g: PricingGroup) => g.name ?? '' },
    { key: 'operation', type: 'string', getValue: (g: PricingGroup) => operationSortLabel(g) },
    { key: 'value', type: 'number', getValue: (g: PricingGroup) => Number(g.value) },
    { key: 'status', type: 'string', getValue: (g: PricingGroup) => (g.is_active ? t.active : t.inactive) },
  ], { locale: lang === 'ar' ? 'ar-u-nu-latn' : 'en-US' })

  const { data: settings } = useQuery<TenantSettings>({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })

  const { data: branchesData } = useQuery({
    queryKey: ['branches', tenantId, 'pricing-groups'],
    queryFn: () => fetchBranches(tenantId, { status: 'active' }),
    enabled: !!tenantId && showModal,
  })
  const branches: Branch[] = useMemo(() => {
    const res = branchesData as unknown
    if (Array.isArray(res)) return res as Branch[]
    if (res && typeof res === 'object' && 'data' in (res as any)) return ((res as any).data ?? []) as Branch[]
    return []
  }, [branchesData])

  const { data: tenantUsersRes } = useQuery({
    queryKey: ['tenant-users', tenantId, 'pricing-groups'],
    queryFn: () => fetchTenantUsers(tenantId),
    enabled: !!tenantId && showModal,
  })
  const tenantUsers: TenantUserItem[] = (tenantUsersRes?.data ?? []) as TenantUserItem[]

  const createMut = useMutation({
    mutationFn: (d: Partial<PricingGroup>) => createPricingGroup(tenantId, d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pricing-groups', tenantId] })
      closeModal()
      showToast(t.msg.addedSuccess, 'success')
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.errors?.name?.[0] ||
        err?.response?.data?.errors?.[0] ||
        t.msg.addError
      showToast(msg, 'error')
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data: d }: { id: number; data: Partial<PricingGroup> }) => updatePricingGroup(tenantId, id, d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pricing-groups', tenantId] })
      closeModal()
      showToast(t.msg.updatedSuccess, 'success')
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.errors?.name?.[0] ||
        err?.response?.data?.errors?.[0] ||
        t.msg.updateError
      showToast(msg, 'error')
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deletePricingGroup(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pricing-groups', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['customers', tenantId] })
      setDeleteTarget(null)
      showToast(t.msg.deletedSuccess, 'success')
    },
    onError: (err: any) => {
      setDeleteTarget(null)
      showToast(err?.response?.data?.message ?? t.msg.deleteError, 'error')
    },
  })

  function closeModal() {
    setShowModal(false)
    setEditing(null)
    setForm(emptyForm)
  }

  function openEdit(g: PricingGroup) {
    setEditing(g)
    const selectedBranchIds = Array.isArray(g.branches) ? g.branches.map((b) => b.id) : []
    const selectedTenantUserIds = Array.isArray(g.tenantUsers) ? g.tenantUsers.map((tu) => tu.id) : []
    setForm({
      name: g.name,
      operation_type: (g.operation_type ?? (g.pricing_type === 'fixed' ? 'fixed_price' : 'discount_percent')) as
        | 'discount_percent'
        | 'increase_percent'
        | 'fixed_price',
      value: Number(g.value),
      is_active: g.is_active,
      branch_ids: selectedBranchIds,
      tenant_user_ids: selectedTenantUserIds,
    })
    setShowModal(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const payload: Partial<PricingGroup> = {
      name: form.name.trim(),
      operation_type: form.operation_type,
      value: form.value,
      is_active: form.is_active,
      branch_ids: form.branch_ids,
      tenant_user_ids: form.tenant_user_ids,
    }
    if (editing) updateMut.mutate({ id: editing.id, data: payload })
    else createMut.mutate(payload)
  }

  const isSaving = createMut.isPending || updateMut.isPending
  const thAlign = isRtl ? 'text-right' : 'text-left'
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const amountDecimals = Math.min(20, Math.max(0, Math.floor(Number(settings?.doc_amount_decimals ?? 2))))
  const fmt = (n: number) => formatAmount(n, { decimal_places: amountDecimals }, locale)

  return (
    <div className="p-6 space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
            <BadgePercent size={20} className="text-primary-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{t.pricingGroups.title}</h1>
        </div>
        <button
          onClick={() => {
            setForm(emptyForm)
            setEditing(null)
            setShowModal(true)
          }}
          className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-4 py-2 text-sm transition-colors"
        >
          <Plus size={18} />
          {t.pricingGroups.addGroup}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : (
          <div className="overflow-x-auto show-scrollbar">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="bg-slate-50 text-slate-600">
                  <SortableTh label={t.pricingGroups.groupName} sortKey="name" sortState={sort} onToggle={toggleSort} widthClassName="w-[18rem]" className={`${thAlign} font-medium text-slate-700 dark:text-slate-200`} />
                  <SortableTh label={t.pricingGroups.operationType} sortKey="operation" sortState={sort} onToggle={toggleSort} widthClassName="w-44" className={`${thAlign} font-medium text-slate-700 dark:text-slate-200`} />
                  <SortableTh label={t.pricingGroups.value} sortKey="value" sortState={sort} onToggle={toggleSort} widthClassName="w-36" className={`${thAlign} font-medium text-slate-700 dark:text-slate-200`} />
                  <SortableTh label={t.status} sortKey="status" sortState={sort} onToggle={toggleSort} widthClassName="w-28" className={`${thAlign} font-medium text-slate-700 dark:text-slate-200`} />
                  <th className={`${thAlign} px-4 py-3 font-medium w-28`}>{t.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-slate-400">
                      {t.pricingGroups.noGroups}
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((g) => (
                    <tr key={g.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{g.name}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {(() => {
                          const op = g.operation_type ?? (g.pricing_type === 'fixed' ? 'fixed_price' : 'discount_percent')
                          if (op === 'discount_percent') return t.pricingGroups.discountPercent
                          if (op === 'increase_percent') return t.pricingGroups.increasePercent
                          return t.pricingGroups.fixedPrice
                        })()}
                      </td>
                      <td className={`px-4 py-3 text-slate-700 font-semibold tabular-nums ${thAlign}`}>
                        <span dir="ltr" className="inline-block">
                          {(() => {
                            const op = g.operation_type ?? (g.pricing_type === 'fixed' ? 'fixed_price' : 'discount_percent')
                            return op === 'fixed_price' ? fmt(Number(g.value)) : `${fmt(Number(g.value))}%`
                          })()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                            g.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {g.is_active ? t.active : t.inactive}
                        </span>
                      </td>
                      <td className="px-4 py-3 min-w-0">
                        <button
                          type="button"
                          onClick={(e) => openActionsMenu(e, g)}
                          className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-600"
                          title={t.actions}
                          aria-label={t.actions}
                        >
                          <MoreVertical size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {actionsOpenId !== null && actionsAnchor && (() => {
        const openGroup = groups.find((x) => x.id === actionsOpenId)
        if (!openGroup) return null
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
                  openEdit(openGroup)
                }}
              >
                <Edit size={16} className="shrink-0" />
                {t.edit}
              </button>
              <button
                type="button"
                className={`${menuItemClass} text-red-600 hover:bg-red-50`}
                onClick={() => {
                  setDeleteTarget(openGroup)
                  closeActionsMenu()
                }}
              >
                <Trash2 size={16} className="shrink-0" />
                {t.delete}
              </button>
            </div>
          </>
        )
      })()}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={closeModal}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">
                {editing ? t.pricingGroups.editGroup : t.pricingGroups.addGroup}
              </h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.pricingGroups.groupName} *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t.pricingGroups.operationType}</label>
                  <select
                    value={form.operation_type}
                    onChange={(e) => setForm((f) => ({ ...f, operation_type: e.target.value as 'discount_percent' | 'increase_percent' | 'fixed_price' }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                  >
                    <option value="discount_percent">{t.pricingGroups.discountPercent}</option>
                    <option value="increase_percent">{t.pricingGroups.increasePercent}</option>
                    <option value="fixed_price">{t.pricingGroups.fixedPrice}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t.pricingGroups.value}</label>
                  <input
                    type="number"
                    value={form.value}
                    onChange={(e) => setForm((f) => ({ ...f, value: Number(e.target.value) }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                    step="0.01"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm text-slate-700 pb-2 select-none">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                      className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    />
                    {t.active}
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="border border-slate-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-slate-700">{lang === 'ar' ? 'الفروع' : 'Branches'}</span>
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, branch_ids: [] }))}
                      className="text-xs text-slate-500 hover:text-slate-700"
                    >
                      {lang === 'ar' ? 'كل الفروع' : 'All branches'}
                    </button>
                  </div>
                  <div className="max-h-44 overflow-y-auto show-scrollbar space-y-1 pr-1">
                    {branches.filter((b) => b.is_active).map((b) => {
                      const checked = form.branch_ids.includes(b.id)
                      return (
                        <label key={b.id} className="flex items-center gap-2 text-sm cursor-pointer py-1">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setForm((f) => ({
                                ...f,
                                branch_ids: checked ? f.branch_ids.filter((x) => x !== b.id) : [...f.branch_ids, b.id],
                              }))
                            }
                            className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                          />
                          <span className="text-slate-700">{lang === 'ar' ? b.name : b.name_en || b.name}</span>
                        </label>
                      )
                    })}
                    {branches.filter((b) => b.is_active).length === 0 ? (
                      <p className="text-sm text-slate-400">—</p>
                    ) : null}
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    {lang === 'ar' ? 'اتركها بدون تحديد لتكون متاحة لكل الفروع.' : 'Leave empty to allow all branches.'}
                  </p>
                </div>

                <div className="border border-slate-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-slate-700">{lang === 'ar' ? 'المستخدمون' : 'Users'}</span>
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, tenant_user_ids: [] }))}
                      className="text-xs text-slate-500 hover:text-slate-700"
                    >
                      {lang === 'ar' ? 'كل المستخدمين' : 'All users'}
                    </button>
                  </div>
                  <div className="max-h-44 overflow-y-auto show-scrollbar space-y-1 pr-1">
                    {tenantUsers
                      .filter((u) => u.pivot?.is_active)
                      .map((u) => {
                        const tenantUserId = u.pivot?.id ?? null
                        const isChecked = tenantUserId != null ? form.tenant_user_ids.includes(tenantUserId) : false
                        return (
                          <label key={u.id} className="flex items-center gap-2 text-sm cursor-pointer py-1">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                if (tenantUserId == null) return
                                setForm((f) => ({
                                  ...f,
                                  tenant_user_ids: isChecked ? f.tenant_user_ids.filter((x) => x !== tenantUserId) : [...f.tenant_user_ids, tenantUserId],
                                }))
                              }}
                              className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                            />
                            <span className="text-slate-700">{u.name}</span>
                          </label>
                        )
                      })}
                    {tenantUsers.filter((u) => u.pivot?.is_active).length === 0 ? <p className="text-sm text-slate-400">—</p> : null}
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    {lang === 'ar' ? 'اتركها بدون تحديد لتكون متاحة لكل المستخدمين.' : 'Leave empty to allow all users.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button type="button" onClick={closeModal} className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50">
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-500 disabled:opacity-50"
                >
                  {isSaving ? t.saving : t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setDeleteTarget(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">{t.delete}</h3>
              <button onClick={() => setDeleteTarget(null)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-sm text-slate-600">{t.pricingGroups.confirmDelete.replace('{name}', deleteTarget.name)}</p>
              <div className="flex items-center justify-end gap-2">
                <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50">
                  {t.cancel}
                </button>
                <button
                  onClick={() => deleteMut.mutate(deleteTarget.id)}
                  className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-500 disabled:opacity-50"
                  disabled={deleteMut.isPending}
                >
                  {deleteMut.isPending ? t.deleting : t.delete}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

