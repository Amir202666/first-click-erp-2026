import { useMemo } from 'react'
import type { PaymentMethod } from '../../types'
import PaymentMethodBrandIcon from '../PaymentMethodBrandIcon'
import { cn } from '../../lib/cn'

export type RestaurantSplitPayLine = { id: string; method: PaymentMethod; amount: number }

export interface RestaurantSplitPaymentFormProps {
  lang: 'ar' | 'en'
  isRtl: boolean
  invoiceTotal: number
  paymentMethods: PaymentMethod[]
  lines: RestaurantSplitPayLine[]
  selectedMethodId: number | null
  currentAmount: number
  fmt: (n: number) => string
  onSelectMethod: (id: number) => void
  onCurrentAmountChange: (n: number) => void
  onAddLine: () => void
  onRemoveLine: (id: string) => void
  onFillRemaining: () => void
  onFillFull: () => void
}

function newLineId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export { newLineId }

export function RestaurantSplitPaymentForm({
  lang,
  isRtl,
  invoiceTotal,
  paymentMethods,
  lines,
  selectedMethodId,
  currentAmount,
  fmt,
  onSelectMethod,
  onCurrentAmountChange,
  onAddLine,
  onRemoveLine,
  onFillRemaining,
  onFillFull,
}: RestaurantSplitPaymentFormProps) {
  const activeMethods = paymentMethods.filter((m) => m.is_active)
  const totalPaid = useMemo(() => lines.reduce((s, p) => s + p.amount, 0), [lines])
  const remaining = Math.max(0, invoiceTotal - totalPaid)
  const change = Math.max(0, totalPaid - invoiceTotal)
  const isComplete = remaining <= 0.001
  const progressPct = invoiceTotal > 0.001 ? Math.min(100, (totalPaid / invoiceTotal) * 100) : 0

  const ar = lang === 'ar'

  return (
    <div className="space-y-4" dir={isRtl ? 'rtl' : 'ltr'}>
      <div>
        <div className="flex justify-between text-xs font-medium text-slate-600 mb-1">
          <span>{ar ? 'تقدم السداد' : 'Payment progress'}</span>
          <span className="tabular-nums" dir="ltr">
            {fmt(totalPaid)} / {fmt(invoiceTotal)}
          </span>
        </div>
        <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="grid grid-cols-3 gap-2 mt-2 text-center text-[11px]">
          <div>
            <div className="font-semibold text-emerald-700 tabular-nums" dir="ltr">{fmt(totalPaid)}</div>
            <div className="text-slate-500">{ar ? 'مدفوع' : 'Paid'}</div>
          </div>
          <div>
            <div className={cn('font-semibold tabular-nums', remaining > 0.001 ? 'text-amber-600' : 'text-emerald-600')} dir="ltr">
              {fmt(remaining)}
            </div>
            <div className="text-slate-500">{ar ? 'متبقي' : 'Due'}</div>
          </div>
          <div>
            <div className="font-semibold text-slate-800 tabular-nums" dir="ltr">{fmt(change)}</div>
            <div className="text-slate-500">{ar ? 'الباقي للعميل' : 'Change'}</div>
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">{ar ? 'اختر طريقة الدفع' : 'Payment method'}</label>
        <div className="grid grid-cols-3 gap-2">
          {activeMethods.slice(0, 9).map((m) => {
            const selected = selectedMethodId === m.id
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onSelectMethod(m.id)}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 py-2.5 px-2 rounded-xl border-2 text-xs font-semibold transition-all min-h-[4.5rem]',
                  selected ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300',
                )}
              >
                <PaymentMethodBrandIcon method={m} size={32} className="min-h-[32px]" />
                <span className="truncate w-full text-center leading-tight">{ar ? m.name : (m.name_en || m.name)}</span>
              </button>
            )
          })}
        </div>
        {activeMethods.length === 0 && (
          <p className="text-sm text-amber-600">{ar ? 'أضف طرق الدفع من الإعدادات' : 'Add payment methods in settings'}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">{ar ? 'المبلغ لهذه الدفعة' : 'Amount for this line'}</label>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={0.001}
            value={currentAmount > 0 ? currentAmount : ''}
            onChange={(e) => onCurrentAmountChange(parseFloat(e.target.value) || 0)}
            className="flex-1 min-w-[120px] border-2 border-slate-300 rounded-xl px-3 py-2.5 text-lg font-semibold text-right tabular-nums focus:ring-2 focus:ring-inset focus:ring-primary-500 focus:border-primary-500"
            dir="ltr"
            placeholder="0"
          />
          <button
            type="button"
            onClick={onFillRemaining}
            className="text-[11px] px-2 py-2 border border-slate-200 rounded-lg bg-slate-50 hover:bg-emerald-50 hover:border-emerald-300"
          >
            {ar ? `المتبقي ${fmt(remaining)}` : `Due ${fmt(remaining)}`}
          </button>
          <button
            type="button"
            onClick={onFillFull}
            className="text-[11px] px-2 py-2 border border-slate-200 rounded-lg bg-slate-50 hover:bg-emerald-50 hover:border-emerald-300"
          >
            {ar ? `كامل ${fmt(invoiceTotal)}` : `Full ${fmt(invoiceTotal)}`}
          </button>
        </div>
        <button
          type="button"
          onClick={onAddLine}
          disabled={!selectedMethodId || currentAmount <= 0}
          className="mt-2 w-full py-2 rounded-xl border-2 border-dashed border-emerald-400 text-emerald-800 font-semibold text-sm hover:bg-emerald-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {ar ? '+ إضافة دفعة' : '+ Add payment'}
        </button>
      </div>

      {lines.length > 0 && (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-2 bg-slate-50 text-xs font-semibold text-slate-600">
            <span>{ar ? 'طريقة الدفع' : 'Method'}</span>
            <span className="text-end" dir="ltr">{ar ? 'المبلغ' : 'Amount'}</span>
            <span className="w-8" />
          </div>
          {lines.map((p) => (
            <div key={p.id} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center px-3 py-2 border-t border-slate-100 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <PaymentMethodBrandIcon method={p.method} size={28} />
                <span className="truncate font-medium">{ar ? p.method.name : (p.method.name_en || p.method.name)}</span>
              </div>
              <span className="font-semibold tabular-nums text-end" dir="ltr">{fmt(p.amount)}</span>
              <button
                type="button"
                onClick={() => onRemoveLine(p.id)}
                className="w-8 h-8 rounded-lg bg-red-50 text-red-600 text-sm font-bold border border-red-100 hover:bg-red-100"
                aria-label={ar ? 'حذف' : 'Remove'}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        className={cn(
          'rounded-xl px-4 py-3 border',
          isComplete ? (change > 0.001 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200') : 'bg-slate-50 border-slate-200',
        )}
      >
        <div className="text-sm font-medium text-slate-800">
          {isComplete
            ? (change > 0.001
                ? (ar ? 'الباقي للعميل (مبالغ زائدة)' : 'Change due to customer')
                : (ar ? 'تم السداد الكامل ✓' : 'Fully paid ✓'))
            : (ar ? 'المتبقي للسداد' : 'Amount still due')}
        </div>
        {!isComplete && (
          <p className="text-xs text-slate-500 mt-1">{ar ? 'أضف دفعة أو أكثر لإكمال إجمالي الفاتورة.' : 'Add one or more lines to cover the invoice total.'}</p>
        )}
        <div className="text-xl font-bold tabular-nums mt-1" dir="ltr">
          {isComplete ? fmt(change) : fmt(remaining)}
        </div>
      </div>
    </div>
  )
}
