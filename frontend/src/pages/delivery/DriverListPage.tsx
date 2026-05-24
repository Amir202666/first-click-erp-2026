import { useState, useCallback, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchDeliveryDrivers,
  createDeliveryDriver,
  updateDeliveryDriver,
  deleteDeliveryDriver,
  fetchAccountTree,
  fetchBranches,
} from '../../api/tenant'
import type { DeliveryDriver, PaginatedResponse, Account } from '../../types'
import { Plus, MoreVertical, Edit, Trash2, Truck } from 'lucide-react'
import Toast, { type ToastType } from '../../components/ui/Toast'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import SortableTh from '../../components/ui/SortableTh'
import AccountSearchSelect from '../../components/AccountSearchSelect'
import MultiSelectTags from '../../components/ui/MultiSelectTags'
import { useClientSort } from '../../hooks/useClientSort'

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function collectPostableAccounts(accounts: Account[]): Account[] {
  const r: Account[] = []
  const walk = (list: Account[]) => {
    for (const a of list) {
      if (a.is_postable) r.push(a)
      if (a.children?.length) walk(a.children)
    }
  }
  walk(accounts)
  return r.sort((x, y) => x.code.localeCompare(y.code, undefined, { numeric: true }))
}

const emptyForm = {
  name: '',
  phone: '',
  national_id: '',
  vehicle_type: '',
  custody_account_id: 0,
  is_active: true,
  notes: '',
  branch_ids: [] as number[],
}

