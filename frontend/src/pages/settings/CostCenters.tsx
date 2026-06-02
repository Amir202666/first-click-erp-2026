import { useState, useMemo, useCallback, useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchCostCenterTree, createCostCenter, updateCostCenter, deleteCostCenter } from '../../api/tenant'
import type { CostCenter } from '../../types'
import { Plus, Pencil, Trash2, X, ChevronDown, ChevronLeft, Target, MoreVertical } from 'lucide-react'
import Toast, { type ToastType } from '../../components/ui/Toast'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { useClientSort } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'
import type { SortState } from '../../hooks/useClientSort'

type CostCenterSortKey = 'code' | 'name' | 'description' | 'status'

function sortCostCenterTreeDeep(
  nodes: CostCenter[],
  sort: SortState<CostCenterSortKey>,
  collator: Intl.Collator,
  activeLabel: string,
  inactiveLabel: string,
): CostCenter[] {
  if (!sort) return nodes
  const dir = sort.direction === 'asc' ? 1 : -1
  const decorated = nodes.map((row, idx) => ({ row, idx }))
  decorated.sort((a, b) => {
    let cmp = 0
    switch (sort.key) {
      case 'code':
        cmp = collator.compare(String(a.row.code ?? ''), String(b.row.code ?? ''))
        break
      case 'name':
        cmp = collator.compare(String(a.row.name ?? ''), String(b.row.name ?? ''))
        break
      case 'description':
        cmp = collator.compare(String(a.row.description ?? ''), String(b.row.description ?? ''))
        break
      case 'status': {
        const as = a.row.is_active ? activeLabel : inactiveLabel
        const bs = b.row.is_active ? activeLabel : inactiveLabel
        cmp = collator.compare(as, bs)
        break
      }
      default:
        cmp = 0
    }
    if (cmp === 0) return a.idx - b.idx
    return cmp * dir
  })
  return decorated.map((d) => ({
    ...d.row,
    children: d.row.children?.length
      ? sortCostCenterTreeDeep(d.row.children, sort, collator, activeLabel, inactiveLabel)
      : d.row.children,
  }))
}

interface FlatCenter {
  id: number
  code: string
  name: string
  level: number
}

function flattenCenters(centers: CostCenter[], result: FlatCenter[] = [], level = 0): FlatCenter[] {
  for (const c of centers) {
    result.push({ id: c.id, code: c.code, name: c.name, level })
    if (c.children?.length) flattenCenters(c.children, result, level + 1)
  }
  return result
}

