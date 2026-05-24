import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchItemUnits, createItemUnit, updateItemUnit, deleteItemUnit } from '../../api/tenant'
import type { ItemUnit } from '../../types'
import { Plus, Pencil, Trash2, X, Ruler } from 'lucide-react'
import Toast, { type ToastType } from '../../components/ui/Toast'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { useClientSort } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'

export default function ItemUnits() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()

  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<ItemUnit | null>(null)
  const [form, setForm] = useState({ name: '', name_en: '', symbol: '' })
  const [deleteTarget, setDeleteTarget] = useState<ItemUnit | null>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)

  const { data: units = [], isLoading } = useQuery<ItemUnit[]>({
    queryKey: ['item-units', tenantId],
    queryFn: () => fetchItemUnits(tenantId),
    enabled: !!tenantId,
  })

  const { sort, toggleSort, sortedRows } = useClientSort(units, [
    { key: 'name', type: 'string', getValue: (u: ItemUnit) => u.name ?? '' },
    { key: 'symbol', type: 'string', getValue: (u: ItemUnit) => u.symbol ?? '' },
    { key: 'items_count', type: 'number', getValue: (u: ItemUnit) => Number(u.items_count ?? 0) },
  ], { locale: lang === 'ar' ? 'ar-u-nu-latn' : 'en-US' })

  const showToast = useCallback((message: string, type: ToastType) => setToast({ message, type }), [])

  const createMut = useMutation({
    mutationFn: (d: Partial<ItemUnit>) => createItemUnit(tenantId, d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['item-units'] }); closeModal(); showToast(t.msg.addedSuccess, 'success') },
    onError: () => showToast(t.msg.addError, 'error'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data: d }: { id: number; data: Partial<ItemUnit> }) => updateItemUnit(tenantId, id, d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['item-units'] }); closeModal(); showToast(t.msg.updatedSuccess, 'success') },
    onError: () => showToast(t.msg.updateError, 'error'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteItemUnit(tenantId, id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['item-units'] }); setDeleteTarget(null); showToast(t.msg.deletedSuccess, 'success') },
    onError: (err: any) => { setDeleteTarget(null); showToast(err?.response?.data?.message ?? t.msg.deleteError, 'error') },
  })

  function closeModal() { setShowModal(false); setEditing(null); setForm({ name: '', name_en: '', symbol: '' }) }

  function openEdit(u: ItemUnit) {
    setEditing(u)
    setForm({ name: u.name, name_en: u.name_en ?? '', symbol: u.symbol ?? '' })
    setShowModal(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const payload = { name: form.name, name_en: form.name_en || null, symbol: form.symbol || null }
    if (editing) updateMut.mutate({ id: editing.id, data: payload })
    else createMut.mutate(payload)
  }

  const isSaving = createMut.isPending || updateMut.isPending
  const thAlign = isRtl ? 'text-right' : 'text-left'
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'

  return (
    <div className="p-6 space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center"><Ruler size={20} className="text-primary-600" /></div>
          <h1 className="text-2xl font-bold text-slate-900">{t.itemUnits.title}</h1>
        </div>
        <button onClick={() => { setForm({ name: '', name_en: '', symbol: '' }); setEditing(null); setShowModal(true) }}
          className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-4 py-2 text-sm transition-colors">
          <Plus size={18} /> {t.itemUnits.addUnit}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        {isLoading ? (
          <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="bg-slate-50 text-slate-600">
                  <SortableTh label={t.itemUnits.unitName} sortKey="name" sortState={sort} onToggle={toggleSort} widthClassName="w-[18rem]" className={`${thAlign} font-medium text-slate-700 dark:text-slate-200`} />
                  <SortableTh label={t.itemUnits.symbol} sortKey="symbol" sortState={sort} onToggle={toggleSort} widthClassName="w-32" className={`${thAlign} font-medium text-slate-700 dark:text-slate-200`} />
                  <SortableTh label={t.itemUnits.itemsCount} sortKey="items_count" sortState={sort} onToggle={toggleSort} widthClassName="w-28" className={`${thAlign} font-medium text-slate-700 dark:text-slate-200`} />
                  <th className={`${thAlign} px-4 py-3 font-medium w-28`}>{t.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sortedRows.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-8 text-slate-400">{t.itemUnits.noUnits}</td></tr>
                ) : sortedRows.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{u.name}</td>
                    <td className="px-4 py-3 text-slate-500 font-mono">{u.symbol ?? '—'}</td>
                    <td className="px-4 py-3"><span className="bg-slate-100 text-slate-600 rounded-full px-2.5 py-0.5 text-xs font-medium">{new Intl.NumberFormat(locale).format(u.items_count ?? 0)}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEdit(u)} className="text-primary-600 hover:text-primary-500" title={t.edit}><Pencil size={16} /></button>
                        <button onClick={() => setDeleteTarget(u)} className="text-red-500 hover:text-red-400" title={t.delete}><Trash2 size={16} /></button>
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
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">{editing ? t.itemUnits.editUnit : t.itemUnits.addUnit}</h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.itemUnits.unitName} *</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none" required placeholder={t.itemUnits.namePlaceholder} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.nameEn}</label>
                <input type="text" value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none" dir="ltr" placeholder="English name (optional)" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.itemUnits.symbol}</label>
                <input type="text" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none" placeholder={t.itemUnits.symbolPlaceholder} />
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
          title={t.itemUnits.deleteUnit}
          message={`${t.itemUnits.confirmDelete.replace('{name}', deleteTarget.name)}${deleteTarget.items_count ? ` ${t.itemUnits.linkedItems.replace('{count}', new Intl.NumberFormat(locale).format(deleteTarget.items_count))}` : ''}`}
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
