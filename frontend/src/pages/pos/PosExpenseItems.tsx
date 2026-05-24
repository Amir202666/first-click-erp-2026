import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchPosExpenseItems, createPosExpenseItem, updatePosExpenseItem, deletePosExpenseItem, fetchPosExpenseCategories } from '../../api/tenant'
import type { PosExpenseItem, PosExpenseCategory } from '../../types'
import { Plus, Pencil, Trash2, X } from 'lucide-react'
import Toast, { type ToastType } from '../../components/ui/Toast'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { useClientSort } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'

export default function PosExpenseItems() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()

  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<PosExpenseItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PosExpenseItem | null>(null)
  const [form, setForm] = useState<{ name: string; name_en: string; category_id: string; is_active: boolean }>({
    name: '',
    name_en: '',
    category_id: '',
    is_active: true,
  })

  const { data: items = [], isLoading } = useQuery<PosExpenseItem[]>({
    queryKey: ['pos-expense-items', tenantId],
    queryFn: async () => {
      try {
        return await fetchPosExpenseItems(tenantId)
      } catch {
        return []
      }
    },
    enabled: !!tenantId,
  })

  const { data: categories = [] } = useQuery<PosExpenseCategory[]>({
    queryKey: ['pos-expense-categories', tenantId],
    queryFn: async () => {
      try {
        return await fetchPosExpenseCategories(tenantId)
      } catch {
        return []
      }
    },
    enabled: !!tenantId,
  })

  const showToast = (message: string, type: ToastType) => setToast({ message, type })

  const getErrorMessage = (err: unknown) => {
    const ax = err as { response?: { data?: { message?: string; detail?: string | string[] } } }
    const msg = ax?.response?.data?.message ?? (Array.isArray(ax?.response?.data?.detail) ? ax.response.data.detail.join(', ') : ax?.response?.data?.detail)
    return typeof msg === 'string' ? msg : (err as Error)?.message ?? ''
  }

  const createMut = useMutation({
    mutationFn: (data: Partial<PosExpenseItem>) => createPosExpenseItem(tenantId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos-expense-items', tenantId] })
      closeModal()
      showToast(t.msg.addedSuccess, 'success')
    },
    onError: (err) => showToast(getErrorMessage(err) || t.msg.addError, 'error'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<PosExpenseItem> }) => updatePosExpenseItem(tenantId, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos-expense-items', tenantId] })
      closeModal()
      showToast(t.msg.updatedSuccess, 'success')
    },
    onError: (err) => showToast(getErrorMessage(err) || t.msg.updateError, 'error'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deletePosExpenseItem(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos-expense-items', tenantId] })
      setDeleteTarget(null)
      showToast(t.msg.deletedSuccess, 'success')
    },
    onError: (err: any) => {
      setDeleteTarget(null)
      showToast(err?.response?.data?.message ?? t.msg.deleteError, 'error')
    },
  })

  function openNew() {
    setEditing(null)
    setForm({ name: '', name_en: '', category_id: '', is_active: true })
    setShowModal(true)
  }

  function openEdit(item: PosExpenseItem) {
    setEditing(item)
    setForm({
      name: item.name,
      name_en: item.name_en ?? '',
      category_id: String(item.category_id),
      is_active: !!item.is_active,
    })
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditing(null)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.category_id) {
      showToast(t.pos.selectExpenseCategory, 'error')
      return
    }
    const payload: Partial<PosExpenseItem> = {
      name: form.name,
      name_en: form.name_en || null,
      category_id: Number(form.category_id),
      is_active: form.is_active,
    }
    if (editing) updateMut.mutate({ id: editing.id, data: payload })
    else createMut.mutate(payload)
  }

  const isSaving = createMut.isPending || updateMut.isPending
  const thAlign = isRtl ? 'text-right' : 'text-left'

  type SortKey = 'name' | 'category' | 'status'
  const sortColumns = useMemo(
    () => [
      { key: 'name' as const, type: 'string' as const, getValue: (r: PosExpenseItem) => r.name ?? '' },
      { key: 'category' as const, type: 'string' as const, getValue: (r: PosExpenseItem) => r.category?.name ?? '' },
      { key: 'status' as const, type: 'number' as const, getValue: (r: PosExpenseItem) => (r.is_active ? 1 : 0) },
    ],
    [],
  )
  const { sort, toggleSort, sortedRows } = useClientSort<PosExpenseItem, SortKey>(items, sortColumns, {
    locale: isRtl ? 'ar-u-nu-latn' : 'en-US',
  })

  return (
    <div className="p-6 space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
            <span className="text-primary-600 font-semibold text-lg">₵</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">
            {t.nav?.posExpenseItems ?? 'بنود المصاريف'}
          </h1>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-4 py-2 text-sm transition-colors"
        >
          <Plus size={18} />
          {t.add ?? 'إضافة'}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="bg-slate-50 text-slate-600">
                  <SortableTh
                    label={t.name}
                    sortKey="name"
                    sortState={sort}
                    onToggle={toggleSort}
                    className={`${thAlign} p-0 font-medium`}
                  />
                  <SortableTh
                    label={t.nav?.posExpenseCategories ?? 'فئة المصروف'}
                    sortKey="category"
                    sortState={sort}
                    onToggle={toggleSort}
                    className={`${thAlign} p-0 font-medium`}
                  />
                  <SortableTh
                    label={t.status}
                    sortKey="status"
                    sortState={sort}
                    onToggle={toggleSort}
                    className={`${thAlign} p-0 font-medium`}
                  />
                  <th className={`${thAlign} px-4 py-3 font-medium`}>{t.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-8 text-slate-400">
                      {t.noData}
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{item.name}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {item.category ? item.category.name : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            item.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {item.is_active ? t.active : t.inactive}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(item)}
                            className="text-primary-600 hover:text-primary-500"
                            title={t.edit}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(item)}
                            className="text-red-500 hover:text-red-400"
                            title={t.delete}
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
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">
                {editing ? (t.edit ?? 'تعديل') : (t.add ?? 'إضافة')}
              </h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {t.name} *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {t.nameEn}
                </label>
                <input
                  type="text"
                  value={form.name_en}
                  onChange={(e) => setForm({ ...form, name_en: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                  dir="ltr"
                  placeholder="English name (optional)"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {t.nav?.posExpenseCategories ?? 'فئة المصروف'} *
                </label>
                <select
                  value={form.category_id}
                  onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none bg-white"
                  required
                >
                  <option value="">{t.pos.selectExpenseCategory}</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="pos-exp-item-active"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                />
                <label htmlFor="pos-exp-item-active" className="text-sm font-medium text-slate-700">
                  {t.active}
                </label>
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50"
                >
                  {t.cancel ?? 'إلغاء'}
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm hover:bg-primary-500 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSaving ? (t.saving ?? 'جاري الحفظ...') : (t.save ?? 'حفظ')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={t.msg.confirmDeleteTitle}
          message={(lang === 'ar' ? 'هل أنت متأكد من حذف بند المصروف "{name}"؟' : 'Delete expense item "{name}"?').replace('{name}', deleteTarget.name)}
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