export default function DriverListPage() {
  const { currentTenant } = useAuth()
  const { t, lang } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()

  const [actionsOpenId, setActionsOpenId] = useState<number | null>(null)
  const [actionsAnchor, setActionsAnchor] = useState<{ top: number; left: number; right: number; width: number } | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<DeliveryDriver | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeliveryDriver | null>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [form, setForm] = useState(emptyForm)

  const { data, isLoading } = useQuery<PaginatedResponse<DeliveryDriver>>({
    queryKey: ['delivery-drivers', tenantId],
    queryFn: () => fetchDeliveryDrivers(tenantId, { per_page: '200' }),
    enabled: !!tenantId,
  })

  const accountsRes = useQuery({
    queryKey: ['accounts-tree', tenantId, 'delivery'],
    queryFn: () => fetchAccountTree(tenantId, { active_only: '1' }),
    enabled: !!tenantId && showModal,
  })
  const postableAccounts = collectPostableAccounts(accountsRes.data ?? [])

  const branchesRes = useQuery({
    queryKey: ['branches', tenantId, 'delivery'],
    queryFn: () => fetchBranches(tenantId, { status: 'active' }),
    enabled: !!tenantId && showModal,
  })

  const list = data?.data ?? []
  const { sort, toggleSort, sortedRows } = useClientSort(list, [
    { key: 'code', type: 'string', getValue: (r: DeliveryDriver) => r.code ?? '' },
    { key: 'name', type: 'string', getValue: (r: DeliveryDriver) => r.name ?? '' },
    { key: 'phone', type: 'string', getValue: (r: DeliveryDriver) => r.phone ?? '' },
    { key: 'vehicle', type: 'string', getValue: (r: DeliveryDriver) => r.vehicle_type ?? '' },
    { key: 'account', type: 'string', getValue: (r: DeliveryDriver) => r.custody_account?.code ?? '' },
    { key: 'status', type: 'string', getValue: (r: DeliveryDriver) => (r.is_active ? (t.active ?? '') : (t.inactive ?? '')) },
  ], { locale: lang === 'ar' ? 'ar-u-nu-latn' : 'en-US' })

  const showToast = useCallback((message: string, type: ToastType) => setToast({ message, type }), [])

  const closeActionsMenu = useCallback(() => {
    setActionsOpenId(null)
    setActionsAnchor(null)
  }, [])

  const openActionsMenu = useCallback((e: MouseEvent, row: DeliveryDriver) => {
    e.stopPropagation()
    const el = e.currentTarget as HTMLElement
    const rect = el.getBoundingClientRect()
    setActionsAnchor({ top: rect.bottom, left: rect.left, right: rect.right, width: rect.width })
    setActionsOpenId(row.id)
  }, [])

  const createMut = useMutation({
    mutationFn: (d: Partial<DeliveryDriver>) => createDeliveryDriver(tenantId, d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-drivers', tenantId] })
      closeModal()
      showToast(t.msg?.addedSuccess ?? 'تمت الإضافة', 'success')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? (t.msg?.errorOccurred ?? 'خطأ')
      showToast(msg, 'error')
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data: d }: { id: number; data: Partial<DeliveryDriver> }) => updateDeliveryDriver(tenantId, id, d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-drivers', tenantId] })
      closeModal()
      showToast(t.msg?.updatedSuccess ?? 'تم التحديث', 'success')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? (t.msg?.errorOccurred ?? 'خطأ')
      showToast(msg, 'error')
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteDeliveryDriver(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-drivers', tenantId] })
      setDeleteTarget(null)
      showToast(t.msg?.deletedSuccess ?? 'تم الحذف', 'success')
    },
    onError: (err: unknown) => {
      setDeleteTarget(null)
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? (t.msg?.errorOccurred ?? 'خطأ')
      showToast(msg, 'error')
    },
  })

  function closeModal() {
    setShowModal(false)
    setEditing(null)
    setForm(emptyForm)
  }

  function openEdit(row: DeliveryDriver) {
    setEditing(row)
    setForm({
      name: row.name,
      phone: row.phone ?? '',
      national_id: row.national_id ?? '',
      vehicle_type: row.vehicle_type ?? '',
      custody_account_id: row.custody_account_id,
      is_active: row.is_active,
      notes: row.notes ?? '',
      branch_ids: (row.branches ?? []).map((b) => b.id),
    })
    setShowModal(true)
  }

  function submitModal() {
    if (!form.name.trim() || !form.custody_account_id) {
      showToast(t.delivery?.driverNameAccountRequired ?? 'الاسم وحساب العهدة مطلوبان', 'error')
      return
    }
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      national_id: form.national_id.trim() || null,
      vehicle_type: form.vehicle_type.trim() || null,
      custody_account_id: form.custody_account_id,
      is_active: form.is_active,
      notes: form.notes.trim() || null,
      branch_ids: form.branch_ids,
    }
    if (editing) updateMut.mutate({ id: editing.id, data: payload })
    else createMut.mutate(payload)
  }

  const td = 'px-3 py-2 text-sm border-b border-neutral-200 dark:border-neutral-700'

  return (
    <div className="w-full max-w-full min-w-0 p-3 md:p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Truck className="w-8 h-8 text-primary-600" />
          <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            {t.delivery?.driversTitle ?? 'السائقون وعهدة التوصيل'}
          </h1>
        </div>
        <button
          type="button"
          onClick={() => { setEditing(null); setForm(emptyForm); setShowModal(true) }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
        >
          <Plus className="w-4 h-4" />
          {t.delivery?.addDriver ?? 'سائق جديد'}
        </button>
      </div>

      <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 overflow-x-auto shadow-sm">
        <table className="min-w-full">
          <thead className="bg-neutral-50 dark:bg-neutral-800/80">
            <tr>
              <SortableTh label={'رقم'} sortKey="code" sortState={sort} onToggle={toggleSort} className="text-start" />
              <SortableTh label={t.delivery?.driverName ?? 'الاسم'} sortKey="name" sortState={sort} onToggle={toggleSort} className="text-start" />
              <SortableTh label={t.customers.phone} sortKey="phone" sortState={sort} onToggle={toggleSort} className="text-start" />
              <SortableTh label={t.delivery?.vehicleType ?? 'نوع المركبة'} sortKey="vehicle" sortState={sort} onToggle={toggleSort} className="text-start" />
              <SortableTh label={t.delivery?.custodyAccount ?? 'حساب العهدة'} sortKey="account" sortState={sort} onToggle={toggleSort} className="text-start" />
              <SortableTh label={t.status ?? 'الحالة'} sortKey="status" sortState={sort} onToggle={toggleSort} className="text-start" />
              <th className={`${td} w-12`} />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className={`${td} text-center py-12`}>{t.loading ?? '…'}</td></tr>
            ) : sortedRows.length === 0 ? (
              <tr><td colSpan={7} className={`${td} text-center py-12 text-neutral-500`}>{t.delivery?.noDrivers ?? 'لا يوجد سائقون'}</td></tr>
            ) : (
              sortedRows.map((row) => (
                <tr key={row.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                  <td className={td}>{row.code ?? '—'}</td>
                  <td className={td}>{row.name}</td>
                  <td className={td}>{row.phone ?? '—'}</td>
                  <td className={td}>{row.vehicle_type ?? '—'}</td>
                  <td className={td}>
                    {row.custody_account ? `${row.custody_account.code} — ${lang === 'ar' ? row.custody_account.name : (row.custody_account.name_en || row.custody_account.name)}` : '—'}
                  </td>
                  <td className={td}>{row.is_active ? (t.active ?? 'نشط') : (t.inactive ?? 'موقوف')}</td>
                  <td className={`${td} relative`}>
                    <button type="button" className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700" onClick={(e) => openActionsMenu(e, row)} aria-label="actions">
                      <MoreVertical className="w-4 h-4" />
                    </button>
                    {actionsOpenId === row.id && actionsAnchor && createPortal(
                      <>
                        <button type="button" className="fixed inset-0 z-[100]" aria-label="close" onClick={closeActionsMenu} />
                        {(() => {
                          const menuW = 180
                          const pad = 8
                          const viewportW = typeof window !== 'undefined' ? window.innerWidth : 0
                          const desiredLeft = lang === 'ar'
                            ? actionsAnchor.left
                            : (actionsAnchor.right - menuW)
                          const left = viewportW > 0
                            ? clamp(desiredLeft, pad, Math.max(pad, viewportW - menuW - pad))
                            : desiredLeft
                          return (
                        <div
                          className="fixed z-[101] min-w-[140px] rounded-lg border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-900 shadow-lg py-1"
                          style={{ top: actionsAnchor.top + 4, left }}
                        >
                          <button type="button" className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800" onClick={() => { closeActionsMenu(); openEdit(row) }}>
                            <Edit className="w-4 h-4" /> {t.edit ?? 'تعديل'}
                          </button>
                          <button type="button" className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => { closeActionsMenu(); setDeleteTarget(row) }}>
                            <Trash2 className="w-4 h-4" /> {t.delete ?? 'حذف'}
                          </button>
                        </div>
                          )
                        })()}
                      </>,
                      document.body,
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
            <h2 className="mb-4 text-lg font-semibold">{editing ? (t.edit ?? 'تعديل') : (t.delivery?.addDriver ?? 'سائق جديد')}</h2>
            <div className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium">{t.delivery?.driverName ?? 'الاسم'} *</label>
                <input className="w-full rounded-lg border px-3 py-2 dark:border-neutral-600 dark:bg-neutral-800" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium">{t.customers.phone}</label>
                <input className="w-full rounded-lg border px-3 py-2 dark:border-neutral-600 dark:bg-neutral-800" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium">{t.delivery?.nationalId ?? 'الهوية'}</label>
                <input className="w-full rounded-lg border px-3 py-2 dark:border-neutral-600 dark:bg-neutral-800" value={form.national_id} onChange={(e) => setForm((f) => ({ ...f, national_id: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium">{t.delivery?.vehicleType ?? 'نوع المركبة'}</label>
                <input className="w-full rounded-lg border px-3 py-2 dark:border-neutral-600 dark:bg-neutral-800" value={form.vehicle_type} onChange={(e) => setForm((f) => ({ ...f, vehicle_type: e.target.value }))} placeholder={t.delivery?.vehiclePlaceholder ?? 'مثال: فان، دراجة'} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="block text-sm font-medium">{t.delivery?.custodyAccount ?? 'حساب العهدة'} *</label>
                <AccountSearchSelect
                  value={form.custody_account_id > 0 ? form.custody_account_id : null}
                  accounts={postableAccounts}
                  onChange={(id) => setForm((f) => ({ ...f, custody_account_id: id ?? 0 }))}
                  placeholder={t.delivery?.selectAccount ?? 'اختر حساباً من الدليل'}
                  allowEmpty
                  inputClassName="w-full min-w-0 h-10 box-border rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 text-sm text-neutral-900 dark:text-neutral-100 outline-none transition-shadow focus:border-primary-500 focus:ring-2 focus:ring-inset focus:ring-primary-500/30"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="block text-sm font-medium">{'الفروع'}</label>
                <MultiSelectTags
                  options={(branchesRes.data ?? []).map((b) => ({
                    id: b.id,
                    label: `${b.code} — ${lang === 'ar' ? b.name : (b.name_en || b.name)}`,
                  }))}
                  value={form.branch_ids}
                  onChange={(ids) => setForm((f) => ({ ...f, branch_ids: ids }))}
                  placeholder={'اختر...'}
                  textAlign={lang === 'ar' ? 'right' : 'left'}
                  className="w-full"
                />
              </div>
              <div className="flex items-center sm:col-span-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" className="rounded border-neutral-300" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
                  {t.active ?? 'نشط'}
                </label>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="block text-sm font-medium">{t.notes ?? 'ملاحظات'}</label>
                <textarea className="w-full rounded-lg border px-3 py-2 dark:border-neutral-600 dark:bg-neutral-800" rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="px-4 py-2 rounded-lg border dark:border-neutral-600" onClick={closeModal}>{t.cancel ?? 'إلغاء'}</button>
              <button type="button" className="px-4 py-2 rounded-lg bg-primary-600 text-white disabled:opacity-50" onClick={submitModal} disabled={createMut.isPending || updateMut.isPending}>
                {t.save ?? 'حفظ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={t.delivery?.deleteDriver ?? 'حذف السائق'}
          message={`${t.msg.confirmDeleteTitle}: «${deleteTarget.name}»؟ ${t.msg.cannotUndo}`}
          confirmLabel={t.delete ?? 'حذف'}
          cancelLabel={t.cancel ?? 'إلغاء'}
          variant="danger"
          isLoading={deleteMut.isPending}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => deleteMut.mutate(deleteTarget.id)}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
