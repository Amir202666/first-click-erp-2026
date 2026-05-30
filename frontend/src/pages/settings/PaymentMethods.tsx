import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchPaymentMethods,
  createPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
  fetchAccounts,
  fetchTenantUsers,
} from '../../api/tenant'
import type { PaymentMethod, Account } from '../../types'
import { Plus, Pencil, Trash2, X, CreditCard, MoreVertical } from 'lucide-react'
import { PaymentMethodLogoBox } from '../../components/PaymentMethodBrandIcon'
import Toast, { type ToastType } from '../../components/ui/Toast'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { useClientSort } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'
import SearchableSelect, { type SearchableSelectOption } from '../../components/ui/SearchableSelect'
import MultiSelectTags, { type MultiSelectTagsOption } from '../../components/ui/MultiSelectTags'
import { filterBarOverflowClass, filterSelectCompactClass } from '../../utils/filterControlStyles'
import TablePageSkeleton from '../../components/ui/TablePageSkeleton'

const TYPE_BADGE: Record<string, string> = {
  cash: 'bg-emerald-100 text-emerald-700',
  bank: 'bg-blue-100 text-blue-700',
  credit: 'bg-purple-100 text-purple-700',
  other: 'bg-slate-100 text-slate-700',
}

const TYPES = ['cash', 'bank', 'credit', 'other'] as const

