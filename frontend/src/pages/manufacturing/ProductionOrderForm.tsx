import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import {
  fetchProductionOrder,
  fetchProductionOrdersNextNumber,
  fetchBoms,
  fetchBom,
  fetchItems,
  fetchWarehouses,
  fetchBranches,
  fetchCostCenters,
  createProductionOrder,
  updateProductionOrder,
  approveProductionOrder,
  generateItemBarcode,
  fetchSettings,
  fetchAccounts,
} from '../../api/tenant'
import type {
  ProductionOrder,
  ProductionOrderExpense,
  BillOfMaterial,
  BillOfMaterialLine,
  Item,
  Account,
  PaginatedResponse,
  TenantSettings,
  Warehouse,
  CostCenter,
} from '../../types'
import { coerceDecimalPlaces, formatAmount } from '../../utils/currency'
import { ArrowLeft, Barcode, CheckCircle, Plus, Save, Trash2, XCircle } from 'lucide-react'
import Toast, { type ToastType } from '../../components/ui/Toast'
import SearchableSelect, { type SearchableSelectOption } from '../../components/ui/SearchableSelect'
import AccountSearchSelect from '../../components/AccountSearchSelect'

function toList<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[]
  if (r && typeof r === 'object' && 'data' in (r as object)) return ((r as { data: unknown }).data as T[]) ?? []
  return []
}

const FIELD_CONTROL =
  'w-full h-10 min-h-[2.5rem] box-border rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:ring-2 focus:ring-inset focus:ring-primary-500/20 focus:border-primary-500 disabled:bg-slate-100 disabled:cursor-not-allowed'
const FIELD_CONTROL_READ =
  'w-full h-10 min-h-[2.5rem] box-border rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600'

function roundFixed(n: number, decimals: number): number {
  const f = 10 ** decimals
  return Math.round(n * f) / f
}

/** توزيع مبلغ (مثل مصاريف الشراء) على أوزان موجبة مع جبر الفرق في آخر مفتاح */
function allocateAmountByWeights(
  total: number,
  weightsByKey: Record<number, number>,
  decimals: number,
): Record<number, number> {
  const keys = Object.keys(weightsByKey)
    .map(Number)
    .filter((k) => (weightsByKey[k] ?? 0) > 0.0000001)
  const out: Record<number, number> = {}
  keys.forEach((k) => {
    out[k] = 0
  })
  const t = roundFixed(Math.max(0, total), decimals)
  if (t <= 0 || keys.length === 0) return out

  let sumW = keys.reduce((s, k) => s + (weightsByKey[k] ?? 0), 0)
  if (sumW <= 0) {
    const even = roundFixed(t / keys.length, decimals)
    let acc = 0
    keys.forEach((k, i) => {
      if (i === keys.length - 1) out[k] = roundFixed(t - acc, decimals)
      else {
        out[k] = even
        acc = roundFixed(acc + even, decimals)
      }
    })
    return out
  }

  const lastKey = keys[keys.length - 1]
  let acc = 0
  for (const k of keys) {
    if (k === lastKey) break
    const raw = t * ((weightsByKey[k] ?? 0) / sumW)
    const v = roundFixed(raw, decimals)
    out[k] = v
    acc = roundFixed(acc + v, decimals)
  }
  out[lastKey] = roundFixed(t - acc, decimals)
  return out
}

function defaultQtyDisplay(line: BillOfMaterialLine, orderQty: number): number {
  return roundFixed(Number(line.quantity) * Number(orderQty), 6)
}

function bomLineComponentItem(line: BillOfMaterialLine): Item | undefined {
  return line.componentItem ?? line.component_item
}

type ProductionExpenseFormRow = {
  expense_account_id: number | null
  description: string
  amount: number
}

function emptyProductionExpenseRow(): ProductionExpenseFormRow {
  return { expense_account_id: null, description: '', amount: 0 }
}

