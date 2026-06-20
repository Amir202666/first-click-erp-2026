import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchDisassemblyOrders,
  deleteDisassemblyOrder,
  confirmDisassemblyOrder,
  cancelDisassemblyOrder,
} from '../../api/tenant'
import type { DisassemblyOrder, PaginatedResponse, DisassemblyOrderStats } from '../../types'
import { formatDisplayDate, getReportPeriodRange, type ReportPeriodKey } from '../../utils/date'
import { CheckCircle, MoreVertical, Pencil, Plus, Trash2, XCircle } from 'lucide-react'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Toast, { type ToastType } from '../../components/ui/Toast'
import { filterBarOverflowClass, filterSelectCompactClass, filterTextInputClass } from '../../utils/filterControlStyles'

const filterSelectCls = filterSelectCompactClass
const filterTextCls = filterTextInputClass

export default function DisassemblyOrderList() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()
  const initialAllRange = getReportPeriodRange('all')
  const [fromDate, setFromDate] = useState(initialAllRange.from_date)
  const [toDate, setToDate] = useState(initialAllRange.to_date)
  const [periodPreset, setPeriodPreset] = useState<ReportPeriodKey | 'custom'>('all')
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<DisassemblyOrder | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<DisassemblyOrder | null>(null)
  const [cancelTarget, setCancelTarget] = useState<DisassemblyOrder | null>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [openActionsId, setOpenActionsId] = useState<number | null>(null)

  const params: Record<string, string> = {}
  if (statusFilter) params.status = statusFilter
  if (search.trim()) params.search = search.trim()
  if (periodPreset !== 'all') {
    if (fromDate?.trim()) params.from_date = fromDate.trim()
    if (toDate?.trim()) params.to_date = toDate.trim()
  }

  const { data, isLoading } = useQuery<PaginatedResponse<DisassemblyOrder> & { stats?: DisassemblyOrderStats }>({
    queryKey: ['disassembly-orders', tenantId, statusFilter, search, periodPreset, fromDate, toDate],
    queryFn: () => fetchDisassemblyOrders(tenantId, Object.keys(params).length ? params : undefined),
    enabled: !!tenantId,
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteDisassemblyOrder(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disassembly-orders', tenantId] })
      setDeleteTarget(null)
      setToast({ message: lang === 'ar' ? 'تم حذف أمر التفكيك' : 'Disassembly order deleted', type: 'success' })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? (t.msg?.errorOccurred ?? 'حدث خطأ')
      setToast({ message: msg, type: 'error' })
    },
  })

  const confirmMut = useMutation({
    mutationFn: (id: number) => confirmDisassemblyOrder(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disassembly-orders', tenantId] })
      setConfirmTarget(null)
      setToast({ message: lang === 'ar' ? 'تم تنفيذ التفكيك وتحديث المخزون' : 'Disassembly completed', type: 'success' })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? (t.msg?.errorOccurred ?? 'حدث خطأ')
      setToast({ message: msg, type: 'error' })
      setConfirmTarget(null)
    },
  })

  const cancelMut = useMutation({
    mutationFn: (id: number) => cancelDisassemblyOrder(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disassembly-orders', tenantId] })
      setCancelTarget(null)
      setToast({ message: lang === 'ar' ? 'تم إلغاء أمر التفكيك' : 'Order cancelled', type: 'success' })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? (t.msg?.errorOccurred ?? 'حدث خطأ')
      setToast({ message: msg, type: 'error' })
    },
  })

  const list = data?.data ?? []
  const stats = data?.stats ?? { total: list.length, draft: 0, completed: 0, cancelled: 0 }

  const statusLabel = (s: string) => {
    if (s === 'draft') return lang === 'ar' ? 'مسودة' : 'Draft'
    if (s === 'completed') return lang === 'ar' ? 'مكتمل' : 'Completed'
    if (s === 'cancelled') return lang === 'ar' ? 'ملغى' : 'Cancelled'
    return s
  }

  const statusBadgeClass = (s: string) => {
    if (s === 'draft') return 'bg-gray-100 text-gray-700 border border-gray-200'
    if (s === 'completed') return 'bg-emerald-50 text-emerald-700 border border-emerald-200'
    if (s === 'cancelled') return 'bg-red-50 text-red-600 border border-red-200'
    return 'bg-gray-100 text-gray-600'
  }

  const itemLabel = (o: DisassemblyOrder) => {
    const it = o.item
    if (!it) return '—'
    return it.code ? `${it.code} — ${it.name}` : it.name
  }

  const confirmMessage = useMemo(() => {
    if (!confirmTarget) return ''
    const name = confirmTarget.item?.name ?? '—'
    const qty = confirmTarget.quantity
    return lang === 'ar'
      ? `سيتم خصم ${qty} وحدة من «${name}» وإضافة الأصناف الناتجة للمخزون. هل تريد المتابعة؟`
      : `This will deduct ${qty} units from «${name}» and add output items to stock. Continue?`
  }, [confirmTarget, lang])

  return (
    <div className="space-y-4" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t.nav?.disassemblyOrders ?? (lang === 'ar' ? 'تفكيك الأصناف' : 'Item disassembly')}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {lang === 'ar' ? 'تحويل صنف واحد إلى أصناف متعددة بكميات حرة' : 'Split one item into multiple output items'}
          </p>
        </div>
        <Link
          to="/manufacturing/disassembly-orders/create"
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          <Plus className="h-4 w-4" />
          {lang === 'ar' ? 'أمر تفكيك جديد' : 'New disassembly order'}
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: lang === 'ar' ? 'إجمالي الأوامر' : 'Total', value: stats.total, cls: 'bg-slate-50 border-slate-200' },
          { label: lang === 'ar' ? 'مسودة' : 'Draft', value: stats.draft, cls: 'bg-gray-50 border-gray-200' },
          { label: lang === 'ar' ? 'مكتملة' : 'Completed', value: stats.completed, cls: 'bg-emerald-50 border-emerald-200' },
          { label: lang === 'ar' ? 'ملغية' : 'Cancelled', value: stats.cancelled, cls: 'bg-red-50 border-red-200' },
        ].map((s) => (
          <div key={s.label} className={`rounded-xl border p-3 ${s.cls}`}>
            <div className="text-xs text-slate-500">{s.label}</div>
            <div className="text-2xl font-semibold text-slate-900 mt-1">{s.value}</div>
          </div>
        ))}
      </div>

      <div className={`flex flex-wrap items-end gap-3 ${filterBarOverflowClass}`}>
        <div className="min-w-[12rem] flex-1">
          <label className="block text-xs text-slate-500 mb-1">{lang === 'ar' ? 'بحث' : 'Search'}</label>
          <input
            type="text"
            className={filterTextCls}
            placeholder={lang === 'ar' ? 'رقم الأمر...' : 'Order number...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="min-w-[10rem]">
          <label className="block text-xs text-slate-500 mb-1">{lang === 'ar' ? 'الحالة' : 'Status'}</label>
          <select className={filterSelectCls} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">{lang === 'ar' ? 'الكل' : 'All'}</option>
            <option value="draft">{statusLabel('draft')}</option>
            <option value="completed">{statusLabel('completed')}</option>
            <option value="cancelled">{statusLabel('cancelled')}</option>
          </select>
        </div>
        <div className="min-w-[10rem]">
          <label className="block text-xs text-slate-500 mb-1">{lang === 'ar' ? 'الفترة' : 'Period'}</label>
          <select
            className={filterSelectCls}
            value={periodPreset}
            onChange={(e) => {
              const v = e.target.value as ReportPeriodKey | 'custom'
              setPeriodPreset(v)
              if (v !== 'custom' && v !== 'all') {
                const r = getReportPeriodRange(v)
                setFromDate(r.from_date)
                setToDate(r.to_date)
              }
            }}
          >
            <option value="all">{lang === 'ar' ? 'الكل' : 'All'}</option>
            <option value="today">{lang === 'ar' ? 'اليوم' : 'Today'}</option>
            <option value="this_month">{lang === 'ar' ? 'هذا الشهر' : 'This month'}</option>
            <option value="this_year">{lang === 'ar' ? 'هذه السنة' : 'This year'}</option>
            <option value="custom">{lang === 'ar' ? 'مخصص' : 'Custom'}</option>
          </select>
        </div>
        {periodPreset === 'custom' && (
          <>
            <div>
              <label className="block text-xs text-slate-500 mb-1">{lang === 'ar' ? 'من' : 'From'}</label>
              <input type="date" className={filterTextCls} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">{lang === 'ar' ? 'إلى' : 'To'}</label>
              <input type="date" className={filterTextCls} value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
          </>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-start font-medium">{lang === 'ar' ? 'رقم الأمر' : 'Number'}</th>
                <th className="px-3 py-2 text-start font-medium">{lang === 'ar' ? 'التاريخ' : 'Date'}</th>
                <th className="px-3 py-2 text-start font-medium">{lang === 'ar' ? 'الصنف المُفكَّك' : 'Source item'}</th>
                <th className="px-3 py-2 text-start font-medium">{lang === 'ar' ? 'الكمية' : 'Qty'}</th>
                <th className="px-3 py-2 text-start font-medium">{lang === 'ar' ? 'المستودع' : 'Warehouse'}</th>
                <th className="px-3 py-2 text-start font-medium">{lang === 'ar' ? 'أصناف ناتجة' : 'Outputs'}</th>
                <th className="px-3 py-2 text-start font-medium">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                <th className="px-3 py-2 text-start font-medium">{lang === 'ar' ? 'إجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-slate-400">{lang === 'ar' ? 'جاري التحميل...' : 'Loading...'}</td>
                </tr>
              )}
              {!isLoading && list.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-slate-400">{lang === 'ar' ? 'لا توجد أوامر' : 'No orders'}</td>
                </tr>
              )}
              {list.map((order) => (
                <tr key={order.id} className="hover:bg-slate-50/80">
                  <td className="px-3 py-2 font-medium text-primary-700">
                    <Link to={`/manufacturing/disassembly-orders/${order.id}`}>{order.number}</Link>
                  </td>
                  <td className="px-3 py-2">{formatDisplayDate(order.date)}</td>
                  <td className="px-3 py-2">{itemLabel(order)}</td>
                  <td className="px-3 py-2">{order.quantity}</td>
                  <td className="px-3 py-2">{order.warehouse?.name ?? '—'}</td>
                  <td className="px-3 py-2">{order.lines?.length ?? 0}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(order.status)}`}>
                      {statusLabel(order.status)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="relative inline-block">
                      <button
                        type="button"
                        className="rounded p-1 hover:bg-slate-100"
                        onClick={() => setOpenActionsId(openActionsId === order.id ? null : order.id)}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                      {openActionsId === order.id && (
                        <div className="absolute z-20 mt-1 min-w-[10rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg end-0">
                          <Link
                            to={`/manufacturing/disassembly-orders/${order.id}`}
                            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50"
                            onClick={() => setOpenActionsId(null)}
                          >
                            <Pencil className="h-4 w-4" /> {lang === 'ar' ? 'عرض / تعديل' : 'View / Edit'}
                          </Link>
                          {order.status === 'draft' && (
                            <>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-50"
                                onClick={() => { setConfirmTarget(order); setOpenActionsId(null) }}
                              >
                                <CheckCircle className="h-4 w-4" /> {lang === 'ar' ? 'تأكيد وتنفيذ' : 'Confirm'}
                              </button>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-amber-700 hover:bg-amber-50"
                                onClick={() => { setCancelTarget(order); setOpenActionsId(null) }}
                              >
                                <XCircle className="h-4 w-4" /> {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                              </button>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                                onClick={() => { setDeleteTarget(order); setOpenActionsId(null) }}
                              >
                                <Trash2 className="h-4 w-4" /> {lang === 'ar' ? 'حذف' : 'Delete'}
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && data.last_page > 1 && (
          <div className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
            {lang === 'ar'
              ? `صفحة ${data.current_page} من ${data.last_page} — ${data.total} أمر`
              : `Page ${data.current_page} of ${data.last_page} — ${data.total} orders`}
          </div>
        )}
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title={lang === 'ar' ? 'حذف أمر التفكيك' : 'Delete order'}
          message={lang === 'ar' ? 'هل تريد حذف هذا الأمر؟' : 'Delete this draft order?'}
          confirmLabel={lang === 'ar' ? 'حذف' : 'Delete'}
          onConfirm={() => deleteMut.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
          isLoading={deleteMut.isPending}
        />
      )}
      {confirmTarget && (
        <ConfirmDialog
          title={lang === 'ar' ? 'تأكيد التفكيك' : 'Confirm disassembly'}
          message={confirmMessage}
          confirmLabel={lang === 'ar' ? 'تنفيذ' : 'Execute'}
          variant="warning"
          onConfirm={() => confirmMut.mutate(confirmTarget.id)}
          onCancel={() => setConfirmTarget(null)}
          isLoading={confirmMut.isPending}
        />
      )}
      {cancelTarget && (
        <ConfirmDialog
          title={lang === 'ar' ? 'إلغاء الأمر' : 'Cancel order'}
          message={lang === 'ar' ? 'هل تريد إلغاء أمر التفكيك؟' : 'Cancel this draft order?'}
          confirmLabel={lang === 'ar' ? 'إلغاء الأمر' : 'Cancel order'}
          variant="warning"
          onConfirm={() => cancelMut.mutate(cancelTarget.id)}
          onCancel={() => setCancelTarget(null)}
          isLoading={cancelMut.isPending}
        />
      )}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
