import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import HrPageShell from './HrPageShell'
import { createAdministration, deleteAdministrationForTenant, listAdministrations, listEmployees, updateAdministration } from '../../api/hr'
import { MoreHorizontal, Plus, X } from 'lucide-react'
import { useClientSort, type SortColumn } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'

export default function AdministrationsPage() {
  const { currentTenant } = useAuth()
  const { t, isRtl, lang } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const qc = useQueryClient()

  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all')

  const params = useMemo(() => {
    const p: any = { paginate: '1', per_page: 50 }
    if (q.trim()) p.q = q.trim()
    if (status !== 'all') p.status = status
    return p
  }, [q, status])

  const { data, isLoading } = useQuery({
    queryKey: ['hr', 'administrations', tenantId, params],
    queryFn: () => listAdministrations({ tenant_id: tenantId, ...params }),
    enabled: !!tenantId,
  })
  const rows: any[] = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : []

  type AdmSortKey = 'name' | 'manager' | 'description' | 'status'
  const admSortColumns = useMemo((): SortColumn<any, AdmSortKey>[] => {
    return [
      { key: 'name', type: 'string', getValue: (r) => String(r.name ?? '') },
      { key: 'manager', type: 'string', getValue: (r) => String(r.managerRef?.name ?? r.manager?.name ?? '') },
      {
        key: 'description',
        type: 'string',
        getValue: (r) => [r.description_ar, r.description_en].filter(Boolean).join('\u0001'),
      },
      { key: 'status', type: 'string', getValue: (r) => String(r.status ?? '') },
    ]
  }, [])
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const { sort, toggleSort, sortedRows: sortedAdmRows } = useClientSort(rows, admSortColumns, { locale })
  const thAlign = isRtl ? 'text-right' : 'text-left'

  const [createOpen, setCreateOpen] = useState(false)
  const [editRow, setEditRow] = useState<any | null>(null)

  const createMut = useMutation({
    mutationFn: (payload: any) => createAdministration({ tenant_id: tenantId, ...payload }),
    onSuccess: async () => {
      setCreateOpen(false)
      await qc.invalidateQueries({ queryKey: ['hr', 'administrations', tenantId] })
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) => updateAdministration(id, { tenant_id: tenantId, ...payload }),
    onSuccess: () => {
      setEditRow(null)
      qc.invalidateQueries({ queryKey: ['hr', 'administrations', tenantId] })
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteAdministrationForTenant(tenantId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'administrations', tenantId] }),
  })

  return (
    <HrPageShell
      title={t.hr?.administrationsTitle ?? (isRtl ? 'الإدارات' : 'Administrations')}
    >
      <div className="card-app">
        <div className="card-padding">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
            <div className="lg:col-span-9">
              <div className="flex items-center gap-2">
                <input className="input-app" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.searchPlaceholder} />
                <button className="btn btn-md btn-primary" onClick={() => setCreateOpen(true)}>
                  <Plus size={18} />
                  {t.add}
                </button>
              </div>
            </div>
            <div className="lg:col-span-3">
              <select className="input-app" value={status} onChange={(e) => setStatus(e.target.value as any)}>
                <option value="all">{isRtl ? 'الحالة: الكل' : 'Status: All'}</option>
                <option value="active">{t.active}</option>
                <option value="inactive">{t.inactive}</option>
              </select>
            </div>
          </div>
        </div>

        <div className="table-responsive-wrap">
          <table className="table-zebra w-full text-sm">
            <thead>
              <tr>
                <th className={isRtl ? 'text-right' : 'text-left'} style={{ width: 90 }}>
                  {isRtl ? 'م' : '#'}
                </th>
                <SortableTh label={t.name} sortKey="name" sortState={sort} onToggle={toggleSort} className={`${thAlign} ps-8 py-0 px-0 font-medium`} />
                <SortableTh
                  label={isRtl ? 'المدير' : 'Manager'}
                  sortKey="manager"
                  sortState={sort}
                  onToggle={toggleSort}
                  widthClassName="min-w-[240px]"
                  className={`${thAlign} py-0 px-0 font-medium`}
                />
                <SortableTh
                  label={isRtl ? 'الوصف' : 'Description'}
                  sortKey="description"
                  sortState={sort}
                  onToggle={toggleSort}
                  widthClassName="min-w-[320px]"
                  className={`${thAlign} py-0 px-0 font-medium`}
                />
                <SortableTh label={t.status} sortKey="status" sortState={sort} onToggle={toggleSort} widthClassName="w-[140px]" className={`${thAlign} py-0 px-0 font-medium`} />
                <th className="text-left" style={{ width: 90 }}>
                  {t.actions}
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={6} className="text-center text-slate-500">
                    {t.loading}
                  </td>
                </tr>
              )}
              {!isLoading && sortedAdmRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-slate-500">
                    {t.noData}
                  </td>
                </tr>
              )}
              {sortedAdmRows.map((r, idx) => (
                <AdminRowReadOnly
                  key={r.id}
                  row={r}
                  index={idx}
                  isRtl={isRtl}
                  t={t}
                  onEdit={() => setEditRow(r)}
                  onDelete={() => {
                    if (confirm(isRtl ? 'حذف الإدارة؟' : 'Delete administration?')) deleteMut.mutate(r.id)
                  }}
                  busy={deleteMut.isPending}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {createOpen && (
        <AdminModal
          isRtl={isRtl}
          t={t}
          tenantId={tenantId}
          loading={createMut.isPending}
          onClose={() => setCreateOpen(false)}
          title={isRtl ? 'إضافة إدارة' : 'Add administration'}
          onSubmit={(payload) => createMut.mutate(payload)}
        />
      )}

      {editRow && (
        <AdminModal
          isRtl={isRtl}
          t={t}
          tenantId={tenantId}
          loading={updateMut.isPending || deleteMut.isPending}
          onClose={() => setEditRow(null)}
          title={isRtl ? 'تعديل إدارة' : 'Edit administration'}
          initial={{
            name: editRow.name ?? '',
            name_en: editRow.name_en ?? '',
            manager_employee_id: editRow.manager_employee_id ?? null,
            description_ar: editRow.description_ar ?? '',
            description_en: editRow.description_en ?? '',
            status: editRow.status ?? 'active',
          }}
          onSubmit={(payload) => updateMut.mutate({ id: editRow.id, payload })}
          onDelete={() => {
            if (confirm(isRtl ? 'حذف الإدارة؟' : 'Delete administration?')) deleteMut.mutate(editRow.id)
          }}
        />
      )}
    </HrPageShell>
  )
}

function AdminRowReadOnly({
  row,
  index,
  isRtl,
  t,
  onDelete,
  onEdit,
  busy,
}: {
  row: any
  index: number
  isRtl: boolean
  t: any
  onDelete: () => void
  onEdit: () => void
  busy: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node
      if (btnRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  useEffect(() => {
    const GAP = 8
    const MENU_W = 176 // w-44
    const EDGE = 8

    function clamp(n: number, min: number, max: number) {
      return Math.max(min, Math.min(max, n))
    }

    function recompute() {
      if (!menuOpen) return
      const rect = btnRef.current?.getBoundingClientRect()
      if (!rect) return

      const menuH = menuRef.current?.offsetHeight ?? 0
      const viewportH = window.innerHeight

      const spaceBelow = viewportH - rect.bottom
      const spaceAbove = rect.top
      const openUp = menuH ? spaceBelow < menuH + GAP && spaceAbove >= menuH + GAP : false

      const desiredLeft = isRtl ? rect.right - MENU_W : rect.left
      const left = clamp(desiredLeft, EDGE, window.innerWidth - MENU_W - EDGE)
      const top = openUp ? rect.top - (menuH || 0) - GAP : rect.bottom + GAP

      setMenuPos({ top, left })
    }
    recompute()
    requestAnimationFrame(recompute)
    window.addEventListener('scroll', recompute, true)
    window.addEventListener('resize', recompute)
    return () => {
      window.removeEventListener('scroll', recompute, true)
      window.removeEventListener('resize', recompute)
    }
  }, [menuOpen, isRtl])

  const statusLabel = row.status === 'active' ? t.active : t.inactive
  const managerName = row.manager?.name ?? '—'
  const description = (isRtl ? row.description_ar : row.description_en) ?? row.notes ?? '—'

  return (
    <tr>
      <td className="tabular-nums" title={row.code}>
        {index + 1}
      </td>
      <td className="cell-ellipsis ps-8">{row.name}</td>
      <td className="cell-ellipsis text-left">{managerName}</td>
      <td className="cell-ellipsis text-left" title={description}>
        {description}
      </td>
      <td className="text-left">
        <span className={`inline-flex px-2 py-1 rounded-app text-xs ${row.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
          {statusLabel}
        </span>
      </td>
      <td className="text-left px-2 py-2">
        <div className="inline-flex">
          <button
            type="button"
            className="btn btn-sm btn-secondary btn-icon"
            onClick={() => setMenuOpen((v) => !v)}
            disabled={busy}
            title={isRtl ? 'إجراءات' : 'Actions'}
            aria-label={isRtl ? 'إجراءات' : 'Actions'}
            ref={btnRef}
          >
            <MoreHorizontal size={16} />
          </button>
        </div>
        {menuOpen &&
          menuPos &&
          createPortal(
            <div
              ref={menuRef}
              className="fixed w-44 bg-white border border-slate-200 rounded-app shadow-lg z-[9999]"
              style={{
                top: menuPos.top,
                left: menuPos.left,
              }}
              dir={isRtl ? 'rtl' : 'ltr'}
            >
              <button
                type="button"
                className="w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 text-start"
                onClick={() => {
                  setMenuOpen(false)
                  onEdit()
                }}
              >
                {isRtl ? 'تعديل' : 'Edit'}
              </button>
              <button
                type="button"
                className="w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 text-start"
                onClick={() => {
                  setMenuOpen(false)
                  onDelete()
                }}
              >
                {isRtl ? 'حذف' : 'Delete'}
              </button>
            </div>,
            document.body,
          )}
      </td>
    </tr>
  )
}

function AdminModal({
  isRtl,
  t,
  tenantId,
  loading,
  onClose,
  title,
  onSubmit,
  onDelete,
  initial,
}: {
  isRtl: boolean
  t: any
  tenantId: number
  loading: boolean
  onClose: () => void
  title: string
  onSubmit: (payload: any) => void
  onDelete?: () => void
  initial?: {
    name: string
    name_en?: string | null
    manager_employee_id?: number | null
    description_ar?: string | null
    description_en?: string | null
    status: 'active' | 'inactive'
  }
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [nameEn, setNameEn] = useState((initial?.name_en ?? initial?.name ?? '') as string)
  const [managerEmployeeId, setManagerEmployeeId] = useState<number | ''>(initial?.manager_employee_id ?? '')
  const [descAr, setDescAr] = useState(initial?.description_ar ?? '')
  const [descEn, setDescEn] = useState(initial?.description_en ?? '')
  const [status, setStatus] = useState<'active' | 'inactive'>(initial?.status ?? 'active')

  const { data: employeesData } = useQuery({
    queryKey: ['hr', 'employees', tenantId, 'managers'],
    queryFn: () => listEmployees({ tenant_id: tenantId, paginate: '0', per_page: 1000, status: 'active' }),
    enabled: !!tenantId,
  })
  const employeesAll: any[] = Array.isArray(employeesData) ? employeesData : employeesData?.data ?? []

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 ${isRtl ? 'lg:pr-64' : 'lg:pl-64'}`}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div className="bg-white rounded-app border border-slate-200 shadow-xl w-full max-w-4xl">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="font-bold">{title}</div>
          <button className="text-slate-500 hover:text-slate-700" onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold text-slate-700">
                {isRtl ? 'الاسم بالعربية' : 'Name (Arabic)'} <span className="text-red-500">*</span>
              </label>
              <input className="input-app mt-2" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-700">{isRtl ? 'الاسم بالإنجليزية' : 'Name (English)'}</label>
              <input className="input-app mt-2" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold text-slate-700">{isRtl ? 'المدير' : 'Manager'}</label>
              <select className="input-app mt-2" value={managerEmployeeId} onChange={(e) => setManagerEmployeeId(e.target.value ? +e.target.value : '')}>
                <option value="">{isRtl ? 'اختر الموظف...' : 'Select employee...'}</option>
                {employeesAll.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.code} — {e.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-700">{t.status}</label>
              <select className="input-app mt-2" value={status} onChange={(e) => setStatus(e.target.value as any)}>
                <option value="active">{t.active}</option>
                <option value="inactive">{t.inactive}</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-700">{isRtl ? 'الوصف بالعربية' : 'Description (Arabic)'}</label>
            <textarea className="input-app mt-2 min-h-[110px]" value={descAr} onChange={(e) => setDescAr(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-700">{isRtl ? 'الوصف بالإنجليزية' : 'Description (English)'}</label>
            <textarea className="input-app mt-2 min-h-[110px]" value={descEn} onChange={(e) => setDescEn(e.target.value)} />
          </div>
        </div>
        <div className="px-4 py-3 border-t border-slate-200 flex justify-end gap-2">
          {onDelete && (
            <button className="btn btn-md btn-danger" onClick={onDelete} disabled={loading}>
              {isRtl ? 'حذف' : 'Delete'}
            </button>
          )}
          <button className="btn btn-md btn-secondary" onClick={onClose}>
            {t.cancel}
          </button>
          <button
            className="btn btn-md btn-primary"
            disabled={!name.trim() || loading}
            onClick={() =>
              onSubmit({
                name: name.trim(),
                name_en: nameEn.trim() || null,
                manager_employee_id: managerEmployeeId || null,
                description_ar: descAr || null,
                description_en: descEn || null,
                status,
              })
            }
          >
            {loading ? t.saving : t.save}
          </button>
        </div>
      </div>
    </div>
  )
}

