import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { createVendor, fetchAccounts, fetchBranches } from '../api/tenant'
import type { Account, Branch, Vendor } from '../types'
import { useLanguage } from '../contexts/LanguageContext'
import { asArray } from '../utils/asArray'

type AddVendorModalForm = {
  name: string
  name_en: string
  company_name: string
  email: string
  phone: string
  tax_number: string
  address: string
  account_id: string
  auto_create_account: boolean
}

export default function AddVendorModal({
  open,
  tenantId,
  onClose,
  onCreated,
}: {
  open: boolean
  tenantId: number
  onClose: () => void
  onCreated: (vendor: Vendor) => void
}) {
  const { t, lang, isRtl, getDisplayName } = useLanguage()
  const queryClient = useQueryClient()

  const emptyForm: AddVendorModalForm = useMemo(
    () => ({
      name: '',
      name_en: '',
      company_name: '',
      email: '',
      phone: '',
      tax_number: '',
      address: '',
      account_id: '',
      auto_create_account: true,
    }),
    [],
  )

  const [form, setForm] = useState<AddVendorModalForm>(emptyForm)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [allBranches, setAllBranches] = useState(true)
  const [selectedBranchIds, setSelectedBranchIds] = useState<number[]>([])

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts-flat', tenantId, 'vendor-modal'],
    queryFn: () => fetchAccounts(tenantId, { active_only: '1' }),
    enabled: !!tenantId && open,
  })

  const { data: branchesData } = useQuery({
    queryKey: ['branches', tenantId, 'vendor-modal'],
    queryFn: () => fetchBranches(tenantId, { status: 'active' }),
    enabled: !!tenantId && open,
  })
  const branches: Branch[] = asArray<Branch>(branchesData)

  const createVendorMut = useMutation({
    mutationFn: (d: Partial<Vendor>) => createVendor(tenantId, d),
    onSuccess: (newVendor) => {
      setSubmitError(null)
      onCreated(newVendor)
      queryClient.invalidateQueries({ queryKey: ['vendors', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      setForm(emptyForm)
      setAllBranches(true)
      setSelectedBranchIds([])
      onClose()
    },
    onError: (err: { response?: { data?: { message?: string } }; message?: string }) => {
      const msg =
        err?.response?.data?.message ??
        err?.message ??
        (lang === 'ar' ? 'حدث خطأ أثناء حفظ المورد.' : 'Failed to save vendor.')
      setSubmitError(typeof msg === 'string' ? msg : lang === 'ar' ? 'حدث خطأ أثناء حفظ المورد.' : 'Failed to save vendor.')
    },
  })

  function close() {
    setSubmitError(null)
    setForm(emptyForm)
    setAllBranches(true)
    setSelectedBranchIds([])
    onClose()
  }

  function toggleBranchPick(id: number) {
    setSelectedBranchIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitError(null)

    if (!allBranches && selectedBranchIds.length === 0) {
      setSubmitError(
        lang === 'ar' ? 'اختر فرعاً واحداً على الأقل أو اختر «كل الفروع».' : 'Pick at least one branch or choose «All branches».',
      )
      return
    }

    const payload: Record<string, unknown> = {
      name: form.name,
      name_en: form.name_en || null,
      company_name: form.company_name?.trim() || null,
      email: form.email?.trim() || null,
      phone: form.phone?.trim() || null,
      tax_number: form.tax_number?.trim() || null,
      address: form.address?.trim() || null,
    }

    if (form.auto_create_account) {
      payload.auto_create_account = true
    } else {
      payload.account_id = form.account_id ? Number(form.account_id) : null
      payload.auto_create_account = false
    }

    payload.all_branches = allBranches
    if (!allBranches) {
      payload.branch_ids = selectedBranchIds
    }

    createVendorMut.mutate(payload as Partial<Vendor>)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={close}>
      <div
        className="bg-white dark:bg-neutral-900 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-neutral-700 shrink-0">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">
            {t.vendors?.addVendor ?? (lang === 'ar' ? 'إضافة مورد' : 'Add vendor')}
          </h3>
          <button
            type="button"
            onClick={close}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-500 transition-colors"
            aria-label={lang === 'ar' ? 'إغلاق' : 'Close'}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto flex-1 min-h-0">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
              {t.vendors?.vendorName ?? (lang === 'ar' ? 'اسم المورد' : 'Vendor name')} *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full border border-slate-300 dark:border-neutral-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none dark:bg-neutral-800"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
              {t.nameEn ?? (lang === 'ar' ? 'الاسم بالإنجليزي' : 'Name (EN)')}
            </label>
            <input
              type="text"
              value={form.name_en}
              onChange={(e) => setForm((f) => ({ ...f, name_en: e.target.value }))}
              className="w-full border border-slate-300 dark:border-neutral-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none dark:bg-neutral-800"
              dir="ltr"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
              {t.vendors?.companyName ?? (lang === 'ar' ? 'اسم الشركة' : 'Company name')}
            </label>
            <input
              type="text"
              value={form.company_name}
              onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
              className="w-full border border-slate-300 dark:border-neutral-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none dark:bg-neutral-800"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
                {t.customers?.phone ?? (lang === 'ar' ? 'الهاتف' : 'Phone')}
              </label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className="w-full border border-slate-300 dark:border-neutral-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none dark:bg-neutral-800"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
                {t.email ?? (lang === 'ar' ? 'البريد' : 'Email')}
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full border border-slate-300 dark:border-neutral-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none dark:bg-neutral-800"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
              {t.customers?.taxNumber ?? (lang === 'ar' ? 'الرقم الضريبي' : 'Tax number')}
            </label>
            <input
              type="text"
              value={form.tax_number}
              onChange={(e) => setForm((f) => ({ ...f, tax_number: e.target.value }))}
              className="w-full border border-slate-300 dark:border-neutral-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none dark:bg-neutral-800"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
              {t.customers?.address ?? (lang === 'ar' ? 'العنوان' : 'Address')}
            </label>
            <textarea
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              className="w-full border border-slate-300 dark:border-neutral-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none dark:bg-neutral-800"
              rows={2}
            />
          </div>

          <div className="border border-slate-200 dark:border-neutral-700 rounded-lg p-3 space-y-3 bg-slate-50/50 dark:bg-neutral-800/50">
            <label className="block text-sm font-semibold text-slate-700 dark:text-neutral-200">
              {lang === 'ar' ? 'الفروع' : 'Branches'}
            </label>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="vend-modal-branch-scope"
                  checked={allBranches}
                  onChange={() => {
                    setAllBranches(true)
                    setSelectedBranchIds([])
                  }}
                  className="text-primary-600 focus:ring-primary-500"
                />
                {lang === 'ar' ? 'كل الفروع' : 'All branches'}
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="vend-modal-branch-scope"
                  checked={!allBranches}
                  onChange={() => setAllBranches(false)}
                  className="text-primary-600 focus:ring-primary-500"
                />
                {lang === 'ar' ? 'فروع محددة' : 'Selected branches'}
              </label>
            </div>
            {!allBranches && (
              <div className="max-h-36 overflow-y-auto rounded-md border border-slate-200 dark:border-neutral-600 bg-white dark:bg-neutral-900 p-2 space-y-1.5">
                {branches.filter((b) => b.is_active).map((b) => (
                  <label key={b.id} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                    <input
                      type="checkbox"
                      checked={selectedBranchIds.includes(b.id)}
                      onChange={() => toggleBranchPick(b.id)}
                      className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span>{lang === 'ar' ? b.name : b.name_en || b.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="border border-slate-200 dark:border-neutral-700 rounded-lg p-3 space-y-3 bg-slate-50/50 dark:bg-neutral-800/50">
            <label className="block text-sm font-semibold text-slate-700 dark:text-neutral-200">
              {t.customers?.linkedAccount ?? (lang === 'ar' ? 'الحساب المرتبط' : 'Linked account')}
            </label>
            <div className="flex items-center gap-4 flex-wrap">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={form.auto_create_account}
                  onChange={() => setForm((f) => ({ ...f, auto_create_account: true, account_id: '' }))}
                  className="text-primary-600 focus:ring-primary-500"
                />
                {t.customers?.autoCreateAccount ?? (lang === 'ar' ? 'إنشاء حساب تلقائياً' : 'Auto-create account')}
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={!form.auto_create_account}
                  onChange={() => setForm((f) => ({ ...f, auto_create_account: false }))}
                  className="text-primary-600 focus:ring-primary-500"
                />
                {t.customers?.selectExistingAccount ?? (lang === 'ar' ? 'ربط بحساب موجود' : 'Link existing account')}
              </label>
            </div>
            {!form.auto_create_account && (
              <select
                value={form.account_id}
                onChange={(e) => setForm((f) => ({ ...f, account_id: e.target.value }))}
                className="w-full border border-slate-300 dark:border-neutral-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none dark:bg-neutral-800"
              >
                <option value="">{t.customers?.selectAccount ?? (lang === 'ar' ? 'اختر حساب' : 'Select account')}</option>
                {accounts.map((a) => (
                  <option key={a.id} value={String(a.id)}>
                    {a.code ? `${a.code} - ` : ''}
                    {getDisplayName(a as Account) || a.name || a.name_en || a.id}
                  </option>
                ))}
              </select>
            )}
          </div>

          {submitError && <div className="text-sm text-red-600">{submitError}</div>}

          <div className="flex gap-3 justify-end pt-2 border-t border-slate-100 dark:border-neutral-700">
            <button
              type="button"
              onClick={close}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 rounded-lg border border-slate-300 dark:border-neutral-600"
            >
              {t.cancel ?? (lang === 'ar' ? 'إلغاء' : 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={createVendorMut.isPending}
              className="bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50"
            >
              {createVendorMut.isPending
                ? (t.saving ?? (lang === 'ar' ? 'جارٍ الحفظ...' : 'Saving...'))
                : (t.save ?? (lang === 'ar' ? 'حفظ' : 'Save'))}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
