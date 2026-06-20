import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import {
  fetchDisassemblyOrder,
  fetchDisassemblyOrdersNextNumber,
  fetchItems,
  fetchWarehouses,
  createDisassemblyOrder,
  updateDisassemblyOrder,
  confirmDisassemblyOrder,
  fetchSettings,
} from '../../api/tenant'
import type { DisassemblyOrder, DisassemblyOrderLine, Item, TenantSettings, Warehouse } from '../../types'
import SearchableSelect, { type SearchableSelectOption } from '../../components/ui/SearchableSelect'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Toast, { type ToastType } from '../../components/ui/Toast'
import { formatAmount } from '../../utils/currency'
import { formatDisplayDate } from '../../utils/date'
import { ArrowLeft, CheckCircle, Plus, Save, Trash2, XCircle, Printer } from 'lucide-react'

const FIELD =
  'w-full h-10 min-h-[2.5rem] box-border rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-inset focus:ring-primary-500/20 disabled:bg-slate-100'

type OutputRow = {
  key: string
  item_id: number | null
  warehouse_id: number | null
  quantity: number
  unit_id: number | null
  notes: string
}

function emptyRow(defaultWarehouseId: number | null = null): OutputRow {
  return {
    key: `${Date.now()}-${Math.random()}`,
    item_id: null,
    warehouse_id: defaultWarehouseId,
    quantity: 1,
    unit_id: null,
    notes: '',
  }
}

function toList<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[]
  if (r && typeof r === 'object' && 'data' in (r as object)) return ((r as { data: unknown }).data as T[]) ?? []
  return []
}

