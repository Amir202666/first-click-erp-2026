import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchItemBrands, createItemBrand, updateItemBrand, deleteItemBrand } from '../../api/tenant'
import type { ItemBrand } from '../../types'
import { Plus, Pencil, Trash2, X, Award } from 'lucide-react'
import Toast, { type ToastType } from '../../components/ui/Toast'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { useClientSort } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'

export default function ItemBrands() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()

  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<ItemBrand | null>(null)
  const [form, setForm] = useState({ name: '', name_en: '', description: '' })
  const [deleteTarget, setDeleteTarget] = useState<ItemBrand | null>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)

  const { data: brands = [], isLoading } = useQuery<ItemBrand[]>({
    queryKey: ['item-brands', tenantId],
    queryFn: () => fetchItemBrands(tenantId),
    enabled: !!tenantId,
  })

  const { sort, toggleSort, sortedRows } = useClientSort(brands, [
    { key: 'name', type: 'string', getValue: (b: ItemBrand) => b.name ?? '' },
    { key: 'description', type: 'string', getValue: (b: ItemBrand) => b.description ?? '' },
    { key: 'items_count', type: 'number', getValue: (b: ItemBrand) => Number(b.items_count ?? 0) },
  ], { locale: lang === 'ar' ? 'ar-u-nu-latn' : 'en-US' })

  const showToast = useCallback((message: string, type: ToastType) => setToast({ message, type }), [])

  const createMut = useMutation({
    mutationFn: (d: Partial<ItemBrand>) => createItemBrand(tenantId, d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['item-brands'] }); closeModal(); showToast(t.msg.addedSuccess, 'success') },
    onError: () => showToast(t.msg.addError, 'error'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data: d }: { id: number; data: Partial<ItemBrand> }) => updateItemBrand(tenantId, id, d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['item-brands'] }); closeModal(); showToast(t.msg.updatedSuccess, 'success') },
    onError: () => showToast(t.msg.updateError, 'error'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteItemBrand(tenantId, id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['item-brands'] }); setDeleteTarget(null); showToast(t.msg.deletedSuccess, 'success') },
    onError: (err: any) => { setDeleteTarget(null); showToast(err?.response?.data?.message ?? t.msg.deleteError, 'error') },
  })

  function closeModal() { setShowModal(false); setEditing(null); setForm({ name: '', name_en: '', description: '' }) }

  function openEdit(b: ItemBrand) {
    setEditing(b)
    setForm({ name: b.name, name_en: b.name_en ?? '', description: b.description ?? '' })
    setShowModal(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const payload = { name: form.name, name_en: form.name_en || null, description: form.description || null }
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
          <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center"><Award size={20} className="text-purple-600" /></div>
          <h1 className="text-2xl font-bold text-slate-900">{t.itemBrands.title}</h1>
        </div>
        <button onClick={() => { setForm({ name: '', name_en: '', description: '' }); setEditing(null); setShowModal(true) }}
          className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-4 py-2 text-sm transition-colors">
          <Plus size={18} /> {t.itemBrands.addBrand}
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
                  <SortableTh label={t.itemBrands.brandName} sortKey="name" sortState={sort} onToggle={toggleSort} widthClassName="w-[18rem]" className={`${thAlign} font-medium text-slate-700 dark:text-slate-200`} />
                  <SortableTh label={t.description} sortKey="description" sortState={sort} onToggle={toggleSort} widthClassName="w-[22rem]" className={`${thAlign} font-medium text-slate-700 dark:text-slate-200`} />
                  <SortableTh label={t.itemBrands.itemsCount} sortKey="items_count" sortState={sort} onToggle={toggleSort} widthClassName="w-28" className={`${thAlign} font-medium text-slate-700 dark:text-slate-200`} />
                  <th className={`${thAlign} px-4 py-3 font-medium w-28`}>{t.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sortedRows.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-8 text-slate-400">{t.itemBrands.noBrands}</td></tr>
                ) : sortedRows.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{b.name}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs max-w-[300px] truncate">{b.description ?? '—'}</td>
                    <td className="px-4 py-3"><span className="bg-slate-100 text-slate-600 rounded-full px-2.5 py-0.5 text-xs font-medium">{new Intl.NumberFormat(locale).format(b.items_count ?? 0)}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEdit(b)} className="text-primary-600 hover:text-primary-500" title={t.edit}><Pencil size={16} /></button>
                        <button onClick={() => setDeleteTarget(b)} className="text-red-500 hover:text-red-400" title={t.delete}><Trash2 size={16} /></button>
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
              <h3 className="text-lg font-semibold text-slate-900">{editing ? t.itemBrands.editBrand : t.itemBrands.addBrand}</h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.itemBrands.brandName} *</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none" required placeholder={t.itemBrands.namePlaceholder} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.nameEn}</label>
                <input type="text" value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none" dir="ltr" placeholder="English name (optional)" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.description}</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none" rows={2} />
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
          title={t.itemBrands.deleteBrand}
          message={`${t.itemBrands.confirmDelete.replace('{name}', deleteTarget.name)}${deleteTarget.items_count ? ` ${t.itemBrands.linkedItems.replace('{count}', new Intl.NumberFormat(locale).format(deleteTarget.items_count))}` : ''}`}
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
