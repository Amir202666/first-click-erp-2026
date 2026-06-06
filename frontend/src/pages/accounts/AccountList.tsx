import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchAccountTree, createAccount, updateAccount, moveAccount, fetchAccountCanDelete, deleteAccount, fetchNextAccountCode, exportChartOfAccounts, fetchBranches, fetchCostCenters, fetchTenantUsers, fetchCurrencies } from '../../api/tenant'
import type { Account } from '../../types'
import type { Branch, CostCenter, Currency } from '../../types'
import type { TenantUserItem } from '../../types'
import { ChevronDown, ChevronLeft, Plus, X, Search, Pencil, Trash2, Upload, FileText, FileSpreadsheet, Folder, File, LayoutGrid, CheckCircle, XCircle } from 'lucide-react'
import Toast, { type ToastType } from '../../components/ui/Toast'
import { asArray } from '../../utils/asArray'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { useClientSort } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'
import TablePageSkeleton from '../../components/ui/TablePageSkeleton'
import ChartOfAccountsImportWizard from './ChartOfAccountsImportWizard'
import { buildAccountStatementSheetUrl } from './AccountStatement'
import { getReportPeriodRange } from '../../utils/date'

const accountTypeColors: Record<string, string> = {
  asset: 'bg-blue-50 text-blue-700 border border-blue-100',
  liability: 'bg-rose-50 text-rose-700 border border-rose-100',
  equity: 'bg-violet-50 text-violet-700 border border-violet-100',
  revenue: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
  cogs: 'bg-orange-50 text-orange-700 border border-orange-100',
  expense: 'bg-amber-50 text-amber-700 border border-amber-100',
}
/** إيراد مقابل (مردودات، خصم مسموح به): طبيعته مدين */
const contraRevenueBadge = 'bg-amber-100 text-amber-800 border border-amber-200'

interface FlatAccount {
  id: number
  code: string
  name: string
  name_en: string | null
  type: string
  parent_id: number | null
  normal_balance?: 'debit' | 'credit' | null
  level: number
  is_active?: boolean
}

function flattenAccounts(accounts: Account[], result: FlatAccount[] = []): FlatAccount[] {
  for (const acc of accounts) {
    result.push({
      id: acc.id,
      code: acc.code,
      name: acc.name,
      name_en: acc.name_en ?? null,
      type: acc.type,
      parent_id: acc.parent_id ?? null,
      normal_balance: acc.normal_balance ?? undefined,
      level: acc.level,
      is_active: acc.is_active ?? true,
    })
    if (acc.children?.length) {
      flattenAccounts(acc.children, result)
    }
  }
  return result
}

function findAccountById(accounts: Account[], id: number): Account | null {
  for (const acc of accounts) {
    if (acc.id === id) return acc
    if (acc.children?.length) {
      const found = findAccountById(acc.children, id)
      if (found) return found
    }
  }
  return null
}

const ACCOUNT_LIST_COLUMNS_KEY = 'accountListVisibleColumns'
type AccountColumnKey = 'code' | 'name' | 'type' | 'status'
const accountColumnKeys: AccountColumnKey[] = ['code', 'name', 'type', 'status']

