import { useState, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchBranches, fetchRestaurantSections, saveRestaurantSection, deleteRestaurantSection } from '../../api/tenant'
import type { Branch, RestaurantSection } from '../../types'
import { getLocalizedName } from '../../utils/localizedName'
import { Plus, Trash2, Edit2, X, Hash, ArrowUpDown, Type, Building2 } from 'lucide-react'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Toast, { type ToastType } from '../../components/ui/Toast'
import { useClientSort, type SortColumn } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'

export default function RestaurantSectionsPage() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()

  const [editing, setEditing] = useState<Partial<RestaurantSection> | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<RestaurantSection | null>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)

  const { data: branchesData } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId,
  })
  const branches: Branch[] = Array.isArray(branchesData)
    ? (branchesData as Branch[])
    : ((branchesData as unknown as { data?: Branch[] })?.data ?? [])

  const { data: sections } = useQuery({
    queryKey: ['restaurantSections', tenantId],
    queryFn: () => fetchRestaurantSections(tenantId),
    enabled: !!tenantId,
  })

  const saveMut = useMutation({
    mutationFn: (payload: Partial<RestaurantSection> & { id?: number }) => saveRestaurantSection(tenantId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurantSections', tenantId] })
      setModalOpen(false)
      setEditing(null)
      setToast({ message: lang === 'ar' ? 'تم الحفظ بنجاح' : 'Saved successfully', type: 'success' })
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? err?.message ?? (lang === 'ar' ? 'فشل الحفظ' : 'Save failed')
      setToast({ message: typeof msg === 'string' ? msg : (lang === 'ar' ? 'فشل الحفظ' : 'Save failed'), type: 'error' })
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteRestaurantSection(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurantSections', tenantId] })
      setDeleteTarget(null)
    },
  })

  const openCreate = () => {
    setEditing({
      id: undefined,
      name: '',
      name_en: '',
      code: '',
      branch_id: branches[0]?.id ?? null,
      sort_order: 0,
    } as Partial<RestaurantSection>)
    setModalOpen(true)
  }

  const openEdit = (section: RestaurantSection) => {
    setEditing(section)
    setModalOpen(true)
  }

  const closeModal = () => {
    if (saveMut.isPending) return
    setModalOpen(false)
    setEditing(null)
  }

  const sectionRows = sections ?? []
  type SectionSortKey = 'code' | 'name' | 'branch' | 'sort_order'
  const sectionSortColumns = useMemo((): SortColumn<RestaurantSection, SectionSortKey>[] => {
    return [
      { key: 'code', type: 'string', getValue: (s) => s.code ?? '' },
      { key: 'name', type: 'string', getValue: (s) => getLocalizedName(s, lang) },
      { key: 'branch', type: 'string', getValue: (s) => s.branch?.name ?? '' },
      { key: 'sort_order', type: 'number', getValue: (s) => Number(s.sort_order ?? 0) },
    ]
  }, [lang])
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const { sort, toggleSort, sortedRows: sortedSections } = useClientSort(sectionRows, sectionSortColumns, { locale })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing?.name?.trim()) {
      setToast({ message: lang === 'ar' ? 'الاسم (عربي) مطلوب' : 'Name (Arabic) is required', type: 'error' })
      return
    }
    const branchId = editing.branch_id != null ? Number(editing.branch_id) : null
    const payload: Partial<RestaurantSection> & { id?: number } = {
      name: editing.name.trim(),
      name_en: (editing.name_en ?? '').trim(),
      code: (editing.code ?? '').trim(),
      branch_id: branchId,
      sort_order: Number(editing.sort_order) || 0,
    }
    if (editing.id != null && editing.id > 0) {
      (payload as any).id = editing.id
    }
    saveMut.mutate(payload)
  }

  return (
    <div className="space-y-4 px-5 md:px-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">
          {lang === 'ar' ? 'أقسام المطعم' : 'Restaurant sections'}
        </h1>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-md bg-primary-600 text-white text-sm px-3 py-1.5 hover:bg-primary-700 transition-colors"
        >
          <Plus size={16} />
          <span>{lang === 'ar' ? 'إضافة قسم' : 'Add section'}</span>
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <SortableTh label={lang === 'ar' ? 'الكود' : 'Code'} sortKey="code" sortState={sort} onToggle={toggleSort} className="px-0 py-0 text-start text-slate-600 font-medium" />
              <SortableTh label={lang === 'ar' ? 'الاسم' : 'Name'} sortKey="name" sortState={sort} onToggle={toggleSort} className="px-0 py-0 text-start text-slate-600 font-medium" />
              <SortableTh label={lang === 'ar' ? 'الفرع' : 'Branch'} sortKey="branch" sortState={sort} onToggle={toggleSort} className="px-0 py-0 text-start text-slate-600 font-medium" />
              <SortableTh label={lang === 'ar' ? 'الترتيب' : 'Order'} sortKey="sort_order" sortState={sort} onToggle={toggleSort} className="px-0 py-0 text-start text-slate-600 font-medium" />
              <th className="px-3 py-2 text-end text-slate-600">{lang === 'ar' ? 'إجراءات' : 'Actions'}</th>
            </tr>
          </thead>
          <tbody>
            {sortedSections.map((sec) => (
              <tr key={sec.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                <td className="px-3 py-2">{sec.code || '-'}</td>
                <td className="px-3 py-2 font-medium">{getLocalizedName(sec, lang)}</td>
                <td className="px-3 py-2">{sec.branch?.name ?? '-'}</td>
                <td className="px-3 py-2">{sec.sort_order ?? 0}</td>
                <td className="px-3 py-2 text-end">
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(sec)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(sec)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-100 bg-red-50 text-red-600 hover:bg-red-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {sections && sortedSections.length === 0 && (
              <tr>
                <td className="px-3 py-4 text-center text-slate-500 text-sm" colSpan={5}>
                  {lang === 'ar' ? 'لا توجد أقسام بعد.' : 'No sections yet.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && editing && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-800">
                {editing.id
                  ? (lang === 'ar' ? 'تعديل القسم' : 'Edit section')
                  : (lang === 'ar' ? 'إضافة قسم جديد' : 'Add new section')}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
              {/* صف واحد: الكود + الترتيب */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">{lang === 'ar' ? 'الكود' : 'Code'}</label>
                  <div className="relative">
                    <span className={`pointer-events-none absolute inset-y-0 flex items-center text-slate-400 ${isRtl ? 'right-2 left-auto' : 'left-2 right-auto'}`}>
                      <Hash size={16} />
                    </span>
                    <input
                      type="text"
                      value={editing.code ?? ''}
                      onChange={(e) => setEditing((prev) => prev ? { ...prev, code: e.target.value } : prev)}
                      className={`w-full h-10 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 ${isRtl ? 'pr-9 pl-2' : 'pl-9 pr-2'}`}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">{lang === 'ar' ? 'الترتيب' : 'Order'}</label>
                  <div className="relative">
                    <span className={`pointer-events-none absolute inset-y-0 flex items-center text-slate-400 ${isRtl ? 'right-2 left-auto' : 'left-2 right-auto'}`}>
                      <ArrowUpDown size={16} />
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={editing.sort_order ?? ''}
                      onChange={(e) =>
                        setEditing((prev) =>
                          prev ? { ...prev, sort_order: e.target.value ? Number(e.target.value) : 0 } : prev,
                        )
                      }
                      className={`w-full h-10 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 ${isRtl ? 'pr-9 pl-2' : 'pl-9 pr-2'}`}
                    />
                  </div>
                </div>
              </div>

              {/* الفرع */}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">{lang === 'ar' ? 'الفرع' : 'Branch'}</label>
                <div className="relative">
                  <span className={`pointer-events-none absolute inset-y-0 flex items-center text-slate-400 ${isRtl ? 'right-2 left-auto' : 'left-2 right-auto'}`}>
                    <Building2 size={16} />
                  </span>
                  <select
                    value={editing.branch_id ?? ''}
                    onChange={(e) =>
                      setEditing((prev) =>
                        prev ? { ...prev, branch_id: e.target.value ? Number(e.target.value) : null } : prev,
                      )
                    }
                    className={`w-full h-10 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 bg-white ${isRtl ? 'pr-9 pl-2' : 'pl-9 pr-2'}`}
                  >
                    <option value="">{lang === 'ar' ? 'بدون' : 'None'}</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* صف واحد: الاسم العربي + الاسم الإنجليزي */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">{lang === 'ar' ? 'الاسم (عربي)' : 'Name (Arabic)'}</label>
                  <div className="relative">
                    <span className={`pointer-events-none absolute inset-y-0 flex items-center text-slate-400 ${isRtl ? 'right-2 left-auto' : 'left-2 right-auto'}`}>
                      <Type size={16} />
                    </span>
                    <input
                      type="text"
                      value={editing.name ?? ''}
                      onChange={(e) => setEditing((prev) => prev ? { ...prev, name: e.target.value } : prev)}
                      required
                      className={`w-full h-10 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 ${isRtl ? 'pr-9 pl-2' : 'pl-9 pr-2'}`}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">{lang === 'ar' ? 'الاسم (إنجليزي)' : 'Name (English)'}</label>
                  <div className="relative">
                    <span className={`pointer-events-none absolute inset-y-0 flex items-center text-slate-400 ${isRtl ? 'right-2 left-auto' : 'left-2 right-auto'}`}>
                      <Type size={16} />
                    </span>
                    <input
                      type="text"
                      value={editing.name_en ?? ''}
                      onChange={(e) => setEditing((prev) => prev ? { ...prev, name_en: e.target.value } : prev)}
                      className={`w-full h-10 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 ${isRtl ? 'pr-9 pl-2' : 'pl-9 pr-2'}`}
                    />
                  </div>
                </div>
              </div>

              {/* أزرار الإجراء: جهة اليسار */}
              <div className={`flex items-center gap-2 pt-3 border-t border-slate-100 ${isRtl ? 'justify-end' : 'justify-start'}`}>
                <button
                  type="button"
                  onClick={closeModal}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-md border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  disabled={saveMut.isPending}
                >
                  {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center px-4 py-2 rounded-md bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-60"
                  disabled={saveMut.isPending}
                >
                  {saveMut.isPending ? (lang === 'ar' ? 'جارٍ الحفظ...' : 'Saving...') : (lang === 'ar' ? 'حفظ' : 'Save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={lang === 'ar' ? 'حذف القسم' : 'Delete section'}
          message={
            lang === 'ar'
              ? `هل أنت متأكد من حذف القسم "${getLocalizedName(deleteTarget, lang)}"؟`
              : `Are you sure you want to delete the section "${getLocalizedName(deleteTarget, lang)}"?`
          }
          onConfirm={() => deleteMut.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
          confirmLabel={lang === 'ar' ? 'حذف' : 'Delete'}
          variant="danger"
        />
      )}
    </div>
  )
}
