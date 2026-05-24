import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchCustomerGroups,
  createCustomerGroup,
  updateCustomerGroup,
  deleteCustomerGroup,
  fetchSettings,
} from '../../api/tenant'
import type { CustomerGroup, TenantSettings } from '../../types'
import { formatAmount } from '../../utils/currency'
import { Plus, Pencil, Trash2, X, Users } from 'lucide-react'
import { useClientSort } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'

const emptyForm = {
  name: '',
  discount_type: 'percent' as 'percent' | 'fixed',
  discount_value: 0,
  is_active: true,
}

export default function CustomerGroups() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()

  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<CustomerGroup | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [deleteTarget, setDeleteTarget] = useState<CustomerGroup | null>(null)

  const { data: groups = [], isLoading } = useQuery<CustomerGroup[]>({
    queryKey: ['customer-groups', tenantId],
    queryFn: () => fetchCustomerGroups(tenantId),
    enabled: !!tenantId,
  })

  const { sort, toggleSort, sortedRows } = useClientSort(groups, [
    { key: 'name', type: 'string', getValue: (g: CustomerGroup) => g.name ?? '' },
    { key: 'discount_type', type: 'string', getValue: (g: CustomerGroup) => (g.discount_type === 'percent' ? t.customerGroups.percent : t.customerGroups.fixed) },
    { key: 'discount_value', type: 'number', getValue: (g: CustomerGroup) => Number(g.discount_value) },
    { key: 'status', type: 'string', getValue: (g: CustomerGroup) => (g.is_active ? t.active : t.inactive) },
  ], { locale: lang === 'ar' ? 'ar-u-nu-latn' : 'en-US' })

  const { data: settings } = useQuery<TenantSettings>({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })

  const createMut = useMutation({
    mutationFn: (d: Partial<CustomerGroup>) => createCustomerGroup(tenantId, d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-groups', tenantId] })
      closeModal()
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data: d }: { id: number; data: Partial<CustomerGroup> }) =>
      updateCustomerGroup(tenantId, id, d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-groups', tenantId] })
      closeModal()
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteCustomerGroup(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-groups', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['customers', tenantId] })
      setDeleteTarget(null)
    },
  })

  function closeModal() {
    setShowModal(false)
    setEditing(null)
    setForm(emptyForm)
  }

  function openEdit(g: CustomerGroup) {
    setEditing(g)
    setForm({
      name: g.name,
      discount_type: g.discount_type,
      discount_value: Number(g.discount_value),
      is_active: g.is_active,
    })
    setShowModal(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const payload = {
      name: form.name.trim(),
      discount_type: form.discount_type,
      discount_value: form.discount_value,
      is_active: form.is_active,
    }
    if (editing) {
      updateMut.mutate({ id: editing.id, data: payload })
    } else {
      createMut.mutate(payload)
    }
  }

  const isSaving = createMut.isPending || updateMut.isPending
  /** محاذاة منطقية مع اتجاه الجدول */
  const textStart = 'text-start'
  const textCenter = 'text-center'
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const amountDecimals = Math.min(20, Math.max(0, Math.floor(Number(settings?.doc_amount_decimals ?? 2))))
  const fmt = (n: number) => formatAmount(n, { decimal_places: amountDecimals }, locale)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
            <Users size={20} className="text-primary-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{t.customerGroups.title}</h1>
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
          {t.customerGroups.addGroup}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed" dir={isRtl ? 'rtl' : 'ltr'}>
              <thead>
                <tr className="bg-slate-50 text-slate-600">
                  <SortableTh
                    label={t.customerGroups.groupName}
                    sortKey="name"
                    sortState={sort}
                    onToggle={toggleSort}
                    widthClassName="w-[18rem]"
                    className={`${textStart} font-medium text-slate-700 dark:text-slate-200`}
                  />
                  <SortableTh
                    label={t.customerGroups.discountType}
                    sortKey="discount_type"
                    sortState={sort}
                    onToggle={toggleSort}
                    widthClassName="w-36"
                    className={`${textStart} font-medium text-slate-700 dark:text-slate-200`}
                  />
                  <SortableTh
                    label={t.customerGroups.discountValue}
                    sortKey="discount_value"
                    sortState={sort}
                    onToggle={toggleSort}
                    widthClassName="w-36"
                    headerLayout="clusterCenter"
                    className={`${textCenter} font-medium text-slate-700 dark:text-slate-200 tabular-nums`}
                  />
                  <SortableTh
                    label={t.status}
                    sortKey="status"
                    sortState={sort}
                    onToggle={toggleSort}
                    widthClassName="w-28"
                    headerLayout="clusterCenter"
                    className={`${textCenter} font-medium text-slate-700 dark:text-slate-200`}
                  />
                  <th className={`${textCenter} px-4 py-3 font-medium w-28`}>{t.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-slate-400">
                      {t.customerGroups.noGroups}
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((g) => (
                    <tr key={g.id} className="hover:bg-slate-50">
                      <td className={`px-4 py-3 font-medium text-slate-900 ${textStart}`}>{g.name}</td>
                      <td className={`px-4 py-3 text-slate-600 ${textStart}`}>
                        {g.discount_type === 'percent' ? t.customerGroups.percent : t.customerGroups.fixed}
                      </td>
                      <td className={`px-4 py-3 text-slate-600 text-center tabular-nums`} dir="ltr">
                        {g.discount_type === 'percent' ? `${fmt(Number(g.discount_value))}%` : fmt(Number(g.discount_value))}
                      </td>
                      <td className={`px-4 py-3 ${textCenter}`}>
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                            g.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {g.is_active ? t.active : t.inactive}
                        </span>
                      </td>
                      <td className={`px-4 py-3 ${textCenter}`}>
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => openEdit(g)}
                            className="text-primary-600 hover:text-primary-500"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(g)}
                            className="text-red-500 hover:text-red-400"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={closeModal}>
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">
                {editing ? t.customerGroups.editGroup : t.customerGroups.addGroup}
              </h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {t.customerGroups.groupName} *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {t.customerGroups.discountType}
                </label>
                <select
                  value={form.discount_type}
                  onChange={(e) =>
                    setForm({ ...form, discount_type: e.target.value as 'percent' | 'fixed' })
                  }
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                >
                  <option value="percent">{t.customerGroups.percent}</option>
                  <option value="fixed">{t.customerGroups.fixed}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {t.customerGroups.discountValue} *
                </label>
                <input
                  type="number"
                  min={0}
                  step={form.discount_type === 'percent' ? 0.01 : 0.01}
                  value={form.discount_value}
                  onChange={(e) => setForm({ ...form, discount_value: +e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                  dir="ltr"
                />
                {form.discount_type === 'percent' && (
                  <p className="text-xs text-slate-500 mt-1">%</p>
                )}
              </div>
              {editing && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  <label htmlFor="is_active" className="text-sm text-slate-700">
                    {t.active}
                  </label>
                </div>
              )}
              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50 transition-colors"
                >
                  {isSaving ? t.saving : t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-900 mb-2">{t.msg.confirmDeleteTitle}</h3>
            <p className="text-slate-600 text-sm mb-6">
              {t.delete} &quot;{deleteTarget.name}&quot;? {t.msg.cannotUndo}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
              >
                {t.cancel}
              </button>
              <button
                onClick={() => deleteMut.mutate(deleteTarget.id)}
                disabled={deleteMut.isPending}
                className="bg-red-600 hover:bg-red-500 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50 transition-colors"
              >
                {deleteMut.isPending ? t.deleting : t.delete}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
