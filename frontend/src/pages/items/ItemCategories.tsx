import { useState, useCallback, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchItemCategories, createItemCategory, updateItemCategory, deleteItemCategory, fetchAccounts, fetchAccountDefaults, fetchBranches } from '../../api/tenant'
import type { ItemCategory, Account, TenantAccountDefault, Branch } from '../../types'
import { Plus, Pencil, Trash2, X, FolderTree } from 'lucide-react'
import Toast, { type ToastType } from '../../components/ui/Toast'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { useClientSort } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'

export default function ItemCategories() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl, getDisplayName } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()

  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<ItemCategory | null>(null)
  const [form, setForm] = useState({
    code: '', name: '', name_en: '', description: '', parent_id: '' as string,
    inventory_account_id: '' as string, cost_of_sales_account_id: '' as string, sales_account_id: '' as string,
    show_in_pos: true,
    show_in_restaurant_pos: true,
  })
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ItemCategory | null>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [appliesAllBranches, setAppliesAllBranches] = useState(true)
  const [branchIds, setBranchIds] = useState<number[]>([])
  const accountingDefaultsAppliedRef = useRef(false)

  const { data: accountDefaults } = useQuery<TenantAccountDefault>({
    queryKey: ['account-defaults', tenantId],
    queryFn: () => fetchAccountDefaults(tenantId),
    enabled: !!tenantId,
  })

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(imageFile)
    setImagePreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [imageFile])

  /** عند إضافة فئة جديدة: تعبئة حسابات الربط من «الحسابات الأساسية» (مرة واحدة لكل فتح للنافذة). */
  useEffect(() => {
    if (!showModal) {
      accountingDefaultsAppliedRef.current = false
      return
    }
    if (editing || !accountDefaults || accountingDefaultsAppliedRef.current) return
    setForm((f) => ({
      ...f,
      inventory_account_id:
        accountDefaults.inventory_account_id != null ? String(accountDefaults.inventory_account_id) : f.inventory_account_id,
      cost_of_sales_account_id:
        accountDefaults.cogs_account_id != null ? String(accountDefaults.cogs_account_id) : f.cost_of_sales_account_id,
      sales_account_id:
        accountDefaults.sales_account_id != null ? String(accountDefaults.sales_account_id) : f.sales_account_id,
    }))
    accountingDefaultsAppliedRef.current = true
  }, [showModal, editing, accountDefaults])

  const { data: categories = [], isLoading } = useQuery<ItemCategory[]>({
    queryKey: ['item-categories', tenantId],
    queryFn: () => fetchItemCategories(tenantId),
    enabled: !!tenantId,
  })

  const branchesCellSortValue = useCallback((cat: ItemCategory) => {
    if (cat.applies_to_all_branches !== false) return t.itemCategories.branchesAllShort
    if (cat.branches?.length) return cat.branches.map((b) => getDisplayName(b)).join('\u200c')
    return ''
  }, [getDisplayName, t.itemCategories.branchesAllShort])

  const { sort, toggleSort, sortedRows } = useClientSort(categories, [
    { key: 'code', type: 'string', getValue: (cat: ItemCategory) => cat.code ?? '' },
    { key: 'name', type: 'string', getValue: (cat: ItemCategory) => cat.name ?? '' },
    { key: 'parent', type: 'string', getValue: (cat: ItemCategory) => cat.parent?.name ?? '' },
    { key: 'branches', type: 'string', getValue: (cat: ItemCategory) => branchesCellSortValue(cat) },
    { key: 'description', type: 'string', getValue: (cat: ItemCategory) => cat.description ?? '' },
    { key: 'items_count', type: 'number', getValue: (cat: ItemCategory) => Number(cat.items_count ?? 0) },
  ], { locale: lang === 'ar' ? 'ar-u-nu-latn' : 'en-US' })

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts', tenantId, 'postable'],
    queryFn: () => fetchAccounts(tenantId, { postable_only: '1', active_only: '1' }),
    enabled: !!tenantId,
  })

  const { data: branchesRaw } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId,
  })
  const branches: Branch[] = Array.isArray(branchesRaw)
    ? branchesRaw
    : ((branchesRaw as unknown) as { data?: Branch[] })?.data ?? []

  const showToast = useCallback((message: string, type: ToastType) => setToast({ message, type }), [])

  const createMut = useMutation({
    mutationFn: ({ data: d, imageFile: img }: { data: Partial<ItemCategory>; imageFile?: File | null }) => createItemCategory(tenantId, d, img),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['item-categories'] }); closeModal(); showToast(t.msg.addedSuccess, 'success') },
    onError: () => showToast(t.msg.addError, 'error'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data: d, imageFile: img }: { id: number; data: Partial<ItemCategory>; imageFile?: File | null }) => updateItemCategory(tenantId, id, d, img),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['item-categories'] }); closeModal(); showToast(t.msg.updatedSuccess, 'success') },
    onError: () => showToast(t.msg.updateError, 'error'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteItemCategory(tenantId, id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['item-categories'] }); setDeleteTarget(null); showToast(t.msg.deletedSuccess, 'success') },
    onError: (err: any) => { setDeleteTarget(null); showToast(err?.response?.data?.message ?? t.msg.deleteError, 'error') },
  })

  function closeModal() {
    setShowModal(false); setEditing(null); setImageFile(null)
    setForm({ code: '', name: '', name_en: '', description: '', parent_id: '', inventory_account_id: '', cost_of_sales_account_id: '', sales_account_id: '', show_in_pos: true, show_in_restaurant_pos: true })
    setAppliesAllBranches(true)
    setBranchIds([])
  }

  function openEdit(cat: ItemCategory) {
    setEditing(cat)
    setImageFile(null)
    setForm({
      code: cat.code, name: cat.name, name_en: cat.name_en ?? '', description: cat.description ?? '', parent_id: cat.parent_id?.toString() ?? '',
      inventory_account_id: (cat as any).inventory_account_id?.toString() ?? '',
      cost_of_sales_account_id: (cat as any).cost_of_sales_account_id?.toString() ?? '',
      sales_account_id: (cat as any).sales_account_id?.toString() ?? '',
      show_in_pos: cat.show_in_pos ?? true,
      show_in_restaurant_pos: cat.show_in_restaurant_pos ?? true,
    })
    setAppliesAllBranches(cat.applies_to_all_branches !== false)
    setBranchIds(cat.branches?.map((b) => b.id) ?? [])
    setShowModal(true)
  }

  function toggleBranchPick(id: number) {
    setBranchIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!appliesAllBranches && branchIds.length === 0) {
      showToast(t.itemCategories.selectBranchesRequired, 'error')
      return
    }
    const payload: Record<string, unknown> = {
      name: form.name,
      name_en: form.name_en || null,
      description: form.description || null,
      parent_id: form.parent_id ? +form.parent_id : null,
      inventory_account_id: form.inventory_account_id ? +form.inventory_account_id : null,
      cost_of_sales_account_id: form.cost_of_sales_account_id ? +form.cost_of_sales_account_id : null,
      sales_account_id: form.sales_account_id ? +form.sales_account_id : null,
      applies_to_all_branches: appliesAllBranches,
      branch_ids: appliesAllBranches ? [] : branchIds,
      show_in_pos: form.show_in_pos,
      show_in_restaurant_pos: form.show_in_restaurant_pos,
    }
    if (editing) {
      payload.code = form.code
      updateMut.mutate({ id: editing.id, data: payload as Partial<ItemCategory>, imageFile })
    } else {
      createMut.mutate({ data: payload as Partial<ItemCategory>, imageFile })
    }
  }

  const isSaving = createMut.isPending || updateMut.isPending
  const thAlign = isRtl ? 'text-right' : 'text-left'
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'

  return (
    <div className="p-6 space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center"><FolderTree size={20} className="text-emerald-600" /></div>
          <h1 className="text-2xl font-bold text-slate-900">{t.itemCategories.title}</h1>
        </div>
        <button onClick={() => {
          setForm({ code: '', name: '', name_en: '', description: '', parent_id: '', inventory_account_id: '', cost_of_sales_account_id: '', sales_account_id: '', show_in_pos: true, show_in_restaurant_pos: true })
          setEditing(null)
          setAppliesAllBranches(true)
          setBranchIds([])
          setShowModal(true)
        }}
          className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-4 py-2 text-sm transition-colors">
          <Plus size={18} /> {t.itemCategories.addCategory}
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
                  <SortableTh label={t.itemCategories.categoryCode} sortKey="code" sortState={sort} onToggle={toggleSort} widthClassName="w-28" className={`${thAlign} font-medium text-slate-700 dark:text-slate-200`} />
                  <SortableTh label={t.itemCategories.categoryName} sortKey="name" sortState={sort} onToggle={toggleSort} widthClassName="w-44" className={`${thAlign} font-medium text-slate-700 dark:text-slate-200`} />
                  <SortableTh label={t.itemCategories.parentCategory} sortKey="parent" sortState={sort} onToggle={toggleSort} widthClassName="w-40" className={`${thAlign} font-medium text-slate-700 dark:text-slate-200`} />
                  <SortableTh label={t.nav.branches} sortKey="branches" sortState={sort} onToggle={toggleSort} widthClassName="w-44" className={`${thAlign} font-medium text-slate-700 dark:text-slate-200`} />
                  <SortableTh label={t.description} sortKey="description" sortState={sort} onToggle={toggleSort} widthClassName="w-[14rem]" className={`${thAlign} font-medium text-slate-700 dark:text-slate-200`} />
                  <SortableTh label={t.itemCategories.itemsCount} sortKey="items_count" sortState={sort} onToggle={toggleSort} widthClassName="w-28" className={`${thAlign} font-medium text-slate-700 dark:text-slate-200`} />
                  <th className={`${thAlign} px-4 py-3 font-medium w-28`}>{t.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sortedRows.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-slate-400">{t.itemCategories.noCategories}</td></tr>
                ) : sortedRows.map((cat) => (
                  <tr key={cat.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{cat.code}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{cat.name}</td>
                    <td className="px-4 py-3 text-slate-500">{cat.parent?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600 text-xs max-w-[160px]">
                      {cat.applies_to_all_branches !== false ? (
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{t.itemCategories.branchesAllShort}</span>
                      ) : cat.branches?.length ? (
                        <span className="line-clamp-2" title={cat.branches.map((b) => getDisplayName(b)).join('، ')}>
                          {cat.branches.map((b) => getDisplayName(b)).join('، ')}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs max-w-[200px] truncate">{cat.description ?? '—'}</td>
                    <td className="px-4 py-3"><span className="bg-slate-100 text-slate-600 rounded-full px-2.5 py-0.5 text-xs font-medium">{new Intl.NumberFormat(locale).format(cat.items_count ?? 0)}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEdit(cat)} className="text-primary-600 hover:text-primary-500" title={t.edit}><Pencil size={16} /></button>
                        <button onClick={() => setDeleteTarget(cat)} className="text-red-500 hover:text-red-400" title={t.delete}><Trash2 size={16} /></button>
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[2px]"
          onClick={closeModal}
          onKeyDown={(e) => e.key === 'Escape' && closeModal()}
          role="presentation"
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="item-category-modal-title"
          >
            <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-slate-200 bg-slate-50/95">
              <div className="min-w-0 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                <h3 id="item-category-modal-title" className="text-base font-semibold text-slate-900 leading-tight">
                  {editing ? t.itemCategories.editCategory : t.itemCategories.addCategory}
                </h3>
                {editing && (
                  <span className="text-xs text-slate-500 inline-flex flex-wrap items-center gap-1.5">
                    <span className="whitespace-nowrap">{t.itemCategories.categoryCodeReadonly}</span>
                    <code className="font-mono text-[11px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200" dir="ltr">
                      {form.code}
                    </code>
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="shrink-0 rounded-md p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                aria-label={t.close}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
              <div className="overflow-y-auto flex-1 px-6 py-5">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
                  <div className="lg:col-span-7 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.itemCategories.categoryName} *</label>
                        <input
                          type="text"
                          value={form.name}
                          onChange={(e) => setForm({ ...form, name: e.target.value })}
                          className="w-full h-10 border border-slate-300 rounded-lg px-3 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none transition-shadow"
                          required
                          autoFocus
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.nameEn}</label>
                        <input
                          type="text"
                          value={form.name_en}
                          onChange={(e) => setForm({ ...form, name_en: e.target.value })}
                          className="w-full h-10 border border-slate-300 rounded-lg px-3 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none transition-shadow"
                          dir="ltr"
                          placeholder={lang === 'ar' ? 'English (اختياري)' : 'English (optional)'}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.itemCategories.parentCategory}</label>
                      <select
                        value={form.parent_id}
                        onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
                        className="w-full h-10 border border-slate-300 rounded-lg px-3 text-sm bg-white focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none transition-shadow"
                      >
                        <option value="">{t.itemCategories.noParent}</option>
                        {categories
                          .filter((c) => c.id !== editing?.id)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {getDisplayName(c)}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4">
                      <div dir={isRtl ? 'rtl' : 'ltr'} className={`flex flex-col ${isRtl ? 'text-right' : 'text-left'}`}>
                        <label className="block w-full text-sm font-medium text-slate-700">{t.itemCategories.branchesScope}</label>
                        <div className="mt-2.5 w-full flex flex-col gap-2 text-sm">
                          <label
                            htmlFor="category-branch-all"
                            className="inline-flex w-full flex-row items-center justify-start cursor-pointer"
                          >
                            <input
                              id="category-branch-all"
                              type="radio"
                              name="category-branch-scope"
                              checked={appliesAllBranches}
                              onChange={() => {
                                setAppliesAllBranches(true)
                                setBranchIds([])
                              }}
                              className="ml-2.5 text-primary-600 border-slate-300 focus:ring-primary-500"
                            />
                            <span className="text-slate-700">{t.itemCategories.allBranches}</span>
                          </label>
                          <label
                            htmlFor="category-branch-specific"
                            className="inline-flex w-full flex-row items-center justify-start cursor-pointer"
                          >
                            <input
                              id="category-branch-specific"
                              type="radio"
                              name="category-branch-scope"
                              checked={!appliesAllBranches}
                              onChange={() => setAppliesAllBranches(false)}
                              className="ml-2.5 text-primary-600 border-slate-300 focus:ring-primary-500"
                            />
                            <span className="text-slate-700">{t.itemCategories.specificBranches}</span>
                          </label>
                        </div>
                      </div>
                      {!appliesAllBranches && (
                        <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                          {branches.filter((b) => b.is_active).length === 0 ? (
                            <p className="text-xs text-slate-500">{lang === 'ar' ? 'لا توجد فروع نشطة.' : 'No active branches.'}</p>
                          ) : (
                            branches
                              .filter((b) => b.is_active)
                              .map((b) => (
                                <label
                                  key={b.id}
                                  className="inline-flex w-full flex-row items-center justify-start cursor-pointer text-sm text-slate-700 py-0.5"
                                >
                                  <input
                                    type="checkbox"
                                    checked={branchIds.includes(b.id)}
                                    onChange={() => toggleBranchPick(b.id)}
                                    className="ml-2.5 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                                  />
                                  <span>{getDisplayName(b)}</span>
                                </label>
                              ))
                          )}
                        </div>
                      )}
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <div dir={isRtl ? 'rtl' : 'ltr'} className={`flex flex-col ${isRtl ? 'text-right' : 'text-left'}`}>
                        <label className="block w-full text-sm font-medium text-slate-700">{t.itemCategories.posVisibility}</label>
                        <div className="mt-2.5 w-full flex flex-col gap-2 text-sm">
                          <label
                            htmlFor="category-show-in-pos"
                            className="inline-flex w-full flex-row items-center justify-start cursor-pointer"
                          >
                            <input
                              id="category-show-in-pos"
                              type="checkbox"
                              checked={!!form.show_in_pos}
                              onChange={(e) => setForm({ ...form, show_in_pos: e.target.checked })}
                              className="ml-2.5 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                            />
                            <span className="text-slate-700">{t.itemCategories.showInPos}</span>
                          </label>
                          <label
                            htmlFor="category-show-in-restaurant-pos"
                            className="inline-flex w-full flex-row items-center justify-start cursor-pointer"
                          >
                            <input
                              id="category-show-in-restaurant-pos"
                              type="checkbox"
                              checked={!!form.show_in_restaurant_pos}
                              onChange={(e) => setForm({ ...form, show_in_restaurant_pos: e.target.checked })}
                              className="ml-2.5 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                            />
                            <span className="text-slate-700">{t.itemCategories.showInRestaurantPos}</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="lg:col-span-5">
                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 flex flex-col gap-3">
                      <label className="text-sm font-medium text-slate-700">{lang === 'ar' ? 'صورة الفئة' : 'Category image'}</label>
                      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white min-h-[160px] overflow-hidden">
                        {imagePreviewUrl ? (
                          <img src={imagePreviewUrl} alt="" className="max-h-48 w-full object-contain" />
                        ) : editing && (editing as ItemCategory & { image_url?: string }).image_url ? (
                          <img src={(editing as ItemCategory & { image_url?: string }).image_url!} alt="" className="max-h-48 w-full object-contain" />
                        ) : (
                          <span className="text-slate-400 text-sm py-8">{lang === 'ar' ? 'لا صورة' : 'No image'}</span>
                        )}
                      </div>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/gif,image/webp"
                        onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                        className="w-full text-sm text-slate-600 file:me-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 cursor-pointer"
                      />
                      {editing && (editing as ItemCategory & { image_url?: string }).image_url && !imageFile && (
                        <p className="text-xs text-slate-500">{lang === 'ar' ? 'الصورة الحالية تُستخدم في واجهة البيع' : 'Current image is used in POS'}</p>
                      )}
                    </div>
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.description}</label>
                      <textarea
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none transition-shadow resize-y min-h-[88px]"
                        rows={3}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-slate-200">
                  <h4 className="text-sm font-semibold text-slate-800 mb-4">{t.itemCategories.accountingLinkSection}</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">{(t as { accountDefaults?: { inventory?: string } }).accountDefaults?.inventory ?? 'حساب المخزون'}</label>
                      <select
                        value={form.inventory_account_id}
                        onChange={(e) => setForm({ ...form, inventory_account_id: e.target.value })}
                        className="w-full h-10 border border-slate-300 rounded-lg px-2.5 text-sm bg-white focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                      >
                        <option value="">—</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} — {a.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">{(t as { accountDefaults?: { cogs?: string } }).accountDefaults?.cogs ?? 'حساب تكلفة المبيعات'}</label>
                      <select
                        value={form.cost_of_sales_account_id}
                        onChange={(e) => setForm({ ...form, cost_of_sales_account_id: e.target.value })}
                        className="w-full h-10 border border-slate-300 rounded-lg px-2.5 text-sm bg-white focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                      >
                        <option value="">—</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} — {a.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">{(t as { accountDefaults?: { sales?: string } }).accountDefaults?.sales ?? 'حساب المبيعات'}</label>
                      <select
                        value={form.sales_account_id}
                        onChange={(e) => setForm({ ...form, sales_account_id: e.target.value })}
                        className="w-full h-10 border border-slate-300 rounded-lg px-2.5 text-sm bg-white focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                      >
                        <option value="">—</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} — {a.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50/80">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-200/60 transition-colors"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="min-w-[120px] bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-5 py-2.5 text-sm font-medium disabled:opacity-50 transition-colors shadow-sm"
                >
                  {isSaving ? t.saving : t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={t.itemCategories.deleteCategory}
          message={`${t.itemCategories.confirmDelete.replace('{name}', deleteTarget.name)}${deleteTarget.items_count ? ` ${t.itemCategories.linkedItems.replace('{count}', new Intl.NumberFormat(locale).format(deleteTarget.items_count))}` : ''}`}
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