export default function ProductionOrderForm() {
  const { currentTenant } = useAuth()
  const { t, lang, getDisplayName, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const navigate = useNavigate()
  const { id } = useParams()
  const queryClient = useQueryClient()
  const isCreate = !id
  const orderId = id ? parseInt(id, 10) : 0

  const [number, setNumber] = useState('')
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [finishedItemId, setFinishedItemId] = useState<number | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [billOfMaterialId, setBillOfMaterialId] = useState<number | null>(null)
  const [rawWarehouseId, setRawWarehouseId] = useState<number | null>(null)
  const [finishedWarehouseId, setFinishedWarehouseId] = useState<number | null>(null)
  const [branchId, setBranchId] = useState<number | null>(null)
  const [costCenterId, setCostCenterId] = useState<number | null>(null)
  const [expenseRows, setExpenseRows] = useState<ProductionExpenseFormRow[]>([emptyProductionExpenseRow()])
  const [notes, setNotes] = useState('')
  /** كمية العرض الإجمالية لكل سطر BOM؛ غياب المفتاح = الافتراضي من BOM × الكمية */
  const [lineOverrideQty, setLineOverrideQty] = useState<Record<number, number>>({})
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [barcodeGenerated, setBarcodeGenerated] = useState<string | null>(null)
  const [approveBusy, setApproveBusy] = useState(false)

  const { data: settings } = useQuery<TenantSettings>({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const amountDecimals = coerceDecimalPlaces(settings?.doc_amount_decimals, 2)
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const fmt = (n: number) => formatAmount(Number(n), { decimal_places: amountDecimals }, locale)

  const { data: nextNum } = useQuery({
    queryKey: ['production-orders-next', tenantId],
    queryFn: () => fetchProductionOrdersNextNumber(tenantId),
    enabled: !!tenantId && isCreate,
  })
  useEffect(() => {
    if (isCreate && nextNum) setNumber(nextNum)
  }, [isCreate, nextNum])

  const { data: order, isLoading: orderLoading } = useQuery<ProductionOrder>({
    queryKey: ['production-order', tenantId, orderId],
    queryFn: () => fetchProductionOrder(tenantId, orderId),
    enabled: !!tenantId && !isCreate && orderId > 0,
  })

  useDocumentTitle(
    isCreate
      ? lang === 'ar'
        ? 'إضافة أمر إنتاج'
        : 'Add production order'
      : lang === 'ar'
        ? `أمر إنتاج ${order?.number ?? `#${orderId}`}`
        : `Production order ${order?.number ?? `#${orderId}`}`,
  )

  useEffect(() => {
    if (!order) return
    setNumber(order.number)
    setOrderDate(order.order_date.slice(0, 10))
    setFinishedItemId(order.finished_item_id)
    setQuantity(Number(order.quantity))
    setBillOfMaterialId(order.bill_of_material_id)
    setRawWarehouseId(order.raw_warehouse_id ?? null)
    setFinishedWarehouseId(order.finished_warehouse_id ?? null)
    setBranchId(order.branch_id ?? null)
    setCostCenterId(order.cost_center_id ?? null)
    setNotes(order.notes ?? '')
    const rawExp: ProductionOrderExpense[] = order.expenses ?? []
    if (rawExp.length > 0) {
      setExpenseRows(
        rawExp.map((e) => ({
          expense_account_id: e.expense_account_id,
          description: e.description ?? '',
          amount: Number(e.amount) || 0,
        })),
      )
    } else {
      setExpenseRows([emptyProductionExpenseRow()])
    }
    const fb = order.finished_item?.barcode ?? order.finishedItem?.barcode
    if (fb) setBarcodeGenerated(fb)

    const nextOverrides: Record<number, number> = {}
    const raw = order.line_overrides
    if (Array.isArray(raw)) {
      for (const r of raw as { bom_line_id?: number; qty_display?: number }[]) {
        if (r && typeof r.bom_line_id === 'number' && typeof r.qty_display === 'number') {
          nextOverrides[r.bom_line_id] = Number(r.qty_display)
        }
      }
    }
    setLineOverrideQty(nextOverrides)
  }, [order])

  const { data: bomsData } = useQuery<PaginatedResponse<BillOfMaterial>>({
    queryKey: ['boms', tenantId],
    queryFn: () => fetchBoms(tenantId),
    enabled: !!tenantId,
  })
  const boms = bomsData?.data ?? []
  const bomsForItem = finishedItemId ? boms.filter((b) => b.finished_item_id === finishedItemId) : []

  useEffect(() => {
    if (finishedItemId && bomsForItem.length === 1) setBillOfMaterialId(bomsForItem[0].id)
    else if (finishedItemId && !bomsForItem.some((b) => b.id === billOfMaterialId)) setBillOfMaterialId(bomsForItem[0]?.id ?? null)
  }, [finishedItemId, bomsForItem, billOfMaterialId])

  const { data: bomDetail, isLoading: bomLoading } = useQuery<BillOfMaterial>({
    queryKey: ['bom', tenantId, billOfMaterialId, rawWarehouseId],
    queryFn: () =>
      fetchBom(tenantId, billOfMaterialId!, rawWarehouseId ? { warehouse_id: String(rawWarehouseId) } : undefined),
    enabled: !!tenantId && !!billOfMaterialId,
  })

  useEffect(() => {
    if (!bomDetail?.lines?.length) return
    const validIds = new Set(
      bomDetail.lines.map((l) => l.id).filter((x): x is number => typeof x === 'number'),
    )
    setLineOverrideQty((prev) => {
      const next: Record<number, number> = {}
      for (const [k, v] of Object.entries(prev)) {
        const id = Number(k)
        if (validIds.has(id)) next[id] = v
      }
      const same =
        Object.keys(prev).length === Object.keys(next).length &&
        Object.keys(next).every((k) => prev[Number(k)] === next[Number(k)])
      return same ? prev : next
    })
  }, [bomDetail])

  const { data: itemsData } = useQuery<PaginatedResponse<Item>>({
    queryKey: ['items', tenantId],
    queryFn: () => fetchItems(tenantId, { per_page: '500' }),
    enabled: !!tenantId,
  })
  const items = itemsData?.data ?? []

  const finishedItemOptions: SearchableSelectOption[] = useMemo(
    () => items.map((item) => ({ value: item.id, label: `${item.code ?? ''} — ${item.name}`.trim() })),
    [items],
  )

  const { data: warehousesResp } = useQuery<{ data?: Warehouse[] }>({
    queryKey: ['warehouses', tenantId],
    queryFn: () => fetchWarehouses(tenantId),
    enabled: !!tenantId,
  })
  const warehouses = toList<Warehouse>(warehousesResp)

  const { data: branchesData } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId,
  })
  const branches = toList<{ id: number; name: string }>(branchesData)

  const { data: costCenters = [] } = useQuery({
    queryKey: ['cost-centers', tenantId, 'production-order-form'],
    queryFn: () => fetchCostCenters(tenantId),
    enabled: !!tenantId,
  })

  const { data: postableAccounts = [] } = useQuery({
    queryKey: ['accounts', tenantId, 'production-order-postable'],
    queryFn: () => fetchAccounts(tenantId, { active_only: '1', postable_only: '1' }),
    enabled: !!tenantId,
  })

  const createMut = useMutation({
    mutationFn: (payload: Record<string, unknown>) => createProductionOrder(tenantId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['production-orders', tenantId] })
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (t.msg?.errorOccurred ?? 'حدث خطأ')
      setToast({ message: msg, type: 'error' })
    },
  })

  const updateMut = useMutation({
    mutationFn: (payload: Record<string, unknown>) => updateProductionOrder(tenantId, orderId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['production-orders', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['production-order', tenantId, orderId] })
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (t.msg?.errorOccurred ?? 'حدث خطأ')
      setToast({ message: msg, type: 'error' })
    },
  })

  const barcodeMut = useMutation({
    mutationFn: () => generateItemBarcode(tenantId, order!.finished_item_id),
    onSuccess: (data) => {
      setBarcodeGenerated(data.barcode)
      queryClient.invalidateQueries({ queryKey: ['production-order', tenantId, orderId] })
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'فشل توليد الباركود'
      setToast({ message: msg, type: 'error' })
    },
  })

  const isDraft = order?.status === 'draft'
  const isApproved = order?.status === 'approved' || order?.status === 'completed'

  const effectiveQtyDisplay = useCallback(
    (line: BillOfMaterialLine) => {
      const lid = line.id
      if (lid == null) return defaultQtyDisplay(line, quantity)
      const d = defaultQtyDisplay(line, quantity)
      if (lineOverrideQty[lid] != null && Number.isFinite(lineOverrideQty[lid])) return lineOverrideQty[lid]!
      return d
    },
    [lineOverrideQty, quantity],
  )

  const tableRows = useMemo(() => {
    const lines = bomDetail?.lines ?? []
    return lines.map((line) => {
      const lid = line.id ?? 0
      const qtyD = effectiveQtyDisplay(line)
      const comp = bomLineComponentItem(line)
      const unitCost = Number(line.unit_cost ?? comp?.cost_price ?? 0)
      const materialLine = roundFixed(qtyD * unitCost, amountDecimals)
      return { line, lid, qtyD, unitCost, materialLine }
    })
  }, [bomDetail?.lines, effectiveQtyDisplay, amountDecimals])

  const weightsByLineId = useMemo(() => {
    const w: Record<number, number> = {}
    for (const r of tableRows) {
      if (r.lid > 0) w[r.lid] = Math.max(r.materialLine, 0.0000001)
    }
    return w
  }, [tableRows])

  const expensesSubtotal = useMemo(
    () => roundFixed(expenseRows.reduce((s, r) => s + (Number(r.amount) > 0 ? Number(r.amount) : 0), 0), amountDecimals),
    [expenseRows, amountDecimals],
  )

  const overheadAllocatedByLine = useMemo(
    () => allocateAmountByWeights(expensesSubtotal, weightsByLineId, amountDecimals),
    [expensesSubtotal, weightsByLineId, amountDecimals],
  )

  const materialsSubtotal = useMemo(
    () => roundFixed(tableRows.reduce((s, r) => s + r.materialLine, 0), amountDecimals),
    [tableRows, amountDecimals],
  )

  const overheadTotal = expensesSubtotal
  const grandTotal = roundFixed(materialsSubtotal + overheadTotal, amountDecimals)
  const finishedQty = Math.max(Number(quantity) || 0, 0.0000001)
  const unitCostFinished = roundFixed(grandTotal / finishedQty, amountDecimals)

  const buildPayload = useCallback((): Record<string, unknown> => {
    const lines = bomDetail?.lines ?? []
    const line_overrides = lines
      .filter((l): l is BillOfMaterialLine & { id: number } => typeof l.id === 'number')
      .map((l) => ({
        bom_line_id: l.id,
        qty_display: effectiveQtyDisplay(l),
      }))

    return {
      order_date: orderDate,
      finished_item_id: finishedItemId,
      quantity,
      bill_of_material_id: billOfMaterialId,
      raw_warehouse_id: rawWarehouseId,
      finished_warehouse_id: finishedWarehouseId ?? rawWarehouseId,
      branch_id: branchId,
      cost_center_id: costCenterId,
      expenses: expenseRows
        .filter((r) => Number(r.amount) > 0 && r.expense_account_id != null)
        .map((r) => ({
          expense_account_id: r.expense_account_id,
          description: r.description?.trim() || null,
          amount: roundFixed(Number(r.amount), amountDecimals),
        })),
      line_overrides,
      notes: notes || null,
    }
  }, [
    bomDetail?.lines,
    orderDate,
    finishedItemId,
    quantity,
    billOfMaterialId,
    rawWarehouseId,
    finishedWarehouseId,
    branchId,
    costCenterId,
    expenseRows,
    amountDecimals,
    notes,
    effectiveQtyDisplay,
  ])

  const validateBeforeSave = useCallback((): string | null => {
    if (!finishedItemId || !billOfMaterialId) return lang === 'ar' ? 'اختر المنتج النهائي وقائمة المواد (BOM).' : 'Select finished product and BOM.'
    if (quantity <= 0) return lang === 'ar' ? 'الكمية يجب أن تكون أكبر من صفر.' : 'Quantity must be greater than zero.'
    if (!bomDetail?.lines?.length) return lang === 'ar' ? 'لا توجد بنود في قائمة المواد.' : 'BOM has no lines.'
    for (const row of tableRows) {
      if (row.qtyD <= 0) return lang === 'ar' ? 'كميات المواد يجب أن تكون أكبر من صفر.' : 'Component quantities must be positive.'
    }
    for (const r of expenseRows) {
      const a = Number(r.amount) || 0
      if (a > 0 && (r.expense_account_id == null || r.expense_account_id <= 0)) {
        return lang === 'ar' ? 'اختر حساب المصروف لكل سطر مبلغه أكبر من صفر.' : 'Select an expense account for each row with an amount.'
      }
    }
    return null
  }, [finishedItemId, billOfMaterialId, quantity, bomDetail?.lines, tableRows, expenseRows, lang])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const err = validateBeforeSave()
    if (err) {
      setToast({ message: err, type: 'error' })
      return
    }
    const payload = buildPayload()
    try {
      if (isCreate) {
        const data = await createMut.mutateAsync(payload)
        navigate(`/manufacturing/production-orders/${data.id}`)
        setToast({ message: lang === 'ar' ? 'تم الحفظ.' : 'Saved.', type: 'success' })
      } else {
        await updateMut.mutateAsync(payload)
        setToast({ message: lang === 'ar' ? 'تم الحفظ.' : 'Saved.', type: 'success' })
      }
    } catch {
      /* toast from mutation */
    }
  }

  const handleApprove = async () => {
    const err = validateBeforeSave()
    if (err) {
      setToast({ message: err, type: 'error' })
      return
    }
    const payload = buildPayload()
    setApproveBusy(true)
    try {
      if (isCreate) {
        const data = await createProductionOrder(tenantId, payload)
        queryClient.invalidateQueries({ queryKey: ['production-orders', tenantId] })
        await approveProductionOrder(tenantId, data.id)
        setToast({ message: lang === 'ar' ? 'تم الحفظ والاعتماد.' : 'Saved and approved.', type: 'success' })
        navigate(`/manufacturing/production-orders/${data.id}`)
      } else {
        await updateProductionOrder(tenantId, orderId, payload)
        queryClient.invalidateQueries({ queryKey: ['production-order', tenantId, orderId] })
        await approveProductionOrder(tenantId, orderId)
        queryClient.invalidateQueries({ queryKey: ['production-orders', tenantId] })
        queryClient.invalidateQueries({ queryKey: ['production-order', tenantId, orderId] })
        setToast({ message: lang === 'ar' ? 'تم الاعتماد.' : 'Approved.', type: 'success' })
      }
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (t.msg?.errorOccurred ?? 'حدث خطأ')
      setToast({ message: msg, type: 'error' })
    } finally {
      setApproveBusy(false)
    }
  }

  if (!isCreate && orderLoading) {
    return (
      <div className="w-full max-w-full p-4 flex items-center justify-center">
        <span className="text-slate-500">{t.loading}</span>
      </div>
    )
  }

  const rtlFieldAlign = isRtl ? 'text-right' : 'text-left'

  const statusBadge = !isCreate && order && (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0 ${
        order.status === 'draft'
          ? 'bg-amber-100 text-amber-800'
          : order.status === 'approved'
            ? 'bg-blue-100 text-blue-800'
            : 'bg-emerald-100 text-emerald-800'
      }`}
    >
      {order.status === 'draft' ? 'مسودة' : order.status === 'approved' ? 'معتمد' : 'مكتمل'}
    </span>
  )

  const labelMaterials = lang === 'ar' ? 'المواد الخام (حسب الباقة)' : 'Raw materials (from BOM)'
  const labelQtyProduce = lang === 'ar' ? 'كمية الإنتاج' : 'Production quantity'
  const labelOverheadAlloc = lang === 'ar' ? 'حصة المصاريف' : 'Overhead share'
  const labelMatTotal = lang === 'ar' ? 'تكلفة الخام' : 'Material cost'
  const labelLineTotal = lang === 'ar' ? 'الإجمالي' : 'Line total'
  const labelStock = lang === 'ar' ? 'الرصيد' : 'Stock'
  const labelUnit = lang === 'ar' ? 'الوحدة' : 'Unit'
  const labelBomQty = lang === 'ar' ? 'لكل وحدة تامة' : 'Per finished unit'

  const stickyBtnBase =
    'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-50 disabled:pointer-events-none'
  const noNumberSpinner =
    '[appearance:textfield] [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'

  return (
    <div className="w-full max-w-full min-w-0 p-3 md:p-4 space-y-4">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => navigate('/manufacturing/production-orders')}
            className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 shrink-0"
            aria-label={t.cancel}
          >
            <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
          </button>
          <h1 className="text-lg font-bold text-slate-900 truncate">
            {isCreate ? (t.add ?? 'إضافة') : order?.number} — {t.nav?.productionOrders ?? 'أمر إنتاج'}
          </h1>
          {statusBadge}
        </div>
        {!isCreate && isApproved && (
          <div className="flex items-center gap-2 shrink-0">
            {barcodeGenerated ? (
              <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-mono">{barcodeGenerated}</span>
            ) : (
              <button
                type="button"
                onClick={() => barcodeMut.mutate()}
                disabled={barcodeMut.isPending}
                className="inline-flex items-center gap-1 rounded-xl bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              >
                <Barcode className="h-3.5 w-3.5" />
                توليد باركود
              </button>
            )}
          </div>
        )}
      </div>

      <form id="production-order-main-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 md:p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-4 gap-y-4">
            {!isCreate && (
              <div className="flex min-w-0 flex-col gap-1">
                <label className="text-sm font-medium text-slate-700">الرقم</label>
                <input type="text" value={number} readOnly className={FIELD_CONTROL_READ} />
              </div>
            )}
            <div className="flex min-w-0 flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">{t.date} *</label>
              <input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                disabled={!isDraft && !isCreate}
                className={`${FIELD_CONTROL} ${rtlFieldAlign}`}
                dir={isRtl ? 'rtl' : 'ltr'}
                required
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">{lang === 'ar' ? 'الفرع' : 'Branch'}</label>
              <select
                value={branchId ?? ''}
                onChange={(e) => setBranchId(e.target.value ? parseInt(e.target.value, 10) : null)}
                disabled={!isDraft && !isCreate}
                className={FIELD_CONTROL}
              >
                <option value="">{t.choose}</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">{lang === 'ar' ? 'مركز التكلفة' : 'Cost center'}</label>
              <select
                value={costCenterId ?? ''}
                onChange={(e) => setCostCenterId(e.target.value ? parseInt(e.target.value, 10) : null)}
                disabled={!isDraft && !isCreate}
                className={FIELD_CONTROL}
              >
                <option value="">{t.choose}</option>
                {costCenters.map((cc: CostCenter) => (
                  <option key={cc.id} value={cc.id}>
                    {getDisplayName({ name: cc.name, name_en: cc.name_en ?? null })}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-4 gap-y-4">
            <div className="flex min-w-0 flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">مخزن المواد الخام</label>
              <select
                value={rawWarehouseId ?? ''}
                onChange={(e) => setRawWarehouseId(e.target.value ? parseInt(e.target.value, 10) : null)}
                disabled={!isDraft && !isCreate}
                className={FIELD_CONTROL}
              >
                <option value="">{t.choose}</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code ?? ''} — {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">مخزن المنتج النهائي</label>
              <select
                value={finishedWarehouseId ?? ''}
                onChange={(e) => setFinishedWarehouseId(e.target.value ? parseInt(e.target.value, 10) : null)}
                disabled={!isDraft && !isCreate}
                className={FIELD_CONTROL}
              >
                <option value="">{lang === 'ar' ? 'نفس مخزن المواد' : 'Same as raw warehouse'}</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code ?? ''} — {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">الباقة (BOM) *</label>
              <select
                value={billOfMaterialId ?? ''}
                onChange={(e) => setBillOfMaterialId(e.target.value ? parseInt(e.target.value, 10) : null)}
                disabled={!isDraft && !isCreate}
                className={FIELD_CONTROL}
                required
              >
                <option value="">{t.choose}</option>
                {bomsForItem.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name ?? `BOM #${b.id}`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">{lang === 'ar' ? 'المنتج النهائي *' : 'Finished product *'}</label>
            <SearchableSelect
              options={finishedItemOptions}
              value={finishedItemId ?? null}
              onChange={(v) => setFinishedItemId(v === null || v === '' ? null : Number(v))}
              placeholder={t.choose}
              disabled={!isDraft && !isCreate}
              textAlign={isRtl ? 'right' : 'left'}
              matchTriggerWidth
              className="w-full min-w-0"
              inputClassName={FIELD_CONTROL}
            />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden w-full min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-50 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-800">{labelMaterials}</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-xs font-medium text-slate-600 whitespace-nowrap">{labelQtyProduce} *</label>
              <input
                type="number"
                min="0.0001"
                step="any"
                value={quantity === 0 ? '' : Number(quantity)}
                onChange={(e) => {
                  const v = parseFloat(e.target.value)
                  setQuantity(Number.isFinite(v) && v >= 0 ? v : 0)
                }}
                disabled={!isDraft && !isCreate}
                className={`h-10 w-32 rounded-xl border border-slate-300 bg-white px-3 text-sm tabular-nums text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500/20 focus:border-primary-500 disabled:bg-slate-100 ${noNumberSpinner}`}
                dir="ltr"
                required
              />
            </div>
          </div>
          {bomLoading ? (
            <div className="p-8 text-center text-slate-500 text-sm">{t.loading}</div>
          ) : !billOfMaterialId ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              {lang === 'ar' ? 'اختر المنتج النهائي وقائمة المواد لعرض الجدول.' : 'Select finished product and BOM to load the table.'}
            </div>
          ) : (
            <div className="overflow-x-auto w-full">
              <table className="w-full text-sm min-w-[720px] border-collapse table-fixed">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 text-xs border-b border-slate-200">
                    <th className={`${isRtl ? 'text-right' : 'text-left'} px-3 py-2.5 font-semibold w-[22%]`}>
                      {lang === 'ar' ? 'الصنف' : 'Item'}
                    </th>
                    <th className="px-3 py-2.5 font-semibold text-end w-[10%] tabular-nums">{labelBomQty}</th>
                    <th className="px-3 py-2.5 font-semibold text-end w-[12%] tabular-nums">
                      {lang === 'ar' ? 'الكمية المطلوبة' : 'Qty required'}
                    </th>
                    <th className={`${isRtl ? 'text-right' : 'text-left'} px-3 py-2.5 font-semibold w-[10%]`}>{labelUnit}</th>
                    <th className="px-3 py-2.5 font-semibold text-end w-[10%] tabular-nums">{labelStock}</th>
                    <th className="px-3 py-2.5 font-semibold text-end w-[11%] tabular-nums">
                      {lang === 'ar' ? 'تكلفة الوحدة' : 'Unit cost'}
                    </th>
                    <th className="px-3 py-2.5 font-semibold text-end w-[11%] tabular-nums">{labelMatTotal}</th>
                    <th className="px-3 py-2.5 font-semibold text-end w-[11%] tabular-nums">{labelOverheadAlloc}</th>
                    <th className="px-3 py-2.5 font-semibold text-end w-[11%] tabular-nums">{labelLineTotal}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tableRows.map(({ line, lid, qtyD, unitCost, materialLine }) => {
                    const item = bomLineComponentItem(line)
                    const name = item
                      ? `${item.code ? `${item.code} — ` : ''}${item.name}`.trim()
                      : `#${line.component_item_id}`
                    const unitName = line.unit?.name ?? item?.unit ?? '—'
                    const stock = line.current_stock
                    const oh = lid > 0 ? overheadAllocatedByLine[lid] ?? 0 : 0
                    const lineTot = roundFixed(materialLine + oh, amountDecimals)
                    return (
                      <tr key={lid || line.component_item_id} className="bg-white hover:bg-slate-50/60">
                        <td className={`px-3 py-2 align-middle ${isRtl ? 'text-right' : 'text-left'} text-slate-900`}>{name}</td>
                        <td className="px-3 py-2 align-middle text-end tabular-nums text-slate-600">{Number(line.quantity)}</td>
                        <td className="px-3 py-2 align-middle text-end">
                          <input
                            type="number"
                            min="0.0000001"
                            step="any"
                            value={qtyD === 0 ? '' : qtyD}
                            disabled={!isDraft && !isCreate || lid <= 0}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value)
                              if (!Number.isFinite(v) || v <= 0) return
                              if (lid > 0) setLineOverrideQty((prev) => ({ ...prev, [lid]: v }))
                            }}
                            className={`w-full min-w-0 max-w-[8.5rem] ms-auto rounded-lg border border-slate-300 px-2 py-1.5 text-sm tabular-nums text-end disabled:bg-slate-100 ${noNumberSpinner}`}
                            dir="ltr"
                          />
                        </td>
                        <td className={`px-3 py-2 align-middle text-slate-600 ${isRtl ? 'text-right' : 'text-left'}`}>{unitName}</td>
                        <td className="px-3 py-2 align-middle text-end tabular-nums text-slate-600">
                          {stock != null && Number.isFinite(Number(stock)) ? Number(stock) : '—'}
                        </td>
                        <td className="px-3 py-2 align-middle text-end tabular-nums text-slate-700">{fmt(unitCost)}</td>
                        <td className="px-3 py-2 align-middle text-end tabular-nums font-medium text-slate-800">{fmt(materialLine)}</td>
                        <td className="px-3 py-2 align-middle text-end tabular-nums text-violet-800">{fmt(oh)}</td>
                        <td className="px-3 py-2 align-middle text-end tabular-nums font-semibold text-slate-900">{fmt(lineTot)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                {tableRows.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-50 border-t-2 border-slate-200 text-slate-800 font-semibold">
                      <td colSpan={6} className={`px-3 py-2.5 ${isRtl ? 'text-right' : 'text-left'} text-sm`}>
                        {lang === 'ar' ? 'الإجماليات' : 'Totals'}
                      </td>
                      <td className="px-3 py-2.5 text-end tabular-nums">{fmt(materialsSubtotal)}</td>
                      <td className="px-3 py-2.5 text-end tabular-nums text-violet-900">{fmt(overheadTotal)}</td>
                      <td className="px-3 py-2.5 text-end tabular-nums">{fmt(grandTotal)}</td>
                    </tr>
                    <tr className="bg-white border-t border-slate-100">
                      <td colSpan={7} className={`px-3 py-2 text-xs text-slate-600 ${isRtl ? 'text-right' : 'text-left'}`}>
                        {lang === 'ar' ? 'تكلفة المنتج التام للكمية المحددة (تقديري قبل الاعتماد)' : 'Finished cost for this quantity (estimate before approval)'}
                      </td>
                      <td colSpan={2} className="px-3 py-2 text-end text-sm font-bold text-primary-800 tabular-nums">
                        {fmt(unitCostFinished)} / {lang === 'ar' ? 'وحدة' : 'unit'}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>

        {(isCreate || isDraft) && (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden w-full min-w-0">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-800">
                {lang === 'ar' ? 'مصاريف تصنيع إضافية' : 'Additional manufacturing expenses'}
              </h2>
            </div>
            <div className="overflow-x-auto w-full">
              <table className="w-full text-sm min-w-[640px] border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 text-xs border-b border-slate-200">
                    <th className={`${isRtl ? 'text-right' : 'text-left'} px-3 py-2.5 font-semibold min-w-[14rem]`}>
                      {lang === 'ar' ? 'حساب المصروف' : 'Expense account'}
                    </th>
                    <th className={`${isRtl ? 'text-right' : 'text-left'} px-3 py-2.5 font-semibold min-w-[12rem]`}>
                      {lang === 'ar' ? 'البيان' : 'Description'}
                    </th>
                    <th className="px-3 py-2.5 font-semibold text-end w-[10rem] tabular-nums">{lang === 'ar' ? 'المبلغ' : 'Amount'}</th>
                    <th className="w-12 px-2 py-2.5" aria-label="del" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {expenseRows.map((row, idx) => (
                    <tr key={idx} className="bg-white hover:bg-slate-50/60">
                      <td className="px-3 py-2 align-middle">
                        <AccountSearchSelect
                          value={row.expense_account_id}
                          accounts={postableAccounts as Account[]}
                          onChange={(id) =>
                            setExpenseRows((prev) => prev.map((r, j) => (j === idx ? { ...r, expense_account_id: id } : r)))
                          }
                          placeholder={lang === 'ar' ? 'حساب المصروف' : 'Expense account'}
                          allowEmpty
                          disabled={!isDraft && !isCreate}
                          className="min-w-0"
                          inputClassName={`${FIELD_CONTROL} text-sm`}
                        />
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <input
                          type="text"
                          value={row.description}
                          onChange={(e) =>
                            setExpenseRows((prev) => prev.map((r, j) => (j === idx ? { ...r, description: e.target.value } : r)))
                          }
                          disabled={!isDraft && !isCreate}
                          className={FIELD_CONTROL}
                          placeholder={lang === 'ar' ? 'البيان' : 'Description'}
                        />
                      </td>
                      <td className="px-3 py-2 align-middle text-end">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={row.amount === 0 ? '' : row.amount}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value)
                            setExpenseRows((prev) =>
                              prev.map((r, j) =>
                                j === idx ? { ...r, amount: Number.isFinite(v) && v >= 0 ? v : 0 } : r,
                              ),
                            )
                          }}
                          disabled={!isDraft && !isCreate}
                          className={`${FIELD_CONTROL} tabular-nums text-end max-w-[10rem] ms-auto ${noNumberSpinner}`}
                          dir="ltr"
                        />
                      </td>
                      <td className="px-2 py-2 align-middle text-center">
                        <button
                          type="button"
                          onClick={() => setExpenseRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, j) => j !== idx)))}
                          disabled={(!isDraft && !isCreate) || expenseRows.length <= 1}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-red-600 hover:bg-red-50 disabled:opacity-30"
                          aria-label={lang === 'ar' ? 'حذف السطر' : 'Remove row'}
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 bg-slate-50/80">
              <button
                type="button"
                onClick={() => setExpenseRows((prev) => [...prev, emptyProductionExpenseRow()])}
                disabled={!isDraft && !isCreate}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-primary-700 hover:bg-primary-50 disabled:opacity-50"
              >
                <Plus size={16} strokeWidth={2.25} />
                {lang === 'ar' ? 'إضافة مصروف' : 'Add expense'}
              </button>
              <div className="text-sm font-semibold text-slate-800 tabular-nums">
                {lang === 'ar' ? 'المجموع' : 'Total'}: {fmt(expensesSubtotal)}
              </div>
            </div>
          </div>
        )}

        {isApproved && order?.expenses && order.expenses.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden w-full min-w-0">
            <h3 className="px-4 py-3 bg-slate-100 border-b border-slate-200 text-sm font-semibold text-slate-800">
              {lang === 'ar' ? 'مصاريف التصنيع (مرحّلة)' : 'Posted manufacturing expenses'}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[480px] border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5 text-right font-semibold text-slate-700">{lang === 'ar' ? 'الحساب' : 'Account'}</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-slate-700">{lang === 'ar' ? 'البيان' : 'Description'}</th>
                    <th className="px-4 py-2.5 text-end font-semibold text-slate-700">{lang === 'ar' ? 'المبلغ' : 'Amount'}</th>
                    <th className="px-4 py-2.5 text-end font-semibold text-slate-700">{lang === 'ar' ? 'القيد' : 'Entry'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {order.expenses.map((ex) => (
                    <tr key={ex.id}>
                      <td className="px-4 py-2 text-slate-900">
                        {ex.expenseAccount?.code ?? ex.expense_account?.code ?? '—'}{' '}
                        {ex.expenseAccount?.name ?? ex.expense_account?.name ?? ''}
                      </td>
                      <td className="px-4 py-2 text-slate-600">{ex.description ?? '—'}</td>
                      <td className="px-4 py-2 text-end tabular-nums">{fmt(Number(ex.amount))}</td>
                      <td className="px-4 py-2 text-end text-xs font-mono text-slate-600">
                        {(ex.journalEntry ?? ex.journal_entry)?.number ?? (ex.journal_entry_id ? `#${ex.journal_entry_id}` : '—')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-col gap-1">
          <label className="text-sm font-medium text-slate-700">{t.notes}</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={!isDraft && !isCreate}
            rows={3}
            placeholder={lang === 'ar' ? 'ملاحظات إضافية...' : 'Additional notes...'}
            className="w-full min-h-[5rem] resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:ring-2 focus:ring-inset focus:ring-primary-500/20 focus:border-primary-500 disabled:cursor-not-allowed disabled:bg-slate-100"
          />
        </div>

        {(isCreate || isDraft) && (
          <div
            className={`rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden w-full min-w-0 ${
              isRtl ? 'rtl' : 'ltr'
            }`}
          >
            <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-4 bg-slate-50/80">
              <button
                type="button"
                onClick={() => navigate('/manufacturing/production-orders')}
                className={`${stickyBtnBase} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-slate-400`}
              >
                <XCircle className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={2.25} />
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={() => void handleApprove()}
                disabled={approveBusy || createMut.isPending || updateMut.isPending}
                className={`${stickyBtnBase} bg-emerald-600 text-white hover:bg-emerald-500 focus-visible:ring-emerald-500`}
              >
                <CheckCircle className="h-4 w-4 shrink-0" strokeWidth={2.25} />
                {lang === 'ar' ? 'اعتماد' : 'Approve'}
              </button>
              <button
                type="submit"
                disabled={createMut.isPending || updateMut.isPending || approveBusy}
                className={`${stickyBtnBase} bg-primary-600 text-white hover:bg-primary-500 focus-visible:ring-primary-500`}
              >
                <Save className="h-4 w-4 shrink-0" strokeWidth={2.25} />
                {createMut.isPending || updateMut.isPending ? t.saving : t.save}
              </button>
            </div>
          </div>
        )}

        {isApproved && order?.materials && order.materials.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden w-full min-w-0">
            <h3 className="px-4 py-3 bg-slate-100 border-b border-slate-200 text-sm font-semibold text-slate-800">
              {lang === 'ar' ? 'المواد المستهلكة (عند الاعتماد)' : 'Materials consumed (posted)'}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[320px] border-collapse">
                <thead className="bg-slate-50 border-b-2 border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700 min-w-[140px]">
                      {lang === 'ar' ? 'الصنف' : 'Item'}
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700 min-w-[80px]">{lang === 'ar' ? 'الكمية' : 'Qty'}</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700 min-w-[100px]">
                      {lang === 'ar' ? 'التكلفة' : 'Cost'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {order.materials.map((m) => (
                    <tr key={m.id} className="bg-white hover:bg-slate-50/80 transition">
                      <td className="px-4 py-2.5 text-slate-900">{m.item?.name ?? m.item_id}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{Number(m.quantity_consumed)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmt(Number(m.total_cost))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t-2 border-slate-200 bg-slate-50 text-sm font-semibold text-slate-800 space-y-1">
              <div>
                {lang === 'ar' ? 'تكلفة الخامات' : 'Materials cost'}:{' '}
                <strong className="tabular-nums">{fmt(Number(order.total_cost) - Number(order.overhead_cost ?? 0))}</strong>
              </div>
              <div>
                {lang === 'ar' ? 'مصاريف إضافية' : 'Overhead'}:{' '}
                <strong className="tabular-nums">{fmt(Number(order.overhead_cost ?? 0))}</strong>
              </div>
              <div>
                {lang === 'ar' ? 'إجمالي التكلفة' : 'Total cost'}:{' '}
                <strong className="tabular-nums">{fmt(Number(order.total_cost))}</strong>
              </div>
            </div>
          </div>
        )}
      </form>
    </div>
  )
}
