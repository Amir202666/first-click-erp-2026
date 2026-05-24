import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  createInventoryAdjustment,
  fetchAccounts,
  fetchBranches,
  fetchCostCenters,
  fetchInventoryAdjustment,
  fetchItems,
  fetchSettings,
  fetchWarehouses,
  updateInventoryAdjustment,
} from '../../api/tenant'
import type { Account, Branch, CostCenter, InventoryAdjustment, Item, PaginatedResponse, Warehouse } from '../../types'
import { coerceDecimalPlaces, formatAmount } from '../../utils/currency'
import { ArrowRight, Save, X, Plus, Minus, Printer, GripVertical } from 'lucide-react'
import Toast, { type ToastType } from '../../components/ui/Toast'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import AccountSearchSelect from '../../components/AccountSearchSelect'
import { toLocalDateString } from '../../utils/date'

type Mode = 'create' | 'edit'

interface LineDraft {
  localId: string
  item_id: number
  item?: Item
  quantity: string
  unit_id: number | null
  conversion_factor: number | null
  action: 'add' | 'subtract'
}

function nextLineLocalId(seq: { current: number }) {
  seq.current += 1
  return `adj-line-${seq.current}`
}

export default function InventoryAdjustmentForm() {
  const { id: routeEditId } = useParams<{ id: string }>()
  const editId = routeEditId ? Number(routeEditId) : 0
  const mode: Mode = editId > 0 ? 'edit' : 'create'

  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false)

  const [header, setHeader] = useState({
    date: toLocalDateString(new Date()),
    branch_id: '',
    cost_center_id: '',
    warehouse_id: '',
    target_account_id: '',
    notes: '',
  })
  const lineIdSeq = useRef(0)
  const makeEmptyLine = (defaultAction: 'add' | 'subtract'): LineDraft => ({
    localId: nextLineLocalId(lineIdSeq),
    item_id: 0,
    item: undefined,
    quantity: '',
    unit_id: null,
    conversion_factor: null,
    action: defaultAction,
  })

  const [lines, setLines] = useState<LineDraft[]>(() => {
    const eid = routeEditId ? Number(routeEditId) : 0
    if (eid > 0) return []
    return [makeEmptyLine('add'), makeEmptyLine('add'), makeEmptyLine('add')]
  })
  const [openItemLineIdx, setOpenItemLineIdx] = useState<number | null>(null)
  const [itemSearchByLine, setItemSearchByLine] = useState<Record<number, string>>({})
  const itemInputRef = useRef<HTMLInputElement | null>(null)
  const [itemDropdownRect, setItemDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const { data: settings } = useQuery({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: tenantId > 0,
  })
  const amountDecimals = coerceDecimalPlaces(settings?.doc_amount_decimals, 2)
  const qtyDecimals = coerceDecimalPlaces(settings?.doc_quantity_decimals, 2)
  const fmtMoney = (n: number) => formatAmount(n, { decimal_places: amountDecimals }, locale)
  const fmtQty = (n: number) =>
    Number(n).toLocaleString(locale, { minimumFractionDigits: qtyDecimals, maximumFractionDigits: qtyDecimals })
  const fmtQtyInput = (n: number) => {
    if (!Number.isFinite(n)) return ''
    if (qtyDecimals <= 0) return String(Math.trunc(n))
    return n.toFixed(qtyDecimals)
  }

  function lineActualQty(line: LineDraft): number {
    if (line.item_id <= 0) return 0
    const q = Number(line.quantity || 0)
    if (!Number.isFinite(q)) return 0
    const cf = Number(line.conversion_factor ?? 1)
    if (!Number.isFinite(cf) || cf <= 0) return q
    return q * cf
  }

  const { data: warehousesResp } = useQuery<{ data: Warehouse[] }>({
    queryKey: ['warehouses', tenantId],
    queryFn: () => fetchWarehouses(tenantId),
    enabled: tenantId > 0,
  })
  const warehouses = warehousesResp?.data ?? []

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId),
    enabled: tenantId > 0,
  })

  const { data: accountsList = [] } = useQuery<Account[]>({
    queryKey: ['accounts', tenantId, 'inv-adjustment-postable'],
    queryFn: () => fetchAccounts(tenantId, { postable_only: '1', active_only: '1' }),
    enabled: tenantId > 0,
  })

  const postableAccounts = useMemo(() => {
    const list = [...(accountsList ?? [])]
    return list.sort((a, b) => String(a.code).localeCompare(String(b.code), undefined, { numeric: true }))
  }, [accountsList])

  const visibleWarehouses = useMemo(() => {
    const bid = header.branch_id ? Number(header.branch_id) : 0
    const active = warehouses.filter((w) => w.is_active !== false)
    if (!bid) return active
    return active.filter((w) => {
      if (w.applies_to_all_branches === true) return true
      if (w.branch_id === bid) return true
      if (w.branches?.some((b) => b.id === bid)) return true
      return false
    })
  }, [warehouses, header.branch_id])

  const { data: costCenters = [] } = useQuery<CostCenter[]>({
    queryKey: ['cost-centers', tenantId],
    queryFn: () => fetchCostCenters(tenantId),
    enabled: tenantId > 0,
  })

  const { data: itemsData } = useQuery<PaginatedResponse<Item>>({
    queryKey: ['items', tenantId, 'inv-adj'],
    queryFn: () => fetchItems(tenantId, { per_page: '1000' }),
    enabled: tenantId > 0,
  })
  const items = itemsData?.data ?? []

  const { data: editAdj } = useQuery<InventoryAdjustment>({
    queryKey: ['inventory-adjustment', tenantId, editId],
    queryFn: () => fetchInventoryAdjustment(tenantId, editId),
    enabled: tenantId > 0 && mode === 'edit' && editId > 0,
  })

  useEffect(() => {
    if (mode !== 'edit' || !editAdj) return
    setHeader({
      date: editAdj.date,
      branch_id: editAdj.branch_id ? String(editAdj.branch_id) : '',
      cost_center_id: editAdj.cost_center_id ? String(editAdj.cost_center_id) : '',
      warehouse_id: editAdj.warehouse_id ? String(editAdj.warehouse_id) : '',
      target_account_id: editAdj.target_account_id ? String(editAdj.target_account_id) : '',
      notes: editAdj.notes ?? '',
    })
    setLines(
      (editAdj.lines ?? []).map((l) => ({
        localId: nextLineLocalId(lineIdSeq),
        item_id: l.item_id,
        item: l.item ?? items.find((it) => it.id === l.item_id),
        quantity: l.display_quantity != null && Number.isFinite(Number(l.display_quantity))
          ? fmtQtyInput(Number(l.display_quantity))
          : (l.quantity != null && Number.isFinite(Number(l.quantity)) ? fmtQtyInput(Number(l.quantity)) : ''),
        unit_id: l.unit_id ?? null,
        conversion_factor: l.conversion_factor ?? null,
        action: (l.action as 'add' | 'subtract' | null | undefined) ?? (editAdj.adjustment_type === 'out' ? 'subtract' : 'add'),
      })),
    )
  }, [mode, editAdj, items, qtyDecimals])

  function unitOptionsForItem(it?: Item | null): { unit_id: number; name: string; conversion_factor: number; cost_price: number | null }[] {
    if (!it) return []
    const opts = (it as any).unit_options ?? (it as any).unitOptions ?? []
    const list: { unit_id: number; name: string; conversion_factor: number; cost_price: number | null }[] = []
    if (Array.isArray(opts) && opts.length > 0) {
      for (const o of opts) {
        const uid = Number(o.unit_id)
        if (!uid) continue
        const uName = o.unit ? (lang === 'ar' ? o.unit.name : (o.unit.name_en || o.unit.name)) : `#${uid}`
        const cf = Number(o.conversion_factor || 1) || 1
        list.push({ unit_id: uid, name: uName, conversion_factor: cf > 0 ? cf : 1, cost_price: o.cost_price != null ? Number(o.cost_price) : null })
      }
      return list.sort((a, b) => a.conversion_factor - b.conversion_factor)
    }
    const baseId = (it as any).unit_id
    const baseUnit = (it as any).item_unit
    if (baseId && baseUnit) {
      list.push({ unit_id: Number(baseId), name: lang === 'ar' ? baseUnit.name : (baseUnit.name_en || baseUnit.name), conversion_factor: 1, cost_price: (it as any).cost_price != null ? Number((it as any).cost_price) : null })
    }
    return list
  }

  function ensureLineUnitDefaults(line: LineDraft, it?: Item | null): Pick<LineDraft, 'unit_id' | 'conversion_factor'> {
    const opts = unitOptionsForItem(it)
    if (opts.length === 0) return { unit_id: line.unit_id ?? null, conversion_factor: line.conversion_factor ?? null }
    const current = line.unit_id ? opts.find((o) => o.unit_id === line.unit_id) : null
    const base = opts.find((o) => o.conversion_factor === 1) ?? opts[0]
    const sel = current ?? base
    return { unit_id: sel.unit_id, conversion_factor: sel.conversion_factor }
  }

  useEffect(() => {
    if (mode !== 'create') return
    // تأكيد تاريخ اليوم كقيمة افتراضية (في حال رجعت فارغة لأي سبب)
    if (header.date) return
    setHeader((s) => ({ ...s, date: toLocalDateString(new Date()) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  useEffect(() => {
    if (!header.warehouse_id) return
    const wid = Number(header.warehouse_id)
    if (!visibleWarehouses.some((w) => w.id === wid)) {
      setHeader((s) => ({ ...s, warehouse_id: '' }))
    }
  }, [visibleWarehouses, header.warehouse_id])

  useLayoutEffect(() => {
    if (openItemLineIdx === null) {
      setItemDropdownRect(null)
      return
    }
    const el = itemInputRef.current
    if (!el) {
      setItemDropdownRect(null)
      return
    }
    const update = () => {
      const r = el.getBoundingClientRect()
      setItemDropdownRect({ top: r.bottom + 4, left: r.left, width: r.width })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [openItemLineIdx, itemSearchByLine[openItemLineIdx ?? -1]])

  function filterItemsBySearch(query: string): Item[] {
    if (!query.trim()) return items
    const q = query.trim().toLowerCase()
    return items.filter(
      (i) =>
        (i.name ?? '').toLowerCase().includes(q) ||
        (i.name_en ?? '').toLowerCase().includes(q) ||
        (i.code ?? '').toLowerCase().includes(q) ||
        (i.barcode ?? '').toLowerCase().includes(q) ||
        (i.sku ?? '').toLowerCase().includes(q),
    )
  }

  function selectItemForLine(index: number, itemId: number) {
    const item = items.find((it) => it.id === itemId)
    if (!item) return
    setLines((prev) =>
      prev.map((line, i) =>
        i === index
          ? {
              ...line,
              item_id: item.id,
              item,
              ...ensureLineUnitDefaults(line, item),
              quantity: line.quantity?.trim() ? line.quantity : fmtQtyInput(1),
            }
          : line,
      ),
    )
  }

  function lineUnitCostDisplay(line: LineDraft): number {
    const item = line.item
    if (!item) return 0
    const baseAvg = item.average_cost != null && Number.isFinite(Number(item.average_cost)) ? Number(item.average_cost) : Number(item.cost_price ?? 0)
    const opts = unitOptionsForItem(item)
    const sel = line.unit_id ? opts.find((o) => o.unit_id === line.unit_id) : null
    const cf = sel?.conversion_factor ?? (line.conversion_factor ?? 1)
    if (sel && sel.cost_price != null && Number.isFinite(Number(sel.cost_price))) return Number(sel.cost_price)
    return baseAvg * (Number(cf) || 1)
  }

  const totalValue = useMemo(() => {
    return lines.reduce((s, l) => {
      const qty = Number(l.quantity || 0)
      const sign = l.action === 'subtract' ? -1 : 1
      return s + sign * qty * lineUnitCostDisplay(l)
    }, 0)
  }, [lines])

  const totalQty = useMemo(() => {
    return lines.reduce((s, l) => {
      if (l.item_id <= 0) return s
      const q = Number(l.quantity || 0)
      if (!Number.isFinite(q)) return s
      return s + q
    }, 0)
  }, [lines])

  function adjustmentTypeForPayload(validLines: LineDraft[]): 'in' | 'out' {
    if (validLines.length === 0) return 'in'
    const hasAdd = validLines.some((l) => l.action === 'add')
    const hasSub = validLines.some((l) => l.action === 'subtract')
    if (hasSub && !hasAdd) return 'out'
    return 'in'
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!header.target_account_id) {
        throw new Error(lang === 'ar' ? 'اختر الحساب' : 'Select account')
      }
      const validLines = lines.filter((l) => l.item_id > 0 && Number(l.quantity) > 0)
      const payload = {
        date: header.date,
        branch_id: header.branch_id ? Number(header.branch_id) : null,
        cost_center_id: header.cost_center_id ? Number(header.cost_center_id) : null,
        warehouse_id: Number(header.warehouse_id),
        target_account_id: Number(header.target_account_id),
        adjustment_type: adjustmentTypeForPayload(validLines),
        notes: header.notes || null,
        lines: validLines.map((l) => ({
          item_id: l.item_id,
          quantity: Number(l.quantity), // display quantity
          unit_id: l.unit_id,
          conversion_factor: l.conversion_factor,
          action: l.action,
        })),
      }
      if (mode === 'edit') return updateInventoryAdjustment(tenantId, editId, payload)
      return createInventoryAdjustment(tenantId, payload)
    },
    onSuccess: (res: InventoryAdjustment) => {
      queryClient.invalidateQueries({ queryKey: ['inventory-adjustments', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['item-ledger', tenantId] })
      setSaveConfirmOpen(false)
      setToast({ message: lang === 'ar' ? 'تم الحفظ' : 'Saved', type: 'success' })
      if (mode === 'create') {
        lineIdSeq.current = 0
        setHeader({
          date: toLocalDateString(new Date()),
          branch_id: '',
          cost_center_id: '',
          warehouse_id: '',
          target_account_id: '',
          notes: '',
        })
        setLines([makeEmptyLine('add'), makeEmptyLine('add'), makeEmptyLine('add')])
        setItemSearchByLine({})
        setOpenItemLineIdx(null)
        navigate('/inventory/adjustments/create', { replace: true })
      } else if (res?.id) {
        queryClient.invalidateQueries({ queryKey: ['inventory-adjustment', tenantId, res.id] })
      }
    },
    onError: (e: unknown) => {
      setSaveConfirmOpen(false)
      const ax = e as {
        response?: { data?: { message?: string; errors?: Record<string, string[] | string> } }
        message?: string
      }
      const serverMsg = ax?.response?.data?.message
      const errorsObj = ax?.response?.data?.errors
      const firstErr =
        errorsObj && typeof errorsObj === 'object'
          ? (Object.values(errorsObj).flat() as unknown[]).find((x) => typeof x === 'string') as string | undefined
          : undefined
      const fallback = (e instanceof Error && e.message) ? e.message : (lang === 'ar' ? 'فشل الحفظ' : 'Save failed')
      setToast({ message: serverMsg ?? firstErr ?? fallback, type: 'error' })
    },
  })

  function addEmptyLine() {
    setLines((prev) => [...prev, makeEmptyLine('add')])
  }

  function moveLine(from: number, to: number) {
    if (from === to) return
    setLines((prev) => {
      if (from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  function handleSave() {
    if (!header.warehouse_id) {
      setToast({ message: lang === 'ar' ? 'اختر المخزن' : 'Select warehouse', type: 'error' })
      return
    }
    if (!header.target_account_id) {
      setToast({ message: lang === 'ar' ? 'اختر الحساب' : 'Select account', type: 'error' })
      return
    }
    const qtyInvalid = lines.some((l) => {
      if (l.item_id <= 0) return false
      const q = Number(l.quantity)
      return !Number.isFinite(q) || q <= 0
    })
    if (qtyInvalid) {
      setToast({
        message:
          lang === 'ar'
            ? 'كل صنف مُختار يجب أن تكون كميته أكبر من صفر'
            : 'Each selected item must have a quantity greater than zero',
        type: 'error',
      })
      return
    }
    setSaveConfirmOpen(true)
  }

  function confirmSave() {
    saveMut.mutate()
  }

  function handleCancel() {
    navigate('/inventory/adjustments')
  }

  function handlePrint() {
    if (mode !== 'edit' || editId <= 0) {
      setToast({
        message: lang === 'ar' ? 'احفظ التسوية أولاً ثم يمكن الطباعة من صفحة العرض' : 'Save the adjustment first; you can print from the view page',
        type: 'info',
      })
      return
    }
    const url = `/inventory/adjustments/view/${editId}`
    const w = window.open(url, '_blank', 'noopener,noreferrer')
    if (w) {
      w.onload = () => {
        try {
          w.focus()
          w.print()
        } catch {
          /* ignore */
        }
      }
    }
  }

  const fullWidthClass = 'w-full max-w-none'
  const filterCellDate = 'min-w-[140px] flex-1 basis-[140px] max-w-[200px]'
  const filterCellSelect = 'min-w-[180px] flex-1 basis-[180px] max-w-[340px]'
  const filterCellWide = 'min-w-[220px] flex-1 basis-[220px] max-w-[420px]'
  const filterRowClass = 'bg-white rounded-xl border border-slate-200 p-3 flex flex-wrap items-center gap-3'
  const fieldClass =
    'w-full h-8 min-h-8 box-border border border-slate-300 rounded-lg px-3 py-0 text-sm leading-normal bg-white text-slate-900 outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 placeholder:text-slate-500'

  const pageTitle = mode === 'edit' ? t.nav.inventoryAdjustmentEdit : t.nav.inventoryAdjustmentNew

  return (
    <div className={`p-4 space-y-4 ${fullWidthClass}`}>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          position={toast.type === 'error' || toast.type === 'warning' ? 'center' : 'top'}
          onClose={() => setToast(null)}
        />
      )}

      {saveConfirmOpen && (
        <ConfirmDialog
          title={lang === 'ar' ? 'تأكيد الحفظ' : 'Confirm save'}
          message={lang === 'ar' ? 'هل تريد حفظ التسوية الجردية؟' : 'Do you want to save this inventory adjustment?'}
          confirmLabel={lang === 'ar' ? 'حفظ' : 'Save'}
          cancelLabel={lang === 'ar' ? 'إلغاء' : 'Cancel'}
          variant="warning"
          isLoading={saveMut.isPending}
          onCancel={() => {
            if (!saveMut.isPending) setSaveConfirmOpen(false)
          }}
          onConfirm={confirmSave}
          overlayZClass="z-[110]"
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
        <div className={`flex flex-wrap items-center gap-3 ${isRtl ? 'flex-row-reverse' : ''}`}>
          <Link
            to="/inventory/adjustments"
            className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
          >
            <ArrowRight size={18} className={isRtl ? 'rotate-180' : ''} />
            {lang === 'ar' ? 'القائمة' : 'List'}
          </Link>
          <div className="h-6 w-px bg-slate-200 hidden sm:block" />
          <h1 className="text-base font-semibold text-slate-900">{pageTitle}</h1>
        </div>
      </div>

      <div className={filterRowClass}>
        <div className={filterCellDate}>
          <input
            type="date"
            value={header.date}
            onChange={(e) => setHeader((s) => ({ ...s, date: e.target.value }))}
            className={fieldClass}
            title={lang === 'ar' ? 'التاريخ' : 'Date'}
          />
        </div>
        <div className={filterCellSelect}>
          <select
            value={header.branch_id}
            onChange={(e) => setHeader((s) => ({ ...s, branch_id: e.target.value }))}
            className={fieldClass}
            title={lang === 'ar' ? 'الفرع' : 'Branch'}
          >
            <option value="">{lang === 'ar' ? 'الفرع' : 'Branch'}</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code ? `${b.code} — ` : ''}
                {lang === 'ar' ? b.name : b.name_en || b.name}
              </option>
            ))}
          </select>
        </div>
        <div className={filterCellSelect}>
          <select
            value={header.cost_center_id}
            onChange={(e) => setHeader((s) => ({ ...s, cost_center_id: e.target.value }))}
            className={fieldClass}
            title={lang === 'ar' ? 'مركز التكلفة' : 'Cost center'}
          >
            <option value="">{lang === 'ar' ? 'مركز التكلفة' : 'Cost center'}</option>
            {costCenters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className={filterCellSelect}>
          <select
            value={header.warehouse_id}
            onChange={(e) => setHeader((s) => ({ ...s, warehouse_id: e.target.value }))}
            className={fieldClass}
          >
            <option value="">{t.openingStock.warehouse}</option>
            {visibleWarehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code ? `${w.code} - ` : ''}{w.name}
              </option>
            ))}
          </select>
        </div>
        <div className={filterCellSelect}>
          <AccountSearchSelect
            value={header.target_account_id ? Number(header.target_account_id) : null}
            accounts={postableAccounts}
            onChange={(accountId) => setHeader((s) => ({ ...s, target_account_id: accountId != null ? String(accountId) : '' }))}
            placeholder={t.inventory.targetAccount}
            className="w-full"
          />
        </div>
      </div>

      <div className={filterRowClass}>
        <div className="w-full min-w-[220px] flex-1">
          <input
            value={header.notes}
            onChange={(e) => setHeader((s) => ({ ...s, notes: e.target.value }))}
            className={fieldClass}
            placeholder={lang === 'ar' ? 'البيان (اختياري)' : 'Notes (optional)'}
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div
          className={`flex items-center gap-2 px-3 py-1.5 border-b border-slate-200 bg-slate-50 ${isRtl ? 'flex-row-reverse justify-start' : 'justify-end'}`}
        >
          <button
            type="button"
            onClick={addEmptyLine}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Plus size={16} /> {lang === 'ar' ? 'إضافة سطر' : 'Add row'}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <th className="px-3 py-2 text-right w-14">#</th>
                <th className={`px-3 py-2 ${isRtl ? 'text-right' : 'text-left'}`}>{lang === 'ar' ? 'الصنف' : 'Item'}</th>
                <th className={`px-3 py-2 ${isRtl ? 'text-right' : 'text-left'} w-40`}>{lang === 'ar' ? 'الوحدة' : 'Unit'}</th>
                <th className="px-3 py-2 text-right w-32">{lang === 'ar' ? 'الكمية الفعلية' : 'Actual qty'}</th>
                <th className="px-3 py-2 text-right w-28">{lang === 'ar' ? 'الكمية' : 'Qty'}</th>
                <th className="px-3 py-2 text-center w-36">{lang === 'ar' ? 'نوع الحركة' : 'Action'}</th>
                <th className="px-3 py-2 text-right w-32">{lang === 'ar' ? 'التكلفه' : t.inventory.avgCostEstimate}</th>
                <th className="px-3 py-2 text-right w-36">{lang === 'ar' ? 'الاجمالي' : t.inventory.lineValueQtyTimesAvg}</th>
                <th className="px-3 py-2 text-right w-14" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-slate-400">
                    {lang === 'ar' ? 'أضف أصنافاً للبدء.' : 'Add items to start.'}
                  </td>
                </tr>
              ) : (
                lines.map((l, idx) => (
                  <tr
                    key={l.localId}
                    className={`hover:bg-slate-50 ${draggingIndex === idx ? 'bg-primary-50' : ''} ${dragOverIndex === idx ? 'ring-2 ring-primary-300' : ''}`}
                    onDragOver={(e) => {
                      e.preventDefault()
                      if (draggingIndex !== null && draggingIndex !== idx) setDragOverIndex(idx)
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      if (draggingIndex !== null && dragOverIndex !== null) {
                        moveLine(draggingIndex, dragOverIndex)
                      }
                      setDraggingIndex(null)
                      setDragOverIndex(null)
                      setOpenItemLineIdx(null)
                      setItemSearchByLine({})
                    }}
                    onDragEnd={() => {
                      setDraggingIndex(null)
                      setDragOverIndex(null)
                    }}
                  >
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500 select-none">
                      <span className="text-xs font-medium tabular-nums">{idx + 1}</span>
                    </td>
                    <td className={`px-3 py-2 ${isRtl ? 'text-right' : 'text-left'} align-middle`}>
                      <div className="relative min-w-[12rem]">
                        <input
                          ref={openItemLineIdx === idx ? (el) => { itemInputRef.current = el } : undefined}
                          type="text"
                          value={
                            openItemLineIdx === idx
                              ? (itemSearchByLine[idx] ?? '')
                              : (l.item?.name ?? (l.item_id ? (items.find((it) => it.id === l.item_id)?.name ?? '') : ''))
                          }
                          onChange={(e) => {
                            setItemSearchByLine((p) => ({ ...p, [idx]: e.target.value }))
                            setOpenItemLineIdx(idx)
                          }}
                          onFocus={() => setOpenItemLineIdx(idx)}
                          onBlur={() => setTimeout(() => setOpenItemLineIdx(null), 200)}
                          placeholder={t.invoices.searchItemPlaceholder}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-900 outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 placeholder:text-slate-500"
                        />
                      </div>
                    </td>
                    <td className={`px-3 py-2 ${isRtl ? 'text-right' : 'text-left'} align-middle`}>
                      {(() => {
                        const opts = unitOptionsForItem(l.item)
                        if (opts.length === 0) return <span className="text-slate-400">—</span>
                        const sel = ensureLineUnitDefaults(l, l.item)
                        const value = String(l.unit_id ?? sel.unit_id ?? '')
                        return (
                          <select
                            value={value}
                            onChange={(e) => {
                              const uid = e.target.value ? Number(e.target.value) : null
                              const hit = opts.find((o) => o.unit_id === uid)
                              setLines((prev) =>
                                prev.map((x, i) =>
                                  i === idx
                                    ? {
                                        ...x,
                                        unit_id: uid,
                                        conversion_factor: hit?.conversion_factor ?? x.conversion_factor ?? 1,
                                      }
                                    : x,
                                ),
                              )
                            }}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-900 outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500"
                          >
                            {opts.map((o) => (
                              <option key={o.unit_id} value={o.unit_id}>
                                {o.name}
                              </option>
                            ))}
                          </select>
                        )
                      })()}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                      {l.item_id > 0 ? fmtQty(lineActualQty(l)) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        value={l.quantity}
                        onChange={(e) => {
                          const v = e.target.value
                          setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, quantity: v } : x)))
                        }}
                        onBlur={() => {
                          if (l.item_id <= 0) return
                          const n = Number(l.quantity)
                          if (!Number.isFinite(n) || n <= 0) return
                          const fixed = fmtQtyInput(n)
                          setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, quantity: fixed } : x)))
                        }}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-right tabular-nums"
                        inputMode="decimal"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, action: 'add' } : x)))}
                          className={`inline-flex items-center justify-center h-8 w-8 rounded-lg border transition-colors ${
                            (l.action ?? 'add') === 'add'
                              ? 'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-500'
                              : 'bg-white border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                          }`}
                          aria-label={lang === 'ar' ? 'إضافة' : 'Add'}
                          title={lang === 'ar' ? 'إضافة (+)' : 'Add (+)'}
                        >
                          <Plus size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, action: 'subtract' } : x)))
                          }
                          className={`inline-flex items-center justify-center h-8 w-8 rounded-lg border transition-colors ${
                            (l.action ?? 'add') === 'subtract'
                              ? 'bg-red-600 border-red-600 text-white hover:bg-red-500'
                              : 'bg-white border-red-200 text-red-700 hover:bg-red-50'
                          }`}
                          aria-label={lang === 'ar' ? 'خصم' : 'Subtract'}
                          title={lang === 'ar' ? 'خصم (-)' : 'Subtract (-)'}
                        >
                          <Minus size={16} />
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600 text-xs">
                      {fmtMoney(lineUnitCostDisplay(l))}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-800 font-medium">
                      {fmtMoney(
                        ((Number(l.quantity || 0) || 0) * lineUnitCostDisplay(l) * ((l.action ?? 'add') === 'subtract' ? -1 : 1)),
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className={`flex items-center gap-1.5 ${isRtl ? 'justify-start flex-row-reverse' : 'justify-end'}`}>
                        <span
                          draggable
                          onDragStart={(e) => {
                            setDraggingIndex(idx)
                            setDragOverIndex(idx)
                            try {
                              e.dataTransfer.effectAllowed = 'move'
                              e.dataTransfer.setData('text/plain', l.localId)
                            } catch {
                              /* ignore */
                            }
                          }}
                          className="rounded-lg p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-grab select-none"
                          title={lang === 'ar' ? 'تحريك السطر' : 'Reorder line'}
                          aria-label={lang === 'ar' ? 'تحريك السطر' : 'Reorder line'}
                        >
                          <GripVertical size={16} />
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenItemLineIdx(null)
                            setLines((prev) => prev.filter((_, i) => i !== idx))
                          }}
                          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                          aria-label={lang === 'ar' ? 'حذف' : 'Remove'}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {lines.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50">
                  <td className={`px-3 py-2 font-semibold ${isRtl ? 'text-right' : 'text-left'}`} colSpan={4}>
                    {lang === 'ar' ? 'الإجمالي' : 'Total'}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtQty(totalQty)}</td>
                  <td colSpan={2} />
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtMoney(totalValue)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <div
        className={`flex flex-wrap items-center gap-2 sm:gap-3 pt-6 border-t border-slate-200 ${isRtl ? 'flex-row-reverse justify-start' : 'justify-end'}`}
      >
        <button
          type="button"
          onClick={handleCancel}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {lang === 'ar' ? 'إلغاء' : 'Cancel'}
        </button>
        <button
          type="button"
          onClick={handlePrint}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          title={mode !== 'edit' || editId <= 0 ? (lang === 'ar' ? 'يتاح بعد الحفظ' : 'Available after save') : undefined}
        >
          <Printer size={16} /> {t.accounts?.print ?? (lang === 'ar' ? 'طباعة' : 'Print')}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saveMut.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          <Save size={16} /> {lang === 'ar' ? 'حفظ' : 'Save'}
        </button>
      </div>

      {typeof document !== 'undefined' &&
        itemDropdownRect !== null &&
        openItemLineIdx !== null &&
        createPortal(
          <div
            className="fixed z-[9999] bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden min-w-[200px]"
            style={{
              top: itemDropdownRect.top,
              left: itemDropdownRect.left,
              width: Math.max(itemDropdownRect.width, 200),
              maxHeight: 'min(12rem, 50vh)',
            }}
          >
            <div className="max-h-48 overflow-y-auto overflow-x-hidden py-1" dir="ltr">
              {filterItemsBySearch(itemSearchByLine[openItemLineIdx] ?? '')
                .slice(0, 50)
                .map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`w-full px-3 py-2 text-sm hover:bg-slate-100 block ${isRtl ? 'text-right' : 'text-left'}`}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      selectItemForLine(openItemLineIdx, item.id)
                      setItemSearchByLine((p) => ({ ...p, [openItemLineIdx]: '' }))
                      setOpenItemLineIdx(null)
                    }}
                  >
                    {item.name}{item.code ? ` (${item.code})` : ''}
                  </button>
                ))}
              {filterItemsBySearch(itemSearchByLine[openItemLineIdx] ?? '').length === 0 && (
                <div className={`px-3 py-2 text-sm text-slate-500 ${isRtl ? 'text-right' : 'text-left'}`}>{t.invoices.noItemsMatch}</div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
