import { useState, useMemo, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchBranches,
  fetchWarehouses,
  fetchCostCenters,
  fetchItems,
  createOpeningStock,
  fetchSettings,
} from '../../api/tenant'
import type { Item, Branch, Warehouse, CostCenter, PaginatedResponse, TenantSettings } from '../../types'
import { coerceDecimalPlaces, formatAmount } from '../../utils/currency'
import { formatDisplayDate } from '../../utils/date'
import { Plus, Trash2 } from 'lucide-react'
import ConfirmDialog from '../../components/ui/ConfirmDialog'

interface LineForm {
  item_id: number | null
  quantity: number
  unit_cost: number
  cost_center_id: number | null
}

const emptyLine: LineForm = { item_id: null, quantity: 1, unit_cost: 0, cost_center_id: null }

export default function CreateOpeningStock() {
  const { currentTenant } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const navigate = useNavigate()
  const { data: settings } = useQuery<TenantSettings>({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const fmt = (n: number) => formatAmount(n, { decimal_places: coerceDecimalPlaces(settings?.doc_amount_decimals, 2) }, locale)
  const qtyDecimals = coerceDecimalPlaces(settings?.doc_quantity_decimals, 2)
  const fmtQty = (n: number) => Number(n).toLocaleString(locale, { minimumFractionDigits: qtyDecimals, maximumFractionDigits: qtyDecimals })

  const [branchId, setBranchId] = useState<number | null>(null)
  const [warehouseId, setWarehouseId] = useState<number | null>(null)
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [referenceNumber, setReferenceNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<LineForm[]>([{ ...emptyLine }])
  const [itemSearchByLine, setItemSearchByLine] = useState<Record<number, string>>({})
  const [openItemLineIdx, setOpenItemLineIdx] = useState<number | null>(null)
  const itemInputRef = useRef<HTMLInputElement | null>(null)
  const [itemDropdownRect, setItemDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const [confirmCreatePayload, setConfirmCreatePayload] = useState<Record<string, unknown> | null>(null)
  const [saveValidationError, setSaveValidationError] = useState<string | null>(null)

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

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId, { status: 'active' }),
    enabled: !!tenantId,
  })
  const { data: warehousesResp } = useQuery<{ data: Warehouse[] }>({
    queryKey: ['warehouses', tenantId],
    queryFn: () => fetchWarehouses(tenantId),
    enabled: !!tenantId,
  })
  const warehouses = warehousesResp?.data ?? []
  const { data: costCenters = [] } = useQuery<CostCenter[]>({
    queryKey: ['cost-centers', tenantId],
    queryFn: () => fetchCostCenters(tenantId, { active_only: '1' }),
    enabled: !!tenantId,
  })
  const { data: itemsData } = useQuery<PaginatedResponse<Item>>({
    queryKey: ['items', tenantId],
    queryFn: () => fetchItems(tenantId),
    enabled: !!tenantId,
  })
  const items = itemsData?.data ?? []

  function filterItemsBySearch(query: string): Item[] {
    if (!query.trim()) return items
    const q = query.trim().toLowerCase()
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.name_en?.toLowerCase().includes(q)) ||
        i.code.toLowerCase().includes(q) ||
        (i.barcode?.toLowerCase().includes(q)) ||
        (i.sku?.toLowerCase().includes(q))
    )
  }

  const createMut = useMutation({
    mutationFn: (data: Record<string, unknown>) => createOpeningStock(tenantId, data),
    onSuccess: () => navigate('/opening-stock'),
  })

  function updateLine(index: number, field: keyof LineForm, value: number | null) {
    setLines((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  function selectItem(index: number, itemId: number) {
    const item = items.find((i) => i.id === itemId)
    if (!item) return
    setLines((prev) => {
      const next = [...prev]
      next[index] = {
        ...next[index],
        item_id: item.id,
        unit_cost: item.cost_price ?? 0,
      }
      return next
    })
    setItemSearchByLine((p) => ({ ...p, [index]: '' }))
    setOpenItemLineIdx(null)
  }

  function addLine() {
    setLines((prev) => [...prev, { ...emptyLine }])
  }

  function removeLine(index: number) {
    if (lines.length <= 1) return
    setLines((prev) => prev.filter((_, i) => i !== index))
  }

  const totals = useMemo(() => {
    const total = lines.reduce((sum, line) => sum + line.quantity * line.unit_cost, 0)
    return { total }
  }, [lines])

  function buildPayload() {
    return {
      branch_id: branchId,
      warehouse_id: warehouseId ?? null,
      date: date || '',
      reference_number: referenceNumber || null,
      notes: notes || null,
      items: lines
        .filter((l) => l.item_id != null && l.quantity > 0 && l.unit_cost >= 0)
        .map((l) => ({
          item_id: l.item_id,
          quantity: l.quantity,
          unit_cost: l.unit_cost,
          cost_center_id: l.cost_center_id,
        })),
    }
  }

  function handleSaveClick() {
    setSaveValidationError(null)
    if (!branchId) return
    if (!date || !date.trim()) {
      setSaveValidationError(t.openingStock.dateRequired)
      return
    }
    if (!warehouseId) {
      setSaveValidationError(t.openingStock.warehouseRequired)
      return
    }
    const payload = buildPayload()
    if (payload.items.length === 0) return
    setConfirmCreatePayload(payload)
  }

  function handleConfirmCreate() {
    if (!confirmCreatePayload) return
    createMut.mutate(confirmCreatePayload, {
      onSettled: () => setConfirmCreatePayload(null),
    })
  }

  const textAlign = isRtl ? 'text-right' : 'text-left'

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">{t.openingStock.title}</h1>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.openingStock.branch} *</label>
            <select
              value={branchId ?? ''}
              onChange={(e) => setBranchId(e.target.value ? +e.target.value : null)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
              required
            >
              <option value="">—</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.code} - {b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.openingStock.warehouse} *</label>
            <select
              value={warehouseId ?? ''}
              onChange={(e) => setWarehouseId(e.target.value ? +e.target.value : null)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
            >
              <option value="">—</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.code ? `${w.code} - ` : ''}{w.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.openingStock.date} *</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.openingStock.referenceNumber}</label>
            <input
              type="text"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.notes}</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500 outline-none"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{t.openingStock.title}</h2>
          <button
            onClick={addLine}
            className="flex items-center gap-1 text-primary-600 hover:text-primary-500 text-sm font-medium"
          >
            <Plus size={16} />
            {t.openingStock.addLine}
          </button>
        </div>
        <div className="overflow-x-auto overflow-y-visible">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th className={`${textAlign} px-3 py-3 font-medium`} style={{ minWidth: 280 }}>{t.openingStock.item}</th>
                <th className={`${textAlign} px-3 py-3 font-medium w-24`}>{t.openingStock.currentStock}</th>
                <th className={`${textAlign} px-3 py-3 font-medium`} style={{ minWidth: 90 }}>{t.openingStock.quantity}</th>
                <th className={`${textAlign} px-3 py-3 font-medium`} style={{ minWidth: 110 }}>{t.openingStock.unitCost}</th>
                <th className={`${textAlign} px-3 py-3 font-medium`} style={{ minWidth: 110 }}>{t.openingStock.total}</th>
                <th className={`${textAlign} px-3 py-3 font-medium`} style={{ minWidth: 140 }}>{t.openingStock.costCenter}</th>
                <th className="px-3 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {lines.map((line, idx) => {
                const lineTotal = line.quantity * line.unit_cost
                return (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="px-3 py-2 align-top" style={{ minWidth: 280 }}>
                      <div className="relative">
                        <input
                          ref={openItemLineIdx === idx ? (el) => { itemInputRef.current = el } : undefined}
                          type="text"
                          value={openItemLineIdx === idx ? (itemSearchByLine[idx] ?? '') : (line.item_id ? (items.find((i) => i.id === line.item_id)?.name ?? '') : '')}
                          onChange={(e) => {
                            setItemSearchByLine((p) => ({ ...p, [idx]: e.target.value }))
                            setOpenItemLineIdx(idx)
                          }}
                          onFocus={() => setOpenItemLineIdx(idx)}
                          onBlur={() => setTimeout(() => setOpenItemLineIdx(null), 200)}
                          placeholder={t.openingStock.searchItemPlaceholder}
                          className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-inset focus:ring-primary-500"
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-600 text-sm">
                      {line.item_id ? (() => { const item = items.find((i) => i.id === line.item_id); return item?.current_stock != null ? fmtQty(item.current_stock) : '—'; })() : '—'}
                    </td>
                    <td className="px-3 py-2" style={{ minWidth: 90 }}>
                      <input
                        type="number"
                        min={0.0001}
                        step="any"
                        value={line.quantity}
                        onChange={(e) => updateLine(idx, 'quantity', +e.target.value)}
                        className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-inset focus:ring-primary-500"
                      />
                    </td>
                    <td className="px-3 py-2" style={{ minWidth: 110 }}>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={line.unit_cost}
                        onChange={(e) => updateLine(idx, 'unit_cost', +e.target.value)}
                        className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-inset focus:ring-primary-500"
                      />
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-900" style={{ minWidth: 110 }}>{fmt(lineTotal)}</td>
                    <td className="px-3 py-2" style={{ minWidth: 140 }}>
                      <select
                        value={line.cost_center_id ?? ''}
                        onChange={(e) => updateLine(idx, 'cost_center_id', e.target.value ? +e.target.value : null)}
                        className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-inset focus:ring-primary-500"
                      >
                        <option value="">—</option>
                        {costCenters.map((cc) => (
                          <option key={cc.id} value={cc.id}>{cc.code} - {cc.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        disabled={lines.length <= 1}
                        className="text-red-400 hover:text-red-600 disabled:opacity-30"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-200 p-4 flex justify-end">
          <div className="w-64 space-y-1 text-sm">
            <div className="flex justify-between font-semibold text-slate-900">
              <span>{t.openingStock.totalValue}</span>
              <span>{fmt(totals.total)}</span>
            </div>
          </div>
        </div>
      </div>

      {saveValidationError && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          {saveValidationError}
        </div>
      )}
      {createMut.isError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {(createMut.error as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message ?? (createMut.error as { message?: string })?.message ?? t.msg?.updateError ?? 'Error'}
        </div>
      )}

      <div className="flex gap-3 justify-end">
        <button
          type="button"
          onClick={() => navigate('/opening-stock')}
          className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
        >
          {t.cancel}
        </button>
        <button
          type="button"
          onClick={handleSaveClick}
          disabled={createMut.isPending || !branchId || !warehouseId || !date?.trim() || lines.every((l) => !l.item_id || l.quantity <= 0)}
          className="bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-6 py-2 text-sm font-medium disabled:opacity-50"
        >
          {createMut.isPending ? t.saving : t.openingStock.saveDraft}
        </button>
      </div>

      {confirmCreatePayload && (
        <ConfirmDialog
          title={lang === 'ar' ? 'تأكيد حفظ رصيد أول المدة' : 'Confirm Save Opening Stock'}
          message={(t.openingStock.confirmSaveMessage ?? '')
            .replace('{warehouse}', (() => {
              const w = warehouses.find((x) => x.id === warehouseId)
              return w ? (w.code ? `${w.code} - ${w.name}` : w.name) : String(warehouseId)
            })())
            .replace('{date}', formatDisplayDate(date))}
          variant="warning"
          confirmLabel={t.save}
          isLoading={createMut.isPending}
          onConfirm={handleConfirmCreate}
          onCancel={() => setConfirmCreatePayload(null)}
        />
      )}

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
            }}
          >
            <div className="max-h-48 overflow-y-auto overflow-x-hidden py-1" dir="ltr">
              {filterItemsBySearch(itemSearchByLine[openItemLineIdx] ?? '').slice(0, 50).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`w-full px-3 py-2 text-sm hover:bg-slate-100 block ${isRtl ? 'text-right' : 'text-left'}`}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    selectItem(openItemLineIdx, item.id)
                  }}
                >
                  {item.name} {item.code ? `(${item.code})` : ''}
                </button>
              ))}
              {filterItemsBySearch(itemSearchByLine[openItemLineIdx] ?? '').length === 0 && (
                <div className={`px-3 py-2 text-sm text-slate-500 ${isRtl ? 'text-right' : 'text-left'}`}>{t.openingStock.noItems}</div>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