export default function AccountList() {
  const navigate = useNavigate()
  const { currentTenant, can } = useAuth()
  const { t, isRtl, getDisplayName } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()
  const canDeleteAccount = can('accounts.delete')

  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [parentSearch, setParentSearch] = useState('')
  const [showParentDropdown, setShowParentDropdown] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null)
  const [deleteBlockedReason, setDeleteBlockedReason] = useState<string | null>(null)
  const [isMovingParent, setIsMovingParent] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [showImportWizard, setShowImportWizard] = useState(false)
  const [filterType, setFilterType] = useState<string>('')
  const [filterName, setFilterName] = useState('')
  const [visibleColumns] = useState<Record<AccountColumnKey, boolean>>(() => {
    try {
      const raw = window.localStorage.getItem(ACCOUNT_LIST_COLUMNS_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, boolean>
        return {
          code: parsed.code !== false,
          name: parsed.name !== false,
          type: parsed.type !== false,
          status: parsed.status !== false,
        }
      }
    } catch {
      /* ignore */
    }
    return { code: true, name: true, type: true, status: true }
  })
  const [form, setForm] = useState({
    parent_id: null as number | null,
    parentLabel: '',
    code: '',
    name: '',
    name_en: '',
    type: 'asset' as Account['type'],
    normal_balance: '' as '' | 'debit' | 'credit',
    description: '',
    is_postable: true,
    currency: '' as string,
    is_active: true,
    branch_ids: [] as number[],
    cost_center_ids: [] as number[],
    user_ids: [] as number[],
  })

  const accountTypeLabels: Record<string, string> = {
    asset: t.accounts.types.asset,
    liability: t.accounts.types.liability,
    equity: t.accounts.types.equity,
    revenue: t.accounts.types.revenue,
    cogs: t.accounts.types.cogs,
    expense: t.accounts.types.expense,
  }

  const { data: accounts = [], isLoading } = useQuery<Account[]>({
    queryKey: ['accountTree', tenantId],
    queryFn: () => fetchAccountTree(tenantId),
    enabled: !!tenantId,
  })

  const { data: branchesData } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId, { status: 'active' }),
    enabled: !!tenantId && showModal,
  })
  const branches: Branch[] = asArray<Branch>(branchesData)

  const { data: costCenters = [] } = useQuery<CostCenter[]>({
    queryKey: ['cost-centers', tenantId],
    queryFn: () => fetchCostCenters(tenantId, { active_only: '1' }),
    enabled: !!tenantId && showModal,
  })

  const { data: tenantUsersRes } = useQuery({
    queryKey: ['tenant-users', tenantId],
    queryFn: () => fetchTenantUsers(tenantId),
    enabled: !!tenantId && showModal,
  })
  const tenantUsers: TenantUserItem[] = tenantUsersRes?.data ?? []

  const { data: currencies = [] } = useQuery<Currency[]>({
    queryKey: ['currencies', tenantId],
    queryFn: () => fetchCurrencies(tenantId),
    enabled: !!tenantId && showModal,
  })

  /** عملة الحساب الافتراضية عند الإضافة: العملة المعلّمة كافتراضية ثم أول عملة نشطة في القائمة */
  const defaultAccountCurrencyCode = useMemo(() => {
    if (!currencies.length) return ''
    const active = currencies.filter((c) => c.is_active !== false)
    const pool = active.length > 0 ? active : currencies
    const marked = pool.find((c) => c.is_default)
    return (marked ?? pool[0])?.code ?? ''
  }, [currencies])

  const flatAccounts = useMemo(() => flattenAccounts(accounts), [accounts])
  const existingAccountCodes = useMemo(() => new Set(flatAccounts.map((a) => a.code.trim())), [flatAccounts])

  const filteredFlatAccounts = useMemo(() => {
    let list = flatAccounts
    if (filterType) list = list.filter((a) => a.type === filterType)
    if (filterName.trim()) {
      const q = filterName.trim().toLowerCase()
      list = list.filter((a) => a.name.toLowerCase().includes(q) || (a.name_en?.toLowerCase().includes(q) ?? false))
    }
    return list
  }, [flatAccounts, filterType, filterName])

  const { sort, toggleSort, sortedRows: sortedFilteredFlatAccounts } = useClientSort(filteredFlatAccounts, [
    { key: 'code', type: 'string', getValue: (a: FlatAccount) => a.code },
    { key: 'name', type: 'string', getValue: (a: FlatAccount) => getDisplayName(a) },
    { key: 'type', type: 'string', getValue: (a: FlatAccount) => accountTypeLabels[a.type] ?? a.type },
    { key: 'status', type: 'string', getValue: (a: FlatAccount) => ((a.is_active ?? true) ? (t.accounts?.active ?? 'نشط') : (t.accounts?.inactive ?? 'غير نشط')) },
  ])

  const hasActiveFilters = !!(filterType || filterName.trim())

  const accountStats = useMemo(() => {
    const total = flatAccounts.length
    const active = flatAccounts.filter((a) => a.is_active !== false).length
    const inactive = total - active
    return { total, active, inactive }
  }, [flatAccounts])

  const invalidParentIds = useMemo(() => {
    if (!editing) return new Set<number>()
    const ids = new Set<number>([editing.id])
    let changed = true
    while (changed) {
      changed = false
      for (const acc of flatAccounts) {
        if (acc.parent_id != null && ids.has(acc.parent_id) && !ids.has(acc.id)) {
          ids.add(acc.id)
          changed = true
        }
      }
    }
    return ids
  }, [editing, flatAccounts])

  const filteredParentAccounts = useMemo(() => {
    let list = flatAccounts.filter((a) => !invalidParentIds.has(a.id))
    if (!parentSearch.trim()) return list
    const q = parentSearch.toLowerCase()
    return list.filter(a => a.code.includes(q) || a.name.toLowerCase().includes(q) || (a.name_en?.toLowerCase().includes(q) ?? false))
  }, [flatAccounts, parentSearch, invalidParentIds])

  useEffect(() => {
    if (!showModal || editing) return
    async function loadCode() {
      try {
        const res = await fetchNextAccountCode(tenantId, form.parent_id)
        setForm(prev => ({ ...prev, code: res.code }))
      } catch { /* ignore */ }
    }
    loadCode()
  }, [showModal, form.parent_id, tenantId, editing])

  /** إذا وصلت العملات بعد فتح المودال وما زال الحقل فارغاً، املأ العملة الافتراضية */
  useEffect(() => {
    if (!showModal || editing) return
    if (!defaultAccountCurrencyCode) return
    setForm((prev) => (prev.currency === '' ? { ...prev, currency: defaultAccountCurrencyCode } : prev))
  }, [showModal, editing, defaultAccountCurrencyCode])

  useEffect(() => {
    try {
      window.localStorage.setItem(ACCOUNT_LIST_COLUMNS_KEY, JSON.stringify(visibleColumns))
    } catch {
      /* ignore */
    }
  }, [visibleColumns])

  const showToast = useCallback((message: string, type: ToastType) => setToast({ message, type }), [])

  const visibleColumnCount = accountColumnKeys.filter((k) => visibleColumns[k]).length

  const createMutation = useMutation({
    mutationFn: (data: Partial<Account>) => createAccount(tenantId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountTree', tenantId] })
      setShowModal(false)
      resetForm()
      showToast(t.msg.addedSuccess, 'success')
    },
    onError: (err: any) => showToast(err?.response?.data?.message ?? t.msg.addError, 'error'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Account> }) => updateAccount(tenantId, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountTree', tenantId] })
      setShowModal(false)
      resetForm()
      showToast(t.msg.updatedSuccess, 'success')
    },
    onError: (err: any) => showToast(err?.response?.data?.message ?? t.msg.updateError, 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteAccount(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountTree', tenantId] })
      setDeleteTarget(null)
      showToast(t.msg.deletedSuccess, 'success')
    },
    onError: (err: any) => {
      setDeleteTarget(null)
      const msg = err?.response?.data?.message ?? err?.response?.data?.errors?.[0] ?? t.msg.deleteError
      showToast(typeof msg === 'string' ? msg : t.msg.deleteError, 'error')
    },
  })

  function resetForm() {
    setForm({
      parent_id: null,
      parentLabel: '',
      code: '',
      name: '',
      name_en: '',
      type: 'asset',
      normal_balance: '',
      description: '',
      is_postable: true,
      currency: defaultAccountCurrencyCode,
      is_active: true,
      branch_ids: [],
      cost_center_ids: [],
      user_ids: [],
    })
    setParentSearch('')
    setShowParentDropdown(false)
    setEditing(null)
  }

  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (editing) {
      const run = async () => {
        setIsMovingParent(true)
        try {
          const nextParentId = form.parent_id ?? null
          const currentParentId = editing.parent_id ?? null
          if (nextParentId !== currentParentId) {
            await moveAccount(tenantId, editing.id, nextParentId)
          }
          await updateMutation.mutateAsync({
            id: editing.id,
            data: {
              name: form.name,
              name_en: form.name_en || null,
              normal_balance: form.normal_balance || null,
              description: form.description || null,
              is_postable: form.is_postable,
              currency: form.currency || null,
              is_active: form.is_active,
              branch_ids: form.branch_ids,
              cost_center_ids: form.cost_center_ids,
              user_ids: form.user_ids,
            } as Partial<Account>,
          })
        } finally {
          setIsMovingParent(false)
        }
      }
      run().catch((err: unknown) => {
        const ax = err as { response?: { data?: { message?: string } } }
        showToast(ax?.response?.data?.message ?? t.msg.updateError, 'error')
      })
      return
    }
    createMutation.mutate({
        parent_id: form.parent_id || null,
        code: form.code,
        name: form.name,
        name_en: form.name_en || null,
        type: form.type,
        normal_balance: form.normal_balance || null,
        description: form.description || null,
        is_postable: form.is_postable,
        currency: form.currency || null,
        is_active: form.is_active,
        branch_ids: form.branch_ids,
        cost_center_ids: form.cost_center_ids,
        user_ids: form.user_ids,
      } as Partial<Account>)
  }

  async function requestDelete(account: Account) {
    try {
      const check = await fetchAccountCanDelete(tenantId, account.id)
      if (!check.can_delete) {
        setDeleteBlockedReason(
          check.reason
            ?? (lang === 'ar' ? 'الحساب عليه حركات مالية ولا يمكن حذفه' : 'This account has financial transactions and cannot be deleted'),
        )
        return
      }
      setDeleteTarget(account)
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string } } }
      showToast(ax?.response?.data?.message ?? t.msg.deleteError, 'error')
    }
  }

  function openAddChild(parent: Account) {
    setEditing(null)
    setForm({
      parent_id: parent.id,
      parentLabel: `${parent.code} - ${getDisplayName(parent)}`,
      code: '',
      name: '',
      name_en: '',
      type: parent.type,
      normal_balance: '',
      description: '',
      is_postable: true,
      currency: defaultAccountCurrencyCode,
      is_active: true,
      branch_ids: [],
      cost_center_ids: [],
      user_ids: [],
    })
    setParentSearch('')
    setShowParentDropdown(false)
    setShowModal(true)
  }

  function openEdit(account: Account) {
    const parentAcc = account.parent_id ? flatAccounts.find((a) => a.id === account.parent_id) : null
    setEditing(account)
    setForm({
      parent_id: account.parent_id ?? null,
      parentLabel: parentAcc ? `${parentAcc.code} - ${getDisplayName(parentAcc)}` : '',
      code: account.code,
      name: account.name,
      name_en: account.name_en ?? '',
      type: account.type,
      normal_balance: (account.normal_balance ?? '') as '' | 'debit' | 'credit',
      description: account.description ?? '',
      is_postable: account.is_postable ?? true,
      currency: account.currency ?? '',
      is_active: account.is_active ?? true,
      branch_ids: account.branch_ids ?? [],
      cost_center_ids: account.cost_center_ids ?? [],
      user_ids: account.user_ids ?? [],
    })
    setParentSearch('')
    setShowParentDropdown(false)
    setShowModal(true)
  }

  function selectParent(acc: FlatAccount | null) {
    if (acc) {
      setForm(prev => ({
        ...prev,
        parent_id: acc.id,
        parentLabel: `${acc.code} - ${getDisplayName(acc)}`,
        ...(editing ? {} : { type: acc.type as Account['type'] }),
      }))
    } else {
      setForm(prev => ({ ...prev, parent_id: null, parentLabel: '' }))
    }
    setParentSearch('')
    setShowParentDropdown(false)
  }

  const textAlign = isRtl ? 'text-right' : 'text-left'
  const isSaving = createMutation.isPending || updateMutation.isPending || isMovingParent

  const goToAccountStatementSheet = useCallback(
    (accountId: number) => {
      const range = getReportPeriodRange('all')
      navigate(buildAccountStatementSheetUrl(accountId, range.from_date, range.to_date))
    },
    [navigate],
  )

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 min-w-0 max-w-full">
        <div className="h-8 w-48 bg-slate-200 rounded animate-pulse" />
        <TablePageSkeleton rows={10} />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 min-w-0 max-w-full">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <ChartOfAccountsImportWizard
        open={showImportWizard}
        onClose={() => setShowImportWizard(false)}
        tenantId={tenantId}
        existingCodes={existingAccountCodes}
        onImported={() => {
          queryClient.invalidateQueries({ queryKey: ['accountTree', tenantId] })
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-normal text-slate-900">{t.accounts.title}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { resetForm(); setShowModal(true) }}
            className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-4 py-2 transition-colors"
          >
            <Plus size={18} />
            {t.accounts.addAccount}
          </button>
          <button
            type="button"
            onClick={() => setShowImportWizard(true)}
            className="flex items-center gap-2 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <Upload size={18} />
            {t.accounts.importChart}
          </button>
          <button
            type="button"
            onClick={() => exportChartOfAccounts(tenantId).then(() => showToast(t.accounts.exportSuccess, 'success')).catch(() => showToast(t.msg.addError, 'error'))}
            className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-500 no-print"
            title={t.accounts.exportChart}
            aria-label={t.accounts.exportChart}
          >
            <FileSpreadsheet size={16} />
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-[35px] w-[35px] items-center justify-center rounded-md bg-[#344054] text-white hover:bg-[#2d3846] no-print"
            title={t.accounts?.exportPdf ?? (isRtl ? 'تصدير PDF' : 'Export PDF')}
            aria-label={t.accounts?.exportPdf ?? (isRtl ? 'تصدير PDF' : 'Export PDF')}
          >
            <FileText size={16} />
          </button>
        </div>
      </div>

      {/* بحث/تصفية في صف مستقل، ثم كروت KPI في صف مستقل — يمنع التداخل عند الزووم وتغيير العرض */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 w-full min-w-0 max-w-full p-4" dir={isRtl ? 'rtl' : 'ltr'}>
        <h2 className="text-base font-normal text-slate-800 mb-3">{t.search ?? 'بحث'} / {t.filter ?? 'فلترة'} — {t.accounts.title}</h2>
        <div className="space-y-4 min-w-0">
          <div className="min-w-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
              <div className="min-w-0 flex flex-col gap-1.5">
                <label className="block text-xs font-medium text-neutral-600">{t.accounts.accountType}</label>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="input-app w-full h-10 min-w-0"
                >
                  <option value="">{t.filter ?? 'الكل'}</option>
                  {Object.entries(accountTypeLabels).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="min-w-0 flex flex-col gap-1.5">
                <label className="block text-xs font-medium text-neutral-600">{t.accounts.accountName}</label>
                <div className="relative min-w-0">
                  <div className="absolute inset-y-0 flex items-center pointer-events-none text-slate-400 px-2" style={{ [isRtl ? 'right' : 'left']: '0.25rem' }}>
                    <Search size={16} />
                  </div>
                  <input
                    type="text"
                    value={filterName}
                    onChange={(e) => setFilterName(e.target.value)}
                    className={`input-app w-full min-w-0 h-10 text-sm ${isRtl ? 'pr-8 pl-3' : 'pl-8 pr-3'}`}
                    placeholder={(t.accounts as { searchByName?: string })?.searchByName ?? (isRtl ? 'ابحث بالاسم' : 'Search by name')}
                  />
                </div>
              </div>
            </div>
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={() => { setFilterType(''); setFilterName('') }}
                className="btn btn-sm btn-secondary mt-3 w-full sm:w-auto"
              >
                {t.journal?.clearFilters ?? 'مسح الفلاتر'}
              </button>
            ) : null}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-100 min-w-0">
            <div className="bg-primary-50/80 rounded-lg border border-primary-100 px-4 py-3 hover:shadow-sm transition-all flex items-center justify-between gap-2 min-w-0" role="presentation">
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-slate-500 truncate" title={t.accounts?.totalAccounts ?? 'إجمالي الحسابات'}>{t.accounts?.totalAccounts ?? 'إجمالي الحسابات'}</p>
                <p className="text-lg font-normal text-slate-900 tabular-nums">{accountStats.total}</p>
              </div>
              <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-primary-100 text-primary-600 flex items-center justify-center">
                <LayoutGrid size={18} />
              </div>
            </div>
            <div className="bg-emerald-50/80 rounded-lg border border-emerald-100 px-4 py-3 hover:shadow-sm transition-all flex items-center justify-between gap-2 min-w-0" role="presentation">
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-slate-500 truncate" title={t.accounts?.activeAccounts ?? 'الحسابات النشطة'}>{t.accounts?.activeAccounts ?? 'الحسابات النشطة'}</p>
                <p className="text-lg font-normal text-emerald-700 tabular-nums">{accountStats.active}</p>
              </div>
              <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <CheckCircle size={18} />
              </div>
            </div>
            <div className="bg-red-50/80 rounded-lg border border-red-100 px-4 py-3 hover:shadow-sm transition-all flex items-center justify-between gap-2 min-w-0" role="presentation">
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-slate-500 truncate" title={t.accounts?.inactiveAccounts ?? 'الحسابات غير النشطة'}>{t.accounts?.inactiveAccounts ?? 'الحسابات غير النشطة'}</p>
                <p className="text-lg font-normal text-red-700 tabular-nums">{accountStats.inactive}</p>
              </div>
              <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-red-100 text-red-600 flex items-center justify-center">
                <XCircle size={18} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full text-sm table-fixed">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                {!hasActiveFilters && <th className={`${textAlign} px-4 py-3 font-medium w-12`}></th>}
                {visibleColumns.code && (
                  <SortableTh
                    label={t.code}
                    sortKey="code"
                    sortState={sort}
                    onToggle={toggleSort}
                    widthClassName="w-28"
                    className={`${textAlign} font-medium text-slate-700 dark:text-slate-200`}
                  />
                )}
                {visibleColumns.name && (
                  <SortableTh
                    label={t.accounts.accountName}
                    sortKey="name"
                    sortState={sort}
                    onToggle={toggleSort}
                    widthClassName="w-[34rem]"
                    className={`${textAlign} font-medium text-slate-700 dark:text-slate-200`}
                  />
                )}
                {visibleColumns.type && (
                  <SortableTh
                    label={t.type}
                    sortKey="type"
                    sortState={sort}
                    onToggle={toggleSort}
                    widthClassName="w-44"
                    className={`${textAlign} font-medium text-slate-700 dark:text-slate-200`}
                  />
                )}
                {visibleColumns.status && (
                  <SortableTh
                    label={t.status ?? 'الحالة'}
                    sortKey="status"
                    sortState={sort}
                    onToggle={toggleSort}
                    widthClassName="w-36"
                    className={`${textAlign} font-medium text-slate-700 dark:text-slate-200`}
                  />
                )}
                <th className={`${textAlign} px-4 py-3 font-medium`}>{t.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {hasActiveFilters ? (
                sortedFilteredFlatAccounts.length === 0 ? (
                  <tr><td colSpan={visibleColumnCount + 1 + (hasActiveFilters ? 0 : 1)} className="text-center py-8 text-slate-400">{t.accounts.noResults}</td></tr>
                ) : (
                  sortedFilteredFlatAccounts.map((acc) => (
                    <tr key={acc.id} className="hover:bg-slate-50">
                      {visibleColumns.code && <td className="px-4 py-3.5 font-mono text-xs text-slate-600">{acc.code}</td>}
                      {visibleColumns.name && <td className="px-4 py-3.5 font-normal text-slate-900">{getDisplayName(acc)}</td>}
                      {visibleColumns.type && (
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${accountTypeColors[acc.type] ?? ''}`}>
                            {accountTypeLabels[acc.type] ?? acc.type}
                          </span>
                        </td>
                      )}
                      {visibleColumns.status && (
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${(acc.is_active ?? true) ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
                            {(acc.is_active ?? true) ? (t.accounts?.active ?? 'نشط') : (t.accounts?.inactive ?? 'غير نشط')}
                          </span>
                        </td>
                      )}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => goToAccountStatementSheet(acc.id)}
                            className="text-primary-600 hover:text-primary-500 p-1.5 rounded-md hover:bg-primary-50 transition-colors"
                            title={t.accounts.viewStatement ?? 'عرض الكشف'}
                            aria-label={t.accounts.viewStatement ?? 'عرض الكشف'}
                          >
                            <FileText size={16} />
                          </button>
                          {(() => {
                            const fullAccount = findAccountById(accounts, acc.id)
                            return fullAccount ? (
                              <>
                                <button
                                  onClick={() => openAddChild(fullAccount)}
                                  className="text-primary-600 hover:text-primary-500 p-1.5 rounded-md hover:bg-primary-50 transition-colors"
                                  title={t.accounts.addChild}
                                  aria-label={t.accounts.addChild}
                                >
                                  <Plus size={16} />
                                </button>
                                <button
                                  onClick={() => openEdit(fullAccount)}
                                  className="text-primary-600 hover:text-primary-500 p-1.5 rounded-md hover:bg-primary-50 transition-colors"
                                  title={t.edit}
                                  aria-label={t.edit}
                                >
                                  <Pencil size={16} />
                                </button>
                                {canDeleteAccount && (
                                  <button
                                    onClick={() => requestDelete(fullAccount)}
                                    className="text-red-500 hover:text-red-600 p-1.5 rounded-md hover:bg-red-50 transition-colors"
                                    title={t.delete}
                                    aria-label={t.delete}
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                )}
                              </>
                            ) : null
                          })()}
                        </div>
                      </td>
                    </tr>
                  ))
                )
              ) : accounts.length === 0 ? (
                <tr><td colSpan={visibleColumnCount + 1 + (hasActiveFilters ? 0 : 1)} className="text-center py-8 text-slate-400">{t.accounts.noAccounts}</td></tr>
              ) : (
                accounts.map((acc) => (
                  <AccountRow
                    key={acc.id}
                    account={acc}
                    level={0}
                    expanded={expanded}
                    onToggle={toggleExpand}
                    onAddChild={openAddChild}
                    onEdit={openEdit}
                    onDelete={canDeleteAccount ? requestDelete : undefined}
                    onOpenStatement={goToAccountStatementSheet}
                    accountTypeLabels={accountTypeLabels}
                    t={t}
                    isRtl={isRtl}
                    getDisplayName={getDisplayName}
                    visibleColumns={visibleColumns}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6" onClick={() => { setShowModal(false); resetForm() }}>
          <div
            className="bg-white rounded-xl shadow-xl w-[70vw] max-w-[min(900px,95vw)] max-h-[90vh] flex flex-col"
            style={isRtl ? { direction: 'rtl' } : undefined}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 shrink-0 px-[30px] pt-[30px] pb-4">
              <h2 className="text-xl font-normal text-slate-900">
                {editing ? t.accounts.editAccount : (t.accounts.addAccountNew ?? 'إضافة حساب جديد')}
              </h2>
              <button type="button" onClick={() => { setShowModal(false); resetForm() }} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"><X size={22} /></button>
            </div>
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0" dir={isRtl ? 'rtl' : 'ltr'}>
              <div className="flex-1 min-h-0 overflow-y-auto px-[30px] py-[30px]">
                <div className="flex flex-col gap-6">
                  {/* السطر الأول: رمز 20% | اسم 40% | الاسم بالإنجليزي 40% */}
                  <div className="grid grid-cols-5 gap-5">
                    <div className="min-w-0 col-span-1">
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.accounts.accountCode}</label>
                      <input
                        type="text"
                        value={form.code}
                        onChange={(e) => setForm({ ...form, code: e.target.value })}
                        className="w-full border border-slate-200 rounded-[8px] px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-400 focus:border-primary-300 outline-none bg-slate-50 font-mono"
                        dir="ltr"
                        required
                      disabled={!!editing}
                    />
                  </div>
                    <div className="min-w-0 col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.accounts.accountName}</label>
                      <input
                        type="text"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        className="w-full border border-slate-200 rounded-[8px] px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-400 focus:border-primary-300 outline-none"
                        required
                      />
                    </div>
                    <div className="min-w-0 col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.nameEn}</label>
                      <input
                        type="text"
                        value={form.name_en}
                        onChange={(e) => setForm({ ...form, name_en: e.target.value })}
                        className="w-full border border-slate-200 rounded-[8px] px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-400 focus:border-primary-300 outline-none"
                        dir="ltr"
                        placeholder="English name (optional)"
                      />
                    </div>
                  </div>

                  {/* الحساب الأب — إضافة وتعديل */}
                  <div className="grid grid-cols-5 gap-5">
                    <div className={`relative min-w-0 ${editing ? 'col-span-5' : 'col-span-3'}`}>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.accounts.parentAccount}</label>
                        {form.parentLabel ? (
                          <div className="flex items-center gap-2 w-full border border-slate-200 rounded-[8px] px-3 py-2 text-sm bg-slate-50">
                            <span className="flex-1 font-medium text-slate-800 truncate">{form.parentLabel}</span>
                            <button
                              type="button"
                              onClick={() => selectParent(null)}
                              className="text-slate-400 hover:text-red-500 shrink-0 p-1 rounded hover:bg-slate-200"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ) : (
                          <div className="relative">
                            <div className={`absolute inset-y-0 ${isRtl ? 'right-0 pr-3' : 'left-0 pl-3'} flex items-center pointer-events-none`}>
                              <Search size={16} className="text-slate-400" />
                            </div>
                            <input
                              type="text"
                              value={parentSearch}
                              onChange={(e) => { setParentSearch(e.target.value); setShowParentDropdown(true) }}
                              onFocus={() => setShowParentDropdown(true)}
                              placeholder={t.accounts.clickToSelectParent ?? 'اضغط للاختيار أو اترك فارغاً'}
                              className={`w-full border border-slate-200 rounded-[8px] ${isRtl ? 'pr-9 pl-3' : 'pl-9 pr-3'} py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-400 focus:border-primary-300 outline-none`}
                            />
                          </div>
                        )}
                        {showParentDropdown && !form.parentLabel && (
                          <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-[8px] shadow-lg max-h-52 overflow-y-auto">
                            {filteredParentAccounts.length === 0 ? (
                              <div className="px-3 py-2 text-sm text-slate-400">{t.accounts.noResults}</div>
                            ) : (
                              filteredParentAccounts.map((acc) => (
                                <button
                                  key={acc.id}
                                  type="button"
                                  onClick={() => selectParent(acc)}
                                  className={`w-full ${textAlign} px-3 py-2 text-sm hover:bg-primary-50 flex items-center gap-2 transition-colors`}
                                  style={{ paddingRight: `${(acc.level - 1) * 14 + 12}px` }}
                                >
                                  <span className="font-mono text-xs text-slate-500 shrink-0">{acc.code}</span>
                                  <span className="text-slate-800">{getDisplayName(acc)}</span>
                                  <span className={`${isRtl ? 'mr-auto' : 'ml-auto'} rounded px-2 py-0.5 text-xs font-medium ${accountTypeColors[acc.type] ?? ''}`}>
                                    {accountTypeLabels[acc.type] ?? acc.type}
                                  </span>
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    {!editing && (
                    <div className="min-w-0 col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.accounts.accountType}</label>
                      <select
                        value={form.type}
                        onChange={(e) => setForm({ ...form, type: e.target.value as Account['type'] })}
                        className="w-full border border-slate-200 rounded-[8px] px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-400 focus:border-primary-300 outline-none"
                      >
                        {Object.entries(accountTypeLabels).map(([val, label]) => (
                          <option key={val} value={val}>{label}</option>
                        ))}
                      </select>
                    </div>
                    )}
                  </div>

                  {/* العملة والحالة */}
                  <div className="grid grid-cols-5 gap-5">
                    <div className="min-w-0 col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.currency ?? 'العملة'}</label>
                      <select
                        value={form.currency}
                        onChange={(e) => setForm({ ...form, currency: e.target.value })}
                        className="w-full border border-slate-200 rounded-[8px] px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-400 focus:border-primary-300 outline-none"
                      >
                        <option value="">— {t.accounts.none ?? 'بدون'} —</option>
                        {currencies.filter((c) => c.is_active).map((c) => (
                          <option key={c.id} value={c.code}>{c.code} — {isRtl ? c.name : (c.name_en || c.name)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="min-w-0 col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.status ?? 'الحالة'}</label>
                      <select
                        value={form.is_active ? '1' : '0'}
                        onChange={(e) => setForm({ ...form, is_active: e.target.value === '1' })}
                        className="w-full border border-slate-200 rounded-[8px] px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-400 focus:border-primary-300 outline-none"
                      >
                        <option value="1">{t.active ?? 'نشط'}</option>
                        <option value="0">{t.inactive ?? 'غير نشط'}</option>
                      </select>
                    </div>
                  </div>

                  {/* السطر الثالث: الربط المتقدم — قوائم منسدلة (كل الفروع / كل المراكز / كل المستخدمين افتراضي) */}
                  <div className="grid grid-cols-3 gap-5">
                    <div className="min-w-0">
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.accounts.linkToBranches}</label>
                      <select
                        value={form.branch_ids.length === 0 ? '' : form.branch_ids[0]}
                        onChange={(e) => setForm((prev) => ({ ...prev, branch_ids: e.target.value === '' ? [] : [Number(e.target.value)] }))}
                        className="w-full border border-slate-200 rounded-[8px] px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-400 focus:border-primary-300 outline-none bg-white appearance-none cursor-pointer"
                        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: isRtl ? 'left 0.5rem center' : 'right 0.5rem center', backgroundSize: '1.25rem', [isRtl ? 'paddingLeft' : 'paddingRight']: '2rem' }}
                      >
                        <option value="">{t.accounts.allBranches}</option>
                        {branches.map((b) => (
                          <option key={b.id} value={b.id}>{b.code ? `${b.code} - ${b.name}` : b.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="min-w-0">
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.accounts.linkToCostCenters}</label>
                      <select
                        value={form.cost_center_ids.length === 0 ? '' : form.cost_center_ids[0]}
                        onChange={(e) => setForm((prev) => ({ ...prev, cost_center_ids: e.target.value === '' ? [] : [Number(e.target.value)] }))}
                        className="w-full border border-slate-200 rounded-[8px] px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-400 focus:border-primary-300 outline-none bg-white appearance-none cursor-pointer"
                        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: isRtl ? 'left 0.5rem center' : 'right 0.5rem center', backgroundSize: '1.25rem', [isRtl ? 'paddingLeft' : 'paddingRight']: '2rem' }}
                      >
                        <option value="">{t.accounts.allCostCenters}</option>
                        {costCenters.map((cc) => (
                          <option key={cc.id} value={cc.id}>{cc.code ? `${cc.code} - ${cc.name}` : cc.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="min-w-0">
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.accounts.linkToUsers}</label>
                      <select
                        value={form.user_ids.length === 0 ? '' : form.user_ids[0]}
                        onChange={(e) => setForm((prev) => ({ ...prev, user_ids: e.target.value === '' ? [] : [Number(e.target.value)] }))}
                        className="w-full border border-slate-200 rounded-[8px] px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-400 focus:border-primary-300 outline-none bg-white appearance-none cursor-pointer"
                        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: isRtl ? 'left 0.5rem center' : 'right 0.5rem center', backgroundSize: '1.25rem', [isRtl ? 'paddingLeft' : 'paddingRight']: '2rem' }}
                      >
                        <option value="">{t.accounts.allUsers}</option>
                        {tenantUsers.map((u) => (
                          <option key={u.id} value={u.id}>{u.name || u.email}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {(form.type === 'revenue' || (editing && editing.type === 'revenue')) && (
                    <div className="max-w-xs">
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.accounts.normalBalance}</label>
                      <select
                        value={form.normal_balance}
                        onChange={(e) => setForm({ ...form, normal_balance: e.target.value as '' | 'debit' | 'credit' })}
                        className="w-full border border-slate-200 rounded-[8px] px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-400 focus:border-primary-300 outline-none"
                      >
                        <option value="">{t.accounts.normalBalanceDefault}</option>
                        <option value="credit">{t.accounts.normalBalanceCredit}</option>
                        <option value="debit">{t.accounts.normalBalanceDebit}</option>
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.description}</label>
                    <textarea
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      className="w-full border border-slate-200 rounded-[8px] px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-400 focus:border-primary-300 outline-none resize-none"
                      rows={2}
                    />
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.is_postable}
                      onChange={(e) => setForm({ ...form, is_postable: e.target.checked })}
                      className="rounded border-slate-200 text-primary-600 focus:ring-primary-400"
                    />
                    <span className="text-sm text-slate-700">{t.accounts.isPostable}</span>
                  </label>
                </div>
              </div>
              <div className={`shrink-0 w-full px-[30px] py-4 border-t border-slate-200 bg-slate-50/80 rounded-b-xl flex gap-3 shadow-[0_-2px_16px_rgba(0,0,0,0.06)] ${isRtl ? 'justify-end' : 'justify-start'}`}>
                <button type="button" onClick={() => { setShowModal(false); resetForm() }} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 rounded-[8px] border border-slate-200 bg-white hover:bg-slate-100">
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="bg-primary-600 hover:bg-primary-500 text-white rounded-[8px] px-5 py-2 text-sm font-medium disabled:opacity-50 transition-colors shadow-sm"
                >
                  {isSaving ? t.saving : t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteBlockedReason && (
        <ConfirmDialog
          title={lang === 'ar' ? 'لا يمكن الحذف' : 'Cannot delete'}
          message={deleteBlockedReason}
          confirmLabel={t.close}
          variant="warning"
          showCancel={false}
          highlightMessage
          onConfirm={() => setDeleteBlockedReason(null)}
          onCancel={() => setDeleteBlockedReason(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={t.msg.confirmDeleteTitle}
          message={t.accounts.confirmDelete.replace('{name}', getDisplayName(deleteTarget)).replace('{code}', deleteTarget.code)}
          confirmLabel={t.delete}
          variant="danger"
          isLoading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}

function AccountRow({
  account,
  level,
  expanded,
  onToggle,
  onAddChild,
  onEdit,
  onDelete,
  onOpenStatement,
  accountTypeLabels,
  t,
  isRtl,
  getDisplayName,
  visibleColumns,
}: {
  account: Account
  level: number
  expanded: Set<number>
  onToggle: (id: number) => void
  onAddChild: (acc: Account) => void
  onEdit: (acc: Account) => void
  onDelete: ((acc: Account) => void) | undefined
  onOpenStatement: (id: number) => void
  accountTypeLabels: Record<string, string>
  t: any
  isRtl: boolean
  getDisplayName: (entity: { name?: string; name_en?: string | null }) => string
  visibleColumns: Record<AccountColumnKey, boolean>
}) {
  const hasChildren = account.children && account.children.length > 0
  const isExpanded = expanded.has(account.id)
  const isMainAccount = (account.level ?? 1) <= 1
  const indentPx = level * 20 + 16

  return (
    <>
      <tr className={`transition-colors ${isMainAccount ? 'bg-slate-50/80 hover:bg-slate-100' : 'hover:bg-slate-50'}`}>
        <td className="px-4 py-3.5 w-12">
          {hasChildren ? (
            <button
              onClick={() => onToggle(account.id)}
              className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-slate-300 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 text-sm font-semibold shadow-sm"
              title={isExpanded ? (t.accounts.collapse ?? 'طي الحساب') : (t.accounts.expand ?? 'توسيع الحساب')}
              aria-label={isExpanded ? (t.accounts.collapse ?? 'طي الحساب') : (t.accounts.expand ?? 'توسيع الحساب')}
            >
              {isExpanded ? '−' : '+'}
            </button>
          ) : (
            <span className="w-4 inline-block" />
          )}
        </td>
        {visibleColumns.code && <td className="px-4 py-3.5 font-mono text-xs text-slate-600">{account.code}</td>}
        {visibleColumns.name && (
          <td
            className="px-4 py-3.5"
            style={{ [isRtl ? 'paddingRight' : 'paddingLeft']: `${indentPx}px` } as React.CSSProperties}
          >
            <div className="flex items-center gap-2 text-slate-900">
              {hasChildren ? (
                <Folder size={18} className="text-slate-500" />
              ) : (
                <File size={16} className="text-slate-400" />
              )}
              <span className={isMainAccount ? 'font-semibold' : 'font-medium'}>
                {getDisplayName(account)}
              </span>
            </div>
          </td>
        )}
        {visibleColumns.type && (
          <td className="px-4 py-3.5">
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${account.type === 'revenue' && account.normal_balance === 'debit' ? contraRevenueBadge : (accountTypeColors[account.type] ?? '')}`}>
              {account.type === 'revenue' && account.normal_balance === 'debit'
                ? `${accountTypeLabels[account.type] ?? account.type} (${t.accounts.contraAccount})`
                : (accountTypeLabels[account.type] ?? account.type)}
            </span>
          </td>
        )}
        {visibleColumns.status && (
          <td className="px-4 py-3.5">
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${(account.is_active ?? true) ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
              {(account.is_active ?? true) ? (t.accounts?.active ?? 'نشط') : (t.accounts?.inactive ?? 'غير نشط')}
            </span>
          </td>
        )}
        <td className="px-4 py-3.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => onOpenStatement(account.id)}
              className="text-primary-600 hover:text-primary-500 p-1.5 rounded-md hover:bg-primary-50 transition-colors"
              title={t.accounts.viewStatement ?? 'عرض الكشف'}
              aria-label={t.accounts.viewStatement ?? 'عرض الكشف'}
            >
              <FileText size={16} />
            </button>
            <button
              onClick={() => onAddChild(account)}
              className="text-primary-600 hover:text-primary-500 p-1.5 rounded-md hover:bg-primary-50 transition-colors"
              title={t.accounts.addChild}
              aria-label={t.accounts.addChild}
            >
              <Plus size={16} />
            </button>
            <button
              onClick={() => onEdit(account)}
              className="text-primary-600 hover:text-primary-500 p-1.5 rounded-md hover:bg-primary-50 transition-colors"
              title={t.edit}
              aria-label={t.edit}
            >
              <Pencil size={16} />
            </button>
            {onDelete && (
              <button
                onClick={() => onDelete(account)}
                className="text-red-500 hover:text-red-600 p-1.5 rounded-md hover:bg-red-50 transition-colors"
                title={t.delete}
                aria-label={t.delete}
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </td>
      </tr>
      {hasChildren && isExpanded && account.children!.map((child) => (
        <AccountRow
          key={child.id}
          account={child}
          level={level + 1}
          expanded={expanded}
          onToggle={onToggle}
          onAddChild={onAddChild}
          onEdit={onEdit}
          onDelete={onDelete}
          onOpenStatement={onOpenStatement}
          accountTypeLabels={accountTypeLabels}
          t={t}
          isRtl={isRtl}
          getDisplayName={getDisplayName}
          visibleColumns={visibleColumns}
        />
      ))}
    </>
  )
}
