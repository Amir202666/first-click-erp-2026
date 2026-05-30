import { useState, useCallback, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchBranches, createBranch, updateBranch, deleteBranch } from '../../api/tenant'
import type { Branch } from '../../types'
import { Plus, Pencil, Trash2, X, Building, MoreVertical } from 'lucide-react'
import Toast, { type ToastType } from '../../components/ui/Toast'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { useClientSort } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'
import TablePageSkeleton from '../../components/ui/TablePageSkeleton'

export default function Branches() {
  const { currentTenant } = useAuth()
  const { t, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()

  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Branch | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [openActionsId, setOpenActionsId] = useState<number | null>(null)
  const actionsMenuRef = useRef<HTMLDivElement>(null)
  const [form, setForm] = useState({
    code: '',
    name: '',
    name_en: '',
    address: '',
    phone: '',
    manager_name: '',
    is_active: true,
  })

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!openActionsId) return
      const target = e.target as Node
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(target)) setOpenActionsId(null)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [openActionsId])

  const { data: branches = [], isLoading } = useQuery<Branch[]>({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId,
  })

  const filtered = branches.filter((b) => {
    if (statusFilter === 'active') return b.is_active
    if (statusFilter === 'inactive') return !b.is_active
    return true
  })

  const { sort, toggleSort, sortedRows } = useClientSort(filtered, [
    { key: 'code', type: 'string', getValue: (b: Branch) => b.code ?? '' },
    { key: 'name', type: 'string', getValue: (b: Branch) => b.name ?? '' },
    { key: 'address', type: 'string', getValue: (b: Branch) => b.address ?? '' },
    { key: 'phone', type: 'string', getValue: (b: Branch) => b.phone ?? '' },
    { key: 'manager', type: 'string', getValue: (b: Branch) => b.manager_name ?? '' },
    { key: 'status', type: 'string', getValue: (b: Branch) => (b.is_active ? t.active : t.inactive) },
  ])

  const showToast = useCallback((message: string, type: ToastType) => setToast({ message, type }), [])

  const createMut = useMutation({
    mutationFn: (d: Partial<Branch>) => createBranch(tenantId, d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['branches'] }); closeModal(); showToast(t.msg.addedSuccess, 'success') },
    onError: () => showToast(t.msg.addError, 'error'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data: d }: { id: number; data: Partial<Branch> }) => updateBranch(tenantId, id, d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['branches'] }); closeModal(); showToast(t.msg.updatedSuccess, 'success') },
    onError: () => showToast(t.msg.updateError, 'error'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteBranch(tenantId, id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['branches'] }); setDeleteTarget(null); showToast(t.msg.deletedSuccess, 'success') },
    onError: (err: any) => { setDeleteTarget(null); showToast(err?.response?.data?.message ?? t.msg.deleteError, 'error') },
  })

  function closeModal() {
    setShowModal(false)
    setEditing(null)
    setForm({ code: '', name: '', name_en: '', address: '', phone: '', manager_name: '', is_active: true })
  }

  function openEdit(b: Branch) {
    setEditing(b)
    setForm({
      code: b.code,
      name: b.name,
      name_en: b.name_en ?? '',
      address: b.address ?? '',
      phone: b.phone ?? '',
      manager_name: b.manager_name ?? '',
      is_active: b.is_active,
    })
    setShowModal(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const payload: Partial<Branch> = {
      code: form.code,
      name: form.name,
      name_en: form.name_en || null,
      address: form.address || null,
      phone: form.phone || null,
      manager_name: form.manager_name || null,
      is_active: form.is_active,
    }
    if (editing) updateMut.mutate({ id: editing.id, data: payload })
    else createMut.mutate(payload)
  }

  const isSaving = createMut.isPending || updateMut.isPending
  const thAlign = isRtl ? 'text-right' : 'text-left'

  return (
    <div className="p-6 space-y-6 min-w-0 max-w-full w-full">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center"><Building size={20} className="text-blue-600" /></div>
          <h1 className="text-2xl font-bold text-slate-900">{t.branches.title}</h1>
        </div>
        <button onClick={() => { closeModal(); setShowModal(true) }}
          className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-4 py-2 text-sm transition-colors">
          <Plus size={18} /> {t.branches.addBranch}
        </button>
      </div>

      <div className="flex items-center gap-2">
        {(['all', 'active', 'inactive'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === s
                ? 'bg-primary-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {s === 'all' ? t.all : s === 'active' ? t.active : t.inactive}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        {isLoading ? (
          <TablePageSkeleton rows={6} />
        ) : (
          <div className="ui-table-scroll">
            <table className="fc-list-table w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-600">
                  <SortableTh label={t.branches.branchCode} sortKey="code" sortState={sort} onToggle={toggleSort} widthClassName="w-28" className={`${thAlign} font-medium text-slate-700 dark:text-slate-200`} />
                  <SortableTh label={t.branches.branchName} sortKey="name" sortState={sort} onToggle={toggleSort} widthClassName="w-48" className={`${thAlign} font-medium text-slate-700 dark:text-slate-200`} />
                  <SortableTh label={t.branches.address} sortKey="address" sortState={sort} onToggle={toggleSort} widthClassName="w-40 max-w-[10rem]" className={`${thAlign} font-medium text-slate-700 dark:text-slate-200`} />
                  <SortableTh label={t.branches.phone} sortKey="phone" sortState={sort} onToggle={toggleSort} widthClassName="w-32" className={`${thAlign} font-medium text-slate-700 dark:text-slate-200`} />
                  <SortableTh label={t.branches.managerName} sortKey="manager" sortState={sort} onToggle={toggleSort} widthClassName="w-36 max-w-[9rem]" className={`${thAlign} font-medium text-slate-700 dark:text-slate-200`} />
                  <SortableTh label={t.status} sortKey="status" sortState={sort} onToggle={toggleSort} widthClassName="w-24" className={`${thAlign} font-medium text-slate-700 dark:text-slate-200`} />
                  <th className={`${thAlign} px-4 py-3 font-medium w-16`}>{t.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sortedRows.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-slate-400">{t.branches.noBranches}</td></tr>
                ) : sortedRows.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 truncate">{b.code}</td>
                    <td className="px-4 py-3 font-medium text-slate-900 truncate">{b.name}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs truncate max-w-[10rem]" title={b.address ?? undefined}>{b.address ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs truncate">
                      <span dir="ltr">{b.phone ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs truncate">{b.manager_name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${b.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {b.is_active ? t.active : t.inactive}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <div className="relative inline-flex" ref={openActionsId === b.id ? actionsMenuRef : undefined}>
                        <button
                          type="button"
                          onClick={() => setOpenActionsId((prev) => (prev === b.id ? null : b.id))}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                          title={t.actions}
                          aria-label={t.actions}
                          aria-expanded={openActionsId === b.id}
                        >
                          <MoreVertical size={16} />
                        </button>
                        {openActionsId === b.id && (
                          <div
                            className={`absolute z-50 mt-2 min-w-[140px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg ${
                              isRtl ? 'right-0' : 'left-0'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setOpenActionsId(null)
                                openEdit(b)
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                            >
                              <Pencil size={16} className="text-primary-600 shrink-0" />
                              <span>{t.edit}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenActionsId(null)
                                setDeleteTarget(b)
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                            >
                              <Trash2 size={16} className="shrink-0" />
                              <span>{t.delete}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={closeModal}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">{editing ? t.branches.editBranch : t.branches.addBranch}</h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.branches.branchCode} *</label>
                <input type="text" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none font-mono" dir="ltr" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.branches.branchName} *</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.nameEn}</label>
                <input type="text" value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none" dir="ltr" placeholder="English name (optional)" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.branches.address}</label>
                <textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none" rows={2} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.branches.phone}</label>
                <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none" dir="ltr" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.branches.managerName}</label>
                <input type="text" value={form.manager_name} onChange={(e) => setForm({ ...form, manager_name: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none" />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="is_active" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="rounded border-slate-300 text-primary-600 focus:ring-primary-500" />
                <label htmlFor="is_active" className="text-sm font-medium text-slate-700">{t.active}</label>
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={closeModal} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">{t.cancel}</button>
                <button type="submit" disabled={isSaving} className="bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50 transition-colors">
                  {isSaving ? t.saving : t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={t.branches.deleteBranch}
          message={t.branches.confirmDelete.replace('{name}', deleteTarget.name)}
          confirmLabel={t.delete}
          variant="danger"
          isLoading={deleteMut.isPending}
          onConfirm={() => deleteMut.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
