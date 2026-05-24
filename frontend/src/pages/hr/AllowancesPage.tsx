import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import HrPageShell from './HrPageShell'
import { createAllowance, deleteAllowanceForTenant, listAdministrations, listAllowances, listEmployees, updateAllowance } from '../../api/hr'
import { fetchCurrencies } from '../../api/tenant'
import { MoreHorizontal, Plus, X } from 'lucide-react'

export default function AllowancesPage() {
  const { currentTenant } = useAuth()
  const { t, isRtl } = useLanguage()
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
    queryKey: ['hr', 'allowances', tenantId, params],
    queryFn: () => listAllowances({ tenant_id: tenantId, ...params }),
    enabled: !!tenantId,
  })
  const rows: any[] = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : []

  const [createOpen, setCreateOpen] = useState(false)
  const [editRow, setEditRow] = useState<any | null>(null)

  const createMut = useMutation({
    mutationFn: (payload: any) => createAllowance({ tenant_id: tenantId, ...payload }),
    onSuccess: async () => {
      setCreateOpen(false)
      await qc.invalidateQueries({ queryKey: ['hr', 'allowances', tenantId] })
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) => updateAllowance(id, { tenant_id: tenantId, ...payload }),
    onSuccess: () => {
      setEditRow(null)
      qc.invalidateQueries({ queryKey: ['hr', 'allowances', tenantId] })
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteAllowanceForTenant(tenantId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'allowances', tenantId] }),
  })

  return (
    <HrPageShell title={(t as any).hr?.allowancesTitle ?? (isRtl ? 'البدلات' : 'Allowances')}>
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
                <th className={`${isRtl ? 'text-right' : 'text-left'} ps-8`}>{isRtl ? 'مسمى البدل' : 'Allowance'}</th>
                <th className="text-left" style={{ width: 200 }}>
                  {isRtl ? 'نوع القيمة' : 'Value type'}
                </th>
                <th className="text-left" style={{ width: 160 }}>
                  {isRtl ? 'القيمة' : 'Value'}
                </th>
                <th className="text-left" style={{ width: 260 }}>
                  {isRtl ? 'تطبيق على' : 'Apply to'}
                </th>
                <th className="text-left" style={{ width: 140 }}>
                  {t.status}
                </th>
                <th className="text-left" style={{ width: 90 }}>
                  {t.actions}
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={7} className="text-center text-slate-500">
                    {t.loading}
                  </td>
                </tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-slate-500">
                    {t.noData}
                  </td>
                </tr>
              )}
              {rows.map((r, idx) => (
                <RowReadOnly
                  key={r.id}
                  row={r}
                  index={idx}
                  isRtl={isRtl}
                  t={t}
                  statusTone="allowance"
                  onEdit={() => setEditRow(r)}
                  onDelete={() => {
                    if (confirm(isRtl ? 'حذف البدل؟' : 'Delete allowance?')) deleteMut.mutate(r.id)
                  }}
                  busy={deleteMut.isPending}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {createOpen && (
        <AllowanceModal
          isRtl={isRtl}
          t={t}
          tenantId={tenantId}
          loading={createMut.isPending}
          onClose={() => setCreateOpen(false)}
          title={isRtl ? 'إضافة بدل' : 'Add allowance'}
          onSubmit={(payload) => createMut.mutate(payload)}
        />
      )}

      {editRow && (
        <AllowanceModal
          isRtl={isRtl}
          t={t}
          tenantId={tenantId}
          loading={updateMut.isPending || deleteMut.isPending}
          onClose={() => setEditRow(null)}
          title={isRtl ? 'تعديل بدل' : 'Edit allowance'}
          initial={{
            name: editRow.name ?? '',
            value_type: editRow.value_type ?? 'fixed',
            value: editRow.value ?? 0,
            currency_id: editRow.currency_id ?? null,
            apply_to: editRow.apply_to ?? 'all',
            administration_id: editRow.administration_id ?? null,
            employee_id: editRow.employee_id ?? null,
            status: editRow.status ?? 'active',
          }}
          onSubmit={(payload) => updateMut.mutate({ id: editRow.id, payload })}
          onDelete={() => {
            if (confirm(isRtl ? 'حذف البدل؟' : 'Delete allowance?')) deleteMut.mutate(editRow.id)
          }}
        />
      )}
    </HrPageShell>
  )
}

function statusBadgeClass(kind: 'allowance' | 'deduction', status: 'active' | 'inactive') {
  if (status === 'active') {
    return kind === 'deduction' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'
  }
  return kind === 'deduction' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'
}

function RowReadOnly({
  row,
  index,
  isRtl,
  t,
  statusTone,
  onDelete,
  onEdit,
  busy,
}: {
  row: any
  index: number
  isRtl: boolean
  t: any
  statusTone: 'allowance' | 'deduction'
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
    const MENU_W = 176
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

  const valueTypeLabel =
    row.value_type === 'percent_basic' ? (isRtl ? 'نسبة من الأساسي' : '% of basic') : (isRtl ? 'مبلغ مقطوع' : 'Fixed')
  const valueLabel = row.value_type === 'percent_basic' ? `${row.value}%` : `${row.value} ${row.currency?.code ?? ''}`.trim()
  const applyToLabel =
    row.apply_to === 'administration'
      ? `${isRtl ? 'إدارة' : 'Administration'}: ${row.administration?.name ?? '—'}`
      : row.apply_to === 'employee'
        ? `${isRtl ? 'موظف' : 'Employee'}: ${row.employee?.name ?? '—'}`
        : isRtl
          ? 'الكل'
          : 'All'

  const statusLabel = row.status === 'active' ? t.active : t.inactive

  return (
    <tr>
      <td className="tabular-nums" title={row.code}>
        {index + 1}
      </td>
      <td className="cell-ellipsis ps-8">{row.name}</td>
      <td className="cell-ellipsis text-left">{valueTypeLabel}</td>
      <td className="cell-ellipsis text-left">{valueLabel}</td>
      <td className="cell-ellipsis text-left">{applyToLabel}</td>
      <td className="text-left">
        <span className={`inline-flex px-2 py-1 rounded-app text-xs ${statusBadgeClass(statusTone, row.status)}`}>{statusLabel}</span>
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
            <div ref={menuRef} className="fixed w-44 bg-white border border-slate-200 rounded-app shadow-lg z-[9999]" style={{ top: menuPos.top, left: menuPos.left }} dir={isRtl ? 'rtl' : 'ltr'}>
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

function AllowanceModal({
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
  initial?: any
}) {
  const isEdit = !!initial
  const [name, setName] = useState(initial?.name ?? '')
  const [valueType, setValueType] = useState<'fixed' | 'percent_basic'>(initial?.value_type ?? 'fixed')
  const [value, setValue] = useState(String(initial?.value ?? '0'))
  const [currencyId, setCurrencyId] = useState<number | ''>(initial?.currency_id ?? '')
  const [applyTo, setApplyTo] = useState<'all' | 'administration' | 'employee'>(initial?.apply_to ?? 'all')
  const [administrationId, setAdministrationId] = useState<number | ''>(initial?.administration_id ?? '')
  const [employeeId, setEmployeeId] = useState<number | ''>(initial?.employee_id ?? '')
  const [status, setStatus] = useState<'active' | 'inactive'>(initial?.status ?? 'active')

  const { data: adminsData } = useQuery({
    queryKey: ['hr', 'administrations', tenantId, 'mini'],
    queryFn: () => listAdministrations({ tenant_id: tenantId, paginate: '0', per_page: 1000, status: 'active' }),
    enabled: !!tenantId,
  })
  const administrations: any[] = Array.isArray(adminsData) ? adminsData : adminsData?.data ?? []

  const { data: employeesData } = useQuery({
    queryKey: ['hr', 'employees', tenantId, 'mini'],
    queryFn: () => listEmployees({ tenant_id: tenantId, paginate: '0', per_page: 1000, status: 'active' }),
    enabled: !!tenantId,
  })
  const employees: any[] = Array.isArray(employeesData) ? employeesData : employeesData?.data ?? []

  const { data: currenciesData } = useQuery({
    queryKey: ['currencies', tenantId],
    queryFn: () => fetchCurrencies(tenantId),
    enabled: !!tenantId,
  })
  const currencies: any[] = (currenciesData as any)?.data ?? (Array.isArray(currenciesData) ? currenciesData : [])

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 ${isRtl ? 'lg:pr-64' : 'lg:pl-64'}`} dir={isRtl ? 'rtl' : 'ltr'}>
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
                {isRtl ? 'مسمى البدل' : 'Allowance name'} <span className="text-red-500">*</span>
              </label>
              <input className="input-app mt-2" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-700">{isRtl ? 'نوع القيمة' : 'Value type'}</label>
              <select className="input-app mt-2" value={valueType} onChange={(e) => setValueType(e.target.value as any)}>
                <option value="fixed">{isRtl ? 'مبلغ مقطوع' : 'Fixed amount'}</option>
                <option value="percent_basic">{isRtl ? 'نسبة من الأساسي' : 'Percent of basic'}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold text-slate-700">{isRtl ? 'القيمة' : 'Value'}</label>
              <input className="input-app mt-2" value={value} onChange={(e) => setValue(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-700">{isRtl ? 'العملة' : 'Currency'}</label>
              <select className="input-app mt-2" value={currencyId} onChange={(e) => setCurrencyId(e.target.value ? +e.target.value : '')} disabled={valueType === 'percent_basic'}>
                <option value="">{isRtl ? '— بدون —' : '— None —'}</option>
                {currencies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
              {valueType === 'percent_basic' && <div className="text-xs text-slate-500 mt-1">{isRtl ? 'النسبة لا تحتاج عملة.' : 'Percent does not require currency.'}</div>}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold text-slate-700">{isRtl ? 'تطبيق على' : 'Apply to'}</label>
              <select className="input-app mt-2" value={applyTo} onChange={(e) => setApplyTo(e.target.value as any)}>
                <option value="all">{isRtl ? 'الكل' : 'All'}</option>
                <option value="administration">{isRtl ? 'إدارة محددة' : 'Specific administration'}</option>
                <option value="employee">{isRtl ? 'موظف محدد' : 'Specific employee'}</option>
              </select>
            </div>
            <div>
              {applyTo === 'administration' && (
                <>
                  <label className="text-sm font-semibold text-slate-700">{isRtl ? 'الإدارة' : 'Administration'}</label>
                  <select className="input-app mt-2" value={administrationId} onChange={(e) => setAdministrationId(e.target.value ? +e.target.value : '')}>
                    <option value="">{isRtl ? 'حدد الإدارة...' : 'Select administration...'}</option>
                    {administrations.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} — {a.name}
                      </option>
                    ))}
                  </select>
                </>
              )}
              {applyTo === 'employee' && (
                <>
                  <label className="text-sm font-semibold text-slate-700">{isRtl ? 'الموظف' : 'Employee'}</label>
                  <select className="input-app mt-2" value={employeeId} onChange={(e) => setEmployeeId(e.target.value ? +e.target.value : '')}>
                    <option value="">{isRtl ? 'اختر الموظف...' : 'Select employee...'}</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.code} — {e.name}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold text-slate-700">{t.status}</label>
              <select className="input-app mt-2" value={status} onChange={(e) => setStatus(e.target.value as any)}>
                <option value="active">{t.active}</option>
                <option value="inactive">{t.inactive}</option>
              </select>
            </div>
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
            disabled={!name.trim() || (!isEdit && loading) || loading || (applyTo === 'administration' && !administrationId) || (applyTo === 'employee' && !employeeId)}
            onClick={() =>
              onSubmit({
                name: name.trim(),
                value_type: valueType,
                value: Number(value || 0),
                currency_id: valueType === 'percent_basic' ? null : currencyId || null,
                apply_to: applyTo,
                administration_id: applyTo === 'administration' ? administrationId || null : null,
                employee_id: applyTo === 'employee' ? employeeId || null : null,
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

