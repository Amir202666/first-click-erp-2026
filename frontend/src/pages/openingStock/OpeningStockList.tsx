import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchOpeningStockList,
  fetchWarehouses,
  fetchBranches,
  deleteOpeningStock,
  approveOpeningStock,
  unpostOpeningStock,
  fetchSettings,
} from '../../api/tenant'
import type { Branch, OpeningStockHeader, PaginatedResponse, TenantSettings, Warehouse } from '../../types'
import { formatDisplayDate } from '../../utils/date'
import { formatAmount } from '../../utils/currency'
import { Plus, Trash2, CheckCircle, Edit, Eye, RotateCcw } from 'lucide-react'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Toast, { type ToastType } from '../../components/ui/Toast'
import { useClientSort } from '../../hooks/useClientSort'
import SortableTh from '../../components/ui/SortableTh'

export default function OpeningStockList() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('')
  const [warehouseIdFilter, setWarehouseIdFilter] = useState('')
  const [branchIdFilter, setBranchIdFilter] = useState('')
  const [confirmTarget, setConfirmTarget] = useState<{ type: 'approve' | 'delete' | 'unpost'; header: OpeningStockHeader } | null>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)

  const showError = (err: unknown) => {
    const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? (err as { message?: string })?.message ?? (t.msg?.errorOccurred ?? 'حدث خطأ')
    setToast({ message: msg, type: 'error' })
  }

  const { data: settings } = useQuery<TenantSettings>({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const fmt = (n: number) => formatAmount(Number(n), { decimal_places: settings?.doc_amount_decimals ?? 2 }, locale)
  const textAlign = isRtl ? 'text-right' : 'text-left'

  const params: Record<string, string> = {}
  if (statusFilter) params.status = statusFilter
  if (warehouseIdFilter) params.warehouse_id = warehouseIdFilter
  if (branchIdFilter) params.branch_id = branchIdFilter

  const { data: branchesList = [] } = useQuery<Branch[]>({
    queryKey: ['branches', tenantId, 'opening-stock-list'],
    queryFn: () => fetchBranches(tenantId, { status: 'active' }),
    enabled: !!tenantId,
  })

  const { data: warehousesResp } = useQuery<{ data: Warehouse[] }>({
    queryKey: ['warehouses', tenantId],
    queryFn: () => fetchWarehouses(tenantId),
    enabled: !!tenantId,
  })
  const warehousesList = warehousesResp?.data ?? []

  const { data, isLoading } = useQuery<PaginatedResponse<OpeningStockHeader>>({
    queryKey: ['opening-stock', tenantId, statusFilter, warehouseIdFilter, branchIdFilter],
    queryFn: () => fetchOpeningStockList(tenantId, Object.keys(params).length ? params : undefined),
    enabled: !!tenantId,
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteOpeningStock(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opening-stock', tenantId] })
      setConfirmTarget(null)
    },
    onError: showError,
  })

  const approveMut = useMutation({
    mutationFn: (id: number) => approveOpeningStock(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opening-stock', tenantId] })
      setConfirmTarget(null)
    },
    onError: (err: unknown) => {
      showError(err)
      setConfirmTarget(null)
    },
  })

  const unpostMut = useMutation({
    mutationFn: (id: number) => unpostOpeningStock(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opening-stock', tenantId] })
      setConfirmTarget(null)
    },
    onError: (err: unknown) => {
      showError(err)
      setConfirmTarget(null)
    },
  })

  const list = data?.data ?? []

  const openingTotal = (h: OpeningStockHeader) => h.items?.reduce((s, i) => s + Number(i.total_cost ?? 0), 0) ?? 0
  const statusSortLabel = (h: OpeningStockHeader) =>
    h.status === 'approved' ? t.openingStock.statusApproved : t.openingStock.statusDraft

  const { sort, toggleSort, sortedRows } = useClientSort(list, [
    { key: 'id', type: 'number', getValue: (h: OpeningStockHeader) => h.id },
    { key: 'branch', type: 'string', getValue: (h: OpeningStockHeader) => h.branch?.name ?? '' },
    { key: 'warehouse', type: 'string', getValue: (h: OpeningStockHeader) => h.warehouse?.name ?? '' },
    { key: 'date', type: 'date', getValue: (h: OpeningStockHeader) => h.date },
    { key: 'reference', type: 'string', getValue: (h: OpeningStockHeader) => h.reference_number ?? '' },
    { key: 'status', type: 'string', getValue: (h: OpeningStockHeader) => statusSortLabel(h) },
    { key: 'total', type: 'number', getValue: (h: OpeningStockHeader) => openingTotal(h) },
  ], { locale })

  return (
    <div className="p-6 space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-slate-900">{t.openingStock.title}</h1>
          <button
            type="button"
            onClick={() => navigate('/opening-stock/create')}
            className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-4 py-2 text-sm font-medium shrink-0"
          >
            <Plus size={18} />
            {t.openingStock.new}
          </button>
        </div>
        <div
          className="rounded-xl border border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700 p-3 w-full min-w-0"
          aria-label={lang === 'ar' ? 'تصفية القائمة' : 'List filters'}
        >
          <div className="flex flex-nowrap items-stretch gap-2 w-full min-w-0 overflow-x-auto">
            <div className="min-w-0 flex-1 basis-0 shrink flex items-center">
              <select
                value={branchIdFilter}
                onChange={(e) => setBranchIdFilter(e.target.value)}
                className="w-full min-w-0 h-10 box-border border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-0 text-sm leading-none bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                aria-label={t.openingStock.branch}
              >
                <option value="">{t.openingStock.branch}</option>
                {branchesList.filter((b) => b.is_active).map((b) => (
                  <option key={b.id} value={b.id}>{b.code ? `${b.code} — ` : ''}{b.name}</option>
                ))}
              </select>
            </div>
            <div className="min-w-0 flex-1 basis-0 shrink flex items-center">
              <select
                value={warehouseIdFilter}
                onChange={(e) => setWarehouseIdFilter(e.target.value)}
                className="w-full min-w-0 h-10 box-border border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-0 text-sm leading-none bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                aria-label={t.openingStock.warehouse}
              >
                <option value="">{t.openingStock.warehouse}</option>
                {warehousesList.map((w) => (
                  <option key={w.id} value={w.id}>{w.code ? `${w.code} - ` : ''}{w.name}</option>
                ))}
              </select>
            </div>
            <div className="min-w-0 flex-1 basis-0 shrink flex items-center">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full min-w-0 h-10 box-border border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-0 text-sm leading-none bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
                aria-label={t.status}
              >
                <option value="">{t.status}</option>
                <option value="draft">{t.openingStock.statusDraft}</option>
                <option value="approved">{t.openingStock.statusApproved}</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex justify-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
          </div>
        ) : sortedRows.length === 0 ? (
          <div className="p-12 text-center text-slate-500">{t.openingStock.noRecords}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="bg-slate-50 text-slate-600">
                  <SortableTh label="#" sortKey="id" sortState={sort} onToggle={toggleSort} widthClassName="w-16" className={`${textAlign} font-medium text-slate-700 dark:text-slate-200`} />
                  <SortableTh label={t.openingStock.branch} sortKey="branch" sortState={sort} onToggle={toggleSort} widthClassName="w-40" className={`${textAlign} font-medium text-slate-700 dark:text-slate-200`} />
                  <SortableTh label={t.openingStock.warehouse} sortKey="warehouse" sortState={sort} onToggle={toggleSort} widthClassName="w-40" className={`${textAlign} font-medium text-slate-700 dark:text-slate-200`} />
                  <SortableTh label={t.openingStock.date} sortKey="date" sortState={sort} onToggle={toggleSort} widthClassName="w-32" className={`${textAlign} font-medium text-slate-700 dark:text-slate-200`} />
                  <SortableTh label={t.openingStock.referenceNumber} sortKey="reference" sortState={sort} onToggle={toggleSort} widthClassName="w-36" className={`${textAlign} font-medium text-slate-700 dark:text-slate-200`} />
                  <SortableTh label={t.status} sortKey="status" sortState={sort} onToggle={toggleSort} widthClassName="w-36" className={`${textAlign} font-medium text-slate-700 dark:text-slate-200`} />
                  <SortableTh label={t.openingStock.totalValue} sortKey="total" sortState={sort} onToggle={toggleSort} widthClassName="w-32" className={`${textAlign} font-medium text-slate-700 dark:text-slate-200`} />
                  <th className={`${textAlign} px-4 py-3 font-medium w-32`}>{t.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sortedRows.map((h) => {
                  const total = openingTotal(h)
                  return (
                    <tr key={h.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-slate-600">{h.id}</td>
                      <td className={`px-4 py-3 ${textAlign}`}>{h.branch?.name ?? '—'}</td>
                      <td className={`px-4 py-3 ${textAlign}`}>{h.warehouse?.name ?? '—'}</td>
                      <td className={`px-4 py-3 ${textAlign}`}>{formatDisplayDate(h.date)}</td>
                      <td className={`px-4 py-3 ${textAlign}`}>{h.reference_number ?? '—'}</td>
                      <td className={`px-4 py-3 ${textAlign}`}>
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                            h.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {h.status === 'approved' ? t.openingStock.statusApproved : t.openingStock.statusDraft}
                        </span>
                      </td>
                      <td className={`px-4 py-3 ${textAlign} font-medium`}>{fmt(total)}</td>
                      <td className="px-4 py-3 flex items-center gap-1">
                        <button
                          onClick={() => navigate(`/opening-stock/${h.id}`)}
                          className="p-1.5 text-slate-500 hover:text-slate-700"
                          title={h.status === 'draft' ? t.edit : t.actions}
                        >
                          {h.status === 'draft' ? <Edit size={16} /> : <Eye size={16} />}
                        </button>
                        {h.status === 'draft' && (
                          <>
                            <button
                              onClick={() => setConfirmTarget({ type: 'approve', header: h })}
                              disabled={approveMut.isPending}
                              className="p-1.5 text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
                              title={t.openingStock.approve}
                            >
                              <CheckCircle size={16} />
                            </button>
                            <button
                              onClick={() => setConfirmTarget({ type: 'delete', header: h })}
                              disabled={deleteMut.isPending}
                              className="p-1.5 text-red-500 hover:text-red-600 disabled:opacity-50"
                              title={t.delete}
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                        {h.status === 'approved' && (
                          <button
                            onClick={() => setConfirmTarget({ type: 'unpost', header: h })}
                            disabled={unpostMut.isPending}
                            className="p-1.5 text-amber-600 hover:text-amber-700 disabled:opacity-50"
                            title={t.openingStock.unpost}
                          >
                            <RotateCcw size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {confirmTarget && (
        <ConfirmDialog
          title={
            confirmTarget.type === 'approve'
              ? (lang === 'ar' ? 'اعتماد رصيد أول المدة' : 'Approve Opening Stock')
              : confirmTarget.type === 'delete'
                ? (t.msg?.confirmDeleteTitle ?? (lang === 'ar' ? 'تأكيد الحذف' : 'Confirm Delete'))
                : (lang === 'ar' ? 'إلغاء الترحيل' : 'Unpost')
          }
          message={
            confirmTarget.type === 'approve'
              ? t.openingStock.confirmApprove
              : confirmTarget.type === 'delete'
                ? t.openingStock.confirmDelete
                : t.openingStock.confirmUnpost
          }
          variant={confirmTarget.type === 'delete' ? 'danger' : 'warning'}
          confirmLabel={confirmTarget.type === 'approve' ? t.openingStock.approve : confirmTarget.type === 'delete' ? t.delete : t.openingStock.unpost}
          isLoading={
            confirmTarget.type === 'approve'
              ? approveMut.isPending
              : confirmTarget.type === 'delete'
                ? deleteMut.isPending
                : unpostMut.isPending
          }
          onConfirm={() => {
            if (confirmTarget.type === 'approve') approveMut.mutate(confirmTarget.header.id)
            else if (confirmTarget.type === 'delete') deleteMut.mutate(confirmTarget.header.id)
            else unpostMut.mutate(confirmTarget.header.id)
            setConfirmTarget(null)
          }}
          onCancel={() => setConfirmTarget(null)}
        />
      )}
    </div>
  )
}
