import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import {
  fetchDisassemblyOrder,
  fetchDisassemblyOrdersNextNumber,
  fetchItems,
  fetchItem,
  fetchWarehouses,
  fetchBranches,
  fetchCostCenters,
  createDisassemblyOrder,
  updateDisassemblyOrder,
  confirmDisassemblyOrder,
  fetchSettings,
} from '../../api/tenant'
import type {
  CostCenter,
  DisassemblyOrder,
  DisassemblyOrderLine,
  DisassemblyOrderSourceLine,
  Item,
  TenantSettings,
  Warehouse,
} from '../../types'
import SearchableSelect, { type SearchableSelectOption } from '../../components/ui/SearchableSelect'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Toast, { type ToastType } from '../../components/ui/Toast'
import { formatAmount } from '../../utils/currency'
import { formatDisplayDate } from '../../utils/date'
import { ArrowDown, ArrowLeft, ArrowUp, CheckCircle, Copy, Plus, Save, Trash2, XCircle, Printer } from 'lucide-react'

const FIELD =
  'w-full h-10 min-h-[2.5rem] box-border rounded-lg border border-slate-300 bg-white px-3 py-0 text-sm leading-10 shadow-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-inset focus:ring-primary-500/20 disabled:bg-slate-100 disabled:cursor-not-allowed'

type SourceRow = {
  key: string
  item_id: number | null
  quantity: number
  unit_id: number | null
  unit_cost: number
  costManual: boolean
  notes: string
}

type OutputRow = SourceRow & {
  warehouse_id: number | null
  manualLineTotal: number | null
}

function emptySourceRow(): SourceRow {
  return {
    key: `${Date.now()}-${Math.random()}`,
    item_id: null,
    quantity: 1,
    unit_id: null,
    unit_cost: 0,
    costManual: false,
    notes: '',
  }
}

function emptyOutputRow(defaultWarehouseId: number | null = null): OutputRow {
  return { ...emptySourceRow(), warehouse_id: defaultWarehouseId, manualLineTotal: null }
}

function toList<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[]
  if (r && typeof r === 'object' && 'data' in (r as object)) return ((r as { data: unknown }).data as T[]) ?? []
  return []
}

function roundAmount(n: number, decimals: number): number {
  const f = 10 ** decimals
  return Math.round(n * f) / f
}

function lineTotal(qty: number, unitCost: number, decimals: number): number {
  return roundAmount(qty * unitCost, decimals)
}

function outputLineTotal(row: OutputRow, decimals: number): number {
  if (row.manualLineTotal != null && row.quantity > 0) {
    return roundAmount(row.manualLineTotal, decimals)
  }
  if (!row.item_id || row.quantity <= 0) return 0
  return lineTotal(row.quantity, row.unit_cost, decimals)
}

function outputRowWarehouseId(row: OutputRow, sourceWarehouseId: number | null): number | null {
  return row.warehouse_id ?? sourceWarehouseId
}

function isSavableOutputRow(row: OutputRow, sourceWarehouseId: number | null): boolean {
  return !!(row.item_id && row.quantity > 0 && outputRowWarehouseId(row, sourceWarehouseId))
}