export default function CostCenters() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()

  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<CostCenter | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [deleteTarget, setDeleteTarget] = useState<CostCenter | null>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [form, setForm] = useState({
    code: '',
    name: '',
    name_en: '',
    parent_id: null as number | null,
    description: '',
    is_active: true,
  })
  const [openActionsId, setOpenActionsId] = useState<number | null>(null)
  const actionsMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!openActionsId) return
      const target = e.target as Node
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(target)) setOpenActionsId(null)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [openActionsId])

  const { data: tree = [], isLoading } = useQuery<CostCenter[]>({
    queryKey: ['costCenterTree', tenantId],
    queryFn: () => fetchCostCenterTree(tenantId),
    enabled: !!tenantId,
  })

  const flatCenters = useMemo(() => flattenCenters(tree), [tree])

  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const collator = useMemo(() => new Intl.Collator(locale, { numeric: true, sensitivity: 'base' }), [locale])
  const { sort, toggleSort } = useClientSort(tree, [
    { key: 'code', type: 'string', getValue: (c: CostCenter) => c.code ?? '' },
    { key: 'name', type: 'string', getValue: (c: CostCenter) => c.name ?? '' },
    { key: 'description', type: 'string', getValue: (c: CostCenter) => c.description ?? '' },
    { key: 'status', type: 'string', getValue: (c: CostCenter) => (c.is_active ? t.active : t.inactive) },
  ], { locale })
  const displayTree = useMemo(
    () => sortCostCenterTreeDeep(tree, sort, collator, t.active, t.inactive),
    [tree, sort, collator, t.active, t.inactive],
  )

  const showToast = useCallback((message: string, type: ToastType) => setToast({ message, type }), [])

  const createMut = useMutation({
    mutationFn: (d: Partial<CostCenter>) => createCostCenter(tenantId, d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['costCenterTree', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['costCenters', tenantId] })
      closeModal()
      showToast(t.msg.addedSuccess, 'success')
    },
    onError: (err: any) => showToast(err?.response?.data?.message ?? t.msg.addError, 'error'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data: d }: { id: number; data: Partial<CostCenter> }) => updateCostCenter(tenantId, id, d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['costCenterTree', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['costCenters', tenantId] })
      closeModal()
      showToast(t.msg.updatedSuccess, 'success')
    },
    onError: (err: any) => showToast(err?.response?.data?.message ?? t.msg.updateError, 'error'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteCostCenter(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['costCenterTree', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['costCenters', tenantId] })
      setDeleteTarget(null)
      showToast(t.msg.deletedSuccess, 'success')
    },
    onError: (err: any) => { setDeleteTarget(null); showToast(err?.response?.data?.message ?? t.msg.deleteError, 'error') },
  })

  function closeModal() {
    setShowModal(false)
    setEditing(null)
    setForm({ code: '', name: '', name_en: '', parent_id: null, description: '', is_active: true })
  }

  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function openAddChild(parent: CostCenter) {
    setEditing(null)
    setForm({
      code: '',
      name: '',
      name_en: '',
      parent_id: parent.id,
      description: '',
      is_active: true,
    })
    setShowModal(true)
  }

  function openEdit(center: CostCenter) {
    setEditing(center)
    setForm({
      code: center.code,
      name: center.name,
      name_en: center.name_en ?? '',
      parent_id: center.parent_id ?? null,
      description: center.description ?? '',
      is_active: center.is_active,
    })
    setShowModal(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const payload: Partial<CostCenter> = {
      code: form.code,
      name: form.name,
      name_en: form.name_en || null,
      parent_id: form.parent_id || null,
      description: form.description || null,
      is_active: form.is_active,
    }
    if (editing) updateMut.mutate({ id: editing.id, data: payload })
    else createMut.mutate(payload)
  }

  const isSaving = createMut.isPending || updateMut.isPending
  const textAlign = isRtl ? 'text-right' : 'text-left'

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center"><Target size={20} className="text-orange-600" /></div>
          <h1 className="text-2xl font-bold text-slate-900">{t.costCenters.title}</h1>
        </div>
        <button onClick={() => { closeModal(); setShowModal(true) }}
          className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-4 py-2 text-sm transition-colors">
          <Plus size={18} /> {t.costCenters.addCenter}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full text-sm table-fixed">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th className={`${textAlign} px-4 py-3 font-medium w-12`}></th>
                <SortableTh label={t.costCenters.centerCode} sortKey="code" sortState={sort} onToggle={toggleSort} widthClassName="w-32" className={`${textAlign} font-medium text-slate-700 dark:text-slate-200`} />
                <SortableTh label={t.costCenters.centerName} sortKey="name" sortState={sort} onToggle={toggleSort} widthClassName="w-44" className={`${textAlign} font-medium text-slate-700 dark:text-slate-200`} />
                <SortableTh label={t.description} sortKey="description" sortState={sort} onToggle={toggleSort} widthClassName="w-[18rem]" className={`${textAlign} font-medium text-slate-700 dark:text-slate-200`} />
                <SortableTh label={t.status} sortKey="status" sortState={sort} onToggle={toggleSort} widthClassName="w-32" className={`${textAlign} font-medium text-slate-700 dark:text-slate-200`} />
                <th className={`${textAlign} px-4 py-3 font-medium w-16`}>{t.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {displayTree.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-slate-400">{t.costCenters.noCenters}</td></tr>
              ) : (
                displayTree.map((center) => (
                  <CostCenterRow
                    key={center.id}
                    center={center}
                    level={0}
                    expanded={expanded}
                    onToggle={toggleExpand}
                    onAddChild={openAddChild}
                    onEdit={openEdit}
                    onDelete={setDeleteTarget}
                    openActionsId={openActionsId}
                    setOpenActionsId={setOpenActionsId}
                    actionsMenuRef={actionsMenuRef}
                    t={t}
                    isRtl={isRtl}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={closeModal}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">{editing ? t.costCenters.editCenter : t.costCenters.addCenter}</h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.costCenters.parentCenter}</label>
                <select
                  value={form.parent_id ?? ''}
                  onChange={(e) => setForm({ ...form, parent_id: e.target.value ? Number(e.target.value) : null })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                >
                  <option value="">{t.costCenters.noParent}</option>
                  {flatCenters
                    .filter((c) => c.id !== editing?.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {'—'.repeat(c.level)} {c.code} - {c.name}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.costCenters.centerCode} *</label>
                <input type="text" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none font-mono" dir="ltr" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.costCenters.centerName} *</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none" required />
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
              <div className="flex items-center gap-2">
                <input type="checkbox" id="cc_is_active" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="rounded border-slate-300 text-primary-600 focus:ring-primary-500" />
                <label htmlFor="cc_is_active" className="text-sm font-medium text-slate-700">{t.active}</label>
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
          title={t.costCenters.deleteCenter}
          message={t.costCenters.confirmDelete.replace('{name}', deleteTarget.name)}
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

function CostCenterRow({
  center,
  level,
  expanded,
  onToggle,
  onAddChild,
  onEdit,
  onDelete,
  openActionsId,
  setOpenActionsId,
  actionsMenuRef,
  t,
  isRtl,
}: {
  center: CostCenter
  level: number
  expanded: Set<number>
  onToggle: (id: number) => void
  onAddChild: (c: CostCenter) => void
  onEdit: (c: CostCenter) => void
  onDelete: (c: CostCenter) => void
  openActionsId: number | null
  setOpenActionsId: Dispatch<SetStateAction<number | null>>
  actionsMenuRef: RefObject<HTMLDivElement | null>
  t: any
  isRtl: boolean
}) {
  const hasChildren = center.children && center.children.length > 0
  const isExpanded = expanded.has(center.id)

  return (
    <>
      <tr className="hover:bg-slate-50">
        <td className="px-4 py-3" style={{ [isRtl ? 'paddingRight' : 'paddingLeft']: `${level * 24 + 16}px` }}>
          {hasChildren ? (
            <button onClick={() => onToggle(center.id)} className="text-slate-400 hover:text-slate-600">
              {isExpanded ? <ChevronDown size={16} /> : <ChevronLeft size={16} />}
            </button>
          ) : (
            <span className="w-4 inline-block" />
          )}
        </td>
        <td className="px-4 py-3 font-mono text-xs text-slate-600">{center.code}</td>
        <td className="px-4 py-3 font-medium text-slate-900">{center.name}</td>
        <td className="px-4 py-3 text-slate-500 text-xs max-w-[200px] truncate">{center.description ?? '—'}</td>
        <td className="px-4 py-3">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${center.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
            {center.is_active ? t.active : t.inactive}
          </span>
        </td>
        <td className="px-4 py-3 align-middle">
          <div
            className="relative inline-flex"
            ref={openActionsId === center.id ? (actionsMenuRef as RefObject<HTMLDivElement>) : undefined}
          >
            <button
              type="button"
              onClick={() => setOpenActionsId((prev) => (prev === center.id ? null : center.id))}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              title={t.actions}
              aria-label={t.actions}
              aria-expanded={openActionsId === center.id}
            >
              <MoreVertical size={16} />
            </button>
            {openActionsId === center.id && (
              <div
                className={`absolute z-50 mt-2 min-w-[10.5rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg ${
                  isRtl ? 'right-0' : 'left-0'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setOpenActionsId(null)
                    onAddChild(center)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <Plus size={16} className="text-primary-600 shrink-0" />
                  <span>{t.costCenters.addChild}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpenActionsId(null)
                    onEdit(center)
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
                    onDelete(center)
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
      {hasChildren && isExpanded && center.children!.map((child) => (
        <CostCenterRow
          key={child.id}
          center={child}
          level={level + 1}
          expanded={expanded}
          onToggle={onToggle}
          onAddChild={onAddChild}
          onEdit={onEdit}
          onDelete={onDelete}
          openActionsId={openActionsId}
          setOpenActionsId={setOpenActionsId}
          actionsMenuRef={actionsMenuRef}
          t={t}
          isRtl={isRtl}
        />
      ))}
    </>
  )
}
