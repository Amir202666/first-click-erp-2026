import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  fetchBom,
  fetchItems,
  fetchItem,
  createBom,
  updateBom,
  fetchSettings,
} from '../../api/tenant'
import type { BillOfMaterial, BillOfMaterialLine, Item, ItemUnitOption, PaginatedResponse, TenantSettings } from '../../types'
import { coerceDecimalPlaces, formatAmount } from '../../utils/currency'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import Toast, { type ToastType } from '../../components/ui/Toast'
import SearchableSelect, { type SearchableSelectOption } from '../../components/ui/SearchableSelect'

interface LineRow {
  component_item_id: number | null
  quantity: number
  unit_id: number | null
  unit_cost: number | null
}

export default function BomForm() {
  const { currentTenant } = useAuth()
  const { t, lang } = useLanguage()
  const tenantId = currentTenant?.id ?? 0
  const navigate = useNavigate()
  const { id } = useParams()
  const queryClient = useQueryClient()
  const isEdit = Boolean(id)
  const bomId = id ? parseInt(id, 10) : 0

  const [finishedItemId, setFinishedItemId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [lines, setLines] = useState<LineRow[]>([{ component_item_id: null, quantity: 1, unit_id: null, unit_cost: null }])
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)

  const { data: settings } = useQuery<TenantSettings>({
    queryKey: ['settings', tenantId],
    queryFn: () => fetchSettings(tenantId),
    enabled: !!tenantId,
  })
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US'
  const fmt = (n: number) => formatAmount(Number(n), { decimal_places: coerceDecimalPlaces(settings?.doc_amount_decimals, 2) }, locale)

  const { data: itemsData } = useQuery<PaginatedResponse<Item>>({
    queryKey: ['items', tenantId],
    queryFn: () => fetchItems(tenantId, { per_page: '500' }),
    enabled: !!tenantId,
  })
  const items = itemsData?.data ?? []

  const componentItemOptions: SearchableSelectOption[] = useMemo(() => {
    return items
      .filter((i) => i.id !== finishedItemId)
      .map((i) => ({ value: i.id, label: `${i.code ?? ''} — ${i.name}`.trim() }))
  }, [items, finishedItemId])

  const finishedItemOptions: SearchableSelectOption[] = useMemo(() => {
    return items.map((i) => ({ value: i.id, label: `${i.code ?? ''} — ${i.name}`.trim() }))
  }, [items])

  const { data: bom, isLoading: bomLoading } = useQuery<BillOfMaterial>({
    queryKey: ['bom', tenantId, bomId],
    queryFn: () => fetchBom(tenantId, bomId),
    enabled: !!tenantId && isEdit && bomId > 0,
  })

  useEffect(() => {
    if (!bom) return
    setFinishedItemId(bom.finished_item_id)
    setName(bom.name ?? '')
    setIsActive(bom.is_active)
    const ln = (bom.lines ?? []).length
    setLines(
      ln
        ? bom.lines!.map((l: BillOfMaterialLine) => ({
            component_item_id: l.component_item_id,
            quantity: Number(l.quantity),
            unit_id: l.unit_id ?? null,
            unit_cost: l.unit_cost != null ? Number(l.unit_cost) : null,
          }))
        : [{ component_item_id: null, quantity: 1, unit_id: null, unit_cost: null }]
    )
  }, [bom])

  const onComponentItemChange = (idx: number, value: number | null) => {
    updateLine(idx, 'component_item_id', value)
    if (value) setLineUnitCostFromAverage(idx, value)
    else updateLine(idx, 'unit_cost', null)
  }

  const createMut = useMutation({
    mutationFn: (payload: Record<string, unknown>) => createBom(tenantId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boms', tenantId] })
      navigate('/manufacturing/bom')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? (t.msg?.errorOccurred ?? 'حدث خطأ')
      setToast({ message: msg, type: 'error' })
    },
  })

  const updateMut = useMutation({
    mutationFn: (payload: Record<string, unknown>) => updateBom(tenantId, bomId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boms', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['bom', tenantId, bomId] })
      navigate('/manufacturing/bom')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? (t.msg?.errorOccurred ?? 'حدث خطأ')
      setToast({ message: msg, type: 'error' })
    },
  })

  const addLine = () => setLines((prev) => [...prev, { component_item_id: null, quantity: 1, unit_id: null, unit_cost: null }])
  const removeLine = (idx: number) => setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)))
  const updateLine = (idx: number, field: keyof LineRow, value: number | null) => {
    setLines((prev) => {
      const next = [...prev]
      if (field === 'component_item_id') next[idx].component_item_id = value as number
      else if (field === 'quantity') next[idx].quantity = value as number
      else if (field === 'unit_id') next[idx].unit_id = value as number | null
      else if (field === 'unit_cost') next[idx].unit_cost = value
      return next
    })
  }

  const setLineUnitCostFromAverage = (idx: number, itemId: number) => {
    fetchItem(tenantId, itemId)
      .then((item) => {
        setLines((prev) => {
          const next = [...prev]
          const row = next[idx]
          if (!row) return prev
          const it = item as Item & { average_cost?: number; unit_options?: ItemUnitOption[]; unitOptions?: ItemUnitOption[]; item_unit?: { id: number; name: string; name_en?: string | null } }
          const baseAvg = (it.average_cost ?? it.cost_price ?? 0) as number
          const opts = it.unit_options ?? it.unitOptions
          let costForUnit = baseAvg
          if (row.unit_id && opts && opts.length > 0) {
            const unitOpt = opts.find((o) => o.unit_id === row.unit_id)
            if (unitOpt) {
              if (typeof unitOpt.cost_price === 'number' && unitOpt.cost_price > 0) {
                costForUnit = unitOpt.cost_price
              } else if (unitOpt.conversion_factor && unitOpt.conversion_factor > 0) {
                // نفترض أن المتوسط على الوحدة الأساسية، ونحوّله حسب معامل التحويل
                costForUnit = baseAvg * unitOpt.conversion_factor
              }
            }
          }
          row.unit_cost = Number(costForUnit)
          return next
        })
      })
      .catch(() => {})
  }

  const totalCost = lines.reduce((sum, row) => {
    if (!row.component_item_id) return sum
    const cost = row.unit_cost != null ? row.unit_cost : 0
    return sum + row.quantity * cost
  }, 0)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!finishedItemId) {
      setToast({ message: 'اختر المنتج النهائي', type: 'error' })
      return
    }
    const validLines = lines.filter((l) => l.component_item_id != null && l.quantity > 0)
    if (validLines.length === 0) {
      setToast({ message: 'أضف مكوّن واحد على الأقل', type: 'error' })
      return
    }
    // حفظ الاسم كما في النافذة: إن وُجد اسم اختياري مُدخل نستخدمه، وإلا اسم المنتج النهائي المعروض (كود - اسم)
    const trimmedName = typeof name === 'string' ? name.trim() : ''
    const finishedItemLabel = finishedItemOptions.find((o) => o.value === finishedItemId)?.label ?? null
    const nameToSave = trimmedName || finishedItemLabel || null
    const payload = {
      finished_item_id: finishedItemId,
      name: nameToSave,
      is_active: isActive,
      lines: validLines.map((l, i) => ({
        component_item_id: l.component_item_id,
        quantity: l.quantity,
        unit_id: l.unit_id,
        sort_order: i,
      })),
    }
    if (isEdit) updateMut.mutate(payload)
    else createMut.mutate(payload)
  }

  const saving = createMut.isPending || updateMut.isPending

  if (isEdit && bomLoading) {
    return (
      <div className="w-full max-w-full p-4 flex items-center justify-center">
        <span className="text-slate-500">{t.loading}</span>
      </div>
    )
  }

  return (
    <div className="w-full max-w-full min-w-0 p-3 md:p-4 space-y-3">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => navigate('/manufacturing/bom')} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold text-slate-900">{isEdit ? (t.edit ?? 'تعديل') : (t.add ?? 'إضافة')} — {t.nav?.bom ?? 'قائمة المواد'}</h1>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.name} (المنتج النهائي) *</label>
            <SearchableSelect
              options={finishedItemOptions}
              value={finishedItemId}
              onChange={(v) => setFinishedItemId(v != null ? Number(v) : null)}
              placeholder="—"
              required
              className="text-sm border-slate-300 rounded-lg py-2"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700 mb-1">{t.name} (اختياري)</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-inset focus:ring-primary-500/20 focus:border-primary-500 outline-none transition"
              placeholder="اسم BOM"
            />
          </div>
          <div className="flex items-center gap-3 pt-8">
            <input
              type="checkbox"
              id="is_active"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded border-slate-300 text-primary-600 focus:ring-primary-500 h-4 w-4"
            />
            <label htmlFor="is_active" className="text-sm font-medium text-slate-700 cursor-pointer">{t.active}</label>
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-slate-800">المكونات (المواد الخام)</span>
            <button
              type="button"
              onClick={addLine}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200 transition"
            >
              <Plus className="h-4 w-4" /> إضافة سطر
            </button>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm w-full overflow-hidden flex flex-col max-h-[50vh]">
            <div className="overflow-x-auto overflow-y-auto min-h-0 flex-1">
              <table className="w-full text-sm min-w-[620px] table-fixed border-collapse">
                <thead className="bg-slate-100 border-b-2 border-slate-200 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700 w-[36%]">الصنف</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700 w-[14%]">الكمية</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700 w-[18%]">الوحدة</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700 w-[22%]">م . التكلفة</th>
                    <th className="px-2 py-3 w-12 shrink-0"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((row, idx) => (
                    <tr key={idx} className="bg-white hover:bg-slate-50/80 transition">
                      <td className="px-4 py-2 align-middle">
                        <div className="flex items-center gap-1.5 w-full min-w-0">
                          <div className="flex-1 min-w-0">
                            <SearchableSelect
                              options={componentItemOptions}
                              value={row.component_item_id}
                              onChange={(v) => onComponentItemChange(idx, v != null ? Number(v) : null)}
                              placeholder="بحث أو اختر..."
                              className="!py-2 !text-sm min-h-0 border-slate-300 rounded-lg"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => navigate('/items', { state: { openAddModal: true } })}
                            className="shrink-0 p-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-primary-50 hover:border-primary-400 hover:text-primary-600 transition"
                            title={lang === 'ar' ? 'فتح نافذة إضافة الأصناف' : 'Open full add item form'}
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-2 align-middle">
                        <input
                          type="number"
                          min="0.0001"
                          step="any"
                          value={row.quantity === 0 ? '' : Number(row.quantity)}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value)
                            updateLine(idx, 'quantity', Number.isFinite(v) && v >= 0 ? v : 0)
                          }}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-right tabular-nums focus:ring-2 focus:ring-inset focus:ring-primary-500/20 focus:border-primary-500 outline-none"
                        />
                      </td>
                      <td className="px-4 py-2 align-middle">
                        {row.component_item_id ? (() => {
                          const it = items.find((i) => i.id === row.component_item_id) as (Item & { unit_options?: { unit_id: number; unit?: { id: number; name: string; name_en?: string | null } }[]; item_unit?: { id: number; name: string; name_en?: string | null } }) | undefined
                          const opts = it?.unit_options
                          const baseUnit = it?.item_unit
                          const unitList = opts && opts.length > 0
                            ? opts.map((o) => ({
                                id: o.unit_id,
                                name: o.unit ? (lang === 'ar' ? o.unit.name : (o.unit.name_en || o.unit.name)) : `#${o.unit_id}`,
                              }))
                            : (baseUnit ? [{ id: baseUnit.id, name: lang === 'ar' ? baseUnit.name : (baseUnit.name_en || baseUnit.name) }] : [])
                          if (unitList.length === 0) {
                            return <span className="text-slate-500 text-sm">—</span>
                          }
                          const value = String(row.unit_id ?? unitList[0].id)
                          return (
                            <select
                              value={value}
                              onChange={(e) => {
                                const v = e.target.value ? Number(e.target.value) : null
                                updateLine(idx, 'unit_id', v)
                                if (row.component_item_id) setLineUnitCostFromAverage(idx, row.component_item_id)
                              }}
                              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-700"
                            >
                              {unitList.map((u) => (
                                <option key={u.id} value={u.id}>{u.name}</option>
                              ))}
                            </select>
                          )
                        })() : <span className="text-slate-400 text-sm">—</span>}
                      </td>
                      <td className="px-4 py-2 align-middle">
                        <span
                          className="inline-flex w-full justify-end rounded-lg bg-amber-50 border border-amber-200/70 px-3 py-2 text-sm text-slate-800 font-medium tabular-nums"
                          title="قراءة فقط — من م . التكلفة المخزنية"
                        >
                          {row.unit_cost != null ? fmt(row.unit_cost) : '—'}
                        </span>
                      </td>
                      <td className="px-2 py-2 align-middle text-center">
                        <button
                          type="button"
                          onClick={() => removeLine(idx)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                          title={t.delete}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t-2 border-slate-200 bg-slate-50 px-4 py-3 flex items-center justify-between shrink-0">
              <span className="text-sm font-semibold text-slate-800">تكلفة الإنتاج التقديرية</span>
              <strong className="text-base text-slate-900 font-bold tabular-nums">{fmt(totalCost)}</strong>
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 transition"
          >
            {saving ? t.saving : t.save}
          </button>
          <button
            type="button"
            onClick={() => navigate('/manufacturing/bom')}
            className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
          >
            {t.cancel}
          </button>
        </div>
      </form>
    </div>
  )
}
