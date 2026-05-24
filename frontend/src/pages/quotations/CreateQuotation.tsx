import { useState, useEffect, useRef, useMemo } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchCustomers, fetchVendors, fetchItemsForFilter, fetchBranches, fetchCostCenters,
  createQuotation, fetchQuotation,
} from '../../api/tenant'
import type { PaginatedResponse } from '../../types'
import type { Customer, Vendor, Item, Branch, CostCenter, Quotation } from '../../types'
import { formatAmount } from '../../utils/currency'
import { Plus, Trash2, ArrowUp, ArrowDown, Printer } from 'lucide-react'
import SearchableSelect, { type SearchableSelectOption } from '../../components/ui/SearchableSelect'

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
  tax_percent: 15,
}

export default function CreateQuotation() {
  const { currentTenant } = useAuth()
  const { t, isRtl, lang } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const chooseLabel = lang === 'ar' ? 'اختر' : 'Select'
  const headerFieldClass = 'w-full h-9 border border-slate-300 rounded-lg px-3 text-sm bg-white leading-normal'
  const [status, setStatus] = useState<'draft' | 'approved'>('draft')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [validUntil, setValidUntil] = useState('')
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [vendorId, setVendorId] = useState<number | null>(null)
  const [branchId, setBranchId] = useState<number | null>(null)
  const [costCenterId, setCostCenterId] = useState<number | null>(null)
  const [referenceNumber, setReferenceNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<LineForm[]>([{ ...emptyLine }])

  const copyFromQuotationId = (location.state as { copyFromQuotationId?: number } | null)?.copyFromQuotationId
  const appliedCopyRef = useRef(false)
  const { data: copyFromQuotation } = useQuery<Quotation>({
    queryKey: ['quotation', tenantId, copyFromQuotationId],
    queryFn: () => fetchQuotation(tenantId, copyFromQuotationId!),
    enabled: !!tenantId && !!copyFromQuotationId,
  })
  useEffect(() => {
    if (!copyFromQuotation || appliedCopyRef.current) return
    appliedCopyRef.current = true
    setStatus(copyFromQuotation.status === 'converted' ? 'draft' : (copyFromQuotation.status as 'draft' | 'approved'))
    setDate(copyFromQuotation.date?.slice?.(0, 10) ?? new Date().toISOString().slice(0, 10))
    setValidUntil(copyFromQuotation.valid_until?.slice?.(0, 10) ?? '')
    setCustomerId(copyFromQuotation.customer_id ?? null)
    setVendorId(copyFromQuotation.vendor_id ?? null)
    setBranchId(copyFromQuotation.branch_id ?? null)
    setCostCenterId(copyFromQuotation.cost_center_id ?? null)
    setReferenceNumber(copyFromQuotation.reference_number ?? '')
    setNotes(copyFromQuotation.notes ?? '')
    if (copyFromQuotation.lines?.length) {
      setLines(copyFromQuotation.lines.map((l) => ({
        item_id: l.item_id ?? null,
        unit_id: l.unit_id ?? null,
        description: l.description ?? '',
        quantity: Number(l.quantity),
        unit_price: Number(l.unit_price),
        discount_percent: Number(l.discount_percent ?? 0),
        tax_percent: Number(l.tax_percent ?? 0),
      })))
    }
  }, [copyFromQuotation])

  const { data: customersData } = useQuery<PaginatedResponse<Customer>>({
    queryKey: ['customers', tenantId, branchId],
    queryFn: () =>
      fetchCustomers(tenantId, {
        per_page: '500',
        ...(branchId != null ? { branch_id: String(branchId) } : {}),
      }),
    enabled: !!tenantId,
  })
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
    queryKey: ['items', tenantId, 'quotation-lines'],
    queryFn: () => fetchItemsForFilter(tenantId, { per_page: '2000' }),
    enabled: !!tenantId,
  })
  const items = itemsData?.data ?? []
  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchBranches(tenantId),
    enabled: !!tenantId,
  })
  const { data: costCenters = [] } = useQuery<CostCenter[]>({
    queryKey: ['cost-centers', tenantId],
    queryFn: () => fetchCostCenters(tenantId),
    enabled: !!tenantId,
  })

  const customers = customersData?.data ?? []
  const vendors = vendorsData?.data ?? []

  const createMut = useMutation({
    mutationFn: (data: Record<string, unknown>) => createQuotation(tenantId, data),
  })

  function updateLine(index: number, field: keyof LineForm, value: string | number | null) {
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
        unit_id: (item as Item & { unit_id?: number }).unit_id ?? null,
        description: item.name,
        unit_price: vendorId ? item.cost_price : item.selling_price,
      }
      return next
    })
  }

  function unitChoicesForItem(item: Item | undefined | null): { id: number; name: string; selling?: number | null; cost?: number | null }[] {
    if (!item) return []
    const list: { id: number; name: string; selling?: number | null; cost?: number | null }[] = []
    const baseUnitId = item.unit_id ?? null
    const baseName = item.item_unit?.name ?? item.unit ?? ''
    if (baseUnitId != null && baseName) {
      list.push({ id: baseUnitId, name: baseName, selling: item.selling_price, cost: item.cost_price })
    }
    const opts = Array.isArray(item.unit_options) ? item.unit_options : []
    for (const o of opts) {
      const uid = o.unit_id
      const uname = o.unit?.name ?? ''
      if (!uid || !uname) continue
      // avoid duplicates with base unit
      if (list.some((x) => x.id === uid)) continue
      list.push({ id: uid, name: uname, selling: o.selling_price, cost: o.cost_price })
    }
    return list
  }

  function onUnitChange(lineIndex: number, unitId: number) {
    const line = lines[lineIndex]
    const item = line?.item_id ? items.find((i) => i.id === line.item_id) : undefined
    if (!item) return
    const choices = unitChoicesForItem(item)
    const chosen = choices.find((c) => c.id === unitId)
    updateLine(lineIndex, 'unit_id', unitId || null)
    if (chosen) {
      const price = vendorId ? chosen.cost : chosen.selling
      if (price != null && !Number.isNaN(Number(price))) {
        updateLine(lineIndex, 'unit_price', Number(price))
      }
    }
  }

  const total = lines.reduce((sum, l) => {
    const amt = l.quantity * l.unit_price * (1 - l.discount_percent / 100)
    const tax = amt * (l.tax_percent / 100)
    return sum + amt + tax
  }, 0)

  function lineTotal(l: LineForm) {
    const amt = Number(l.quantity) * Number(l.unit_price) * (1 - Number(l.discount_percent) / 100)
    const tax = amt * (Number(l.tax_percent) / 100)
    return amt + tax
  }

  function moveLine(index: number, dir: -1 | 1) {
    setLines((prev) => {
      const nextIndex = index + dir
      if (nextIndex < 0 || nextIndex >= prev.length) return prev
      const next = [...prev]
      const tmp = next[index]
      next[index] = next[nextIndex]
      next[nextIndex] = tmp
      return next
    })
  }

  async function handleSave(printAfter: boolean) {
    try {
      const q = await createMut.mutateAsync(buildPayload() as unknown as Record<string, unknown>)
      queryClient.invalidateQueries({ queryKey: ['quotations'] })
      navigate(`/invoices/quotations/${(q as { id: number }).id}`, { state: printAfter ? { autoPrint: true } : undefined })
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (lang === 'ar' ? 'فشل الحفظ' : 'Save failed')
      window.alert(msg)
    }
  }

  function buildPayload() {
    const type = customerId ? 'sales' : (vendorId ? 'purchase' : 'sales')
    return {
      type,
      status,
      date,
      valid_until: validUntil || null,
      customer_id: customerId,
      vendor_id: vendorId,
      branch_id: branchId,
      cost_center_id: costCenterId,
      reference_number: referenceNumber || null,
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
  const itemOptions: SearchableSelectOption[] = useMemo(() => {
    const base: SearchableSelectOption[] = [{ value: 0, label: chooseLabel, primaryLabel: chooseLabel, searchText: chooseLabel }]
    const opts = items.map((i) => {
      const code = (i as unknown as { code?: string }).code ?? ''
      const barcode = (i as unknown as { barcode?: string }).barcode ?? ''
      return {
        value: i.id,
        label: code ? `${i.name} (${code})` : i.name,
        primaryLabel: i.name,
        secondaryLabel: code || undefined,
        searchText: `${i.name} ${code} ${barcode}`.trim(),
      } as SearchableSelectOption
    })
    return [...base, ...opts]
  }, [items, chooseLabel])

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">{t.add} {t.nav?.quotations ?? 'عرض سعر'}</h1>
        <Link to="/invoices/quotations" className="text-slate-600 hover:text-slate-900 text-sm">{t.back}</Link>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* العميل */}
          <div>
            <label className="block text-sm text-slate-600 mb-1">{t.invoices?.customer ?? 'العميل'}</label>
            <select value={customerId ?? ''} onChange={(e) => setCustomerId(e.target.value ? +e.target.value : null)} className={headerFieldClass}>
              <option value="">{chooseLabel}</option>
              {customers.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          {/* المورد */}
          <div>
            <label className="block text-sm text-slate-600 mb-1">{t.invoices?.vendor ?? 'المورد'}</label>
            <select value={vendorId ?? ''} onChange={(e) => setVendorId(e.target.value ? +e.target.value : null)} className={headerFieldClass}>
              <option value="">{chooseLabel}</option>
              {vendors.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          {/* التاريخ */}
          <div>
            <label className="block text-sm text-slate-600 mb-1">{t.date}</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={headerFieldClass} />
          </div>
          {/* صالح حتى */}
          <div>
            <label className="block text-sm text-slate-600 mb-1">صالح حتى</label>
            <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className={headerFieldClass} />
          </div>
          {/* الحالة */}
          <div>
            <label className="block text-sm text-slate-600 mb-1">{t.status}</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as 'draft' | 'approved')} className={headerFieldClass}>
              <option value="draft">مسودة</option>
              <option value="approved">معتمد</option>
            </select>
          </div>
          {/* الفرع */}
          <div>
            <label className="block text-sm text-slate-600 mb-1">{t.invoices?.branch}</label>
            <select value={branchId ?? ''} onChange={(e) => setBranchId(e.target.value ? +e.target.value : null)} className={headerFieldClass}>
              <option value="">{chooseLabel}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          {/* مركز التكلفة */}
          <div>
            <label className="block text-sm text-slate-600 mb-1">{t.invoices?.costCenter}</label>
            <select value={costCenterId ?? ''} onChange={(e) => setCostCenterId(e.target.value ? +e.target.value : null)} className={headerFieldClass}>
              <option value="">{chooseLabel}</option>
              {costCenters.map((cc) => (
                <option key={cc.id} value={cc.id}>{cc.name}</option>
              ))}
            </select>
          </div>
          {/* الرقم المرجعي */}
          <div>
            <label className="block text-sm text-slate-600 mb-1">{t.invoices?.referenceNumber}</label>
            <input type="text" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} className={headerFieldClass} placeholder={chooseLabel} />
          </div>
        </div>
        <div>
          <label className="block text-sm text-slate-600 mb-1">{t.notes}</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="bg-slate-50 text-slate-600">
              <th className={`${textAlign} px-2 py-2 min-w-[260px]`}>{t.invoices?.item ?? 'الصنف'}</th>
              <th className={`${textAlign} px-2 py-2 min-w-[140px]`}>{t.invoices?.unit ?? 'الوحدة'}</th>
              <th className={`${textAlign} px-2 py-2 w-[110px]`}>{t.invoices?.quantity ?? 'الكمية'}</th>
              <th className={`${textAlign} px-2 py-2 w-[140px]`}>{t.invoices?.unitPrice ?? 'س.الوحدة'}</th>
              <th className={`${textAlign} px-2 py-2 w-[110px]`}>% {t.invoices?.discount ?? 'خصم'}</th>
              <th className={`${textAlign} px-2 py-2 w-[110px]`}>% {t.invoices?.tax ?? 'ضريبة'}</th>
              <th className={`${textAlign} px-2 py-2 w-[150px]`}>{lang === 'ar' ? 'إجمالي السطر' : 'Line total'}</th>
              <th className={`${textAlign} px-2 py-2 w-24`}></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx} className="border-t border-slate-100">
                <td className="px-2 py-2 min-w-[260px]">
                  <SearchableSelect
                    options={itemOptions}
                    value={line.item_id ?? 0}
                    onChange={(v) => {
                      const id = v == null ? 0 : Number(v)
                      if (!id) {
                        updateLine(idx, 'item_id', null)
                        updateLine(idx, 'unit_id', null)
                        updateLine(idx, 'description', '')
                        updateLine(idx, 'unit_price', 0)
                        return
                      }
                      selectItem(idx, id)
                    }}
                    placeholder={chooseLabel}
                    textAlign={isRtl ? 'right' : 'left'}
                    wrapOptions
                    matchTriggerWidth
                    className="w-full min-w-0"
                  />
                </td>
                <td className="px-2 py-2 min-w-[140px]">
                  {(() => {
                    const it = line.item_id ? items.find((i) => i.id === line.item_id) : undefined
                    const unitChoices = unitChoicesForItem(it)
                    const disabled = !it || unitChoices.length === 0
                    return (
                      <select
                        value={line.unit_id ?? ''}
                        onChange={(e) => onUnitChange(idx, e.target.value ? Number(e.target.value) : 0)}
                        disabled={disabled}
                        className="w-full h-9 border border-slate-300 rounded px-2 text-sm bg-white disabled:bg-slate-50 disabled:text-slate-500"
                      >
                        <option value="">{chooseLabel}</option>
                        {unitChoices.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                    )
                  })()}
                </td>
                <td className="px-2 py-2">
                  <input
                    type="number"
                    min="0.0001"
                    step="any"
                    value={line.quantity}
                    onChange={(e) => updateLine(idx, 'quantity', +e.target.value)}
                    className="w-[100px] h-9 border border-slate-300 rounded px-2 text-sm"
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.unit_price}
                    onChange={(e) => updateLine(idx, 'unit_price', +e.target.value)}
                    className="w-[130px] h-9 border border-slate-300 rounded px-2 text-sm"
                  />
                </td>
                <td className="px-2 py-2">
                  <input type="number" min="0" max="100" step="0.01" value={line.discount_percent} onChange={(e) => updateLine(idx, 'discount_percent', +e.target.value)} className="w-[100px] h-9 border border-slate-300 rounded px-2 text-sm" />
                </td>
                <td className="px-2 py-2">
                  <input type="number" min="0" max="100" step="0.01" value={line.tax_percent} onChange={(e) => updateLine(idx, 'tax_percent', +e.target.value)} className="w-[100px] h-9 border border-slate-300 rounded px-2 text-sm" />
                </td>
                <td className="px-2 py-2">
                  <input
                    value={formatAmount(lineTotal(line), { decimal_places: 2 }, 'ar-u-nu-latn')}
                    readOnly
                    className={`w-[140px] h-9 border border-slate-200 rounded px-2 text-sm bg-slate-50 text-slate-900 ${isRtl ? 'text-right' : 'text-left'} tabular-nums`}
                  />
                </td>
                <td className="px-2 py-2">
                  <div className={`flex items-center gap-1.5 ${isRtl ? 'justify-end' : ''}`}>
                    <button
                      type="button"
                      onClick={() => moveLine(idx, -1)}
                      className="p-1 rounded hover:bg-slate-100 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
                      disabled={idx === 0}
                      title={lang === 'ar' ? 'تحريك للأعلى' : 'Move up'}
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveLine(idx, 1)}
                      className="p-1 rounded hover:bg-slate-100 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
                      disabled={idx === lines.length - 1}
                      title={lang === 'ar' ? 'تحريك للأسفل' : 'Move down'}
                    >
                      <ArrowDown size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setLines((p) => p.filter((_, i) => i !== idx))}
                      className="p-1 rounded hover:bg-red-50 text-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
                      disabled={lines.length <= 1}
                      title={t.delete ?? (lang === 'ar' ? 'حذف' : 'Delete')}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-3 py-2 border-t border-slate-200 flex justify-between items-center">
          <button type="button" onClick={() => setLines((p) => [...p, { ...emptyLine }])} className="flex items-center gap-1 text-primary-600 text-sm">
            <Plus size={16} /> {t.invoices?.addLine ?? 'إضافة بند'}
          </button>
          <span className="font-bold">{t.total}: {formatAmount(total, { decimal_places: 2 }, 'ar-u-nu-latn')}</span>
        </div>
      </div>

      {/* ملاحظة: في RTL يكون flex-start يمين و flex-end يسار */}
      <div className="flex items-center gap-2 justify-end">
        {/* في RTL: نضع "إلغاء" في أقصى اليمين، ثم "حفظ" ثم "حفظ وطباعة" بجواره */}
        {isRtl ? (
          <>
            <Link to="/invoices/quotations" className="rounded-lg px-4 h-9 inline-flex items-center text-sm border border-slate-300 text-slate-700 hover:bg-slate-50">
              {t.cancel}
            </Link>
            <button
              type="button"
              onClick={() => void handleSave(false)}
              disabled={createMut.isPending || lines.every((l) => !l.item_id || l.quantity <= 0)}
              className="bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-4 h-9 inline-flex items-center text-sm font-medium disabled:opacity-50"
            >
              {createMut.isPending ? t.saving : t.save}
            </button>
            <button
              type="button"
              onClick={() => void handleSave(true)}
              disabled={createMut.isPending || lines.every((l) => !l.item_id || l.quantity <= 0)}
              className="bg-[#344054] hover:bg-[#2d3846] text-white rounded-lg px-4 h-9 inline-flex items-center gap-2 text-sm font-medium disabled:opacity-50"
              title={lang === 'ar' ? 'حفظ وطباعة' : 'Save & Print'}
            >
              <Printer size={16} />
              {lang === 'ar' ? 'حفظ وطباعة' : 'Save & Print'}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void handleSave(false)}
              disabled={createMut.isPending || lines.every((l) => !l.item_id || l.quantity <= 0)}
              className="bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-4 h-9 inline-flex items-center text-sm font-medium disabled:opacity-50"
            >
              {createMut.isPending ? t.saving : t.save}
            </button>
            <button
              type="button"
              onClick={() => void handleSave(true)}
              disabled={createMut.isPending || lines.every((l) => !l.item_id || l.quantity <= 0)}
              className="bg-[#344054] hover:bg-[#2d3846] text-white rounded-lg px-4 h-9 inline-flex items-center gap-2 text-sm font-medium disabled:opacity-50"
              title={lang === 'ar' ? 'حفظ وطباعة' : 'Save & Print'}
            >
              <Printer size={16} />
              {lang === 'ar' ? 'حفظ وطباعة' : 'Save & Print'}
            </button>
            <Link to="/invoices/quotations" className="rounded-lg px-4 h-9 inline-flex items-center text-sm border border-slate-300 text-slate-700 hover:bg-slate-50">
              {t.cancel}
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
