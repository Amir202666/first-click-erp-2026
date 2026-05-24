import { useState, useCallback, type CSSProperties, type MouseEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchSalesReps, createSalesRep, updateSalesRep, deleteSalesRep, fetchBranches } from '../../api/tenant'
import type { SalesRep, PaginatedResponse, Branch } from '../../types'
import { Plus, MoreVertical, Edit, Trash2, X, UserCircle } from 'lucide-react'
import Toast, { type ToastType } from '../../components/ui/Toast'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { useClientSort } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'

const emptyForm = { name: '', region: '', address: '', phone: '', commission_percent: 0, is_active: true, branch_ids: [] as number[] }

export default function SalesRepList() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()

  const [actionsOpenId, setActionsOpenId] = useState<number | null>(null)
  const [actionsAnchor, setActionsAnchor] = useState<{ top: number; left: number; width: number } | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<SalesRep | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SalesRep | null>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [form, setForm] = useState(emptyForm)

  const { data, isLoading } = useQuery<PaginatedResponse<SalesRep>>({
    queryKey: ['sales-reps', tenantId],
    queryFn: () => fetchSalesReps(tenantId, { per_page: '200' }),
    enabled: !!tenantId,
  })

  const branchesRes = useQuery<Branch[]>({
    queryKey: ['branches', tenantId],
    queryFn: async () => {
      const r = await fetchBranches(tenantId)
      return Array.isArray(r) ? r : (r as { data: Branch[] }).data
    },
    enabled: !!tenantId && showModal,
  })
  const branches = branchesRes.data ?? []

  const list = data?.data ?? []
  const { sort, toggleSort, sortedRows } = useClientSort(list, [
    { key: 'name', type: 'string', getValue: (r: SalesRep) => r.name ?? '' },
    { key: 'region', type: 'string', getValue: (r: SalesRep) => r.region ?? '' },
    { key: 'phone', type: 'string', getValue: (r: SalesRep) => r.phone ?? '' },
    { key: 'commission', type: 'number', getValue: (r: SalesRep) => Number(r.commission_percent) || 0 },
    { key: 'status', type: 'string', getValue: (r: SalesRep) => (r.is_active ? (t.active ?? 'نشط') : (t.inactive ?? 'غير نشط')) },
  ], { locale: lang === 'ar' ? 'ar-u-nu-latn' : 'en-US' })
  const showToast = useCallback((message: string, type: ToastType) => setToast({ message, type }), [])

  const closeActionsMenu = useCallback(() => {
    setActionsOpenId(null)
    setActionsAnchor(null)
  }, [])

  const openActionsMenu = useCallback((e: MouseEvent, rep: SalesRep) => {
    e.stopPropagation()
    const el = e.currentTarget as HTMLElement
    const rect = el.getBoundingClientRect()
    setActionsAnchor({ top: rect.bottom, left: rect.left, width: rect.width })
    setActionsOpenId(rep.id)
  }, [])

  const createMut = useMutation({
    mutationFn: (d: Partial<SalesRep>) => createSalesRep(tenantId, d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-reps', tenantId] })
      closeModal()
      showToast(t.msg?.addedSuccess ?? 'تمت الإضافة بنجاح', 'success')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? (t.msg?.errorOccurred ?? 'حدث خطأ')
      showToast(msg, 'error')
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data: d }: { id: number; data: Partial<SalesRep> }) => updateSalesRep(tenantId, id, d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-reps', tenantId] })
      closeModal()
      showToast(t.msg?.updatedSuccess ?? 'تم التحديث بنجاح', 'success')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? (t.msg?.errorOccurred ?? 'حدث خطأ')
      showToast(msg, 'error')
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteSalesRep(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-reps', tenantId] })
      setDeleteTarget(null)
      showToast(t.msg?.deletedSuccess ?? 'تم الحذف بنجاح', 'success')
    },
    onError: (err: unknown) => {
      setDeleteTarget(null)
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? (t.msg?.errorOccurred ?? 'حدث خطأ')
      showToast(msg, 'error')
    },
  })

  function closeModal() {
    setShowModal(false)
    setEditing(null)
    setForm(emptyForm)
  }

  function openEdit(rep: SalesRep) {
    setEditing(rep)
    setForm({
      name: rep.name,
      region: rep.region ?? '',
      address: rep.address ?? '',
      phone: rep.phone ?? '',
      commission_percent: Number(rep.commission_percent) ?? 0,
      is_active: rep.is_active,
      branch_ids: rep.branches?.map((b) => b.id) ?? [],
    })
    setShowModal(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const payload = {
      name: form.name.trim(),
      region: form.region.trim() || null,
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
      commission_percent: Number(form.commission_percent) || 0,
      is_active: form.is_active,
      branch_ids: form.branch_ids,
    }
    if (editing) updateMut.mutate({ id: editing.id, data: payload })
    else createMut.mutate(payload)
  }

  function toggleBranch(id: number) {
    setForm((f) => ({
      ...f,
      branch_ids: f.branch_ids.includes(id) ? f.branch_ids.filter((x) => x !== id) : [...f.branch_ids, id],
    }))
  }

  const isSaving = createMut.isPending || updateMut.isPending

  return (
    <div className="w-full max-w-full min-w-0 p-3 md:p-4 space-y-3">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-primary-100 flex items-center justify-center">
            <UserCircle size={18} className="text-primary-600" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">
            {lang === 'ar' ? 'المناديب' : 'Sales Representatives'}
          </h1>
        </div>
        <button
          type="button"
          onClick={() => {
            closeModal()
            setShowModal(true)
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700 transition"
        >
          <Plus size={16} /> {t.add}
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-center text-slate-500 text-sm">{t.loading}</div>
        ) : list.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-sm">{t.noData}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse table-fixed min-w-[640px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2 text-right font-semibold text-slate-700 w-16 min-w-0">#</th>
                  <SortableTh label={lang === 'ar' ? 'الاسم' : 'Name'} sortKey="name" sortState={sort} onToggle={toggleSort} widthClassName="w-[22%]" className="text-right font-semibold text-slate-700" />
                  <SortableTh label={lang === 'ar' ? 'المنطقة' : 'Region'} sortKey="region" sortState={sort} onToggle={toggleSort} widthClassName="w-[18%]" className="text-right font-semibold text-slate-700" />
                  <SortableTh label={lang === 'ar' ? 'رقم الهاتف' : 'Phone'} sortKey="phone" sortState={sort} onToggle={toggleSort} widthClassName="w-[16%]" className="text-right font-semibold text-slate-700" />
                  <SortableTh label={lang === 'ar' ? 'نسبة العمولة %' : 'Commission %'} sortKey="commission" sortState={sort} onToggle={toggleSort} widthClassName="w-[14%]" className="text-right font-semibold text-slate-700" />
                  <SortableTh label={t.status} sortKey="status" sortState={sort} onToggle={toggleSort} widthClassName="w-[14%]" className="text-right font-semibold text-slate-700" />
                  <th className="px-3 py-2 text-right font-semibold text-slate-700 w-[16%] min-w-0">{t.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedRows.map((rep, idx) => (
                  <tr key={rep.id} className="hover:bg-slate-50/80">
                    <td className="px-3 py-1.5 text-slate-600 min-w-0">{idx + 1}</td>
                    <td className="px-3 py-1.5 font-medium text-slate-900 min-w-0 truncate" title={rep.name}>{rep.name}</td>
                    <td className="px-3 py-1.5 text-slate-600 min-w-0 truncate" title={rep.region ?? undefined}>{rep.region ?? '—'}</td>
                    <td className="px-3 py-1.5 text-right text-slate-600 min-w-0 truncate" title={rep.phone ?? undefined} dir="ltr">
                      {rep.phone ?? '—'}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums min-w-0">{Number(rep.commission_percent)}</td>
                    <td className="px-3 py-1.5 min-w-0">
                      <span className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${rep.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {rep.is_active ? (t.active ?? 'نشط') : (t.inactive ?? 'غير نشط')}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 min-w-0">
                      <button
                        type="button"
                        onClick={(e) => openActionsMenu(e, rep)}
                        className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-600"
                        title={t.actions}
                        aria-label={t.actions}
                      >
                        <MoreVertical size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {actionsOpenId !== null && actionsAnchor && (() => {
        const openRep = list.find((r) => r.id === actionsOpenId)
        if (!openRep) return null
        const menuItemClass = `flex items-center gap-2 px-3 py-2 text-sm w-full ${isRtl ? 'text-right' : 'text-left'}`
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
                  openEdit(openRep)
                }}
              >
                <Edit size={16} className="shrink-0" />
                {t.edit}
              </button>
              <button
                type="button"
                className={`${menuItemClass} text-red-600 hover:bg-red-50`}
                onClick={() => {
                  setDeleteTarget(openRep)
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={closeModal}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5 shrink-0">
              <h3 className="text-base font-semibold text-slate-900">
                {editing ? (t.edit ?? 'تعديل') : (t.add ?? 'إضافة')} — {lang === 'ar' ? 'مندوب' : 'Representative'}
              </h3>
              <button type="button" onClick={closeModal} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-3 overflow-y-auto flex-1 min-h-0">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-0.5">{lang === 'ar' ? 'الاسم' : 'Name'} *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500/20 focus:border-primary-500 outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-0.5">{lang === 'ar' ? 'المنطقة' : 'Region'}</label>
                <input
                  type="text"
                  value={form.region}
                  onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500/20 focus:border-primary-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-0.5">{lang === 'ar' ? 'عنوان المندوب' : 'Representative Address'}</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500/20 focus:border-primary-500 outline-none"
                  placeholder={lang === 'ar' ? 'عنوان المندوب' : 'Representative address'}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-0.5">{lang === 'ar' ? 'رقم الهاتف' : 'Phone'}</label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500/20 focus:border-primary-500 outline-none"
                  placeholder={lang === 'ar' ? 'رقم الهاتف' : 'Phone number'}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-0.5">{lang === 'ar' ? 'نسبة العمولة %' : 'Commission %'}</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={form.commission_percent}
                  onChange={(e) => setForm((f) => ({ ...f, commission_percent: parseFloat(e.target.value) || 0 }))}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm text-right tabular-nums focus:ring-2 focus:ring-inset focus:ring-primary-500/20 focus:border-primary-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">{lang === 'ar' ? 'الفرع' : 'Branch'} — {lang === 'ar' ? 'يمكن اختيار أكثر من فرع' : 'Select one or more'}</label>
                {branchesRes.isLoading ? (
                  <p className="text-xs text-slate-500 py-1">{t.loading}</p>
                ) : branches.length === 0 ? (
                  <p className="text-xs text-slate-500 py-1">{lang === 'ar' ? 'لا توجد فروع' : 'No branches'}</p>
                ) : (
                  <div className="border border-slate-300 rounded-lg p-2 max-h-32 overflow-y-auto space-y-1.5">
                    {branches.map((b) => (
                      <label key={b.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 rounded px-1.5 py-0.5">
                        <input
                          type="checkbox"
                          checked={form.branch_ids.includes(b.id)}
                          onChange={() => toggleBranch(b.id)}
                          className="rounded border-slate-300 text-primary-600 h-3.5 w-3.5"
                        />
                        <span className="text-sm text-slate-800">{lang === 'ar' ? b.name : (b.name_en || b.name)}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="sr_active"
                  checked={form.is_active}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                  className="rounded border-slate-300 text-primary-600 h-3.5 w-3.5"
                />
                <label htmlFor="sr_active" className="text-xs font-medium text-slate-700">{t.active}</label>
              </div>
              <div className="flex gap-2 pt-1 shrink-0">
                <button type="button" onClick={closeModal} className="flex-1 px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">
                  {t.cancel}
                </button>
                <button type="submit" disabled={isSaving || !form.name.trim()} className="flex-1 px-3 py-1.5 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
                  {isSaving ? t.saving : t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={t.delete}
          message={lang === 'ar' ? `حذف المندوب: ${deleteTarget.name}؟` : `Delete representative: ${deleteTarget.name}?`}
          onConfirm={() => deleteMut.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
          isLoading={deleteMut.isPending}
        />
      )}
    </div>
  )
}