export default function PaymentMethods() {
  const { currentTenant } = useAuth()
  const { t, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()

  const filterSelectCls = filterSelectCompactClass
  const filterRowCls = `${filterBarOverflowClass} flex flex-nowrap items-center gap-3 w-full min-w-0`
  const filterCellCls = 'min-w-[10rem] w-48 shrink-0'

  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<PaymentMethod | null>(null)
  const [form, setForm] = useState({
    name: '',
    name_en: '',
    type: 'cash' as string,
    linked_account_id: null as number | null,
    user_ids: [] as number[],
    is_active: true,
  })
  const [deleteTarget, setDeleteTarget] = useState<PaymentMethod | null>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all')
  const [filterType, setFilterType] = useState<string>('all')
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

  const { data: methods = [], isLoading } = useQuery<PaymentMethod[]>({
    queryKey: ['payment-methods', tenantId],
    queryFn: () => fetchPaymentMethods(tenantId),
    enabled: !!tenantId,
  })

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts', tenantId],
    queryFn: () => fetchAccounts(tenantId, { active_only: '1', postable_only: '1' }),
    enabled: !!tenantId,
  })

  const { data: tenantUsersResp } = useQuery({
    queryKey: ['tenant-users', tenantId],
    queryFn: () => fetchTenantUsers(tenantId),
    enabled: !!tenantId,
  })
  const userOptions: MultiSelectTagsOption[] = useMemo(() => {
    const list = (tenantUsersResp?.data ?? []) as Array<{ id: number; name: string; pivot?: { is_active?: boolean } }>
    return list.filter((u) => u?.pivot?.is_active !== false).map((u) => ({ id: u.id, label: u.name }))
  }, [tenantUsersResp?.data])

  const accountOptions: SearchableSelectOption[] = useMemo(() => {
    const noneLabel = t.accounts.none ?? (isRtl ? 'بدون' : 'None')
    return [
      { value: '', label: noneLabel },
      ...accounts.map((a) => {
        const code = (a as any).code ? String((a as any).code) : ''
        const name = a.name ?? ''
        const primaryLabel = name
        const secondaryLabel = code ? code : undefined
        const label = code ? `${code} — ${name}` : name
        return { value: a.id, label, primaryLabel, secondaryLabel, searchText: label }
      }),
    ]
  }, [accounts, t.accounts.none, isRtl])

  const showToast = useCallback((message: string, type: ToastType) => setToast({ message, type }), [])

  const createMut = useMutation({
    mutationFn: (d: Partial<PaymentMethod>) => createPaymentMethod(tenantId, d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['payment-methods'] }); closeModal(); showToast(t.msg.addedSuccess, 'success') },
    onError: () => showToast(t.msg.addError, 'error'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data: d }: { id: number; data: Partial<PaymentMethod> }) => updatePaymentMethod(tenantId, id, d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['payment-methods'] }); closeModal(); showToast(t.msg.updatedSuccess, 'success') },
    onError: () => showToast(t.msg.updateError, 'error'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deletePaymentMethod(tenantId, id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['payment-methods'] }); setDeleteTarget(null); showToast(t.msg.deletedSuccess, 'success') },
    onError: (err: any) => { setDeleteTarget(null); showToast(err?.response?.data?.message ?? t.msg.deleteError, 'error') },
  })

  function closeModal() {
    setShowModal(false)
    setEditing(null)
    setForm({ name: '', name_en: '', type: 'cash', linked_account_id: null, user_ids: [], is_active: true })
  }

  function openEdit(m: PaymentMethod) {
    setEditing(m)
    setForm({
      name: m.name,
      name_en: m.name_en ?? '',
      type: m.type,
      linked_account_id: m.linked_account_id ?? null,
      user_ids: (m.users ?? []).map((u) => u.id),
      is_active: !!m.is_active,
    })
    setShowModal(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const payload: Partial<PaymentMethod> = {
      name: form.name,
      name_en: form.name_en || null,
      type: form.type as PaymentMethod['type'],
      linked_account_id: form.linked_account_id ?? null,
      user_ids: form.user_ids,
      is_active: form.is_active,
    }
    if (editing) updateMut.mutate({ id: editing.id, data: payload })
    else createMut.mutate(payload)
  }

  const typeLabel = (type: string) => {
    const map: Record<string, string> = {
      cash: t.paymentMethods.types.cash,
      bank: t.paymentMethods.types.bank,
      credit: t.paymentMethods.types.credit,
      other: t.paymentMethods.types.other,
    }
    return map[type] ?? type
  }

  const filtered = methods.filter((m) => {
    if (filterStatus === 'active' && !m.is_active) return false
    if (filterStatus === 'inactive' && m.is_active) return false
    if (filterType !== 'all' && m.type !== filterType) return false
    return true
  })

  const { sort, toggleSort, sortedRows } = useClientSort(filtered, [
    { key: 'name', type: 'string', getValue: (m: PaymentMethod) => m.name ?? '' },
    { key: 'type', type: 'string', getValue: (m: PaymentMethod) => typeLabel(m.type) },
    { key: 'linked', type: 'string', getValue: (m: PaymentMethod) => m.linked_account?.name ?? '' },
    { key: 'status', type: 'string', getValue: (m: PaymentMethod) => (m.is_active ? t.active : t.inactive) },
  ])

  const isSaving = createMut.isPending || updateMut.isPending
  const thAlign = isRtl ? 'text-right' : 'text-left'

  return (
    <div className="p-6 space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center"><CreditCard size={20} className="text-primary-600" /></div>
          <h1 className="text-2xl font-bold text-slate-900">{t.paymentMethods.title}</h1>
        </div>
        <button
          onClick={() => {
            setForm({ name: '', name_en: '', type: 'cash', linked_account_id: null, user_ids: [], is_active: true })
            setEditing(null)
            setShowModal(true)
          }}
          className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-4 py-2 text-sm transition-colors">
          <Plus size={18} /> {t.paymentMethods.addMethod}
        </button>
      </div>

      <div className={filterRowCls}>
        <div className={filterCellCls}>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as any)}
          className={filterSelectCls}
          style={{ textAlign: isRtl ? 'right' : 'left' }}
        >
          <option value="all">{t.paymentMethods.allStatuses}</option>
          <option value="active">{t.active}</option>
          <option value="inactive">{t.inactive}</option>
        </select>
        </div>
        <div className={filterCellCls}>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className={filterSelectCls}
          style={{ textAlign: isRtl ? 'right' : 'left' }}
        >
          <option value="all">{t.paymentMethods.allTypes}</option>
          {TYPES.map((tp) => (
            <option key={tp} value={tp}>{typeLabel(tp)}</option>
          ))}
        </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        {isLoading ? (
          <TablePageSkeleton rows={6} />
        ) : (
          <div className="ui-table-scroll">
            <table className="fc-list-table w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-600">
                  <SortableTh label={t.paymentMethods.methodName} sortKey="name" sortState={sort} onToggle={toggleSort} widthClassName="w-48" className={`${thAlign} font-medium text-slate-700 dark:text-slate-200`} />
                  <SortableTh label={t.paymentMethods.methodType} sortKey="type" sortState={sort} onToggle={toggleSort} widthClassName="w-36" className={`${thAlign} font-medium text-slate-700 dark:text-slate-200`} />
                  <SortableTh label={t.paymentMethods.linkedAccount} sortKey="linked" sortState={sort} onToggle={toggleSort} widthClassName="w-44 max-w-[14rem]" className={`${thAlign} font-medium text-slate-700 dark:text-slate-200`} />
                  <SortableTh label={t.status} sortKey="status" sortState={sort} onToggle={toggleSort} widthClassName="w-28" className={`${thAlign} font-medium text-slate-700 dark:text-slate-200`} />
                  <th className={`${thAlign} px-4 py-3 font-medium w-16`}>{t.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sortedRows.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-8 text-slate-400">{t.paymentMethods.noMethods}</td></tr>
                ) : sortedRows.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 align-middle">
                      <div className="flex min-w-0 items-center gap-3">
                        <PaymentMethodLogoBox method={m} />
                        <span className="min-w-0 flex-1 truncate font-medium text-slate-900 leading-snug">{m.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_BADGE[m.type] ?? TYPE_BADGE.other}`}>
                        {typeLabel(m.type)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 truncate max-w-[14rem]" title={m.linked_account?.name ?? undefined}>{m.linked_account?.name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${m.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {m.is_active ? t.active : t.inactive}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="relative inline-flex" ref={openActionsId === m.id ? actionsMenuRef : undefined}>
                        <button
                          type="button"
                          onClick={() => setOpenActionsId((prev) => (prev === m.id ? null : m.id))}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                          title={t.actions}
                          aria-label={t.actions}
                        >
                          <MoreVertical size={16} />
                        </button>
                        {openActionsId === m.id && (
                          <div
                            className={`absolute z-50 mt-2 min-w-[140px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg ${
                              isRtl ? 'right-0' : 'left-0'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setOpenActionsId(null)
                                openEdit(m)
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                            >
                              <Pencil size={16} className="text-primary-600" />
                              <span>{t.edit}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenActionsId(null)
                                setDeleteTarget(m)
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                            >
                              <Trash2 size={16} />
                              <span>{t.delete}</span>
                            </button>
                          </div>
                        )}
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
              <h3 className="text-lg font-semibold text-slate-900">{editing ? t.paymentMethods.editMethod : t.paymentMethods.addMethod}</h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.paymentMethods.methodName} *</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.nameEn}</label>
                <input type="text" value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none" dir="ltr" placeholder="English name (optional)" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.paymentMethods.methodType} *</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none bg-white" required>
                  {TYPES.map((tp) => (
                    <option key={tp} value={tp}>{typeLabel(tp)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.paymentMethods.linkedAccount}</label>
                <SearchableSelect
                  options={accountOptions}
                  value={form.linked_account_id ?? ''}
                  onChange={(v) => setForm({ ...form, linked_account_id: v === '' || v == null ? null : Number(v) })}
                  placeholder={t.accounts.none}
                  className="w-full"
                  textAlign={isRtl ? 'right' : 'left'}
                  dropdownMinWidth={420}
                  matchTriggerWidth
                  wrapOptions
                  aria-label={t.paymentMethods.linkedAccount}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {t.paymentMethods.linkedUsers}
                </label>
                <MultiSelectTags
                  options={userOptions}
                  value={form.user_ids}
                  onChange={(ids) => setForm({ ...form, user_ids: ids })}
                  placeholder={isRtl ? 'اختر المستخدم...' : 'Select user...'}
                  textAlign={isRtl ? 'right' : 'left'}
                  className="w-full"
                />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="pm-is-active" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="rounded border-slate-300 text-primary-600 focus:ring-primary-500" />
                <label htmlFor="pm-is-active" className="text-sm font-medium text-slate-700">{t.active}</label>
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
          title={t.paymentMethods.deleteMethod}
          message={t.paymentMethods.confirmDelete.replace('{name}', deleteTarget.name)}
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
