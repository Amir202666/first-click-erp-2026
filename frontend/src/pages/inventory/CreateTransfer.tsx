import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchWarehouses,
  fetchBranches,
  fetchCostCenters,
  fetchItems,
  fetchTransfer,
  createTransfer,
  updateTransfer,
} from '../../api/tenant'
import type { Warehouse, Item, Branch, CostCenter, ItemUnitOption } from '../../types'
import { Plus, Trash2, Printer } from 'lucide-react'
import { formatAmount } from '../../utils/currency'
import Toast, { type ToastType } from '../../components/ui/Toast'
import ConfirmDialog from '../../components/ui/ConfirmDialog'

interface LineRow {
  item_id: number
  item?: Item
  item_query: string
  unit_id: number | null
  conversion_factor: number
  quantity: string
  unit_cost: number
}

export default function CreateTransfer() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { currentTenant } = useAuth()
  const { t, isRtl, lang } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const queryClient = useQueryClient()
  const textAlign = isRtl ? 'text-right' : 'text-left'
  const isEdit = !!id
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [alertMsg, setAlertMsg] = useState<string | null>(null)
  const [fromWarehouseId, setFromWarehouseId] = useState('')
  const [toWarehouseId, setToWarehouseId] = useState('')
  const [branchId, setBranchId] = useState('')
  const [costCenterId, setCostCenterId] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const emptyLine = (): LineRow => ({
    item_id: 0,
    item: undefined,
    item_query: '',
    unit_id: null,
    conversion_factor: 1,
    quantity: '',
    unit_cost: 0,
  })
  const [lines, setLines] = useState<LineRow[]>(() => (isEdit ? [] : [emptyLine(), emptyLine()]))
  const [itemSearchByLine, setItemSearchByLine] = useState<Record<number, string>>({})
  const [openItemLineIdx, setOpenItemLineIdx] = useState<number | null>(null)
  const [itemDropdownRect, setItemDropdownRect] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null)
  const itemInputRef = useRef<HTMLInputElement | null>(null)

  const normalizeToastMessage = (raw: unknown) => {
    const msg = String(raw ?? '').trim()
    if (!msg) return msg

    // بعض الردود ترجع بصيغة "0: message" بسبب تجميع أخطاء/مصفوفات
    const withoutIndexPrefix = msg.replace(/^\s*\d+\s*:\s*/g, '')

    // عزل الأرقام داخل نص عربي لتجنب انقلاب الاتجاه في RTL
    if (isRtl) {
      return withoutIndexPrefix.replace(/(\d+(?:[.,]\d+)?)/g, '\u2066$1\u2069')
    }
    return withoutIndexPrefix
  }

  const showStockAlert = (raw: unknown) => {
    const msg = normalizeToastMessage(raw)
    if (!msg) return
    setAlertMsg(msg)
  }

  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses', tenantId],
    queryFn: () => fetchWarehouses(tenantId),
    enabled: !!tenantId,
  })
  const warehouses = warehousesData?.data ?? []

  const { data: branchesData } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId,
  })
  const branches: Branch[] = Array.isArray(branchesData)
    ? branchesData
    : ((branchesData as unknown) as { data?: Branch[] })?.data ?? []

  const { data: costCentersData } = useQuery({
    queryKey: ['cost-centers', tenantId],
    queryFn: () => fetchCostCenters(tenantId, { active_only: '1' }),
    enabled: !!tenantId,
  })
  const costCenters: CostCenter[] = Array.isArray(costCentersData)
    ? costCentersData
    : ((costCentersData as unknown) as { data?: CostCenter[] })?.data ?? []

  const { data: itemsRes } = useQuery({
    queryKey: ['items', tenantId],
    queryFn: () => fetchItems(tenantId, { per_page: '500' }),
    enabled: !!tenantId,
  })
  const items = itemsRes?.data ?? []

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
      const preferredMaxHeight = 280
      const margin = 8
      const gap = 4
      const spaceBelow = window.innerHeight - r.bottom - margin
      const spaceAbove = r.top - margin
      const openUp = spaceBelow < 220 && spaceAbove > spaceBelow
      const maxHeight = Math.max(140, Math.min(preferredMaxHeight, openUp ? spaceAbove - gap : spaceBelow - gap))
      const top = openUp ? Math.max(margin, r.top - maxHeight - gap) : r.bottom + gap
      setItemDropdownRect({ top, left: r.left, width: r.width, maxHeight })
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
        (i.name && i.name.toLowerCase().includes(q)) ||
        (i.name_en?.toLowerCase().includes(q)) ||
        (i.code && i.code.toLowerCase().includes(q)) ||
        (i.barcode?.toLowerCase().includes(q)) ||
        (i.sku?.toLowerCase().includes(q))
    )
  }

  function unitOptionsForItem(it?: Item | null): ItemUnitOption[] {
    const anyIt = (it ?? null) as any
    return (anyIt?.unit_options ?? anyIt?.unitOptions ?? []) as ItemUnitOption[]
  }

  function getDefaultUnitOption(it?: Item | null): ItemUnitOption | null {
    const opts = unitOptionsForItem(it)
    if (!opts.length) return null
    return opts.find((o) => (o as any).is_base) ?? opts[0]
  }

  function getUnitNameByOption(opt: ItemUnitOption): string {
    const u = opt.unit
    if (u) {
      return isRtl ? u.name : u.name_en ?? u.name
    }
    return `#${opt.unit_id}`
  }

  function getCostForUnit(it: Item, uid: number | null): number {
    const opts = unitOptionsForItem(it)
    if (uid != null) {
      const opt = opts.find((o) => o.unit_id === uid)
      if (opt) {
        const raw = opt.cost_price ?? opt.selling_price ?? (it as any).cost_price ?? 0
        return Number(raw) || 0
      }
    }
    return Number((it as any).cost_price ?? 0) || 0
  }

  const { data: transfer, isLoading: loadingTransfer } = useQuery({
    queryKey: ['transfer', tenantId, id],
    queryFn: () => fetchTransfer(tenantId, Number(id)),
    enabled: !!tenantId && isEdit && !!id,
  })
  useEffect(() => {
    if (transfer) {
      setFromWarehouseId(String(transfer.from_warehouse_id))
      setToWarehouseId(String(transfer.to_warehouse_id))
      setBranchId(transfer.branch_id ? String(transfer.branch_id) : '')
      setCostCenterId(transfer.cost_center_id ? String(transfer.cost_center_id) : '')
      setDate(transfer.date?.slice(0, 10) ?? date)
      setNotes(transfer.notes ?? '')
      setLines(
        (transfer.lines ?? []).map((l) => ({
          item_id: l.item_id,
          item: l.item,
          item_query: `${l.item?.code ?? ''} — ${l.item?.name ?? ''}`.trim(),
          quantity: (() => {
            const baseQty = Number(l.quantity) || 0
            if (!baseQty) return ''
            const baseOpt = getDefaultUnitOption(l.item)
            const conv = baseOpt?.conversion_factor ?? 1
            const display = conv ? baseQty / conv : baseQty
            const n = Number(display)
            if (!Number.isFinite(n)) return ''
            return String(n)
          })(),
          unit_cost: (() => {
            const baseOpt = getDefaultUnitOption(l.item)
            const conv = baseOpt?.conversion_factor ?? 1
            const baseUnitCost = Number(l.unit_cost) || 0
            return baseUnitCost * conv
          })(),
          unit_id: (() => {
            const baseOpt = getDefaultUnitOption(l.item)
            return baseOpt?.unit_id ?? (l.item as any)?.unit_id ?? null
          })(),
          conversion_factor: (() => {
            const baseOpt = getDefaultUnitOption(l.item)
            return baseOpt?.conversion_factor ?? 1
          })(),
        }))
      )
    }
  }, [transfer])

  const createMut = useMutation({
    mutationFn: (payload: Record<string, unknown>) => createTransfer(tenantId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfers'] })
      setToast({ message: 'تم إنشاء التحويل', type: 'success' })
      navigate('/inventory/transfers')
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      const msg = e?.response?.data?.message ?? 'فشل'
      if (String(msg).includes('الكمية غير متوفرة')) showStockAlert(msg)
      else setToast({ message: normalizeToastMessage(msg), type: 'error' })
    },
  })
  const updateMut = useMutation({
    mutationFn: (payload: Record<string, unknown>) => updateTransfer(tenantId, Number(id), payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfers'] })
      setToast({ message: 'تم التحديث', type: 'success' })
      navigate('/inventory/transfers')
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      const msg = e?.response?.data?.message ?? 'فشل'
      if (String(msg).includes('الكمية غير متوفرة')) showStockAlert(msg)
      else setToast({ message: normalizeToastMessage(msg), type: 'error' })
    },
  })

  const addLine = () => {
    setLines((prev) => [...prev, emptyLine()])
  }
  const removeLine = (idx: number) => setLines((prev) => prev.filter((_, i) => i !== idx))
  const updateLine = (idx: number, field: 'item_id' | 'quantity' | 'item_query' | 'unit_cost', value: string) => {
    setLines((prev) => {
      const next = [...prev]
      if (field === 'item_id') {
        const item = items.find((i) => i.id === Number(value))
        if (item) {
          const defOpt = getDefaultUnitOption(item)
          const unitId = defOpt?.unit_id ?? (item as any).unit_id ?? null
          const conv = defOpt?.conversion_factor ?? 1
          const unitCost = getCostForUnit(item, unitId)
          next[idx] = {
            ...next[idx],
            item_id: item.id,
            item,
            item_query: `${item.code} — ${item.name}`,
            unit_id: unitId,
            conversion_factor: conv,
            quantity: next[idx].quantity ?? '',
            unit_cost: unitCost,
          }
        } else {
          next[idx] = { ...next[idx], item_id: Number(value), item: undefined, item_query: '' }
        }
      } else if (field === 'item_query') {
        const item = items.find((i) => `${i.code} — ${i.name}` === value)
        next[idx] = {
          ...next[idx],
          item_query: value,
          item_id: item ? item.id : next[idx].item_id,
          item: item ?? next[idx].item,
          unit_id: item ? (getDefaultUnitOption(item)?.unit_id ?? (item as any).unit_id ?? null) : next[idx].unit_id,
          conversion_factor: item ? (getDefaultUnitOption(item)?.conversion_factor ?? 1) : next[idx].conversion_factor,
          unit_cost: item ? getCostForUnit(item, getDefaultUnitOption(item)?.unit_id ?? (item as any).unit_id ?? null) : next[idx].unit_cost,
        }
      } else if (field === 'quantity') {
        next[idx] = { ...next[idx], quantity: value }
      } else if (field === 'unit_cost') {
        next[idx] = { ...next[idx], unit_cost: Number(value) || 0 }
      }
      return next
    })
  }
  const selectItem = (idx: number, itemId: number) => {
    const item = items.find((i) => i.id === itemId)
    if (!item) return
    const defOpt = getDefaultUnitOption(item)
    const unitId = defOpt?.unit_id ?? (item as any).unit_id ?? null
    const conv = defOpt?.conversion_factor ?? 1
    const unitCost = getCostForUnit(item, unitId)
    setLines((prev) => {
      const next = [...prev]
      next[idx] = {
        ...next[idx],
        item_id: item.id,
        item,
        item_query: `${item.code} — ${item.name}`,
        unit_id: unitId,
        conversion_factor: conv,
        quantity: next[idx].quantity ?? '',
        unit_cost: unitCost,
      }
      return next
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (fromWarehouseId === toWarehouseId) {
      setToast({ message: normalizeToastMessage('اختر مخزنين مختلفين'), type: 'error' })
      return
    }
    const validLines = lines.filter((l) => l.item_id && l.quantity && Number(l.quantity) > 0)
    if (validLines.length === 0) {
      setToast({ message: normalizeToastMessage('أضف صنفاً صحيحاً واحداً على الأقل'), type: 'error' })
      return
    }
    const payload = {
      from_warehouse_id: Number(fromWarehouseId),
      to_warehouse_id: Number(toWarehouseId),
      branch_id: branchId ? Number(branchId) : null,
      cost_center_id: costCenterId ? Number(costCenterId) : null,
      date,
      notes: notes || undefined,
      lines: validLines.map((l) => ({
        item_id: l.item_id,
        quantity: Number(l.quantity) * (l.conversion_factor || 1),
        unit_cost: (l.unit_cost || 0) / (l.conversion_factor || 1),
      })),
    }
    if (isEdit) updateMut.mutate(payload)
    else createMut.mutate(payload)
  }

  const handlePrint = () => {
    if (!isEdit || !id) {
      setToast({ message: normalizeToastMessage(isRtl ? 'يتاح الطباعة بعد حفظ التحويل' : 'Print is available after saving'), type: 'warning' })
      return
    }
    navigate(`/inventory/transfers/${id}/print`)
  }

  const locale = 'ar-u-nu-latn'
  const fmt = (n: number) => formatAmount(n, { decimal_places: 2 }, locale)
  /** مطابق لصف حقول رأس فاتورة المبيعات — CreateInvoice */
  const headerLabelClass = 'block text-xs font-medium text-slate-600 mb-0.5'
  const headerControlClass =
    'w-full h-9 border border-slate-300 rounded-md px-2.5 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500 outline-none box-border bg-white'
  const selectPlaceholder = lang === 'ar' ? 'اختر' : 'Select'

  if (isEdit && loadingTransfer) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4 w-full">
      {alertMsg && (
        <ConfirmDialog
          title={isRtl ? 'تنبيه' : 'Warning'}
          message={alertMsg}
          variant="warning"
          highlightMessage
          showCancel={false}
          confirmLabel={isRtl ? 'حسناً' : 'OK'}
          onCancel={() => setAlertMsg(null)}
          onConfirm={() => setAlertMsg(null)}
        />
      )}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
          dir={isRtl ? 'rtl' : 'ltr'}
        />
      )}
      <h1 className="text-xl font-bold text-slate-900">{isEdit ? 'تعديل تحويل' : 'تحويل جديد'}</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 space-y-3 overflow-visible">
        <div className="invoice-header-grid-autofit">
          <div className="min-w-0">
            <label className={headerLabelClass}>{t.date ?? 'التاريخ'} *</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={headerControlClass}
              required
            />
          </div>
          <div className="min-w-0">
            <label className={headerLabelClass}>{t.invoices?.branch ?? (isRtl ? 'الفرع' : 'Branch')}</label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className={headerControlClass}
            >
              <option value="">{selectPlaceholder}</option>
              {branches.filter((b) => b.is_active).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code ? `${b.code} - ` : ''}
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label className={headerLabelClass}>{t.invoices?.costCenter ?? (isRtl ? 'مركز التكلفة' : 'Cost center')}</label>
            <select
              value={costCenterId}
              onChange={(e) => setCostCenterId(e.target.value)}
              className={headerControlClass}
            >
              <option value="">{selectPlaceholder}</option>
              {costCenters.filter((c) => c.is_active).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code ? `${c.code} - ` : ''}
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label className={headerLabelClass}>{isRtl ? 'المخزن المحول منه' : 'From warehouse'} *</label>
            <select
              value={fromWarehouseId}
              onChange={(e) => setFromWarehouseId(e.target.value)}
              className={headerControlClass}
              required
            >
              <option value="">{selectPlaceholder}</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code ? `${w.code} - ` : ''}
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label className={headerLabelClass}>{isRtl ? 'المخزن المحول إليه' : 'To warehouse'} *</label>
            <select
              value={toWarehouseId}
              onChange={(e) => setToWarehouseId(e.target.value)}
              className={headerControlClass}
              required
            >
              <option value="">{selectPlaceholder}</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code ? `${w.code} - ` : ''}
                  {w.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className={headerLabelClass}>{t.notes ?? 'ملاحظات'}</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={`${headerControlClass} min-h-[4.5rem] py-2 resize-y`}
            rows={2}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-slate-800">الأصناف والكميات</h2>
            <button type="button" onClick={addLine} className="btn btn-sm btn-primary inline-flex items-center gap-1">
              <Plus size={14} />
              إضافة صنف
            </button>
          </div>
          <div className="overflow-x-auto overflow-y-visible rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-600">
                  <th className={`${textAlign} px-3 py-2 font-medium w-16`}>رقم</th>
                  <th className={`${textAlign} px-3 py-2 font-medium`}>الصنف</th>
                  <th className={`${textAlign} px-3 py-2 font-medium w-40`}>الوحدة</th>
                  <th className={`${textAlign} px-3 py-2 font-medium w-28`}>الكمية</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => (
                  <tr key={idx} className="border-t border-slate-100">
                    <td className={`px-3 py-2 ${textAlign} text-slate-600 tabular-nums`}>{idx + 1}</td>
                    <td className="px-3 py-2">
                      <input
                        ref={openItemLineIdx === idx ? (el) => { itemInputRef.current = el } : undefined}
                        value={openItemLineIdx === idx ? (itemSearchByLine[idx] ?? '') : (line.item_id ? (items.find((i) => i.id === line.item_id)?.name ?? '') : '')}
                        onChange={(e) => {
                          setItemSearchByLine((p) => ({ ...p, [idx]: e.target.value }))
                          updateLine(idx, 'item_query', e.target.value)
                          setOpenItemLineIdx(idx)
                        }}
                        onFocus={() => {
                          setOpenItemLineIdx(idx)
                          if (!line.item_id) setItemSearchByLine((p) => ({ ...p, [idx]: p[idx] ?? '' }))
                        }}
                        onBlur={() => {
                          setTimeout(() => setOpenItemLineIdx((v) => (v === idx ? null : v)), 120)
                        }}
                        className="input-app w-full min-w-[220px]"
                        placeholder={isRtl ? 'ابحث عن الصنف' : 'Search item'}
                      />
                    </td>
                    <td className={`px-3 py-2 ${textAlign}`}>
                      {(() => {
                        const it = line.item ?? items.find((i) => i.id === line.item_id)
                        if (!it) return '—'
                        const opts = unitOptionsForItem(it)
                        if (!opts.length) {
                          return (
                            <span className="inline-flex w-full h-10 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-slate-700">
                              {it.item_unit?.name ?? it.unit ?? '—'}
                            </span>
                          )
                        }
                        const baseOpt = getDefaultUnitOption(it)
                        const value = line.unit_id ?? baseOpt?.unit_id ?? opts[0]?.unit_id ?? null
                        if (value == null) return '—'
                        return (
                          <select
                            value={value}
                            onChange={(e) => {
                              const uid = e.target.value ? Number(e.target.value) : null
                              // تحديث الوحدة والمحافظة على نفس القيم الأساسية
                              setLines((prev) => {
                                const next = [...prev]
                                const curr = next[idx]
                                const selectedOpt = opts.find((o) => o.unit_id === uid) ?? baseOpt
                                const newConv = selectedOpt?.conversion_factor ?? 1
                                const itRow = curr.item ?? items.find((i) => i.id === curr.item_id)
                                const newUnitCost = itRow ? getCostForUnit(itRow, uid) : curr.unit_cost
                                next[idx] = {
                                  ...curr,
                                  unit_id: uid,
                                  conversion_factor: newConv,
                                  unit_cost: Number(newUnitCost) || 0,
                                }
                                return next
                              })
                            }}
                            className="input-app w-full h-10 min-h-10"
                          >
                            {opts.map((o) => (
                              <option key={o.unit_id} value={o.unit_id}>
                                {getUnitNameByOption(o)}
                              </option>
                            ))}
                          </select>
                        )
                      })()}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0.0001"
                        step="any"
                        inputMode="decimal"
                        value={line.quantity}
                        onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                        className="input-app w-full h-10 min-h-10 [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <button type="button" onClick={() => removeLine(idx)} className="p-1.5 text-red-600 hover:bg-red-50 rounded">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div
          className={`flex flex-wrap items-center gap-2 sm:gap-3 pt-4 border-t border-slate-200 ${isRtl ? 'flex-row-reverse justify-start' : 'justify-end'}`}
        >
          <button
            type="button"
            onClick={() => navigate('/inventory/transfers')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {t.cancel ?? 'إلغاء'}
          </button>

          <button
            type="button"
            onClick={handlePrint}
            disabled={!isEdit || (Number(id) <= 0)}
            title={!isEdit || (Number(id) <= 0) ? (isRtl ? 'يتاح بعد الحفظ' : 'Available after save') : undefined}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Printer size={16} /> {isRtl ? 'طباعة' : 'Print'}
          </button>

          <button
            type="submit"
            disabled={createMut.isPending || updateMut.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {isEdit ? (t.save ?? 'حفظ') : isRtl ? 'إنشاء التحويل' : 'Create transfer'}
          </button>
        </div>
      </form>
      {typeof document !== 'undefined' &&
        itemDropdownRect !== null &&
        openItemLineIdx !== null &&
        createPortal(
          <div
            className="fixed z-[99999] rounded-lg border border-slate-200 bg-white shadow-2xl ring-1 ring-slate-200 overflow-hidden"
            style={{ top: itemDropdownRect.top, left: itemDropdownRect.left, width: itemDropdownRect.width }}
          >
            <div className="overflow-auto py-1" style={{ maxHeight: itemDropdownRect.maxHeight }}>
              {filterItemsBySearch(itemSearchByLine[openItemLineIdx] ?? '').slice(0, 50).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`w-full px-3 py-2 text-sm hover:bg-slate-100 ${textAlign}`}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    selectItem(openItemLineIdx, item.id)
                    setItemSearchByLine((p) => ({ ...p, [openItemLineIdx]: '' }))
                    setOpenItemLineIdx(null)
                  }}
                >
                  <span className="font-medium">{item.code}</span>
                  <span className="text-slate-700"> — {item.name}</span>
                </button>
              ))}
              {filterItemsBySearch(itemSearchByLine[openItemLineIdx] ?? '').length === 0 && (
                <div className={`px-3 py-2 text-sm text-slate-500 ${textAlign}`}>{isRtl ? 'لا توجد أصناف مطابقة' : 'No matching items'}</div>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
