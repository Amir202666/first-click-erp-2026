import { useState, useEffect, useRef, useLayoutEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchVendors,
  fetchItems,
  fetchBranches,
  fetchWarehouses,
  fetchCurrencies,
  fetchSettings,
  createPurchaseRequest,
} from '../../api/tenant'
import type { PaginatedResponse } from '../../types'
import type { Vendor, Item, Branch, Warehouse, ItemUnitOption, Currency } from '../../types'
import { formatAmount, formatAmountWithSymbol } from '../../utils/currency'
import { processInvoiceTotals } from '../../utils/totalsCalculation'
import { Plus, Trash2, GripVertical } from 'lucide-react'
import ConfirmDialog from '../../components/ui/ConfirmDialog'

interface LineForm {
  item_id: number | null
  unit_id: number | null
  description: string
  quantity: number
  unit_price: number
  discount_percent: number
  tax_percent: number
}

const emptyLine: LineForm = {
  item_id: null,
  unit_id: null,
  description: '',
  quantity: 1,
  unit_price: 0,
  discount_percent: 0,
  tax_percent: 0,
}

export default function CreatePurchaseRequest() {
  const { currentTenant, meData } = useAuth()
  const { t, lang, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [vendorId, setVendorId] = useState<number | null>(null)
  const [branchId, setBranchId] = useState<number | null>(null)
  const [warehouseId, setWarehouseId] = useState<number | null>(null)
  const [referenceNumber, setReferenceNumber] = useState('')
  const [discountType, setDiscountType] = useState<'percent' | 'amount'>('amount')
  const [discountInputStr, setDiscountInputStr] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<LineForm[]>([{ ...emptyLine }])
  const appliedDefaultsRef = useRef(false)
  const [itemSearchByLine, setItemSearchByLine] = useState<Record<number, string>>({})
  const [openItemLineIdx, setOpenItemLineIdx] = useState<number | null>(null)
  const [itemDropdownRect, setItemDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [showSaveConfirm, setShowSaveConfirm] = useState(false)
  const itemInputRef = useRef<HTMLInputElement | null>(null)

  const { data: settings } = useQuery({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const defaultVatRate = Number((settings as Record<string, unknown>)?.default_vat_rate ?? 15)
  const taxRate = defaultVatRate / 100

  const { data: vendorsData } = useQuery<PaginatedResponse<Vendor>>({
    queryKey: ['vendors', tenantId, branchId],
    queryFn: () =>
      fetchVendors(tenantId, {
        per_page: '500',
        ...(branchId != null ? { branch_id: String(branchId) } : {}),
      }),
    enabled: !!tenantId,
  })
  const { data: itemsData } = useQuery<PaginatedResponse<Item>>({
    queryKey: ['items', tenantId],
    queryFn: () => fetchItems(tenantId, { per_page: '500' }),
    enabled: !!tenantId,
  })
  const { data: branchesData } = useQuery<Branch[] | { data: Branch[] }>({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId,
  })
  const { data: warehousesData } = useQuery<{ data: Warehouse[] }>({
    queryKey: ['warehouses', tenantId],
    queryFn: () => fetchWarehouses(tenantId, { per_page: '500' }),
    enabled: !!tenantId,
  })
  const { data: currenciesData } = useQuery<Currency[]>({
    queryKey: ['currencies', tenantId],
    queryFn: () => fetchCurrencies(tenantId),
    enabled: !!tenantId,
  })

  const vendors = vendorsData?.data ?? []
  const items = itemsData?.data ?? []
  const branches = Array.isArray(branchesData) ? branchesData : (branchesData as { data?: Branch[] })?.data ?? []
  const warehouses = warehousesData?.data ?? []

  useEffect(() => {
    if (appliedDefaultsRef.current || !meData?.restrict_to_branch_warehouse) return
    if (meData.default_branch_id != null) setBranchId(meData.default_branch_id)
    if (meData.default_warehouse_id != null) setWarehouseId(meData.default_warehouse_id)
    appliedDefaultsRef.current = true
  }, [meData?.restrict_to_branch_warehouse, meData?.default_branch_id, meData?.default_warehouse_id])

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
        (i.name && i.name.toLowerCase().includes(q)) ||
        (i.name_en?.toLowerCase().includes(q)) ||
        (i.code && i.code.toLowerCase().includes(q)) ||
        (i.barcode?.toLowerCase().includes(q)) ||
        (i.sku?.toLowerCase().includes(q))
    )
  }

  function getPriceForUnit(it: Item & { unit_options?: ItemUnitOption[] }, uid: number | null): number {
    if (!uid) return Number(it.cost_price ?? 0)
    const opt = (it.unit_options || []).find((o) => o.unit_id === uid)
    if (opt) return Number(opt.cost_price ?? opt.selling_price ?? it.cost_price) ?? Number(it.cost_price ?? 0)
    return Number(it.cost_price ?? 0)
  }

  function handleUnitChange(lineIndex: number, unitId: number | null, newPrice: number) {
    setLines((prev) => {
      const next = prev.map((l, i) =>
        i === lineIndex ? { ...l, unit_id: unitId, unit_price: newPrice } : l
      )
      return next
    })
  }

  function getDefaultTaxForItem(it: Item & { default_tax_percent?: number | null }) {
    return it.default_tax_percent != null && Number.isFinite(Number(it.default_tax_percent))
      ? Number(it.default_tax_percent)
      : defaultVatRate
  }

  const createMut = useMutation({
    mutationFn: (data: Record<string, unknown>) => createPurchaseRequest(tenantId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-requests'] })
      resetForm()
      setShowSaveConfirm(false)
    },
  })

  function resetForm() {
    setDate(new Date().toISOString().slice(0, 10))
    setVendorId(null)
    setBranchId(null)
    setWarehouseId(null)
    setReferenceNumber('')
    setDiscountType('amount')
    setDiscountInputStr('')
    setNotes('')
    setLines([{ ...emptyLine }])
    setItemSearchByLine({})
  }

  function updateLine(index: number, field: keyof LineForm, value: string | number | null) {
    setLines((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  function selectItem(index: number, itemId: number) {
    const item = items.find((i) => i.id === itemId) as (Item & { unit_options?: ItemUnitOption[]; default_tax_percent?: number | null }) | undefined
    if (!item) return
    const unitId = item.unit_id ?? (item.unit_options?.[0]?.unit_id) ?? null
    const unitPrice = getPriceForUnit(item, unitId)
    const taxPercent = getDefaultTaxForItem(item)
    setLines((prev) => {
      const next = [...prev]
      next[index] = {
        ...next[index],
        item_id: item.id,
        unit_id: unitId,
        description: item.name ?? '',
        unit_price: unitPrice,
        tax_percent: taxPercent,
      }
      return next
    })
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

  function removeLine(index: number) {
    if (lines.length <= 1) return
    setLines((prev) => prev.filter((_, i) => i !== index))
    setOpenItemLineIdx(null)
    setItemSearchByLine({})
  }

  function addLine() {
    setLines((prev) => [...prev, { ...emptyLine, tax_percent: defaultVatRate }])
  }

  const subtotalSum = useMemo(
    () => lines.reduce((s, l) => s + l.quantity * l.unit_price, 0),
    [lines]
  )
  const processResult = useMemo(() => {
    const discountVal = discountInputStr.trim() === '' ? 0 : parseFloat(discountInputStr) || 0
    const dType = discountType === 'percent' ? 'percentage' as const : 'amount' as const
    return processInvoiceTotals(subtotalSum, discountVal, dType, taxRate)
  }, [subtotalSum, discountInputStr, discountType, taxRate])
  const subtotal = Number(processResult.subtotal)
  const discountAmount = Number(processResult.discount)
  const taxBase = Number(processResult.taxable)
  const taxTotal = Number(processResult.tax)
  const total = Number(processResult.total)

  function buildPayload() {
    return {
      date,
      vendor_id: vendorId,
      branch_id: branchId,
      warehouse_id: warehouseId,
      reference_number: referenceNumber || null,
      discount_amount: discountAmount,
      notes: notes || null,
      lines: lines.map((l) => ({
        item_id: l.item_id,
        unit_id: l.unit_id,
        description: l.description,
        quantity: l.quantity,
        unit_price: l.unit_price,
        discount_percent: l.discount_percent,
        tax_percent: l.tax_percent,
      })),
    }
  }

  const textAlign = isRtl ? 'text-right' : 'text-left'
  const inputClass = 'w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm min-w-0'
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const currenciesList = Array.isArray(currenciesData) ? currenciesData : []
  const defaultCurrency: Currency | { symbol: string; decimal_places: number } = currenciesList.length > 0
    ? (currenciesList.find((c) => c.is_default) ?? currenciesList[0])
    : { symbol: 'KWD', decimal_places: 2 }
  const fmt = (n: number) => formatAmount(n, defaultCurrency, locale)
  const fmtWithSymbol = (n: number) => formatAmountWithSymbol(n, defaultCurrency, locale)

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">{t.add} {lang === 'ar' ? 'طلب شراء' : 'Purchase Request'}</h1>
        <Link to="/purchase-requests" className="text-slate-600 hover:text-slate-900 text-sm">{t.back}</Link>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} title={t.date} aria-label={t.date} />
          </div>
          <div>
            <select value={vendorId ?? ''} onChange={(e) => setVendorId(e.target.value ? +e.target.value : null)} className={inputClass}>
              <option value="">{lang === 'ar' ? '— اختر المورد —' : '— Select vendor —'}</option>
              {vendors.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <select value={branchId ?? ''} onChange={(e) => setBranchId(e.target.value ? +e.target.value : null)} className={inputClass}>
              <option value="">{lang === 'ar' ? '— اختر الفرع —' : '— Select branch —'}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.code ? `${b.code} - ` : ''}{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <select value={warehouseId ?? ''} onChange={(e) => setWarehouseId(e.target.value ? +e.target.value : null)} className={inputClass}>
              <option value="">{lang === 'ar' ? '— اختر المخزن —' : '— Select warehouse —'}</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.code ? `${w.code} - ` : ''}{w.name}</option>
              ))}
            </select>
          </div>
          <div>
            <input type="text" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} className={inputClass} placeholder={lang === 'ar' ? 'المرجع' : 'Reference'} />
          </div>
        </div>
        <div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder={t.notes} />
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-sm text-slate-600">{t.invoices?.item ?? 'الأصناف'}</span>
          <button type="button" onClick={addLine} className="flex items-center gap-1 text-primary-600 hover:text-primary-500 text-sm font-medium">
            <Plus size={16} /> {t.invoices?.addLine ?? 'إضافة بند'}
          </button>
        </div>
        <div className="overflow-x-auto overflow-y-visible">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th className="px-3 py-3 font-medium text-center w-10">{lang === 'ar' ? '#' : '#'}</th>
                <th className={`${textAlign} px-3 py-3 font-medium`} style={{ minWidth: 320 }}>{t.invoices?.item ?? 'الصنف'}</th>
                <th className={`${textAlign} px-3 py-3 font-medium w-24`}>{t.invoices?.unit ?? 'الوحدة'}</th>
                <th className={`${textAlign} px-3 py-3 font-medium`} style={{ minWidth: 100 }}>{t.invoices?.quantity ?? 'الكمية'}</th>
                <th className={`${textAlign} px-3 py-3 font-medium`} style={{ minWidth: 120 }}>{t.invoices?.unitPrice ?? 'س.الوحدة'}</th>
                <th className={`${textAlign} px-3 py-3 font-medium`} style={{ minWidth: 90 }}>{t.invoices?.discount ?? 'الخصم'} %</th>
                <th className={`${textAlign} px-3 py-3 font-medium`} style={{ minWidth: 90 }}>{t.invoices?.tax ?? 'الضريبة'} %</th>
                <th className={`${textAlign} px-3 py-3 font-medium`} style={{ minWidth: 120 }}>{t.amount ?? 'المبلغ'}</th>
                <th className="px-3 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {lines.map((line, idx) => {
                const lineAmount = line.quantity * line.unit_price
                const discount = lineAmount * (line.discount_percent / 100)
                const afterDiscount = lineAmount - discount
                const tax = afterDiscount * (line.tax_percent / 100)
                const lineTotal = afterDiscount + tax
                const isDragging = draggingIndex === idx
                const isDragOver = dragOverIndex === idx && draggingIndex !== null && draggingIndex !== idx
                return (
                  <tr
                    key={idx}
                    draggable
                    onDragStart={() => { setDraggingIndex(idx); setDragOverIndex(idx) }}
                    onDragOver={(e) => { e.preventDefault(); if (draggingIndex !== null && draggingIndex !== idx) setDragOverIndex(idx) }}
                    onDrop={(e) => {
                      e.preventDefault()
                      if (draggingIndex !== null && dragOverIndex !== null) moveLine(draggingIndex, dragOverIndex)
                      setDraggingIndex(null); setDragOverIndex(null); setOpenItemLineIdx(null); setItemSearchByLine({})
                    }}
                    onDragEnd={() => { setDraggingIndex(null); setDragOverIndex(null) }}
                    className={`hover:bg-slate-50 transition-colors ${isDragging ? 'bg-primary-50' : ''} ${isDragOver ? 'ring-2 ring-primary-300' : ''}`}
                  >
                    <td className="px-3 py-2 text-center align-top select-none text-slate-500">
                      <div className="inline-flex items-center gap-1">
                        <span className="text-xs font-medium tabular-nums">{idx + 1}</span>
                        <span className="cursor-grab text-slate-400 hover:text-slate-600"><GripVertical size={14} /></span>
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top" style={{ minWidth: 320 }}>
                      <input
                        ref={openItemLineIdx === idx ? (el) => { itemInputRef.current = el } : undefined}
                        type="text"
                        value={openItemLineIdx === idx ? (itemSearchByLine[idx] ?? '') : (line.item_id ? (items.find((i) => i.id === line.item_id)?.name ?? '') : '')}
                        onChange={(e) => { setItemSearchByLine((p) => ({ ...p, [idx]: e.target.value })); setOpenItemLineIdx(idx) }}
                        onFocus={() => { setOpenItemLineIdx(idx); if (!line.item_id) setItemSearchByLine((p) => ({ ...p, [idx]: p[idx] ?? '' })) }}
                        onBlur={() => setTimeout(() => setOpenItemLineIdx(null), 200)}
                        placeholder={lang === 'ar' ? 'بحث أو اختر صنف...' : 'Search or select item...'}
                        className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-inset focus:ring-primary-500"
                      />
                    </td>
                    <td className="px-3 py-2 text-slate-600 text-sm" style={{ minWidth: 120 }}>
                      {line.item_id ? (() => {
                        const it = items.find((i) => i.id === line.item_id) as (Item & { unit_options?: ItemUnitOption[]; unitOptions?: ItemUnitOption[]; item_unit?: { id: number; name: string; name_en?: string | null } }) | undefined
                        const opts = it?.unit_options ?? it?.unitOptions
                        const fromItem = opts && opts.length > 0
                          ? opts.map((o) => ({ id: o.unit_id, name: o.unit ? (lang === 'ar' ? o.unit.name : (o.unit.name_en || o.unit.name)) : `#${o.unit_id}` }))
                          : (it?.unit_id && it?.item_unit ? [{ id: it.unit_id, name: lang === 'ar' ? it.item_unit.name : (it.item_unit.name_en || it.item_unit.name) }] : [])
                        if (fromItem.length === 0) {
                          const u = it?.item_unit
                          return u ? (lang === 'ar' ? u.name : (u.name_en || u.name)) : '—'
                        }
                        return (
                          <select
                            value={String(line.unit_id ?? it?.unit_id ?? fromItem[0]?.id ?? '')}
                            onChange={(e) => {
                              const val = e.target.value
                              const uid = val ? Number(val) : null
                              const newPrice = it ? getPriceForUnit(it, uid) : 0
                              handleUnitChange(idx, uid, newPrice)
                            }}
                            className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-inset focus:ring-primary-500 bg-white"
                          >
                            {fromItem.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                          </select>
                        )
                      })() : '—'}
                    </td>
                    <td className="px-3 py-2" style={{ minWidth: 100 }}>
                      <input type="number" min={1} value={line.quantity} onChange={(e) => updateLine(idx, 'quantity', +e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-inset focus:ring-primary-500 min-w-[80px]" />
                    </td>
                    <td className="px-3 py-2" style={{ minWidth: 120 }}>
                      <input type="number" step="0.0001" min={0} value={typeof line.unit_price === 'number' ? line.unit_price : ''} onChange={(e) => updateLine(idx, 'unit_price', parseFloat(String(e.target.value)) || 0)} className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-inset focus:ring-primary-500 min-w-[90px]" />
                    </td>
                    <td className="px-3 py-2" style={{ minWidth: 90 }}>
                      <input type="number" step="0.01" min={0} max={100} value={line.discount_percent} onChange={(e) => updateLine(idx, 'discount_percent', +e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-inset focus:ring-primary-500 min-w-[70px]" />
                    </td>
                    <td className="px-3 py-2" style={{ minWidth: 90 }}>
                      <input type="number" step="0.01" min={0} max={100} value={line.tax_percent} onChange={(e) => updateLine(idx, 'tax_percent', +e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-inset focus:ring-primary-500 min-w-[70px]" />
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-900" style={{ minWidth: 120 }}>{fmt(lineTotal)}</td>
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => removeLine(idx)} disabled={lines.length <= 1} className="text-red-400 hover:text-red-600 disabled:opacity-30">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className={`border-t border-slate-200 p-4 flex ${isRtl ? 'justify-end' : 'justify-start'}`}>
          <div className="totals-container">
            <div className="total-row summary-row">
              <span className="total-label summary-label">{lang === 'ar' ? 'المجموع الفرعي' : 'Subtotal'}</span>
              <span className="total-value summary-value" dir="ltr">{fmtWithSymbol(subtotal)}</span>
            </div>
            <div className="total-row summary-row flex-wrap gap-2">
              <span className="total-label summary-label">{lang === 'ar' ? 'الخصم' : 'Discount'}</span>
              <div className="flex items-center gap-2 flex-wrap shrink-0 summary-value">
                <div className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-0.5" role="group">
                  <button type="button" onClick={() => setDiscountType('amount')} className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${discountType === 'amount' ? 'bg-white text-primary-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>{lang === 'ar' ? 'مبلغ' : 'Amount'}</button>
                  <button type="button" onClick={() => setDiscountType('percent')} className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${discountType === 'percent' ? 'bg-white text-primary-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>%</button>
                </div>
                <input type="text" inputMode="decimal" value={discountInputStr} onChange={(e) => setDiscountInputStr(e.target.value)} placeholder="0" className="w-20 sm:w-24 border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-left outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500/50 focus:border-primary-400 tabular-nums" />
                <span className="total-value" style={{ color: '#d9534f' }} dir="ltr">- {fmtWithSymbol(discountAmount)}</span>
              </div>
            </div>
            <div className="total-row summary-row">
              <span className="total-label summary-label">{lang === 'ar' ? 'الوعاء الضريبي' : 'Taxable Amount'}</span>
              <span className="total-value summary-value" dir="ltr">{fmtWithSymbol(taxBase)}</span>
            </div>
            <div className="total-row summary-row">
              <span className="total-label summary-label">{lang === 'ar' ? 'قيمة الضريبة (15%)' : 'VAT (15%)'}</span>
              <span className="total-value summary-value" dir="ltr">+ {fmtWithSymbol(taxTotal)}</span>
            </div>
            <div className="total-row summary-row grand-total-row">
              <span className="grand-total-label summary-label">{lang === 'ar' ? 'الصافي النهائي' : 'Grand Total'}</span>
              <span className="grand-total-value summary-value" dir="ltr">{fmtWithSymbol(total)}</span>
            </div>
          </div>
        </div>
      </div>

      {typeof document !== 'undefined' && itemDropdownRect !== null && openItemLineIdx !== null && createPortal(
        <div className="fixed z-[9999] bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden min-w-[200px]" style={{ top: itemDropdownRect.top, left: itemDropdownRect.left, width: Math.max(itemDropdownRect.width, 200), maxHeight: 'min(12rem, 50vh)' }}>
          <div className="max-h-48 overflow-y-auto overflow-x-hidden py-1" dir="ltr">
            {filterItemsBySearch(itemSearchByLine[openItemLineIdx] ?? '').slice(0, 50).map((item) => (
              <button key={item.id} type="button" className={`w-full px-3 py-2 text-sm hover:bg-slate-100 block ${isRtl ? 'text-right' : 'text-left'}`}
                onMouseDown={(e) => { e.preventDefault(); selectItem(openItemLineIdx, item.id); setItemSearchByLine((p) => ({ ...p, [openItemLineIdx]: '' })); setOpenItemLineIdx(null) }}>
                {item.name}{item.code ? ` (${item.code})` : ''}
              </button>
            ))}
            {filterItemsBySearch(itemSearchByLine[openItemLineIdx] ?? '').length === 0 && (
              <div className={`px-3 py-2 text-sm text-slate-500 ${isRtl ? 'text-right' : 'text-left'}`}>{lang === 'ar' ? 'لا توجد نتائج' : 'No items match'}</div>
            )}
          </div>
        </div>,
        document.body
      )}

      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-4 mt-6">
        <Link to="/purchase-requests" className="order-2 sm:order-1 rounded-lg px-4 py-2.5 text-sm border border-slate-300 text-slate-600 hover:bg-slate-50 hover:border-slate-400 transition-colors text-center sm:inline-block">{t.cancel}</Link>
        <button
          type="button"
          onClick={() => setShowSaveConfirm(true)}
          disabled={createMut.isPending || lines.every((l) => !l.item_id || l.quantity <= 0)}
          className="order-1 sm:order-2 w-full sm:w-auto sm:min-w-[180px] bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-6 py-3 text-sm font-semibold shadow-sm disabled:opacity-50 transition-colors"
        >
          {createMut.isPending ? t.saving : t.save}
        </button>
      </div>

      {showSaveConfirm && (
        <ConfirmDialog
          title={lang === 'ar' ? 'حفظ طلب الشراء' : 'Save Purchase Request'}
          message={lang === 'ar'
            ? 'هل تريد حفظ طلب الشراء؟ سيتم تفريغ محتويات الطلب وفتح طلب جديد.'
            : 'Do you want to save the purchase request? The form will be cleared and a new request will be opened.'}
          variant="warning"
          isLoading={createMut.isPending}
          confirmLabel={t.save}
          onConfirm={() => createMut.mutate(buildPayload())}
          onCancel={() => setShowSaveConfirm(false)}
        />
      )}
    </div>
  )
}