export default function DisassemblyOrderForm() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const navigate = useNavigate()
  const { id } = useParams()
  const queryClient = useQueryClient()
  const isCreate = !id
  const orderId = id ? parseInt(id, 10) : 0

  const [number, setNumber] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [sourceItemId, setSourceItemId] = useState<number | null>(null)
  const [sourceWarehouseId, setSourceWarehouseId] = useState<number | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [notes, setNotes] = useState('')
  const [outputRows, setOutputRows] = useState<OutputRow[]>([emptyRow()])
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const { data: settings } = useQuery<TenantSettings>({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const fmt = (n: number) => formatAmount(n, { decimal_places: settings?.doc_amount_decimals ?? 2 }, locale)

  const { data: nextNum } = useQuery({
    queryKey: ['disassembly-orders-next', tenantId],
    queryFn: () => fetchDisassemblyOrdersNextNumber(tenantId),
    enabled: !!tenantId && isCreate,
  })
  useEffect(() => {
    if (isCreate && nextNum) setNumber(nextNum.number)
  }, [isCreate, nextNum])

  const { data: order, isLoading } = useQuery<DisassemblyOrder>({
    queryKey: ['disassembly-order', tenantId, orderId],
    queryFn: () => fetchDisassemblyOrder(tenantId, orderId),
    enabled: !!tenantId && !isCreate && orderId > 0,
  })

  useDocumentTitle(
    isCreate
      ? lang === 'ar' ? 'أمر تفكيك جديد' : 'New disassembly order'
      : lang === 'ar' ? `أمر تفكيك ${order?.number ?? ''}` : `Disassembly ${order?.number ?? ''}`,
  )

  const isDraft = isCreate || order?.status === 'draft'
  const isReadOnly = !isCreate && order?.status !== 'draft'

  useEffect(() => {
    if (!order) return
    setNumber(order.number)
    setDate(order.date.slice(0, 10))
    setSourceItemId(order.item_id)
    setSourceWarehouseId(order.warehouse_id)
    setQuantity(Number(order.quantity))
    setNotes(order.notes ?? '')
    const lines = order.lines ?? []
    if (lines.length > 0) {
      setOutputRows(
        lines.map((ln: DisassemblyOrderLine) => ({
          key: `ln-${ln.id ?? Math.random()}`,
          item_id: ln.item_id,
          warehouse_id: ln.warehouse_id,
          quantity: Number(ln.quantity),
          unit_id: ln.unit_id ?? null,
          notes: ln.notes ?? '',
        })),
      )
    }
  }, [order])

  const { data: itemsRaw } = useQuery({
    queryKey: ['items', tenantId, 'disassembly-form'],
    queryFn: () => fetchItems(tenantId, { per_page: '500', is_active: '1' }),
    enabled: !!tenantId,
  })
  const items = useMemo(() => toList<Item>(itemsRaw), [itemsRaw])

  const { data: warehousesRaw } = useQuery({
    queryKey: ['warehouses', tenantId, 'disassembly-form'],
    queryFn: () => fetchWarehouses(tenantId),
    enabled: !!tenantId,
  })
  const warehouses = useMemo(() => toList<Warehouse>(warehousesRaw), [warehousesRaw])

  useEffect(() => {
    if (isCreate && warehouses.length === 1 && !sourceWarehouseId) {
      setSourceWarehouseId(warehouses[0].id)
      setOutputRows((rows) => rows.map((r) => (r.warehouse_id ? r : { ...r, warehouse_id: warehouses[0].id })))
    }
  }, [isCreate, warehouses, sourceWarehouseId])

  const itemOptions: SearchableSelectOption[] = useMemo(
    () =>
      items.map((it) => ({
        value: it.id,
        label: it.code ? `${it.code} — ${it.name}` : it.name,
      })),
    [items],
  )

  const warehouseOptions: SearchableSelectOption[] = useMemo(
    () => warehouses.map((w) => ({ value: w.id, label: w.name })),
    [warehouses],
  )

  const sourceItem = items.find((i) => i.id === sourceItemId) ?? order?.item

  const buildPayload = useCallback(() => {
    const lines = outputRows
      .filter((r) => r.item_id && r.warehouse_id && r.quantity > 0)
      .map((r) => ({
        item_id: r.item_id,
        warehouse_id: r.warehouse_id,
        quantity: r.quantity,
        unit_id: r.unit_id,
        notes: r.notes || null,
      }))
    return {
      item_id: sourceItemId,
      warehouse_id: sourceWarehouseId,
      quantity,
      date,
      notes: notes || null,
      lines,
    }
  }, [outputRows, sourceItemId, sourceWarehouseId, quantity, date, notes])

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = buildPayload()
      if (!payload.item_id || !payload.warehouse_id) throw new Error(lang === 'ar' ? 'اختر الصنف والمستودع' : 'Select item and warehouse')
      if (payload.lines.length === 0) throw new Error(lang === 'ar' ? 'أضف صنفاً ناتجاً واحداً على الأقل' : 'Add at least one output item')
      if (isCreate) return createDisassemblyOrder(tenantId, payload)
      return updateDisassemblyOrder(tenantId, orderId, payload)
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['disassembly-orders', tenantId] })
      setToast({ message: lang === 'ar' ? 'تم الحفظ' : 'Saved', type: 'success' })
      if (isCreate) navigate(`/manufacturing/disassembly-orders/${saved.id}`, { replace: true })
      else queryClient.invalidateQueries({ queryKey: ['disassembly-order', tenantId, orderId] })
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? (err instanceof Error ? err.message : t.msg?.errorOccurred ?? 'Error')
      setToast({ message: msg, type: 'error' })
    },
  })

  const handleConfirmFlow = async () => {
    if (isCreate) {
      try {
        const payload = buildPayload()
        const saved = await createDisassemblyOrder(tenantId, payload)
        await confirmDisassemblyOrder(tenantId, saved.id)
        queryClient.invalidateQueries({ queryKey: ['disassembly-orders', tenantId] })
        setConfirmOpen(false)
        navigate(`/manufacturing/disassembly-orders/${saved.id}`)
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error'
        setToast({ message: msg, type: 'error' })
        setConfirmOpen(false)
      }
      return
    }
    if (isDraft) {
      try {
        await updateDisassemblyOrder(tenantId, orderId, buildPayload())
        await confirmDisassemblyOrder(tenantId, orderId)
        queryClient.invalidateQueries({ queryKey: ['disassembly-orders', tenantId] })
        queryClient.invalidateQueries({ queryKey: ['disassembly-order', tenantId, orderId] })
        setConfirmOpen(false)
        setToast({ message: lang === 'ar' ? 'تم تنفيذ التفكيك' : 'Completed', type: 'success' })
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error'
        setToast({ message: msg, type: 'error' })
        setConfirmOpen(false)
      }
    }
  }

  const confirmMessage = useMemo(() => {
    const name = sourceItem?.name ?? '—'
    return lang === 'ar'
      ? `سيتم خصم ${quantity} وحدة من «${name}» وإضافة الأصناف الناتجة للمخزون. هل تريد المتابعة؟`
      : `Deduct ${quantity} units from «${name}» and add outputs to stock. Continue?`
  }, [sourceItem, quantity, lang])

  const statusLabel = (s: string) => {
    if (s === 'draft') return lang === 'ar' ? 'مسودة' : 'Draft'
    if (s === 'completed') return lang === 'ar' ? 'مكتمل' : 'Completed'
    if (s === 'cancelled') return lang === 'ar' ? 'ملغى' : 'Cancelled'
    return s
  }

  const printOrder = () => {
    if (!order) return
    const w = window.open('', '_blank')
    if (!w) return
    const lines = (order.lines ?? [])
      .map(
        (ln) =>
          `<tr><td>${ln.item?.name ?? ln.item_id}</td><td>${ln.quantity}</td><td>${ln.warehouse?.name ?? ''}</td><td>${ln.unit_cost != null ? fmt(Number(ln.unit_cost)) : '—'}</td></tr>`,
      )
      .join('')
    w.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>${order.number}</title>
      <style>body{font-family:Arial,sans-serif;padding:24px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ccc;padding:8px;text-align:right}th{background:#f5f5f5}</style></head><body>
      <h2>${lang === 'ar' ? 'أمر تفكيك' : 'Disassembly order'} — ${order.number}</h2>
      <p>${lang === 'ar' ? 'التاريخ' : 'Date'}: ${formatDisplayDate(order.date)}</p>
      <p>${lang === 'ar' ? 'الصنف' : 'Item'}: ${order.item?.name ?? ''} — ${lang === 'ar' ? 'الكمية' : 'Qty'}: ${order.quantity}</p>
      <p>${lang === 'ar' ? 'الحالة' : 'Status'}: ${statusLabel(order.status)}</p>
      <h3>${lang === 'ar' ? 'الأصناف الناتجة' : 'Output items'}</h3>
      <table><thead><tr><th>${lang === 'ar' ? 'الصنف' : 'Item'}</th><th>${lang === 'ar' ? 'الكمية' : 'Qty'}</th><th>${lang === 'ar' ? 'المستودع' : 'Warehouse'}</th><th>${lang === 'ar' ? 'تكلفة الوحدة' : 'Unit cost'}</th></tr></thead><tbody>${lines}</tbody></table>
      </body></html>`)
    w.document.close()
    w.print()
  }

  const stickyBtnBase =
    'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-50 disabled:pointer-events-none'

  if (!isCreate && isLoading) {
    return <div className="p-8 text-center text-slate-400">{lang === 'ar' ? 'جاري التحميل...' : 'Loading...'}</div>
  }

  return (
    <div className="w-full max-w-full min-w-0 p-3 md:p-4 space-y-4" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => navigate('/manufacturing/disassembly-orders')}
            className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 shrink-0"
            aria-label={t.cancel}
          >
            <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-slate-900 truncate">
              {isCreate ? (lang === 'ar' ? 'أمر تفكيك جديد' : 'New disassembly order') : number}
            </h1>
            {!isCreate && order && (
              <span className="text-sm text-slate-500">{statusLabel(order.status)}</span>
            )}
          </div>
        </div>
        {!isCreate && order?.status === 'completed' && (
          <button
            type="button"
            onClick={printOrder}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 shrink-0"
          >
            <Printer className="h-4 w-4" /> {lang === 'ar' ? 'طباعة' : 'Print'}
          </button>
        )}
      </div>

      {!isCreate && order && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm space-y-2">
          <div className="font-medium text-slate-700">{lang === 'ar' ? 'سجل الأمر' : 'Timeline'}</div>
          <div>{lang === 'ar' ? 'إنشاء' : 'Created'}: {order.createdByUser?.name ?? order.created_by_user?.name ?? '—'} — {order.date ? formatDisplayDate(order.date) : '—'}</div>
          {order.confirmed_at && (
            <div>{lang === 'ar' ? 'تأكيد' : 'Confirmed'}: {order.confirmedByUser?.name ?? order.confirmed_by_user?.name ?? '—'} — {formatDisplayDate(order.confirmed_at.slice(0, 10))}</div>
          )}
          {order.status === 'completed' && order.total_cost > 0 && (
            <div>{lang === 'ar' ? 'إجمالي التكلفة' : 'Total cost'}: {fmt(Number(order.total_cost))}</div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 md:p-5 space-y-4 w-full min-w-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">{lang === 'ar' ? 'رقم الأمر' : 'Number'}</label>
            <input className={FIELD} value={number} readOnly disabled />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">{lang === 'ar' ? 'التاريخ' : 'Date'}</label>
            <input type="date" className={FIELD} value={date} disabled={isReadOnly} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-slate-500 mb-1">{lang === 'ar' ? 'المستودع (مصدر التفكيك)' : 'Source warehouse'}</label>
            <SearchableSelect
              options={warehouseOptions}
              value={sourceWarehouseId ?? 0}
              onChange={(v) => {
                const wid = v ? Number(v) : null
                setSourceWarehouseId(wid)
                setOutputRows((rows) => rows.map((r) => ({ ...r, warehouse_id: r.warehouse_id ?? wid })))
              }}
              disabled={isReadOnly}
              placeholder={lang === 'ar' ? 'اختر المستودع' : 'Select warehouse'}
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">{lang === 'ar' ? 'الصنف المراد تفكيكه' : 'Item to disassemble'}</label>
          <SearchableSelect
            options={itemOptions}
            value={sourceItemId ?? 0}
            onChange={(v) => setSourceItemId(v ? Number(v) : null)}
            disabled={isReadOnly}
            placeholder={lang === 'ar' ? 'بحث بالكود أو الاسم' : 'Search item...'}
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">{lang === 'ar' ? 'الكمية المفككة' : 'Quantity to disassemble'}</label>
          <input
            type="number"
            min={0.0001}
            step="any"
            className={FIELD}
            value={quantity}
            disabled={isReadOnly}
            onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">{lang === 'ar' ? 'ملاحظات' : 'Notes'}</label>
          <textarea
            className={`${FIELD} min-h-[4rem] py-2`}
            rows={2}
            value={notes}
            disabled={isReadOnly}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden w-full min-w-0">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold text-slate-800">{lang === 'ar' ? 'الأصناف الناتجة عن التفكيك' : 'Output items'}</h2>
          {isDraft && (
            <button
              type="button"
              onClick={() => setOutputRows((rows) => [...rows, emptyRow(sourceWarehouseId)])}
              className="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700"
            >
              <Plus className="h-4 w-4" /> {lang === 'ar' ? 'إضافة صنف ناتج' : 'Add output'}
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 w-10">#</th>
                <th className="px-3 py-2 text-start">{lang === 'ar' ? 'الصنف الناتج' : 'Output item'}</th>
                <th className="px-3 py-2 text-start">{lang === 'ar' ? 'الكمية' : 'Qty'}</th>
                <th className="px-3 py-2 text-start">{lang === 'ar' ? 'المستودع' : 'Warehouse'}</th>
                {isReadOnly && <th className="px-3 py-2 text-start">{lang === 'ar' ? 'ت. الوحدة' : 'Unit cost'}</th>}
                {isDraft && <th className="px-3 py-2 w-12" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {outputRows.map((row, idx) => (
                <tr key={row.key}>
                  <td className="px-3 py-2 text-slate-400">{idx + 1}</td>
                  <td className="px-3 py-2 min-w-[14rem]">
                    {isReadOnly ? (
                      items.find((i) => i.id === row.item_id)?.name ?? order?.lines?.[idx]?.item?.name ?? '—'
                    ) : (
                      <SearchableSelect
                        options={itemOptions}
                        value={row.item_id ?? 0}
                        onChange={(v) =>
                          setOutputRows((rows) =>
                            rows.map((r) => (r.key === row.key ? { ...r, item_id: v ? Number(v) : null } : r)),
                          )
                        }
                        placeholder={lang === 'ar' ? 'اختر الصنف' : 'Select item'}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0.0001}
                      step="any"
                      className={FIELD}
                      disabled={isReadOnly}
                      value={row.quantity}
                      onChange={(e) =>
                        setOutputRows((rows) =>
                          rows.map((r) => (r.key === row.key ? { ...r, quantity: parseFloat(e.target.value) || 0 } : r)),
                        )
                      }
                    />
                  </td>
                  <td className="px-3 py-2 min-w-[12rem]">
                    {isReadOnly ? (
                      warehouses.find((w) => w.id === row.warehouse_id)?.name ?? '—'
                    ) : (
                      <SearchableSelect
                        options={warehouseOptions}
                        value={row.warehouse_id ?? 0}
                        onChange={(v) =>
                          setOutputRows((rows) =>
                            rows.map((r) => (r.key === row.key ? { ...r, warehouse_id: v ? Number(v) : null } : r)),
                          )
                        }
                        placeholder={lang === 'ar' ? 'المستودع' : 'Warehouse'}
                      />
                    )}
                  </td>
                  {isReadOnly && (
                    <td className="px-3 py-2">
                      {order?.lines?.[idx]?.unit_cost != null ? fmt(Number(order.lines[idx].unit_cost)) : '—'}
                    </td>
                  )}
                  {isDraft && (
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        disabled={outputRows.length <= 1}
                        onClick={() => setOutputRows((rows) => rows.filter((r) => r.key !== row.key))}
                        className="rounded p-1 text-red-500 hover:bg-red-50 disabled:opacity-30"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isDraft && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden w-full min-w-0">
          <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-4 bg-slate-50/80">
            <button
              type="button"
              onClick={() => navigate('/manufacturing/disassembly-orders')}
              className={`${stickyBtnBase} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-slate-400`}
            >
              <XCircle className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={2.25} />
              {t.cancel}
            </button>
            <button
              type="button"
              disabled={saveMut.isPending}
              onClick={() => saveMut.mutate()}
              className={`${stickyBtnBase} bg-primary-600 text-white hover:bg-primary-500 focus-visible:ring-primary-500`}
            >
              <Save className="h-4 w-4 shrink-0" strokeWidth={2.25} />
              {saveMut.isPending ? t.saving : (lang === 'ar' ? 'حفظ مسودة' : 'Save draft')}
            </button>
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className={`${stickyBtnBase} bg-emerald-600 text-white hover:bg-emerald-500 focus-visible:ring-emerald-500`}
            >
              <CheckCircle className="h-4 w-4 shrink-0" strokeWidth={2.25} />
              {lang === 'ar' ? 'تأكيد وتنفيذ' : 'Confirm & execute'}
            </button>
          </div>
        </div>
      )}

      {confirmOpen && (
        <ConfirmDialog
          title={lang === 'ar' ? 'تأكيد التفكيك' : 'Confirm disassembly'}
          message={confirmMessage}
          confirmLabel={lang === 'ar' ? 'تنفيذ' : 'Execute'}
          variant="warning"
          onConfirm={handleConfirmFlow}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
