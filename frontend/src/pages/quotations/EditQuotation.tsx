import { useState, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchQuotation, updateQuotation,
  fetchCustomers, fetchVendors, fetchItems, fetchBranches, fetchCostCenters,
} from '../../api/tenant'
import type { Quotation, Customer, Vendor, Item, Branch, CostCenter, PaginatedResponse } from '../../types'
import { formatAmount } from '../../utils/currency'
import { Plus, Trash2 } from 'lucide-react'

interface LineForm {
  item_id: number | null
  unit_id: number | null
  description: string
  quantity: number
  unit_price: number
  discount_percent: number
  tax_percent: number
}

export default function EditQuotation() {
  const { id } = useParams<{ id: string }>()
  const { currentTenant } = useAuth()
  const { t, isRtl } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: quotation, isLoading } = useQuery<Quotation>({
    queryKey: ['quotation', tenantId, id],
    queryFn: () => fetchQuotation(tenantId, Number(id)),
    enabled: !!tenantId && !!id,
  })

  const [status, setStatus] = useState<'draft' | 'approved'>('draft')
  const [date, setDate] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [vendorId, setVendorId] = useState<number | null>(null)
  const [branchId, setBranchId] = useState<number | null>(null)
  const [costCenterId, setCostCenterId] = useState<number | null>(null)
  const [referenceNumber, setReferenceNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<LineForm[]>([])

  useEffect(() => {
    if (!quotation) return
    setStatus(quotation.status === 'converted' ? 'approved' : (quotation.status as 'draft' | 'approved'))
    setDate(quotation.date?.slice?.(0, 10) ?? '')
    setValidUntil(quotation.valid_until?.slice?.(0, 10) ?? '')
    setCustomerId(quotation.customer_id ?? null)
    setVendorId(quotation.vendor_id ?? null)
    setBranchId(quotation.branch_id ?? null)
    setCostCenterId(quotation.cost_center_id ?? null)
    setReferenceNumber(quotation.reference_number ?? '')
    setNotes(quotation.notes ?? '')
    if (quotation.lines?.length) {
      setLines(quotation.lines.map((l) => ({
        item_id: l.item_id,
        unit_id: l.unit_id ?? null,
        description: l.description ?? '',
        quantity: Number(l.quantity),
        unit_price: Number(l.unit_price),
        discount_percent: Number(l.discount_percent ?? 0),
        tax_percent: Number(l.tax_percent ?? 0),
      })))
    } else {
      setLines([{ item_id: null, unit_id: null, description: '', quantity: 1, unit_price: 0, discount_percent: 0, tax_percent: 15 }])
    }
  }, [quotation])

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
    queryKey: ['items', tenantId],
    queryFn: () => fetchItems(tenantId, { per_page: '500' }),
    enabled: !!tenantId,
  })
  const { data: branches = [] } = useQuery<Branch[]>({ queryKey: ['branches', tenantId], queryFn: () => fetchBranches(tenantId), enabled: !!tenantId })
  const { data: costCenters = [] } = useQuery<CostCenter[]>({ queryKey: ['cost-centers', tenantId], queryFn: () => fetchCostCenters(tenantId), enabled: !!tenantId })

  const customers = customersData?.data ?? []
  const vendors = vendorsData?.data ?? []
  const items = itemsData?.data ?? []

  const updateMut = useMutation({
    mutationFn: (data: Record<string, unknown>) => updateQuotation(tenantId, Number(id), data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] })
      queryClient.invalidateQueries({ queryKey: ['quotation', tenantId, id] })
      navigate(`/invoices/quotations/${id}`)
    },
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

  const total = lines.reduce((sum, l) => {
    const amt = l.quantity * l.unit_price * (1 - l.discount_percent / 100)
    const tax = amt * (l.tax_percent / 100)
    return sum + amt + tax
  }, 0)

  function buildPayload() {
    const type = customerId ? 'sales' : (vendorId ? 'purchase' : 'sales')
    return {
      type,
      status: quotation?.status === 'converted' ? 'approved' : status,
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

  if (isLoading || !quotation) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-600 border-t-transparent" />
      </div>
    )
  }
  if (quotation.status === 'converted') {
    return (
      <div className="p-6 text-center">
        <p className="text-slate-600">لا يمكن تعديل عرض سعر تم تحويله إلى فاتورة.</p>
        <Link to={`/invoices/quotations/${id}`} className="text-primary-600 mt-2 inline-block">{t.back}</Link>
      </div>
    )
  }

  const textAlign = isRtl ? 'text-right' : 'text-left'

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">{t.edit} {quotation.number}</h1>
        <Link to={`/invoices/quotations/${id}`} className="text-slate-600 hover:text-slate-900 text-sm">{t.back}</Link>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm text-slate-600 mb-1">{t.invoices?.customer ?? 'العميل'}</label>
            <select value={customerId ?? ''} onChange={(e) => setCustomerId(e.target.value ? +e.target.value : null)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
              <option value="">—</option>
              {customers.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">{t.invoices?.vendor ?? 'المورد'}</label>
            <select value={vendorId ?? ''} onChange={(e) => setVendorId(e.target.value ? +e.target.value : null)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
              <option value="">—</option>
              {vendors.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">{t.status}</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as 'draft' | 'approved')} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
              <option value="draft">مسودة</option>
              <option value="approved">معتمد</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">{t.date}</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">صالح حتى</label>
            <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">{t.invoices?.branch}</label>
            <select value={branchId ?? ''} onChange={(e) => setBranchId(e.target.value ? +e.target.value : null)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
              <option value="">—</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">{t.invoices?.costCenter}</label>
            <select value={costCenterId ?? ''} onChange={(e) => setCostCenterId(e.target.value ? +e.target.value : null)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
              <option value="">—</option>
              {costCenters.map((cc) => (
                <option key={cc.id} value={cc.id}>{cc.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">{t.invoices?.referenceNumber}</label>
            <input type="text" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-sm text-slate-600 mb-1">{t.notes}</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr className="bg-slate-50 text-slate-600">
              <th className={`${textAlign} px-3 py-2`}>{t.invoices?.item ?? 'الصنف'}</th>
              <th className={`${textAlign} px-3 py-2`}>{t.invoices?.quantity ?? 'الكمية'}</th>
              <th className={`${textAlign} px-3 py-2`}>{t.invoices?.unitPrice ?? 'س.الوحدة'}</th>
              <th className={`${textAlign} px-3 py-2`}>% {t.invoices?.discount ?? 'خصم'}</th>
              <th className={`${textAlign} px-3 py-2`}>% {t.invoices?.tax ?? 'ضريبة'}</th>
              <th className={`${textAlign} px-3 py-2 w-20`}></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx} className="border-t border-slate-100">
                <td className="px-3 py-2">
                  <select value={line.item_id ?? ''} onChange={(e) => selectItem(idx, +e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1 text-sm">
                    <option value="">—</option>
                    {items.map((i) => (
                      <option key={i.id} value={i.id}>{i.name} ({i.code})</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input type="number" min="0.0001" step="any" value={line.quantity} onChange={(e) => updateLine(idx, 'quantity', +e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1 text-sm" />
                </td>
                <td className="px-3 py-2">
                  <input type="number" min="0" step="0.01" value={line.unit_price} onChange={(e) => updateLine(idx, 'unit_price', +e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1 text-sm" />
                </td>
                <td className="px-3 py-2">
                  <input type="number" min="0" max="100" step="0.01" value={line.discount_percent} onChange={(e) => updateLine(idx, 'discount_percent', +e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1 text-sm" />
                </td>
                <td className="px-3 py-2">
                  <input type="number" min="0" max="100" step="0.01" value={line.tax_percent} onChange={(e) => updateLine(idx, 'tax_percent', +e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1 text-sm" />
                </td>
                <td className="px-3 py-2">
                  <button type="button" onClick={() => setLines((p) => p.filter((_, i) => i !== idx))} className="text-red-500 hover:text-red-700 p-1" disabled={lines.length <= 1}>
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-3 py-2 border-t border-slate-200 flex justify-between items-center">
          <button type="button" onClick={() => setLines((p) => [...p, { item_id: null, unit_id: null, description: '', quantity: 1, unit_price: 0, discount_percent: 0, tax_percent: 15 }])} className="flex items-center gap-1 text-primary-600 text-sm">
            <Plus size={16} /> {t.invoices?.addLine ?? 'إضافة بند'}
          </button>
          <span className="font-bold">{t.total}: {formatAmount(total, { decimal_places: 2 }, 'ar-u-nu-latn')}</span>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => updateMut.mutate(buildPayload())}
          disabled={updateMut.isPending || lines.every((l) => !l.item_id || l.quantity <= 0)}
          className="bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {updateMut.isPending ? t.saving : t.save}
        </button>
        <Link to={`/invoices/quotations/${id}`} className="rounded-lg px-4 py-2 text-sm border border-slate-300 text-slate-700 hover:bg-slate-50">{t.cancel}</Link>
      </div>
    </div>
  )
}
