import { useState, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchBranches, fetchRestaurantTables, fetchRestaurantSections, saveRestaurantTable, deleteRestaurantTable } from '../../api/tenant'
import type { Branch, RestaurantTable } from '../../types'
import { getLocalizedName } from '../../utils/localizedName'
import { Plus, Trash2, Edit2, X } from 'lucide-react'
import { useClientSort, type SortColumn } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'

export default function RestaurantTablesPage() {
  const { currentTenant } = useAuth()
  const { t, lang } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()

  const [editing, setEditing] = useState<Partial<RestaurantTable> | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const { data: branchesData } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId,
  })
  const branches: Branch[] = Array.isArray(branchesData)
    ? (branchesData as Branch[])
    : ((branchesData as unknown as { data?: Branch[] })?.data ?? [])

  const { data: tables } = useQuery({
    queryKey: ['restaurantTables', tenantId],
    queryFn: () => fetchRestaurantTables(tenantId),
    enabled: !!tenantId,
  })

  const { data: sections } = useQuery({
    queryKey: ['restaurantSections', tenantId],
    queryFn: () => fetchRestaurantSections(tenantId),
    enabled: !!tenantId && modalOpen,
  })

  const saveMut = useMutation({
    mutationFn: (payload: Partial<RestaurantTable> & { id?: number }) => saveRestaurantTable(tenantId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurantTables', tenantId] })
      setModalOpen(false)
      setEditing(null)
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteRestaurantTable(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurantTables', tenantId] })
    },
  })

  const openCreate = () => {
    setEditing({
      id: undefined,
      name: '',
      code: '',
      branch_id: branches[0]?.id ?? null,
      status: 'available',
      capacity: 4,
      section: '',
    } as Partial<RestaurantTable>)
    setModalOpen(true)
  }

  const openEdit = (table: RestaurantTable) => {
    setEditing(table)
    setModalOpen(true)
  }

  const closeModal = () => {
    if (saveMut.isPending) return
    setModalOpen(false)
    setEditing(null)
  }

  const tableRows = tables ?? []
  type RTableSortKey = 'code' | 'name' | 'section' | 'branch' | 'capacity' | 'status'
  const restaurantTableSortColumns = useMemo((): SortColumn<RestaurantTable, RTableSortKey>[] => {
    return [
      { key: 'code', type: 'string', getValue: (row) => row.code ?? '' },
      { key: 'name', type: 'string', getValue: (row) => row.name ?? '' },
      { key: 'section', type: 'string', getValue: (row) => row.section ?? '' },
      {
        key: 'branch',
        type: 'string',
        getValue: (row) => branches.find((b) => b.id === (row.branch_id ?? 0))?.name ?? '',
      },
      { key: 'capacity', type: 'number', getValue: (row) => Number(row.capacity ?? 0) },
      { key: 'status', type: 'string', getValue: (row) => row.status ?? '' },
    ]
  }, [branches])
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const { sort, toggleSort, sortedRows: sortedRestaurantTables } = useClientSort(tableRows, restaurantTableSortColumns, { locale })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing?.name) return
    const payload: Partial<RestaurantTable> & { id?: number } = {
      id: editing.id,
      name: editing.name,
      code: editing.code ?? '',
      branch_id: editing.branch_id ?? null,
      section: editing.section ?? '',
      capacity: editing.capacity ?? null,
      status: editing.status ?? 'available',
      sort_order: editing.sort_order ?? 0,
    }
    saveMut.mutate(payload)
  }

  return (
    <div className="space-y-4 px-5 md:px-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">
          {t.restaurant?.tablesTitle ?? (lang === 'ar' ? 'طاولات المطعم' : 'Restaurant tables')}
        </h1>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-md bg-primary-600 text-white text-sm px-3 py-1.5 hover:bg-primary-700 transition-colors"
        >
          <Plus size={16} />
          <span>{t.restaurant?.addTable ?? (lang === 'ar' ? 'إضافة طاولة' : 'Add table')}</span>
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <SortableTh label={lang === 'ar' ? 'الكود' : 'Code'} sortKey="code" sortState={sort} onToggle={toggleSort} className="px-0 py-0 text-start text-slate-600 font-medium" />
              <SortableTh label={t.restaurant?.name ?? (lang === 'ar' ? 'الاسم' : 'Name')} sortKey="name" sortState={sort} onToggle={toggleSort} className="px-0 py-0 text-start text-slate-600 font-medium" />
              <SortableTh label={t.restaurant?.section ?? (lang === 'ar' ? 'القسم' : 'Section')} sortKey="section" sortState={sort} onToggle={toggleSort} className="px-0 py-0 text-start text-slate-600 font-medium" />
              <SortableTh label={t.restaurant?.branch ?? (lang === 'ar' ? 'الفرع' : 'Branch')} sortKey="branch" sortState={sort} onToggle={toggleSort} className="px-0 py-0 text-start text-slate-600 font-medium" />
              <SortableTh label={t.restaurant?.capacity ?? (lang === 'ar' ? 'السعة' : 'Capacity')} sortKey="capacity" sortState={sort} onToggle={toggleSort} className="px-0 py-0 text-start text-slate-600 font-medium" />
              <SortableTh label={t.restaurant?.status ?? (lang === 'ar' ? 'الحالة' : 'Status')} sortKey="status" sortState={sort} onToggle={toggleSort} className="px-0 py-0 text-start text-slate-600 font-medium" />
              <th className="px-3 py-2 text-end text-slate-600">{t.restaurant?.actions ?? (lang === 'ar' ? 'إجراءات' : 'Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {sortedRestaurantTables.map((tbl) => {
              const branch = branches.find((b) => b.id === (tbl.branch_id ?? 0))
              return (
                <tr key={tbl.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                  <td className="px-3 py-2">{tbl.code || '-'}</td>
                  <td className="px-3 py-2 font-medium">{tbl.name}</td>
                  <td className="px-3 py-2">{tbl.section || '-'}</td>
                  <td className="px-3 py-2">{branch ? branch.name : '-'}</td>
                  <td className="px-3 py-2">{tbl.capacity ?? '-'}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        tbl.status === 'available'
                          ? 'bg-emerald-50 text-emerald-700'
                          : tbl.status === 'occupied'
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-slate-50 text-slate-700'
                      }`}
                    >
                      {tbl.status === 'available'
                        ? t.restaurant?.statusAvailable ?? (lang === 'ar' ? 'متاحة' : 'Available')
                        : tbl.status === 'occupied'
                        ? t.restaurant?.statusOccupied ?? (lang === 'ar' ? 'مشغولة' : 'Occupied')
                        : t.restaurant?.statusCleaning ?? (lang === 'ar' ? 'قيد التنظيف' : 'Cleaning')}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-end">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(tbl)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => tbl.id && deleteMut.mutate(tbl.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-100 bg-red-50 text-red-600 hover:bg-red-100"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {tables && sortedRestaurantTables.length === 0 && (
              <tr>
                <td className="px-3 py-4 text-center text-slate-500 text-sm" colSpan={7}>
                  {t.restaurant?.noTables ?? (lang === 'ar' ? 'لا توجد طاولات بعد.' : 'No tables yet.')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && editing && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full mx-4">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-800">
                {editing.id
                  ? t.restaurant?.editTable ?? (lang === 'ar' ? 'تعديل طاولة' : 'Edit table')
                  : t.restaurant?.addNewTable ?? (lang === 'ar' ? 'إضافة طاولة جديدة' : 'Add new table')}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">
                    {t.restaurant?.code ?? (lang === 'ar' ? 'الكود' : 'Code')}
                  </label>
                  <input
                    type="text"
                    value={editing.code ?? ''}
                    onChange={(e) => setEditing((prev) => prev ? { ...prev, code: e.target.value } : prev)}
                    className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">
                    {t.restaurant?.name ?? (lang === 'ar' ? 'الاسم' : 'Name')}
                  </label>
                  <input
                    type="text"
                    value={editing.name ?? ''}
                    onChange={(e) => setEditing((prev) => prev ? { ...prev, name: e.target.value } : prev)}
                    required
                    className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">
                    {t.restaurant?.section ?? (lang === 'ar' ? 'القسم' : 'Section')}
                  </label>
                  <select
                    value={sections?.find((s) => getLocalizedName(s, lang) === (editing.section ?? ''))?.id ?? ''}
                    onChange={(e) => {
                      const id = e.target.value ? Number(e.target.value) : null
                      const sec = id ? sections?.find((s) => s.id === id) : null
                      setEditing((prev) =>
                        prev ? { ...prev, section: sec ? getLocalizedName(sec, lang) : '' } : prev,
                      )
                    }}
                    className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary-500"
                  >
                    <option value="">{t.restaurant?.none ?? (lang === 'ar' ? 'بدون' : 'None')}</option>
                    {sections?.map((sec) => (
                      <option key={sec.id} value={sec.id}>
                        {getLocalizedName(sec, lang)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">
                    {t.restaurant?.branch ?? (lang === 'ar' ? 'الفرع' : 'Branch')}
                  </label>
                  <select
                    value={editing.branch_id ?? ''}
                    onChange={(e) =>
                      setEditing((prev) =>
                        prev ? { ...prev, branch_id: e.target.value ? Number(e.target.value) : null } : prev,
                      )
                    }
                    className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary-500"
                  >
                    <option value="">{t.restaurant?.none ?? (lang === 'ar' ? 'بدون' : 'None')}</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">
                    {t.restaurant?.capacity ?? (lang === 'ar' ? 'السعة' : 'Capacity')}
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={editing.capacity ?? ''}
                    onChange={(e) =>
                      setEditing((prev) =>
                        prev ? { ...prev, capacity: e.target.value ? Number(e.target.value) : null } : prev,
                      )
                    }
                    className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">
                    {t.restaurant?.status ?? (lang === 'ar' ? 'الحالة' : 'Status')}
                  </label>
                  <select
                    value={editing.status ?? 'available'}
                    onChange={(e) =>
                      setEditing((prev) => prev ? { ...prev, status: e.target.value as RestaurantTable['status'] } : prev)
                    }
                    className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary-500"
                  >
                    <option value="available">
                      {t.restaurant?.statusAvailable ?? (lang === 'ar' ? 'متاحة' : 'Available')}
                    </option>
                    <option value="occupied">
                      {t.restaurant?.statusOccupied ?? (lang === 'ar' ? 'مشغولة' : 'Occupied')}
                    </option>
                    <option value="cleaning">
                      {t.restaurant?.statusCleaning ?? (lang === 'ar' ? 'قيد التنظيف' : 'Cleaning')}
                    </option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 mt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="inline-flex items-center justify-center px-3 py-1.5 rounded-md border border-slate-200 text-sm text-slate-700 hover:bg-slate-50"
                  disabled={saveMut.isPending}
                >
                  {t?.cancel ?? (lang === 'ar' ? 'إلغاء' : 'Cancel')}
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center px-4 py-1.5 rounded-md bg-primary-600 text-white text-sm hover:bg-primary-700 disabled:opacity-60"
                  disabled={saveMut.isPending}
                >
                  {saveMut.isPending
                    ? t.restaurant?.saving ?? (lang === 'ar' ? 'جارٍ الحفظ...' : 'Saving...')
                    : t.restaurant?.save ?? (lang === 'ar' ? 'حفظ' : 'Save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

