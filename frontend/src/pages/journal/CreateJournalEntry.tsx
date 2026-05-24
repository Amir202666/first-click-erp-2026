import { useState, useMemo, useCallback, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import {
  fetchAccounts,
  fetchBranches,
  fetchCostCenters,
  createJournalEntry,
  fetchJournalEntry,
  updateJournalEntry,
  postJournalEntry,
  fetchSettings,
} from '../../api/tenant'
import type { Account, Branch, CostCenter, JournalEntrySource, TenantSettings } from '../../types'
import { formatAmount } from '../../utils/currency'
import { Plus, Trash2, AlertTriangle, CheckCircle, GripVertical } from 'lucide-react'
import AccountSearchSelect from '../../components/AccountSearchSelect'

interface LineForm {
  account_id: number | null
  debit: number
  credit: number
  description: string
  cost_center_id: number | null
}

const emptyLine: LineForm = { account_id: null, debit: 0, credit: 0, description: '', cost_center_id: null }

function getJournalSourceUrl(source: JournalEntrySource): string {
  if (source.type === 'invoice') return `/invoices/create?id=${source.id}`
  if (source.type === 'payment') return `/payments/create-voucher?id=${source.id}`
  return '/journal-entries'
}

function apiErrorMessage(err: unknown, fallback: string): string {
  const ax = err as {
    response?: { data?: { message?: string; errors?: Record<string, string[] | string> } }
    message?: string
  }
  const m = ax?.response?.data?.message
  if (typeof m === 'string' && m.trim()) return m.trim()
  const errors = ax?.response?.data?.errors
  if (errors && typeof errors === 'object') {
    for (const v of Object.values(errors)) {
      if (Array.isArray(v)) {
        const first = v.find((x) => typeof x === 'string' && x.trim())
        if (first) return first.trim()
      } else if (typeof v === 'string' && v.trim()) {
        return v.trim()
      }
    }
  }
  if (typeof ax?.message === 'string' && ax.message.trim()) return ax.message.trim()
  return fallback
}

export default function CreateJournalEntry() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const entryIdRaw = searchParams.get('id')
  const entryId = entryIdRaw && /^\d+$/.test(entryIdRaw) ? Number(entryIdRaw) : null
  const isEdit = entryId != null && entryId > 0

  const { data: settings } = useQuery<TenantSettings>({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const fmt = (n: number) => formatAmount(n, { decimal_places: settings?.doc_amount_decimals ?? 2 }, locale)

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [type, setType] = useState('manual')
  const [description, setDescription] = useState('')
  const [branchId, setBranchId] = useState<number | null>(null)
  const [lines, setLines] = useState<LineForm[]>([{ ...emptyLine }, { ...emptyLine }])
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts', tenantId, 'postable'],
    queryFn: () => fetchAccounts(tenantId, { postable_only: '1', active_only: '1' }),
    enabled: !!tenantId,
  })

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId, { status: 'active' }),
    enabled: !!tenantId,
  })

  const { data: costCenters = [] } = useQuery<CostCenter[]>({
    queryKey: ['cost-centers', tenantId],
    queryFn: () => fetchCostCenters(tenantId, { active_only: '1' }),
    enabled: !!tenantId,
  })

  const { data: entry, isLoading: loadingEntry } = useQuery({
    queryKey: ['journalEntry', tenantId, entryId],
    queryFn: () => fetchJournalEntry(tenantId, entryId!),
    enabled: !!tenantId && isEdit,
  })

  useDocumentTitle(
    isEdit
      ? (lang === 'ar'
          ? `عرض القيد ${(entry as any)?.number ?? (entryId != null ? `#${entryId}` : '')}`.trim()
          : `Journal entry ${(entry as any)?.number ?? (entryId != null ? `#${entryId}` : '')}`.trim())
      : (lang === 'ar' ? 'إضافة قيد يومي' : 'Add journal entry')
  )

  useEffect(() => {
    if (!entry) return
    const dateStr = typeof entry.date === 'string' ? entry.date.slice(0, 10) : String(entry.date)
    setDate(dateStr ?? '')
    setType(entry.type)
    setDescription(entry.description ?? '')
    setBranchId(entry.branch_id ?? null)
    if (entry.lines?.length) {
      setLines(
        entry.lines.map((l) => ({
          account_id: l.account_id,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          description: l.description ?? '',
          cost_center_id: l.cost_center_id ?? null,
        }))
      )
    }
  }, [entry])

  const createMut = useMutation({
    mutationFn: (data: Record<string, unknown>) => createJournalEntry(tenantId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journalEntries', tenantId] })
      navigate('/journal-entries')
    },
  })

  const updateMut = useMutation({
    mutationFn: (data: Record<string, unknown>) => {
      const { _postAfter: _p, ...payload } = data
      return updateJournalEntry(tenantId, entryId!, payload)
    },
    onSuccess: (_, variables: Record<string, unknown>) => {
      if (variables._postAfter) {
        postJournalEntry(tenantId, entryId!)
          .then(() => {
            queryClient.invalidateQueries({ queryKey: ['journalEntries', tenantId] })
            queryClient.invalidateQueries({ queryKey: ['journalEntry', tenantId, entryId] })
            navigate('/journal-entries')
          })
          .catch(() => {})
      } else {
        queryClient.invalidateQueries({ queryKey: ['journalEntries', tenantId] })
        queryClient.invalidateQueries({ queryKey: ['journalEntry', tenantId, entryId] })
        navigate('/journal-entries')
      }
    },
  })

  function updateLine(index: number, field: keyof LineForm, value: string | number | null) {
    setLines((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      if (field === 'debit' && (value as number) > 0) {
        next[index].credit = 0
      } else if (field === 'credit' && (value as number) > 0) {
        next[index].debit = 0
      }
      return next
    })
  }

  function addLine() {
    setLines((prev) => [...prev, { ...emptyLine }])
  }

  function removeLine(index: number) {
    if (lines.length <= 2) return
    setLines((prev) => prev.filter((_, i) => i !== index))
  }

  function moveLine(from: number, to: number) {
    if (from === to) return
    setLines((prev) => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  const totals = useMemo(() => {
    const totalDebit = lines.reduce((sum, l) => sum + Number(l.debit), 0)
    const totalCredit = lines.reduce((sum, l) => sum + Number(l.credit), 0)
    return { totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.01 }
  }, [lines])

  const saveBlockedReason = useMemo(() => {
    if (!isEdit || !entry) return null as 'linked' | 'not_draft' | null
    if (entry.reference_type) return 'linked'
    if (entry.status !== 'draft') return 'not_draft'
    return null
  }, [isEdit, entry])

  const saveBlockedMessage =
    saveBlockedReason === 'linked'
      ? t.journal.saveBlockedLinkedEntry
      : saveBlockedReason === 'not_draft'
        ? t.journal.saveBlockedNonDraft
        : null

  const saveError = createMut.isError ? createMut.error : updateMut.isError ? updateMut.error : null

  const headerBranchIds = useMemo(() => {
    const ids = new Set<number>()
    for (const line of lines) {
      if (!line.account_id) continue
      const acc = accounts.find((a) => a.id === line.account_id) as (Account & { branch_ids?: number[] }) | undefined
      if (acc?.branch_ids?.length) acc.branch_ids.forEach((id) => ids.add(id))
    }
    return ids.size ? Array.from(ids) : null
  }, [lines, accounts])
  const headerBranchesFiltered = useMemo(() => {
    if (!headerBranchIds) return branches
    return branches.filter((b) => headerBranchIds.includes(b.id))
  }, [branches, headerBranchIds])

  const getCostCentersForLine = useCallback(
    (line: LineForm) => {
      if (!line.account_id) return costCenters
      const acc = accounts.find((a) => a.id === line.account_id) as (Account & { cost_center_ids?: number[] }) | undefined
      if (!acc?.cost_center_ids?.length) return costCenters
      return costCenters.filter((cc) => acc.cost_center_ids!.includes(cc.id))
    },
    [accounts, costCenters]
  )

  function buildPayload(): Record<string, unknown> {
    return {
      date,
      type,
      description: description || null,
      customer_id: null,
      vendor_id: null,
      branch_id: branchId,
      lines: lines
        .filter((l) => l.account_id && (l.debit > 0 || l.credit > 0))
        .map((l) => ({
          account_id: l.account_id,
          debit: l.debit,
          credit: l.credit,
          description: l.description || null,
          cost_center_id: l.cost_center_id,
        })),
    }
  }

  function handleCreateSubmit() {
    if (!totals.balanced) return
    createMut.mutate(buildPayload())
  }

  function handleUpdateSubmit(postAfter = false) {
    if (!totals.balanced || !entryId) return
    const payload = buildPayload()
    if (postAfter) (payload as Record<string, unknown>)._postAfter = true
    updateMut.mutate(payload)
  }

  const typeOptions = [
    'manual',
    'sales',
    'purchase',
    'expense',
    'payment',
    'adjustment',
    'opening',
    'closing',
  ] as const

  const textAlign = isRtl ? 'text-right' : 'text-left'
  const inputClass = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none'

  if (isEdit && (loadingEntry || !entry)) {
    return (
      <div className="px-0 py-4 flex justify-center w-full min-w-0">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
      </div>
    )
  }

  return (
    <div className="px-0 py-4 space-y-6 w-full min-w-0 max-w-full">
      <h1 className="text-2xl font-bold text-slate-900">
        {isEdit && entry ? `${t.journal.edit} — ${entry.number}` : t.journal.createEntry}
      </h1>

      {saveBlockedMessage && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="flex items-start gap-2">
            <AlertTriangle className="shrink-0 mt-0.5" size={18} />
            <span>{saveBlockedMessage}</span>
          </div>
          {saveBlockedReason === 'linked' && entry?.source && (
            <button
              type="button"
              onClick={() => navigate(getJournalSourceUrl(entry.source!))}
              className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100"
            >
              {t.journal.goToSource}
            </button>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} required title={t.date} aria-label={t.date} />
          </div>
          <div>
            <select value={type} onChange={(e) => setType(e.target.value)} className={inputClass}>
              {typeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {(t.journal.types as Record<string, string>)[opt] ?? opt}
                </option>
              ))}
            </select>
          </div>
          <div>
            <select value={branchId ?? ''} onChange={(e) => setBranchId(e.target.value ? +e.target.value : null)} className={inputClass}>
              <option value="">— {t.journal.branch} —</option>
              {headerBranchesFiltered.map(b => <option key={b.id} value={b.id}>{b.code} - {b.name}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-4">
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} placeholder={t.description} />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{t.journal.entryLines}</h2>
          <button onClick={addLine} className="flex items-center gap-1 text-primary-600 hover:text-primary-500 text-sm font-medium">
            <Plus size={16} />
            {t.journal.addLine}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th className="px-3 py-3 font-medium text-center w-10">#</th>
                <th className={`${textAlign} px-3 py-3 font-medium`} style={{ minWidth: 200 }}>{t.journal.account}</th>
                <th className={`${textAlign} px-3 py-3 font-medium`} style={{ minWidth: 140 }}>{t.journal.costCenter}</th>
                <th className={`${textAlign} px-3 py-3 font-medium`} style={{ minWidth: 140 }}>{t.description}</th>
                <th className={`${textAlign} px-3 py-3 font-medium w-32`}>{t.journal.debit}</th>
                <th className={`${textAlign} px-3 py-3 font-medium w-32`}>{t.journal.credit}</th>
                <th className="px-3 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {lines.map((line, idx) => {
                const isDragging = draggingIndex === idx
                const isDragOver = dragOverIndex === idx && draggingIndex !== null && draggingIndex !== idx

                return (
                  <tr
                    key={idx}
                    draggable
                    onDragStart={() => {
                      setDraggingIndex(idx)
                      setDragOverIndex(idx)
                    }}
                    onDragOver={(e) => {
                      e.preventDefault()
                      if (draggingIndex !== null && draggingIndex !== idx) {
                        setDragOverIndex(idx)
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      if (draggingIndex !== null && dragOverIndex !== null) {
                        moveLine(draggingIndex, dragOverIndex)
                      }
                      setDraggingIndex(null)
                      setDragOverIndex(null)
                    }}
                    onDragEnd={() => {
                      setDraggingIndex(null)
                      setDragOverIndex(null)
                    }}
                    className={`hover:bg-slate-50 transition-colors ${isDragging ? 'bg-primary-50' : ''} ${isDragOver ? 'ring-2 ring-primary-300' : ''}`}
                  >
                  <td className="px-3 py-2 text-center align-top select-none text-slate-500">
                    <div className="inline-flex items-center gap-1">
                      <span className="text-xs font-medium tabular-nums">{idx + 1}</span>
                      <span className="cursor-grab text-slate-400 hover:text-slate-600">
                        <GripVertical size={14} />
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <AccountSearchSelect
                      value={line.account_id}
                      accounts={accounts}
                      onChange={(id) => updateLine(idx, 'account_id', id)}
                      placeholder={t.journal.selectAccount}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={line.cost_center_id ?? ''}
                      onChange={(e) => updateLine(idx, 'cost_center_id', e.target.value ? +e.target.value : null)}
                      className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-inset focus:ring-primary-500"
                    >
                      <option value="">{t.journal.selectCostCenter}</option>
                      {getCostCentersForLine(line).map((cc) => (
                        <option key={cc.id} value={cc.id}>{cc.code} - {cc.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={line.description}
                      onChange={(e) => updateLine(idx, 'description', e.target.value)}
                      className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-inset focus:ring-primary-500"
                      placeholder={t.description + '...'}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={line.debit || ''}
                      onChange={(e) => updateLine(idx, 'debit', +e.target.value)}
                      className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-inset focus:ring-primary-500 text-left"
                      dir="ltr"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={line.credit || ''}
                      onChange={(e) => updateLine(idx, 'credit', +e.target.value)}
                      className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-inset focus:ring-primary-500 text-left"
                      dir="ltr"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => removeLine(idx)}
                      disabled={lines.length <= 2}
                      className="text-red-400 hover:text-red-600 disabled:opacity-30"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>

        <div className="border-t border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {!totals.balanced && totals.totalDebit + totals.totalCredit > 0 && (
                <div className="flex items-center gap-2 text-amber-600 bg-amber-50 rounded-lg px-3 py-2 text-sm">
                  <AlertTriangle size={16} />
                  <span>{t.journal.unbalanced}! {t.journal.difference}: {fmt(Math.abs(totals.totalDebit - totals.totalCredit))}</span>
                </div>
              )}
              {totals.balanced && totals.totalDebit > 0 && (
                <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2 text-sm font-medium">
                  <CheckCircle size={16} />
                  {t.journal.balanced}
                </div>
              )}
            </div>
            <div className="flex gap-8 text-sm">
              <div>
                <span className={`text-slate-600 ${isRtl ? 'ml-2' : 'mr-2'}`}>{t.journal.totalDebit}:</span>
                <span className="font-bold text-slate-900">{fmt(totals.totalDebit)}</span>
              </div>
              <div>
                <span className={`text-slate-600 ${isRtl ? 'ml-2' : 'mr-2'}`}>{t.journal.totalCredit}:</span>
                <span className="font-bold text-slate-900">{fmt(totals.totalCredit)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {saveError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {apiErrorMessage(saveError, t.journal.errorSaving)}
        </div>
      )}

      <div className="flex gap-3 justify-end">
        <button onClick={() => navigate(-1)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">
          {t.cancel}
        </button>
        {isEdit ? (
          <>
            <button
              type="button"
              onClick={() => handleUpdateSubmit(false)}
              disabled={updateMut.isPending || !totals.balanced || totals.totalDebit === 0 || !!saveBlockedReason}
              className="px-4 py-2 text-sm border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-50"
            >
              {updateMut.isPending ? t.saving : t.journal.saveAsDraft}
            </button>
            <button
              type="button"
              onClick={() => handleUpdateSubmit(true)}
              disabled={updateMut.isPending || !totals.balanced || totals.totalDebit === 0 || !!saveBlockedReason}
              className="bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-6 py-2 text-sm disabled:opacity-50 transition-colors font-medium"
            >
              {updateMut.isPending ? t.saving : t.journal.saveAndPost}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={handleCreateSubmit}
            disabled={createMut.isPending || !totals.balanced || totals.totalDebit === 0}
            className="bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-6 py-2 text-sm disabled:opacity-50 transition-colors font-medium"
          >
            {createMut.isPending ? t.saving : t.journal.saveEntry}
          </button>
        )}
      </div>
    </div>
  )
}