function moveRow<T>(rows: T[], index: number, dir: -1 | 1): T[] {
  const target = index + dir
  if (target < 0 || target >= rows.length) return rows
  const next = [...rows]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

function itemUnitLabel(
  item: Item | undefined,
  getDisplayName: (x: { name: string; name_en?: string | null }) => string,
): string {
  if (!item) return '—'
  const u = item.item_unit
  if (u) return getDisplayName({ name: u.name, name_en: u.name_en ?? null })
  return item.unit || '—'
}

function quickItemCost(item: Item | undefined): number {
  if (!item) return 0
  if (item.average_cost != null && Number.isFinite(Number(item.average_cost))) {
    return Number(item.average_cost)
  }
  return Number(item.cost_price ?? 0)
}

async function resolveItemAverageCost(tenantId: number, itemId: number, warehouseId: number): Promise<number> {
  const detail = await fetchItem(tenantId, itemId, { warehouse_id: warehouseId })
  if (detail.average_cost != null) return Number(detail.average_cost)
  return Number(detail.cost_price ?? 0)
}

export default function DisassemblyOrderForm() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl, getDisplayName } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const navigate = useNavigate()
  const location = useLocation()
  const { id } = useParams()
  const queryClient = useQueryClient()
  const routeOrderId = id ? parseInt(id, 10) : 0
  const isEditMode = routeOrderId > 0 && !Number.isNaN(routeOrderId)
  const isNewOrder = !isEditMode
  const copyFrom = isNewOrder ? (location.state as { copyFrom?: DisassemblyOrder } | null)?.copyFrom : undefined
  const isCopySession = isNewOrder && !!copyFrom
  const [hydratedOrderId, setHydratedOrderId] = useState<number | 'create' | null>(null)

  const [number, setNumber] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [sourceWarehouseId, setSourceWarehouseId] = useState<number | null>(null)
  const [branchId, setBranchId] = useState<number | null>(null)
  const [costCenterId, setCostCenterId] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [sourceRows, setSourceRows] = useState<SourceRow[]>([emptySourceRow()])
  const [outputRows, setOutputRows] = useState<OutputRow[]>([emptyOutputRow()])
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [copyConfirmOpen, setCopyConfirmOpen] = useState(false)
  const [savedDraftId, setSavedDraftId] = useState<number | null>(null)
  const [confirmPending, setConfirmPending] = useState(false)

  const { data: settings } = useQuery<TenantSettings>({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const amountDecimals = Math.min(6, Math.max(0, Math.floor(Number(settings?.doc_amount_decimals ?? 2))))
  const fmt = (n: number) => formatAmount(n, { decimal_places: settings?.doc_amount_decimals ?? 2 }, locale)
  const textAlign = isRtl ? 'text-right' : 'text-left'
  const lineInputClass =
    'h-9 w-full rounded-md px-2.5 text-sm border border-slate-300 focus:ring-1 focus:ring-inset focus:ring-primary-500 outline-none bg-white'
  const lineInputNumberClass = `${lineInputClass} text-right tabular-nums input-no-spinner`
  const lineThClass = `${textAlign} px-2 py-3 font-medium`
  const lineTdClass = 'px-2 py-2 align-middle'
  const lineAmountCellClass = `${lineTdClass} text-right tabular-nums`

  const { data: nextNum } = useQuery({
    queryKey: ['disassembly-orders-next', tenantId],
    queryFn: () => fetchDisassemblyOrdersNextNumber(tenantId),
    enabled: !!tenantId && isNewOrder,
  })
  useEffect(() => {
    if (isNewOrder && nextNum) setNumber(nextNum.number)
  }, [isNewOrder, nextNum])

  const { data: order, isLoading } = useQuery<DisassemblyOrder>({
    queryKey: ['disassembly-order', tenantId, routeOrderId],
    queryFn: () => fetchDisassemblyOrder(tenantId, routeOrderId),
    enabled: !!tenantId && isEditMode,
  })

  useDocumentTitle(
    isNewOrder
      ? lang === 'ar' ? 'أمر تفكيك جديد' : 'New disassembly order'
      : lang === 'ar' ? `أمر تفكيك ${order?.number ?? ''}` : `Disassembly ${order?.number ?? ''}`,
  )

  const orderStatus = order?.status
  const isDraft = isNewOrder || orderStatus === 'draft'
  const isReadOnly = isEditMode && orderStatus !== 'draft'
  const sourceColumnCount = isDraft ? 6 : 5
  const outputColumnCount = isDraft ? 7 : 6

  const hydrateFromOrder = useCallback((data: DisassemblyOrder) => {
    setNumber(data.number)
    setDate(data.date.slice(0, 10))
    setSourceWarehouseId(data.warehouse_id)
    setBranchId(data.branch_id ?? null)
    setCostCenterId(data.cost_center_id ?? null)
    setNotes(data.notes ?? '')

    const rawSource = data.sourceLines ?? data.source_lines
    if (rawSource && rawSource.length > 0) {
      setSourceRows(
        rawSource.map((ln: DisassemblyOrderSourceLine) => ({
          key: `src-${ln.id ?? Math.random()}`,
          item_id: ln.item_id,
          quantity: Number(ln.quantity),
          unit_id: ln.unit_id ?? null,
          unit_cost: Number(ln.unit_cost ?? 0),
          costManual: true,
          notes: ln.notes ?? '',
        })),
      )
    } else if (data.item_id) {
      setSourceRows([
        {
          key: 'legacy-source',
          item_id: data.item_id,
          quantity: Number(data.quantity),
          unit_id: null,
          unit_cost: Number(data.unit_cost ?? 0),
          costManual: true,
          notes: '',
        },
      ])
    }

    const lines = data.lines ?? []
    if (lines.length > 0) {
      setOutputRows(
        lines.map((ln: DisassemblyOrderLine) => ({
          key: `ln-${ln.id ?? Math.random()}`,
          item_id: ln.item_id,
          warehouse_id: ln.warehouse_id,
          quantity: Number(ln.quantity),
          unit_id: ln.unit_id ?? null,
          unit_cost: Number(ln.unit_cost ?? 0),
          costManual: true,
          manualLineTotal: null,
          notes: ln.notes ?? '',
        })),
      )
    }
  }, [])

  const copyAsNewDraft = useCallback(() => {
    if (!order) return
    navigate('/manufacturing/disassembly-orders/create', { state: { copyFrom: order }, replace: false })
  }, [order, navigate])

  useEffect(() => {
    setHydratedOrderId(null)
  }, [routeOrderId])

  useEffect(() => {
    if (isNewOrder) setSavedDraftId(null)
  }, [isNewOrder])

  useEffect(() => {
    if (isNewOrder && copyFrom && hydratedOrderId !== 'create') {
      hydrateFromOrder(copyFrom)
      setHydratedOrderId('create')
      return
    }
    if (order && order.id !== hydratedOrderId) {
      hydrateFromOrder(order)
      setHydratedOrderId(order.id)
    }
  }, [isNewOrder, copyFrom, order, hydratedOrderId, hydrateFromOrder])

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

  const { data: branchesRaw } = useQuery({
    queryKey: ['branches', tenantId, 'disassembly-form'],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId,
  })
  const branches = useMemo(() => toList<{ id: number; name: string }>(branchesRaw), [branchesRaw])

  const { data: costCenters = [] } = useQuery({
    queryKey: ['cost-centers', tenantId, 'disassembly-form'],
    queryFn: () => fetchCostCenters(tenantId),
    enabled: !!tenantId,
  })

  useEffect(() => {
    if (isNewOrder && warehouses.length === 1 && !sourceWarehouseId) {
      setSourceWarehouseId(warehouses[0].id)
      setOutputRows((rows) => rows.map((r) => (r.warehouse_id ? r : { ...r, warehouse_id: warehouses[0].id })))
    }
  }, [isNewOrder, warehouses, sourceWarehouseId])

  useEffect(() => {
    if (!sourceWarehouseId || isReadOnly) return
    setOutputRows((rows) =>
      rows.map((r) => (r.warehouse_id ? r : { ...r, warehouse_id: sourceWarehouseId })),
    )
  }, [sourceWarehouseId, isReadOnly])

  const applySourceAverageCost = useCallback(
    async (key: string, itemId: number) => {
      const item = items.find((i) => i.id === itemId)
      const quick = roundAmount(quickItemCost(item), amountDecimals)
      setSourceRows((rows) =>
        rows.map((r) => (r.key === key && !r.costManual ? { ...r, unit_cost: quick } : r)),
      )
      if (!sourceWarehouseId) return
      try {
        const avg = roundAmount(await resolveItemAverageCost(tenantId, itemId, sourceWarehouseId), amountDecimals)
        setSourceRows((rows) =>
          rows.map((r) => (r.key === key && !r.costManual ? { ...r, unit_cost: avg } : r)),
        )
      } catch {
        /* keep quick cost */
      }
    },
    [tenantId, sourceWarehouseId, items, amountDecimals],
  )

  const applyOutputAverageCost = useCallback(
    async (key: string, itemId: number, warehouseId: number) => {
      const item = items.find((i) => i.id === itemId)
      const quick = roundAmount(quickItemCost(item), amountDecimals)
      setOutputRows((rows) =>
        rows.map((r) => (r.key === key && !r.costManual ? { ...r, unit_cost: quick, manualLineTotal: null } : r)),
      )
      try {
        const avg = roundAmount(await resolveItemAverageCost(tenantId, itemId, warehouseId), amountDecimals)
        setOutputRows((rows) =>
          rows.map((r) => (r.key === key && !r.costManual ? { ...r, unit_cost: avg, manualLineTotal: null } : r)),
        )
      } catch {
        /* keep quick cost */
      }
    },
    [tenantId, items, amountDecimals],
  )

  const onSourceItemChange = useCallback(
    (key: string, itemId: number | null) => {
      if (!itemId) {
        setSourceRows((rows) =>
          rows.map((r) => (r.key === key ? { ...r, item_id: null, unit_cost: 0, costManual: false } : r)),
        )
        return
      }
      setSourceRows((rows) =>
        rows.map((r) => (r.key === key ? { ...r, item_id: itemId, costManual: false } : r)),
      )
      void applySourceAverageCost(key, itemId)
    },
    [applySourceAverageCost],
  )

  const onOutputItemChange = useCallback(
    (key: string, itemId: number | null, warehouseId: number | null) => {
      if (!itemId) {
        setOutputRows((rows) =>
          rows.map((r) =>
            r.key === key ? { ...r, item_id: null, unit_cost: 0, costManual: false, manualLineTotal: null } : r,
          ),
        )
        return
      }
      setOutputRows((rows) =>
        rows.map((r) =>
          r.key === key
            ? {
                ...r,
                item_id: itemId,
                costManual: false,
                manualLineTotal: null,
                warehouse_id: r.warehouse_id ?? warehouseId ?? sourceWarehouseId,
              }
            : r,
        ),
      )
      const wh = warehouseId ?? sourceWarehouseId
      if (wh) void applyOutputAverageCost(key, itemId, wh)
      else {
        const item = items.find((i) => i.id === itemId)
        setOutputRows((rows) =>
          rows.map((r) =>
            r.key === key && !r.costManual
              ? { ...r, unit_cost: roundAmount(quickItemCost(item), amountDecimals) }
              : r,
          ),
        )
      }
    },
    [applyOutputAverageCost, sourceWarehouseId, items, amountDecimals],
  )

  useEffect(() => {
    if (!sourceWarehouseId || isReadOnly) return
    sourceRows.forEach((row) => {
      if (row.item_id && !row.costManual) {
        void applySourceAverageCost(row.key, row.item_id)
      }
    })
  }, [sourceWarehouseId]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const sourceTotalsSum = useMemo(
    () =>
      roundAmount(
        sourceRows.reduce((s, row) => {
          if (!row.item_id || row.quantity <= 0) return s
          return s + lineTotal(row.quantity, row.unit_cost, amountDecimals)
        }, 0),
        amountDecimals,
      ),
    [sourceRows, amountDecimals],
  )

  const outputTotalsSum = useMemo(
    () =>
      roundAmount(
        outputRows.reduce((s, row) => {
          if (!isSavableOutputRow(row, sourceWarehouseId)) return s
          return s + outputLineTotal(row, amountDecimals)
        }, 0),
        amountDecimals,
      ),
    [outputRows, amountDecimals, sourceWarehouseId],
  )

  const totalsMismatch = useMemo(() => {
    const hasSource = sourceRows.some((r) => r.item_id && r.quantity > 0)
    const hasOutput = outputRows.some((r) => isSavableOutputRow(r, sourceWarehouseId))
    if (!hasSource || !hasOutput) return false
    return Math.abs(outputTotalsSum - sourceTotalsSum) > 10 ** (-amountDecimals)
  }, [sourceRows, outputRows, outputTotalsSum, sourceTotalsSum, amountDecimals, sourceWarehouseId])

  const validateBeforeSave = useCallback((): string | null => {
    if (!sourceWarehouseId) {
      return lang === 'ar' ? 'اختر مستودع مصدر التفكيك' : 'Select source warehouse'
    }
    const validSource = sourceRows.filter((r) => r.item_id && r.quantity > 0)
    if (validSource.length === 0) {
      return lang === 'ar' ? 'أضف صنفاً واحداً على الأقل للتفكيك' : 'Add at least one source item'
    }
    const outputWithItems = outputRows.filter((r) => r.item_id && r.quantity > 0)
    const missingWarehouse = outputWithItems.filter((r) => !outputRowWarehouseId(r, sourceWarehouseId))
    if (missingWarehouse.length > 0) {
      return lang === 'ar' ? 'اختر المستودع لكل الأصناف الناتجة' : 'Select warehouse for every output item'
    }
    const validOutput = outputRows.filter((r) => isSavableOutputRow(r, sourceWarehouseId))
    if (validOutput.length === 0) {
      return lang === 'ar' ? 'أضف صنفاً ناتجاً واحداً على الأقل مع المستودع' : 'Add at least one output item with warehouse'
    }
    if (totalsMismatch) {
      return lang === 'ar'
        ? `مجموع تكلفة الأصناف الناتجة (${fmt(outputTotalsSum)}) يجب أن يساوي مجموع تكلفة الأصناف المفككة (${fmt(sourceTotalsSum)})`
        : `Output total (${fmt(outputTotalsSum)}) must equal source total (${fmt(sourceTotalsSum)})`
    }
    return null
  }, [sourceWarehouseId, sourceRows, outputRows, totalsMismatch, outputTotalsSum, sourceTotalsSum, fmt, lang])

  const buildPayload = useCallback(() => {
    const source_lines = sourceRows
      .filter((r) => r.item_id && r.quantity > 0)
      .map((r) => ({
        item_id: r.item_id,
        quantity: r.quantity,
        unit_id: r.unit_id,
        unit_cost: r.unit_cost,
        total_cost: lineTotal(r.quantity, r.unit_cost, amountDecimals),
        notes: r.notes || null,
      }))
    const lines = outputRows
      .filter((r) => isSavableOutputRow(r, sourceWarehouseId))
      .map((r) => ({
        item_id: r.item_id,
        warehouse_id: outputRowWarehouseId(r, sourceWarehouseId)!,
        quantity: r.quantity,
        unit_id: r.unit_id,
        unit_cost: r.unit_cost,
        total_cost: outputLineTotal(r, amountDecimals),
        notes: r.notes || null,
      }))
    return {
      warehouse_id: sourceWarehouseId,
      branch_id: branchId,
      cost_center_id: costCenterId,
      date,
      notes: notes || null,
      source_lines,
      lines,
    }
  }, [sourceRows, outputRows, sourceWarehouseId, branchId, costCenterId, date, notes, amountDecimals])

  const persistDraftOrder = useCallback(async (): Promise<number> => {
    const validationError = validateBeforeSave()
    if (validationError) throw new Error(validationError)
    const payload = buildPayload()
    if (isEditMode) {
      await updateDisassemblyOrder(tenantId, routeOrderId, payload)
      return routeOrderId
    }
    if (savedDraftId) {
      await updateDisassemblyOrder(tenantId, savedDraftId, payload)
      return savedDraftId
    }
    const saved = await createDisassemblyOrder(tenantId, payload)
    setSavedDraftId(saved.id)
    return saved.id
  }, [validateBeforeSave, buildPayload, isEditMode, routeOrderId, savedDraftId, tenantId])

  const saveMut = useMutation({
    mutationFn: persistDraftOrder,
    onSuccess: async () => {
      setToast({ message: lang === 'ar' ? 'تم الحفظ' : 'Saved', type: 'success' })
      await queryClient.invalidateQueries({ queryKey: ['disassembly-orders', tenantId] })
      navigate('/manufacturing/disassembly-orders', { replace: true })
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? (err instanceof Error ? err.message : t.msg?.errorOccurred ?? 'Error')
      setToast({ message: msg, type: 'error' })
    },
  })

  const handleSave = () => {
    if (saveMut.isPending || confirmPending) return
    saveMut.mutate()
  }

  const handleConfirmFlow = async () => {
    if (saveMut.isPending || confirmPending) return
    setConfirmPending(true)
    let orderId: number | null = null
    try {
      orderId = await persistDraftOrder()
      await confirmDisassemblyOrder(tenantId, orderId)
      setConfirmOpen(false)
      setToast({ message: lang === 'ar' ? 'تم تنفيذ التفكيك' : 'Completed', type: 'success' })
      await queryClient.invalidateQueries({ queryKey: ['disassembly-orders', tenantId] })
      navigate('/manufacturing/disassembly-orders', { replace: true })
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? (err instanceof Error ? err.message : t.msg?.errorOccurred ?? 'Error')
      setToast({ message: msg, type: 'error' })
      setConfirmOpen(false)
      if (orderId && isNewOrder) {
        navigate(`/manufacturing/disassembly-orders/${orderId}`, { replace: true })
      }
    } finally {
      setConfirmPending(false)
    }
  }

  const confirmMessage = useMemo(
    () =>
      lang === 'ar'
        ? 'سيتم خصم الأصناف المفككة وإضافة الأصناف الناتجة للمخزون. هل تريد المتابعة؟'
        : 'Source items will be deducted and output items added to stock. Continue?',
    [lang],
  )

  const statusLabel = (s: string) => {
    if (s === 'draft') return lang === 'ar' ? 'مسودة' : 'Draft'
    if (s === 'completed') return lang === 'ar' ? 'مكتمل' : 'Completed'
    if (s === 'cancelled') return lang === 'ar' ? 'ملغى' : 'Cancelled'
    return s
  }

  const statusBadgeClass = (s: string) => {
    if (s === 'draft') return 'bg-amber-100 text-amber-800'
    if (s === 'completed') return 'bg-emerald-100 text-emerald-800'
    if (s === 'cancelled') return 'bg-slate-200 text-slate-700'
    return 'bg-slate-100 text-slate-700'
  }

  const costCenterReadLabel = useMemo(() => {
    if (order?.costCenter || order?.cost_center) {
      const cc = order.costCenter ?? order.cost_center!
      return getDisplayName({ name: cc.name, name_en: cc.name_en ?? null })
    }
    const cc = costCenters.find((c: CostCenter) => c.id === costCenterId)
    return cc ? getDisplayName({ name: cc.name, name_en: cc.name_en ?? null }) : '—'
  }, [order, costCenters, costCenterId, getDisplayName])

  const printOrder = () => {
    if (!order) return
    const w = window.open('', '_blank')
    if (!w) return
    const src = (order.sourceLines ?? order.source_lines ?? []).map(
      (ln) =>
        `<tr><td>${ln.item?.name ?? ln.item_id}</td><td>${ln.quantity}</td><td>${ln.unit_cost != null ? fmt(Number(ln.unit_cost)) : '—'}</td><td>${ln.total_cost != null ? fmt(Number(ln.total_cost)) : '—'}</td></tr>`,
    ).join('')
    const lines = (order.lines ?? [])
      .map(
        (ln) =>
          `<tr><td>${ln.item?.name ?? ln.item_id}</td><td>${ln.quantity}</td><td>${ln.warehouse?.name ?? ''}</td><td>${ln.unit_cost != null ? fmt(Number(ln.unit_cost)) : '—'}</td><td>${ln.total_cost != null ? fmt(Number(ln.total_cost)) : '—'}</td></tr>`,
      )
      .join('')
    w.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>${order.number}</title>
      <style>body{font-family:Arial,sans-serif;padding:24px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ccc;padding:8px;text-align:right}th{background:#f5f5f5}</style></head><body>
      <h2>${lang === 'ar' ? 'أمر تفكيك' : 'Disassembly order'} — ${order.number}</h2>
      <p>${lang === 'ar' ? 'التاريخ' : 'Date'}: ${formatDisplayDate(order.date)}</p>
      <p>${lang === 'ar' ? 'الحالة' : 'Status'}: ${statusLabel(order.status)}</p>
      <h3>${lang === 'ar' ? 'الأصناف المفككة' : 'Source items'}</h3>
      <table><thead><tr><th>${lang === 'ar' ? 'الصنف' : 'Item'}</th><th>${lang === 'ar' ? 'الكمية' : 'Qty'}</th><th>${lang === 'ar' ? 'التكلفة' : 'Cost'}</th><th>${lang === 'ar' ? 'الإجمالي' : 'Total'}</th></tr></thead><tbody>${src || `<tr><td colspan="4">${order.item?.name ?? ''}</td></tr>`}</tbody></table>
      <h3>${lang === 'ar' ? 'الأصناف الناتجة' : 'Output items'}</h3>
      <table><thead><tr><th>${lang === 'ar' ? 'الصنف' : 'Item'}</th><th>${lang === 'ar' ? 'الكمية' : 'Qty'}</th><th>${lang === 'ar' ? 'المستودع' : 'Warehouse'}</th><th>${lang === 'ar' ? 'التكلفة' : 'Cost'}</th><th>${lang === 'ar' ? 'الإجمالي' : 'Total'}</th></tr></thead><tbody>${lines}</tbody></table>
      </body></html>`)
    w.document.close()
    w.print()
  }

  const stickyBtnBase =
    'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-50 disabled:pointer-events-none'

  const renderRowActions = (
    index: number,
    total: number,
    onMoveUp: () => void,
    onMoveDown: () => void,
    onDelete: () => void,
  ) => (
    <div className="flex items-center justify-center gap-1">
      <button
        type="button"
        disabled={index === 0}
        onClick={onMoveUp}
        className="rounded p-1 text-blue-600 hover:bg-blue-50 disabled:opacity-30"
        aria-label={lang === 'ar' ? 'أعلى' : 'Up'}
      >
        <ArrowUp className="h-4 w-4" />
      </button>
      <button
        type="button"
        disabled={index >= total - 1}
        onClick={onMoveDown}
        className="rounded p-1 text-blue-600 hover:bg-blue-50 disabled:opacity-30"
        aria-label={lang === 'ar' ? 'أسفل' : 'Down'}
      >
        <ArrowDown className="h-4 w-4" />
      </button>
      <button
        type="button"
        disabled={total <= 1}
        onClick={onDelete}
        className="rounded p-1 text-red-500 hover:bg-red-50 disabled:opacity-30"
        aria-label={lang === 'ar' ? 'حذف' : 'Remove'}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )

  if (isEditMode && isLoading) {
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
              {isNewOrder ? (lang === 'ar' ? 'أمر تفكيك جديد' : 'New disassembly order') : number}
            </h1>
            {isEditMode && order && (
              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(order.status)}`}>
                {statusLabel(order.status)}
              </span>
            )}
            {isCopySession && (
              <span className="text-xs text-amber-700">
                {lang === 'ar' ? `نسخ من ${copyFrom!.number} — سيتم إنشاء أمر جديد` : `Copy of ${copyFrom!.number} — creates a new order`}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {isReadOnly && order && (
            <button
              type="button"
              onClick={() => setCopyConfirmOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-primary-200 bg-primary-50 px-3 py-2 text-sm text-primary-700 hover:bg-primary-100"
            >
              <Copy className="h-4 w-4" /> {lang === 'ar' ? 'نسخ كمسودة جديدة' : 'Copy as new draft'}
            </button>
          )}
          {isEditMode && order?.status === 'completed' && (
            <button
              type="button"
              onClick={printOrder}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50"
            >
              <Printer className="h-4 w-4" /> {lang === 'ar' ? 'طباعة' : 'Print'}
            </button>
          )}
        </div>
      </div>

      {isEditMode && order && (
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">{lang === 'ar' ? 'رقم الأمر' : 'Number'}</label>
            <input className={FIELD} value={number} readOnly disabled />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">{lang === 'ar' ? 'التاريخ' : 'Date'}</label>
            <input type="date" className={FIELD} value={date} disabled={isReadOnly} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">{lang === 'ar' ? 'المستودع (مصدر التفكيك)' : 'Source warehouse'}</label>
            <SearchableSelect
              options={warehouseOptions}
              value={sourceWarehouseId ?? 0}
              onChange={(v) => setSourceWarehouseId(v ? Number(v) : null)}
              disabled={isReadOnly}
              placeholder={lang === 'ar' ? 'اختر المستودع' : 'Select warehouse'}
              textAlign={isRtl ? 'right' : 'left'}
              matchTriggerWidth
              className="w-full min-w-0"
              inputClassName={FIELD}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">{lang === 'ar' ? 'الفرع' : 'Branch'}</label>
            {isReadOnly ? (
              <input className={FIELD} readOnly disabled value={order?.branch?.name ?? branches.find((b) => b.id === branchId)?.name ?? '—'} />
            ) : (
              <select className={FIELD} value={branchId ?? ''} onChange={(e) => setBranchId(e.target.value ? parseInt(e.target.value, 10) : null)}>
                <option value="">{t.choose}</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">{lang === 'ar' ? 'مركز التكلفة' : 'Cost center'}</label>
            {isReadOnly ? (
              <input className={FIELD} readOnly disabled value={costCenterReadLabel} />
            ) : (
              <select className={FIELD} value={costCenterId ?? ''} onChange={(e) => setCostCenterId(e.target.value ? parseInt(e.target.value, 10) : null)}>
                <option value="">{t.choose}</option>
                {costCenters.map((cc: CostCenter) => (
                  <option key={cc.id} value={cc.id}>{getDisplayName({ name: cc.name, name_en: cc.name_en ?? null })}</option>
                ))}
              </select>
            )}
          </div>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">{lang === 'ar' ? 'ملاحظات' : 'Notes'}</label>
          <textarea
            className="w-full min-h-[4.5rem] resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-inset focus:ring-primary-500/20 disabled:bg-slate-100"
            rows={2}
            value={notes}
            disabled={isReadOnly}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 w-full min-w-0">
        <div className="p-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-800">{lang === 'ar' ? 'الأصناف المراد تفكيكها' : 'Items to disassemble'}</h2>
          {isDraft && (
            <button
              type="button"
              onClick={() => setSourceRows((rows) => [...rows, emptySourceRow()])}
              className="btn-action flex items-center gap-1 text-primary-600 hover:text-primary-500 text-sm font-medium"
            >
              <Plus className="h-4 w-4" /> {lang === 'ar' ? 'إضافة صنف' : 'Add item'}
            </button>
          )}
        </div>
        <div className="ui-table-scroll table-responsive-wrap overflow-y-visible -mx-2 sm:mx-0">
          <table className={`w-full text-sm table-fixed fc-keep-table-fixed ${isDraft ? 'min-w-[44rem]' : 'min-w-[38rem]'}`}>
            <colgroup>
              <col style={{ width: '38%', minWidth: 200 }} />
              <col style={{ width: '12%', minWidth: 72 }} />
              <col style={{ width: '12%', minWidth: 72 }} />
              <col style={{ width: '12%', minWidth: 88 }} />
              <col style={{ width: '12%', minWidth: 88 }} />
              {isDraft && <col style={{ width: '7%', minWidth: 70 }} />}
            </colgroup>
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th className={lineThClass}>{lang === 'ar' ? 'اسم الصنف' : 'Item name'}</th>
                <th className={lineThClass}>{lang === 'ar' ? 'الوحدة' : 'Unit'}</th>
                <th className={lineThClass}>{lang === 'ar' ? 'الكمية' : 'Qty'}</th>
                <th className={lineThClass}>{lang === 'ar' ? 'التكلفة' : 'Cost'}</th>
                <th className={lineThClass}>{lang === 'ar' ? 'الإجمالي' : 'Total'}</th>
                {isDraft && (
                  <th className="px-2.5 py-3 font-medium text-center min-w-[70px] w-[70px]">{lang === 'ar' ? 'ترتيب' : 'Order'}</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {sourceRows.map((row, idx) => {
                const item = items.find((i) => i.id === row.item_id) ?? order?.sourceLines?.[idx]?.item ?? order?.source_lines?.[idx]?.item
                const rowTotal = row.item_id && row.quantity > 0 ? lineTotal(row.quantity, row.unit_cost, amountDecimals) : 0
                return (
                  <tr key={row.key} className="hover:bg-slate-50 transition-colors">
                    <td className={`${lineTdClass} cell-ellipsis`}>
                      {isReadOnly ? (
                        <span className="text-slate-900">{item ? getDisplayName({ name: item.name, name_en: item.name_en ?? null }) : '—'}</span>
                      ) : (
                        <SearchableSelect
                          options={itemOptions}
                          value={row.item_id ?? 0}
                          onChange={(v) => onSourceItemChange(row.key, v ? Number(v) : null)}
                          placeholder={lang === 'ar' ? 'بحث بالكود أو الاسم' : 'Search item...'}
                          className="w-full min-w-0"
                          inputClassName={lineInputClass}
                          matchTriggerWidth
                          textAlign={isRtl ? 'right' : 'left'}
                        />
                      )}
                    </td>
                    <td className={`${lineTdClass} text-slate-600 text-sm`}>{itemUnitLabel(item, getDisplayName)}</td>
                    <td className={lineTdClass}>
                      {isReadOnly ? (
                        <span className="block h-9 leading-9 tabular-nums text-right">{row.quantity}</span>
                      ) : (
                        <input
                          type="number"
                          min={0.0001}
                          step="any"
                          className={lineInputNumberClass}
                          value={row.quantity}
                          onChange={(e) =>
                            setSourceRows((rows) =>
                              rows.map((r) => (r.key === row.key ? { ...r, quantity: parseFloat(e.target.value) || 0 } : r)),
                            )
                          }
                        />
                      )}
                    </td>
                    <td className={lineTdClass}>
                      {isReadOnly ? (
                        <span className="block h-9 leading-9 tabular-nums text-right text-slate-800">{row.item_id ? fmt(row.unit_cost) : '—'}</span>
                      ) : (
                        <input
                          type="number"
                          min={0}
                          step="any"
                          className={lineInputNumberClass}
                          value={row.unit_cost}
                          disabled={!row.item_id}
                          onChange={(e) =>
                            setSourceRows((rows) =>
                              rows.map((r) =>
                                r.key === row.key
                                  ? { ...r, unit_cost: parseFloat(e.target.value) || 0, costManual: true }
                                  : r,
                              ),
                            )
                          }
                        />
                      )}
                    </td>
                    <td className={lineTdClass}>
                      <span className="block h-9 leading-9 tabular-nums text-right font-medium text-slate-900">
                        {row.item_id && row.quantity > 0 ? fmt(rowTotal) : '—'}
                      </span>
                    </td>
                    {isDraft && (
                      <td className="px-2.5 py-2 text-center align-middle min-w-[70px] w-[70px]">
                        {renderRowActions(
                          idx,
                          sourceRows.length,
                          () => setSourceRows((rows) => moveRow(rows, idx, -1)),
                          () => setSourceRows((rows) => moveRow(rows, idx, 1)),
                          () => setSourceRows((rows) => rows.filter((r) => r.key !== row.key)),
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
            {sourceRows.some((r) => r.item_id && r.quantity > 0) && (
              <tfoot>
                <tr className="bg-slate-50 border-t border-slate-200">
                  <td colSpan={sourceColumnCount - (isDraft ? 2 : 1)} className={`${lineTdClass} ${textAlign} text-sm font-semibold text-slate-700`}>
                    {lang === 'ar' ? 'إجمالي تكلفة الأصناف المفككة' : 'Source items total'}
                  </td>
                  <td className={`${lineAmountCellClass} font-bold text-slate-900`}>{fmt(sourceTotalsSum)}</td>
                  {isDraft && <td className={lineTdClass} />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 w-full min-w-0">
        <div className="p-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-800">{lang === 'ar' ? 'الأصناف الناتجة عن التفكيك' : 'Output items'}</h2>
          {isDraft && (
            <button
              type="button"
              onClick={() => setOutputRows((rows) => [...rows, emptyOutputRow(sourceWarehouseId)])}
              className="btn-action flex items-center gap-1 text-primary-600 hover:text-primary-500 text-sm font-medium"
            >
              <Plus className="h-4 w-4" /> {lang === 'ar' ? 'إضافة صنف ناتج' : 'Add output'}
            </button>
          )}
        </div>
        <div className="ui-table-scroll table-responsive-wrap overflow-y-visible -mx-2 sm:mx-0">
          <table className={`w-full text-sm table-fixed fc-keep-table-fixed ${isDraft ? 'min-w-[52rem]' : 'min-w-[46rem]'}`}>
            <colgroup>
              <col style={{ width: '31%', minWidth: 200 }} />
              <col style={{ width: '9%', minWidth: 72 }} />
              <col style={{ width: '10%', minWidth: 72 }} />
              <col style={{ width: '16%', minWidth: 120 }} />
              <col style={{ width: '10%', minWidth: 88 }} />
              <col style={{ width: '10%', minWidth: 88 }} />
              {isDraft && <col style={{ width: '7%', minWidth: 70 }} />}
            </colgroup>
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th className={lineThClass}>{lang === 'ar' ? 'اسم الصنف' : 'Item name'}</th>
                <th className={lineThClass}>{lang === 'ar' ? 'الوحدة' : 'Unit'}</th>
                <th className={lineThClass}>{lang === 'ar' ? 'الكمية' : 'Qty'}</th>
                <th className={lineThClass}>{lang === 'ar' ? 'المستودع' : 'Warehouse'}</th>
                <th className={lineThClass}>{lang === 'ar' ? 'التكلفة' : 'Cost'}</th>
                <th className={lineThClass}>{lang === 'ar' ? 'الإجمالي' : 'Total'}</th>
                {isDraft && (
                  <th className="px-2.5 py-3 font-medium text-center min-w-[70px] w-[70px]">{lang === 'ar' ? 'ترتيب' : 'Order'}</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {outputRows.map((row, idx) => {
                const item = items.find((i) => i.id === row.item_id) ?? order?.lines?.[idx]?.item
                const rowTotal = outputLineTotal(row, amountDecimals)
                const totalInputValue =
                  row.item_id && row.quantity > 0
                    ? row.manualLineTotal ?? lineTotal(row.quantity, row.unit_cost, amountDecimals)
                    : ''
                return (
                  <tr key={row.key} className="hover:bg-slate-50 transition-colors">
                    <td className={`${lineTdClass} cell-ellipsis`}>
                      {isReadOnly ? (
                        <span className="text-slate-900">{item ? getDisplayName({ name: item.name, name_en: item.name_en ?? null }) : '—'}</span>
                      ) : (
                        <SearchableSelect
                          options={itemOptions}
                          value={row.item_id ?? 0}
                          onChange={(v) => onOutputItemChange(row.key, v ? Number(v) : null, row.warehouse_id ?? sourceWarehouseId)}
                          placeholder={lang === 'ar' ? 'بحث بالكود أو الاسم' : 'Search item...'}
                          className="w-full min-w-0"
                          inputClassName={lineInputClass}
                          matchTriggerWidth
                          textAlign={isRtl ? 'right' : 'left'}
                        />
                      )}
                    </td>
                    <td className={`${lineTdClass} text-slate-600 text-sm`}>{itemUnitLabel(item, getDisplayName)}</td>
                    <td className={lineTdClass}>
                      {isReadOnly ? (
                        <span className="block h-9 leading-9 tabular-nums text-right">{row.quantity}</span>
                      ) : (
                        <input
                          type="number"
                          min={0.0001}
                          step="any"
                          className={lineInputNumberClass}
                          value={row.quantity}
                          onChange={(e) => {
                            const qty = parseFloat(e.target.value) || 0
                            setOutputRows((rows) =>
                              rows.map((r) => {
                                if (r.key !== row.key) return r
                                if (r.manualLineTotal != null && qty > 0) {
                                  return {
                                    ...r,
                                    quantity: qty,
                                    unit_cost: roundAmount(r.manualLineTotal / qty, amountDecimals),
                                    costManual: true,
                                  }
                                }
                                return { ...r, quantity: qty }
                              }),
                            )
                          }}
                        />
                      )}
                    </td>
                    <td className={lineTdClass}>
                      {isReadOnly ? (
                        <span className="block h-9 leading-9 text-slate-800">{warehouses.find((w) => w.id === row.warehouse_id)?.name ?? order?.lines?.[idx]?.warehouse?.name ?? '—'}</span>
                      ) : (
                        <SearchableSelect
                          options={warehouseOptions}
                          value={outputRowWarehouseId(row, sourceWarehouseId) ?? 0}
                          onChange={(v) => {
                            const wh = v ? Number(v) : null
                            setOutputRows((rows) =>
                              rows.map((r) => (r.key === row.key ? { ...r, warehouse_id: wh, costManual: false, manualLineTotal: null } : r)),
                            )
                            if (row.item_id && wh) void applyOutputAverageCost(row.key, row.item_id, wh)
                          }}
                          placeholder={lang === 'ar' ? 'اختر المستودع' : 'Select warehouse'}
                          className="w-full min-w-0"
                          inputClassName={lineInputClass}
                          matchTriggerWidth
                          textAlign={isRtl ? 'right' : 'left'}
                        />
                      )}
                    </td>
                    <td className={lineTdClass}>
                      {isReadOnly ? (
                        <span className="block h-9 leading-9 tabular-nums text-right text-slate-800">{row.item_id ? fmt(row.unit_cost) : '—'}</span>
                      ) : (
                        <input
                          type="number"
                          min={0}
                          step="any"
                          className={lineInputNumberClass}
                          value={row.unit_cost}
                          disabled={!row.item_id}
                          onChange={(e) =>
                            setOutputRows((rows) =>
                              rows.map((r) =>
                                r.key === row.key
                                  ? { ...r, unit_cost: parseFloat(e.target.value) || 0, costManual: true, manualLineTotal: null }
                                  : r,
                              ),
                            )
                          }
                        />
                      )}
                    </td>
                    <td className={lineTdClass}>
                      {isReadOnly ? (
                        <span className="block h-9 leading-9 tabular-nums text-right font-medium text-slate-900">
                          {row.item_id && row.quantity > 0 ? fmt(rowTotal) : '—'}
                        </span>
                      ) : (
                        <input
                          type="number"
                          min={0}
                          step="any"
                          className={lineInputNumberClass}
                          value={totalInputValue}
                          disabled={!row.item_id || row.quantity <= 0}
                          onChange={(e) => {
                            const raw = e.target.value
                            if (raw === '') {
                              setOutputRows((rows) =>
                                rows.map((r) => (r.key === row.key ? { ...r, manualLineTotal: null } : r)),
                              )
                              return
                            }
                            const total = parseFloat(raw)
                            if (!Number.isFinite(total) || total < 0) return
                            setOutputRows((rows) =>
                              rows.map((r) => {
                                if (r.key !== row.key) return r
                                const qty = r.quantity
                                if (qty <= 0) {
                                  return { ...r, manualLineTotal: total, costManual: true }
                                }
                                return {
                                  ...r,
                                  manualLineTotal: total,
                                  unit_cost: roundAmount(total / qty, amountDecimals),
                                  costManual: true,
                                }
                              }),
                            )
                          }}
                        />
                      )}
                    </td>
                    {isDraft && (
                      <td className="px-2.5 py-2 text-center align-middle min-w-[70px] w-[70px]">
                        {renderRowActions(
                          idx,
                          outputRows.length,
                          () => setOutputRows((rows) => moveRow(rows, idx, -1)),
                          () => setOutputRows((rows) => moveRow(rows, idx, 1)),
                          () => setOutputRows((rows) => rows.filter((r) => r.key !== row.key)),
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
            {outputRows.some((r) => isSavableOutputRow(r, sourceWarehouseId)) && (
              <tfoot>
                <tr className={`border-t border-slate-200 ${totalsMismatch ? 'bg-red-50' : 'bg-slate-50'}`}>
                  <td colSpan={outputColumnCount - (isDraft ? 2 : 1)} className={`${lineTdClass} ${textAlign} text-sm font-semibold text-slate-700`}>
                    {lang === 'ar' ? 'إجمالي تكلفة الأصناف الناتجة' : 'Output items total'}
                    {totalsMismatch && (
                      <span className="block text-xs font-normal text-red-600 mt-0.5">
                        {lang === 'ar'
                          ? `يجب أن يساوي ${fmt(sourceTotalsSum)} (إجمالي الأصناف المفككة)`
                          : `Must equal ${fmt(sourceTotalsSum)} (source total)`}
                      </span>
                    )}
                  </td>
                  <td className={`${lineAmountCellClass} font-bold ${totalsMismatch ? 'text-red-700' : 'text-slate-900'}`}>
                    {fmt(outputTotalsSum)}
                  </td>
                  {isDraft && <td className={lineTdClass} />}
                </tr>
              </tfoot>
            )}
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
              disabled={saveMut.isPending || confirmPending}
              onClick={handleSave}
              className={`${stickyBtnBase} bg-primary-600 text-white hover:bg-primary-500 focus-visible:ring-primary-500 disabled:opacity-60`}
            >
              <Save className="h-4 w-4 shrink-0" strokeWidth={2.25} />
              {saveMut.isPending ? t.saving : (lang === 'ar' ? 'حفظ مسودة' : 'Save draft')}
            </button>
            <button
              type="button"
              disabled={saveMut.isPending || confirmPending}
              onClick={() => setConfirmOpen(true)}
              className={`${stickyBtnBase} bg-emerald-600 text-white hover:bg-emerald-500 focus-visible:ring-emerald-500 disabled:opacity-60`}
            >
              <CheckCircle className="h-4 w-4 shrink-0" strokeWidth={2.25} />
              {confirmPending ? (lang === 'ar' ? 'جاري التنفيذ...' : 'Executing...') : (lang === 'ar' ? 'تأكيد وتنفيذ' : 'Confirm & execute')}
            </button>
          </div>
        </div>
      )}

      {copyConfirmOpen && (
        <ConfirmDialog
          title={lang === 'ar' ? 'نسخ كمسودة جديدة' : 'Copy as new draft'}
          message={
            lang === 'ar'
              ? 'سيتم إنشاء أمر تفكيك جديد وليس تعديل الأمر الحالي. هل تريد المتابعة؟'
              : 'A new disassembly order will be created; the current order will not be changed. Continue?'
          }
          confirmLabel={lang === 'ar' ? 'إنشاء أمر جديد' : 'Create new order'}
          variant="warning"
          onConfirm={() => {
            setCopyConfirmOpen(false)
            copyAsNewDraft()
          }}
          onCancel={() => setCopyConfirmOpen(false)}
        />
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
