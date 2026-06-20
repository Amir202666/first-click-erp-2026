import { useState, useMemo, Fragment } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchBranches,
  fetchRestaurantSections,
  fetchRestaurantTables,
  saveRestaurantSection,
  deleteRestaurantSection,
  saveRestaurantTable,
  deleteRestaurantTable,
} from '../../api/tenant'
import type { Branch, RestaurantSection, RestaurantTable } from '../../types'
import { getLocalizedName } from '../../utils/localizedName'
import { Plus, Trash2, Edit2, X, Hash, ArrowUpDown, Type, Building2, ChevronDown, ChevronUp } from 'lucide-react'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Toast, { type ToastType } from '../../components/ui/Toast'
import { useClientSort, type SortColumn } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'

function tableBelongsToSection(table: RestaurantTable, section: RestaurantSection): boolean {
  const s = (table.section ?? '').trim()
  if (!s) return false
  return (
    s === section.name.trim()
    || (!!section.name_en && s === section.name_en.trim())
    || (!!section.code && s === section.code.trim())
  )
}

function sectionStorageName(section: RestaurantSection): string {
  return section.name.trim()
}

export default function RestaurantSectionsPage() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()
  const r = t.restaurant

  const [editing, setEditing] = useState<Partial<RestaurantSection> | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<RestaurantSection | null>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)

  const [expandedSectionId, setExpandedSectionId] = useState<number | null>(null)
  const [tableEditing, setTableEditing] = useState<Partial<RestaurantTable> | null>(null)
  const [tableModalOpen, setTableModalOpen] = useState(false)
  const [tableDeleteTarget, setTableDeleteTarget] = useState<RestaurantTable | null>(null)

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

  const { data: tables } = useQuery({
    queryKey: ['restaurantTables', tenantId],
    queryFn: () => fetchRestaurantTables(tenantId),
    enabled: !!tenantId,
  })

  const tablesBySection = useMemo(() => {
    const map = new Map<number, RestaurantTable[]>()
    for (const sec of sections ?? []) {
      map.set(
        sec.id,
        (tables ?? []).filter((tbl) => tableBelongsToSection(tbl, sec)),
      )
    }
    return map
  }, [sections, tables])

  const saveMut = useMutation({
    mutationFn: (payload: Partial<RestaurantSection> & { id?: number }) => saveRestaurantSection(tenantId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurantSections', tenantId] })
      setModalOpen(false)
      setEditing(null)
      setToast({ message: lang === 'ar' ? 'تم الحفظ بنجاح' : 'Saved successfully', type: 'success' })
    },
    onError: (err: unknown) => {
      const ax = err as { response?: { data?: { message?: string } }; message?: string }
      const msg = ax?.response?.data?.message ?? ax?.message ?? (lang === 'ar' ? 'فشل الحفظ' : 'Save failed')
      setToast({ message: typeof msg === 'string' ? msg : (lang === 'ar' ? 'فشل الحفظ' : 'Save failed'), type: 'error' })
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteRestaurantSection(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurantSections', tenantId] })
      setDeleteTarget(null)
      setToast({ message: lang === 'ar' ? 'تم حذف القسم' : 'Section deleted', type: 'success' })
    },
  })

  const saveTableMut = useMutation({
    mutationFn: (payload: Partial<RestaurantTable> & { id?: number }) => saveRestaurantTable(tenantId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurantTables', tenantId] })
      setTableModalOpen(false)
      setTableEditing(null)
      setToast({ message: lang === 'ar' ? 'تم حفظ الطاولة' : 'Table saved', type: 'success' })
    },
    onError: (err: unknown) => {
      const ax = err as { response?: { data?: { message?: string } }; message?: string }
      const msg = ax?.response?.data?.message ?? ax?.message ?? (lang === 'ar' ? 'فشل حفظ الطاولة' : 'Failed to save table')
      setToast({ message: typeof msg === 'string' ? msg : (lang === 'ar' ? 'فشل حفظ الطاولة' : 'Failed to save table'), type: 'error' })
    },
  })

  const deleteTableMut = useMutation({
    mutationFn: (id: number) => deleteRestaurantTable(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurantTables', tenantId] })
      setTableDeleteTarget(null)
      setToast({ message: lang === 'ar' ? 'تم حذف الطاولة' : 'Table deleted', type: 'success' })
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

  const openCreateTable = (section: RestaurantSection) => {
    setExpandedSectionId(section.id)
    setTableEditing({
      id: undefined,
      name: '',
      code: '',
      branch_id: section.branch_id ?? null,
      section: sectionStorageName(section),
      capacity: 4,
      shape: 'square',
      status: 'available',
      sort_order: 0,
    })
    setTableModalOpen(true)
  }

  const openEditTable = (section: RestaurantSection, table: RestaurantTable) => {
    setExpandedSectionId(section.id)
    setTableEditing({ ...table, section: sectionStorageName(section) })
    setTableModalOpen(true)
  }

  const closeModal = () => {
    if (saveMut.isPending) return
    setModalOpen(false)
    setEditing(null)
  }

  const closeTableModal = () => {
    if (saveTableMut.isPending) return
    setTableModalOpen(false)
    setTableEditing(null)
  }

  const toggleExpand = (sectionId: number) => {
    setExpandedSectionId((prev) => (prev === sectionId ? null : sectionId))
  }

  const sectionRows = sections ?? []
  type SectionSortKey = 'code' | 'name' | 'branch' | 'sort_order' | 'tables_count'
  const sectionSortColumns = useMemo((): SortColumn<RestaurantSection, SectionSortKey>[] => {
    return [
      { key: 'code', type: 'string', getValue: (s) => s.code ?? '' },
      { key: 'name', type: 'string', getValue: (s) => getLocalizedName(s, lang) },
      { key: 'branch', type: 'string', getValue: (s) => s.branch?.name ?? '' },
      { key: 'sort_order', type: 'number', getValue: (s) => Number(s.sort_order ?? 0) },
      {
        key: 'tables_count',
        type: 'number',
        getValue: (s) => tablesBySection.get(s.id)?.length ?? 0,
      },
    ]
  }, [lang, tablesBySection])
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
      payload.id = editing.id
    }
    saveMut.mutate(payload)
  }

  const handleTableSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!tableEditing?.name?.trim()) {
      setToast({ message: lang === 'ar' ? 'اسم الطاولة مطلوب' : 'Table name is required', type: 'error' })
      return
    }
    saveTableMut.mutate({
      id: tableEditing.id,
      name: tableEditing.name.trim(),
      code: (tableEditing.code ?? '').trim(),
      branch_id: tableEditing.branch_id ?? null,
      section: tableEditing.section ?? '',
      capacity: tableEditing.capacity ?? 4,
      shape: tableEditing.shape ?? 'square',
      status: tableEditing.status ?? 'available',
      sort_order: tableEditing.sort_order ?? 0,
    })
  }

  const statusLabel = (status: string) => {
    if (status === 'available') return r?.statusAvailable ?? (lang === 'ar' ? 'متاحة' : 'Available')
    if (status === 'occupied') return r?.statusOccupied ?? (lang === 'ar' ? 'مشغولة' : 'Occupied')
    if (status === 'closed') return lang === 'ar' ? 'مغلقة' : 'Closed'
    return r?.statusCleaning ?? (lang === 'ar' ? 'قيد التنظيف' : 'Cleaning')
  }

  const statusClass = (status: string) => {
    if (status === 'available') return 'bg-emerald-50 text-emerald-700'
    if (status === 'occupied') return 'bg-amber-50 text-amber-700'
    if (status === 'closed') return 'bg-slate-100 text-slate-600'
    return 'bg-slate-50 text-slate-700'
  }

  const pageTitle = r?.sectionsTablesTitle ?? (lang === 'ar' ? 'الأقسام والطاولات' : 'Sections & tables')

  return (
    <div className="space-y-4 px-5 md:px-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">{pageTitle}</h1>
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
              <th className="w-10 px-2 py-2" aria-hidden />
              <SortableTh label={lang === 'ar' ? 'الكود' : 'Code'} sortKey="code" sortState={sort} onToggle={toggleSort} className="px-0 py-0 text-start text-slate-600 font-medium" />
              <SortableTh label={lang === 'ar' ? 'الاسم' : 'Name'} sortKey="name" sortState={sort} onToggle={toggleSort} className="px-0 py-0 text-start text-slate-600 font-medium" />
              <SortableTh label={lang === 'ar' ? 'الفرع' : 'Branch'} sortKey="branch" sortState={sort} onToggle={toggleSort} className="px-0 py-0 text-start text-slate-600 font-medium" />
              <SortableTh label={lang === 'ar' ? 'الترتيب' : 'Order'} sortKey="sort_order" sortState={sort} onToggle={toggleSort} className="px-0 py-0 text-start text-slate-600 font-medium" />
              <SortableTh label={lang === 'ar' ? 'الطاولات' : 'Tables'} sortKey="tables_count" sortState={sort} onToggle={toggleSort} className="px-0 py-0 text-start text-slate-600 font-medium" />
              <th className="px-3 py-2 text-end text-slate-600">{lang === 'ar' ? 'إجراءات' : 'Actions'}</th>
            </tr>
          </thead>
          <tbody>
            {sortedSections.map((sec) => {
              const sectionTables = tablesBySection.get(sec.id) ?? []
              const expanded = expandedSectionId === sec.id
              return (
                <Fragment key={sec.id}>
                  <tr key={sec.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => toggleExpand(sec.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                        title={lang === 'ar' ? 'عرض الطاولات' : 'Show tables'}
                      >
                        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    </td>
                    <td className="px-3 py-2">{sec.code || '-'}</td>
                    <td className="px-3 py-2 font-medium">{getLocalizedName(sec, lang)}</td>
                    <td className="px-3 py-2">{sec.branch?.name ?? '-'}</td>
                    <td className="px-3 py-2">{sec.sort_order ?? 0}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-700">
                        {sectionTables.length}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-end">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openCreateTable(sec)}
                          className="inline-flex h-8 items-center gap-1 rounded-md border border-teal-200 bg-teal-50 px-2 text-teal-700 hover:bg-teal-100 text-xs"
                        >
                          <Plus size={12} />
                          <span className="hidden sm:inline">{lang === 'ar' ? 'طاولة' : 'Table'}</span>
                        </button>
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
                  {expanded && (
                    <tr key={`${sec.id}-tables`} className="border-t border-slate-100 bg-slate-50/40">
                      <td colSpan={7} className="px-4 py-3">
                        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-100">
                            <span className="text-xs font-semibold text-slate-600">
                              {lang === 'ar'
                                ? `طاولات ${getLocalizedName(sec, lang)} (${sectionTables.length})`
                                : `Tables in ${getLocalizedName(sec, lang)} (${sectionTables.length})`}
                            </span>
                            <button
                              type="button"
                              onClick={() => openCreateTable(sec)}
                              className="inline-flex items-center gap-1 rounded-md bg-primary-600 px-2.5 py-1 text-xs text-white hover:bg-primary-700"
                            >
                              <Plus size={12} />
                              {lang === 'ar' ? 'إضافة طاولة' : 'Add table'}
                            </button>
                          </div>
                          {sectionTables.length === 0 ? (
                            <p className="px-3 py-4 text-center text-xs text-slate-500">
                              {lang === 'ar' ? 'لا توجد طاولات في هذا القسم.' : 'No tables in this section.'}
                            </p>
                          ) : (
                            <table className="min-w-full text-xs">
                              <thead className="bg-slate-50">
                                <tr>
                                  <th className="px-3 py-2 text-start text-slate-500">{r?.code ?? (lang === 'ar' ? 'الكود' : 'Code')}</th>
                                  <th className="px-3 py-2 text-start text-slate-500">{r?.name ?? (lang === 'ar' ? 'الاسم' : 'Name')}</th>
                                  <th className="px-3 py-2 text-start text-slate-500">{r?.capacity ?? (lang === 'ar' ? 'السعة' : 'Capacity')}</th>
                                  <th className="px-3 py-2 text-start text-slate-500">{lang === 'ar' ? 'الشكل' : 'Shape'}</th>
                                  <th className="px-3 py-2 text-start text-slate-500">{r?.status ?? (lang === 'ar' ? 'الحالة' : 'Status')}</th>
                                  <th className="px-3 py-2 text-end text-slate-500">{r?.actions ?? (lang === 'ar' ? 'إجراءات' : 'Actions')}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {sectionTables.map((tbl) => (
                                  <tr key={tbl.id} className="border-t border-slate-100">
                                    <td className="px-3 py-2">{tbl.code || '-'}</td>
                                    <td className="px-3 py-2 font-medium">{tbl.name}</td>
                                    <td className="px-3 py-2">{tbl.capacity ?? '-'}</td>
                                    <td className="px-3 py-2">
                                      {tbl.shape === 'round'
                                        ? (lang === 'ar' ? 'دائرية' : 'Round')
                                        : (lang === 'ar' ? 'مربعة' : 'Square')}
                                    </td>
                                    <td className="px-3 py-2">
                                      <span className={`inline-flex rounded-full px-2 py-0.5 font-medium ${statusClass(tbl.status)}`}>
                                        {statusLabel(tbl.status)}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-end">
                                      <div className="inline-flex items-center gap-1">
                                        <button
                                          type="button"
                                          onClick={() => openEditTable(sec, tbl)}
                                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                                        >
                                          <Edit2 size={12} />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setTableDeleteTarget(tbl)}
                                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-red-100 bg-red-50 text-red-600 hover:bg-red-100"
                                        >
                                          <Trash2 size={12} />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {sections && sortedSections.length === 0 && (
              <tr>
                <td className="px-3 py-4 text-center text-slate-500 text-sm" colSpan={7}>
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

      {tableModalOpen && tableEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-800">
                {tableEditing.id
                  ? (r?.editTable ?? (lang === 'ar' ? 'تعديل طاولة' : 'Edit table'))
                  : (r?.addNewTable ?? (lang === 'ar' ? 'إضافة طاولة جديدة' : 'Add new table'))}
              </h2>
              <button type="button" onClick={closeTableModal} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleTableSubmit} className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">{r?.code ?? (lang === 'ar' ? 'الكود' : 'Code')}</label>
                  <input
                    type="text"
                    value={tableEditing.code ?? ''}
                    onChange={(e) => setTableEditing((prev) => prev ? { ...prev, code: e.target.value } : prev)}
                    className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">{r?.name ?? (lang === 'ar' ? 'الاسم' : 'Name')}</label>
                  <input
                    type="text"
                    value={tableEditing.name ?? ''}
                    onChange={(e) => setTableEditing((prev) => prev ? { ...prev, name: e.target.value } : prev)}
                    required
                    className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">{r?.section ?? (lang === 'ar' ? 'القسم' : 'Section')}</label>
                  <input
                    type="text"
                    value={tableEditing.section ?? ''}
                    readOnly
                    className="w-full h-9 rounded-md border border-slate-200 bg-slate-50 px-2 text-sm text-slate-600"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">{r?.branch ?? (lang === 'ar' ? 'الفرع' : 'Branch')}</label>
                  <select
                    value={tableEditing.branch_id ?? ''}
                    onChange={(e) =>
                      setTableEditing((prev) =>
                        prev ? { ...prev, branch_id: e.target.value ? Number(e.target.value) : null } : prev,
                      )
                    }
                    className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary-500"
                  >
                    <option value="">{r?.none ?? (lang === 'ar' ? 'بدون' : 'None')}</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">{r?.capacity ?? (lang === 'ar' ? 'السعة' : 'Capacity')}</label>
                  <input
                    type="number"
                    min={1}
                    value={tableEditing.capacity ?? ''}
                    onChange={(e) =>
                      setTableEditing((prev) =>
                        prev ? { ...prev, capacity: e.target.value ? Number(e.target.value) : null } : prev,
                      )
                    }
                    className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">{lang === 'ar' ? 'الشكل' : 'Shape'}</label>
                  <select
                    value={tableEditing.shape ?? 'square'}
                    onChange={(e) =>
                      setTableEditing((prev) =>
                        prev ? { ...prev, shape: e.target.value as RestaurantTable['shape'] } : prev,
                      )
                    }
                    className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary-500"
                  >
                    <option value="square">{lang === 'ar' ? 'مربعة' : 'Square'}</option>
                    <option value="round">{lang === 'ar' ? 'دائرية' : 'Round'}</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 mt-2">
                <button
                  type="button"
                  onClick={closeTableModal}
                  className="inline-flex items-center justify-center px-3 py-1.5 rounded-md border border-slate-200 text-sm text-slate-700 hover:bg-slate-50"
                  disabled={saveTableMut.isPending}
                >
                  {t?.cancel ?? (lang === 'ar' ? 'إلغاء' : 'Cancel')}
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center px-4 py-1.5 rounded-md bg-primary-600 text-white text-sm hover:bg-primary-700 disabled:opacity-60"
                  disabled={saveTableMut.isPending}
                >
                  {saveTableMut.isPending
                    ? (r?.saving ?? (lang === 'ar' ? 'جارٍ الحفظ...' : 'Saving...'))
                    : (r?.save ?? (lang === 'ar' ? 'حفظ' : 'Save'))}
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

      {tableDeleteTarget && (
        <ConfirmDialog
          title={lang === 'ar' ? 'حذف الطاولة' : 'Delete table'}
          message={
            lang === 'ar'
              ? `هل أنت متأكد من حذف الطاولة "${tableDeleteTarget.name}"؟`
              : `Are you sure you want to delete the table "${tableDeleteTarget.name}"?`
          }
          onConfirm={() => deleteTableMut.mutate(tableDeleteTarget.id)}
          onCancel={() => setTableDeleteTarget(null)}
          confirmLabel={lang === 'ar' ? 'حذف' : 'Delete'}
          variant="danger"
        />
      )}
    </div>
  )
}
