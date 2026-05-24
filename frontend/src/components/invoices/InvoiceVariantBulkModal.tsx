import { useState, useEffect } from 'react'
import type { ItemVariant } from '../../types'

type Props = {
  open: boolean
  onClose: () => void
  itemName: string
  variants: ItemVariant[]
  lang: string
  /** variant id -> initial qty */
  initialQuantities?: Record<number, number>
  onConfirm: (rows: { variantId: number; quantity: number }[]) => void
}

export default function InvoiceVariantBulkModal({
  open,
  onClose,
  itemName,
  variants,
  lang,
  initialQuantities,
  onConfirm,
}: Props) {
  const [qtyById, setQtyById] = useState<Record<number, string>>({})

  useEffect(() => {
    if (!open) return
    const next: Record<number, string> = {}
    for (const v of variants) {
      const q = initialQuantities?.[v.id]
      next[v.id] = q != null && q > 0 ? String(q) : ''
    }
    setQtyById(next)
  }, [open, variants, initialQuantities])

  if (!open) return null

  const isAr = lang === 'ar'

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const rows: { variantId: number; quantity: number }[] = []
    for (const v of variants) {
      const raw = (qtyById[v.id] ?? '').trim()
      if (raw === '') continue
      const n = parseFloat(raw.replace(',', '.'))
      if (!Number.isFinite(n) || n <= 0) continue
      rows.push({ variantId: v.id, quantity: n })
    }
    onConfirm(rows)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/40" role="dialog" aria-modal>
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
          <h2 className="text-base font-semibold text-slate-900">
            {isAr ? 'توزيع الكميات على المتغيرات' : 'Distribute quantities by variant'}
          </h2>
          <p className="text-sm text-slate-600 mt-1">{itemName}</p>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="p-4 overflow-y-auto space-y-2">
            {variants.length === 0 ? (
              <p className="text-sm text-slate-500">{isAr ? 'لا توجد متغيرات لهذا الصنف.' : 'No variants for this item.'}</p>
            ) : (
              variants.map((v) => {
                const label =
                  v.name ||
                  (v.options && Object.keys(v.options).length
                    ? Object.entries(v.options)
                        .map(([k, val]) => `${k}: ${val}`)
                        .join(' · ')
                    : `#${v.id}`)
                return (
                  <div key={v.id} className="flex items-center gap-3 flex-wrap">
                    <label className="flex-1 min-w-[140px] text-sm text-slate-700">{label}</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0"
                      value={qtyById[v.id] ?? ''}
                      onChange={(e) => setQtyById((p) => ({ ...p, [v.id]: e.target.value }))}
                      className="w-28 border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-right tabular-nums"
                    />
                  </div>
                )
              })
            )}
          </div>
          <div className="px-4 py-3 border-t border-slate-200 flex justify-end gap-2 bg-slate-50">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-300 hover:bg-slate-100">
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={variants.length === 0}
              className="px-4 py-2 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-500 disabled:opacity-50"
            >
              {isAr ? 'تطبيق' : 'Apply'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
